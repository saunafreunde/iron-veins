import { describe, expect, it } from 'vitest';
import {
  hiddenActions,
  isInstalledApp,
  type DisplayEnvironment,
  type HiddenState,
} from '../../src/ui/background';

/**
 * What the game does when it is put away (D-277): save everywhere, pause only
 * in an installed app. The line between "installed app" and "browser tab" is
 * the part that would go wrong silently - a desktop player whose trains stop
 * every time they look at another window - so it is pinned case by case.
 */

const tab: DisplayEnvironment = {
  isDesktop: false,
  standalone: false,
  fullscreen: false,
  coarsePointer: false,
  referrer: '',
};

describe('an installed app, as opposed to a browser tab', () => {
  it('is not a desktop browser tab', () => {
    expect(isInstalledApp(tab)).toBe(false);
  });

  it('is not a phone browser tab either', () => {
    expect(isInstalledApp({ ...tab, coarsePointer: true })).toBe(false);
  });

  it('is never the Tauri desktop shell, whatever the display mode says', () => {
    expect(isInstalledApp({ ...tab, isDesktop: true, standalone: true })).toBe(false);
    expect(isInstalledApp({ ...tab, isDesktop: true, fullscreen: true, coarsePointer: true })).toBe(
      false,
    );
  });

  it('is a standalone launch', () => {
    expect(isInstalledApp({ ...tab, standalone: true })).toBe(true);
  });

  it('is the full-screen launch of the manifest on a touch screen', () => {
    expect(isInstalledApp({ ...tab, fullscreen: true, coarsePointer: true })).toBe(true);
  });

  it('is NOT a desktop browser in F11 full screen', () => {
    expect(isInstalledApp({ ...tab, fullscreen: true })).toBe(false);
  });

  it('is a Trusted Web Activity, which names itself in the referrer', () => {
    expect(isInstalledApp({ ...tab, referrer: 'android-app://de.levando.ironveins/' })).toBe(true);
    expect(isInstalledApp({ ...tab, referrer: 'https://example.test/' })).toBe(false);
  });
});

const running: HiddenState = {
  ready: true,
  replaying: false,
  autosave: true,
  installedApp: false,
  tick: 1_000,
  lastSavedTick: -1,
  speedIndex: 1,
};

describe('going into the background', () => {
  it('saves in a browser tab and keeps the clock running', () => {
    expect(hiddenActions(running)).toEqual({ save: true, pause: false });
  });

  it('saves and pauses in an installed app', () => {
    expect(hiddenActions({ ...running, installedApp: true })).toEqual({ save: true, pause: true });
  });

  it('does not pause what is already paused', () => {
    expect(hiddenActions({ ...running, installedApp: true, speedIndex: 0 }).pause).toBe(false);
  });

  it('does not save the same moment twice', () => {
    // Five app switches over a paused game would otherwise push five copies of
    // one tick through the autosave ring and the older autosaves out of it.
    expect(hiddenActions({ ...running, lastSavedTick: 1_000 }).save).toBe(false);
    expect(hiddenActions({ ...running, lastSavedTick: 999 }).save).toBe(true);
  });

  it('respects a player who turned autosaves off - and still pauses the app', () => {
    expect(hiddenActions({ ...running, autosave: false, installedApp: true })).toEqual({
      save: false,
      pause: true,
    });
  });

  it('does nothing before a world exists or while a recording plays', () => {
    const nothing = { save: false, pause: false };
    expect(hiddenActions({ ...running, ready: false, installedApp: true })).toEqual(nothing);
    expect(hiddenActions({ ...running, replaying: true, installedApp: true })).toEqual(nothing);
  });
});
