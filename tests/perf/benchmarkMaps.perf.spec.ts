import { describe, expect, it } from 'vitest';
import { BENCHMARK_MAPS } from '../../src/sim/bench/catalog';
import { buildBenchmarkWorld } from '../../src/sim/bench/build';
import { measureBenchmarkWorld } from '../../src/sim/bench/measure';
import { summarise } from '../../src/sim/bench/stats';

/**
 * The four canonical benchmark maps of SPEC2 M22, replayed and timed.
 *
 * This is the suite half of the milestone's Fertig-wenn: "die vier
 * Benchmark-Karten drucken in der Perf-Suite p99-Werte". The other half is the
 * in-game benchmark mode, which runs the SAME logs through the same builder and
 * the same percentile arithmetic (`bench/stats.ts`), reading its clock in
 * `SimWorker.ts` because that is the only file below `src/sim` allowed to.
 *
 * The timing is done FROM THE TEST for the reason `tick.perf.spec.ts` states:
 * `performance` is banned inside `src/sim` by architecture law #3 and the ban
 * is enforced by `tests/unit/lint-rules.spec.ts`.
 *
 * **The gates are ceilings, never acceptance numbers** (D-167). The measured
 * figures of a clean run are recorded in SPEC2 section 6.1.1 and in D-243;
 * what is asserted here is a multiple of them, so a loaded box stays green and
 * a regression of several times does not.
 */

/**
 * Per-map gates, in the D-167 shape: a generous multiple on the MEDIAN plus a
 * very generous p99 backstop.
 *
 * The measured figures of the first clean run are the ledger's, not these -
 * SPEC2 6.1.1 and D-243 carry p50 0.089 / 1.069 / 0.204 / 0.052 ms and p99
 * 17.546 / 2.367 / 0.575 / 0.147 ms. An acceptance number used as a threshold
 * would have zero headroom by construction and would teach everybody to ignore
 * a red gate (D-136).
 *
 * The megalopolis's p99 gate is the exception and it is not a multiple of
 * anything measured here: it is section 21's own eight milliseconds, because
 * that map IS section 21's world - 1,500 working vehicles on a 1024 map - built
 * out of commands instead of by hand.
 */
interface BenchmarkGate {
  readonly medianMs: number;
  readonly p99Ms: number;
}

const GATES: Readonly<Record<string, BenchmarkGate>> = {
  megaJunction: { medianMs: 2, p99Ms: 60 },
  megalopolis: { medianMs: 4, p99Ms: 8 },
  archipelago: { medianMs: 2, p99Ms: 12 },
  hundredKEdges: { medianMs: 1, p99Ms: 12 },
};

/** How long a whole benchmark map may take to build, log included. [ms] */
const BUILD_BUDGET_MS = 120_000;

describe('the four benchmark maps of SPEC2 M22', () => {
  for (const entry of BENCHMARK_MAPS) {
    it(`replays and times ${entry.id}`, async () => {
      const map = await entry.load();

      const buildStarted = performance.now();
      const { world, queue } = buildBenchmarkWorld(map);
      const buildMs = performance.now() - buildStarted;

      // What the log built, read off the world rather than off the file: the
      // builder has already refused a mismatch, so this is what gets PRINTED
      // beside the percentiles - a number with a subject (D-197).
      const claims = measureBenchmarkWorld(world);

      // Warm the caches exactly as the 1,500-vehicle fixture does: the first
      // ticks after a build rebuild the block index and the land masses.
      for (let i = 0; i < 200; i++) world.step(queue, null);

      const samples = new Float64Array(map.sampleTicks);
      for (let i = 0; i < map.sampleTicks; i++) {
        const started = performance.now();
        world.step(queue, null);
        samples[i] = performance.now() - started;
      }
      const stats = summarise(samples);

      console.log(
        `benchmark ${entry.id}: ${map.mapSize}^2, ${map.commands.length} recorded commands, ` +
          `${claims.vehicles} vehicles, ${claims.stations} stations, ${claims.towns} towns, ` +
          `${claims.industries} industries, ${claims.railArcs} rail arcs ` +
          `(${claims.railJunctions} junctions), ${claims.landmasses} land masses - ` +
          `built in ${(buildMs / 1000).toFixed(1)} s, tick p50 ${stats.p50.toFixed(3)} ms, ` +
          `p99 ${stats.p99.toFixed(3)} ms, max ${stats.max.toFixed(3)} ms ` +
          `over ${stats.samples} ticks`,
      );

      const gate = GATES[entry.id]!;
      expect(buildMs).toBeLessThan(BUILD_BUDGET_MS);
      expect(stats.samples).toBe(map.sampleTicks);
      expect(stats.p50).toBeLessThan(gate.medianMs);
      expect(stats.p99).toBeLessThan(gate.p99Ms);
    }, 900_000);
  }

  it('is the world architecture law #8 talks about', async () => {
    // The law says "rail graphs reach 100k edges. Always iterative with an
    // explicit stack or queue." Until this milestone no world in the
    // repository had ever had one, so the law was a promise about a map
    // nobody owned. It exists now, it is a command log, and a train paths
    // over it every tick of the benchmark.
    const entry = BENCHMARK_MAPS.find((candidate) => candidate.id === 'hundredKEdges')!;
    const map = await entry.load();
    expect(map.claims.railArcs).toBeGreaterThanOrEqual(100_000);
    expect(map.claims.vehicles).toBeGreaterThan(0);
  });
});
