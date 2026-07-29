import { COMPANY_COLORS, COMPANY_COLORS_CVD, TERRAIN_COLORS } from '../shared/palette';
import { SEA_LEVEL, TILE_PUBLIC } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { Terrain } from '../sim/map/terrain';

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
} as const;
export type MinimapMode = (typeof MinimapMode)[keyof typeof MinimapMode];

export const MINIMAP_MODE_COUNT = 5;

/** Translation keys for the mode buttons, indexed by MinimapMode. */
export const MINIMAP_MODE_KEYS: readonly string[] = [
  'ui.minimap.terrain',
  'ui.minimap.network',
  'ui.minimap.owner',
  'ui.minimap.cargo',
  'ui.minimap.contours',
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
  options: { readonly colorBlind?: boolean; readonly markers?: MinimapMarkers } = {},
): void {
  const size = map.size;
  const companies = options.colorBlind === true ? COMPANY_RGB_CVD : COMPANY_RGB;
  const markers = options.markers ?? NO_MARKERS;

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
      // The markers are painted over this; the ground behind them is dimmed so
      // they are the only bright thing in the view.
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
 * This is what "Frachtfluss" can honestly mean with the data the game keeps: a
 * flow needs two endpoints and a rate, and the simulation measures neither per
 * tile. What it does know is where cargo is piling up and how hard each works
 * is running, and that is the same question answered from the other side.
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

/** A small square, because one pixel on a 1024 map is invisible. */
function blot(map: TileMap, out: Uint8ClampedArray, tile: number, radius: number, colour: Rgb): void {
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
