import { create } from 'zustand';
import { setLocale as applyLocale, type Locale } from '../i18n';
import type { TileInfo } from '../render/MapView';
import { MINIMAP_MODE_COUNT, MinimapMode, type CameraView } from '../render/Minimap';
import type {
  FinanceReport,
  CompanyMarker,
  ContractMarker,
  SubsidyMarker,
  SupplyMarker,
  GameEndMarker,
  GoalMarker,
  IndustryMarker,
  LineMarker,
  NewsMarker,
  StationMarker,
  TownMarker,
  VehicleMarker,
  WorkerToMainMessage,
} from '../shared/protocol';
import type { ReplayEntry, SaveEntry } from '../platform/Storage';
import type { ProfileData } from '../platform/profileData';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings';
import { MapClimate, START_YEAR } from '../sim/constants';
import { EconomyCurve } from '../sim/economy/curve';
import type { MapGenPhase } from '../sim/mapgen';
import type { ReplayVerification } from '../sim/save/replay';
import type { ReplayMeta } from '../sim/save/replaySession';
import type { ConnectPlan } from './connect';
import { IndustryType } from '../sim/industry/types';
import { TownSize } from '../sim/town/types';
import type { CrashBundleSummary } from './crashBundle';
import { EDITOR_DEFAULT_BRUSH_RADIUS, type EditorTool } from './editor/tools';
import type { EditorOverlay } from './editor/overlays';

/**
 * The camera controls the interface may reach, wired to the live `MapView`.
 *
 * Three verbs and no state: where the camera IS travels the other way, through
 * `camera`, which the view publishes when it moved (D-166). Keeping the
 * direction of that flow one-way is what stops a slider and a wheel disagreeing
 * about the zoom.
 */
export interface CameraControl {
  /** Hold the camera moving at this screen-space velocity; (0, 0) stops it. */
  readonly pan: (x: number, y: number) => void;
  /** Zoom by whole steps about the centre of the screen. */
  readonly zoomBy: (steps: number) => void;
  /** Go to a step of `ZOOM_LEVELS`. */
  readonly setZoomStep: (step: number) => void;
}

/**
 * What a benchmark run reported (SPEC2 M22) - the worker's own message, minus
 * its `type` tag.
 *
 * Taken off `WorkerToMainMessage` rather than restated, so a figure that is
 * added to the run is a figure the screen can show without a second type
 * drifting behind the first (the D-133 shape, one layer out).
 */
export type BenchmarkResult = Omit<
  Extract<WorkerToMainMessage, { type: 'benchmarkResult' }>,
  'type'
>;

/**
 * The full-screen panels of M9. One at a time, because each of them wants the
 * whole window and two of them at once would mean deciding which is on top.
 */
export type OverlayKind =
  | 'menu'
  | 'newGame'
  | 'scenarios'
  | 'campaign'
  | 'achievements'
  | 'options'
  | 'saves'
  | 'replays'
  | 'benchmark'
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
/**
 * What the road-stop tools show before the click (D-210): the exact price the
 * command will charge, and whether it will lay a driveway or stand on the
 * carriageway. Both come from `planRoadStop`, which is what the command runs -
 * preview and bill are one answer (D-119).
 */
