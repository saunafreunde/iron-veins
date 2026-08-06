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

/**
 * The render CPU tripwire of SPEC2 6.3: Sprite-Pool-Rebuild-ms and
 * Draw-Prep-ms, held in CI before the M12/M13 art milestones start spending
 * against them.
 *
 * The two frame-rate budgets of section 21 need a GPU and a compositor and
 * stay hand-measured (README.md). What CAN run headless is the CPU side of a
 * frame, and that is where a render regression that no screenshot would catch
 * builds up: the per-tile work of `MapView.rebuild` (diagonal iteration, layer
 * decisions, frame-cache lookups, draw-order keys) and the per-frame work of
 * `MapView.drawVehicles` (stride reads, height lookups, interpolation, vehicle
 * draw-order sort keys).
 *
 * This is a PROXY, stated as one: it replays the same reads, the same key
 * arithmetic and the same frame-cache lookups as `MapView`, writing into flat
 * arrays where `MapView` touches Pixi sprites. Pixi itself is deliberately
 * absent - importing it here would pull a renderer into the simulation's test
 * runs, which M9 explicitly refused. A proxy cannot see sprite-pool churn
 * inside Pixi, so its thresholds are GENEROUS - a tripwire for regressions of
 * multiples (an accidental per-frame rebuild, a quadratic layer scan), not a
 * frame-time promise.
 */

/** Tripwire: one full sprite-pool rebuild of a big viewport. [ms] */
const REBUILD_P99_BUDGET_MS = 25;

/** Tripwire: one frame of vehicle draw preparation at the snapshot cap. [ms] */
const DRAW_PREP_P99_BUDGET_MS = 5;

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
 * proxy prices the loop's work, not its skips.
 */
function buildBusyMap(): TileMap {
  const map = new TileMap(MAP_SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const eastWest = trackBit(TrackDir.East) | trackBit(TrackDir.West);
  for (let y = WINDOW_MIN; y <= WINDOW_MAX; y++) {
    for (let x = WINDOW_MIN; x <= WINDOW_MAX; x++) {
      const index = map.tileIndex(x, y);
      if (y % 6 === 0) {
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
 * The CPU of `MapView.rebuild`, sprite for sprite: diagonal iteration, height
 * and slope reads, `tileToWorld`, the string frame key and its cache lookup,
 * the `drawOrder` zIndex - everything except handing the result to Pixi.
 */
function rebuildProxy(map: TileMap, out: DrawList, frames: Map<string, number>): number {
  let used = 0;
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
  return used;
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
 * The CPU of `MapView.drawVehicles` for one frame: stride reads, tile
 * decomposition, `railHeight` at both ends, projection, interpolation and the
 * vehicle draw-order key - everything except the sprite it lands on.
 */
function drawPrepProxy(map: TileMap, data: Int32Array, out: DrawList): number {
  const size = map.size;
  let drawn = 0;
  for (let i = 0; i < SNAPSHOT_MAX_VEHICLES; i++) {
    const base = i * SNAPSHOT_VEHICLE_STRIDE;
    const tile = data[base + SnapshotVehicle.Tile]!;
    const next = data[base + SnapshotVehicle.NextTile]!;
    const progress = data[base + SnapshotVehicle.ProgressMilli]! / 1000;

    const fromX = tile % size;
    const fromY = (tile / size) | 0;
    const toX = next % size;
    const toY = (next / size) | 0;
    if (!map.contains(fromX, fromY) || !map.contains(toX, toY)) continue;

    const fromHeight = map.railHeight(fromX, fromY);
    const toHeight = map.railHeight(toX, toY);
    const from = tileToWorld(fromX, fromY, fromHeight);
    const to = tileToWorld(toX, toY, toHeight);

    out.key[drawn] = vehicleDrawOrder(fromX, fromY, fromHeight, toX, toY, toHeight, progress);
    out.frame[drawn] = data[base + SnapshotVehicle.Kind]!;
    out.x[drawn] = from.x + (to.x - from.x) * progress - TILE_W / 2;
    out.y[drawn] = from.y + (to.y - from.y) * progress - HEIGHT_PX;
    drawn++;
  }
  return drawn;
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
        `(tripwire ${REBUILD_P99_BUDGET_MS} ms)`,
    );

    expect(placed).toBeGreaterThan(4_096);
    expect(p99).toBeLessThan(REBUILD_P99_BUDGET_MS);
  });

  it('prepares a full vehicle block for drawing inside the tripwire', () => {
    const out: DrawList = {
      key: new Float64Array(SNAPSHOT_MAX_VEHICLES),
      frame: new Int32Array(SNAPSHOT_MAX_VEHICLES),
      x: new Float64Array(SNAPSHOT_MAX_VEHICLES),
      y: new Float64Array(SNAPSHOT_MAX_VEHICLES),
    };
    const data = syntheticVehicleBlock(map);
    const drawn = drawPrepProxy(map, data, out);

    const samples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      drawPrepProxy(map, data, out);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `vehicle draw prep: ${drawn} vehicles per frame, ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(tripwire ${DRAW_PREP_P99_BUDGET_MS} ms)`,
    );

    expect(drawn).toBe(SNAPSHOT_MAX_VEHICLES);
    expect(p99).toBeLessThan(DRAW_PREP_P99_BUDGET_MS);
  });
});
