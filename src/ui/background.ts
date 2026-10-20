/**
 * What the game does when it is put away (D-277).
 *
 * Two answers that look like one and are not. SAVING when the page is hidden
 * is right everywhere: a phone's system may kill a background tab without a
 * word, a desktop browser may be closed with the tab in it, and whatever
 * happened since the last six-month autosave would go with it. PAUSING is
 * right only where being hidden means the player has left the game - an
 * installed app on a phone, where the home button and an incoming call are
 * how the game is put down. In a browser tab on a desktop, or in the Tauri
 * shell, a hidden window is a player who looked at something else for a
 * moment and expects the trains to have kept running; stopping the clock
 * behind their back would be the first impression of D-266 in reverse.
 *
 * Both are pure functions of a record, so the line between them is a test
 * rather than a feeling.
 */

/** The display facts that tell an installed app from a browser tab. */
export interface DisplayEnvironment {
  /** The Tauri desktop shell - never an installed web app. */
  readonly isDesktop: boolean;
  /** `(display-mode: standalone)`: launched as an installed app. */
  readonly standalone: boolean;
  /** `(display-mode: fullscreen)`: the manifest's mode, or a browser in F11. */
  readonly fullscreen: boolean;
  /** `(pointer: coarse)`: a touch screen is the primary pointer. */
  readonly coarsePointer: boolean;
  /** `document.referrer` - a Trusted Web Activity opens with `android-app://`. */
  readonly referrer: string;
}

/**
 * Whether this page runs as an installed app rather than in a browser tab.
 *
 * Standalone is an installed app wherever it is. Fullscreen alone is not:
 * Chrome reports `display-mode: fullscreen` for a desktop window in F11 too,
 * which is a browser tab, so fullscreen counts only on a touch screen - the
 * manifest's own `fullscreen` on a phone. A Trusted Web Activity says so in
 * its referrer on the first navigation, and is fullscreen on a touch screen
 * after any reload.
 */
export function isInstalledApp(env: DisplayEnvironment): boolean {
  if (env.isDesktop) return false;
  if (env.referrer.startsWith('android-app://')) return true;
  if (env.standalone) return true;
  return env.fullscreen && env.coarsePointer;
}

/** The real browser, as {@link isInstalledApp} wants to see it. */
export function browserDisplayEnvironment(isDesktop: boolean): DisplayEnvironment {
  const media = (query: string): boolean =>
    typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return {
    isDesktop,
    standalone: media('(display-mode: standalone)'),
    fullscreen: media('(display-mode: fullscreen)'),
    coarsePointer: media('(pointer: coarse)'),
    referrer: document.referrer,
  };
}

/** The state the decision reads when the page goes into the background. */
export interface HiddenState {
  /** A world exists. */
  readonly ready: boolean;
  /** A recording is playing - never saved, never paused from here. */
  readonly replaying: boolean;
  /** The player's autosave setting. */
  readonly autosave: boolean;
  /** Whether {@link isInstalledApp} said yes. */
  readonly installedApp: boolean;
  /** The world's published tick now. */
  readonly tick: number;
  /** The tick the last background save was written at, or -1. */
  readonly lastSavedTick: number;
  /** The clock's speed step; 0 is paused. */
  readonly speedIndex: number;
}

/** What to do about it. */
export interface HiddenActions {
  readonly save: boolean;
  readonly pause: boolean;
}

/**
 * The decision for one `visibilitychange` to hidden.
 *
 * A save is skipped when the world has not moved since the last one this
 * wrote: switching apps five times over a paused game must not push five
 * copies of the same moment through the autosave ring and the older,
 * different autosaves out of it.
 */
export function hiddenActions(state: HiddenState): HiddenActions {
  if (!state.ready || state.replaying) return { save: false, pause: false };
  return {
    save: state.autosave && state.tick !== state.lastSavedTick,
    pause: state.installedApp && state.speedIndex !== 0,
  };
}
