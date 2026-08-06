import { useState, type ReactElement } from 'react';
import { LOCALES, t } from '../i18n';
import { UI_SCALES, VOLUME_CHANNEL_KEYS } from '../shared/settings';
import { KEY_BINDINGS } from './keymap';
import { setVolume, updateSettings } from './settings';
import { useSimStore } from './store';

/**
 * The options menu of section 20: graphics, audio, accessibility, controls.
 *
 * The game RULES the milestone also names are not here - they belong to a
 * world, not to a player, and they are chosen on the new-game screen. Putting
 * them in the same menu as the volume sliders would suggest they can be
 * changed mid-game, and they cannot: they are part of the state hash.
 */

type Tab = 'display' | 'audio' | 'access' | 'controls';

const TABS: readonly { readonly id: Tab; readonly key: string }[] = [
  { id: 'display', key: 'ui.options.display' },
  { id: 'audio', key: 'ui.options.audio' },
  { id: 'access', key: 'ui.options.accessibility' },
  { id: 'controls', key: 'ui.options.controls' },
];

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

      {tab === 'controls' && (
        <>
          <p className="panel__hint">{t('ui.options.controlsHint')}</p>
          <ul className="keylist">
            {KEY_BINDINGS.map((binding) => (
              <li key={binding.descriptionKey}>
                <kbd className="key">{binding.display}</kbd>
                <span>{t(binding.descriptionKey)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="button-row">
        <button type="button" className="button button--active" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>
    </section>
  );
}
