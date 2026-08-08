import type {
  CompanyMarker,
  ContractMarker,
  MainToWorkerMessage,
  TownMarker,
  WorkerToMainMessage,
} from '../shared/protocol';
import {
  SNAPSHOT_MAX_RESERVED_TILES,
  SNAPSHOT_RESERVED_STRIDE,
  SnapshotReserved,
  SnapshotF64,
  SnapshotI32,
  SnapshotWriter,
} from '../shared/snapshot';
import { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import { writeFlowLegs } from './flow';
import {
  BANKRUPTCY_MONTHS,
  MAX_TICK,
  MAX_TICKS_PER_FRAME,
  SPEED_FACTORS,
  STATE_HASH_INTERVAL_TICKS,
  TICK_MS,
  TICKS_PER_MONTH,
} from './constants';
import { loanLimitCt } from './economy/company';
import { companyNetworkValue, networkValueOf } from './economy/networkValue';
import { scheduleOf } from './lines/LineStore';
import { industryMarkers, stationMarkers, vehicleCargoRows } from './markers';
import {
  vehicleAgeYears,
  vehicleLifetimeYears,
  vehicleUpkeepCtPerYear,
} from './vehicles/lifecycle';
import {
  adviseFleet,
  lineProfitPerYearCt,
  lineRoundTicks,
  lineStations,
  lineUtilisation,
  lineVehicles,
  stationWaitingUnits,
} from './lines/metrics';
import type { NewGameOptions, SaveSlotKind } from '../shared/protocol';
import { bookValueCt, companyValueCt, monthsInOrder } from './economy/ledger';
import { contractProgress, isOpen } from './economy/contracts';
import { refusedTile } from './vehicles/reservations';
import { writeVehicleBlock } from './vehicles/snapshot';
import { VehicleKind } from './vehicles/spec';
import { SaveCorruptionError, SaveFormatError } from './save/format';
import { CheckpointRing } from './save/checkpoints';
import {
  encodeReplay,
  replayFromSaveBytes,
  ReplayVersionError,
  type ConvertedReplay,
} from './save/replay';
import {
  replayMeta,
  ReplaySession,
  REPLAY_COMMAND_REFUSAL,
  REPLAY_NOT_A_RECORDING,
} from './save/replaySession';
import { decodeSave, encodeSave } from './save/serialize';
import { councilRating, exclusiveRightsCostCt, TOWN_MEASURE_COUNT } from './town/council';
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
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void;
}

const scope = globalThis as unknown as WorkerScope;

/** Longest wall-clock gap the accumulator accepts before it is treated as a stall. [ms] */
const MAX_FRAME_GAP_MS = 250;

/** Window over which the effective tick rate is averaged for the status bar. [ms] */
const RATE_WINDOW_MS = 500;

let world: World | null = null;
let queue = new CommandQueue();
/**
 * The replay checkpoint ring of SPEC2 M16. It lives here beside the command
 * log because it is the same kind of thing - the recording of a game rather
 * than its state - and because encoding a world is a save-path job the
 * simulation core must never do inside `tick()` (law #7).
 */
let checkpoints = new CheckpointRing();
let writer: SnapshotWriter | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * The recording being played back, or null while an ordinary game is running
 * (SPEC2 M16). While it is set the scheduler drives the SESSION's world from
 * the SESSION's sealed queue, records no checkpoints of its own - the ring
 * belongs to the recording - and refuses every command that arrives.
 */
let replay: ReplaySession | null = null;

/**
 * The live game, encoded and put aside while a replay is watched.
 *
 * A replay REPLACES the world (the same swap a load does), so the way back is
 * the same one: bytes the worker made before it left. Keeping the world object
 * instead would mean two worlds alive at once, one of them a whole map's worth
 * of layers that nothing is stepping.
 */
