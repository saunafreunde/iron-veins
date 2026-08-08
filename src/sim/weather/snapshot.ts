import { SNAPSHOT_WEATHER_CELLS } from '../../shared/snapshot';
import { WEATHER_REGION_COUNT, WeatherRule } from '../constants';
import type { WeatherField } from './field';

/**
 * The weather block of the render snapshot (SPEC2 M18, the milestone's one
 * booked layout change).
 *
 * The renderer reads the field ONLY from here (E-01): rain, snow and storm
 * effects are a pure function of these 256 numbers plus the deterministic
 * blink counter, never of a render-side simulation of their own
 * (Fehlerkatalog 39).
 *
 * A world with the rule off publishes a count of ZERO rather than 256 clear
 * cells. Both fields are all-clear, but only one of them is a world where the
 * sky can ever change, and the renderer should be able to tell the difference
 * without inspecting the block.
 *
 * Written from the ONE publish pass with every other block (Fehler 33), and
 * allocation-free like the rest of it.
 */
export function writeWeatherBlock(
  rule: WeatherRule,
  field: WeatherField,
  block: Int32Array,
): number {
  if (rule === WeatherRule.Off) return 0;

  const cells = field.cells;
  const written =
    WEATHER_REGION_COUNT < SNAPSHOT_WEATHER_CELLS ? WEATHER_REGION_COUNT : SNAPSHOT_WEATHER_CELLS;
  for (let at = 0; at < written; at++) block[at] = cells[at]!;
  return written;
}
