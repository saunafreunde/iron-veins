import type { ReactElement } from 'react';
import { t } from '../i18n';
import type { StationHistoryMarker, StationMarker } from '../shared/protocol';
import { CARGO_SPECS } from '../sim/cargo/types';
import { RATING_XRAY_WARN_LOSS, STATION_RATING_BASE } from '../sim/constants';
import {
  dominantLossTerm,
  RATING_TERM_MAX,
  ratingLossOf,
  RatingTermIndex,
  type RatingTerms,
} from '../sim/station/types';

/**
 * The station x-ray of SPEC2 M14.
 *
 * Everything here DISPLAYS what the simulation computed: the five 10.1
 * terms arrive on the marker exactly as `ratingTerms` produced them, the
 * dominant loss term is picked by the same `dominantLossTerm` a sim test
 * holds, and the twelve-month bars are the station's own history ring.
 * The panel owns no formula - one source of truth (M14's order).
 */

/** Term labels, indexed by RatingTermIndex. */
const TERM_LABEL_KEYS: readonly string[] = [
  'ui.station.term.wait',
  'ui.station.term.frequency',
  'ui.station.term.equipment',
  'ui.station.term.reliability',
  'ui.station.term.overflow',
];

/** One warning sentence per term - "Rating sinkt, weil ..." (i18n de+en). */
const TERM_WHY_KEYS: readonly string[] = [
  'ui.station.why.wait',
  'ui.station.why.frequency',
  'ui.station.why.equipment',
  'ui.station.why.reliability',
  'ui.station.why.overflow',
];

/** The five term values in RatingTermIndex order, overflow as the malus. */
function termValues(terms: RatingTerms): readonly number[] {
  return [terms.wait, terms.frequency, terms.equipment, terms.reliability, terms.overflow];
}

/** A term row: label, meter, value against its maximum. */
function TermRow({
  index,
  value,
  malus,
}: {
  readonly index: number;
  readonly value: number;
  readonly malus: boolean;
}): ReactElement {
  const max = RATING_TERM_MAX[index]!;
  const share = max <= 0 ? 0 : (value / max) * 100;
  return (
    <div className="xray-term">
      <span className="xray-term__label">{t(TERM_LABEL_KEYS[index]!)}</span>
      <span className="xray-term__meter">
        <span
          className={malus ? 'xray-term__fill xray-term__fill--malus' : 'xray-term__fill'}
          style={{ width: `${share}%` }}
        />
      </span>
      <span className="value value--mono xray-term__value">
        {malus ? '−' : ''}
        {value.toFixed(1)}/{max}
      </span>
    </div>
  );
}

/** Twelve stacked mini-bars, oldest month left, for one cargo's history. */
function HistoryBars({ row }: { readonly row: StationHistoryMarker }): ReactElement {
  let max = 1;
  for (let month = 0; month < row.collected.length; month++) {
    const total = row.collected[month]! + row.delivered[month]! + row.expired[month]!;
    if (total > max) max = total;
  }
  return (
    <div className="xray-bars">
      {row.collected.map((collected, month) => {
        const delivered = row.delivered[month]!;
        const expired = row.expired[month]!;
        const title =
          `${t('ui.station.history.collected')} ${collected} · ` +
          `${t('ui.station.history.delivered')} ${delivered} · ` +
          `${t('ui.station.history.expired')} ${expired}`;
        return (
          // Months have no identity beyond their ring position, so the
          // position is the key.
          <span key={month} className="xray-bars__month" title={title}>
            <span
              className="xray-bars__seg xray-bars__seg--expired"
              style={{ height: `${(expired / max) * 100}%` }}
            />
            <span
              className="xray-bars__seg xray-bars__seg--delivered"
              style={{ height: `${(delivered / max) * 100}%` }}
            />
            <span
              className="xray-bars__seg xray-bars__seg--collected"
              style={{ height: `${(collected / max) * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

export function StationXray({ station }: { readonly station: StationMarker }): ReactElement {
  const terms = station.terms;
  const values = termValues(terms);
  const dominant = dominantLossTerm(terms);
  const dominantLoss = ratingLossOf(terms, dominant);

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.station.xray')}</span>
      <div className="xray-term">
        <span className="xray-term__label">{t('ui.station.term.base')}</span>
        <span className="xray-term__meter" />
        <span className="value value--mono xray-term__value">
          {STATION_RATING_BASE.toFixed(1)}/{STATION_RATING_BASE}
        </span>
      </div>
      {values.map((value, index) => (
        // The five terms of 10.1 are a fixed list; the index IS the term.
        <TermRow
          key={index}
          index={index}
          value={value}
          malus={index === RatingTermIndex.Overflow}
        />
      ))}
      {dominantLoss >= RATING_XRAY_WARN_LOSS && (
        <p className="panel__hint value--warning">
          {t(TERM_WHY_KEYS[dominant]!, { loss: dominantLoss.toFixed(1) })}
        </p>
      )}

      <span className="field__label field__label--spaced">{t('ui.station.waiting')}</span>
      {station.waitingByCargo.length === 0 ? (
        <p className="panel__hint">{t('ui.station.waitingNone')}</p>
      ) : (
        <table className="xray-table">
          <thead>
            <tr>
              <th>{t('ui.station.cargo')}</th>
              <th>{t('ui.station.units')}</th>
              <th>{t('ui.station.oldest')}</th>
            </tr>
          </thead>
          <tbody>
            {station.waitingByCargo.map((row) => (
              <tr key={row.cargo}>
                <td>{t(CARGO_SPECS[row.cargo]?.nameKey ?? '')}</td>
                <td className="value value--mono">{row.units}</td>
                <td className="value value--mono">
                  {t('ui.station.days', { days: row.oldestDays.toFixed(1) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <span className="field__label field__label--spaced">{t('ui.station.history')}</span>
      {station.history.length === 0 ? (
        <p className="panel__hint">{t('ui.station.historyNone')}</p>
      ) : (
        <>
          {station.history.map((row) => (
            <div key={row.cargo} className="xray-history">
              <span className="xray-history__cargo">
                {t(CARGO_SPECS[row.cargo]?.nameKey ?? '')}
              </span>
              <HistoryBars row={row} />
            </div>
          ))}
          <p className="panel__hint">
            <span className="xray-legend xray-legend--collected" />{' '}
            {t('ui.station.history.collected')}{' '}
            <span className="xray-legend xray-legend--delivered" />{' '}
            {t('ui.station.history.delivered')}{' '}
            <span className="xray-legend xray-legend--expired" /> {t('ui.station.history.expired')}
          </p>
        </>
      )}
    </>
  );
}
