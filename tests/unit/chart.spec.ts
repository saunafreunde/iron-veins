import { describe, expect, it } from 'vitest';
import { niceScale, seriesPoints, valueToY } from '../../src/ui/chart';

/**
 * The chart arithmetic of the M14 statistics centre (SPEC2 M14). The value
 * graph and the cash-flow axis both read these; a wrong scale here is a
 * finance panel that lies with a straight face, so the properties are pinned
 * rather than eyeballed.
 */

describe('niceScale', () => {
  it('covers the data and lands on 1/2/5-series steps', () => {
    const scale = niceScale(3, 97, 5);
    expect(scale.min).toBeLessThanOrEqual(3);
    expect(scale.max).toBeGreaterThanOrEqual(97);
    expect(scale.step).toBe(20);
    expect(scale.ticks[0]).toBe(scale.min);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
  });

  it('keeps every tick one exact step apart', () => {
    const scale = niceScale(-1_234_567, 9_876_543, 4);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]! - scale.ticks[i - 1]!).toBeCloseTo(scale.step, 6);
    }
  });

  it('spans negative-only data without inventing a positive half', () => {
    const scale = niceScale(-500, -100, 5);
    expect(scale.min).toBeLessThanOrEqual(-500);
    expect(scale.max).toBeGreaterThanOrEqual(-100);
    expect(scale.max).toBeLessThanOrEqual(0);
  });

  it('makes a flat series drawable instead of dividing by zero', () => {
    const scale = niceScale(42, 42, 5);
    expect(scale.max).toBeGreaterThan(scale.min);
    expect(Number.isFinite(scale.step)).toBe(true);
  });

  it('makes an all-zero series drawable', () => {
    const scale = niceScale(0, 0, 5);
    expect(scale.min).toBeLessThan(0);
    expect(scale.max).toBeGreaterThan(0);
  });

  it('never produces grossly more ticks than asked for', () => {
    // The nice rounding may add a tick or two past maxTicks, never a flood.
    for (const [lo, hi] of [
      [0, 1],
      [0, 999_999],
      [-7, 13],
      [123, 124],
    ] as const) {
      const scale = niceScale(lo, hi, 5);
      expect(scale.ticks.length).toBeLessThanOrEqual(12);
      expect(scale.ticks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('seriesPoints', () => {
  const scale = { min: 0, max: 100, step: 25, ticks: [0, 25, 50, 75, 100] };

  it('maps the first value to the left edge and the last to the right', () => {
    const points = seriesPoints([0, 50, 100], 240, 96, scale);
    expect(points[0]!.x).toBe(0);
    expect(points[2]!.x).toBe(240);
  });

  it('maps the axis minimum to the bottom and the maximum to the top', () => {
    const points = seriesPoints([0, 100], 240, 96, scale);
    expect(points[0]!.y).toBe(96);
    expect(points[1]!.y).toBe(0);
  });

  it('places a single point at the right edge - the "now" of a young company', () => {
    const points = seriesPoints([50], 240, 96, scale);
    expect(points).toHaveLength(1);
    expect(points[0]!.x).toBe(240);
    expect(points[0]!.y).toBe(48);
  });

  it('yields nothing for an empty series', () => {
    expect(seriesPoints([], 240, 96, scale)).toEqual([]);
  });

  it('agrees with valueToY on every value', () => {
    const values = [10, 90, 33];
    const points = seriesPoints(values, 240, 96, scale);
    values.forEach((value, index) => {
      expect(points[index]!.y).toBeCloseTo(valueToY(value, 96, scale), 9);
    });
  });
});
