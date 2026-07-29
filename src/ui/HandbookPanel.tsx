import { useMemo, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import { HANDBOOK, HANDBOOK_CHAPTER_OF, HANDBOOK_CHAPTERS } from './handbook';
import { useSimStore } from './store';

/**
 * The searchable handbook of section 17.5, opened with F1.
 *
 * Search runs over the TRANSLATED title and body, not over the keys: a German
 * player typing "Signal" has to find the signal chapter, and the key for it is
 * `ui.handbook.blockSignal.title`, which contains the English word by accident
 * of how the project is written.
 */
export function HandbookPanel({ onClose }: { readonly onClose: () => void }): ReactElement {
  useSimStore((s) => s.locale);
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState<number | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return HANDBOOK.map((entry, index) => ({ entry, index })).filter(({ entry, index }) => {
      if (chapter !== null && HANDBOOK_CHAPTER_OF[index] !== chapter) return false;
      if (needle === '') return true;
      const haystack = `${t(entry.titleKey)} ${t(entry.bodyKey)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, chapter]);

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.handbook.title')}</h2>

      <input
        className="list__search"
        placeholder={t('ui.handbook.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="button-row">
        <button
          type="button"
          className={chapter === null ? 'button button--active' : 'button'}
          onClick={() => setChapter(null)}
        >
          {t('ui.list.all')}
        </button>
        {HANDBOOK_CHAPTERS.map((key, index) => (
          <button
            key={key}
            type="button"
            className={chapter === index ? 'button button--active' : 'button'}
            onClick={() => setChapter(chapter === index ? null : index)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <p className="panel__hint">{t('ui.handbook.noMatch')}</p>
      ) : (
        <div className="handbook">
          {matches.map(({ entry }) => (
            <article key={entry.id} className="handbook__entry">
              <h3 className="handbook__heading">{t(entry.titleKey)}</h3>
              <p>{t(entry.bodyKey)}</p>
              {entry.diagram !== '' && <pre className="handbook__diagram">{entry.diagram}</pre>}
            </article>
          ))}
        </div>
      )}

      <div className="button-row">
        <button type="button" className="button button--active" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>
    </section>
  );
}
