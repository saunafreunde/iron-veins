import { beforeAll, describe, expect, it } from 'vitest';
import {
  SNAPSHOT_FLOW_STRIDE,
  SNAPSHOT_MAX_FLOW_LEGS,
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_RESERVED_STRIDE,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotFlow,
  SnapshotReserved,
  SnapshotVehicle,
} from '../../src/shared/snapshot';
import { MapClimate } from '../../src/sim/constants';
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
import {
  buildStaticIndex,
  buildingTargetFor,
  BUILDING_VARIANT_SALT,
  FOREST_TREES_PER_TILE,
  forestTreeOffset,
  isWoodedTile,
  staticVariantFor,
  tileVariantSeed,
  treeTargetFor,
  TREE_VARIANT_SALT,
  type StaticZoomIndex,
} from '../../src/render/staticArt';
import type { BakedCell } from '../../src/render/bakedAtlas';
import { coastEdgeMask, FOAM_EDGE_COUNT, foamVariant, isDeepWater } from '../../src/render/water';
import { lampOffsetForRoadTile } from '../../src/render/emissive';
import { CATENARY_RAIL_TYPE, catenaryMastOffset } from '../../src/render/catenary';
import { collectClaimedBlocks, signalAspect } from '../../src/render/signalAspects';
import {
  BREAKDOWN_PUFF,
  BREAKDOWN_SMOKE_PERIOD,
  BREAKDOWN_TINT,
  emitterPhase,
  emitterUnit,
  EXHAUST_PUFF,
  EXHAUST_TINT,
  exhaustPeriodForThrottle,
  INDUSTRY_PUFF,
  PARTICLE_CAP,
  ParticlePool,
  smokePeriodForLevel,
  spawnPuff,
  vehicleThrottle,
} from '../../src/render/particles';
import {
  precipitationFor,
  RAIN_TINT,
  SNOW_TINT,
  WEATHER_PARTICLE_CEILING,
  WEATHER_SPAWN_ATTEMPTS,
  WEATHER_SPAWN_LIFT_PX,
  weatherPuffFor,
  weatherSpawnCount,
  weatherTintFor,
} from '../../src/render/weatherArt';
import { weatherRegionOf } from '../../src/sim/weather/field';
import { SEA_LEVEL, WeatherCell } from '../../src/sim/constants';
import { STATE_BROKEN_DOWN } from '../../src/render/badges';
import { INDUSTRY_SMOKE_ANCHORS } from '../../src/render/industryArt';
import {
  FLOW_HEAD_PX,
  FLOW_TOP_N,
  flowArcControl,
  flowArrowWidth,
  flowHash,
  flowHead,
  flowStrokeColor,
  selectTopFlows,
} from '../../src/render/flowAtlas';

/**
 * The render CPU tripwire of SPEC2 6.3: Sprite-Pool-Rebuild-ms, Draw-Prep-ms,
 * since M12 Chunk-Bake-ms and since M13 Partikel-ms, held in CI before and
 * while the art milestones spend against them.
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
 *
 * Re-derived for M13's static-art bundle, the D-171 procedure: the scene grew
 * the baked town cell and three baked TREES on every untouched tile - 9,832
 * placements before, 14,746 now, half of them woodland - and the clean median
 * on this machine went 2.2-2.9 -> 3.6-3.9 ms over three runs each. Leaving
 * the 10 ms gate would have left 2.6x, which is exactly the zero-headroom
 * trap D-167 exists to kill, so the gate is re-derived at 4x the new clean
 * median (the same generosity it had over its own scene), not eaten.
 *
 * Worth knowing before the next scene grows: the first measurement was 9.7 ms,
 * and the cost was not the trees but the STRINGS - one composed target key per
 * tile. The targets are module-load tables now (staticArt.ts), and 27 % more
 * sprites cost 5 % more time than the pre-tree scene.
 */
const REBUILD_P50_TRIPWIRE_MS = 15;

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
 *
 * Re-derived once more for M13's static-art bundle, for the same reason and
 * by the same procedure as the rebuild gate above: baked town cells and
 * baked trees now go INTO the chunk texture (they are static map art, unlike
 * the industries and station modules that stay live sprites over it), so a
 * chunk carries 4,273 placements against 3,046 and the clean median went
 * 0.93-0.96 -> 1.11-1.39 ms. 5 ms is 4x the new clean median.
 */
