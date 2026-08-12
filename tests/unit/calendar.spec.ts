import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  EARLIEST_START_YEAR,
  END_YEAR,
  MAX_INT32_TICK,
  MAX_TICK,
  PLAYABLE_YEARS,
  START_YEAR,
  START_YEAR_PRESETS,
  TICK_HEADROOM_YEARS,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { epochYearsAt, startYearFromSnapshot } from '../../src/sim/calendar';
import { calendarFromTick } from '../../src/sim/World';

describe('calendar', () => {
  it('starts on the first day of the first month of START_YEAR', () => {
    expect(calendarFromTick(0, START_YEAR)).toEqual({ year: START_YEAR, month: 0, day: 0 });
  });

  it('rolls over day, month and year at the documented tick counts', () => {
    expect(calendarFromTick(TICKS_PER_DAY - 1, START_YEAR)).toEqual({
      year: START_YEAR,
      month: 0,
      day: 0,
    });
    expect(calendarFromTick(TICKS_PER_DAY, START_YEAR)).toEqual({
      year: START_YEAR,
      month: 0,
      day: 1,
    });
    expect(calendarFromTick(TICKS_PER_MONTH, START_YEAR)).toEqual({
      year: START_YEAR,
      month: 1,
      day: 0,
    });
    expect(calendarFromTick(TICKS_PER_YEAR, START_YEAR)).toEqual({
      year: START_YEAR + 1,
      month: 0,
      day: 0,
    });
  });

  it('keeps months exactly DAYS_PER_MONTH long', () => {
    const lastDay = calendarFromTick(TICKS_PER_MONTH - TICKS_PER_DAY, START_YEAR);
    expect(lastDay).toEqual({ year: START_YEAR, month: 0, day: DAYS_PER_MONTH - 1 });
  });

  it('ends inside END_YEAR', () => {
    expect(calendarFromTick(MAX_TICK - 1, START_YEAR).year).toBe(END_YEAR);
    expect(calendarFromTick(MAX_TICK - TICKS_PER_YEAR, START_YEAR).year).toBe(END_YEAR);
  });

  it('advances monotonically over the whole playable span', () => {
    let previous = -1;
    for (let tick = 0; tick < MAX_TICK; tick += TICKS_PER_DAY) {
      const date = calendarFromTick(tick, START_YEAR);
      const ordinal = (date.year - START_YEAR) * 360 + date.month * DAYS_PER_MONTH + date.day;
      expect(ordinal).toBe(previous + 1);
      previous = ordinal;
    }
  });
});

/**
 * The start year of SPEC2 E-15 (D-245).
 *
 * The whole content of the rule is that it moves the LABEL and nothing under
 * it: the same tick is the same day of the same month in every world, and only
 * the year differs. These assertions are what say so, because a calendar that
 * did anything else with the extra parameter would move every takt, deadline
 * and checkpoint interval in the game.
 */
describe('the start year is a label, not an arithmetic', () => {
  it('shifts the year by exactly the start year and touches nothing else', () => {
    for (const startYear of START_YEAR_PRESETS) {
      for (const tick of [0, 1, TICKS_PER_DAY + 7, TICKS_PER_MONTH * 5 + 33, MAX_TICK - 1]) {
        const reference = calendarFromTick(tick, START_YEAR);
        const shifted = calendarFromTick(tick, startYear);
        expect(shifted.month, `month at ${tick} from ${startYear}`).toBe(reference.month);
        expect(shifted.day, `day at ${tick} from ${startYear}`).toBe(reference.day);
        expect(shifted.year - reference.year, `year at ${tick} from ${startYear}`).toBe(
          startYear - START_YEAR,
        );
      }
    }
  });

  it('plays PLAYABLE_YEARS from wherever it begins', () => {
    for (const startYear of START_YEAR_PRESETS) {
      expect(calendarFromTick(0, startYear).year).toBe(startYear);
      expect(calendarFromTick(MAX_TICK - 1, startYear).year).toBe(startYear + PLAYABLE_YEARS - 1);
    }
    // The earliest world plays 1850-1950 and the latest 1950-2050, which is the
    // two centuries M23's title promises - not one 200-year game.
    expect(calendarFromTick(MAX_TICK - 1, EARLIEST_START_YEAR).year).toBe(START_YEAR);
  });

  it('measures the world AGE the price level is indexed by', () => {
    expect(epochYearsAt(0)).toBe(0);
    expect(epochYearsAt(TICKS_PER_YEAR - 1)).toBe(0);
    expect(epochYearsAt(TICKS_PER_YEAR)).toBe(1);
    // The identity the price level and the century both rest on: the age taken
    // from the tick is the same integer as the age taken from the calendar,
    // because TICKS_PER_YEAR is TICKS_PER_DAY * DAYS_PER_YEAR exactly.
    expect(TICKS_PER_YEAR).toBe(TICKS_PER_DAY * DAYS_PER_YEAR);
    for (const startYear of START_YEAR_PRESETS) {
      for (const tick of [0, 71_999, 72_000, 1_234_567, MAX_TICK - 1]) {
        expect(calendarFromTick(tick, startYear).year - startYear).toBe(epochYearsAt(tick));
      }
    }
  });

  it('reads the start year back out of a snapshot that carries no such field', () => {
    // What lets the interface label a century chart without a snapshot-layout
    // bump - the M23 ledger row books none (Fehlerkatalog 37).
    for (const startYear of START_YEAR_PRESETS) {
      for (const tick of [0, 5, TICKS_PER_YEAR * 37 + 11, MAX_TICK - 1]) {
        const year = calendarFromTick(tick, startYear).year;
        expect(startYearFromSnapshot(tick, year), `${startYear} at ${tick}`).toBe(startYear);
      }
    }
  });
});

/**
 * The Int32 headroom SPEC2 E-15 asks to be made explicit, measured rather than
 * quoted (D-245).
 */
describe('the tick counter', () => {
  it('carries far more years than the ~295 SPEC2 quotes', () => {
    expect(MAX_INT32_TICK).toBe(2 ** 31 - 1);
    expect(TICK_HEADROOM_YEARS).toBe(Math.floor(MAX_INT32_TICK / TICKS_PER_YEAR));
    expect(TICK_HEADROOM_YEARS).toBe(29_826);
    // Where the "~295" came from: the Int32 ceiling divided by MAX_TICK, which
    // is 101 years of ticks rather than one. The slip is a factor of exactly
    // PLAYABLE_YEARS, and this is the arithmetic that says so.
    expect(Math.round(MAX_INT32_TICK / MAX_TICK)).toBe(295);
    expect(TICK_HEADROOM_YEARS).toBe(Math.floor((MAX_INT32_TICK / MAX_TICK) * PLAYABLE_YEARS));
  });

  it('reaches the year 2051 of an endless 1950 world with the counter barely used', () => {
    // MAX_TICK itself is the first day of 2051: the span is 1950-2050
    // INCLUSIVE, so tick MAX_TICK - 1 is the last day of 2050.
    const tick = MAX_TICK;
    expect(calendarFromTick(tick, START_YEAR).year).toBe(2051);
    expect(tick).toBeLessThan(MAX_INT32_TICK / 100);
  });
});
