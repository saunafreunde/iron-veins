import { addCargo, amountOf, compactStacks, transferCargo } from '../cargo/stack';
import { deliveryRevenueCt, tileDistance } from '../cargo/payment';
import { Cargo } from '../cargo/types';
import {
  BRAKE_REACTION_SECONDS,
  CURVE_LOOKAHEAD_MAX_NODES,
  DRAG_ROAD,
  DRAG_TRAIN,
  GRAVITY,
  HEIGHT_STEP_M,
  LOAD_TICKS_PER_UNIT,
  MIN_STATION_STOP_TICKS,
  ROLLING_RESISTANCE_RAIL,
  ROLLING_RESISTANCE_ROAD,
  ROTATING_MASS_FACTOR,
  SIGNAL_STOP_OFFSET_M,
  STATION_CARGO_CAPACITY,
  STOPPED_SPEED_MS,
  TICK_SECONDS,
  TILE_DIAGONAL_M,
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
import { stationAccepts } from '../industry/catchment';
import { deliverToIndustry } from '../industry/production';
import { SignalKind } from '../map/signals';
import { ModuleKind, type Station } from '../station/types';
import type { World } from '../World';
import { releaseAll, releaseBehind, tryClaim } from './reservations';
import { pathDirection, pathStepM, routeLengthM } from './route';
import { VehicleKind } from './spec';
import { OrderLoad, OrderTarget, OrderUnload, VehicleState } from './VehicleStore';

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
  const rolling = (rail ? ROLLING_RESISTANCE_RAIL : ROLLING_RESISTANCE_ROAD) * mass * GRAVITY;
  const drag = (rail ? DRAG_TRAIN : DRAG_ROAD) * speed * speed;
  const grade = mass * GRAVITY * (gradePermille(world, id) / 1000);
  const brake = braking ? mass * vehicles.brakeMs2[id]! : 0;

  const acceleration = (traction - rolling - drag - grade - brake) / (mass * ROTATING_MASS_FACTOR);

  let next = speed + acceleration * TICK_SECONDS;
  if (next < 0) next = 0;
  if (next > speedLimit) next = speedLimit;
  vehicles.speedMs[id] = next;
  vehicles.progressM[id] = vehicles.progressM[id]! + next * TICK_SECONDS;
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

  const length =
    vehicles.kind[id] === VehicleKind.Train
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
  if (order.target === OrderTarget.Depot) return order.targetId;

  const station = world.stations[order.targetId];
  return station === undefined ? -1 : stationAccessTile(station, vehicles.kind[id]!);
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
  const carried = vehicles.cargo[id]!;
  const hasCooling = vehicles.hasCooling[id] === 1;
  let units = 0;

  if (order.unload === OrderUnload.All) {
    for (let i = carried.length - 1; i >= 0; i--) {
      const stack = carried[i]!;
      // Nothing is paid for where nobody wants it. Refusal rather than a
      // discount: a lorry that leaves still loaded is visible in the fleet
      // list, whereas a quiet fraction of the fare is a leak no test can see.
      if (!stationAccepts(station, stack.cargo)) continue;
      const distance = tileDistance(stack.paidFromX, stack.paidFromY, station.x, station.y);
      const revenue = deliveryRevenueCt({
        cargo: stack.cargo,
        amount: stack.amount,
        distanceTiles: distance,
        ticksInTransit: world.tick - stack.createdTick,
        hasCooling,
        year: world.date.year,
      });

      world.company.cashCt += revenue;
      world.company.profitThisYearCt += revenue;
      world.company.revenueThisMonthCt += revenue;
      vehicles.earnedCt[id] = vehicles.earnedCt[id]! + revenue;

      deliverCargo(world, station, stack.cargo, stack.amount);
      units += stack.amount;
      carried.splice(i, 1);
    }
  }

  if (order.load !== OrderLoad.None) {
    const cargo = vehicles.refitCargo[id]! as Cargo;
    const space = vehicles.capacityUnits[id]! - amountOf(carried, cargo);
    if (space > 0) {
      const moved = transferCargo(station.waiting, carried, cargo, space);
      units += moved;
      if (station.townId >= 0 && (cargo === Cargo.Passengers || cargo === Cargo.Mail)) {
        const town = world.towns[station.townId];
        if (town !== undefined) town.transportedThisMonth += moved;
      }
      compactStacks(station.waiting);
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
  if (cargo === Cargo.Goods) town.goodsDeliveredThisMonth += left;
  else if (cargo === Cargo.Food) town.foodDeliveredThisMonth += left;
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
    } else if (signal[path[node + 1]!] !== SignalKind.None) {
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
  if (world.map.signal[vehicles.paths[id]![next]!] === SignalKind.None) return true;
  return tryClaim(world, id, next);
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
        const cargo = vehicles.refitCargo[id]! as Cargo;
        const space = vehicles.capacityUnits[id]! - amountOf(vehicles.cargo[id]!, cargo);
        if (space > 0) {
          transferCargo(station.waiting, vehicles.cargo[id]!, cargo, space);
          compactStacks(station.waiting);
          vehicles.refreshAggregate(id);
        }
        if (isFull(world, id)) advanceOrder(world, id);
        continue;
      }

      case VehicleState.WaitingForPath: {
        // Retried every tick rather than on the repath cadence: a failed claim
        // is a handful of array reads, and a train sitting at a signal that
        // went green five real seconds ago is the sort of thing players notice.
        if (vehicles.pathLength[id]! === 0) {
          vehicles.state[id] = VehicleState.NoRoute;
          continue;
        }
        if (mayEnter(world, id, vehicles.pathIndex[id]! + 1)) {
          vehicles.state[id] = VehicleState.Driving;
        }
        continue;
      }

      case VehicleState.Driving:
      case VehicleState.Braking: {
        if (vehicles.pathLength[id]! === 0) {
          vehicles.state[id] = VehicleState.NoRoute;
          continue;
        }

        const train = vehicles.kind[id] === VehicleKind.Train;
        if (train) claimAhead(world, id);
        const limit = train ? trainSpeedLimit(world, id) : vehicles.maxSpeedMs[id]!;

        const remaining = remainingDistanceM(world, id);
        const braking =
          remaining <= brakingDistanceM(vehicles.speedMs[id]!, vehicles.brakeMs2[id]!);
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
        if (held) continue;
        if (train) releaseBehind(world, id);

        const atEnd = vehicles.pathIndex[id]! + 1 >= vehicles.pathLength[id]!;
        if (!atEnd) continue;

        vehicles.progressM[id] = 0;
        if (vehicles.speedMs[id]! > STOPPED_SPEED_MS) continue; // still rolling out

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

/**
 * Put cargo produced nearby into a station, respecting its capacity.
 * Returns how much was actually taken - which is what tells an industry
 * whether anybody is collecting from it.
 */
export function depositAtStation(
  station: Station,
  cargo: Cargo,
  amount: number,
  tick: number,
): number {
  if (amount <= 0) return 0;

  let waiting = 0;
  for (const stack of station.waiting) waiting += stack.amount;

  const space = STATION_CARGO_CAPACITY - waiting;
  if (space <= 0) {
    station.overflowUnits += amount;
    return 0;
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
  return accepted;
}
