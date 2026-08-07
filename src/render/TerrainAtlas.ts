import { TERRAIN_COLORS } from '../shared/palette';
import { INDUSTRY_TYPE_COUNT } from '../sim/industry/types';
import { SlopeBit, SLOPE_COUNT, Terrain, TERRAIN_COUNT } from '../sim/map/terrain';
import { EMISSIVE_WINDOW_HEX } from './emissive';
import { drawIndustry, drawIndustryEmissive, INDUSTRY_EMISSIVE_TYPES } from './industryArt';
import { box, gableRoof, sawtoothRoof, shade, windows, type IsoView } from './shapes';
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

/** Speckle colour per terrain, used for a little surface texture. */
const TERRAIN_SPECKLE: readonly string[] = [
  '#3f7896',
  '#bda874',
  '#628c4e',
  '#a08c46',
  '#365d32',
  '#7b766a',
  '#d7dde1',
  '#c7ad79',
  '#4e5d40',
  '#a9a59d',
];

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
const ATLAS_ROWS = EMISSIVE_ROW + 1;

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
  /** Signal post beside the track. */
  signalFrame(): AtlasFrame;
  /** Half a track segment leaving the tile centre in one of the 8 directions. */
  trackFrame(direction: number): AtlasFrame;
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

function drawTerrainCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  terrain: number,
  slope: number,
): void {
  const base = TERRAIN_COLORS[terrain]!;
  const speckle = TERRAIN_SPECKLE[terrain]!;

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
 */
function drawTownBuilding(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  kind: number,
  level: number,
  emissiveOnly = false,
): void {
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
      colour: '#8d4b3c',
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
    box(ctx, view, { u: w * 0.4, v: w * 0.34, height: 3 * px, colour: '#9aa1a8', base: height });
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
    colour: '#5c6068',
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
 * Dimensions of the base page, as a pure function so the guard test can hold
 * them against MAX_ATLAS_PX (and against the ledger's booked 2176x3648 -
 * the original 2176x2688 plus M12's four water rows plus M13's emissive row,
 * SPEC2 6.2) without a canvas.
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

  const frame = (column: number, row: number): AtlasFrame => ({
    x: column * CELL_W,
    y: row * CELL_H,
    width: CELL_W,
    height: CELL_H,
    anchorY: CELL_TOP,
  });

  return {
    canvas,
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

/** One cell of the detail page: its frame key, row class and how to draw it. */
interface DetailCellSpec {
  readonly key: string;
  readonly tall: boolean;
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

/** Every cell of the detail page, in layout order. Pure until drawn. */
function detailCellSpecs(): readonly DetailCellSpec[] {
  const specs: DetailCellSpec[] = [];

  for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      specs.push({
        key: `t${terrain}:${slope}`,
        tall: false,
        draw: (ctx) => drawTerrainCell(ctx, 0, 0, terrain, slope),
      });
    }
  }

  for (let roadBits = 0; roadBits < 16; roadBits++) {
    specs.push({
      key: `r${roadBits}`,
      tall: false,
      draw: (ctx) => drawRoadCell(ctx, 0, 0, roadBits),
    });
  }

  for (let direction = 0; direction < 8; direction++) {
    specs.push({
      key: `k${direction}`,
      tall: false,
      draw: (ctx) => drawTrackCell(ctx, 0, 0, direction),
    });
  }

  for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) {
    specs.push({
      key: `i${type}`,
      tall: true,
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
      draw: (ctx) => drawTownBuilding(ctx, 0, 0, kind, level),
    });
  }

  for (const spec of BOX_SPRITES) {
    specs.push({
      key: spec.key,
      tall: true,
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
  for (const spec of detailCellSpecs()) {
    const cell = plan.frames.get(spec.key)!;
    ctx.save();
    // Clip to the frame: anything a cell painted past its edge would land in
    // ANOTHER frame's texture, which is corruption, not decoration.
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    // The draw routines place the ground anchor at CELL_TOP in base cell
    // space; shift so it lands on THIS row's anchor after scaling.
    ctx.translate(cell.x, cell.y + cell.anchorY - factor * CELL_TOP);
    ctx.scale(factor, factor);
    spec.draw(ctx);
    ctx.restore();
  }

  const lookup = (key: string): AtlasFrame => {
    const cell = plan.frames.get(key);
    if (cell === undefined) throw new Error(`detail atlas has no frame '${key}'`);
    return cell;
  };

  return {
    canvas,
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
    trackFrame: (direction) => lookup(`k${direction & 7}`),
  };
}
