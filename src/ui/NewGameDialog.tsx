import { useState, type ReactElement } from 'react';
import { t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import type { NewGameOptions } from '../shared/protocol';
import {
  COMPANY_COLOR_COUNT,
  DEFAULT_MAP_SIZE,
  Difficulty,
  MAP_SIZES,
  MAX_AI_COMPANIES,
  MapClimate,
  WeatherRule,
} from '../sim/constants';
import { useSimStore } from './store';

/**
 * The new-game screen: the game RULES of section 17's options menu.
 *
 * These are not settings. Every one of them changes what the world does, is
 * written into the save and is part of the state hash - which is why they are
 * chosen once, here, and cannot be moved afterwards. Two worlds with the same
 * seed and the same choices are the same world; a mid-game toggle would break
 * that promise silently.
 */

const DIFFICULTIES: readonly { readonly value: Difficulty; readonly key: string }[] = [
  { value: Difficulty.Easy, key: 'ui.newGame.easy' },
  { value: Difficulty.Normal, key: 'ui.newGame.normal' },
  { value: Difficulty.Hard, key: 'ui.newGame.hard' },
];

const CLIMATES: readonly { readonly value: MapClimate; readonly key: string }[] = [
  { value: MapClimate.Temperate, key: 'ui.newGame.temperate' },
  { value: MapClimate.Arctic, key: 'ui.newGame.arctic' },
  { value: MapClimate.Tropical, key: 'ui.newGame.tropical' },
  { value: MapClimate.Desert, key: 'ui.newGame.desert' },
];

/**
 * The weather rule of SPEC2 M18 (E-01). Three choices rather than a checkbox,
 * because "off" and "on" are not what the rule offers - a mild climate and a
 * harsh one are different worlds, and both are different from no weather.
 */
const WEATHERS: readonly { readonly value: WeatherRule; readonly key: string }[] = [
  { value: WeatherRule.Off, key: 'ui.newGame.weatherOff' },
  { value: WeatherRule.Mild, key: 'ui.newGame.weatherMild' },
  { value: WeatherRule.Harsh, key: 'ui.newGame.weatherHarsh' },
];

/** A fresh seed. Main-thread randomness is fine: it becomes world state. */
function rollSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

export function NewGameDialog({
  onStart,
  onCancel,
}: {
  readonly onStart: (options: NewGameOptions) => void;
  readonly onCancel: (() => void) | null;
}): ReactElement {
  useSimStore((s) => s.locale);

  const [seed, setSeed] = useState(rollSeed);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Normal);
  const [climate, setClimate] = useState<MapClimate>(MapClimate.Temperate);
  const [mapSize, setMapSize] = useState<number>(DEFAULT_MAP_SIZE);
  const [companyName, setCompanyName] = useState(() => t('ui.defaultCompanyName'));
  const [companyColorIndex, setColorIndex] = useState(1);
  const [inflation, setInflation] = useState(true);
  const [emissions, setEmissions] = useState(true);
  // The two 8.4 route-cost rules of M15 start OFF, unlike the two above. Every
  // balancing band in the game was measured without them, and a rule that is
  // on by default is a rule nobody chose (SPEC2 Fehlerkatalog 34).
  const [occupancyPenalty, setOccupancyPenalty] = useState(false);
  const [signalPenalty, setSignalPenalty] = useState(false);
  const [roadCongestion, setRoadCongestion] = useState(false);
  const [elections, setElections] = useState(false);
  const [economy, setEconomy] = useState(false);
  // And the weather rule of M18, off for the same reason: every band in the
  // game was measured by a world without weather.
  const [weather, setWeather] = useState<WeatherRule>(WeatherRule.Off);
  const [aiCompanies, setAiCompanies] = useState(2);
  // The scenario workshop of SPEC2 M22. It rides on THIS screen rather than on
  // one of its own because a workshop world is chosen exactly like a game
  // world - seed, size, climate, every rule - and the map an author shapes has
  // to be a map the game can play. What the flag adds is who is allowed to ask
  // for what (D-240): funds and ownership stop refusing, and nothing else does.
  const [editorMode, setEditorMode] = useState(false);

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.newGame.title')}</h2>

      <label className="field">
        <span className="field__label">{t('ui.newGame.companyName')}</span>
        <input
          className="list__search"
          value={companyName}
          maxLength={40}
          onChange={(event) => setCompanyName(event.target.value)}
        />
      </label>

      <span className="field__label field__label--spaced">{t('ui.newGame.colour')}</span>
      <div className="button-row">
        {COMPANY_COLORS.slice(0, COMPANY_COLOR_COUNT).map((colour, index) => (
          <button
            key={colour}
            type="button"
            aria-label={t('ui.newGame.colourIndex', { index: index + 1 })}
            aria-pressed={index === companyColorIndex}
            className={index === companyColorIndex ? 'swatch swatch--active' : 'swatch'}
            style={{ background: colour }}
            onClick={() => setColorIndex(index)}
          />
        ))}
      </div>

      <span className="field__label field__label--spaced">{t('ui.newGame.mapSize')}</span>
      <div className="button-row">
        {MAP_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={size === mapSize ? 'button button--active' : 'button'}
            onClick={() => setMapSize(size)}
          >
            {size}
          </button>
        ))}
      </div>

      <span className="field__label field__label--spaced">{t('ui.newGame.difficulty')}</span>
      <div className="button-row">
        {DIFFICULTIES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={entry.value === difficulty ? 'button button--active' : 'button'}
            onClick={() => setDifficulty(entry.value)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>

      <span className="field__label field__label--spaced">{t('ui.newGame.climate')}</span>
      <div className="button-row">
        {CLIMATES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={entry.value === climate ? 'button button--active' : 'button'}
            onClick={() => setClimate(entry.value)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>

      <span className="field__label field__label--spaced">{t('ui.newGame.weather')}</span>
      <div className="button-row">
        {WEATHERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={entry.value === weather ? 'button button--active' : 'button'}
            onClick={() => setWeather(entry.value)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>
      <p className="panel__hint">{t('ui.newGame.weatherHint')}</p>

      <span className="field__label field__label--spaced">{t('ui.newGame.competitors')}</span>
      <div className="button-row">
        {Array.from({ length: MAX_AI_COMPANIES + 1 }, (_unused, count) => (
          <button
            key={count}
            type="button"
            className={count === aiCompanies ? 'button button--active' : 'button'}
            onClick={() => setAiCompanies(count)}
          >
            {count}
          </button>
        ))}
      </div>

      <label className="panel__hint">
        <input
          type="checkbox"
          checked={inflation}
          onChange={(event) => setInflation(event.target.checked)}
        />{' '}
        {t('ui.newGame.inflation')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={emissions}
          onChange={(event) => setEmissions(event.target.checked)}
        />{' '}
        {t('ui.newGame.emissions')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={occupancyPenalty}
          onChange={(event) => setOccupancyPenalty(event.target.checked)}
        />{' '}
        {t('ui.newGame.occupancyPenalty')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={signalPenalty}
          onChange={(event) => setSignalPenalty(event.target.checked)}
        />{' '}
        {t('ui.newGame.signalPenalty')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={roadCongestion}
          onChange={(event) => setRoadCongestion(event.target.checked)}
        />{' '}
        {t('ui.newGame.roadCongestion')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={elections}
          onChange={(event) => setElections(event.target.checked)}
        />{' '}
        {t('ui.newGame.elections')}
      </label>
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={economy}
          onChange={(event) => setEconomy(event.target.checked)}
        />{' '}
        {t('ui.newGame.economy')}
      </label>

      <label className="panel__hint">
        <input
          type="checkbox"
          checked={editorMode}
          onChange={(event) => setEditorMode(event.target.checked)}
        />{' '}
        {t('ui.newGame.editorMode')}
      </label>
      {editorMode && <p className="panel__hint">{t('ui.newGame.editorModeHint')}</p>}

      <label className="field">
        <span className="field__label">{t('ui.newGame.seed')}</span>
        <div className="button-row">
          <input
            className="list__search"
            inputMode="numeric"
            value={String(seed)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setSeed(Number.isFinite(parsed) ? Math.abs(parsed) >>> 0 : 0);
            }}
          />
          <button type="button" className="button" onClick={() => setSeed(rollSeed())}>
            {t('ui.newGame.reroll')}
          </button>
        </div>
      </label>

      <div className="button-row">
        <button
          type="button"
          className="button button--active"
          disabled={companyName.trim().length === 0}
          onClick={() =>
            onStart({
              seed,
              difficulty,
              climate,
              mapSize,
              companyName: companyName.trim(),
              companyColorIndex,
              inflation,
              emissions,
              occupancyPenalty,
              signalPenalty,
              roadCongestion,
              weather,
              elections,
              economy,
              aiCompanies,
              editorMode,
            })
          }
        >
          {t('ui.newGame.start')}
        </button>
        {onCancel !== null && (
          <button type="button" className="button" onClick={onCancel}>
            {t('ui.cancel')}
          </button>
        )}
      </div>
    </section>
  );
}
