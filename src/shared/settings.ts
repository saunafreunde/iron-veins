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

import { normaliseBindingOverrides } from './keybindings';

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

/**
 * Where a news category's fresh entries go (SPEC2 M14). Pure presentation
 * (D-110): the LOG is simulation state and `postOnce` already guarantees
 * spam-freedom sim-side; this setting only decides how loudly the interface
 * repeats what the log recorded. `Pause` also stops the clock on anything
 * above Info severity - the "pause on critical" of the milestone order.
 */
export const NotificationMode = {
  Off: 0,
  Ticker: 1,
  Toast: 2,
  Pause: 3,
} as const;
export type NotificationMode = (typeof NotificationMode)[keyof typeof NotificationMode];

export const NOTIFICATION_MODE_COUNT = 4;

/** Translation keys for the four modes, indexed by NotificationMode. */
export const NOTIFICATION_MODE_KEYS: readonly string[] = [
  'ui.options.notifyOff',
  'ui.options.notifyTicker',
  'ui.options.notifyToast',
  'ui.options.notifyPause',
];

/** How many news categories the routing table covers (sim/news/log.ts). */
export const NOTIFICATION_CATEGORY_COUNT = 6;

/**
 * Defaults per category, indexed by NewsCategory (Finance, Industry, Fleet,
 * Network, Town, Weather). Finance and Network default to toast cards - money
 * trouble and stuck trains are what ends runs - the rest to the one-line
 * ticker. Pause is deliberately never a default: stopping the world uninvited
 * is a choice only the player may make.
 *
 * Weather (SPEC2 M18) is a ticker line: a storm costs a percentage, not a
 * game, and a card for every front would be the loudest category in the game
 * for the smallest consequence.
 */
export const DEFAULT_NOTIFICATIONS: readonly number[] = [
  NotificationMode.Toast,
  NotificationMode.Ticker,
  NotificationMode.Ticker,
  NotificationMode.Toast,
  NotificationMode.Ticker,
  NotificationMode.Ticker,
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
  /**
   * Stop the things that move for their own sake (SPEC2 M25): smoke, exhaust,
   * rain and snow, the water's three-frame cycle, and every transition and
   * animation in the interface. Render-only in the strictest sense - a world
   * played with it on is bit-identical to one played without it, because the
   * particles and the water row have never been anything but pixels (Z1).
   */
  readonly reducedMotion: boolean;
  /**
   * Key bindings the player changed, as `actionId -> binding` (SPEC2 M25,
   * D-114's table made editable). Sparse on purpose: an action that is not in
   * here uses the table's own default, so a build that adds an action gives it
   * to everybody rather than leaving it unbound for anyone who ever opened the
   * controls screen. `src/shared/keybindings.ts` decides what a binding is;
   * `src/ui/keymap.ts` decides which ids exist and refuses a conflict.
   */
  readonly keyBindings: Readonly<Record<string, string>>;
  /** Volume per channel, 0..1, indexed by VolumeChannel. */
  readonly volumes: readonly number[];
  /** Master switch for the whole audio engine. */
  readonly audioEnabled: boolean;
  /** Automatic save every six game months (section 19.1). */
  readonly autosave: boolean;
  /** Show the tutorial offer when the application starts. */
  readonly offerTutorial: boolean;
  /**
   * Whether the tutorial has already been offered on this installation.
   *
   * The pair is what makes `offerTutorial` mean what its label says without
   * offering the same lesson every single boot: the setting is the player's
   * standing answer, this is the record of having asked. A setting rather than
   * a profile field, because `profile.json` has no writer for it and because
   * losing this costs one dismissed panel (M26).
   */
  readonly tutorialSeen: boolean;
  /**
   * Notification routing per news category, indexed by NewsCategory, each a
   * NotificationMode (SPEC2 M14). A setting, never a rule: the log itself is
   * identical whatever is chosen here.
   */
  readonly notifications: readonly number[];
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
  reducedMotion: false,
  keyBindings: {},
  volumes: [0.6, 0.4, 0, 0.5],
  audioEnabled: true,
  autosave: true,
  offerTutorial: true,
  tutorialSeen: false,
  notifications: DEFAULT_NOTIFICATIONS,
};

/** The locales the catalogues carry, as primary language subtags. */
export const SUPPORTED_LANGUAGES: readonly string[] = ['de', 'en'];

/**
 * What the OS says, when there is no settings file to say otherwise (SPEC2
 * M25: "OS-Locale-Erkennung beim Erststart").
 *
 * First boot ONLY, and that is the whole design: a stored file always wins,
 * because a player who chose English on a German system chose it, and a
 * detector that re-ran on every start would take it away from them once a
 * browser update changed `navigator.languages`. Region subtags are ignored -
 * `de-AT` and `de-CH` read the German catalogue, since the alternative is a
 * fallback to the wrong language for a spelling difference.
 *
 * Pure: the caller hands over the tags, so the rule is tested without a
 * navigator and the platform layer has the one line that reads one.
 */
export function detectLanguage(tags: readonly string[]): string {
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const primary = tag.split('-')[0]!.toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(primary)) return primary;
  }
  return DEFAULT_SETTINGS.locale;
}

/**
 * The settings a machine that has never run this game starts with: the
 * defaults, plus what the operating system has already been asked about.
 *
 * Reduced motion is here for the same reason the language is: a player who
 * has told their system that motion hurts has already answered the question,
 * and asking it again in a menu they may never open is the accessibility
 * failure this setting exists to avoid. Both are defaults, not locks - the
 * options screen overrules either, and the choice is then in the file.
 */
export function firstBootSettings(env: {
  readonly languages: readonly string[];
  readonly prefersReducedMotion: boolean;
}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    locale: detectLanguage(env.languages),
    reducedMotion: env.prefersReducedMotion,
  };
}

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

  // Absent in files written before M14; per entry, so a file from a build
  // with fewer categories keeps what it chose and defaults the rest.
  const notifications: number[] = [];
  const rawNotifications = Array.isArray(value['notifications'])
    ? (value['notifications'] as unknown[])
    : [];
  for (let category = 0; category < NOTIFICATION_CATEGORY_COUNT; category++) {
    const entry = rawNotifications[category];
    const fallback = DEFAULT_NOTIFICATIONS[category]!;
    notifications.push(
      typeof entry === 'number' &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry < NOTIFICATION_MODE_COUNT
        ? entry
        : fallback,
    );
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
    // Absent before M25. Off unless the file says otherwise: a file that
    // predates the setting was written by a build whose world moved, and
    // inheriting the OS preference here would change what an existing player
    // sees on an update they did not ask for. First boot is where the system
    // is consulted (`firstBootSettings`).
    reducedMotion: value['reducedMotion'] === true,
    keyBindings: normaliseBindingOverrides(value['keyBindings']),
    volumes,
    audioEnabled: value['audioEnabled'] !== false,
    autosave: value['autosave'] !== false,
    offerTutorial: value['offerTutorial'] !== false,
    // Default FALSE, unlike its partner above: a settings file written before
    // M26 has never offered the tutorial, so the honest reading of a missing
    // field is 'not yet asked'.
    tutorialSeen: value['tutorialSeen'] === true,
    notifications,
  };
}
