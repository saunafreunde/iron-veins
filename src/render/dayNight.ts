import { TICKS_PER_DAY } from '../sim/constants';

/**
 * The day/night colour curve of section 16.3 (D-127), and - since M13 - the
 * emissive ramp derived from it (D-172).
 *
 * One tint for the whole world container, computed from the snapshot tick and
 * nothing else - a pure function, so the same tick always produces the same
 * colour and the simulation is not involved at all. The renderer multiplies it
 * over the tile/vehicle container once per frame; no sprite is ever touched
 * individually. The emissive layer (windows, lamps, headlights) reads
 * `emissiveIntensity` below, which is this curve's own luminance turned
 * upside down - one source of truth for how dark the world is and how
 * brightly it answers.
 *
 * The curve is anchored so that TICK ZERO OF A DAY IS MORNING: a new game
 * (tick 0) opens on a daylit map rather than a mysteriously dark one, dusk
 * falls past the middle of the 200-tick day, and dawn breaks just before the
 * next day begins.
 */

/** A tint as its three 0..255 channels, multiplied over the sprite colours. */
type Rgb = readonly [number, number, number];

/** Full daylight: the identity tint, no modulation. [RGB 0..255] */
const DAY_COLOR: Rgb = [255, 255, 255];

/**
 * Night: darkened, with blue kept highest so the cast reads as cool moonlight.
 * Deliberately gentle - section 16.3 asks for a "sanfte Farbmodulation", and
 * the map has to stay readable at night. [RGB 0..255]
 */
const NIGHT_COLOR: Rgb = [184, 196, 234];

/**
 * Dawn and dusk: red at full, green and blue pulled down, so the transition
 * passes through a warm glow instead of fading straight to blue. [RGB 0..255]
 */
const GLOW_COLOR: Rgb = [255, 226, 198];

/**
 * The curve as keyframes over one day, linearly interpolated in between.
 *
 * Positions are fractions of the 200-tick day (unit: day fraction; origin:
 * chosen in D-127 - the SPEC fixes the cycle length, not the phase layout).
 * First and last keyframe carry the same colour at 0 and 1, so the curve wraps
 * without a seam at the day boundary.
 */
const CURVE: readonly (readonly [number, Rgb])[] = [
  [0.0, DAY_COLOR], // morning - a new game starts in daylight
  [0.4, DAY_COLOR], // afternoon
  [0.5, GLOW_COLOR], // dusk glow
  [0.58, NIGHT_COLOR], // nightfall
  [0.87, NIGHT_COLOR], // deep night
  [0.95, GLOW_COLOR], // dawn glow
  [1.0, DAY_COLOR], // the next morning
];

/** The tint that means "no modulation", for the toggle's off position. */
export const DAY_TINT_NEUTRAL = 0xffffff;

/**
 * The world tint for a tick, as a 0xRRGGBB colour.
 *
 * Pure: same tick in, same colour out, whatever else is going on. The caller
 * applies it to ONE container; this function knows nothing about Pixi.
 */
export function dayNightTint(tick: number): number {
  const tickOfDay = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const dayFraction = tickOfDay / TICKS_PER_DAY;

  for (let i = 1; i < CURVE.length; i++) {
    const [end, endColor] = CURVE[i]!;
    if (dayFraction > end) continue;
    const [start, startColor] = CURVE[i - 1]!;
    const t = (dayFraction - start) / (end - start);
    const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * t);
    const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * t);
    const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * t);
    return (r << 16) | (g << 8) | b;
  }
  return DAY_TINT_NEUTRAL;
}

/**
 * Relative luminance of a 0xRRGGBB tint, 0..1, with the Rec. 709 channel
 * weights on the stored (gamma) channel values. This is the render side's
 * brightness proxy - good enough to order and ramp colours, deliberately not
 * a colorimetric linear-light computation, and stated as such.
 */
export function relativeLuminance(tint: number): number {
  const r = ((tint >> 16) & 0xff) / 255;
  const g = ((tint >> 8) & 0xff) / 255;
  const b = (tint & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Luminance of the night plateau, the denominator of the emissive ramp.
 * Derived from NIGHT_COLOR at module load rather than restated, so the ramp
 * can never drift against the curve it is defined by.
 */
const NIGHT_LUMINANCE = relativeLuminance(
  (NIGHT_COLOR[0] << 16) | (NIGHT_COLOR[1] << 8) | NIGHT_COLOR[2],
);

/**
 * How strongly the emissive layer (windows, street lamps, headlights - the
 * M13 full form of section 16.3) glows at a given tick, 0..1.
 *
 * ONE source of truth (SPEC2 M13): the intensity is DERIVED from the D-127
 * tint curve itself - it is the tint's missing luminance, normalised so the
 * night plateau reads exactly 1 - rather than a second keyframe list that
 * could drift against the first. Lights therefore come on exactly as fast
 * as the world darkens: 0 through the whole day plateau, a partial glow in
 * the dusk and dawn warmth, 1 through deep night. The caller feeds it the
 * same interpolated phase that feeds the tint (D-162), so the two ramps
 * share every frame's sub-tick position too. Luminance-based by
 * construction, which is what the M13 order ("Modulation luminanz-basiert")
 * names.
 */
export function emissiveIntensity(tick: number): number {
  const missing = (1 - relativeLuminance(dayNightTint(tick))) / (1 - NIGHT_LUMINANCE);
  if (missing <= 0) return 0;
  if (missing >= 1) return 1;
  return missing;
}
