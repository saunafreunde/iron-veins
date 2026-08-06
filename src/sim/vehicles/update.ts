import { amountOf } from '../cargo/stack';
import {
  CargoDisposition,
  dispositionOf,
  loadFromStation,
  transferToStation,
} from '../cargo/routing';
import { deliveryRevenueCt, tileDistance } from '../cargo/payment';
import { Cargo } from '../cargo/types';
import {
  BRAKE_REACTION_SECONDS,
  CURVE_LOOKAHEAD_MAX_NODES,
  AIRPORT_HOLDING_SLOTS,
  AIRPORT_RUNWAY_TICKS,
  AIRPORT_RUNWAYS,
  DRAG_AIR,
  DRAG_ROAD,
  DRAG_SHIP,
  DRAG_TRAIN,
  FREIGHT_TERMINAL_LOAD_FACTOR,
  GRAVITY,
  HEIGHT_STEP_M,
  LOAD_TICKS_PER_UNIT,
  MAX_ORDER_JUMPS_PER_STOP,
  MAX_VEHICLES,
  MIN_STATION_STOP_TICKS,
  ROLLING_RESISTANCE_RAIL,
  ROLLING_RESISTANCE_ROAD,
  PLATFORM_OVERHANG_PENALTY,
  ROTATING_MASS_FACTOR,
  SIGNAL_STOP_OFFSET_M,
  STOPPED_SPEED_MS,
  TICK_SECONDS,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  TILE_DIAGONAL_M,
  TILE_SIZE_M,
} from '../constants';
import {
  curveRadiusM,
  curveSpeedMs,
  gradeWindowM,
  windowedGradePermille,
  RAIL_TYPE_SPEED_MS,
  turnSteps,
  type RailType,
} from '../map/track';
import { bookExpense, bookRevenue } from '../economy/company';
import { refitCapacity, refitPriceCt } from './refit';
import { serviceVehicle } from './lifecycle';
import { deliverToIndustry } from '../industry/production';
import { isOneWay, signalDirection, signalKind, SignalKind } from '../map/signals';
import { flightPath } from '../net/airPath';
import {
  hasModule,
  isAirModule,
  ModuleKind,
  platformLength,
  stationAirportSize,
  type Station,
} from '../station/types';
import { creditDelivery } from '../economy/contracts';
import type { World } from '../World';
import { holdBody, releaseAll, releaseBehind, tryClaim } from './reservations';
import { pathDirection, pathStepM, routeLengthM } from './route';
import { VehicleKind } from './spec';
import {
  OrderComparator,
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
  type Order,
} from './VehicleStore';

/**
 * Vehicle simulation: longitudinal dynamics, the state machine and the cargo
 * exchange at stations (sections 11.1 and 11.4).
 *
 * Runs every tick for every vehicle, so it allocates nothing: all the working
 * values are locals, everything a vehicle is made of has been reduced to cached
 * numbers in the store, and the only object churn happens when cargo actually
 * changes hands.
 *
 * Road vehicles and trains share this code. What differs between them is a
 * handful of coefficients and one extra term - the curve speed of the track
 * ahead, which is where the geometry of section 8.1 finally becomes something
 * the player can feel.
 */

/** How often a vehicle without a route tries again. [ticks] */
const REPATH_INTERVAL_TICKS = 100;

/** True for module kinds that vehicles of this mode can call at. */
function moduleServes(moduleKind: number, vehicleKind: number): boolean {
  if (vehicleKind === VehicleKind.Train) return moduleKind === ModuleKind.RailPlatform;
  if (vehicleKind === VehicleKind.Ship) return moduleKind === ModuleKind.Quay;
  if (vehicleKind === VehicleKind.Aircraft) return isAirModule(moduleKind);
  return moduleKind === ModuleKind.BusStop || moduleKind === ModuleKind.LorryBay;
}

/**
 * Tile a vehicle of this mode stops at to serve a station, or -1.
 *
 * Depot modules are deliberately not eligible: a joint station can well contain
 * one, and a bus that served the station from inside the depot would be both
 * odd to look at and impossible to explain.
 */
export function stationAccessTile(station: Station, vehicleKind: number): number {
  for (const module of station.modules) {
    if (moduleServes(module.kind, vehicleKind)) return module.tileIndex;
  }
  return -1;
}

/**
 * Which platform of a station this particular train should head for.
 *
 * Every train being sent to the station's FIRST platform was the limitation
 * recorded as D-049, and it is what made a second platform worthless: two
 * trains queued for one tile while the other stood empty. A train now takes the
 * first platform nobody else holds, and falls back to the first of all of them
 * when they are all busy - it will wait either way, but it waits in the right
 * place and the station's capacity is real (DECISIONS.md D-080).
 *
 * Deterministic: the modules are in build order and the reservation table is a
 * pure function of state, so two runs pick the same platform.
 */
function platformFor(world: World, id: number, station: Station): number {
  const kind = world.vehicles.kind[id]!;
  // Trains and ships both queue for a berth; a bus stop holds as many buses as
  // turn up. Giving ships the platform rule from the start avoids repeating
  // D-049 - the second quay of a port would otherwise be worthless.
  if (kind !== VehicleKind.Train && kind !== VehicleKind.Ship) {
    return stationAccessTile(station, kind);
  }

  let first = -1;
  let free = -1;
  for (const module of station.modules) {
    if (!moduleServes(module.kind, kind)) continue;
    if (first < 0) first = module.tileIndex;
    if (free >= 0) continue;
    // A ship claims no track, so "taken" means another ship is standing there.
    const taken =
      kind === VehicleKind.Ship
        ? occupiedByAnother(world, module.tileIndex, id)
        : world.reservations.ownerOf(module.tileIndex) !== -1 &&
          world.reservations.ownerOf(module.tileIndex) !== id;
    if (!taken) free = module.tileIndex;
  }
  return free >= 0 ? free : first;
}

