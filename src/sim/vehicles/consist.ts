import { Cargo, CARGO_COUNT, CARGO_TONNES_PER_UNIT, isPassengerClass } from '../cargo/types';
import type { CargoStack } from '../cargo/stack';
import {
  BRAKE_FREIGHT,
  BRAKE_PASSENGER,
  LATERAL_ACCEL_FREIGHT,
  LATERAL_ACCEL_PASSENGER,
  MAX_CONSIST_UNITS,
  MAX_TRAIN_LENGTH_M,
} from '../constants';
import { capacityFor, hasVehicleSpec, vehicleSpec } from './catalog';
import { RailRole, VehicleKind, type VehicleSpec } from './spec';

/**
 * Train composition (section 11.2).
 *
 * A train is one moving entity assembled from several catalogue entries. The
 * aggregate below is what the longitudinal solver actually sees:
 *
 *   m       = sum of all units
 *   F_start = sum of the TRACTION units only - a wagon pulls nothing
 *   v_max   = the slowest unit in the train
 *   length  = sum of all units
 *
 * The last two are the interesting ones in play: one old wagon caps a modern
 * express at its own 100 km/h, and length is what a platform has to match.
 */

export interface ConsistAggregate {
  /** Empty mass of the whole train. [kg] */
  readonly massKg: number;
  /** Starting tractive effort of the locomotives. [N] */
  readonly tractiveN: number;
  /** Installed power of the locomotives. [W] */
  readonly powerW: number;
  /** Slowest unit in the train. [m/s] */
  readonly maxSpeedMs: number;
  readonly lengthM: number;
  readonly priceCt: number;
  readonly upkeepCtPerYear: number;
  /** Reliability of the weakest unit - a train fails where its worst part does. */
  readonly reliability0: number;
  /** True when any locomotive draws from the catenary. */
  readonly needsCatenary: boolean;
  readonly tractionUnits: number;
  readonly wagons: number;
}

const EMPTY: ConsistAggregate = {
  massKg: 0,
  tractiveN: 0,
  powerW: 0,
  maxSpeedMs: 0,
  lengthM: 0,
  priceCt: 0,
  upkeepCtPerYear: 0,
  reliability0: 0,
  needsCatenary: false,
  tractionUnits: 0,
  wagons: 0,
};

export function aggregateConsist(specIds: readonly number[]): ConsistAggregate {
  if (specIds.length === 0) return EMPTY;

  let massKg = 0;
  let tractiveN = 0;
  let powerW = 0;
  let maxSpeedMs = Infinity;
  let lengthM = 0;
  let priceCt = 0;
  let upkeepCtPerYear = 0;
  let reliability0 = Infinity;
  let needsCatenary = false;
  let tractionUnits = 0;
  let wagons = 0;

  for (const id of specIds) {
    const spec = vehicleSpec(id);
    massKg += spec.massKg;
    lengthM += spec.lengthM;
    priceCt += spec.priceCt;
    upkeepCtPerYear += spec.upkeepCtPerYear;
    if (spec.maxSpeedMs < maxSpeedMs) maxSpeedMs = spec.maxSpeedMs;
    if (spec.reliability0 < reliability0) reliability0 = spec.reliability0;

    if (spec.railRole === RailRole.Traction) {
      tractiveN += spec.tractiveN;
      powerW += spec.powerW;
      tractionUnits++;
      if (spec.needsCatenary) needsCatenary = true;
    } else {
      wagons++;
    }
  }

  return {
    massKg,
    tractiveN,
    powerW,
    maxSpeedMs,
    lengthM,
    priceCt,
    upkeepCtPerYear,
    reliability0,
    needsCatenary,
    tractionUnits,
    wagons,
  };
}

/** Combined capacity of the train for one cargo type, refits included. */
export function consistCapacityFor(specIds: readonly number[], cargo: Cargo): number {
  let total = 0;
  for (const id of specIds) total += capacityFor(vehicleSpec(id), cargo);
  return total;
}

