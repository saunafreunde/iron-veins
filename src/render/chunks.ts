import { MAX_HEIGHT } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { TRACK_DIR_COUNT, TRACK_DX, TRACK_DY } from '../sim/map/track';
import { RoadBit } from '../sim/town/types';
import { HEIGHT_PX, TILE_H, TILE_W } from './projection';
import { BAKED_STATIC_MAX_LIFT_PX } from './staticArt';
import { CELL_HEADROOM_STEPS, CELL_SKIRT_STEPS } from './TerrainAtlas';

/**
 * The pure half of the hybrid renderer (SPEC.md 16.1, SPEC2 E-04, D-161).
 *
 * Everything here is a function of the tile layers and plain numbers: chunk
 * geometry, camera-AABB culling, the checksums that decide which chunks a map
 * revision actually touched, and the polyline extraction of the 0.25x
 * abstract mode. No Pixi, no canvas, no state - which is what makes the
 * chunk renderer's decisions testable headless while the RenderTexture work
 * itself stays in MapView.
 */

/** Chunk edge length. [tiles] Origin: SPEC.md 16.1, "32x32-Tile-Chunks". */
export const CHUNK_TILES = 32;

/**
 * World pixels a chunk texture reserves ABOVE the ground line of its highest
 * tile, for whatever art stands on it. [px at zoom 1]
 *
 * The larger of the two things a chunk can bake: the procedural atlas cell's
 * own headroom (`CELL_HEADROOM_STEPS` height steps, D-117's fix for the
 * silently guillotined cooling tower) and the tallest BAKED static cell
 * (`BAKED_STATIC_MAX_LIFT_PX`, M13's Kenney buildings). A chunk that reserved
 * only the procedural 48 px would cut every skyscraper off at the chunk seam
 * at 0.5x while the same building drew whole one zoom step up - the same
 * unwritten agreement, one container further out.
 *
 * It is deliberately a CONSTANT rather than a measurement of the loaded
 * manifest: chunk RenderTextures are recycled between chunks (see
 * {@link chunkAabb}), so a headroom that changed when the bake finished
 * loading would hand a bake a texture of the wrong size. The price of the
 * constant is ~8 % more chunk texture area in a build with no bake at all.
 */
export const CHUNK_ART_HEADROOM_PX = Math.max(
  CELL_HEADROOM_STEPS * HEIGHT_PX,
  BAKED_STATIC_MAX_LIFT_PX,
);

/** How many chunks cover one map edge. */
export function chunksPerSide(mapSize: number): number {
  return Math.ceil(mapSize / CHUNK_TILES);
}

/** World-pixel bounding box of everything a chunk can draw. */
export interface ChunkAabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * The AABB of a chunk in unzoomed world pixels.
 *
 * Deliberately independent of the map size: the tile range is NOT clamped at
 * the map edge, so every chunk has exactly the same pixel dimensions and the
 * RenderTextures behind them are interchangeable - an evicted texture can be
 * rebaked for any other chunk without a reallocation. Tiles outside the map
 * simply draw nothing into the margin.
 *
 * The vertical margins are {@link CHUNK_ART_HEADROOM_PX} and the cell skirt
 * plus the full height range: a tile at MAX_HEIGHT carrying the tallest thing
 * the renderer can put on it must land inside the texture, and a sea-level
 * skirt must not be cut.
 */
export function chunkAabb(chunkX: number, chunkY: number): ChunkAabb {
  const x0 = chunkX * CHUNK_TILES;
  const y0 = chunkY * CHUNK_TILES;
  const x1 = x0 + CHUNK_TILES - 1;
  const y1 = y0 + CHUNK_TILES - 1;
  return {
    minX: (x0 - y1) * (TILE_W / 2) - TILE_W / 2,
    maxX: (x1 - y0) * (TILE_W / 2) + TILE_W / 2,
    minY: (x0 + y0) * (TILE_H / 2) - MAX_HEIGHT * HEIGHT_PX - CHUNK_ART_HEADROOM_PX,
    maxY: (x1 + y1) * (TILE_H / 2) + TILE_H + CELL_SKIRT_STEPS * HEIGHT_PX,
  };
}

/**
 * Camera-AABB culling (E-04): the packed keys (`chunkY * chunksPerSide +
 * chunkX`) of every chunk whose AABB intersects the view rectangle, written
 * into `out`. Returns how many were written.
 *
 * A plain scan over the whole chunk grid: 64x64 cheap comparisons for a
 * 2048 map, and it only runs when the camera actually moved to a different
 * tile range - never per frame.
 */
