/**
 * The goal machine of SPEC2 M17: what a scenario asks the player to do, and
 * what the simulation decides about it.
 *
 * The predicate VOCABULARY is the tutorial's (D-113) - a goal is a sentence
 * plus a predicate over state that already exists, and nothing here invents a
 * new signal. What is deliberately NOT the tutorial's is WHERE the predicate
 * runs: the tutorial watches from the interface and may never write, while a
 * goal is evaluated in the simulation's own daily hook and its verdict is
 * saved and hashed state.
 *
 * That departure is the whole point of the milestone and is written up in
 * DECISIONS.md D-193. A medal decided in the interface would be a medal no
 * replay could reproduce and no scenario could certify: the store would have
 * to be read at exactly the right frame, on a machine whose panel happened to
 * be open, and two players watching the same recording could disagree about
 * who won. Evaluated sim-side, "the goal fired at tick T with a silver medal"
 * is part of the world digest, so it survives a save, replays bit-identically
 * and is provable with M16's verifier.
 *
 * A goal never WRITES anything but its own verdict, so architecture law #6 is
 * untouched: the daily hook is a legitimate state author (the E-10 argument
 * for town growth), it mutates no company, station or vehicle, and no player
 * command is involved in reaching a verdict.
 */

/**
 * What a goal measures. The six descriptors of SPEC2 M17, each one a predicate
 * the tutorial already expressed over the interface's copy of the same state.
 */
export const GoalKind = {
  /** Company value at or above `threshold` cents (section 14.1's own figure). */
  CompanyValueBy: 0,
  /**
   * Units delivered to their destination since the company was founded.
   * `subjectA` names the cargo, or -1 for every cargo together.
   */
  CargoDeliveredTotal: 1,
  /**
   * A town at or above `threshold` inhabitants. `subjectA` names the town, or
   * -1 for "any town on the map" - which is the only form a goal authored
   * against a GENERATED map can take.
   */
  TownPopulationReach: 2,
  /**
   * A station of the player's in town `subjectA` from which the connection
   * table of section 7.4 reaches a station of the player's in town `subjectB`.
   *
   * The subjects are TOWNS although the goal is about stations, and that is
   * forced rather than chosen: a scenario is authored before a single station
   * exists, so a station id would be a reference to something the author
   * cannot name. Towns are placed at world genesis and keep their ids.
   */
  ConnectStations: 3,
  /**
   * A station rating of at least `threshold` held for `subjectB` consecutive
   * days. `subjectA` names the town whose stations count, or -1 for every
   * station the player owns.
   */
  StationRatingHold: 4,
  /** Still solvent at tick `threshold`; bankruptcy before it fails the goal. */
  SurviveUntil: 5,
} as const;
export type GoalKind = (typeof GoalKind)[keyof typeof GoalKind];

export const GOAL_KIND_COUNT = 6;

/** Where a goal stands. Achieved and Failed are final - neither is revisited. */
export const GoalStatus = {
  Open: 0,
  Achieved: 1,
  Failed: 2,
} as const;
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

export const GOAL_STATUS_COUNT = 3;

/**
 * The band a completion date fell into. `None` is what an open or a failed
 * goal carries; every achievement earns at least bronze, because the bronze
 * tick IS the deadline past which the goal fails instead.
 */
export const GoalMedal = {
  None: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
} as const;
export type GoalMedal = (typeof GoalMedal)[keyof typeof GoalMedal];

export const GOAL_MEDAL_COUNT = 4;

/**
 * One goal as an author states it - the immutable half of a goal, fixed when
 * the world is created and never touched again.
 *
 * The three band ticks are WORLD state rather than scenario metadata, and the
 * asymmetry is deliberate: SPEC2's `.ironscenario` metadata block is
 * deliberately UNHASHED (Fehler 35), so a medal decided from it would be a
 * medal a briefing typo could change. The briefing may DESCRIBE the bands; the
 * descriptor here is what decides them.
 */
export interface GoalSpec {
  readonly kind: GoalKind;
  /** Cargo, town or "any", by kind. -1 where the kind names no subject. */
  readonly subjectA: number;
  /** Second town, or the required run of days. -1 where the kind has none. */
  readonly subjectB: number;
  /** The figure to reach: cents, units, inhabitants, rating points or a tick. */
  readonly threshold: number;
  /** Completed at or before this tick: gold. [ticks] */
  readonly goldTick: number;
  /** ... at or before this: silver. [ticks] */
  readonly silverTick: number;
  /** ... at or before this: bronze. Past it the goal FAILS. [ticks] */
  readonly bronzeTick: number;
}

/** A goal as it travels in a save: the author's half plus the verdict. */
export interface GoalSave extends GoalSpec {
  /** Latest measurement, in the threshold's own unit. */
  progress: number;
  /** Consecutive days the hold condition has held (StationRatingHold only). */
  holdDays: number;
  status: GoalStatus;
  medal: GoalMedal;
  /** Tick the goal was achieved at, or -1 while it was not. */
  completedTick: number;
}

/** Every goal decided, and at least one of them achieved. */
export const GoalOutcome = {
  /** At least one goal is still open. */
  Open: 0,
  /** Every goal was achieved. */
  Won: 1,
  /** Every goal is decided and at least one of them failed. */
  Lost: 2,
} as const;
export type GoalOutcome = (typeof GoalOutcome)[keyof typeof GoalOutcome];