/** Is some other vehicle standing on this tile? Used for berths. */
function occupiedByAnother(world: World, tile: number, id: number): boolean {
  const vehicles = world.vehicles;
  for (let other = 0; other < vehicles.count; other++) {
    if (other === id || vehicles.alive[other] !== 1) continue;
    if (vehicles.tileIndex[other] === tile) return true;
  }
  return false;
}

/**
 * Gradient the vehicle is working against, in per mille and signed.
 *
 * A road vehicle feels the tile it is on. A train feels the stretch of line it
 * is on, measured over the same window the track was built to - see the note on
 * the gradient window in map/track.ts. Without that a train would meet a wall
 * of 160 per mille for one tick every time the ground stepped up a level, and
 * stall on a line it is perfectly able to climb.
 */
function gradePermille(world: World, id: number): number {
  const vehicles = world.vehicles;
  // The sea is flat and so is the sky. Reading the ground under either would
  // find the sea bed or a mountain the aircraft is flying comfortably over.
  const mode = vehicles.kind[id];
  if (mode === VehicleKind.Ship || mode === VehicleKind.Aircraft) return 0;

  const index = vehicles.pathIndex[id]!;
  if (index + 1 >= vehicles.pathLength[id]!) return 0;

  const path = vehicles.paths[id]!;
  const size = world.map.size;
  // railHeight, not baseHeight: on a bridge the track is level while the ground
  // beneath it is a river bed, and a train must not be dragged down into it.
  const height = (tile: number): number => world.map.railHeight(tile % size, (tile / size) | 0);
  const to = path[index + 1]!;

  if (vehicles.kind[id] !== VehicleKind.Train) {
    const rise = height(to) - height(path[index]!);
    return (rise * HEIGHT_STEP_M * 1000) / pathStepM(path, index, size);
  }

  const windowM = gradeWindowM(world.map.railType[path[index]!]! as RailType);
  let runM = pathStepM(path, index, size);
  let back = index;
  while (back > 0 && runM < windowM) {
    back--;
    runM += pathStepM(path, back, size);
  }
  return windowedGradePermille(height(to) - height(path[back]!), runM, windowM);
}

/**
 * Speed a train may hold right now (sections 8.1 and 11.1).
 *
 * Three things cap it: the slowest unit in the train, the line speed of the
 * track, and every curve close enough ahead that the train has to be slowing
 * for it already. The last one is what makes a well laid line worth its money -
 * v = sqrt(v_curve^2 + 2 a s) is simply the braking equation solved for the
 * speed one may still be doing `s` metres before the curve.
 */
function trainSpeedLimit(world: World, id: number): number {
  const vehicles = world.vehicles;
  const map = world.map;
  const size = map.size;
  const path = vehicles.paths[id]!;
  const length = vehicles.pathLength[id]!;
  const start = vehicles.pathIndex[id]!;

  let limit = vehicles.maxSpeedMs[id]!;
  const brake = vehicles.brakeMs2[id]!;
  const lateral = vehicles.lateralAccel[id]!;
  const speed = vehicles.speedMs[id]!;
  const horizon = (speed * speed) / (2 * brake) + TILE_DIAGONAL_M;

  const reservedTo = vehicles.reservedToIndex[id]!;
  let distance = -vehicles.progressM[id]!;

  for (let step = 0; step < CURVE_LOOKAHEAD_MAX_NODES; step++) {
    const node = start + step;
    if (node + 1 >= length) break;
    const ahead = distance > 0 ? distance : 0;

    const line = RAIL_TYPE_SPEED_MS[map.railType[path[node]!]!] ?? 0;
    if (line > 0) {
      const allowed = Math.sqrt(line * line + 2 * brake * ahead);
      if (allowed < limit) limit = allowed;
    }

    if (node >= 1) {
      const incoming = pathDirection(path, node - 1, size);
      const outgoing = pathDirection(path, node, size);
      const previousTurn = node >= 2 ? turnSteps(pathDirection(path, node - 2, size), incoming) : 0;
      const nextTurn =
        node + 2 < length ? turnSteps(outgoing, pathDirection(path, node + 1, size)) : 0;
      const curve = curveSpeedMs(curveRadiusM(incoming, outgoing, previousTurn, nextTurn), lateral);
      if (Number.isFinite(curve)) {
        const allowed = Math.sqrt(curve * curve + 2 * brake * ahead);
        if (allowed < limit) limit = allowed;
      }
    }

    // The end of what this train holds is a wall it must stop short of. Same
    // equation as the curve above with a target speed of zero, and it needs no
    // accumulator of its own - `distance` already counts from the start of the
    // current tile, exactly as routeRemainingM does.
    if (reservedTo >= 0 && node === reservedTo) {
      const stop = distance + pathStepM(path, node, size) - SIGNAL_STOP_OFFSET_M;
      const allowed = Math.sqrt(2 * brake * (stop > 0 ? stop : 0));
      if (allowed < limit) limit = allowed;
      break;
    }

    distance += pathStepM(path, node, size);
    if (distance > horizon) break;
  }
  return limit;
}

/**
 * One step of the longitudinal solver of section 11.1.
 *
 * Traction is constant up to the power limit and then falls as P/v, which is
 * what makes a heavy train crawl up a gradient instead of ignoring it: at
 * 1_000 t a 20 per mille climb costs 196 kN of the 224 kN a big steam engine
 * can pull, and the last 28 kN have to accelerate a thousand tonnes.
 */
