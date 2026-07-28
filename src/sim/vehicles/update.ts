import { addCargo, amountOf, compactStacks, transferCargo } from '../cargo/stack';
import { deliveryRevenueCt, tileDistance } from '../cargo/payment';
import type { Cargo } from '../cargo/types';
import {
  BRAKE_REACTION_SECONDS,
  BRAKE_ROAD,
  DRAG_ROAD,
  GRAVITY,
  HEIGHT_STEP_M,
  LOAD_TICKS_PER_UNIT,
  MIN_STATION_STOP_TICKS,
  ROLLING_RESISTANCE_ROAD,
  ROTATING_MASS_FACTOR,
  STATION_CARGO_CAPACITY,
  TICK_SECONDS,
  TILE_SIZE_M,
} from '../constants';
import type { Station } from '../station/types';
import type { World } from '../World';
import { capacityFor, vehicleSpec } from './catalog';
import { OrderLoad, OrderTarget, OrderUnload, VehicleState } from './VehicleStore';

/**
 * Vehicle simulation: longitudinal dynamics, the state machine and the cargo
 * exchange at stations (sections 11.1 and 11.4).
 *
 * Runs every tick for every vehicle, so it allocates nothing: all the working
 * values are locals, and the only object churn happens when cargo actually
 * changes hands, which is a few times per station stop rather than 20 times a
 * second.
 */

/** How often a vehicle without a route tries again. [ticks] */
const REPATH_INTERVAL_TICKS = 100;

/** Tile a road vehicle stops at to serve a station. */
export function stationAccessTile(station: Station): number {
  return station.modules.length > 0 ? station.modules[0]!.tileIndex : -1;
}

/** Metres still to drive on the current route. */
function remainingDistanceM(world: World, id: number): number {
  const vehicles = world.vehicles;
  const tilesLeft = vehicles.pathLength[id]! - 1 - vehicles.pathIndex[id]!;
  return tilesLeft * TILE_SIZE_M - vehicles.progressM[id]!;
}

/** Gradient of the segment the vehicle is on, in per mille and signed. */
function gradePermille(world: World, id: number): number {
  const vehicles = world.vehicles;
  const index = vehicles.pathIndex[id]!;
  if (index + 1 >= vehicles.pathLength[id]!) return 0;

  const path = vehicles.paths[id]!;
  const size = world.map.size;
  const from = path[index]!;
  const to = path[index + 1]!;
  const rise =
    world.map.baseHeight(to % size, (to / size) | 0) -
    world.map.baseHeight(from % size, (from / size) | 0);
  return (rise * HEIGHT_STEP_M * 1000) / TILE_SIZE_M;
}

/**
 * One step of the longitudinal solver of section 11.1.
 *
 * Traction is constant up to the power limit and then falls as P/v, which is
 * what makes a heavy vehicle crawl up a gradient instead of ignoring it.
 */
function stepPhysics(world: World, id: number, braking: boolean, speedLimit: number): void {
  const vehicles = world.vehicles;
  const spec = vehicleSpec(vehicles.specId[id]!);
  const mass = spec.massKg;
  const speed = vehicles.speedMs[id]!;

  const traction = braking ? 0 : Math.min(spec.tractiveN, spec.powerW / Math.max(speed, 1));
  const rolling = ROLLING_RESISTANCE_ROAD * mass * GRAVITY;
  const drag = DRAG_ROAD * speed * speed;
  const grade = mass * GRAVITY * (gradePermille(world, id) / 1000);
  const brake = braking ? mass * BRAKE_ROAD : 0;

  const acceleration = (traction - rolling - drag - grade - brake) / (mass * ROTATING_MASS_FACTOR);

  let next = speed + acceleration * TICK_SECONDS;
  if (next < 0) next = 0;
  if (next > speedLimit) next = speedLimit;
  vehicles.speedMs[id] = next;
  vehicles.progressM[id] = vehicles.progressM[id]! + next * TICK_SECONDS;
}

/** Distance needed to come to a stand still from the current speed. */
function brakingDistanceM(speed: number): number {
  return (speed * speed) / (2 * BRAKE_ROAD) + speed * BRAKE_REACTION_SECONDS;
}

/** Hand the vehicle a route to `targetTile`; returns false when there is none. */
function routeTo(world: World, id: number, targetTile: number): boolean {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const length = world.roadPathfinder.find(world.map, vehicles.tileIndex[id]!, targetTile, path);
  if (length === 0) {
    vehicles.pathLength[id] = 0;
    return false;
  }
  vehicles.pathLength[id] = length;
  vehicles.pathIndex[id] = 0;
  vehicles.progressM[id] = 0;
  return true;
}

