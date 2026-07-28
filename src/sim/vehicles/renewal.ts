import { AUTO_RENEW_LIFE_SHARE } from '../constants';
import { aggregateConsist } from './consist';
import { capacityFor, hasVehicleSpec, vehicleSpec, VEHICLE_SPECS } from './catalog';
import { RAIL_SPECS } from './railCatalog';
import { vehicleAgeYears, vehicleLifetimeYears } from './lifecycle';
import { RailRole } from './spec';
import type { Cargo } from '../cargo/types';
import type { VehicleSpec } from './spec';
import { buyRoadVehicle, buyTrain, sellVehicle } from '../commands/build';
import { startVehicle } from './update';
import { VehicleState } from './VehicleStore';
import type { World } from '../World';

/**
 * Auto-renewal (section 11.3): replace a vehicle before it becomes a liability.
 *
 * The spec attaches the setting to a LINE. Lines are section 12.2 and do not
 * exist yet, so it is a company-wide switch instead - a departure recorded in
 * DECISIONS.md D-093, and one that costs nothing to move onto lines later
 * because the rule itself is per vehicle.
 *
 * Two properties matter more than the feature does:
 *
 *  - it consumes NO randomness. Breakdowns draw from the world rng, and a
 *    replacement that drew as well would shift every later draw and send every
 *    existing seed down a different future;
 *  - the successor is chosen by a total order, so two runs of the same world
 *    replace the same vehicle with the same thing.
 */

/** Is this vehicle old enough to be worth replacing? */
export function dueForRenewal(world: World, id: number): boolean {
  const life = vehicleLifetimeYears(world, id);
  if (life <= 0) return false;
  return vehicleAgeYears(world, id) >= life * AUTO_RENEW_LIFE_SHARE;
}

/**
 * The spec that should replace `current`, or -1.
 *
 * The successor is the vehicle a player would buy for the same job today: the
 * same mode, on sale this year, able to carry the same cargo, and at least as
 * capable. Among those the one with the LONGEST design life wins, ties going to
 * the higher capacity and then to the lower id - a total order, so the choice
 * cannot depend on catalogue ordering.
 *
 * Returns -1 when nothing qualifies, which is the common case in a decade with
 * no new models: the vehicle simply keeps running and grows old.
 */
export function successorOf(current: VehicleSpec, cargo: Cargo, year: number): number {
  const pool = current.railRole === RailRole.None ? VEHICLE_SPECS : RAIL_SPECS;
  const wanted = capacityFor(current, cargo);
  let best: VehicleSpec | null = null;

  for (const candidate of pool) {
    if (candidate.id === current.id) continue;
    if (candidate.kind !== current.kind) continue;
    if (candidate.railRole !== current.railRole) continue;
    if (year < candidate.introYear || year > candidate.retireYear) continue;
    if (capacityFor(candidate, cargo) < wanted) continue;
    // A vehicle that needs wires cannot replace one that does not: the line it
    // runs on may have none, and stranding a fleet is worse than an old fleet.
    if (candidate.needsCatenary && !current.needsCatenary) continue;
    if (best === null || better(candidate, best, cargo)) best = candidate;
  }
  return best === null ? -1 : best.id;
}

function better(candidate: VehicleSpec, best: VehicleSpec, cargo: Cargo): boolean {
  if (candidate.lifetimeYears !== best.lifetimeYears) {
    return candidate.lifetimeYears > best.lifetimeYears;
  }
  const candidateCapacity = capacityFor(candidate, cargo);
  const bestCapacity = capacityFor(best, cargo);
  if (candidateCapacity !== bestCapacity) return candidateCapacity > bestCapacity;
  return candidate.id < best.id;
}

/**
 * What a whole vehicle would be replaced by, unit for unit.
 *
 * A train is renewed as a composition: every unit is looked up separately, so a
 * consist keeps its shape and a wagon that has no successor stays as it is.
 * Returns null when nothing in it would change.
 */
export function renewalConsist(world: World, id: number): number[] | null {
  const vehicles = world.vehicles;
  const cargo = vehicles.refitCargo[id]! as Cargo;
  const year = world.date.year;
  const units = vehicles.consist[id]!;

  if (units.length === 0) {
    const successor = successorOf(vehicleSpec(vehicles.specId[id]!), cargo, year);
    return successor < 0 ? null : [successor];
  }

  const replacement: number[] = [];
  let changed = false;
  for (const unit of units) {
    const successor = successorOf(vehicleSpec(unit), cargo, year);
    if (successor < 0 || !hasVehicleSpec(successor)) replacement.push(unit);
    else {
      replacement.push(successor);
      changed = true;
    }
  }
  return changed ? replacement : null;
}

/** What a replacement would cost at today's prices. [cent] */
export function renewalCostCt(world: World, replacement: readonly number[]): number {
  const priceCt =
    replacement.length === 1
      ? vehicleSpec(replacement[0]!).priceCt
      : aggregateConsist(replacement).priceCt;
  return world.costCt(priceCt);
}

/**
 * Replace every vehicle that is due, once a game year.
 *
 * The old vehicle is SOLD through the ordinary command - so the resale value,
 * the upkeep and the book value all move exactly as they would by hand, and the
 * track it was holding is given back - and the new one is bought at the shed
 * the old one was built at, given the same orders and the same refit, and sent
 * on its way. A vehicle whose replacement cannot be afforded is left alone.
 *
 * Returns how many were replaced, which is what the news log will report once
 * there is one (section 15, M8).
 */
export function renewFleet(world: World): number {
  if (!world.company.autoRenew) return 0;

  const vehicles = world.vehicles;
  let replaced = 0;

  // A snapshot of the ids first: buying inside the loop appends to the store,
  // and a freshly bought vehicle must not be considered for renewal itself.
  const count = vehicles.count;
  for (let id = 0; id < count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (!dueForRenewal(world, id)) continue;

    const replacement = renewalConsist(world, id);
    if (replacement === null) continue;
    if (renewalCostCt(world, replacement) > world.company.cashCt) continue;

    const depotTile = vehicles.homeDepotTile[id]!;
    const orders = vehicles.orders[id]!.map((order) => ({ ...order }));
    const cargo = vehicles.refitCargo[id]! as Cargo;
    const wasRunning = vehicles.state[id] !== VehicleState.Stopped;

    // Sell first, so the money is in the bank and the shed is free.
    sellVehicle(world, id);

    const size = world.map.size;
    const x = depotTile % size;
    const y = (depotTile / size) | 0;
    const outcome =
      replacement.length === 1 && vehicleSpec(replacement[0]!).railRole === RailRole.None
        ? buyRoadVehicle(world, x, y, replacement[0]!)
        : buyTrain(world, x, y, replacement);
    if (!outcome.ok) continue;

    const fresh = vehicles.count - 1;
    vehicles.refitCargo[fresh] = cargo;
    vehicles.refreshAggregate(fresh);
    vehicles.orders[fresh] = orders;
    if (wasRunning) startVehicle(world, fresh);
    replaced++;
  }
  return replaced;
}
