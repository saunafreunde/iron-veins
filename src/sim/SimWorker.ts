import type { MainToWorkerMessage, WorkerToMainMessage } from '../shared/protocol';
import { SnapshotF64, SnapshotI32, SnapshotWriter } from '../shared/snapshot';
import { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  MAX_TICK,
  MAX_TICKS_PER_FRAME,
  SPEED_FACTORS,
  STATE_HASH_INTERVAL_TICKS,
  TICK_MS,
} from './constants';
import { loanLimitCt } from './economy/company';
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

  const f64 = sink.draftF64;
  f64[SnapshotF64.CashCt] = current.company.cashCt;
  f64[SnapshotF64.LoanCt] = current.company.loanCt;
  f64[SnapshotF64.LoanLimitCt] = loanLimitCt(current.company);

  sink.publish();

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

  publishSnapshot(world, writer);

  if (timer !== null) clearInterval(timer);
  timer = setInterval(runFrame, TICK_MS);

  scope.postMessage({
    type: 'ready',
    companyName: world.company.name,
    companyColorIndex: world.company.colorIndex,
    mapSize: world.map.size,
    townCount: world.towns.length,
    industryCount: world.industries.length,
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
