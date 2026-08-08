import type { CommandEnvelope } from '../commands/types';
import { CHECKPOINT_INTERVAL_TICKS } from '../constants';
import { Fnv1a64 } from '../hash';

/**
 * What a recording commits to about WHEN its commands ran (SPEC2 M16, D-191).
 *
 * A world digest says what the commands DID; nothing said when they were
 * issued. That gap is what made D-189's exactness argument false: it reasoned
 * that a divergence inside a bracket must begin at one of the command ticks
 * IN THE FILE, having checked only that the log's `seq` is contiguous and its
 * ticks non-decreasing - and a command MOVED to another tick inside the same
 * bracket breaks neither. The re-simulation then runs that command at the
 * wrong tick, the world diverges from the moment the recording ran it, and the
 * report names the tick the tampered file happens to say.
 *
 * The fix is to commit to exactly the assumption the argument makes: every
 * mark a recording commits a world hash at ALSO commits the schedule - the
 * `(tick, seq)` pairs - of the segment leading up to it. One hash per mark.
 *
 * **It covers the schedule and deliberately not the payloads.** A tampered
 * payload leaves the schedule intact, which is precisely the case where the
 * candidate argument is sound and an exact tick is provable; a digest over
 * whole envelopes could not tell that case from a retiming, and would cost the
 * exact answer in the only case that has one. What a payload change does is
 * move the world, and the world digest is what covers that.
 */

/** The value that means "this mark committed to no schedule at all". */
export const NO_SCHEDULE_DIGEST = '';

/**
 * A segment of the log that a recording committed the schedule of.
 *
 * `fromTick` is inclusive and `toTick` exclusive, matching the rule that a
 * checkpoint holds the world BEFORE its own tick ran: a command stamped
 * `toTick` has not run yet at the mark and belongs to the next segment.
 */
export interface ScheduleCommitment {
  readonly fromTick: number;
  readonly toTick: number;
  /** The committed digest; never {@link NO_SCHEDULE_DIGEST} in a commitment. */
  readonly digest: string;
  /** Where in the file the commitment stands, for a finding that names it. */
  readonly where: string;
}

/** A log and the tick from which it is complete - `CommandQueue` is one. */
export interface RetainedLog {
  readonly log: readonly CommandEnvelope[];
  readonly baseTick: number;
}

/**
 * Where the segment a checkpoint commits the schedule of begins.
 *
 * One interval back, floored at zero - a fixed rule that depends on the
 * checkpoint's own tick and on nothing else, so it survives eviction (which
 * takes entries out of the middle of the ring) and a trim (which drops whole
 * years off the bottom).
 */
export function checkpointSegmentStart(tick: number): number {
  return Math.max(0, tick - CHECKPOINT_INTERVAL_TICKS);
}

/**
 * Where the segment a replay's end claim commits the schedule of begins: the
 * last year boundary at or before the end, i.e. the part-year tail that no
 * checkpoint covers.
 */
export function claimSegmentStart(finalTick: number): number {
  return finalTick - (finalTick % CHECKPOINT_INTERVAL_TICKS);
}

/**
 * Digest of the schedule of `[fromTick, toTick)`, in log order.
 *
 * The bounds are hashed first so a digest cannot be lifted from one segment
 * into another, and the count last so a segment that lost or gained an entry
 * cannot collide with one that merely moved one.
 */
export function scheduleDigest(
  log: readonly CommandEnvelope[],
  fromTick: number,
  toTick: number,
): string {
  const hash = new Fnv1a64();
  hash.int(fromTick);
  hash.int(toTick);
  let count = 0;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i]!;
    if (entry.tick < fromTick || entry.tick >= toTick) continue;
    hash.int(entry.tick);
    hash.int(entry.seq);
    count++;
  }
  hash.int(count);
  return hash.digest();
}

/**
 * The digest to RECORD for a segment, or {@link NO_SCHEDULE_DIGEST} when the
 * retained log does not hold the whole of it.
 *
 * A trimmed log has forgotten the years below its base (D-188), so a mark
 * whose segment reaches under that base can only be given the honest empty
 * digest: committing to a schedule computed from half a segment would be a
 * commitment nobody can check, and a checkable-looking one is worse than none.
 */
export function retainedScheduleDigest(
  source: RetainedLog,
  fromTick: number,
  toTick: number,
): string {
  if (fromTick < source.baseTick) return NO_SCHEDULE_DIGEST;
  return scheduleDigest(source.log, fromTick, toTick);
}
