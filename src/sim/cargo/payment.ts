import { cargoSpec, type Cargo } from './types';
import {
  END_YEAR,
  FAST_DELIVERY_BONUS,
  INFLATION_PER_YEAR,
  NO_COOLING_PENALTY,
  START_YEAR,
  TICKS_PER_DAY,
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

export interface PaymentInput {
  readonly cargo: Cargo;
  readonly amount: number;
  /** Tiles covered since the last point that was already paid for. */
  readonly distanceTiles: number;
  /** Ticks between production and unloading. */
  readonly ticksInTransit: number;
  readonly hasCooling: boolean;
  readonly year: number;
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
      (input.distanceTiles / 100) *
      timeFactor(input.cargo, days) *
      cooling *
      epochFactor(input.year),
  );
}
