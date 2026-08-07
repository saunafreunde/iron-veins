import { describe, expect, it } from 'vitest';
import {
  coastEdgeMask,
  FOAM_EDGE_COUNT,
  FOAM_VARIANT_COUNT,
  foamVariant,
  isDeepWater,
  WATER_DEEP_MIN_DEPTH,
  WATER_DEEP_TINT,
  WATER_FRAME_COUNT,
  WATER_PHASE_FRAMES,
  WATER_PHASE_SEQUENCE,
  WATER_SHALLOW_TINT,
  waterRowForCounter,
} from '../../src/render/water';
import { SEA_LEVEL } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { SlopeBit, Terrain } from '../../src/sim/map/terrain';
import { floodSeaLevel, markOcean } from '../../src/sim/mapgen/hydrology';

/**
 * The pure selection logic of the living water (SPEC2 M12, D-164): tone by
 * depth, animation frame by counter, coast edges from neighbours. The
 * texture work in MapView and the canvas drawing in TerrainAtlas stay
 * untested here, exactly as the sprite pool always was.
 */

/** Set a rectangle of CORNERS to one height. Bounds are inclusive. */
function setCorners(map: TileMap, x0: number, y0: number, x1: number, y1: number, h: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      map.cornerHeight[map.cornerIndex(x, y)] = h;
    }
  }
}

/**
 * A 16-tile world with everything the tone rule distinguishes: an ocean bay
 * along the western border with a shallow shelf and a deep trench, land, and
 * an inland lake deep enough that only its missing ocean connection keeps it
 * shallow.
 */
function fixtureMap(): TileMap {
  const map = new TileMap(16);
  map.cornerHeight.fill(SEA_LEVEL + 2);
  map.terrain.fill(Terrain.Grass);

  // The bay: tiles x 0..4 submerged. Shelf at sea level, trench x 0..2 at
  // two levels under the deep threshold's edge.
  setCorners(map, 0, 0, 5, 16, SEA_LEVEL);
  setCorners(map, 0, 0, 2, 16, SEA_LEVEL - WATER_DEEP_MIN_DEPTH);

  // The lake: tiles (10..12)^2, floor as deep as the trench.
  setCorners(map, 10, 10, 13, 13, SEA_LEVEL - WATER_DEEP_MIN_DEPTH);

  floodSeaLevel(map);
  markOcean(map);
  return map;
}

describe('tone by depth (16.3: shallow #4a86a8, deep #2c5a78)', () => {
  const map = fixtureMap();

  it('parses the exact 16.3 hexes as tints', () => {
    expect(WATER_SHALLOW_TINT).toBe(0x4a86a8);
    expect(WATER_DEEP_TINT).toBe(0x2c5a78);
  });

  it('the open sea turns deep once the floor is two levels under', () => {
    expect(map.isWater(1, 8)).toBe(true);
    expect(map.oceanMask[map.tileIndex(1, 8)]).toBe(1);
    expect(isDeepWater(map, 1, 8)).toBe(true);
  });

  it('the shelf along the shore stays shallow', () => {
    // Tile (4,8) has corners at sea level: submerged, but zero depth.
    expect(map.isWater(4, 8)).toBe(true);
    expect(isDeepWater(map, 4, 8)).toBe(false);
  });

  it('a tile with even ONE corner above the threshold stays shallow', () => {
    // Tile (2,8) straddles the trench edge: west corners deep, east corners
    // at sea level - the HIGHEST corner decides, exactly like water itself.
    expect(map.isWater(2, 8)).toBe(true);
    expect(map.topHeight(2, 8)).toBe(SEA_LEVEL);
    expect(isDeepWater(map, 2, 8)).toBe(false);
  });

  it('an inland lake is never deep, whatever its floor', () => {
    expect(map.isWater(11, 11)).toBe(true);
    expect(map.topHeight(11, 11)).toBe(SEA_LEVEL - WATER_DEEP_MIN_DEPTH);
    expect(map.oceanMask[map.tileIndex(11, 11)]).toBe(0);
    expect(isDeepWater(map, 11, 11)).toBe(false);
  });
});

