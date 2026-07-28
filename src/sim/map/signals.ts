import { TRACK_DIR_COUNT, type TrackDir } from './track';

/**
 * Signals (section 9).
 *
 * A signal divides a line into sections. A train may enter the section that
 * begins at a signal only if it can claim it, and it holds what it claimed
 * until its tail is clear. That is the whole mechanic: it is what makes a
 * passing loop work, and it is why two trains can share one track.
 *
 * The four kinds of section 9.1 differ in exactly two ways, and nothing else:
 *
 *  - WHAT is claimed. A block signal claims the whole block ahead - every tile
 *    of it, not merely the ones the train drives over. A path signal claims
 *    only the train's own route through to the next safe stopping place, so two
 *    trains can cross the same junction on paths that do not touch. That is the
 *    entire difference in throughput, and it is why a station throat wants path
 *    signals and a plain double-track main line does not care.
 *  - WHO may pass. A one-way signal may only be passed in its own direction.
 *
 * The signal is a property of the TILE, not of an edge: it needs no mirrored
 * bit when the track under it comes up, and the build tool stays a single
 * click. Kind and direction share one byte.
 */

export const SignalKind = {
  None: 0,
  /** Two-way block signal: claims the whole block ahead. */
  Block: 1,
  /** Block signal passable in one direction only. */
  BlockOneWay: 2,
  /** Two-way path signal: claims only the route through to the next safe point. */
  Path: 3,
  /**
   * Entry path signal: a path signal passable in one direction only, so that no
   * train can reserve backwards out of the area it protects.
   */
  PathEntry: 4,
} as const;
export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

export const SIGNAL_KIND_COUNT = 5;

/** Translation keys, in the order of {@link SignalKind}. */
export const SIGNAL_KIND_KEYS: readonly string[] = [
  '',
  'signal.block',
  'signal.blockOneWay',
  'signal.path',
  'signal.pathEntry',
];

/** Bits 0..2 hold the kind, bits 3..5 the direction of a one-way signal. */
const KIND_MASK = 0b111;
const DIR_SHIFT = 3;

export function packSignal(kind: SignalKind, direction: TrackDir): number {
  return (kind & KIND_MASK) | (direction << DIR_SHIFT);
}

export function signalKind(packed: number): SignalKind {
  return (packed & KIND_MASK) as SignalKind;
}

export function signalDirection(packed: number): TrackDir {
  return ((packed >> DIR_SHIFT) % TRACK_DIR_COUNT) as TrackDir;
}

/** True when this signal claims the whole block rather than just a path. */
export function claimsWholeBlock(kind: SignalKind): boolean {
  return kind === SignalKind.Block || kind === SignalKind.BlockOneWay;
}

/** True when this signal may only be passed in its own direction. */
export function isOneWay(kind: SignalKind): boolean {
  return kind === SignalKind.BlockOneWay || kind === SignalKind.PathEntry;
}

/**
 * A signal may only stand on plain line - a tile with exactly two track
 * connections.
 *
 * A held train stands still on the tile before the signal. If signals could
 * stand in a junction, a train waiting at one would be blocking the throat of
 * that junction for every other route through it. Refusing the placement
 * removes the case entirely, and a player who wants to protect a junction
 * signals its approaches instead - which is what real signalling does anyway.
 */
export const SIGNAL_TRACK_DEGREE = 2;
