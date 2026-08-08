import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  SEA_LEVEL,
  SEASON_AMPLITUDE_MAX,
  SEASON_CLIMATE_AMPLITUDE,
  SEASON_CLIMATE_WINTER,
  SEASON_FARM_OUTPUT_PERCENT,
  SEASON_FORESTRY_OUTPUT_PERCENT,
  SEASON_FRICTION_GAIN,
  SEASON_HEIGHT_GAIN_PER_LEVEL,
  SEASON_WINTER_SEVERITY_PERCENT,
  TICKS_PER_DAY,
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
 * The two shapes it produces:
 *
 *  - *Winter friction*, a multiplier at or above 1 on the rolling resistance
 *    coefficient. Zero randomness, so a hard January is a hard January in both
 *    runs of a determinism twin.
 *  - *Seasonal output*, a multiplier around 1 for a farm and a forestry and
 *    exactly 1 for the other fifteen industry types. The tables average
 *    exactly 1 and the transform applied to them is affine, so a season moves
 *    WHEN a works produces and never how much it produces in a year.
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
 * Multiplier on the rolling resistance coefficient for this month, height and
 * climate. 1 in summer, up to `1 + SEASON_FRICTION_GAIN` in deep winter.
 *
 * Total by construction: the severity is clamped into [0, 1] before it is
 * spent, so the answer is finite and inside [1, 1 + SEASON_FRICTION_GAIN] for
 * every month a calendar can produce, every height a map can hold and every
 * climate a world can have.
 */
export function winterFrictionFactor(month: number, height: number, climate: MapClimate): number {
  const monthly = SEASON_WINTER_SEVERITY_PERCENT[month]! / 100;
  if (monthly <= 0) return 1;

  let severity = monthly * SEASON_CLIMATE_WINTER[climate]! * heightGain(height);
  if (severity > 1) severity = 1;
  return 1 + severity * SEASON_FRICTION_GAIN;
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
