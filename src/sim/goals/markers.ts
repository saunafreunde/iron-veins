import type { GameEndMarker, GoalMarker } from '../../shared/protocol';
import { calendarFromTick } from '../World';
import type { World } from '../World';
import { goalTarget } from './evaluate';
import { medalFor } from './GoalStore';
import { companyScore, gameEndOf } from './score';
import { GoalKind, GoalStatus } from './types';

/**
 * The goal machine as the interface sees it (SPEC2 M17).
 *
 * Pure state-to-protocol mapping, in `src/sim` and beside the machine itself
 * so a unit test can hold the rows against the store - the D-174 pattern that
 * `sim/markers.ts` established. `SimWorker` is the only caller.
 *
 * Two things are converted here rather than in the panel, and both for the
 * same reason (D-191): the interface has no tick clock and must not grow one,
 * because reaching for `calendarFromTick` from a React component is exactly
 * the static import chain that pulled the whole `World` into the main bundle.
 * So band ticks arrive as calendar YEARS, and the subject of a goal arrives
 * with the town's name already looked up.
 */

/** Which of a goal's two subjects name a TOWN, by kind. */
function townSubjects(kind: number): { readonly a: boolean; readonly b: boolean } {
  switch (kind) {
    case GoalKind.TownPopulationReach:
    case GoalKind.StationRatingHold:
      return { a: true, b: false };
    case GoalKind.ConnectStations:
      return { a: true, b: true };
    default:
      return { a: false, b: false };
  }
}

/** A town's name, or '' for "any town" and for a subject that names none. */
function townName(world: World, townId: number, names: boolean): string {
  if (!names || townId < 0) return '';
  return world.towns[townId]?.name ?? '';
}

export function goalMarkers(world: World): GoalMarker[] {
  const goals = world.goals;
  const markers: GoalMarker[] = [];

  for (let at = 0; at < goals.count; at++) {
    const towns = townSubjects(goals.kind[at]!);
    const completedTick = goals.completedTick[at]!;
    markers.push({
      kind: goals.kind[at]!,
      subjectA: goals.subjectA[at]!,
      subjectB: goals.subjectB[at]!,
      threshold: goals.threshold[at]!,
      target: goalTarget(goals, at),
      progress: goals.progress[at]!,
      status: goals.status[at]!,
      medal: goals.medal[at]!,
      // What an OPEN goal is still playing for. A decided goal keeps the band
      // it earned, because the projection of a settled verdict would drift
      // downwards past the deadlines of a goal that is already won.
      projectedMedal:
        goals.status[at] === GoalStatus.Open ? medalFor(goals, at, world.tick) : goals.medal[at]!,
      thresholdYear:
        goals.kind[at] === GoalKind.SurviveUntil
          ? calendarFromTick(goals.threshold[at]!, world.startYear).year
          : 0,
      goldYear: calendarFromTick(goals.goldTick[at]!, world.startYear).year,
      silverYear: calendarFromTick(goals.silverTick[at]!, world.startYear).year,
      bronzeYear: calendarFromTick(goals.bronzeTick[at]!, world.startYear).year,
      completedYear: completedTick < 0 ? 0 : calendarFromTick(completedTick, world.startYear).year,
      townAName: townName(world, goals.subjectA[at]!, towns.a),
      townBName: townName(world, goals.subjectB[at]!, towns.b),
    });
  }
  return markers;
}

/** Where the game stands and what it is worth, ready to print. */
export function gameEndMarker(world: World): GameEndMarker {
  const score = companyScore(world);
  const date = world.date;
  return {
    reason: gameEndOf(world),
    year: date.year,
    month: date.month,
    day: date.day,
    goals: score.goals,
    value: score.value,
    network: score.network,
    cargo: score.cargo,
    total: score.total,
    goalCount: score.goalCount,
    goalsAchieved: score.goalsAchieved,
    medal: score.medal,
  };
}
