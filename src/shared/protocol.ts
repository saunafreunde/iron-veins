import type { Command } from '../sim/commands/types';
import type { Difficulty, MapClimate } from '../sim/constants';
import type { MapGenPhase } from '../sim/mapgen';

/**
 * Message contract between the main thread and the simulation worker.
 *
 * Only two kinds of traffic exist here, and the distinction matters:
 *  - COMMANDS change simulation state. They are queued, tick-stamped, logged
 *    and replayed (architecture law #6).
 *  - CONTROL messages (speed, shutdown) change how often the scheduler calls
 *    step(). They must never influence the simulation result, otherwise a
 *    replay recorded at 20x would diverge from one watched at 1x.
 *
 * Per-tick state does not travel through here at all - it goes through the
 * SharedArrayBuffer snapshot.
 */

/** Everything the renderer needs to label a town, without shipping the object. */
export interface TownMarker {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly sizeClass: number;
}

export interface IndustryMarker {
  readonly id: number;
  readonly type: number;
  readonly x: number;
  readonly y: number;
}

export type MainToWorkerMessage =
  | {
      readonly type: 'init';
      readonly buffer: SharedArrayBuffer;
      readonly seed: number;
      readonly difficulty: Difficulty;
      readonly climate: MapClimate;
      readonly mapSize: number;
      readonly companyName: string;
      readonly companyColorIndex: number;
    }
  | { readonly type: 'setSpeed'; readonly speedIndex: number }
  | { readonly type: 'command'; readonly command: Command }
  | { readonly type: 'shutdown' };

export type WorkerToMainMessage =
  | { readonly type: 'generating'; readonly phase: MapGenPhase; readonly seedAttempt: number }
  | {
      readonly type: 'ready';
      readonly companyName: string;
      readonly companyColorIndex: number;
      readonly mapSize: number;
      /** Shared tile layers - the renderer reads them in place, never a copy. */
      readonly mapBuffer: SharedArrayBuffer;
      readonly townCount: number;
      readonly industryCount: number;
      readonly towns: readonly TownMarker[];
      readonly industries: readonly IndustryMarker[];
    }
  | { readonly type: 'companyChanged'; readonly name: string; readonly colorIndex: number }
  | { readonly type: 'commandRejected'; readonly reasonKey: string }
  | { readonly type: 'error'; readonly message: string };
