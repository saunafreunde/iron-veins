import type { ReactElement } from 'react';
import { formatWallClock, t } from '../i18n';
import { dismissStoredCrashBundle, exportStoredCrashBundle } from './crashReporter';
import { useSimStore } from './store';

/**
 * The offer behind the M10 clause "a hard-terminated worker offers a loadable
 * crash bundle on the NEXT start" (SPEC2 M10, D-139).
 *
 * A corner card, never a blocker: the crash already had its full-screen
 * moment, and a player who just restarted wants their game back, not a second
 * interrogation. The card names when the crash happened and the version
 * triple of the bundle, and both of its actions retire the stored file - so
 * the same crash is never offered twice.
 */
export function StoredCrashNotice(): ReactElement | null {
  useSimStore((s) => s.locale);
  const offer = useSimStore((s) => s.storedCrashOffer);
  if (offer === null) return null;

  const { summary } = offer;
  return (
    <aside className="notice" role="status">
      <h2 className="notice__title">{t('ui.crashOffer.title')}</h2>
      <p className="notice__body">
        {t('ui.crashOffer.body', {
          date: formatWallClock(summary.writtenAt),
          appVersion: summary.appVersion,
          saveVersion: summary.saveVersion,
          bundleVersion: summary.schemaVersion,
        })}
      </p>
      <div className="button-row">
        <button
          type="button"
          className="button button--active"
          onClick={() => void exportStoredCrashBundle()}
        >
          {t('ui.crash.export')}
        </button>
        <button type="button" className="button" onClick={() => void dismissStoredCrashBundle()}>
          {t('ui.crashOffer.dismiss')}
        </button>
      </div>
    </aside>
  );
}
