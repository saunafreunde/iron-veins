import { inflatedYearsBetween } from '../cargo/payment';
import { cargoSpec, type Cargo } from '../cargo/types';
import { PAYMENT_DISTANCE_TILES, TICKS_PER_YEAR, TICK_HZ, TILE_SIZE_M } from '../constants';
import type { World } from '../World';

/**
 * The network value of SPEC2 M15: what a line or a company EARNED, divided by
 * what the vehicles it owns could have earned at all.
 *
 * SPEC.md section 1 promises that a smooth, well signalled alignment with
 * sensible passing loops carries four times what a slapdash one does, and that
 * the player must be able to SEE it and MEASURE it in the books. A profit
 * figure cannot say that: it mixes the quality of the network with the size of
 * the fleet and the price of the vehicles. A share of the ceiling can, because
 * the ceiling depends only on what a vehicle carries and how fast it goes -
 * never on how the track was laid. Two identical fleets on two alignments
 * therefore have the same denominator, and the whole difference between them
 * lands in the numerator.
 *
 * The ceiling is D-066's closed form, which existed only inside
 * `tests/balance/tariff.spec.ts` until this milestone needed the same number
 * on screen. It lives here now and the test imports it: a second copy would be
 * a second definition of what a tariff means, and the one in the test is the
 * one the freight rates were calibrated against.
 */

/**
 * Seconds of real time in one game year, divided by the tiles a cargo rate is
 * quoted over. [tile-seconds per year per metre per second]
 *
 * The payment formula is `amount x rate x distance / PAYMENT_DISTANCE_TILES`,
 * and the distance a vehicle covers in a year is
 * `speed x seconds per year / metres per tile`. The line length cancels: a
 * vehicle's ceiling does NOT depend on how long its line is.
 */
export const REVENUE_CEILING_FACTOR =
  TICKS_PER_YEAR / TICK_HZ / TILE_SIZE_M / PAYMENT_DISTANCE_TILES;

/**
 * What a vehicle of this capacity, cargo and speed can earn in a game year at
 * the first year's price level, in closed form. [cent/year]
 *
 * It is a CEILING and deliberately an unreachable one: it assumes no loading
 * time, a full load every trip and a full load in BOTH directions. A real line
 * reaches a fraction of it, and which fraction is exactly the number SPEC.md
 * section 1 wants the player to be able to read.
 */
export function ceilingRevenueCtPerYear(
  capacityUnits: number,
  cargo: Cargo,
  maxSpeedMs: number,
): number {
  if (capacityUnits <= 0 || maxSpeedMs <= 0) return 0;
  return capacityUnits * cargoSpec(cargo).baseRateCt * maxSpeedMs * REVENUE_CEILING_FACTOR;
}

/** Earned against possible, over the same window and the same price levels. */
export interface NetworkValue {
  /** Revenue the vehicles actually booked over their lives. [cent] */
  readonly earnedCt: number;
  /** What that same fleet could have earned over the same lives. [cent] */
  readonly ceilingCt: number;
  /**
   * `earnedCt / ceilingCt`, or 0 while nothing has had the chance to earn -
   * a fleet bought this tick has a ceiling of zero and a share of zero rather
   * than an infinity.
   */
  readonly share: number;
}

const NOTHING: NetworkValue = { earnedCt: 0, ceilingCt: 0, share: 0 };

/**
 * The ceiling one vehicle has had since it was built. [cent]
 *
 * Its capacity and top speed are the CACHED AGGREGATES of the store, so a
 * ten-wagon train is measured as ten wagons rather than as its locomotive
 * (the M3 rule), and a refit changes the ceiling the moment it changes what
 * the vehicle carries. The years are price-level weighted, because the
 * earnings it is about to be divided into carry `epochFactor` too.
 */
export function vehicleCeilingCt(world: World, id: number): number {
  const vehicles = world.vehicles;
  const perYear = ceilingRevenueCtPerYear(
    vehicles.capacityUnits[id]!,
    vehicles.refitCargo[id]! as Cargo,
    vehicles.maxSpeedMs[id]!,
  );
  if (perYear <= 0) return 0;
  return perYear * inflatedYearsBetween(vehicles.builtTick[id]!, world.tick);
}

/** Network value of a set of vehicles, ids assumed alive. */
export function networkValueOf(world: World, vehicleIds: readonly number[]): NetworkValue {
  let earnedCt = 0;
  let ceilingCt = 0;
  for (const id of vehicleIds) {
    earnedCt += world.vehicles.earnedCt[id]!;
    ceilingCt += vehicleCeilingCt(world, id);
  }
  if (ceilingCt <= 0) return NOTHING;
  return { earnedCt, ceilingCt, share: earnedCt / ceilingCt };
}

/**
 * Network value of everything a company owns - including what is parked in a
 * shed, which is the point: a vehicle that earns nothing while its ceiling
 * runs on is exactly what a network with too much fleet and too little line
 * looks like.
 */
export function companyNetworkValue(world: World, companyId: number): NetworkValue {
  const vehicles = world.vehicles;
  let earnedCt = 0;
  let ceilingCt = 0;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== companyId) continue;
    earnedCt += vehicles.earnedCt[id]!;
    ceilingCt += vehicleCeilingCt(world, id);
  }
  if (ceilingCt <= 0) return NOTHING;
  return { earnedCt, ceilingCt, share: earnedCt / ceilingCt };
}