function stepPhysics(world: World, id: number, braking: boolean, speedLimit: number): void {
  const vehicles = world.vehicles;
  const rail = vehicles.kind[id] === VehicleKind.Train;
  const mass = vehicles.massKg[id]!;
  const speed = vehicles.speedMs[id]!;

  const traction = braking
    ? 0
    : Math.min(vehicles.tractiveN[id]!, vehicles.powerW[id]! / Math.max(speed, 1));
  // A hull has no wheels: its resistance is all in the water, which the drag
  // term already carries. Charging it road rolling resistance as well would put
  // a hundred kilonewtons of friction on a ship that has none.
  const mode = vehicles.kind[id]!;
  const ship = mode === VehicleKind.Ship;
  const flying = mode === VehicleKind.Aircraft;
  // Neither a hull nor a wing touches the ground: their resistance is all in
  // the fluid, which the drag term carries. An aircraft's drag coefficient is
  // low because it is written against a speed an order of magnitude higher.
  const rollingCoefficient =
    ship || flying ? 0 : rail ? ROLLING_RESISTANCE_RAIL : ROLLING_RESISTANCE_ROAD;
  const rolling = rollingCoefficient * mass * GRAVITY;
  const dragCoefficient = flying ? DRAG_AIR : ship ? DRAG_SHIP : rail ? DRAG_TRAIN : DRAG_ROAD;
  const drag = dragCoefficient * speed * speed;
  const grade = mass * GRAVITY * (gradePermille(world, id) / 1000);
  const brake = braking ? mass * vehicles.brakeMs2[id]! : 0;

  const acceleration = (traction - rolling - drag - grade - brake) / (mass * ROTATING_MASS_FACTOR);

  let next = speed + acceleration * TICK_SECONDS;
  if (next < 0) next = 0;
  if (next > speedLimit) next = speedLimit;
  vehicles.speedMs[id] = next;

  // Work is force times distance, and the distance has to be the SAME one the
  // position uses - a separately recomputed step would let the energy bill and
  // the odometer drift apart, which is the mistake of D-043 wearing a hat.
  // Braking sets traction to zero, so nothing is recovered on the way down:
  // regenerative braking is not modelled (DECISIONS.md D-091).
  const stepM = next * TICK_SECONDS;
  vehicles.workJ[id] = vehicles.workJ[id]! + traction * stepM;
  vehicles.progressM[id] = vehicles.progressM[id]! + stepM;
}

/** Metres the vehicle still has to drive on its route. */
function remainingDistanceM(world: World, id: number): number {
  return world.vehicles.routeRemainingM[id]! - world.vehicles.progressM[id]!;
}

/** Distance needed to come to a stand still from the current speed. */
function brakingDistanceM(speed: number, brakeMs2: number): number {
  return (speed * speed) / (2 * brakeMs2) + speed * BRAKE_REACTION_SECONDS;
}

/** Hand the vehicle a route to `targetTile`; returns false when there is none. */
function routeTo(world: World, id: number, targetTile: number): boolean {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  // The old claim is about to lose the route it was expressed in terms of.
  releaseAll(world, id);

  const kind = vehicles.kind[id];
  const length =
    kind === VehicleKind.Aircraft
      ? flightPath(world.map, vehicles.tileIndex[id]!, targetTile, path)
      : kind === VehicleKind.Ship
        ? world.waterPathfinder.find(world.map, vehicles.tileIndex[id]!, targetTile, path)
        : kind === VehicleKind.Train
          ? world.railPathfinder.find(
              world.map,
              vehicles.tileIndex[id]!,
              targetTile,
              vehicles.maxSpeedMs[id]!,
              vehicles.lateralAccel[id]!,
              vehicles.needsCatenary[id] === 1,
              path,
            )
          : world.roadPathfinder.find(world.map, vehicles.tileIndex[id]!, targetTile, path);

  if (length === 0) {
    vehicles.pathLength[id] = 0;
    vehicles.routeRemainingM[id] = 0;
    return false;
  }
  vehicles.pathLength[id] = length;
  vehicles.pathIndex[id] = 0;
  vehicles.progressM[id] = 0;
  vehicles.routeRemainingM[id] = routeLengthM(path, length, world.map.size);
  return true;
}

/** Tile the current order sends the vehicle to, or -1 if it is unreachable. */
function orderTargetTile(world: World, id: number): number {
  const vehicles = world.vehicles;
  const orders = vehicles.orders[id]!;
  if (orders.length === 0) return -1;

  const order = orders[vehicles.orderIndex[id]! % orders.length]!;
  // A depot or waypoint order names its tile directly. Deliberately lenient
  // about a marker demolished since the order was set: if the way itself is
  // still there the vehicle simply drives via the tile, and if it is not, the
  // pathfinder says NoRoute - the same treatment a vanished shed gets.
  if (order.target === OrderTarget.Depot || order.target === OrderTarget.Waypoint) {
    return order.targetId;
  }

  const station = world.stations[order.targetId];
  return station === undefined ? -1 : platformFor(world, id, station);
}

/**
 * The measured quantity of one order condition (section 12.1), at a stop.
 *
 * Pure arithmetic over store fields - no allocation, and never called from the
 * per-tick path: conditions are evaluated only when a vehicle picks its next
 * order at a stop (hot-path law #7).
 */
function conditionMeasure(world: World, id: number, kind: number): number {
  const vehicles = world.vehicles;
  switch (kind) {
    case OrderConditionKind.LoadPercent: {
      const capacity = vehicles.capacityUnits[id]!;
      if (capacity <= 0) return 0;
      return (amountOf(vehicles.cargo[id]!, vehicles.refitCargo[id]! as Cargo) / capacity) * 100;
    }
    case OrderConditionKind.Reliability:
      return vehicles.reliability[id]! / 100;
    case OrderConditionKind.AgeYears:
      return Math.floor((world.tick - vehicles.builtTick[id]!) / TICKS_PER_YEAR);
    case OrderConditionKind.WaitingDays: {
      const arrived = vehicles.lastArrivalTick[id]!;
      return arrived < 0 ? 0 : Math.floor((world.tick - arrived) / TICKS_PER_DAY);
    }
    case OrderConditionKind.DateYear:
      return world.date.year;
    default:
      return 0;
  }
}

