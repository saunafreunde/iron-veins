import { UI_COLORS } from '../shared/palette';

/**
 * The pure half of the utilisation heat map of SPEC2 M15 (D-186): which
 * colour a piece of track wears for the traffic it carried this month, and
 * how solidly it is painted.
 *
 * Everything here is a function of one number, so the ramp is unit-tested
 * headless while the tile walk stays in MapView - the `water.ts`/`flowAtlas.ts`
 * pattern. Z1 holds trivially: the input is a derived snapshot-side tile
 * layer and nothing here reaches the simulation.
 *
 * The three stops are the interface's own semantic colours (16.3): a line
 * doing its job is green, a line that is filling up is amber, a line at its
 * limit is red. Reusing them rather than inventing a fourth palette is what
 * makes the overlay read the same way as every warning in the panels.
 */

function parseTint(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Low, middle and full utilisation, from the shared interface palette. */
export const HEAT_STOPS: readonly number[] = [
  parseTint(UI_COLORS.success),
  parseTint(UI_COLORS.warning),
  parseTint(UI_COLORS.danger),
];

/**
 * Opacity at the two ends of the ramp. [1]
 *
 * Even the quietest track has to be VISIBLE - a heat map whose zero is
 * invisible cannot show you the gap between a busy line and the siding beside
 * it - and even the busiest must not hide the rails under it, because the
 * player is looking at the overlay in order to decide where to lay more.
 */
export const HEAT_ALPHA_MIN = 0.3;
export const HEAT_ALPHA_MAX = 0.75;

/**
 * Published ticks between two repaints of the layer while nothing else
 * moved. [ticks]
 *
 * Origin: one real second at 1x - the same cadence the congestion layer
 * decays on (ROAD_CONGESTION_EPOCH_TICKS). The counters behind this overlay
 * are a MONTHLY quantity (a month is 6,000 ticks), so a repaint per rendered
 * frame would redraw the identical picture roughly three thousand times per
 * meaningful change. Camera, zoom and map-revision changes bypass the timer,
 * because those DO change the picture at once.
 */
export const HEAT_REFRESH_TICKS = 20;

/** Linear blend of two packed RGB colours, per channel. */
function mix(from: number, to: number, t: number): number {
  const r = ((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * t;
  const g = ((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * t;
  const b = (from & 0xff) + ((to & 0xff) - (from & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/**
 * Colour for a utilisation of 0..1, blended along the three stops. Values
 * outside the range clamp, so a saturated counter simply reads "full".
 */
export function heatColor(fraction: number): number {
  const t = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const half = HEAT_STOPS.length - 1;
  const scaled = t * half;
  const index = scaled >= half ? half - 1 : Math.floor(scaled);
  return mix(HEAT_STOPS[index]!, HEAT_STOPS[index + 1]!, scaled - index);
}

/** Opacity for a utilisation of 0..1: monotone from MIN to MAX, clamped. */
export function heatAlpha(fraction: number): number {
  const t = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return HEAT_ALPHA_MIN + (HEAT_ALPHA_MAX - HEAT_ALPHA_MIN) * t;
}
