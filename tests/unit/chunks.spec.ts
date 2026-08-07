import { describe, expect, it } from 'vitest';
import {
  CHUNK_TILES,
  chunkAabb,
  chunkChecksum,
  chunksPerSide,
  computeDirtySet,
  extractNetworkSegments,
  NetKind,
  visibleChunks,
} from '../../src/render/chunks';
import { HEIGHT_PX, TILE_H, TILE_W, tileToWorld } from '../../src/render/projection';
import { MAX_HEIGHT } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { trackBit, TrackDir } from '../../src/sim/map/track';
import { RoadBit } from '../../src/sim/town/types';

/**
 * The pure half of the hybrid renderer (E-04, D-161): chunk geometry,
 * camera-AABB culling, the per-chunk checksums that turn "the revision
 * moved" into "these chunks changed", and the polyline extraction of the
 * 0.25x abstract mode. Everything here runs headless - the RenderTexture
 * work in MapView is deliberately not under test, exactly as the sprite
 * pool never was.
 */

describe('chunk grid', () => {
  it('is the 32-tile grid of SPEC.md 16.1', () => {
    expect(CHUNK_TILES).toBe(32);
    expect(chunksPerSide(2048)).toBe(64);
    expect(chunksPerSide(256)).toBe(8);
    // A map that is not a multiple of the chunk size still gets covered.
    expect(chunksPerSide(100)).toBe(4);
  });

  it('every tile of a chunk projects inside its AABB at every height', () => {
    const aabb = chunkAabb(1, 2);
    const x0 = CHUNK_TILES;
    const y0 = 2 * CHUNK_TILES;

    for (let y = y0; y < y0 + CHUNK_TILES; y++) {
      for (let x = x0; x < x0 + CHUNK_TILES; x++) {
        for (const height of [0, MAX_HEIGHT]) {
          const world = tileToWorld(x, y, height);
          // The cell around a tile's north corner: half a tile either side,
          // three steps of headroom, the diamond and one step of skirt.
          expect(world.x - TILE_W / 2).toBeGreaterThanOrEqual(aabb.minX);
          expect(world.x + TILE_W / 2).toBeLessThanOrEqual(aabb.maxX);
          expect(world.y - 3 * HEIGHT_PX).toBeGreaterThanOrEqual(aabb.minY);
          expect(world.y + TILE_H + HEIGHT_PX).toBeLessThanOrEqual(aabb.maxY);
        }
      }
    }
  });

  it('all chunks share one texture footprint, clamped map edge or not', () => {
    const inner = chunkAabb(0, 0);
    const edge = chunkAabb(63, 63);
    expect(edge.maxX - edge.minX).toBe(inner.maxX - inner.minX);
    expect(edge.maxY - edge.minY).toBe(inner.maxY - inner.minY);
  });
});

describe('camera-AABB culling', () => {
  const MAP = 128; // 4x4 chunks

  it('a viewport over one corner finds that corner, not the far one', () => {
    const out: number[] = [];
    // A small window around tile (5, 5) at ground height.
    const centre = tileToWorld(5, 5, 0);
    const n = visibleChunks(centre.x - 50, centre.y - 50, centre.x + 50, centre.y + 50, MAP, out);
    const keys = new Set(out.slice(0, n));

    expect(keys.has(0)).toBe(true); // chunk (0,0)
    expect(keys.has(15)).toBe(false); // chunk (3,3), the opposite corner
    // Culling may keep a bordering neighbour whose margin overlaps, but it
    // must never keep most of the map for a window this small.
    expect(n).toBeLessThanOrEqual(4);
  });

  it('a viewport spanning the whole world keeps every chunk', () => {
    const out: number[] = [];
    const n = visibleChunks(-100_000, -100_000, 100_000, 100_000, MAP, out);
    expect(n).toBe(16);
  });

  it('a viewport far off the map keeps none', () => {
    const out: number[] = [];
    const n = visibleChunks(50_000, 50_000, 60_000, 60_000, MAP, out);
    expect(n).toBe(0);
  });
});