/** Does this order's jump condition hold right now? */
function conditionHolds(world: World, id: number, order: Order): boolean {
  const measure = conditionMeasure(world, id, order.condKind);
  const value = order.condValue;
  switch (order.condComparator) {
    case OrderComparator.Less:
      return measure < value;
    case OrderComparator.LessOrEqual:
      return measure <= value;
    case OrderComparator.Equal:
      return measure === value;
    case OrderComparator.NotEqual:
      return measure !== value;
    case OrderComparator.GreaterOrEqual:
      return measure >= value;
    default:
      return measure > value;
  }
}

/**
 * Which order actually runs next, starting the scan at `start`.
 *
 * An order carrying a condition that HOLDS is not run - the vehicle jumps to
 * the condition's target instead, and the order it lands on is asked the same
 * question. The chain is capped: a schedule whose conditions form a cycle of
 * truths would otherwise spin for ever, and past the cap the vehicle simply
 * runs the order it stands on, conditions ignored (section 12.1; the jump
 * targets were range-checked when the orders were set).
 */
function resolveOrderIndex(world: World, id: number, start: number): number {
  const orders = world.vehicles.orders[id]!;
  let index = start;
  for (let jumps = 0; jumps < MAX_ORDER_JUMPS_PER_STOP; jumps++) {
    const order = orders[index]!;
    if (order.condKind === OrderConditionKind.None) return index;
    if (!conditionHolds(world, id, order)) return index;
    index = order.condJumpTo % orders.length;
  }
  return index;
}

/**
 * Send a standing vehicle to its current order.
 *
 * Called by the start command so a vehicle that cannot reach its first stop
 * says so immediately, instead of sitting in "no route" while the player
 * wonders what is wrong.
 */
export function startVehicle(world: World, id: number): boolean {
  const vehicles = world.vehicles;
  const orders = vehicles.orders[id]!;
  if (orders.length > 0) {
    // Starting from a stand is a stop event, so the conditions speak here too.
    vehicles.orderIndex[id] = resolveOrderIndex(world, id, vehicles.orderIndex[id]! % orders.length);
  }
  const target = orderTargetTile(world, id);
  if (target === -1 || !routeTo(world, id, target)) {
    vehicles.state[id] = VehicleState.NoRoute;
    return false;
  }
  vehicles.state[id] = VehicleState.Driving;
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

  vehicles.orderIndex[id] = resolveOrderIndex(
    world,
    id,
    (vehicles.orderIndex[id]! + 1) % orders.length,
  );
  // An aircraft waits on the ground rather than joining a full holding stack.
  if (!mayDepart(world, id)) {
    vehicles.state[id] = VehicleState.Loading;
    vehicles.loadTicks[id] = MIN_STATION_STOP_TICKS;
    return;
  }
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
  const carried = vehicles.cargo[id]!;
  const hasCooling = vehicles.hasCooling[id] === 1;
  let units = 0;

  // The leg that has just ended, arrival to arrival. This is the measurement the
  // whole connection table of section 7.4 is built out of.
  const previous = vehicles.lastStationId[id]!;
  const departed = vehicles.lastArrivalTick[id]!;
  if (previous >= 0 && previous !== station.id && departed >= 0) {
    world.cargoLinks.observe(previous, station.id, world.tick - departed);
  }
  vehicles.lastStationId[id] = station.id;
  vehicles.lastArrivalTick[id] = world.tick;

  if (order.unload !== OrderUnload.None) {
    for (let i = carried.length - 1; i >= 0; i--) {
      const stack = carried[i]!;
      let disposition = dispositionOf(world, id, station, stack);
      // The two forced modes of section 12.1 override the routing's answer,
      // never the payment: a parcel set down earlier than the rules wanted is
      // paid for exactly the leg it rode, and the loading rule (D-078) still
      // decides what got aboard - so neither mode can be ridden for a detour.
      if (order.unload === OrderUnload.TransferOnly) {
        // The feeder mode: EVERYTHING is put down as a transfer, even a parcel
        // whose destination this is. transferToStation re-opens its search.
        disposition = CargoDisposition.Transfer;
      } else if (order.unload === OrderUnload.Forced && disposition === CargoDisposition.Stay) {
        // Forced unload: deliveries stay deliveries, but nothing rides on.
        disposition = CargoDisposition.Transfer;
      }
      if (disposition === CargoDisposition.Stay) continue;

      // A parcel that cannot be set down - the station is full - stays aboard
      // and is not paid for. Destroying cargo that has already been carried
      // would be a worse answer than carrying it round once more.
      let paidFor = stack.amount;
      if (disposition === CargoDisposition.Transfer) {
        paidFor = transferToStation(station, stack);
        if (paidFor <= 0) continue;
      }

      // Every leg is paid for the distance IT covered, measured from the point
      // this parcel was last paid up to. Feeder chains therefore add up to
      // exactly one direct payment (section 7.4).
      const distance = tileDistance(stack.paidFromX, stack.paidFromY, station.x, station.y);
      const revenue = deliveryRevenueCt({
        cargo: stack.cargo,
        amount: paidFor,
        distanceTiles: distance,
        ticksInTransit: world.tick - stack.createdTick,
        hasCooling,
        year: world.date.year,
      });

      bookRevenue(world.companyOf(vehicles.ownerId[id]!), revenue, stack.cargo);
      vehicles.earnedCt[id] = vehicles.earnedCt[id]! + revenue;

      if (disposition === CargoDisposition.Deliver) {
        deliverCargo(world, station, stack.cargo, paidFor);
        // A contract is satisfied by cargo that actually REACHED the town, so
        // it is credited on the delivery path and nowhere else.
        creditDelivery(
          world,
          vehicles.ownerId[id]!,
          station.townId,
          stack.cargo,
          paidFor,
        );
      }
      units += paidFor;
      stack.amount -= paidFor;
      if (stack.amount <= 0) carried.splice(i, 1);
    }
  }

  // The per-order refit of section 12.1, between unloading and loading: the
  // same capacity rule and the same price as the depot command
  // (vehicles/refit.ts), applied only when the vehicle is genuinely empty.
  // A refit the owner cannot afford is skipped, not queued - the vehicle
  // keeps its old cargo and the schedule stays live.
  if (order.refitTo >= 0 && order.refitTo !== vehicles.refitCargo[id] && carried.length === 0) {
    const owner = world.companyOf(vehicles.ownerId[id]!);
    const chargeCt = world.costCt(refitPriceCt(vehicles, id));
    if (refitCapacity(vehicles, id, order.refitTo as Cargo) > 0 && chargeCt <= owner.cashCt) {
      vehicles.refitCargo[id] = order.refitTo;
      // Before the loading below reads capacityUnits, or the first load after
      // a refit would still be measured against the OLD cargo's capacity.
      vehicles.refreshAggregate(id);
      bookExpense(owner, chargeCt);
    }
  }

  if (order.load !== OrderLoad.None) {
    const cargo = vehicles.refitCargo[id]! as Cargo;
    const room = vehicles.capacityUnits[id]! - amountOf(carried, cargo);
    const space = room * platformShare(world, id, station);
    if (space > 0) {
      const moved = loadFromStation(world, id, station, cargo, space);
      units += moved;
      if (station.townId >= 0 && (cargo === Cargo.Passengers || cargo === Cargo.Mail)) {
        const town = world.towns[station.townId];
        if (town !== undefined) {
          town.transportedThisMonth += moved;
          // Growth asks what left the town; the council asks who took it.
          const owner = vehicles.ownerId[id]!;
          town.transportedByCompany[owner] = (town.transportedByCompany[owner] ?? 0) + moved;
        }
      }
    }
  }

  // The train just got a thousand tonnes heavier or lighter.
  vehicles.refreshAggregate(id);

  station.visitTicks.push(world.tick);
  station.servedReliability = Math.round(
    (station.servedReliability * 3 + vehicles.reliability[id]!) / 4,
  );
  return units;
}

