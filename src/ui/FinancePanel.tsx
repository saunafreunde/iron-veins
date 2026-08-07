import type { ReactElement } from 'react';
import { formatMoney, formatMoneyCompact, monthName, t } from '../i18n';
import type { FinanceReport } from '../shared/protocol';
import { CommandKind } from '../sim/commands/types';
import { ACCOUNT_COUNT, ACCOUNT_NAME_KEYS, isRevenue, profitCt } from '../sim/economy/ledger';
import {
  BANKRUPTCY_MONTHS,
  BANKRUPTCY_WARNING_MONTHS,
  KG_PER_TONNE,
  LOAN_STEP_CT,
  MONTHS_PER_YEAR,
} from '../sim/constants';
import { niceScale, seriesPoints, valueToY } from './chart';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';
import { Tooltip } from './Tooltip';

export function FinancePanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const cashCt = useSimStore((s) => s.cashCt);
  const loanCt = useSimStore((s) => s.loanCt);
  const loanLimitCt = useSimStore((s) => s.loanLimitCt);
  const monthsInDebt = useSimStore((s) => s.monthsInDebt);
  const finances = useSimStore((s) => s.finances);
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

      {monthsInDebt >= BANKRUPTCY_MONTHS && (
        <p className="panel__hint value--danger">{t('ui.finance.bankrupt')}</p>
      )}
      {monthsInDebt >= BANKRUPTCY_WARNING_MONTHS && monthsInDebt < BANKRUPTCY_MONTHS && (
        <p className="panel__hint value--danger">
          {t('ui.finance.inDebt', {
            months: monthsInDebt,
            left: BANKRUPTCY_MONTHS - monthsInDebt,
          })}
        </p>
      )}
      <p className="panel__hint">{t('ui.finance.interestHint')}</p>

      {finances !== null && finances.co2ThisYearKg > 0 && (
        <dl className="readout">
          <div>
            <dt>{t('ui.finance.co2')}</dt>
            <dd className="value value--mono">
              {t('ui.finance.co2Value', {
                tonnes: Math.round(finances.co2ThisYearKg / KG_PER_TONNE),
              })}
            </dd>
          </div>
        </dl>
      )}

      {/* Auto-renewal moved to the line detail panel with M11: the switch is
          per LINE now (section 11.3), so the books no longer carry it. */}
      {finances !== null && <Books report={finances} />}
    </section>
  );
}

/**
 * The three views section 14.1 asks for: a profit and loss against last year, a
 * balance sheet, and twenty-four months of cash flow.
 *
 * The chart is drawn with plain divs rather than a canvas. It is twenty-four
 * bars that change once a game month; a canvas would be a second rendering path
 * to keep alive for no gain, and a div scales with the UI zoom for free.
 */
