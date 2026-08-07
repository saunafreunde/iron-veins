import { DEADLOCK_WARN_TICKS } from '../sim/constants';

/**
 * The status badges of SPEC2 M13 ("Status-Badges (stuck/Panne/ohne
 * Auftraege) aus dem State-Feld im Stride"): which snapshot vehicle states
 * earn a badge over the sprite, and when. Pure policy - no Pixi, no canvas
 * (the emissive.ts split); MapView rasterises the three little icons at
 * attach and places them from what these functions decide.
 *
 * The state values are duplicated as numbers to keep render free of sim
 * enums (the MapView pattern); tests/unit/badges.spec.ts pins them against
 * `VehicleState`, the interpolation.spec.ts device.
 */

/** VehicleState.Stopped - parked, not running its orders. */
export const STATE_STOPPED = 0;
/** VehicleState.BrokenDown. */
export const STATE_BROKEN_DOWN = 5;
/** VehicleState.NoRoute - no route to the next order target. */
export const STATE_NO_ROUTE = 7;
/** VehicleState.WaitingForPath - held at a signal. */
export const STATE_WAITING_FOR_PATH = 8;

/** The three badge kinds, in texture order. */
export const BadgeKind = {
  /** Held without progress (WaitingForPath past the 9.3 clock, or NoRoute). */
  Stuck: 0,
  /** BrokenDown - the state that also smokes (particles.ts). */
  Breakdown: 1,
  /** Stopped - the vehicle is not running any orders. */
  NoOrders: 2,
} as const;
export type BadgeKind = (typeof BadgeKind)[keyof typeof BadgeKind];
export const BADGE_KIND_COUNT = 3;

/**
 * Badge chip colours per kind, from the colour-blind-safe section-17.4
 * palette the block overlay and the signal aspects already use: amber for
 * stuck, vermilion for a breakdown, grey for "nothing to do".
 */
export const BADGE_COLORS: readonly number[] = [0xe69f00, 0xd55e00, 0x999999];

/**
 * Zoom gate: badges exist at 1x and above, where a vehicle is a readable
 * sprite - the D-165 argument (station labels vanish exactly where their
 * modules do). At the chunked zooms a chip over a three-pixel dot would be
 * bigger than the thing it annotates. [zoom factor]
 */
export const BADGE_MIN_ZOOM = 1;

/**
 * How long a vehicle must have been WaitingForPath before the stuck badge
 * shows. Deliberately the SAME clock as section 9.3's deadlock warning
 * (DEADLOCK_WARN_TICKS, 60 s at 1x): "stuck" already has a definition in
 * this game - the F3 blink and the news report use it - and a second,
 * shorter one would make the badge cry wolf at every ordinary signal halt.
 * The render side accumulates published tick deltas per vehicle id; a
 * counter that restarts on load errs towards silence, never towards a
 * false alarm. [ticks]
 */
export const STUCK_BADGE_TICKS = DEADLOCK_WARN_TICKS;

/**
 * Which badge a snapshot state earns, or -1 for none. `stuckTicks` is the
 * render-side accumulation of ticks spent WaitingForPath (see
 * {@link STUCK_BADGE_TICKS}); NoRoute needs no clock - a vehicle that
 * CANNOT route is stuck the moment the simulation says so.
 */
export function badgeForState(state: number, stuckTicks: number): number {
  if (state === STATE_BROKEN_DOWN) return BadgeKind.Breakdown;
  if (state === STATE_NO_ROUTE) return BadgeKind.Stuck;
  if (state === STATE_WAITING_FOR_PATH) {
    return stuckTicks >= STUCK_BADGE_TICKS ? BadgeKind.Stuck : -1;
  }
  if (state === STATE_STOPPED) return BadgeKind.NoOrders;
  return -1;
}
