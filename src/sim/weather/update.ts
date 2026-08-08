import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  TICKS_PER_DAY,
  WEATHER_BASE_WEIGHT,
  WEATHER_CELL_COUNT,
  WEATHER_GRID_SIZE,
  WEATHER_HEAT_SEASON,
  WEATHER_NEIGHBOUR_PULL,
  WEATHER_PERSISTENCE,
  WEATHER_STREAM_NAME,
  WeatherCell,
  WeatherRule,
} from '../constants';
import { streamSalt } from '../rng';
import type { World } from '../World';
import { frostSeasonFactor } from './seasons';

/**
 * Advance the weather field by one game day (SPEC2 M18, E-01).
 *
 * Called from the daily hook, before anything that could read the sky, so a
 * rule looking up a multiplier during the day it belongs to finds today's
 * weather rather than yesterday's.
 *
 * **A world with the rule off returns on the first line.** Nothing is drawn,
 * nothing is written and no stream is even constructed, so the field stays
 * all-clear for ever and every tick of such a world costs exactly what it cost
 * before M18. That inertness is what lets the rule ship off by default without
 * re-banding the balance suite (Fehlerkatalog 34).
 *
 * **The randomness comes from the named weather stream and never from
 * `world.rng`** (Z3, D-106/D-128). The salt is the stream's own name folded
 * with the game day: the name keeps it from colliding with another system's
 * stream by an accident of call order, and the day is what makes each
 * invocation a different sequence (the tender review's precedent, which folds
 * the tick). The shared gameplay stream therefore sees exactly the sequence it
 * saw before weather existed, which is why switching the rule on cannot move a
 * single breakdown roll.
 *
 * **The draw count is fixed at one per region per day**, whatever the field
 * holds and whatever the rule is. A pass whose number of draws depended on the
 * weather would make the stream's position a function of the state it is
 * generating, which is the shape of bug Z3's identical-draw-count clause
 * exists to forbid.
 *
 * The pass allocates the day's generator and nothing per region (D-128 permits
 * a hook its stream and forbids it on the per-tick path); everything else works
 * in preallocated buffers (law #7). Measured in `weather.spec.ts`: 136 B per
 * game day with the rule on and 0.18 B with it off, against a per-region
 * control of 17.5 kB.
 */
export function updateWeather(world: World): void {
  if (world.weather === WeatherRule.Off) return;

  const field = world.weatherField;
  const cells = field.cells;
  const next = field.next;
  const weights = field.weights;
  const arrivals = field.arrivals;
  let arrivalCount = 0;

  // The calendar without allocating a GameDate: this runs every game day, and
  // `World.date` builds an object every time it is read.
  const day = (world.tick / TICKS_PER_DAY) | 0;
  const month = ((day % DAYS_PER_YEAR) / DAYS_PER_MONTH) | 0;

  const base = WEATHER_BASE_WEIGHT[world.weather]!;
  // Both gates are looked up ONCE for the day, outside the region loop: they
  // depend on the calendar and the world's climate and on nothing a region
  // holds. The frost gate is the season's own winter curve (D-204), so a
  // tropical January cannot freeze and an arctic one freezes harder and for
  // longer; the heat gate is still a bare month table and `WEATHER_HEAT_SEASON`
  // says why.
  const frostGate = frostSeasonFactor(month, world.climate);
  const heatGate = WEATHER_HEAT_SEASON[month]!;
  const stream = world.streamFor((streamSalt(WEATHER_STREAM_NAME) + day) | 0);

  for (let row = 0; row < WEATHER_GRID_SIZE; row++) {
    for (let column = 0; column < WEATHER_GRID_SIZE; column++) {
      const at = row * WEATHER_GRID_SIZE + column;

      // Yesterday's neighbours, four-connected. Read from `cells`, written to
      // `next`, so the answer does not depend on the walk order (law #3).
      let wet = 0;
      if (column > 0) wet += wetness(cells[at - 1]!);
      if (column < WEATHER_GRID_SIZE - 1) wet += wetness(cells[at + 1]!);
      if (row > 0) wet += wetness(cells[at - WEATHER_GRID_SIZE]!);
      if (row < WEATHER_GRID_SIZE - 1) wet += wetness(cells[at + WEATHER_GRID_SIZE]!);
      const pull = 1 + wet * WEATHER_NEIGHBOUR_PULL;

      weights[WeatherCell.Clear] = base[WeatherCell.Clear]!;
      weights[WeatherCell.Rain] = base[WeatherCell.Rain]! * pull;
      weights[WeatherCell.Storm] = base[WeatherCell.Storm]! * pull;
      // The season gate multiplies BEFORE persistence, which is what makes a
      // standing frost unable to survive into a month whose gate is zero.
      weights[WeatherCell.Frost] = base[WeatherCell.Frost]! * frostGate;
      weights[WeatherCell.Heat] = base[WeatherCell.Heat]! * heatGate;

      const current = cells[at]!;
      weights[current] = weights[current]! * WEATHER_PERSISTENCE;

      let total = 0;
      for (let cell = 0; cell < WEATHER_CELL_COUNT; cell++) total += weights[cell]!;

      // Clear is the fallback, and it is a real one rather than a formality:
      // its weight is positive under both playing rules, so the loop below
      // only fails to pick when floating point leaves a sliver at the very top
      // of the range - and Clear is then the honest answer, not an invented
      // one.
      let chosen: number = WeatherCell.Clear;
      let pick = stream.nextFloat() * total;
      for (let cell = 0; cell < WEATHER_CELL_COUNT; cell++) {
        pick -= weights[cell]!;
        if (pick < 0) {
          chosen = cell;
          break;
        }
      }
      next[at] = chosen;
      // A storm that ARRIVED, recorded where both days are in hand (SPEC2
      // M18). Edge-triggered rather than "is storming": a front that stands
      // over a region for a week is one piece of news, and `postOnce` only
      // suppresses a repeat while it is the newest entry - so a standing
      // storm reported daily would take turns with every other warning and
      // fill the log, which is the exact failure D-186 wrote down.
      const arrived = chosen === WeatherCell.Storm && current !== WeatherCell.Storm ? 1 : 0;
      arrivals[at] = arrived;
      arrivalCount += arrived;
    }
  }

  cells.set(next);
  field.arrivalCount = arrivalCount;
}

/** 1 for a region that is raining or storming, 0 otherwise. */
function wetness(cell: number): number {
  return cell === WeatherCell.Rain || cell === WeatherCell.Storm ? 1 : 0;
}
