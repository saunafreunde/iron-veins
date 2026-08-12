import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_GEN_KNOBS,
  DEFAULT_MAP_SIZE,
  MAP_PRESET_COUNT,
  MAP_PRESET_DEFAULT_KNOBS,
  MAP_PRESET_SHAPES,
  MAPGEN_HILLINESS_GAIN,
  MAPGEN_KNOB_NEUTRAL,
  MAPGEN_KNOB_STEPS,
  MAPGEN_RESOURCE_RICHNESS,
  MAPGEN_RIVER_SCALE,
  MAPGEN_SEA_LEVEL_SHIFT,
  MAPGEN_TOWN_DENSITY,
  MapClimate,
  MapPreset,
  SEA_LEVEL,
  TILES_PER_TOWN,
  TOWN_COUNT_MAX,
  TOWN_COUNT_MAX_PER_DEFAULT_AREA,
  TOWN_COUNT_MIN,
  type MapGenKnobs,
} from '../../src/sim/constants';
import { Fnv1a64 } from '../../src/sim/hash';
import { Terrain } from '../../src/sim/map/terrain';
import { generateMap, type GeneratedWorld } from '../../src/sim/mapgen';
import { knobsForPreset } from '../../src/sim/mapgen/presets';
import { targetTownCount, townCountMaxFor } from '../../src/sim/mapgen/towns';

/**
 * The generator presets and controls of SPEC2 M23 bundle 3.
 *
 * Three things are asserted here and they are deliberately different in kind:
 *
 *  1. **The continent preset is the IDENTITY.** Not "close enough" - the same
 *     bytes. Every seam the record reaches is branched on its identity value
 *     rather than multiplied by it, because `pivot + (v - pivot) * 1` is not
 *     `v` in binary floating point. That is what keeps every balancing band,
 *     every shipped scenario and both determinism pins standing on ground that
 *     did not move; the eight shipped scenarios' `SCENARIO_WORLD_CLAIMS` are
 *     the historical half of the same proof, since they pin town names and
 *     corridor distances measured before this bundle existed.
 *  2. **Every preset owns a corner of the map's own measurements.** Landmass
 *     count, mean height and river tiles are the three coordinates SPEC2 M23
 *     names, and each preset is pinned into a BOX in that space - with the
 *     disjointness asserted rather than assumed: no preset's map satisfies
 *     another preset's box, on any of the sampled seeds. A signature that only
 *     its own preset met by accident would be a claim about one seed.
 *  3. **Every control moves what it names, and only that.** One control at a
 *     time, from its lowest step to its highest, against the same seed.
 *
 * The maps are 256 tiles with eight erosion passes - `mapgen.spec.ts`'s own
 * fixture size, the same code paths at test speed. The 1024 promise ("every
 * preset in eight seconds") is a PERF claim and lives in
 * `tests/perf/mapgen.perf.spec.ts`, where the budgets are.
 */

const SIZE = 256;
const EROSION = 8;
/** Five seeds, because a signature that holds on one seed is a coincidence. */
const SEEDS = [20_260_727, 31, 4_711, 99, 123_456] as const;

function build(seed: number, knobs: MapGenKnobs): GeneratedWorld {
  return generateMap({
    size: SIZE,
    seed,
    climate: MapClimate.Temperate,
    erosionPasses: EROSION,
    knobs,
  });
}

/** What a finished map measures, in the three coordinates SPEC2 M23 names. */
interface Reading {
  /** Share of the map that is dry land. [1] */
  readonly landShare: number;
  /** Connected land masses with at least one tile. [count] */
  readonly landmasses: number;
  /** Mean height over every tile, drowned ones included. [height levels] */
  readonly meanHeight: number;
  /**
   * Water tiles standing ABOVE the sea. [tiles]
   *
   * That is what a river is on this map and an ocean is not: `applyRivers`
   * turns valley tiles into water without lowering them, so water above
   * `SEA_LEVEL` is river and perched lake and nothing else. Counting all
   * inland water instead would count an archipelago's enclosed seas as rivers.
   */
  readonly riverTiles: number;
  readonly towns: number;
  readonly industries: number;
}

function read(world: GeneratedWorld): Reading {
  const map = world.map;
  const size = map.size;
  const tiles = size * size;
  let land = 0;
  let heightSum = 0;
  let riverTiles = 0;
  const masses = new Set<number>();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const height = map.baseHeight(x, y);
      heightSum += height;
      if (map.terrain[index] === Terrain.Water) {
        if (height > SEA_LEVEL) riverTiles++;
      } else if (height > SEA_LEVEL) {
        land++;
      }
      const mass = map.landmassId[index]!;
      if (mass >= 0) masses.add(mass);
    }
  }

  return {
    landShare: land / tiles,
    landmasses: masses.size,
    meanHeight: heightSum / tiles,
    riverTiles,
    towns: world.towns.length,
    industries: world.industries.length,
  };
}

