import {
  LINK_ESTIMATE_SPEED_MS,
  OBSOLETE_UPKEEP_FACTOR,
  TICKS_PER_YEAR,
  TICK_SECONDS,
  TILE_SIZE_M,
} from '../constants';
import { tileDistance } from '../cargo/payment';
import { aggregateConsist } from '../vehicles/consist';
import { vehicleSpec } from '../vehicles/catalog';
import { isObsolete } from '../vehicles/lifecycle';
import { OrderTarget } from '../vehicles/VehicleStore';
import type { World } from '../World';

/**
 * The per-line statistics of section 12.2, every one of them RECOMPUTED from
 * the stores when asked (the M6 rule): the line entity carries no running
 * totals, so nothing here can drift from the fleet it describes. These run on
 * the marker cadence for the interface and inside the AI's decision hook -
 * never in the per-tick path.
 */

/** Vehicles currently assigned to the line, ascending id. Allocates. */
export function lineVehicles(world: World, lineId: number): number[] {
  const vehicles = world.vehicles;
  const found: number[] = [];
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] === 1 && vehicles.lineId[id] === lineId) found.push(id);
  }
  return found;
}

/** Share of the line's capacity currently aboard its vehicles, 0..1. */
export function lineUtilisation(world: World, vehicleIds: readonly number[]): number {
  const vehicles = world.vehicles;
  let carried = 0;
  let capacity = 0;
  for (const id of vehicleIds) {
    capacity += vehicles.capacityUnits[id]!;
    for (const stack of vehicles.cargo[id]!) carried += stack.amount;
  }
  return capacity > 0 ? carried / capacity : 0;
}

/**
 * Profit per game year, from the store: every vehicle's lifetime revenue
 * scaled to a yearly rate over its own age, minus its current yearly upkeep
 * (obsolescence doubling included). Young fleets are extrapolated from what
 * little they have earned, which the panel shows for what it is - a rate, not
 * a promise. [cent/year]
 */
export function lineProfitPerYearCt(world: World, vehicleIds: readonly number[]): number {
  const vehicles = world.vehicles;
  let profit = 0;
  for (const id of vehicleIds) {
    const ageTicks = world.tick - vehicles.builtTick[id]!;
    const revenueRate =
      ageTicks > 0 ? (vehicles.earnedCt[id]! * TICKS_PER_YEAR) / ageTicks : 0;
    const units = vehicles.consist[id]!;
    const upkeep =
      units.length > 0
        ? aggregateConsist(units).upkeepCtPerYear
        : vehicleSpec(vehicles.specId[id]!).upkeepCtPerYear;
    profit += revenueRate - (isObsolete(world, id) ? upkeep * OBSOLETE_UPKEEP_FACTOR : upkeep);
  }
  return Math.round(profit);
}

/** Station ids the line calls at, in order, depots and waypoints skipped. */
export function lineStations(world: World, lineId: number): number[] {
  const stops: number[] = [];
  for (const order of world.lines.orders[lineId]!) {
    if (order.target !== OrderTarget.Station) continue;
    if (world.stations[order.targetId] === undefined) continue;
    stops.push(order.targetId);
  }
  return stops;
}

/**
 * Mean round time of the line, arrival to arrival around the whole cycle.
 *
 * THE single round-time source (D-077): the sum of the measured leg means the
 * connection table already keeps, closing leg included. A leg nobody has
 * driven carries the table's straight-line 54 km/h estimate - and a leg the
 * table has never seen at all (a schedule set moments ago) gets the same
 * estimate computed here, so the figure exists from the first second. As
 * long as ANY leg is still an estimate, `measured` is false and the panel
 * says so instead of dressing a guess up as a measurement.
 */
export function lineRoundTicks(
  world: World,
  lineId: number,
): { readonly ticks: number; readonly measured: boolean } {
  const stops = lineStations(world, lineId);
  if (stops.length < 2) return { ticks: 0, measured: false };

  let ticks = 0;
  let measured = true;
  for (let index = 0; index < stops.length; index++) {
    const from = stops[index]!;
    const to = stops[(index + 1) % stops.length]!;
    if (from === to) continue;

    const legTicks = world.cargoLinks.legTicks(from, to);
    if (Number.isFinite(legTicks)) {
      ticks += legTicks;
      if (!world.cargoLinks.legMeasured(from, to)) measured = false;
      continue;
    }
    // The table has never seen this leg: the same straight-line figure the
    // table itself would seed it with (D-077).
    const a = world.stations[from]!;
    const b = world.stations[to]!;
    ticks += (tileDistance(a.x, a.y, b.x, b.y) * TILE_SIZE_M) / LINK_ESTIMATE_SPEED_MS / TICK_SECONDS;
    measured = false;
  }
  return { ticks, measured };
}

/** Cargo units waiting at one of the line's stations. */
export function stationWaitingUnits(world: World, stationId: number): number {
  const station = world.stations[stationId];
  if (station === undefined) return 0;
  let waiting = 0;
  for (const stack of station.waiting) waiting += stack.amount;
  return waiting;
}
