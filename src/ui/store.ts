import { create } from 'zustand';
import { setLocale as applyLocale, type Locale } from '../i18n';

/** The part of the store that is refreshed from the shared snapshot buffer. */
export interface SnapshotValues {
  tick: number;
  year: number;
  month: number;
  day: number;
  speedIndex: number;
  commandsExecuted: number;
  simRateCentiHz: number;
  cashCt: number;
  loanCt: number;
  loanLimitCt: number;
  stateHash: string;
}

export interface SimUiState extends SnapshotValues {
  locale: Locale;
  ready: boolean;
  seed: number;
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
  cashCt: 0,
  loanCt: 0,
  loanLimitCt: 0,
  stateHash: '0000000000000000',

  locale: 'de',
  ready: false,
  seed: 0,
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
  setReady: (seed) => set({ ready: true, seed }),
  setCompany: (name, colorIndex) => set({ companyName: name, companyColorIndex: colorIndex }),
  setPlatform: (appVersion, isDesktop) => set({ appVersion, isDesktop }),
  setSharedMemoryAvailable: (available) => set({ sharedMemoryAvailable: available }),
  setRejection: (reasonKey) =>
    set((state) => ({ rejectionKey: reasonKey, rejectionSeq: state.rejectionSeq + 1 })),
  setFatalError: (message) => set({ fatalError: message }),
  toggleDebug: () => set((state) => ({ showDebug: !state.showDebug })),
}));
