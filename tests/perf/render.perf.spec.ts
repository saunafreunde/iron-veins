import { beforeAll, describe, expect, it } from 'vitest';
import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotVehicle,
} from '../../src/shared/snapshot';
import { TileMap } from '../../src/sim/map/TileMap';
import { packSignal, SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { trackBit, TrackDir } from '../../src/sim/map/track';
import { BuildingKind, RoadBit } from '../../src/sim/town/types';
import {
  DrawLayer,
  drawOrder,
  HEIGHT_PX,
  TILE_W,
  tileToWorld,
  vehicleDrawOrder,
} from '../../src/render/projection';
import { CHUNK_TILES, chunkChecksum, extractNetworkSegments } from '../../src/render/chunks';
import { sampleWorldX, sampleWorldY, shouldSnap } from '../../src/render/interpolation';
import { coastEdgeMask, FOAM_EDGE_COUNT, foamVariant, isDeepWater } from '../../src/render/water';

/**
 * The render CPU tripwire of SPEC2 6.3: Sprite-Pool-Rebuild-ms, Draw-Prep-ms
 * and - since M12 - Chunk-Bake-ms, held in CI before the M12/M13 art
 * milestones start spending against them.
 *
 * The two frame-rate budgets of section 21 need a GPU and a compositor and
 * stay hand-measured (README.md). What CAN run headless is the CPU side of a
 * frame, and that is where a render regression that no screenshot would catch
 * builds up: the per-tile work of `MapView.rebuild` (diagonal iteration, layer
 * decisions, frame-cache lookups, draw-order keys) and the per-frame work of
 * `MapView.drawVehicles` (stride reads, height lookups, the E-05 generation
 * lerp, vehicle draw-order sort keys).
 *
 * This is a PROXY, stated as one: it replays the same reads, the same key
 * arithmetic and the same frame-cache lookups as `MapView`, writing into flat
 * arrays where `MapView` touches Pixi sprites. Pixi itself is deliberately
 * absent - importing it here would pull a renderer into the simulation's test
 * runs, which M9 explicitly refused. A proxy cannot see sprite-pool churn
 * inside Pixi, so its thresholds are GENEROUS - a tripwire for regressions of
 * multiples (an accidental per-frame rebuild, a quadratic layer scan), not a
 * frame-time promise.
 *
 * The gate is the MEDIAN of the samples; the p99 is printed for the record
 * and held only by a very generous backstop (D-167). Measured on the
 * reference machine with four busy-loop processes saturating the 4C/8T box:
 * contention inflates the p99 tail by multiples (chunk bake 2.8 -> 11.1 ms,
 * rebuild 3.9 -> 39.3 ms - past even the old 25 ms wire) but moves the
 * median at most ~1.6x (0.51 -> 0.84 ms, 1.63 -> 2.75 ms). Scheduler noise
 * lives in the tail; a real regression multiplies every sample and takes the
 * median with it, so the median gate is both stabler under load AND as
 * sensitive to the regressions-of-multiples D-136 exists to catch. The
 * backstop covers the one shape a median cannot see: a tail-only storm such
 * as periodic cache eviction.
 */

/**
 * Median tripwire: one full sprite-pool rebuild of a big viewport. [ms]
 * 6x the clean median (1.63 ms), 3.6x the saturated-box median (D-167).
 */
const REBUILD_P50_TRIPWIRE_MS = 10;

/**
 * p99 backstop for the rebuild: above the worst observation ever taken on a
 * fully saturated box (39.3 ms), an order of magnitude over clean. [ms]
 */
const REBUILD_P99_BACKSTOP_MS = 60;

/**
 * Median tripwire: one frame of vehicle draw preparation at the snapshot
 * cap. [ms] 6.7x the clean median (0.75 ms), 4x the saturated median.
 */
const DRAW_PREP_P50_TRIPWIRE_MS = 5;

/** p99 backstop for draw prep: worst saturated observations 8-9 ms. [ms] */
const DRAW_PREP_P99_BACKSTOP_MS = 30;

/**
 * Median tripwire: the CPU half of one 32x32 chunk rebake. [ms]
 * 6x the clean median (0.51 ms), 3.6x the saturated median. The 4 ms M12
 * ACCEPTANCE number ("Chunk-Rebake gemessen <= 4 ms") is deliberately NOT
 * the gate any more: it was a clean-machine p99 measurement doing double
 * duty as a CI threshold with zero headroom, and it flaked under ordinary
 * desktop load (D-167). The acceptance evidence - clean p99 1.57 ms -
 * stands recorded in SPEC2 6.1.1; an acceptance number is history, a
 * tripwire is a gate. The proxy still replays the checksum that decides the
 * rebake, the full-profile placement loop and the abstract-profile polyline
 * extraction - a superset of what either profile pays per chunk.
 */
const CHUNK_BAKE_P50_TRIPWIRE_MS = 3;

/** p99 backstop for the chunk bake: worst saturated observations 11-13 ms. [ms] */
const CHUNK_BAKE_P99_BACKSTOP_MS = 30;

/**
 * The measured window: 64x64 tiles is roughly what a 4K screen shows at zoom
 * 1 - deliberately larger than the common case, never smaller.
 */
const MAP_SIZE = 256;
const WINDOW_MIN = 16;
const WINDOW_MAX = WINDOW_MIN + 64 - 1;

const REBUILD_SAMPLES = 200;
const DRAW_PREP_SAMPLES = 500;

/** Ground height of the synthetic map. [height levels] */
const GROUND = 5;

/**
 * A draw list row per placed sprite: the flat-array stand-in for what
 * `MapView.place` writes onto a Pixi sprite.
 */
interface DrawList {
  readonly key: Float64Array;
  readonly frame: Int32Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
}

/**
 * A dense synthetic town-and-rail quarter: every branch of the rebuild loop -
 * road, track, signal, building - fires on a realistic share of tiles, so the
 * proxy prices the loop's work, not its skips. Since M12 that includes the
 * living water (D-164): one tile row in six is a canal, so the water branch -
 * tone lookup, coast-edge mask, foam placements - is priced too, and every
 * canal tile is a worst case with land on both shores.
 */
function buildBusyMap(): TileMap {
  const map = new TileMap(MAP_SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const eastWest = trackBit(TrackDir.East) | trackBit(TrackDir.West);
  for (let y = WINDOW_MIN; y <= WINDOW_MAX; y++) {
    for (let x = WINDOW_MIN; x <= WINDOW_MAX; x++) {
      const index = map.tileIndex(x, y);
      if (y % 6 === 3) {
        map.terrain[index] = Terrain.Water;
        map.oceanMask[index] = 1;
      } else if (y % 6 === 0) {
        map.trackBits[index] = eastWest;
        if (x % 7 === 0) map.signal[index] = packSignal(SignalKind.Block, TrackDir.East);
      } else if (y % 4 === 1) {
        map.roadBits[index] = RoadBit.East | RoadBit.West;
        map.terrain[index] = Terrain.TownGround;
      } else if ((x + y) % 5 === 0) {
        map.buildingKind[index] = BuildingKind.Residential + ((x + y) % 3);
        map.buildingLevel[index] = 1 + (x % 3);
        map.terrain[index] = Terrain.TownGround;
      }
    }
  }
  return map;
}

/**
 * The water branch of `MapView.rebuild` and `MapView.bakeChunk`, shared by
 * both proxies: tone by depth, the animated ground cell, the coast-edge mask
 * and one foam placement per land-facing edge (D-164). Returns a fold of the
 * tone decision so it cannot be dead-code eliminated.
 */
function waterProxy(
  map: TileMap,
  x: number,
  y: number,
  slope: number,
  world: { x: number; y: number },
  height: number,
  place: (key: string, worldX: number, worldY: number, zIndex: number) => void,
): number {
  const deep = isDeepWater(map, x, y) ? 1 : 0;
  place(`w1:${slope}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Ground));
  const mask = coastEdgeMask(map, x, y);
  if (mask !== 0) {
    for (let edge = 0; edge < FOAM_EDGE_COUNT; edge++) {
      if ((mask & (1 << edge)) === 0) continue;
      place(
        `f${foamVariant(edge, slope)}`,
        world.x,
        world.y,
        drawOrder(x, y, height, DrawLayer.Road),
      );
    }
  }
  return deep;
}

/**
 * The CPU of `MapView.rebuild`, sprite for sprite: diagonal iteration, height
 * and slope reads, `tileToWorld`, the string frame key and its cache lookup,
 * the `drawOrder` zIndex - everything except handing the result to Pixi.
 */
function rebuildProxy(map: TileMap, out: DrawList, frames: Map<string, number>): number {
  let used = 0;
  let deepFold = 0;
  const place = (key: string, worldX: number, worldY: number, zIndex: number): void => {
    let frame = frames.get(key);
    if (frame === undefined) {
      frame = frames.size;
      frames.set(key, frame);
    }
    out.key[used] = zIndex;
    out.frame[used] = frame;
    out.x[used] = worldX - TILE_W / 2;
    out.y[used] = worldY - HEIGHT_PX;
    used++;
  };

  for (let sum = WINDOW_MIN * 2; sum <= WINDOW_MAX * 2; sum++) {
    const xStart = Math.max(WINDOW_MIN, sum - WINDOW_MAX);
    const xEnd = Math.min(WINDOW_MAX, sum - WINDOW_MIN);

    for (let x = xStart; x <= xEnd; x++) {
      const y = sum - x;
      const index = map.tileIndex(x, y);
      const height = map.baseHeight(x, y);
      const world = tileToWorld(x, y, height);

      const terrain = map.terrain[index]!;
      const slope = map.slopeAt(x, y);
      if (terrain === Terrain.Water) {
        deepFold += waterProxy(map, x, y, slope, world, height, place);
        continue;
      }
      place(`t${terrain}:${slope}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Ground));

      if (map.structure[index] !== 0) continue;

      const roadBits = map.roadBits[index]!;
      if (roadBits !== 0) {
        place(`r${roadBits}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Road));
      }

      const trackBits = map.trackBits[index]!;
      if (trackBits !== 0) {
        for (let direction = 0; direction < 8; direction++) {
          if ((trackBits & (1 << direction)) === 0) continue;
          place(`k${direction}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Track));
        }
      }

      if (map.signal[index] !== 0) {
        place('signal', world.x, world.y, drawOrder(x, y, height, DrawLayer.Signal));
      }

      const buildingKind = map.buildingKind[index]!;
      if (buildingKind !== 0) {
        const level = map.buildingLevel[index]!;
        place(
          `b${buildingKind}:${level}`,
          world.x,
          world.y,
          drawOrder(x, y, height, DrawLayer.Building),
        );
      }
    }
  }
  return used + (deepFold === -1 ? 1 : 0);
}