/**
 * What the train carries unless the player says otherwise: whatever it has the
 * most room for. Ties go to the lower cargo id so the choice is deterministic.
 *
 * What it was BUILT to carry beats what it could be converted to, and that
 * distinction is not cosmetic: a refit gives back the unit's own capacity, so
 * a passenger coach has exactly as many "mail" units as it has seats, and
 * until SPEC2 M19 that tie was settled by the accident that passengers were
 * cargo id 0. With the classes at 18 and 19, mail became the lower id and
 * every passenger train in the game would have left its shed as a mail train.
 * A consist with no direct capacity at all - nothing but a locomotive - falls
 * through to the refit answer it always gave.
 */
export function consistDefaultCargo(specIds: readonly number[]): Cargo {
  let best = 0;
  let bestCapacity = 0;
  for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
    let direct = 0;
    for (const id of specIds) direct += vehicleSpec(id).capacity[cargo as Cargo] ?? 0;
    if (direct > bestCapacity) {
      bestCapacity = direct;
      best = cargo;
    }
  }
  if (bestCapacity > 0) return best as Cargo;

  for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
    const capacity = consistCapacityFor(specIds, cargo as Cargo);
    if (capacity > bestCapacity) {
      bestCapacity = capacity;
      best = cargo;
    }
  }
  return best as Cargo;
}

/**
 * True when every unit that carries this cargo is refrigerated. One warm wagon
 * in the train spoils the load, so the payment penalty applies to the whole
 * train rather than to a share of it.
 */
export function consistHasCooling(specIds: readonly number[], cargo: Cargo): boolean {
  let carriers = 0;
  for (const id of specIds) {
    const spec = vehicleSpec(id);
    if (capacityFor(spec, cargo) === 0) continue;
    carriers++;
    if (!spec.hasCooling) return false;
  }
  return carriers > 0;
}

/**
 * Deceleration the train can achieve. Passenger stock brakes harder than
 * freight, which is why a coal train has to start braking a kilometre out.
 * [m/s^2]
 */
export function brakeForCargo(cargo: Cargo): number {
  return isPassengerClass(cargo) || cargo === Cargo.Mail ? BRAKE_PASSENGER : BRAKE_FREIGHT;
}

/**
 * Lateral acceleration the load tolerates in a curve. People complain long
 * before coal does, so a passenger train takes the same bend slower.
 * [m/s^2]
 */
export function lateralForCargo(cargo: Cargo): number {
  return isPassengerClass(cargo) || cargo === Cargo.Mail
    ? LATERAL_ACCEL_PASSENGER
    : LATERAL_ACCEL_FREIGHT;
}

/** Mass of the load a vehicle is carrying. [kg] */
export function payloadMassKg(stacks: readonly CargoStack[]): number {
  let tonnes = 0;
  for (const stack of stacks) tonnes += stack.amount * CARGO_TONNES_PER_UNIT[stack.cargo]!;
  return tonnes * 1000;
}

export const ConsistReason = {
  Empty: 'cmd.reject.consistEmpty',
  NoTraction: 'cmd.reject.consistNoTraction',
  TooLong: 'cmd.reject.consistTooLong',
  TooManyUnits: 'cmd.reject.consistTooManyUnits',
  NotRail: 'cmd.reject.consistNotRail',
  NotAvailable: 'cmd.reject.notAvailableYet',
} as const;

/**
 * Check a proposed train before it is bought. Returns the reason it was
 * refused, or null when it is legal - every refusal names the concrete problem
 * rather than "cannot build" (section 17.3).
 */
export function validateConsist(specIds: readonly number[], year: number): string | null {
  if (specIds.length === 0) return ConsistReason.Empty;
  if (specIds.length > MAX_CONSIST_UNITS) return ConsistReason.TooManyUnits;

  let traction = 0;
  let lengthM = 0;
  for (const id of specIds) {
    if (!hasVehicleSpec(id)) return ConsistReason.NotRail;
    const spec: VehicleSpec = vehicleSpec(id);
    if (spec.kind !== VehicleKind.Train || spec.railRole === RailRole.None) {
      return ConsistReason.NotRail;
    }
    if (year < spec.introYear || year > spec.retireYear) return ConsistReason.NotAvailable;
    if (spec.railRole === RailRole.Traction) traction++;
    lengthM += spec.lengthM;
  }

  if (traction === 0) return ConsistReason.NoTraction;
  if (lengthM > MAX_TRAIN_LENGTH_M) return ConsistReason.TooLong;
  return null;
}
