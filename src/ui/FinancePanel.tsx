import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { CommandKind } from '../sim/commands/types';
import { LOAN_STEP_CT } from '../sim/constants';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

export function FinancePanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const cashCt = useSimStore((s) => s.cashCt);
  const loanCt = useSimStore((s) => s.loanCt);
  const loanLimitCt = useSimStore((s) => s.loanLimitCt);
  const availableCt = Math.max(0, loanLimitCt - loanCt);
  const step = formatMoney(LOAN_STEP_CT);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.finance.title')}</h2>

      <dl className="readout">
        <div>
          <dt>{t('ui.finance.cash')}</dt>
          <dd className={cashCt < 0 ? 'value value--danger' : 'value'}>{formatMoney(cashCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.loan')}</dt>
          <dd className="value">{formatMoney(loanCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.limit')}</dt>
          <dd className="value">{formatMoney(loanLimitCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.free')}</dt>
          <dd className="value">{formatMoney(availableCt)}</dd>
        </div>
      </dl>

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={availableCt < LOAN_STEP_CT}
          onClick={() => client.send({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT })}
        >
          {t('ui.finance.borrow', { amount: step })}
        </button>
        <button
          type="button"
          className="button"
          disabled={loanCt < LOAN_STEP_CT || cashCt < LOAN_STEP_CT}
          onClick={() => client.send({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT })}
        >
          {t('ui.finance.repay', { amount: step })}
        </button>
      </div>

      <p className="panel__hint">{t('ui.finance.interestHint')}</p>
    </section>
  );
}
