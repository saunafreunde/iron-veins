import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import { PERSONALITY_KEYS } from '../sim/ai/types';
import { useSimStore } from './store';

/**
 * Who else is on the map (section 15).
 *
 * Ranked by company value, which is the one number that says who is winning.
 * The player's own row is marked rather than pulled to the top: a league table
 * that always shows you first is not a league table.
 *
 * Since SPEC2 M24 every competitor's row also names its PERSONALITY. The five
 * of section 15 have existed since M8 and `PERSONALITY_KEYS` has been exported
 * and translated for just as long with nothing referring to it - so a player
 * could watch three companies behave differently for a quarter century and
 * never learn that the difference was a stated one. It comes off the company
 * marker (`CompanyMarker.personality`, -1 for the player), which is where the
 * worker looks it up out of `AiState`: there is one copy of that fact and the
 * evaluator owns it.
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
                {/* The competitor's own trade profile. Nothing is shown for the
                    player's company, which has no personality to show. */}
                {company.personality >= 0 && (
                  <span className="row__meta">
                    {' '}
                    ·{' '}
                    {t(PERSONALITY_KEYS[company.personality] ?? PERSONALITY_KEYS[0] ?? '')}
                  </span>
                )}
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
