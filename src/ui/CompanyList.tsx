import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import { useSimStore } from './store';

/**
 * Who else is on the map (section 15).
 *
 * Ranked by company value, which is the one number that says who is winning.
 * The player's own row is marked rather than pulled to the top: a league table
 * that always shows you first is not a league table.
 */
export function CompanyList(): ReactElement | null {
  useSimStore((s) => s.locale);
  const companies = useSimStore((s) => s.companies);

  // Nothing to compare in a game with no competitors, and a list of one is
  // just the company panel again.
  if (companies.length < 2) return null;

  const ranked = [...companies].sort((a, b) => {
    if (a.valueCt !== b.valueCt) return b.valueCt - a.valueCt;
    return a.id - b.id;
  });

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.companies.title')}</h2>
      <ul className="news">
        {ranked.map((company) => (
          <li key={company.id}>
            <div className="row">
              <span>
                <span
                  className="company__swatch"
                  style={{ background: COMPANY_COLORS[company.colorIndex] ?? '#888' }}
                />
                {company.name}
                {company.id === 0 && ` ${t('ui.companies.you')}`}
              </span>
              <span className={company.bankrupt ? 'row__meta value--danger' : 'row__meta'}>
                {company.bankrupt
                  ? t('ui.companies.bankrupt')
                  : `${t('ui.companies.value')}: ${formatMoney(company.valueCt)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
