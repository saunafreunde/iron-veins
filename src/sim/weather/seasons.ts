import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  SEA_LEVEL,
  SEASON_AMPLITUDE_MAX,
  SEASON_CLIMATE_AMPLITUDE,
  SEASON_CLIMATE_HEAT,
  SEASON_CLIMATE_WINTER,
  SEASON_FARM_OUTPUT_PERCENT,
  SEASON_FORESTRY_OUTPUT_PERCENT,
  SEASON_FRICTION_GAIN,
  SEASON_HEIGHT_GAIN_PER_LEVEL,
  SEASON_WINTER_SEVERITY_PERCENT,
  TICKS_PER_DAY,
  WEATHER_FROST_FULL_SEVERITY,
  WEATHER_HEAT_SEASON,
  type MapClimate,
} from '../constants';
import { IndustryType } from '../industry/types';

/**
 * The seasons of SPEC2 M18: a pure function of month, height and climate.
 *
 * E-01 separates them from the weather in as many words - the sky is a saved,
 * hashed, RNG-driven field, the season is a calendar function with no
 * randomness and no state at all. Nothing here reads a `World`, nothing here
 * draws, nothing here remembers: give it the same three numbers and it gives
 * the same answer, on any machine, at any tick, for ever. That is what lets
 * the renderer read it for a snow line without asking the simulation anything
 * (Z1) while the simulation reads it for friction and harvest.
 *
 * **Whether the simulation consults it at all is the weather rule**, and that
 * gate lives in `effects.ts` rather than here. A world with the rule off has
 * to behave exactly as it did before M18 - seasonal production alone would
 * move every balancing band this game owns (Fehlerkatalog 34) - but the season
 * itself is not the rule's property, and a function that asked about the rule
 * could not be the pure calendar function E-01 asks for.
 *
 * The three shapes it produces:
 *
 *  - *Winter friction*, a multiplier at or above 1 on the rolling resistance
 *    coefficient. Zero randomness, so a hard January is a hard January in both
 *    runs of a determinism twin.
 *  - *Seasonal output*, a multiplier around 1 for a farm and a forestry and
 *    exactly 1 for the other fifteen industry types. The tables average
 *    exactly 1 and the transform applied to them is affine, so a season moves
 *    WHEN a works produces and never how much it produces in a year.
 *  - *The frost gate*, the weight the weather field gives a frosty day - the
 *    same winter curve, read by the sky (D-204). It is here rather than in
 *    `update.ts` because it is a calendar function like the other two, and it
 *    is what stops the sky and the ground disagreeing about which months are
 *    winter and which climates have one.
 */

/**
 * Calendar month of a tick, 0 = January, without allocating a `GameDate`.
 *
 * `World.date` builds an object every time it is read, and the friction seam
 * below sits inside the per-vehicle tick path where law #7 forbids exactly
 * that. The arithmetic is `calendarFromTick`'s own, one field of it.
 */
export function calendarMonthOf(tick: number): number {
  const day = (tick / TICKS_PER_DAY) | 0;
  return ((day % DAYS_PER_YEAR) / DAYS_PER_MONTH) | 0;
}

/**
 * How much more season there is at this height than at the shore.
 *
 * The one place height enters, shared by both halves so that "the mountain has
 * a longer winter" and "the mountain has a shorter growing season" are the
 * same statement rather than two tunings that can drift apart.
 */
function heightGain(height: number): number {
  const above = height - SEA_LEVEL;
  return above > 0 ? 1 + above * SEASON_HEIGHT_GAIN_PER_LEVEL : 1;
}

/**
 * How much winter there is at this month, height and climate, in [0, 1].
 *
 * The ONE winter curve of the game. Both halves of the season read it - the
 * friction below and, since D-204, the sky's own frost gate - so "which months
 * are winter" and "how much winter a climate has" are answered in one place
 * instead of in two tables that can drift apart. Clamped into [0, 1] before
 * anybody spends it, which is what makes every consumer total by construction.
 */
function winterSeverity(month: number, height: number, climate: MapClimate): number {
  const monthly = SEASON_WINTER_SEVERITY_PERCENT[month]! / 100;
  if (monthly <= 0) return 0;

  const severity = monthly * SEASON_CLIMATE_WINTER[climate]! * heightGain(height);
  return severity > 1 ? 1 : severity;
}

/**
 * Multiplier on the rolling resistance coefficient for this month, height and
 * climate. 1 in summer, up to `1 + SEASON_FRICTION_GAIN` in deep winter.
 *
 * Total by construction: the severity is clamped into [0, 1] before it is
 * spent, so the answer is finite and inside [1, 1 + SEASON_FRICTION_GAIN] for
 * every month a calendar can produce, every height a map can hold and every
 * climate a world can have.
 */
export function winterFrictionFactor(month: number, height: number, climate: MapClimate): number {
  return 1 + winterSeverity(month, height, climate) * SEASON_FRICTION_GAIN;
}

