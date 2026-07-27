import { COMPANY_COLOR_COUNT, MAX_COMPANY_NAME_LENGTH } from '../constants';
import { repayLoan, takeLoan } from '../economy/company';
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

/** Book a construction expense against cash and the running annual profit. */
function chargeCompany(world: World, amountCt: number): void {
  world.company.cashCt -= amountCt;
  world.company.profitThisYearCt -= amountCt;
}
