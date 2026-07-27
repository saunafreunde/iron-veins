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
}
