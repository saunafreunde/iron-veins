import { useEffect, type ReactElement } from 'react';
import { formatInteger, formatMoney, t } from '../i18n';
import type { GameEndMarker, GoalMarker, ScoreTermMarker } from '../shared/protocol';
import { GameEnd, GoalStatus } from '../sim/goals/types';
import { describeGoal, END_BODY_KEYS, END_TITLE_KEYS, MEDAL_KEYS, STATUS_KEYS } from './goalText';
import { useSimStore } from './store';

/**
 * The end of the game (SPEC2 M17): victory, defeat, a winding-up, or a century
 * that simply ran out.
 *
 * ONE screen for all four, because they are one event - the game is over and
 * here is what it came to - and because the bankruptcy of section 14.2 had no
 * screen at all until now: since M8 a wound-up company produced a news entry
 * and a red line in the finance panel, which is not an ending, it is a
 * footnote. The four readings differ in a headline, a sentence and which
 * quarters of the score survived.
 *
 * Everything shown is computed in the simulation from hashed state
 * (`sim/goals/score.ts`) and travels whole, so the screen is presentation over
 * a verdict rather than a second opinion about it. That is also what makes the
 * medals replay-verifiable: re-simulate the recording and the same numbers
 * come out, which `tests/unit/gameEnd.spec.ts` proves end to end.
 *
 * It can be dismissed. A player who has just lost may want to look at the map
 * that lost it, and a modal with no way out would be the interface deciding
 * that the game is finished with them.
 */

/** One scored quarter, with the measurement it came from. */
function Term({
  labelKey,
  detail,
  term,
}: {
  readonly labelKey: string;
  readonly detail: string;
  readonly term: ScoreTermMarker;
}): ReactElement {
  return (
    <div className="score-term">
      <span className="score-term__label">{t(labelKey)}</span>
      <span className="xray-term__meter">
        <span className="xray-term__fill" style={{ width: `${Math.round(term.share * 100)}%` }} />
      </span>
      <span className="score-term__value">{formatInteger(term.points)}</span>
      <span className="score-term__detail row__meta">{detail}</span>
    </div>
  );
}

/** The verdict line of one goal, as the scoreboard prints it. */
function goalLine(goal: GoalMarker): string {
  const description = describeGoal(goal);
  const params: Record<string, string | number> = { ...description.params };
  const cargo = params['cargo'];
  if (typeof cargo === 'string') params['cargo'] = t(cargo);
  const title = t(description.key, params);
  if (goal.status !== GoalStatus.Achieved) {
    return `${title} — ${t(STATUS_KEYS[goal.status] ?? STATUS_KEYS[0])}`;
  }
  return `${title} — ${t(MEDAL_KEYS[goal.medal] ?? MEDAL_KEYS[0])} (${goal.completedYear})`;
}

export function GameEndScreen({
  end,
  onClose,
  onMenu,
}: {
  readonly end: GameEndMarker;
  readonly onClose: () => void;
  readonly onMenu: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const goals = useSimStore((s) => s.goals);
  const companyName = useSimStore((s) => s.companyName);
  const stageId = useSimStore((s) => s.activeCampaignStageId);
  const scenario = useSimStore((s) => s.activeScenario);
  const completeCampaignStage = useSimStore((s) => s.completeCampaignStage);
  const recordScenarioMedal = useSimStore((s) => s.recordScenarioMedal);

  const titleKey = END_TITLE_KEYS[end.reason] ?? END_TITLE_KEYS[0];
  const bodyKey = END_BODY_KEYS[end.reason] ?? END_BODY_KEYS[0];

  /**
   * A campaign stage is completed here, and only on a WIN (SPEC2 M24, D-254).
   *
   * The end screen is where a campaign completion belongs because this is where
   * the verdict arrives, and the verdict is the simulation's: `GameEnd.Won`
   * means every goal achieved and `end.medal` is the weakest band any of them
   * earned, both computed from hashed state and both replay-verifiable (D-196).
   * Nothing is decided here - the screen books what the world decided.
   *
   * In an effect rather than in render, because booking progress is a side
   * effect and a component may render twice; the store keeps the BEST medal, so
   * a second booking of the same run changes nothing.
   */
  useEffect(() => {
    if (stageId === null || end.reason !== GameEnd.Won) return;
    completeCampaignStage(stageId, end.medal);
  }, [stageId, end.reason, end.medal, completeCampaignStage]);

  /**
   * The same booking for the SCENARIO itself (SPEC2 M24's "Szenario-Medaillen"),
   * and it is deliberately not conditioned on the campaign: the eight scenarios
   * of M17 have no chain, and the medal a player took on one of them is worth
   * keeping whichever door they came through. A campaign stage is a scenario, so
   * a won stage books both - the chain and the medal - which is why they are two
   * records and not one.
   */
  useEffect(() => {
    if (scenario === null || end.reason !== GameEnd.Won) return;
    recordScenarioMedal(scenario.id, end.medal);
  }, [scenario, end.reason, end.medal, recordScenarioMedal]);

  return (
    <div className="gameend" role="dialog" aria-modal="false">
      <section className="panel panel--wide">
        <h2 className="panel__title">{t(titleKey, { company: companyName })}</h2>
        <p>{t(bodyKey, { company: companyName, year: end.year })}</p>

        {end.reason === GameEnd.Won && (
          <p className="value value--success">
            {t('ui.end.medal', { medal: t(MEDAL_KEYS[end.medal] ?? MEDAL_KEYS[0]) })}
          </p>
        )}

        {stageId !== null && (
          <p className="row__meta">
            {end.reason === GameEnd.Won
              ? t('ui.end.campaign.booked', {
                  medal: t(MEDAL_KEYS[end.medal] ?? MEDAL_KEYS[0]),
                })
              : t('ui.end.campaign.notBooked')}
          </p>
        )}

        <h3 className="panel__title">{t('ui.end.score', { score: formatInteger(end.total) })}</h3>
        {/* The four quarters, each with the figure it was computed from -
            "print why" is the house rule for a balancing number, and a score
            the player cannot take apart is a number they cannot play towards. */}
        <Term
          labelKey="ui.end.term.goals"
          detail={
            end.goalCount === 0
              ? t('ui.end.term.goals.none')
              : t('ui.end.term.goals.detail', {
                  achieved: end.goalsAchieved,
                  of: end.goalCount,
                })
          }
          term={end.goals}
        />
        <Term
          labelKey="ui.end.term.value"
          detail={t('ui.end.term.value.detail', { value: formatMoney(end.value.measured) })}
          term={end.value}
        />
        <Term
          labelKey="ui.end.term.network"
          detail={t('ui.end.term.network.detail', {
            percent: (end.network.measured * 100).toFixed(1),
          })}
          term={end.network}
        />
        <Term
          labelKey="ui.end.term.cargo"
          detail={t('ui.end.term.cargo.detail', {
            units: formatInteger(Math.round(end.cargo.measured)),
          })}
          term={end.cargo}
        />

        {goals.length > 0 && (
          <ul className="list">
            {goals.map((goal, at) => (
              <li key={at} className="row">
                <span>{goalLine(goal)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="button-row">
          <button type="button" className="button" onClick={onClose}>
            {t('ui.end.keepLooking')}
          </button>
          <button type="button" className="button button--active" onClick={onMenu}>
            {t('ui.end.toMenu')}
          </button>
        </div>
      </section>
    </div>
  );
}
