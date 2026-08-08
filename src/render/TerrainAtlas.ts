import { INDUSTRY_TYPE_COUNT } from '../sim/industry/types';
import { SIGNAL_KIND_COUNT, SignalKind } from '../sim/map/signals';
import { SlopeBit, SLOPE_COUNT, Terrain, TERRAIN_COUNT } from '../sim/map/terrain';
import { EMISSIVE_WINDOW_HEX } from './emissive';
import { drawIndustry, drawIndustryEmissive, INDUSTRY_EMISSIVE_TYPES } from './industryArt';
import {
  roofSnowFor,
  SEASON_JOB_BUILDINGS,
  SeasonStage,
  snowedRoof,
  terrainLook,
} from './seasonArt';
import { box, catenaryMast, gableRoof, sawtoothRoof, shade, windows, type IsoView } from './shapes';
import { SIGNAL_ASPECT_COUNT, SIGNAL_ASPECT_TINTS, SignalAspect } from './signalAspects';
import { FOAM_VARIANT_COUNT, WATER_FRAME_COUNT } from './water';

/**
 * Procedurally generated tile artwork.
 *
 * Section 16.2 asks for sprites that are generated rather than drawn, so no
 * binary art enters the repository. It proposes a build-time bake into PNG
 * atlases; this builds the same artwork at startup into one canvas instead.
 * Same procedural source, but no PNG encoder, no atlas manifest and no build
 * step to keep in sync - and the whole set costs tens of milliseconds
 * (measured and guarded against ATLAS_BUILD_BUDGET_MS at startup).
 * If load time ever matters the identical function can move to build time.
 *
 * TWO pages, per 16.2's per-zoom atlases: the base page is drawn at twice the
 * zoom-1 size and serves every zoom up to 2x as a downscale; the detail page
 * is the same artwork drawn at four times zoom 1, so the top zoom level is a
 * native rendering rather than a nearest-neighbour upscale. Which page a zoom
 * reads is `atlasPageForZoom` - a pure function, tested as one.
 */

/** Atlas resolution of the base page relative to zoom 1. */
export const ATLAS_SCALE = 2;

/**
 * Atlas resolution of the 4x detail page relative to zoom 1.
 *
 * Equal to the top ZOOM_LEVELS step, so at zoom 4 one atlas pixel is one
 * screen pixel and nothing is resampled - the same rule the chunk textures
 * follow (D-161).
 */
export const DETAIL_ATLAS_SCALE = 4;

const TILE_W = 64 * ATLAS_SCALE;
const TILE_H = 32 * ATLAS_SCALE;
const STEP = 16 * ATLAS_SCALE;

/**
 * One cell holds the diamond, the skirt below it, and headroom above.
 *
 * The headroom is what a cooling tower, a derrick or an office block stands
 * in. It used to be one height step, which was enough for a crate and cut the
 * top off everything taller - so it is now three, and `anchorY` tells the
 * renderer where the ground actually is inside the cell. That coupling used to
 * be an unwritten agreement between two files.
 */
/**
 * Headroom above the tile diamond and skirt below it, in HEIGHT STEPS.
 *
 * Exported because the chunk AABBs of the hybrid renderer (chunks.ts) must
 * enclose everything a cell can draw: a cell that grew headroom without the
 * chunk maths following would silently clip every tall building at a chunk
 * edge - the exact unwritten-agreement failure D-117 fixed with `anchorY`.
 */
export const CELL_HEADROOM_STEPS = 3;
export const CELL_SKIRT_STEPS = 1;

const CELL_W = TILE_W;
const CELL_TOP = STEP * CELL_HEADROOM_STEPS;
const CELL_H = TILE_H + CELL_TOP + STEP * CELL_SKIRT_STEPS;

/** Rows of the atlas that are not terrain. */
const ROAD_ROW = TERRAIN_COUNT;
const BUILDING_ROW = TERRAIN_COUNT + 1;
/**
 * Track is drawn as eight half segments, one per direction, composited per
 * tile. Eight cells instead of the 256 a full bit-combination atlas would need.
 */
const TRACK_ROW = TERRAIN_COUNT + 2;
/** One cell per industry type, so seventeen works do not share one crate. */
const INDUSTRY_ROW = TERRAIN_COUNT + 3;
/**
 * The living water of M12 (D-164): WATER_FRAME_COUNT greyscale animation
 * rows (16 slope cells each) followed by one row of FOAM_VARIANT_COUNT
 * coastline cells. These four rows are the M12 booking of SPEC2 6.2
 * ("+4 Wasser-Zeilen", Seite 0) and exist on the BASE page only - the
 * detail page's packed layout has 256 px of headroom left (D-163), and four
 * short rows would need 1024, so every zoom draws its water from here.
 */
const WATER_ROW = TERRAIN_COUNT + 4;
const FOAM_ROW = WATER_ROW + WATER_FRAME_COUNT;
/**
 * The emissive row of M13 (SPEC2 6.2, page 0 booking "+1 Emissive-Zeile"):
 * window-only twins of the six town-building cells, then one cell per glazed
 * industry - drawn by the SAME code as the full cells with everything but
 * the glazing skipped, so the lit windows sit exactly on the dark ones. On
 * the BASE page only, like the water rows: the detail page stands at
 * 4096x3840 of 4096 (D-163) and has no room for another tall row, so every
 * zoom composites its glow from here - a glow is low-frequency, and the 4x
 * upscale is invisible where a wall texture's would not be (the D-164
 * argument, restated).
 */
const EMISSIVE_ROW = FOAM_ROW + 1;
/** Columns of the glazed-industry twins start after the six building cells. */
const EMISSIVE_INDUSTRY_COLUMN = 6;
/**
 * The rail-furniture row of M13 bundle 5 (SPEC2 6.2, page 0 booking "+1
 * Signal/Fahrleitungs-Zeile"): one post silhouette per signal KIND (the four
 * kinds of section 9.1, readable apart at last - D-117's shape-not-tint
 * applied to signalling), the two aspect-lamp cells that light one lamp of
 * the shared housing (red above, green below - position carries the aspect
 * for any colour vision, the palette hue is redundant), the catenary mast
 * and the eight wire half-segments for electrified track. On BOTH pages:
 * unlike the water and emissive rows these cells also exist on the detail
 * page (it had exactly one short row of headroom left, and thin poles and
 * wires are what an upscale would smear).
 */
const RAIL_ROW = EMISSIVE_ROW + 1;
const SIGNAL_POST_COLUMN = 0;
const SIGNAL_ASPECT_COLUMN = SIGNAL_POST_COLUMN + SIGNAL_KIND_COUNT - 1;
const CATENARY_MAST_COLUMN = SIGNAL_ASPECT_COLUMN + SIGNAL_ASPECT_COUNT;
const CATENARY_WIRE_COLUMN = CATENARY_MAST_COLUMN + 1;

/** Three zones times two expansion stages, plus one generic industry block. */
const BUILDING_VARIANTS = 6;
const STATION_COLUMN = BUILDING_VARIANTS;
const DEPOT_COLUMN = BUILDING_VARIANTS + 1;
const VEHICLE_COLUMN = BUILDING_VARIANTS + 2;
const PLATFORM_COLUMN = BUILDING_VARIANTS + 3;
const RAIL_DEPOT_COLUMN = BUILDING_VARIANTS + 4;
const TRAIN_COLUMN = BUILDING_VARIANTS + 5;
const BRIDGE_COLUMN = BUILDING_VARIANTS + 6;
const SIGNAL_COLUMN = BUILDING_VARIANTS + 7;

const ATLAS_COLUMNS = Math.max(SLOPE_COUNT, SIGNAL_COLUMN + 1, INDUSTRY_TYPE_COUNT);
const ATLAS_ROWS = RAIL_ROW + 1;

/**
 * Largest texture the weakest GPU this game targets is guaranteed to accept.
 *
 * The atlas grows whenever a row or a column is added and nothing used to
 * notice; a texture over the limit does not fail loudly, it fails as a blank
 * map on somebody else's machine. Exported so the layout guard test holds
 * BOTH pages against it without needing a canvas.
 */
