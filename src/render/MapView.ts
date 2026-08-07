import {
  Application,
  BitmapFont,
  BitmapText,
  Container,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';
import type { IndustryMarker, StationMarker, TownMarker, VehicleMarker } from '../shared/protocol';
import {
  SNAPSHOT_RESERVED_STRIDE,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotReserved,
  SnapshotVehicle,
  type VehicleFrame,
} from '../shared/snapshot';
import { MAX_HEIGHT, MAX_VEHICLES } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { SLOPE_COUNT, Terrain } from '../sim/map/terrain';
import { BlockIndex } from '../sim/signals/blocks';
import {
  DrawLayer,
  drawOrder,
  HEIGHT_PX,
  pickTile,
  TILE_H,
  TILE_W,
  tileToWorld,
  vehicleDrawOrder,
} from './projection';
import { INDUSTRY_SPECS } from '../sim/industry/types';
import { COMPANY_COLORS } from '../shared/palette';

/** The company palette as Pixi tints, parsed once. */
const COMPANY_TINTS: readonly number[] = COMPANY_COLORS.map((hex) =>
  Number.parseInt(hex.slice(1), 16),
);

/** How close a click has to land to count as hitting a vehicle. [world px] */
const VEHICLE_PICK_PX = 14;

/**
 * The soft ellipse under every vehicle sprite (SPEC2 M13: "weiche Ellipse
 * unter Fahrzeugen"): a shared radial-gradient texture, tinted black and
 * drawn at the vehicle's ground point, under the body by insertion order.
 * The baked cells additionally carry their own contact shadow (bake-lib
 * SHADOW_ALPHA_MAX); both are deliberately subtle so they compose instead
 * of doubling into a stain.
 */
/** Opacity of the ellipse. [0-1; render-side judgment, M13] */
const VEHICLE_SHADOW_ALPHA = 0.18;
/** Ellipse width as a share of the baked cell's world width. */
const VEHICLE_SHADOW_WIDTH_SHARE = 0.85;
/** Ellipse width under the white-box fallback frames. [world px] */
const FALLBACK_SHADOW_ROAD_PX = 22;
const FALLBACK_SHADOW_TRAIN_PX = 34;
/** Ellipse height over width - the 16.1 tile foreshortening (32/64). */
const VEHICLE_SHADOW_RATIO = TILE_H / TILE_W;
/** Pixel size of the shared gradient texture; scaled per vehicle. [px] */
const SHADOW_TEX_W = 64;
const SHADOW_TEX_H = 32;

/**
 * The gradient ellipse the vehicle shadows share: white core fading to a
 * transparent rim, so a black tint at low alpha reads as soft ground
 * contact. Drawn once at attach - procedural, no binary asset (E-14).
 */
function makeShadowTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SHADOW_TEX_W;
  canvas.height = SHADOW_TEX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(SHADOW_TEX_W / 2, SHADOW_TEX_H / 2);
  ctx.scale(1, SHADOW_TEX_H / SHADOW_TEX_W);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, SHADOW_TEX_W / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-SHADOW_TEX_W / 2, -SHADOW_TEX_W / 2, SHADOW_TEX_W, SHADOW_TEX_W);
  return Texture.from(canvas);
}

/** One vehicle as the audio engine wants it; reused between frames. */
export interface VehicleAudioInput {
  id: number;
  power: number;
  panX: number;
  throttle: number;
  distance: number;
}
import {
  ATLAS_BUILD_BUDGET_MS,
  ATLAS_SCALE,
  atlasPageForZoom,
  buildDetailAtlas,
  buildTerrainAtlas,
  DETAIL_ATLAS_SCALE,
  foamAtlasFrame,
  waterAtlasFrame,
  type AtlasFrame,
  type TerrainAtlas,
} from './TerrainAtlas';
import {
  coastEdgeMask,
  FOAM_EDGE_COUNT,
  foamVariant,
  isDeepWater,
  WATER_DEEP_TINT,
  WATER_SHALLOW_TINT,
  waterRowForCounter,
} from './water';
import {
  CHUNK_TILES,
  chunkAabb,
  chunkChecksum,
  chunksPerSide,
  computeDirtySet,
  extractNetworkSegments,
  NetKind,
  visibleChunks,
  type NetSegment,
} from './chunks';
import { DAY_TINT_NEUTRAL, dayNightTint } from './dayNight';
import { sampleWorldX, sampleWorldY, shouldSnap, SnapshotInterpolator } from './interpolation';
import { loadBakedAtlas } from './bakedAtlas';
import {
  bakedZoomFor,
  buildVehicleIndex,
  FACING_NONE,
  facingFromDelta,
  facingFromMovement,
  VEHICLE_FACING_DELTAS,
  vehicleVariantFor,
  type VehicleFacingCell,
  type VehicleZoomIndex,
} from './vehicleArt';
import {
  BreadcrumbRing,
  consistFollowerDistances,
  consistKnown,
  MAX_CONSIST_FOLLOWERS,
  placeConsist,
  sameConsist,
  type ConsistPlacement,
} from './consistArt';
import {
  cullLabels,
  LABEL_FONT_BASE_PX,
  LABEL_FONT_CHARS,
  LABEL_FONT_FAMILY,
  LABEL_LIFT_PX,
  STATION_LABEL_MIN_ZOOM,
  STATION_LABEL_SIZE_PX,
  STATION_LABEL_TINT,
  TOWN_LABEL_MIN_ZOOM,
  TOWN_LABEL_TINT,
  townLabelSizePx,
  type LabelRect,
} from './labels';
import type { CameraView } from './Minimap';

/**
 * The registered name of the startup-rasterised label font (E-14: from
 * system faces, never a binary in the repo). Installed once per page load -
 * the raster is global Pixi state, and a StrictMode remount must not build
 * it twice.
 */
const LABEL_FONT_NAME = 'iron-veins-label';
let labelFontInstalled = false;

/**
 * The isometric map view.
 *
 * Reads the tile layers straight out of the shared buffer the simulation owns
 * and never writes to them - architecture law #1 in the other direction. It
 * rebuilds its sprites when the camera moved to a different tile range, when
 * the zoom changed, or when the simulation bumped the map revision; not per
 * frame, because nothing about a static map changes between frames.
 */

/** Zoom steps, powers of two so the pixel grid stays clean. */
export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4] as const;
export const DEFAULT_ZOOM_INDEX = 2;

/** Extra tiles drawn beyond the viewport, covering tall ground at the edges. */
const CULL_MARGIN = MAX_HEIGHT + 4;

/**
 * Colours the F3 overlay cycles through for blocks and for the trains holding
 * them. Eight hues far enough apart that two touching blocks are never the same
 * colour by accident, taken from the same colour-blind safe palette the company
 * colours use.
 */
const BLOCK_COLOURS: readonly number[] = [
  0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7, 0x999999,
];

/** Below this zoom the map is drawn as a plain overview: no roads, no houses. */
const DETAIL_ZOOM_MIN = 0.5;

/**
 * At and below this zoom the baked chunk path replaces the per-tile sprite
 * pool (E-04, D-161); above it the M10 drawOrder sprite path is unchanged.
 */
const CHUNK_ZOOM_MAX = 0.5;

/**
 * At and below this zoom the map is the abstract overview of SPEC.md 16.1:
 * terrain chunks, network polylines and vehicle dots - nothing else.
 */
const ABSTRACT_ZOOM_MAX = 0.25;

/**
 * Baked chunk textures kept per profile before least-recently-used eviction.
 * A full-profile texture is 1024x664 px (~2.7 MB), a terrain-profile texture
 * 512x332 px (~0.7 MB); the caps bound GPU memory at roughly 90/65 MB while
 * staying far above what one viewport shows. Chunks used in the current
 * frame are never evicted, so an oversized screen degrades to a larger
 * cache, not to thrashing.
 */
const CHUNK_CACHE_MAX_FULL = 32;
const CHUNK_CACHE_MAX_TERRAIN = 96;

/** Cached polyline lists kept before unused chunks are dropped. [chunks] */
const SEGMENT_CACHE_MAX = 256;

/**
 * Water-animation chunk rebakes allowed per frame at 0.5x. [chunks]
 *
 * The living water swaps its atlas row every WATER_PHASE_FRAMES render
 * frames; a baked chunk shows the swap by being rebaked (D-164 - measured
 * against keeping water live, and the rebake won). Rebaking every visible
 * water chunk in the swap frame would spend ~10 ms in one frame for a
 * half-second cadence, so the swap is staggered: two chunks a frame drains
 * a typical 0.5x viewport (six to nine water chunks) in well under a tenth
 * of the phase window, and a still ocean never pays anything.
 */
const WATER_CHUNK_REBAKES_PER_FRAME = 2;

/**
 * Abstract-mode network style. Widths are SCREEN pixels (divided by zoom at
 * draw time); the colours are section 16.3's road asphalt and track ballast
 * - the ballast tone rather than the rail tone, because a dark grey line on
 * dark green terrain is a network the overview exists to show, not hide.
 */
const NET_ROAD_WIDTH_PX = 2;
const NET_RAIL_WIDTH_PX = 2.5;
const NET_ROAD_COLOR = 0x4a4a4d;
const NET_RAIL_COLOR = 0x9a938a;

/** Vehicle dot edge length in the abstract mode. [screen px] */
const VEHICLE_DOT_PX = 4;

/** ModuleKind values, duplicated as constants to keep render free of sim enums. */
const ROAD_DEPOT_KIND = 2;
const RAIL_PLATFORM_KIND = 3;
const RAIL_DEPOT_KIND = 4;

/** VehicleKind.Train, likewise. */
const TRAIN_KIND = 0;

/** Structure.Bridge. A tunnel is drawn by drawing nothing. */
const BRIDGE_STRUCTURE = 1;

/** Texture cache key per module kind; the index is the ModuleKind value. */
const MODULE_SPRITE_KEYS: readonly string[] = [
  'station',
  'station',
  'depot',
  'platform',
  'railDepot',
];

function moduleFrame(atlas: TerrainAtlas, kind: number): AtlasFrame {
  if (kind === ROAD_DEPOT_KIND) return atlas.depotFrame();
  if (kind === RAIL_PLATFORM_KIND) return atlas.platformFrame();
  if (kind === RAIL_DEPOT_KIND) return atlas.railDepotFrame();
  return atlas.stationFrame();
}

/** Wrap a built atlas page for the GPU; nearest, because pixels are the look. */
function makeAtlasPage(atlas: TerrainAtlas, scale: number, keyPrefix: string): AtlasPage {
  const texture = Texture.from(atlas.canvas);
  texture.source.scaleMode = 'nearest';
  return { atlas, texture, invScale: 1 / scale, keyPrefix };
}

export interface TileInfo {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly terrain: number;
  readonly townId: number;
  readonly industryId: number;
  /** Packed signal byte of the tile (kind + direction), 0 when there is none. */
  readonly signal: number;
  /** Waypoint marker of the tile (a WaypointKind), 0 when there is none. */
  readonly waypoint: number;
}

/**
 * Tint per WaypointKind, over the same white post the signal uses - colour
 * says which mode the marker serves, and reusing the signal cell keeps M11's
 * atlas budget at the ledger's zero (SPEC2 6.2). Indexed by WaypointKind.
 */
const WAYPOINT_TINTS: readonly number[] = [0xffffff, 0x4d8fe0, 0xe0564d, 0xe0a34d];

/**
 * One procedural atlas page (SPEC.md 16.2 per-zoom atlases): its artwork on
 * the GPU plus the two numbers every placement needs - the sprite scale that
 * maps its atlas pixels to world pixels, and a cache prefix so the two pages'
 * frames never collide in the texture cache.
 */
interface AtlasPage {
  readonly atlas: TerrainAtlas;
  readonly texture: Texture;
  /** World px per atlas px: 1 / the scale the page is drawn at. */
  readonly invScale: number;
  /** Frame-cache key prefix, unique per page. */
  readonly keyPrefix: string;
}

/**
 * A cached atlas frame, ready to place: its texture plus the world-space
 * placement facts. `anchorPx` is the D-117 ground line of THIS frame - per
 * frame, because the detail page packs rows of two heights.
 */
interface FrameHandle {
  readonly texture: Texture;
  /** Ground line inside the frame. [world px] */
  readonly anchorPx: number;
  /** Sprite scale mapping the page's atlas px to world px. */
  readonly invScale: number;
}

/**
 * A baked vehicle cell resolved for placement (M13): both passes of the
 * two-pass tint (D-160) plus the world-space placement facts. `anchorXPx`
 * and `anchorYPx` are the cell's own ground pivot - baked cells are tight
 * rectangles around each facing, so unlike the procedural frames there is
 * no shared cell geometry to assume.
 */
interface BakedVehicleHandle {
  /** The hull: authored colours, tint zones in neutral grey. */
  readonly base: Texture;
  /** The livery: grey-shaded tint zones, multiplied by the company colour. */
  readonly mask: Texture;
  /** Ground-pivot position inside the cell. [world px] */
  readonly anchorXPx: number;
  readonly anchorYPx: number;
  /** Cell width, sizing the soft ellipse. [world px] */
  readonly widthPx: number;
  /** Sprite scale mapping the baked page's pixels to world px. */
  readonly invScale: number;
}

