import { CARGO_COUNT, type Cargo } from '../cargo/types';
import {
  COMPANY_COLOR_COUNT,
  MAX_COMPANY_NAME_LENGTH,
  MAX_ORDERS_PER_VEHICLE,
  MAX_ORDER_WAIT_TICKS,
  TAKT_MAX_TICKS,
  TAKT_MIN_TICKS,
} from '../constants';
import { bookExpense, repayLoan, takeLoan } from '../economy/company';
import type { ModuleKind } from '../station/types';
import { waypointServes } from '../map/waypoints';
import { reAnchorVehicle, releaseVehicle, scheduleOf } from '../lines/LineStore';
import { clearStopHolds } from '../lines/takt';
import { refitCapacity } from '../vehicles/refit';
import {
  OrderComparator,
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
  type Order,
} from '../vehicles/VehicleStore';
import type { SignalKind } from '../map/signals';
import type { RailType, TrackDir } from '../map/track';
import {
  buildRailStop,
  buildStationModule,
  buildAirport,
  buildWaterStop,
  buildWaypoint,
  demolishWaypoint,
  demolishBuilding,
  buyAircraft,
  buyShip,
  buildSignal,
  demolishSignal,
  buildRoad,
  buildRoadStop,
  buildTrack,
  buyRoadVehicle,
  buyTrain,
  demolishRoad,
  demolishTrack,
  refitVehicle,
  sellVehicle,
} from './build';
import { releaseAll } from '../vehicles/reservations';
import { divertToDepot, startVehicle } from '../vehicles/update';
import { applyTerraform, estimateTerraform, levelTile, TerraformDirection } from '../map/terraform';
import { acceptContract, isOpen } from '../economy/contracts';
import { applyTownMeasure, buyExclusiveRights } from '../town/measures';
import type { TownMeasure } from '../town/council';
import type { World } from '../World';
import {
  ACCEPTED,
  CommandKind,
  RejectReason,
  type Command,
  type CommandOutcome,
  type OrderSpec,
} from './types';

/**
 * Apply one command to the world. Pure with respect to everything outside
 * `world`: the same world plus the same command always produces the same
 * mutation and the same outcome, which is what keeps replays exact.
 */
