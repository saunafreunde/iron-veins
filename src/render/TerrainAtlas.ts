import { TERRAIN_COLORS } from '../shared/palette';
import { INDUSTRY_TYPE_COUNT } from '../sim/industry/types';
import { SlopeBit, SLOPE_COUNT, Terrain, TERRAIN_COUNT } from '../sim/map/terrain';
import { drawIndustry } from './industryArt';
import { box, gableRoof, sawtoothRoof, shade, windows, type IsoView } from './shapes';

/**
 * Procedurally generated tile artwork.
 *
 * Section 16.2 asks for sprites that are generated rather than drawn, so no
 * binary art enters the repository. It proposes a build-time bake into PNG
 * atlases; this builds the same artwork at startup into one canvas instead.
 * Same procedural source, but no PNG encoder, no atlas manifest and no build
 * step to keep in sync - and the whole set costs about twenty milliseconds.
 * If load time ever matters the identical function can move to build time.
 *
 * The atlas is drawn at twice the zoom-1 size: upscaling looks soft, so the
 * reference is the larger of the two common zoom levels and everything below it
 * is a downscale.
 */

/** Atlas resolution relative to zoom 1. */
export const ATLAS_SCALE = 2;

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
const ATLAS_ROWS = TERRAIN_COUNT + 4;

/**
 * Largest texture the weakest GPU this game targets is guaranteed to accept.
 *
 * The atlas grows whenever a row or a column is added and nothing used to
 * notice; a texture over the limit does not fail loudly, it fails as a blank
 * map on somebody else's machine.
 */
const MAX_ATLAS_PX = 4096;

export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TerrainAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Where the base diamond's north corner sits inside a cell. */
  readonly anchorY: number;
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
 */
function drawTownBuilding(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  kind: number,
  level: number,
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
    box(ctx, view, { u: w, v: w * 0.78, height, colour: '#c9b79c' });
    windows(ctx, view, {
      u: w,
      v: w * 0.78,
      height,
      rows: 1 + grow,
      columns: 2,
      colour: '#5d7f92',
    });
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
    box(ctx, view, { u: w, v: w * 0.86, height, colour: '#cfd4d8' });
    windows(ctx, view, {
      u: w,
      v: w * 0.86,
      height,
      rows: 3 + grow,
      columns: 3,
      colour: '#3f6f88',
    });
    box(ctx, view, { u: w * 0.4, v: w * 0.34, height: 3 * px, colour: '#9aa1a8', base: height });
    return;
  }

  // Industrial: a low shed with a north-light roof.
  const height = (8 + grow * 4) * px;
  const w = 0.62 + grow * 0.06;
  box(ctx, view, { u: w, v: w * 0.7, height, colour: '#9b968c' });
  sawtoothRoof(ctx, view, {
    u: w,
    v: w * 0.7,
    base: height,
    rise: 3 * px,
    teeth: 2,
    colour: '#5c6068',
    glass: '#82aebf',
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

/** Build the whole atlas. Call once at startup. */
export function buildTerrainAtlas(): TerrainAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * CELL_W;
  canvas.height = ATLAS_ROWS * CELL_H;

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
  // Generic blocks; the concrete colour is applied as a sprite tint, which is
  // why they are drawn white.
  drawBox(ctx, STATION_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.8, 9 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, DEPOT_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.8, 16 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, VEHICLE_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.3, 7 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, PLATFORM_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.9, 5 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, RAIL_DEPOT_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.9, 20 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, TRAIN_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.55, 6 * ATLAS_SCALE, '#ffffff');
  // The deck is a wide, very shallow slab; the ground it spans shows around it.
  drawBox(ctx, BRIDGE_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.98, 3 * ATLAS_SCALE, '#8e8a84');
  // A thin, tall post: narrow enough not to hide the track it stands on.
  drawBox(ctx, SIGNAL_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.12, 14 * ATLAS_SCALE, '#d8d4cc');

  for (let direction = 0; direction < 8; direction++) {
    drawTrackCell(ctx, direction * CELL_W, TRACK_ROW * CELL_H, direction);
  }

  const frame = (column: number, row: number): AtlasFrame => ({
    x: column * CELL_W,
    y: row * CELL_H,
    width: CELL_W,
    height: CELL_H,
  });

  return {
    canvas,
    cellWidth: CELL_W,
    cellHeight: CELL_H,
    anchorY: CELL_TOP,
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
