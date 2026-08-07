import { beforeAll, describe, expect, it } from 'vitest';
import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_RESERVED_STRIDE,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotReserved,
  SnapshotVehicle,
} from '../../src/shared/snapshot';
import { TileMap } from '../../src/sim/map/TileMap';
import { packSignal, signalKind, SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { trackBit, TrackDir } from '../../src/sim/map/track';
import { BlockIndex } from '../../src/sim/signals/blocks';
import { BuildingKind, RoadBit } from '../../src/sim/town/types';
import {
  DrawLayer,
  drawOrder,
  HEIGHT_PX,
  TILE_H,
  TILE_W,
  tileToWorld,
  vehicleDrawOrder,
} from '../../src/render/projection';
import { CHUNK_TILES, chunkChecksum, extractNetworkSegments } from '../../src/render/chunks';
import { sampleWorldX, sampleWorldY, shouldSnap } from '../../src/render/interpolation';
import {
  FACING_NONE,
  facingFromDelta,
  facingFromMovement,
  VEHICLE_FACING_DELTAS,
  variantIndex,
} from '../../src/render/vehicleArt';
import {
  BreadcrumbRing,
  consistFollowerDistances,
  MAX_CONSIST_FOLLOWERS,
  placeConsist,
  type ConsistPlacement,
} from '../../src/render/consistArt';
import { coastEdgeMask, FOAM_EDGE_COUNT, foamVariant, isDeepWater } from '../../src/render/water';
import { lampOffsetForRoadTile } from '../../src/render/emissive';
import { CATENARY_RAIL_TYPE, catenaryMastOffset } from '../../src/render/catenary';
import { collectClaimedBlocks, signalAspect } from '../../src/render/signalAspects';

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
 * lerp, vehicle draw-order sort keys, and since M13 the facing and variant
 * decisions of the baked vehicle art plus the consist rendering's breadcrumb
 * ring and arc-length placement walk, measured against a rail-heavy scene).
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
 * cap, in the M13 rail-heavy consist scene - every second vehicle a
 * ten-wagon coal train, 9,000 placed units per frame (six times the rail
 * load of the 1500-vehicle fixture's 150 trains). [ms] Re-measured for M13
 * bundle 3 with the breadcrumb record, the arc-length walk and the
 * per-wagon facing priced in: clean median 2.4-2.5 ms over three runs on
 * the reference machine - the gate was re-derived at 4x that, the same
 * generosity the 5 ms gate had over the pre-consist 0.75 ms (D-167).
 */
const DRAW_PREP_P50_TRIPWIRE_MS = 10;

/**
 * p99 backstop for draw prep: an order of magnitude over the clean p99
 * (4.7-5.4 ms measured with the consist scene), the rebuild backstop's own
 * ratio - the pre-consist saturated observations were ~5x clean. [ms]
 */
const DRAW_PREP_P99_BACKSTOP_MS = 60;

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
 * Median tripwire: one signal-aspect refresh on the claim edge (M13 B5) -
 * the collectClaimedBlocks pass over a busy reserved table plus the aspect
 * decision per visible signal, exactly what MapView pays per 20 Hz publish
 * (never per frame). Measured clean well under 0.1 ms; the gate is the
 * usual very generous multiple (D-167). [ms]
 */
const ASPECT_REFRESH_P50_TRIPWIRE_MS = 2;

/** p99 backstop for the aspect refresh, the usual order of magnitude. [ms] */
const ASPECT_REFRESH_P99_BACKSTOP_MS = 20;

/**
 * Median tripwire: the CPU half of one chunk's emissive-twin walk (M13,
 * D-172) - the building-and-lamp placement pass that fills the twin texture.
 * Measured clean ~0.05 ms per chunk; the gate is a very generous multiple
 * (D-167). The same walk also prices the REJECTED alternative: emissive as
 * live sprites above the chunks would run this per visible chunk on every
 * pan-rebuild AND keep those sprites in the per-frame draw - the D-164
 * option-B shape, argued with these numbers in D-172. [ms]
 */
const EMISSIVE_WALK_P50_TRIPWIRE_MS = 2;

/** p99 backstop for the emissive walk, the usual order of magnitude. [ms] */
const EMISSIVE_WALK_P99_BACKSTOP_MS = 20;

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
        // Electrified, so the M13 B5 catenary branch - wires per direction,
        // the mast parity - fires on every track tile of the proxy.
        map.railType[index] = CATENARY_RAIL_TYPE;
        if (x % 7 === 0) map.signal[index] = packSignal(SignalKind.Block, TrackDir.East);
      } else if (y % 4 === 1) {
        map.roadBits[index] = RoadBit.East | RoadBit.West;
        map.terrain[index] = Terrain.TownGround;
        // Town streets, so the M13 lamp rule fires in the emissive proxy.
        map.townId[index] = 1;
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
 * The track furniture of M13 B5, shared by the rebuild and chunk-bake
 * proxies exactly as `placeCatenary` is shared by the real paths: catenary
 * wires per connected direction and the mast-parity decision on an
 * electrified tile, and the kind-silhouetted signal post. The rebuild proxy
 * additionally prices the aspect decision; the bake proxy does not, because
 * the real bake places no lamp (claims are per-tick truth).
 */
function trackFurnitureProxy(
  map: TileMap,
  index: number,
  x: number,
  y: number,
  world: { x: number; y: number },
  height: number,
  trackBits: number,
  place: (key: string, worldX: number, worldY: number, zIndex: number) => void,
): void {
  if (map.railType[index] !== CATENARY_RAIL_TYPE) return;
  const order = drawOrder(x, y, height, DrawLayer.Catenary);
  for (let direction = 0; direction < 8; direction++) {
    if ((trackBits & (1 << direction)) === 0) continue;
    place(`cw${direction}`, world.x, world.y, order);
  }
  if (map.signal[index] === 0 && map.waypoint[index] === 0) {
    const mast = catenaryMastOffset(trackBits, x, y);
    if (mast !== null) {
      place(
        'cm',
        world.x + ((mast[0] - mast[1]) * TILE_W) / 2,
        world.y + ((mast[0] + mast[1]) * TILE_H) / 2,
        order,
      );
    }
  }
}

/**
 * The CPU of `MapView.rebuild`, sprite for sprite: diagonal iteration, height
 * and slope reads, `tileToWorld`, the string frame key and its cache lookup,
 * the `drawOrder` zIndex - and, since M13 B5, the catenary branch and the
 * signal-aspect decision per placed lamp - everything except handing the
 * result to Pixi.
 */
function rebuildProxy(
  map: TileMap,
  blocks: BlockIndex,
  claimed: ReadonlySet<number>,
  out: DrawList,
  frames: Map<string, number>,
): number {
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
        trackFurnitureProxy(map, index, x, y, world, height, trackBits, place);
      }

      const packedSignal = map.signal[index]!;
      if (packedSignal !== 0) {
        const order = drawOrder(x, y, height, DrawLayer.Signal);
        place(`sg${signalKind(packedSignal)}`, world.x, world.y, order);
        // The aspect lamp of M13 B5, decided exactly as MapView decides it.
        const aspect = signalAspect(map, blocks, claimed, index);
        place(`sa${aspect}`, world.x, world.y, order);
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
 * One rail vehicle of the M13 consist scene, as the proxy prices it: the
 * breadcrumb ring MapView keeps per multi-unit train plus the derived
 * follower distances - built once in setup, exactly like the real
 * reconciliation on the fleet-marker cadence.
 */
interface ProxyConsist {
  readonly ring: BreadcrumbRing;
  readonly distances: Float64Array;
  readonly followers: number;
}

/** The fixture's own coal-train stock: 18 m steam loco, 10 m open wagons. */
const CONSIST_LOCO_SPEC = 1_000;
const CONSIST_WAGON_SPEC = 1_520;
/** Wagons per proxy train - SPEC2 M13's named scene, the 10-wagon coal train. */
const CONSIST_WAGONS = 10;
/**
 * Every how-many-th vehicle is a consist train. 2 makes 750 ten-wagon
 * trains - six times the rail load of the 1500-vehicle fixture's 150
 * trains, which is what "rail-heavy" has to mean for a tripwire that must
 * catch regressions before a real scene ever shows them.
 */
const CONSIST_EVERY = 2;

/**
 * The consist map of the rail-heavy scene: every {@link CONSIST_EVERY}-th
 * vehicle a {@link CONSIST_WAGONS}-wagon train, its ring pre-walked along an
 * L-shaped path ending at the head - so every placement walk crosses a
 * corner, the most work a real curve can ask of it.
 */
function syntheticConsists(): Map<number, ProxyConsist> {
  const consists = new Map<number, ProxyConsist>();
  const span = WINDOW_MAX - WINDOW_MIN;
  const specIds = [CONSIST_LOCO_SPEC];
  for (let i = 0; i < CONSIST_WAGONS; i++) specIds.push(CONSIST_WAGON_SPEC);
  for (let i = 0; i < SNAPSHOT_MAX_VEHICLES; i += CONSIST_EVERY) {
    const x = WINDOW_MIN + ((i * 7) % span);
    const y = WINDOW_MIN + ((i * 13) % span);
    const ring = new BreadcrumbRing();
    // Oldest first: 1.5 tiles along +y, the corner, 1.5 tiles along +x to
    // the head - over three tiles of history for a ~2.1-tile train.
    for (let step = 0; step <= 6; step++) ring.record(x - 1.5, y - 1.5 + step * 0.25, GROUND);
    for (let step = 1; step <= 6; step++) ring.record(x - 1.5 + step * 0.25, y, GROUND);
    const distances = new Float64Array(MAX_CONSIST_FOLLOWERS);
    const followers = consistFollowerDistances(specIds, distances);
    consists.set(i, { ring, distances, followers });
  }
  return consists;
}

/**
 * The CPU of `MapView.drawVehicles` for one frame: stride reads, tile
 * decomposition, `railHeight` at both ends, projection, the E-05 generation
 * lerp (previous-row lookup, snap check, both samples, alpha blend), and -
 * since M13 - the baked-art decisions per vehicle (facing from the
 * interpolated movement vector with the standing-vehicle cache, the
 * hash-picked variant and the specId-to-variants map lookup) plus the
 * consist work per rail vehicle: the breadcrumb record (priced every frame,
 * though the real one runs only on the 20 Hz publish edge), the arc-length
 * placement walk and the per-wagon facing and draw-key writes. Everything
 * except the sprites it lands on.
 */
function drawPrepProxy(
  map: TileMap,
  data: Int32Array,
  prev: Int32Array,
  prevRowById: Int32Array,
  alpha: number,
  out: DrawList,
  specVariants: ReadonlyMap<number, number>,
  facings: Uint8Array,
  consists: ReadonlyMap<number, ProxyConsist>,
  consistScratch: readonly ConsistPlacement[],
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
    const currFx = fromX + (toX - fromX) * progress;
    const currFy = fromY + (toY - fromY) * progress;
    const currX = sampleWorldX(fromX, fromY, toX, toY, progress);
    const currY = sampleWorldY(fromX, fromY, fromHeight, toX, toY, toHeight, progress);

    let worldX = currX;
    let worldY = currY;
    let headFx = currFx;
    let headFy = currFy;
    let facing = -1;
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
        const prevFx = prevFromX + (prevToX - prevFromX) * prevProgress;
        const prevFy = prevFromY + (prevToY - prevFromY) * prevProgress;
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
        headFx = prevFx + (currFx - prevFx) * alpha;
        headFy = prevFy + (currFy - prevFy) * alpha;
        facing = facingFromMovement(prevFx, prevFy, currFx, currFy);
      }
    }

    // The M13 facing cache and variant pick, exactly as MapView runs them.
    if (facing < 0) {
      const cached = facings[vehicleId]!;
      if (cached !== FACING_NONE) {
        facing = cached;
      } else {
        facing = facingFromDelta(toX - fromX, toY - fromY);
        if (facing < 0) facing = 0;
      }
    }
    facings[vehicleId] = facing;
    const variants = specVariants.get(1000 + (vehicleId % 40)) ?? 0;
    const variant = variantIndex(vehicleId, variants);

    out.key[drawn] = vehicleDrawOrder(fromX, fromY, fromHeight, toX, toY, toHeight, progress);
    out.frame[drawn] = data[base + SnapshotVehicle.Kind]! + facing * 8 + variant * 64;
    out.x[drawn] = worldX - TILE_W / 2;
    out.y[drawn] = worldY - HEIGHT_PX;
    drawn++;

    // The consist work of M13 bundle 3, exactly as MapView runs it.
    const consist = consists.get(vehicleId);
    if (consist !== undefined) {
      consist.ring.record(currFx, currFy, GROUND);
      const delta = VEHICLE_FACING_DELTAS[facing]!;
      placeConsist(
        consist.ring,
        headFx,
        headFy,
        GROUND,
        delta[0],
        delta[1],
        consist.distances,
        consist.followers,
        consistScratch,
      );
      for (let unit = 0; unit < consist.followers; unit++) {
        const placed = consistScratch[unit]!;
        let wagonFacing = facingFromDelta(placed.dirX, placed.dirY);
        if (wagonFacing < 0) wagonFacing = facing;
        out.key[drawn] = drawOrder(
          Math.round(placed.fx),
          Math.round(placed.fy),
          Math.round(placed.h),
          DrawLayer.Vehicle,
        );
        out.frame[drawn] = CONSIST_WAGON_SPEC + wagonFacing * 8;
        out.x[drawn] = (placed.fx - placed.fy) * (TILE_W / 2);
        out.y[drawn] = (placed.fx + placed.fy) * (TILE_H / 2) - placed.h * HEIGHT_PX;
        drawn++;
      }
    }
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
        trackFurnitureProxy(map, index, x, y, world, height, trackBits, place);
      }

      const packedSignal = map.signal[index]!;
      if (packedSignal !== 0) {
        // The kind post bakes; the aspect lamp does not (M13 B5) - the real
        // bake path draws no per-tick truth into a cached texture.
        place(
          `sg${signalKind(packedSignal)}`,
          world.x,
          world.y,
          drawOrder(x, y, height, DrawLayer.Signal),
        );
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

/**
 * The CPU of one chunk's emissive-twin walk (M13, D-172): the diagonal
 * iteration confined to the glowing content - the window twin per building,
 * the lamp rule per town road tile - exactly the placements
 * `MapView.bakeChunk` adds to its emissive bake tree. The GPU pass that
 * renders the twin texture is outside what a proxy can see (D-136), and it
 * is at most one extra RenderTexture pass per chunk bake.
 */
function emissiveWalkProxy(
  map: TileMap,
  chunkX: number,
  chunkY: number,
  out: DrawList,
  frames: Map<string, number>,
): number {
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
      if (map.structure[index] !== 0) continue;
      const roadBits = map.roadBits[index]!;
      if (roadBits !== 0 && map.townId[index]! >= 0) {
        const lamp = lampOffsetForRoadTile(x, y, roadBits);
        if (lamp !== null) {
          const height = map.baseHeight(x, y);
          const world = tileToWorld(x, y, height);
          place(
            'lamp',
            world.x + lamp[0],
            world.y + lamp[1],
            drawOrder(x, y, height, DrawLayer.Signal),
          );
        }
      }
      const buildingKind = map.buildingKind[index]!;
      if (buildingKind !== 0) {
        const height = map.baseHeight(x, y);
        const world = tileToWorld(x, y, height);
        place(
          `eb${buildingKind}:${map.buildingLevel[index]!}`,
          world.x,
          world.y,
          drawOrder(x, y, height, DrawLayer.Building),
        );
      }
    }
  }
  return used;
}

