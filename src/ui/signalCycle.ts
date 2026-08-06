import { SignalKind, signalDirection, signalKind } from '../sim/map/signals';
import { TRACK_DIR_COUNT, TrackDir } from '../sim/map/track';

/**
 * The signal tool's direction choice (section 9.1).
 *
 * A one-way signal needs a direction, and a build tool that hardcodes one is a
 * build tool that cannot place half the signal kinds the simulation has. The
 * chosen UX is a CYCLE: the first click on plain line places the two-way
 * signal of the armed family, and every further click on the same tile steps
 * through the one-way variant once per track direction and back to two-way.
 * No modifier keys, no extra panel - the click the player is already making
 * is the whole interface, and a signal on plain line has exactly two
 * directions to offer.
 *
 * The cycle is expressed as "what to build next": the caller demolishes the
 * standing signal and builds the returned step, because the simulation
 * deliberately has no modify-signal command. See DECISIONS.md D-126 for the
 * cost consequence of that pair and why it is accepted.
 */

export interface SignalStep {
  /** A value of SignalKind. */
  readonly kind: number;
  /** A value of TrackDir; meaningful only for the one-way kinds. */
  readonly direction: number;
}

/**
 * Screen-oriented arrows per TrackDir, for showing a one-way signal's
 * direction. TrackDir.East runs to the LOWER RIGHT on screen (+x of the
 * projection), which is why this table does not start with a plain "right".
 * Symbols, not words, so they need no translation.
 */
export const SCREEN_ARROWS: readonly string[] = ['↘', '↓', '↙', '←', '↖', '↑', '↗', '→'];

/**
 * The next step of the signal cycle for a tile.
 *
 * `packedSignal` is the tile's signal byte (0 when empty), `trackBits` its
 * track connections, `tool` the armed family. A tile carrying the other
 * family's signal, or none, starts its cycle at the two-way kind.
 */
export function nextSignalStep(
  packedSignal: number,
  trackBits: number,
  tool: 'signal' | 'pathsignal',
): SignalStep {
  const twoWay = tool === 'signal' ? SignalKind.Block : SignalKind.Path;
  const oneWay = tool === 'signal' ? SignalKind.BlockOneWay : SignalKind.PathEntry;

  const directions: number[] = [];
  for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
    if ((trackBits & (1 << direction)) !== 0) directions.push(direction);
  }
  // On track this is never empty - a signal needs plain line under it - but a
  // click on bare ground still has to produce a command the simulation can
  // reject with its own reason.
  const restart: SignalStep = { kind: twoWay, direction: directions[0] ?? TrackDir.East };

  const existing = signalKind(packedSignal);
  if (existing === twoWay && directions.length > 0) {
    return { kind: oneWay, direction: directions[0]! };
  }
  if (existing === oneWay) {
    const at = directions.indexOf(signalDirection(packedSignal));
    const next = at + 1;
    if (at >= 0 && next < directions.length) {
      return { kind: oneWay, direction: directions[next]! };
    }
    return restart;
  }
  return restart;
}
