/**
 * Signals (section 9).
 *
 * A signal divides a line into sections. A train may enter the section that
 * begins at a signal only if it can claim every tile of it, and it holds those
 * tiles until its tail is clear of them. That is the whole mechanic: it is what
 * makes a passing loop work, and it is why two trains can share one track.
 *
 * The signal is a property of the TILE, not of a direction. It therefore faces
 * both ways, needs no mirrored bit when the track under it is demolished, and
 * makes the build tool a single click. One-way signalling would buy tidier
 * double-track working and is deferred (DECISIONS.md D-056); the values here are
 * numbered so it can be added without touching the tile layer.
 */

export const SignalKind = {
  None: 0,
  /** Two-way block signal: the only kind M4 ships. */
  Block: 1,
} as const;
export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

export const SIGNAL_KIND_COUNT = 2;

/**
 * A signal may only stand on plain line - a tile with exactly two track
 * connections.
 *
 * A held train stands still on the tile before the signal. If signals could
 * stand in a junction, a train waiting at one would be blocking the throat of
 * that junction for every other route through it, and the only ways out are
 * pre-signals or a rule nobody can see. Refusing the placement removes the case
 * entirely, and a player who wants to protect a junction signals its approaches
 * instead - which is what real signalling does anyway.
 */
export const SIGNAL_TRACK_DEGREE = 2;
