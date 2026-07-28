import type { MainToWorkerMessage, WorkerToMainMessage } from '../shared/protocol';
import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotF64,
  SnapshotI32,
  SnapshotVehicle,
  SnapshotWriter,
} from '../shared/snapshot';
import { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  MAX_TICK,
  MAX_TICKS_PER_FRAME,
  SPEED_FACTORS,
  STATE_HASH_INTERVAL_TICKS,
  TICK_MS,
  TILE_SIZE_M,
} from './constants';
import type { Cargo } from './cargo/types';
import { loanLimitCt } from './economy/company';
import { stationRating } from './station/types';
import { capacityFor, vehicleSpec } from './vehicles/catalog';
import { hashWorldLive, World } from './World';

/**
 * Worker entry point and tick scheduler.
 *
 * This is the ONLY file below src/sim that is allowed to read wall-clock time
 * or touch worker globals; the ESLint config exempts it explicitly. It holds no
 * simulation state of its own - it decides *when* World.step() runs, never what
 * it does. Speed changes therefore cannot influence the outcome.
 */

interface WorkerScope {
  postMessage(message: WorkerToMainMessage): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<MainToWorkerMessage>) => void,
  ): void;
}

const scope = globalThis as unknown as WorkerScope;

/** Longest wall-clock gap the accumulator accepts before it is treated as a stall. [ms] */
const MAX_FRAME_GAP_MS = 250;

/** Window over which the effective tick rate is averaged for the status bar. [ms] */
const RATE_WINDOW_MS = 500;

let world: World | null = null;
let queue = new CommandQueue();
let writer: SnapshotWriter | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

let speedIndex = 0;
let accumulatorMs = 0;
let lastFrameMs = 0;

let ticksInWindow = 0;
let windowStartMs = 0;
let simRateCentiHz = 0;

let stateHashHi = 0;
let stateHashLo = 0;
let lastHashedTick = -1;

let publishedName = '';
let publishedColorIndex = -1;
let publishedStructure = '';

/** How often the fleet list is refreshed while nothing structural changed. */
const FLEET_REFRESH_TICKS = 200;

/** Reused across ticks so command feedback does not allocate per call. */
const outcomeSink = (_envelope: CommandEnvelope, outcome: CommandOutcome): void => {
  if (!outcome.ok) {
    scope.postMessage({ type: 'commandRejected', reasonKey: outcome.reasonKey });
  }
};

function refreshStateHash(current: World): void {
  // The live digest deliberately skips the tile layers - see hashWorldLive.
  const digest = hashWorldLive(current);
  stateHashHi = Number.parseInt(digest.slice(0, 8), 16) | 0;
  stateHashLo = Number.parseInt(digest.slice(8, 16), 16) | 0;
  lastHashedTick = current.tick;
}

/**
 * Structural changes - a station built, a bus bought - travel by message
 * rather than through the snapshot: they are rare, they carry strings and
 * variable length lists, and packing those into a shared buffer would make the
 * layout churn for no gain. A cheap signature decides when to send.
 */
function structureSignature(current: World): string {
  let modules = 0;
  for (const station of current.stations) modules += station.modules.length;
  return `${current.stations.length}:${modules}:${current.vehicles.livingCount}`;
}

function postStructure(current: World): void {
  scope.postMessage({
    type: 'stationsChanged',
    stations: current.stations.map((station) => ({
      id: station.id,
      name: station.name,
      x: station.x,
      y: station.y,
      rating: stationRating(station, current.tick),
      waiting: Math.round(station.waiting.reduce((sum, stack) => sum + stack.amount, 0)),
      modules: station.modules.map((module) => ({ kind: module.kind, x: module.x, y: module.y })),
    })),
  });
  postFleet(current);
}