/** Tile the current order sends the vehicle to, or -1 if it is unreachable. */
function orderTargetTile(world: World, id: number): number {
  const vehicles = world.vehicles;
  const orders = vehicles.orders[id]!;
  if (orders.length === 0) return -1;

  const order = orders[vehicles.orderIndex[id]! % orders.length]!;
  if (order.target === OrderTarget.Depot) return order.targetId;

  const station = world.stations[order.targetId];
  return station === undefined ? -1 : stationAccessTile(station);
}

/**
 * Send a standing vehicle to its current order.
 *
 * Called by the start command so a vehicle that cannot reach its first stop
 * says so immediately, instead of sitting in "no route" while the player
 * wonders what is wrong.
 */
export function startVehicle(world: World, id: number): boolean {
  const target = orderTargetTile(world, id);
  if (target === -1 || !routeTo(world, id, target)) {
    world.vehicles.state[id] = VehicleState.NoRoute;
    return false;
  }
  world.vehicles.state[id] = VehicleState.Driving;
  return true;
}

/** Move to the next order and start driving towards it. */
function advanceOrder(world: World, id: number): void {
  const vehicles = world.vehicles;
  const orders = vehicles.orders[id]!;
  if (orders.length === 0) {
    vehicles.state[id] = VehicleState.Stopped;
    return;
  }

  vehicles.orderIndex[id] = (vehicles.orderIndex[id]! + 1) % orders.length;
  const target = orderTargetTile(world, id);
  if (target === -1 || !routeTo(world, id, target)) {
    vehicles.state[id] = VehicleState.NoRoute;
    return;
  }
  vehicles.state[id] = VehicleState.Driving;
}

/**
 * Exchange cargo at a station and book the revenue.
 *
 * Payment happens on unloading, for the distance since the point this cargo was
 * last paid for. That is what lets a journey be split across several vehicles
 * without paying twice (section 7.4).
 */
function serveStation(world: World, id: number, station: Station): number {
  const vehicles = world.vehicles;
  const orders = vehicles.orders[id]!;
  const order = orders[vehicles.orderIndex[id]! % orders.length]!;
  const spec = vehicleSpec(vehicles.specId[id]!);
  const carried = vehicles.cargo[id]!;
  let units = 0;

  if (order.unload === OrderUnload.All) {
    for (let i = carried.length - 1; i >= 0; i--) {
      const stack = carried[i]!;
      const distance = tileDistance(stack.paidFromX, stack.paidFromY, station.x, station.y);
      const revenue = deliveryRevenueCt({
        cargo: stack.cargo,
        amount: stack.amount,
        distanceTiles: distance,
        ticksInTransit: world.tick - stack.createdTick,
        hasCooling: spec.hasCooling,
        year: world.date.year,
      });

      world.company.cashCt += revenue;
      world.company.profitThisYearCt += revenue;
      world.company.revenueThisMonthCt += revenue;
      vehicles.earnedCt[id] = vehicles.earnedCt[id]! + revenue;

      units += stack.amount;
      carried.splice(i, 1);
    }
  }

  if (order.load !== OrderLoad.None) {
    const cargo = vehicles.refitCargo[id]! as Cargo;
    const capacity = capacityFor(spec, cargo);
    const space = capacity - amountOf(carried, cargo);
    if (space > 0) {
      units += transferCargo(station.waiting, carried, cargo, space);
      compactStacks(station.waiting);
    }
  }

  station.visitTicks.push(world.tick);
  station.servedReliability = Math.round(
    (station.servedReliability * 3 + vehicles.reliability[id]!) / 4,
  );
  return units;
}

/** True when the vehicle has taken on everything it can carry. */
function isFull(world: World, id: number): boolean {
  const vehicles = world.vehicles;
  const spec = vehicleSpec(vehicles.specId[id]!);
  const cargo = vehicles.refitCargo[id]! as Cargo;
  return amountOf(vehicles.cargo[id]!, cargo) >= capacityFor(spec, cargo);
}

