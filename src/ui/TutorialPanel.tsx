import type { ReactElement } from 'react';
import { t } from '../i18n';
import { LESSONS } from './tutorial';
import { useSimStore } from './store';

/**
 * The tutorial of section 17.5: five lessons, each a checklist that ticks
 * itself off as the player does the thing.
 *
 * Every lesson is played in the ordinary world with the ordinary tools, so
 * nothing learned here has to be unlearned.
 *
 * **The panel covers the map, so a lesson is done by CLOSING it and building.**
 * Ten of the twenty-two steps count commands, and while this panel is up the
 * scrim underneath it swallows every click (D-265) - so the intended way
 * through a lesson is: read it, close it, build, open it again. That only
 * works because neither the counts nor the chosen lesson live here any more
 * (M26): they are in the store, and the counting is installed once at
 * application level. They used to be `useState` in this component, which
 * meant closing the panel threw both away and the ten steps could never be
 * ticked by any route at all.
 */
export function TutorialPanel({ onClose }: { readonly onClose: () => void }): ReactElement {
  useSimStore((s) => s.locale);
  const state = useSimStore((s) => s);
  const lessonIndex = useSimStore((s) => s.tutorialLesson);
  const counts = useSimStore((s) => s.tutorialCounts);
  const setLessonIndex = useSimStore((s) => s.setTutorialLesson);

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
          onClick={() => setLessonIndex(null)}
        >
          {t('ui.tutorial.back')}
        </button>
        {lessonIndex + 1 < LESSONS.length && (
          <button
            type="button"
            className="button"
            onClick={() => setLessonIndex(lessonIndex + 1)}
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