export function visibleChunks(
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
  mapSize: number,
  out: number[],
): number {
  const per = chunksPerSide(mapSize);
  const headroom = MAX_HEIGHT * HEIGHT_PX + CHUNK_ART_HEADROOM_PX;
  const skirt = TILE_H + CELL_SKIRT_STEPS * HEIGHT_PX;
  let count = 0;
  for (let chunkY = 0; chunkY < per; chunkY++) {
    for (let chunkX = 0; chunkX < per; chunkX++) {
      const x0 = chunkX * CHUNK_TILES;
      const y0 = chunkY * CHUNK_TILES;
      const x1 = x0 + CHUNK_TILES - 1;
      const y1 = y0 + CHUNK_TILES - 1;
      const minX = (x0 - y1) * (TILE_W / 2) - TILE_W / 2;
      if (minX > viewRight) continue;
      const maxX = (x1 - y0) * (TILE_W / 2) + TILE_W / 2;
      if (maxX < viewLeft) continue;
      const minY = (x0 + y0) * (TILE_H / 2) - headroom;
      if (minY > viewBottom) continue;
      const maxY = (x1 + y1) * (TILE_H / 2) + skirt;
      if (maxY < viewTop) continue;
      out[count++] = chunkY * per + chunkX;
    }
  }
  return count;
}

/**
 * FNV-1a 32-bit constants - the render-side sibling of the sim's 64-bit hash
 * (src/sim/hash.ts). 32 bits suffice here: a collision merely skips one
 * chunk rebake until the next edit, it cannot desync anything.
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Checksum over the static layers a baked chunk draws.
 *
 * This is what turns "the map revision moved" into "THESE chunks changed":
 * the revision is one counter for the whole map, so without a per-chunk
 * digest every terraform would rebake every cached chunk. The corner rows
 * are sampled one past the tile range because seam corners are shared -
 * an edit to a shared corner must dirty every chunk that draws a slope
 * from it.
 *
 * `full` folds in every layer the 0.5x bake renders (roads, track, rail
 * type, signals, waypoints, structures, buildings); without it only the
 * terrain of the 0.25x abstract bake is covered. Rail type is included
 * although today's track art ignores it - M13 draws catenary from it, and
 * a checksum that lags the art by one milestone is a stale-chunk bug
 * waiting to be reported.
 *
 * Two folds serve the living water of D-164. `oceanMask` (both profiles)
 * because the tone of a baked water tile reads it, and the mask can flip
 * far from any local edit - a canal dug at the coast reclassifies a whole
 * lake without moving one corner inside this chunk. And a one-tile terrain
 * RING (full profile) because the coastline foam reads the NEIGHBOUR's
 * terrain: a shoreline flip just across the chunk border must dirty this
 * chunk even on the rare edit that leaves every shared corner where it was.
 */
