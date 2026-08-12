import { cargoSpec, type Cargo } from './types';
import {
  END_YEAR,
  FAST_DELIVERY_BONUS,
  INFLATION_PER_YEAR,
  NO_COOLING_PENALTY,
  PAYMENT_DISTANCE_TILES,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  TIME_FACTOR_MIN,
} from '../constants';

/**
 * The payment formula of section 7.5.
 *
 * This is the single most load-bearing formula in the game: it decides whether
 * a line is worth building, whether speed is worth paying for and whether the
 * whole economy is fun. It is therefore pinned by an exact test case rather
 * than by judgement.
 */

/**
 * Inflation factor per year, precomputed by repeated multiplication.
 *
 * Math.pow is not bit-exact across engines (architecture law #4), and this value
 * ends up in every payment, so a table built with the four basic operations is
 * the only safe way to get it.
 */
const EPOCH_FACTORS: Float64Array = (() => {
  const years = END_YEAR - START_YEAR + 1;
  const table = new Float64Array(years);
  let factor = 1;
  for (let i = 0; i < years; i++) {
    table[i] = factor;
    factor *= 1 + INFLATION_PER_YEAR;
  }
  return table;
})();

/** Price level of a calendar year, 1.0 in the first playable year. */
export function epochFactor(year: number): number {
  const index = year - START_YEAR;
  if (index <= 0) return 1;
  const last = EPOCH_FACTORS.length - 1;
  return EPOCH_FACTORS[index > last ? last : index]!;
}

/**
 * Running sum of {@link EPOCH_FACTORS}: entry `i` is the price level summed
 * over the first `i` game years. It turns "how much price level lies between
 * two ticks" into two lookups instead of a loop over a century.
 */
const EPOCH_PREFIX: Float64Array = (() => {
  const table = new Float64Array(EPOCH_FACTORS.length + 1);
  for (let i = 0; i < EPOCH_FACTORS.length; i++) table[i + 1] = table[i]! + EPOCH_FACTORS[i]!;
  return table;
})();

/** Price level integrated from the first playable year to `years` after it. */
function inflatedYearsAt(years: number): number {
  if (years <= 0) return 0;
  const last = EPOCH_FACTORS.length - 1;
  const whole = years | 0;
  // Past the end of the table the price level is flat, exactly as
  // `epochFactor` clamps it - so the integral continues linearly.
  if (whole >= last) return EPOCH_PREFIX[last]! + (years - last) * EPOCH_FACTORS[last]!;
  return EPOCH_PREFIX[whole]! + (years - whole) * EPOCH_FACTORS[whole]!;
}

/**
 * Game years between two ticks, each weighted by the price level of the year
 * it fell in. [years at the first year's prices]
 *
 * Revenue carries `epochFactor` (section 14.2), so a sum of earnings is a sum
 * of DIFFERENT price levels. Anything that compares such a sum against a rate
 * - the closed-form revenue ceiling of D-066, which SPEC2 M15 divides earnings
 * by - has to quote the rate over the same price levels, or a company would
 * read as improving simply because the century wore on. This is that
 * conversion, and it is here rather than beside the ceiling because the price
 * level has exactly one definition and it is `EPOCH_FACTORS`.
 */
export function inflatedYearsBetween(fromTick: number, toTick: number): number {
  return inflatedYearsAt(toTick / TICKS_PER_YEAR) - inflatedYearsAt(fromTick / TICKS_PER_YEAR);
}

/**
 * How much of the full price a delivery still earns after `days` in transit.
 *
 * Arriving inside half the grace period pays a premium - that is what makes a
 * faster vehicle worth its price rather than mere decoration.
 */
export function timeFactor(cargo: Cargo, days: number): number {
  const spec = cargoSpec(cargo);
  if (days <= spec.graceDays * 0.5) return FAST_DELIVERY_BONUS;

  const late = days - spec.graceDays;
  if (late <= 0) return 1;

  const factor = 1 - late * spec.decayPerDay;
  return factor < TIME_FACTOR_MIN ? TIME_FACTOR_MIN : factor;
}

/** Straight line distance between two tiles. [tiles] */
export function tileDistance(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Price level to charge a COST at, in a world where inflation may be off.
 *
 * Section 14.2 applies inflation to revenue and costs alike. Revenue gets it
 * through `epochFactor` inside the payment formula; everything the company buys
 * or maintains goes through this instead, so that turning inflation off turns
 * it off on both sides at once rather than leaving costs frozen while fares
 * climb.
 */
export function costFactor(year: number, inflation: boolean): number {
  return inflation ? epochFactor(year) : 1;
}

/** A cost at this year's price level, in whole cents. */
export function inflatedCostCt(baseCt: number, year: number, inflation: boolean): number {
  return Math.round(baseCt * costFactor(year, inflation));
}

export interface PaymentInput {
  readonly cargo: Cargo;
  readonly amount: number;
  /** Tiles covered since the last point that was already paid for. */
  readonly distanceTiles: number;
  /** Ticks between production and unloading. */
  readonly ticksInTransit: number;
  readonly hasCooling: boolean;
  readonly year: number;
  /**
   * What the century of SPEC2 M21 (E-09) says this cargo is worth this year,
   * or 1 - which is what a world without the economy rule always passes.
   *
   * The tariff seam E-09 names, and it is a NUMBER handed in rather than a
   * world looked up, for the reason `timeFactor` takes days instead of ticks:
   * this file is the payment formula and knows nothing about worlds, which is
   * what lets `tests/balance/tariff.spec.ts` price the whole catalogue without
   * building one.
   */
  readonly rateFactor?: number;
}

/**
 * Gross revenue of one delivery, in whole cents.
 *
 * Payment is per leg: the distance is measured from the last point that has
 * already been paid, so a feeder lorry, a train and a ship on the same journey
 * together earn exactly what one direct vehicle would have earned - no double
 * payment, and no penalty for transhipping.
 */
export function deliveryRevenueCt(input: PaymentInput): number {
  const spec = cargoSpec(input.cargo);
  const days = input.ticksInTransit / TICKS_PER_DAY;
  const cooling = spec.needsCooling && !input.hasCooling ? NO_COOLING_PENALTY : 1;

  return Math.round(
    input.amount *
      spec.baseRateCt *
      (input.distanceTiles / PAYMENT_DISTANCE_TILES) *
      timeFactor(input.cargo, days) *
      cooling *
      epochFactor(input.year) *
      (input.rateFactor ?? 1),
  );
}
