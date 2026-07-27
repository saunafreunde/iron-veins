import { useEffect, useRef, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { CompanyPanel } from './CompanyPanel';
import { FinancePanel } from './FinancePanel';
import type { SimClient } from './SimClient';
import { StatusBar } from './StatusBar';
import { SystemPanel } from './SystemPanel';
import { useSimStore } from './store';

/** How long a rejection toast stays on screen. [ms] */
const TOAST_LIFETIME_MS = 4000;

export function App({ client }: { readonly client: SimClient }): ReactElement {
  const locale = useSimStore((s) => s.locale);
  const setLocale = useSimStore((s) => s.setLocale);
  const toggleDebug = useSimStore((s) => s.toggleDebug);
  const ready = useSimStore((s) => s.ready);
  const fatalError = useSimStore((s) => s.fatalError);
  const rejectionKey = useSimStore((s) => s.rejectionKey);
  const rejectionSeq = useSimStore((s) => s.rejectionSeq);
  const setRejection = useSimStore((s) => s.setRejection);
  const speedIndex = useSimStore((s) => s.speedIndex);

  // Space toggles between pause and the speed that was running before.
  const lastRunningSpeed = useRef(1);
  useEffect(() => {
    if (speedIndex > 0) lastRunningSpeed.current = speedIndex;
  }, [speedIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          client.setSpeed(speedIndex === 0 ? lastRunningSpeed.current : 0);
          return;
        case '1':
        case '2':
        case '3':
        case '4':
          client.setSpeed(Number(event.key));
          return;
        case 'F3':
          event.preventDefault();
          toggleDebug();
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [client, speedIndex, toggleDebug]);

  useEffect(() => {
    if (rejectionKey === null) return;
    const timer = window.setTimeout(() => setRejection(null), TOAST_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [rejectionKey, rejectionSeq, setRejection]);

  if (fatalError !== null) {
    return (
      <main className="fatal">
        <h1>{t('ui.error.title')}</h1>
        <p className="fatal__message">{fatalError}</p>
      </main>
    );
  }

  return (
    <div className="app">
      <StatusBar client={client} />

      <main className="workspace">
        <div className="workspace__intro">
          <h1>{t('app.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>

        {ready && (
          <div className="workspace__panels">
            <CompanyPanel client={client} />
            <FinancePanel client={client} />
            <SystemPanel />
          </div>
        )}
      </main>

      <footer className="appbar">
        <span className="appbar__label">{t('ui.locale.label')}</span>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={code === locale ? 'chip chip--active' : 'chip'}
            onClick={() => setLocale(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
        <button type="button" className="chip" onClick={toggleDebug}>
          {t('ui.debug.toggle')}
        </button>
      </footer>

      {rejectionKey !== null && (
        <div className="toast" role="status">
          {t(rejectionKey)}
        </div>
      )}
    </div>
  );
}
