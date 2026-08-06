import type { StationMarker, VehicleMarker } from '../shared/protocol';
import { CARGO_COUNT, type Cargo } from '../sim/cargo/types';
import { ModuleKind } from '../sim/station/types';
import { capacityFor, vehicleSpec, VehicleKind } from '../sim/vehicles/catalog';
import { consistCapacityFor } from '../sim/vehicles/consist';
import { VehicleState } from '../sim/vehicles/VehicleStore';

/**
 * What the refit button needs to know, answered the way the VALIDATOR answers
 * it - these two functions mirror `refitVehicle` in sim/commands/build.ts, so
 * the button appears exactly when the command would be accepted. The sim stays
 * the authority; this file only predicts it.
 */

/**
 * Mirror of the sim's `standsInDepot` (D-076): a vehicle can be refitted when
 * it is InDepot, OR when it is Stopped on a depot tile of its own mode - which
 * is the state of a freshly bought vehicle that has never left its shed.
 */
export function standsInDepot(
  vehicle: VehicleMarker,
  stations: readonly StationMarker[],
  mapSize: number,
): boolean {
  if (vehicle.state === VehicleState.InDepot) return true;
  if (vehicle.state !== VehicleState.Stopped) return false;

  const x = vehicle.tileIndex % mapSize;
  const y = (vehicle.tileIndex / mapSize) | 0;
  const wanted =
    vehicle.kind === VehicleKind.Train
      ? ModuleKind.RailDepot
      : vehicle.kind === VehicleKind.Ship
        ? ModuleKind.ShipDepot
        : ModuleKind.RoadDepot;

  return stations.some((station) =>
    station.modules.some((module) => module.kind === wanted && module.x === x && module.y === y),
  );
}

/** A cargo the vehicle could be converted to, and what it would then hold. */
export interface RefitTarget {
  readonly cargo: Cargo;
  readonly capacity: number;
}

/**
 * Every cargo this vehicle can carry, in cargo id order - the same
 * `capacityFor`/`consistCapacityFor` the command validates with, so nothing is
 * offered that would be rejected with CannotCarry.
 */
export function refitTargets(vehicle: VehicleMarker): readonly RefitTarget[] {
  const targets: RefitTarget[] = [];
  for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
    const capacity =
      vehicle.consist.length > 0
        ? consistCapacityFor(vehicle.consist, cargo as Cargo)
        : capacityFor(vehicleSpec(vehicle.specId), cargo as Cargo);
    if (capacity > 0) targets.push({ cargo: cargo as Cargo, capacity });
  }
  return targets;
}
