/**
 * The AI competitors of section 15.
 *
 * The one rule that shapes everything here: the AI is NOT a cheat. It runs on
 * the same prices, the same credit limit and the same commands the player uses,
 * and it issues those commands through the ordinary queue - so every AI build
 * is in the replay log, is charged to its own books, and is refused for exactly
 * the reasons a player's would be. What the difficulty levels buy is a better
 * evaluation function, never a discount.
 */

/**
 * The five personalities of section 15. They exist so that competitors are
 * distinguishable, which they are not if they all optimise the same number.
 */
export const Personality = {
  /** Rail first, long hauls, heavy cargo. */
  Rail: 0,
  /** Lorries and buses, short hauls, cheap to start. */
  Road: 1,
  /** Borrows to the limit and builds while it can. */
  Expansive: 2,
  /** Builds from cash, keeps a reserve, never near the credit line. */
  Conservative: 3,
  /** Passengers and mail between towns rather than industrial chains. */
  TownNetwork: 4,
} as const;
export type Personality = (typeof Personality)[keyof typeof Personality];

export const PERSONALITY_COUNT = 5;

/** Translation keys, indexed by Personality. */
export const PERSONALITY_KEYS: readonly string[] = [
  'ai.personality.rail',
  'ai.personality.road',
  'ai.personality.expansive',
  'ai.personality.conservative',
  'ai.personality.townNetwork',
];

/**
 * The AI's judgement memory about ONE real line (E-06): when the line was
 * last reviewed and what its vehicles had earned by then.
 *
 * Since M11 a competitor's line IS the Line entity of section 12.2 - the AI
 * keeps no line list of its own any more. What it does keep is this baseline,
 * because section 15 step 3 judges a line on what it earned SINCE the last
 * look, and "since" is a historical input no store can recompute - so it is
 * save state (Z4). The line itself is addressed by id, never held (law #9);
 * everything else the review needs - the vehicles, their specs, the stops -
 * is read back out of the stores when the review runs (the M6 rule).
 */
export interface AiLineReview {
  readonly lineId: number;
  reviewTick: number;
  earnedAtReviewCt: number;
}

/**
 * A line being built, or an extra vehicle being added to one.
 *
 * It exists because the AI cannot know what a command will produce - which
 * station id, which vehicle id - while the command is still in the queue. Each
 * stage therefore OBSERVES what the previous one left behind.
 */
export interface AiProject {
  /**
   * 1: infrastructure ordered. 2: vehicles ordered, waiting in the depot.
   * 3: line opened, waiting to be observed so it can be crewed.
   */
  stage: number;
  /** Stop tiles, for a new line. */
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly depotX: number;
  readonly depotY: number;
  readonly rail: boolean;
  readonly cargo: number;
  readonly specIds: readonly number[];
  readonly startedTick: number;
  /**
   * Most trains the railway that was ACTUALLY laid can carry: the one-way
   * oval takes AI_RAIL_MAX_TRAINS, the single-track fallback exactly one
   * (D-059: two trains on single track deadlock nose to nose). Which shape
   * got built cannot be recomputed from the map once the tracks are down,
   * and the buying stage runs a cycle later - a historical input to a sim
   * decision, so it is save state (Z4). 1 for road projects and for every
   * project migrated from a save older than this field, because the old AI
   * only ever laid single track.
   */
  readonly railTrains: number;
  /**
   * The REAL line being reinforced (a Line entity id) when this is a
   * reinforcement rather than a new build, or -1. A reinforcement already has
   * its line, so it skips straight to crewing whatever comes out of the depot.
   */
  readonly lineId: number;
}

/** Everything one AI company remembers between decisions. */
export interface AiState {
  readonly companyId: number;
  readonly personality: number;
  /**
   * When it next thinks. Staggered at creation so no two competitors ever
   * compute in the same tick - section 15 asks for that, and it is also what
   * keeps the worst tick of a five-company game from being five times the cost
   * of a one-company game.
   */
  nextDecisionTick: number;
  /**
   * Review baselines, one per line this company runs, in the order the lines
   * were opened. The lines themselves live in `world.lines` like everybody
   * else's (E-06).
   */
  reviews: AiLineReview[];
  /** The line currently being built, or null. */
  project: AiProject | null;
  /**
   * Ticks the last build attempt was made. A company whose project was refused
   * waits before trying again rather than hammering the same impossible pair
   * every cycle.
   */
  lastBuildTick: number;
}