const CHUNK_BAKE_P50_TRIPWIRE_MS = 5;

/** p99 backstop for the chunk bake: worst saturated observations 11-13 ms. [ms] */
const CHUNK_BAKE_P99_BACKSTOP_MS = 30;

/**
 * Median tripwire: one frame of the M13 particle CPU at the cap, in the
 * reference scene run at OVERLOAD - 300 booming industries plus a full
 * 1,500-vehicle block all emitting, the pool pinned at PARTICLE_CAP so the
 * step loop, the spawn refusals and the ParticleContainer mirror are all
 * priced at their worst. The gate is the SPEC2 M13 budget itself
 * ("<= 2 ms Frame-CPU, im Tripwire") - and it is simultaneously a very
 * generous D-167 multiple of the clean median, so the acceptance sentence
 * and the tripwire philosophy agree for once instead of colliding as they
 * did in D-167's chunk-bake story. [ms]
 */
const PARTICLE_P50_TRIPWIRE_MS = 2;

/** p99 backstop for the particle frame, the usual order of magnitude. [ms] */
const PARTICLE_P99_BACKSTOP_MS = 20;

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
 * Median tripwire: one full flow-atlas refresh at the MEGAGRAPH - the
 * snapshot cap of 4,096 legs, the case the top-N cut exists for (SPEC2 M14:
 * "damit ein Megagraph den Frame nicht schmilzt - Budget im Tripwire").
 * Priced per REDRAW, which is the atlas's worst honest cadence: the hash
 * over the full block (also paid per publish edge without a redraw), the
 * volume sort of all 4,096 rows, and arc/width/colour/head geometry for the
 * FLOW_TOP_N drawn arrows. Measured clean well under 0.5 ms; the gate is
 * the usual very generous multiple (D-167). [ms]
 */
const FLOW_PREP_P50_TRIPWIRE_MS = 3;

/** p99 backstop for the flow prep, the usual order of magnitude. [ms] */
const FLOW_PREP_P99_BACKSTOP_MS = 30;

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
      } else {
        // Every untouched tile is woodland, so M13's baked-tree branch fires
        // at its worst case: `isWoodedTile`, a tile hash and a jittered
        // offset per tree, {@link FOREST_TREES_PER_TILE} trees per tile. A
        // temperate map really does grow forest on the ground nobody built
        // on, and a tripwire has to catch the regression before a real scene
        // shows it (the D-171 rule for the consist scene, applied to trees).
        map.terrain[index] = Terrain.Forest;
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
 * A stand-in for the baked static index (M13): the real target grammar of the
 * three families, one cell per declared variant, at zoom 1 - the index the
 * chunked zooms and the 1x detail path both resolve to. Built once, like the
 * real one, because `MapView` resolves it per rebuild and never per tile.
 */
function buildStaticArtIndex(): StaticZoomIndex {
  const cells: BakedCell[] = [];
  let column = 0;
  const push = (target: string): void => {
    cells.push({
      target,
      facing: 0,
      x: column * 48,
      y: 0,
      width: 32,
      height: 60,
      anchorX: 16,
      anchorY: 52,
      maskX: column * 48 + 32,
      maskY: 0,
      ...(column % 3 === 0 ? { points: { chimney: [16, 4] as const } } : {}),
    });
    column++;
  };
  for (const zone of ['residential', 'commercial', 'industrial']) {
    for (const stage of [0, 1]) {
      push(`building:${zone}:${stage}`);
      for (let variant = 1; variant <= 3; variant++) push(`building:${zone}:${stage}:${variant}`);
    }
  }
  for (const climate of ['temperate', 'arctic', 'tropical', 'desert']) {
    for (let variant = 0; variant < 4; variant++) push(`tree:${climate}:${variant}`);
  }
  const built = buildStaticIndex({
    version: 2,
    zooms: [1],
    pages: [{ file: 'p0.png', zoom: 1, width: 4096, height: 4096, cells }],
  });
  return built[0]!;
}

const STATIC_ART = buildStaticArtIndex();

/**
 * The baked-static branch of `MapView.rebuild` and `MapView.bakeChunk`,
 * shared by both proxies exactly as `placeBaked` is shared by the real paths:
 * the town cell's target key, the per-tile variant hash and the index lookup
 * for a built tile; `isWoodedTile`, the climate family, one hash and one
 * jittered offset per tree for a wooded one. Placement is the anchor
 * arithmetic of a baked cell, which is what a proxy can see of it.
 */
function staticArtProxy(
  map: TileMap,
  index: number,
  x: number,
  y: number,
  world: { x: number; y: number },
  height: number,
  terrain: number,
  buildingKind: number,
  place: (key: string, worldX: number, worldY: number, zIndex: number) => void,
): void {
  if (buildingKind !== 0) {
    const level = map.buildingLevel[index]!;
    const variant = staticVariantFor(
      STATIC_ART,
      buildingTargetFor(buildingKind, level),
      tileVariantSeed(x, y, BUILDING_VARIANT_SALT),
    );
    if (variant !== null) {
      place(
        variant.cell.target,
        world.x - variant.cell.anchorX + TILE_W / 2,
        world.y + TILE_H / 2 - variant.cell.anchorY + HEIGHT_PX,
        drawOrder(x, y, height, DrawLayer.Building),
      );
    }
    return;
  }
  if (!isWoodedTile(map, index, terrain)) return;
  const order = drawOrder(x, y, height, DrawLayer.Building);
  const family = treeTargetFor(MapClimate.Temperate);
  for (let slot = 0; slot < FOREST_TREES_PER_TILE; slot++) {
    const variant = staticVariantFor(
      STATIC_ART,
      family,
      tileVariantSeed(x, y, TREE_VARIANT_SALT + slot),
    );
    if (variant === null) continue;
    forestTreeOffset(x, y, slot, TREE_OFFSET_SCRATCH);
    const u = TREE_OFFSET_SCRATCH[0]!;
    const v = TREE_OFFSET_SCRATCH[1]!;
    place(
      variant.cell.target,
      world.x + ((u - v) * TILE_W) / 2 - variant.cell.anchorX + TILE_W / 2,
      world.y + TILE_H / 2 + ((u + v) * TILE_H) / 2 - variant.cell.anchorY + HEIGHT_PX,
      order,
    );
  }
}

/** The one scratch tuple the tree placement writes into, as MapView keeps. */
const TREE_OFFSET_SCRATCH = [0, 0];

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

      // The baked town cell and the baked trees of M13, decided exactly as
      // MapView decides them; the procedural building cell is what the same
      // branch draws when a build has no bake at all (E-14), and is the
      // cheaper of the two, so pricing the baked path is the honest gate.
      staticArtProxy(map, index, x, y, world, height, terrain, map.buildingKind[index]!, place);
    }
  }
  return used + (deepFold === -1 ? 1 : 0);
}

