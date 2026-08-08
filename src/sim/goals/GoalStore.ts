import { MAX_GOALS } from '../constants';
import {
  GoalMedal,
  GoalOutcome,
  GoalStatus,
  type GoalSave,
  type GoalSpec,
  type GoalKind,
} from './types';

/**
 * The goals of a world, struct of arrays and preallocated whole (law #7).
 *
 * Every array is `capacity` long from construction, so the daily hook writes
 * into storage that already exists and allocates nothing - the descriptors are
 * "preallocated at load" in the literal sense SPEC2 M17 asks for. `count` is
 * how many of the slots an author filled.
 *
 * There is no alive bitmap and no destroy: a goal is part of what the world
 * IS, fixed when it is created. A world with no goals has `count = 0`, which
 * is what every game started before M17 has and what the migration enters.
 */
export class GoalStore {
  readonly capacity: number;
  /** How many goals this world carries. */
  count = 0;

  // ------------------------------------------------- the author's half
  readonly kind: Int32Array;
  readonly subjectA: Int32Array;
  readonly subjectB: Int32Array;
  /** Float64: a threshold is cents, units, inhabitants, points or a tick. */
  readonly threshold: Float64Array;
  readonly goldTick: Int32Array;
  readonly silverTick: Int32Array;
  readonly bronzeTick: Int32Array;

  // ------------------------------------------------------- the verdict
  /** Latest measurement in the threshold's own unit; what the panel draws. */
  readonly progress: Float64Array;
  /** Consecutive days the hold condition has held (StationRatingHold). */
  readonly holdDays: Int32Array;
  readonly status: Int32Array;
  readonly medal: Int32Array;
  /** Tick of the achievement, or -1. */
  readonly completedTick: Int32Array;

  constructor(capacity: number = MAX_GOALS) {
    this.capacity = capacity;
    this.kind = new Int32Array(capacity);
    this.subjectA = new Int32Array(capacity);
    this.subjectB = new Int32Array(capacity);
    this.threshold = new Float64Array(capacity);
    this.goldTick = new Int32Array(capacity);
    this.silverTick = new Int32Array(capacity);
    this.bronzeTick = new Int32Array(capacity);
    this.progress = new Float64Array(capacity);
    this.holdDays = new Int32Array(capacity);
    this.status = new Int32Array(capacity);
    this.medal = new Int32Array(capacity);
    this.completedTick = new Int32Array(capacity);
  }

  /**
   * Take the next slot for `spec`, returning its index or -1 when the store is
   * full. The verdict starts Open with no medal and no completion tick, which
   * is what a world that has not been played yet honestly knows.
   */
  add(spec: GoalSpec): number {
    if (this.count >= this.capacity) return -1;
    const at = this.count++;
    this.kind[at] = spec.kind;
    this.subjectA[at] = spec.subjectA;
    this.subjectB[at] = spec.subjectB;
    this.threshold[at] = spec.threshold;
    this.goldTick[at] = spec.goldTick;
    this.silverTick[at] = spec.silverTick;
    this.bronzeTick[at] = spec.bronzeTick;
    this.progress[at] = 0;
    this.holdDays[at] = 0;
    this.status[at] = GoalStatus.Open;
    this.medal[at] = GoalMedal.None;
    this.completedTick[at] = -1;
    return at;
  }

  /** Restore a goal, verdict and all, from a save. */
  load(save: GoalSave): number {
    const at = this.add(save);
    if (at < 0) return -1;
    this.progress[at] = save.progress;
    this.holdDays[at] = save.holdDays;
    this.status[at] = save.status;
    this.medal[at] = save.medal;
    this.completedTick[at] = save.completedTick;
    return at;
  }

  /** Serialised form, in slot order. */
  toData(): GoalSave[] {
    const result: GoalSave[] = [];
    for (let at = 0; at < this.count; at++) {
      result.push({
        kind: this.kind[at]! as GoalKind,
        subjectA: this.subjectA[at]!,
        subjectB: this.subjectB[at]!,
        threshold: this.threshold[at]!,
        goldTick: this.goldTick[at]!,
        silverTick: this.silverTick[at]!,
        bronzeTick: this.bronzeTick[at]!,
        progress: this.progress[at]!,
        holdDays: this.holdDays[at]!,
        status: this.status[at]! as GoalStatus,
        medal: this.medal[at]! as GoalMedal,
        completedTick: this.completedTick[at]!,
      });
    }
    return result;
  }
}

/** Build a store from validated save data. */
export function buildGoalStore(saves: readonly GoalSave[]): GoalStore {
  const store = new GoalStore();
  for (const save of saves) store.load(save);
  return store;
}

/**
 * The band a completion at `tick` falls into.
 *
 * Total by construction - it needs no ordering between the three ticks and
 * cannot return None for a tick inside the bronze band - so a bent band in a
 * file produces a defensible medal rather than an exception in the hook. The
 * parser is what refuses bent bands (save/entities.ts).
 */
export function medalFor(store: GoalStore, at: number, tick: number): GoalMedal {
  if (tick <= store.goldTick[at]!) return GoalMedal.Gold;
  if (tick <= store.silverTick[at]!) return GoalMedal.Silver;
  if (tick <= store.bronzeTick[at]!) return GoalMedal.Bronze;
  return GoalMedal.None;
}

/**
 * Where the world's goals stand as a whole: Won when every one of them was
 * achieved, Lost when they are all decided and at least one failed, Open while
 * any is still running. A world with no goals is never Won - there was nothing
 * to win.
 */
export function goalsOutcome(store: GoalStore): GoalOutcome {
  if (store.count === 0) return GoalOutcome.Open;
  let failed = false;
  for (let at = 0; at < store.count; at++) {
    if (store.status[at] === GoalStatus.Open) return GoalOutcome.Open;
    if (store.status[at] === GoalStatus.Failed) failed = true;
  }
  return failed ? GoalOutcome.Lost : GoalOutcome.Won;
}

/**
 * The medal for the set: the WEAKEST band any goal earned, because a scenario
 * is won as a whole or not at all. None while anything is open or failed.
 */
export function overallMedal(store: GoalStore): GoalMedal {
  if (goalsOutcome(store) !== GoalOutcome.Won) return GoalMedal.None;
  let worst: GoalMedal = GoalMedal.Gold;
  for (let at = 0; at < store.count; at++) {
    const medal = store.medal[at]! as GoalMedal;
    if (medal < worst) worst = medal;
  }
  return worst;
}