/**
 * Everything the renderer keeps per multi-unit train (SPEC2 M13, E-05): the
 * composition from the fleet-marker channel, cached render-side, plus the
 * breadcrumb ring its wagons are placed along. The ring survives marker
 * refreshes - it is path history, and the path did not change because the
 * fleet list was re-sent.
 */
interface ConsistRender {
  /** Catalogue ids in coupling order; [0] is the lead unit. */
  specIds: readonly number[];
  /** Follower centre distances behind the head anchor, ascending. [tiles] */
  distances: Float64Array;
  /** Trailing units to draw (specIds.length - 1). */
  followers: number;
  ring: BreadcrumbRing;
}

/** One baked chunk: its texture and the checksum of what was baked into it. */
interface ChunkEntry {
  readonly texture: RenderTexture;
  readonly chunkX: number;
  readonly chunkY: number;
  checksum: number;
  /** Frame stamp of the last frame this chunk was on screen, for the LRU. */
  lastUsed: number;
  /** True when the bake placed at least one water tile (D-164). */
  readonly hasWater: boolean;
  /** Water animation row the bake drew, so a phase swap knows who is stale. */
  readonly waterRow: number;
}

/** Cached network polylines of one chunk, for the abstract mode. */
interface SegmentEntry {
  readonly checksum: number;
  readonly segments: readonly NetSegment[];
  lastUsed: number;
}

