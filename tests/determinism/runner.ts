import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Difficulty, MapClimate } from '../../src/sim/constants';
import { hashWorld, World } from '../../src/sim/World';

/** One entry of a recorded scenario: a command and the tick it runs on. */
export interface ScheduledCommand {
  readonly tick: number;
  readonly command: Command;
}

export interface Scenario {
  readonly world: World;
  readonly queue: CommandQueue;
}

/** Hashes taken at the requested checkpoints, keyed by tick. */
export type CheckpointHashes = Record<number, string>;

/**
 * Turn the JSON fixture into typed commands. Written by hand rather than cast
 * so a malformed fixture fails the test instead of quietly running a different
 * scenario than the one that was recorded.
 */
export function parseScenarioFixture(raw: unknown): ScheduledCommand[] {
  if (!Array.isArray(raw)) throw new Error('fixture: expected an array of scheduled commands');

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`fixture[${index}]: expected an object`);
    }
    const record = entry as Record<string, unknown>;
    const tick = record['tick'];
    if (typeof tick !== 'number' || !Number.isInteger(tick)) {
      throw new Error(`fixture[${index}].tick: expected an integer`);
    }
    return { tick, command: parseCommand(record['command'], index) };
  });
}

function parseCommand(raw: unknown, index: number): Command {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`fixture[${index}].command: expected an object`);
  }
  const record = raw as Record<string, unknown>;
  const kind = record['kind'];

  switch (kind) {
    case CommandKind.SetCompanyName: {
      const name = record['name'];
      if (typeof name !== 'string')
        throw new Error(`fixture[${index}].command.name: expected a string`);
      return { kind: CommandKind.SetCompanyName, name };
    }
    case CommandKind.SetCompanyColor: {
      const colorIndex = record['colorIndex'];
      if (typeof colorIndex !== 'number') {
        throw new Error(`fixture[${index}].command.colorIndex: expected a number`);
      }
      return { kind: CommandKind.SetCompanyColor, colorIndex };
    }
    case CommandKind.TakeLoan:
    case CommandKind.RepayLoan: {
      const amountCt = record['amountCt'];
      if (typeof amountCt !== 'number' || !Number.isInteger(amountCt)) {
        throw new Error(`fixture[${index}].command.amountCt: expected an integer`);
      }
      return kind === CommandKind.TakeLoan
        ? { kind: CommandKind.TakeLoan, amountCt }
        : { kind: CommandKind.RepayLoan, amountCt };
    }
    default:
      throw new Error(`fixture[${index}].command.kind: unknown command ${String(kind)}`);
  }
}

/**
 * Map size used by the determinism scenarios. Small enough that generating a
 * world several times per test run stays fast, large enough to contain towns,
 * industries and a coastline.
 */
export const SCENARIO_MAP_SIZE = 128;

export const SCENARIO_COMPANY_NAME = 'Iron Veins Reference Co.';

/** Build a world and pre-load the whole command script into its queue. */
export function createScenario(
  seed: number,
  script: readonly ScheduledCommand[],
  difficulty: Difficulty = Difficulty.Normal,
): Scenario {
  const world = World.create({
    seed,
    difficulty,
    climate: MapClimate.Temperate,
    mapSize: SCENARIO_MAP_SIZE,
    companyName: SCENARIO_COMPANY_NAME,
    companyColorIndex: 1,
  });
  const queue = new CommandQueue();
  for (const entry of script) {
    queue.enqueue(entry.command, entry.tick);
  }
  return { world, queue };
}

/**
 * Run the world forward to `toTick`, taking a state hash whenever the tick
 * counter reaches one of the checkpoints.
 */
export function advance(
  scenario: Scenario,
  toTick: number,
  checkpoints: readonly number[],
): CheckpointHashes {
  const wanted = new Set(checkpoints);
  const hashes: CheckpointHashes = {};
  while (scenario.world.tick < toTick) {
    scenario.world.step(scenario.queue, null);
    if (wanted.has(scenario.world.tick)) {
      hashes[scenario.world.tick] = hashWorld(scenario.world);
    }
  }
  return hashes;
}