/** Advance every vehicle by one tick. */
export function updateVehicles(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;

    switch (vehicles.state[id]) {
      case VehicleState.Stopped:
      case VehicleState.InDepot:
        continue;

      case VehicleState.NoRoute: {
        // Retry occasionally rather than every tick: a stranded vehicle must
        // not turn into a pathfinding load on the whole simulation.
        if (world.tick % REPATH_INTERVAL_TICKS !== id % REPATH_INTERVAL_TICKS) continue;
        const target = orderTargetTile(world, id);
        if (target !== -1 && routeTo(world, id, target)) {
          vehicles.state[id] = VehicleState.Driving;
        }
        continue;
      }

      case VehicleState.BrokenDown: {
        vehicles.breakdownTicks[id] = vehicles.breakdownTicks[id]! - 1;
        if (vehicles.breakdownTicks[id]! <= 0) vehicles.state[id] = VehicleState.Driving;
        continue;
      }

      case VehicleState.Loading: {
        vehicles.loadTicks[id] = vehicles.loadTicks[id]! - 1;
        if (vehicles.loadTicks[id]! > 0) continue;

        const orders = vehicles.orders[id]!;
        const order = orders[vehicles.orderIndex[id]! % orders.length];
        if (order !== undefined && order.load === OrderLoad.Full && !isFull(world, id)) {
          vehicles.state[id] = VehicleState.WaitingForCargo;
          continue;
        }
        advanceOrder(world, id);
        continue;
      }

      case VehicleState.WaitingForCargo: {
        const orders = vehicles.orders[id]!;
        const order = orders[vehicles.orderIndex[id]! % orders.length];
        const station = order === undefined ? undefined : world.stations[order.targetId];
        if (station === undefined) {
          advanceOrder(world, id);
          continue;
        }
        const spec = vehicleSpec(vehicles.specId[id]!);
        const cargo = vehicles.refitCargo[id]! as Cargo;
        const space = capacityFor(spec, cargo) - amountOf(vehicles.cargo[id]!, cargo);
        if (space > 0) {
          transferCargo(station.waiting, vehicles.cargo[id]!, cargo, space);
          compactStacks(station.waiting);
        }
        if (isFull(world, id)) advanceOrder(world, id);
        continue;
      }

      case VehicleState.Driving:
      case VehicleState.Braking: {
        const spec = vehicleSpec(vehicles.specId[id]!);
        if (vehicles.pathLength[id]! === 0) {
          vehicles.state[id] = VehicleState.NoRoute;
          continue;
        }

        const remaining = remainingDistanceM(world, id);
        const braking = remaining <= brakingDistanceM(vehicles.speedMs[id]!);
        vehicles.state[id] = braking ? VehicleState.Braking : VehicleState.Driving;
        stepPhysics(world, id, braking, spec.maxSpeedMs);

        // Walk forward over as many tiles as this tick covered.
        const path = vehicles.paths[id]!;
        while (
          vehicles.progressM[id]! >= TILE_SIZE_M &&
          vehicles.pathIndex[id]! + 1 < vehicles.pathLength[id]!
        ) {
          vehicles.progressM[id] = vehicles.progressM[id]! - TILE_SIZE_M;
          vehicles.pathIndex[id] = vehicles.pathIndex[id]! + 1;
          vehicles.tileIndex[id] = path[vehicles.pathIndex[id]!]!;
        }

        const atEnd = vehicles.pathIndex[id]! + 1 >= vehicles.pathLength[id]!;
        if (!atEnd) continue;

        vehicles.progressM[id] = 0;
        if (vehicles.speedMs[id]! > 0.4) continue; // still rolling out

        vehicles.speedMs[id] = 0;
        vehicles.pathLength[id] = 0;

        const orders = vehicles.orders[id]!;
        const order = orders[vehicles.orderIndex[id]! % orders.length];
        if (order === undefined) {
          vehicles.state[id] = VehicleState.Stopped;
          continue;
        }
        if (order.target === OrderTarget.Depot) {
          vehicles.state[id] = VehicleState.InDepot;
          continue;
        }

        const station = world.stations[order.targetId];
        if (station === undefined) {
          advanceOrder(world, id);
          continue;
        }
        const units = serveStation(world, id, station);
        vehicles.loadTicks[id] = Math.max(MIN_STATION_STOP_TICKS, units * LOAD_TICKS_PER_UNIT);
        vehicles.state[id] = VehicleState.Loading;
        continue;
      }

      default:
        continue;
    }
  }
}

/** Put cargo produced nearby into a station, respecting its capacity. */
export function depositAtStation(
  station: Station,
  cargo: Cargo,
  amount: number,
  tick: number,
): void {
  if (amount <= 0) return;

  let waiting = 0;
  for (const stack of station.waiting) waiting += stack.amount;

  const space = STATION_CARGO_CAPACITY - waiting;
  if (space <= 0) {
    station.overflowUnits += amount;
    return;
  }
  const accepted = Math.min(space, amount);
  station.overflowUnits += amount - accepted;

  addCargo(station.waiting, {
    cargo,
    amount: accepted,
    createdTick: tick,
    originStationId: station.id,
    paidFromX: station.x,
    paidFromY: station.y,
  });
}
