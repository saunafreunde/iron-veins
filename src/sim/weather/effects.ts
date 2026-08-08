import { WeatherCell, WeatherRule } from '../constants';
import type { IndustryType } from '../industry/types';
import type { World } from '../World';
import { weatherRegionOf } from './field';
import { calendarMonthOf, seasonalOutputFactor, winterFrictionFactor } from './seasons';

/**
 * The seams at which weather and season reach the simulation (SPEC2 M18).
 *
 * SPEC2's sentence is the design: "sim effects exclusively as multiplier
 * lookups at existing seams". Every function here answers with a NUMBER that
 * some already-existing line multiplies into an already-existing quantity -
 * the rolling resistance and drag coefficients of the longitudinal solver, the
 * breakdown threshold of section 11.3, the daily cargo expiry share of section
 * 7.4 and the monthly output of section 7.3. Not one of them writes anything,
 * draws anything or remembers anything, and there is no sixth.
 *
 * **This file is the ONE gate on the weather rule.** Every function returns
 * the exact identity on its first line for a world with the rule off, so a
 * pre-M18 save behaves exactly as it did - `x * 1 === x` is exact in
 * IEEE-754, so this is a property of the arithmetic rather than a promise. It
 * also means the gate is the RULE and never the FIELD: a world with the rule
 * off whose cells were somehow filled with storms is still a world in which
 * nothing costs anything, which is what makes the off path provable rather
 * than merely unlikely.
 *
 * **Nothing here spends randomness.** The sky was drawn once for the day by
 * `updateWeather` from the named weather stream; the season draws nothing at
 * all, ever. The breakdown seam in particular is a THRESHOLD multiplier and
 * only that: the roll it modulates is the same single `nextFloat` per eligible
 * vehicle per game day it has been since M6, so switching the rule on cannot
 * move the shared gameplay stream by one draw (Z3, Fehlerkatalog 25).
 */

/**
 * The sky over a tile - `WeatherCell.Clear` for a world with the rule off.
 *
 * The one door onto the field for everything but the renderer, so the region a
 * cost is charged for and the region the rain is drawn over cannot come apart
 * (`weatherRegionOf` is the one place the 16x16 grid meets the map).
 */
export function weatherCellAt(world: World, tileIndex: number): WeatherCell {
  if (world.weather === WeatherRule.Off) return WeatherCell.Clear;
  const size = world.map.size;
  const region = weatherRegionOf(tileIndex % size, (tileIndex / size) | 0, size);
  return world.weatherField.cells[region]! as WeatherCell;
}

/**
 * The SEASON's multiplier on the rolling resistance coefficient over a tile;
 * exactly 1 for a world with the rule off.
 *
 * Separate from the sky's own factor because they are different statements
 * about the same coefficient - a frosty morning is weather, a hard January is
 * the season - and the solver multiplies both.
 *
 * The ground's own height, not `railHeight`: this asks how far up the mountain
 * the vehicle is, and a bridge deck over a valley is not a mountain. It is
 * also the height the renderer's snow line will read, so what the simulation
 * charges for and what the player sees under the wheels stay the same fact.
 */
export function winterFrictionAt(world: World, tileIndex: number): number {
  if (world.weather === WeatherRule.Off) return 1;
  const size = world.map.size;
  const x = tileIndex % size;
  const y = (tileIndex / size) | 0;
  return winterFrictionFactor(
    calendarMonthOf(world.tick),
    world.map.baseHeight(x, y),
    world.climate,
  );
}

/**
 * The season's multiplier on one industry's monthly output; exactly 1 for a
 * world with the rule off, and exactly 1 for every industry type but the farm
 * and the forestry whatever the rule.
 *
 * Read at the industry's own tile, so a farm in the hills has a shorter
 * growing season than one on the shore of the same map.
 */
export function seasonalOutputAt(world: World, type: IndustryType, x: number, y: number): number {
  if (world.weather === WeatherRule.Off) return 1;
  return seasonalOutputFactor(
    type,
    calendarMonthOf(world.tick),
    world.map.baseHeight(x, y),
    world.climate,
  );
}
