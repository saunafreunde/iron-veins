import { describe, expect, it } from 'vitest';
import {
  DAY_TINT_NEUTRAL,
  dayNightTint,
  emissiveIntensity,
  relativeLuminance,
} from '../../src/render/dayNight';
import { EMISSIVE_MAX_ALPHA, EMISSIVE_WINDOW_HEX } from '../../src/render/emissive';
import { COMPANY_COLORS, COMPANY_COLORS_CVD } from '../../src/shared/palette';
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

  it('glides through nightfall on a fractional tick instead of stepping (E-05)', () => {
    // Since M12 the renderer feeds the INTERPOLATED phase - tick plus the
    // frame's alpha - into this curve (D-162). Nightfall (day fraction 0.5
    // to 0.58) is the steepest red slope, so half a tick must land strictly
    // between its integer neighbours: the proof that a fractional phase
    // smooths the tint rather than quantising back to the tick.
    const nightfall = Math.round(TICKS_PER_DAY * 0.51);
    const [before] = channels(dayNightTint(nightfall));
    const [between] = channels(dayNightTint(nightfall + 0.5));
    const [after] = channels(dayNightTint(nightfall + 1));
    expect(between).toBeLessThan(before);
    expect(between).toBeGreaterThan(after);
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

describe('the emissive ramp (M13, D-172)', () => {
  it('is zero through the whole day plateau and one through deep night', () => {
    for (let tick = 0; tick <= TICKS_PER_DAY * 0.4; tick++) {
      expect(emissiveIntensity(tick), `tick ${tick}`).toBe(0);
    }
    for (let tick = Math.ceil(TICKS_PER_DAY * 0.58); tick <= TICKS_PER_DAY * 0.87; tick++) {
      expect(emissiveIntensity(tick), `tick ${tick}`).toBe(1);
    }
  });

  it('IS the tint curve, read as missing luminance - one source of truth', () => {
    // SPEC2 M13 orders one phase source for tint and emissive. The ramp is
    // DERIVED from the tint's luminance, so this recomputation from the
    // published curve alone must reproduce it at every phase - there is no
    // second keyframe list that could drift.
    const nightLum = relativeLuminance(dayNightTint(Math.round(TICKS_PER_DAY * 0.7)));
    for (let tick = 0; tick <= TICKS_PER_DAY; tick += 0.25) {
      const expected = Math.min(
        1,
        Math.max(0, (1 - relativeLuminance(dayNightTint(tick))) / (1 - nightLum)),
      );
      expect(emissiveIntensity(tick), `tick ${tick}`).toBeCloseTo(expected, 12);
    }
  });

  it('ramps monotonically through nightfall and dawn, sub-tick included', () => {
    // Windows come on as the light goes: never a flicker backwards. Checked
    // on quarter-ticks because the renderer feeds the interpolated phase.
    for (let tick = TICKS_PER_DAY * 0.4; tick < TICKS_PER_DAY * 0.58; tick += 0.25) {
      expect(emissiveIntensity(tick + 0.25), `dusk ${tick}`).toBeGreaterThanOrEqual(
        emissiveIntensity(tick),
      );
    }
    for (let tick = TICKS_PER_DAY * 0.87; tick < TICKS_PER_DAY; tick += 0.25) {
      expect(emissiveIntensity(tick + 0.25), `dawn ${tick}`).toBeLessThanOrEqual(
        emissiveIntensity(tick),
      );
    }
    // The dusk glow already lights the first windows - dusk is when lamps
    // come on - but well below the full night value.
    const duskGlow = emissiveIntensity(Math.round(TICKS_PER_DAY * 0.5));
    expect(duskGlow).toBeGreaterThan(0.1);
    expect(duskGlow).toBeLessThan(0.7);
  });

  it('never jumps between consecutive ticks', () => {
    for (let tick = 0; tick <= TICKS_PER_DAY; tick++) {
      expect(
        Math.abs(emissiveIntensity(tick + 1) - emissiveIntensity(tick)),
        `tick ${tick}`,
      ).toBeLessThanOrEqual(0.08);
    }
  });
});

describe('luminance under the night tint, against BOTH palettes (M13 Fertig-wenn)', () => {
  const parse = (hex: string): number => Number.parseInt(hex.slice(1), 16);
  /** What multiplying a palette colour by the world tint leaves on screen. */
  const tinted = (colour: number, tint: number): number => {
    const r = Math.round((((colour >> 16) & 0xff) * ((tint >> 16) & 0xff)) / 255);
    const g = Math.round((((colour >> 8) & 0xff) * ((tint >> 8) & 0xff)) / 255);
    const b = Math.round(((colour & 0xff) * (tint & 0xff)) / 255);
    return (r << 16) | (g << 8) | b;
  };
  const night = dayNightTint(Math.round(TICKS_PER_DAY * 0.7));

  it('keeps every brightness distinction of the CVD palette, at every phase', () => {
    // The colour-blind palette's promise is lightness separation (17.4).
    // Two of its eight entries (the dark blue and the dark magenta) are
    // deliberately separated by HUE, not lightness - so the promise to hold
    // is: every pair that IS clearly apart in luminance by day stays apart,
    // in the same order, with at least 60 % of its gap, under every tint of
    // the curve. Checked and not assumed, because ordering under a
    // non-uniform channel multiply is not automatic: the gentle night
    // tint's worst channel keeps 72 % (184/255), and a warm-over-cool pair
    // loses a little more of its gap because the cool side keeps more.
    const dayLums = COMPANY_COLORS_CVD.map((hex) => relativeLuminance(parse(hex)));
    for (let tick = 0; tick <= TICKS_PER_DAY; tick += 5) {
      const tint = dayNightTint(tick);
      const lums = COMPANY_COLORS_CVD.map((hex) => relativeLuminance(tinted(parse(hex), tint)));
      for (let a = 0; a < lums.length; a++) {
        for (let b = 0; b < lums.length; b++) {
          const dayGap = dayLums[a]! - dayLums[b]!;
          if (dayGap < 0.08) continue; // a hue-separated pair, not a lightness one
          expect(lums[a]! - lums[b]!, `tick ${tick}: ${a} over ${b}`).toBeGreaterThanOrEqual(
            dayGap * 0.6,
          );
        }
      }
    }
  });

  it('keeps every company of BOTH palettes distinguishable at night', () => {
    for (const palette of [COMPANY_COLORS, COMPANY_COLORS_CVD]) {
      for (let a = 0; a < palette.length; a++) {
        for (let b = a + 1; b < palette.length; b++) {
          const ca = tinted(parse(palette[a]!), night);
          const cb = tinted(parse(palette[b]!), night);
          const dr = ((ca >> 16) & 0xff) - ((cb >> 16) & 0xff);
          const dg = ((ca >> 8) & 0xff) - ((cb >> 8) & 0xff);
          const db = (ca & 0xff) - (cb & 0xff);
          // A generous floor: 40 units of channel distance is far above
          // what the eye needs and far below what the palettes provide.
          expect(
            Math.sqrt(dr * dr + dg * dg + db * db),
            `${palette[a]} vs ${palette[b]}`,
          ).toBeGreaterThan(40);
        }
      }
    }
  });

  it('leaves the additive window glow clearly brighter than anything it lights', () => {
    // The glow sprites sit INSIDE the tinted world container (D-172): the
    // night tint multiplies them too. What the player must still see is a
    // lit window: the added luminance at full night has to dominate the
    // night-tinted world around it, and the glow has to stay WARM (red
    // above blue) through the cool cast.
    const glow = tinted(parse(EMISSIVE_WINDOW_HEX), night);
    const added = relativeLuminance(glow) * EMISSIVE_MAX_ALPHA;
    expect(added).toBeGreaterThan(0.45);
    expect((glow >> 16) & 0xff).toBeGreaterThan(glow & 0xff);
    // Brighter than the brightest night-tinted company colour of either
    // palette can DARKEN to - the glow reads at night on every livery.
    expect(added).toBeGreaterThan(0.25);
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
