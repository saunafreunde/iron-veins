import { COMPANY_COLORS, COMPANY_COLORS_CVD, TERRAIN_COLORS } from '../shared/palette';
import { SEA_LEVEL, TILE_PUBLIC } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { Terrain } from '../sim/map/terrain';
import { worldToTileAtHeight } from './projection';

/**
 * The minimap of section 17.1, owed since M1.
 *
 * It is a pure function from the tile layers to pixels, and that is the whole
 * design: no Pixi, no canvas ownership, no state. The panel calls it when the
 * map revision moves, and the save screen calls the very same function to make
 * the thumbnail a save carries - one picture of the world, drawn one way.
 *
 * A tile is one pixel. At 1024 tiles that is a megapixel, which is a few
 * milliseconds once every time the ground changes, and nothing at all per
 * frame.
 */

export const MinimapMode = {
  Terrain: 0,
  Network: 1,
  Owner: 2,
  CargoFlow: 3,
  Contours: 4,
  /**
   * The measured flow legs of the M14 FlowMarker block (D-176/D-177), drawn
   * as lines between station pixels. Not the same question as CargoFlow:
   * that mode shows where cargo PILES (stations by waiting, industries by
   * level - what "Frachtfluss" could honestly mean before the measurement
   * existed, D-112); this one shows what MOVES where, now that it is
   * measured. The N key cycle picks it up through MINIMAP_MODE_COUNT.
   */
  Flow: 5,
} as const;
export type MinimapMode = (typeof MinimapMode)[keyof typeof MinimapMode];

export const MINIMAP_MODE_COUNT = 6;

/** Translation keys for the mode buttons, indexed by MinimapMode. */
export const MINIMAP_MODE_KEYS: readonly string[] = [
  'ui.minimap.terrain',
  'ui.minimap.network',
  'ui.minimap.owner',
  'ui.minimap.cargo',
  'ui.minimap.contours',
  'ui.minimap.flow',
];

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

const TERRAIN_RGB: readonly Rgb[] = TERRAIN_COLORS.map(parseHex);
const COMPANY_RGB: readonly Rgb[] = COMPANY_COLORS.map(parseHex);
const COMPANY_RGB_CVD: readonly Rgb[] = COMPANY_COLORS_CVD.map(parseHex);

const ROAD: Rgb = { r: 200, g: 200, b: 200 };
const RAIL: Rgb = { r: 40, g: 40, b: 48 };
const UNSERVED: Rgb = { r: 60, g: 66, b: 74 };
const CONTOUR: Rgb = { r: 20, g: 24, b: 28 };

/** What the cargo view needs to know, gathered by the caller. */
export interface MinimapMarkers {
  /** Tile index of every station, and how much is waiting there. */
  readonly stationTiles: readonly number[];
  readonly stationWaiting: readonly number[];
  /** Tile index of every industry and its production level in percent. */
  readonly industryTiles: readonly number[];
  readonly industryLevels: readonly number[];
}

const NO_MARKERS: MinimapMarkers = {
  stationTiles: [],
  stationWaiting: [],
  industryTiles: [],
  industryLevels: [],
};

/**
 * The measured legs the Flow mode draws, gathered by the caller from the
 * snapshot's FlowMarker block and the station markers (D-176): the painter
 * stays a pure function of its arguments (D-112), so the same call keeps
 * serving the save thumbnail. Index-parallel arrays, one entry per leg.
 */
export interface MinimapFlows {
  /** Tile index of the station each leg leaves from. */
  readonly fromTiles: readonly number[];
  /** Tile index of the station each leg arrives at. */
  readonly toTiles: readonly number[];
  /** Recorded volume over the leg's sample window. [units] */
  readonly volumes: readonly number[];
  /** Company of the newest recorded trip, -1 for an estimate leg. */
  readonly owners: readonly number[];
}

const NO_FLOWS: MinimapFlows = {
  fromTiles: [],
  toTiles: [],
  volumes: [],
  owners: [],
};

/** Colour of an estimate leg on the minimap - matches UNSERVED's family. */
const FLOW_LINE_ESTIMATE: Rgb = { r: 130, g: 138, b: 146 };

/** Brightness floor for the faintest leg, so a thin flow stays visible. */
const FLOW_LINE_MIN_STRENGTH = 0.4;

/**
 * Paint the whole map into an RGBA buffer, one pixel per tile.
 *
 * `out` must hold `size * size * 4` bytes. It is passed in rather than
 * allocated so the panel can reuse one buffer for the life of the world -
 * a megabyte allocated every time a road is laid is a megabyte the garbage
 * collector has to find during play.
 */
