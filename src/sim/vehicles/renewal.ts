import { AUTO_RENEW_LIFE_SHARE, type MapClimate } from '../constants';
import { specAvailable } from './availability';
import { aggregateConsist } from './consist';
import { capacityFor, hasVehicleSpec, vehicleSpec, VEHICLE_SPECS } from './catalog';
import { RAIL_SPECS } from './railCatalog';
import { vehicleAgeYears, vehicleLifetimeYears } from './lifecycle';
import { RailRole } from './spec';
import type { Cargo } from '../cargo/types';
import type { VehicleSpec } from './spec';
import { buyRoadVehicle, buyTrain, sellVehicle } from '../commands/build';
import { reAnchorVehicle } from '../lines/LineStore';
import { reportRenewal } from '../news/report';
import { startVehicle } from './update';
import { VehicleState } from './VehicleStore';
import type { CompanyState } from '../types';
import type { World } from '../World';

/**
 * Auto-renewal (section 11.3): replace a vehicle before it becomes a liability.
 *
 * The setting lives on the LINE, where section 11.3 always attached it: M11
 * built lines, and the company-wide switch D-093 kept in the meantime is
 * gone. A vehicle running no line is never renewed automatically - there is
 * no flag anywhere that could say so.
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
export function successorOf(
  current: VehicleSpec,
  cargo: Cargo,
  year: number,
  climate: MapClimate,
): number {
  const pool = current.railRole === RailRole.None ? VEHICLE_SPECS : RAIL_SPECS;
  const wanted = capacityFor(current, cargo);
  let best: VehicleSpec | null = null;

  for (const candidate of pool) {
    if (candidate.id === current.id) continue;
    if (candidate.kind !== current.kind) continue;
    if (candidate.railRole !== current.railRole) continue;
    if (!specAvailable(candidate, year, climate)) continue;
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
    const successor = successorOf(vehicleSpec(vehicles.specId[id]!), cargo, year, world.climate);
    return successor < 0 ? null : [successor];
  }

  const replacement: number[] = [];
  let changed = false;
  for (const unit of units) {
    const successor = successorOf(vehicleSpec(unit), cargo, year, world.climate);
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
export function renewFleet(world: World, company: CompanyState): number {
  const vehicles = world.vehicles;
  const lines = world.lines;
  let replaced = 0;

  // A snapshot of the ids first: buying inside the loop can grow the store,
  // and a freshly bought vehicle must not be considered for renewal itself.
  const count = vehicles.count;
  for (let id = 0; id < count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== company.id) continue;

    // The flag lives on the vehicle's LINE (section 11.3, M11).
    const lineId = vehicles.lineId[id]!;
    if (lineId < 0 || lines.alive[lineId] !== 1 || lines.autoRenew[lineId] !== 1) continue;
    if (!dueForRenewal(world, id)) continue;

    const replacement = renewalConsist(world, id);
    if (replacement === null) continue;
    if (renewalCostCt(world, replacement) > company.cashCt) continue;

    const depotTile = vehicles.homeDepotTile[id]!;
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

    // The fresh vehicle is the one BUILT THIS TICK at that shed - never
    // `count - 1`: the store reuses freed slots, so the replacement usually
    // lands exactly in the slot the old vehicle vacated. And never one that
    // already runs a line: a whole fleet bought in one tick renews in one
    // tick, and without that clause every renewal after the first found the
    // FIRST replacement again - measured on the scenario-5 trace, a six-lorry
    // line renewed at its design life adopted one successor six times, left
    // five paid-for lorries standing orphaned in the shed, and the line was
    // closed by its own review a month later.
    let fresh = -1;
    for (let candidate = 0; candidate < vehicles.count; candidate++) {
      if (vehicles.alive[candidate] !== 1) continue;
      if (vehicles.builtTick[candidate] !== world.tick) continue;
      if (vehicles.homeDepotTile[candidate] !== depotTile) continue;
      if (vehicles.ownerId[candidate] !== company.id) continue;
      if (vehicles.lineId[candidate]! >= 0) continue;
      fresh = candidate;
      break;
    }
    if (fresh < 0) continue;

    vehicles.refitCargo[fresh] = cargo;
    vehicles.refreshAggregate(fresh);
    // The successor takes the old vehicle's place ON THE LINE, anchored to
    // the nearest stop - the shed it stands in (the re-anchor rule of
    // lines/LineStore.ts).
    vehicles.lineId[fresh] = lineId;
    reAnchorVehicle(world, fresh);
    if (wasRunning) startVehicle(world, fresh);
    replaced++;
    reportRenewal(world, fresh, replaced);
  }
  return replaced;
}
