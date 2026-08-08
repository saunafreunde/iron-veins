import { SNAPSHOT_GOAL_STRIDE, SNAPSHOT_MAX_GOALS, SnapshotGoal } from '../../shared/snapshot';
import { goalProgressMilli } from './evaluate';
import type { GoalStore } from './GoalStore';
import { GoalStatus } from './types';

/**
 * The goal block of the render snapshot (SPEC2 M17, the milestone's one booked
 * layout change).
 *
 * Only what MOVES travels here: how far along each goal is, and where it
 * stands. What a goal IS - its kind, its subject, its threshold, its band
 * ticks and its briefing - is fixed at world genesis and belongs on the
 * low-frequency channel, never in the 20 Hz stride (E-05, Fehler 37).
 *
 * Two Int32 per goal times eight goals is the 64 bytes the ledger booked.
 * `Standing` folds the status and the medal into one signed number, which is
 * what keeps it at two: -1 failed, 0 open, 1..3 the band. Every achievement
 * earns at least bronze, so the encoding loses nothing.
 *
 * Written from the ONE publish pass with every other block (Fehler 33), and
 * allocation-free like the rest of it.
 */
export function writeGoalBlock(store: GoalStore, block: Int32Array): number {
  const written = store.count < SNAPSHOT_MAX_GOALS ? store.count : SNAPSHOT_MAX_GOALS;

  for (let at = 0; at < written; at++) {
    const base = at * SNAPSHOT_GOAL_STRIDE;
    block[base + SnapshotGoal.ProgressMilli] = goalProgressMilli(store, at);
    block[base + SnapshotGoal.Standing] =
      store.status[at] === GoalStatus.Failed ? -1 : store.medal[at]!;
  }
  return written;
}
