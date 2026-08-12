import { CommandQueue } from '../commands/queue';
import { World } from '../World';
import type { MapGenProgress } from '../mapgen';
import { claimMismatch, measureBenchmarkWorld } from './measure';
import type { BenchmarkMap } from './types';

/**
 * Turn a benchmark map's TEXT command log back into a world (SPEC2 M22).
 *
 * The whole of a benchmark map is here: `World.create` on the file's own seed
 * and rules, the log enqueued into an ordinary `CommandQueue`, and
 * `world.step` until the queue is empty. There is no second executor and no
 * "fast path" - a benchmark world is built the way a player's world is built,
 * or it would be measuring something else.
 *
 * **Every refusal throws** (D-072, and the perf fixture's own rule since M10).
 * A log records only commands that were accepted when it was recorded, so a
 * refusal here means the world underneath moved - a map-generation change, a
 * new validator - and the honest answer is a loud failure, not a benchmark of
 * whatever survived. The claims block is the second half of the same guard:
 * the commands can all be accepted and still build a smaller world if the
 * generator moved a town, so the counts are read back and compared.
 */

export interface BenchmarkWorld {
  readonly world: World;
  readonly queue: CommandQueue;
}

/** Build the world a benchmark map describes, warmed up and ready to time. */
export function buildBenchmarkWorld(
  map: BenchmarkMap,
  report: MapGenProgress | null = null,
): BenchmarkWorld {
  const world = World.create(
    {
      seed: map.seed,
      difficulty: map.difficulty,
      climate: map.climate,
      mapSize: map.mapSize,
      companyName: `Iron Veins Benchmark (${map.id})`,
      companyColorIndex: 1,
      editorMode: map.editorMode,
    },
    report,
  );

  const queue = new CommandQueue();
  let lastTick = 0;
  for (let i = 0; i < map.commands.length; i++) {
    const entry = map.commands[i]!;
    queue.enqueue(entry.command, entry.tick);
    if (entry.tick > lastTick) lastTick = entry.tick;
  }

  let index = 0;
  const failures: string[] = [];
  while (world.tick <= lastTick) {
    world.step(queue, (envelope, outcome) => {
      if (!outcome.ok && failures.length < 8) {
        failures.push(
          `command ${index} (kind ${envelope.command.kind} at tick ${envelope.tick}) ` +
            `was refused: ${outcome.reasonKey}`,
        );
      }
      index++;
    });
  }
  if (failures.length > 0) {
    throw new Error(
      `benchmark map "${map.id}": ${failures.length} recorded command(s) no longer apply - ` +
        `${failures.join('; ')}. Re-record the log (tests/perf/recordBenchmarkMaps.spec.ts).`,
    );
  }

  for (let i = 0; i < map.warmupTicks; i++) world.step(queue, null);

  const mismatch = claimMismatch(map.claims, measureBenchmarkWorld(world));
  if (mismatch !== null) {
    throw new Error(
      `benchmark map "${map.id}" built a world it does not describe - ${mismatch}. ` +
        'Re-record the log (tests/perf/recordBenchmarkMaps.spec.ts).',
    );
  }

  return { world, queue };
}