export const MAX_ATLAS_PX = 4096;

/**
 * The startup slice the two procedural atlas pages may spend, together.
 *
 * SPEC.md section 21 gives the whole cold start 3 s; the atlas is one slice
 * of that. Measured 2026-08-07 (Ryzen 5 7520U, Chromium): base page ~20 ms,
 * detail page ~50 ms - the budget is a generous multiple in the D-136 sense,
 * a tripwire for regressions of multiples, not a promise. `MapView.attach`
 * measures against it and warns on the console when it is crossed. [ms]
 */
export const ATLAS_BUILD_BUDGET_MS = 250;

export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Where the base diamond's north corner sits inside THIS frame, in atlas
   * pixels from the frame's top edge.
   *
   * Per frame rather than per page since the detail page packs rows of two
   * different heights - a short terrain row and a tall building row do not
   * share a ground line. The D-117 lesson, one level further down: where the
   * ground sits is the atlas's business, and it says so on every frame.
   */
  readonly anchorY: number;
}

export interface TerrainAtlas {
  readonly canvas: HTMLCanvasElement;
  terrainFrame(terrain: number, slope: number): AtlasFrame;
  roadFrame(roadBits: number): AtlasFrame;
  buildingFrame(kind: number, level: number): AtlasFrame;
  /** One frame per IndustryType; the shape is the industry, not a tint. */
  industryFrame(type: number): AtlasFrame;
  /** Platform canopy of a road stop; tinted with the company colour. */
  stationFrame(): AtlasFrame;
  depotFrame(): AtlasFrame;
  /** Low canopy of a rail platform, sitting on the track. */
  platformFrame(): AtlasFrame;
  /** Engine shed. */
  railDepotFrame(): AtlasFrame;
  /** Small box for a road vehicle; tinted with the company colour. */
  vehicleFrame(): AtlasFrame;
  /** Longer, lower box for a train, so the two modes tell apart at a glance. */
  trainFrame(): AtlasFrame;
  /** Deck slab of a bridge, drawn at the deck's height rather than the ground's. */
  bridgeFrame(): AtlasFrame;
  /** The plain white post: kept for the waypoint markers (D-141). */
  signalFrame(): AtlasFrame;
  /** Signal post silhouetted by kind (M13 B5; SignalKind 1..4). */
  signalPostFrame(kind: number): AtlasFrame;
  /** The lit lamp of one aspect, composited over the post (SignalAspect). */
  signalAspectFrame(aspect: number): AtlasFrame;
  /** Catenary mast beside electrified track (M13 B5). */
  catenaryMastFrame(): AtlasFrame;
  /** Half a catenary wire over the track's own half segment (M13 B5). */
  catenaryWireFrame(direction: number): AtlasFrame;
  /** Half a track segment leaving the tile centre in one of the 8 directions. */
  trackFrame(direction: number): AtlasFrame;
  /**
   * Repaint the cells of ONE seasonal job in the artwork of `stage`, and
   * answer how many cells were redrawn (SPEC2 M18).
   *
   * A job is a terrain index - its sixteen slope cells - or
   * `SEASON_JOB_BUILDINGS`, which is the six town cells AND, on the page that
   * has an emissive row, their six window-only twins. The twins are in the
   * same call rather than in a job of their own: SPEC2 6.2 asks for the
   * emissive in the SAME pass, and one call is the only version of that which
   * cannot come apart (D-172's "by construction" restated a milestone on).
   *
   * The canvas is repainted; the GPU sees nothing until the caller updates the
   * texture source, which is what lets a regeneration run over several frames
   * and still swap seasons in one frame (MapView).
   */
  repaintSeasonJob(job: number, stage: SeasonStage): number;
}

/** Corner offsets of the base diamond inside a cell, in draw order N-E-S-W. */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [TILE_W / 2, CELL_TOP],
  [TILE_W, CELL_TOP + TILE_H / 2],
  [TILE_W / 2, CELL_TOP + TILE_H],
  [0, CELL_TOP + TILE_H / 2],
];

const CORNER_BITS = [SlopeBit.North, SlopeBit.East, SlopeBit.South, SlopeBit.West];

/**
 * Simple deterministic hash, used for the speckle pattern so the texture is
 * identical on every machine and every run.
 */
function speckleHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One terrain cell, in the colours the STAGE gives that terrain (SPEC2 M18).
 *
 * The two colours come from `seasonArt.terrainLook` and from nowhere else, so
 * "what does grass look like in November" has one answer that the repaint and
 * the first build share. Summer answers with the base tables of section 16.3,
 * which is why the atlas the game starts with is unchanged artwork.
 */
function drawTerrainCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  terrain: number,
  slope: number,
  stage: SeasonStage = SeasonStage.Summer,
): void {
  const look = terrainLook(terrain, stage);
  const base = look.colour;
  const speckle = look.speckle;

  const points = CORNERS.map(([cx, cy], index) => {
    const raised = (slope & CORNER_BITS[index]!) !== 0;
    return [originX + cx, originY + cy - (raised ? STEP : 0)] as const;
  });

  // Lambert-ish shading from the tilt: light comes from the north-west.
  const lift = (index: number): number => ((slope & CORNER_BITS[index]!) !== 0 ? 1 : 0);
  const tilt = lift(3) + lift(0) - lift(1) - lift(2);
  const topFactor = 1 + tilt * 0.07;

  // Side skirt: one height level is always enough, because no two neighbouring
  // tiles differ by more than one level (see terrain.ts).
  ctx.fillStyle = shade(base, 0.62);
  ctx.beginPath();
  ctx.moveTo(points[1]![0], points[1]![1]);
  ctx.lineTo(points[2]![0], points[2]![1]);
  ctx.lineTo(points[2]![0], points[2]![1] + STEP);
  ctx.lineTo(points[1]![0], points[1]![1] + STEP);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(base, 0.76);
  ctx.beginPath();
  ctx.moveTo(points[2]![0], points[2]![1]);
  ctx.lineTo(points[3]![0], points[3]![1]);
  ctx.lineTo(points[3]![0], points[3]![1] + STEP);
  ctx.lineTo(points[2]![0], points[2]![1] + STEP);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(base, topFactor);
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.fill();

  // Speckles give the large flat areas some grain without a texture file.
  ctx.fillStyle = speckle;
  const count = terrain === Terrain.Water ? 6 : 22;
  for (let i = 0; i < count; i++) {
    const u = speckleHash(terrain * 31 + slope, i, 1);
    const v = speckleHash(terrain * 31 + slope, i, 2);
    // Barycentric-ish placement that keeps the dots inside the diamond.
    const px = originX + TILE_W / 2 + (u - 0.5) * TILE_W * (1 - Math.abs(v - 0.5) * 2) * 0.9;
    const py = originY + CELL_TOP + v * TILE_H;
    ctx.fillRect(px, py, ATLAS_SCALE, ATLAS_SCALE);
  }
}

/**
 * Static grain luminance of a water cell, as greys over the white top face.
 *
 * The water cells are drawn in GREYSCALE and tinted per sprite with one of
 * the two 16.3 tones (D-164): white multiplies to the exact hex, and every
 * feature darker than white survives the tint as the same feature in that
 * tone. The speckle grey reproduces the old #3f7896-on-#4a86a8 grain (a
 * ratio of ~0.87); the ripple grey is deliberately closer to white, because
 * the ripples are the part that MOVES and a subtle shimmer is the brief -
 * not a strobe (SPEC2 M12).
 */
const WATER_SPECKLE_GREY = '#dedede';
const WATER_RIPPLE_GREY = '#efefef';

/** Ripple dashes per water cell and animation frame. */
const WATER_RIPPLE_COUNT = 9;

/**
 * One greyscale water cell: the drawTerrainCell geometry - same corners, same
 * skirt, same north-west light - with the terrain palette replaced by white,
 * plus a per-frame set of ripple dashes. The static speckles use a salt
 * WITHOUT the frame in it, so the grain holds still while the ripples drift:
 * a frame swap changes only what is meant to move.
 */
function drawWaterCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  slope: number,
  frame: number,
): void {
  const base = '#ffffff';

  const points = CORNERS.map(([cx, cy], index) => {
    const raised = (slope & CORNER_BITS[index]!) !== 0;
    return [originX + cx, originY + cy - (raised ? STEP : 0)] as const;
  });

  const lift = (index: number): number => ((slope & CORNER_BITS[index]!) !== 0 ? 1 : 0);
  const tilt = lift(3) + lift(0) - lift(1) - lift(2);
  const topFactor = 1 + tilt * 0.07;

  ctx.fillStyle = shade(base, 0.62);
  ctx.beginPath();
  ctx.moveTo(points[1]![0], points[1]![1]);
  ctx.lineTo(points[2]![0], points[2]![1]);
  ctx.lineTo(points[2]![0], points[2]![1] + STEP);
  ctx.lineTo(points[1]![0], points[1]![1] + STEP);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(base, 0.76);
  ctx.beginPath();
  ctx.moveTo(points[2]![0], points[2]![1]);
  ctx.lineTo(points[3]![0], points[3]![1]);
  ctx.lineTo(points[3]![0], points[3]![1] + STEP);
  ctx.lineTo(points[2]![0], points[2]![1] + STEP);
  ctx.closePath();
  ctx.fill();

  // `shade` clamps at white, so an up-tilted face stays exactly white and
  // the tint reproduces the 16.3 hex; a down-tilted face darkens as every
  // terrain cell does.
  ctx.fillStyle = shade(base, topFactor);
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.fill();

  // The still grain: same count and placement scheme as the terrain cells,
  // identical across the three frames.
  ctx.fillStyle = WATER_SPECKLE_GREY;
  for (let i = 0; i < 6; i++) {
    const u = speckleHash(slope, i, 1);
    const v = speckleHash(slope, i, 2);
    const px = originX + TILE_W / 2 + (u - 0.5) * TILE_W * (1 - Math.abs(v - 0.5) * 2) * 0.9;
    const py = originY + CELL_TOP + v * TILE_H;
    ctx.fillRect(px, py, ATLAS_SCALE, ATLAS_SCALE);
  }

  // The moving part: short horizontal dashes whose positions depend on the
  // FRAME, so a row swap reads as light wandering over the surface.
  ctx.fillStyle = WATER_RIPPLE_GREY;
  for (let i = 0; i < WATER_RIPPLE_COUNT; i++) {
    const u = speckleHash(slope * WATER_FRAME_COUNT + frame, i, 3);
    const v = speckleHash(slope * WATER_FRAME_COUNT + frame, i, 4);
    const width = (4 + 4 * speckleHash(frame, i, 5)) * ATLAS_SCALE;
    const px =
      originX + TILE_W / 2 + (u - 0.5) * (TILE_W - width * 2) * (1 - Math.abs(v - 0.5) * 2) * 0.9;
    const py = originY + CELL_TOP + v * TILE_H;
    ctx.fillRect(px - width / 2, py, width, ATLAS_SCALE);
  }
}

/**
 * The two diamond corners either end of each foam edge, as CORNERS indices:
 * edge 0 runs N-E, 1 E-S, 2 S-W, 3 W-N - the water.ts EDGE_CORNER_BITS
 * order, which foamVariant packs the lift flags in.
 */
const FOAM_EDGE_CORNERS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

/**
 * One coastline cell (D-164): a band of foam along one edge of the water
 * diamond, its endpoints lifted with the slope corners so the foam follows
 * the shoreline over all sixteen slopes. Drawn in its own near-white - foam
 * sprites are NOT tinted with a water tone; whiteness is what foam is.
 */
function drawFoamCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  variant: number,
): void {
  const edge = (variant / 4) | 0;
  const [cornerA, cornerB] = FOAM_EDGE_CORNERS[edge]!;
  const liftA = (variant & 1) !== 0 ? STEP : 0;
  const liftB = (variant & 2) !== 0 ? STEP : 0;

  const ax = originX + CORNERS[cornerA]![0];
  const ay = originY + CORNERS[cornerA]![1] - liftA;
  const bx = originX + CORNERS[cornerB]![0];
  const by = originY + CORNERS[cornerB]![1] - liftB;
  // The tile centre, for nudging the band onto the water side of the edge.
  const cx = originX + TILE_W / 2;
  const cy = originY + CELL_TOP + TILE_H / 2;

  const stroke = (inset: number, width: number, alpha: number): void => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax + (cx - ax) * inset, ay + (cy - ay) * inset);
    ctx.lineTo(bx + (cx - bx) * inset, by + (cy - by) * inset);
    ctx.stroke();
  };

  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  // A wash fading into the water, a body, and a bright line at the shore.
  stroke(0.16, 4.5 * ATLAS_SCALE, 0.22);
  stroke(0.08, 2.4 * ATLAS_SCALE, 0.5);
  stroke(0.02, 1.1 * ATLAS_SCALE, 0.85);
  ctx.globalAlpha = 1;
}

/**
 * A road: a kerbed carriageway with a centre line, not a grey stripe.
 *
 * Three passes, and the order is the whole trick. The pale verge goes down
 * widest, the asphalt narrower on top of it, and the markings narrowest of
 * all - so every junction shape comes out with a continuous kerb and no gap,
 * whatever combination of the four directions is set, without one sprite per
 * combination.
 */
function drawRoadCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  roadBits: number,
): void {
  const cx = originX + TILE_W / 2;
  const cy = originY + CELL_TOP + TILE_H / 2;
  const half = TILE_W / 2;

  // Bit order matches RoadBit: west, east, north, south in tile space, which
  // in screen space are the four diagonal directions of the diamond.
  const directions: ReadonlyArray<readonly [number, number]> = [
    [-half, TILE_H / 2],
    [half, -TILE_H / 2],
    [-half, -TILE_H / 2],
    [half, TILE_H / 2],
  ];

  const arms: Array<readonly [number, number]> = [];
  for (let bit = 0; bit < 4; bit++) {
    if ((roadBits & (1 << bit)) !== 0) arms.push(directions[bit]!);
  }

  const stroke = (width: number, colour: string, dash: readonly number[] | null): void => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.setLineDash(dash === null ? [] : [...dash]);
    if (arms.length === 0) {
      // An isolated tile still gets a patch of surface, or a one-tile stop
      // would stand on grass.
      ctx.beginPath();
      ctx.arc(cx, cy, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      return;
    }
    for (const [dx, dy] of arms) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    }
  };

  stroke(11 * ATLAS_SCALE, '#b7b1a4', null); // kerb and verge
  stroke(8.4 * ATLAS_SCALE, '#4c4a48', null); // asphalt
  // A centre line only where the road runs through rather than ending, so a
  // junction does not get a white blot in the middle of it.
  if (arms.length === 2) {
    ctx.lineCap = 'butt';
    stroke(0.9 * ATLAS_SCALE, '#d8d2c4', [3 * ATLAS_SCALE, 4 * ATLAS_SCALE]);
  }
  ctx.setLineDash([]);
}

/**
 * A town building: a house, a shop or a works, by zone and expansion stage.
 *
 * The three zones get three different SHAPES rather than three colours of the
 * same box - a pitched roof, a flat glazed block and a shed - because at the
 * zoom the game is played at, shape survives and colour does not.
 *
 * `emissiveOnly` (M13, SPEC2: "window/lamp-only cells via windows()") draws
 * ONLY the glazing - the windows() calls and the shed's north-light glass -
 * in the lit colour, everything else transparent: the emissive twin of the
 * cell, from the SAME specs and the same call sites, so the lit windows can
 * never drift off the dark ones.
 *
 * `stage` (M18) snows the ROOFS in winter - the three surfaces that already
 * take an explicit colour: the pitched roof, the shed's sawtooth and the
 * commercial block's rooftop plant. The flat top face of the commercial block
 * is `box`'s own shading of its wall colour and is deliberately left alone;
 * making it snow would mean a roof-colour parameter on every solid in
 * shapes.ts for one cell of six. The emissive twin takes the same `stage`
 * because it is the same call, which is what keeps "the twin is the cell with
 * everything but the glazing skipped" true across a repaint.
 */
