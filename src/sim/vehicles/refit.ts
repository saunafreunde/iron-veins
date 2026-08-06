import type { Cargo } from '../cargo/types';
import { REFIT_COST_SHARE } from '../constants';
import { capacityFor, vehicleSpec } from './catalog';
import { aggregateConsist, consistCapacityFor } from './consist';
import type { VehicleStore } from './VehicleStore';

/**
 * The refit arithmetic, shared between the RefitVehicle command and the
 * per-order refit of section 12.1 - one answer, wherever the question is
 * asked. The command adds its own depot and emptiness rules on top; the
 * at-stop refit adds its own (the vehicle has just unloaded and must be
 * empty), but what a vehicle CAN carry and what a conversion COSTS must never
 * disagree between the two.
 */

/** Units of `cargo` this vehicle would hold after a refit; 0 = cannot carry. */
export function refitCapacity(store: VehicleStore, id: number, cargo: Cargo): number {
  const units = store.consist[id]!;
  return units.length > 0
    ? consistCapacityFor(units, cargo)
    : capacityFor(vehicleSpec(store.specId[id]!), cargo);
}

/** A conversion costs a share of what the vehicle cost to buy. [cent] */
export function refitPriceCt(store: VehicleStore, id: number): number {
  const units = store.consist[id]!;
  const priceCt =
    units.length > 0 ? aggregateConsist(units).priceCt : vehicleSpec(store.specId[id]!).priceCt;
  return Math.round(priceCt * REFIT_COST_SHARE);
}