describe('chunk dirty set from a revision diff', () => {
  /** Bake the checksum book of every chunk, as the renderer's cache does. */
  function checksumAll(map: TileMap, full: boolean): Map<number, { checksum: number }> {
    const per = chunksPerSide(map.size);
    const book = new Map<number, { checksum: number }>();
    for (let cy = 0; cy < per; cy++) {
      for (let cx = 0; cx < per; cx++) {
        book.set(cy * per + cx, { checksum: chunkChecksum(map, cx, cy, full) });
      }
    }
    return book;
  }

  it('an untouched map dirties nothing', () => {
    const map = new TileMap(64);
    const book = checksumAll(map, true);
    const out: number[] = [];
    expect(computeDirtySet(map, book, true, out)).toBe(0);
  });

  it('a terrain edit dirties exactly the chunk it lies in', () => {
    const map = new TileMap(64);
    const book = checksumAll(map, true);
    map.terrain[map.tileIndex(5, 5)] = Terrain.Field;

    const out: number[] = [];
    const n = computeDirtySet(map, book, true, out);
    expect(n).toBe(1);
    expect(out[0]).toBe(0); // chunk (0,0)
  });

  it('a road edit dirties the full profile but not the terrain profile', () => {
    const map = new TileMap(64);
    const fullBook = checksumAll(map, true);
    const terrainBook = checksumAll(map, false);
    map.roadBits[map.tileIndex(40, 10)] = RoadBit.East | RoadBit.West;

    const out: number[] = [];
    expect(computeDirtySet(map, fullBook, true, out)).toBe(1);
    expect(out[0]).toBe(1); // chunk (1,0)
    expect(computeDirtySet(map, terrainBook, false, out)).toBe(0);
  });

  it('a seam corner dirties every chunk that draws a slope from it', () => {
    const map = new TileMap(64);
    const book = checksumAll(map, false);
    // Corner (32,32) is shared by tiles of all four chunks.
    map.cornerHeight[map.cornerIndex(32, 32)] = 1;

    const out: number[] = [];
    const n = computeDirtySet(map, book, false, out);
    expect(new Set(out.slice(0, n))).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe('network polyline extraction', () => {
  it('a road across three tiles yields continuous half-segments', () => {
    const map = new TileMap(16);
    map.roadBits[map.tileIndex(4, 4)] = RoadBit.East;
    map.roadBits[map.tileIndex(5, 4)] = RoadBit.East | RoadBit.West;
    map.roadBits[map.tileIndex(6, 4)] = RoadBit.West;

    const segments = extractNetworkSegments(map, 0, 0, 15, 15);
    expect(segments).toHaveLength(4);
    expect(segments.every((s) => s.kind === NetKind.Road)).toBe(true);

    // The eastern half of (4,4) ends where the western half of (5,4) begins.
    const eastOf4 = segments.find((s) => s.tileX === 4 && s.bx > s.ax)!;
    const westOf5 = segments.find((s) => s.tileX === 5 && s.bx < s.ax)!;
    expect(eastOf4.bx).toBe(5.0);
    expect(eastOf4.by).toBe(4.5);
    expect(westOf5.bx).toBe(5.0);
    expect(westOf5.by).toBe(4.5);
  });

  it('diagonal track meets its neighbour at the shared corner', () => {
    const map = new TileMap(16);
    map.trackBits[map.tileIndex(8, 8)] = trackBit(TrackDir.SouthEast);
    map.trackBits[map.tileIndex(9, 9)] = trackBit(TrackDir.NorthWest);

    const segments = extractNetworkSegments(map, 0, 0, 15, 15);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.kind === NetKind.Rail)).toBe(true);
    expect(segments[0]!.bx).toBe(9.0);
    expect(segments[0]!.by).toBe(9.0);
    expect(segments[1]!.bx).toBe(9.0);
    expect(segments[1]!.by).toBe(9.0);
  });

  it('a level crossing emits both kinds from one tile', () => {
    const map = new TileMap(16);
    const index = map.tileIndex(3, 3);
    map.roadBits[index] = RoadBit.North | RoadBit.South;
    map.trackBits[index] = trackBit(TrackDir.East) | trackBit(TrackDir.West);

    const segments = extractNetworkSegments(map, 3, 3, 3, 3);
    expect(segments.filter((s) => s.kind === NetKind.Road)).toHaveLength(2);
    expect(segments.filter((s) => s.kind === NetKind.Rail)).toHaveLength(2);
  });

  it('a range beyond the map edge clamps instead of reading out of bounds', () => {
    const map = new TileMap(16);
    map.roadBits[map.tileIndex(15, 15)] = RoadBit.West;
    const segments = extractNetworkSegments(map, 8, 8, 40, 40);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.tileX).toBe(15);
  });

  it('an empty region yields nothing', () => {
    const map = new TileMap(16);
    expect(extractNetworkSegments(map, 0, 0, 15, 15)).toHaveLength(0);
  });
});
