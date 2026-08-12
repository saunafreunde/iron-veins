import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { CARGO_SPECS } from '../sim/cargo/types';
import { CommandKind } from '../sim/commands/types';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The tender list of section 14.4: what is on offer, how long is left, what it
 * pays, and how far the company has got - and since SPEC2 M21 the two boards
 * beside it, because all three are the same question ("what is somebody paying
 * over the odds for?") on three different cadences.
 *
 * The supply board is opt-in like a tender and shows THIS month's share. The
 * subsidy board has no button at all and that is the point: the only way to
 * take part in a race is to build the line, so the panel reports it and never
 * offers to enter it.
 *
 * The profitability estimate the section asks for is the bonus against what is
 * still to be carried. It is deliberately not a promise - the game cannot know
 * what a line will cost to build - but it is the number a player actually needs
 * to decide, and it is honest about being an estimate.
 */
export function ContractPanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const contracts = useSimStore((s) => s.contracts);
  const supplyOrders = useSimStore((s) => s.supplyOrders);
  const subsidies = useSimStore((s) => s.subsidies);
  const centre = useSimStore((s) => s.centreOnTile);
  const towns = useSimStore((s) => s.towns);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.contracts.title')}</h2>

      {contracts.length === 0 ? (
        <p className="panel__hint">{t('ui.contracts.empty')}</p>
      ) : (
        <ul className="news">
          {contracts.map((contract) => {
            const town = towns[contract.townId];
            const left = Math.round(contract.amountUnits * (1 - contract.progress));
            return (
              <li key={contract.id}>
                <div className="row">
                  <button
                    type="button"
                    className="contract__where"
                    disabled={town === undefined}
                    onClick={() => {
                      if (town !== undefined) centre(town.x, town.y);
                    }}
                  >
                    {t('ui.contracts.line', {
                      amount: contract.amountUnits,
                      cargo: t(CARGO_SPECS[contract.cargo]?.nameKey ?? ''),
                      town: contract.townName,
                    })}
                  </button>

                  <span className="row__meta">
                    {t('ui.contracts.deadline', { months: contract.monthsLeft })} ·{' '}
                    {t('ui.contracts.bonus', { bonus: formatMoney(contract.bonusCt) })}
                    {contract.rivals > 0 &&
                      ` · ${t('ui.contracts.rivals', { count: contract.rivals })}`}
                  </span>

                  {contract.accepted ? (
                    <>
                      <progress className="progress" value={contract.progress} max={1} />
                      <span className="row__meta">
                        {t('ui.contracts.estimate', {
                          value: `${left} · ${Math.round(contract.progress * 100)} %`,
                        })}
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        client.send({ kind: CommandKind.AcceptContract, contractId: contract.id })
                      }
                    >
                      {t('ui.contracts.accept')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="panel__subtitle">{t('ui.supply.title')}</h3>
      {supplyOrders.length === 0 ? (
        <p className="panel__hint">{t('ui.supply.empty')}</p>
      ) : (
        <ul className="news">
          {supplyOrders.map((order) => (
            <li key={order.id}>
              <div className="row">
                <button
                  type="button"
                  className="contract__where"
                  onClick={() => centre(order.x, order.y)}
                >
                  {t('ui.supply.line', {
                    amount: order.quotaUnits,
                    cargo: t(CARGO_SPECS[order.cargo]?.nameKey ?? ''),
                    industry: t(order.industryNameKey),
                  })}
                </button>

                <span className="row__meta">
                  {t('ui.supply.runs', { months: order.monthsLeft })} ·{' '}
                  {t('ui.supply.bonus', { bonus: formatMoney(order.bonusCt) })}
                  {order.monthsMissed > 0 &&
                    ` · ${t('ui.supply.missed', { months: order.monthsMissed })}`}
                  {order.rivals > 0 && ` · ${t('ui.contracts.rivals', { count: order.rivals })}`}
                </span>

                {order.accepted ? (
                  <>
                    <progress className="progress" value={order.progress} max={1} />
                    <span className="row__meta">
                      {t('ui.supply.thisMonth', {
                        value: `${Math.round(order.progress * 100)} %`,
                      })}
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      client.send({
                        kind: CommandKind.AcceptSupplyContract,
                        contractId: order.id,
                      })
                    }
                  >
                    {t('ui.contracts.accept')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="panel__subtitle">{t('ui.subsidies.title')}</h3>
      {subsidies.length === 0 ? (
        <p className="panel__hint">{t('ui.subsidies.empty')}</p>
      ) : (
        <ul className="news">
          {subsidies.map((subsidy) => (
            <li key={subsidy.id}>
              <div className="row">
                <button
                  type="button"
                  className="contract__where"
                  onClick={() => centre(subsidy.fromX, subsidy.fromY)}
                >
                  {t('ui.subsidies.line', {
                    cargo: t(CARGO_SPECS[subsidy.cargo]?.nameKey ?? ''),
                    percent: subsidy.ratePercent,
                  })}
                </button>

                <span className="row__meta">
                  {t('ui.subsidies.runs', { months: subsidy.monthsLeft })} ·{' '}
                  {subsidy.claimedBy < 0
                    ? t('ui.subsidies.open')
                    : t('ui.subsidies.won', { company: subsidy.claimedByName })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