export function executeCommand(world: World, command: Command): CommandOutcome {
  switch (command.kind) {
    case CommandKind.SetCompanyName: {
      const name = command.name.trim();
      if (name.length === 0) return { ok: false, reasonKey: RejectReason.NameEmpty };
      if (name.length > MAX_COMPANY_NAME_LENGTH) {
        return { ok: false, reasonKey: RejectReason.NameTooLong };
      }
      world.company.name = name;
      return ACCEPTED;
    }

    case CommandKind.SetCompanyColor: {
      const index = command.colorIndex;
      if (!Number.isInteger(index) || index < 0 || index >= COMPANY_COLOR_COUNT) {
        return { ok: false, reasonKey: RejectReason.InvalidColor };
      }
      world.company.colorIndex = index;
      return ACCEPTED;
    }

    case CommandKind.TakeLoan: {
      const granted = takeLoan(world.company, command.amountCt);
      if (granted === 0) return { ok: false, reasonKey: RejectReason.CreditLimitReached };
      return ACCEPTED;
    }

    case CommandKind.RepayLoan: {
      const repaid = repayLoan(world.company, command.amountCt);
      if (repaid === 0) return { ok: false, reasonKey: RejectReason.NothingToRepay };
      return ACCEPTED;
    }

    case CommandKind.RaiseLand:
      return terraform(world, command.x, command.y, TerraformDirection.Raise);

    case CommandKind.LowerLand:
      return terraform(world, command.x, command.y, TerraformDirection.Lower);

    case CommandKind.LevelLand: {
      const result = levelTile(
        world.map,
        command.x,
        command.y,
        world.company.cashCt,
        world.company.id,
      );
      if (!result.ok) return { ok: false, reasonKey: result.reasonKey ?? '' };
      chargeCompany(world, result.costCt);
      return ACCEPTED;
    }

    case CommandKind.BuildTrack:
      return buildTrack(
        world,
        command.x1,
        command.y1,
        command.x2,
        command.y2,
        command.railType as RailType,
        command.assistant,
        command.signalSpacing,
      );

    case CommandKind.DemolishTrack:
      return demolishTrack(world, command.x, command.y);

    case CommandKind.BuildRoad:
      return buildRoad(world, command.x1, command.y1, command.x2, command.y2);

    case CommandKind.DemolishRoad:
      return demolishRoad(world, command.x, command.y);

    case CommandKind.BuildRoadStop:
      return buildRoadStop(world, command.x, command.y, command.moduleKind as ModuleKind);

    case CommandKind.BuildRailStop:
      return buildRailStop(world, command.x, command.y, command.moduleKind as ModuleKind);

    case CommandKind.AcceptContract: {
      const contract = world.contracts.find((entry) => entry.id === command.contractId);
      if (contract === undefined) return { ok: false, reasonKey: RejectReason.NoSuchContract };
      if (!isOpen(world, contract)) return { ok: false, reasonKey: RejectReason.ContractClosed };
      if (contract.acceptedBy.includes(world.company.id)) {
        return { ok: false, reasonKey: RejectReason.AlreadyAccepted };
      }
      acceptContract(contract, world.company.id);
      return ACCEPTED;
    }

    case CommandKind.BuyExclusiveRights:
      return buyExclusiveRights(world, command.townId);

    case CommandKind.ApplyTownMeasure:
      return applyTownMeasure(world, command.townId, command.measure as TownMeasure);

    case CommandKind.DemolishBuilding:
      return demolishBuilding(world, command.x, command.y);

    case CommandKind.BuildAirport:
      return buildAirport(world, command.x, command.y, command.moduleKind as ModuleKind);

    case CommandKind.BuyAircraft:
      return buyAircraft(world, command.x, command.y, command.specId);

    case CommandKind.BuildWaterStop:
      return buildWaterStop(world, command.x, command.y, command.moduleKind as ModuleKind);

    case CommandKind.BuyShip:
      return buyShip(world, command.x, command.y, command.specId);

    case CommandKind.SetAutoRenew: {
      // Per line since M11 (section 11.3 always attached it there; D-093 was
      // the stopgap). -1 - what a pre-M11 log entry parses to - addresses
      // every line the acting company owns, and is a quiet success even with
      // none: an old recorded command must stay a command, not a refusal.
      const flag = command.enabled ? 1 : 0;
      if (command.lineId >= 0) {
        if (!world.lines.isAlive(command.lineId)) {
          return { ok: false, reasonKey: RejectReason.NoSuchLine };
        }
        if (world.lines.ownerId[command.lineId] !== world.company.id) {
          return { ok: false, reasonKey: RejectReason.NotYours };
        }
        world.lines.autoRenew[command.lineId] = flag;
        return ACCEPTED;
      }
      for (let lineId = 0; lineId < world.lines.count; lineId++) {
        if (world.lines.alive[lineId] !== 1) continue;
        if (world.lines.ownerId[lineId] !== world.company.id) continue;
        world.lines.autoRenew[lineId] = flag;
      }
      return ACCEPTED;
    }

    case CommandKind.CreateLine: {
      const lineId = world.lines.create(world.company.id);
      if (lineId < 0) return { ok: false, reasonKey: RejectReason.TooManyLines };
      world.vehicles.ordersRevision++;
      return ACCEPTED;
    }

    case CommandKind.DeleteLine: {
      if (!world.lines.isAlive(command.lineId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchLine };
      }
      if (world.lines.ownerId[command.lineId] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      // Every vehicle keeps a private copy of the list it was running, so
      // deleting a line never strands a fleet - it merely stops sharing.
      for (let id = 0; id < world.vehicles.count; id++) {
        if (world.vehicles.alive[id] !== 1) continue;
        if (world.vehicles.lineId[id] !== command.lineId) continue;
        releaseVehicle(world, id);
      }
      world.lines.destroy(command.lineId);
      world.vehicles.ordersRevision++;
      world.cargoLinks.refreshLinks(world);
      return ACCEPTED;
    }

    case CommandKind.SetLineOrders: {
      if (!world.lines.isAlive(command.lineId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchLine };
      }
      if (world.lines.ownerId[command.lineId] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      if (command.orders.length > MAX_ORDERS_PER_VEHICLE) {
        return { ok: false, reasonKey: RejectReason.TooManyOrders };
      }
      // The list must fit EVERY vehicle currently on the line - a refit no
      // wagon can carry or a waypoint of the wrong mode is refused at set
      // time, not discovered at a platform months later.
      const assigned: number[] = [];
      for (let id = 0; id < world.vehicles.count; id++) {
        if (world.vehicles.alive[id] === 1 && world.vehicles.lineId[id] === command.lineId) {
          assigned.push(id);
        }
      }
      const orders: Order[] = [];
      for (const spec of command.orders) {
        const outcome = validateOrder(world, assigned, spec, command.orders.length, orders);
        if (outcome !== null) return { ok: false, reasonKey: outcome };
      }
      world.lines.orders[command.lineId] = orders;
      // Every vehicle of the line switches THIS tick - they all read the one
      // array - and re-anchors to its nearest stop (lines/LineStore.ts).
      for (const id of assigned) reAnchorVehicle(world, id);
      world.vehicles.ordersRevision++;
      world.cargoLinks.refreshLinks(world);
      return ACCEPTED;
    }

    case CommandKind.AssignVehicleToLine: {
      const id = command.vehicleId;
      if (!world.vehicles.isAlive(id)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      if (world.vehicles.ownerId[id] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      if (!world.lines.isAlive(command.lineId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchLine };
      }
      if (world.lines.ownerId[command.lineId] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      // The vehicle must be able to RUN the list it is joining, by the same
      // rules the list was validated under.
      for (const order of world.lines.orders[command.lineId]!) {
        if (order.target === OrderTarget.Waypoint) {
          const kind = world.map.waypoint[order.targetId]!;
          if (!waypointServes(kind, world.vehicles.kind[id]!)) {
            return { ok: false, reasonKey: RejectReason.NoSuchWaypoint };
          }
        }
        if (order.refitTo >= 0 && refitCapacity(world.vehicles, id, order.refitTo as Cargo) <= 0) {
          return { ok: false, reasonKey: RejectReason.CannotCarry };
        }
      }
      // Reassignment is release plus assign in one: the private list goes,
      // the line's list takes over, and the vehicle re-anchors on it.
      world.vehicles.lineId[id] = command.lineId;
      world.vehicles.orders[id] = [];
      reAnchorVehicle(world, id);
      world.vehicles.ordersRevision++;
      world.cargoLinks.refreshLinks(world);
      return ACCEPTED;
    }

    case CommandKind.ReleaseVehicleFromLine: {
      const id = command.vehicleId;
      if (!world.vehicles.isAlive(id)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      if (world.vehicles.ownerId[id] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      if (world.vehicles.lineId[id]! < 0) {
        return { ok: false, reasonKey: RejectReason.NothingToDo };
      }
      // The private copy means NOTHING about the journey changes: same list,
      // same position in it, same route - only the sharing ends.
      releaseVehicle(world, id);
      world.vehicles.ordersRevision++;
      return ACCEPTED;
    }

    case CommandKind.SetLineTakt: {
      if (!world.lines.isAlive(command.lineId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchLine };
      }
      if (world.lines.ownerId[command.lineId] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      const takt = command.taktTicks;
      const offset = command.offsetTicks;
      if (!Number.isInteger(takt) || !Number.isInteger(offset)) {
        return { ok: false, reasonKey: RejectReason.InvalidTakt };
      }
      if (takt === 0) {
        if (offset !== 0) return { ok: false, reasonKey: RejectReason.InvalidTakt };
      } else if (takt < TAKT_MIN_TICKS || takt > TAKT_MAX_TICKS || offset < 0 || offset >= takt) {
        return { ok: false, reasonKey: RejectReason.InvalidTakt };
      }
      world.lines.taktTicks[command.lineId] = takt;
      world.lines.taktOffsetTicks[command.lineId] = offset;
      // Slots latched under the old grid mean nothing under the new one. The
      // vehicles re-latch at their next arrival; one already waiting re-reads
      // the line every tick and runs on by itself when the takt went off.
      for (let id = 0; id < world.vehicles.count; id++) {
        if (world.vehicles.alive[id] !== 1) continue;
        if (world.vehicles.lineId[id] !== command.lineId) continue;
        world.vehicles.taktDueTick[id] = -1;
      }
      world.vehicles.ordersRevision++;
      return ACCEPTED;
    }

    case CommandKind.SetTransferNode: {
      const station = world.stations[command.stationId];
      if (station === undefined) {
        return { ok: false, reasonKey: RejectReason.NoSuchStation };
      }
      if (station.ownerId !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      station.transferNode = command.transferNode;
      return ACCEPTED;
    }

    case CommandKind.BuildStationModule:
      return buildStationModule(world, command.x, command.y, command.moduleKind as ModuleKind);

    case CommandKind.BuyRoadVehicle:
      return buyRoadVehicle(world, command.x, command.y, command.specId);

    case CommandKind.BuyTrain:
      return buyTrain(world, command.x, command.y, command.specIds);

    case CommandKind.BuildSignal:
      return buildSignal(
        world,
        command.x,
        command.y,
        command.signalKind as SignalKind,
        command.direction as TrackDir,
      );

    case CommandKind.DemolishSignal:
      return demolishSignal(world, command.x, command.y);

    case CommandKind.BuildWaypoint:
      return buildWaypoint(world, command.x, command.y);

    case CommandKind.DemolishWaypoint:
      return demolishWaypoint(world, command.x, command.y);

    case CommandKind.RefitVehicle:
      return refitVehicle(world, command.vehicleId, command.cargo as Cargo);

    case CommandKind.SellVehicle:
      return sellVehicle(world, command.vehicleId);

    case CommandKind.SetVehicleOrders: {
      if (!world.vehicles.isAlive(command.vehicleId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      if (command.orders.length > MAX_ORDERS_PER_VEHICLE) {
        return { ok: false, reasonKey: RejectReason.TooManyOrders };
      }
      const orders: Order[] = [];
      for (const spec of command.orders) {
        const outcome = validateOrder(
          world,
          [command.vehicleId],
          spec,
          command.orders.length,
          orders,
        );
        if (outcome !== null) return { ok: false, reasonKey: outcome };
      }
      // A private schedule takes the vehicle OFF its line: two authors of one
      // vehicle's orders would mean asking which list wins every stop, so an
      // explicit per-vehicle edit is an implicit release (section 12.2, M11).
      world.vehicles.lineId[command.vehicleId] = -1;
      world.vehicles.orders[command.vehicleId] = orders;
      world.vehicles.orderIndex[command.vehicleId] = 0;
      world.vehicles.ordersRevision++;
      // A route computed for the old orders is meaningless now - and so is any
      // track claimed along it, which would otherwise hold a section for ever.
      releaseAll(world, command.vehicleId);
      world.vehicles.pathLength[command.vehicleId] = 0;
      // The leg in progress is no longer a leg of anything, and the connections
      // the fleet runs have just changed - cargo produced today has to be able
      // to see the new line rather than wait a day for it (section 7.4).
      forgetTrip(world, command.vehicleId);
      world.cargoLinks.refreshLinks(world);
      return ACCEPTED;
    }

    case CommandKind.SetVehicleRunning: {
      const id = command.vehicleId;
      if (!world.vehicles.isAlive(id)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      if (!command.running) {
        world.vehicles.state[id] = VehicleState.Stopped;
        world.vehicles.speedMs[id] = 0;
        // Stopping is the player taking the wheel back, so it also cancels an
        // outstanding depot call - the one documented way out of a diversion
        // whose shed has become unreachable (SPEC2 M14).
        world.vehicles.depotCall[id] = 0;
        forgetTrip(world, id);
        // A parked vehicle owes no slot and holds no departure (12.3).
        clearStopHolds(world, id);
        return ACCEPTED;
      }
      if (scheduleOf(world, id).length === 0) {
        return { ok: false, reasonKey: RejectReason.NoOrders };
      }
      if (!startVehicle(world, id)) {
        return { ok: false, reasonKey: RejectReason.NoRouteToStop };
      }
      return ACCEPTED;
    }

    case CommandKind.SendVehicleToDepot: {
      const id = command.vehicleId;
      if (!world.vehicles.isAlive(id)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      if (world.vehicles.ownerId[id] !== world.company.id) {
        return { ok: false, reasonKey: RejectReason.NotYours };
      }
      // The trip in progress is abandoned, so its measurement is too: the leg
      // that ends after a shed detour is not the leg the line drives (D-077).
      forgetTrip(world, id);
      divertToDepot(world, id);
      return ACCEPTED;
    }
  }
}

/**
 * Validate one order of the 12.1 grammar and append its canonical record.
 *
 * Returns the rejection key, or null when the order is sound. `listLength` is
 * the length the WHOLE list will have, because a jump may point forward at an
 * order that has not been validated yet. `vehicleIds` are the vehicles that
 * will RUN the list - the one vehicle of a private schedule, or every vehicle
 * currently assigned to a line - and the mode- and capacity-dependent checks
 * hold against each of them. Every refusal names the concrete problem
 * (section 17.3).
 */
function validateOrder(
  world: World,
  vehicleIds: readonly number[],
  spec: OrderSpec,
  listLength: number,
  out: Order[],
): string | null {
  const isInt = (value: number): boolean => Number.isInteger(value);

  if (!isInt(spec.target) || spec.target < OrderTarget.Station || spec.target > OrderTarget.Waypoint) {
    return RejectReason.InvalidOrder;
  }
  if (!isInt(spec.targetId)) return RejectReason.InvalidOrder;
  if (spec.target === OrderTarget.Station && world.stations[spec.targetId] === undefined) {
    return RejectReason.NoSuchStation;
  }
  if (spec.target === OrderTarget.Depot || spec.target === OrderTarget.Waypoint) {
    if (spec.targetId < 0 || spec.targetId >= world.map.tileCount) {
      return RejectReason.InvalidOrder;
    }
  }
  if (spec.target === OrderTarget.Waypoint) {
    const kind = world.map.waypoint[spec.targetId]!;
    for (const vehicleId of vehicleIds) {
      if (!waypointServes(kind, world.vehicles.kind[vehicleId]!)) {
        return RejectReason.NoSuchWaypoint;
      }
    }
  }

  if (!isInt(spec.load) || spec.load < OrderLoad.Full || spec.load > OrderLoad.FullAny) {
    return RejectReason.InvalidOrder;
  }
  if (!isInt(spec.unload) || spec.unload < OrderUnload.All || spec.unload > OrderUnload.Forced) {
    return RejectReason.InvalidOrder;
  }

  const refitTo = spec.refitTo ?? -1;
  if (!isInt(refitTo) || refitTo < -1 || refitTo >= CARGO_COUNT) {
    return RejectReason.InvalidOrder;
  }
  // The RefitVehicle validator's own capacity rule, asked at set time: an
  // order that can never be carried out is refused here, not discovered at a
  // platform months later.
  if (refitTo >= 0) {
    for (const vehicleId of vehicleIds) {
      if (refitCapacity(world.vehicles, vehicleId, refitTo as Cargo) <= 0) {
        return RejectReason.CannotCarry;
      }
    }
  }

  const waitTicks = spec.waitTicks ?? 0;
  if (!isInt(waitTicks) || waitTicks < 0 || waitTicks > MAX_ORDER_WAIT_TICKS) {
    return RejectReason.InvalidOrder;
  }

  const condKind = spec.condKind ?? OrderConditionKind.None;
  if (
    !isInt(condKind) ||
    condKind < OrderConditionKind.None ||
    condKind > OrderConditionKind.DateYear
  ) {
    return RejectReason.InvalidOrder;
  }
  let condComparator = 0;
  let condValue = 0;
  let condJumpTo = 0;
  if (condKind !== OrderConditionKind.None) {
    condComparator = spec.condComparator ?? 0;
    condValue = spec.condValue ?? 0;
    condJumpTo = spec.condJumpTo ?? 0;
    if (
      !isInt(condComparator) ||
      condComparator < OrderComparator.Less ||
      condComparator > OrderComparator.Greater
    ) {
      return RejectReason.InvalidOrder;
    }
    if (!Number.isFinite(condValue)) return RejectReason.InvalidOrder;
    if (!isInt(condJumpTo) || condJumpTo < 0 || condJumpTo >= listLength) {
      return RejectReason.BadJumpTarget;
    }
  }

  out.push({
    target: spec.target as OrderTarget,
    targetId: spec.targetId,
    load: spec.load as OrderLoad,
    unload: spec.unload as OrderUnload,
    refitTo,
    waitTicks,
    condKind,
    condComparator,
    condValue,
    condJumpTo,
  });
  return null;
}

/**
 * Forget the leg a vehicle was part way through.
 *
 * The time between the arrival before an interruption and the arrival after it
 * is not a measurement of how long that leg takes - it is a measurement of how
 * long the vehicle was stopped - and averaging it in would make the line look
 * unusable to every parcel deciding where to go.
 */
function forgetTrip(world: World, id: number): void {
  world.vehicles.lastStationId[id] = -1;
  world.vehicles.lastArrivalTick[id] = -1;
}

/**
 * Shared body of the raise and lower commands.
 *
 * The acting company travels into the guard: ground under ANY infrastructure
 * is refused, and ground under another company's infrastructure is refused
 * with its own reason (SPEC2 E-11, D-104). Every refusal reaches the player
 * as a concrete sentence (section 17.3).
 */
function terraform(
  world: World,
  x: number,
  y: number,
  direction: TerraformDirection,
): CommandOutcome {
  const estimate = estimateTerraform(world.map, x, y, direction, world.company.id);
  if (!estimate.ok) return { ok: false, reasonKey: estimate.reasonKey ?? '' };
  if (world.costCt(estimate.costCt) > world.company.cashCt) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  const result = applyTerraform(world.map, x, y, direction, world.company.id);
  if (!result.ok) return { ok: false, reasonKey: result.reasonKey ?? '' };
  chargeCompany(world, world.costCt(result.costCt));
  return ACCEPTED;
}

/** Book a construction expense against cash, annual profit and the month. */
function chargeCompany(world: World, amountCt: number): void {
  bookExpense(world.company, amountCt);
}