/**
 * Route delivered cargo to whoever wanted it: the industries in the catchment
 * first, in ascending id, then the town's own consumption.
 *
 * It deliberately never lands in `station.waiting`. The station's capacity is
 * checked against the sum over every stack, so inbound coal would push a town's
 * passengers into overflow and, through the overflow penalty, drag down the
 * rating of the very station that is working well.
 */
function deliverCargo(world: World, station: Station, cargo: Cargo, amount: number): void {
  let left = amount;

  for (const industryId of station.servedIndustries) {
    if (left <= 0) break;
    const industry = world.industries[industryId];
    if (industry === undefined) continue;
    left -= deliverToIndustry(industry, cargo, left);
  }

  if (left <= 0 || station.townId < 0) return;
  const town = world.towns[station.townId];
  if (town === undefined) return;
  // Electronics count as goods: a town wants manufactured articles, and the
  // growth formula of section 13.2 does not distinguish furniture from radios.
  if (cargo === Cargo.Goods || cargo === Cargo.Electronics) town.goodsDeliveredThisMonth += left;
  else if (cargo === Cargo.Food) town.foodDeliveredThisMonth += left;
}

/**
 * How much of its capacity a train can work at this station (section 10).
 *
 * A platform is 1xN tiles and N decides how much of a train stands at it. A
 * train that hangs off the end loads only the share that fits, and forty
 * percent off that: the rest has to be shunted into place and worked
 * separately, which is slow enough that lengthening the platform is the right
 * answer. Road vehicles are one tile long and never meet the rule.
 */
export function platformShare(world: World, id: number, station: Station): number {
  if (world.vehicles.kind[id] !== VehicleKind.Train) return 1;

  const platform = platformLength(station);
  if (platform <= 0) return 1;
  const trainTiles = Math.ceil(world.vehicles.lengthM[id]! / TILE_SIZE_M);
  if (trainTiles <= platform) return 1;

  return (platform / trainTiles) * (1 - PLATFORM_OVERHANG_PENALTY);
}

/**
 * The runway queue and the holding stack of section 8.4.
 *
 * An airport has one runway per size step, and a landing occupies one for a
 * while. An aircraft that finds them all busy HOLDS - it circles, earning
 * nothing, which is the pressure that makes a second runway worth buying rather
 * than a punishment for its own sake.
 *
 * The stack is bounded at four positions. Beyond that an aircraft is not
 * refused in the air, which would mean inventing fuel exhaustion; it is refused
 * BEFORE it leaves and waits on the ground, where waiting is free. That is the
 * same limit, expressed at the only point where it can be enforced kindly.
 */
function runwaysOf(station: Station): number {
  const size = stationAirportSize(station);
  return size < 0 ? 0 : (AIRPORT_RUNWAYS[size] ?? 0);
}

/** Take a runway if one is free; false when they are all busy. */
function claimRunway(world: World, station: Station): boolean {
  const runways = runwaysOf(station);
  if (runways === 0) return true;

  // Grown lazily: a station gains runways when a bigger airport is built beside
  // it, and the saved list is whatever it had at the time.
  while (station.runwayFreeTick.length < runways) station.runwayFreeTick.push(0);

  let earliest = -1;
  for (let i = 0; i < runways; i++) {
    if (station.runwayFreeTick[i]! > world.tick) continue;
    if (earliest < 0 || station.runwayFreeTick[i]! < station.runwayFreeTick[earliest]!) {
      earliest = i;
    }
  }
  if (earliest < 0) return false;

  const size = stationAirportSize(station);
  station.runwayFreeTick[earliest] = world.tick + (AIRPORT_RUNWAY_TICKS[size] ?? 0);
  return true;
}

