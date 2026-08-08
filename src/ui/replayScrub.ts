/**
 * Scrubbing a recording to an ARBITRARY tick, and saying honestly what that
 * will cost (SPEC2 M16).
 *
 * The chips of D-189 offer the ring, and the ring is sixteen entries: a
 * recording longer than sixteen game years has EVICTED the early ones, and
 * with only chips on screen those years are unreachable even though the
 * simulation can reach them - `ReplaySession.seek` restores the newest
 * checkpoint at or before any tick and re-simulates the remainder, which is
 * the same mechanism one step finer (D-188). What was missing was a way to ASK
 * for a tick that is not a chip.
 *
 * This module is the arithmetic behind that question, and it is deliberately
 * pure and import-free: the panel is on the main thread, the session is behind
 * the worker boundary, and the only thing they need to agree on is WHICH
 * checkpoint a target tick will be re-simulated from. That answer decides the
 * sentence under the scrub bar - "lands exactly" against "re-simulates ninety
 * game days" - and a sentence about work the simulation is about to do has to
 * be computed from the same rule the simulation uses, not guessed from the
 * position of a slider.
 *
 * `tests/unit/replayScrub.spec.ts` holds it against `CheckpointRing.bestFor`
 * itself, in both directions.
 */

/** One point a jump can land on exactly: a ring entry and its calendar year. */
export interface ScrubMark {
  readonly tick: number;
  readonly year: number;
}

/** What a seek to a given tick will do, before it is asked for. */
export interface SeekPlan {
  /** The tick actually sought, clamped into the recording. */
  readonly targetTick: number;
  /** The checkpoint the session will restore - the mark at or before it. */
  readonly fromTick: number;
  /** That checkpoint's calendar year, as its chip is labelled. */
  readonly fromYear: number;
  /** Ticks that have to be re-simulated after the restore. */
  readonly resimTicks: number;
  /** True when the target IS a checkpoint: a decode, nothing re-simulated. */
  readonly exact: boolean;
  /** True when the re-simulation is long enough to be worth warning about. */
  readonly long: boolean;
}

/**
 * Above this much re-simulation a seek stops feeling instant and the bar says
 * so. [ticks]
 *
 * Origin: the M16 soak (D-190) re-simulates the recorded twenty-five year AI
 * game - 1,800,000 ticks - in 48.9 s on the reference machine, i.e. ~37,000
 * ticks per second on a 256 map with three competitors. 18,000 ticks is a
 * quarter of a game year, ninety game days, and about half a second of work
 * there; a bigger world is slower, which is exactly why the number is a
 * threshold for a SENTENCE and never a refusal. The whole point of the
 * arbitrary seek is that every tick stays reachable - the player is told what
 * it costs, not stopped.
 *
 * It lives here rather than in `src/sim/constants.ts` for the reason
 * `TOOLTIP_DELAY_MS` does: it changes no world, prices nothing and is read
 * only by the interface.
 */
export const REPLAY_LONG_SEEK_TICKS = 18_000;

/**
 * The plan for seeking to `wantedTick`.
 *
 * The rule is `ReplaySession.seek` read from this side: clamp into
 * `[baseTick, finalTick]`, then take the newest mark at or before the target.
 * `marks` is the ring as the recording published it (`ReplayMeta.jumps`),
 * which is already filtered to the ticks the session would accept and never
 * empty - it holds at least the base tick, because eviction never takes entry
 * zero (D-188). An empty list is still answered rather than thrown at: the
 * base tick is what the session falls back to, and a panel is not a place to
 * raise.
 */
export function seekPlanFor(
  marks: readonly ScrubMark[],
  baseTick: number,
  finalTick: number,
  wantedTick: number,
): SeekPlan {
  const end = Math.max(baseTick, finalTick);
  const targetTick = Math.min(Math.max(Math.round(wantedTick), baseTick), end);

  let from: ScrubMark | null = null;
  for (const mark of marks) {
    if (
      mark.tick <= targetTick &&
      mark.tick >= baseTick &&
      (from === null || mark.tick > from.tick)
    )
      from = mark;
  }

  const fromTick = from === null ? baseTick : from.tick;
  const resimTicks = targetTick - fromTick;
  return {
    targetTick,
    fromTick,
    fromYear: from === null ? 0 : from.year,
    resimTicks,
    exact: resimTicks === 0,
    long: resimTicks > REPLAY_LONG_SEEK_TICKS,
  };
}

/**
 * Which chip a position belongs to: the newest mark at or before `tick`.
 *
 * The bar used to highlight a chip by adding one game year to its tick, which
 * is right only while the ring is dense. After an eviction two neighbouring
 * chips can be years apart, and then no chip is lit at all for the years in
 * between - the position would look as if it were outside the recording.
 */
export function activeMarkTick(marks: readonly ScrubMark[], tick: number): number | null {
  let found: number | null = null;
  for (const mark of marks) {
    if (mark.tick <= tick && (found === null || mark.tick > found)) found = mark.tick;
  }
  return found;
}