export function chunkChecksum(map: TileMap, chunkX: number, chunkY: number, full: boolean): number {
  const size = map.size;
  const x0 = chunkX * CHUNK_TILES;
  const y0 = chunkY * CHUNK_TILES;
  const xMax = Math.min(x0 + CHUNK_TILES - 1, size - 1);
  const yMax = Math.min(y0 + CHUNK_TILES - 1, size - 1);
  let hash = FNV_OFFSET | 0;

  const cornerStride = size + 1;
  for (let y = y0; y <= yMax + 1; y++) {
    let index = y * cornerStride + x0;
    for (let x = x0; x <= xMax + 1; x++, index++) {
      hash = Math.imul(hash ^ map.cornerHeight[index]!, FNV_PRIME);
    }
  }

  for (let y = y0; y <= yMax; y++) {
    let index = y * size + x0;
    for (let x = x0; x <= xMax; x++, index++) {
      hash = Math.imul(hash ^ map.terrain[index]!, FNV_PRIME);
      hash = Math.imul(hash ^ map.oceanMask[index]!, FNV_PRIME);
      if (full) {
        hash = Math.imul(hash ^ map.roadBits[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.trackBits[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.railType[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.signal[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.waypoint[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.structure[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.structureHeight[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.buildingKind[index]!, FNV_PRIME);
        hash = Math.imul(hash ^ map.buildingLevel[index]!, FNV_PRIME);
      }
    }
  }

  if (full) {
    // The one-tile terrain ring, clamped at the map edge. Fixed walk order
    // (top row, bottom row, then the two side columns) - any fixed order
    // does, it only has to be the same one every time.
    const xRing0 = Math.max(x0 - 1, 0);
    const xRing1 = Math.min(xMax + 1, size - 1);
    if (y0 - 1 >= 0) {
      let index = (y0 - 1) * size + xRing0;
      for (let x = xRing0; x <= xRing1; x++, index++) {
        hash = Math.imul(hash ^ map.terrain[index]!, FNV_PRIME);
      }
    }
    if (yMax + 1 <= size - 1) {
      let index = (yMax + 1) * size + xRing0;
      for (let x = xRing0; x <= xRing1; x++, index++) {
        hash = Math.imul(hash ^ map.terrain[index]!, FNV_PRIME);
      }
    }
    for (let y = y0; y <= yMax; y++) {
      if (x0 - 1 >= 0) hash = Math.imul(hash ^ map.terrain[y * size + x0 - 1]!, FNV_PRIME);
      if (xMax + 1 <= size - 1) {
        hash = Math.imul(hash ^ map.terrain[y * size + xMax + 1]!, FNV_PRIME);
      }
    }
  }
  return hash >>> 0;
}

/** Anything cached per chunk that remembers the checksum it was built from. */
export interface HasChecksum {
  readonly checksum: number;
}

/**
 * The dirty set of a revision change: every cached chunk whose static layers
 * no longer hash to what was baked. Writes the stale keys into `out` and
 * returns how many there are; untouched chunks keep their texture, which is
 * the E-04 promise ("Rebake nur bei Map-Revision und nur beruehrte Chunks").
 */
export function computeDirtySet(
  map: TileMap,
  baked: ReadonlyMap<number, HasChecksum>,
  full: boolean,
  out: number[],
): number {
  const per = chunksPerSide(map.size);
  let count = 0;
  for (const [key, entry] of baked) {
    const chunkX = key % per;
    const chunkY = (key / per) | 0;
    if (chunkChecksum(map, chunkX, chunkY, full) !== entry.checksum) {
      out[count++] = key;
    }
  }
  return count;
}

// ------------------------------------------------------------- abstract mode

/** What kind of network a polyline segment belongs to. */
export const NetKind = {
  Road: 0,
  Rail: 1,
} as const;
export type NetKind = (typeof NetKind)[keyof typeof NetKind];

/**
 * One half-segment of the abstract network: from the centre of its tile
 * towards the edge (orthogonal) or corner (diagonal) it connects through.
 *
 * Endpoints are CONTINUOUS tile coordinates (a tile's centre is x + 0.5), so
 * the renderer can push them through the 16.1 projection at whatever height
 * the tile displays at. Each tile emits only its own half of every
 * connection; the neighbour's reciprocal bit contributes the other half, so
 * lines are continuous and nothing is drawn twice.
 */
export interface NetSegment {
  readonly kind: NetKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** Tile offset per road bit; roads connect through the four edges only. */
const ROAD_DELTAS: readonly (readonly [number, number, number])[] = [
  [RoadBit.West, -1, 0],
  [RoadBit.East, 1, 0],
  [RoadBit.North, 0, -1],
  [RoadBit.South, 0, 1],
];

/**
 * The network polylines of the 0.25x abstract mode (SPEC.md 16.1): every
 * road and track connection in the tile range as half-segments. Below 0.5x
 * the detail sprites are stripped, so without this the network simply
 * vanishes from the overview - the gap M12 closes.
 */
export function extractNetworkSegments(
  map: TileMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): NetSegment[] {
  const size = map.size;
  const xMin = Math.max(x0, 0);
  const yMin = Math.max(y0, 0);
  const xMax = Math.min(x1, size - 1);
  const yMax = Math.min(y1, size - 1);
  const out: NetSegment[] = [];

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const index = y * size + x;
      const centreX = x + 0.5;
      const centreY = y + 0.5;

      const roads = map.roadBits[index]!;
      if (roads !== 0) {
        for (const [bit, dx, dy] of ROAD_DELTAS) {
          if ((roads & bit) === 0) continue;
          out.push({
            kind: NetKind.Road,
            tileX: x,
            tileY: y,
            ax: centreX,
            ay: centreY,
            bx: centreX + dx / 2,
            by: centreY + dy / 2,
          });
        }
      }

      const tracks = map.trackBits[index]!;
      if (tracks !== 0) {
        for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
          if ((tracks & (1 << direction)) === 0) continue;
          out.push({
            kind: NetKind.Rail,
            tileX: x,
            tileY: y,
            ax: centreX,
            ay: centreY,
            bx: centreX + TRACK_DX[direction]! / 2,
            by: centreY + TRACK_DY[direction]! / 2,
          });
        }
      }
    }
  }
  return out;
}