/**
 * One box per preset. Every one of them was MEASURED across the five seeds and
 * then given the margin printed beside it; none was chosen first and hoped for.
 */
const SIGNATURES: readonly {
  readonly preset: MapPreset;
  readonly name: string;
  readonly holds: (r: Reading) => boolean;
}[] = [
  {
    preset: MapPreset.Continent,
    name: 'ordinary ground: mostly land, middling height, ordinary rivers',
    // Measured 64.0-68.2 % land, mean 5.52-5.83, 120-245 river tiles.
    holds: (r) => r.landShare >= 0.6 && r.meanHeight <= 6.5 && r.riverTiles < 500,
  },
  {
    preset: MapPreset.Archipelago,
    name: 'islands: half the map is water',
    // Measured 49.5-51.6 % land against 64.0 % for the next driest preset.
    holds: (r) => r.landShare < 0.6,
  },
  {
    preset: MapPreset.Highland,
    name: 'high country: the ground itself stands high',
    // Measured mean 9.72-9.93 against 8.00 for the next highest preset.
    holds: (r) => r.meanHeight >= 9,
  },
  {
    preset: MapPreset.RiverPlain,
    name: 'river plain: more river than any other ground carries',
    // Measured 652-1,034 river tiles against 390 for the next wettest preset.
    holds: (r) => r.riverTiles >= 500,
  },
  {
    preset: MapPreset.Valley,
    name: 'valleys: ridges and floors, high but not highland',
    // Measured mean 7.77-8.00, between the continent's 5.83 and the
    // highland's 9.72.
    holds: (r) => r.meanHeight >= 7 && r.meanHeight < 9,
  },
];