export interface RoadStopPreview {
  /** Already inflated: what will be CHARGED, not what the table says. */
  readonly costCt: number;
  /** True when a spur of road will be laid onto the module tile. */
  readonly bay: boolean;
  /** Set instead of the price when the ground refuses the build. */
  readonly reasonKey: string | null;
}

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
  /**
   * The world's climate (SPEC2 M18). A world constant announced with the map,
   * and the second input of the seasonal optics beside the published month.
   */
  climate: MapClimate;
  /**
   * The world's own first year and whether its clock ever stops (SPEC2 E-15).
   *
   * World constants announced with the map, like the climate above them: the
   * century chart labels its axis with the first, and the status bar needs the
   * second to tell "this game is over" from "this game is a hundred years old
   * and still running".
   */
  startYear: number;
  endless: boolean;
  /**
   * The century curve of SPEC2 M21 (E-09), row major in per mille, or empty
   * in a world whose economy rule is off.
   *
   * A world constant announced with the map, like the climate above it - and
   * the interface reads it for exactly two things: to SHOW the century (E-09's
   * "inspizierbar"), and to price a build preview through the same
   * `economyCostCt` the bill goes through, so preview and bill cannot come
   * apart the way D-092 records them coming apart over inflation.
   */
  economyCurve: EconomyCurve;
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
  /** The standing supply orders and subsidised relations of SPEC2 M21. */
  supplyOrders: readonly SupplyMarker[];
  subsidies: readonly SubsidyMarker[];
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
  /**
   * Which campaign stage is running, or null (SPEC2 M24, D-254).
   *
   * Beside `activeScenario` rather than inside it, because a scenario started
   * from the browser is not a campaign run: the id here is what the end screen
   * books a completion against, and a stage started outside the campaign screen
   * must not book one. Cleared by `resetWorld` for the same reason the scenario
   * identity is.
   */
  activeCampaignStageId: string | null;
  /**
   * Which campaign stages have been completed, and with which medal.
   *
   * The medal is `GoalMedal`, and a stage counts as completed exactly when its
   * world ended with `GameEnd.Won` - every goal achieved (D-196). Since M24's
   * profile bundle it is HYDRATED from `profile.json` at boot and written back
   * whenever it moves, which happens outside this file: the store holds the
   * player's progress, `ui/profile.ts` decides where it is kept, and the
   * campaign graph is a pure function of this set either way.
   */
  campaignCompleted: Readonly<Record<string, number>>;
  /**
   * The best medal every SHIPPED scenario was ever finished with (SPEC2 M24).
   *
   * Beside the campaign rather than inside it: a campaign stage is a scenario
   * with a chain over it, and the eight of M17 have no chain at all - but a
   * player who took gold on Frachtrausch has done something worth keeping. Same
   * rule as the campaign's own: booked only on `GameEnd.Won`, the medal the
   * simulation decided, and the better of the two is kept.
   */
  scenarioMedals: Readonly<Record<string, number>>;
  /**
   * Achievement id to the calendar year of the game it was earned in.
   *
   * Earned by `ui/achievements.ts` from the news log and the goal markers and
   * from nothing else - the simulation has never heard of any of this (SPEC2
   * M24). The year is what the panel shows beside the title; it is the game's
   * year rather than a wall-clock date, because that is the fact the player
   * remembers.
   */
  achievements: Readonly<Record<string, number>>;
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
  /** Live preview of the road-stop tools, or null (D-210). */
  roadStopPreview: RoadStopPreview | null;
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
   * True when the running world is a scenario WORKSHOP (SPEC2 M22).
   *
   * Published by the worker on `ready` rather than remembered from the button
   * that opened it: `editorMode` is saved, hashed world state, so a workshop
   * that was saved and loaded again is still one - and the palette has to
   * follow the WORLD, not the click.
   */
  editorMode: boolean;
  /** Which workshop tool is armed. Its own union: the palette is not the toolbar. */
  editorTool: EditorTool;
  /** Brush radius the sized workshop tools use. [tiles] */
  editorRadius: number;
  /** `TownSize` value the town-seed tool places. */
  editorTownSize: number;
  /** `IndustryType` value the industry tool sites. */
  editorIndustryType: number;
  /** Which debug overlay the workshop draws, or null for none. */
  editorOverlay: EditorOverlay | null;
  /**
   * Id of the benchmark map being built and timed, or null (SPEC2 M22).
   *
   * The run blocks the worker for as long as it takes to generate a 2048 map
   * and step a couple of thousand ticks, so the screen has to be able to say
   * "this is running" - a benchmark that looks like a frozen menu is a
   * benchmark somebody kills halfway through.
   */
  benchmarkRunning: string | null;
  /** What the last benchmark measured, or null. */
  benchmarkResult: BenchmarkResult | null;
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
    climate: MapClimate;
    startYear: number;
    endless: boolean;
    economyCurve: readonly number[];
    towns: readonly TownMarker[];
    industries: readonly IndustryMarker[];
    editorMode: boolean;
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
  setContracts: (
    contracts: readonly ContractMarker[],
    supplyOrders: readonly SupplyMarker[],
    subsidies: readonly SubsidyMarker[],
  ) => void;
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
  setActiveCampaignStage: (stageId: string | null) => void;
  /** Book a completed campaign stage, keeping the BEST medal ever earned. */
  completeCampaignStage: (stageId: string, medal: number) => void;
  /** Book a finished scenario, keeping the BEST medal ever earned (M24). */
  recordScenarioMedal: (scenarioId: string, medal: number) => void;
  /** Earn achievements, in the order the table lists them (M24). */
  unlockAchievements: (ids: readonly string[], year: number) => void;
  /** Put what `profile.json` remembered into the store, once, at boot (M24). */
  adoptProfile: (profile: ProfileData) => void;
  setOverlay: (overlay: OverlayKind) => void;
  toggleList: (list: 'vehicles' | 'lines' | 'stations' | 'towns' | 'industries') => void;
  /** Wired to the map view so a list row can jump to what it names. */
  centreOnTile: (x: number, y: number) => void;
  setCentreOnTile: (centre: (x: number, y: number) => void) => void;
  /**
   * The camera's own controls, wired to the live map view (null before it
   * mounts). The camera is the VIEW's state and this is a handle to it rather
   * than a copy of it - a second writable copy in the store would be a second
   * answer to where the camera is, and the minimap already reads the one the
   * view publishes through `camera` (D-166).
   */
  cameraControl: CameraControl | null;
  setCameraControl: (control: CameraControl | null) => void;
  /**
   * Where on the screen the player last pressed on the map, or null.
   *
   * The rejection message is shown there rather than at the bottom of the
   * window (M26): a build refused at the top left used to answer half a screen
   * away, and all 84 reasons arrive through the same strip in the same place.
   * Screen coordinates rather than a tile, because what has to be positioned
   * is a piece of interface, and the camera may have moved on by then.
   */
  lastMapPointer: { readonly x: number; readonly y: number } | null;
  setLastMapPointer: (point: { readonly x: number; readonly y: number } | null) => void;
  /**
   * Which lesson is open, and how many commands of each kind the player has
   * issued since it was.
   *
   * In the STORE rather than in `TutorialPanel`, and that is the whole repair
   * (M26): ten of the twenty-two steps are counted commands, the panel covers
   * the map while it is open, so the only way to do them is to close the
   * lesson and build - and closing it used to unmount the panel and take the
   * counts and the chosen lesson with it. The lesson could not be finished by
   * any route.
   */
  tutorialLesson: number | null;
  tutorialCounts: Readonly<Record<number, number>>;
  setTutorialLesson: (index: number | null) => void;
  countCommand: (kind: number) => void;
  setFleet: (vehicles: readonly VehicleMarker[]) => void;
  setSelectedVehicle: (id: number | null) => void;
  setFollowVehicle: (id: number | null) => void;
  setLines: (lines: readonly LineMarker[]) => void;
  setSelectedLine: (id: number | null) => void;
  setRoadAnchor: (anchor: { readonly x: number; readonly y: number } | null) => void;
  setTrackPreview: (preview: TrackPreview | null) => void;
  setRoadStopPreview: (preview: RoadStopPreview | null) => void;
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
  setEditorTool: (tool: EditorTool) => void;
  setEditorRadius: (radius: number) => void;
  setEditorTownSize: (sizeClass: number) => void;
  setEditorIndustryType: (industryType: number) => void;
  setEditorOverlay: (overlay: EditorOverlay | null) => void;
  setBenchmarkRunning: (mapId: string | null) => void;
  setBenchmarkResult: (result: BenchmarkResult) => void;
  setFlowStats: (drawn: number, omitted: number) => void;
  setFlowSource: (source: (() => { data: Int32Array; count: number; tick: number }) | null) => void;
}