let suspended: Uint8Array | null = null;

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
const outcomeSink = (envelope: CommandEnvelope, outcome: CommandOutcome): void => {
  if (!outcome.ok) {
    scope.postMessage({ type: 'commandRejected', reasonKey: outcome.reasonKey });
  }
  // The player's own commands are reported either way. The tutorial of section
  // 17.5 watches them to know when a lesson's goal is met, and the audio of
  // section 18 turns them into a click. A competitor's are not: five AI
  // companies build constantly and nobody is being taught by that.
  if (envelope.companyId !== 0) return;
  scope.postMessage({
    type: 'commandExecuted',
    kind: envelope.command.kind,
    accepted: outcome.ok,
  });
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
    `${current.industries.length}:${levels}:${closed}:${current.vehicles.ordersRevision}:` +
    `${current.lines.livingCount}`
  );
}

/** Town markers, which carry a population that changes every month. */
function townMarkers(current: World): TownMarker[] {
  const player = current.playerCompanyId;

  return current.towns.map((town) => {
    const held = town.exclusiveCompanyId >= 0 && current.tick < town.exclusiveUntilTick;
    const ready: boolean[] = [];
    for (let measure = 0; measure < TOWN_MEASURE_COUNT; measure++) {
      const slot = player * TOWN_MEASURE_COUNT + measure;
      ready.push(current.tick >= (town.measureReadyTick[slot] ?? 0));
    }
    return {
      id: town.id,
      name: town.name,
      x: town.x,
      y: town.y,
      sizeClass: town.sizeClass,
      population: town.population,
      councilRating: councilRating(town, player),
      exclusiveCompanyId: held ? town.exclusiveCompanyId : -1,
      exclusiveMonthsLeft: held
        ? Math.ceil((town.exclusiveUntilTick - current.tick) / TICKS_PER_MONTH)
        : 0,
      exclusiveCostCt: exclusiveRightsCostCt(current, town),
      measureReady: ready,
    };
  });
}

/** The tenders a player can still do something about. */
function contractMarkers(current: World): ContractMarker[] {
  const player = current.playerCompanyId;
  const markers: ContractMarker[] = [];

  for (const contract of current.contracts) {
    if (!isOpen(current, contract)) continue;
    const town = current.towns[contract.townId];
    markers.push({
      id: contract.id,
      cargo: contract.cargo,
      townId: contract.townId,
      townName: town?.name ?? '',
      amountUnits: contract.amountUnits,
      monthsLeft: Math.ceil((contract.deadlineTick - current.tick) / TICKS_PER_MONTH),
      bonusCt: contract.bonusCt,
      progress: contractProgress(contract, player),
      accepted: contract.acceptedBy.includes(player),
      rivals: contract.acceptedBy.filter((id) => id !== player).length,
    });
  }
  return markers;
}

/** Every company, for the council panel and the competitor list. */
function companyMarkers(current: World): CompanyMarker[] {
  return current.companies.map((company) => ({
    id: company.id,
    name: company.name,
    colorIndex: company.colorIndex,
    valueCt: companyValueCt(company),
    bankrupt: company.bankrupt,
  }));
}

/**
 * The books and the town populations, sent when the game month rolls over.
 *
 * Both change exactly once a month, so one cadence serves both and neither has
 * to ride in the snapshot.
 */
function postMonthly(current: World): void {
  const company = current.playerCompany;
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
      co2ThisYearKg: company.co2ThisYearKg,
      co2LastYearKg: company.co2LastYearKg,
      // The 4x promise of SPEC.md section 1 as a number, for the whole
      // company (SPEC2 M15). Everything the company owns counts, parked
      // vehicles included - a fleet that earns nothing while its ceiling
      // runs on is exactly what the figure exists to show.
      networkValue: companyNetworkValue(current, company.id),
    },
  });
  scope.postMessage({ type: 'townsChanged', towns: townMarkers(current) });
  scope.postMessage({ type: 'companiesChanged', companies: companyMarkers(current) });
  scope.postMessage({ type: 'contractsChanged', contracts: contractMarkers(current) });
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

