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
  /** Inhabitants - the one column a town list is actually for. */
  readonly population: number;
  /** What the council thinks of the PLAYER, 0..100 (section 13.3). */
  readonly councilRating: number;
  /** Company holding exclusive building rights here, or -1. */
  readonly exclusiveCompanyId: number;
  /** Months of those rights still to run; 0 when nobody holds any. */
  readonly exclusiveMonthsLeft: number;
  /** Price of buying them, at this year's prices. [cent] */
  readonly exclusiveCostCt: number;
  /** Per measure, whether the player may buy it right now. */
  readonly measureReady: readonly boolean[];
}

/** A company as the interface names it. */
export interface CompanyMarker {
  readonly id: number;
  readonly name: string;
  readonly colorIndex: number;
  /** Net worth, so the list can be ranked (section 14.1). [cent] */
  readonly valueCt: number;
  readonly bankrupt: boolean;
}

/**
 * The company's books, as the finance panel shows them (section 14.1).
 *
 * Sent by message rather than through the snapshot: it is a hundred numbers
 * that change once a game month, and packing that into a shared buffer would
 * make the layout churn for nothing.
 */
export interface FinanceReport {
  /** Accounts of the month in progress, indexed by Account. [cent] */
  readonly month: readonly number[];
  readonly year: readonly number[];
  readonly lastYear: readonly number[];
  /** The last twenty-four months, oldest first, one row per month. */
  readonly history: readonly (readonly number[])[];
  /** Company value at the end of each of the last game years. [cent] */
  readonly valueHistory: readonly number[];
  readonly companyValueCt: number;
  readonly bookValueCt: number;
  readonly loanCt: number;
  readonly cashCt: number;
  readonly autoRenew: boolean;
  /** Carbon emitted this game year and last, in kilograms (section 14.3). */
  readonly co2ThisYearKg: number;
  readonly co2LastYearKg: number;
}

/** One line of the news log, as the panel shows it (section 17.1). */
export interface NewsMarker {
  readonly tick: number;
  /** Calendar of the event, ready to format - the UI has no tick clock. */
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** A value of NewsCategory. */
  readonly category: number;
  /** A value of NewsSeverity. */
  readonly severity: number;
  readonly messageKey: string;
  readonly params: Readonly<Record<string, number | string>>;
  /** Tile to jump to, or -1 when the event has no place. */
  readonly tileIndex: number;
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
  /** Tile it stands on; the overlay marks it when it is stuck. */
  readonly tileIndex: number;
  /**
   * Ticks it has been held at a signal without getting anywhere, or 0.
   * Past DEADLOCK_WARNING_TICKS it counts as stuck (section 9.3).
   */
  readonly waitingTicks: number;
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
  /** Town populations; they change monthly, so they travel with the finances. */
  | { readonly type: 'townsChanged'; readonly towns: readonly TownMarker[] }
  /** Every company in the game, the player first. */
  | { readonly type: 'companiesChanged'; readonly companies: readonly CompanyMarker[] }
  /** The books, sent when the game month rolls over. */
  | { readonly type: 'financesChanged'; readonly report: FinanceReport }
  /** The news log, sent whenever something was posted to it. */
  | { readonly type: 'newsChanged'; readonly news: readonly NewsMarker[] }
  /** Fleet overview for the vehicle list; sent when it changes, not per tick. */
  | { readonly type: 'fleetChanged'; readonly vehicles: readonly VehicleMarker[] }
  | { readonly type: 'error'; readonly message: string };