export function paintMinimap(
  map: TileMap,
  mode: MinimapMode,
  out: Uint8ClampedArray,
  options: {
    readonly colorBlind?: boolean;
    readonly markers?: MinimapMarkers;
    readonly flows?: MinimapFlows;
  } = {},
): void {
  const size = map.size;
  const companies = options.colorBlind === true ? COMPANY_RGB_CVD : COMPANY_RGB;
  const markers = options.markers ?? NO_MARKERS;
  const flows = options.flows ?? NO_FLOWS;

  for (let tile = 0; tile < size * size; tile++) {
    const colour = colourFor(map, tile, mode, companies);
    // Height shading, so relief is readable in every mode. Water is left flat:
    // it is all at one level, and shading it makes the sea look like hills.
    const terrain = map.terrain[tile]!;
    const shade =
      terrain === Terrain.Water ? 1 : 0.72 + (map.cornerHeight[cornerOf(map, tile)]! / 15) * 0.5;

    const base = tile * 4;
    out[base] = colour.r * shade;
    out[base + 1] = colour.g * shade;
    out[base + 2] = colour.b * shade;
    out[base + 3] = 255;
  }

  if (mode === MinimapMode.CargoFlow) paintMarkers(map, out, markers);
  if (mode === MinimapMode.Flow) paintFlows(map, out, flows, companies);
}

/** North corner of a tile, which is the height the ground reads as. */
function cornerOf(map: TileMap, tile: number): number {
  const x = tile % map.size;
  const y = (tile / map.size) | 0;
  return y * (map.size + 1) + x;
}

function colourFor(map: TileMap, tile: number, mode: MinimapMode, companies: readonly Rgb[]): Rgb {
  const terrain = TERRAIN_RGB[map.terrain[tile]!] ?? TERRAIN_RGB[0]!;

  switch (mode) {
    case MinimapMode.Network:
      if (map.trackBits[tile] !== 0) return RAIL;
      if (map.roadBits[tile] !== 0) return ROAD;
      return dim(terrain);

    case MinimapMode.Owner: {
      const owner = map.owner[tile]!;
      if (owner === TILE_PUBLIC) {
        // Public ground that carries something is a town's own street; empty
        // ground is nobody's. Both are grey, and only one of them is dark.
        return map.roadBits[tile] !== 0 ? UNSERVED : dim(terrain);
      }
      return companies[owner] ?? UNSERVED;
    }

    case MinimapMode.CargoFlow:
    case MinimapMode.Flow:
      // The markers respectively the flow lines are painted over this; the
      // ground behind them is dimmed so they are the only bright thing.
      return dim(terrain);

    case MinimapMode.Contours: {
      const height = map.cornerHeight[cornerOf(map, tile)]!;
      // A line every three levels. Contours are what turn a green blur into a
      // landscape you can plan a railway across.
      if (map.terrain[tile] !== Terrain.Water && height % 3 === 0 && height > SEA_LEVEL) {
        return CONTOUR;
      }
      return terrain;
    }

    default:
      return terrain;
  }
}

function dim(colour: Rgb): Rgb {
  return { r: colour.r * 0.45, g: colour.g * 0.45, b: colour.b * 0.45 };
}

/**
 * Stations and industries, brightest where most is happening.
 *
 * This was what "Frachtfluss" could honestly mean before M14: a flow needs
 * two endpoints and a rate, and until D-176 the simulation measured neither.
 * Now that it does, the measured legs live in their own Flow mode; THIS mode
 * keeps answering the question it always answered - where cargo piles up and
 * how hard each works is running - which is why both exist (D-177).
 */
function paintMarkers(map: TileMap, out: Uint8ClampedArray, markers: MinimapMarkers): void {
  for (let i = 0; i < markers.industryTiles.length; i++) {
    const level = markers.industryLevels[i] ?? 0;
    const strength = Math.min(1, level / 200);
    blot(map, out, markers.industryTiles[i]!, 1, {
      r: 90 + strength * 130,
      g: 200,
      b: 90,
    });
  }
  for (let i = 0; i < markers.stationTiles.length; i++) {
    const waiting = markers.stationWaiting[i] ?? 0;
    const strength = Math.min(1, waiting / 400);
    blot(map, out, markers.stationTiles[i]!, 1, {
      r: 240,
      g: 230 - strength * 190,
      b: 60,
    });
  }
}

