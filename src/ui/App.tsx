import { useEffect, useRef, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { MAPGEN_PHASE_COUNT } from '../sim/mapgen';
import { CompanyPanel } from './CompanyPanel';
import { IndustryList, StationList, TownList, VehicleList } from './EntityLists';
import { FinancePanel } from './FinancePanel';
import { FleetPanel } from './FleetPanel';
import { MapCanvas } from './MapCanvas';
import { TilePanel } from './TilePanel';
import type { SimClient } from './SimClient';
import { StatusBar } from './StatusBar';
import { SystemPanel } from './SystemPanel';
import { useSimStore } from './store';

/** How long a rejection toast stays on screen. [ms] */
const TOAST_LIFETIME_MS = 4000;

/**
 * Map generation takes seconds on a large map, and it runs inside the worker,
 * so the phases arrive as messages rather than as a progress bar the UI drives.
 */
function MapGenProgress(): ReactElement {
  useSimStore((s) => s.locale);
  const phase = useSimStore((s) => s.generatingPhase);
  const attempt = useSimStore((s) => s.generatingAttempt);

  const done = phase === null ? 0 : phase + 1;
  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.mapgen.title')}</h2>
      <p>{phase === null ? t('ui.mapgen.starting') : t(`ui.mapgen.phase.${phase}`)}</p>
      <progress className="progress" value={done} max={MAPGEN_PHASE_COUNT} />
      {attempt > 0 && <p className="panel__hint">{t('ui.mapgen.retry', { attempt })}</p>}
    </section>
  );
}

export function App({ client }: { readonly client: SimClient }): ReactElement {
  const locale = useSimStore((s) => s.locale);
  const setLocale = useSimStore((s) => s.setLocale);
  const toggleDebug = useSimStore((s) => s.toggleDebug);
  const toggleList = useSimStore((s) => s.toggleList);
  const openList = useSimStore((s) => s.openList);
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
        // The list keys of section 17.2. Four lists cannot all be on screen at
        // once, so each key toggles its own and closes whatever was open.
        case 'v':
        case 'V':
          toggleList('vehicles');
          return;
        case 'b':
        case 'B':
          toggleList('stations');
          return;
        case 't':
        case 'T':
          toggleList('towns');
          return;
        case 'i':
        case 'I':
          toggleList('industries');
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [client, speedIndex, toggleDebug, toggleList]);

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

      {ready ? (
        <main className="workspace workspace--map">
          <MapCanvas client={client} />
          <aside className="sidebar">
            {/* One list at a time, opened with V, B, T or I (section 17.2).
                Four always-visible lists would not fit beside the map, and the
                spec puts them behind keys for exactly that reason. */}
            {openList === 'vehicles' && <VehicleList />}
            {openList === 'stations' && <StationList />}
            {openList === 'towns' && <TownList />}
            {openList === 'industries' && <IndustryList />}
            <TilePanel />
            <FleetPanel client={client} />
            <CompanyPanel client={client} />
            <FinancePanel client={client} />
            <SystemPanel />
          </aside>
        </main>
      ) : (
        <main className="workspace">
          <div className="workspace__intro">
            <h1>{t('app.title')}</h1>
            <p>{t('app.tagline')}</p>
          </div>
          <MapGenProgress />
        </main>
      )}

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
