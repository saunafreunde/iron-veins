import { formatInteger, formatMoney } from '../i18n';
import type { GameEndMarker, GoalMarker } from '../shared/protocol';
import { cargoSpec, type Cargo } from '../sim/cargo/types';
import { GameEnd, GoalKind, GoalStatus } from '../sim/goals/types';

/**
 * Putting a goal and an ending into words (SPEC2 M17).
 *
 * Pure functions over the markers, in their own module for the reason
 * `ui/chart.ts` and `ui/replayScrub.ts` are: a headless test can then drive
 * exactly what the panel prints instead of a re-implementation of it. Nothing
 * here reaches into the simulation for a NUMBER - the three imports are the
 * cargo name table and two enumerations, all of them import-free leaves (the
 * D-191 rule: sim modules reach the interface through dynamic imports, and the
 * static ones must be leaves that carry no `World`).
 *
 * **The panel names a goal from its DESCRIPTOR, never from a briefing.** A
 * scenario's caption is content that travels with the scenario (D-195) and a
 * loaded save carries goals with no metadata block at all - so a panel that
 * needed captions would be blank in every game that was saved and reloaded.
 * What the descriptor states is exactly what the daily hook measures (D-193),
 * which is also the D-179 principle: the instrument displays the simulation's
 * own terms.
 */

/** A sentence the interface has to translate: the key and what to put in it. */
export interface Phrase {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** Translation keys for the four medal bands, indexed by `GoalMedal`. */
export const MEDAL_KEYS = [
  'ui.goal.medal.none',
  'ui.goal.medal.bronze',
  'ui.goal.medal.silver',
  'ui.goal.medal.gold',
] as const;

/** Translation keys for the three goal states, indexed by `GoalStatus`. */
export const STATUS_KEYS = [
  'ui.goal.status.open',
  'ui.goal.status.achieved',
  'ui.goal.status.failed',
] as const;

/** Headline of the end screen, indexed by `GameEnd`. */
export const END_TITLE_KEYS = [
  'ui.end.running',
  'ui.end.won.title',
  'ui.end.bankrupt.title',
  'ui.end.lost.title',
  'ui.end.century.title',
] as const;

/** The sentence under the headline, indexed by `GameEnd`. */
export const END_BODY_KEYS = [
  'ui.end.running',
  'ui.end.won.body',
  'ui.end.bankrupt.body',
  'ui.end.lost.body',
  'ui.end.century.body',
] as const;

/** A figure in the unit the goal measures in. */
function figure(goal: GoalMarker, value: number): string {
  return goal.kind === GoalKind.CompanyValueBy ? formatMoney(value) : formatInteger(value);
}

/**
 * What this goal asks for, as one sentence.
 *
 * Six kinds and four of them have an "any" form, because a goal authored
 * against a GENERATED map cannot always name its subject (D-193): -1 means
 * "any town" or "all cargo together", and the sentence has to say so rather
 * than print a blank.
 */
export function describeGoal(goal: GoalMarker): Phrase {
  switch (goal.kind) {
    case GoalKind.CompanyValueBy:
      return { key: 'ui.goal.kind.value', params: { target: formatMoney(goal.threshold) } };
    case GoalKind.CargoDeliveredTotal:
      return goal.subjectA < 0
        ? { key: 'ui.goal.kind.cargoAny', params: { target: formatInteger(goal.threshold) } }
        : {
            key: 'ui.goal.kind.cargo',
            params: {
              target: formatInteger(goal.threshold),
              cargo: cargoSpec(goal.subjectA as Cargo).nameKey,
            },
          };
    case GoalKind.TownPopulationReach:
      return goal.subjectA < 0
        ? { key: 'ui.goal.kind.populationAny', params: { target: formatInteger(goal.threshold) } }
        : {
            key: 'ui.goal.kind.population',
            params: { target: formatInteger(goal.threshold), town: goal.townAName },
          };
    case GoalKind.ConnectStations:
      return {
        key: 'ui.goal.kind.connect',
        params: { from: goal.townAName, to: goal.townBName },
      };
    case GoalKind.StationRatingHold:
      return goal.subjectA < 0
        ? {
            key: 'ui.goal.kind.ratingAny',
            params: { rating: goal.threshold, days: goal.target },
          }
        : {
            key: 'ui.goal.kind.rating',
            params: { rating: goal.threshold, days: goal.target, town: goal.townAName },
          };
    default:
      return { key: 'ui.goal.kind.survive', params: { year: goal.thresholdYear } };
  }
}

/**
 * The running figure beside the bar, or null where there is none to give.
 *
 * `SurviveUntil` is the deliberate null: its progress is the tick the game
 * stands at, and the calendar is on the status bar already - printing
 * "1,234,567 of 1,800,000" would be a number in a unit no player thinks in.
 * `ConnectStations` is a yes or a no rather than a quotient.
 */
export function goalFigure(goal: GoalMarker): Phrase | null {
  switch (goal.kind) {
    case GoalKind.SurviveUntil:
      return null;
    case GoalKind.ConnectStations:
      return { key: goal.progress > 0 ? 'ui.goal.connected' : 'ui.goal.notConnected', params: {} };
    case GoalKind.StationRatingHold:
      return {
        key: 'ui.goal.figure.days',
        params: { current: formatInteger(goal.progress), target: formatInteger(goal.target) },
      };
    default:
      return {
        key: 'ui.goal.figure',
        params: { current: figure(goal, goal.progress), target: figure(goal, goal.target) },
      };
  }
}

/**
 * Progress in thousandths for the bar.
 *
 * `live` is the goal block of the published snapshot - the moving half of the
 * goal machine, and the reason the block exists (D-193). It is preferred over
 * the marker's own arithmetic because it is the simulation's own answer,
 * computed by `goalProgressMilli`; the fallback covers the frames before the
 * first block has been read and a marker list that outran it.
 */
export function goalProgressOf(goal: GoalMarker, live: readonly number[], at: number): number {
  const published = live[at];
  if (published !== undefined) return published;
  if (goal.status === GoalStatus.Achieved) return 1_000;
  if (goal.target <= 0) return 0;
  const milli = Math.round((goal.progress / goal.target) * 1_000);
  return milli < 0 ? 0 : milli > 1_000 ? 1_000 : milli;
}

/**
 * Whether the end screen should be on screen.
 *
 * Three conditions, and each one is a rule rather than a convenience: there
 * has to BE an ending; the player must not have dismissed this one already (by
 * reason, because the marker is re-sent every game day); and a recording is
 * never interrupted by it, because the buttons on that screen start and load
 * games and a replay is somebody else's game to begin with (D-189).
 */
export function showsEndScreen(
  end: GameEndMarker | null,
  dismissed: number | null,
  replaying: boolean,
): boolean {
  if (end === null || replaying) return false;
  if (end.reason === GameEnd.Running) return false;
  return end.reason !== dismissed;
}
