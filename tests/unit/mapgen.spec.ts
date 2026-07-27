import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_MIN_DISTANCE,
  MapClimate,
  SEA_LEVEL,
  TOWN_MIN_DISTANCE,
} from '../../src/sim/constants';
import { Fnv1a64 } from '../../src/sim/hash';
import { industrySpec } from '../../src/sim/industry/types';
import type { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { findStartingPair, generateMap, type GeneratedWorld } from '../../src/sim/mapgen';

/** Small map plus few erosion passes: the same code paths at test speed. */
const TEST_SIZE = 256;
const TEST_EROSION = 8;

function build(seed: number, climate: MapClimate = MapClimate.Temperate): GeneratedWorld {
  return generateMap({ size: TEST_SIZE, seed, climate, erosionPasses: TEST_EROSION });
}

function mapDigest(map: TileMap): string {
  return new Fnv1a64()
    .intArray(map.cornerHeight)
    .intArray(map.terrain)
    .intArray(map.roadBits)
    .intArray(map.townId)
    .intArray(map.industryId)
    .intArray(map.buildingKind)
    .digest();
}

function countTerrain(map: TileMap, terrain: number): number {
  let count = 0;
  for (let i = 0; i < map.terrain.length; i++) if (map.terrain[i] === terrain) count++;
  return count;
}

describe('map generation is reproducible', () => {
  it('produces an identical map for the same seed', () => {
    expect(mapDigest(build(20_260_727).map)).toBe(mapDigest(build(20_260_727).map));
  });

  it('produces a different map for a different seed', () => {
    expect(mapDigest(build(1).map)).not.toBe(mapDigest(build(2).map));
  });

  it('generates the same towns and industries for the same seed', () => {
    const a = build(4_711);
    const b = build(4_711);
    expect(a.towns.map((t) => `${t.name}@${t.x},${t.y}`)).toEqual(
      b.towns.map((t) => `${t.name}@${t.x},${t.y}`),
    );
    expect(a.industries).toEqual(b.industries);
  });
});

describe('terrain', () => {
  const world = build(20_260_727);

  it('has both land and sea', () => {
    const water = countTerrain(world.map, Terrain.Water);
    const total = world.map.tileCount;
    expect(water).toBeGreaterThan(total * 0.05);
    expect(water).toBeLessThan(total * 0.85);
  });

  it('never breaks the no-steep-slope invariant', () => {
    const map = world.map;
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        expect(map.topHeight(x, y) - map.baseHeight(x, y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('surrounds the playable area with ocean', () => {
    const map = world.map;
    let borderWater = 0;
    let borderTiles = 0;
    for (let x = 0; x < map.size; x++) {
      borderTiles += 2;
      if (map.terrain[map.tileIndex(x, 0)] === Terrain.Water) borderWater++;
      if (map.terrain[map.tileIndex(x, map.size - 1)] === Terrain.Water) borderWater++;
    }
    expect(borderWater).toBe(borderTiles);
  });

  it('marks border water as ocean and reaches inland lakes separately', () => {
    const map = world.map;
    expect(map.oceanMask[map.tileIndex(0, 0)]).toBe(1);

    for (let i = 0; i < map.terrain.length; i++) {
      if (map.oceanMask[i] === 1) expect(map.terrain[i]).toBe(Terrain.Water);
    }
  });

  it('labels every land tile with a land mass and every water tile with none', () => {
    const map = world.map;
    for (let i = 0; i < map.terrain.length; i++) {
      if (map.terrain[i] === Terrain.Water) {
        expect(map.landmassId[i]).toBe(-1);
      } else {
        expect(map.landmassId[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('puts rivers above the sea, so they are not just more coastline', () => {
    const map = world.map;
    let inlandWater = 0;
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const index = map.tileIndex(x, y);
        if (map.terrain[index] !== Terrain.Water) continue;
        if (map.baseHeight(x, y) > SEA_LEVEL) inlandWater++;
      }
    }
    expect(inlandWater).toBeGreaterThan(0);
  });
});

describe('climate', () => {
  it('produces snow in the arctic and none in the tropics', () => {
    const arctic = build(99, MapClimate.Arctic).map;
    const tropical = build(99, MapClimate.Tropical).map;
    expect(countTerrain(arctic, Terrain.Snow)).toBeGreaterThan(
      countTerrain(tropical, Terrain.Snow),
    );
  });

  it('produces desert on a desert map and little on a temperate one', () => {
    const desert = build(99, MapClimate.Desert).map;
    const temperate = build(99, MapClimate.Temperate).map;
    expect(countTerrain(desert, Terrain.Desert)).toBeGreaterThan(
      countTerrain(temperate, Terrain.Desert),
    );
  });
});

describe('towns', () => {
  const world = build(20_260_727);

  it('places a plausible number of them', () => {
    expect(world.towns.length).toBeGreaterThan(10);
    expect(world.towns.length).toBeLessThanOrEqual(140);
  });

  it('keeps the minimum distance between every pair', () => {
    const minSq = TOWN_MIN_DISTANCE * TOWN_MIN_DISTANCE;
    for (let i = 0; i < world.towns.length; i++) {
      for (let j = i + 1; j < world.towns.length; j++) {
        const a = world.towns[i]!;
        const b = world.towns[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minSq);
      }
    }
  });

  it('never founds a town in the water', () => {
    for (const town of world.towns) {
      expect(world.map.terrain[world.map.tileIndex(town.x, town.y)]).not.toBe(Terrain.Water);
    }
  });

  it('gives every town a unique name', () => {
    const names = new Set(world.towns.map((town) => town.name));
    expect(names.size).toBe(world.towns.length);
  });

  it('builds roads and houses', () => {
    const map = world.map;
    let roads = 0;
    let buildings = 0;
    for (let i = 0; i < map.roadBits.length; i++) {
      if (map.roadBits[i] !== 0) roads++;
      if (map.buildingKind[i] !== 0) buildings++;
    }
    expect(roads).toBeGreaterThan(world.towns.length * 8);
    expect(buildings).toBeGreaterThan(world.towns.length * 3);
  });

  it('never lays a road on water', () => {
    const map = world.map;
    for (let i = 0; i < map.roadBits.length; i++) {
      if (map.roadBits[i] !== 0) expect(map.terrain[i]).not.toBe(Terrain.Water);
    }
  });
});

describe('industries', () => {
  const world = build(20_260_727);

  it('places some', () => {
    expect(world.industries.length).toBeGreaterThan(0);
  });

  it('keeps them apart', () => {
    const minSq = INDUSTRY_MIN_DISTANCE * INDUSTRY_MIN_DISTANCE;
    for (let i = 0; i < world.industries.length; i++) {
      for (let j = i + 1; j < world.industries.length; j++) {
        const a = world.industries[i]!;
        const b = world.industries[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minSq);
      }
    }
  });

  it('can supply every processing industry on its own land mass', () => {
    for (const consumer of world.industries) {
      for (const input of industrySpec(consumer.type).inputs) {
        const supplied = world.industries.some(
          (other) =>
            other.landmassId === consumer.landmassId &&
            industrySpec(other.type).outputs.includes(input),
        );
        expect(supplied).toBe(true);
      }
    }
  });

  it('uses dense ids that match the tile layer', () => {
    world.industries.forEach((industry, index) => {
      expect(industry.id).toBe(index);
      expect(world.map.industryId[world.map.tileIndex(industry.x, industry.y)]).toBe(index);
    });
  });
});

describe('playability', () => {
  it('always offers a starting pair of towns', () => {
    for (const seed of [1, 2, 3, 17, 4711, 20_260_727]) {
      const world = build(seed);
      expect(findStartingPair(world.map, world.towns)).not.toBeNull();
    }
  });
});
