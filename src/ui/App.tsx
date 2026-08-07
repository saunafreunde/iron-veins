import { useEffect, useRef, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { SaveSlotKind } from '../shared/protocol';
import { AUTOSAVE_EVERY_MONTHS } from './saves';
import { MAPGEN_PHASE_COUNT } from '../sim/mapgen';
import { CompanyPanel } from './CompanyPanel';
import { CrashDialog } from './CrashDialog';
import { IndustryList, StationList, TownList, VehicleList } from './EntityLists';
import { FinancePanel } from './FinancePanel';
import { FleetPanel } from './FleetPanel';
import { LinePanel } from './LinePanel';
import { CompanyList } from './CompanyList';
import { ContractPanel } from './ContractPanel';
import { HandbookPanel } from './HandbookPanel';
import { MainMenu } from './MainMenu';
import { Minimap } from './Minimap';
import { NewGameDialog } from './NewGameDialog';
import { OptionsPanel } from './OptionsPanel';
import { SaveLoadPanel } from './SaveLoadPanel';
import { StoredCrashNotice } from './StoredCrashNotice';
import { TutorialPanel } from './TutorialPanel';
import { TOOL_KEYS } from './keymap';
import { quickLoad } from './saves';
import { updateSettings } from './settings';
import { MapCanvas } from './MapCanvas';
import { NewsPanel } from './NewsPanel';
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
  const toggleDebug = useSimStore((s) => s.toggleDebug);
  const toggleFlow = useSimStore((s) => s.toggleFlow);
  const showFlow = useSimStore((s) => s.showFlow);
  const flowStats = useSimStore((s) => s.flowStats);
  const toggleList = useSimStore((s) => s.toggleList);
  const openList = useSimStore((s) => s.openList);
  const ready = useSimStore((s) => s.ready);
  const fatalError = useSimStore((s) => s.fatalError);
  const crashed = useSimStore((s) => s.crash !== null);
  const rejectionKey = useSimStore((s) => s.rejectionKey);
  const rejectionSeq = useSimStore((s) => s.rejectionSeq);
  const setRejection = useSimStore((s) => s.setRejection);
  const speedIndex = useSimStore((s) => s.speedIndex);
  const assistant = useSimStore((s) => s.assistant);
  const setAssistant = useSimStore((s) => s.setAssistant);
  const cycleMinimapMode = useSimStore((s) => s.cycleMinimapMode);
  const overlay = useSimStore((s) => s.overlay);
  const setOverlay = useSimStore((s) => s.setOverlay);
  const setTool = useSimStore((s) => s.setTool);
  const settings = useSimStore((s) => s.settings);
  const year = useSimStore((s) => s.year);
  const month = useSimStore((s) => s.month);

  // Space toggles between pause and the speed that was running before.
  const lastRunningSpeed = useRef(1);
  useEffect(() => {
    if (speedIndex > 0) lastRunningSpeed.current = speedIndex;
  }, [speedIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      // A build tool the scheme assigns a letter to. Checked first so the
      // list keys below cannot shadow one of them.
      const tool = TOOL_KEYS[event.key.toLowerCase()];
      if (tool !== undefined && !event.ctrlKey && !event.altKey) {
        setTool(tool);
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          client.setSpeed(speedIndex === 0 ? lastRunningSpeed.current : 0);
          return;
        case 'Escape': {
          event.preventDefault();
          // An armed tool goes first: Esc means "get me out of this", and it
          // only means the menu once there is nothing left to disarm. setTool
          // also clears the road anchor, the track preview and the connect
          // flow - everything a half-finished build has lying around.
          const armed = useSimStore.getState().tool !== 'none';
          if (overlay === null && armed) {
            setTool('none');
            return;
          }
          setOverlay(overlay === null ? 'menu' : null);
          return;
        }
        case 'F1':
          event.preventDefault();
          setOverlay(overlay === 'handbook' ? null : 'handbook');
          return;
        case 'F5':
          event.preventDefault();
          client.save(SaveSlotKind.Quick, '');
          return;
        case 'F9':
          event.preventDefault();
          void quickLoad(client);
          return;
        // The route assistant toggle of the D-114 table. Auto-signalling has
        // its own checkbox on the track tool; it never had a key of its own.
        case 'm':
        case 'M':
          setAssistant(!assistant);
          return;
        case 'n':
        case 'N':
          cycleMinimapMode();
          return;
        // The flow atlas overlay of SPEC2 M14 (D-114 table entry).
        case 'a':
        case 'A':
          toggleFlow();
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
        // The list keys of section 17.2. Five lists cannot all be on screen at
        // once, so each key toggles its own and closes whatever was open. L is
        // the LINE list, as the section says; the station list sits on H (see
        // keymap.ts).
        case 'v':
        case 'V':
          toggleList('vehicles');
          return;
        case 'l':
        case 'L':
          toggleList('lines');
          return;
        case 'h':
        case 'H':
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
  }, [
    client,
    speedIndex,
    toggleDebug,
    toggleFlow,
    toggleList,
    overlay,
    setOverlay,
    setTool,
    assistant,
    setAssistant,
    cycleMinimapMode,
  ]);

  // ------------------------------------------------------------- autosave
  //
  // Driven from here rather than from the worker because the SETTING lives
  // here: the simulation has no opinion about whether the player wants
  // autosaves, and giving it one would mean a second copy of the preference.
  const lastAutosave = useRef(-1);
  useEffect(() => {
    if (!ready || !settings.autosave) return;
    const months = year * 12 + month;
    if (months % AUTOSAVE_EVERY_MONTHS !== 0 || months === lastAutosave.current) return;
    lastAutosave.current = months;
    client.save(SaveSlotKind.Auto, '');
  }, [client, ready, settings.autosave, year, month]);

  useEffect(() => {
    if (rejectionKey === null) return;
    const timer = window.setTimeout(() => setRejection(null), TOAST_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [rejectionKey, rejectionSeq, setRejection]);

  // A dead worker wins over every other screen: the map behind it would be a
  // still image lying about a running game (SPEC2 M10, D-132).
  if (crashed) {
    return <CrashDialog />;
  }

  if (fatalError !== null) {
    return (
      <main className="fatal">
        <h1>{t('ui.error.title')}</h1>
        <p className="fatal__message">{fatalError}</p>
      </main>
    );
  }

  if (overlay !== null) {
    return (
      <div className="app">
        <StatusBar client={client} />
        <main className="workspace workspace--overlay">
          {overlay === 'menu' && (
            <MainMenu onSelect={(next) => setOverlay(next)} onClose={() => setOverlay(null)} />
          )}
          {overlay === 'newGame' && (
            <NewGameDialog
              onStart={(options) => {
                client.newGame(options);
                setOverlay(null);
              }}
              onCancel={ready ? () => setOverlay('menu') : null}
            />
          )}
          {overlay === 'options' && <OptionsPanel onClose={() => setOverlay('menu')} />}
          {overlay === 'saves' && (
            <SaveLoadPanel client={client} onClose={() => setOverlay('menu')} />
          )}
          {overlay === 'handbook' && <HandbookPanel onClose={() => setOverlay(null)} />}
          {overlay === 'tutorial' && (
            <TutorialPanel client={client} onClose={() => setOverlay(null)} />
          )}
        </main>
        {/* The boot-time crash-bundle offer (D-139) rides along with every
            screen a healthy game shows - the menu included, because the menu
            is where a freshly restarted player is standing. */}
        <StoredCrashNotice />
      </div>
    );
  }

  return (
    <div className="app">
      <StatusBar client={client} />

      {ready ? (
        <main className="workspace workspace--map">
          <MapCanvas client={client} />
          <Minimap />
          <aside className="sidebar">
            {/* One list at a time, opened with V, L, H, T or I (section 17.2).
                Five always-visible lists would not fit beside the map, and the
                spec puts them behind keys for exactly that reason. */}
            {openList === 'vehicles' && <VehicleList />}
            {openList === 'lines' && <LinePanel client={client} />}
            {openList === 'stations' && <StationList />}
            {openList === 'towns' && <TownList />}
            {openList === 'industries' && <IndustryList />}
            <TilePanel client={client} />
            <FleetPanel client={client} />
            <CompanyPanel client={client} />
            <FinancePanel client={client} />
            <CompanyList />
            <ContractPanel client={client} />
            <NewsPanel />
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
        <button type="button" className="chip" onClick={() => setOverlay('menu')}>
          {t('ui.menu.title')}
        </button>
        <button type="button" className="chip" onClick={() => setOverlay('handbook')}>
          {t('ui.menu.handbook')}
        </button>
        <span className="appbar__label">{t('ui.locale.label')}</span>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={code === locale ? 'chip chip--active' : 'chip'}
            onClick={() => updateSettings({ locale: code })}
          >
            {code.toUpperCase()}
          </button>
        ))}
        <button type="button" className="chip" onClick={toggleDebug}>
          {t('ui.debug.toggle')}
        </button>
        <button
          type="button"
          className={showFlow ? 'chip chip--active' : 'chip'}
          onClick={toggleFlow}
        >
          {t('ui.flow.toggle')}
        </button>
        {/* The honest "x weitere" indicator of the M14 order: legs that
            exist but were cut by the top-N cap of the flow atlas. */}
        {showFlow && flowStats.omitted > 0 && (
          <span className="appbar__label">{t('ui.flow.more', { omitted: flowStats.omitted })}</span>
        )}
      </footer>

      {rejectionKey !== null && (
        <div className="toast" role="status">
          {t(rejectionKey)}
        </div>
      )}

      <StoredCrashNotice />
    </div>
  );
}