export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  /**
   * Everything that IS the world - chunks, tiles, network lines, vehicles -
   * as one container, so the day/night tint of D-127 stays a single
   * assignment however many drawing paths feed it. The overlay is a sibling:
   * interface does not dim at night.
   */
  private readonly art = new Container();
  private readonly tiles = new Container();
  private readonly overlay = new Graphics();
  private readonly pool: Sprite[] = [];

  /** The baked-chunk layer of the hybrid renderer (E-04), under the sprites. */
  private readonly chunkLayer = new Container();
  private readonly chunkSprites: Sprite[] = [];
  private readonly fullChunks = new Map<number, ChunkEntry>();
  private readonly terrainChunks = new Map<number, ChunkEntry>();
  private readonly segmentCache = new Map<number, SegmentEntry>();
  /** Evicted RenderTextures per profile, recycled instead of reallocated. */
  private readonly freeFullTextures: RenderTexture[] = [];
  private readonly freeTerrainTextures: RenderTexture[] = [];
  /** Off-stage container the chunk bake renders through. */
  private readonly bakeRoot = new Container();
  private readonly bakePool: Sprite[] = [];
  private readonly visibleChunkScratch: number[] = [];
  private readonly dirtyChunkScratch: number[] = [];
  /** Map revision the chunk caches were last diffed against. */
  private chunkSeenRevision = -1;
  /** Hash of the visible chunk set, so the net redraws only when it moves. */
  private chunkSetHash = -1;
  /** The abstract network polylines (0.25x), rebuilt only when stale. */
  private readonly net = new Graphics();
  private netDirty = true;
  /** Vehicle dots of the abstract mode, redrawn every frame - they move. */
  private readonly dots = new Graphics();
  private vehicleSpritesHidden = false;
  /** Owner per drawn vehicle this frame, parallel to `vehicleScreen`. */
  private readonly vehicleOwners: number[] = [];

  /** The base page (drawn at 2x, serves zooms up to 2x as a downscale). */
  private basePage: AtlasPage | null = null;
  /** The 4x detail page for the top zoom level (16.2 per-zoom atlases). */
  private detailPage: AtlasPage | null = null;
  private readonly frameCache = new Map<string, FrameHandle>();

  private map: TileMap | null = null;
  private towns: readonly TownMarker[] = [];
  private industries: readonly IndustryMarker[] = [];

  private zoomIndex = DEFAULT_ZOOM_INDEX;
  private centreX = 0;
  private centreY = 0;

  private builtRevision = -1;
  private builtBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private builtZoom = -1;

  private hovered: { x: number; y: number } | null = null;
  private selected: { x: number; y: number } | null = null;

  /**
   * The living water of D-164, keyed to the blink counter (never the wall
   * clock - Fehlerkatalog 39). `waterRow` is this frame's animation row;
   * `builtWaterRow` is what the live water sprites currently show, and
   * `waterSlots`/`waterSlopes` record which pool sprites they are (parallel
   * arrays, rebuilt by every `rebuild`), so a phase swap re-textures exactly
   * those sprites instead of rebuilding the world. `waterSwapHandles` is
   * per-slope scratch for one swap, resolved once per phase rather than once
   * per sprite.
   */
  private waterRow = 0;
  private builtWaterRow = 0;
  private readonly waterSlots: number[] = [];
  private readonly waterSlopes: number[] = [];
  private readonly waterSwapHandles: FrameHandle[] = [];
  /** Chunks of the last full-profile visible set, for the staggered rebake. */
  private visibleFullChunkCount = 0;

  /**
   * The map text of SPEC2 M12: town and station labels as BitmapText
   * sprites in a stage-level layer OUTSIDE `world` - screen-space, so the
   * glyphs render 1:1 whatever the zoom, and outside the D-127 tint,
   * because a name is wayfinding and wayfinding does not dim at night. The
   * layer follows `world.position` each frame (one copy); the labels
   * themselves are re-laid-out only when the zoom, the marker lists or the
   * map revision move.
   */
  private readonly labelLayer = new Container();
  private readonly labelPool: BitmapText[] = [];
  private labelFontReady = false;
  private labelsBuiltZoom = -1;
  private labelsBuiltRevision = -1;
  private labelsBuiltTowns: readonly TownMarker[] | null = null;
  private labelsBuiltStations: readonly StationMarker[] | null = null;

  /**
   * Where the minimap learns what the camera sees (SPEC2 M12). Fired only
   * when centre, zoom or screen size actually moved - an idle frame
   * publishes nothing - and carries world-space camera facts only; the
   * panel does the tile-space projection with `minimapViewQuad`.
   */
  onCamera: ((camera: CameraView) => void) | null = null;
  private readonly sentCamera = {
    centreX: NaN,
    centreY: NaN,
    zoom: NaN,
    screenW: NaN,
    screenH: NaN,
  };

  /** F3: the block and reservation overlay of section 9.3. */
  private blockOverlay = false;
  private reservedSource: (() => { data: Int32Array; count: number }) | null = null;
  private readonly blocks = new BlockIndex(0);
  private deadlockTiles: readonly number[] = [];
  /** Frame counter, so the deadlock marker blinks without a wall clock. */
  private blink = 0;

  /** True once the WebGL context exists; false again after dispose. */
  private live = false;
  /** Set by dispose, so an attach that is still in flight cleans up after itself. */
  private discarded = false;

  /** Called whenever the tile under the cursor changes. */
  onHover: ((info: TileInfo | null) => void) | null = null;
  /** Called on a left click on the map. */
  onSelect: ((info: TileInfo | null) => void) | null = null;
  /**
   * A vehicle was clicked, or the click missed every vehicle (null).
   *
   * Separate from `onSelect` so the caller can decide what a click on a lorry
   * means while a build tool is armed - which is a question about the
   * interface, not about the renderer.
   */
  onSelectVehicle: ((vehicleId: number | null) => void) | null = null;

  private stations: readonly StationMarker[] = [];
  /** Company colour, applied to stations and vehicles as a tint. */
  private companyTint = 0xf08020;
  /** Day/night modulation (section 16.3), a SETTING per D-110/D-127. */
  private dayNight = true;
  /** Where the renderer reads the published tick for the day/night curve. */
  private tickSource: (() => number) | null = null;
  /** Last world tint applied, so an unchanged frame does not dirty the tree. */
  private appliedTint = DAY_TINT_NEUTRAL;
  /** Where the renderer fetches the tagged per-tick vehicle frame from. */
  private vehicleSource: (() => VehicleFrame) | null = null;
  /**
   * Reader-side copies of the two newest generations plus the wall-clock
   * alpha between them (E-05, D-162). Owned here because the interpolation
   * is drawing policy: the sim, the protocol and the stride know nothing.
   */
  private readonly interpolator = new SnapshotInterpolator();
  /** This frame's alpha, shared by vehicle motion and the day/night phase. */
  private frameAlpha = 1;
  private previewRoute: readonly number[] | null = null;
  private readonly vehicleSprites: Sprite[] = [];
  /**
   * The company-colour pass of the two-pass tint (D-160) and the soft
   * ground ellipse (M13), parallel to `vehicleSprites` slot for slot. Per
   * slot the container holds shadow, base, mask in that insertion order;
   * they share one zIndex, and Pixi's stable sort keeps the order.
   */
  private readonly vehicleMaskSprites: Sprite[] = [];
  private readonly vehicleShadowSprites: Sprite[] = [];
  /** Gradient ellipse the shadows share; built once at attach. */
  private shadowTexture: Texture | null = null;
  /**
   * Baked vehicle art (SPEC2 M13, E-14/D-160): the per-zoom cell indexes
   * and one GPU texture per baked page. Null until the background load
   * lands - and forever, in a build without a bake: the white-box frames
   * below are the fallback the game always starts on.
   */
  private bakedVehicleZooms: readonly VehicleZoomIndex[] | null = null;
  private bakedVehiclePages: ReadonlyMap<string, Texture> | null = null;
  private bakedZoomList: readonly number[] = [];
  private readonly bakedVehicleFrameCache = new Map<string, BakedVehicleHandle>();
  /**
   * specId per vehicle id, from the fleet markers: which catalogue entry a
   * snapshot row IS travels on the low-frequency marker channel and is
   * cached render-side (E-05) - the 20 Hz stride stays eight ints. -1 until
   * the markers name the vehicle; the white box covers the gap.
   */
  private readonly vehicleSpecIds = new Int32Array(MAX_VEHICLES).fill(-1);
  /**
   * Last facing drawn per vehicle id, so a vehicle that stops keeps
   * pointing where it was going instead of spinning to a default.
   */
  private readonly vehicleFacings = new Uint8Array(MAX_VEHICLES).fill(FACING_NONE);
  /**
   * Per multi-unit train: composition and breadcrumb ring (SPEC2 M13,
   * E-05). Keyed by vehicle id, reconciled on the fleet-marker cadence -
   * entries appear when the markers name a train of two or more units and
   * vanish with the vehicle, so a ring is allocated once per train's life,
   * never per frame.
   */
  private readonly consists = new Map<number, ConsistRender>();
  /**
   * Preallocated slots the consist placement walk writes into, sized by the
   * sim's own consist cap - the per-frame path allocates nothing.
   */
  private readonly consistScratch: readonly ConsistPlacement[] = Array.from(
    { length: MAX_CONSIST_FOLLOWERS },
    () => ({ fx: 0, fy: 0, h: 0, dirX: 0, dirY: 0 }),
  );
  /**
   * Which vehicle each sprite is drawing, this frame.
   *
   * Parallel to `vehicleSprites` and rebuilt every frame, because the snapshot
   * block is COMPACTED - a row's position says nothing about which vehicle it
   * is, and a sprite is reused for whatever lands in its slot. This array is
   * what turns a click on a lorry into a vehicle id (owed since M2).
   */
  private readonly vehicleIds: number[] = [];
  /** Screen positions of the drawn vehicles, for the hit test and for audio. */
  private readonly vehicleScreen: { x: number; y: number }[] = [];
  private drawnVehicles = 0;
  private selectedVehicleId: number | null = null;

  /**
   * Create the WebGL context and start rendering.
   *
   * `init` is asynchronous, and a component can be unmounted while it is still
   * running - React's StrictMode does exactly that on every mount. Destroying an
   * Application that has not finished initialising throws, so disposal that
   * arrives early is recorded and carried out here instead.
   */
  async attach(container: HTMLElement): Promise<void> {
    await this.app.init({
      background: 0x11161c,
      antialias: false,
      resizeTo: container,
      preference: 'webgl',
    });

    if (this.discarded) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.live = true;
    container.appendChild(this.app.canvas);

    // Both procedural pages are built up front - the detail page must not
    // stall the first zoom to 4x - and timed against their slice of the
    // section-21 cold-start budget. A wall clock is fine here: this is a
    // startup measurement, not world animation (Fehlerkatalog 39).
    const atlasStart = performance.now();
    const baseAtlas = buildTerrainAtlas();
    const baseMs = performance.now() - atlasStart;
    const detailStart = performance.now();
    const detailAtlas = buildDetailAtlas();
    const detailMs = performance.now() - detailStart;
    if (baseMs + detailMs > ATLAS_BUILD_BUDGET_MS) {
      console.warn(
        `MapView: procedural atlas pages took ${(baseMs + detailMs).toFixed(1)} ms ` +
          `(base ${baseMs.toFixed(1)}, detail ${detailMs.toFixed(1)}) - over the ` +
          `${ATLAS_BUILD_BUDGET_MS} ms startup slice of SPEC.md section 21`,
      );
    }
    this.basePage = makeAtlasPage(baseAtlas, ATLAS_SCALE, 'b');
    this.detailPage = makeAtlasPage(detailAtlas, DETAIL_ATLAS_SCALE, 'd');
    this.shadowTexture = makeShadowTexture();

    // The baked Kenney pages load in the background (M13): the game is
    // already running on procedural art, swaps to the baked cells the frame
    // the pages arrive - or never does, in a build without a cache (E-14).
    void this.loadBakedVehicleArt();

    // One sorted container for tiles AND vehicles: correct occlusion needs the
    // vehicle sprites interleaved into the tile sequence by their drawOrder
    // key (section 16.1) - a vehicle layer on top can never put a train
    // behind a hill. Pixi only re-sorts when a zIndex actually changed.
    this.tiles.sortableChildren = true;
    // Chunk sprites sort by their diagonal (chunkX + chunkY), which keeps the
    // painter's order between chunks; the bake root sorts its sprites by the
    // same drawOrder keys the live path uses, so a baked chunk is
    // pixel-identical to what the sprite pool would have drawn.
    this.chunkLayer.sortableChildren = true;
    this.bakeRoot.sortableChildren = true;
    this.art.addChild(this.chunkLayer);
    this.art.addChild(this.net);
    this.art.addChild(this.tiles);
    this.art.addChild(this.dots);
    this.world.addChild(this.art);
    this.world.addChild(this.overlay);
    this.app.stage.addChild(this.world);
    // The label layer sits ABOVE the world on the stage, unscaled: glyphs
    // render 1:1 at every zoom, and names stay at full contrast at night
    // (D-127: interface does not dim). It never takes pointer events - a
    // click through a town name must still select the tile under it.
    this.labelLayer.eventMode = 'none';
    this.labelLayer.interactiveChildren = false;
    this.app.stage.addChild(this.labelLayer);

    // The label font, rasterised NOW from system faces (E-14): no font
    // binary exists to load, and the raster is reused for the whole page
    // lifetime - a StrictMode remount must not build a second atlas.
    if (!labelFontInstalled) {
      BitmapFont.install({
        name: LABEL_FONT_NAME,
        style: {
          fontFamily: LABEL_FONT_FAMILY,
          fontSize: LABEL_FONT_BASE_PX,
          fill: 0xffffff,
          // Baked outline, so a pale name survives pale terrain. The glyphs
          // are white and tinted per label; the outline multiplies towards
          // black under any tint, so it stays an outline.
          stroke: { color: 0x11161c, width: 3 },
        },
        chars: LABEL_FONT_CHARS,
        // Rasterised at twice the base size: labels draw at 10-18 px from
        // an 18 px face, and the doubled raster keeps the downscales crisp.
        resolution: 2,
      });
      labelFontInstalled = true;
    }
    this.labelFontReady = true;

    this.installInput(this.app.canvas);
    this.app.ticker.add(this.update);
  }

  /** Hand over the map the simulation generated. */
  setMap(map: TileMap, towns: readonly TownMarker[], industries: readonly IndustryMarker[]): void {
    this.map = map;
    this.towns = towns;
    this.industries = industries;
    this.builtRevision = -1;
    this.clearChunkCaches();

    const start = towns[0];
    if (start !== undefined) this.centreOnTile(start.x, start.y);
    else this.centreOnTile(map.size >> 1, map.size >> 1);
  }

  /** Tell the view that the simulation changed the ground. */
  setMapRevision(revision: number): void {
    if (this.map !== null) this.map.revision = revision;
  }

  /** Station list, refreshed whenever one is built or extended. */
  setStations(stations: readonly StationMarker[]): void {
    this.stations = stations;
    this.builtRevision = -1; // stations are drawn with the tiles
  }

  setCompanyColor(hex: number): void {
    this.companyTint = hex;
    this.builtRevision = -1;
  }

  /**
   * Where to read the tagged per-tick vehicle frame. Pulled every frame
   * rather than pushed, because the renderer runs at 60 Hz and the
   * simulation at 20 - which is exactly the gap the E-05 interpolator
   * bridges from the generation tag on this frame.
   */
  setVehicleSource(source: () => VehicleFrame): void {
    this.vehicleSource = source;
  }

  /** Where the F3 overlay reads the claimed track from. */
  setReservedSource(source: () => { data: Int32Array; count: number }): void {
    this.reservedSource = source;
  }

  /** Where the day/night curve reads the published tick from. */
  setTickSource(source: () => number): void {
    this.tickSource = source;
  }

  /** Turn the day/night modulation on or off (options screen, D-110). */
  setDayNight(on: boolean): void {
    this.dayNight = on;
  }

  /** Turn the block overlay on or off (F3). */
  setBlockOverlay(on: boolean): void {
    this.blockOverlay = on;
  }

  /** Tiles of trains that have been stuck long enough to count (section 9.3). */
  setDeadlockTiles(tiles: readonly number[]): void {
    this.deadlockTiles = tiles;
  }

  /**
   * The fleet markers, read for two facts: which catalogue entry a vehicle
   * id is (a train's leading unit), and - since M13's consist rendering -
   * the full composition of every multi-unit train, catalogue ids in
   * coupling order (E-05: compositions travel this low-frequency channel,
   * never the 20 Hz stride). Everything else the markers carry stays the
   * panels' business.
   *
   * The consist cache is RECONCILED, not rebuilt: a ring is path history,
   * and the daily fleet refresh must not wipe the curve a train's wagons
   * are standing on. Only a changed composition re-derives the distances;
   * only a vanished vehicle drops its entry.
   */
  setFleet(vehicles: readonly VehicleMarker[]): void {
    this.vehicleSpecIds.fill(-1);
    const seen = new Set<number>();
    for (const vehicle of vehicles) {
      if (vehicle.id < 0 || vehicle.id >= MAX_VEHICLES) continue;
      this.vehicleSpecIds[vehicle.id] = vehicle.specId;

      // Rail only (SPEC2 M13): road, water and air stay single-sprite. A
      // consist with an id the catalogue cannot resolve falls back whole to
      // the single-sprite path rather than drawing a train with gaps.
      if (
        vehicle.kind !== TRAIN_KIND ||
        vehicle.consist.length < 2 ||
        !consistKnown(vehicle.consist)
      ) {
        continue;
      }
      seen.add(vehicle.id);
      const existing = this.consists.get(vehicle.id);
      if (existing !== undefined && sameConsist(existing.specIds, vehicle.consist)) continue;
      const distances = new Float64Array(
        Math.min(vehicle.consist.length - 1, MAX_CONSIST_FOLLOWERS),
      );
      const followers = consistFollowerDistances(vehicle.consist, distances);
      if (existing !== undefined) {
        existing.specIds = [...vehicle.consist];
        existing.distances = distances;
        existing.followers = followers;
      } else {
        this.consists.set(vehicle.id, {
          specIds: [...vehicle.consist],
          distances,
          followers,
          ring: new BreadcrumbRing(),
        });
      }
    }
    for (const id of [...this.consists.keys()]) {
      if (!seen.has(id)) this.consists.delete(id);
    }
  }

  /**
   * Fetch the baked atlas output and index its vehicle cells (M13).
   * Whether a baked path exists at all is `atlasSourceFor`'s decision
   * inside `loadBakedAtlas` (D-160); a null is simply the procedural game
   * that is already running - the E-14 floor, not an error path.
   */
  private async loadBakedVehicleArt(): Promise<void> {
    const atlas = await loadBakedAtlas();
    if (atlas === null || !this.live || this.discarded) return;
    const pages = new Map<string, Texture>();
    for (const [file, bitmap] of atlas.pages) {
      const texture = Texture.from(bitmap);
      // Nearest, like every atlas page: pixels are the look.
      texture.source.scaleMode = 'nearest';
      pages.set(file, texture);
    }
    const zoomIndexes = buildVehicleIndex(atlas.manifest);
    if (zoomIndexes.length === 0) return;
    this.bakedVehiclePages = pages;
    this.bakedVehicleZooms = zoomIndexes;
    this.bakedZoomList = zoomIndexes.map((entry) => entry.zoom);
  }

  /** The baked vehicle index serving the current zoom, or null while procedural. */
  private bakedIndexForZoom(): VehicleZoomIndex | null {
    const zooms = this.bakedVehicleZooms;
    if (zooms === null) return null;
    const zoom = bakedZoomFor(this.zoom, this.bakedZoomList);
    for (const entry of zooms) {
      if (entry.zoom === zoom) return entry;
    }
    return null;
  }

  /**
   * Resolve one facing cell to its two sub-textures and placement facts,
   * cached per cell - the baked twin of `frameTexture`. `invScale` is a
   * property of the cell's page zoom, so it belongs to the cached handle.
   */
  private bakedVehicleHandle(
    entry: VehicleFacingCell,
    invScale: number,
  ): BakedVehicleHandle | null {
    const key = `${entry.page}:${entry.cell.x}:${entry.cell.y}`;
    const cached = this.bakedVehicleFrameCache.get(key);
    if (cached !== undefined) return cached;
    const pageTexture = this.bakedVehiclePages?.get(entry.page);
    if (pageTexture === undefined) return null;
    const cell = entry.cell;
    const handle: BakedVehicleHandle = {
      base: new Texture({
        source: pageTexture.source,
        frame: new Rectangle(cell.x, cell.y, cell.width, cell.height),
      }),
      mask: new Texture({
        source: pageTexture.source,
        frame: new Rectangle(cell.maskX, cell.maskY, cell.width, cell.height),
      }),
      anchorXPx: cell.anchorX * invScale,
      anchorYPx: cell.anchorY * invScale,
      widthPx: cell.width * invScale,
      invScale,
    };
    this.bakedVehicleFrameCache.set(key, handle);
    return handle;
  }

  get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex]!;
  }

  centreOnTile(tileX: number, tileY: number): void {
    const map = this.map;
    const height = map === null ? 0 : map.baseHeight(tileX, tileY);
    const world = tileToWorld(tileX, tileY, height);
    this.centreX = world.x;
    this.centreY = world.y;
  }

  dispose(): void {
    this.discarded = true;
    if (!this.live) return; // attach is still running and will clean up
    this.live = false;
    this.app.ticker.remove(this.update);
    // Chunk RenderTextures live in the caches, not in the stage tree, so the
    // app's own destroy would leak them on the GPU.
    for (const entry of this.fullChunks.values()) entry.texture.destroy(true);
    for (const entry of this.terrainChunks.values()) entry.texture.destroy(true);
    for (const texture of this.freeFullTextures) texture.destroy(true);
    for (const texture of this.freeTerrainTextures) texture.destroy(true);
    this.fullChunks.clear();
    this.terrainChunks.clear();
    this.segmentCache.clear();
    this.freeFullTextures.length = 0;
    this.freeTerrainTextures.length = 0;
    this.app.destroy(true, { children: true });
    this.frameCache.clear();
    // The baked pages and the shadow gradient own their texture sources
    // (ImageBitmap / canvas); the app's destroy never saw them.
    if (this.bakedVehiclePages !== null) {
      for (const texture of this.bakedVehiclePages.values()) texture.destroy(true);
    }
    this.bakedVehiclePages = null;
    this.bakedVehicleZooms = null;
    this.bakedVehicleFrameCache.clear();
    this.shadowTexture?.destroy(true);
    this.shadowTexture = null;
    // The BitmapText objects died with the stage; the pool must not hand
    // out corpses to a later attach. The FONT stays installed: it is
    // page-global by design (see LABEL_FONT_NAME).
    this.labelPool.length = 0;
  }

  // ------------------------------------------------------------------ input

  private installInput(canvas: HTMLCanvasElement): void {
    let panning = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 2 || event.button === 1) {
        panning = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      } else if (event.button === 0) {
        // Vehicles first. They are drawn on top of the ground, so a click that
        // lands on one has to mean the vehicle - anything else and a lorry
        // becomes a hole the player builds through.
        const vehicleId = this.vehicleAtClient(event);
        if (vehicleId !== null) {
          this.selectedVehicleId = vehicleId;
          this.onSelectVehicle?.(vehicleId);
          return;
        }
        this.onSelectVehicle?.(null);
        this.selected = this.tileAtClient(event);
        this.onSelect?.(this.infoAt(this.selected));
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (panning) {
        // No smoothing: inertia makes precise construction unpleasant.
        this.centreX -= (event.clientX - lastX) / this.zoom;
        this.centreY -= (event.clientY - lastY) / this.zoom;
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      const tile = this.tileAtClient(event);
      if (tile?.x !== this.hovered?.x || tile?.y !== this.hovered?.y) {
        this.hovered = tile;
        this.onHover?.(this.infoAt(tile));
      }
    });

    canvas.addEventListener('pointerup', (event) => {
      panning = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const next = this.zoomIndex + (event.deltaY < 0 ? 1 : -1);
        this.setZoomIndex(next, event);
      },
      { passive: false },
    );
  }

  /** Zoom towards the cursor, so the tile under it stays put. */
  private setZoomIndex(next: number, event: PointerEvent | WheelEvent): void {
    const clamped = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, next));
    if (clamped === this.zoomIndex) return;

    const before = this.clientToWorld(event);
    this.zoomIndex = clamped;
    const after = this.clientToWorld(event);
    this.centreX += before.x - after.x;
    this.centreY += before.y - after.y;
  }

  private clientToWorld(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    return {
      x: (screenX - this.app.screen.width / 2) / this.zoom + this.centreX,
      y: (screenY - this.app.screen.height / 2) / this.zoom + this.centreY,
    };
  }

  private tileAtClient(event: PointerEvent | WheelEvent): { x: number; y: number } | null {
    if (this.map === null) return null;
    const world = this.clientToWorld(event);
    return pickTile(this.map, world.x, world.y);
  }

  private infoAt(tile: { x: number; y: number } | null): TileInfo | null {
    const map = this.map;
    if (map === null || tile === null) return null;
    const index = map.tileIndex(tile.x, tile.y);
    return {
      x: tile.x,
      y: tile.y,
      height: map.baseHeight(tile.x, tile.y),
      terrain: map.terrain[index]!,
      townId: map.townId[index]!,
      industryId: map.industryId[index]!,
      signal: map.signal[index]!,
      waypoint: map.waypoint[index]!,
    };
  }

  // --------------------------------------------------------------- drawing

  private readonly update = (): void => {
    const map = this.map;
    if (map === null) return;

    this.clampCentre(map.size);
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - this.centreX * this.zoom,
      this.app.screen.height / 2 - this.centreY * this.zoom,
    );

    // E-05 (D-162): pull the published vehicle frame ONCE per frame. When a
    // new generation arrived the interpolator swaps its reader-side copies;
    // the wall-clock alpha then places this frame between the previous and
    // the current tick. The wall clock decides only WHERE between two
    // published ticks the frame sits - the sim knows nothing of it, and a
    // pause parks alpha at 1.
    const nowMs = performance.now();
    const generationMoved =
      this.vehicleSource !== null && this.interpolator.observe(this.vehicleSource(), nowMs);
    this.frameAlpha = this.interpolator.alpha(nowMs);
    // Consist breadcrumbs (SPEC2 M13, E-05) advance on the 20 Hz publish
    // edge, never per rendered frame: the sample recorded is the generation
    // that just became the PREVIOUS one - the position the interpolated
    // head has provably passed.
    if (generationMoved && this.consists.size > 0) this.recordConsistBreadcrumbs(map);

    // Day/night (section 16.3): ONE tint on the world-art container -
    // chunks, tiles, network lines and vehicles alike - computed once per
    // frame from the snapshot tick and multiplied down the tree by the GPU;
    // never per-sprite work, and the baked chunk textures take exactly the
    // same modulation as the sprite path. The overlay Graphics and the
    // minimap are deliberately outside it: selection markers, previews and
    // the F3 blocks are interface, and interface does not dim at night
    // (D-127). Since M12 the curve reads the INTERPOLATED phase - the same
    // alpha that glides the vehicles glides the light, so dawn does not
    // step once per tick; the phase never leaves the two published ticks.
    const phase = this.interpolator.hasFrame
      ? this.interpolator.phase(this.frameAlpha)
      : this.tickSource === null
        ? 0
        : this.tickSource();
    const tint = this.dayNight ? dayNightTint(phase) : DAY_TINT_NEUTRAL;
    if (tint !== this.appliedTint) {
      this.appliedTint = tint;
      this.art.tint = tint;
    }

    // The hybrid renderer of E-04: at and below 0.5x the static world comes
    // from baked 32x32-tile chunks and only markers and vehicles stay live
    // sprites; at 0.25x the overview abstracts to terrain + network
    // polylines + vehicle dots (SPEC.md 16.1). Detail zooms keep the M10
    // sprite path untouched.
    const chunked = this.zoom <= CHUNK_ZOOM_MAX;
    const abstract = this.zoom <= ABSTRACT_ZOOM_MAX;
    this.chunkLayer.visible = chunked;
    this.net.visible = abstract;
    this.dots.visible = abstract;

    // The living water's animation row for this frame (D-164), from the
    // blink counter - the deterministic frame counter, never the wall clock
    // (Fehlerkatalog 39). Resolved BEFORE the rebuild paths so a rebuild or
    // a chunk bake in this frame already draws the current row.
    this.waterRow = waterRowForCounter(this.blink);

    const bounds = this.visibleTileBounds(map.size);
    const changed =
      map.revision !== this.builtRevision ||
      this.zoom !== this.builtZoom ||
      bounds.minX !== this.builtBounds.minX ||
      bounds.minY !== this.builtBounds.minY ||
      bounds.maxX !== this.builtBounds.maxX ||
      bounds.maxY !== this.builtBounds.maxY;

    if (changed) {
      if (chunked) {
        this.maintainChunks(map, abstract);
        this.rebuildMarkers(map, bounds, abstract);
      } else {
        this.rebuild(map, bounds);
      }
      this.builtRevision = map.revision;
      this.builtZoom = this.zoom;
      this.builtBounds = bounds;
    }
    this.animateWater(map, chunked, abstract);
    this.drawVehicles(map, abstract);
    this.drawOverlay(map);

    // Map text (SPEC2 M12): re-laid-out only when zoom, lists or revision
    // moved; per frame the whole layer just follows the camera - one copy.
    this.maintainLabels(map);
    this.labelLayer.position.copyFrom(this.world.position);
    this.publishCamera();
  };

  /**
   * Rebuild the label layout when its inputs moved (SPEC2 M12).
   *
   * Priority order IS the culling policy (labels.ts): towns before
   * stations, larger towns before smaller, so when two names fight for the
   * same pixels the map keeps the one a player is more likely to be
   * looking for. Positions are world coordinates times zoom, because the
   * layer itself is unscaled - which is also why this must rerun on a zoom
   * flip even though nothing in the world moved.
   */
  private maintainLabels(map: TileMap): void {
    if (!this.labelFontReady) return;
    if (
      this.zoom === this.labelsBuiltZoom &&
      map.revision === this.labelsBuiltRevision &&
      this.towns === this.labelsBuiltTowns &&
      this.stations === this.labelsBuiltStations
    ) {
      return;
    }
    this.labelsBuiltZoom = this.zoom;
    this.labelsBuiltRevision = map.revision;
    this.labelsBuiltTowns = this.towns;
    this.labelsBuiltStations = this.stations;

    const zoom = this.zoom;
    const towns =
      zoom >= TOWN_LABEL_MIN_ZOOM
        ? [...this.towns].sort((a, b) => b.population - a.population || a.id - b.id)
        : [];
    const stations =
      zoom >= STATION_LABEL_MIN_ZOOM ? [...this.stations].sort((a, b) => a.id - b.id) : [];

    const rects: LabelRect[] = [];
    let used = 0;
    for (const town of towns) {
      const label = this.takeLabel(used++, town.name, townLabelSizePx(town.population));
      label.tint = TOWN_LABEL_TINT;
      const world = tileToWorld(town.x, town.y, map.baseHeight(town.x, town.y));
      label.position.set(world.x * zoom, world.y * zoom - LABEL_LIFT_PX);
      rects.push(this.labelRect(label));
    }
    for (const station of stations) {
      const label = this.takeLabel(used++, station.name, STATION_LABEL_SIZE_PX);
      label.tint = STATION_LABEL_TINT;
      const world = tileToWorld(station.x, station.y, map.baseHeight(station.x, station.y));
      label.position.set(world.x * zoom, world.y * zoom - LABEL_LIFT_PX);
      rects.push(this.labelRect(label));
    }

    // Collision culling: labels drop, they never overlap (SPEC2 M12). The
    // rects are in priority order, so the greedy keep is the policy.
    const keep = cullLabels(rects);
    for (let i = 0; i < used; i++) this.labelPool[i]!.visible = keep[i]!;
    for (let i = used; i < this.labelPool.length; i++) this.labelPool[i]!.visible = false;
  }

  /** Pooled BitmapText, created on first use; text and size change-detected. */
  private takeLabel(index: number, text: string, sizePx: number): BitmapText {
    let label = this.labelPool[index];
    if (label === undefined) {
      label = new BitmapText({
        text: '',
        style: { fontFamily: LABEL_FONT_NAME, fontSize: LABEL_FONT_BASE_PX },
      });
      // Centred over its anchor point, sitting on it: a name hovers above
      // its tile rather than covering it.
      label.anchor.set(0.5, 1);
      this.labelPool.push(label);
      this.labelLayer.addChild(label);
    }
    if (label.text !== text) label.text = text;
    if (label.style.fontSize !== sizePx) label.style.fontSize = sizePx;
    label.visible = true;
    return label;
  }

  /** The screen-space rectangle a laid-out label covers (anchor 0.5/1). */
  private labelRect(label: BitmapText): LabelRect {
    const w = label.width;
    const h = label.height;
    return { x: label.position.x - w / 2, y: label.position.y - h, w, h };
  }

  /** Tell the minimap what the camera sees, only when that actually moved. */
  private publishCamera(): void {
    if (this.onCamera === null) return;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const sent = this.sentCamera;
    if (
      sent.centreX === this.centreX &&
      sent.centreY === this.centreY &&
      sent.zoom === this.zoom &&
      sent.screenW === screenW &&
      sent.screenH === screenH
    ) {
      return;
    }
    sent.centreX = this.centreX;
    sent.centreY = this.centreY;
    sent.zoom = this.zoom;
    sent.screenW = screenW;
    sent.screenH = screenH;
    this.onCamera({
      centreX: this.centreX,
      centreY: this.centreY,
      zoom: this.zoom,
      screenW,
      screenH,
    });
  }

  /**
   * Advance the living water to this frame's animation row (D-164).
   *
   * On the detail path a phase swap re-textures the recorded water sprites -
   * position, tint and draw order are row-independent, so nothing else moves.
   * On the 0.5x chunk path the water is baked, and stale water chunks are
   * REBAKED, at most WATER_CHUNK_REBAKES_PER_FRAME per frame - a phase
   * therefore rolls across a large viewport over a few frames rather than
   * spiking one. At 0.25x the water holds still on row 0: the abstract mode
   * of SPEC.md 16.1 strips detail by design, a two-pixel tile cannot show a
   * shimmer that reads as anything but noise, and the rebake bill at
   * overview scale is exactly the pan cost chunking exists to remove.
   */
  private animateWater(map: TileMap, chunked: boolean, abstract: boolean): void {
    const row = this.waterRow;
    if (!chunked) {
      if (row === this.builtWaterRow) return;
      this.builtWaterRow = row;
      if (this.waterSlots.length === 0) return;
      for (let slope = 0; slope < SLOPE_COUNT; slope++) {
        this.waterSwapHandles[slope] = this.frameTexture(
          this.basePage!,
          `w${row}:${slope}`,
          waterAtlasFrame(row, slope),
        );
      }
      for (let i = 0; i < this.waterSlots.length; i++) {
        const sprite = this.pool[this.waterSlots[i]!]!;
        sprite.texture = this.waterSwapHandles[this.waterSlopes[i]!]!.texture;
      }
      return;
    }
    if (abstract) return;

    let rebaked = 0;
    for (let i = 0; i < this.visibleFullChunkCount; i++) {
      if (rebaked >= WATER_CHUNK_REBAKES_PER_FRAME) return;
      const key = this.visibleChunkScratch[i]!;
      const entry = this.fullChunks.get(key);
      if (entry === undefined || !entry.hasWater || entry.waterRow === row) continue;
      const fresh = this.bakeChunk(
        map,
        entry.chunkX,
        entry.chunkY,
        false,
        entry.texture,
        CHUNK_ZOOM_MAX,
      );
      fresh.lastUsed = entry.lastUsed;
      this.fullChunks.set(key, fresh);
      rebaked++;
    }
  }

  private clampCentre(size: number): void {
    const halfSpan = size * (TILE_W / 2);
    if (this.centreX < -halfSpan) this.centreX = -halfSpan;
    if (this.centreX > halfSpan) this.centreX = halfSpan;
    if (this.centreY < -HEIGHT_PX * MAX_HEIGHT) this.centreY = -HEIGHT_PX * MAX_HEIGHT;
    if (this.centreY > size * TILE_H) this.centreY = size * TILE_H;
  }

  /** The viewport in unzoomed world pixels. */
  private viewRect(): { left: number; top: number; right: number; bottom: number } {
    const halfW = this.app.screen.width / 2 / this.zoom;
    const halfH = this.app.screen.height / 2 / this.zoom;
    return {
      left: this.centreX - halfW,
      right: this.centreX + halfW,
      top: this.centreY - halfH,
      bottom: this.centreY + halfH,
    };
  }

  private visibleTileBounds(size: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const { left, top, right, bottom } = this.viewRect();

    // Corners of the viewport, back-projected at height 0.
    const sums = [(2 * top) / TILE_H, (2 * bottom) / TILE_H];
    const differences = [(2 * left) / TILE_W, (2 * right) / TILE_W];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const sum of sums) {
      for (const difference of differences) {
        const tx = (sum + difference) / 2;
        const ty = (sum - difference) / 2;
        minX = Math.min(minX, tx);
        maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty);
        maxY = Math.max(maxY, ty);
      }
    }

    return {
      minX: Math.max(0, Math.floor(minX) - CULL_MARGIN),
      minY: Math.max(0, Math.floor(minY) - CULL_MARGIN),
      maxX: Math.min(size - 1, Math.ceil(maxX) + CULL_MARGIN),
      maxY: Math.min(size - 1, Math.ceil(maxY) + CULL_MARGIN),
    };
  }

  /**
   * The page the current zoom draws from: the 4x detail page at the top zoom
   * level, the base page everywhere else - including every chunked zoom, so
   * the bake path and the live path can never disagree about a frame.
   */
  private activePage(): AtlasPage {
    return atlasPageForZoom(this.zoom) === 'detail' ? this.detailPage! : this.basePage!;
  }

  private frameTexture(page: AtlasPage, key: string, frame: AtlasFrame): FrameHandle {
    const cacheKey = page.keyPrefix + key;
    const cached = this.frameCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const handle: FrameHandle = {
      texture: new Texture({
        source: page.texture.source,
        frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
      }),
      anchorPx: frame.anchorY * page.invScale,
      invScale: page.invScale,
    };
    this.frameCache.set(cacheKey, handle);
    return handle;
  }

  private take(index: number): Sprite {
    let sprite = this.pool[index];
    if (sprite === undefined) {
      sprite = new Sprite();
      this.pool.push(sprite);
      this.tiles.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }

  private place(
    sprite: Sprite,
    handle: FrameHandle,
    worldX: number,
    worldY: number,
    zIndex: number,
  ): void {
    sprite.texture = handle.texture;
    // Scale per placement, not per pool: the pages differ (1/2 vs 1/4) and a
    // zoom flip reuses every pooled sprite for the other page. Pixi's
    // ObservablePoint setter is change-detected, so a rebuild inside one page
    // dirties nothing here.
    sprite.scale.set(handle.invScale);
    sprite.tint = 0xffffff;
    // The drawOrder key of section 16.1. Insertion already runs along the
    // diagonals, but only the key orders heights within a diagonal and sorts
    // the vehicles in - and Pixi's zIndex setter is change-detected, so a
    // rebuild that keeps a sprite's key costs no sort.
    sprite.zIndex = zIndex;
    // Where the ground sits inside the cell is the ATLAS's business, and it
    // says so through `anchorY` - per FRAME since the detail page packs rows
    // of two heights. Assuming one height step here was an unwritten
    // agreement between two files, and it broke the moment the atlas grew
    // headroom for a chimney.
    sprite.position.set(worldX - TILE_W / 2, worldY - handle.anchorPx);
  }

  private rebuild(
    map: TileMap,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): void {
    const page = this.activePage();
    const atlas = page.atlas;
    const detailed = this.zoom >= DETAIL_ZOOM_MIN;
    let used = 0;

    // Fresh water bookkeeping for the phase swaps (D-164): this rebuild
    // places the current row, and the slots it records are the sprites a
    // later swap re-textures.
    this.waterSlots.length = 0;
    this.waterSlopes.length = 0;
    this.builtWaterRow = this.waterRow;

    // Painter's order for an isometric grid runs along the diagonals: every
    // tile with a smaller (x + y) is further away and has to go down first.
    for (let sum = bounds.minX + bounds.minY; sum <= bounds.maxX + bounds.maxY; sum++) {
      const xStart = Math.max(bounds.minX, sum - bounds.maxY);
      const xEnd = Math.min(bounds.maxX, sum - bounds.minY);

      for (let x = xStart; x <= xEnd; x++) {
        const y = sum - x;
        const index = map.tileIndex(x, y);
        const height = map.baseHeight(x, y);
        const world = tileToWorld(x, y, height);

        const terrain = map.terrain[index]!;
        const slope = map.slopeAt(x, y);
        if (terrain === Terrain.Water) {
          // Living water (D-164): a greyscale animation cell from the BASE
          // page at every zoom - the detail page has no water rows - tinted
          // with one of the two 16.3 tones. Recorded so a phase swap can
          // re-texture exactly these sprites.
          const water = this.take(used++);
          this.place(
            water,
            this.frameTexture(
              this.basePage!,
              `w${this.waterRow}:${slope}`,
              waterAtlasFrame(this.waterRow, slope),
            ),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Ground),
          );
          water.tint = isDeepWater(map, x, y) ? WATER_DEEP_TINT : WATER_SHALLOW_TINT;
          this.waterSlots.push(used - 1);
          this.waterSlopes.push(slope);
        } else {
          this.place(
            this.take(used++),
            this.frameTexture(page, `t${terrain}:${slope}`, atlas.terrainFrame(terrain, slope)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Ground),
          );
        }

        // A bridge deck is drawn at ITS height, not the ground's - that is the
        // whole point of it. A tunnel bore is drawn not at all: the hill above
        // it has already been drawn, and the track is inside the hill.
        const structure = map.structure[index]!;
        if (structure !== 0) {
          if (detailed && structure === BRIDGE_STRUCTURE) {
            const deckHeight = map.structureHeight[index]!;
            const deck = tileToWorld(x, y, deckHeight);
            this.place(
              this.take(used++),
              this.frameTexture(page, 'bridge', atlas.bridgeFrame()),
              deck.x,
              deck.y,
              // The deck is the ground of its own level, and its track sits on
              // it - both keyed at the DECK height, so a train on the bridge
              // (railHeight) draws above them and the valley below stays under.
              drawOrder(x, y, deckHeight, DrawLayer.Ground),
            );
            const bits = map.trackBits[index]!;
            for (let direction = 0; direction < 8; direction++) {
              if ((bits & (1 << direction)) === 0) continue;
              this.place(
                this.take(used++),
                this.frameTexture(page, `k${direction}`, atlas.trackFrame(direction)),
                deck.x,
                deck.y,
                drawOrder(x, y, deckHeight, DrawLayer.Track),
              );
            }
          }
          continue;
        }

        // A waypoint marker: the signal post, tinted for the mode it serves.
        // Drawn before the water gate below, because a buoy stands on water.
        if (detailed && map.waypoint[index] !== 0) {
          const marker = this.take(used++);
          this.place(
            marker,
            this.frameTexture(page, 'signal', atlas.signalFrame()),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Signal),
          );
          marker.tint = WAYPOINT_TINTS[map.waypoint[index]!] ?? 0xffffff;
        }

        if (!detailed) continue;
        if (terrain === Terrain.Water) {
          // Coastline foam (D-164): one static cell per land-facing edge, at
          // the road layer - a water tile carries neither roads nor rails,
          // so the slot is free, and foam must cover the ground's edge.
          const mask = coastEdgeMask(map, x, y);
          if (mask !== 0) {
            for (let edge = 0; edge < FOAM_EDGE_COUNT; edge++) {
              if ((mask & (1 << edge)) === 0) continue;
              const variant = foamVariant(edge, slope);
              this.place(
                this.take(used++),
                this.frameTexture(this.basePage!, `f${variant}`, foamAtlasFrame(variant)),
                world.x,
                world.y,
                drawOrder(x, y, height, DrawLayer.Road),
              );
            }
          }
          continue;
        }

        const roadBits = map.roadBits[index]!;
        if (roadBits !== 0) {
          this.place(
            this.take(used++),
            this.frameTexture(page, `r${roadBits}`, atlas.roadFrame(roadBits)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Road),
          );
        }

        // Track is composited from one half segment per connected direction.
        const trackBits = map.trackBits[index]!;
        if (trackBits !== 0) {
          for (let direction = 0; direction < 8; direction++) {
            if ((trackBits & (1 << direction)) === 0) continue;
            this.place(
              this.take(used++),
              this.frameTexture(page, `k${direction}`, atlas.trackFrame(direction)),
              world.x,
              world.y,
              drawOrder(x, y, height, DrawLayer.Track),
            );
          }
        }

        if (map.signal[index] !== 0) {
          this.place(
            this.take(used++),
            this.frameTexture(page, 'signal', atlas.signalFrame()),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Signal),
          );
        }

        const buildingKind = map.buildingKind[index]!;
        if (buildingKind !== 0) {
          const level = map.buildingLevel[index]!;
          this.place(
            this.take(used++),
            this.frameTexture(
              page,
              `b${buildingKind}:${level}`,
              atlas.buildingFrame(buildingKind, level),
            ),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Building),
          );
        }
      }
    }

    if (detailed) used = this.placeIndustries(map, bounds, used);
    used = this.placeStations(map, bounds, used);

    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  /**
   * Industry blocks sit on their origin tile. Their key is the FRONT corner
   * of the footprint, so the artwork is never cut by its own footprint's
   * ground - while a hill one diagonal nearer still covers it correctly.
   *
   * Marker-driven and therefore NEVER baked into a chunk: the marker list
   * moves on its own channel (founding, closure), not with the map revision,
   * and a baked copy would go stale against it.
   */
  private placeIndustries(
    map: TileMap,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    used: number,
  ): number {
    const page = this.activePage();
    const atlas = page.atlas;
    for (const industry of this.industries) {
      if (
        industry.x < bounds.minX ||
        industry.x > bounds.maxX ||
        industry.y < bounds.minY ||
        industry.y > bounds.maxY
      ) {
        continue;
      }
      const world = tileToWorld(industry.x, industry.y, map.baseHeight(industry.x, industry.y));
      const sprite = this.take(used++);
      const footprint = INDUSTRY_SPECS[industry.type]?.footprint ?? 1;
      // No tint. The industry is drawn in its own colours now - a tint
      // multiplies, and it flattened a coal heap and a chimney to the same
      // shade of whatever the tint was.
      this.place(
        sprite,
        this.frameTexture(page, `i${industry.type}`, atlas.industryFrame(industry.type)),
        world.x,
        world.y,
        drawOrder(
          industry.x + footprint - 1,
          industry.y + footprint - 1,
          map.baseHeight(industry.x, industry.y),
          DrawLayer.Building,
        ),
      );
    }
    return used;
  }

  /**
   * Station modules, keyed on their own tile at the station layer: above the
   * track a platform covers, below a vehicle standing on it.
   *
   * Live sprites at every zoom that shows them, never baked: they carry the
   * company tint, and a company recolour must not force a chunk rebake.
   */
  private placeStations(
    map: TileMap,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    used: number,
  ): number {
    const page = this.activePage();
    const atlas = page.atlas;
    for (const station of this.stations) {
      for (const module of station.modules) {
        if (
          module.x < bounds.minX ||
          module.x > bounds.maxX ||
          module.y < bounds.minY ||
          module.y > bounds.maxY
        ) {
          continue;
        }
        const world = tileToWorld(module.x, module.y, map.baseHeight(module.x, module.y));
        const sprite = this.take(used++);
        const key = MODULE_SPRITE_KEYS[module.kind] ?? 'station';
        this.place(
          sprite,
          this.frameTexture(page, key, moduleFrame(atlas, module.kind)),
          world.x,
          world.y,
          drawOrder(module.x, module.y, map.baseHeight(module.x, module.y), DrawLayer.Station),
        );
        sprite.tint = this.companyTint;
      }
    }
    return used;
  }

  /**
   * The live-sprite remainder of the chunk path: industries and station
   * modules at 0.5x, exactly as the detail path draws them - the boundary
   * zoom must not lose a marker to the bake. The 0.25x abstract mode shows
   * neither (SPEC.md 16.1: terrain, network, vehicle dots and nothing else).
   */
  private rebuildMarkers(
    map: TileMap,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    abstract: boolean,
  ): void {
    let used = 0;
    if (!abstract) {
      used = this.placeIndustries(map, bounds, used);
      used = this.placeStations(map, bounds, used);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  // ---------------------------------------------------------------- chunks

  /** Drop every baked chunk - a new world invalidates all of them at once. */
  private clearChunkCaches(): void {
    for (const entry of this.fullChunks.values()) this.freeFullTextures.push(entry.texture);
    for (const entry of this.terrainChunks.values()) this.freeTerrainTextures.push(entry.texture);
    this.fullChunks.clear();
    this.terrainChunks.clear();
    this.segmentCache.clear();
    this.chunkSeenRevision = -1;
    this.chunkSetHash = -1;
    this.visibleFullChunkCount = 0;
    this.netDirty = true;
  }

  /**
   * Keep the chunk layer in step with the camera and the map revision. Runs
   * only when the visible tile range, the zoom or the revision changed -
   * never per frame - and rebakes ONLY chunks whose checksum says their
   * static layers actually moved (E-04).
   */
  private maintainChunks(map: TileMap, abstract: boolean): void {
    const cache = abstract ? this.terrainChunks : this.fullChunks;
    const freelist = abstract ? this.freeTerrainTextures : this.freeFullTextures;
    const cap = abstract ? CHUNK_CACHE_MAX_TERRAIN : CHUNK_CACHE_MAX_FULL;
    const scale = abstract ? ABSTRACT_ZOOM_MAX : CHUNK_ZOOM_MAX;

    // A revision change re-checks every cached chunk in BOTH profiles (and
    // the polyline cache): the one currently hidden must not come back stale
    // when the player flips zoom.
    if (map.revision !== this.chunkSeenRevision) {
      this.chunkSeenRevision = map.revision;
      this.invalidateChunkCache(map, this.fullChunks, true, this.freeFullTextures);
      // A dropped terrain chunk means ground moved: the net Graphics bakes
      // projected HEIGHTS into its path, so lines over that ground are stale
      // even when no road or track bit changed.
      const droppedTerrain = this.invalidateChunkCache(
        map,
        this.terrainChunks,
        false,
        this.freeTerrainTextures,
      );
      const staleSegments = computeDirtySet(map, this.segmentCache, true, this.dirtyChunkScratch);
      for (let i = 0; i < staleSegments; i++) {
        this.segmentCache.delete(this.dirtyChunkScratch[i]!);
      }
      if (staleSegments > 0 || droppedTerrain > 0) this.netDirty = true;
    }

    const rect = this.viewRect();
    const visible = visibleChunks(
      rect.left,
      rect.top,
      rect.right,
      rect.bottom,
      map.size,
      this.visibleChunkScratch,
    );
    const per = chunksPerSide(map.size);
    const stamp = this.blink;
    let setHash = 0x811c9dc5 | 0;
    // The staggered water rebake of D-164 walks the full profile's visible
    // set on frames where this method does not run; the set only changes
    // when it does, so recording the count here keeps that walk current.
    if (!abstract) this.visibleFullChunkCount = visible;

    for (let i = 0; i < visible; i++) {
      const key = this.visibleChunkScratch[i]!;
      setHash = Math.imul(setHash ^ key, 0x01000193);
      const chunkX = key % per;
      const chunkY = (key / per) | 0;
      let entry = cache.get(key);
      if (entry === undefined) {
        entry = this.bakeChunk(map, chunkX, chunkY, abstract, freelist.pop(), scale);
        cache.set(key, entry);
      }
      entry.lastUsed = stamp;

      let sprite = this.chunkSprites[i];
      if (sprite === undefined) {
        sprite = new Sprite();
        this.chunkSprites.push(sprite);
        this.chunkLayer.addChild(sprite);
      }
      const aabb = chunkAabb(chunkX, chunkY);
      sprite.texture = entry.texture;
      sprite.visible = true;
      sprite.position.set(aabb.minX, aabb.minY);
      sprite.scale.set(1 / scale);
      // Painter's order between chunks. Pixel-exact although coarser than
      // the per-tile diagonals: content never leaves its tile's 64px-wide
      // cell column, and a pair that could draw in the wrong order - later
      // chunk, earlier diagonal - is always two or more columns apart, so
      // the two never touch the same pixel (the argument is in D-161).
      sprite.zIndex = chunkX + chunkY;
    }
    for (let i = visible; i < this.chunkSprites.length; i++) {
      this.chunkSprites[i]!.visible = false;
    }

    if (setHash !== this.chunkSetHash) {
      this.chunkSetHash = setHash;
      this.netDirty = true;
    }
    if (cache.size > cap) this.evictChunks(cache, freelist, cap, stamp);

    if (abstract && this.netDirty) {
      this.rebuildNet(map, visible, per, stamp);
      this.netDirty = false;
    }
  }

  /**
   * Recycle every cached chunk whose checksum no longer matches the map.
   * Returns how many were dropped.
   */
  private invalidateChunkCache(
    map: TileMap,
    cache: Map<number, ChunkEntry>,
    full: boolean,
    freelist: RenderTexture[],
  ): number {
    const stale = computeDirtySet(map, cache, full, this.dirtyChunkScratch);
    for (let i = 0; i < stale; i++) {
      const key = this.dirtyChunkScratch[i]!;
      freelist.push(cache.get(key)!.texture);
      cache.delete(key);
    }
    return stale;
  }

  /** Evict least-recently-used chunks beyond the cap; never the ones on screen. */
  private evictChunks(
    cache: Map<number, ChunkEntry>,
    freelist: RenderTexture[],
    cap: number,
    inUseStamp: number,
  ): void {
    while (cache.size > cap) {
      let oldestKey = -1;
      let oldestStamp = Infinity;
      for (const [key, entry] of cache) {
        if (entry.lastUsed === inUseStamp) continue;
        if (entry.lastUsed < oldestStamp) {
          oldestStamp = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey < 0) return; // everything left is on screen right now
      freelist.push(cache.get(oldestKey)!.texture);
      cache.delete(oldestKey);
    }
  }

  /**
   * Bake one chunk into a RenderTexture at the zoom it will be shown at, so
   * one texture pixel is one screen pixel and nothing is resampled.
   *
   * The sprite placement is the SAME per-tile logic as the detail path -
   * same atlas frames, same drawOrder keys sorted inside the bake root -
   * minus industries and station modules, which stay live sprites above the
   * chunks. The abstract profile bakes terrain only; roads and track appear
   * as polylines instead (SPEC.md 16.1).
   */
  private bakeChunk(
    map: TileMap,
    chunkX: number,
    chunkY: number,
    abstract: boolean,
    recycled: RenderTexture | undefined,
    scale: number,
  ): ChunkEntry {
    // Always the BASE page: chunks exist only at zooms the base page serves,
    // and pinning it here keeps a bake from ever depending on the live zoom.
    const page = this.basePage!;
    const atlas = page.atlas;
    const aabb = chunkAabb(chunkX, chunkY);
    const texture =
      recycled ??
      RenderTexture.create({
        width: Math.round((aabb.maxX - aabb.minX) * scale),
        height: Math.round((aabb.maxY - aabb.minY) * scale),
      });

    this.bakeRoot.scale.set(scale);
    this.bakeRoot.position.set(-aabb.minX * scale, -aabb.minY * scale);

    const size = map.size;
    const x0 = chunkX * CHUNK_TILES;
    const y0 = chunkY * CHUNK_TILES;
    const xMax = Math.min(x0 + CHUNK_TILES - 1, size - 1);
    const yMax = Math.min(y0 + CHUNK_TILES - 1, size - 1);
    let used = 0;

    // Living water in a bake (D-164): the full profile bakes THIS frame's
    // animation row and is rebaked by the staggered swap in animateWater;
    // the abstract profile pins row 0 - it never animates, so every 0.25x
    // chunk must agree on one row or the ocean would freeze as patchwork.
    const waterRow = abstract ? 0 : this.waterRow;
    let hasWater = false;

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
          hasWater = true;
          const water = this.bakeTake(used++);
          this.place(
            water,
            this.frameTexture(page, `w${waterRow}:${slope}`, waterAtlasFrame(waterRow, slope)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Ground),
          );
          water.tint = isDeepWater(map, x, y) ? WATER_DEEP_TINT : WATER_SHALLOW_TINT;
        } else {
          this.place(
            this.bakeTake(used++),
            this.frameTexture(page, `t${terrain}:${slope}`, atlas.terrainFrame(terrain, slope)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Ground),
          );
        }

        if (abstract) continue;

        const structure = map.structure[index]!;
        if (structure !== 0) {
          if (structure === BRIDGE_STRUCTURE) {
            const deckHeight = map.structureHeight[index]!;
            const deck = tileToWorld(x, y, deckHeight);
            this.place(
              this.bakeTake(used++),
              this.frameTexture(page, 'bridge', atlas.bridgeFrame()),
              deck.x,
              deck.y,
              drawOrder(x, y, deckHeight, DrawLayer.Ground),
            );
            const bits = map.trackBits[index]!;
            for (let direction = 0; direction < 8; direction++) {
              if ((bits & (1 << direction)) === 0) continue;
              this.place(
                this.bakeTake(used++),
                this.frameTexture(page, `k${direction}`, atlas.trackFrame(direction)),
                deck.x,
                deck.y,
                drawOrder(x, y, deckHeight, DrawLayer.Track),
              );
            }
          }
          continue;
        }

        if (map.waypoint[index] !== 0) {
          const marker = this.bakeTake(used++);
          this.place(
            marker,
            this.frameTexture(page, 'signal', atlas.signalFrame()),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Signal),
          );
          marker.tint = WAYPOINT_TINTS[map.waypoint[index]!] ?? 0xffffff;
        }

        if (terrain === Terrain.Water) {
          // Coastline foam, exactly as the detail path places it - static
          // across the animation rows, so a foam edge never flickers.
          const mask = coastEdgeMask(map, x, y);
          if (mask !== 0) {
            for (let edge = 0; edge < FOAM_EDGE_COUNT; edge++) {
              if ((mask & (1 << edge)) === 0) continue;
              const variant = foamVariant(edge, slope);
              this.place(
                this.bakeTake(used++),
                this.frameTexture(page, `f${variant}`, foamAtlasFrame(variant)),
                world.x,
                world.y,
                drawOrder(x, y, height, DrawLayer.Road),
              );
            }
          }
          continue;
        }

        const roadBits = map.roadBits[index]!;
        if (roadBits !== 0) {
          this.place(
            this.bakeTake(used++),
            this.frameTexture(page, `r${roadBits}`, atlas.roadFrame(roadBits)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Road),
          );
        }

        const trackBits = map.trackBits[index]!;
        if (trackBits !== 0) {
          for (let direction = 0; direction < 8; direction++) {
            if ((trackBits & (1 << direction)) === 0) continue;
            this.place(
              this.bakeTake(used++),
              this.frameTexture(page, `k${direction}`, atlas.trackFrame(direction)),
              world.x,
              world.y,
              drawOrder(x, y, height, DrawLayer.Track),
            );
          }
        }

        if (map.signal[index] !== 0) {
          this.place(
            this.bakeTake(used++),
            this.frameTexture(page, 'signal', atlas.signalFrame()),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Signal),
          );
        }

        const buildingKind = map.buildingKind[index]!;
        if (buildingKind !== 0) {
          const level = map.buildingLevel[index]!;
          this.place(
            this.bakeTake(used++),
            this.frameTexture(
              page,
              `b${buildingKind}:${level}`,
              atlas.buildingFrame(buildingKind, level),
            ),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Building),
          );
        }
      }
    }

    for (let i = used; i < this.bakePool.length; i++) this.bakePool[i]!.visible = false;
    this.app.renderer.render({ container: this.bakeRoot, target: texture, clear: true });

    return {
      texture,
      chunkX,
      chunkY,
      checksum: chunkChecksum(map, chunkX, chunkY, !abstract),
      lastUsed: 0,
      hasWater,
      waterRow,
    };
  }

  /** The bake root's own sprite pool, mirroring {@link take}. */
  private bakeTake(index: number): Sprite {
    let sprite = this.bakePool[index];
    if (sprite === undefined) {
      sprite = new Sprite();
      this.bakePool.push(sprite);
      this.bakeRoot.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }

  /**
   * Redraw the abstract network from the per-chunk polyline caches. World
   * coordinates, so panning inside an unchanged chunk set costs nothing;
   * rebuilt only when the set or the map moved.
   */
  private rebuildNet(map: TileMap, visible: number, per: number, stamp: number): void {
    this.net.clear();

    // Two passes, one stroke each: roads below, rails above.
    for (const kind of [NetKind.Road, NetKind.Rail]) {
      for (let i = 0; i < visible; i++) {
        const key = this.visibleChunkScratch[i]!;
        let entry = this.segmentCache.get(key);
        if (entry === undefined) {
          const chunkX = key % per;
          const chunkY = (key / per) | 0;
          const x0 = chunkX * CHUNK_TILES;
          const y0 = chunkY * CHUNK_TILES;
          entry = {
            checksum: chunkChecksum(map, chunkX, chunkY, true),
            segments: extractNetworkSegments(
              map,
              x0,
              y0,
              x0 + CHUNK_TILES - 1,
              y0 + CHUNK_TILES - 1,
            ),
            lastUsed: stamp,
          };
          this.segmentCache.set(key, entry);
        }
        entry.lastUsed = stamp;

        for (const segment of entry.segments) {
          if (segment.kind !== kind) continue;
          // A rail rides its bridge deck; a road stays on the ground.
          const height =
            kind === NetKind.Rail
              ? map.railHeight(segment.tileX, segment.tileY)
              : map.baseHeight(segment.tileX, segment.tileY);
          const lift = height * HEIGHT_PX;
          this.net.moveTo(
            (segment.ax - segment.ay) * (TILE_W / 2),
            (segment.ax + segment.ay) * (TILE_H / 2) - lift,
          );
          this.net.lineTo(
            (segment.bx - segment.by) * (TILE_W / 2),
            (segment.bx + segment.by) * (TILE_H / 2) - lift,
          );
        }
      }
      this.net.stroke({
        width: (kind === NetKind.Rail ? NET_RAIL_WIDTH_PX : NET_ROAD_WIDTH_PX) / this.zoom,
        color: kind === NetKind.Rail ? NET_RAIL_COLOR : NET_ROAD_COLOR,
        cap: 'round',
        join: 'round',
      });
    }

    // The polyline cache is CPU-cheap but unbounded panning would still grow
    // it without limit; drop the least recently seen entries past the cap.
    if (this.segmentCache.size > SEGMENT_CACHE_MAX) {
      for (const [key, entry] of this.segmentCache) {
        if (this.segmentCache.size <= SEGMENT_CACHE_MAX) break;
        if (entry.lastUsed === stamp) continue;
        this.segmentCache.delete(key);
      }
    }
  }

  /**
   * Vehicles are redrawn every frame, not with the tiles: they move between
   * simulation ticks, and since M12 the renderer lerps each one from its
   * PREVIOUS published position towards its current one by the frame's
   * wall-clock alpha (E-05, D-162) - true 60 Hz motion over the 20 Hz sim,
   * reading the interpolator's reader-side copies, never the live buffer.
   * A vehicle without a previous row (fresh spawn), one that jumped a
   * teleport distance or one whose state change makes a glide wrong snaps
   * to its current position instead.
   *
   * In the abstract mode (0.25x, SPEC.md 16.1) each vehicle is a dot in its
   * company's colour instead of a sprite - the same positions feed the same
   * hit-test arrays, so clicking a dot still selects the vehicle.
   */
  /**
   * Push one breadcrumb per multi-unit train from the generation that just
   * became the previous one (SPEC2 M13, E-05). Runs once per published
   * tick, walks only the compacted block, allocates nothing; the ring
   * itself drops sub-spacing samples and resets on the D-162 teleport
   * distance, so a standing train records nothing and a relocated one
   * snaps whole.
   */
  private recordConsistBreadcrumbs(map: TileMap): void {
    const interp = this.interpolator;
    const prev = interp.prevData;
    const count = interp.prevCount;
    const size = map.size;
    for (let row = 0; row < count; row++) {
      const base = row * SNAPSHOT_VEHICLE_STRIDE;
      const entry = this.consists.get(prev[base + SnapshotVehicle.VehicleId]!);
      if (entry === undefined) continue;
      const tile = prev[base + SnapshotVehicle.Tile]!;
      const next = prev[base + SnapshotVehicle.NextTile]!;
      const progress = prev[base + SnapshotVehicle.ProgressMilli]! / 1000;
      const fromX = tile % size;
      const fromY = (tile / size) | 0;
      const toX = next % size;
      const toY = (next / size) | 0;
      if (!map.contains(fromX, fromY) || !map.contains(toX, toY)) continue;
      const fromHeight = map.railHeight(fromX, fromY);
      const toHeight = map.railHeight(toX, toY);
      entry.ring.record(
        fromX + (toX - fromX) * progress,
        fromY + (toY - fromY) * progress,
        fromHeight + (toHeight - fromHeight) * progress,
      );
    }
  }

  private drawVehicles(map: TileMap, abstract: boolean): void {
    const interp = this.interpolator;
    if (this.basePage === null || !interp.hasFrame) return;
    const page = this.activePage();

    const data = interp.data;
    const count = interp.count;
    const prev = interp.prevData;
    const alpha = this.frameAlpha;
    const size = map.size;
    this.drawnVehicles = 0;

    // The baked art of the current zoom (M13), resolved once per frame -
    // null in every build without a bake, and then per VEHICLE the variant
    // lookup answers null again for any unmapped catalogue id (E-14's
    // per-entry fallback: aircraft, ids the markers have not named yet).
    const bakedIndex = abstract ? null : this.bakedIndexForZoom();
    const bakedInvScale = bakedIndex === null ? 1 : 1 / bakedIndex.zoom;

    if (abstract && !this.vehicleSpritesHidden) {
      for (const sprite of this.vehicleSprites) sprite.visible = false;
      for (const sprite of this.vehicleMaskSprites) sprite.visible = false;
      for (const sprite of this.vehicleShadowSprites) sprite.visible = false;
      this.vehicleSpritesHidden = true;
    }
    if (!abstract) this.vehicleSpritesHidden = false;

    // Sprite triples are taken from the pool by a running cursor rather
    // than by snapshot row, because since M13 one RAIL row draws its whole
    // consist - a ten-wagon coal train is eleven triples (SPEC2 M13, E-05).
    let spriteSlot = 0;

    for (let i = 0; i < count; i++) {
      const base = i * SNAPSHOT_VEHICLE_STRIDE;
      const tile = data[base + SnapshotVehicle.Tile]!;
      const next = data[base + SnapshotVehicle.NextTile]!;
      const progress = data[base + SnapshotVehicle.ProgressMilli]! / 1000;
      const state = data[base + SnapshotVehicle.State]!;
      const kind = data[base + SnapshotVehicle.Kind]!;
      const vehicleId = data[base + SnapshotVehicle.VehicleId]!;
      const owner = data[base + SnapshotVehicle.Owner]!;

      const fromX = tile % size;
      const fromY = (tile / size) | 0;
      const toX = next % size;
      const toY = (next / size) | 0;
      if (!map.contains(fromX, fromY) || !map.contains(toX, toY)) continue;

      // railHeight, so a train on a bridge rides the deck instead of the river.
      const fromHeight = map.railHeight(fromX, fromY);
      const toHeight = map.railHeight(toX, toY);

      // The CURRENT generation's sample - allocation-free, the same 16.1
      // projection tileToWorld computes. The fractional tile position is
      // carried alongside the world pixels because the consist walk (M13)
      // runs in tile space, where arc length means metres.
      const currFx = fromX + (toX - fromX) * progress;
      const currFy = fromY + (toY - fromY) * progress;
      const currFh = fromHeight + (toHeight - fromHeight) * progress;
      const currX = sampleWorldX(fromX, fromY, toX, toY, progress);
      const currY = sampleWorldY(fromX, fromY, fromHeight, toX, toY, toHeight, progress);

      // E-05: glide from the PREVIOUS generation's sample towards the
      // current one. The pairing runs by vehicle id because the block is
      // compacted; a fresh spawn, a teleport or a snap-state change draws
      // at the current position outright.
      let worldX = currX;
      let worldY = currY;
      let headFx = currFx;
      let headFy = currFy;
      let headFh = currFh;
      // Facing from the INTERPOLATED movement vector between the two
      // generation samples (M13): the direction the sprite actually glides,
      // so a corner blends through the diagonal facing instead of snapping
      // a quarter turn at the tile edge. -1 until the glide branch below
      // measures it; the sprite path then falls back to the cached facing
      // and last of all to the (NextTile - Tile) delta.
      let facing = -1;
      if (alpha < 1) {
        const prevRow = interp.prevRowOf(vehicleId);
        if (prevRow >= 0) {
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
            const prevFromHeight = map.railHeight(prevFromX, prevFromY);
            const prevToHeight = map.railHeight(prevToX, prevToY);
            const prevX = sampleWorldX(prevFromX, prevFromY, prevToX, prevToY, prevProgress);
            const prevY = sampleWorldY(
              prevFromX,
              prevFromY,
              prevFromHeight,
              prevToX,
              prevToY,
              prevToHeight,
              prevProgress,
            );
            worldX = prevX + (currX - prevX) * alpha;
            worldY = prevY + (currY - prevY) * alpha;
            headFx = prevFx + (currFx - prevFx) * alpha;
            headFy = prevFy + (currFy - prevFy) * alpha;
            const prevFh = prevFromHeight + (prevToHeight - prevFromHeight) * prevProgress;
            headFh = prevFh + (currFh - prevFh) * alpha;
            facing = facingFromMovement(prevFx, prevFy, currFx, currFy);
          }
        }
      }

      if (!abstract) {
        // Facing: the measured glide direction first; a standing or settled
        // vehicle keeps the facing it last drove with; a vehicle never seen
        // moving reads its current tile step, east as the birth default.
        if (facing < 0) {
          const cached =
            vehicleId >= 0 && vehicleId < MAX_VEHICLES
              ? this.vehicleFacings[vehicleId]!
              : FACING_NONE;
          if (cached !== FACING_NONE) {
            facing = cached;
          } else {
            facing = facingFromDelta(toX - fromX, toY - fromY);
            if (facing < 0) facing = 0;
          }
        }
        if (vehicleId >= 0 && vehicleId < MAX_VEHICLES) this.vehicleFacings[vehicleId] = facing;

        // Every company's own colour, so a competitor's train is recognisable
        // as one at a glance rather than only in a list.
        const ownerTint =
          owner === 0 ? this.companyTint : (COMPANY_TINTS[owner] ?? this.companyTint);
        const zIndex = vehicleDrawOrder(fromX, fromY, fromHeight, toX, toY, toHeight, progress);
        const specId =
          vehicleId >= 0 && vehicleId < MAX_VEHICLES ? this.vehicleSpecIds[vehicleId]! : -1;

        // The lead unit, exactly where the single sprite always drew.
        spriteSlot = this.placeVehicleUnit(
          spriteSlot,
          specId,
          vehicleId,
          facing,
          worldX,
          worldY,
          zIndex,
          ownerTint,
          kind,
          page,
          bakedIndex,
          bakedInvScale,
        );

        // The trailing units of a multi-unit train (SPEC2 M13, E-05): each
        // placed by arc length along the breadcrumb ring, each facing along
        // its OWN stretch of path, each with its own draw-order key so a
        // hill occludes the tail before the head. Road, water and air never
        // have an entry here - they stay single-sprite by construction.
        const consist = kind === TRAIN_KIND ? this.consists.get(vehicleId) : undefined;
        if (consist !== undefined && consist.followers > 0) {
          const fallbackDelta = VEHICLE_FACING_DELTAS[facing]!;
          placeConsist(
            consist.ring,
            headFx,
            headFy,
            headFh,
            fallbackDelta[0],
            fallbackDelta[1],
            consist.distances,
            consist.followers,
            this.consistScratch,
          );
          for (let unit = 0; unit < consist.followers; unit++) {
            const placed = this.consistScratch[unit]!;
            // Wagons inherit the facing of their local breadcrumb segment;
            // a degenerate direction (never possible past an empty ring,
            // but total anyway) falls back to the lead's.
            let wagonFacing = facingFromDelta(placed.dirX, placed.dirY);
            if (wagonFacing < 0) wagonFacing = facing;
            const wagonX = (placed.fx - placed.fy) * (TILE_W / 2);
            const wagonY = (placed.fx + placed.fy) * (TILE_H / 2) - placed.h * HEIGHT_PX;
            // Rounding IS the handover rule of vehicleDrawOrder: the tile a
            // unit mostly covers wins its draw-order key.
            const wagonZ = drawOrder(
              Math.round(placed.fx),
              Math.round(placed.fy),
              Math.round(placed.h),
              DrawLayer.Vehicle,
            );
            spriteSlot = this.placeVehicleUnit(
              spriteSlot,
              consist.specIds[unit + 1]!,
              vehicleId + unit + 1,
              wagonFacing,
              wagonX,
              wagonY,
              wagonZ,
              ownerTint,
              kind,
              page,
              bakedIndex,
              bakedInvScale,
            );
          }
        }
      }

      this.vehicleIds[this.drawnVehicles] = vehicleId;
      this.vehicleOwners[this.drawnVehicles] = owner;
      const screen = this.vehicleScreen[this.drawnVehicles] ?? { x: 0, y: 0 };
      screen.x = worldX;
      screen.y = worldY;
      this.vehicleScreen[this.drawnVehicles] = screen;
      this.drawnVehicles++;
    }

    if (abstract) {
      this.drawVehicleDots();
    } else {
      for (let i = spriteSlot; i < this.vehicleSprites.length; i++) {
        this.vehicleSprites[i]!.visible = false;
        this.vehicleMaskSprites[i]!.visible = false;
        this.vehicleShadowSprites[i]!.visible = false;
      }
    }
  }

  /**
   * Draw ONE unit - a whole road vehicle, ship or aircraft, or one unit of
   * a rail consist - as its sprite triple (shadow, body, mask) at pool slot
   * `slot`, returning the next free slot. Extracted verbatim from the M12
   * single-sprite path so a wagon is placed by exactly the code that places
   * its locomotive: baked cell with the two-pass tint (D-160) when the
   * catalogue id has one, the M10 white box otherwise (E-14's per-entry
   * fallback - a build without a bake still draws ten visible wagons).
   */
  private placeVehicleUnit(
    slot: number,
    specId: number,
    variantSeed: number,
    facing: number,
    worldX: number,
    worldY: number,
    zIndex: number,
    ownerTint: number,
    kind: number,
    page: AtlasPage,
    bakedIndex: VehicleZoomIndex | null,
    bakedInvScale: number,
  ): number {
    let sprite = this.vehicleSprites[slot];
    let maskSprite = this.vehicleMaskSprites[slot];
    let shadowSprite = this.vehicleShadowSprites[slot];
    if (sprite === undefined || maskSprite === undefined || shadowSprite === undefined) {
      // Into the SAME sorted container as the tiles: the drawOrder key is
      // what lets a hill in front of a train draw over it (section 16.1).
      // Per slot the insertion order is shadow, body, mask - the three
      // share one zIndex and Pixi's stable sort keeps the ellipse under
      // the body and the company colour over it.
      shadowSprite = new Sprite();
      this.vehicleShadowSprites.push(shadowSprite);
      this.tiles.addChild(shadowSprite);
      sprite = new Sprite();
      this.vehicleSprites.push(sprite);
      this.tiles.addChild(sprite);
      maskSprite = new Sprite();
      this.vehicleMaskSprites.push(maskSprite);
      this.tiles.addChild(maskSprite);
    }

    // A sprite is reused for whatever unit lands in its slot, so the
    // texture is set every frame rather than once at creation - and the
    // scale with it, because a zoom flip swaps the atlas page under the
    // same sprite. All setters are change-detected by Pixi.
    const variant = vehicleVariantFor(bakedIndex, specId, variantSeed);
    const baked =
      variant === null ? null : this.bakedVehicleHandle(variant.cells[facing]!, bakedInvScale);
    let shadowW: number;
    if (baked !== null) {
      // The Kenney cell (M13): untinted body plus the company-colour
      // mask on top - the two-pass tint of D-160. Placed by the cell's
      // OWN ground pivot; baked cells are tight per-facing rectangles.
      sprite.texture = baked.base;
      sprite.scale.set(baked.invScale);
      sprite.tint = 0xffffff;
      sprite.position.set(worldX - baked.anchorXPx, worldY - baked.anchorYPx);
      maskSprite.texture = baked.mask;
      maskSprite.scale.set(baked.invScale);
      maskSprite.tint = ownerTint;
      maskSprite.position.set(worldX - baked.anchorXPx, worldY - baked.anchorYPx);
      maskSprite.zIndex = zIndex;
      maskSprite.visible = true;
      shadowW = baked.widthPx * VEHICLE_SHADOW_WIDTH_SHARE;
    } else {
      // The M10 white box retires from the live path but stays the
      // fallback (E-14): an unmapped id (aircraft stay procedural), an
      // id the markers have not named yet, every build without a bake.
      const atlas = page.atlas;
      const handle =
        kind === TRAIN_KIND
          ? this.frameTexture(page, 'train', atlas.trainFrame())
          : this.frameTexture(page, 'vehicle', atlas.vehicleFrame());
      sprite.texture = handle.texture;
      sprite.scale.set(handle.invScale);
      sprite.tint = ownerTint;
      // The fixed one-step offset assumes the vehicle cell's world
      // geometry; the detail page's tall cells are world-identical to
      // the base page's by construction (tests/unit/terrainAtlas.spec.ts).
      sprite.position.set(worldX - TILE_W / 2, worldY - HEIGHT_PX);
      maskSprite.visible = false;
      shadowW = kind === TRAIN_KIND ? FALLBACK_SHADOW_TRAIN_PX : FALLBACK_SHADOW_ROAD_PX;
    }
    sprite.visible = true;
    sprite.zIndex = zIndex;

    // The soft ellipse under the unit (M13), at the ground point the
    // sprite is anchored to.
    if (this.shadowTexture !== null) {
      shadowSprite.texture = this.shadowTexture;
      shadowSprite.width = shadowW;
      shadowSprite.height = shadowW * VEHICLE_SHADOW_RATIO;
      shadowSprite.alpha = VEHICLE_SHADOW_ALPHA;
      shadowSprite.tint = 0x000000;
      shadowSprite.position.set(
        worldX - shadowW / 2,
        worldY - (shadowW * VEHICLE_SHADOW_RATIO) / 2,
      );
      shadowSprite.zIndex = zIndex;
      shadowSprite.visible = true;
    } else {
      shadowSprite.visible = false;
    }
    return slot + 1;
  }

  /**
   * The vehicle dots of the abstract mode, from the positions the main loop
   * just wrote. One fill per company rather than one per vehicle, so a full
   * snapshot block is eight batched fills, not 1,500.
   */
  private drawVehicleDots(): void {
    this.dots.clear();
    const half = VEHICLE_DOT_PX / this.zoom / 2;

    for (let pass = 0; pass < COMPANY_TINTS.length; pass++) {
      let any = false;
      for (let i = 0; i < this.drawnVehicles; i++) {
        const owner = this.vehicleOwners[i]!;
        // Owners outside the palette fall into pass 0, like the sprite path's
        // fallback tint.
        const slot = owner > 0 && owner < COMPANY_TINTS.length ? owner : 0;
        if (slot !== pass) continue;
        const screen = this.vehicleScreen[i]!;
        this.dots.rect(screen.x - half, screen.y - HEIGHT_PX / 2 - half, half * 2, half * 2);
        any = true;
      }
      if (any) {
        this.dots.fill({
          color: pass === 0 ? this.companyTint : (COMPANY_TINTS[pass] ?? this.companyTint),
        });
      }
    }
  }

  /**
   * The vehicle under the pointer, or null.
   *
   * Nearest within a small radius rather than an exact sprite test: a lorry is
   * about ten pixels across at full zoom and two at the far end, and a click
   * that has to land inside two pixels is a click nobody lands.
   */
  private vehicleAtClient(event: PointerEvent): number | null {
    const world = this.world.toLocal({ x: event.offsetX, y: event.offsetY });
    const reach = VEHICLE_PICK_PX / this.zoom;

    let best: number | null = null;
    let bestDistance = reach * reach;
    for (let i = 0; i < this.drawnVehicles; i++) {
      const screen = this.vehicleScreen[i]!;
      const dx = screen.x - world.x;
      const dy = screen.y - world.y;
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) continue;
      bestDistance = distance;
      best = this.vehicleIds[i] ?? null;
    }
    return best;
  }

  /**
   * What the audio engine needs: the nearest vehicles to the middle of the
   * screen, with how fast each is going and where it sits left to right.
   *
   * Read out of the same arrays the sprites were placed from, so a sound is
   * exactly where its vehicle is. Speed comes from how far the vehicle moved
   * between two frames, which is the only speed the renderer knows and is
   * enough to tell an idling engine from a working one.
   */
  vehicleAudioInputs(out: VehicleAudioInput[]): number {
    // `attach` is asynchronous and the caller polls on a timer, so the first
    // few calls can arrive before Pixi has a screen to measure - and before
    // any vehicle has been drawn there is nothing to say anyway.
    if (!this.interpolator.hasFrame || this.map === null || this.drawnVehicles === 0) return 0;
    const screenSize = this.app.screen;
    if (screenSize === undefined) return 0;
    // The interpolator's copy rather than the live buffer: it is the block
    // the drawn rows and `vehicleIds` were built from this frame, so a sound
    // stays attached to the vehicle its row describes.
    const data = this.interpolator.data;

    const halfWidth = screenSize.width / 2;
    const halfHeight = screenSize.height / 2;
    let written = 0;

    for (let i = 0; i < this.drawnVehicles; i++) {
      const screen = this.vehicleScreen[i]!;
      const dx = (screen.x - this.centreX) * this.zoom;
      const dy = (screen.y - this.centreY) * this.zoom;

      const base = i * SNAPSHOT_VEHICLE_STRIDE;
      const state = data[base + SnapshotVehicle.State]!;
      const progress = data[base + SnapshotVehicle.ProgressMilli]!;
      const moving = data[base + SnapshotVehicle.Tile] !== data[base + SnapshotVehicle.NextTile];

      const entry = out[written] ?? {
        id: 0,
        power: 0,
        panX: 0,
        throttle: 0,
        distance: 0,
      };
      entry.id = this.vehicleIds[i] ?? 0;
      entry.power = this.powerOf(data[base + SnapshotVehicle.Kind]!);
      entry.panX = Math.max(-1, Math.min(1, dx / Math.max(1, halfWidth)));
      entry.throttle = moving ? 0.35 + (progress % 1000) / 4000 : 0;
      entry.distance = Math.min(
        1,
        Math.sqrt(dx * dx + dy * dy) / Math.max(1, Math.hypot(halfWidth, halfHeight)),
      );
      out[written] = entry;
      written++;
      if (state < 0) break;
    }
    return written;
  }

  /**
   * What a vehicle burns, guessed from what it is.
   *
   * The snapshot carries the kind, not the power source: a locomotive's fuel
   * is a catalogue fact that never changes, and sending it every tick to save
   * one lookup would be the wrong trade. Trains are the only thing in the game
   * that can be electric, so this is the whole of the guess.
   */
  private powerOf(kind: number): number {
    return kind === TRAIN_KIND ? 0 : 1;
  }

  /** Mark a vehicle as selected, or clear it. Driven by the store. */
  setSelectedVehicle(vehicleId: number | null): void {
    this.selectedVehicleId = vehicleId;
  }

  /** Route the build preview is currently showing, drawn on the overlay. */
  setPreviewRoute(tiles: readonly number[] | null): void {
    this.previewRoute = tiles;
  }

  /** Cursor highlight, selection marker, build preview and the F3 overlay. */
  private drawOverlay(map: TileMap): void {
    this.overlay.clear();
    this.blink++;
    if (this.blockOverlay) this.drawBlocks(map);

    // A ring round the selected vehicle. It follows the sprite rather than a
    // tile, because a vehicle is between two tiles most of the time and a
    // marker that snapped to one would sit behind what it is marking.
    if (this.selectedVehicleId !== null) {
      for (let i = 0; i < this.drawnVehicles; i++) {
        if (this.vehicleIds[i] !== this.selectedVehicleId) continue;
        const screen = this.vehicleScreen[i]!;
        this.overlay.circle(screen.x, screen.y - HEIGHT_PX / 2, 10 / this.zoom + 4);
        this.overlay.stroke({ width: 2 / this.zoom, color: 0xe6e9ee, alpha: 0.95 });
        break;
      }
    }

    const preview = this.previewRoute;
    if (preview !== null && preview.length > 1) {
      const size = map.size;
      for (let i = 0; i < preview.length; i++) {
        const tile = preview[i]!;
        const x = tile % size;
        const y = (tile / size) | 0;
        const centre = tileToWorld(x, y, map.baseHeight(x, y));
        if (i === 0) this.overlay.moveTo(centre.x, centre.y + TILE_H / 2);
        else this.overlay.lineTo(centre.x, centre.y + TILE_H / 2);
      }
      this.overlay.stroke({ width: 4 / this.zoom, color: 0x4caf7d, alpha: 0.9 });
    }
    for (const [tile, colour, alpha] of [
      [this.hovered, 0xf08020, 0.85],
      [this.selected, 0xe6e9ee, 1],
    ] as const) {
      if (tile === null) continue;
      const height = map.baseHeight(tile.x, tile.y);
      const centre = tileToWorld(tile.x, tile.y, height);
      this.overlay
        .moveTo(centre.x, centre.y)
        .lineTo(centre.x + TILE_W / 2, centre.y + TILE_H / 2)
        .lineTo(centre.x, centre.y + TILE_H)
        .lineTo(centre.x - TILE_W / 2, centre.y + TILE_H / 2)
        .lineTo(centre.x, centre.y)
        .stroke({ width: 2 / this.zoom, color: colour, alpha });
    }
  }

  /**
   * The block overlay of section 9.3, which ships in the release build because
   * it is the only way anybody learns what a signal actually does.
   *
   * Three things, drawn only for the tiles on screen: which block a piece of
   * track belongs to, whether a train holds it, and - blinking yellow - any
   * train that has been standing at a red long enough to count as stuck.
   *
   * The block index is rebuilt on the main thread from the shared map buffer.
   * It is derived state, so this is the same computation the simulation does
   * and not a second copy of the truth.
   */
  private drawBlocks(map: TileMap): void {
    this.blocks.refresh(map);
    const bounds = this.visibleTileBounds(map.size);
    const width = 1.5 / this.zoom;

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue;
        const tile = y * map.size + x;
        if (map.trackBits[tile] === 0) continue;

        const block = this.blocks.blockAt(tile);
        if (block < 0) continue;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.stroke({
          width,
          color: BLOCK_COLOURS[block % BLOCK_COLOURS.length]!,
          alpha: 0.5,
        });
      }
    }

    // Claimed track on top, in the holder's own colour and filled, so a claim
    // reads as "occupied" rather than as another block boundary.
    const reserved = this.reservedSource?.() ?? null;
    if (reserved !== null) {
      for (let i = 0; i < reserved.count; i++) {
        const base = i * SNAPSHOT_RESERVED_STRIDE;
        const tile = reserved.data[base + SnapshotReserved.Tile]!;
        const x = tile % map.size;
        const y = (tile / map.size) | 0;
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;

        const owner = reserved.data[base + SnapshotReserved.VehicleId]!;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.fill({ color: BLOCK_COLOURS[owner % BLOCK_COLOURS.length]!, alpha: 0.35 });
      }
    }

    // And the deadlock markers, blinking so they cannot be missed. No auto-fix:
    // a deadlock is a player mistake and has to stay visible (section 9.3).
    if ((this.blink >> 4) % 2 === 0) {
      for (const tile of this.deadlockTiles) {
        const x = tile % map.size;
        const y = (tile / map.size) | 0;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.stroke({ width: 4 / this.zoom, color: 0xffd24a, alpha: 1 });
      }
    }
  }

  /** Trace the diamond of one tile onto the overlay. */
  private diamond(x: number, y: number): void {
    this.overlay
      .moveTo(x, y)
      .lineTo(x + TILE_W / 2, y + TILE_H / 2)
      .lineTo(x, y + TILE_H)
      .lineTo(x - TILE_W / 2, y + TILE_H / 2)
      .lineTo(x, y);
  }

  /** Town labels for the minimap and the town list. */
  get townMarkers(): readonly TownMarker[] {
    return this.towns;
  }
}