function drawTownBuilding(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  kind: number,
  level: number,
  emissiveOnly = false,
  stage: SeasonStage = SeasonStage.Summer,
): void {
  const snow = roofSnowFor(stage);
  const view: IsoView = {
    cx: originX + TILE_W / 2,
    cy: originY + CELL_TOP + TILE_H / 2,
    halfW: TILE_W / 2,
    halfH: TILE_H / 2,
  };
  const px = ATLAS_SCALE;
  const grow = level;

  if (kind === 0) {
    // Residential: a house, taller and with more windows as the town grows.
    const height = (9 + grow * 7) * px;
    const w = 0.5 + grow * 0.06;
    if (!emissiveOnly) box(ctx, view, { u: w, v: w * 0.78, height, colour: '#c9b79c' });
    windows(ctx, view, {
      u: w,
      v: w * 0.78,
      height,
      rows: 1 + grow,
      columns: 2,
      colour: emissiveOnly ? EMISSIVE_WINDOW_HEX : '#5d7f92',
    });
    if (emissiveOnly) return;
    gableRoof(ctx, view, {
      u: w,
      v: w * 0.78,
      base: height,
      rise: (6 + grow) * px,
      colour: snowedRoof('#8d4b3c', snow),
    });
    return;
  }

  if (kind === 1) {
    // Commercial: a flat block, all glass, and the tallest thing in a town.
    const height = (15 + grow * 12) * px;
    const w = 0.54 + grow * 0.05;
    if (!emissiveOnly) box(ctx, view, { u: w, v: w * 0.86, height, colour: '#cfd4d8' });
    windows(ctx, view, {
      u: w,
      v: w * 0.86,
      height,
      rows: 3 + grow,
      columns: 3,
      colour: emissiveOnly ? EMISSIVE_WINDOW_HEX : '#3f6f88',
    });
    if (emissiveOnly) return;
    box(ctx, view, {
      u: w * 0.4,
      v: w * 0.34,
      height: 3 * px,
      colour: snowedRoof('#9aa1a8', snow),
      base: height,
    });
    return;
  }

  // Industrial: a low shed with a north-light roof.
  const height = (8 + grow * 4) * px;
  const w = 0.62 + grow * 0.06;
  if (!emissiveOnly) box(ctx, view, { u: w, v: w * 0.7, height, colour: '#9b968c' });
  sawtoothRoof(ctx, view, {
    u: w,
    v: w * 0.7,
    base: height,
    rise: 3 * px,
    teeth: 2,
    colour: snowedRoof('#5c6068', snow),
    glass: emissiveOnly ? EMISSIVE_WINDOW_HEX : '#82aebf',
    glassOnly: emissiveOnly,
  });
}

/** A simple isometric box, used for the tinted station and vehicle sprites. */
function drawBox(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  widthTiles: number,
  heightPx: number,
  color: string,
): void {
  const halfW = (TILE_W / 2) * widthTiles;
  const halfH = (TILE_H / 2) * widthTiles;
  const cx = originX + TILE_W / 2;
  const baseY = originY + CELL_TOP + TILE_H / 2 + halfH;
  const topY = baseY - heightPx;

  // Left face
  ctx.fillStyle = shade(color, 0.7);
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY - halfH);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx - halfW, topY - halfH);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = shade(color, 0.5);
  ctx.beginPath();
  ctx.moveTo(cx + halfW, baseY - halfH);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx + halfW, topY - halfH);
  ctx.closePath();
  ctx.fill();

  // Roof
  ctx.fillStyle = shade(color, 1.05);
  ctx.beginPath();
  ctx.moveTo(cx, topY - halfH * 2);
  ctx.lineTo(cx + halfW, topY - halfH);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx - halfW, topY - halfH);
  ctx.closePath();
  ctx.fill();
}

/**
 * The eight generic statics, one table for BOTH pages so they cannot drift:
 * the base page places them by column, the detail page by key. Heights are
 * design pixels (multiplied by the page scale); the white ones take the
 * company colour as a sprite tint, which is why they are drawn white.
 */
const BOX_SPRITES = [
  { key: 'station', column: STATION_COLUMN, widthTiles: 0.8, heightPx: 9, colour: '#ffffff' },
  { key: 'depot', column: DEPOT_COLUMN, widthTiles: 0.8, heightPx: 16, colour: '#ffffff' },
  { key: 'vehicle', column: VEHICLE_COLUMN, widthTiles: 0.3, heightPx: 7, colour: '#ffffff' },
  { key: 'platform', column: PLATFORM_COLUMN, widthTiles: 0.9, heightPx: 5, colour: '#ffffff' },
  { key: 'railDepot', column: RAIL_DEPOT_COLUMN, widthTiles: 0.9, heightPx: 20, colour: '#ffffff' },
  { key: 'train', column: TRAIN_COLUMN, widthTiles: 0.55, heightPx: 6, colour: '#ffffff' },
  // The deck is a wide, very shallow slab; the ground it spans shows around it.
  { key: 'bridge', column: BRIDGE_COLUMN, widthTiles: 0.98, heightPx: 3, colour: '#8e8a84' },
  // A thin, tall post: narrow enough not to hide the track it stands on.
  { key: 'signal', column: SIGNAL_COLUMN, widthTiles: 0.12, heightPx: 14, colour: '#d8d4cc' },
] as const;

/** Tile-space offsets of the eight track directions, clockwise from east. */
const TRACK_DELTA: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Half a track segment: ballast, two rails and a few sleepers, running from the
 * tile centre to the edge in one direction. Two of these meeting in a tile make
 * a through track, three or more make a junction - all without a sprite per
 * combination.
 */
function drawTrackCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  direction: number,
): void {
  const [dx, dy] = TRACK_DELTA[direction]!;
  const cx = originX + TILE_W / 2;
  const cy = originY + CELL_TOP + TILE_H / 2;
  // Isometric projection of the tile-space direction, halved to reach the edge.
  const ex = cx + ((dx - dy) * TILE_W) / 4;
  const ey = cy + ((dx + dy) * TILE_H) / 4;

  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#9a938a'; // ballast
  ctx.lineWidth = 9 * ATLAS_SCALE;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Sleepers across the ballast.
  ctx.strokeStyle = '#5a4b3a';
  ctx.lineWidth = 1.5 * ATLAS_SCALE;
  const normalX = -(ey - cy);
  const normalY = ex - cx;
  const normalLength = Math.sqrt(normalX * normalX + normalY * normalY) || 1;
  for (let i = 1; i <= 3; i++) {
    const t = i / 3.5;
    const px = cx + (ex - cx) * t;
    const py = cy + (ey - cy) * t;
    const half = 4.5 * ATLAS_SCALE;
    ctx.beginPath();
    ctx.moveTo(px - (normalX / normalLength) * half, py - (normalY / normalLength) * half);
    ctx.lineTo(px + (normalX / normalLength) * half, py + (normalY / normalLength) * half);
    ctx.stroke();
  }

  // The two rails.
  ctx.strokeStyle = '#6b6560';
  ctx.lineWidth = 1.5 * ATLAS_SCALE;
  for (const offset of [-2.6 * ATLAS_SCALE, 2.6 * ATLAS_SCALE]) {
    const ox = (normalX / normalLength) * offset;
    const oy = (normalY / normalLength) * offset;
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.lineTo(ex + ox, ey + oy);
    ctx.stroke();
  }
}

/**
 * Signal-furniture geometry, in DESIGN pixels above the tile-centre ground
 * line (world px at zoom 1; the drawing multiplies by the page scale). One
 * table shared by the post cells, the aspect cells and MapView's night
 * glow, so the dark lamp, its lit twin and the glow align by construction -
 * the emissive-twin lesson (D-172) applied to a two-cell overlay.
 */
