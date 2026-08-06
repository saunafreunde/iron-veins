import type { ReactElement } from 'react';
import { formatInteger, t } from '../i18n';
import { exportBugReport } from './crashReporter';
import { useSimStore } from './store';

/**
 * The screen behind a dead simulation worker (SPEC2 M10, D-132).
 *
 * By the time this renders, the crash reporter has already put a bundle away;
 * the dialog's job is to say so honestly, offer the same bundle as an export
 * the player can attach to a message, and get them back into the game. The
 * technical error text stays untranslated on purpose - it is for whoever
 * reads the bug report, not for the player (the M0 precedent in SimClient).
 */
export function CrashDialog(): ReactElement {
  useSimStore((s) => s.locale);
  const crash = useSimStore((s) => s.crash);
  const stored = useSimStore((s) => s.crashBundleStored);
  const isDesktop = useSimStore((s) => s.isDesktop);

  return (
    <main className="fatal">
      <h1>{t('ui.crash.title')}</h1>
      <p>{t('ui.crash.body')}</p>
      {crash !== null && (
        <p className="fatal__message">
          {crash.tick >= 0
            ? `${t('ui.crash.atTick', { tick: formatInteger(crash.tick) })} ${crash.message}`
            : crash.message}
        </p>
      )}
      {stored === true && (
        <p className="panel__hint">
          {isDesktop ? t('ui.crash.storedDesktop') : t('ui.crash.storedBrowser')}
        </p>
      )}
      {stored === false && <p className="panel__hint">{t('ui.crash.storeFailed')}</p>}
      <div className="button-row">
        <button type="button" className="button" onClick={() => void exportBugReport()}>
          {t('ui.crash.export')}
        </button>
        <button
          type="button"
          className="button button--active"
          onClick={() => window.location.reload()}
        >
          {t('ui.crash.restart')}
        </button>
      </div>
    </main>
  );
}