/**
 * A full snapshot vehicle block, every row valid and inside the window, laid
 * out exactly as the worker writes it - the draw-prep proxy reads it with the
 * renderer's own stride constants.
 */
function syntheticVehicleBlock(map: TileMap): Int32Array {
  const data = new Int32Array(SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE);
  const span = WINDOW_MAX - WINDOW_MIN; // exclusive of the last column: next = tile + 1 stays inside
  for (let i = 0; i < SNAPSHOT_MAX_VEHICLES; i++) {
    const base = i * SNAPSHOT_VEHICLE_STRIDE;
    const x = WINDOW_MIN + ((i * 7) % span);
    const y = WINDOW_MIN + ((i * 13) % span);
    const tile = map.tileIndex(x, y);
    data[base + SnapshotVehicle.Tile] = tile;
    data[base + SnapshotVehicle.NextTile] = tile + 1;
    data[base + SnapshotVehicle.ProgressMilli] = (i * 37) % 1000;
    data[base + SnapshotVehicle.State] = 1;
    data[base + SnapshotVehicle.Kind] = i % 4 === 0 ? 1 : 0;
    data[base + SnapshotVehicle.VehicleId] = i;
    data[base + SnapshotVehicle.Owner] = i % 4;
  }
  return data;
}

/**
 * The previous generation's copy for the E-05 lerp: the same vehicles one
 * tick earlier on the same steps, plus the id-to-row index the interpolator
 * maintains - here the identity, because the synthetic block never compacts.
 */
