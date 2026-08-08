import { compactStacks } from '../cargo/stack';
import { cargoSpec } from '../cargo/types';
import {
  BREAKDOWN_DIVISOR,
  CANOPY_DECAY_FACTOR,
  BREAKDOWN_MAX_TICKS,
  BREAKDOWN_MIN_TICKS,
  CARGO_EXPIRY_FRACTION_PER_DAY,
  CARGO_MAX_WAIT_DAYS,
  OBSOLETE_DECAY_FACTOR,
  OBSOLETE_UPKEEP_FACTOR,
  RELIABILITY_DECAY_PER_YEAR,
  RELIABILITY_MAX,
  RELIABILITY_SERVICE_GAIN,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  WEATHER_BREAKDOWN_FACTOR,
  WEATHER_EXPIRY_FACTOR,
} from '../constants';
import { hasModule, ModuleKind, trimVisits } from '../station/types';
import { recordStationCargo, StationHistoryField } from '../station/history';
import { vehicleSpec } from './catalog';
import { aggregateConsist } from './consist';
import { weatherCellAt } from '../weather/effects';
import type { World } from '../World';
import { VehicleState } from './VehicleStore';

/**
 * The slow clocks: breakdowns, ageing and cargo that nobody collected.
 *
 * All of these are deliberately per day or per year rather than per tick
 * (failure #10). A breakdown roll twenty times a second would be both twenty
 * times too likely and a pointless load on the simulation.
 */

/**
 * One breakdown roll per vehicle per game day.
 *
 * **The weather moves the THRESHOLD and never the draw** (SPEC2 M18, Z3). The
 * `nextFloat` below is taken unconditionally for every eligible vehicle,
 * before anything about the sky is consulted, exactly as it has been since M6;
 * all a storm does is multiply the number it is compared against. So the
 * shared gameplay stream advances by one draw per eligible vehicle per game
 * day under every weather state there is, and switching the rule on cannot
 * fork an existing seed by moving a roll (Fehlerkatalog 25).
 *
 * The second draw - how long the repair takes - belongs to the breakdown
 * EVENT and always has: a day on which nothing broke down costs one draw per
 * vehicle, and a breakdown costs one more. That is the pre-M18 rule unchanged,
 * and `weatherEffects.spec.ts` instruments the stream position to hold both
 * halves of it.
 */
export function rollBreakdowns(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const state = vehicles.state[id]!;
    if (state !== VehicleState.Driving && state !== VehicleState.Braking) continue;

    const chance =
      ((RELIABILITY_MAX - vehicles.reliability[id]!) / BREAKDOWN_DIVISOR) *
      WEATHER_BREAKDOWN_FACTOR[weatherCellAt(world, vehicles.tileIndex[id]!)]!;
    if (world.rng.nextFloat() >= chance) continue;

    vehicles.state[id] = VehicleState.BrokenDown;
    vehicles.speedMs[id] = 0;
    vehicles.breakdownTicks[id] = world.rng.nextRange(BREAKDOWN_MIN_TICKS, BREAKDOWN_MAX_TICKS);
    // The lifetime tally the M14 vehicle detail shows. Counted where the
    // verdict falls, so the count and the news log can never disagree.
    vehicles.breakdownCount[id] = vehicles.breakdownCount[id]! + 1;
  }
}

/** Age of a vehicle in game years, from the tick it was built. */
export function vehicleAgeYears(world: World, id: number): number {
  return (world.tick - world.vehicles.builtTick[id]!) / TICKS_PER_YEAR;
}

/** Design life of a vehicle; for a train, the shortest life in the consist. */
export function vehicleLifetimeYears(world: World, id: number): number {
  const units = world.vehicles.consist[id]!;
  if (units.length === 0) return vehicleSpec(world.vehicles.specId[id]!).lifetimeYears;

  let shortest = Infinity;
  for (const unit of units) {
    const life = vehicleSpec(unit).lifetimeYears;
    if (life < shortest) shortest = life;
  }
  return shortest;
}

/** True once a vehicle is past its design life (section 11.3). */
export function isObsolete(world: World, id: number): boolean {
  return vehicleAgeYears(world, id) > vehicleLifetimeYears(world, id);
}

/**
 * Yearly wear. A vehicle past its design life ages twice as fast (11.3).
 *
 * The doubling is the visible half of obsolescence; the other half is the
 * doubled upkeep, which is applied where the fleet's upkeep is totalled rather
 * than here, because that figure is a company-level aggregate.
 */