function postFleet(current: World): void {
  const vehicles = current.vehicles;
  const markers = [];

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const spec = vehicleSpec(vehicles.specId[id]!);
    const cargo = vehicles.refitCargo[id]! as Cargo;
    let units = 0;
    for (const stack of vehicles.cargo[id]!) units += stack.amount;

    markers.push({
      id,
      specId: vehicles.specId[id]!,
      state: vehicles.state[id]!,
      cargoUnits: Math.round(units),
      capacity: capacityFor(spec, cargo),
      earnedCt: vehicles.earnedCt[id]!,
      orderStationIds: vehicles.orders[id]!.map((order) => order.targetId),
    });
  }
  scope.postMessage({ type: 'fleetChanged', vehicles: markers });
}

/**
 * Copy the drawable state of every vehicle into the snapshot block.
 *
 * Only what changes per tick travels: which tile, which tile next, how far
 * between them, and what the vehicle is doing. Everything static about it - its
 * type, its name, its orders - the renderer already knows or does not need.
 */
function writeVehicles(current: World, block: Int32Array): number {
  const vehicles = current.vehicles;
  let written = 0;

  for (let id = 0; id < vehicles.count && written < SNAPSHOT_MAX_VEHICLES; id++) {
    if (vehicles.alive[id] !== 1) continue;

    const tile = vehicles.tileIndex[id]!;
    const index = vehicles.pathIndex[id]!;
    const hasNext = index + 1 < vehicles.pathLength[id]!;
    const next = hasNext ? vehicles.paths[id]![index + 1]! : tile;

    const base = written * SNAPSHOT_VEHICLE_STRIDE;
    block[base + SnapshotVehicle.Tile] = tile;
    block[base + SnapshotVehicle.NextTile] = next;
    block[base + SnapshotVehicle.ProgressMilli] = Math.round(
      (vehicles.progressM[id]! / TILE_SIZE_M) * 1000,
    );
    block[base + SnapshotVehicle.State] = vehicles.state[id]!;
    written++;
  }
  return written;
}

function publishSnapshot(current: World, sink: SnapshotWriter): void {
  if (current.tick - lastHashedTick >= STATE_HASH_INTERVAL_TICKS || lastHashedTick < 0) {
    refreshStateHash(current);
  }

  const date = current.date;
  const i32 = sink.draftI32;
  i32[SnapshotI32.Tick] = current.tick;
  i32[SnapshotI32.Year] = date.year;
  i32[SnapshotI32.Month] = date.month;
  i32[SnapshotI32.Day] = date.day;
  i32[SnapshotI32.CompanyColorIndex] = current.company.colorIndex;
  i32[SnapshotI32.SpeedIndex] = speedIndex;
  i32[SnapshotI32.CommandsExecuted] = queue.executedCount;
  i32[SnapshotI32.SimRateCentiHz] = simRateCentiHz;
  i32[SnapshotI32.StateHashHi] = stateHashHi;
  i32[SnapshotI32.StateHashLo] = stateHashLo;
  i32[SnapshotI32.MapRevision] = current.map.revision;

  const f64 = sink.draftF64;
  f64[SnapshotF64.CashCt] = current.company.cashCt;
  f64[SnapshotF64.LoanCt] = current.company.loanCt;
  f64[SnapshotF64.LoanLimitCt] = loanLimitCt(current.company);

  i32[SnapshotI32.VehicleCount] = writeVehicles(current, sink.draftVehicles);

  sink.publish();

  const signature = structureSignature(current);
  if (signature !== publishedStructure) {
    publishedStructure = signature;
    postStructure(current);
  } else if (current.tick % FLEET_REFRESH_TICKS === 0) {
    // The list also shows state and earnings, which change without the fleet
    // changing size; a refresh once per game day keeps it honest without
    // sending a message per tick.
    postFleet(current);
  }

  if (
    current.company.name !== publishedName ||
    current.company.colorIndex !== publishedColorIndex
  ) {
    publishedName = current.company.name;
    publishedColorIndex = current.company.colorIndex;
    scope.postMessage({
      type: 'companyChanged',
      name: publishedName,
      colorIndex: publishedColorIndex,
    });
  }
}

