import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SIZE, MapClimate } from '../../src/sim/constants';
import { generateMap } from '../../src/sim/mapgen';

/**
 * Section 21 performance budgets. Reference machine: four cores, 16 GB, no
 * discrete GPU. Optimise against these numbers, never against a hunch.
 */

/** Section 21: map generation for 1024 x 1024 must finish within 8 seconds. */
const MAPGEN_BUDGET_MS = 8_000;

describe('performance budgets', () => {
  it(`generates a ${DEFAULT_MAP_SIZE} x ${DEFAULT_MAP_SIZE} map within ${MAPGEN_BUDGET_MS} ms`, () => {
    const started = performance.now();
    const world = generateMap({
      size: DEFAULT_MAP_SIZE,
      seed: 20_260_727,
      climate: MapClimate.Temperate,
    });
    const elapsed = performance.now() - started;

    console.log(
      `map generation: ${elapsed.toFixed(0)} ms, ${world.towns.length} towns, ` +
        `${world.industries.length} industries`,
    );
    expect(world.towns.length).toBeGreaterThan(40);
    expect(elapsed).toBeLessThan(MAPGEN_BUDGET_MS);
  });
});
