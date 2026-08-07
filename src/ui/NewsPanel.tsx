import { useMemo, useState, type ReactElement } from 'react';
import { formatGameDate, t } from '../i18n';
import { NEWS_CATEGORY_COUNT, NEWS_CATEGORY_KEYS } from '../sim/news/log';
import { formatNewsMessage, severityClass } from './notifications';
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
                <span className={severityClass(entry.severity)}>{formatNewsMessage(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Rendering one entry - message resolution and severity colour - moved to
// notifications.ts with M14, where the ticker and the toast cards read the
// SAME functions: one sentence per entry, wherever it appears.