/** How many aircraft are already circling over this station. */
function holdingOver(world: World, stationId: number): number {
  const vehicles = world.vehicles;
  let count = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (vehicles.state[id] !== VehicleState.Holding) continue;
    const orders = vehicles.orders[id]!;
    if (orders.length === 0) continue;
    if (orders[vehicles.orderIndex[id]! % orders.length]!.targetId === stationId) count++;
  }
  return count;
}

/**
 * May this aircraft set off for its next stop?
 *
 * Only if there is room in the stack over the airport it is heading for. An
 * aircraft held on the ground costs nothing; one held in the air over a full
 * airport is the queue the limit exists to bound.
 */
function mayDepart(world: World, id: number): boolean {
  const vehicles = world.vehicles;
  if (vehicles.kind[id] !== VehicleKind.Aircraft) return true;

  const orders = vehicles.orders[id]!;
  if (orders.length === 0) return true;
  const order = orders[vehicles.orderIndex[id]! % orders.length]!;
  if (order.target !== OrderTarget.Station) return true;

  const station = world.stations[order.targetId];
  if (station === undefined || runwaysOf(station) === 0) return true;
  return holdingOver(world, station.id) < AIRPORT_HOLDING_SLOTS;
}

/** True when the vehicle has taken on everything it can carry. */
function isFull(world: World, id: number): boolean {
  const vehicles = world.vehicles;
  const cargo = vehicles.refitCargo[id]! as Cargo;
  return amountOf(vehicles.cargo[id]!, cargo) >= vehicles.capacityUnits[id]!;
}

/**
 * Claim the section ahead early enough to brake for it - and, once stopped
 * short of a red, keep asking.
 *
 * This runs every tick a train is driving, and it is the primary mechanism, not
 * a comfort feature. The braking term in `trainSpeedLimit` brings the train to a
 * stand a few metres short of the signal, which means its wheels never cross a
 * tile boundary again - so the gate inside the tile advance would never be
 * reached and the train would wait for ever. The claim has to be attempted from
 * where the train is, not from where it is about to be.
 *
 * It looks only as far as the train could brake from. A train does not claim
 * section after section across the whole map; it claims the one it is coming up
 * to. On a line with no signals at all it claims nothing ever, which is what
 * keeps M3's behaviour exactly as it was.
 */
function claimAhead(world: World, id: number): void {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const length = vehicles.pathLength[id]!;
  const start = vehicles.pathIndex[id]!;
  const size = world.map.size;
  const signal = world.map.signal;
  const brake = vehicles.brakeMs2[id]!;
  const speed = vehicles.speedMs[id]!;
  const horizon = (speed * speed) / (2 * brake) + TILE_DIAGONAL_M;

  // The node the train would have to be granted next: the one just past what it
  // already holds, or the first signal ahead when it holds nothing yet.
  const boundary = vehicles.reservedToIndex[id]! + 1;
  const extending = vehicles.reservedToIndex[id]! >= 0;
  if (extending && boundary >= length) return;

  let distance = -vehicles.progressM[id]!;
  for (let step = 0; step < CURVE_LOOKAHEAD_MAX_NODES; step++) {
    const node = start + step;
    if (node + 1 >= length) return;
    distance += pathStepM(path, node, size);

    if (extending) {
      if (node + 1 === boundary) {
        tryClaim(world, id, boundary);
        return;
      }
    } else if (signalKind(signal[path[node + 1]!]!) !== SignalKind.None) {
      tryClaim(world, id, start);
      return;
    }

    if (distance > horizon) return;
  }
}

/**
 * May this train move onto route node `next`?
 *
 * Free unless the tile begins a new section - and then only if the train can
 * claim the whole of that section, its own body included.
 */
function mayEnter(world: World, id: number, next: number): boolean {
  const vehicles = world.vehicles;
  if (next <= vehicles.reservedToIndex[id]!) return true;

  const path = vehicles.paths[id]!;

  // Somebody else is standing there. Signals decide who may enter a SECTION;
  // this decides who may occupy a TILE, and it holds everywhere - which is what
  // stops two trains ending up on one (D-073).
  const owner = world.reservations.ownerOf(path[next]!);
  if (owner !== -1 && owner !== id) return false;

  const packed = world.map.signal[path[next]!]!;
  const kind = signalKind(packed);
  if (kind === SignalKind.None) return true;

  // A one-way signal met from behind is a wall, not a wait. The pathfinder
  // already refuses to route through one that way, so reaching this means the
  // signal was turned round under a train that was already on its way.
  if (isOneWay(kind) && next >= 1) {
    const heading = pathDirection(path, next - 1, world.map.size);
    if (heading !== signalDirection(packed)) return false;
  }
  return tryClaim(world, id, next);
}

/** Advance every vehicle by one tick. */
export function updateVehicles(world: World): void {
  const vehicles = world.vehicles;

  // Whoever has waited longest asks first (section 9.3, DECISIONS.md D-081).
  //
  // Without this, a contested section always goes to the lowest id, because
  // that is the order this loop happens to run in - and on a busy ring the
  // trains at the back of the queue starve while the ones at the front take
  // the same section lap after lap. Order is a pure function of state, so two
  // runs still produce the same world.
  const waiting = waitingOrder(world);
  for (let i = 0; i < waiting.count; i++) stepVehicle(world, waiting.ids[i]!);

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (waiting.pending[id] === 1) continue;
    stepVehicle(world, id);
  }
}

/** Trains held at a signal, longest wait first. Scratch, reused every tick. */
const waitingIds = new Int32Array(MAX_VEHICLES);
const waitingSince = new Int32Array(MAX_VEHICLES);
const waitingPending = new Uint8Array(MAX_VEHICLES);

