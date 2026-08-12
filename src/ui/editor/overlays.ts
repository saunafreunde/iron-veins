import {
  CLIMATE_BASE_TEMPERATURE_C,
  CLIMATE_LATITUDE_RANGE_C,
  MAX_HEIGHT,
  SEA_LEVEL,
  TEMPERATURE_LAPSE_C_PER_LEVEL,
  type MapClimate,
} from '../../sim/constants';
import type { TileMap } from '../../sim/map/TileMap';
import { moistureOfTerrain, tileTemperatureC } from '../../sim/mapgen/climateField';
import { radiusForModuleCount, withinCatchment } from '../../sim/station/types';
import { UI_COLORS } from '../../shared/palette';

/**
 * The workshop's four debug overlays (SPEC2 M22): temperature, moisture,
 * landmass and catchment, on the F-overlay pattern of M4's block view, M14's
 * flow atlas and M15's heat map.
 *
 * **They are pure recomputes and never state**, which is the whole of what
 * SPEC2 asks for here and the reason this module has the shape it has:
 *
 *  - one exported function, from a world to a colour field, with no branch on
 *    anything but its arguments;
 *  - it WRITES nothing - not into the map, not into the store, not into a
 *    module-level cache. The one array it may reuse is handed IN by the
 *    caller, so a test can prove reuse and freshness are the same answer;
 *  - nothing it produces is saved, hashed or sent to the simulation (Z1: this
 *    is pixels, and pixels are a pure function of snapshot-side fields).
 *
 * The output is one packed `0xAARRGGBB` per tile, row major, with **0 meaning
 * "paint nothing"** - an overlay is a thing you look THROUGH, and a tile the
 * overlay has no reading for has to stay the world. Packing the alpha into the
 * value rather than carrying a second array is what keeps the renderer's job
 * to a bounded walk and a fill: `MapView` never learns what any of these four
 * overlays MEAN.
 */

export const EDITOR_OVERLAYS = ['temperature', 'moisture', 'landmass', 'catchment'] as const;
export type EditorOverlay = (typeof EDITOR_OVERLAYS)[number];

/** What the catchment overlay needs of a station: its centre and its size. */
export interface OverlayStation {
  readonly x: number;
  readonly y: number;
  /** Module count - the ONE input `radiusForModuleCount` takes (section 10). */
  readonly moduleCount: number;
}

/**
 * Opacity every overlay paints at. [1]
 *
 * Origin: `HEAT_ALPHA_MAX` (0.75) is what the utilisation map uses at its
 * loudest and it hides the rails under it; a debug overlay is read AGAINST the
 * terrain it describes - a temperature band means nothing without the mountain
 * it sits on - so this is deliberately below the heat map's quietest step.
 */
export const OVERLAY_ALPHA = 0.55;

/**
 * The span the temperature ramp covers. [degC]
 *
 * Derived rather than chosen: the coldest tile the game can hold is the
 * coldest climate's southern edge at the summit, the warmest is the warmest
 * climate's northern edge at sea level. A ramp with hand-picked ends would
 * either clip the arctic or waste half its range on temperatures no map has.
 */
export const OVERLAY_TEMPERATURE_MIN_C =
  Math.min(...CLIMATE_BASE_TEMPERATURE_C) -
  Math.max(...CLIMATE_LATITUDE_RANGE_C) / 2 -
  (MAX_HEIGHT - SEA_LEVEL) * TEMPERATURE_LAPSE_C_PER_LEVEL;
export const OVERLAY_TEMPERATURE_MAX_C =
  Math.max(...CLIMATE_BASE_TEMPERATURE_C) + Math.max(...CLIMATE_LATITUDE_RANGE_C) / 2;

