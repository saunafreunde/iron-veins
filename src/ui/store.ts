import { create } from 'zustand';
import { setLocale as applyLocale, type Locale } from '../i18n';
import type { TileInfo } from '../render/MapView';
import type { IndustryMarker, TownMarker } from '../shared/protocol';
import type { MapGenPhase } from '../sim/mapgen';

/** What a left click on the map does. */
export type Tool = 'none' | 'raise' | 'lower' | 'level';

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
  setTool: (tool) => set({ tool }),
  setReady: (seed) => set({ ready: true, seed, generatingPhase: null }),
  setCompany: (name, colorIndex) => set({ companyName: name, companyColorIndex: colorIndex }),
  setPlatform: (appVersion, isDesktop) => set({ appVersion, isDesktop }),
  setSharedMemoryAvailable: (available) => set({ sharedMemoryAvailable: available }),
  setRejection: (reasonKey) =>
    set((state) => ({ rejectionKey: reasonKey, rejectionSeq: state.rejectionSeq + 1 })),
  setFatalError: (message) => set({ fatalError: message }),
  toggleDebug: () => set((state) => ({ showDebug: !state.showDebug })),
}));
