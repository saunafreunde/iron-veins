import { SlopeBit, SLOPE_COUNT, Terrain, TERRAIN_COUNT } from '../sim/map/terrain';

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

/** One cell holds the diamond plus headroom for a raised corner and a skirt. */
const CELL_W = TILE_W;
const CELL_H = TILE_H + STEP * 2;

/** Vertical offset of the base diamond inside its cell. */
const CELL_TOP = STEP;

/** Base colour per terrain type, indexed by {@link Terrain}. */
const TERRAIN_COLORS: readonly string[] = [
  '#4a86a8', // water
  '#cbb682', // coast
  '#6f9b58', // grass
  '#b09a4e', // field
  '#3f6b3a', // forest
  '#8a8578', // rock
  '#e8eef2', // snow
  '#d6bc86', // desert
  '#5a6b4a', // marsh
  '#b8b4ac', // town ground
];

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

/** Three zones times two expansion stages, plus one generic industry block. */
const BUILDING_VARIANTS = 6;
const INDUSTRY_COLUMN = BUILDING_VARIANTS;
const STATION_COLUMN = BUILDING_VARIANTS + 1;
const DEPOT_COLUMN = BUILDING_VARIANTS + 2;
const VEHICLE_COLUMN = BUILDING_VARIANTS + 3;
const PLATFORM_COLUMN = BUILDING_VARIANTS + 4;
const RAIL_DEPOT_COLUMN = BUILDING_VARIANTS + 5;
const TRAIN_COLUMN = BUILDING_VARIANTS + 6;
const BRIDGE_COLUMN = BUILDING_VARIANTS + 7;

const ATLAS_COLUMNS = Math.max(SLOPE_COUNT, BRIDGE_COLUMN + 1);
const ATLAS_ROWS = TERRAIN_COUNT + 3;

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
  industryFrame(): AtlasFrame;
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

/** Multiply a hex colour by a factor, clamped. */
function shade(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((value >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((value >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((value & 0xff) * factor));
  return `rgb(${r},${g},${b})`;
}

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

/** Road ribbons: a dark band from the tile centre towards each connection. */
function drawRoadCell(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  roadBits: number,
): void {
  const cx = originX + TILE_W / 2;
  const cy = originY + CELL_TOP + TILE_H / 2;
  const half = TILE_W / 2;

  ctx.strokeStyle = '#4a4a4d';
  ctx.lineWidth = 7 * ATLAS_SCALE;
  ctx.lineCap = 'round';

  // Bit order matches RoadBit: west, east, north, south in tile space, which
  // in screen space are the four diagonal directions of the diamond.
  const directions: ReadonlyArray<readonly [number, number]> = [
    [-half, TILE_H / 2],
    [half, -TILE_H / 2],
    [-half, -TILE_H / 2],
    [half, TILE_H / 2],
  ];

  let drewAny = false;
  for (let bit = 0; bit < 4; bit++) {
    if ((roadBits & (1 << bit)) === 0) continue;
    const [dx, dy] = directions[bit]!;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
    drewAny = true;
  }
  if (!drewAny) {
    ctx.fillStyle = '#4a4a4d';
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * ATLAS_SCALE, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A simple isometric box, used for houses and industry blocks. */
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

const BUILDING_COLORS = ['#a8896b', '#7d8b99', '#8a7f6d'];

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
    drawBox(
      ctx,
      variant * CELL_W,
      BUILDING_ROW * CELL_H,
      0.62,
      (12 + level * 10) * ATLAS_SCALE,
      BUILDING_COLORS[kind]!,
    );
  }
  // Generic blocks; the concrete colour is applied as a sprite tint, which is
  // why they are drawn white.
  drawBox(ctx, INDUSTRY_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.95, 22 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, STATION_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.8, 9 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, DEPOT_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.8, 16 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, VEHICLE_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.3, 7 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, PLATFORM_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.9, 5 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, RAIL_DEPOT_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.9, 20 * ATLAS_SCALE, '#ffffff');
  drawBox(ctx, TRAIN_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.55, 6 * ATLAS_SCALE, '#ffffff');
  // The deck is a wide, very shallow slab; the ground it spans shows around it.
  drawBox(ctx, BRIDGE_COLUMN * CELL_W, BUILDING_ROW * CELL_H, 0.98, 3 * ATLAS_SCALE, '#8e8a84');

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
    industryFrame: () => frame(INDUSTRY_COLUMN, BUILDING_ROW),
    stationFrame: () => frame(STATION_COLUMN, BUILDING_ROW),
    depotFrame: () => frame(DEPOT_COLUMN, BUILDING_ROW),
    platformFrame: () => frame(PLATFORM_COLUMN, BUILDING_ROW),
    railDepotFrame: () => frame(RAIL_DEPOT_COLUMN, BUILDING_ROW),
    vehicleFrame: () => frame(VEHICLE_COLUMN, BUILDING_ROW),
    trainFrame: () => frame(TRAIN_COLUMN, BUILDING_ROW),
    bridgeFrame: () => frame(BRIDGE_COLUMN, BUILDING_ROW),
    trackFrame: (direction) => frame(direction & 7, TRACK_ROW),
  };
}
