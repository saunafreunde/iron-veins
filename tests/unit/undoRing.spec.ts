import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason, type Command } from '../../src/sim/commands/types';
import {
  NOT_UNDOABLE,
  UNDOABLE_KINDS,
  isUndoable,
  patchCommand,
} from '../../src/sim/commands/undo';
import {
  Difficulty,
  MapClimate,
  TILE_PUBLIC,
  TICKS_PER_YEAR,
  UNDO_RING_DEPTH,
} from '../../src/sim/constants';
import { ROAD_COST_PER_TILE_CT } from '../../src/sim/constants';
import { Account } from '../../src/sim/economy/ledger';
import type { TileMap } from '../../src/sim/map/TileMap';
import { roadBuildableAt } from '../../src/sim/net/roadBuilder';
import { parseCommand } from '../../src/sim/save/format';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The session ring of SPEC2 M25 (E-12), and the three claims it rests on.
 *
 * The hash assertion the milestone is accepted against lives in
 * `tests/determinism/undoRedo.spec.ts`. What is held HERE is everything that
 * makes that assertion safe to believe:
 *
 *  - the ring is NOT world state - the same commands reach the same world hash
 *    whether the recorder was running or not, which is the whole reason this
 *    milestone spends no `SAVE_VERSION` bump;
 *  - the undoable set is CLOSED and its complement carries a reason each, so a
 *    command kind added later cannot quietly become undoable, or quietly stop
 *    being it (the D-133/D-183 shape);
 *  - the money it puts back is the amount that was HISTORICALLY BOOKED (D-092)
 *    and not a price recomputed at undo time.
 */

const SIZE = 128;
const SEED = 20_260_812;

function createWorld(recording: boolean): World {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: SIZE,
    companyName: 'Rueckbau AG',
    companyColorIndex: 1,
  });
  world.undo.enabled = recording;
  return world;
}