/**
 * A full snapshot vehicle block, every row valid and inside the window, laid
 * out exactly as the worker writes it - the draw-prep proxy reads it with the
 * renderer's own stride constants.
 */
function syntheticVehicleBlock(map: TileMap, rows = REFERENCE_VEHICLES): Int32Array {
  const data = new Int32Array(rows * SNAPSHOT_VEHICLE_STRIDE);
  const span = WINDOW_MAX - WINDOW_MIN; // exclusive of the last column: next = tile + 1 stays inside
  for (let i = 0; i < rows; i++) {
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
function syntheticPrevBlock(
  data: Int32Array,
  rows = REFERENCE_VEHICLES,
): { prev: Int32Array; prevRowById: Int32Array } {
  const prev = new Int32Array(data);
  const prevRowById = new Int32Array(rows);
  for (let i = 0; i < rows; i++) {
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
/**
 * Vehicles the render tripwires are measured with.
 *
 * It is the reference fleet of SPEC.md section 21 - the same 1,500 the tick
 * budget is priced against - and it used to be spelled `SNAPSHOT_MAX_VEHICLES`
 * because the two numbers happened to be equal. SPEC2 M15 raised the snapshot
 * cap to the store's capacity (E-18, D-187), and a tripwire whose scene size
 * moves with a cap is a tripwire whose readings stop being comparable across
 * milestones. The cap gets its own measurement below; the gates keep the
 * reference fleet.
 */
const REFERENCE_VEHICLES = 1_500;

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
  for (let i = 0; i < REFERENCE_VEHICLES; i += CONSIST_EVERY) {
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
  rows = REFERENCE_VEHICLES,
): number {
  const size = map.size;
  let drawn = 0;
  for (let i = 0; i < rows; i++) {
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

      // The baked town cell and the baked trees, the same decision the
      // detail path takes - a chunk that disagreed with it would make the
      // overview a different world from the close-up (M13).
      staticArtProxy(map, index, x, y, world, height, terrain, map.buildingKind[index]!, place);
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

/** One synthetic industry emitter of the particle scene. */
interface ProxyIndustry {
  readonly id: number;
  readonly type: number;
  readonly x: number;
  readonly y: number;
  readonly level: number;
}

/**
 * The reference particle scene at overload: 300 industries (the perf
 * fixture's own count), every one a smoking type at a booming level, so
 * every anchor emits at its densest cadence.
 */
function syntheticIndustries(): ProxyIndustry[] {
  const smokingTypes = Object.keys(INDUSTRY_SMOKE_ANCHORS).map(Number);
  const industries: ProxyIndustry[] = [];
  const span = WINDOW_MAX - WINDOW_MIN;
  for (let i = 0; i < 300; i++) {
    industries.push({
      id: i,
      type: smokingTypes[i % smokingTypes.length]!,
      x: WINDOW_MIN + ((i * 11) % span),
      y: WINDOW_MIN + ((i * 17) % span),
      level: 200,
    });
  }
  return industries;
}

/** The flat-array stand-in for the ParticleContainer's per-particle writes. */
interface ParticleOut {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly scale: Float64Array;
  /** The M18 stretch column: `scale * pool.stretch`, one multiply a row. */
  readonly scaleY: Float64Array;
  readonly alpha: Float64Array;
  readonly tint: Int32Array;
}

/**
 * The CPU of one MapView particle frame (M13): the industry emitter pass
 * (anchor lookup, level cadence, phase modulo, spawn attempt - refused at
 * the cap, which is exactly the overload guarantee under test), the
 * per-vehicle exhaust/breakdown decision over a full snapshot block, one
 * `ParticlePool.step()` over a pool at the cap, and the mirror loop that
 * writes position, scale, alpha and tint per live particle - everything
 * except the GPU buffer upload, stated per D-136.
 */
function particleProxy(
  pool: ParticlePool,
  industries: readonly ProxyIndustry[],
  vehicleData: Int32Array,
  blink: number,
  out: ParticleOut,
  weather: Int32Array | null = null,
): number {
  let attempts = 0;
  for (const industry of industries) {
    const anchors = INDUSTRY_SMOKE_ANCHORS[industry.type];
    if (anchors === undefined) continue;
    const period = smokePeriodForLevel(industry.level);
    if (period === 0) continue;
    const wx = ((industry.x - industry.y) * TILE_W) / 2;
    const wy = ((industry.x + industry.y) * TILE_H) / 2 - GROUND * HEIGHT_PX;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!;
      const seed = industry.id * 8 + i;
      if ((blink + emitterPhase(seed)) % period !== 0) continue;
      spawnPuff(
        pool,
        INDUSTRY_PUFF,
        wx + ((anchor.u - anchor.v) * TILE_W) / 2,
        wy + TILE_H / 2 + ((anchor.u + anchor.v) * TILE_H) / 2 - anchor.height,
        seed ^ Math.imul(blink, 0x85ebca6b),
        anchor.tint,
      );
      attempts++;
    }
  }

  const size = MAP_SIZE;
  for (let i = 0; i < REFERENCE_VEHICLES; i++) {
    const base = i * SNAPSHOT_VEHICLE_STRIDE;
    const tile = vehicleData[base + SnapshotVehicle.Tile]!;
    const next = vehicleData[base + SnapshotVehicle.NextTile]!;
    const state = vehicleData[base + SnapshotVehicle.State]!;
    const vehicleId = vehicleData[base + SnapshotVehicle.VehicleId]!;
    const worldX = ((tile % size) - ((tile / size) | 0)) * (TILE_W / 2);
    const worldY = ((tile % size) + ((tile / size) | 0)) * (TILE_H / 2);
    const salt = vehicleId ^ Math.imul(blink, 0x85ebca6b);
    if (state === STATE_BROKEN_DOWN) {
      if ((blink + emitterPhase(vehicleId)) % BREAKDOWN_SMOKE_PERIOD === 0) {
        spawnPuff(pool, BREAKDOWN_PUFF, worldX, worldY - 14, salt, BREAKDOWN_TINT);
        attempts++;
      }
    } else {
      const progressMilli = vehicleData[base + SnapshotVehicle.ProgressMilli]!;
      const period = exhaustPeriodForThrottle(vehicleThrottle(tile !== next, progressMilli));
      if (period > 0 && (blink + emitterPhase(vehicleId)) % period === 0) {
        spawnPuff(pool, EXHAUST_PUFF, worldX, worldY - 6, salt, EXHAUST_TINT);
        attempts++;
      }
    }
  }

  // The M18 weather pass, last in the frame exactly as MapView spawns it
  // (D-202): a fixed number of hashed tiles inside the visible range, each
  // one asking its region for the sky and its height for rain against snow.
  if (weather !== null) {
    const snowLine = SEA_LEVEL + 4;
    for (let attempt = 0; attempt < WEATHER_SPAWN_ATTEMPTS; attempt++) {
      const seed = Math.imul(blink, 0x9e3779b1) ^ (attempt * 0x85ebca6b);
      const x = Math.floor(emitterUnit(seed) * MAP_SIZE);
      const y = Math.floor(emitterUnit(seed ^ 0x27d4eb2f) * MAP_SIZE);
      const cell = weather[weatherRegionOf(x, y, MAP_SIZE)]!;
      const height = x % 2 === 0 ? GROUND : snowLine + 1;
      const kind = precipitationFor(cell, height, snowLine);
      const count = weatherSpawnCount(kind, cell, attempt);
      if (count === 0) continue;
      const spec = weatherPuffFor(kind, cell);
      const tint = weatherTintFor(kind);
      const wx = (x - y) * (TILE_W / 2);
      const wy = (x + y) * (TILE_H / 2) - height * HEIGHT_PX;
      for (let drop = 0; drop < count; drop++) {
        spawnPuff(pool, spec, wx, wy - WEATHER_SPAWN_LIFT_PX, seed ^ (drop * 0x2545f491), tint);
        attempts++;
      }
    }
  }

  pool.step();

  const count = pool.count;
  for (let i = 0; i < count; i++) {
    out.x[i] = pool.x[i]!;
    out.y[i] = pool.y[i]!;
    const scale = pool.size[i]! / 32;
    out.scale[i] = scale;
    out.scaleY[i] = scale * pool.stretch[i]!;
    out.alpha[i] = pool.alphaOf(i);
    out.tint[i] = pool.tint[i]!;
  }
  return count + attempts;
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
      REFERENCE_VEHICLES + Math.ceil(REFERENCE_VEHICLES / CONSIST_EVERY) * CONSIST_WAGONS;
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
    const facings = new Uint8Array(REFERENCE_VEHICLES).fill(FACING_NONE);
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
        `(${REFERENCE_VEHICLES} vehicles, ${consists.size} ten-wagon consists), ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${DRAW_PREP_P50_TRIPWIRE_MS} ms, backstop ${DRAW_PREP_P99_BACKSTOP_MS} ms)`,
    );

    expect(drawn).toBe(expectedUnits);
    expect(p50).toBeLessThan(DRAW_PREP_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(DRAW_PREP_P99_BACKSTOP_MS);
  });

  it('prices the E-18 cap raise: the reference fleet against a full block', () => {
    // What raising SNAPSHOT_MAX_VEHICLES from the reference fleet to the
    // store's capacity actually costs the renderer, measured rather than
    // extrapolated (E-18, D-187). Single-sprite vehicles on both runs and no
    // consists: this is the price of DRAWING vehicles that used to be missing
    // from the block entirely, not of the rail-heavy tripwire scene above.
    //
    // It is a measurement and not a gate. The gated scene next door places
    // 9,000 units per frame, which is more work than a full block of 4,000
    // plain vehicles - so the tripwire already covers this case from above,
    // and a second threshold would only be a second thing to tune.
    const noConsists = new Map<number, ProxyConsist>();
    const consistScratch: ConsistPlacement[] = Array.from(
      { length: MAX_CONSIST_FOLLOWERS },
      () => ({ fx: 0, fy: 0, h: 0, dirX: 0, dirY: 0 }),
    );
    const specVariants = new Map<number, number>();
    for (let spec = 0; spec < 40; spec++) specVariants.set(1000 + spec, 1 + (spec % 3));

    const measure = (rows: number): { p50: number; p99: number; drawn: number } => {
      const out: DrawList = {
        key: new Float64Array(rows),
        frame: new Int32Array(rows),
        x: new Float64Array(rows),
        y: new Float64Array(rows),
      };
      const data = syntheticVehicleBlock(map, rows);
      const { prev, prevRowById } = syntheticPrevBlock(data, rows);
      const facings = new Uint8Array(rows).fill(FACING_NONE);
      const drawn = drawPrepProxy(
        map,
        data,
        prev,
        prevRowById,
        0.5,
        out,
        specVariants,
        facings,
        noConsists,
        consistScratch,
        rows,
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
          noConsists,
          consistScratch,
          rows,
        );
        samples[i] = performance.now() - started;
      }
      return { p50: percentile(samples, 0.5), p99: percentile(samples, 0.99), drawn };
    };

    const reference = measure(REFERENCE_VEHICLES);
    const full = measure(SNAPSHOT_MAX_VEHICLES);
    console.log(
      `E-18 cap: ${REFERENCE_VEHICLES} plain vehicles p50 ${reference.p50.toFixed(4)} ms / ` +
        `p99 ${reference.p99.toFixed(4)} ms, ${SNAPSHOT_MAX_VEHICLES} plain vehicles ` +
        `p50 ${full.p50.toFixed(4)} ms / p99 ${full.p99.toFixed(4)} ms ` +
        `(backstop ${DRAW_PREP_P99_BACKSTOP_MS} ms)`,
    );

    // Every row of both blocks is inside the window by construction, so a
    // dropped row would mean the walk stopped early rather than that a
    // vehicle was off screen.
    expect(reference.drawn).toBe(REFERENCE_VEHICLES);
    expect(full.drawn).toBe(SNAPSHOT_MAX_VEHICLES);
    expect(full.p99).toBeLessThan(DRAW_PREP_P99_BACKSTOP_MS);
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

  it('runs one particle frame at the cap inside the 2 ms budget (M13)', () => {
    const pool = new ParticlePool();
    // Pin the pool AT the cap with staggered lifetimes: the emitters spawn
    // more per frame than expire, so every sample pays the full step loop,
    // the full mirror loop, real spawn writes for the freed rows AND the
    // refusal path for the rest - the emitter-overload steady state the
    // cap exists for.
    for (let i = 0; i < PARTICLE_CAP; i++) {
      pool.spawn(i, 0, 0.1, -0.5, 30 + (i % 90), 6, 0.05, 0xffffff);
    }
    expect(pool.count).toBe(PARTICLE_CAP);

    const industries = syntheticIndustries();
    const data = new Int32Array(syntheticVehicleBlock(map));
    // Every tenth vehicle broken down, so the dense-smoke branch is priced.
    for (let i = 0; i < REFERENCE_VEHICLES; i += 10) {
      data[i * SNAPSHOT_VEHICLE_STRIDE + SnapshotVehicle.State] = STATE_BROKEN_DOWN;
    }
    const out: ParticleOut = {
      x: new Float64Array(PARTICLE_CAP),
      y: new Float64Array(PARTICLE_CAP),
      scale: new Float64Array(PARTICLE_CAP),
      scaleY: new Float64Array(PARTICLE_CAP),
      alpha: new Float64Array(PARTICLE_CAP),
      tint: new Int32Array(PARTICLE_CAP),
    };
    const touched = particleProxy(pool, industries, data, 0, out);

    const samples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      particleProxy(pool, industries, data, i + 1, out);
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `particle frame: pool at cap ${PARTICLE_CAP}, ${industries.length} industries + ` +
        `${REFERENCE_VEHICLES} vehicles emitting (${touched} rows touched in the warm frame), ` +
        `p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${PARTICLE_P50_TRIPWIRE_MS} ms, backstop ${PARTICLE_P99_BACKSTOP_MS} ms)`,
    );

    // The cap held through every overloaded frame - the pool never grew
    // past it, and the churn kept it within one frame's deaths of full.
    expect(pool.count).toBeLessThanOrEqual(PARTICLE_CAP);
    expect(pool.count).toBeGreaterThan(PARTICLE_CAP - 200);
    expect(touched).toBeGreaterThan(PARTICLE_CAP);
    expect(p50).toBeLessThan(PARTICLE_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(PARTICLE_P99_BACKSTOP_MS);
  });

  it('runs one particle frame with the weather active inside the same budget (M18)', () => {
    // Two measurements, because they answer two different questions about the
    // shared cap (D-174/D-202) and only one of them is the ordinary frame.
    const industries = syntheticIndustries();
    const data = new Int32Array(syntheticVehicleBlock(map));
    for (let i = 0; i < REFERENCE_VEHICLES; i += 10) {
      data[i * SNAPSHOT_VEHICLE_STRIDE + SnapshotVehicle.State] = STATE_BROKEN_DOWN;
    }
    const sky = new Int32Array(256).fill(WeatherCell.Storm);
    const makeOut = (): ParticleOut => ({
      x: new Float64Array(PARTICLE_CAP),
      y: new Float64Array(PARTICLE_CAP),
      scale: new Float64Array(PARTICLE_CAP),
      scaleY: new Float64Array(PARTICLE_CAP),
      alpha: new Float64Array(PARTICLE_CAP),
      tint: new Int32Array(PARTICLE_CAP),
    });

    // (1) The weather's OWN cost, in a world where it can actually land: no
    // industry smoking, no vehicle working, a sky of storm over every region.
    // The pool fills to the weather's steady state and stays there, so the
    // spawn writes, the extra step rows and the extra mirror rows are all in
    // the sample. (The M13 reference scene below is an OVERLOAD by design and
    // leaves the weather nothing - which is the other half of the answer.)
    const idle = new Int32Array(REFERENCE_VEHICLES * SNAPSHOT_VEHICLE_STRIDE);
    const live = new ParticlePool();
    const liveOut = makeOut();
    for (let frame = 0; frame < 400; frame++) {
      particleProxy(live, [], idle, frame, liveOut, sky);
    }
    const steady = live.count;
    let rainRows = 0;
    for (let i = 0; i < live.count; i++) {
      if (live.tint[i] === RAIN_TINT || live.tint[i] === SNOW_TINT) rainRows++;
    }
    const liveSamples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      particleProxy(live, [], idle, 400 + i, liveOut, sky);
      liveSamples[i] = performance.now() - started;
    }
    const liveP50 = percentile(liveSamples, 0.5);
    const liveP99 = percentile(liveSamples, 0.99);
    console.log(
      `particle frame, weather only: storm over every region, ${WEATHER_SPAWN_ATTEMPTS} attempts ` +
        `a frame over an idle ${REFERENCE_VEHICLES}-vehicle block, steady state ${steady} live ` +
        `(${rainRows} of them weather, ceiling ${WEATHER_PARTICLE_CEILING}), ` +
        `p50 ${liveP50.toFixed(4)} ms, p99 ${liveP99.toFixed(4)} ms ` +
        `(median tripwire ${PARTICLE_P50_TRIPWIRE_MS} ms, backstop ${PARTICLE_P99_BACKSTOP_MS} ms)`,
    );

    // (2) OVERLOAD: the M13 scene with the pool pinned at the cap. The
    // weather is spawned LAST, so every drop is refused and the plumes keep
    // their rows - the cap decision, measured rather than argued.
    const full = new ParticlePool();
    for (let i = 0; i < PARTICLE_CAP; i++) {
      full.spawn(i, 0, 0.1, -0.5, 30 + (i % 90), 6, 0.05, 0xffffff);
    }
    const fullOut = makeOut();
    const touched = particleProxy(full, industries, data, 0, fullOut, sky);
    const fullSamples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      particleProxy(full, industries, data, i + 1, fullOut, sky);
      fullSamples[i] = performance.now() - started;
    }
    const fullP50 = percentile(fullSamples, 0.5);
    const fullP99 = percentile(fullSamples, 0.99);
    let refusedRain = 0;
    for (let i = 0; i < full.count; i++) {
      if (full.tint[i] === RAIN_TINT || full.tint[i] === SNOW_TINT) refusedRain++;
    }
    console.log(
      `particle frame, M13 overload scene + the same storm: ${touched} rows touched, ` +
        `${refusedRain} weather rows in the pool (the emitters hold the cap), ` +
        `p50 ${fullP50.toFixed(4)} ms, p99 ${fullP99.toFixed(4)} ms`,
    );

    // The weather reaches its stated share of the cap and no more, and the
    // pool never grows past it in either regime.
    expect(steady).toBeLessThanOrEqual(PARTICLE_CAP);
    expect(rainRows).toBeGreaterThan(0);
    expect(rainRows).toBeLessThanOrEqual(WEATHER_PARTICLE_CEILING);
    // The whole pool of the weather-only scene IS weather: nothing else was
    // emitting, so the ceiling is the population and it is under the cap.
    expect(rainRows).toBe(steady);
    // And under overload the weather gets nothing at all - spawned last,
    // refused by the cap, with every plume left standing.
    expect(full.count).toBeLessThanOrEqual(PARTICLE_CAP);
    expect(refusedRain).toBe(0);
    expect(liveP50).toBeLessThan(PARTICLE_P50_TRIPWIRE_MS);
    expect(liveP99).toBeLessThan(PARTICLE_P99_BACKSTOP_MS);
    expect(fullP50).toBeLessThan(PARTICLE_P50_TRIPWIRE_MS);
    expect(fullP99).toBeLessThan(PARTICLE_P99_BACKSTOP_MS);
  });

  it('prepares the flow atlas at the 4096-leg megagraph inside the tripwire (M14)', () => {
    // A full snapshot block, deterministic LCG values: every row an active
    // leg, volumes spread wide so the sort and the top-N cut do real work.
    const block = new Int32Array(SNAPSHOT_MAX_FLOW_LEGS * SNAPSHOT_FLOW_STRIDE);
    let lcg = 0x2f6e2b1;
    const next = (): number => {
      lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0;
      return lcg;
    };
    for (let row = 0; row < SNAPSHOT_MAX_FLOW_LEGS; row++) {
      const base = row * SNAPSHOT_FLOW_STRIDE;
      block[base + SnapshotFlow.FromStation] = row & 1023;
      block[base + SnapshotFlow.ToStation] = (row + 17) & 1023;
      block[base + SnapshotFlow.VolumeUnits] = next() % 2_000;
      block[base + SnapshotFlow.OldestTick] = row;
      block[base + SnapshotFlow.MeanTicks] = 400 + (row % 800);
      block[base + SnapshotFlow.Measured] = 1;
      block[base + SnapshotFlow.OwnerId] = row % 8;
      block[base + SnapshotFlow.LineId] = row % 24;
    }

    const scratch = new Int32Array(FLOW_TOP_N);
    // The full redraw the MapView pays when the hash moved: hash, cut,
    // geometry for every drawn arrow. The checksum keeps the loop honest
    // against dead-code elimination.
    const pass = (): number => {
      let checksum = flowHash(block, SNAPSHOT_MAX_FLOW_LEGS);
      const selection = selectTopFlows(block, SNAPSHOT_MAX_FLOW_LEGS, FLOW_TOP_N, scratch);
      for (let i = 0; i < selection.drawn; i++) {
        const base = scratch[i]! * SNAPSHOT_FLOW_STRIDE;
        const fromStation = block[base + SnapshotFlow.FromStation]!;
        const toStation = block[base + SnapshotFlow.ToStation]!;
        // Synthetic station positions - the join itself is a Map lookup in
        // MapView; the geometry is what costs.
        const ax = (fromStation % 32) * 64;
        const ay = ((fromStation / 32) | 0) * 32;
        const bx = (toStation % 32) * 64;
        const by = ((toStation / 32) | 0) * 32;
        const ctrl = flowArcControl(ax, ay, bx, by);
        const head = flowHead(ctrl.cx, ctrl.cy, bx, by, FLOW_HEAD_PX);
        checksum ^=
          (flowArrowWidth(block[base + SnapshotFlow.VolumeUnits]!) * 16) |
          flowStrokeColor(block[base + SnapshotFlow.OwnerId]!, block[base + SnapshotFlow.LineId]!) |
          (head.leftX | 0);
      }
      return checksum + selection.omitted;
    };
    const warm = pass();

    const samples = new Float64Array(DRAW_PREP_SAMPLES);
    for (let i = 0; i < DRAW_PREP_SAMPLES; i++) {
      const started = performance.now();
      pass();
      samples[i] = performance.now() - started;
    }

    const p50 = percentile(samples, 0.5);
    const p99 = percentile(samples, 0.99);
    console.log(
      `flow atlas prep: ${SNAPSHOT_MAX_FLOW_LEGS} legs cut to ${FLOW_TOP_N} arrows ` +
        `(checksum ${warm}), p50 ${p50.toFixed(4)} ms, p99 ${p99.toFixed(4)} ms ` +
        `(median tripwire ${FLOW_PREP_P50_TRIPWIRE_MS} ms, backstop ${FLOW_PREP_P99_BACKSTOP_MS} ms)`,
    );

    expect(p50).toBeLessThan(FLOW_PREP_P50_TRIPWIRE_MS);
    expect(p99).toBeLessThan(FLOW_PREP_P99_BACKSTOP_MS);
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