export function ageVehicles(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const decay = isObsolete(world, id)
      ? RELIABILITY_DECAY_PER_YEAR * OBSOLETE_DECAY_FACTOR
      : RELIABILITY_DECAY_PER_YEAR;
    const next = vehicles.reliability[id]! - decay;
    vehicles.reliability[id] = next < 0 ? 0 : next;
  }
}

/**
 * A stay in the depot puts some reliability back (section 11.3).
 *
 * Capped at what the vehicle was worth when it was new: servicing keeps a
 * vehicle going, it does not make it better than new, and without the cap a
 * player could park a fleet in a shed and come back with a perfect one.
 */
export function serviceVehicle(world: World, id: number): void {
  const vehicles = world.vehicles;
  const units = vehicles.consist[id]!;
  const ceiling =
    units.length > 0
      ? aggregateConsist(units).reliability0
      : vehicleSpec(vehicles.specId[id]!).reliability0;

  const restored = vehicles.reliability[id]! + RELIABILITY_SERVICE_GAIN;
  vehicles.reliability[id] = restored > ceiling ? ceiling : restored;
}

/**
 * What the fleet costs to keep this year, obsolescence included.
 *
 * Recomputed from the fleet rather than maintained as a running total. The
 * doubling of section 11.3 arrives with AGE, not with a purchase, so a cached
 * sum would have to be adjusted from the yearly hook and any drift between it
 * and the truth would be invisible until a save was reloaded.
 */
export function fleetUpkeepCtPerYear(world: World, ownerId: number): number {
  const vehicles = world.vehicles;
  let total = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== ownerId) continue;
    total += vehicleUpkeepCtPerYear(world, id);
  }
  return total;
}

/**
 * What ONE vehicle costs to keep this year, obsolescence included - the
 * exact per-vehicle term of the fleet total above, factored out so the M14
 * vehicle detail shows the same number the books charge (before the price
 * level, which `World.costCt` applies where the bill is drawn).
 */
export function vehicleUpkeepCtPerYear(world: World, id: number): number {
  const vehicles = world.vehicles;
  const units = vehicles.consist[id]!;
  const upkeep =
    units.length > 0
      ? aggregateConsist(units).upkeepCtPerYear
      : vehicleSpec(vehicles.specId[id]!).upkeepCtPerYear;
  return isObsolete(world, id) ? upkeep * OBSOLETE_UPKEEP_FACTOR : upkeep;
}

/**
 * Write off cargo that has been waiting far too long, and keep the station
 * bookkeeping tidy. Cargo that nobody ever collects would otherwise sit in the
 * rating calculation for ever and hold a station at its floor.
 */
export function expireStaleCargo(world: World): void {
  const cutoff = CARGO_MAX_WAIT_DAYS * TICKS_PER_DAY;

  for (const station of world.stations) {
    trimVisits(station, world.tick);
    // Overflow memory fades, so one bad month does not brand a station for ever.
    station.overflowUnits = Math.max(0, station.overflowUnits - 20);

    // What the station's own buildings do about spoilage (section 10).
    const canopy = hasModule(station, ModuleKind.Canopy);
    const coldStore = hasModule(station, ModuleKind.ColdStore);
    // And what the sky over the station does (SPEC2 M18): heat, and only heat,
    // multiplies the daily share. Read once per station rather than once per
    // stack - the weather field is 16x16 regions, so every stack on a platform
    // stands under the same sky by construction.
    const heat =
      WEATHER_EXPIRY_FACTOR[weatherCellAt(world, station.y * world.map.size + station.x)]!;

    for (const stack of station.waiting) {
      // Cargo with nowhere to go is the routing sweep's business: it writes the
      // parcel off whole and charges the station for it. Nibbling at it here as
      // well would take the same loss twice (section 7.4).
      if (stack.destinationStationId < 0) continue;
      if (world.tick - stack.createdTick <= cutoff) continue;

      // A cold store stops perishable cargo spoiling here at all; a canopy
      // holds back a third of the loss on everything.
      if (coldStore && cargoSpec(stack.cargo).needsCooling) {
        stack.createdTick += TICKS_PER_DAY;
        continue;
      }
      const share =
        (canopy
          ? CARGO_EXPIRY_FRACTION_PER_DAY * CANOPY_DECAY_FACTOR
          : CARGO_EXPIRY_FRACTION_PER_DAY) * heat;

      // A share, not the lot. Cargo merges into one stack per origin, so
      // zeroing it would take two thousand units off an over-supplied station
      // in a single tick - which is the steady state of every mine nobody
      // collects from.
      const lost = stack.amount * share;
      stack.amount -= lost;
      recordStationCargo(station, StationHistoryField.Expired, stack.cargo, lost);
      stack.createdTick += TICKS_PER_DAY;
    }
    compactStacks(station.waiting);
  }
}
