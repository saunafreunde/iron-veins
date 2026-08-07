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

/** One open tender, as the contract panel shows it (section 14.4). */
export interface ContractMarker {
  readonly id: number;
  readonly cargo: number;
  readonly townId: number;
  readonly townName: string;
  readonly amountUnits: number;
  readonly monthsLeft: number;
  readonly bonusCt: number;
  /** How far the PLAYER has got, 0..1. */
  readonly progress: number;
  readonly accepted: boolean;
  /** How many other companies are racing for it. */
  readonly rivals: number;
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

/**
 * One order as the fleet panel edits it - the full 12.1 grammar, mirroring
 * the sim's `Order` record field for field. Travels on the marker channel,
 * never in the per-tick snapshot: a schedule changes when the player edits
 * it, not twenty times a second (SPEC2 Fehler 37).
 */
export interface OrderMarker {
  /** A value of OrderTarget. */
  readonly target: number;
  /** Station id, or the tile index of a depot or waypoint. */
  readonly targetId: number;
  /** A value of OrderLoad. */
  readonly load: number;
  /** A value of OrderUnload. */
  readonly unload: number;
  /** Cargo to refit to at this stop, or -1. */
  readonly refitTo: number;
  /** Minimum dwell at this stop. [ticks] */
  readonly waitTicks: number;
  /** A value of OrderConditionKind, -1 for none. */
  readonly condKind: number;
  /** A value of OrderComparator. */
  readonly condComparator: number;
  readonly condValue: number;
  readonly condJumpTo: number;
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
  /** Line the vehicle is assigned to, or -1 (section 12.2). */
  readonly lineId: number;
  /**
   * The order list the vehicle RUNS: its line's when it is assigned to one,
   * its own otherwise - for the order editor of section 12.1.
   */
  readonly orders: readonly OrderMarker[];
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

/** One stop of a line, with what is waiting there (section 12.2). */
export interface LineStopMarker {
  readonly stationId: number;
  /** Cargo units waiting at the station. */
  readonly waitingUnits: number;
}

/**
 * A line as the line list and the line detail panel show it (section 12.2).
 * Every figure is recomputed from the stores on the marker cadence - the
 * entity itself carries no statistics (the M6 rule).
 */
export interface LineMarker {
  readonly id: number;
  /** Station stops in cycle order, with their waiting cargo. */
  readonly stops: readonly LineStopMarker[];
  /** The full shared order list, for the line's order editor. */
  readonly orders: readonly OrderMarker[];
  /** Vehicles assigned to the line, ascending id. */
  readonly vehicleIds: readonly number[];
  /** Share of the line's capacity currently aboard, 0..1. */
  readonly utilisation: number;
  /** Revenue rate minus upkeep, per game year (section 12.2). [cent] */
  readonly profitPerYearCt: number;
  /** Mean round time, arrival to arrival over the D-077 legs. [ticks] */
  readonly roundTicks: number;
  /**
   * False while any leg is still the straight-line 54 km/h seed - the panel
   * must SAY estimate then (D-077), not dress the guess up as a measurement.
   */
  readonly roundMeasured: boolean;
  /** Per-line auto-renewal (section 11.3). */
  readonly autoRenew: boolean;
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
  /**
   * Write a save. The worker answers with `saveWritten`; the main thread is the
   * only side that may touch a disk (architecture law #1).
   */
  | { readonly type: 'requestSave'; readonly slot: SaveSlotKind; readonly label: string }
  /** Load a save from bytes the main thread read. */
  | { readonly type: 'loadSave'; readonly bytes: Uint8Array }
  /** Throw the world away and generate a new one with these parameters. */
  | { readonly type: 'newGame'; readonly options: NewGameOptions }
  | { readonly type: 'shutdown' };

/** Everything the player chooses on the new-game screen (section 20, M9). */
export interface NewGameOptions {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly climate: MapClimate;
  readonly mapSize: number;
  readonly companyName: string;
  readonly companyColorIndex: number;
  readonly inflation: boolean;
  readonly emissions: boolean;
  readonly aiCompanies: number;
}

/**
 * Which shelf a save belongs on.
 *
 * Section 19.1 keeps autosaves apart from manual ones on purpose: an autosave
 * ring that could overwrite the file a player deliberately made is the one way
 * a save system loses somebody's game.
 */
export const SaveSlotKind = {
  Manual: 0,
  Quick: 1,
  Auto: 2,
} as const;
export type SaveSlotKind = (typeof SaveSlotKind)[keyof typeof SaveSlotKind];

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
  /** The open tenders of section 14.4. */
  | { readonly type: 'contractsChanged'; readonly contracts: readonly ContractMarker[] }
  /** The books, sent when the game month rolls over. */
  | { readonly type: 'financesChanged'; readonly report: FinanceReport }
  /** The news log, sent whenever something was posted to it. */
  | { readonly type: 'newsChanged'; readonly news: readonly NewsMarker[] }
  /** Fleet overview for the vehicle list; sent when it changes, not per tick. */
  | { readonly type: 'fleetChanged'; readonly vehicles: readonly VehicleMarker[] }
  /** The PLAYER's lines, on the same cadence as the fleet (section 12.2). */
  | { readonly type: 'linesChanged'; readonly lines: readonly LineMarker[] }
  /** A save the worker encoded. The main thread decides where it goes. */
  | {
      readonly type: 'saveWritten';
      readonly bytes: Uint8Array;
      readonly slot: SaveSlotKind;
      readonly label: string;
      readonly year: number;
      readonly month: number;
      readonly companyValueCt: number;
    }
  /**
   * A load that did not work out, named by a translation key.
   *
   * `path` is the save field or section the codec choked on (`save.state.rng`),
   * or '' when the bytes never decoded that far. `corrupt` is true when the
   * FILE is damaged - undecodable bytes or a digest mismatch - which is the
   * case where the interface should offer the `.bak` the last write kept.
   */
  | {
      readonly type: 'loadFailed';
      readonly reasonKey: string;
      readonly detail: string;
      readonly path: string;
      readonly corrupt: boolean;
    }
  /**
   * One command ran. The tutorial of section 17.5 watches these to know when a
   * lesson's goal is met, and the audio of section 18 turns them into clicks.
   */
  | { readonly type: 'commandExecuted'; readonly kind: number; readonly accepted: boolean }
  | { readonly type: 'error'; readonly message: string }
  /**
   * The worker's last words: an uncaught error or rejection killed the
   * simulation. Deliberately WITHOUT a save attached - a crashed worker
   * cannot be trusted to encode one (D-111/D-132), so everything the crash
   * bundle needs already lives on the main thread and this message only
   * carries what died and where. `tick` is -1 when no world existed yet.
   */
  | {
      readonly type: 'simCrashed';
      readonly message: string;
      readonly stack: string;
      readonly tick: number;
    };
