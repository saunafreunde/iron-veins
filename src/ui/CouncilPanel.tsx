import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { TownMarker } from '../shared/protocol';
import { CommandKind } from '../sim/commands/types';
import {
  COUNCIL_EXCLUSIVE_MIN_RATING,
  COUNCIL_REFUSAL_RATING,
  TOWN_MEASURE_COST_CT,
} from '../sim/constants';
import { TOWN_MEASURE_KEYS } from '../sim/town/council';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The town council of section 13.3, for the town the player is looking at.
 *
 * Everything here is a command, including the two that only move an opinion:
 * the interface never reaches into the simulation, so buying a campaign goes
 * through the queue exactly as laying a rail does.
 */
export function CouncilPanel({
  town,
  client,
}: {
  readonly town: TownMarker;
  readonly client: SimClient;
}): ReactElement {
  useSimStore((s) => s.locale);
  const companies = useSimStore((s) => s.companies);
  const cashCt = useSimStore((s) => s.cashCt);

  const holder = companies.find((company) => company.id === town.exclusiveCompanyId);
  const ratingClass =
    town.councilRating < COUNCIL_REFUSAL_RATING
      ? 'value value--danger'
      : town.councilRating >= COUNCIL_EXCLUSIVE_MIN_RATING
        ? 'value value--success'
        : 'value';

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.council.title')}</span>
      <dl className="readout">
        <div>
          <dt>{t('ui.council.rating')}</dt>
          <dd className={ratingClass}>{town.councilRating}</dd>
        </div>
        <div>
          <dt>{t('ui.council.exclusive')}</dt>
          <dd className="value">
            {holder === undefined
              ? t('ui.council.exclusiveFree')
              : t('ui.council.exclusiveHeld', {
                  company: holder.name,
                  months: town.exclusiveMonthsLeft,
                })}
          </dd>
        </div>
      </dl>

      {town.councilRating < COUNCIL_REFUSAL_RATING && (
        <p className="panel__hint value--danger">{t('ui.council.refused')}</p>
      )}

      <button
        type="button"
        className="button"
        disabled={
          town.exclusiveCompanyId >= 0 ||
          town.councilRating < COUNCIL_EXCLUSIVE_MIN_RATING ||
          town.exclusiveCostCt > cashCt
        }
        onClick={() => client.send({ kind: CommandKind.BuyExclusiveRights, townId: town.id })}
      >
        {t('ui.council.buyRights', { price: formatMoney(town.exclusiveCostCt) })}
      </button>

      <div className="button-row">
        {TOWN_MEASURE_KEYS.map((key, measure) => {
          const costCt = TOWN_MEASURE_COST_CT[measure] ?? 0;
          const ready = town.measureReady[measure] ?? true;
          return (
            <button
              key={key}
              type="button"
              className="button"
              disabled={!ready || costCt > cashCt}
              title={ready ? formatMoney(costCt) : t('ui.council.cooldown')}
              onClick={() =>
                client.send({ kind: CommandKind.ApplyTownMeasure, townId: town.id, measure })
              }
            >
              {t(key)}
            </button>
          );
        })}
      </div>
    </>
  );
}
