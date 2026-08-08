import { create } from 'zustand';
import { setLocale as applyLocale, type Locale } from '../i18n';
import type { TileInfo } from '../render/MapView';
import { MINIMAP_MODE_COUNT, MinimapMode, type CameraView } from '../render/Minimap';
import type {
  FinanceReport,
  CompanyMarker,
  ContractMarker,
  GameEndMarker,
  GoalMarker,
  IndustryMarker,
  LineMarker,
  NewsMarker,
  StationMarker,
  TownMarker,
  VehicleMarker,
} from '../shared/protocol';
import type { ReplayEntry, SaveEntry } from '../platform/Storage';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings';
import type { MapGenPhase } from '../sim/mapgen';
import type { ReplayVerification } from '../sim/save/replay';
import type { ReplayMeta } from '../sim/save/replaySession';
import type { ConnectPlan } from './connect';
import type { CrashBundleSummary } from './crashBundle';

/**
 * The full-screen panels of M9. One at a time, because each of them wants the
 * whole window and two of them at once would mean deciding which is on top.
 */
export type OverlayKind =
  | 'menu'
  | 'newGame'
  | 'scenarios'
  | 'options'
  | 'saves'
  | 'replays'
  | 'handbook'
  | 'tutorial'
  | null;

/** What a left click on the map does. */
export type Tool =
  | 'none'
  | 'raise'
  | 'lower'
  | 'level'
  | 'road'
  | 'stop'
  | 'depot'
  | 'demolish'
  | 'track'
  | 'platform'
  | 'raildepot'
  | 'signal'
  | 'pathsignal'
  | 'waypoint'
  | 'airstrip'
  | 'airport'
  | 'intlairport'
  | 'quay'
  | 'shipdepot'
  | 'freightterminal'
  | 'canopy'
  | 'coldstore'
  /** Two clicks on two stations, then a priced confirmation. */
  | 'connect';

/**
 * What the build preview shows before the player commits (section 17.3).
 * Computed on the main thread with the very planner the command uses, so the
 * numbers on screen and the numbers charged cannot drift apart.
 */
export interface TrackPreview {
  readonly tiles: readonly number[];
  readonly lengthM: number;
  readonly minRadiusM: number;
  readonly maxGradePermille: number;
  readonly maxSpeedMs: number;
  readonly costCt: number;
  /** Set instead of the numbers when the route is impossible. */
  readonly reasonKey: string | null;
}

/** The part of the store that is refreshed from the shared snapshot buffer. */
export interface SnapshotValues {
  tick: number;
  year: number;
  month: number;
  day: number;
  speedIndex: number;
  commandsExecuted: number;
  simRateCentiHz: number;
  mapRevision: number;
  cashCt: number;
  loanCt: number;
  loanLimitCt: number;
  stateHash: string;
  /** Consecutive months in the red; the bankruptcy countdown of 14.2. */
  monthsInDebt: number;
}