/**
 * The century as an {@link EconomyCurve}, so the interface reads it through the
 * simulation's OWN accessors.
 *
 * The alternative - a raw array in the store and a second lookup written in the
 * panel - is how a chart and a bill come to disagree about what year 1997 was
 * worth. There is one table and one set of readers (`sim/economy/curve.ts`);
 * this is the two-line adapter from the wire shape to it.
 */
function adoptCurve(rows: readonly number[], startYear: number): EconomyCurve {
  const curve = new EconomyCurve();
  // The century is anchored on the world's own first year (SPEC2 E-15, D-245),
  // which is why `ready` publishes it: a chart labelled 1950 over an 1880
  // world's curve would be the preview-and-bill disagreement of D-092 with a
  // hundred years between the two.
  curve.startYear = startYear;
  curve.load(rows);
  return curve;
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
  climate: MapClimate.Temperate,
  startYear: START_YEAR,
  endless: false,
  economyCurve: new EconomyCurve(),
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
  supplyOrders: [],
  subsidies: [],
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
  activeCampaignStageId: null,
  campaignCompleted: {},
  scenarioMedals: {},
  achievements: {},
  overlay: null,
  openList: null,
  selectedVehicleId: null,
  followVehicleId: null,
  selectedLineId: null,
  roadAnchor: null,
  trackPreview: null,
  roadStopPreview: null,
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
  editorMode: false,
  editorTool: 'none',
  editorRadius: EDITOR_DEFAULT_BRUSH_RADIUS,
  editorTownSize: TownSize.Town,
  editorIndustryType: IndustryType.CoalMine,
  editorOverlay: null,
  benchmarkRunning: null,
  benchmarkResult: null,
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
      climate: world.climate,
      startYear: world.startYear,
      endless: world.endless,
      economyCurve: adoptCurve(world.economyCurve, world.startYear),
      towns: world.towns,
      industries: world.industries,
      townCount: world.towns.length,
      industryCount: world.industries.length,
      editorMode: world.editorMode,
      // Whatever the previous world had armed is disarmed with it: a workshop
      // tool surviving into a game would put the palette's click handler over
      // somebody's map, and an overlay would paint a world it never measured.
      editorTool: 'none',
      editorOverlay: null,
    }),
  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setTool: (tool) =>
    set({
      tool,
      roadAnchor: null,
      trackPreview: null,
      roadStopPreview: null,
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
  setContracts: (contracts, supplyOrders, subsidies) => set({ contracts, supplyOrders, subsidies }),
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
  setActiveCampaignStage: (activeCampaignStageId) => set({ activeCampaignStageId }),
  completeCampaignStage: (stageId, medal) =>
    set((state) => {
      // A replayed stage may earn a worse medal than the run before it, and a
      // campaign that forgot the better one would punish a player for playing
      // again. The set of completed ids never shrinks either.
      const held = state.campaignCompleted[stageId];
      if (held !== undefined && held >= medal) return {};
      return { campaignCompleted: { ...state.campaignCompleted, [stageId]: medal } };
    }),
  recordScenarioMedal: (scenarioId, medal) =>
    set((state) => {
      // The campaign's rule, one catalogue along: the better run is the one
      // that counts, and a worse replay never takes a medal away.
      const held = state.scenarioMedals[scenarioId];
      if (held !== undefined && held >= medal) return {};
      return { scenarioMedals: { ...state.scenarioMedals, [scenarioId]: medal } };
    }),
  unlockAchievements: (ids, year) =>
    set((state) => {
      // Nothing is ever re-earned: the year kept is the year it was FIRST
      // earned in, because that is what the player did. A no-op returns the
      // identical object, which is what lets the profile writer subscribe to
      // this field without writing the file on every news delta.
      let next: Record<string, number> | null = null;
      for (const id of ids) {
        if (state.achievements[id] !== undefined) continue;
        next ??= { ...state.achievements };
        next[id] = year;
      }
      return next === null ? {} : { achievements: next };
    }),
  adoptProfile: (profile) =>
    set({
      campaignCompleted: { ...profile.campaign },
      scenarioMedals: { ...profile.scenarios },
      achievements: { ...profile.achievements },
    }),
  setOverlay: (overlay) => set({ overlay }),
  toggleList: (list) => set((state) => ({ openList: state.openList === list ? null : list })),
  centreOnTile: () => undefined,
  setCentreOnTile: (centreOnTile) => set({ centreOnTile }),
  cameraControl: null,
  setCameraControl: (cameraControl) => set({ cameraControl }),
  lastMapPointer: null,
  setLastMapPointer: (lastMapPointer) => set({ lastMapPointer }),
  tutorialLesson: null,
  tutorialCounts: {},
  // A lesson that is CHOSEN starts counting from zero; leaving the list alone
  // (index null) keeps what was collected, because closing the panel to go and
  // build is the intended way through a lesson.
  setTutorialLesson: (index) =>
    set(index === null ? { tutorialLesson: null } : { tutorialLesson: index, tutorialCounts: {} }),
  countCommand: (kind) =>
    set((state) => ({
      tutorialCounts: { ...state.tutorialCounts, [kind]: (state.tutorialCounts[kind] ?? 0) + 1 },
    })),
  setTrackPreview: (preview) => set({ trackPreview: preview }),
  setRoadStopPreview: (preview) => set({ roadStopPreview: preview }),
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
      activeCampaignStageId: null,
      camera: null,
      towns: [],
      industries: [],
      stations: [],
      fleet: [],
      lines: [],
      companies: [],
      contracts: [],
      supplyOrders: [],
      subsidies: [],
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
      roadStopPreview: null,
      trainDraft: [],
      openList: null,
      mapBuffer: null,
      mapSize: 0,
      // The century belongs to the world that is going, exactly as its goals
      // do: a curve left standing would price the next game's build preview.
      economyCurve: new EconomyCurve(),
      startYear: START_YEAR,
      endless: false,
      flowStats: { drawn: 0, omitted: 0 },
      // The workshop belongs to the world that is going. `ready` sets the flag
      // again for the world that arrives, so the palette can never outlive the
      // map it was editing.
      editorMode: false,
      editorTool: 'none',
      editorOverlay: null,
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
  setEditorTool: (editorTool) => set({ editorTool }),
  setEditorRadius: (editorRadius) => set({ editorRadius }),
  setEditorTownSize: (editorTownSize) => set({ editorTownSize }),
  setEditorIndustryType: (editorIndustryType) => set({ editorIndustryType }),
  setEditorOverlay: (editorOverlay) => set({ editorOverlay }),
  setBenchmarkRunning: (benchmarkRunning) =>
    set(
      benchmarkRunning === null
        ? { benchmarkRunning }
        : { benchmarkRunning, benchmarkResult: null },
    ),
  setBenchmarkResult: (benchmarkResult) => set({ benchmarkResult, benchmarkRunning: null }),
  setFlowStats: (drawn, omitted) => set({ flowStats: { drawn, omitted } }),
  setFlowSource: (flowSource) => set({ flowSource }),
}));
