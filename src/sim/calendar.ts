import { DAYS_PER_MONTH, DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_YEAR } from './constants';
import type { GameDate } from './types';

/**
 * The calendar, and nothing else - a leaf with no imports beyond the constants
 * and the date type.
 *
 * It used to live in `World.ts`, which was fine while the calendar was a pure
 * function of the tick. Since SPEC2 M23 (E-15) it is a function of the tick AND
 * of the world's own `startYear`, and two consumers outside the simulation need
 * that arithmetic without wanting a `World` in their bundle: the finance
 * panel's century chart and the connection preview both hold a snapshot rather
 * than a world. `World.ts` re-exports {@link calendarFromTick} so every
 * existing call site keeps its one door (the `save/version.ts` pattern, D-191).
 */

/**
 * Calendar position for a tick count in a world that began in `startYear`.
 * Months and days are zero based.
 *
 * Tick 0 is the first day of the first month of `startYear` in every world -
 * the start year moves the LABEL on the calendar, never the arithmetic under
 * it. That is what keeps a takt, a deadline and a checkpoint interval the same
 * number of ticks whatever century a game is played in (D-245).
 */
export function calendarFromTick(tick: number, startYear: number): GameDate {
  const totalDays = (tick / TICKS_PER_DAY) | 0;
  const dayOfYear = totalDays % DAYS_PER_YEAR;
  return {
    year: startYear + ((totalDays / DAYS_PER_YEAR) | 0),
    month: (dayOfYear / DAYS_PER_MONTH) | 0,
    day: dayOfYear % DAYS_PER_MONTH,
  };
}

/**
 * Whole game years elapsed since the world's first day. [years]
 *
 * The one measure the price level of section 14.2 is indexed by, and it is
 * deliberately taken from the TICK rather than from a pair of calendar years:
 * `inflatedYearsBetween` has always integrated the price level over
 * `tick / TICKS_PER_YEAR`, so anchoring `epochFactor` on anything else would
 * give a world two definitions of how old it is (D-245).
 */
export function epochYearsAt(tick: number): number {
  return (tick / TICKS_PER_YEAR) | 0;
}

/**
 * The start year a snapshot implies, from the two fields it already carries.
 *
 * `SnapshotI32.Year` is `startYear + floor(totalDays / DAYS_PER_YEAR)` and
 * `SnapshotI32.Tick` is the tick that year was read at, and
 * `floor(tick / TICKS_PER_YEAR)` is the same integer as
 * `floor(floor(tick / TICKS_PER_DAY) / DAYS_PER_YEAR)` because
 * `TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR` exactly. So the difference
 * IS the start year, with no new snapshot field - which is why SPEC2's M23
 * ledger row books no snapshot-layout change (Fehlerkatalog 37).
 */
export function startYearFromSnapshot(tick: number, year: number): number {
  return year - epochYearsAt(tick);
}
