import {
  CLIMATE_BASE_TEMPERATURE_C,
  CLIMATE_LATITUDE_RANGE_C,
  DESERT_MOISTURE_MAX,
  FOREST_MOISTURE_MIN,
  GRASS_MOISTURE_MIN,
  MARSH_MOISTURE_MIN,
  SEA_LEVEL,
  TEMPERATURE_LAPSE_C_PER_LEVEL,
  type MapClimate,
} from '../constants';
import { Terrain } from '../map/terrain';

/**
 * The two climate readings of a tile, as pure arithmetic over map state.
 *
 * Split out of `climate.ts` for one reason and it is a budget one: the biome
 * step needs the noise generator, and the scenario workshop's debug overlays
 * (SPEC2 M22) need only these two functions. A leaf module keeps
 * `SimplexNoise2D` out of the interface chunk while leaving exactly ONE
 * definition of each reading - `assignBiomes` calls
 * {@link temperatureAtSeaLevel} here, and the overlay calls
 * {@link tileTemperatureC}, which is the same expression the generator applies
 * per tile.
 *
 * Nothing here draws, allocates or writes. Both readings are functions of the
 * map as it stands NOW, which is what makes them honest inside a workshop: an
 * author who raises a mountain sees the temperature fall on the next repaint,
 * because the generator's own lapse rate is what is being read back.
 */

/** Sea level temperature at a given row of the map. [degC] */
export function temperatureAtSeaLevel(y: number, size: number, climate: MapClimate): number {
  const base = CLIMATE_BASE_TEMPERATURE_C[climate]!;
  const range = CLIMATE_LATITUDE_RANGE_C[climate]!;
  // The northern edge (y = 0) is the warm one, matching the map orientation
  // where the camera looks north-east.
  return base + range * (0.5 - y / size);
}

/**
 * Temperature of one tile, from its row and its height. [degC]
 *
 * The expression `assignBiomes` uses, with the tile's CURRENT height rather
 * than the generated one - the workshop moves ground, and a reading that
 * remembered the genesis height would be describing a map nobody has.
 */
export function tileTemperatureC(
  y: number,
  size: number,
  climate: MapClimate,
  height: number,
): number {
  return (
    temperatureAtSeaLevel(y, size, climate) - (height - SEA_LEVEL) * TEMPERATURE_LAPSE_C_PER_LEVEL
  );
}

/**
 * The moisture a terrain type implies, or -1 where it implies none. [1]
 *
 * **This is a reading of the MAP, not a replay of the generator's noise
 * field**, and the difference is worth stating rather than glossing. The
 * moisture that decided a biome at genesis came out of a `SimplexNoise2D`
 * seeded from the world's generator stream; that stream has been spent, the
 * field was never saved (it decides nothing after genesis, so saving it would
 * be state without a reader), and the moment an author paints a wood or digs a
 * river the field would be describing terrain that is no longer there.
 *
 * So the overlay answers the question an author actually has - "how wet does
 * this ground read?" - by inverting the generator's own classification table:
 * every band below is bounded by the same `constants.ts` thresholds
 * `classify()` compares against, and the value returned is the middle of the
 * band. `tests/unit/editorOverlays.spec.ts` feeds each value back through
 * `classifyBiome` and gets the terrain back, so the two cannot drift.
 *
 * Snow, rock, water, coast and town ground carry no reading: the first two are
 * decided by TEMPERATURE and height, the next two are not land, and the last
 * one is what a town did to whatever was underneath.
 */
export function moistureOfTerrain(terrain: number): number {
  switch (terrain) {
    case Terrain.Marsh:
      return (MARSH_MOISTURE_MIN + 1) / 2;
    case Terrain.Forest:
      return (FOREST_MOISTURE_MIN + MARSH_MOISTURE_MIN) / 2;
    case Terrain.Grass:
      return (GRASS_MOISTURE_MIN + FOREST_MOISTURE_MIN) / 2;
    case Terrain.Field:
      return GRASS_MOISTURE_MIN / 2;
    case Terrain.Desert:
      return DESERT_MOISTURE_MAX / 2;
    default:
      return -1;
  }
}
