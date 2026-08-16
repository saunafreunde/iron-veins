import { lazy, Suspense, useEffect, useRef, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { SaveSlotKind } from '../shared/protocol';
import { AUTOSAVE_EVERY_MONTHS } from './saves';
import { MAPGEN_PHASE_COUNT } from '../sim/mapgen';
import { CompanyPanel } from './CompanyPanel';
import { CrashDialog } from './CrashDialog';
import { IndustryList, StationList, TownList, VehicleList } from './EntityLists';
import { FinancePanel } from './FinancePanel';
import { FleetPanel } from './FleetPanel';
import { GoalPanel } from './GoalPanel';
import { showsEndScreen } from './goalText';
import { LinePanel } from './LinePanel';
import { CompanyList } from './CompanyList';
import { ContractPanel } from './ContractPanel';
import { HandbookPanel } from './HandbookPanel';
import { MainMenu } from './MainMenu';
import { Minimap } from './Minimap';
import { NewGameDialog } from './NewGameDialog';
import { OptionsPanel } from './OptionsPanel';
import { ReplayBar, ReplayBrowser } from './ReplayPanel';
import { SaveLoadPanel } from './SaveLoadPanel';
import { AchievementHost } from './AchievementHost';
import { AchievementPanel } from './AchievementPanel';
import { CampaignScreen } from './CampaignScreen';
import { ScenarioBrowser } from './ScenarioBrowser';
import { StoredCrashNotice } from './StoredCrashNotice';
import { TutorialPanel } from './TutorialPanel';
import { bindingFromEvent } from '../shared/keybindings';
import {
  bindingIndex,
  panVector,
  PAN_OF_ACTION,
  resolveBindings,
  TOOL_OF_ACTION,
  type KeyActionId,
} from './keymap';
import { ZoomControl } from './ZoomControl';
import { quickLoad } from './saves';
import { updateSettings } from './settings';
import { MapCanvas } from './MapCanvas';
import { NewsPanel } from './NewsPanel';
import { NotificationHost } from './NotificationHost';
import { TilePanel } from './TilePanel';
import type { SimClient } from './SimClient';
import { StatusBar } from './StatusBar';
import { SystemPanel } from './SystemPanel';
import { useSimStore } from './store';

/** How long a rejection toast stays on screen. [ms] */
const TOAST_LIFETIME_MS = 4000;

/**
 * The end screen is loaded when the game ends, not when it starts (SPEC2 M17).
 *
 * The main chunk is a budget with a test behind it (D-192), and this is the one
 * screen a session shows at most once: a scoreboard, four medals and a table of
 * verdicts that nobody looks at until the last day of the game. The fallback is
 * `null` because a screen that appears one frame later than the very tick the
 * game ended is a screen that appears at the same moment.
 */
const GameEndScreen = lazy(async () => ({
  default: (await import('./GameEndScreen')).GameEndScreen,
}));

/**
 * The scenario workshop's palette (SPEC2 M22), loaded when a workshop world
 * arrives and never in a game - the same budget argument as the end screen
 * above (D-192). The fallback is `null`: a palette that appears one frame
 * after the map is a palette that appears with the map.
 */
const EditorPanel = lazy(async () => ({
  default: (await import('./editor/EditorPanel')).EditorPanel,
}));

/**
 * The benchmark screen of SPEC2 M22, lazy for the same reason: the four
 * canonical maps are a menu entry a player opens once, and the panel that
 * shows their percentiles has no business in the chunk that boots a game.
 */
const BenchmarkPanel = lazy(async () => ({
  default: (await import('./BenchmarkPanel')).BenchmarkPanel,
}));

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
  const toggleHeat = useSimStore((s) => s.toggleHeat);
  const showHeat = useSimStore((s) => s.showHeat);
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
  // The player's own key table (SPEC2 M25). Subscribed on its own so a volume
  // slider does not rebuild the keyboard index.
  const keyBindings = useSimStore((s) => s.settings.keyBindings);
  const year = useSimStore((s) => s.year);
  const month = useSimStore((s) => s.month);
  // Replay mode is one field (SPEC2 M16): while it is set the interface offers
  // nothing that would author state, because a recording the player can build
  // in is not the recording any more (D-189).
  const replaying = useSimStore((s) => s.replay !== null);
  // The end of the game (SPEC2 M17). The decision itself is a pure function so
  // a headless test drives exactly what the screen does.
  const editorMode = useSimStore((s) => s.editorMode);
  const gameEnd = useSimStore((s) => s.gameEnd);
  const dismissedEnd = useSimStore((s) => s.dismissedEnd);
  const dismissEnd = useSimStore((s) => s.dismissEnd);
  const ending = showsEndScreen(gameEnd, dismissedEnd, replaying);

  // Space toggles between pause and the speed that was running before.
  const lastRunningSpeed = useRef(1);
  useEffect(() => {
    if (speedIndex > 0) lastRunningSpeed.current = speedIndex;
  }, [speedIndex]);

  useEffect(() => {
    // ONE index from binding to action, rebuilt only when the player's own
    // table moves (SPEC2 M25). The handler runs on every key press in the
    // application, so the resolve does not: it is a map lookup per press.
    const index = bindingIndex(resolveBindings(keyBindings));

    /**
     * The pan keys currently down.
     *
     * A pan key is the only kind whose RELEASE means something, so it is the
     * only kind this handler has to remember. The set is what makes two keys
     * at once a diagonal rather than whichever one was pressed last.
     */
    const heldPan = new Set<KeyActionId>();
    const steerCamera = (): void => {
      const [x, y] = panVector(heldPan);
      useSimStore.getState().cameraControl?.pan(x, y);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      const binding = bindingFromEvent(event);
      if (binding === null) return;
      const action = index.get(binding);
      if (action === undefined) return;

      // Everything below this line is a binding the player put there, and no
      // text field is focused - so the browser's own meaning of the key is
      // never what was wanted.
      event.preventDefault();

      // The camera keys, before everything else and never blocked by a
      // replay: looking around a recording is exactly as free as looking
      // around a game (D-189's own sentence about the camera).
      if (PAN_OF_ACTION[action] !== undefined) {
        // `repeat` is the operating system's auto-repeat, which this handler
        // wants none of - the velocity is already held.
        if (!event.repeat) {
          heldPan.add(action);
          steerCamera();
        }
        return;
      }
      if (action === 'zoomIn' || action === 'zoomOut') {
        useSimStore.getState().cameraControl?.zoomBy(action === 'zoomIn' ? 1 : -1);
        return;
      }

      // A build tool the scheme assigns a letter to. Not while a recording is
      // playing: arming a tool that cannot build anything is an invitation to
      // click at a world that will refuse.
      const tool = TOOL_OF_ACTION[action];
      if (tool !== undefined) {
        if (!replaying) setTool(tool);
        return;
      }

      switch (action) {
        case 'pause':
          client.setSpeed(speedIndex === 0 ? lastRunningSpeed.current : 0);
          return;
        case 'escape': {
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
        case 'handbook':
          setOverlay(overlay === 'handbook' ? null : 'handbook');
          return;
        // The replay shelf of SPEC2 M16, on the F row beside the save shelf's
        // own keys: every letter with a mnemonic is a build tool or a list,
        // and the overlays already live here (D-114's table).
        case 'replays':
          setOverlay(overlay === 'replays' ? null : 'replays');
          return;
        case 'quickSave':
          // Saving a recording would put somebody else's game on the player's
          // shelf; the worker refuses it too.
          if (!replaying) client.save(SaveSlotKind.Quick, '');
          return;
        case 'quickLoad':
          if (!replaying) void quickLoad(client);
          return;
        // Undo and redo (SPEC2 M25, E-12) - the two bindings D-114 left
        // unbound because the machinery did not exist.
        case 'undo':
          if (!replaying) client.undo();
          return;
        case 'redo':
          if (!replaying) client.redo();
          return;
        // The route assistant toggle of the D-114 table. Auto-signalling has
        // its own checkbox on the track tool; it never had a key of its own.
        case 'assistant':
          setAssistant(!assistant);
          return;
        case 'minimapMode':
          cycleMinimapMode();
          return;
        // The flow atlas overlay of SPEC2 M14 (D-114 table entry).
        case 'flowAtlas':
          toggleFlow();
          return;
        // The utilisation heat map of SPEC2 M15 - U for Utilisation and for
        // Auslastung's own reading (D-114 table entry).
        case 'heatmap':
          toggleHeat();
          return;
        case 'speed1':
          client.setSpeed(1);
          return;
        case 'speed2':
          client.setSpeed(2);
          return;
        case 'speed3':
          client.setSpeed(3);
          return;
        case 'speed4':
          client.setSpeed(4);
          return;
        case 'debug':
          toggleDebug();
          return;
        // The list keys of section 17.2. Five lists cannot all be on screen at
        // once, so each key toggles its own and closes whatever was open. L is
        // the LINE list, as the section says; the station list sits on H (see
        // keymap.ts).
        case 'listVehicles':
          toggleList('vehicles');
          return;
        case 'listLines':
          toggleList('lines');
          return;
        case 'listStations':
          toggleList('stations');
          return;
        case 'listTowns':
          toggleList('towns');
          return;
        case 'listIndustries':
          toggleList('industries');
          return;
        default:
          return;
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const binding = bindingFromEvent(event);
      if (binding === null) return;
      const action = index.get(binding);
      if (action === undefined || !heldPan.delete(action)) return;
      steerCamera();
    };

    /**
     * A key held while the window goes away never reports its release, and the
     * camera would slide for ever behind whatever the player switched to.
     */
    const onBlur = (): void => {
      if (heldPan.size === 0) return;
      heldPan.clear();
      steerCamera();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, [
    client,
    keyBindings,
    speedIndex,
    toggleDebug,
    toggleFlow,
    toggleHeat,
    toggleList,
    overlay,
    setOverlay,
    setTool,
    assistant,
    setAssistant,
    cycleMinimapMode,
    replaying,
  ]);

  // Entering a replay disarms whatever the player was holding. The tool would
  // otherwise survive the world swap and paint a preview over somebody else's
  // game; `setTool` also clears the road anchor, the preview and the connect
  // flow, which is exactly the half-finished build that must not follow.
  useEffect(() => {
    if (!replaying) return;
    setTool('none');
    useSimStore.getState().setFollowVehicle(null);
    useSimStore.getState().setSelectedVehicle(null);
  }, [replaying, setTool]);

  // A recording that STARTS takes the screen, whichever door it came through -
  // the shelf's "play", or a save converted and entered in one click from the
  // save screen. The overlay closes on the transition only, so opening the
  // handbook or the replay browser during a playback still works.
  useEffect(() => {
    if (replaying) setOverlay(null);
  }, [replaying, setOverlay]);

  // ------------------------------------------------------------- autosave
  //
  // Driven from here rather than from the worker because the SETTING lives
  // here: the simulation has no opinion about whether the player wants
  // autosaves, and giving it one would mean a second copy of the preference.
  const lastAutosave = useRef(-1);
  useEffect(() => {
    // Never during a replay: the months roll past at 20x and every one of them
    // would put a recording of somebody else's game on the save shelf.
    if (!ready || !settings.autosave || replaying) return;
    const months = year * 12 + month;
    if (months % AUTOSAVE_EVERY_MONTHS !== 0 || months === lastAutosave.current) return;
    lastAutosave.current = months;
    client.save(SaveSlotKind.Auto, '');
  }, [client, ready, settings.autosave, year, month, replaying]);

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
              onStart={(options, relief) => {
                client.newGame(options, relief);
                setOverlay(null);
              }}
              onCancel={ready ? () => setOverlay('menu') : null}
            />
          )}
          {overlay === 'scenarios' && (
            <ScenarioBrowser client={client} onClose={() => setOverlay('menu')} />
          )}
          {overlay === 'campaign' && (
            <CampaignScreen client={client} onClose={() => setOverlay('menu')} />
          )}
          {overlay === 'achievements' && <AchievementPanel onClose={() => setOverlay('menu')} />}
          {overlay === 'options' && <OptionsPanel onClose={() => setOverlay('menu')} />}
          {overlay === 'saves' && (
            <SaveLoadPanel client={client} onClose={() => setOverlay('menu')} />
          )}
          {overlay === 'replays' && (
            <ReplayBrowser client={client} onClose={() => setOverlay(null)} />
          )}
          {overlay === 'benchmark' && (
            <BenchmarkPanel client={client} onClose={() => setOverlay('menu')} />
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
        {/* The notification host stays mounted behind full-screen overlays
            too: the game keeps running under the handbook, and a pause-armed
            alarm that fired while the player was reading must still stop the
            clock (SPEC2 M14). */}
        <NotificationHost client={client} />
        {/* And the achievement watcher of SPEC2 M24, for the same reason: the
            news that earns one arrives while the player is in a menu just as
            often as while they are looking at the map. */}
        <AchievementHost />
      </div>
    );
  }

  return (
    <div className="app">
      <StatusBar client={client} />

      {ready ? (
        <main className="workspace workspace--map">
          <MapCanvas client={client} />
          {/* The camera's own controls, over the map and out of the sidebar's
              way: the zoom is a property of what the player is looking at,
              not a setting on a panel. */}
          <ZoomControl />
          <Minimap />
          <aside className="sidebar">
            {/* While a recording plays the sidebar IS the playback bar. Every
                panel it replaces exists to issue commands, and a replay that
                could be built in would stop being one (SPEC2 M16, D-189). The
                map, the minimap and the camera stay exactly as free as they
                are in a game. */}
            {replaying && <ReplayBar client={client} />}
            {/* One list at a time, opened with V, L, H, T or I (section 17.2).
                Five always-visible lists would not fit beside the map, and the
                spec puts them behind keys for exactly that reason. */}
            {!replaying && openList === 'vehicles' && <VehicleList />}
            {!replaying && openList === 'lines' && <LinePanel client={client} />}
            {!replaying && openList === 'stations' && <StationList />}
            {!replaying && openList === 'towns' && <TownList />}
            {!replaying && openList === 'industries' && <IndustryList />}
            {/* What the scenario asks for, above the books: a goal is the
                reason the books are being read (SPEC2 M17). */}
            {/* A workshop world puts the palette at the top of the sidebar,
                above the panels of the company whose money it does not spend
                (SPEC2 M22, D-240). */}
            {!replaying && editorMode && (
              <Suspense fallback={null}>
                <EditorPanel client={client} />
              </Suspense>
            )}
            {!replaying && <GoalPanel />}
            {!replaying && <TilePanel client={client} />}
            {!replaying && <FleetPanel client={client} />}
            {!replaying && <CompanyPanel client={client} />}
            {!replaying && <FinancePanel client={client} />}
            {!replaying && <CompanyList />}
            {!replaying && <ContractPanel client={client} />}
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
        <button
          type="button"
          className={showHeat ? 'chip chip--active' : 'chip'}
          onClick={toggleHeat}
        >
          {t('ui.heat.toggle')}
        </button>
        {/* The honest "x weitere" indicator of the M14 order: legs that
            exist but were cut by the top-N cap of the flow atlas. */}
        {showFlow && flowStats.omitted > 0 && (
          <span className="appbar__label">{t('ui.flow.more', { count: flowStats.omitted })}</span>
        )}
      </footer>

      {rejectionKey !== null && (
        <div className="toast" role="status">
          {t(rejectionKey)}
        </div>
      )}

      {/* The M14 notification routing: ticker strip and toast cards over the
          news the store already holds - pure presentation (D-110). */}
      <NotificationHost client={client} />

      {/* The achievements of SPEC2 M24, earned from the same news log and from
          the M17 goal markers - and from nothing else. */}
      <AchievementHost />

      {/* Victory, defeat, a winding-up or the end of the century (SPEC2 M17).
          Over the map rather than instead of it, and dismissible: a player who
          has just lost may want to look at the network that lost it. */}
      {ending && gameEnd !== null && (
        <Suspense fallback={null}>
          <GameEndScreen
            end={gameEnd}
            onClose={() => dismissEnd(gameEnd.reason)}
            onMenu={() => {
              dismissEnd(gameEnd.reason);
              setOverlay('menu');
            }}
          />
        </Suspense>
      )}

      <StoredCrashNotice />
    </div>
  );
}
