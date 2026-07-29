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
  const [aiCompanies, setAiCompanies] = useState(2);

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
              aiCompanies,
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