function Books({ report }: { readonly report: FinanceReport }): ReactElement {
  const rows = [];
  for (let account = 0; account < ACCOUNT_COUNT; account++) {
    const thisYear = report.year[account] ?? 0;
    const lastYear = report.lastYear[account] ?? 0;
    if (thisYear === 0 && lastYear === 0) continue;
    const sign = isRevenue(account) ? 1 : -1;
    rows.push(
      <div key={account}>
        <dt>{t(ACCOUNT_NAME_KEYS[account] ?? '')}</dt>
        <dd className={sign > 0 ? 'value' : 'value value--warning'}>
          {formatMoney(sign * thisYear)}
        </dd>
      </div>,
    );
  }

  const thisYearProfit = profitCt(report.year);
  const lastYearProfit = profitCt(report.lastYear);

  // The tallest month decides the scale, so an empty history draws flat rather
  // than dividing by zero.
  let peak = 1;
  for (const month of report.history) {
    const size = Math.abs(profitCt(month));
    if (size > peak) peak = size;
  }

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.finance.pnl')}</span>
      <dl className="readout">
        {rows}
        <div>
          <dt>{t('ui.finance.profit')}</dt>
          <dd className={thisYearProfit < 0 ? 'value value--danger' : 'value'}>
            {formatMoney(thisYearProfit)}
          </dd>
        </div>
        <div>
          <dt>{t('ui.finance.lastYear')}</dt>
          <dd className="value">{formatMoney(lastYearProfit)}</dd>
        </div>
      </dl>

      <span className="field__label field__label--spaced">{t('ui.finance.balanceSheet')}</span>
      <dl className="readout">
        <div>
          <dt>{t('ui.finance.cash')}</dt>
          <dd className="value">{formatMoney(report.cashCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.assets')}</dt>
          <dd className="value">{formatMoney(report.bookValueCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.loan')}</dt>
          <dd className="value">{formatMoney(-report.loanCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.finance.equity')}</dt>
          <dd className={report.companyValueCt < 0 ? 'value value--danger' : 'value'}>
            {formatMoney(report.companyValueCt)}
          </dd>
        </div>
      </dl>

      <ValueGraph report={report} />

      <span className="field__label field__label--spaced">{t('ui.finance.cashflow')}</span>
      <div className="chart-frame">
        {/* The 24-month detail keeps its div bars (the M6 precedent - one
            render path, scales with the UI zoom for free) and gains what M14
            asked of it: a labelled scale and the months it covers. The bars
            show the month's |result|; the colour carries the sign. */}
        <div className="chart-frame__axis">
          <span>{formatMoneyCompact(peak)}</span>
          <span>{formatMoneyCompact(0)}</span>
        </div>
        <div className="chart-frame__plot">
          <div className="chart">
            {report.history.map((month, index) => {
              const profit = profitCt(month);
              const height = Math.max(2, Math.round((Math.abs(profit) / peak) * 100));
              return (
                <span
                  key={index}
                  className={profit < 0 ? 'chart__bar chart__bar--loss' : 'chart__bar'}
                  style={{ height: `${height}%` }}
                  title={formatMoney(profit)}
                />
              );
            })}
          </div>
          <CashflowRange months={report.history.length} />
        </div>
      </div>
    </>
  );
}

/** First and last month the 24-bar ring covers, labelled under its plot. */
function CashflowRange({ months }: { readonly months: number }): ReactElement {
  const year = useSimStore((s) => s.year);
  const month = useSimStore((s) => s.month);

  // The ring ends at the month BEFORE the one in progress.
  const newest = year * MONTHS_PER_YEAR + month - 1;
  const oldest = newest - (months - 1);
  const label = (index: number): string =>
    `${monthName(((index % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR)} ${Math.floor(
      index / MONTHS_PER_YEAR,
    )}`;

  return (
    <div className="chart-frame__range">
      <span>{label(oldest)}</span>
      <span>{label(newest)}</span>
    </div>
  );
}

/** Plot width and height of the company-value SVG. [px at scale 1] */
const VALUE_PLOT_W = 240;
const VALUE_PLOT_H = 96;
/** Room for the axis labels left of and under the plot. [px] */
const VALUE_MARGIN_LEFT = 52;
const VALUE_MARGIN_BOTTOM = 14;

/**
 * The company-value graph of section 14.1 - the display M14 closes the debt
 * on. The yearly long series is the simulation's own `valueHistory` archive
 * (kept since M6, one entry per closed game year, saved and hashed); the
 * final point is the value right now, so the line always reaches today. Axes
 * and labels this time: y from the shared `niceScale`, x the covered years.
 * Drawn as inline SVG on the main thread - numbers in, one render path.
 */
function ValueGraph({ report }: { readonly report: FinanceReport }): ReactElement {
  useSimStore((s) => s.locale);
  const year = useSimStore((s) => s.year);

  const values = [...report.valueHistory, report.companyValueCt];
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 4);
  const points = seriesPoints(values, VALUE_PLOT_W, VALUE_PLOT_H, scale);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const firstYear = year - (values.length - 1);
  const now = points[points.length - 1]!;
  const zeroY = valueToY(0, VALUE_PLOT_H, scale);

  return (
    <>
      <Tooltip textKey="ui.tooltip.finance.valueGraph">
        <span tabIndex={0} className="field__label field__label--spaced">
          {t('ui.finance.valueGraph')}
        </span>
      </Tooltip>
      <svg
        className="valuechart"
        viewBox={`0 0 ${VALUE_MARGIN_LEFT + VALUE_PLOT_W} ${VALUE_PLOT_H + VALUE_MARGIN_BOTTOM}`}
        role="img"
        aria-label={t('ui.finance.valueGraph')}
      >
        <g transform={`translate(${VALUE_MARGIN_LEFT}, 0)`}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={0}
                x2={VALUE_PLOT_W}
                y1={valueToY(tick, VALUE_PLOT_H, scale)}
                y2={valueToY(tick, VALUE_PLOT_H, scale)}
                className={tick === 0 ? 'valuechart__zero' : 'valuechart__grid'}
              />
              <text
                x={-4}
                y={valueToY(tick, VALUE_PLOT_H, scale)}
                className="valuechart__label valuechart__label--y"
              >
                {formatMoneyCompact(tick)}
              </text>
            </g>
          ))}
          <path d={path} className="valuechart__line" />
          <circle cx={now.x} cy={now.y} r={2.5} className="valuechart__now" />
          <text x={0} y={VALUE_PLOT_H + 10} className="valuechart__label">
            {firstYear}
          </text>
          <text
            x={VALUE_PLOT_W}
            y={VALUE_PLOT_H + 10}
            className="valuechart__label valuechart__label--end"
          >
            {t('ui.finance.valueNow', { year })}
          </text>
          {/* An axis line only when zero is not already a gridline. */}
          {!scale.ticks.includes(0) && (
            <line x1={0} x2={VALUE_PLOT_W} y1={zeroY} y2={zeroY} className="valuechart__zero" />
          )}
        </g>
      </svg>
    </>
  );
}
