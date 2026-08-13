/**
 * The version of the message contract between the main thread and the
 * simulation worker (SPEC2 M25, E-16).
 *
 * This file imports nothing on purpose - the `save/version.ts` pattern of
 * D-192. Both sides of the boundary need the number, the main thread must not
 * pull the simulation into its bundle to read it, and a future transport would
 * need it before it has decided anything else.
 *
 * WHY A VERSION AT ALL, WHEN BOTH SIDES SHIP TOGETHER. Today they do: the
 * worker is a chunk of the same build as the page that starts it, so a
 * mismatch means a browser served half a stale deploy, which the shim of E-13
 * makes a real possibility rather than a theoretical one. Tomorrow they do not:
 * E-16's whole point is that a command envelope will one day cross a wire to a
 * peer that was built at another moment, and the number a peer compares is this
 * one. A version invented at that moment would have nothing to compare against.
 *
 * WHAT IT IS NOT. It is not `SAVE_VERSION`, which versions the WORLD and its
 * migration chain, and it is not `SNAPSHOT_LAYOUT_VERSION`, which versions the
 * shared-buffer layout the renderer reads. A message contract can change
 * without either of those moving, which is exactly what M25 bundle 4 does.
 */

/**
 * The message contract as it stands.
 *
 * History, so that a bump is a decision with a reason rather than an increment:
 *
 *  - **1** - everything up to and including M25 bundle 3. Never written down,
 *    which is the honest reading of "no version": every build spoke the
 *    contract of its own commit and nothing compared anything.
 *  - **2** - M25 bundle 4 (E-16). Two RESERVED integrity fields on
 *    `CommandEnvelope` (`checksum`, `sessionId`), the per-tick digest control
 *    messages and the `protocolVersion` field on `ready`. Nothing in this build
 *    writes either envelope field; the bump exists so that the day one is
 *    written, the receiver can tell whether the sender knew what it meant.
 */
export const PROTOCOL_VERSION = 2;

/**
 * The session id a single-machine game uses, and the value a reserved
 * `CommandEnvelope.sessionId` means when it is absent.
 *
 * Zero rather than -1 because "no session" and "the local session" are the same
 * thing in an offline game and there is nothing to tell apart; a real session
 * id, when there is one, is drawn by the host and is never zero.
 */
export const NET_SESSION_LOCAL = 0;

/**
 * The two reserved integrity fields of E-16, as one record for the places that
 * want to talk about the pair.
 *
 * They live on the envelope rather than inside the command for the reason the
 * company id does (see `CommandEnvelope`): they are not something the issuer
 * gets to choose about itself, they are what a receiver checks the issuer
 * against.
 */
export interface EnvelopeIntegrity {
  /**
   * Checksum over the envelope HEADER - tick, sequence number, company and the
   * command's kind - and deliberately not over the payload.
   *
   * The split is D-191's, one instrument down: a checkpoint commits to the
   * SCHEDULE of its segment and not to what the commands did, because a moved
   * or duplicated envelope is exactly the tamper a schedule commitment catches
   * and a bent payload is exactly the one a state digest catches. The same two
   * jobs, per message: this field catches a reordered, dropped or duplicated
   * envelope, and the per-tick digest of `multiplayer/tickDigest.ts` catches a
   * payload that did something different at the far end.
   */
  readonly checksum: number;
  /** Which session the envelope belongs to; {@link NET_SESSION_LOCAL} offline. */
  readonly sessionId: number;
}
