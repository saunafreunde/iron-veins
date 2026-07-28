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

/** One module of a station, as the renderer needs to draw it. */
export interface StationModuleMarker {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

export interface StationMarker {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rating: number;
  readonly waiting: number;
  readonly modules: readonly StationModuleMarker[];
}

/** A vehicle as the fleet list shows it. */
export interface VehicleMarker {
  readonly id: number;
  readonly specId: number;
  readonly state: number;
  readonly cargoUnits: number;
  readonly capacity: number;
  readonly earnedCt: number;
  readonly orderStationIds: readonly number[];
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
  /** Sent whenever a station was built, extended or removed. */
  | { readonly type: 'stationsChanged'; readonly stations: readonly StationMarker[] }
  /** Fleet overview for the vehicle list; sent when it changes, not per tick. */
  | { readonly type: 'fleetChanged'; readonly vehicles: readonly VehicleMarker[] }
  | { readonly type: 'error'; readonly message: string };
