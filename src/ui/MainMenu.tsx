import type { ReactElement } from 'react';
import { t } from '../i18n';
import { exportBugReport } from './crashReporter';
import { useSimStore, type OverlayKind } from './store';

/**
 * The menu behind Escape.
 *
 * It is a menu rather than a title screen: the game generates a world at boot
 * and keeps running behind it, so "continue" is free and nobody has to sit
 * through a map generation to look at the options. A title screen that
 * generates nothing is a title screen the player waits at twice.
 */
export function MainMenu({
  onSelect,
  onClose,
}: {
  readonly onSelect: (overlay: OverlayKind) => void;
  readonly onClose: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const ready = useSimStore((s) => s.ready);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('app.title')}</h2>

      <div className="menu">
        {ready && (
          <button type="button" className="button button--active" onClick={onClose}>
            {t('ui.menu.continue')}
          </button>
        )}
        <button type="button" className="button" onClick={() => onSelect('newGame')}>
          {t('ui.menu.newGame')}
        </button>
        <button type="button" className="button" onClick={() => onSelect('saves')}>
          {t('ui.menu.saveLoad')}
        </button>
        <button type="button" className="button" onClick={() => onSelect('options')}>
          {t('ui.menu.options')}
        </button>
        <button type="button" className="button" onClick={() => onSelect('tutorial')}>
          {t('ui.menu.tutorial')}
        </button>
        <button type="button" className="button" onClick={() => onSelect('handbook')}>
          {t('ui.menu.handbook')}
        </button>
        {/* The same bundle the crash dialog writes, from a HEALTHY game -
            for "something is wrong but nothing crashed" reports (D-132). */}
        <button type="button" className="button" onClick={() => void exportBugReport()}>
          {t('ui.menu.bugReport')}
        </button>
      </div>

      <p className="panel__hint">{t('ui.menu.hint')}</p>
    </section>
  );
}