/**
 * Seasonal gate on the FROST weight of the weather field, for this month and
 * climate (D-204). [multiplier on `WEATHER_BASE_WEIGHT[rule][Frost]`]
 *
 * **This is the season's own winter curve, read forwards** - the device D-202
 * used backwards for the snow line, one bundle on. Until D-204 the sky carried
 * a twelve-entry month table of its own (`WEATHER_FROST_SEASON`) that knew
 * nothing about the climate, so a tropical January could freeze while
 * `SEASON_CLIMATE_WINTER` was telling the ground that the tropics have no
 * winter at all. Two winter calendars is the defect; a climate column bolted
 * onto the sky's table would have left two month SHAPES free to drift apart, so
 * the sky reads the ground's curve instead and the second table is gone.
 *
 * What follows from that, as properties rather than as tuning:
 *
 *  - **the tropics cannot freeze.** `SEASON_CLIMATE_WINTER` is an exact zero
 *    there, so the gate is an exact zero, so the frost weight is an exact zero
 *    - and a weight of zero beats the persistence bonus, which is what makes a
 *    planted frost gone the next day rather than merely unlikely;
 *  - **the arctic freezes harder AND longer than the temperate world.** The
 *    gate is `SEASON_CLIMATE_WINTER[Arctic] = 1.5` times the temperate one in
 *    every month, so every threshold is cleared in more months: three months
 *    reach a full temperate January against one, five reach three quarters of
 *    it against three;
 *  - **there is still no frost in July, in any climate**, because the monthly
 *    table is a hard zero from May to September and zero times anything is
 *    zero;
 *  - **a temperate January is unchanged**, by construction of
 *    {@link WEATHER_FROST_FULL_SEVERITY} - the fix moves the three climates it
 *    is about and leaves the reference climate's deepest month exactly where
 *    the rule shipped it. The shoulders do move: the ground says a temperate
 *    October and April carry a tenth of a winter, and the sky now agrees.
 *
 * The gate may exceed 1 (arctic January is 1.5) - it is a multiplier on a
 * relative weight, not a probability, and a world with more winter than the
 * reference climate is exactly the case that should read above the reference.
 *
 * **Height is deliberately not a parameter.** The season takes one everywhere
 * it is evaluated AT a place - the vehicle's tile in `winterFrictionAt`, the
 * height sweep of `snowLineFor`. The sky is not evaluated at a place: one
 * weather cell covers a whole 16x16 region, 4 tiles across on the smallest map
 * and 128 on the largest, spanning every height in it. So the gate is read at
 * `SEA_LEVEL`, where `heightGain` is exactly 1, and the height half of the
 * season goes on entering the game where a height actually exists.
 */
export function frostSeasonFactor(month: number, climate: MapClimate): number {
  return winterSeverity(month, SEA_LEVEL, climate) / WEATHER_FROST_FULL_SEVERITY;
}

/**
 * Seasonal gate on the HEAT weight of the weather field, for this month and
 * climate (SPEC2 M23). [multiplier on `WEATHER_BASE_WEIGHT[rule][Heat]`]
 *
 * The other half of D-204, and the residual that entry named: the frost gate
 * became climate-aware and the heat gate stayed a bare month table, so an
 * arctic July and a desert July were the same July. D-204 refused to fix it
 * there for a stated reason - there is no summer term in the season tables to
 * REUSE, so a climate-aware heat gate means inventing a column - and booked it
 * to M23's climate sets, where inventing content is what the milestone is for
 * (E-17).
 *
 * So this is deliberately NOT `frostSeasonFactor`'s shape: that one reads the
 * ground's own winter curve because a winter curve exists, and this one
 * multiplies the sky's month table by {@link SEASON_CLIMATE_HEAT} because
 * nothing else in the game knows how hot a climate is. The properties that
 * follow are the ones a matrix can check:
 *
 *  - **a temperate world is bit-identical** to the one M18 shipped, because
 *    the temperate column is an exact 1 - so the reference coal line's winter
 *    band is not silently recalibrated by a fix aimed at the other three;
 *  - **the desert is the hottest sky and the arctic the coolest**, by a factor
 *    of eleven, in every month that has any heat at all;
 *  - **there is still no heat in January anywhere**, because the month table
 *    is a hard zero there and zero times anything is zero - which also means a
 *    standing heat wave cannot survive into October, since a zero weight beats
 *    the persistence bonus.
 *
 * Height is not a parameter here for the same reason it is not one for the
 * frost gate: a weather cell covers a whole region and every height in it.
 */
export function heatSeasonFactor(month: number, climate: MapClimate): number {
  return (WEATHER_HEAT_SEASON[month] ?? 0) * (SEASON_CLIMATE_HEAT[climate] ?? 1);
}

/**
 * The month's share of an industry's flat monthly output, as a multiplier.
 *
 * Farm and forestry only - SPEC2 M18 names those two and no others, so every
 * other type answers with the exact identity and a mine goes on producing what
 * it always produced. The transform is affine around 1, which is what carries
 * the year-total invariance through the climate and the height: the tables
 * average exactly 1, and `1 + (t - 1) * a` averages exactly 1 for any `a`.
 */
export function seasonalOutputFactor(
  type: IndustryType,
  month: number,
  height: number,
  climate: MapClimate,
): number {
  const table =
    type === IndustryType.Farm
      ? SEASON_FARM_OUTPUT_PERCENT
      : type === IndustryType.Forestry
        ? SEASON_FORESTRY_OUTPUT_PERCENT
        : null;
  if (table === null) return 1;

  let amplitude = SEASON_CLIMATE_AMPLITUDE[climate]! * heightGain(height);
  if (amplitude > SEASON_AMPLITUDE_MAX) amplitude = SEASON_AMPLITUDE_MAX;
  if (amplitude <= 0) return 1;

  return 1 + (table[month]! / 100 - 1) * amplitude;
}
