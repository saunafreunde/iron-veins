import { setLocale, type Locale } from '../i18n';
import { readSettings, writeSettings } from '../platform/Storage';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings';
import { useSimStore } from './store';

/**
 * Settings, from disk to the screen and back.
 *
 * Applying a setting is deliberately not the same thing as storing it. Three
 * of them have an effect outside React - the locale lives in a module variable
 * in `src/i18n`, the UI scale is a CSS custom property, the colour-blind flag
 * is read by the renderer - and every one of those is a place where a value
 * can be stored and then silently not applied. `applySettings` is the single
 * function that closes that gap, and it runs on load as well as on change.
 */

/** Push a settings object into the places that are not React state. */
export function applySettings(settings: AppSettings): void {
  setLocale(settings.locale === 'en' ? 'en' : ('de' as Locale));

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScalePercent / 100));
    root.dataset['colorBlind'] = settings.colorBlind ? 'on' : 'off';
    root.lang = settings.locale;
  }
}

/** Read the settings at boot and put them everywhere they belong. */
export async function loadSettings(): Promise<void> {
  const settings = await readSettings();
  applySettings(settings);
  useSimStore.getState().setSettings(settings);
}

/**
 * Change one field.
 *
 * Written back on every change rather than on a save button: a settings screen
 * with an unsaved state is a settings screen people lose their work in, and
 * the file is a few hundred bytes.
 */
export function updateSettings(patch: Partial<AppSettings>): void {
  const store = useSimStore.getState();
  const next: AppSettings = { ...store.settings, ...patch };
  applySettings(next);
  store.setSettings(next);
  void writeSettings(next);
}

/** Set one channel of the mixer without disturbing the others. */
export function setVolume(channel: number, value: number): void {
  const current = useSimStore.getState().settings.volumes;
  const volumes = current.map((existing, index) => (index === channel ? value : existing));
  updateSettings({ volumes });
}

/** Route one news category without disturbing the others (SPEC2 M14). */
export function setNotificationMode(category: number, mode: number): void {
  const current = useSimStore.getState().settings.notifications;
  const notifications = current.map((existing, index) => (index === category ? mode : existing));
  updateSettings({ notifications });
}

export { DEFAULT_SETTINGS };
