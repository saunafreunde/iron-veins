import { useEffect, useState, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { bindingFromEvent } from '../shared/keybindings';
import {
  NOTIFICATION_CATEGORY_COUNT,
  NOTIFICATION_MODE_COUNT,
  NOTIFICATION_MODE_KEYS,
  UI_SCALES,
  VOLUME_CHANNEL_KEYS,
} from '../shared/settings';
import { NEWS_CATEGORY_KEYS } from '../sim/news/log';
import {
  defaultBindings,
  displayBinding,
  keyAction,
  rebindAction,
  resolveBindings,
  KEY_ACTIONS,
  type KeyActionId,
} from './keymap';
import { setNotificationMode, setVolume, updateSettings } from './settings';
import { useSimStore } from './store';

/**
 * The options menu of section 20: graphics, audio, accessibility, controls.
 *
 * The game RULES the milestone also names are not here - they belong to a
 * world, not to a player, and they are chosen on the new-game screen. Putting
 * them in the same menu as the volume sliders would suggest they can be
 * changed mid-game, and they cannot: they are part of the state hash.
 */

type Tab = 'display' | 'audio' | 'notify' | 'access' | 'controls';

const TABS: readonly { readonly id: Tab; readonly key: string }[] = [
  { id: 'display', key: 'ui.options.display' },
  { id: 'audio', key: 'ui.options.audio' },
  { id: 'notify', key: 'ui.options.notifications' },
  { id: 'access', key: 'ui.options.accessibility' },
  { id: 'controls', key: 'ui.options.controls' },
];

/**
 * The controls tab, and the one screen in the game that LISTENS for a key
 * instead of acting on it (SPEC2 M25).
 *
 * Capturing is a mode with exactly one row in it: while a row is armed the
 * whole window's keydown belongs to this panel, so a rebinding cannot fire the
 * action it is about to replace. Escape cancels rather than binds - it is the
 * one fixed binding (keymap.ts) and it is what a player presses when they
 * change their mind.
 *
 * A conflict is REFUSED and named. The alternative - unbinding whatever sat
 * there - would leave the player believing both keys still worked, which is
 * Fehlerkatalog 30's "partial" mistake in another currency.
 */
function ControlsTab(): ReactElement {
  const bindings = useSimStore((s) => s.settings.keyBindings);
  const [capturing, setCapturing] = useState<KeyActionId | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const resolved = resolveBindings(bindings);

  useEffect(() => {
    if (capturing === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const binding = bindingFromEvent(event);
      // A bare modifier press is not an attempt at anything - stay armed.
      if (binding === null) return;

      const result = rebindAction(bindings, capturing, binding);
      if (result.ok) {
        updateSettings({ keyBindings: result.overrides });
        setConflict(null);
        setCapturing(null);
        return;
      }
      setConflict(
        result.reason === 'conflict'
          ? t('ui.options.rebindConflict', {
              action: t(keyAction(result.conflictWith)?.descriptionKey ?? ''),
            })
          : t('ui.options.rebindFixed'),
      );
      setCapturing(null);
    };
    // Capture phase: the application's own handler is on the window too, and
    // the whole point is that it must not see this press.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, bindings]);

  return (
    <>
      <p className="panel__hint">{t('ui.options.controlsHint')}</p>
      {conflict !== null && (
        <p className="panel__hint panel__hint--warning" role="alert">
          {conflict}
        </p>
      )}
      <ul className="keylist">
        {KEY_ACTIONS.map((action) => (
          <li key={action.id}>
            {action.fixed === true ? (
              <kbd className="key">{displayBinding(resolved[action.id])}</kbd>
            ) : (
              <button
                type="button"
                className={capturing === action.id ? 'key key--capturing' : 'key'}
                aria-label={`${t(action.descriptionKey)} — ${t('ui.options.rebind')}`}
                onClick={() => {
                  setConflict(null);
                  setCapturing(action.id);
                }}
              >
                {capturing === action.id
                  ? t('ui.options.rebindPress')
                  : resolved[action.id] === undefined
                    ? t('ui.options.rebindUnbound')
                    : displayBinding(resolved[action.id])}
              </button>
            )}
            <span>{t(action.descriptionKey)}</span>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            setConflict(null);
            setCapturing(null);
            updateSettings({ keyBindings: defaultBindings() });
          }}
        >
          {t('ui.options.rebindReset')}
        </button>
      </div>
    </>
  );
}

export function OptionsPanel({ onClose }: { readonly onClose: () => void }): ReactElement {
  useSimStore((s) => s.locale);
  const settings = useSimStore((s) => s.settings);
  const [tab, setTab] = useState<Tab>('display');

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.options.title')}</h2>

      <div className="button-row" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === tab}
            className={entry.id === tab ? 'button button--active' : 'button'}
            onClick={() => setTab(entry.id)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>

      {tab === 'display' && (
        <>
          <span className="field__label field__label--spaced">{t('ui.options.language')}</span>
          <div className="button-row">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                className={code === settings.locale ? 'button button--active' : 'button'}
                onClick={() => updateSettings({ locale: code })}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="field__label field__label--spaced">{t('ui.options.uiScale')}</span>
          <div className="button-row">
            {UI_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={scale === settings.uiScalePercent ? 'button button--active' : 'button'}
                onClick={() => updateSettings({ uiScalePercent: scale })}
              >
                {scale} %
              </button>
            ))}
          </div>
          <p className="panel__hint">{t('ui.options.uiScaleHint')}</p>

          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.dayNight}
              onChange={(event) => updateSettings({ dayNight: event.target.checked })}
            />{' '}
            {t('ui.options.dayNight')}
          </label>
          <p className="panel__hint">{t('ui.options.dayNightHint')}</p>
        </>
      )}

      {tab === 'audio' && (
        <>
          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.audioEnabled}
              onChange={(event) => updateSettings({ audioEnabled: event.target.checked })}
            />{' '}
            {t('ui.options.audioEnabled')}
          </label>

          {VOLUME_CHANNEL_KEYS.map((key, channel) => (
            <label key={key} className="field">
              <span className="field__label">
                {t(key)} — {Math.round((settings.volumes[channel] ?? 0) * 100)} %
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((settings.volumes[channel] ?? 0) * 100)}
                disabled={!settings.audioEnabled}
                onChange={(event) => setVolume(channel, Number(event.target.value) / 100)}
              />
            </label>
          ))}
          <p className="panel__hint">{t('ui.options.musicHint')}</p>
        </>
      )}

      {tab === 'notify' && (
        <>
          <p className="panel__hint">{t('ui.options.notificationsHint')}</p>
          {/* One row per news category (section 15): where do its fresh
              entries go - nowhere, the ticker, a toast card, or a toast plus
              pause (SPEC2 M14). The log itself is untouched either way. */}
          {NEWS_CATEGORY_KEYS.slice(0, NOTIFICATION_CATEGORY_COUNT).map((categoryKey, category) => (
            <div key={categoryKey}>
              <span className="field__label field__label--spaced">{t(categoryKey)}</span>
              <div className="button-row">
                {NOTIFICATION_MODE_KEYS.slice(0, NOTIFICATION_MODE_COUNT).map((modeKey, mode) => (
                  <button
                    key={modeKey}
                    type="button"
                    className={
                      (settings.notifications[category] ?? 0) === mode
                        ? 'button button--active'
                        : 'button'
                    }
                    onClick={() => setNotificationMode(category, mode)}
                  >
                    {t(modeKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="panel__hint">{t('ui.options.notifyPauseHint')}</p>
        </>
      )}

      {tab === 'access' && (
        <>
          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.colorBlind}
              onChange={(event) => updateSettings({ colorBlind: event.target.checked })}
            />{' '}
            {t('ui.options.colorBlind')}
          </label>
          <p className="panel__hint">{t('ui.options.colorBlindHint')}</p>

          {/* Reduced motion (SPEC2 M25). Beside the colour-blind switch
              because it answers the same kind of question: what the world
              looks like, never what it does. */}
          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => updateSettings({ reducedMotion: event.target.checked })}
            />{' '}
            {t('ui.options.reducedMotion')}
          </label>
          <p className="panel__hint">{t('ui.options.reducedMotionHint')}</p>

          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.autosave}
              onChange={(event) => updateSettings({ autosave: event.target.checked })}
            />{' '}
            {t('ui.options.autosave')}
          </label>

          <label className="panel__hint">
            <input
              type="checkbox"
              checked={settings.offerTutorial}
              onChange={(event) => updateSettings({ offerTutorial: event.target.checked })}
            />{' '}
            {t('ui.options.offerTutorial')}
          </label>
        </>
      )}

      {tab === 'controls' && <ControlsTab />}

      <div className="button-row">
        <button type="button" className="button button--active" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>
    </section>
  );
}