/**
 * The stations with their M14 x-ray (rating terms, per-cargo waiting, the
 * twelve-month ring). Assembled in sim/markers.ts so a unit test can hold
 * the rows against the state (the D-174 pattern).
 */
function postStations(current: World): void {
  scope.postMessage({ type: 'stationsChanged', stations: stationMarkers(current) });
}

function postStructure(current: World): void {
  postStations(current);
  scope.postMessage({ type: 'industriesChanged', industries: industryMarkers(current.industries) });
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
      lineId: vehicles.lineId[id]!,
      // The whole grammar of the list the vehicle RUNS - its line's when it
      // is assigned to one - so the panel shows what actually happens.
      orders: scheduleOf(current, id).map((order) => ({ ...order })),
      orderIndex: vehicles.orderIndex[id]!,
      // The M14 detail view: age against design life, the reliability the
      // breakdown roll reads, the lifetime tally, the upkeep as the books
      // charge it (obsolescence and price level included), the outstanding
      // depot call, and the manifest with its paid-up-to distances - all
      // computed by the simulation's own functions, never re-derived UI-side.
      ageYears: vehicleAgeYears(current, id),
      lifetimeYears: vehicleLifetimeYears(current, id),
      reliability: vehicles.reliability[id]!,
      breakdownCount: vehicles.breakdownCount[id]!,
      upkeepPerYearCt: current.costCt(vehicleUpkeepCtPerYear(current, id)),
      depotCall: vehicles.depotCall[id] === 1,
      manifest: vehicleCargoRows(current, id),
      consist: [...vehicles.consist[id]!],
      maxSpeedMs: vehicles.maxSpeedMs[id]!,
      lengthM: vehicles.lengthM[id]!,
      tileIndex: vehicles.tileIndex[id]!,
      waitingTicks:
        vehicles.waitingSinceTick[id]! < 0 ? 0 : current.tick - vehicles.waitingSinceTick[id]!,
      // The contested tile of the M15 waiting graph, asked only of a train
      // the 9.3 clock is already running on - `refusedTile` walks a section
      // and possibly a block, which is not something to do per vehicle per
      // refresh for a fleet that is running normally.
      blockedTile:
        vehicles.kind[id] === VehicleKind.Train && vehicles.waitingSinceTick[id]! >= 0
          ? refusedTile(current, id)
          : -1,
      taktDelayTicks: vehicles.taktDelayTicks[id]!,
    });
  }
  scope.postMessage({ type: 'fleetChanged', vehicles: markers });
  postLines(current);
}

/**
 * The PLAYER's lines with their recomputed statistics (section 12.2). Rides
 * the fleet cadence: everything a line shows - utilisation, earnings, round
 * time - moves exactly when the fleet does.
 */
