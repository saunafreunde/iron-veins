import { WEATHER_CELL_COUNT, WEATHER_GRID_SIZE, WEATHER_REGION_COUNT } from '../constants';

/**
 * The weather field of SPEC2 M18: 16x16 region cells, one {@link WeatherCell}
 * each.
 *
 * It is SIM REALITY (E-01), not render candy: the cells are saved, hashed and
 * migrated like any other world state, and the renderer sees them only through
 * the snapshot block. Weather that lived on the render side would be weather
 * that lies - it rains and nothing costs anything - and weather the simulation
 * kept without hashing would break architecture law #3 the first time a save
 * was reloaded.
 *
 * The whole field is preallocated at world creation and never grows (law #7):
 * the grid is 16x16 whatever the map size, so a 64 map and a 2048 map carry
 * the same 256 bytes and the daily pass allocates nothing per region - only
 * the day's RNG stream.
 *
 * `next` and `weights` are working buffers, not state. `next` exists because
 * the pass reads the PREVIOUS day's neighbours while it writes the new day:
 * without it the result would depend on the order the grid is walked in, which
 * is exactly the "iteration order as logic" law #3 forbids.
 */
export class WeatherField {
  /** One {@link WeatherCell} per region, row major. Saved and hashed. */
  readonly cells = new Uint8Array(WEATHER_REGION_COUNT);
  /** Destination of one day's pass; copied over {@link cells} at the end. */
  readonly next = new Uint8Array(WEATHER_REGION_COUNT);
  /** Per-cell weights of the single draw the pass makes for one region. */
  readonly weights = new Float64Array(WEATHER_CELL_COUNT);
  /**
   * Regions where a storm ARRIVED in the pass that just ran, and how many of
   * them there are (SPEC2 M18: "Sturmwarnung je Region via postOnce").
   *
   * A working buffer like `next`, not state: it is written by the daily pass
   * and read by the daily news report a few calls later in the SAME tick, and
   * nothing outside that tick may look at it. Both its inputs - yesterday's
   * field and today's - are saved, so a world that is loaded warns about
   * exactly the storms a world that kept running would.
   *
   * `arrivalCount` stays 0 for ever in a world with the rule off, because
   * `updateWeather` returns before it is touched: the report then returns on
   * its own first line and the whole subsystem stays inert (D-200).
   */
  readonly arrivals = new Uint8Array(WEATHER_REGION_COUNT);
  arrivalCount = 0;

  /** Overwrite the field from a save. Length is checked by the parser. */
  load(saved: Uint8Array): void {
    this.cells.set(saved);
  }
}

/**
 * Which region a tile lies in.
 *
 * The one place the 16x16 grid is related to the map, so that a rule reading
 * the weather over a vehicle and a renderer drawing rain over that vehicle
 * cannot disagree about where the front is. Integer division of the tile
 * coordinate scaled by the grid size: the map is cut into 16 equal columns and
 * rows, and the last one absorbs the remainder of a size that is not a
 * multiple of 16 (every legal map size is a power of two at or above 64, so
 * there is none).
 */
export function weatherRegionOf(tileX: number, tileY: number, mapSize: number): number {
  const column = ((tileX * WEATHER_GRID_SIZE) / mapSize) | 0;
  const row = ((tileY * WEATHER_GRID_SIZE) / mapSize) | 0;
  return row * WEATHER_GRID_SIZE + column;
}