export interface SimUiState extends SnapshotValues {
  locale: Locale;
  ready: boolean;
  seed: number;
  /** Set while the map is being generated, null once the world is ready. */
  generatingPhase: MapGenPhase | null;
  /** How many seeds had to be rejected before a playable map came out. */
  generatingAttempt: number;
  mapSize: number;
  townCount: number;
  industryCount: number;
  /** Shared tile layers, handed over by the worker once the map exists. */
  mapBuffer: SharedArrayBuffer | null;
  towns: readonly TownMarker[];
  industries: readonly IndustryMarker[];
  hoveredTile: TileInfo | null;
  selectedTile: TileInfo | null;
  /** Active construction tool; decides what a left click does. */
  tool: Tool;
  /** Section 9.4: signal a dragged route automatically while laying it. */
  autoSignal: boolean;
  /**
   * Section 8.2: plan track with the route assistant, or lay the literal
   * line. The M key of the D-114 table toggles it; the track and connect
   * tools read it.
   */
  assistant: boolean;
  /** Which minimap view is showing; the N key cycles it (section 17.2). */
  minimapMode: MinimapMode;
  /**
   * What the map camera currently sees, pushed by the view only when it
   * actually moved (SPEC2 M12). The minimap panel draws its viewport
   * outline from this; nothing else subscribes, so a pan re-renders one
   * small overlay and not the interface.
   */
  camera: CameraView | null;
  stations: readonly StationMarker[];
  fleet: readonly VehicleMarker[];
  /** The player's lines, as the line list shows them (section 12.2). */
  lines: readonly LineMarker[];
  /** The books, as the finance panel shows them (section 14.1). */
  finances: FinanceReport | null;
  news: readonly NewsMarker[];
  companies: readonly CompanyMarker[];
  contracts: readonly ContractMarker[];
  /** The world's goals, in slot order (SPEC2 M17). Empty in a plain game. */
  goals: readonly GoalMarker[];
  /**
   * Live progress of each goal in thousandths, read out of the snapshot's
   * 64-byte goal block and written here only when a goal actually moved.
   *
   * The block is the goal machine's MOVING half (D-193) and this is its one
   * consumer; the exact figures beside the bar travel on the marker. A fresh
   * array on every poll would re-render the panel sixty times a second for
   * something that changes once a game day, so `SimClient` compares before it
   * writes.
   */
  goalProgress: readonly number[];
  /** Where the game stands and what it is worth, or null before the first day. */
  gameEnd: GameEndMarker | null;
  /**
   * The end the player has already acknowledged, or null.
   *
   * By REASON rather than by tick: the end marker is re-sent every game day
   * and a dismissal keyed to a tick would last exactly one day. Cleared by
   * `resetWorld`, so a new game can show its own ending.
   */
  dismissedEnd: number | null;
  /** Settings, mirrored here so React re-renders when one changes. */
  settings: AppSettings;
  /** Saves on the shelf, newest first (section 19.1). */
  saves: readonly SaveEntry[];
  /** Recordings on the replay shelf, newest first (SPEC2 M16). */
  replays: readonly ReplayEntry[];
  /**
   * The recording being watched, or null in an ordinary game.
   *
   * This one field is what puts the interface into replay mode: the build
   * tools disappear, the sidebar becomes the playback bar, and `SimClient`
   * refuses to send a command at all. The worker refuses too - that is the
   * authority - but a screen full of armed tools that all bounce would be a
   * lie about what the player can do.
   */
  replay: ReplayMeta | null;
  /** What the last "Replay prüfen" found, or null. */
  replayVerification: ReplayVerification | null;
  /** True while a verification is re-simulating in the worker. */
  replayChecking: boolean;
  /** Why the last replay operation failed, as a translation key, or null. */
  replayError: { readonly reasonKey: string; readonly detail: string } | null;
  /**
   * What the last load said when it failed, or null. A raw exception message
   * from the format layer is the wrong thing to show, so the key is the
   * sentence and the detail is what a bug report needs. `path` names the save
   * field the codec choked on ('' when it never got that far); `corrupt` means
   * the file itself is damaged, which is when the panel offers the `.bak`.
   */
  loadError: {
    readonly reasonKey: string;
    readonly detail: string;
    readonly path: string;
    readonly corrupt: boolean;
  } | null;
  /**
   * The shipped scenario the running game was started from, or null (M17).
   *
   * Identity only - the id the browser started and the title to put on the
   * screen. What the scenario actually ASKS for lives in the world's goals,
   * which are hashed state and travel with the save; this field is how the
   * interface knows which briefing it may still show. It is cleared by
   * `resetWorld`, so a plain new game or a loaded save can never inherit the
   * previous scenario's name.
   */
  activeScenario: { readonly id: string; readonly title: string } | null;
  /** Which full-screen overlay is open, if any. */
  overlay: OverlayKind;
  /** Which entity list is open, or null. The V/L/H/T/I keys of section 17.2. */
  openList: 'vehicles' | 'lines' | 'stations' | 'towns' | 'industries' | null;
  selectedVehicleId: number | null;
  /**
   * Vehicle the camera follows, or null (SPEC2 M14). A render fact: the map
   * view centres on the sprite's interpolated position each frame, and a
   * manual pan hands the camera back by clearing this through the view's
   * own callback.
   */
  followVehicleId: number | null;
  /** Line the line panel has open, or null. */
  selectedLineId: number | null;
  /** First corner of a road drag; the second click completes it. */
  roadAnchor: { readonly x: number; readonly y: number } | null;
  trackPreview: TrackPreview | null;
  /** Station the connect tool started from, or null. */
  connectAnchor: number | null;
  /** The planned and priced railway, waiting for a yes. */
  connectPlan: ConnectPlan | null;
  /** Why the last connection could not be planned, as a translation key. */
  connectError: string | null;
  /** Units the player has put together in the rail depot, not yet bought. */
  trainDraft: readonly number[];
  companyName: string;
  companyColorIndex: number;
  appVersion: string;
  isDesktop: boolean;
  sharedMemoryAvailable: boolean;
  showDebug: boolean;
  /** The flow atlas overlay of SPEC2 M14; the A key toggles it (D-114). */
  showFlow: boolean;
  /**
   * The utilisation heat map of SPEC2 M15; the U key toggles it (D-114's
   * table). Pure display over the derived throughput counters - no setting,
   * no world rule, nothing the simulation can see (D-186).
   */
  showHeat: boolean;
  /**
   * What the atlas currently shows against what the world measured: `drawn`
   * arrows on screen, `omitted` active legs cut by the top-N cap - the
   * honest "x weitere" indicator of the M14 order. Pushed change-detected
   * by the map view, so an unchanged network writes nothing here.
   */
  flowStats: { readonly drawn: number; readonly omitted: number };
  /**
   * Where the minimap's Fluss mode reads the published FlowMarker block,
   * wired by the map canvas from the SimClient (the setCentreOnTile
   * pattern): the painter itself stays pure (D-112), the PANEL gathers.
   */
  flowSource: (() => { data: Int32Array; count: number; tick: number }) | null;
  /** Translation key of the last rejected command, shown as a toast. */
  rejectionKey: string | null;
  /** Bumped on every rejection so repeating the same mistake restarts the toast. */
  rejectionSeq: number;
  /** Set when the simulation could not be started at all. */
  fatalError: string | null;
  /**
   * Set once when the simulation worker died mid-game (SPEC2 M10, D-132).
   * `tick` is the simulation tick at the moment of death, or -1 when the
   * worker never got a world. Never cleared: the only way on is a restart.
   */
  crash: { readonly message: string; readonly stack: string; readonly tick: number } | null;
  /**
   * Whether the crash bundle was put away automatically - null while the
   * write is still running, then the honest answer. The dialog phrases its
   * "where is my report" line from this.
   */
  crashBundleStored: boolean | null;
  /**
   * A crash bundle a PREVIOUS run left in the crashes directory, found by the
   * boot-time scan, or null (D-139). The offer notice renders while this is
   * set; both of its actions retire the stored file and clear it, so no crash
   * is ever offered twice.
   */
  storedCrashOffer: { readonly name: string; readonly summary: CrashBundleSummary } | null;

