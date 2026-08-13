import { START_YEAR, TICKS_PER_YEAR } from '../sim/constants';

/**
 * The two calendar conversions a scenario catalogue needs, in ONE place
 * (SPEC2 M24, D-254).
 *
 * They lived inside `catalog.ts` while every shipped scenario began in 1950 and
 * `START_YEAR` could stand in for "the year this world starts". The campaign of
 * SPEC2 M24 spans 1850 to 2050, so a band tick and the calendar year it falls in
 * are no longer the same conversion for two scenarios - and two copies of this
 * arithmetic is exactly how a briefing comes to promise a year its own goal does
 * not mean.
 *
 * A band tick is a COUNT OF TICKS from the world's own first day (D-245: tick 0
 * is the first of January of `world.startYear`, and the same tick is the same
 * day of the same month in every world). So both functions take the world's
 * start year, and `START_YEAR` is a default rather than a constant inside them.
 */

/** The last tick of `year` in a world that began in `startYear`. [ticks] */
export function endOfYearIn(startYear: number, year: number): number {
  return (year - startYear + 1) * TICKS_PER_YEAR;
}

/** The calendar year a band tick falls in; the browser prints this. */
export function scenarioYearOf(tick: number, startYear: number = START_YEAR): number {
  return startYear + Math.ceil(tick / TICKS_PER_YEAR) - 1;
}
