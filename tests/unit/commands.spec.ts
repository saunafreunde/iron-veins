import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../src/sim/commands/execute';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  CommandKind,
  RejectReason,
  type CommandEnvelope,
  type CommandOutcome,
} from '../../src/sim/commands/types';
import {
  COMPANY_COLOR_COUNT,
  Difficulty,
  MapClimate,
  LOAN_MIN_LIMIT_CT,
  LOAN_STEP_CT,
  MAX_COMPANY_NAME_LENGTH,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { World } from '../../src/sim/World';

/** Small map: these tests exercise commands, not terrain. */
const TEST_MAP_SIZE = 128;

function newWorld(): World {
  return World.create({
    seed: 1,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: TEST_MAP_SIZE,
    companyName: 'Testbahn',
    companyColorIndex: 0,
  });
}

describe('CommandQueue', () => {
  it('hands out commands in enqueue order', () => {
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 10);
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 2 }, 10);

    expect(queue.shiftDue(9)).toBeNull();
    expect(queue.shiftDue(10)?.seq).toBe(0);
    expect(queue.shiftDue(10)?.seq).toBe(1);
    expect(queue.shiftDue(10)).toBeNull();
  });

  it('also releases commands whose tick has already passed', () => {
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 5);
    expect(queue.shiftDue(9)?.tick).toBe(5);
  });

  it('refuses commands that would break the deterministic order', () => {
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 10);
    expect(() => queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 9)).toThrow(
      /older than the last queued tick/,
    );
  });

  it('keeps the executed commands as a replay log', () => {
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 0);
    queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: 1 }, 1);
    queue.shiftDue(0);

    expect(queue.log).toHaveLength(2);
    expect(queue.executedCount).toBe(1);
    expect(queue.pendingCount).toBe(1);
  });

  it('restores a log with its execution position', () => {
    const source = new CommandQueue();
    source.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 0);
    source.enqueue({ kind: CommandKind.RepayLoan, amountCt: 1 }, 4);
    source.shiftDue(0);

    const restored = new CommandQueue();
    restored.loadLog(source.log, source.executedCount);
    expect(restored.executedCount).toBe(1);
    expect(restored.shiftDue(4)?.command.kind).toBe(CommandKind.RepayLoan);
    // Sequence numbers continue where the log left off.
    expect(restored.enqueue({ kind: CommandKind.TakeLoan, amountCt: 1 }, 9).seq).toBe(2);
  });
});

describe('command execution', () => {
  it('renames the company and trims the input', () => {
    const world = newWorld();
    expect(
      executeCommand(world, { kind: CommandKind.SetCompanyName, name: '  Nordbahn  ' }),
    ).toEqual({ ok: true });
    expect(world.company.name).toBe('Nordbahn');
  });

  it('rejects an empty name with a concrete reason', () => {
    const world = newWorld();
    const outcome = executeCommand(world, { kind: CommandKind.SetCompanyName, name: '   ' });
    expect(outcome).toEqual({ ok: false, reasonKey: RejectReason.NameEmpty });
    expect(world.company.name).toBe('Testbahn');
  });

  it('rejects an overlong name', () => {
    const world = newWorld();
    const name = 'x'.repeat(MAX_COMPANY_NAME_LENGTH + 1);
    expect(executeCommand(world, { kind: CommandKind.SetCompanyName, name })).toEqual({
      ok: false,
      reasonKey: RejectReason.NameTooLong,
    });
  });

  it('accepts every colour of the palette and nothing else', () => {
    const world = newWorld();
    for (let index = 0; index < COMPANY_COLOR_COUNT; index++) {
      expect(
        executeCommand(world, { kind: CommandKind.SetCompanyColor, colorIndex: index }),
      ).toEqual({ ok: true });
      expect(world.company.colorIndex).toBe(index);
    }
    for (const invalid of [-1, COMPANY_COLOR_COUNT, 1.5]) {
      expect(
        executeCommand(world, { kind: CommandKind.SetCompanyColor, colorIndex: invalid }),
      ).toEqual({ ok: false, reasonKey: RejectReason.InvalidColor });
    }
  });

  it('reports an exhausted credit line', () => {
    const world = newWorld();
    executeCommand(world, { kind: CommandKind.TakeLoan, amountCt: LOAN_MIN_LIMIT_CT });
    expect(executeCommand(world, { kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT })).toEqual({
      ok: false,
      reasonKey: RejectReason.CreditLimitReached,
    });
  });

  it('reports that there is nothing to repay', () => {
    const world = newWorld();
    expect(executeCommand(world, { kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT })).toEqual({
      ok: false,
      reasonKey: RejectReason.NothingToRepay,
    });
  });
});

describe('World.step', () => {
  it('executes a command exactly at its tick, before time advances', () => {
    const world = newWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Sued-West-Bahn' }, 3);

    for (let i = 0; i < 3; i++) world.step(queue, null);
    expect(world.company.name).toBe('Testbahn');
    expect(world.tick).toBe(3);

    world.step(queue, null);
    expect(world.company.name).toBe('Sued-West-Bahn');
    expect(world.tick).toBe(4);
  });

  it('reports outcomes to the sink', () => {
    const world = newWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, 0);

    const seen: Array<[CommandEnvelope, CommandOutcome]> = [];
    world.step(queue, (envelope, outcome) => seen.push([envelope, outcome]));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[1]).toEqual({ ok: false, reasonKey: RejectReason.NothingToRepay });
  });

  it('applies commands while paused without advancing time', () => {
    const world = newWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.SetCompanyColor, colorIndex: 5 }, 0);

    world.drainCommands(queue, null);
    expect(world.company.colorIndex).toBe(5);
    expect(world.tick).toBe(0);
  });

  it('books loan interest at every month boundary', () => {
    const world = newWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_MIN_LIMIT_CT }, 0);

    for (let i = 0; i < TICKS_PER_MONTH; i++) world.step(queue, null);
    expect(world.company.profitThisYearCt).toBe(-100_000);

    for (let i = 0; i < TICKS_PER_MONTH; i++) world.step(queue, null);
    expect(world.company.profitThisYearCt).toBe(-200_000);
  });

  it('closes the financial year after twelve months of interest', () => {
    const world = newWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_MIN_LIMIT_CT }, 0);

    for (let i = 0; i < TICKS_PER_YEAR; i++) world.step(queue, null);
    expect(world.company.lastYearProfitCt).toBe(-1_200_000);
    expect(world.company.profitThisYearCt).toBe(0);
  });
});