  applySnapshot: (values: SnapshotValues) => void;
  setLocale: (locale: Locale) => void;
  setGenerating: (phase: MapGenPhase, attempt: number) => void;
  setWorld: (world: {
    mapSize: number;
    mapBuffer: SharedArrayBuffer;
    towns: readonly TownMarker[];
    industries: readonly IndustryMarker[];
  }) => void;
  setHoveredTile: (tile: TileInfo | null) => void;
  setSelectedTile: (tile: TileInfo | null) => void;
  setTool: (tool: Tool) => void;
  setAutoSignal: (on: boolean) => void;
  setAssistant: (on: boolean) => void;
  setMinimapMode: (mode: MinimapMode) => void;
  cycleMinimapMode: () => void;
  setCamera: (camera: CameraView) => void;
  setStations: (stations: readonly StationMarker[]) => void;
  setIndustries: (industries: readonly IndustryMarker[]) => void;
  setTowns: (towns: readonly TownMarker[]) => void;
  setFinances: (report: FinanceReport) => void;
  setNews: (news: readonly NewsMarker[]) => void;
  setCompanies: (companies: readonly CompanyMarker[]) => void;
  setContracts: (contracts: readonly ContractMarker[]) => void;
  setGoals: (goals: readonly GoalMarker[], end: GameEndMarker) => void;
  setGoalProgress: (progress: readonly number[]) => void;
  dismissEnd: (reason: number) => void;
  setSettings: (settings: AppSettings) => void;
  setSaves: (saves: readonly SaveEntry[]) => void;
  setReplays: (replays: readonly ReplayEntry[]) => void;
  setReplay: (meta: ReplayMeta | null) => void;
  setReplayVerification: (result: ReplayVerification | null) => void;
  setReplayChecking: (checking: boolean) => void;
  setReplayError: (error: { readonly reasonKey: string; readonly detail: string } | null) => void;
  setLoadError: (
    error: {
      readonly reasonKey: string;
      readonly detail: string;
      readonly path: string;
      readonly corrupt: boolean;
    } | null,
  ) => void;
  setActiveScenario: (scenario: { readonly id: string; readonly title: string } | null) => void;
  setOverlay: (overlay: OverlayKind) => void;
  toggleList: (list: 'vehicles' | 'lines' | 'stations' | 'towns' | 'industries') => void;
  /** Wired to the map view so a list row can jump to what it names. */
  centreOnTile: (x: number, y: number) => void;
  setCentreOnTile: (centre: (x: number, y: number) => void) => void;
  setFleet: (vehicles: readonly VehicleMarker[]) => void;
  setSelectedVehicle: (id: number | null) => void;
  setFollowVehicle: (id: number | null) => void;
  setLines: (lines: readonly LineMarker[]) => void;
  setSelectedLine: (id: number | null) => void;
  setRoadAnchor: (anchor: { readonly x: number; readonly y: number } | null) => void;
  setTrackPreview: (preview: TrackPreview | null) => void;
  setConnectAnchor: (stationId: number | null) => void;
  setConnectPlan: (plan: ConnectPlan | null, reasonKey: string | null) => void;
  clearConnect: () => void;
  addTrainUnit: (specId: number) => void;
  removeTrainUnit: (index: number) => void;
  clearTrainDraft: () => void;
  setReady: (seed: number) => void;
  /**
   * Forget the world the player was in.
   *
   * Everything a world owns has to go at once. Leaving the station list behind
   * across a load is not a cosmetic bug: the panels index into it by id, and
   * the new world's ids mean something else.
   */
  resetWorld: () => void;
  setCompany: (name: string, colorIndex: number) => void;
  setPlatform: (appVersion: string, isDesktop: boolean) => void;
  setSharedMemoryAvailable: (available: boolean) => void;
  setRejection: (reasonKey: string | null) => void;
  setFatalError: (message: string) => void;
  setCrash: (crash: {
    readonly message: string;
    readonly stack: string;
    readonly tick: number;
  }) => void;
  setCrashBundleStored: (stored: boolean) => void;
  setStoredCrashOffer: (
    offer: { readonly name: string; readonly summary: CrashBundleSummary } | null,
  ) => void;
  toggleDebug: () => void;
  toggleFlow: () => void;
  toggleHeat: () => void;
  setFlowStats: (drawn: number, omitted: number) => void;
  setFlowSource: (source: (() => { data: Int32Array; count: number; tick: number }) | null) => void;
}