function percentile(samples: Float64Array, share: number): number {
  const sorted = Array.from(samples).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * share)]!;
}

let map: TileMap;
/** The render-side BlockIndex and a busy claim table (M13 B5): the SAME
 * inputs the F3 overlay and the aspect pass share in MapView. */
let blocks: BlockIndex;
let reservedData: Int32Array;
let reservedCount = 0;
let claimed: Set<number>;

beforeAll(() => {
  map = buildBusyMap();
  blocks = new BlockIndex(map.tileCount);
  blocks.refresh(map);
  // Every track tile of the window claimed - a fuller table than any real
  // scene, so the collect pass and the red branch are priced, not skipped.
  const tiles: number[] = [];
  for (let y = WINDOW_MIN; y <= WINDOW_MAX; y++) {
    if (y % 6 !== 0) continue;
    for (let x = WINDOW_MIN; x <= WINDOW_MAX; x++) tiles.push(map.tileIndex(x, y));
  }
  reservedCount = tiles.length;
  reservedData = new Int32Array(reservedCount * SNAPSHOT_RESERVED_STRIDE);
  for (let i = 0; i < reservedCount; i++) {
    reservedData[i * SNAPSHOT_RESERVED_STRIDE + SnapshotReserved.Tile] = tiles[i]!;
    reservedData[i * SNAPSHOT_RESERVED_STRIDE + SnapshotReserved.VehicleId] = i % 40;
  }
  claimed = new Set<number>();
  collectClaimedBlocks(blocks, reservedData, reservedCount, claimed);
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
    const placed = rebuildProxy(map, blocks, claimed, out, frames);

    const samples = new Float64Array(REBUILD_SAMPLES);
    for (let i = 0; i < REBUILD_SAMPLES; i++) {
      const started = performance.now();
      rebuildProxy(map, blocks, claimed, out, frames);
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

  it('prepares a full vehicle block with the rail-heavy consist scene inside the tripwire', () => {
    // A full block plus 750 ten-wagon consists (SPEC2 M13, E-05).
    const expectedUnits =
      SNAPSHOT_MAX_VEHICLES + Math.ceil(SNAPSHOT_MAX_VEHICLES / CONSIST_EVERY) * CONSIST_WAGONS;
    const out: DrawList = {
      key: new Float64Array(expectedUnits),
      frame: new Int32Array(expectedUnits),
      x: new Float64Array(expectedUnits),
      y: new Float64Array(expectedUnits),
    };
    const data = syntheticVehicleBlock(map);
    // Alpha one half: the E-05 lerp branch runs on EVERY vehicle, which is
    // the worst frame - alpha 1 (a settled frame) skips the branch wholesale.
    const { prev, prevRowById } = syntheticPrevBlock(data);
    // The M13 spec lookup: forty mapped catalogue ids with 1-3 variants,
    // the shape of the real bySpec map, plus the per-vehicle facing cache.
    const specVariants = new Map<number, number>();
    for (let spec = 0; spec < 40; spec++) specVariants.set(1000 + spec, 1 + (spec % 3));
    const facings = new Uint8Array(SNAPSHOT_MAX_VEHICLES).fill(FACING_NONE);
    const consists = syntheticConsists();
    const consistScratch: ConsistPlacement[] = Array.from(
      { length: MAX_CONSIST_FOLLOWERS },
      () => ({
        fx: 0,
        fy: 0,
        h: 0,
        dirX: 0,
        dirY: 0,
      }),
    );
    const drawn = drawPrepProxy(
      map,
      data,
      prev,
      prevRowById,
      0.5,
      out,
      specVariants,
      facings,
      consists,
      consistScratch,
    );

    const samples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      drawPrepProxy(
        map,
        data,
        prev,
        prevRowById,
        0.5,
        out,
        specVariants,
        facings,
        consists,
        consistScratch,
      );
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `vehicle draw prep: ${drawn} units per frame ` +
        `(${SNAPSHOT_MAX_VEHICLES} vehicles, ${consists.size} ten-wagon consists), ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${DRAW_PREP_P50_TRIPWIRE_MS} ms, backstop ${DRAW_PREP_P99_BACKSTOP_MS} ms)`,
    );

    expect(drawn).toBe(expectedUnits);
    expect(p50).toBeLessThan(DRAW_PREP_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(DRAW_PREP_P99_BACKSTOP_MS);
  });

  it('refreshes the signal aspects on a claim edge inside the tripwire (M13 B5)', () => {
    // The signals the rebuild would have recorded over the busy window.
    const signalTiles: number[] = [];
    for (let y = WINDOW_MIN; y <= WINDOW_MAX; y++) {
      for (let x = WINDOW_MIN; x <= WINDOW_MAX; x++) {
        const tile = map.tileIndex(x, y);
        if (map.signal[tile] !== 0) signalTiles.push(tile);
      }
    }
    const set = new Set<number>();
    const pass = (): number => {
      collectClaimedBlocks(blocks, reservedData, reservedCount, set);
      let red = 0;
      for (let i = 0; i < signalTiles.length; i++) {
        red += signalAspect(map, blocks, set, signalTiles[i]!);
      }
      return red;
    };
    const redSignals = pass();

    const samples = new Float64Array(REBUILD_SAMPLES);
    for (let i = 0; i < REBUILD_SAMPLES; i++) {
      const started = performance.now();
      pass();
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `signal aspect refresh: ${signalTiles.length} signals against ` +
        `${reservedCount} claimed tiles (${redSignals} red), ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${ASPECT_REFRESH_P50_TRIPWIRE_MS} ms, ` +
        `backstop ${ASPECT_REFRESH_P99_BACKSTOP_MS} ms)`,
    );

    // The scene must exercise the red branch, or the pass prices skips.
    expect(signalTiles.length).toBeGreaterThan(50);
    expect(redSignals).toBeGreaterThan(0);
    expect(p50).toBeLessThan(ASPECT_REFRESH_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(ASPECT_REFRESH_P99_BACKSTOP_MS);
  });

  it('walks one chunk emissive twin inside the tripwire (M13, D-172)', () => {
    const out: DrawList = {
      key: new Float64Array(2_048),
      frame: new Int32Array(2_048),
      x: new Float64Array(2_048),
      y: new Float64Array(2_048),
    };
    const frames = new Map<string, number>();
    const placed = emissiveWalkProxy(map, 1, 1, out, frames);

    const samples = new Float64Array(REBUILD_SAMPLES);
    for (let i = 0; i < REBUILD_SAMPLES; i++) {
      const started = performance.now();
      emissiveWalkProxy(map, 1, 1, out, frames);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    // The rejected live-sprite alternative would pay this walk for EVERY
    // visible chunk on every pan-rebuild plus the per-frame draw of all the
    // placed sprites; a 0.5x viewport shows ~18 full chunks, so the derived
    // comparison is printed alongside (the D-164 measurement pattern).
    console.log(
      `emissive twin walk: ${placed} glows over one chunk, ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(live-above alternative: ~${(p50 * 18).toFixed(3)} ms per pan-rebuild for 18 chunks ` +
        `plus ~${placed * 18} additive sprites per frame; ` +
        `median tripwire ${EMISSIVE_WALK_P50_TRIPWIRE_MS} ms, backstop ${EMISSIVE_WALK_P99_BACKSTOP_MS} ms)`,
    );

    // The busy chunk carries both glow kinds - lamps on the town streets,
    // window twins on the buildings - so the walk prices real work.
    expect(placed).toBeGreaterThan(100);
    expect(p50).toBeLessThan(EMISSIVE_WALK_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(EMISSIVE_WALK_P99_BACKSTOP_MS);
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
