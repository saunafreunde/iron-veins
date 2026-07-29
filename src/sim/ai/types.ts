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

/** One line an AI has built and is running. */
export interface AiLine {
  /** Station at each end. */
  readonly fromStationId: number;
  readonly toStationId: number;
  /** Tile of the depot its vehicles were bought at. */
  readonly depotTile: number;
  /** True for a railway, false for a road line. */
  readonly rail: boolean;
  /** Catalogue ids the vehicles on it were built from. */
  readonly specIds: readonly number[];
  /** What it carries. A value of Cargo. */
  readonly cargo: number;
  readonly builtTick: number;
  /** Vehicles running on it. Grows when the line is reinforced. */
  vehicleIds: number[];
  /**
   * When the line was last judged, and what its vehicles had earned by then.
   *
   * Section 15 step 3 asks for unprofitable lines to be closed, and a line
   * cannot be judged on a total: it has to be judged on what it earned SINCE
   * the last look. A source that dries up leaves vehicles waiting for a full
   * load that never comes, and without this the company pays their upkeep
   * until it is wound up - which is exactly what the first run of the
   * twenty-five year game did.
   */
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
  /** 1: infrastructure ordered. 2: vehicles ordered, waiting in the depot. */
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
   * Index into `AiState.lines` when this is a reinforcement rather than a new
   * line, or -1. A reinforcement already knows its stations, so it skips
   * straight to crewing whatever comes out of the depot.
   */
  readonly lineIndex: number;
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
  lines: AiLine[];
  /** The line currently being built, or null. */
  project: AiProject | null;
  /**
   * Ticks the last build attempt was made. A company whose project was refused
   * waits before trying again rather than hammering the same impossible pair
   * every cycle.
   */
  lastBuildTick: number;
}
