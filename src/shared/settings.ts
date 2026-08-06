/**
 * Everything the player can change that is NOT part of the simulation.
 *
 * The distinction matters and is the reason this type exists at all: a game
 * rule - inflation, the carbon levy, how many competitors - changes what the
 * world does and therefore lives in the save file and the hash. A setting
 * changes what the player sees and hears, is the same for every game they
 * play, and must never reach `src/sim`. Two worlds with the same seed and the
 * same commands are identical whatever is in here.
 */

/** UI scale steps of section 17.4, as percentages. */
export const UI_SCALES: readonly number[] = [100, 125, 150, 200];

/** Mixer channels of section 18. */
export const VolumeChannel = {
  Effects: 0,
  Ambience: 1,
  Music: 2,
  Interface: 3,
} as const;
export type VolumeChannel = (typeof VolumeChannel)[keyof typeof VolumeChannel];

export const VOLUME_CHANNEL_COUNT = 4;

/** Translation keys for the four sliders. */
export const VOLUME_CHANNEL_KEYS: readonly string[] = [
  'ui.options.volumeEffects',
  'ui.options.volumeAmbience',
  'ui.options.volumeMusic',
  'ui.options.volumeInterface',
];

export interface AppSettings {
  /** 'de' or 'en'. Kept as a plain string so this file needs no i18n import. */
  readonly locale: string;
  /** One of UI_SCALES. */
  readonly uiScalePercent: number;
  /**
   * Swap the company and cargo palettes for colour-blind-safe ones and hatch
   * the map overlays (section 17.4).
   */
  readonly colorBlind: boolean;
  /**
   * Day/night colour modulation over the map (section 16.3). Render-only:
   * a pure function of the snapshot tick, so the simulation never sees it.
   */
  readonly dayNight: boolean;
  /** Volume per channel, 0..1, indexed by VolumeChannel. */
  readonly volumes: readonly number[];
  /** Master switch for the whole audio engine. */
  readonly audioEnabled: boolean;
  /** Automatic save every six game months (section 19.1). */
  readonly autosave: boolean;
  /** Show the tutorial offer when the application starts. */
  readonly offerTutorial: boolean;
}

/**
 * The defaults of section 18: music silent, effects at sixty percent.
 *
 * Music starts at zero because the game ships no music - section 18 says so
 * outright - and a slider at sixty percent that produces nothing reads as a
 * broken game rather than as an empty folder.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'de',
  uiScalePercent: 100,
  colorBlind: false,
  dayNight: true,
  volumes: [0.6, 0.4, 0, 0.5],
  audioEnabled: true,
  autosave: true,
  offerTutorial: true,
};

/**
 * Make a settings object out of whatever was on disk.
 *
 * Field by field, with the default as the fallback, because the file was
 * written by an older version of the game as often as not - and a settings
 * file that fails to parse must cost the player their preferences, never their
 * ability to start the game.
 */
export function normaliseSettings(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const value = raw as Record<string, unknown>;

  const volumes: number[] = [];
  const rawVolumes = Array.isArray(value['volumes']) ? (value['volumes'] as unknown[]) : [];
  for (let channel = 0; channel < VOLUME_CHANNEL_COUNT; channel++) {
    const entry = rawVolumes[channel];
    const fallback = DEFAULT_SETTINGS.volumes[channel]!;
    volumes.push(typeof entry === 'number' && entry >= 0 && entry <= 1 ? entry : fallback);
  }

  const scale = value['uiScalePercent'];
  return {
    locale: value['locale'] === 'en' ? 'en' : 'de',
    uiScalePercent:
      typeof scale === 'number' && UI_SCALES.includes(scale)
        ? scale
        : DEFAULT_SETTINGS.uiScalePercent,
    colorBlind: value['colorBlind'] === true,
    // Absent in files written before M10; on unless explicitly turned off.
    dayNight: value['dayNight'] !== false,
    volumes,
    audioEnabled: value['audioEnabled'] !== false,
    autosave: value['autosave'] !== false,
    offerTutorial: value['offerTutorial'] !== false,
  };
}