function syntheticPrevBlock(data: Int32Array): { prev: Int32Array; prevRowById: Int32Array } {
  const prev = new Int32Array(data);
  const prevRowById = new Int32Array(SNAPSHOT_MAX_VEHICLES);
  for (let i = 0; i < SNAPSHOT_MAX_VEHICLES; i++) {
    const base = i * SNAPSHOT_VEHICLE_STRIDE;
    prev[base + SnapshotVehicle.ProgressMilli] = Math.max(
      0,
      prev[base + SnapshotVehicle.ProgressMilli]! - 350,
    );
    prevRowById[i] = i;
  }
  return { prev, prevRowById };
}

/**
 * The CPU of `MapView.drawVehicles` for one frame: stride reads, tile
 * decomposition, `railHeight` at both ends, projection, the E-05 generation
 * lerp (previous-row lookup, snap check, both samples, alpha blend) and the
 * vehicle draw-order key - everything except the sprite it lands on.
 */
function drawPrepProxy(
  map: TileMap,
  data: Int32Array,
  prev: Int32Array,
  prevRowById: Int32Array,
  alpha: number,
  out: DrawList,
): number {
  const size = map.size;
  let drawn = 0;
  for (let i = 0; i < SNAPSHOT_MAX_VEHICLES; i++) {
    const base = i * SNAPSHOT_VEHICLE_STRIDE;
    const tile = data[base + SnapshotVehicle.Tile]!;
    const next = data[base + SnapshotVehicle.NextTile]!;
    const progress = data[base + SnapshotVehicle.ProgressMilli]! / 1000;
    const state = data[base + SnapshotVehicle.State]!;
    const vehicleId = data[base + SnapshotVehicle.VehicleId]!;

    const fromX = tile % size;
    const fromY = (tile / size) | 0;
    const toX = next % size;
    const toY = (next / size) | 0;
    if (!map.contains(fromX, fromY) || !map.contains(toX, toY)) continue;

    const fromHeight = map.railHeight(fromX, fromY);
    const toHeight = map.railHeight(toX, toY);
    const currX = sampleWorldX(fromX, fromY, toX, toY, progress);
    const currY = sampleWorldY(fromX, fromY, fromHeight, toX, toY, toHeight, progress);

    let worldX = currX;
    let worldY = currY;
    const prevRow = vehicleId >= 0 && vehicleId < prevRowById.length ? prevRowById[vehicleId]! : -1;
    if (alpha < 1 && prevRow >= 0) {
      const prevBase = prevRow * SNAPSHOT_VEHICLE_STRIDE;
      const prevTile = prev[prevBase + SnapshotVehicle.Tile]!;
      const prevNext = prev[prevBase + SnapshotVehicle.NextTile]!;
      const prevState = prev[prevBase + SnapshotVehicle.State]!;
      const prevFromX = prevTile % size;
      const prevFromY = (prevTile / size) | 0;
      const prevToX = prevNext % size;
      const prevToY = (prevNext / size) | 0;
      if (
        map.contains(prevFromX, prevFromY) &&
        map.contains(prevToX, prevToY) &&
        !shouldSnap(fromX - prevFromX, fromY - prevFromY, prevState, state)
      ) {
        const prevProgress = prev[prevBase + SnapshotVehicle.ProgressMilli]! / 1000;
        const prevX = sampleWorldX(prevFromX, prevFromY, prevToX, prevToY, prevProgress);
        const prevY = sampleWorldY(
          prevFromX,
          prevFromY,
          map.railHeight(prevFromX, prevFromY),
          prevToX,
          prevToY,
          map.railHeight(prevToX, prevToY),
          prevProgress,
        );
        worldX = prevX + (currX - prevX) * alpha;
        worldY = prevY + (currY - prevY) * alpha;
      }
    }

    out.key[drawn] = vehicleDrawOrder(fromX, fromY, fromHeight, toX, toY, toHeight, progress);
    out.frame[drawn] = data[base + SnapshotVehicle.Kind]!;
    out.x[drawn] = worldX - TILE_W / 2;
    out.y[drawn] = worldY - HEIGHT_PX;
    drawn++;
  }
  return drawn;
}

