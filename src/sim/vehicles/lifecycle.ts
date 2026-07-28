import { compactStacks } from '../cargo/stack';
import {
  BREAKDOWN_DIVISOR,
  BREAKDOWN_MAX_TICKS,
  BREAKDOWN_MIN_TICKS,
  CARGO_EXPIRY_FRACTION_PER_DAY,
  CARGO_MAX_WAIT_DAYS,
  RELIABILITY_DECAY_PER_YEAR,
  RELIABILITY_MAX,
  TICKS_PER_DAY,
} from '../constants';
import { trimVisits } from '../station/types';
import type { World } from '../World';
import { VehicleState } from './VehicleStore';

/**
 * The slow clocks: breakdowns, ageing and cargo that nobody collected.
 *
 * All of these are deliberately per day or per year rather than per tick
 * (failure #10). A breakdown roll twenty times a second would be both twenty
 * times too likely and a pointless load on the simulation.
 */

/** One breakdown roll per vehicle per game day. */
export function rollBreakdowns(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const state = vehicles.state[id]!;
    if (state !== VehicleState.Driving && state !== VehicleState.Braking) continue;

    const chance = (RELIABILITY_MAX - vehicles.reliability[id]!) / BREAKDOWN_DIVISOR;
    if (world.rng.nextFloat() >= chance) continue;

    vehicles.state[id] = VehicleState.BrokenDown;
    vehicles.speedMs[id] = 0;
    vehicles.breakdownTicks[id] = world.rng.nextRange(BREAKDOWN_MIN_TICKS, BREAKDOWN_MAX_TICKS);
  }
}

/** Yearly wear. A vehicle past its design life ages twice as fast. */
export function ageVehicles(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const decay = RELIABILITY_DECAY_PER_YEAR;
    const next = vehicles.reliability[id]! - decay;
    vehicles.reliability[id] = next < 0 ? 0 : next;
  }
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

    for (const stack of station.waiting) {
      // Cargo with nowhere to go is the routing sweep's business: it writes the
      // parcel off whole and charges the station for it. Nibbling at it here as
      // well would take the same loss twice (section 7.4).
      if (stack.destinationStationId < 0) continue;
      if (world.tick - stack.createdTick <= cutoff) continue;
      // A share, not the lot. Cargo merges into one stack per origin, so
      // zeroing it would take two thousand units off an over-supplied station
      // in a single tick - which is the steady state of every mine nobody
      // collects from.
      stack.amount -= stack.amount * CARGO_EXPIRY_FRACTION_PER_DAY;
      stack.createdTick += TICKS_PER_DAY;
    }
    compactStacks(station.waiting);
  }
}