/**
 * The measured legs as lines between station pixels (SPEC2 M14, D-177).
 *
 * Straight lines rather than the map view's arcs: at one pixel per tile the
 * two directions of a pair land on the same pixels anyway, and a curve would
 * cost precision without adding a fact. Brightness carries the volume - the
 * brightest leg is the biggest flow in the picture, everything else scales
 * against it with a floor so a thin flow stays visible. Colour is the owning
 * company's; a leg nobody drove yet is a faint neutral grey. Station
 * endpoints are blotted last so the nodes of the network sit over the lines.
 */
function paintFlows(
  map: TileMap,
  out: Uint8ClampedArray,
  flows: MinimapFlows,
  companies: readonly Rgb[],
): void {
  let maxVolume = 1;
  for (let i = 0; i < flows.volumes.length; i++) {
    if (flows.volumes[i]! > maxVolume) maxVolume = flows.volumes[i]!;
  }

  for (let i = 0; i < flows.fromTiles.length; i++) {
    const owner = flows.owners[i] ?? -1;
    const base =
      owner >= 0 ? (companies[owner % companies.length] ?? FLOW_LINE_ESTIMATE) : FLOW_LINE_ESTIMATE;
    const strength =
      FLOW_LINE_MIN_STRENGTH + (1 - FLOW_LINE_MIN_STRENGTH) * ((flows.volumes[i] ?? 0) / maxVolume);
    const colour: Rgb = { r: base.r * strength, g: base.g * strength, b: base.b * strength };
    drawTileLine(map, out, flows.fromTiles[i]!, flows.toTiles[i]!, colour);
  }

  for (let i = 0; i < flows.fromTiles.length; i++) {
    blot(map, out, flows.fromTiles[i]!, 1, { r: 240, g: 244, b: 248 });
    blot(map, out, flows.toTiles[i]!, 1, { r: 240, g: 244, b: 248 });
  }
}

/** Bresenham between two tile indices, writing one pixel per visited tile. */
function drawTileLine(
  map: TileMap,
  out: Uint8ClampedArray,
  fromTile: number,
  toTile: number,
  colour: Rgb,
): void {
  const size = map.size;
  let x0 = fromTile % size;
  let y0 = (fromTile / size) | 0;
  const x1 = toTile % size;
  const y1 = (toTile / size) | 0;

  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < size && y0 < size) {
      const base = (y0 * size + x0) * 4;
      out[base] = colour.r;
      out[base + 1] = colour.g;
      out[base + 2] = colour.b;
      out[base + 3] = 255;
    }
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * err;
    if (doubled >= dy) {
      err += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * What the map view sees, as the minimap needs to know it (SPEC2 M12).
 *
 * Pushed by `MapView` whenever the camera actually moved - centre, zoom or
 * screen size - and change-detected there, so an idle frame publishes
 * nothing. The panel turns it into the viewport outline; `paintMinimap`
 * never sees it, which is what keeps the painter pure and the save
 * thumbnail free of interface chrome (D-112).
 */
export interface CameraView {
  /** Camera centre in unzoomed world pixels. */
  readonly centreX: number;
  readonly centreY: number;
  readonly zoom: number;
  /** Canvas size in screen pixels. */
  readonly screenW: number;
  readonly screenH: number;
}

/** One corner of the projected viewport, in fractional tile coordinates. */
export interface TileCorner {
  readonly x: number;
  readonly y: number;
}

/**
 * The camera's viewport as a quadrilateral in tile space.
 *
 * A screen rectangle is NOT a rectangle on the minimap: the projection is
 * dimetric, so the view maps to a diamond over the tile grid. Drawing the
 * honest quad instead of its bounding box is the difference between "this is
 * what you see" and a frame twice the viewport's area. The four screen
 * corners are back-projected at height zero - the same assumption the
 * culling in `MapView.visibleTileBounds` makes - in the order top-left,
 * top-right, bottom-right, bottom-left.
 */
export function minimapViewQuad(camera: CameraView): readonly TileCorner[] {
  const halfW = camera.screenW / 2 / camera.zoom;
  const halfH = camera.screenH / 2 / camera.zoom;
  const corners: TileCorner[] = [];
  for (const [sx, sy] of [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ] as const) {
    corners.push(worldToTileAtHeight(camera.centreX + sx, camera.centreY + sy, 0));
  }
  return corners;
}

/** A small square, because one pixel on a 1024 map is invisible. */
function blot(
  map: TileMap,
  out: Uint8ClampedArray,
  tile: number,
  radius: number,
  colour: Rgb,
): void {
  const size = map.size;
  const x = tile % size;
  const y = (tile / size) | 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const base = (py * size + px) * 4;
      out[base] = colour.r;
      out[base + 1] = colour.g;
      out[base + 2] = colour.b;
      out[base + 3] = 255;
    }
  }
}