export const useSimStore = create<SimUiState>((set) => ({
  tick: 0,
  year: 1950,
  month: 0,
  day: 0,
  speedIndex: 0,
  commandsExecuted: 0,
  simRateCentiHz: 0,
  mapRevision: 0,
  cashCt: 0,
  loanCt: 0,
  loanLimitCt: 0,
  stateHash: '0000000000000000',
  monthsInDebt: 0,

  locale: 'de',
  ready: false,
  seed: 0,
  generatingPhase: null,
  generatingAttempt: 0,
  mapSize: 0,
  townCount: 0,
  industryCount: 0,
  mapBuffer: null,
  towns: [],
  industries: [],
  hoveredTile: null,
  selectedTile: null,
  tool: 'none',
  autoSignal: false,
  assistant: true,
  minimapMode: MinimapMode.Terrain,
  camera: null,
  stations: [],
  fleet: [],
  lines: [],
  finances: null,
  news: [],
  companies: [],
  contracts: [],
  goals: [],
  goalProgress: [],
  gameEnd: null,
  dismissedEnd: null,
  settings: DEFAULT_SETTINGS,
  saves: [],
  replays: [],
  replay: null,
  replayVerification: null,
  replayChecking: false,
  replayError: null,
  loadError: null,
  activeScenario: null,
  overlay: null,
  openList: null,
  selectedVehicleId: null,
  followVehicleId: null,
  selectedLineId: null,
  roadAnchor: null,
  trackPreview: null,
  connectAnchor: null,
  connectPlan: null,
  connectError: null,
  trainDraft: [],
  companyName: '',
  companyColorIndex: 0,
  appVersion: '',
  isDesktop: false,
  sharedMemoryAvailable: typeof SharedArrayBuffer !== 'undefined',
  showDebug: false,
  showFlow: false,
  showHeat: false,
  flowStats: { drawn: 0, omitted: 0 },
  flowSource: null,
  rejectionKey: null,
  rejectionSeq: 0,
  fatalError: null,
  crash: null,
  crashBundleStored: null,
  storedCrashOffer: null,

  applySnapshot: (values) => set(values),
  setLocale: (locale) => {
    applyLocale(locale);
    set({ locale });
  },
  setGenerating: (phase, attempt) => set({ generatingPhase: phase, generatingAttempt: attempt }),
  setWorld: (world) =>
    set({
      mapSize: world.mapSize,
      mapBuffer: world.mapBuffer,
      towns: world.towns,
      industries: world.industries,
      townCount: world.towns.length,
      industryCount: world.industries.length,
    }),
  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setTool: (tool) =>
    set({
      tool,
      roadAnchor: null,
      trackPreview: null,
      connectAnchor: null,
      connectPlan: null,
      connectError: null,
    }),
  setAutoSignal: (autoSignal) => set({ autoSignal }),
  setAssistant: (assistant) => set({ assistant }),
  setMinimapMode: (minimapMode) => set({ minimapMode }),
  cycleMinimapMode: () =>
    set((state) => ({
      minimapMode: ((state.minimapMode + 1) % MINIMAP_MODE_COUNT) as MinimapMode,
    })),
  setCamera: (camera) => set({ camera }),
  setIndustries: (industries) => set({ industries }),
  setTowns: (towns) => set({ towns }),
  setFinances: (finances) => set({ finances }),
  setNews: (news) => set({ news }),
  setCompanies: (companies) => set({ companies }),
  setContracts: (contracts) => set({ contracts }),
  setGoals: (goals, gameEnd) => set({ goals, gameEnd }),
  setGoalProgress: (goalProgress) => set({ goalProgress }),
  dismissEnd: (dismissedEnd) => set({ dismissedEnd }),
  setSettings: (settings) => set({ settings, locale: settings.locale === 'en' ? 'en' : 'de' }),
  setSaves: (saves) => set({ saves }),
  setReplays: (replays) => set({ replays }),
  // Entering, seeking and leaving all land here, and all three drop the last
  // verdict: a verification is about one recording at one moment, and a stale
  // "geprüft, identisch" beside a different recording would be a lie.
  setReplay: (replay) => set({ replay, replayVerification: null, replayChecking: false }),
  setReplayVerification: (replayVerification) => set({ replayVerification, replayChecking: false }),
  setReplayChecking: (replayChecking) => set({ replayChecking }),
  setReplayError: (replayError) => set({ replayError, replayChecking: false }),
  setLoadError: (loadError) => set({ loadError }),
  setActiveScenario: (activeScenario) => set({ activeScenario }),
  setOverlay: (overlay) => set({ overlay }),
  toggleList: (list) => set((state) => ({ openList: state.openList === list ? null : list })),
  centreOnTile: () => undefined,
  setCentreOnTile: (centreOnTile) => set({ centreOnTile }),
  setTrackPreview: (preview) => set({ trackPreview: preview }),
  setConnectAnchor: (connectAnchor) =>
    set({ connectAnchor, connectPlan: null, connectError: null }),
  setConnectPlan: (connectPlan, connectError) => set({ connectPlan, connectError }),
  clearConnect: () => set({ connectAnchor: null, connectPlan: null, connectError: null }),
  setStations: (stations) => set({ stations }),
  setFleet: (vehicles) => set({ fleet: vehicles }),
  setSelectedVehicle: (id) => set({ selectedVehicleId: id }),
  setFollowVehicle: (id) => set({ followVehicleId: id }),
  setLines: (lines) => set({ lines }),
  setSelectedLine: (id) => set({ selectedLineId: id }),
  setRoadAnchor: (anchor) => set({ roadAnchor: anchor, trackPreview: null }),
  addTrainUnit: (specId) => set((state) => ({ trainDraft: [...state.trainDraft, specId] })),
  removeTrainUnit: (index) =>
    set((state) => ({ trainDraft: state.trainDraft.filter((_, i) => i !== index) })),
  clearTrainDraft: () => set({ trainDraft: [] }),
  setReady: (seed) => set({ ready: true, seed, generatingPhase: null }),
  resetWorld: () =>
    set({
      ready: false,
      // A world that is being replaced takes its scenario with it: the briefing
      // belongs to the goals in THAT world, and a stale title over a plain new
      // game would claim the player is in a scenario they left.
      activeScenario: null,
      camera: null,
      towns: [],
      industries: [],
      stations: [],
      fleet: [],
      lines: [],
      companies: [],
      contracts: [],
      news: [],
      // The goals belong to the world that is going, and so does its ending:
      // a "Sieg" banner surviving into the next game would be a lie about a
      // world that no longer exists (the activeScenario rule, one field down).
      goals: [],
      goalProgress: [],
      gameEnd: null,
      dismissedEnd: null,
      finances: null,
      hoveredTile: null,
      selectedTile: null,
      selectedVehicleId: null,
      followVehicleId: null,
      selectedLineId: null,
      roadAnchor: null,
      trackPreview: null,
      trainDraft: [],
      openList: null,
      mapBuffer: null,
      mapSize: 0,
      flowStats: { drawn: 0, omitted: 0 },
    }),
  setCompany: (name, colorIndex) => set({ companyName: name, companyColorIndex: colorIndex }),
  setPlatform: (appVersion, isDesktop) => set({ appVersion, isDesktop }),
  setSharedMemoryAvailable: (available) => set({ sharedMemoryAvailable: available }),
  setRejection: (reasonKey) =>
    set((state) => ({ rejectionKey: reasonKey, rejectionSeq: state.rejectionSeq + 1 })),
  setFatalError: (message) => set({ fatalError: message }),
  setCrash: (crash) => set({ crash }),
  setCrashBundleStored: (crashBundleStored) => set({ crashBundleStored }),
  setStoredCrashOffer: (storedCrashOffer) => set({ storedCrashOffer }),
  toggleDebug: () => set((state) => ({ showDebug: !state.showDebug })),
  toggleFlow: () => set((state) => ({ showFlow: !state.showFlow })),
  toggleHeat: () => set((state) => ({ showHeat: !state.showHeat })),
  setFlowStats: (drawn, omitted) => set({ flowStats: { drawn, omitted } }),
  setFlowSource: (flowSource) => set({ flowSource }),
}));
