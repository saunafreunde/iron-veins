import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_SIZE,
  MAP_PRESET_COUNT,
  MAP_SIZES,
  MapClimate,
  type MapPreset,
} from '../../src/sim/constants';
import { generateMap } from '../../src/sim/mapgen';
import { knobsForPreset } from '../../src/sim/mapgen/presets';

/**
 * Section 21 performance budgets. Reference machine: four cores, 16 GB, no
 * discrete GPU. Optimise against these numbers, never against a hunch.
 */

/** Section 21: map generation for 1024 x 1024 must finish within 8 seconds. */
const MAPGEN_BUDGET_MS = 8_000;

/** The seed every measurement here uses, so the sizes are comparable. */
const SEED = 20_260_727;

/**
 * The band per size step (SPEC2 M23), measured on the reference machine and
 * given headroom, not guessed.
 *
 * Measured before this bundle: 256 274 ms, 512 762 ms, 1024 2,907 ms, 2048
 * 11,664 ms - so the cost is essentially the erosion pass, which is linear in
 * the corner count and therefore quadratic in the edge length. The budgets are
 * roughly 2.5x the measurement, which is the multiple a loaded box costs (the
 * D-167 argument for the render tripwires, one suite over); the 1024 row is
 * SPEC.md's own eight seconds and is NOT relaxed by that rule.
 *
 * 2048 has never had a budget of its own and SPEC2 M23 asks for one. It is the
 * only row that also carries a WORLD change from this bundle - the town
 * ceiling now lets the area rule place 559 towns there instead of 140 - so the
 * budget is measured on the new count, not inherited from the old one.
 */
const SIZE_BUDGET_MS: Readonly<Record<number, number>> = {
  256: 900,
  512: 2_000,
  1_024: MAPGEN_BUDGET_MS,
  2_048: 30_000,
};

describe('performance budgets', () => {
  it(`generates a ${DEFAULT_MAP_SIZE} x ${DEFAULT_MAP_SIZE} map within ${MAPGEN_BUDGET_MS} ms`, () => {
    const started = performance.now();
    const world = generateMap({
      size: DEFAULT_MAP_SIZE,
      seed: SEED,
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

  it('holds the band at every size step the screen offers', () => {
    // Every size the new-game screen can pick, including the 2048 one that had
    // no budget before this bundle.
    expect(MAP_SIZES).toEqual([256, 512, 1_024, 2_048]);
    for (const size of MAP_SIZES) {
      const started = performance.now();
      const world = generateMap({ size, seed: SEED, climate: MapClimate.Temperate });
      const elapsed = performance.now() - started;
      const budget = SIZE_BUDGET_MS[size]!;

      console.log(
        `mapgen ${size}: ${elapsed.toFixed(0)} ms against ${budget} ms, ` +
          `${world.towns.length} towns, ${world.industries.length} industries`,
      );
      expect(world.towns.length, `${size}`).toBeGreaterThan(0);
      expect(world.industries.length, `${size}`).toBeGreaterThan(0);
      expect(elapsed, `${size}`).toBeLessThan(budget);
    }
  });

  it(`generates a ${DEFAULT_MAP_SIZE} map for EVERY preset within ${MAPGEN_BUDGET_MS} ms`, () => {
    // SPEC2 M23's own Fertig-wenn, and it is measured per preset rather than
    // once: a preset that drowned half the map would send the placement loops
    // hunting for sites they cannot find, and one that ridged the ground would
    // do the same. Each is timed and each is asserted to have produced a world
    // somebody could play.
    for (let preset = 0; preset < MAP_PRESET_COUNT; preset++) {
      const started = performance.now();
      const world = generateMap({
        size: DEFAULT_MAP_SIZE,
        seed: SEED,
        climate: MapClimate.Temperate,
        knobs: knobsForPreset(preset as MapPreset),
      });
      const elapsed = performance.now() - started;

      console.log(
        `mapgen preset ${preset}: ${elapsed.toFixed(0)} ms, ${world.towns.length} towns, ` +
          `${world.industries.length} industries`,
      );
      expect(world.towns.length, `preset ${preset}`).toBeGreaterThan(0);
      expect(world.industries.length, `preset ${preset}`).toBeGreaterThan(0);
      expect(elapsed, `preset ${preset}`).toBeLessThan(MAPGEN_BUDGET_MS);
    }
  });
});
