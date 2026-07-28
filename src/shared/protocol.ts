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
  /** Production level in percent of the base rate; 0 once it has closed. */
  readonly level: number;
  /** Finished output waiting in the yard, rounded. [units] */
  readonly stock: number;
  /** Share of the last twelve months' output that left, 0..100. */
  readonly service: number;
  /** Months in a row in which nothing was collected. */
  readonly neglectedMonths: number;
  readonly open: boolean;
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
  /** Leading unit; for a train that is its locomotive. */
  readonly specId: number;
  /** A value of VehicleKind. */
  readonly kind: number;
  readonly state: number;
  readonly cargoUnits: number;
  readonly capacity: number;
  readonly earnedCt: number;
  readonly orderStationIds: readonly number[];
  /** Units the train is made of, empty for anything else. */
  readonly consist: readonly number[];
  /** Fastest the whole vehicle may run, curves aside. [m/s] */
  readonly maxSpeedMs: number;
  readonly lengthM: number;
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
  /** Industry production state; sent on the same cadence as the stations. */
  | { readonly type: 'industriesChanged'; readonly industries: readonly IndustryMarker[] }
  /** Fleet overview for the vehicle list; sent when it changes, not per tick. */
  | { readonly type: 'fleetChanged'; readonly vehicles: readonly VehicleMarker[] }
  | { readonly type: 'error'; readonly message: string };
