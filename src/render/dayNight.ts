import { TICKS_PER_DAY } from '../sim/constants';

/**
 * The day/night colour curve of section 16.3, in its M10 minimal form (D-127).
 *
 * One tint for the whole world container, computed from the snapshot tick and
 * nothing else - a pure function, so the same tick always produces the same
 * colour and the simulation is not involved at all. The renderer multiplies it
 * over the tile/vehicle container once per frame; no sprite is ever touched
 * individually. Emissive windows and lamps follow in M13.
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
