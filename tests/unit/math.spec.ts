import { describe, expect, it } from 'vitest';
import { FIXED_POINT_ONE, TRIG_TABLE_SIZE } from '../../src/sim/constants';
import {
  clamp,
  clampInt,
  cosFx,
  divFx,
  fromFx,
  mulFx,
  SINE_TABLE,
  sinFx,
  sinTurns,
  toFx,
} from '../../src/sim/math';

describe('trigonometric lookup table', () => {
  it('covers exactly one turn', () => {
    expect(SINE_TABLE.length).toBe(TRIG_TABLE_SIZE);
  });

  it('hits the cardinal points exactly', () => {
    expect(sinFx(0)).toBe(0);
    expect(sinFx(TRIG_TABLE_SIZE / 4)).toBe(FIXED_POINT_ONE);
    expect(sinFx(TRIG_TABLE_SIZE / 2)).toBe(0);
    expect(sinFx((TRIG_TABLE_SIZE * 3) / 4)).toBe(-FIXED_POINT_ONE);
  });

  it('matches Math.sin within the fixed point resolution at every table index', () => {
    // The table is built from a Taylor series, so this compares an independent
    // implementation - it is a real check, not a tautology.
    const quantisation = 1 / FIXED_POINT_ONE;
    let worst = 0;
    for (let i = 0; i < TRIG_TABLE_SIZE; i++) {
      const expected = Math.sin((2 * Math.PI * i) / TRIG_TABLE_SIZE);
      const error = Math.abs(sinFx(i) / FIXED_POINT_ONE - expected);
      if (error > worst) worst = error;
    }
    expect(worst).toBeLessThanOrEqual(quantisation);
  });

  it('derives cosine from the same table', () => {
    for (let i = 0; i < TRIG_TABLE_SIZE; i += 7) {
      expect(cosFx(i)).toBe(sinFx(i + TRIG_TABLE_SIZE / 4));
    }
  });

  it('keeps the Pythagorean identity', () => {
    for (let i = 0; i < TRIG_TABLE_SIZE; i += 13) {
      const s = sinFx(i) / FIXED_POINT_ONE;
      const c = cosFx(i) / FIXED_POINT_ONE;
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-4);
    }
  });

  it('wraps indices in both directions', () => {
    expect(sinFx(TRIG_TABLE_SIZE + 5)).toBe(sinFx(5));
    expect(sinFx(-TRIG_TABLE_SIZE + 5)).toBe(sinFx(5));
    expect(sinFx(-1)).toBe(sinFx(TRIG_TABLE_SIZE - 1));
  });

  it('accepts turns beyond one full rotation', () => {
    expect(sinTurns(0.25)).toBe(1);
    expect(sinTurns(2.25)).toBe(1);
    expect(sinTurns(-0.75)).toBe(1);
  });
});

describe('fixed point helpers', () => {
  it('round trips through Q16.16 within the quantisation step', () => {
    for (const value of [0, 1, -1, 0.5, -0.25, 123.456, -987.654]) {
      expect(Math.abs(fromFx(toFx(value)) - value)).toBeLessThanOrEqual(1 / FIXED_POINT_ONE);
    }
  });

  it('multiplies and divides', () => {
    const a = toFx(2.5);
    const b = toFx(4);
    expect(fromFx(mulFx(a, b))).toBeCloseTo(10, 4);
    expect(fromFx(divFx(b, a))).toBeCloseTo(1.6, 4);
  });
});

describe('clamping', () => {
  it('clamps into the closed interval', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('truncates towards zero', () => {
    expect(clampInt(5.9, 0, 10)).toBe(5);
    expect(clampInt(-5.9, -10, 10)).toBe(-5);
  });
});
