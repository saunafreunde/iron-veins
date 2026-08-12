import type { Command } from '../sim/commands/types';
import type { Difficulty, MapClimate, WeatherRule } from '../sim/constants';
import type { GoalSpec } from '../sim/goals/types';
import type { MapGenPhase } from '../sim/mapgen';
import type { ReplayVerification } from '../sim/save/replay';
import type { ReplayMeta } from '../sim/save/replaySession';
import type { ScenarioMeta } from '../sim/save/scenarioMeta';

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
  /** Which council is sitting here: a CouncilProfile (SPEC2 M20). */
  readonly councilProfile: number;
  /**
   * Months until the next ballot, or -1 in a world whose elections rule is off.
   *
   * The panel needs the number and not the rule, so the worker answers the
   * question rather than sending the flag and letting the interface do the
   * arithmetic - the same posture the exclusive rights' `exclusiveMonthsLeft`
   * takes one field up.
   */
  readonly monthsToElection: number;
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

/** One standing supply order, as the contract panel shows it (SPEC2 M21). */
export interface SupplyMarker {
  readonly id: number;
  readonly cargo: number;
  /** The works that placed the order, and where it stands. */
  readonly industryNameKey: string;
  readonly x: number;
  readonly y: number;
  /** What it wants every month. [units/month] */
  readonly quotaUnits: number;
  readonly monthsLeft: number;
  readonly bonusCt: number;
  /** How far the PLAYER has got with THIS month's share, 0..1. */
  readonly progress: number;
  readonly accepted: boolean;
  /** How many other companies hold the same order. */
  readonly rivals: number;
  /** Consecutive months the works has gone short of its quota. */
  readonly monthsMissed: number;
}

