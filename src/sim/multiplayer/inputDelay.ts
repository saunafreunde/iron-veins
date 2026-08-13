import { NET_INPUT_DELAY_TICKS } from '../constants';

/**
 * The input-delay design note of SPEC2 E-16, written as arithmetic so that it
 * can be wrong in public.
 *
 * E-16 asks for a NOTE, and a note in prose is a note nobody can falsify. What
 * follows is the note; the two functions under it are the only part of it a
 * future session would actually execute, and they are here so the note has a
 * test.
 *
 * ---
 *
 * ## 1. Why lockstep with input delay, and not rollback
 *
 * The two families of deterministic netcode are LOCKSTEP (every peer runs every
 * tick from the same inputs, and a tick does not run until every peer's inputs
 * for it have arrived) and ROLLBACK (a peer predicts, and when a late input
 * arrives it restores the state before that tick and re-simulates forward).
 *
 * Rollback is refused, and the refusal is a property of THIS simulation rather
 * than an opinion about netcode:
 *
 *  - Rollback needs a cheap per-tick copy of the whole simulation state. This
 *    world is a megabyte of tile layers plus every vehicle, station, town and
 *    ledger; `hashWorld` alone walks nine megabytes on a 1024 map, and
 *    `save/checkpoints.ts` measures a full state at 25-39 kB COMPRESSED and
 *    24-41 ms to encode. Twenty of those a second is the whole frame budget
 *    spent on speculation.
 *  - Architecture law #7 forbids allocation in the hot path, which is what
 *    makes the simulation fast enough to run 1,500 vehicles at 1.4 ms a tick.
 *    A rollback buffer is allocation in the hot path by construction.
 *  - And the game does not need it. Rollback exists for inputs that must feel
 *    instant - a fighting game's punch. Here an input is `BuildRoad` or
 *    `SetVehicleOrders`, issued by a mouse on a paused-or-1x world; 200 ms
 *    between the click and the road is under the threshold at which a build
 *    command feels laggy, and every one of them is already acknowledged by the
 *    interface's own preview (D-119).
 *
 * So: lockstep. Every peer runs the identical `World.step` over the identical
 * `CommandQueue`, which is the mechanism this game has had since M0 - law #6
 * exists for exactly this ("all state changes go through commands ... this is
 * what buys replays, undo, save verification and later multiplayer").
 *
 * ## 2. The delay, and the one rule that makes it deterministic
 *
 * A command issued while tick `t` is running is scheduled for tick
 * `t + NET_INPUT_DELAY_TICKS` - {@link executionTickFor} - and every peer
 * schedules it for that same tick because the number is a constant of the
 * session and not of the machine. The delay is what buys the transport its
 * round trip: four ticks are 200 ms at 20 Hz.
 *
 * The rule that makes it a PROTOCOL rather than a hope: a command whose
 * execution tick has already run is REFUSED, never executed late and never
 * executed early ({@link arrivesInTime}). Executing it late would put it after
 * commands that were issued after it, which is a different command ORDER, which
 * is a different world - `CommandQueue.enqueue` already throws on a
 * non-monotonic tick and would be the crash rather than the desync. Refusing is
 * the honest failure: the issuer is told, and the simulation is untouched.
 *
 * ## 3. What is already in place, and what a session would still have to add
 *
 * In place, because the offline game needed it:
 *
 *  - the command queue is tick-stamped and sequence-numbered, and `(tick, seq)`
 *    is a total order (D-191's schedule commitment rests on it);
 *  - the envelope carries the ISSUING COMPANY rather than trusting the command
 *    to name itself, which is the authority check a host needs;
 *  - the world is bit-exact across machines and operating systems, pinned in CI
 *    on Windows and Linux against one canonical hash (D-137);
 *  - a divergence is locatable to the TICK, through the ring in
 *    `multiplayer/tickDigest.ts`;
 *  - and an envelope's header can be checked against a checksum
 *    (`multiplayer/envelope.ts`).
 *
 * Not in place, deliberately, and each one its own programme after v2.0:
 * transport, session establishment, the host's authority over speed and pause,
 * what happens when a peer stalls (a lockstep session runs at the slowest peer,
 * or it drops it), reconnection from a checkpoint, and the whole question of
 * whether the AI companies are simulated by everybody or by the host. E-16 says
 * "kein Transport, keine Sessions, kein Netcode", and none of that is here.
 */

/**
 * The tick a command issued during `issuedTick` executes on.
 *
 * `delayTicks` is a parameter with a default rather than a read of the constant
 * so a session can negotiate its own delay from the measured round trip - which
 * is the one thing about this arithmetic a real transport would want to change.
 */
export function executionTickFor(
  issuedTick: number,
  delayTicks: number = NET_INPUT_DELAY_TICKS,
): number {
  return issuedTick + delayTicks;
}

/**
 * Whether an envelope that arrived while `currentTick` is about to run can
 * still be executed on the tick it names.
 *
 * True when its tick is still ahead of the simulation. False the moment the
 * simulation has passed it - and that is a REFUSAL, not a licence to run it
 * late: see the note above.
 */
export function arrivesInTime(envelopeTick: number, currentTick: number): boolean {
  return envelopeTick >= currentTick;
}
