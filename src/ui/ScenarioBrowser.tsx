import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import type { ShippedScenario } from '../scenarios/types';
import { startScenario } from './scenarioStart';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The scenario browser of SPEC2 M17: the eight shipped scenarios, what each
 * one asks for, and the button that starts it.
 *
 * **The catalogue is loaded dynamically and that is a budget decision, not a
 * style one** (D-191/D-192). The eight briefings are two languages of prose
 * apiece and the definitions reach `src/sim` for their goal vocabulary; a
 * static import would put all of it in the entry chunk, which is measured
 * against 930,000 B by `tests/unit/bundleBudget.spec.ts`. What stays here is
 * the panel, and what travels with the data is everything the panel needs to
 * DISPLAY - the calendar years of the medal bands come out of the catalogue
 * already converted, so no sim module has to be reachable from this file.
 *
 * The briefing and the goal captions do NOT go through `t()`. They are content
 * belonging to the scenario, carried in both languages by the definition (and
 * by the metadata block of a `.ironscenario`, D-194), so that a scenario
 * somebody else writes carries its own words. Everything around them - the
 * headings, the medal names, the rule labels - is interface chrome and goes
 * through `t()` like the rest of the game.
 */

interface Catalogue {
  readonly scenarios: readonly ShippedScenario[];
  readonly yearOf: (tick: number) => number;
}

/** Rule flags worth a line on the card, with the key that names each one. */
const RULE_LABELS: readonly {
  readonly key: string;
  readonly read: (scenario: ShippedScenario) => boolean;
}[] = [
  { key: 'ui.newGame.inflation', read: (s) => s.rules.inflation },
  { key: 'ui.newGame.emissions', read: (s) => s.rules.emissions },
  { key: 'ui.newGame.occupancyPenalty', read: (s) => s.rules.occupancyPenalty },
  { key: 'ui.newGame.signalPenalty', read: (s) => s.rules.signalPenalty },
  { key: 'ui.newGame.roadCongestion', read: (s) => s.rules.roadCongestion },
];

const DIFFICULTY_KEYS = ['ui.newGame.easy', 'ui.newGame.normal', 'ui.newGame.hard'] as const;
const CLIMATE_KEYS = [
  'ui.newGame.temperate',
  'ui.newGame.arctic',
  'ui.newGame.tropical',
  'ui.newGame.desert',
] as const;

/** The world rules this scenario switches on, or the word for "none". */
function ruleSummary(scenario: ShippedScenario): string {
  const on = RULE_LABELS.filter((rule) => rule.read(scenario)).map((rule) => t(rule.key));
  return on.length === 0 ? t('ui.scenario.rules.none') : on.join(', ');
}

export function ScenarioBrowser({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  const locale = useSimStore((s) => s.locale);
  const companyName = useSimStore((s) => s.companyName);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('../scenarios/catalog').then((module) => {
      if (cancelled) return;
      setCatalogue({ scenarios: module.SHIPPED_SCENARIOS, yearOf: module.scenarioYearOf });
      setSelectedId(module.SHIPPED_SCENARIOS[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenarios = catalogue?.scenarios ?? [];
  const selected = scenarios.find((entry) => entry.id === selectedId) ?? null;

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.scenario.title')}</h2>
      <p className="panel__hint">{t('ui.scenario.intro')}</p>

      <div className="button-row">
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>

      {catalogue === null ? (
        <p className="panel__hint">{t('ui.scenario.loading')}</p>
      ) : (
        <div className="button-row">
          {scenarios.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selectedId ? 'button button--active' : 'button'}
              onClick={() => setSelectedId(entry.id)}
            >
              {entry.title}
            </button>
          ))}
        </div>
      )}

      {selected !== null && catalogue !== null && (
        <>
          <h3 className="panel__title">{selected.title}</h3>
          <p className="row__meta">
            {t('ui.scenario.by', { author: selected.author })} ·{' '}
            {t('ui.scenario.span', {
              from: catalogue.yearOf(selected.fromTick + 1),
              to: catalogue.yearOf(selected.toTick),
            })}
          </p>

          {/* Content, not chrome: the scenario's own words in the player's
              language, straight out of the definition. */}
          <p>{selected.briefing[locale]}</p>

          <p className="row__meta">
            {t('ui.scenario.map', {
              size: selected.rules.mapSize,
              seed: selected.rules.seed,
              climate: t(CLIMATE_KEYS[selected.rules.climate] ?? CLIMATE_KEYS[0]),
              difficulty: t(DIFFICULTY_KEYS[selected.rules.difficulty] ?? DIFFICULTY_KEYS[1]),
              competitors: selected.rules.aiCompanies,
            })}
          </p>
          <p className="row__meta">{t('ui.scenario.rules', { rules: ruleSummary(selected) })}</p>

          <ul className="saves">
            {selected.goals.map((goal, index) => (
              <li key={index} className="saves__row">
                <span className="saves__text">
                  <span className="saves__name">{goal.caption[locale]}</span>
                  {/* The bands are the DESCRIPTOR's, which is hashed world
                      state - the briefing may describe them, the descriptor is
                      what decides them (D-193). */}
                  <span className="row__meta">
                    {t('ui.scenario.bands', {
                      gold: catalogue.yearOf(goal.spec.goldTick),
                      silver: catalogue.yearOf(goal.spec.silverTick),
                      bronze: catalogue.yearOf(goal.spec.bronzeTick),
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="button-row">
            <button
              type="button"
              className="button button--active"
              onClick={() => {
                startScenario(
                  client,
                  selected,
                  companyName === '' ? t('ui.defaultCompanyName') : companyName,
                  companyColorIndex,
                );
              }}
            >
              {t('ui.scenario.start')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
