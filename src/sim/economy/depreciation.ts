import { bookMonthlyDepreciation } from './company';
import { aggregateConsist } from '../vehicles/consist';
import { vehicleSpec } from '../vehicles/catalog';
import { vehicleLifetimeYears } from '../vehicles/lifecycle';
import type { World } from '../World';

/**
 * Straight-line depreciation over the design life (section 14.1).
 *
 * Only the FLEET is written down. Track, roads and stations have no lifetime in
 * the catalogue and no wear model in the simulation - a station is worth what it
 * would cost to build for as long as it stands - so writing them down would be
 * inventing an accounting rule the game does not otherwise have (D-090).
 *
 * The charge is recomputed from the fleet each month rather than carried as a
 * running figure, for the same reason the fleet's upkeep is: it changes when a
 * vehicle is bought, sold or replaced, and a cached total would drift.
 */
export function fleetDepreciationCtPerYear(world: World): number {
  const vehicles = world.vehicles;
  let total = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const units = vehicles.consist[id]!;
    const priceCt =
      units.length > 0
        ? aggregateConsist(units).priceCt
        : vehicleSpec(vehicles.specId[id]!).priceCt;

    const life = vehicleLifetimeYears(world, id);
    if (life > 0) total += priceCt / life;
  }
  return total;
}

/** Charge this month's depreciation. Called from the monthly hook. */
export function bookDepreciation(world: World): number {
  return bookMonthlyDepreciation(world.company, fleetDepreciationCtPerYear(world));
}