/**
 * The CPU of one `MapView.bakeChunk` plus its cache bookkeeping: the
 * checksum over the chunk's static layers, the diagonal placement loop of
 * the full profile (terrain, roads, track, signals, buildings - the same
 * branches as the rebuild proxy, confined to one chunk), and the polyline
 * extraction the abstract profile caches. The GPU RenderTexture pass is the
 * one thing it cannot see, exactly as D-136 states for the other proxies.
 */
function chunkBakeProxy(
  map: TileMap,
  chunkX: number,
  chunkY: number,
  out: DrawList,
  frames: Map<string, number>,
): number {
  const checksum = chunkChecksum(map, chunkX, chunkY, true);
  let used = 0;
  let deepFold = 0;
  const place = (key: string, worldX: number, worldY: number, zIndex: number): void => {
    let frame = frames.get(key);
    if (frame === undefined) {
      frame = frames.size;
      frames.set(key, frame);
    }
    out.key[used] = zIndex;
    out.frame[used] = frame;
    out.x[used] = worldX - TILE_W / 2;
    out.y[used] = worldY - HEIGHT_PX;
    used++;
  };

  const x0 = chunkX * CHUNK_TILES;
  const y0 = chunkY * CHUNK_TILES;
  const xMax = Math.min(x0 + CHUNK_TILES - 1, map.size - 1);
  const yMax = Math.min(y0 + CHUNK_TILES - 1, map.size - 1);

  for (let sum = x0 + y0; sum <= xMax + yMax; sum++) {
    const xStart = Math.max(x0, sum - yMax);
    const xEnd = Math.min(xMax, sum - y0);

    for (let x = xStart; x <= xEnd; x++) {
      const y = sum - x;
      const index = map.tileIndex(x, y);
      const height = map.baseHeight(x, y);
      const world = tileToWorld(x, y, height);

      const terrain = map.terrain[index]!;
      const slope = map.slopeAt(x, y);
      if (terrain === Terrain.Water) {
        deepFold += waterProxy(map, x, y, slope, world, height, place);
        continue;
      }
      place(`t${terrain}:${slope}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Ground));

      if (map.structure[index] !== 0) continue;

      const roadBits = map.roadBits[index]!;
      if (roadBits !== 0) {
        place(`r${roadBits}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Road));
      }

      const trackBits = map.trackBits[index]!;
      if (trackBits !== 0) {
        for (let direction = 0; direction < 8; direction++) {
          if ((trackBits & (1 << direction)) === 0) continue;
          place(`k${direction}`, world.x, world.y, drawOrder(x, y, height, DrawLayer.Track));
        }
      }

      if (map.signal[index] !== 0) {
        place('signal', world.x, world.y, drawOrder(x, y, height, DrawLayer.Signal));
      }

      const buildingKind = map.buildingKind[index]!;
      if (buildingKind !== 0) {
        const level = map.buildingLevel[index]!;
        place(
          `b${buildingKind}:${level}`,
          world.x,
          world.y,
          drawOrder(x, y, height, DrawLayer.Building),
        );
      }
    }
  }

  const segments = extractNetworkSegments(map, x0, y0, xMax, yMax);
  // Fold the checksum into the result so neither half can be dead-code
  // eliminated out of the measurement.
  return used + segments.length + (checksum === 0 ? 1 : 0) + (deepFold === -1 ? 1 : 0);
}

