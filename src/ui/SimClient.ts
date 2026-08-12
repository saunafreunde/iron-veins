import { t } from '../i18n';
import type {
  MainToWorkerMessage,
  NewGameOptions,
  SaveSlotKind,
  WorkerToMainMessage,
} from '../shared/protocol';
import {
  createSnapshotBuffer,
  SNAPSHOT_GOAL_STRIDE,
  SnapshotF64,
  SnapshotGoal,
  SnapshotI32,
  SnapshotReader,
  type VehicleFrame,
} from '../shared/snapshot';
import type { Command } from '../sim/commands/types';
import type { Difficulty, MapClimate } from '../sim/constants';
import { handleWorkerCrash, recordCommand, recordWorldReplaced } from './crashReporter';
import { useSimStore } from './store';

/**
 * Main-thread handle on the simulation worker.
 *
 * Owns the worker lifetime, the shared snapshot buffer and the read loop that
 * feeds the HUD. Deliberately created outside React: the simulation must not be
 * torn down and rebuilt by a component remount.
 */

export interface StartGameOptions {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly climate: MapClimate;
  readonly mapSize: number;
  readonly companyName: string;
  readonly companyColorIndex: number;
}

/**
 * The HUD is text, not animation - refreshing it at ~15 Hz keeps the numbers
 * readable and costs a fraction of a per-frame React update.
 *
 * Driven by a timer rather than requestAnimationFrame on purpose: rAF stops
 * whenever the window is occluded or minimised, which would freeze the status
 * bar even though the simulation keeps running. The map renderer added in M1
 * does use rAF - there, "no frame" genuinely means "nothing to draw".
 */
const UI_REFRESH_MS = 66;

/** Returned before the worker has published anything. */
const EMPTY_VEHICLES = new Int32Array(0);

/**
 * The vehicle frame of a channel that has never published. Generation 0 is
 * the writer's "nothing yet" value, which the interpolator ignores by
 * contract.
 */
const EMPTY_FRAME: VehicleFrame = {
  data: EMPTY_VEHICLES,
  count: 0,
  generation: 0,
  tick: 0,
  simRateCentiHz: 0,
};

