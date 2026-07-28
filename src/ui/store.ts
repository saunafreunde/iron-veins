import { create } from 'zustand';
import { setLocale as applyLocale, type Locale } from '../i18n';
import type { TileInfo } from '../render/MapView';
import type { IndustryMarker, StationMarker, TownMarker, VehicleMarker } from '../shared/protocol';
import type { MapGenPhase } from '../sim/mapgen';

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
  | 'raildepot';

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
  stations: readonly StationMarker[];
  fleet: readonly VehicleMarker[];
  selectedVehicleId: number | null;
  /** First corner of a road drag; the second click completes it. */
  roadAnchor: { readonly x: number; readonly y: number } | null;
  trackPreview: TrackPreview | null;
  /** Units the player has put together in the rail depot, not yet bought. */
  trainDraft: readonly number[];
  companyName: string;
  companyColorIndex: number;
  appVersion: string;
  isDesktop: boolean;
  sharedMemoryAvailable: boolean;
  showDebug: boolean;
  /** Translation key of the last rejected command, shown as a toast. */
  rejectionKey: string | null;
  /** Bumped on every rejection so repeating the same mistake restarts the toast. */
  rejectionSeq: number;
  /** Set when the simulation could not be started at all. */
  fatalError: string | null;

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
  setStations: (stations: readonly StationMarker[]) => void;
  setFleet: (vehicles: readonly VehicleMarker[]) => void;
  setSelectedVehicle: (id: number | null) => void;
  setRoadAnchor: (anchor: { readonly x: number; readonly y: number } | null) => void;
  setTrackPreview: (preview: TrackPreview | null) => void;
  addTrainUnit: (specId: number) => void;
  removeTrainUnit: (index: number) => void;
  clearTrainDraft: () => void;
  setReady: (seed: number) => void;
  setCompany: (name: string, colorIndex: number) => void;
  setPlatform: (appVersion: string, isDesktop: boolean) => void;
  setSharedMemoryAvailable: (available: boolean) => void;
  setRejection: (reasonKey: string | null) => void;
  setFatalError: (message: string) => void;
  toggleDebug: () => void;
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
  stations: [],
  fleet: [],
  selectedVehicleId: null,
  roadAnchor: null,
  trackPreview: null,
  trainDraft: [],
  companyName: '',
  companyColorIndex: 0,
  appVersion: '',
  isDesktop: false,
  sharedMemoryAvailable: typeof SharedArrayBuffer !== 'undefined',
  showDebug: false,
  rejectionKey: null,
  rejectionSeq: 0,
  fatalError: null,

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
  setTool: (tool) => set({ tool, roadAnchor: null, trackPreview: null }),
  setTrackPreview: (preview) => set({ trackPreview: preview }),
  setStations: (stations) => set({ stations }),
  setFleet: (vehicles) => set({ fleet: vehicles }),
  setSelectedVehicle: (id) => set({ selectedVehicleId: id }),
  setRoadAnchor: (anchor) => set({ roadAnchor: anchor, trackPreview: null }),
  addTrainUnit: (specId) => set((state) => ({ trainDraft: [...state.trainDraft, specId] })),
  removeTrainUnit: (index) =>
    set((state) => ({ trainDraft: state.trainDraft.filter((_, i) => i !== index) })),
  clearTrainDraft: () => set({ trainDraft: [] }),
  setReady: (seed) => set({ ready: true, seed, generatingPhase: null }),
  setCompany: (name, colorIndex) => set({ companyName: name, companyColorIndex: colorIndex }),
  setPlatform: (appVersion, isDesktop) => set({ appVersion, isDesktop }),
  setSharedMemoryAvailable: (available) => set({ sharedMemoryAvailable: available }),
  setRejection: (reasonKey) =>
    set((state) => ({ rejectionKey: reasonKey, rejectionSeq: state.rejectionSeq + 1 })),
  setFatalError: (message) => set({ fatalError: message }),
  toggleDebug: () => set((state) => ({ showDebug: !state.showDebug })),
}));
