import type { Difficulty, MapClimate } from './constants';

/** The four 32 bit words of the xoshiro128** generator, as unsigned integers. */
export type RngState = readonly [number, number, number, number];

/**
 * Financial and identity state of one company. Every amount is an integer
 * number of cents (architecture law #5).
 */
export interface CompanyState {
  /** Player supplied display name. Never a translation key. */
  name: string;
  /** Index into the colour-blind safe company palette. */
  colorIndex: number;
  /** Liquid funds. May go negative, which starts the bankruptcy countdown. [cent] */
  cashCt: number;
  /** Outstanding loan principal, always a multiple of LOAN_STEP_CT. [cent] */
  loanCt: number;
  /** Profit accumulated since the start of the current game year. [cent] */
  profitThisYearCt: number;
  /** Profit of the last completed game year - input to the credit line. [cent] */
  lastYearProfitCt: number;
  /** Book value of owned infrastructure and vehicles - input to the credit line. [cent] */
  fixedAssetsCt: number;
  /** Revenue booked since the start of the current game month. [cent] */
  revenueThisMonthCt: number;
  /** Expenses booked since the start of the current game month. [cent] */
  expensesThisMonthCt: number;
  /**
   * Yearly upkeep, kept apart so section 14.1 can show the two accounts it
   * asks for. [cent]
   *
   * The infrastructure half is maintained by the build commands, because a
   * station costs the same the day it is built and the day it is demolished.
   * The FLEET half is recomputed from the vehicles once a year instead: a
   * vehicle's upkeep doubles when it passes its design life (11.3), and that
   * happens with age rather than with a command, so a running total would have
   * to be corrected from the yearly hook and any drift would be invisible.
   */
  vehicleUpkeepPerYearCt: number;
  infrastructureUpkeepPerYearCt: number;

  /**
   * The accounts of section 14.1 for the month in progress, indexed by
   * `Account`. [cent]
   */
  accounts: number[];
  /** The same, accumulated over the year so far, and over the last one. */
  yearAccounts: number[];
  lastYearAccounts: number[];
  /**
   * Twenty-four months of accounts as a flat ring, row major, oldest slot
   * pointed at by `historyCursor`. Read through `monthsInOrder`.
   */
  monthHistory: number[];
  historyCursor: number;
  /** Company value at the end of each of the last game years, oldest first. */
  valueHistory: number[];
  /**
   * Depreciation charged against the fleet so far. Book value is
   * `fixedAssetsCt - accumulatedDepreciationCt`. [cent]
   */
  accumulatedDepreciationCt: number;
  /**
   * Consecutive months closed with a negative balance (section 14.2).
   *
   * Three of them is a warning, twelve is the end of the game. It counts
   * MONTHS and not ticks because that is what the rule says and because a
   * company that dips below zero for an afternoon has not failed.
   */
  monthsInDebt: number;
  /** True once the company has been wound up. The game is over. */
  bankrupt: boolean;
  /**
   * Replace vehicles automatically as they near the end of their design life
   * (section 11.3).
   *
   * A company-wide switch rather than the per-line one the spec asks for,
   * because lines are section 12.2 and do not exist yet (D-093).
   */
  autoRenew: boolean;
}

/** Calendar position derived from a tick count. */
export interface GameDate {
  /** Calendar year, START_YEAR based. */
  year: number;
  /** Month of the year, 0..11. */
  month: number;
  /** Day of the month, 0..29. */
  day: number;
}

/** Everything needed to create a fresh, reproducible world. */
export interface NewGameParams {
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly climate: MapClimate;
  /** Map edge length in tiles, one of MAP_SIZES. */
  readonly mapSize: number;
  readonly companyName: string;
  readonly companyColorIndex: number;
  /**
   * Whether prices and costs drift upward over the century (section 14.2).
   *
   * Fixed when the game is started rather than being a preference that can be
   * flipped mid-game. It changes what every command costs, so two worlds with
   * the same seed and the same commands but different settings diverge - which
   * makes it saved state and part of the hash, and makes a mid-game toggle
   * something that would have to be a COMMAND rather than a checkbox
   * (DECISIONS.md D-092).
   */
  readonly inflation?: boolean;
}