describe('frame by counter (Fehlerkatalog 39: a counter, never a wall clock)', () => {
  it('holds each row for WATER_PHASE_FRAMES frames', () => {
    expect(waterRowForCounter(0)).toBe(0);
    expect(waterRowForCounter(WATER_PHASE_FRAMES - 1)).toBe(0);
    expect(waterRowForCounter(WATER_PHASE_FRAMES)).toBe(1);
    expect(waterRowForCounter(2 * WATER_PHASE_FRAMES)).toBe(2);
    expect(waterRowForCounter(3 * WATER_PHASE_FRAMES)).toBe(1);
    expect(waterRowForCounter(4 * WATER_PHASE_FRAMES)).toBe(0);
  });

  it('ping-pongs: consecutive phases differ by exactly one row', () => {
    const cycle = WATER_PHASE_SEQUENCE.length * WATER_PHASE_FRAMES;
    for (let counter = 0; counter <= 2 * cycle; counter++) {
      const here = waterRowForCounter(counter);
      const next = waterRowForCounter(counter + WATER_PHASE_FRAMES);
      expect(Math.abs(next - here)).toBe(1);
    }
  });

  it('only ever names rows the atlas has', () => {
    for (let counter = 0; counter < 4 * WATER_PHASE_FRAMES * 3; counter += 7) {
      const row = waterRowForCounter(counter);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(WATER_FRAME_COUNT);
    }
  });
});

describe('coast edges from neighbours', () => {
  const map = fixtureMap();

  it('open water raises no foam', () => {
    expect(coastEdgeMask(map, 1, 8)).toBe(0);
  });

  it('the map border is open sea, not a shore', () => {
    // Tile (0,8) touches the western map edge: three water neighbours, one
    // off-map - and off-map never foams.
    expect(coastEdgeMask(map, 0, 8)).toBe(0);
  });

  it('the shoreline foams exactly towards the land', () => {
    // Tile (4,8): land to the east (edge 1), water everywhere else.
    expect(coastEdgeMask(map, 4, 8)).toBe(1 << 1);
    // The lake's north-west corner tile (10,10): land north (0) and west (3).
    expect(coastEdgeMask(map, 10, 10)).toBe((1 << 0) | (1 << 3));
  });
});

describe('foam cells: 4 edges x 4 corner lifts cover all 16 slopes', () => {
  it('maps the edge and its two corner lifts into distinct cells', () => {
    expect(foamVariant(0, 0)).toBe(0);
    expect(foamVariant(0, SlopeBit.North)).toBe(1);
    expect(foamVariant(0, SlopeBit.East)).toBe(2);
    expect(foamVariant(0, SlopeBit.North | SlopeBit.East)).toBe(3);
    expect(foamVariant(1, SlopeBit.East)).toBe(5);
    expect(foamVariant(3, SlopeBit.West)).toBe(13);
  });

  it('a corner off the edge never changes the edge cell', () => {
    // South and West do not touch edge 0 (N-E): the cell must not move.
    expect(foamVariant(0, SlopeBit.South | SlopeBit.West)).toBe(foamVariant(0, 0));
  });

  it('every (edge, slope) pair lands inside the sixteen-cell row', () => {
    const seen = new Set<number>();
    for (let edge = 0; edge < FOAM_EDGE_COUNT; edge++) {
      for (let slope = 0; slope < 16; slope++) {
        const variant = foamVariant(edge, slope);
        expect(variant).toBeGreaterThanOrEqual(0);
        expect(variant).toBeLessThan(FOAM_VARIANT_COUNT);
        seen.add(variant);
      }
    }
    // All sixteen cells are reachable - none is dead weight in the atlas.
    expect(seen.size).toBe(FOAM_VARIANT_COUNT);
  });
});