function hexWord(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

export class SimClient {
  private worker: Worker | null = null;
  private reader: SnapshotReader | null = null;
  private timerId = 0;
  /**
   * Last goal progress written to the store, kept so the block can be COMPARED
   * before it is copied (SPEC2 M17).
   *
   * The goal block is published with every snapshot but a goal moves once a
   * game day, so handing the panel a fresh array on every poll would re-render
   * it fifteen times a second to draw the same bar. Sixteen integers compared
   * is cheaper than one React pass and, unlike a throttle, it is exact.
   */
  private goalProgress: readonly number[] = [];

  /** Boot the worker and start a fresh game. */
  start(options: StartGameOptions): void {
    const store = useSimStore.getState();

    if (typeof SharedArrayBuffer === 'undefined') {
      // Failure #12: without COOP/COEP the buffer simply does not exist. Say so
      // instead of failing later with an opaque constructor error.
      store.setSharedMemoryAvailable(false);
      // Translated, because it is the only thing the player will ever see of
      // this application; the technical half stays in English on purpose,
      // because it is for whoever gets the bug report.
      store.setFatalError(
        `${t('ui.error.noSharedMemory')} ` +
          'COOP/COEP: vite.config.ts, src-tauri/tauri.conf.json.',
      );
      return;
    }

    const buffer = createSnapshotBuffer();
    this.reader = new SnapshotReader(buffer);

    const worker = new Worker(new URL('../sim/SimWorker.ts', import.meta.url), {
      type: 'module',
      name: 'iron-veins-sim',
    });
    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      this.handleWorkerMessage(event.data, options.seed);
    };
    worker.onerror = (event) => {
      // Fallback for a worker that died before its own crash handlers could
      // report - a script that failed to even load. The in-worker handler
      // calls preventDefault() when it fires, so this and `simCrashed` do not
      // race for the same death; whichever exists wins.
      void handleWorkerCrash({
        message: event.message === '' ? 'Worker failed before reporting' : event.message,
        stack: '',
        tick: -1,
      });
    };
    this.worker = worker;

    this.post({
      type: 'init',
      buffer,
      seed: options.seed,
      difficulty: options.difficulty,
      climate: options.climate,
      mapSize: options.mapSize,
      companyName: options.companyName,
      companyColorIndex: options.companyColorIndex,
    });

    this.timerId = window.setInterval(this.readSnapshot, UI_REFRESH_MS);
  }

  /**
   * Per-tick vehicle block of the published generation, tagged with the
   * generation, its tick and the measured rate (E-05). The renderer's
   * interpolator pulls this every frame; nothing is copied HERE - the
   * reader-side copy is the interpolator's, taken only when the generation
   * moved.
   */
  readVehicleFrame(): VehicleFrame {
    return this.reader?.currentVehicleFrame() ?? EMPTY_FRAME;
  }

  /** Claimed track of the published tick, for the F3 overlay. */
  readReserved(): { data: Int32Array; count: number } {
    return this.reader?.currentReserved() ?? { data: EMPTY_VEHICLES, count: 0 };
  }

  /** Flow legs of the published tick, for the M14 flow atlas (D-176). */
  readFlow(): { data: Int32Array; count: number; tick: number } {
    return this.reader?.currentFlow() ?? { data: EMPTY_VEHICLES, count: 0, tick: 0 };
  }

  /** Tick of the published snapshot, for the day/night curve. Render-only. */
  readTick(): number {
    return this.reader?.currentTick() ?? 0;
  }

  /**
   * The weather field of the published tick (SPEC2 M18, E-01), for the rain
   * and snow the renderer draws. A count of zero means the world has no
   * weather rule at all - not a clear day - so the whole particle path can be
   * skipped without reading 256 cells to find out.
   */
  readWeather(): { data: Int32Array; count: number } {
    return this.reader?.currentWeather() ?? { data: EMPTY_VEHICLES, count: 0 };
  }

  /** Change the simulation speed. Control traffic - never affects the result. */
  setSpeed(speedIndex: number): void {
    this.post({ type: 'setSpeed', speedIndex });
  }

  /**
   * Queue a state changing command (architecture law #6).
   *
   * Returns false when the command was refused before it left this side. That
   * happens for exactly one reason: a recording is playing, and a replay the
   * interface can write into is not evidence of anything (SPEC2 M16, D-189).
   * The worker refuses the same command as well and says so in words - this is
   * the cheaper half of the same rule, and the half a test can reach.
   */
  send(command: Command): boolean {
    if (useSimStore.getState().replay !== null) return false;
    // Mirrored into the main thread's rolling crash log BEFORE it crosses the
    // boundary: if this very command kills the worker, the copy over there
    // dies with it (D-132).
    recordCommand(command);
    this.post({ type: 'command', command });
    return true;
  }

  // ------------------------------------------------------------ the replay
  //
  // Five verbs over the theatre of SPEC2 M16. All of them are questions for
  // the worker: it is the only side that may decode a world, and this side is
  // the only one that may touch a file (D-111).

  /**
   * Turn a save (or a recording) into a `.ironreplay` and describe it.
   *
   * `play` makes it the one-click door of SPEC2 M16's acceptance sentence: the
   * worker shelves the recording AND starts playing it, in one round trip, so
   * "watch this save" is not a conversion on one screen followed by a play on
   * another. The intent travels in the message rather than being remembered
   * here - a flag on this side would survive a failed conversion and fire on
   * whatever was shelved next.
   */
  makeReplay(bytes: Uint8Array, label: string, play: boolean): void {
    useSimStore.getState().setReplayError(null);
    this.post({ type: 'makeReplay', bytes, label, play });
  }

  /** The same, for the game running right now. */
  exportReplay(label: string): void {
    useSimStore.getState().setReplayError(null);
    this.post({ type: 'exportReplay', label });
  }

  /** Put the running game aside and watch a recording. */
  enterReplay(bytes: Uint8Array): void {
    useSimStore.getState().setReplayError(null);
    this.post({ type: 'enterReplay', bytes });
  }

  /** Jump the playback; a year the ring holds is landed on exactly. */
  seekReplay(tick: number): void {
    this.post({ type: 'replaySeek', tick });
  }

  /** "Replay prüfen" - re-simulate and compare against the recorded claims. */
  verifyReplay(): void {
    const store = useSimStore.getState();
    store.setReplayError(null);
    store.setReplayChecking(true);
    this.post({ type: 'verifyReplay' });
  }

  /** Leave replay mode; the game that was put aside comes back. */
  exitReplay(): void {
    recordWorldReplaced('replay');
    this.post({ type: 'exitReplay' });
  }

  /** Called when the worker hands back a recording to shelve. */
  onReplayWritten:
    ((message: Extract<WorkerToMainMessage, { type: 'replayWritten' }>) => void) | null = null;

  /**
   * Ask the worker to encode the game. The bytes come back as a message and
   * the main thread decides where they go - the simulation never sees a file.
   */
  save(slot: SaveSlotKind, label: string): void {
    this.post({ type: 'requestSave', slot, label });
  }

  /** Replace the running world with one out of a file. */
  load(bytes: Uint8Array): void {
    useSimStore.getState().setLoadError(null);
    recordWorldReplaced('load');
    this.post({ type: 'loadSave', bytes });
  }

  /** Throw the world away and generate a new one. */
  newGame(options: NewGameOptions): void {
    const store = useSimStore.getState();
    store.resetWorld();
    recordWorldReplaced('newGame');
    this.post({ type: 'newGame', options });
  }

  /**
   * Called for every command the PLAYER issued, accepted or not.
   *
   * A single hook rather than a store field: the tutorial and the audio engine
   * both want the event and neither wants a re-render for it.
   */
  onCommandExecuted: ((kind: number, accepted: boolean) => void) | null = null;

  /** Called when the worker hands back an encoded save. */
  onSaveWritten: ((message: Extract<WorkerToMainMessage, { type: 'saveWritten' }>) => void) | null =
    null;

  /** Stop the worker and the read loop. */
  dispose(): void {
    if (this.timerId !== 0) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }
    if (this.worker !== null) {
      this.post({ type: 'shutdown' });
      this.worker.terminate();
      this.worker = null;
    }
    this.reader = null;
  }

  private post(message: MainToWorkerMessage): void {
    this.worker?.postMessage(message);
  }

  private handleWorkerMessage(message: WorkerToMainMessage, seed: number): void {
    const store = useSimStore.getState();
    switch (message.type) {
      case 'generating':
        store.setGenerating(message.phase, message.seedAttempt);
        return;
      case 'ready':
        store.setCompany(message.companyName, message.companyColorIndex);
        store.setWorld({
          mapSize: message.mapSize,
          mapBuffer: message.mapBuffer,
          climate: message.climate,
          economyCurve: message.economyCurve,
          towns: message.towns,
          industries: message.industries,
        });
        store.setReady(seed);
        return;
      case 'companyChanged':
        store.setCompany(message.name, message.colorIndex);
        return;
      case 'stationsChanged':
        store.setStations(message.stations);
        return;
      case 'industriesChanged':
        store.setIndustries(message.industries);
        return;
      case 'townsChanged':
        store.setTowns(message.towns);
        return;
      case 'financesChanged':
        store.setFinances(message.report);
        return;
      case 'newsChanged':
        store.setNews(message.news);
        return;
      case 'companiesChanged':
        store.setCompanies(message.companies);
        return;
      case 'contractsChanged':
        store.setContracts(message.contracts);
        return;
      case 'fleetChanged':
        store.setFleet(message.vehicles);
        return;
      case 'linesChanged':
        store.setLines(message.lines);
        return;
      case 'goalsChanged':
        store.setGoals(message.goals, message.end);
        return;
      case 'commandRejected':
        store.setRejection(message.reasonKey);
        return;
      case 'saveWritten':
        this.onSaveWritten?.(message);
        return;
      case 'loadFailed':
        store.setLoadError({
          reasonKey: message.reasonKey,
          detail: message.detail,
          path: message.path,
          corrupt: message.corrupt,
        });
        return;
      case 'commandExecuted':
        this.onCommandExecuted?.(message.kind, message.accepted);
        return;
      case 'error':
        store.setFatalError(message.message);
        return;
      case 'simCrashed':
        void handleWorkerCrash({
          message: message.message,
          stack: message.stack,
          tick: message.tick,
        });
        return;
      case 'replayWritten':
        this.onReplayWritten?.(message);
        return;
      case 'replayStarted':
        // The crash log's marker is written HERE rather than beside the
        // request, because there are two doors into replay mode now - the
        // shelf's "play", and a save converted and entered in one message -
        // and the marker is about a world that WAS replaced, not one somebody
        // asked to replace (a conversion that failed replaces nothing).
        recordWorldReplaced('replay');
        store.setReplay(message.meta);
        return;
      case 'replayEnded':
        store.setReplay(null);
        return;
      case 'replayVerified':
        store.setReplayVerification(message.result);
        return;
      case 'replayFailed':
        store.setReplayError({ reasonKey: message.reasonKey, detail: message.detail });
        return;
    }
  }

  private readonly readSnapshot = (): void => {
    const reader = this.reader;
    if (reader === null || !reader.poll()) return;

    const i32 = reader.i32;
    const f64 = reader.f64;
    useSimStore.getState().applySnapshot({
      tick: i32[SnapshotI32.Tick]!,
      year: i32[SnapshotI32.Year]!,
      month: i32[SnapshotI32.Month]!,
      day: i32[SnapshotI32.Day]!,
      speedIndex: i32[SnapshotI32.SpeedIndex]!,
      commandsExecuted: i32[SnapshotI32.CommandsExecuted]!,
      simRateCentiHz: i32[SnapshotI32.SimRateCentiHz]!,
      mapRevision: i32[SnapshotI32.MapRevision]!,
      cashCt: f64[SnapshotF64.CashCt]!,
      loanCt: f64[SnapshotF64.LoanCt]!,
      loanLimitCt: f64[SnapshotF64.LoanLimitCt]!,
      stateHash: hexWord(i32[SnapshotI32.StateHashHi]!) + hexWord(i32[SnapshotI32.StateHashLo]!),
      monthsInDebt: i32[SnapshotI32.MonthsInDebt]!,
    });

    const goals = reader.currentGoals();
    const progress = goalProgressOf(goals.data, goals.count);
    if (!sameProgress(progress, this.goalProgress)) {
      this.goalProgress = progress;
      useSimStore.getState().setGoalProgress(progress);
    }
  };
}

/** The progress column of the published goal block, in slot order. */
function goalProgressOf(data: Int32Array, count: number): number[] {
  const progress: number[] = [];
  for (let at = 0; at < count; at++) {
    progress.push(data[at * SNAPSHOT_GOAL_STRIDE + SnapshotGoal.ProgressMilli]!);
  }
  return progress;
}

function sameProgress(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
