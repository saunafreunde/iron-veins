import type { MainToWorkerMessage, WorkerToMainMessage } from '../shared/protocol';
import { createSnapshotBuffer, SnapshotF64, SnapshotI32, SnapshotReader } from '../shared/snapshot';
import type { Command } from '../sim/commands/types';
import type { Difficulty, MapClimate } from '../sim/constants';
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

function hexWord(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

export class SimClient {
  private worker: Worker | null = null;
  private reader: SnapshotReader | null = null;
  private timerId = 0;

  /** Boot the worker and start a fresh game. */
  start(options: StartGameOptions): void {
    const store = useSimStore.getState();

    if (typeof SharedArrayBuffer === 'undefined') {
      // Failure #12: without COOP/COEP the buffer simply does not exist. Say so
      // instead of failing later with an opaque constructor error.
      store.setSharedMemoryAvailable(false);
      store.setFatalError(
        'SharedArrayBuffer is unavailable. The document is not cross-origin isolated - ' +
          'check the COOP/COEP headers in vite.config.ts and src-tauri/tauri.conf.json.',
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
      useSimStore.getState().setFatalError(event.message);
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
   * Per-tick vehicle block, read straight out of the shared buffer.
   * The renderer pulls this every frame; it is never copied.
   */
  readVehicles(): { data: Int32Array; count: number } {
    return this.reader?.currentVehicles() ?? { data: EMPTY_VEHICLES, count: 0 };
  }

  /** Claimed track of the published tick, for the F3 overlay. */
  readReserved(): { data: Int32Array; count: number } {
    return this.reader?.currentReserved() ?? { data: EMPTY_VEHICLES, count: 0 };
  }

  /** Change the simulation speed. Control traffic - never affects the result. */
  setSpeed(speedIndex: number): void {
    this.post({ type: 'setSpeed', speedIndex });
  }

  /** Queue a state changing command (architecture law #6). */
  send(command: Command): void {
    this.post({ type: 'command', command });
  }

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
      case 'fleetChanged':
        store.setFleet(message.vehicles);
        return;
      case 'commandRejected':
        store.setRejection(message.reasonKey);
        return;
      case 'error':
        store.setFatalError(message.message);
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
  };
}
