import { useMemo, useState, type ReactElement } from 'react';
import { formatGameDate, formatMoney, t } from '../i18n';
import type { NewsMarker } from '../shared/protocol';
import { NEWS_CATEGORY_COUNT, NEWS_CATEGORY_KEYS, NewsSeverity } from '../sim/news/log';
import { useSimStore } from './store';

/**
 * The news log of section 17.1: filterable by category, and a click on an entry
 * jumps to where it happened.
 *
 * Newest first, which is the reverse of how the simulation stores it. A log the
 * player has to scroll to the bottom of to see what just happened is a log
 * nobody opens twice.
 */
export function NewsPanel(): ReactElement {
  useSimStore((s) => s.locale);
  const news = useSimStore((s) => s.news);
  const mapSize = useSimStore((s) => s.mapSize);
  const centre = useSimStore((s) => s.centreOnTile);
  const [category, setCategory] = useState<number | null>(null);

  const shown = useMemo(() => {
    const kept = category === null ? news : news.filter((entry) => entry.category === category);
    return [...kept].reverse();
  }, [news, category]);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.news.title')}</h2>

      <div className="button-row">
        <button
          type="button"
          className={category === null ? 'button button--active' : 'button'}
          onClick={() => setCategory(null)}
        >
          {t('ui.list.all')}
        </button>
        {NEWS_CATEGORY_KEYS.slice(0, NEWS_CATEGORY_COUNT).map((key, index) => (
          <button
            key={key}
            type="button"
            className={category === index ? 'button button--active' : 'button'}
            onClick={() => setCategory(category === index ? null : index)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="panel__hint">{t('ui.news.empty')}</p>
      ) : (
        <ul className="news">
          {shown.map((entry, index) => (
            <li key={`${entry.tick}-${entry.messageKey}-${index}`}>
              <button
                type="button"
                className="row news__entry"
                disabled={entry.tileIndex < 0 || mapSize === 0}
                onClick={() => {
                  if (entry.tileIndex < 0 || mapSize === 0) return;
                  centre(entry.tileIndex % mapSize, Math.floor(entry.tileIndex / mapSize));
                }}
              >
                <span className="row__meta">
                  {formatGameDate(entry.year, entry.month, entry.day)}
                </span>
                <span className={severityClass(entry.severity)}>{message(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function severityClass(severity: number): string {
  if (severity === NewsSeverity.Alarm) return 'value--danger';
  if (severity === NewsSeverity.Warning) return 'value--warning';
  return '';
}

/**
 * Render one entry.
 *
 * Two conventions the simulation side keeps to, because it holds no prose and
 * no formatting: a STRING parameter is another translation key - an industry's
 * name, say - and a parameter named `...Ct` is money in cents. Everything else
 * is a plain number.
 */
function message(entry: NewsMarker): string {
  const resolved: Record<string, string | number> = {};
  for (const key of Object.keys(entry.params).sort(byName)) {
    const value = entry.params[key]!;
    if (typeof value === 'string') resolved[key] = t(value);
    else resolved[key] = key.endsWith('Ct') ? formatMoney(value) : value;
  }
  return t(entry.messageKey, resolved);
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