/** One subsidised relation, as the contract panel shows it (SPEC2 M21). */
export interface SubsidyMarker {
  readonly id: number;
  readonly cargo: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** What the state pays, as a percentage of the ordinary rate. */
  readonly ratePercent: number;
  readonly monthsLeft: number;
  /** The company that won the race, or -1 while it is still open. */
  readonly claimedBy: number;
  /** The winner's name, empty while the race is open. */
  readonly claimedByName: string;
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
 * The network value of SPEC2 M15: earned revenue against the closed-form
 * ceiling of D-066, computed sim-side in `economy/networkValue.ts`.
 *
 * All three numbers travel because the panel shows the percentage and the
 * tooltip explains it with the two figures it came from. The UI divides
 * nothing: `share` is the simulation's own answer, so the number on screen
 * and the number a balancing scenario asserts are the same number.
 */
export interface NetworkValueMarker {
  /** Revenue the vehicles actually booked over their lives. [cent] */
  readonly earnedCt: number;
  /** What that same fleet could have earned over the same lives. [cent] */
  readonly ceilingCt: number;
  /** `earnedCt / ceilingCt`, 0 while nothing has had the chance to earn. */
  readonly share: number;
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
  /**
   * The whole company's network value (SPEC2 M15). It belongs in the BOOKS
   * because SPEC.md section 1 asks for the reward for good network design to
   * be measurable "in der Bilanz" - and because it moves on the same monthly
   * cadence as everything else here.
   */
  readonly networkValue: NetworkValueMarker;
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

/**
 * The five 10.1 terms of the station x-ray (SPEC2 M14), exactly as the
 * simulation's own `ratingTerms` computed them - the panel displays these,
 * it never recomputes them.
 */
export interface StationTermsMarker {
  readonly wait: number;
  readonly frequency: number;
  readonly equipment: number;
  readonly reliability: number;
  /** The malus - subtracted, 0 when nothing overflowed recently. */
  readonly overflow: number;
}

/** One row of the per-cargo waiting table (SPEC2 M14). */
export interface StationWaitingMarker {
  readonly cargo: number;
  readonly units: number;
  /** Age of the oldest waiting parcel of this cargo. [days] */
  readonly oldestDays: number;
}

/**
 * Twelve completed months of one cargo's history at one station, oldest
 * first (SPEC2 M14). Only cargos with any recorded month travel - most
 * stations handle two or three of the eighteen.
 */
export interface StationHistoryMarker {
  readonly cargo: number;
  readonly collected: readonly number[];
  readonly delivered: readonly number[];
  readonly expired: readonly number[];
}

export interface StationMarker {
  readonly id: number;
  readonly name: string;
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  readonly rating: number;
  readonly waiting: number;
  /** Marked as an "Umsteigeknoten" of section 12.3. */
  readonly transferNode: boolean;
  readonly modules: readonly StationModuleMarker[];
  /** The x-ray of SPEC2 M14: the five 10.1 terms, individually quantified. */
  readonly terms: StationTermsMarker;
  /** Waiting cargo per type, ascending cargo id - the panel's table. */
  readonly waitingByCargo: readonly StationWaitingMarker[];
  /** The twelve-month ring, one row per cargo that has any history. */
  readonly history: readonly StationHistoryMarker[];
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

/**
 * One parcel aboard a vehicle, as the M14 detail view's manifest shows it -
 * the paid-up-to point of section 7.4 included, because that marker is what
 * decides what the parcel will earn when it is set down (SPEC2 M14).
 */
export interface VehicleCargoMarker {
  readonly cargo: number;
  readonly units: number;
  readonly originStationId: number;
  /** Station the parcel is trying to reach, or -1 (routeless, section 7.4). */
  readonly destinationStationId: number;
  /** Time in transit so far. [game days] */
  readonly ageDays: number;
  /**
   * Straight-line distance from the paid-up-to point to where the vehicle is
   * now - the distance this leg would be paid for if it unloaded here,
   * computed with the payment formula's own `tileDistance`. [tiles]
   */
  readonly openTiles: number;
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
  /** Index of the order it is currently running, highlighted by the panel. */
  readonly orderIndex: number;
  /** Age since purchase, fractional. [game years] */
  readonly ageYears: number;
  /** Design life; for a train the shortest life in the consist. [years] */
  readonly lifetimeYears: number;
  /** Current reliability, 0..RELIABILITY_MAX (10000 = certain to run). */
  readonly reliability: number;
  /** Breakdowns suffered since purchase (SPEC2 M14). */
  readonly breakdownCount: number;
  /**
   * Yearly upkeep as the books charge it right now: obsolescence doubling and
   * this year's price level included (sections 11.3, 14.2). [cent]
   */
  readonly upkeepPerYearCt: number;
  /** True while a "send to depot" call is outstanding (SPEC2 M14). */
  readonly depotCall: boolean;
  /** What is aboard, with the paid-up-to marker of section 7.4. */
  readonly manifest: readonly VehicleCargoMarker[];
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
  /**
   * Tile that is refusing this train, or -1 - the edge of the M15 waiting
   * graph, on the marker channel because it moves on the fleet cadence and
   * never per tick (E-05).
   *
   * The F3 overlay blinks it beside the train itself: a deadlock is only
   * findable if the CONTESTED track is visible too, and the tile a stuck
   * train stands on is never the tile it is waiting for.
   */
  readonly blockedTile: number;
  /**
   * How late the vehicle left its last takt point, or 0 - the "Verspätung in
   * Spieltagen" of section 12.3, converted to days by the panel. [ticks]
   */
  readonly taktDelayTicks: number;
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
  /** Takt of the line's timetable, 0 when off (section 12.3). [ticks] */
  readonly taktTicks: number;
  /** Start offset of the takt grid. [ticks] */
  readonly taktOffsetTicks: number;
  /**
   * The fleet advisor of section 12.3: vehicles the takt needs
   * (ceil(round / takt), computed sim-side in lines/metrics.ts), or 0 when
   * the takt is off or the round is unmeasurable.
   */
  readonly advisedVehicles: number;
  /** Slack per round at the advised size. [ticks] */
  readonly headroomTicks: number;
  /**
   * Earned against possible for this line's vehicles (SPEC2 M15) - the one
   * figure that separates the quality of the ALIGNMENT from the size of the
   * fleet, because the denominator depends on neither.
   */
  readonly networkValue: NetworkValueMarker;
}

/**
 * One goal as the goal panel and the end screen show it (SPEC2 M17).
 *
 * The IMMUTABLE half of a goal plus the exact reading of it. The moving half
 * also travels in the snapshot's 64-byte goal block, in thousandths, and that
 * is what draws the live bar (D-193's split: what a goal IS never moves and
 * has no business in the 20 Hz stride, E-05/Fehler 37). What cannot be
 * recovered from thousandths is the FIGURE - "1.234.567 EUR of 2.000.000" is
 * not derivable from "617 per mille" - so the exact numbers ride here, on the
 * cadence the goals actually move at: once a game day.
 *
 * Slot order is the store's, so marker `i` and goal block entry `i` are the
 * same goal.
 */
export interface GoalMarker {
  /** A value of `GoalKind`. */
  readonly kind: number;
  /** Cargo, town or -1 for "any", by kind. */
  readonly subjectA: number;
  /** Second town, or the run of days a rating hold needs. -1 where unused. */
  readonly subjectB: number;
  /** The figure to reach: cents, units, inhabitants, rating points or a tick. */
  readonly threshold: number;
  /** What `progress` is measured against - `subjectB` for a rating hold. */
  readonly target: number;
  /** Latest measurement, in `target`'s unit. */
  readonly progress: number;
  /** A value of `GoalStatus`. */
  readonly status: number;
  /** A value of `GoalMedal`; None while the goal is open or failed. */
  readonly medal: number;
  /**
   * The band the goal would fall into if it were completed TODAY, so an open
   * goal can show what it is still playing for. None once the bronze deadline
   * has passed - at which point the goal fails on the next day boundary.
   */
  readonly projectedMedal: number;
  /**
   * Calendar year the threshold names, for the one kind whose threshold IS a
   * tick (`SurviveUntil`); 0 for every other kind.
   */
  readonly thresholdYear: number;
  /** Calendar years of the three bands - the UI has no tick clock (D-191). */
  readonly goldYear: number;
  readonly silverYear: number;
  readonly bronzeYear: number;
  /** Year the goal was achieved in, or 0 while it was not. */
  readonly completedYear: number;
  /** Name of the town `subjectA` names, or '' when it names none. */
  readonly townAName: string;
  /** Name of the town `subjectB` names, or ''. */
  readonly townBName: string;
}

/** One term of the final score, with the figure it was computed from. */
export interface ScoreTermMarker {
  /** 0..1, the share of this term's full mark. */
  readonly share: number;
  readonly points: number;
  /** The measurement itself, in the term's own unit. */
  readonly measured: number;
}

/**
 * The end of the game and what it was worth (SPEC2 M17).
 *
 * Computed in the simulation (`sim/goals/score.ts`) and sent whole, because
 * every one of these numbers is a reading of hashed state and the interface
 * must never own a second definition of it - the same reason the station
 * x-ray's rating terms travel rather than being recomputed (D-179). It also
 * keeps the main bundle free of the simulation (D-191).
 */
export interface GameEndMarker {
  /** A value of `GameEnd`; `Running` means there is no end screen to show. */
  readonly reason: number;
  /** The date this reading was taken on. */
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly goals: ScoreTermMarker;
  readonly value: ScoreTermMarker;
  readonly network: ScoreTermMarker;
  readonly cargo: ScoreTermMarker;
  readonly total: number;
  readonly goalCount: number;
  readonly goalsAchieved: number;
  /** A value of `GoalMedal`: the weakest band any goal earned. */
  readonly medal: number;
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
  /**
   * Write the running world as a `.ironscenario` (SPEC2 M22, bundle 2).
   *
   * The same split as every save (D-111): the worker encodes, the main thread
   * decides where the bytes land. And the same SERIALIZER - `encodeScenario`
   * is `encodeSave` plus the metadata block, so "Szenario-Kompatibilitaet IST
   * Save-Kompatibilitaet" stays a statement about the code rather than about
   * two file layouts kept in step by hand.
   *
   * The briefing travels FROM the interface because that is where an author
   * types it; nothing in the simulation reads it on the way through
   * (`tests/unit/scenarioCoupling.spec.ts` holds that, and the worker never
   * names the block's own vocabulary).
   */
  | { readonly type: 'requestScenario'; readonly meta: ScenarioMeta }
  /** Load a save from bytes the main thread read. */
  | { readonly type: 'loadSave'; readonly bytes: Uint8Array }
  /** Throw the world away and generate a new one with these parameters. */
  | { readonly type: 'newGame'; readonly options: NewGameOptions }
  /**
   * Turn a file into a `.ironreplay` and describe it (SPEC2 M16). The bytes
   * may be a save - that is the "export replay from save" button - or a
   * recording already, which comes back unchanged. The answer is
   * `replayWritten`; the main thread owns the shelf, as with every save
   * (D-111).
   *
   * `play` is the one-click door of the milestone's acceptance sentence: the
   * worker shelves AND enters the recording it just built, so "play this save
   * as a replay" is one message rather than a conversion the player then has
   * to go and find on another screen. It is decided by the CALLER and carried
   * in the message rather than remembered on the main thread, because a
   * pending intent would outlive a conversion that failed and start the next
   * recording somebody shelved.
   */
  | {
      readonly type: 'makeReplay';
      readonly bytes: Uint8Array;
      readonly label: string;
      readonly play: boolean;
    }
  /** The same, for the game the worker is running right now. */
  | { readonly type: 'exportReplay'; readonly label: string }
  /**
   * Enter replay mode: put the running game aside, load the recording and
   * play it. While this is in force the worker refuses commands - a replay
   * the interface can write into is not evidence.
   */
  | { readonly type: 'enterReplay'; readonly bytes: Uint8Array }
  /** Jump the playback to a tick; the ring makes a year boundary exact. */
  | { readonly type: 'replaySeek'; readonly tick: number }
  /** Re-simulate the recording and compare it against its own claims. */
  | { readonly type: 'verifyReplay' }
  /** Leave replay mode and restore the game that was put aside. */
  | { readonly type: 'exitReplay' }
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
  /** The route-cost rules of SPEC.md 8.4 (M15): saved, hashed, off by default. */
  readonly occupancyPenalty: boolean;
  readonly signalPenalty: boolean;
  /** The road half of 8.4: congestion recorded, priced, capped and crossed. */
  readonly roadCongestion: boolean;
  /** The weather rule of SPEC2 M18 (E-01): saved, hashed, off by default. */
  readonly weather: WeatherRule;
  /** The council-election rule of SPEC2 M20 (13.3): saved, hashed, off by default. */
  readonly elections: boolean;
  /** The century rule of SPEC2 M21 (E-09): saved, hashed, off by default. */
  readonly economy: boolean;
  readonly aiCompanies: number;
  /**
   * Open this world as a scenario WORKSHOP rather than as a game (SPEC2 M22).
   *
   * A world rule like every other field here - saved, hashed, migrated - and
   * the only one that is a rule of the workshop rather than of the world,
   * which is exactly why a scenario may not pin it (D-240's `NOT_LOCKABLE`
   * entry). Absent means off, decided in `World`'s own constructor like the
   * two 8.4 rules, so nothing that starts a game has to mention it.
   */
  readonly editorMode?: boolean;
  /**
   * The goals the world is created with (SPEC2 M17), or absent for none.
   *
   * A world rule like every other field here - saved, hashed and fixed at
   * genesis (D-193) - and the one the new-game screen cannot author: goals come
   * from a scenario. This is the door the scenario browser starts one through,
   * which is why a shipped scenario needs no file: it is a seed, a set of rules
   * and a goal list, and all three travel in this message.
   */
  readonly goals?: readonly GoalSpec[];
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
      /**
       * The world's climate (SPEC2 M18). A world constant, fixed at genesis
       * and never changed, and the one input the seasonal optics need that no
       * per-tick block carries: the season is a pure function of (month,
       * height, climate) and the renderer reads it for the snow line without
       * asking the simulation anything (Z1, E-01).
       */
      readonly climate: MapClimate;
      /** Shared tile layers - the renderer reads them in place, never a copy. */
      readonly mapBuffer: SharedArrayBuffer;
      readonly townCount: number;
      readonly industryCount: number;
      readonly towns: readonly TownMarker[];
      readonly industries: readonly IndustryMarker[];
      /**
       * The century curve of SPEC2 M21 (E-09), row major in per mille, or
       * empty in a world whose economy rule is off.
       *
       * It travels with the map and nothing else, because it is the same kind
       * of fact: drawn once at genesis and constant for the life of the world.
       * A per-tick channel for a number that cannot change would be the
       * snapshot-stride growth Fehlerkatalog 37 forbids, and the ledger books
       * M21 at no layout change at all.
       */
      readonly economyCurve: readonly number[];
      /**
       * True when this world is a WORKSHOP rather than a game (SPEC2 M22).
       *
       * Published rather than remembered by whoever opened it: the rule is
       * saved and hashed world state, so a workshop that was saved and loaded
       * again is still a workshop, and an interface that guessed from "I
       * pressed the workshop button" would offer the palette on the wrong
       * world after a load.
       */
      readonly editorMode: boolean;
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
  /**
   * The open tenders of section 14.4, and beside them the two boards of SPEC2
   * M21 - one message, because all three change on the same monthly cadence
   * and one panel shows them.
   */
  | {
      readonly type: 'contractsChanged';
      readonly contracts: readonly ContractMarker[];
      readonly supply: readonly SupplyMarker[];
      readonly subsidies: readonly SubsidyMarker[];
    }
  /** The books, sent when the game month rolls over. */
  | { readonly type: 'financesChanged'; readonly report: FinanceReport }
  /** The news log, sent whenever something was posted to it. */
  | { readonly type: 'newsChanged'; readonly news: readonly NewsMarker[] }
  /** Fleet overview for the vehicle list; sent when it changes, not per tick. */
  | { readonly type: 'fleetChanged'; readonly vehicles: readonly VehicleMarker[] }
  /** The PLAYER's lines, on the same cadence as the fleet (section 12.2). */
  | { readonly type: 'linesChanged'; readonly lines: readonly LineMarker[] }
  /**
   * The goals and where the game stands (SPEC2 M17), sent once a game day -
   * the cadence the daily hook decides them on, and therefore the fastest
   * cadence at which any of it can change.
   */
  | {
      readonly type: 'goalsChanged';
      readonly goals: readonly GoalMarker[];
      readonly end: GameEndMarker;
    }
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
   * A scenario the worker encoded. Bytes only: the interface asked for it and
   * already holds the briefing, so sending the metadata back would be the
   * worker handing over something it was told (D-111's split, kept narrow).
   */
  | { readonly type: 'scenarioWritten'; readonly bytes: Uint8Array }
  /** A scenario that could not be written, named by a translation key. */
  | { readonly type: 'scenarioFailed'; readonly reasonKey: string; readonly detail: string }
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
    }
  /**
   * A `.ironreplay` the worker built or read, with everything the browser
   * lists it by. The bytes travel back so the main thread can shelve them
   * without a second round trip - the same split as `saveWritten` (D-111).
   */
  | {
      readonly type: 'replayWritten';
      readonly bytes: Uint8Array;
      readonly meta: ReplayMeta;
      readonly label: string;
    }
  /** Replay mode is now in force, with the recording it is playing. */
  | { readonly type: 'replayStarted'; readonly meta: ReplayMeta }
  /** Replay mode is over; the game that was put aside is running again. */
  | { readonly type: 'replayEnded' }
  /** What "Replay prüfen" found - a verdict, and where it diverged. */
  | { readonly type: 'replayVerified'; readonly result: ReplayVerification }
  /**
   * A replay operation that could not be carried out, named by a translation
   * key: a file that is not a recording, or one this build must not judge.
   */
  | { readonly type: 'replayFailed'; readonly reasonKey: string; readonly detail: string };
