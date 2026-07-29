import type {
  IndustryMarker,
  MainToWorkerMessage,
  TownMarker,
  WorkerToMainMessage,
} from '../shared/protocol';
import {
  SNAPSHOT_MAX_RESERVED_TILES,
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_RESERVED_STRIDE,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotReserved,
  SnapshotF64,
  SnapshotI32,
  SnapshotVehicle,
  SnapshotWriter,
} from '../shared/snapshot';
import { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  BANKRUPTCY_MONTHS,
  MAX_TICK,
  MAX_TICKS_PER_FRAME,
  SPEED_FACTORS,
  STATE_HASH_INTERVAL_TICKS,
  TICK_MS,
  TICKS_PER_MONTH,
  TILE_DIAGONAL_M,
  TILE_SIZE_M,
} from './constants';
import { loanLimitCt } from './economy/company';
import { bookValueCt, companyValueCt, monthsInOrder } from './economy/ledger';
import { stationRating } from './station/types';
import { calendarFromTick, hashWorldLive, World } from './World';

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
let publishedMonthTick = -1;
let publishedNewsRevision = -1;

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
  let levels = 0;
  let closed = 0;
  for (const industry of current.industries) {
    levels += industry.productionLevel;
    if (!industry.open) closed++;
  }
  return (
    `${current.stations.length}:${modules}:${current.vehicles.livingCount}:` +
    `${current.industries.length}:${levels}:${closed}`
  );
}

/** Live production state of every industry, for the tile panel. */
function industryMarkers(current: World): IndustryMarker[] {
  return current.industries.map((industry) => ({
    id: industry.id,
    type: industry.type,
    x: industry.x,
    y: industry.y,
    level: industry.open ? industry.productionLevel : 0,
    stock: Math.round(industry.outputStock0 + industry.outputStock1),
    service: Math.round(industry.serviceAverage * 100),
    neglectedMonths: industry.monthsWithoutCollection,
    open: industry.open,
  }));
}

/** Town markers, which carry a population that changes every month. */
function townMarkers(current: World): TownMarker[] {
  return current.towns.map((town) => ({
    id: town.id,
    name: town.name,
    x: town.x,
    y: town.y,
    sizeClass: town.sizeClass,
    population: town.population,
  }));
}

/**
 * The books and the town populations, sent when the game month rolls over.
 *
 * Both change exactly once a month, so one cadence serves both and neither has
 * to ride in the snapshot.
 */
function postMonthly(current: World): void {
  const company = current.company;
  scope.postMessage({
    type: 'financesChanged',
    report: {
      month: [...company.accounts],
      year: [...company.yearAccounts],
      lastYear: [...company.lastYearAccounts],
      history: monthsInOrder(company),
      valueHistory: [...company.valueHistory],
      companyValueCt: companyValueCt(company),
      bookValueCt: bookValueCt(company),
      loanCt: company.loanCt,
      cashCt: company.cashCt,
      autoRenew: company.autoRenew,
    },
  });
  scope.postMessage({ type: 'townsChanged', towns: townMarkers(current) });
}

/**
 * The news log (section 15).
 *
 * Sent whole rather than incrementally: it is capped at a couple of hundred
 * entries, it moves a handful of times a game month, and a diff would need the
 * two sides to agree on which entries fell off the front of the ring.
 */
function postNews(current: World): void {
  scope.postMessage({
    type: 'newsChanged',
    news: current.news.all.map((entry) => {
      const date = calendarFromTick(entry.tick);
      return {
        tick: entry.tick,
        year: date.year,
        month: date.month,
        day: date.day,
        category: entry.category,
        severity: entry.severity,
        messageKey: entry.messageKey,
        params: { ...entry.params },
        tileIndex: entry.tileIndex,
      };
    }),
  });
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
  scope.postMessage({ type: 'industriesChanged', industries: industryMarkers(current) });
  postFleet(current);
}

function postFleet(current: World): void {
  const vehicles = current.vehicles;
  const markers = [];

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    let units = 0;
    for (const stack of vehicles.cargo[id]!) units += stack.amount;

    markers.push({
      id,
      specId: vehicles.specId[id]!,
      kind: vehicles.kind[id]!,
      state: vehicles.state[id]!,
      cargoUnits: Math.round(units),
      capacity: vehicles.capacityUnits[id]!,
      earnedCt: vehicles.earnedCt[id]!,
      orderStationIds: vehicles.orders[id]!.map((order) => order.targetId),
      consist: [...vehicles.consist[id]!],
      maxSpeedMs: vehicles.maxSpeedMs[id]!,
      lengthM: vehicles.lengthM[id]!,
      tileIndex: vehicles.tileIndex[id]!,
      waitingTicks:
        vehicles.waitingSinceTick[id]! < 0 ? 0 : current.tick - vehicles.waitingSinceTick[id]!,
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

    // Progress is a fraction of THIS step, which on a diagonal piece of track
    // is 70.7 m rather than 50 m - dividing by the tile size would make every
    // train jump forward as it entered a diagonal.
    const size = current.map.size;
    const diagonal =
      hasNext && next % size !== tile % size && ((next / size) | 0) !== ((tile / size) | 0);
    const stepM = diagonal ? TILE_DIAGONAL_M : TILE_SIZE_M;

    const base = written * SNAPSHOT_VEHICLE_STRIDE;
    block[base + SnapshotVehicle.Tile] = tile;
    block[base + SnapshotVehicle.NextTile] = next;
    block[base + SnapshotVehicle.ProgressMilli] = Math.round(
      (vehicles.progressM[id]! / stepM) * 1000,
    );
    block[base + SnapshotVehicle.State] = vehicles.state[id]!;
    block[base + SnapshotVehicle.Kind] = vehicles.kind[id]!;
    written++;
  }
  return written;
}

/**
 * Which tiles the trains hold, for the F3 overlay of section 9.3.
 *
 * The reservation table itself is derived state keyed by tile, so it is not
 * walked here - the per-train range is, which is both cheaper and exactly what
 * the overlay wants to colour.
 */
function writeReserved(current: World, block: Int32Array): number {
  const vehicles = current.vehicles;
  let written = 0;

  for (let id = 0; id < vehicles.count && written < SNAPSHOT_MAX_RESERVED_TILES; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const to = vehicles.reservedToIndex[id]!;
    if (to < 0) continue;

    const path = vehicles.paths[id]!;
    for (let index = vehicles.reservedFromIndex[id]!; index <= to; index++) {
      if (written >= SNAPSHOT_MAX_RESERVED_TILES) break;
      const base = written * SNAPSHOT_RESERVED_STRIDE;
      block[base + SnapshotReserved.Tile] = path[index]!;
      block[base + SnapshotReserved.VehicleId] = id;
      written++;
    }
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
  i32[SnapshotI32.ReservedCount] = writeReserved(current, sink.draftReserved);
  i32[SnapshotI32.MonthsInDebt] = current.company.bankrupt
    ? BANKRUPTCY_MONTHS
    : current.company.monthsInDebt;

  sink.publish();

  // The books and the town populations move once a game month and nowhere else.
  if (current.tick % TICKS_PER_MONTH === 0 && current.tick !== publishedMonthTick) {
    publishedMonthTick = current.tick;
    postMonthly(current);
  }

  if (current.news.revision !== publishedNewsRevision) {
    publishedNewsRevision = current.news.revision;
    postNews(current);
  }

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
  publishedNewsRevision = -1;

  publishSnapshot(world, writer);
  postMonthly(world);

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
    towns: townMarkers(world),
    industries: industryMarkers(world),
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
