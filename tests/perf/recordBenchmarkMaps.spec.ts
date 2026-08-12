import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measureBenchmarkWorld } from '../../src/sim/bench/measure';
import type { BenchmarkMap } from '../../src/sim/bench/types';
import { BENCHMARK_PLANS, recordPlan } from './benchmarkPlans';

/**
 * Re-record the four benchmark maps of SPEC2 M22.
 *
 *   IRON_VEINS_RECORD_BENCH=1 npx vitest run tests/perf/recordBenchmarkMaps.spec.ts
 *
 * Off by default and deliberately so: recording builds four worlds including a
 * 2048 one, and it WRITES the fixtures - a step that runs by accident is a step
 * that overwrites the pinned logs with whatever today's build produces. What
 * runs in every perf run is the other half, `benchmarkMaps.perf.spec.ts`, which
 * replays the committed logs and fails loudly when one of them no longer
 * applies. That is the same split as the canonical hash: recording is a
 * deliberate act with a decision behind it, verifying is automatic (D-137).
 */

const RECORD = process.env['IRON_VEINS_RECORD_BENCH'] === '1';

const MAPS_DIR = fileURLToPath(new URL('../../src/sim/bench/maps/', import.meta.url));

/** File name per plan id - the catalogue's own mapping, restated once. */
const FILE_NAMES: Readonly<Record<string, string>> = {
  megaJunction: 'mega-junction.json',
  megalopolis: 'megalopolis.json',
  archipelago: 'archipelago.json',
  hundredKEdges: 'hundred-k-edges.json',
};

/**
 * Write the file with ONE LINE PER COMMAND.
 *
 * `JSON.stringify(map, null, 2)` puts every field of every command on its own
 * line, which turned the 100k-edge log into 1.9 MB of mostly indentation. A
 * command per line is the shape the determinism fixtures have always had, it is
 * what prettier produces for an object that fits inside `printWidth`, and it is
 * what makes a diff of a re-recorded map readable at all.
 */
function serialise(map: BenchmarkMap): string {
  const head = {
    id: map.id,
    seed: map.seed,
    mapSize: map.mapSize,
    climate: map.climate,
    difficulty: map.difficulty,
    editorMode: map.editorMode,
    warmupTicks: map.warmupTicks,
    sampleTicks: map.sampleTicks,
    claims: map.claims,
  };
  const headText = JSON.stringify(head, null, 2).slice(0, -2).trimEnd();
  const lines = map.commands.map((entry) => `    ${JSON.stringify(entry)}`);
  return `${headText},\n  "commands": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

describe.skipIf(!RECORD)('recording the benchmark maps', () => {
  for (const plan of BENCHMARK_PLANS) {
    it(`records ${plan.id}`, () => {
      const started = Date.now();
      const { map, world } = recordPlan(plan);
      const claims = measureBenchmarkWorld(world);
      const name = FILE_NAMES[plan.id];
      expect(name, `no file name for plan ${plan.id}`).toBeTypeOf('string');

      writeFileSync(`${MAPS_DIR}${name}`, serialise(map), 'utf8');
      console.log(
        `recorded ${plan.id}: ${map.commands.length} commands, ` +
          `${claims.vehicles} vehicles, ${claims.stations} stations, ` +
          `${claims.railArcs} rail arcs, ${claims.railJunctions} junctions, ` +
          `${claims.landmasses} land masses, ${claims.towns} towns, ` +
          `${claims.industries} industries - ${((Date.now() - started) / 1000).toFixed(1)} s`,
      );
      expect(map.commands.length).toBeGreaterThan(0);
    }, 1_800_000);
  }
});