function run(world: World, queue: CommandQueue, command: Command, companyId = 0): string | null {
  queue.enqueue(command, world.tick, companyId);
  let rejected: string | null = null;
  world.drainCommands(queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

/** Straight runs of six tiles a road may be laid along, on distinct rows. */
function roadRuns(map: TileMap, count: number): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  for (let y = 4; y < map.size - 4 && found.length < count; y += 2) {
    for (let x = 4; x < map.size - 12; x++) {
      let ok = true;
      for (let i = 0; i < 6 && ok; i++) {
        const tile = map.tileIndex(x + i, y);
        ok =
          roadBuildableAt(map, x + i, y) === null &&
          map.roadBits[tile] === 0 &&
          map.trackBits[tile] === 0 &&
          map.owner[tile] === TILE_PUBLIC;
      }
      if (ok) {
        found.push({ x, y });
        break;
      }
    }
  }
  return found;
}

function roadCommand(at: { x: number; y: number }): Command {
  return { kind: CommandKind.BuildRoad, x1: at.x, y1: at.y, x2: at.x + 5, y2: at.y };
}

// ------------------------------------------------------- the set is closed

describe('the undoable set is closed and its complement is argued', () => {
  const names = Object.keys(CommandKind);

  it('every command kind is either undoable or has a written reason not to be', () => {
    const undoable = new Set(UNDOABLE_KINDS);
    const missing: string[] = [];
    for (const name of names) {
      const kind = CommandKind[name as keyof typeof CommandKind];
      const listed = NOT_UNDOABLE[name] !== undefined;
      if (undoable.has(kind) && listed) missing.push(`${name} is on both lists`);
      if (!undoable.has(kind) && !listed) missing.push(`${name} is on neither list`);
    }
    expect(missing).toEqual([]);
  });

  it('names no kind the game does not have', () => {
    for (const name of Object.keys(NOT_UNDOABLE)) expect(names).toContain(name);
    for (const kind of UNDOABLE_KINDS) expect(Object.values(CommandKind)).toContain(kind);
  });

  it('gives every refusal a reason worth reading', () => {
    for (const [name, reason] of Object.entries(NOT_UNDOABLE)) {
      expect(reason.length, name).toBeGreaterThan(8);
    }
  });

  it('records only build, demolition and terraform', () => {
    // E-12's own sentence, read back off the table rather than trusted: every
    // undoable kind's name begins with one of the three verbs the decision
    // names, and no other kind does.
    for (const kind of UNDOABLE_KINDS) {
      const name = names.find((entry) => CommandKind[entry as keyof typeof CommandKind] === kind)!;
      expect(
        /^(Build|Demolish|Raise|Lower|Level|Terraform)/.test(name),
        `${name} is not a build, a demolition or a terraform`,
      ).toBe(true);
    }
    expect(isUndoable(CommandKind.BuyRoadVehicle)).toBe(false);
    expect(isUndoable(CommandKind.ApplyPatch)).toBe(false);
  });
});

// --------------------------------------------------- the ring is not the world

describe('the ring is issuer memory, not world state', () => {
  it('reaches the identical world hash with the recorder off', () => {
    // The claim the missing save bump rests on. If recording moved one byte of
    // the world, a game played with the interface open would fingerprint
    // differently from the same game played headless - and every pin in this
    // repository was recorded headless.
    const recorded = createWorld(true);
    const plain = createWorld(false);
    const recordedQueue = new CommandQueue();
    const plainQueue = new CommandQueue();
    const runs = roadRuns(recorded.map, 6);
    expect(runs.length).toBe(6);

    for (const at of runs) {
      expect(run(recorded, recordedQueue, roadCommand(at))).toBeNull();
      expect(run(plain, plainQueue, roadCommand(at))).toBeNull();
    }
    while (recorded.tick < 400) recorded.step(recordedQueue, null);
    while (plain.tick < 400) plain.step(plainQueue, null);

    expect(recorded.undo.undoStack.length).toBe(6);
    expect(plain.undo.undoStack.length).toBe(0);
    expect(hashWorld(recorded)).toBe(hashWorld(plain));
  });

  it('is read by nobody in the simulation but the issuer', () => {
    // The structural half of the same claim, in the shape `throughput.spec.ts`
    // and `flowExport.spec.ts` already use: what an `ApplyPatch` does is
    // decided by its payload, so the only file that may READ the stacks is the
    // one that turns a player's Ctrl+Z into a command.
    const simDir = fileURLToPath(new URL('../../src/sim/', import.meta.url));
    const allowed = ['commands/undo.ts', 'SimWorker.ts'];
    const offenders: string[] = [];
    for (const name of readdirSync(simDir, { recursive: true, encoding: 'utf-8' })) {
      if (!name.endsWith('.ts')) continue;
      const relative = name.split('\\').join('/');
      if (allowed.includes(relative)) continue;
      const source = readFileSync(join(simDir, name), 'utf-8');
      if (/undoStack|redoStack/.test(source)) offenders.push(relative);
    }
    expect(offenders).toEqual([]);
  });

  it('records nothing for a competitor and nothing for a refusal', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    const runs = roadRuns(world.map, 2);

    // A competitor's build: recorded by nobody, because nobody will ever undo
    // a quarter century of AI construction and a diff per command would be a
    // cost every balance run pays for an interactive feature.
    world.companies.push({ ...world.companies[0]!, id: 1 });
    expect(run(world, queue, roadCommand(runs[0]!), 1)).toBeNull();
    expect(world.undo.undoStack.length).toBe(0);

    // A refusal changed nothing, so there is nothing to take back.
    expect(run(world, queue, { kind: CommandKind.DemolishRoad, x: 0, y: 0 })).not.toBeNull();
    expect(world.undo.undoStack.length).toBe(0);
  });
});

// ------------------------------------------------------------- the ring itself

