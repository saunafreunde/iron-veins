import {
  ALPINE_HEIGHT,
  ALPINE_TEMPERATURE_C,
  CLIMATE_MOISTURE_BIAS,
  DESERT_MOISTURE_MAX,
  DESERT_TEMPERATURE_C,
  FOREST_MOISTURE_MIN,
  GRASS_MOISTURE_MIN,
  MARSH_MOISTURE_MIN,
  MOISTURE_NOISE_OCTAVES,
  MOISTURE_NOISE_WAVELENGTH,
  SEA_LEVEL,
  SNOW_TEMPERATURE_C,
  TEMPERATURE_LAPSE_C_PER_LEVEL,
  TERRAIN_NOISE_LACUNARITY,
  TERRAIN_NOISE_PERSISTENCE,
  type MapClimate,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { slopeRise, Terrain } from '../map/terrain';
import type { Rng } from '../rng';
import { temperatureAtSeaLevel } from './climateField';
import { SimplexNoise2D } from './noise';

/**
 * Step 4 of section 6: temperature from latitude and altitude, moisture from an
 * independent noise field, biome from the pair.
 *
 * The two per-tile READINGS - the temperature expression and the moisture
 * bands - live in `climateField.ts`, which this module and the workshop's
 * debug overlays (SPEC2 M22) share. There is one definition of each.
 */

/**
 * Assign a terrain type to every land tile. Water and coast are left alone -
 * they were decided by the hydrology step.
 */
export function assignBiomes(map: TileMap, rng: Rng, climate: MapClimate): void {
  const size = map.size;
  const noise = new SimplexNoise2D(rng);
  const scale = 1 / (size * MOISTURE_NOISE_WAVELENGTH);
  const moistureBias = CLIMATE_MOISTURE_BIAS[climate]!;
  const terrain = map.terrain;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      if (terrain[index] === Terrain.Water) continue;

      const height = map.baseHeight(x, y);
      const temperature =
        temperatureAtSeaLevel(y, size, climate) -
        (height - SEA_LEVEL) * TEMPERATURE_LAPSE_C_PER_LEVEL;

      const rawMoisture = noise.fractal(
        x * scale,
        y * scale,
        MOISTURE_NOISE_OCTAVES,
        TERRAIN_NOISE_PERSISTENCE,
        TERRAIN_NOISE_LACUNARITY,
      );
      let moisture = (rawMoisture + 1) * 0.5 + moistureBias;
      if (moisture < 0) moisture = 0;
      if (moisture > 1) moisture = 1;

      terrain[index] = classifyBiome(height, temperature, moisture, map.slopeAt(x, y));
    }
  }
}

/**
 * The biome table itself, ordered from the most decisive rule downwards.
 *
 * Exported under its own name so the workshop's moisture overlay can be held
 * against it: `moistureOfTerrain` states the band each terrain implies, and the
 * overlay test feeds every band back through this function and expects the
 * terrain back. A table read in two directions is a table that cannot drift.
 */
export function classifyBiome(
  height: number,
  temperature: number,
  moisture: number,
  slope: number,
): number {
  if (height >= ALPINE_HEIGHT) {
    return temperature <= ALPINE_TEMPERATURE_C ? Terrain.Snow : Terrain.Rock;
  }
  if (temperature <= SNOW_TEMPERATURE_C) return Terrain.Snow;
  if (temperature <= ALPINE_TEMPERATURE_C) return Terrain.Rock;

  // Anything genuinely steep is bare rock whatever the climate says.
  if (slopeRise(slope) > 0 && height >= ALPINE_HEIGHT - 3) return Terrain.Rock;

  if (temperature >= DESERT_TEMPERATURE_C && moisture < DESERT_MOISTURE_MAX) {
    return Terrain.Desert;
  }
  if (moisture >= MARSH_MOISTURE_MIN) return Terrain.Marsh;
  if (moisture >= FOREST_MOISTURE_MIN) return Terrain.Forest;
  if (moisture >= GRASS_MOISTURE_MIN) return Terrain.Grass;
  return Terrain.Field;
}