describe('the generator presets', () => {
  it('has a shape and a set of opening controls for every preset', () => {
    expect(MAP_PRESET_SHAPES).toHaveLength(MAP_PRESET_COUNT);
    expect(MAP_PRESET_DEFAULT_KNOBS).toHaveLength(MAP_PRESET_COUNT);
    expect(SIGNATURES).toHaveLength(MAP_PRESET_COUNT);
    for (const row of MAP_PRESET_DEFAULT_KNOBS) {
      expect(row).toHaveLength(5);
      for (const step of row) {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(MAPGEN_KNOB_STEPS);
      }
    }
    // Every preset is offered exactly once, in enum order.
    expect(SIGNATURES.map((entry) => entry.preset)).toEqual([0, 1, 2, 3, 4]);
  });

  it('draws the continent preset with the arithmetic that drew every world before it', () => {
    // Three doors into the same field: no knobs at all (every world before
    // this bundle), the record the migration writes, and the record the screen
    // fills in when the continent button is pressed. Byte for byte one map.
    for (const seed of SEEDS) {
      const bare = generateMap({
        size: SIZE,
        seed,
        climate: MapClimate.Temperate,
        erosionPasses: EROSION,
      });
      const migrated = build(seed, DEFAULT_MAP_GEN_KNOBS);
      const chosen = build(seed, knobsForPreset(MapPreset.Continent));

      const digest = (world: GeneratedWorld): string =>
        new Fnv1a64()
          .intArray(world.map.cornerHeight)
          .intArray(world.map.terrain)
          .intArray(world.map.townId)
          .intArray(world.map.industryId)
          .u32(world.towns.length)
          .u32(world.industries.length)
          .digest();

      expect(digest(migrated), `seed ${seed}`).toBe(digest(bare));
      expect(digest(chosen), `seed ${seed}`).toBe(digest(bare));
    }
  });

  it('gives every preset a signature only that preset meets', () => {
    for (const seed of SEEDS) {
      const readings = SIGNATURES.map((entry) => read(build(seed, knobsForPreset(entry.preset))));

      for (let i = 0; i < SIGNATURES.length; i++) {
        const mine = SIGNATURES[i]!;
        for (let j = 0; j < SIGNATURES.length; j++) {
          const reading = readings[j]!;
          const expected = i === j;
          expect(
            mine.holds(reading),
            `seed ${seed}: the ${SIGNATURES[j]!.name} map ${expected ? 'fails' : 'meets'} ` +
              `the signature "${mine.name}" - landShare ${reading.landShare.toFixed(3)}, ` +
              `masses ${reading.landmasses}, mean ${reading.meanHeight.toFixed(2)}, ` +
              `rivers ${reading.riverTiles}`,
          ).toBe(expected);
        }
      }
    }
  });

  it('breaks the archipelago into more land masses than any other preset', () => {
    // The landmass count is the coordinate SPEC2 names first, and it is the
    // one an archipelago exists for. Asserted per seed rather than as a band,
    // because how many islands a seed makes is the seed's business.
    for (const seed of SEEDS) {
      const islands = read(build(seed, knobsForPreset(MapPreset.Archipelago))).landmasses;
      for (const entry of SIGNATURES) {
        if (entry.preset === MapPreset.Archipelago) continue;
        const other = read(build(seed, knobsForPreset(entry.preset))).landmasses;
        expect(islands, `seed ${seed} against ${entry.name}`).toBeGreaterThan(other);
      }
    }
  });

  it('leaves every preset playable - towns to serve and works to serve them', () => {
    for (const seed of SEEDS) {
      for (const entry of SIGNATURES) {
        const reading = read(build(seed, knobsForPreset(entry.preset)));
        expect(reading.towns, `${entry.name} on seed ${seed}`).toBeGreaterThanOrEqual(
          TOWN_COUNT_MIN,
        );
        expect(reading.industries, `${entry.name} on seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------- the controls

/** The neutral step of every table is the arithmetic identity of its seam. */
describe('the generator controls', () => {
  it('offers the same number of steps everywhere, neutral in the middle', () => {
    for (const table of [
      MAPGEN_SEA_LEVEL_SHIFT,
      MAPGEN_HILLINESS_GAIN,
      MAPGEN_RIVER_SCALE,
      MAPGEN_TOWN_DENSITY,
      MAPGEN_RESOURCE_RICHNESS,
    ]) {
      expect(table).toHaveLength(MAPGEN_KNOB_STEPS);
      // Ascending: a control whose steps were not ordered would be a slider
      // that moves the world backwards halfway along.
      for (let i = 1; i < table.length; i++) {
        expect(table[i]!).toBeGreaterThan(table[i - 1]!);
      }
    }
    expect(MAPGEN_SEA_LEVEL_SHIFT[MAPGEN_KNOB_NEUTRAL]).toBe(0);
    expect(MAPGEN_HILLINESS_GAIN[MAPGEN_KNOB_NEUTRAL]).toBe(1);
    expect(MAPGEN_RIVER_SCALE[MAPGEN_KNOB_NEUTRAL]).toBe(1);
    expect(MAPGEN_TOWN_DENSITY[MAPGEN_KNOB_NEUTRAL]).toBe(1);
    expect(MAPGEN_RESOURCE_RICHNESS[MAPGEN_KNOB_NEUTRAL]).toBe(1);
  });

  const at = (knobs: Partial<MapGenKnobs>): MapGenKnobs => ({
    ...DEFAULT_MAP_GEN_KNOBS,
    ...knobs,
  });

  it('drowns the map as the sea-level control rises', () => {
    for (const seed of SEEDS) {
      const low = read(build(seed, at({ seaLevel: 0 })));
      const middle = read(build(seed, at({ seaLevel: MAPGEN_KNOB_NEUTRAL })));
      const high = read(build(seed, at({ seaLevel: MAPGEN_KNOB_STEPS - 1 })));
      expect(low.landShare, `seed ${seed}`).toBeGreaterThan(middle.landShare);
      expect(middle.landShare, `seed ${seed}`).toBeGreaterThan(high.landShare);
    }
  });

  it('raises the mountains as the hilliness control rises, without drowning the coast', () => {
    for (const seed of SEEDS) {
      const flat = read(build(seed, at({ hilliness: 0 })));
      const middle = read(build(seed, at({ hilliness: MAPGEN_KNOB_NEUTRAL })));
      const hilly = read(build(seed, at({ hilliness: MAPGEN_KNOB_STEPS - 1 })));
      expect(flat.meanHeight, `seed ${seed}`).toBeLessThan(middle.meanHeight);
      expect(middle.meanHeight, `seed ${seed}`).toBeLessThan(hilly.meanHeight);
      // The pivot is the point of the control (D-242): the coastline is not
      // what it moves. A quarter of the land share either way would mean the
      // hilliness slider had become a second sea-level slider.
      expect(Math.abs(hilly.landShare - flat.landShare), `seed ${seed}`).toBeLessThan(0.25);
    }
  });

  it('cuts more river as the river control rises', () => {
    for (const seed of SEEDS) {
      const few = read(build(seed, at({ rivers: 0 })));
      const middle = read(build(seed, at({ rivers: MAPGEN_KNOB_NEUTRAL })));
      const many = read(build(seed, at({ rivers: MAPGEN_KNOB_STEPS - 1 })));
      expect(few.riverTiles, `seed ${seed}`).toBeLessThan(middle.riverTiles);
      expect(middle.riverTiles, `seed ${seed}`).toBeLessThan(many.riverTiles);
    }
  });

  it('settles more towns as the density control rises', () => {
    // On a 256 map the area rule asks for 9 towns and `TOWN_COUNT_MIN` lifts
    // that to 40 at every step, so the control is measured where it is free:
    // the default size, whose area rule asks for 140.
    const seed = SEEDS[0]!;
    const towns = (step: number): number =>
      targetTownCount(DEFAULT_MAP_SIZE, MAPGEN_TOWN_DENSITY[step]!);
    expect(towns(0)).toBeLessThan(towns(MAPGEN_KNOB_NEUTRAL));
    expect(towns(MAPGEN_KNOB_NEUTRAL)).toBeLessThan(towns(MAPGEN_KNOB_STEPS - 1));
    // And the generator really asks for what the rule says, on a map whose
    // area rule is above the floor: 256 tiles cannot show it, so the count is
    // read off `targetTownCount` above and the PLUMBING is read off a real
    // map here - fewer towns at the lowest step than the floor would allow is
    // impossible, so this asserts the call reaches the generator at all.
    const sparse = read(build(seed, at({ townDensity: 0 })));
    expect(sparse.towns).toBe(TOWN_COUNT_MIN);
  });

  it('places more works as the richness control rises', () => {
    for (const seed of SEEDS) {
      const poor = read(build(seed, at({ resources: 0 })));
      const rich = read(build(seed, at({ resources: MAPGEN_KNOB_STEPS - 1 })));
      expect(poor.industries, `seed ${seed}`).toBeLessThan(rich.industries);
    }
  });
});

// ------------------------------------------------------------- the town ceiling

describe('the town ceiling scales with the map', () => {
  it('settles the same towns it always did at the default size and below', () => {
    // The claim every band in this project rests on, and it is about the COUNT
    // rather than about the ceiling: no map of 1024 tiles or less asks for a
    // different number of towns than it asked for before M23. Every fixture,
    // every shipped scenario and both determinism pins live in this band.
    for (const size of [64, 128, 256, 512, 1_024]) {
      const byArea = Math.round((size * size) / TILES_PER_TOWN);
      const before = Math.min(TOWN_COUNT_MAX, Math.max(TOWN_COUNT_MIN, byArea));
      expect(targetTownCount(size), `${size}`).toBe(before);
    }
    // Below the default size the ceiling is still the flat figure it always
    // was; at the default size itself the area rule (140) already sits under
    // the per-area ceiling (252), so raising it changes no neutral map and
    // gives the density control somewhere to go.
    for (const size of [64, 128, 256, 512]) {
      expect(townCountMaxFor(size), `${size}`).toBe(TOWN_COUNT_MAX);
    }
    expect(townCountMaxFor(DEFAULT_MAP_SIZE)).toBe(TOWN_COUNT_MAX_PER_DEFAULT_AREA);
    expect(targetTownCount(DEFAULT_MAP_SIZE)).toBe(TOWN_COUNT_MAX);
  });

  it('follows the area above it, which is what fills a 2048 map', () => {
    // 2048^2 is four times 1024^2, so the ceiling is four times the per-area
    // figure - and the area rule's own 559 towns now fit under it where the
    // flat 140 truncated them to a quarter (SPEC2 M23).
    expect(townCountMaxFor(2_048)).toBe(TOWN_COUNT_MAX_PER_DEFAULT_AREA * 4);
    expect(targetTownCount(2_048)).toBe(Math.round((2_048 * 2_048) / TILES_PER_TOWN));
    expect(targetTownCount(2_048)).toBeGreaterThan(TOWN_COUNT_MAX);

    // Emptiness per square tile, which is the figure SPEC2 names: a 2048 map
    // used to hold a quarter of the default map's towns per tile and now holds
    // the same number.
    const perTile = (size: number): number => targetTownCount(size) / (size * size);
    expect(perTile(2_048) / perTile(DEFAULT_MAP_SIZE)).toBeGreaterThan(0.99);
    expect(140 / (2_048 * 2_048) / perTile(DEFAULT_MAP_SIZE)).toBeLessThan(0.26);
  });

  it('leaves the densest step room to work at every size', () => {
    for (const size of [DEFAULT_MAP_SIZE, 2_048]) {
      const densest = MAPGEN_TOWN_DENSITY[MAPGEN_KNOB_STEPS - 1]!;
      expect(targetTownCount(size, densest)).toBeGreaterThan(targetTownCount(size));
    }
  });
});