function percentile(samples: Float64Array, share: number): number {
  const sorted = Array.from(samples).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * share)]!;
}

let map: TileMap;

beforeAll(() => {
  map = buildBusyMap();
});

describe('render CPU tripwire (SPEC2 6.3)', () => {
  it('rebuilds the sprite pool of a big viewport inside the tripwire', () => {
    const out: DrawList = {
      key: new Float64Array(65_536),
      frame: new Int32Array(65_536),
      x: new Float64Array(65_536),
      y: new Float64Array(65_536),
    };
    const frames = new Map<string, number>();
    // Warm run: the first rebuild pays the frame-cache misses, exactly as the
    // real MapView does once per texture - not what the steady state costs.
    const placed = rebuildProxy(map, out, frames);

    const samples = new Float64Array(REBUILD_SAMPLES);
    for (let i = 0; i < REBUILD_SAMPLES; i++) {
      const started = performance.now();
      rebuildProxy(map, out, frames);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `sprite pool rebuild: ${placed} sprites over 64x64 tiles, ` +
        `p50 ${p50.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms ` +
        `(median tripwire ${REBUILD_P50_TRIPWIRE_MS} ms, backstop ${REBUILD_P99_BACKSTOP_MS} ms)`,
    );

    expect(placed).toBeGreaterThan(4_096);
    expect(p50).toBeLessThan(REBUILD_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(REBUILD_P99_BACKSTOP_MS);
  });

  it('prepares a full vehicle block for drawing inside the tripwire', () => {
    const out: DrawList = {
      key: new Float64Array(SNAPSHOT_MAX_VEHICLES),
      frame: new Int32Array(SNAPSHOT_MAX_VEHICLES),
      x: new Float64Array(SNAPSHOT_MAX_VEHICLES),
      y: new Float64Array(SNAPSHOT_MAX_VEHICLES),
    };
    const data = syntheticVehicleBlock(map);
    // Alpha one half: the E-05 lerp branch runs on EVERY vehicle, which is
    // the worst frame - alpha 1 (a settled frame) skips the branch wholesale.
    const { prev, prevRowById } = syntheticPrevBlock(data);
    const drawn = drawPrepProxy(map, data, prev, prevRowById, 0.5, out);

    const samples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      drawPrepProxy(map, data, prev, prevRowById, 0.5, out);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `vehicle draw prep: ${drawn} vehicles per frame, ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${DRAW_PREP_P50_TRIPWIRE_MS} ms, backstop ${DRAW_PREP_P99_BACKSTOP_MS} ms)`,
    );

    expect(drawn).toBe(SNAPSHOT_MAX_VEHICLES);
    expect(p50).toBeLessThan(DRAW_PREP_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(DRAW_PREP_P99_BACKSTOP_MS);
  });

  it('rebakes one 32x32 chunk inside the tripwire', () => {
    const out: DrawList = {
      key: new Float64Array(8_192),
      frame: new Int32Array(8_192),
      x: new Float64Array(8_192),
      y: new Float64Array(8_192),
    };
    const frames = new Map<string, number>();
    // Chunk (1,1) covers tiles 32..63, all inside the busy window.
    const placed = chunkBakeProxy(map, 1, 1, out, frames);

    const samples = new Float64Array(REBUILD_SAMPLES);
    for (let i = 0; i < REBUILD_SAMPLES; i++) {
      const started = performance.now();
      chunkBakeProxy(map, 1, 1, out, frames);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `chunk bake: ${placed} placements+segments over one ${CHUNK_TILES}x${CHUNK_TILES} chunk, ` +
        `p50 ${p50.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms ` +
        `(median tripwire ${CHUNK_BAKE_P50_TRIPWIRE_MS} ms, backstop ${CHUNK_BAKE_P99_BACKSTOP_MS} ms)`,
    );

    expect(placed).toBeGreaterThan(CHUNK_TILES * CHUNK_TILES);
    expect(p50).toBeLessThan(CHUNK_BAKE_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(CHUNK_BAKE_P99_BACKSTOP_MS);
  });
});
