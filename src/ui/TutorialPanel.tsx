import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import { LESSONS, type CommandCounts } from './tutorial';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The tutorial of section 17.5: five lessons, each a checklist that ticks
 * itself off as the player does the thing.
 *
 * It sits beside the game rather than in front of it. Every lesson is played
 * in the ordinary world with the ordinary tools, so nothing learned here has
 * to be unlearned - and the panel can be closed at any point without leaving
 * the player somewhere they cannot get out of.
 */
export function TutorialPanel({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const state = useSimStore((s) => s);
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);
  const [counts, setCounts] = useState<CommandCounts>({});

  // Commands are counted here rather than in the store: nothing else wants
  // them, and a store field would re-render every panel on every build.
  useEffect(() => {
    const previous = client.onCommandExecuted;
    client.onCommandExecuted = (kind, accepted) => {
      previous?.(kind, accepted);
      if (!accepted) return;
      setCounts((current) => ({ ...current, [kind]: (current[kind] ?? 0) + 1 }));
    };
    return () => {
      client.onCommandExecuted = previous;
    };
  }, [client]);

  if (lessonIndex === null) {
    return (
      <section className="panel panel--wide">
        <h2 className="panel__title">{t('ui.tutorial.title')}</h2>
        <p className="panel__hint">{t('ui.tutorial.intro')}</p>

        <ul className="list">
          {LESSONS.map((lesson, index) => (
            <li key={lesson.id}>
              <button type="button" className="row" onClick={() => setLessonIndex(index)}>
                <span className="handbook__heading">
                  {index + 1}. {t(lesson.titleKey)}
                </span>
                <span className="row__meta">{t(lesson.introKey)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="button-row">
          <button type="button" className="button button--active" onClick={onClose}>
            {t('ui.close')}
          </button>
        </div>
      </section>
    );
  }

  const lesson = LESSONS[lessonIndex]!;
  const done = lesson.steps.map((step) => step.done(state, counts));
  const complete = done.every(Boolean);

  return (
    <section className="panel">
      <h2 className="panel__title">{t(lesson.titleKey)}</h2>
      <p className="panel__hint">{t(lesson.introKey)}</p>

      <ol className="checklist">
        {lesson.steps.map((step, index) => (
          <li key={step.textKey} className={done[index] === true ? 'checklist__done' : undefined}>
            <span aria-hidden="true">{done[index] === true ? '✓' : '○'}</span>{' '}
            {t(step.textKey)}
          </li>
        ))}
      </ol>

      {complete && <p className="panel__hint value--success">{t('ui.tutorial.complete')}</p>}

      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            setLessonIndex(null);
            setCounts({});
          }}
        >
          {t('ui.tutorial.back')}
        </button>
        {lessonIndex + 1 < LESSONS.length && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setLessonIndex(lessonIndex + 1);
              setCounts({});
            }}
          >
            {t('ui.tutorial.next')}
          </button>
        )}
        <button type="button" className="button button--active" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>
    </section>
  );
}
