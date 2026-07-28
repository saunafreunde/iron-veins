import type { Cargo } from '../cargo/types';
import { COMPANY_COLOR_COUNT, MAX_COMPANY_NAME_LENGTH } from '../constants';
import { bookExpense, repayLoan, takeLoan } from '../economy/company';
import type { ModuleKind } from '../station/types';
import type { OrderLoad, OrderUnload } from '../vehicles/VehicleStore';
import { OrderTarget, VehicleState, type Order } from '../vehicles/VehicleStore';
import type { SignalKind } from '../map/signals';
import type { RailType, TrackDir } from '../map/track';
import {
  buildRailStop,
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
import { startVehicle } from '../vehicles/update';
import { applyTerraform, estimateTerraform, levelTile, TerraformDirection } from '../map/terraform';
import type { World } from '../World';
import { ACCEPTED, CommandKind, RejectReason, type Command, type CommandOutcome } from './types';

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
      const result = levelTile(world.map, command.x, command.y, world.company.cashCt);
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

    case CommandKind.RefitVehicle:
      return refitVehicle(world, command.vehicleId, command.cargo as Cargo);

    case CommandKind.SellVehicle:
      return sellVehicle(world, command.vehicleId);

    case CommandKind.SetVehicleOrders: {
      if (!world.vehicles.isAlive(command.vehicleId)) {
        return { ok: false, reasonKey: RejectReason.NoSuchVehicle };
      }
      const orders: Order[] = [];
      for (const spec of command.orders) {
        if (spec.target === OrderTarget.Station && world.stations[spec.targetId] === undefined) {
          return { ok: false, reasonKey: RejectReason.NoSuchStation };
        }
        orders.push({
          target: spec.target as OrderTarget,
          targetId: spec.targetId,
          load: spec.load as OrderLoad,
          unload: spec.unload as OrderUnload,
        });
      }
      world.vehicles.orders[command.vehicleId] = orders;
      world.vehicles.orderIndex[command.vehicleId] = 0;
      // A route computed for the old orders is meaningless now - and so is any
      // track claimed along it, which would otherwise hold a section for ever.
      releaseAll(world, command.vehicleId);
      world.vehicles.pathLength[command.vehicleId] = 0;
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
        return ACCEPTED;
      }
      if (world.vehicles.orders[id]!.length === 0) {
        return { ok: false, reasonKey: RejectReason.NoOrders };
      }
      if (!startVehicle(world, id)) {
        return { ok: false, reasonKey: RejectReason.NoRouteToStop };
      }
      return ACCEPTED;
    }
  }
}

/** Shared body of the raise and lower commands. */
function terraform(
  world: World,
  x: number,
  y: number,
  direction: TerraformDirection,
): CommandOutcome {
  const estimate = estimateTerraform(world.map, x, y, direction);
  if (!estimate.ok) return { ok: false, reasonKey: estimate.reasonKey ?? '' };
  if (estimate.costCt > world.company.cashCt) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  const result = applyTerraform(world.map, x, y, direction);
  if (!result.ok) return { ok: false, reasonKey: result.reasonKey ?? '' };
  chargeCompany(world, result.costCt);
  return ACCEPTED;
}

/** Book a construction expense against cash, annual profit and the month. */
function chargeCompany(world: World, amountCt: number): void {
  bookExpense(world.company, amountCt);
}
