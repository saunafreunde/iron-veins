import { describe, expect, it } from 'vitest';
import { CHECKPOINT_INTERVAL_TICKS } from '../../src/sim/constants';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import type { Checkpoint } from '../../src/sim/save/format';
import {
  activeMarkTick,
  seekPlanFor,
  REPLAY_LONG_SEEK_TICKS,
  type ScrubMark,
} from '../../src/ui/replayScrub';

/**
 * The arbitrary seek of M16's correction bundle.
 *
 * The scrub bar lets the player ask for any tick of a recording, and the
 * sentence under it says what that will cost - a decode when the tick IS a
 * checkpoint, a re-simulation of the remainder otherwise. Both statements are
 * about work the SESSION will do, so the panel's rule has to be the session's
 * rule: `CheckpointRing.bestFor`, which `ReplaySession.seek` restores from.
 * This test holds the two against each other rather than against a written
 * expectation of what they both should be.
 */

const YEAR = CHECKPOINT_INTERVAL_TICKS;

/** A ring entry with nothing in it but its tick - `load` validates nothing. */
function entry(tick: number): Checkpoint {
  return { tick, worldDigest: '', payload: new Uint8Array(0), scheduleDigest: '' };
}

function ringOf(ticks: readonly number[]): CheckpointRing {
  const ring = new CheckpointRing();
  ring.load(ticks.map(entry));
  return ring;
}

/** The marks as `ReplayMeta.jumps` publishes them: tick plus calendar year. */
function marksOf(ticks: readonly number[]): ScrubMark[] {
  return ticks.map((tick) => ({ tick, year: 1950 + Math.floor(tick / YEAR) }));
}

describe('seeking to an arbitrary tick', () => {
  const ticks = [0, YEAR, 2 * YEAR, 3 * YEAR];
  const marks = marksOf(ticks);
  const finalTick = 3 * YEAR + 5_000;

  it('lands on a checkpoint exactly and calls it a decode', () => {
    const plan = seekPlanFor(marks, 0, finalTick, 2 * YEAR);
    expect(plan.targetTick).toBe(2 * YEAR);
    expect(plan.fromTick).toBe(2 * YEAR);
    expect(plan.fromYear).toBe(1952);
    expect(plan.resimTicks).toBe(0);
    expect(plan.exact).toBe(true);
    expect(plan.long).toBe(false);
  });

  it('re-simulates from the checkpoint at or before a tick between two', () => {
    const plan = seekPlanFor(marks, 0, finalTick, 2 * YEAR + 1_000);
    expect(plan.fromTick).toBe(2 * YEAR);
    expect(plan.resimTicks).toBe(1_000);
    expect(plan.exact).toBe(false);
    expect(plan.long).toBe(false);
  });

  it('warns exactly above the threshold and not at it', () => {
    const atLimit = seekPlanFor(marks, 0, finalTick, YEAR + REPLAY_LONG_SEEK_TICKS);
    const past = seekPlanFor(marks, 0, finalTick, YEAR + REPLAY_LONG_SEEK_TICKS + 1);
    expect(atLimit.long).toBe(false);
    expect(past.long).toBe(true);
  });

  it('clamps a target outside the recording into it', () => {
    expect(seekPlanFor(marks, 0, finalTick, -50_000).targetTick).toBe(0);
    expect(seekPlanFor(marks, 0, finalTick, finalTick + 50_000).targetTick).toBe(finalTick);
  });

  it('reaches a year the ring has EVICTED, from the base below it', () => {
    // The case the chips cannot express: a recording longer than the ring, so
    // the base plus the newest years survive and everything between them has
    // no chip at all. The seek still reaches it - from the base.
    const evicted = marksOf([0, 20 * YEAR, 21 * YEAR]);
    const plan = seekPlanFor(evicted, 0, 21 * YEAR + 1_000, 5 * YEAR + 700);
    expect(plan.fromTick).toBe(0);
    expect(plan.resimTicks).toBe(5 * YEAR + 700);
    expect(plan.long).toBe(true);
  });

  it('answers a mark-less recording with its base tick', () => {
    const plan = seekPlanFor([], 4_000, 9_000, 6_000);
    expect(plan.fromTick).toBe(4_000);
    expect(plan.resimTicks).toBe(2_000);
  });

  it('never chooses a checkpoint below the retained log base', () => {
    // A trimmed recording keeps ring entries the session would refuse
    // (`checkpoint.tick >= baseTick`), and offering one would promise a jump
    // into a world the file no longer carries.
    const plan = seekPlanFor(marksOf([0, YEAR, 2 * YEAR]), YEAR, 3 * YEAR, YEAR + 10);
    expect(plan.fromTick).toBe(YEAR);
  });
});

describe('the panel and the session agree on which checkpoint a seek uses', () => {
  it('matches CheckpointRing.bestFor over every tick of a sweep', () => {
    const ticks = [0, YEAR, 2 * YEAR, 3 * YEAR, 7 * YEAR];
    const ring = ringOf(ticks);
    const marks = marksOf(ticks);
    const finalTick = 7 * YEAR + 12_345;

    for (let tick = 0; tick <= finalTick; tick += 3_701) {
      const plan = seekPlanFor(marks, 0, finalTick, tick);
      expect(ring.bestFor(tick)?.tick ?? 0, `tick ${tick}`).toBe(plan.fromTick);
    }
  });

  it('agrees on the boundaries themselves, where an off-by-one would hide', () => {
    const ticks = [0, YEAR, 2 * YEAR];
    const ring = ringOf(ticks);
    const marks = marksOf(ticks);
    for (const tick of [0, 1, YEAR - 1, YEAR, YEAR + 1, 2 * YEAR - 1, 2 * YEAR]) {
      expect(ring.bestFor(tick)?.tick, `tick ${tick}`).toBe(
        seekPlanFor(marks, 0, 2 * YEAR, tick).fromTick,
      );
    }
  });
});

describe('which chip is lit', () => {
  it('lights the newest mark at or before the position, whatever the gap', () => {
    const marks = marksOf([0, 20 * YEAR, 21 * YEAR]);
    // Nine years past the base and nowhere near the next chip: the old rule
    // (tick < chip + one year) lit nothing at all here.
    expect(activeMarkTick(marks, 9 * YEAR)).toBe(0);
    expect(activeMarkTick(marks, 20 * YEAR + 5)).toBe(20 * YEAR);
    expect(activeMarkTick(marks, 21 * YEAR)).toBe(21 * YEAR);
  });

  it('lights nothing before the first mark, and nothing at all without marks', () => {
    expect(activeMarkTick(marksOf([YEAR]), 10)).toBeNull();
    expect(activeMarkTick([], 10)).toBeNull();
  });
});
