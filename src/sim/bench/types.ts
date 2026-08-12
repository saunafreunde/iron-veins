import { Difficulty, MapClimate } from '../constants';
import type { Command } from '../commands/types';
import { parseCommand } from '../save/format';
import { isLegalMapSize, mapSizeRefusal } from '../map/size';

/**
 * The four canonical benchmark maps of SPEC2 M22, as TEXT command logs.
 *
 * A benchmark map is not a save and it is not a picture: it is the same thing
 * an authored map is since D-240 - a list of commands with the ticks they run
 * on, over a world named by its seed and its rules. Two consumers read exactly
 * this, and that is the point of the milestone's sentence:
 *
 *  - the perf suite (`tests/perf/benchmarkMaps.perf.spec.ts`), which times
 *    ticks from the TEST, because `performance` is banned inside `src/sim`;
 *  - the in-game benchmark mode, whose clock is read in `SimWorker.ts` - the
 *    one file below `src/sim` that may read a wall clock at all (law #3).
 *
 * **Text, never a binary.** A `.ironsave` of a 2048 world with a hundred
 * thousand rail arcs would be megabytes of opaque bytes in the repository and
 * would go stale on the next save bump without anybody noticing; a command log
 * is readable, diffable, migration-free and replayed by the same executor a
 * player's game is. The glob test of E-14 keeps the repository binary-free and
 * these files are on the right side of it by construction.
 *
 * **One parser.** Every command in every file goes through `parseCommand` from
 * `save/format.ts` - the same function that validates a save's command log and
 * the same one the determinism fixtures use. A second parser here would fall
 * silently behind the command set, which is the D-133 defect written down.
 */

/** One entry of a benchmark log: a command and the tick it runs on. */
export interface BenchmarkCommand {
  readonly tick: number;
  readonly command: Command;
}

/**
 * What a benchmark map claims about the world its log builds.
 *
 * Pinned in the file and asserted after the replay, for the reason
 * `SCENARIO_WORLD_CLAIMS` exists (D-197): a fixture that quietly lost half its
 * commands would still run, still print percentiles, and measure a world
 * nobody described. Every field is a count the replayed world can be asked
 * for, and a benchmark whose numbers do not come back is a red build - which
 * is the RIGHT answer when map generation moves under it, not a nuisance.
 */
export interface BenchmarkClaims {
  readonly vehicles: number;
  readonly stations: number;
  readonly towns: number;
  readonly industries: number;
  /** Directed track arcs - the "edges" of architecture law #8. */
  readonly railArcs: number;
  /** Tiles carrying three or more track directions - real junctions (D-055). */
  readonly railJunctions: number;
  /** Land masses the generated ground has, which is what makes an archipelago one. */
  readonly landmasses: number;
}

/** A benchmark map: the world's identity, its log, and what it claims. */
export interface BenchmarkMap {
  readonly id: string;
  readonly seed: number;
  readonly mapSize: number;
  readonly climate: MapClimate;
  readonly difficulty: Difficulty;
  /**
   * Benchmark maps are AUTHORED worlds and say so (D-240): the editor rule
   * waives funds and ownership, which is what lets one log lay a hundred
   * thousand arcs of track without a loan schedule in front of it. It is
   * saved, hashed world state like every other rule, so a benchmark world is
   * recognisably an authored one wherever it turns up.
   */
  readonly editorMode: boolean;
  /** Ticks stepped after the log is drained, before anything is timed. */
  readonly warmupTicks: number;
  /** Ticks the benchmark samples. */
  readonly sampleTicks: number;
  readonly claims: BenchmarkClaims;
  readonly commands: readonly BenchmarkCommand[];
}

function fail(where: string, what: string): never {
  throw new Error(`${where}: ${what}`);
}

function integer(raw: unknown, where: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) fail(where, 'expected an integer');
  return raw as number;
}

function claims(raw: unknown, where: string): BenchmarkClaims {
  if (typeof raw !== 'object' || raw === null) fail(where, 'expected an object');
  const record = raw as Record<string, unknown>;
  return {
    vehicles: integer(record['vehicles'], `${where}.vehicles`),
    stations: integer(record['stations'], `${where}.stations`),
    towns: integer(record['towns'], `${where}.towns`),
    industries: integer(record['industries'], `${where}.industries`),
    railArcs: integer(record['railArcs'], `${where}.railArcs`),
    railJunctions: integer(record['railJunctions'], `${where}.railJunctions`),
    landmasses: integer(record['landmasses'], `${where}.landmasses`),
  };
}

/**
 * Validate a benchmark file and turn it into typed commands.
 *
 * Strict on every field, including the ones a human typed: the file is read by
 * the GAME as well as by the suite, and "the benchmark ran a different world
 * because a key was misspelt" is exactly the silence a fixture format exists to
 * prevent.
 */
export function parseBenchmarkMap(raw: unknown, where: string): BenchmarkMap {
  if (typeof raw !== 'object' || raw === null) fail(where, 'expected an object');
  const record = raw as Record<string, unknown>;

  const id = record['id'];
  if (typeof id !== 'string' || id.length === 0) fail(`${where}.id`, 'expected a name');

  const mapSize = integer(record['mapSize'], `${where}.mapSize`);
  if (!isLegalMapSize(mapSize)) fail(`${where}.mapSize`, mapSizeRefusal(mapSize));

  const climate = integer(record['climate'], `${where}.climate`);
  if (!Object.values(MapClimate).includes(climate as MapClimate)) {
    fail(`${where}.climate`, 'unknown climate');
  }
  const difficulty = integer(record['difficulty'], `${where}.difficulty`);
  if (!Object.values(Difficulty).includes(difficulty as Difficulty)) {
    fail(`${where}.difficulty`, 'unknown difficulty');
  }

  const editorMode = record['editorMode'];
  if (typeof editorMode !== 'boolean') fail(`${where}.editorMode`, 'expected a boolean');

  const rawCommands = record['commands'];
  if (!Array.isArray(rawCommands)) fail(`${where}.commands`, 'expected an array');
  const commands: BenchmarkCommand[] = rawCommands.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      fail(`${where}.commands[${index}]`, 'expected an object');
    }
    const item = entry as Record<string, unknown>;
    return {
      tick: integer(item['tick'], `${where}.commands[${index}].tick`),
      command: parseCommand(item['command'], `${where}.commands[${index}].command`),
    };
  });

  return {
    id,
    seed: integer(record['seed'], `${where}.seed`),
    mapSize,
    climate: climate as MapClimate,
    difficulty: difficulty as Difficulty,
    editorMode,
    warmupTicks: integer(record['warmupTicks'], `${where}.warmupTicks`),
    sampleTicks: integer(record['sampleTicks'], `${where}.sampleTicks`),
    claims: claims(record['claims'], `${where}.claims`),
    commands,
  };
}