function waitingOrder(world: World): {
  ids: Int32Array;
  pending: Uint8Array;
  count: number;
} {
  const vehicles = world.vehicles;
  waitingPending.fill(0, 0, vehicles.count);
  let count = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (vehicles.state[id] !== VehicleState.WaitingForPath) continue;

    // Insertion sort: earliest wait first, ties on the id so the order is a
    // total one. The list is the handful of trains actually standing at a red,
    // never the whole fleet, so this stays cheap.
    const since = vehicles.waitingSinceTick[id]!;
    let at = count;
    while (at > 0 && waitingSince[at - 1]! > since) {
      waitingIds[at] = waitingIds[at - 1]!;
      waitingSince[at] = waitingSince[at - 1]!;
      at--;
    }
    waitingIds[at] = id;
    waitingSince[at] = since;
    waitingPending[id] = 1;
    count++;
  }
  return { ids: waitingIds, pending: waitingPending, count };
}

/** Advance one vehicle by one tick. */
function stepVehicle(world: World, id: number): void {
  const vehicles = world.vehicles;
  switch (vehicles.state[id]) {
    case VehicleState.Stopped:
      return;

    case VehicleState.InDepot: {
      // A depot ORDER is a service call, not a terminus (section 12.1's
      // depot round trips): the vehicle dwells and then runs on. A vehicle
      // whose only order is the depot stays parked - there is nowhere to run
      // on to - and parking on purpose is what the stop command is for.
      const orders = vehicles.orders[id]!;
      if (orders.length <= 1) return;
      vehicles.loadTicks[id] = vehicles.loadTicks[id]! - 1;
      if (vehicles.loadTicks[id]! > 0) return;
      advanceOrder(world, id);
      return;
    }

    case VehicleState.NoRoute: {
      // Retry occasionally rather than every tick: a stranded vehicle must
      // not turn into a pathfinding load on the whole simulation.
      if (world.tick % REPATH_INTERVAL_TICKS !== id % REPATH_INTERVAL_TICKS) return;
      const target = orderTargetTile(world, id);
      if (target !== -1 && routeTo(world, id, target)) {
        vehicles.state[id] = VehicleState.Driving;
      }
      return;
    }

    case VehicleState.BrokenDown: {
      vehicles.breakdownTicks[id] = vehicles.breakdownTicks[id]! - 1;
      if (vehicles.breakdownTicks[id]! <= 0) vehicles.state[id] = VehicleState.Driving;
      return;
    }

    case VehicleState.Loading: {
      vehicles.loadTicks[id] = vehicles.loadTicks[id]! - 1;
      if (vehicles.loadTicks[id]! > 0) return;

      const orders = vehicles.orders[id]!;
      const order = orders[vehicles.orderIndex[id]! % orders.length];
      // FullAny waits exactly as Full does: a vehicle here carries one cargo
      // at a time, so "full of anything" and "full" are the same condition
      // (see OrderLoad.FullAny). Only a STATION can fill a vehicle - a
      // waypoint dwell must never turn into waiting for cargo that cannot
      // come.
      if (
        order !== undefined &&
        order.target === OrderTarget.Station &&
        (order.load === OrderLoad.Full || order.load === OrderLoad.FullAny) &&
        !isFull(world, id)
      ) {
        vehicles.state[id] = VehicleState.WaitingForCargo;
        return;
      }
      advanceOrder(world, id);
      return;
    }

    case VehicleState.WaitingForCargo: {
      const orders = vehicles.orders[id]!;
      const order = orders[vehicles.orderIndex[id]! % orders.length];
      const station = order === undefined ? undefined : world.stations[order.targetId];
      if (station === undefined) {
        advanceOrder(world, id);
        return;
      }
      const cargo = vehicles.refitCargo[id]! as Cargo;
      const space = vehicles.capacityUnits[id]! - amountOf(vehicles.cargo[id]!, cargo);
      if (space > 0 && loadFromStation(world, id, station, cargo, space) > 0) {
        vehicles.refreshAggregate(id);
      }
      if (isFull(world, id)) advanceOrder(world, id);
      return;
    }

    case VehicleState.Holding: {
      // Circling costs a tick of everybody's time and nothing else; the moment
      // a runway frees, the aircraft lands and is served.
      const orders = vehicles.orders[id]!;
      const order = orders[vehicles.orderIndex[id]! % orders.length];
      const station = order === undefined ? undefined : world.stations[order.targetId];
      if (station === undefined) {
        advanceOrder(world, id);
        return;
      }
      if (!claimRunway(world, station)) return;

      const units = serveStation(world, id, station);
      vehicles.loadTicks[id] = Math.max(
        MIN_STATION_STOP_TICKS,
        units * LOAD_TICKS_PER_UNIT,
        order?.waitTicks ?? 0,
      );
      vehicles.state[id] = VehicleState.Loading;
      return;
    }

    case VehicleState.WaitingForPath: {
      // Retried every tick rather than on the repath cadence: a failed claim
      // is a handful of array reads, and a train sitting at a signal that
      // went green five real seconds ago is the sort of thing players notice.
      if (vehicles.pathLength[id]! === 0) {
        vehicles.state[id] = VehicleState.NoRoute;
        return;
      }
      if (vehicles.reservedToIndex[id]! < 0) holdBody(world, id);
      if (mayEnter(world, id, vehicles.pathIndex[id]! + 1)) {
        vehicles.state[id] = VehicleState.Driving;
        vehicles.waitingSinceTick[id] = -1;
      }
      return;
    }

    case VehicleState.Driving:
    case VehicleState.Braking: {
      if (vehicles.pathLength[id]! === 0) {
        vehicles.state[id] = VehicleState.NoRoute;
        return;
      }

      const train = vehicles.kind[id] === VehicleKind.Train;
      if (train) {
        claimAhead(world, id);
        // Whatever the signals say, the train owns the ground under itself.
        if (vehicles.reservedToIndex[id]! < 0) holdBody(world, id);
      }
      const limit = train ? trainSpeedLimit(world, id) : vehicles.maxSpeedMs[id]!;

      const remaining = remainingDistanceM(world, id);
      const braking = remaining <= brakingDistanceM(vehicles.speedMs[id]!, vehicles.brakeMs2[id]!);
      vehicles.state[id] = braking ? VehicleState.Braking : VehicleState.Driving;
      stepPhysics(world, id, braking, limit);

      // Walk forward over as many tiles as this tick covered.
      const path = vehicles.paths[id]!;
      const size = world.map.size;
      let held = false;

      for (;;) {
        const index = vehicles.pathIndex[id]!;
        if (index + 1 >= vehicles.pathLength[id]!) break;
        const step = pathStepM(path, index, size);
        if (vehicles.progressM[id]! < step) break;

        // The gate: a train may cross into a section only while it holds it.
        // The braking term above normally has it standing here already; this
        // is the backstop that makes the guarantee independent of how far the
        // lookahead reached.
        if (train && !mayEnter(world, id, index + 1)) {
          if (vehicles.waitingSinceTick[id]! < 0) vehicles.waitingSinceTick[id] = world.tick;
          const stopAt = step - SIGNAL_STOP_OFFSET_M;
          if (vehicles.progressM[id]! > stopAt) vehicles.progressM[id] = stopAt;
          vehicles.speedMs[id] = 0;
          vehicles.state[id] = VehicleState.WaitingForPath;
          held = true;
          break;
        }

        vehicles.progressM[id] = vehicles.progressM[id]! - step;
        vehicles.routeRemainingM[id] = vehicles.routeRemainingM[id]! - step;
        vehicles.pathIndex[id] = index + 1;
        vehicles.tileIndex[id] = path[index + 1]!;
      }
      if (held) return;
      if (train) {
        // A train standing still that holds nothing beyond its own body is
        // going nowhere, and the deadlock clock has to see it. Watching only
        // the tile-advance gate misses this case entirely: a train whose
        // section is never granted never crosses a tile boundary, so it stalls
        // in DRIVING at zero speed and the clock never starts - which is how
        // four trains sat in their sheds for a whole run with the warning
        // reading zero (DECISIONS.md D-083).
        const stalled =
          vehicles.reservedToIndex[id]! <= vehicles.pathIndex[id]! &&
          vehicles.speedMs[id]! < STOPPED_SPEED_MS;
        if (!stalled) vehicles.waitingSinceTick[id] = -1;
        else if (vehicles.waitingSinceTick[id]! < 0) vehicles.waitingSinceTick[id] = world.tick;
        releaseBehind(world, id);
      }

      const atEnd = vehicles.pathIndex[id]! + 1 >= vehicles.pathLength[id]!;
      if (!atEnd) return;

      vehicles.progressM[id] = 0;
      if (vehicles.speedMs[id]! > STOPPED_SPEED_MS) return; // still rolling out

      vehicles.speedMs[id] = 0;
      vehicles.pathLength[id] = 0;
      vehicles.routeRemainingM[id] = 0;
      // The route is gone, so the claim expressed in its indices has to go
      // with it - otherwise a train standing at a platform holds its whole
      // approach for the rest of the game.
      releaseAll(world, id);

      const orders = vehicles.orders[id]!;
      const order = orders[vehicles.orderIndex[id]! % orders.length];
      if (order === undefined) {
        vehicles.state[id] = VehicleState.Stopped;
        return;
      }
      if (order.target === OrderTarget.Depot) {
        // Arriving at a shed IS the service of section 11.3: some reliability
        // goes back, capped at what the vehicle was worth when it was new.
        // Without this there is no reason a player would ever route through
        // one, and RELIABILITY_SERVICE_GAIN was a constant nothing read.
        serviceVehicle(world, id);
        vehicles.state[id] = VehicleState.InDepot;
        // The dwell the InDepot case counts down before the schedule runs on.
        vehicles.loadTicks[id] = Math.max(MIN_STATION_STOP_TICKS, order.waitTicks);
        return;
      }
      if (order.target === OrderTarget.Waypoint) {
        // A waypoint is passed, not served: no cargo, no revenue, no leg
        // measurement - the arrival-to-arrival clock of D-077 keeps running
        // across it. Only a demanded minimum dwell holds the vehicle here.
        if (order.waitTicks > 0) {
          vehicles.state[id] = VehicleState.Loading;
          vehicles.loadTicks[id] = order.waitTicks;
          return;
        }
        advanceOrder(world, id);
        return;
      }

      const station = world.stations[order.targetId];
      if (station === undefined) {
        advanceOrder(world, id);
        return;
      }
      // An aircraft may not land until a runway is free; until then it holds.
      if (vehicles.kind[id] === VehicleKind.Aircraft && !claimRunway(world, station)) {
        vehicles.state[id] = VehicleState.Holding;
        return;
      }
      const units = serveStation(world, id, station);
      const perUnit = hasModule(station, ModuleKind.FreightTerminal)
        ? LOAD_TICKS_PER_UNIT * FREIGHT_TERMINAL_LOAD_FACTOR
        : LOAD_TICKS_PER_UNIT;
      // The minimum dwell of section 12.1 stretches the stop, never shortens
      // the loading it has to cover anyway.
      vehicles.loadTicks[id] = Math.max(
        MIN_STATION_STOP_TICKS,
        units * perUnit,
        order.waitTicks,
      );
      vehicles.state[id] = VehicleState.Loading;
      return;
    }

    default:
      return;
  }
}