function updateRate(nowMs: number, ticks: number): void {
  ticksInWindow += ticks;
  const elapsed = nowMs - windowStartMs;
  if (elapsed >= RATE_WINDOW_MS) {
    simRateCentiHz = Math.round((ticksInWindow * 100_000) / elapsed);
    ticksInWindow = 0;
    windowStartMs = nowMs;
  }
}

function runFrame(): void {
  const current = world;
  const sink = writer;
  if (current === null || sink === null) return;

  const now = performance.now();
  let elapsed = now - lastFrameMs;
  lastFrameMs = now;
  if (elapsed > MAX_FRAME_GAP_MS) elapsed = MAX_FRAME_GAP_MS;

  const factor = SPEED_FACTORS[speedIndex] ?? 0;
  if (factor === 0) {
    // Paused: time stands still, but queued player actions still take effect.
    accumulatorMs = 0;
    current.drainCommands(queue, outcomeSink);
    updateRate(now, 0);
    publishSnapshot(current, sink);
    return;
  }

  accumulatorMs += elapsed * factor;
  let ticks = 0;
  while (accumulatorMs >= TICK_MS && ticks < MAX_TICKS_PER_FRAME && current.tick < MAX_TICK) {
    current.step(queue, outcomeSink);
    accumulatorMs -= TICK_MS;
    ticks++;
  }
  // Drop whatever backlog is left instead of chasing it forever; the sim runs
  // slower than requested rather than freezing the worker.
  if (ticks >= MAX_TICKS_PER_FRAME) accumulatorMs = 0;
  if (current.tick >= MAX_TICK) {
    speedIndex = 0;
    accumulatorMs = 0;
  }

  updateRate(now, ticks);
  publishSnapshot(current, sink);
}

function startGame(message: Extract<MainToWorkerMessage, { type: 'init' }>): void {
  // Map generation takes seconds on a 1024 map, so the phases are reported to
  // the UI while they run.
  world = World.create(
    {
      seed: message.seed,
      difficulty: message.difficulty,
      climate: message.climate,
      mapSize: message.mapSize,
      companyName: message.companyName,
      companyColorIndex: message.companyColorIndex,
    },
    (phase, seedAttempt) => {
      scope.postMessage({ type: 'generating', phase, seedAttempt });
    },
  );
  queue = new CommandQueue();
  writer = new SnapshotWriter(message.buffer);

  speedIndex = 0;
  accumulatorMs = 0;
  lastFrameMs = performance.now();
  windowStartMs = lastFrameMs;
  ticksInWindow = 0;
  simRateCentiHz = 0;
  lastHashedTick = -1;
  publishedName = '';
  publishedColorIndex = -1;
  publishedStructure = '';

  publishSnapshot(world, writer);

  if (timer !== null) clearInterval(timer);
  timer = setInterval(runFrame, TICK_MS);

  scope.postMessage({
    type: 'ready',
    companyName: world.company.name,
    companyColorIndex: world.company.colorIndex,
    mapSize: world.map.size,
    mapBuffer: world.map.buffer,
    townCount: world.towns.length,
    industryCount: world.industries.length,
    towns: world.towns.map((town) => ({
      id: town.id,
      name: town.name,
      x: town.x,
      y: town.y,
      sizeClass: town.sizeClass,
    })),
    industries: world.industries.map((industry) => ({
      id: industry.id,
      type: industry.type,
      x: industry.x,
      y: industry.y,
    })),
  });
}

function handleMessage(message: MainToWorkerMessage): void {
  switch (message.type) {
    case 'init':
      startGame(message);
      return;

    case 'setSpeed':
      if (message.speedIndex >= 0 && message.speedIndex < SPEED_FACTORS.length) {
        speedIndex = message.speedIndex;
        // A speed change must not hand the sim a backlog it did not earn.
        accumulatorMs = 0;
        lastFrameMs = performance.now();
      }
      return;

    case 'command': {
      const current = world;
      if (current === null) return;
      queue.enqueue(message.command, current.tick);
      return;
    }

    case 'shutdown':
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      world = null;
      writer = null;
      return;
  }
}

scope.addEventListener('message', (event) => {
  try {
    handleMessage(event.data);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