function postLines(current: World): void {
  const markers = [];
  for (let lineId = 0; lineId < current.lines.count; lineId++) {
    if (current.lines.alive[lineId] !== 1) continue;
    if (current.lines.ownerId[lineId] !== current.playerCompanyId) continue;

    const vehicleIds = lineVehicles(current, lineId);
    const round = lineRoundTicks(current, lineId);
    // THE advisor formula, computed sim-side (lines/metrics.ts) - the panel
    // only displays it, and stage C2's AI calls the same function.
    const advice = adviseFleet(round.ticks, current.lines.taktTicks[lineId]!);
    markers.push({
      id: lineId,
      stops: lineStations(current, lineId).map((stationId) => ({
        stationId,
        waitingUnits: Math.round(stationWaitingUnits(current, stationId)),
      })),
      orders: current.lines.orders[lineId]!.map((order) => ({ ...order })),
      vehicleIds,
      utilisation: lineUtilisation(current, vehicleIds),
      profitPerYearCt: lineProfitPerYearCt(current, vehicleIds),
      roundTicks: round.ticks,
      roundMeasured: round.measured,
      autoRenew: current.lines.autoRenew[lineId] === 1,
      taktTicks: current.lines.taktTicks[lineId]!,
      taktOffsetTicks: current.lines.taktOffsetTicks[lineId]!,
      advisedVehicles: advice === null ? 0 : advice.vehiclesNeeded,
      headroomTicks: advice === null ? 0 : advice.headroomTicks,
      networkValue: networkValueOf(current, vehicleIds),
    });
  }
  scope.postMessage({ type: 'linesChanged', lines: markers });
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
  i32[SnapshotI32.CompanyColorIndex] = current.playerCompany.colorIndex;
  i32[SnapshotI32.SpeedIndex] = speedIndex;
  i32[SnapshotI32.CommandsExecuted] = queue.executedCount;
  i32[SnapshotI32.SimRateCentiHz] = simRateCentiHz;
  i32[SnapshotI32.StateHashHi] = stateHashHi;
  i32[SnapshotI32.StateHashLo] = stateHashLo;
  i32[SnapshotI32.MapRevision] = current.map.revision;

  const f64 = sink.draftF64;
  f64[SnapshotF64.CashCt] = current.playerCompany.cashCt;
  f64[SnapshotF64.LoanCt] = current.playerCompany.loanCt;
  f64[SnapshotF64.LoanLimitCt] = loanLimitCt(current.playerCompany);

  i32[SnapshotI32.VehicleCount] = writeVehicleBlock(
    current.vehicles,
    current.map.size,
    sink.draftVehicles,
  );
  i32[SnapshotI32.ReservedCount] = writeReserved(current, sink.draftReserved);
  // The flow atlas rides THIS publish pass like every other block - a second
  // pass over stations or links is the exact mistake Fehler 33 names (M14).
  i32[SnapshotI32.FlowCount] = writeFlowLegs(current, sink.draftFlow);
  i32[SnapshotI32.MonthsInDebt] = current.playerCompany.bankrupt
    ? BANKRUPTCY_MONTHS
    : current.playerCompany.monthsInDebt;

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
    // sending a message per tick. The stations ride the same cadence since
    // M14: the x-ray's wait term, waiting table and visit counts all move
    // without anything the structure signature can see moving.
    postStations(current);
    postFleet(current);
  }

  if (
    current.playerCompany.name !== publishedName ||
    current.playerCompany.colorIndex !== publishedColorIndex
  ) {
    publishedName = current.playerCompany.name;
    publishedColorIndex = current.playerCompany.colorIndex;
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
  // A playback stops where the recording stops. Running past it would be
  // inventing a future for a game that is over, at the exact moment the log
  // ran out - so the clock stops there and the speed buttons keep working.
  const limit = replay === null ? MAX_TICK : Math.min(MAX_TICK, replay.finalTick);
  let ticks = 0;
  while (accumulatorMs >= TICK_MS && ticks < MAX_TICKS_PER_FRAME && current.tick < limit) {
    current.step(queue, outcomeSink);
    // Per STEP, not per frame: a frame runs up to 40 ticks and a year
    // boundary inside one of them is still a year boundary. The call is a
    // modulo on every tick and an encode once a game year (SPEC2 M16). Not
    // during a replay: the ring the file carries is the recording's own, and
    // re-recording it would cost an encode a game year for nothing.
    // The queue is handed over with the world: a checkpoint commits to the
    // schedule of its own year as well as to the state (D-191).
    if (replay === null) checkpoints.record(current, queue);
    accumulatorMs -= TICK_MS;
    ticks++;
  }
  // Drop whatever backlog is left instead of chasing it forever; the sim runs
  // slower than requested rather than freezing the worker.
  if (ticks >= MAX_TICKS_PER_FRAME) accumulatorMs = 0;
  if (current.tick >= limit) {
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
  checkpoints = new CheckpointRing();
  replay = null;
  suspended = null;
  // Tick 0 is a year boundary, so the genesis of a game is a checkpoint like
  // any other - and it is the one that makes "replay this game from its first
  // day" a decode rather than a reconstruction (SPEC2 M16).
  checkpoints.record(world, queue);
  writer = new SnapshotWriter(message.buffer);

  if (timer !== null) clearInterval(timer);
  timer = setInterval(runFrame, TICK_MS);

  adoptWorld(world, writer);
}

/**
 * Encode the current game and hand the bytes to the main thread.
 *
 * The worker never touches a file. It cannot: the filesystem lives behind
 * `src/platform`, and the simulation may not reach the platform layer any more
 * than it may reach the renderer. So a save is bytes crossing the boundary, and
 * where they land is somebody else's decision.
 */
function writeSave(slot: SaveSlotKind, label: string): void {
  const current = world;
  if (current === null) return;

  const bytes = encodeSave(current, queue, __APP_VERSION__, checkpoints);
  const date = current.date;
  scope.postMessage({
    type: 'saveWritten',
    bytes,
    slot,
    label,
    year: date.year,
    month: date.month,
    companyValueCt: companyValueCt(current.playerCompany),
  });
}

/**
 * Replace the running world with one out of a file.
 *
 * A bad file is a message, not a crash: the format layer already names the
 * exact field it choked on, and that string is worth far more in a bug report
 * than "could not load". Corruption - bytes that do not decode, or a state
 * that disagrees with its own digest - keeps its own translation key and a
 * flag, because that is the case where the main thread has a `.bak` to offer.
 */
function loadSave(bytes: Uint8Array): void {
  let loaded;
  try {
    loaded = decodeSave(bytes);
  } catch (error) {
    const corrupt = error instanceof SaveCorruptionError;
    scope.postMessage({
      type: 'loadFailed',
      reasonKey: corrupt ? 'ui.save.corrupt' : 'ui.save.loadFailed',
      detail: error instanceof Error ? error.message : String(error),
      path: error instanceof SaveFormatError ? error.path : '',
      corrupt,
    });
    return;
  }

  const sink = writer;
  if (sink === null) return;
  world = loaded.world;
  queue = loaded.queue;
  checkpoints = loaded.ring;
  // A world loaded exactly on a year boundary is a checkpoint the ring may
  // not have (a pre-M16 save has none at all); `record` is idempotent by
  // tick, so this can only ever add the missing one.
  checkpoints.record(world, queue);
  adoptWorld(world, sink);
}

/** Throw the world away and generate a new one (section 20, M9). */
function restart(options: NewGameOptions): void {
  const sink = writer;
  if (sink === null) return;

  world = World.create(
    {
      seed: options.seed,
      difficulty: options.difficulty,
      climate: options.climate,
      mapSize: options.mapSize,
      companyName: options.companyName,
      companyColorIndex: options.companyColorIndex,
      inflation: options.inflation,
      emissions: options.emissions,
      occupancyPenalty: options.occupancyPenalty,
      signalPenalty: options.signalPenalty,
      roadCongestion: options.roadCongestion,
      aiCompanies: options.aiCompanies,
    },
    (phase, seedAttempt) => {
      scope.postMessage({ type: 'generating', phase, seedAttempt });
    },
  );
  queue = new CommandQueue();
  checkpoints = new CheckpointRing();
  checkpoints.record(world, queue);
  adoptWorld(world, sink);
}

// --------------------------------------------------------------- the replay
//
// The theatre of SPEC2 M16. Four operations, and the one property that holds
// them together: while `replay` is set the world under the scheduler belongs
// to a RECORDING, so nothing may author state into it - not the interface,
// which is refused by name below, and not the competitors of section 15,
// whose moves are in the log already and whose re-derived ones the sealed
// queue drops (D-189).

function postReplayFailure(reasonKey: string, error: unknown): void {
  scope.postMessage({
    type: 'replayFailed',
    reasonKey,
    detail: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Turn bytes into a recording for the shelf and describe it.
 *
 * The conversion itself is `replayFromSaveBytes` and lives beside the format,
 * because the crash bundle of D-132 needs the same three cases from the MAIN
 * thread, over a worker that is by then dead. This function is the shelf's
 * door onto it: decode, describe, post.
 */
function makeReplay(bytes: Uint8Array, label: string, play: boolean): void {
  let converted: ConvertedReplay;
  try {
    converted = replayFromSaveBytes(bytes);
    scope.postMessage({
      type: 'replayWritten',
      bytes: converted.bytes,
      meta: replayMeta(converted.loaded, __APP_VERSION__),
      label,
    });
  } catch (error) {
    postReplayFailure(REPLAY_NOT_A_RECORDING, error);
    return;
  }
  // "Play this save as a replay" in one click: the conversion and the entry
  // are one message, so nothing on the main thread has to hold an intent
  // across the round trip and mis-apply it to the next recording shelved. The
  // shelving happens in parallel over there and the order does not matter -
  // both sides start from the same bytes.
  if (play) enterReplay(converted.bytes);
}

/** The same, for the game that is running right now. */
function exportRunningReplay(label: string): void {
  const current = world;
  if (current === null || replay !== null) return;
  try {
    const bytes = encodeReplay(current, queue, checkpoints, __APP_VERSION__);
    scope.postMessage({
      type: 'replayWritten',
      bytes,
      meta: replayMeta(decodeSave(bytes), __APP_VERSION__),
      label,
    });
  } catch (error) {
    postReplayFailure(REPLAY_NOT_A_RECORDING, error);
  }
}

/** Put the running game aside and start playing a recording. */
function enterReplay(bytes: Uint8Array): void {
  const sink = writer;
  const current = world;
  if (sink === null || current === null) return;

  let session: ReplaySession;
  try {
    session = ReplaySession.open(bytes, __APP_VERSION__);
  } catch (error) {
    postReplayFailure(REPLAY_NOT_A_RECORDING, error);
    return;
  }

  // Only the FIRST entry saves a game: watching a second recording from
  // within the first must not put the first one aside as if it were the
  // player's own (it would then be what "leave" restores).
  if (replay === null) suspended = encodeSave(current, queue, __APP_VERSION__, checkpoints);
  replay = session;
  world = session.world;
  queue = session.queue;
  adoptWorld(session.world, sink);
  scope.postMessage({ type: 'replayStarted', meta: session.meta });
}

/** Jump the playback; the ring makes a year boundary land exactly (D-188). */
function seekReplay(tick: number): void {
  const session = replay;
  const sink = writer;
  if (session === null || sink === null) return;
  try {
    session.seek(tick);
  } catch (error) {
    postReplayFailure(REPLAY_NOT_A_RECORDING, error);
    return;
  }
  world = session.world;
  queue = session.queue;
  // The whole world was replaced, tile layers included - the same adoption a
  // load performs, and for the same reason (the renderer holds the buffer).
  // Deliberately WITHOUT a fresh `replayStarted`: the recording did not
  // change, only the position did, and the position already travels in the
  // snapshot. Re-announcing it would throw away a verification verdict that
  // is about the whole recording and not about where the player is standing.
  adoptWorld(session.world, sink);
}

/** "Replay prüfen": re-simulate on a second world and report the comparison. */
function verifyRunningReplay(): void {
  const session = replay;
  if (session === null) return;
  try {
    scope.postMessage({ type: 'replayVerified', result: session.verify() });
  } catch (error) {
    postReplayFailure(
      error instanceof ReplayVersionError ? 'ui.replay.versionRefused' : 'ui.replay.notVerifiable',
      error,
    );
  }
}

/**
 * Leave replay mode.
 *
 * The way out is the way in run backwards: the recording is dropped whole -
 * session, log, ring and the claim - and the game that was put aside is loaded
 * back through the ordinary load path, which is the one piece of code that
 * knows how to adopt a world completely. What the player returns to is
 * therefore the game they left, at the tick they left it, with a queue that
 * accepts commands again.
 */
function exitReplay(): void {
  if (replay === null) return;
  replay = null;
  const bytes = suspended;
  suspended = null;
  if (bytes !== null) loadSave(bytes);
  scope.postMessage({ type: 'replayEnded' });
}

/** Any world replacement ends a replay - a load and a new game both do. */
function abandonReplay(): void {
  if (replay === null) return;
  replay = null;
  suspended = null;
  scope.postMessage({ type: 'replayEnded' });
}

/**
 * Everything that has to be forgotten when the world underneath changes.
 *
 * The published-state trackers are the trap here: they exist so a message is
 * only sent when something actually moved, and a stale one after a load means
 * the interface keeps showing the previous game's stations until something
 * happens to change them.
 */
function adoptWorld(current: World, sink: SnapshotWriter): void {
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
  publishedMonthTick = -1;

  publishSnapshot(current, sink);
  postMonthly(current);
  postStructure(current);

  scope.postMessage({
    type: 'ready',
    companyName: current.playerCompany.name,
    companyColorIndex: current.playerCompany.colorIndex,
    mapSize: current.map.size,
    mapBuffer: current.map.buffer,
    townCount: current.towns.length,
    industryCount: current.industries.length,
    towns: townMarkers(current),
    industries: industryMarkers(current.industries),
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
      // The one place a command can enter the simulation, and therefore the
      // one place the replay has to be defended: a recording the interface
      // can write into is not a recording. The queue is sealed underneath as
      // well - this is what turns the silence into a sentence (D-189).
      if (replay !== null) {
        scope.postMessage({ type: 'commandRejected', reasonKey: REPLAY_COMMAND_REFUSAL });
        return;
      }
      queue.enqueue(message.command, current.tick);
      return;
    }

    case 'requestSave':
      // A save taken during a replay would be a save of somebody else's game
      // wearing the player's shelf.
      if (replay !== null) {
        scope.postMessage({ type: 'commandRejected', reasonKey: REPLAY_COMMAND_REFUSAL });
        return;
      }
      writeSave(message.slot, message.label);
      return;

    case 'loadSave':
      abandonReplay();
      loadSave(message.bytes);
      return;

    case 'newGame':
      abandonReplay();
      restart(message.options);
      return;

    case 'makeReplay':
      makeReplay(message.bytes, message.label, message.play);
      return;

    case 'exportReplay':
      exportRunningReplay(message.label);
      return;

    case 'enterReplay':
      enterReplay(message.bytes);
      return;

    case 'replaySeek':
      seekReplay(message.tick);
      return;

    case 'verifyReplay':
      verifyRunningReplay();
      return;

    case 'exitReplay':
      exitReplay();
      return;

    case 'shutdown':
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      replay = null;
      suspended = null;
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

// ------------------------------------------------------------- crash safety
//
// The worker's last words (SPEC2 M10). An uncaught throw in the tick loop
// lands on the global error event, an uncaught rejection on its own; both end
// with one `simCrashed` message and a stopped scheduler. Best effort only:
// nothing on the other side RELIES on this message arriving - the main thread
// keeps the autosave reference and the command-log tail on its own side
// (D-132), because a worker that just crashed cannot be trusted to encode a
// save (D-111). What this message adds when it does get out is the stack and
// the exact tick, which no other side can know.

let crashReported = false;

function reportCrash(message: string, stack: string): void {
  if (crashReported) return;
  crashReported = true;
  // The world may be half-mutated; ticking on would publish corrupt state
  // every 50 ms and rethrow the same error with it.
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  scope.postMessage({
    type: 'simCrashed',
    message,
    stack,
    tick: world === null ? -1 : world.tick,
  });
}

scope.addEventListener('error', (event) => {
  const cause: unknown = event.error;
  reportCrash(
    event.message === '' && cause instanceof Error ? cause.message : event.message,
    cause instanceof Error ? (cause.stack ?? '') : '',
  );
  // Marks the error as handled so it does not ALSO surface as the Worker
  // object's error event on the main thread - the fallback there carries no
  // stack and would race this richer report for the first-crash slot.
  event.preventDefault();
});

scope.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  reportCrash(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? (reason.stack ?? '') : '',
  );
  event.preventDefault();
});
