import type { ReactElement } from 'react';
import { t } from '../i18n';
import type { GoalMarker } from '../shared/protocol';
import { GoalStatus } from '../sim/goals/types';
import { describeGoal, goalFigure, goalProgressOf, MEDAL_KEYS, STATUS_KEYS } from './goalText';
import { useSimStore } from './store';

/**
 * The goal panel of SPEC2 M17: what the scenario asks for and how far along it
 * is, in the sidebar beside the books.
 *
 * Every number on it is the simulation's own (D-179's rule for the station
 * x-ray, applied here): the verdict, the medal and the exact reading come from
 * the daily hook over the marker channel, and the bar is the snapshot's goal
 * block - the moving half D-193 booked the sixty-four bytes for. Nothing is
 * recomputed here, so the panel and the world hash can never disagree about
 * who is winning.
 *
 * A goal is named from its DESCRIPTOR rather than from a briefing, because a
 * loaded save carries goals and no metadata block (see `goalText.ts`).
 */

/** Medal a still-open goal is playing for, or the band it earned. */
function medalLine(goal: GoalMarker): ReactElement {
  const open = goal.status === GoalStatus.Open;
  const medal = open ? goal.projectedMedal : goal.medal;
  const key = MEDAL_KEYS[medal] ?? MEDAL_KEYS[0];
  return (
    <span className="row__meta">
      {open
        ? t('ui.goal.projected', { medal: t(key) })
        : t('ui.goal.earned', { medal: t(key), year: goal.completedYear })}
    </span>
  );
}

/**
 * The goal's sentence, with the one parameter that is itself a translation
 * key resolved: a cargo name lives in the catalogue, and the pure description
 * has no `t` to reach for.
 */
function titleOf(goal: GoalMarker): string {
  const description = describeGoal(goal);
  const params: Record<string, string | number> = { ...description.params };
  const cargo = params['cargo'];
  if (typeof cargo === 'string') params['cargo'] = t(cargo);
  return t(description.key, params);
}

function GoalRow({ goal, milli }: { readonly goal: GoalMarker; readonly milli: number }) {
  const figure = goalFigure(goal);
  const statusKey = STATUS_KEYS[goal.status] ?? STATUS_KEYS[0];

  return (
    <li className="goal">
      <span className="goal__title">{titleOf(goal)}</span>
      <progress className="progress goal__bar" value={milli} max={1000} />
      <span className="goal__figures">
        {figure !== null && (
          <span className="value value--mono">{t(figure.key, figure.params)}</span>
        )}
        <span
          className={
            goal.status === GoalStatus.Failed
              ? 'row__meta value--danger'
              : goal.status === GoalStatus.Achieved
                ? 'row__meta value--success'
                : 'row__meta'
          }
        >
          {t(statusKey)}
        </span>
      </span>
      {medalLine(goal)}
      <span className="row__meta">
        {t('ui.goal.bands', {
          gold: goal.goldYear,
          silver: goal.silverYear,
          bronze: goal.bronzeYear,
        })}
      </span>
    </li>
  );
}

export function GoalPanel(): ReactElement | null {
  useSimStore((s) => s.locale);
  const goals = useSimStore((s) => s.goals);
  const progress = useSimStore((s) => s.goalProgress);
  const end = useSimStore((s) => s.gameEnd);

  // A plain game has no goals, and an empty panel with a heading would be a
  // permanent piece of furniture about nothing.
  if (goals.length === 0) return null;

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.goal.title')}</h2>
      <ul className="list goals">
        {goals.map((goal, at) => (
          <GoalRow key={at} goal={goal} milli={goalProgressOf(goal, progress, at)} />
        ))}
      </ul>
      {end !== null && (
        <p className="panel__hint">
          {t('ui.goal.score', { score: end.total, achieved: end.goalsAchieved, of: end.goalCount })}
        </p>
      )}
    </section>
  );
}