/** Pole height of every signal post. [design px; the M4 white post's scale] */
const SIGNAL_POST_HEIGHT_PX = 12.5;
/** Lamp housing extent on the pole. [design px] */
const SIGNAL_HOUSING_TOP_PX = 11.2;
const SIGNAL_HOUSING_BOTTOM_PX = 5.4;
/** Centre of the upper (red) and lower (green) lamp. [design px] */
const SIGNAL_LAMP_RED_PX = 9.7;
const SIGNAL_LAMP_GREEN_PX = 6.9;
const SIGNAL_LAMP_RADIUS_PX = 1.5;
/**
 * Where the lamp housing's centre sits above the tile-centre ground -
 * MapView anchors the additive night glow here. [world px]
 */
export const SIGNAL_LAMP_LIFT_PX = 8.3;
/** Centre of the kind marker (disc or blade) above the housing. [design px] */
const SIGNAL_HEAD_CENTRE_PX = 13.5;
/**
 * Contact-wire height above the rail head, and the mast that carries it.
 * The wire sits below the mast's cross-bar, as hung wire does. [design px]
 */
const CATENARY_WIRE_LIFT_PX = 11.5;
const CATENARY_MAST_HEIGHT_PX = 13;

/** The post's own grey-white - the M4 signal colour, kept. [CSS hex] */
const SIGNAL_POST_COLOUR = '#d8d4cc';
const SIGNAL_HOUSING_COLOUR = '#2b2f33';
const SIGNAL_LAMP_OFF_COLOUR = '#181b1e';
/** Galvanised steel for the mast, near-black for the wire hint. [CSS hex] */
const CATENARY_COLOUR = '#6b7076';
const CATENARY_WIRE_COLOUR = '#3d4148';

/** The aspect palette as CSS hex, derived from the ONE tint table. */
function signalAspectHex(aspect: number): string {
  return `#${SIGNAL_ASPECT_TINTS[aspect]!.toString(16).padStart(6, '0')}`;
}

/**
 * One signal post, silhouetted by KIND (SPEC2 M13: "vier Signaltypen per
 * Mast-Silhouette unterscheidbar"): block signals wear a disc head, path
 * signals a diamond blade, and the one-way kinds add an arm. The arm is
 * deliberately generic, never a compass - the passable direction stays the
 * tile panel's business (D-126); the silhouette only says WHAT stands here.
 * Both lamps are drawn dark: the aspect cell lights exactly one of them.
 */
function drawSignalPostCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  kind: number,
): void {
  const px = ATLAS_SCALE;
  const cx = originX + TILE_W / 2;
  const gy = originY + CELL_TOP + TILE_H / 2;

  // Base plate, so the post reads as standing rather than floating.
  ctx.fillStyle = shade(SIGNAL_POST_COLOUR, 0.66);
  ctx.fillRect(cx - 2 * px, gy - 1 * px, 4 * px, 1.6 * px);

  // The pole, with a darker sliver down the right for depth.
  ctx.fillStyle = SIGNAL_POST_COLOUR;
  ctx.fillRect(
    cx - 0.7 * px,
    gy - SIGNAL_POST_HEIGHT_PX * px,
    1.4 * px,
    SIGNAL_POST_HEIGHT_PX * px,
  );
  ctx.fillStyle = shade(SIGNAL_POST_COLOUR, 0.6);
  ctx.fillRect(
    cx + 0.1 * px,
    gy - SIGNAL_POST_HEIGHT_PX * px,
    0.6 * px,
    SIGNAL_POST_HEIGHT_PX * px,
  );

  // The housing with both lamps unlit.
  ctx.fillStyle = SIGNAL_HOUSING_COLOUR;
  ctx.fillRect(
    cx - 2.1 * px,
    gy - SIGNAL_HOUSING_TOP_PX * px,
    4.2 * px,
    (SIGNAL_HOUSING_TOP_PX - SIGNAL_HOUSING_BOTTOM_PX) * px,
  );
  ctx.fillStyle = SIGNAL_LAMP_OFF_COLOUR;
  for (const lamp of [SIGNAL_LAMP_RED_PX, SIGNAL_LAMP_GREEN_PX]) {
    ctx.beginPath();
    ctx.arc(cx, gy - lamp * px, SIGNAL_LAMP_RADIUS_PX * px, 0, Math.PI * 2);
    ctx.fill();
  }

  // The kind marker - the SHAPE is the information (D-117).
  const headY = gy - SIGNAL_HEAD_CENTRE_PX * px;
  if (kind === SignalKind.Block || kind === SignalKind.BlockOneWay) {
    ctx.fillStyle = SIGNAL_POST_COLOUR;
    ctx.beginPath();
    ctx.arc(cx, headY, 2.2 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SIGNAL_HOUSING_COLOUR;
    ctx.beginPath();
    ctx.arc(cx, headY, 1 * px, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = SIGNAL_POST_COLOUR;
    ctx.beginPath();
    ctx.moveTo(cx, headY - 2.4 * px);
    ctx.lineTo(cx + 2.4 * px, headY);
    ctx.lineTo(cx, headY + 2.4 * px);
    ctx.lineTo(cx - 2.4 * px, headY);
    ctx.closePath();
    ctx.fill();
  }
  if (kind === SignalKind.BlockOneWay || kind === SignalKind.PathEntry) {
    ctx.fillStyle = SIGNAL_POST_COLOUR;
    ctx.fillRect(cx + 0.7 * px, gy - 4.6 * px, 4 * px, 1.2 * px);
    ctx.beginPath();
    ctx.moveTo(cx + 4.7 * px, gy - 5.4 * px);
    ctx.lineTo(cx + 6.6 * px, gy - 4 * px);
    ctx.lineTo(cx + 4.7 * px, gy - 2.6 * px);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * One aspect cell: a transparent cell whose only content is the LIT lamp,
 * composited over the post's dark housing. Red lights the upper lamp,
 * green the lower - the aspect is a position first and a colour second, so
 * it survives any colour vision; the hues are the colour-blind safe pair
 * of the shared palette (signalAspects.ts, one tint table).
 */
function drawSignalAspectCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  aspect: number,
): void {
  const px = ATLAS_SCALE;
  const cx = originX + TILE_W / 2;
  const gy = originY + CELL_TOP + TILE_H / 2;
  const lampY = gy - (aspect === SignalAspect.Red ? SIGNAL_LAMP_RED_PX : SIGNAL_LAMP_GREEN_PX) * px;
  const hex = signalAspectHex(aspect);

  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(cx, lampY, (SIGNAL_LAMP_RADIUS_PX + 0.2) * px, 0, Math.PI * 2);
  ctx.fill();
  // A brighter core, so the lamp reads as lit rather than painted.
  ctx.fillStyle = shade(hex, 1.7);
  ctx.beginPath();
  ctx.arc(cx, lampY, 0.7 * px, 0, Math.PI * 2);
  ctx.fill();
}

/** The catenary mast cell: the shapes.ts primitive at cell scale. */
function drawCatenaryMastCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
): void {
  catenaryMast(
    ctx,
    {
      cx: originX + TILE_W / 2,
      cy: originY + CELL_TOP + TILE_H / 2,
      halfW: TILE_W / 2,
      halfH: TILE_H / 2,
    },
    {
      height: CATENARY_MAST_HEIGHT_PX * ATLAS_SCALE,
      armPx: 2.6 * ATLAS_SCALE,
      colour: CATENARY_COLOUR,
      lineWidth: 1 * ATLAS_SCALE,
    },
  );
}

/**
 * Half a catenary wire: the track cell's own half-segment geometry lifted
 * to wire height, so two halves meet over the rail joint exactly as the
 * rails beneath them do - one cell per direction, no combination atlas.
 */
function drawCatenaryWireCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  direction: number,
): void {
  const [dx, dy] = TRACK_DELTA[direction]!;
  const cx = originX + TILE_W / 2;
  const cy = originY + CELL_TOP + TILE_H / 2;
  const ex = cx + ((dx - dy) * TILE_W) / 4;
  const ey = cy + ((dx + dy) * TILE_H) / 4;
  const lift = CATENARY_WIRE_LIFT_PX * ATLAS_SCALE;

  ctx.strokeStyle = CATENARY_WIRE_COLOUR;
  ctx.lineWidth = 0.9 * ATLAS_SCALE;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(cx, cy - lift);
  ctx.lineTo(ex, ey - lift);
  ctx.stroke();
}

/**
 * Dimensions of the base page, as a pure function so the guard test can hold
 * them against MAX_ATLAS_PX (and against the ledger's booked 2176x3840 -
 * the original 2176x2688 plus M12's four water rows plus M13's emissive row
 * and rail-furniture row, SPEC2 6.2) without a canvas.
 */
export function baseAtlasSize(): { width: number; height: number } {
  return { width: ATLAS_COLUMNS * CELL_W, height: ATLAS_ROWS * CELL_H };
}

/**
 * Frame of one water animation cell on the BASE page (D-164). A standalone
 * function rather than a TerrainAtlas method because the water rows exist on
 * one page only: MapView reads them from the base page at EVERY zoom,
 * including the chunked ones and the 4x detail level (where this is a 2x
 * upscale, stated in D-164 - the detail page has no room for four more
 * rows). All water frames share the base cell's geometry and ground line,
 * which is what lets a frame swap change a sprite's texture and nothing
 * else.
 */
export function waterAtlasFrame(frame: number, slope: number): AtlasFrame {
  return {
    x: (slope & (SLOPE_COUNT - 1)) * CELL_W,
    y: (WATER_ROW + (frame % WATER_FRAME_COUNT)) * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/** Frame of one coastline foam cell on the BASE page (D-164). */
export function foamAtlasFrame(variant: number): AtlasFrame {
  return {
    x: (variant % FOAM_VARIANT_COUNT) * CELL_W,
    y: FOAM_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/**
 * Frame of one town-building emissive twin on the BASE page (M13): the
 * window-only cell that draws additively over `buildingFrame(kind, level)`
 * at night. Same column formula as buildingFrame, same cell geometry, so
 * the twin lands pixel-exact on its building at every zoom - a standalone
 * function like the water frames, because the row exists on one page only.
 */
export function emissiveBuildingFrame(kind: number, level: number): AtlasFrame {
  return {
    x: (Math.min(2, Math.max(0, kind - 1)) + (level >= 2 ? 3 : 0)) * CELL_W,
    y: EMISSIVE_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/**
 * Frame of one glazed industry's emissive twin on the BASE page (M13), or
 * null for the unglazed types - the caller draws no glow then, which is the
 * honest answer for a coal heap at night.
 */
export function emissiveIndustryFrame(type: number): AtlasFrame | null {
  const slot = INDUSTRY_EMISSIVE_TYPES.indexOf(type);
  if (slot < 0) return null;
  return {
    x: (EMISSIVE_INDUSTRY_COLUMN + slot) * CELL_W,
    y: EMISSIVE_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/**
 * Frames of the M13 B5 rail-furniture row on the BASE page, standalone pure
 * functions like the water frames so the layout guard test holds the real
 * placement without a canvas. All four share the base cell's geometry and
 * ground line - the aspect cell composites over the post cell at the same
 * world position, so equality here IS the alignment.
 */
export function signalPostAtlasFrame(kind: number): AtlasFrame {
  const clamped = kind >= 1 && kind < SIGNAL_KIND_COUNT ? kind : SignalKind.Block;
  return {
    x: (SIGNAL_POST_COLUMN + clamped - 1) * CELL_W,
    y: RAIL_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/** Frame of one aspect-lamp cell (SignalAspect) on the BASE page. */
export function signalAspectAtlasFrame(aspect: number): AtlasFrame {
  return {
    x: (SIGNAL_ASPECT_COLUMN + (aspect & 1)) * CELL_W,
    y: RAIL_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/** Frame of the catenary mast cell on the BASE page. */
export function catenaryMastAtlasFrame(): AtlasFrame {
  return {
    x: CATENARY_MAST_COLUMN * CELL_W,
    y: RAIL_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/** Frame of one catenary wire half-segment on the BASE page. */
export function catenaryWireAtlasFrame(direction: number): AtlasFrame {
  return {
    x: (CATENARY_WIRE_COLUMN + (direction & 7)) * CELL_W,
    y: RAIL_ROW * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  };
}

/** Build the base atlas page. Call once at startup. */
export function buildTerrainAtlas(): TerrainAtlas {
  const canvas = document.createElement('canvas');
  const size = baseAtlasSize();
  canvas.width = size.width;
  canvas.height = size.height;

  // A texture over the limit does not fail loudly - it fails as a blank map on
  // somebody else's machine, months later.
  if (canvas.width > MAX_ATLAS_PX || canvas.height > MAX_ATLAS_PX) {
    throw new Error(
      `Tile atlas is ${canvas.width}x${canvas.height}, over the ${MAX_ATLAS_PX} px ` +
        'a low-end GPU is guaranteed to accept. Split a row or lower ATLAS_SCALE.',
    );
  }

  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas context unavailable - cannot build the tile atlas.');
  ctx.imageSmoothingEnabled = false;

  for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      drawTerrainCell(ctx, slope * CELL_W, terrain * CELL_H, terrain, slope);
    }
  }

  for (let roadBits = 0; roadBits < 16; roadBits++) {
    drawRoadCell(ctx, roadBits * CELL_W, ROAD_ROW * CELL_H, roadBits);
  }

  for (let variant = 0; variant < BUILDING_VARIANTS; variant++) {
    const kind = variant % 3;
    const level = (variant / 3) | 0;
    drawTownBuilding(ctx, variant * CELL_W, BUILDING_ROW * CELL_H, kind, level);
  }

  // One cell per industry type. These are NOT tinted - they are drawn in their
  // own colours, because a tint multiplies and would flatten a coal heap and a
  // chimney to the same shade.
  for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) {
    drawIndustry(
      ctx,
      {
        cx: type * CELL_W + TILE_W / 2,
        cy: INDUSTRY_ROW * CELL_H + CELL_TOP + TILE_H / 2,
        halfW: TILE_W / 2,
        halfH: TILE_H / 2,
      },
      type,
      { px: ATLAS_SCALE },
    );
  }
  for (const spec of BOX_SPRITES) {
    drawBox(
      ctx,
      spec.column * CELL_W,
      BUILDING_ROW * CELL_H,
      spec.widthTiles,
      spec.heightPx * ATLAS_SCALE,
      spec.colour,
    );
  }

  for (let direction = 0; direction < 8; direction++) {
    drawTrackCell(ctx, direction * CELL_W, TRACK_ROW * CELL_H, direction);
  }

  // The living water of M12 (D-164): three greyscale animation rows and the
  // coastline foam row. The static Terrain.Water row above stays in the
  // layout - removing a terrain row would renumber every frame key for
  // sixteen cells of savings - but nothing draws from it any more.
  for (let waterFrame = 0; waterFrame < WATER_FRAME_COUNT; waterFrame++) {
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      drawWaterCell(ctx, slope * CELL_W, (WATER_ROW + waterFrame) * CELL_H, slope, waterFrame);
    }
  }
  for (let variant = 0; variant < FOAM_VARIANT_COUNT; variant++) {
    drawFoamCell(ctx, variant * CELL_W, FOAM_ROW * CELL_H, variant);
  }

  // The emissive row of M13: window-only twins of the building cells (same
  // draw code, everything but the glazing skipped) and of the glazed
  // industries. Composited additively over their base cells at night.
  for (let variant = 0; variant < BUILDING_VARIANTS; variant++) {
    const kind = variant % 3;
    const level = (variant / 3) | 0;
    drawTownBuilding(ctx, variant * CELL_W, EMISSIVE_ROW * CELL_H, kind, level, true);
  }
  for (let slot = 0; slot < INDUSTRY_EMISSIVE_TYPES.length; slot++) {
    drawIndustryEmissive(
      ctx,
      {
        cx: (EMISSIVE_INDUSTRY_COLUMN + slot) * CELL_W + TILE_W / 2,
        cy: EMISSIVE_ROW * CELL_H + CELL_TOP + TILE_H / 2,
        halfW: TILE_W / 2,
        halfH: TILE_H / 2,
      },
      INDUSTRY_EMISSIVE_TYPES[slot]!,
      { px: ATLAS_SCALE },
      EMISSIVE_WINDOW_HEX,
    );
  }

  // The rail-furniture row of M13 B5: the four signal-kind posts, the two
  // aspect lamps, the catenary mast and the eight wire half-segments.
  for (let kind = 1; kind < SIGNAL_KIND_COUNT; kind++) {
    drawSignalPostCell(ctx, (SIGNAL_POST_COLUMN + kind - 1) * CELL_W, RAIL_ROW * CELL_H, kind);
  }
  for (let aspect = 0; aspect < SIGNAL_ASPECT_COUNT; aspect++) {
    drawSignalAspectCell(ctx, (SIGNAL_ASPECT_COLUMN + aspect) * CELL_W, RAIL_ROW * CELL_H, aspect);
  }
  drawCatenaryMastCell(ctx, CATENARY_MAST_COLUMN * CELL_W, RAIL_ROW * CELL_H);
  for (let direction = 0; direction < 8; direction++) {
    drawCatenaryWireCell(
      ctx,
      (CATENARY_WIRE_COLUMN + direction) * CELL_W,
      RAIL_ROW * CELL_H,
      direction,
    );
  }

  const frame = (column: number, row: number): AtlasFrame => ({
    x: column * CELL_W,
    y: row * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  });

  /**
   * The seasonal repaint of the base page (SPEC2 M18). Every cell is cleared
   * before it is redrawn: a cell is transparent outside its diamond, and a
   * repaint that only painted over would leave the previous season showing
   * wherever the new artwork happens not to reach.
   */
  const repaintSeasonJob = (job: number, stage: SeasonStage): number => {
    if (job === SEASON_JOB_BUILDINGS) {
      for (let variant = 0; variant < BUILDING_VARIANTS; variant++) {
        const kind = variant % 3;
        const level = (variant / 3) | 0;
        ctx.clearRect(variant * CELL_W, BUILDING_ROW * CELL_H, CELL_W, CELL_H);
        drawTownBuilding(ctx, variant * CELL_W, BUILDING_ROW * CELL_H, kind, level, false, stage);
        // The twin, from the same call site in the same pass.
        ctx.clearRect(variant * CELL_W, EMISSIVE_ROW * CELL_H, CELL_W, CELL_H);
        drawTownBuilding(ctx, variant * CELL_W, EMISSIVE_ROW * CELL_H, kind, level, true, stage);
      }
      return BUILDING_VARIANTS * 2;
    }
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      ctx.clearRect(slope * CELL_W, job * CELL_H, CELL_W, CELL_H);
      drawTerrainCell(ctx, slope * CELL_W, job * CELL_H, job, slope, stage);
    }
    return SLOPE_COUNT;
  };

  return {
    canvas,
    repaintSeasonJob,
    terrainFrame: (terrain, slope) => frame(slope, terrain),
    roadFrame: (roadBits) => frame(roadBits & 0x0f, ROAD_ROW),
    buildingFrame: (kind, level) =>
      frame(Math.min(2, Math.max(0, kind - 1)) + (level >= 2 ? 3 : 0), BUILDING_ROW),
    industryFrame: (type) =>
      frame(type >= 0 && type < INDUSTRY_TYPE_COUNT ? type : 0, INDUSTRY_ROW),
    stationFrame: () => frame(STATION_COLUMN, BUILDING_ROW),
    depotFrame: () => frame(DEPOT_COLUMN, BUILDING_ROW),
    platformFrame: () => frame(PLATFORM_COLUMN, BUILDING_ROW),
    railDepotFrame: () => frame(RAIL_DEPOT_COLUMN, BUILDING_ROW),
    vehicleFrame: () => frame(VEHICLE_COLUMN, BUILDING_ROW),
    trainFrame: () => frame(TRAIN_COLUMN, BUILDING_ROW),
    bridgeFrame: () => frame(BRIDGE_COLUMN, BUILDING_ROW),
    signalFrame: () => frame(SIGNAL_COLUMN, BUILDING_ROW),
    signalPostFrame: (kind) => signalPostAtlasFrame(kind),
    signalAspectFrame: (aspect) => signalAspectAtlasFrame(aspect),
    catenaryMastFrame: () => catenaryMastAtlasFrame(),
    catenaryWireFrame: (direction) => catenaryWireAtlasFrame(direction),
    trackFrame: (direction) => frame(direction & 7, TRACK_ROW),
  };
}

// ------------------------------------------------------------ the 4x page

/**
 * Which atlas page a zoom level reads (SPEC.md 16.2 per-zoom atlases).
 *
 * Any zoom past the base page's own resolution would be a nearest-neighbour
 * upscale, which is exactly what the detail page exists to replace; every
 * other zoom is a downscale of the base page. Pure, so the selection is a
 * unit test rather than a screenshot.
 */
export type AtlasPageId = 'base' | 'detail';

export function atlasPageForZoom(zoom: number): AtlasPageId {
  return zoom > ATLAS_SCALE ? 'detail' : 'base';
}

const DETAIL_TILE_W = 64 * DETAIL_ATLAS_SCALE;
const DETAIL_TILE_H = 32 * DETAIL_ATLAS_SCALE;
const DETAIL_STEP = 16 * DETAIL_ATLAS_SCALE;

/**
 * The detail page cannot repeat the base page's uniform grid: 17 columns of
 * 256 px are 4352 px and 14 rows of 384 px are 5376 - both over MAX_ATLAS_PX.
 * It packs by headroom instead. SHORT rows hold what never rises more than
 * one height step above the ground line (terrain's raised corners, roads,
 * track); TALL rows keep the full D-117 headroom for buildings, industries
 * and the statics. Both keep the one-step skirt.
 *
 * The tall cells are deliberately WORLD-IDENTICAL to the base page's cells
 * (3 + 1 height steps around the diamond, one tile wide), so every consumer
 * that placed a base cell - the vehicle path's fixed offset above all -
 * places a detail cell without knowing which page it holds. A test pins
 * that equality.
 */
const DETAIL_SHORT_ANCHOR = DETAIL_STEP;
const DETAIL_SHORT_H = DETAIL_TILE_H + 2 * DETAIL_STEP;
const DETAIL_TALL_ANCHOR = DETAIL_STEP * CELL_HEADROOM_STEPS;
const DETAIL_TALL_H = DETAIL_TILE_H + DETAIL_STEP * (CELL_HEADROOM_STEPS + CELL_SKIRT_STEPS);
const DETAIL_COLUMNS = Math.floor(MAX_ATLAS_PX / DETAIL_TILE_W);

/** A detail cell no season touches. */
const SEASON_JOB_NONE = -2;

/** One cell of the detail page: its frame key, row class and how to draw it. */
interface DetailCellSpec {
  readonly key: string;
  readonly tall: boolean;
  /**
   * Which seasonal repaint job owns this cell (SPEC2 M18): a terrain index,
   * `SEASON_JOB_BUILDINGS`, or `SEASON_JOB_NONE` for the cells no season
   * moves. A field rather than a pattern over the key, so the repaint picks
   * its cells by the same statement the build makes about them.
   */
  readonly seasonJob: number;
  /**
   * Draws the cell in BASE-PAGE cell space (origin at the cell's top-left,
   * ground anchor at CELL_TOP): the builder scales the context by
   * DETAIL_ATLAS_SCALE / ATLAS_SCALE, and because every coordinate and line
   * width in the drawing code is linear in the scale, the result is exactly
   * what redrawing at the larger scale would produce - rasterised at the
   * detail resolution, not resampled.
   */
  readonly draw: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * Every cell of the detail page, in layout order, in the artwork of `stage`.
 * Pure until drawn - the layout is identical for every stage, so
 * `planDetailAtlas` needs no season at all.
 */
function detailCellSpecs(stage: SeasonStage = SeasonStage.Summer): readonly DetailCellSpec[] {
  const specs: DetailCellSpec[] = [];

  for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      specs.push({
        key: `t${terrain}:${slope}`,
        tall: false,
        seasonJob: terrain,
        draw: (ctx) => drawTerrainCell(ctx, 0, 0, terrain, slope, stage),
      });
    }
  }

  for (let roadBits = 0; roadBits < 16; roadBits++) {
    specs.push({
      key: `r${roadBits}`,
      tall: false,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawRoadCell(ctx, 0, 0, roadBits),
    });
  }

  for (let direction = 0; direction < 8; direction++) {
    specs.push({
      key: `k${direction}`,
      tall: false,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawTrackCell(ctx, 0, 0, direction),
    });
  }

  // The rail furniture of M13 B5, SHORT cells all: nothing here rises past
  // the one-step headroom above the north corner. They fill the track row's
  // eight free columns and one further short row - the page's last 256 px,
  // booked in SPEC2 6.2 (4096x4096 of 4096).
  for (let kind = 1; kind < SIGNAL_KIND_COUNT; kind++) {
    specs.push({
      key: `sg${kind}`,
      tall: false,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawSignalPostCell(ctx, 0, 0, kind),
    });
  }
  for (let aspect = 0; aspect < SIGNAL_ASPECT_COUNT; aspect++) {
    specs.push({
      key: `sa${aspect}`,
      tall: false,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawSignalAspectCell(ctx, 0, 0, aspect),
    });
  }
  specs.push({
    key: 'cm',
    tall: false,
    seasonJob: SEASON_JOB_NONE,
    draw: (ctx) => drawCatenaryMastCell(ctx, 0, 0),
  });
  for (let direction = 0; direction < 8; direction++) {
    specs.push({
      key: `cw${direction}`,
      tall: false,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawCatenaryWireCell(ctx, 0, 0, direction),
    });
  }

  for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) {
    specs.push({
      key: `i${type}`,
      tall: true,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) =>
        drawIndustry(
          ctx,
          {
            cx: TILE_W / 2,
            cy: CELL_TOP + TILE_H / 2,
            halfW: TILE_W / 2,
            halfH: TILE_H / 2,
          },
          type,
          { px: ATLAS_SCALE },
        ),
    });
  }

  for (let variant = 0; variant < BUILDING_VARIANTS; variant++) {
    const kind = variant % 3;
    const level = (variant / 3) | 0;
    specs.push({
      key: `b${variant}`,
      tall: true,
      seasonJob: SEASON_JOB_BUILDINGS,
      draw: (ctx) => drawTownBuilding(ctx, 0, 0, kind, level, false, stage),
    });
  }

  for (const spec of BOX_SPRITES) {
    specs.push({
      key: spec.key,
      tall: true,
      seasonJob: SEASON_JOB_NONE,
      draw: (ctx) => drawBox(ctx, 0, 0, spec.widthTiles, spec.heightPx * ATLAS_SCALE, spec.colour),
    });
  }

  return specs;
}

export interface DetailAtlasPlan {
  readonly width: number;
  readonly height: number;
  readonly frames: ReadonlyMap<string, AtlasFrame>;
}

/**
 * Lay the detail cells out into rows, flowing left to right and wrapping at
 * DETAIL_COLUMNS; a change of row class (short/tall) always starts a new row,
 * so a row has exactly one height and one ground line. Pure and cheap, so
 * the layout guard test holds the real placement, not a copy of its maths.
 */
export function planDetailAtlas(): DetailAtlasPlan {
  const frames = new Map<string, AtlasFrame>();
  let x = 0;
  let y = 0;
  let width = 0;
  let rowTall: boolean | null = null;
  let rowHeight = 0;

  for (const spec of detailCellSpecs()) {
    if (rowTall === null || spec.tall !== rowTall || x >= DETAIL_COLUMNS * DETAIL_TILE_W) {
      if (rowTall !== null) y += rowHeight;
      x = 0;
      rowTall = spec.tall;
      rowHeight = spec.tall ? DETAIL_TALL_H : DETAIL_SHORT_H;
    }
    frames.set(spec.key, {
      x,
      y,
      width: DETAIL_TILE_W,
      height: rowHeight,
      anchorY: spec.tall ? DETAIL_TALL_ANCHOR : DETAIL_SHORT_ANCHOR,
    });
    x += DETAIL_TILE_W;
    if (x > width) width = x;
  }
  if (rowTall !== null) y += rowHeight;

  return { width, height: y, frames };
}

/** Build the 4x detail page. Call once at startup, after the base page. */
export function buildDetailAtlas(): TerrainAtlas {
  const plan = planDetailAtlas();

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;

  if (canvas.width > MAX_ATLAS_PX || canvas.height > MAX_ATLAS_PX) {
    throw new Error(
      `Detail atlas is ${canvas.width}x${canvas.height}, over the ${MAX_ATLAS_PX} px ` +
        'a low-end GPU is guaranteed to accept. Split a row or lower DETAIL_ATLAS_SCALE.',
    );
  }

  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable - cannot build the detail atlas.');
  }
  ctx.imageSmoothingEnabled = false;

  const factor = DETAIL_ATLAS_SCALE / ATLAS_SCALE;

  /**
   * Draw one spec into its own frame. Shared by the build and the seasonal
   * repaint, so a repainted cell lands exactly where the built one did - the
   * clip, the anchor shift and the scale are stated once.
   */
  const paint = (spec: DetailCellSpec): void => {
    const cell = plan.frames.get(spec.key)!;
    ctx.save();
    // Clip to the frame: anything a cell painted past its edge would land in
    // ANOTHER frame's texture, which is corruption, not decoration.
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.clearRect(cell.x, cell.y, cell.width, cell.height);
    // The draw routines place the ground anchor at CELL_TOP in base cell
    // space; shift so it lands on THIS row's anchor after scaling.
    ctx.translate(cell.x, cell.y + cell.anchorY - factor * CELL_TOP);
    ctx.scale(factor, factor);
    spec.draw(ctx);
    ctx.restore();
  };

  for (const spec of detailCellSpecs()) paint(spec);

  const lookup = (key: string): AtlasFrame => {
    const cell = plan.frames.get(key);
    if (cell === undefined) throw new Error(`detail atlas has no frame '${key}'`);
    return cell;
  };

  /**
   * The seasonal repaint of the detail page (SPEC2 M18). Same specs, same
   * `paint`, one stage further on - and no emissive twins, because the detail
   * page has no emissive row (D-172: it stands full at 4096x4096 and every
   * zoom composites its glow from the base page).
   */
  const repaintSeasonJob = (job: number, stage: SeasonStage): number => {
    let painted = 0;
    for (const spec of detailCellSpecs(stage)) {
      if (spec.seasonJob !== job) continue;
      paint(spec);
      painted++;
    }
    return painted;
  };

  return {
    canvas,
    repaintSeasonJob,
    terrainFrame: (terrain, slope) => lookup(`t${terrain}:${slope}`),
    roadFrame: (roadBits) => lookup(`r${roadBits & 0x0f}`),
    buildingFrame: (kind, level) =>
      lookup(`b${Math.min(2, Math.max(0, kind - 1)) + (level >= 2 ? 3 : 0)}`),
    industryFrame: (type) => lookup(`i${type >= 0 && type < INDUSTRY_TYPE_COUNT ? type : 0}`),
    stationFrame: () => lookup('station'),
    depotFrame: () => lookup('depot'),
    platformFrame: () => lookup('platform'),
    railDepotFrame: () => lookup('railDepot'),
    vehicleFrame: () => lookup('vehicle'),
    trainFrame: () => lookup('train'),
    bridgeFrame: () => lookup('bridge'),
    signalFrame: () => lookup('signal'),
    signalPostFrame: (kind) =>
      lookup(`sg${kind >= 1 && kind < SIGNAL_KIND_COUNT ? kind : SignalKind.Block}`),
    signalAspectFrame: (aspect) => lookup(`sa${aspect & 1}`),
    catenaryMastFrame: () => lookup('cm'),
    catenaryWireFrame: (direction) => lookup(`cw${direction & 7}`),
    trackFrame: (direction) => lookup(`k${direction & 7}`),
  };
}
