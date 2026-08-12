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
import { COMPANY_COLORS } from '../shared/palette';
import { ECONOMY_CURVE_YEARS, ECONOMY_ROW_COUNT } from '../sim/constants';
import { economySeries, economySeriesYear } from '../sim/economy/curve';
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
      <EconomyCentury />
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
        {/* SPEC.md section 1 asks for the reward for good network design to be
            measurable IN THE BOOKS, so this is where the company-wide figure
            of SPEC2 M15 stands. The share is the simulation's own
            (economy/networkValue.ts); the panel formats it. */}
        <div>
          <dt>
            <Tooltip
              textKey="ui.tooltip.finance.networkValue"
              params={{
                earned: formatMoney(Math.round(report.networkValue.earnedCt)),
                ceiling: formatMoney(Math.round(report.networkValue.ceilingCt)),
              }}
            >
              <span tabIndex={0}>{t('ui.finance.networkValue')}</span>
            </Tooltip>
          </dt>
          <dd className="value value--mono">
            {report.networkValue.ceilingCt > 0
              ? `${Math.round(report.networkValue.share * 100)} %`
              : '—'}
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

/** Plot of the century chart. [px in the SVG's own space] */
const CENTURY_PLOT_W = 240;
const CENTURY_PLOT_H = 84;
const CENTURY_MARGIN_LEFT = 26;
const CENTURY_MARGIN_BOTTOM = 14;

/**
 * The name of each row of the curve, in row order.
 *
 * Row order is the constants' own (`ECONOMY_ROW_CYCLE`, `ECONOMY_ROW_ENERGY`
 * are defined as offsets past the groups), so this list cannot drift out of
 * step with the table it labels without the length assertion below firing.
 */
const CENTURY_ROW_KEYS: readonly string[] = [
  'ui.finance.economyGroup.town',
  'ui.finance.economyGroup.coal',
  'ui.finance.economyGroup.raw',
  'ui.finance.economyGroup.manufactured',
  'ui.finance.economyGroup.containers',
  'ui.finance.economyRow.cycle',
  'ui.finance.economyRow.energy',
];

/** One hue per row, from the deficiency-safe company palette (16.3). */
function centuryColor(row: number): string {
  return COMPANY_COLORS[(row % (COMPANY_COLORS.length - 1)) + 1]!;
}

/**
 * The century of SPEC2 M21, drawn (E-09: "UI kann die Kurve zeigen").
 *
 * Seven polylines over the whole playable span with a marker on the year being
 * played, and the current value of every row printed beside it - because a
 * chart says what the shape is and a number says what is being charged. The
 * series come from `sim/economy/curve.ts`, which is the same module the tariff,
 * the build bill, the industry swing and the energy meter read: a panel that
 * did its own arithmetic over the raw table would be a second opinion about
 * what 1997 was worth.
 *
 * A world whose economy rule is off has an EMPTY curve and this renders
 * nothing at all - not an empty frame, not a flat line at 1.00, because a world
 * without a century has no century to show.
 */
function EconomyCentury(): ReactElement | null {
  useSimStore((s) => s.locale);
  const curve = useSimStore((s) => s.economyCurve);
  const year = useSimStore((s) => s.year);
  if (!curve.active) return null;

  const rows: number[][] = [];
  for (let row = 0; row < ECONOMY_ROW_COUNT; row++) rows.push(economySeries(curve, row));

  let lowest = 1;
  let highest = 1;
  for (const series of rows) {
    for (const value of series) {
      if (value < lowest) lowest = value;
      if (value > highest) highest = value;
    }
  }
  const scale = niceScale(lowest, highest, 4);

  // Where "now" sits along the x axis, clamped into the span the table covers -
  // the same clamp `economyRowFactor` applies, so the marker stands on the
  // value that is actually being charged (E-15's endless years included).
  let nowIndex = year - economySeriesYear(curve, 0);
  if (nowIndex < 0) nowIndex = 0;
  else if (nowIndex >= ECONOMY_CURVE_YEARS) nowIndex = ECONOMY_CURVE_YEARS - 1;
  const nowX = (nowIndex / (ECONOMY_CURVE_YEARS - 1)) * CENTURY_PLOT_W;

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.finance.economy')}</span>
      <svg
        className="valuechart"
        viewBox={`0 0 ${CENTURY_MARGIN_LEFT + CENTURY_PLOT_W} ${
          CENTURY_PLOT_H + CENTURY_MARGIN_BOTTOM
        }`}
        role="img"
        aria-label={t('ui.finance.economy')}
      >
        <g transform={`translate(${CENTURY_MARGIN_LEFT}, 0)`}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={0}
                x2={CENTURY_PLOT_W}
                y1={valueToY(tick, CENTURY_PLOT_H, scale)}
                y2={valueToY(tick, CENTURY_PLOT_H, scale)}
                className="valuechart__grid"
              />
              <text
                x={-4}
                y={valueToY(tick, CENTURY_PLOT_H, scale)}
                className="valuechart__label valuechart__label--y"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          ))}
          {rows.map((series, row) => (
            <path
              key={row}
              d={seriesPoints(series, CENTURY_PLOT_W, CENTURY_PLOT_H, scale)
                .map(
                  (point, index) =>
                    `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
                )
                .join(' ')}
              className="valuechart__line"
              style={{ stroke: centuryColor(row) }}
            />
          ))}
          <line x1={nowX} x2={nowX} y1={0} y2={CENTURY_PLOT_H} className="valuechart__zero" />
          <text x={0} y={CENTURY_PLOT_H + 10} className="valuechart__label">
            {economySeriesYear(curve, 0)}
          </text>
          <text
            x={CENTURY_PLOT_W}
            y={CENTURY_PLOT_H + 10}
            className="valuechart__label valuechart__label--end"
          >
            {economySeriesYear(curve, ECONOMY_CURVE_YEARS - 1)}
          </text>
        </g>
      </svg>
      <dl className="readout">
        {rows.map((series, row) => (
          <div key={row}>
            <dt style={{ color: centuryColor(row) }}>{t(CENTURY_ROW_KEYS[row] ?? '')}</dt>
            <dd className="value value--mono">
              {t('ui.finance.economyNow', {
                year,
                value: (series[nowIndex] ?? 1).toFixed(2),
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="panel__hint">{t('ui.finance.economyHint')}</p>
    </>
  );
}

/** The labels and the table cannot disagree about how many rows there are. */
if (CENTURY_ROW_KEYS.length !== ECONOMY_ROW_COUNT) {
  throw new Error('FinancePanel: the century row labels do not match ECONOMY_ROW_COUNT');
}
