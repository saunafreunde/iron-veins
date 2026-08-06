import { describe, expect, it } from 'vitest';
import { DAY_TINT_NEUTRAL, dayNightTint } from '../../src/render/dayNight';
import { TICKS_PER_DAY } from '../../src/sim/constants';
import { DEFAULT_SETTINGS, normaliseSettings } from '../../src/shared/settings';

/**
 * The tick-to-colour curve of the M10 day/night minimal form (D-127).
 *
 * The function is pure and the renderer trusts it blindly - one tint on the
 * world container per frame - so everything worth knowing about it is worth
 * asserting here: the anchor (a new game opens in daylight), the period, the
 * character of each phase and that no frame ever jumps.
 */

function channels(tint: number): [number, number, number] {
  return [(tint >> 16) & 0xff, (tint >> 8) & 0xff, tint & 0xff];
}

describe('the day/night curve', () => {
  it('opens a new game in full daylight', () => {
    // Tick zero of a day is anchored to MORNING, deliberately: a fresh world
    // that fades in dark reads as a rendering bug, not as an evening.
    expect(dayNightTint(0)).toBe(DAY_TINT_NEUTRAL);
  });

  it('repeats with the 200-tick day, wherever in the calendar the tick is', () => {
    for (const tick of [0, 37, 99, 143, 5 * TICKS_PER_DAY + 12, 72_000 * 25 + 181]) {
      expect(dayNightTint(tick + TICKS_PER_DAY)).toBe(dayNightTint(tick));
      expect(dayNightTint(tick + 100 * TICKS_PER_DAY)).toBe(dayNightTint(tick));
    }
  });

  it('holds a neutral plateau through the day phase', () => {
    // The first 40 % of the day is daylight; no modulation at all, so the
    // palette of section 16.3 is what the player actually sees most of the time.
    for (let tick = 0; tick <= TICKS_PER_DAY * 0.4; tick++) {
      expect(dayNightTint(tick), `tick ${tick}`).toBe(DAY_TINT_NEUTRAL);
    }
  });

  it('darkens at night with a cool cast, gently', () => {
    const night = channels(dayNightTint(Math.round(TICKS_PER_DAY * 0.7)));
    const [r, g, b] = night;

    // Darker on every channel, blue least - moonlight, not a blackout.
    expect(r).toBeLessThan(255);
    expect(g).toBeLessThan(255);
    expect(b).toBeLessThan(255);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    // "Sanfte Farbmodulation": even the darkest channel keeps most of its value.
    expect(r).toBeGreaterThan(255 * 0.6);

    // The whole night plateau is one colour - no drift between 0.58 and 0.87.
    const reference = dayNightTint(Math.round(TICKS_PER_DAY * 0.7));
    for (let tick = Math.ceil(TICKS_PER_DAY * 0.58); tick <= TICKS_PER_DAY * 0.87; tick++) {
      expect(dayNightTint(tick), `tick ${tick}`).toBe(reference);
    }
  });

  it('passes through a warm glow at dusk and at dawn', () => {
    for (const fraction of [0.5, 0.95]) {
      const [r, g, b] = channels(dayNightTint(Math.round(TICKS_PER_DAY * fraction)));
      expect(r).toBe(255);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('never jumps between two consecutive ticks', () => {
    // The renderer applies the tint every frame; a step in the curve would be
    // a visible flicker. Eight units per channel per tick is well under what
    // the eye reads as a cut and well over what the keyframes produce.
    for (let tick = 0; tick <= TICKS_PER_DAY; tick++) {
      const before = channels(dayNightTint(tick));
      const after = channels(dayNightTint(tick + 1));
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(after[channel]! - before[channel]!),
          `tick ${tick}, channel ${channel}`,
        ).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('the day/night setting', () => {
  it('defaults to on and survives an old settings file', () => {
    // D-110: a setting, not a world rule. Default ON per the M10 brief; a file
    // written before the field existed must come back with it on.
    expect(DEFAULT_SETTINGS.dayNight).toBe(true);
    expect(normaliseSettings({}).dayNight).toBe(true);
    expect(normaliseSettings({ dayNight: false }).dayNight).toBe(false);
    expect(normaliseSettings({ dayNight: 'nonsense' }).dayNight).toBe(true);
  });
});
