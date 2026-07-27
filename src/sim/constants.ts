/**
 * Every magic number of the simulation lives here, annotated with its unit and
 * where it comes from. Nothing outside this file may hard-code a game constant.
 */

// ---------------------------------------------------------------- world scale

/** Edge length of one map tile. [m] */
export const TILE_SIZE_M = 50;

/** Vertical distance between two height levels. [m] */
export const HEIGHT_STEP_M = 8;

/** Number of distinct terrain height levels (0..15). */
export const HEIGHT_LEVELS = 16;

// ------------------------------------------------------------ simulation clock

/** Fixed simulation frequency. [Hz] */
export const TICK_HZ = 20;

/** Duration of one simulation tick in wall-clock milliseconds. [ms] */
export const TICK_MS = 1000 / TICK_HZ;

/** Duration of one simulation tick in seconds - the `dt` of all physics. [s] */
export const TICK_SECONDS = 1 / TICK_HZ;

/** One game day equals 10 s of real time at speed 1x. [ticks] */
export const TICKS_PER_DAY = 200;

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH; // 6_000
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR; // 72_000

/** First playable year. */
export const START_YEAR = 1950;

/** Last playable year (inclusive). */
export const END_YEAR = 2050;

/**
 * Highest tick the calendar can reach. 101 playable years fit into an Int32
 * with three orders of magnitude to spare, so `tick` stays a plain Int32
 * everywhere (snapshot buffer, save file, hash).
 */
export const MAX_TICK = (END_YEAR - START_YEAR + 1) * TICKS_PER_YEAR; // 7_272_000

/**
 * ---------------------------------------------------------------------------
 * TIME DECOUPLING - read this before touching anything time related.
 * ---------------------------------------------------------------------------
 * Vehicle motion and the calendar run on two different clocks, on purpose:
 *
 *  - TICK TIME (real time) drives vehicle physics, loading, signal reservations.
 *    A train at 160 km/h covers 44.4 m per real second, i.e. 2.22 m per tick.
 *  - GAME TIME (calendar) drives dates, vehicle age, industry production, town
 *    growth, financial reports, loan interest and cargo decay.
 *
 * Worked example, kept here because it is the number that makes the whole
 * economy intuitive:
 *   A 60 tile run is 60 * 50 m = 3_000 m.
 *   At 44.4 m/s that is 67.6 s of real time = 1_352 ticks = 6.8 game days.
 * That is why decay grace periods are measured in days rather than hours, and
 * why a 500 tile line is almost always economically worse than an 80 tile one.
 *
 * Moving vehicles on the calendar clock makes a train cross the map in a single
 * frame. Running the calendar on the tick clock makes a game year take eight
 * hours. Both are wrong.
 */

/** Selectable simulation speeds; index 0 is pause. [ticks per real second / TICK_HZ] */
export const SPEED_FACTORS = [0, 1, 2, 5, 20] as const;

/** Index into {@link SPEED_FACTORS} used when a fresh game starts. */
export const DEFAULT_SPEED_INDEX = 1;

/**
 * Hard ceiling on ticks executed inside one scheduler wake-up. Protects against
 * a spiral of death when the host stalls (tab throttling, breakpoint, swap).
 */
export const MAX_TICKS_PER_FRAME = 40;

/**
 * How often the world state hash is refreshed for the debug overlay. Hashing
 * touches the whole state, so it runs once per game day rather than per tick.
 */
export const STATE_HASH_INTERVAL_TICKS = TICKS_PER_DAY;

// ------------------------------------------------------------------- money

/** All monetary amounts are integer cents (law #5). */
export const CENTS_PER_EURO = 100;

export const Difficulty = {
  Easy: 0,
  Normal: 1,
  Hard: 2,
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Starting capital per difficulty. [cent] */
export const START_CAPITAL_CT: readonly number[] = [
  800_000 * CENTS_PER_EURO,
  500_000 * CENTS_PER_EURO,
  250_000 * CENTS_PER_EURO,
];

// -------------------------------------------------------------------- loans

/** Credit line floor - available even to a company with no profit and no assets. [cent] */
export const LOAN_MIN_LIMIT_CT = 300_000 * CENTS_PER_EURO;

/** Absolute credit ceiling regardless of company size. [cent] */
export const LOAN_MAX_LIMIT_CT = 30_000_000 * CENTS_PER_EURO;

/** Loans are granted in 10_000 EUR steps so the UI stays readable. [cent] */
export const LOAN_STEP_CT = 10_000 * CENTS_PER_EURO;

/** Credit line grows with 2.5x the annual profit ... */
export const LOAN_LIMIT_PROFIT_FACTOR = 2.5;

/** ... plus 0.3x the book value of the fixed assets. */
export const LOAN_LIMIT_ASSET_FACTOR = 0.3;

/** Nominal annual interest rate per difficulty, booked monthly. [1/year] */
export const LOAN_INTEREST_RATE_PER_YEAR: readonly number[] = [0.04, 0.04, 0.065];

// ------------------------------------------------------------------ company

/** Number of selectable company colours (Okabe-Ito palette, colour-blind safe). */
export const COMPANY_COLOR_COUNT = 8;

/** Upper bound for a player supplied company name. [UTF-16 code units] */
export const MAX_COMPANY_NAME_LENGTH = 40;

// ----------------------------------------------------------------- fixed point

/** Fractional bits of the Q16.16 fixed point format used by the trig tables. */
export const FIXED_POINT_BITS = 16;

/** 1.0 expressed in Q16.16. */
export const FIXED_POINT_ONE = 1 << FIXED_POINT_BITS; // 65_536

/** Entries of the sine lookup table (one full turn). Must stay a power of two. */
export const TRIG_TABLE_SIZE = 4096;