describe('the ring is fifty deep, last in first out', () => {
  it('drops the oldest entry past the depth', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    const runs = roadRuns(world.map, UNDO_RING_DEPTH + 5);
    expect(runs.length).toBe(UNDO_RING_DEPTH + 5);

    for (const at of runs) expect(run(world, queue, roadCommand(at))).toBeNull();
    expect(world.undo.undoStack.length).toBe(UNDO_RING_DEPTH);
    // The newest is the top, and the five oldest are simply gone - a ring
    // that dropped the newest would take back the wrong edit.
    const newest = world.undo.undoStack[UNDO_RING_DEPTH - 1]!;
    expect(newest.sourceKind).toBe(CommandKind.BuildRoad);
    expect(run(world, queue, patchCommand(newest, -1))).toBeNull();
  });

  it('forgets every redo the moment a new command is recorded', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    const runs = roadRuns(world.map, 2);

    expect(run(world, queue, roadCommand(runs[0]!))).toBeNull();
    const first = world.undo.undoStack.pop()!;
    expect(run(world, queue, patchCommand(first, -1))).toBeNull();
    world.undo.redoStack.push(first);

    expect(run(world, queue, roadCommand(runs[1]!))).toBeNull();
    expect(world.undo.redoStack.length, 'the branch the redo would replay is gone').toBe(0);
  });

  it('clears itself rather than remember an edit it could not record', () => {
    // The overflow branch, reached by lowering the cap: no command this game
    // HAS produces a diff of forty thousand cells (measured below), so without
    // the injection this would be code nobody had ever seen run.
    const world = createWorld(true);
    const queue = new CommandQueue();
    const runs = roadRuns(world.map, 2);

    expect(run(world, queue, roadCommand(runs[0]!))).toBeNull();
    expect(world.undo.undoStack.length).toBe(1);

    world.undo.maxCells = 4;
    expect(run(world, queue, roadCommand(runs[1]!))).toBeNull();
    expect(world.undo.undoStack.length, 'the ring kept an entry under an unrecordable one').toBe(0);
  });

  it('keeps the largest edit the game can make well inside the cap', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    // A maximum brush on generated ground - the worst case
    // `UNDO_MAX_PATCH_CELLS` is derived from.
    let recorded = 0;
    for (let attempt = 0; attempt < 40 && recorded === 0; attempt++) {
      const x = 20 + attempt * 2;
      const outcome = run(world, queue, {
        kind: CommandKind.TerraformBrushRegion,
        x,
        y: 40,
        radius: 8,
        direction: 1,
      });
      if (outcome === null) recorded = world.undo.undoStack.pop()!.layers.length;
    }
    expect(recorded, 'no maximum brush was accepted anywhere on this map').toBeGreaterThan(0);
    expect(recorded).toBeLessThan(world.undo.maxCells);
  });
});

// ---------------------------------------------------------------- the money

describe('the refund is the amount that was booked', () => {
  it('puts back the inflated price of the year the build happened', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    // Five game years on, so the price level has moved and "the historically
    // booked amount" (D-092) is a different number from the catalogue price.
    // The tick is set rather than played: this measures what the RECORDER put
    // in the patch, and playing five years would measure the economy.
    world.tick = 5 * TICKS_PER_YEAR;
    const at = roadRuns(world.map, 1)[0]!;

    const cashBefore = world.companies[0]!.cashCt;
    expect(run(world, queue, roadCommand(at))).toBeNull();
    const charged = cashBefore - world.companies[0]!.cashCt;
    const listPrice = 6 * ROAD_COST_PER_TILE_CT;
    expect(charged, 'the price level did not move, so the case is vacuous').toBeGreaterThan(
      listPrice,
    );

    const patch = world.undo.undoStack.pop()!;
    // The patch carries what was BOOKED - cash, the year's profit, the month's
    // expenses and the construction account - rather than anything an undo
    // would have to recompute.
    expect(patch.money[0]).toBe(-charged);
    expect(patch.money[1]).toBe(-charged);
    expect(patch.money[2]).toBe(charged);
    expect(patch.money[7 + Account.Construction]).toBe(charged);

    expect(run(world, queue, patchCommand(patch, -1))).toBeNull();
    expect(world.companies[0]!.cashCt).toBe(cashBefore);
    expect(world.companies[0]!.accounts[Account.Construction]).toBe(0);
  });
});

// ------------------------------------------------------------- the wire form

describe('a recorded patch survives the save log', () => {
  it('round-trips through the one command parser', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    const at = roadRuns(world.map, 1)[0]!;
    expect(run(world, queue, roadCommand(at))).toBeNull();

    const command = patchCommand(world.undo.undoStack.pop()!, -1);
    const parsed = parseCommand(JSON.parse(JSON.stringify(command)), 'undo');
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(command));
  });

  it('refuses a payload whose parallel arrays disagree', () => {
    const world = createWorld(true);
    const queue = new CommandQueue();
    const at = roadRuns(world.map, 1)[0]!;
    expect(run(world, queue, roadCommand(at))).toBeNull();
    const patch = world.undo.undoStack.pop()!;

    const ragged = { ...patchCommand(patch, -1), after: [1] };
    expect(run(world, queue, ragged)).toBe(RejectReason.InvalidPatch);
    const nonsenseDirection = { ...patchCommand(patch, -1), direction: 0 };
    expect(run(world, queue, nonsenseDirection)).toBe(RejectReason.InvalidPatch);
  });
});
