import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_MONTH,
  END_YEAR,
  MAX_TICK,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { calendarFromTick } from '../../src/sim/World';

describe('calendar', () => {
  it('starts on the first day of the first month of START_YEAR', () => {
    expect(calendarFromTick(0)).toEqual({ year: START_YEAR, month: 0, day: 0 });
  });

  it('rolls over day, month and year at the documented tick counts', () => {
    expect(calendarFromTick(TICKS_PER_DAY - 1)).toEqual({ year: START_YEAR, month: 0, day: 0 });
    expect(calendarFromTick(TICKS_PER_DAY)).toEqual({ year: START_YEAR, month: 0, day: 1 });
    expect(calendarFromTick(TICKS_PER_MONTH)).toEqual({ year: START_YEAR, month: 1, day: 0 });
    expect(calendarFromTick(TICKS_PER_YEAR)).toEqual({ year: START_YEAR + 1, month: 0, day: 0 });
  });

  it('keeps months exactly DAYS_PER_MONTH long', () => {
    const lastDay = calendarFromTick(TICKS_PER_MONTH - TICKS_PER_DAY);
    expect(lastDay).toEqual({ year: START_YEAR, month: 0, day: DAYS_PER_MONTH - 1 });
  });

  it('ends inside END_YEAR', () => {
    expect(calendarFromTick(MAX_TICK - 1).year).toBe(END_YEAR);
    expect(calendarFromTick(MAX_TICK - TICKS_PER_YEAR).year).toBe(END_YEAR);
  });

  it('advances monotonically over the whole playable span', () => {
    let previous = -1;
    for (let tick = 0; tick < MAX_TICK; tick += TICKS_PER_DAY) {
      const date = calendarFromTick(tick);
      const ordinal = (date.year - START_YEAR) * 360 + date.month * DAYS_PER_MONTH + date.day;
      expect(ordinal).toBe(previous + 1);
      previous = ordinal;
    }
  });
});