function parseTint(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Cold, mild and hot - one ramp, three stops. */
const TEMPERATURE_STOPS: readonly number[] = [0x2b6fd0, 0xe8e0c0, 0xd04020];
/** Dry, damp and wet. */
const MOISTURE_STOPS: readonly number[] = [0xc8a860, 0x9ec86a, 0x2b8fa8];

/**
 * Colours the landmass overlay cycles through.
 *
 * A land mass has an ARBITRARY integer label (`computeLandmasses` numbers them
 * in scan order), so there is nothing to interpolate along - what the author
 * needs to see is which shores belong to one another. Eight well separated
 * hues, indexed by the label: two masses more than eight apart can share a
 * colour, and the overlay says so in its own caption rather than pretending to
 * a bijection it cannot have.
 */
const LANDMASS_COLORS: readonly number[] = [
  0x4caf7d, 0xe0b040, 0x5a8fd0, 0xd06a90, 0x9a70d0, 0x50b8b0, 0xc07040, 0x88a840,
];

/** Linear blend of two packed RGB colours, per channel. */
function mix(from: number, to: number, t: number): number {
  const r = ((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * t;
  const g = ((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * t;
  const b = (from & 0xff) + ((to & 0xff) - (from & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Colour for a 0..1 reading along a stop list; values outside clamp. */
export function rampColor(stops: readonly number[], fraction: number): number {
  const t = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const spans = stops.length - 1;
  const scaled = t * spans;
  const index = scaled >= spans ? spans - 1 : Math.floor(scaled);
  return mix(stops[index]!, stops[index + 1]!, scaled - index);
}

/** Pack a colour and the overlay's fixed opacity into one painted cell. */
function painted(color: number): number {
  return ((Math.round(OVERLAY_ALPHA * 255) & 0xff) << 24) | (color & 0xff_ffff) | 0;
}

/** The alpha of a packed cell, 0..1 - the renderer's half of {@link painted}. */
export function overlayAlpha(packed: number): number {
  return ((packed >>> 24) & 0xff) / 255;
}

/** The colour of a packed cell. */
export function overlayColor(packed: number): number {
  return packed & 0xff_ffff;
}

/**
 * Paint one overlay over the whole map.
 *
 * `out` is reused when it is the right length; otherwise a fresh array is
 * allocated. Reuse is the caller's optimisation and changes nothing about the
 * result - the function fills every cell it does not paint with 0, so a stale
 * buffer cannot leak the previous overlay through.
 */
export function computeEditorOverlay(
  kind: EditorOverlay,
  map: TileMap,
  climate: MapClimate,
  stations: readonly OverlayStation[],
  out?: Int32Array,
): Int32Array {
  const size = map.size;
  const tiles = size * size;
  const field = out !== undefined && out.length === tiles ? out : new Int32Array(tiles);
  field.fill(0);

  switch (kind) {
    case 'temperature':
      paintTemperature(field, map, climate);
      return field;
    case 'moisture':
      paintMoisture(field, map);
      return field;
    case 'landmass':
      paintLandmass(field, map);
      return field;
    case 'catchment':
      paintCatchment(field, map, stations);
      return field;
  }
}

/**
 * Temperature, from the generator's own expression at the tile's CURRENT
 * height. Water is left unpainted: the sea has no lapse rate to read and a
 * blue ocean under a blue overlay says nothing.
 *
 * "Water" here is `Terrain.Water`, which is what the moisture overlay reads
 * and what `computeLandmasses` labels around - so all three overlays agree
 * about where the water is, whatever the corners under a generated mountain
 * river happen to say (bundle 1's named residual, D-240).
 */
function paintTemperature(field: Int32Array, map: TileMap, climate: MapClimate): void {
  const size = map.size;
  const span = OVERLAY_TEMPERATURE_MAX_C - OVERLAY_TEMPERATURE_MIN_C;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (map.isWater(x, y)) continue;
      const celsius = tileTemperatureC(y, size, climate, map.baseHeight(x, y));
      field[y * size + x] = painted(
        rampColor(TEMPERATURE_STOPS, (celsius - OVERLAY_TEMPERATURE_MIN_C) / span),
      );
    }
  }
}

/** Moisture, as the band each terrain implies (`moistureOfTerrain`). */
function paintMoisture(field: Int32Array, map: TileMap): void {
  // Flat over the tile index: the moisture reading needs no coordinates.
  for (let index = 0; index < field.length; index++) {
    const moisture = moistureOfTerrain(map.terrain[index]!);
    if (moisture < 0) continue;
    field[index] = painted(rampColor(MOISTURE_STOPS, moisture));
  }
}

/**
 * The land masses, read from the DERIVED layer the simulation maintains.
 *
 * Deliberately a read and not a re-labelling: `computeLandmasses` writes into
 * `map.landmassId`, and an overlay that wrote into the shared map would be a
 * second author of state - the one thing the F-overlay pattern exists to avoid
 * (D-054's rule, one layer up). Water carries the label -1 and stays clear.
 */
function paintLandmass(field: Int32Array, map: TileMap): void {
  for (let index = 0; index < field.length; index++) {
    const label = map.landmassId[index]!;
    if (label < 0) continue;
    field[index] = painted(LANDMASS_COLORS[label % LANDMASS_COLORS.length]!);
  }
}

/**
 * What the stations of the world actually reach.
 *
 * Green where exactly one station serves a tile, amber where two or more do -
 * an overlap is not an error but it IS the thing an author is looking for,
 * because two stations sharing a town's houses split what the town offers. The
 * circle is `withinCatchment`, the simulation's own, so the picture and the
 * catchment cannot disagree.
 */
function paintCatchment(
  field: Int32Array,
  map: TileMap,
  stations: readonly OverlayStation[],
): void {
  const size = map.size;
  const single = painted(parseTint(UI_COLORS.success));
  const shared = painted(parseTint(UI_COLORS.warning));
  const counts = new Uint8Array(field.length);

  for (const station of stations) {
    const radius = radiusForModuleCount(station.moduleCount);
    const minX = Math.max(0, station.x - radius);
    const maxX = Math.min(size - 1, station.x + radius);
    const minY = Math.max(0, station.y - radius);
    const maxY = Math.min(size - 1, station.y + radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!withinCatchment(station.x, station.y, radius, x, y)) continue;
        const index = y * size + x;
        if (counts[index]! < 2) counts[index] = counts[index]! + 1;
      }
    }
  }

  for (let index = 0; index < field.length; index++) {
    const count = counts[index]!;
    if (count === 0) continue;
    field[index] = count === 1 ? single : shared;
  }
}
