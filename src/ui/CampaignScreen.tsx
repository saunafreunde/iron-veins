import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import type { CampaignStage } from '../scenarios/campaign';
import type { ShippedScenario } from '../scenarios/types';
import { MEDAL_KEYS } from './goalText';
import { startCampaignStage } from './scenarioStart';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The campaign "Eisenadern" (SPEC2 M24): twelve stages, what each one asks for,
 * and which of them are open.
 *
 * The sibling of `ScenarioBrowser`, and deliberately built the same way: the
 * catalogue is loaded DYNAMICALLY (D-191/D-192 - twelve briefings in two
 * languages reaching `src/sim` for their goal vocabulary would otherwise sit in
 * the entry chunk, which is measured against a budget), the briefing and the
 * goal captions do NOT go through `t()` because they are content rather than
 * chrome, and everything the panel needs to DISPLAY travels with the data.
 *
 * The one thing this screen owns that the browser does not is the CHAIN. Which
 * stages are open is `unlockedCampaignStages` over the completed set in the
 * store, so the screen never decides it itself; and a locked stage shows the
 * stages it is waiting for by name rather than a padlock, because a campaign
 * that will not say what it wants is a campaign nobody finishes.
 */

interface Catalogue {
  readonly scenarios: readonly ShippedScenario[];
  readonly stages: readonly CampaignStage[];
  readonly title: string;
  readonly unlocked: (completed: ReadonlySet<string>) => readonly string[];
  readonly prerequisitesOf: (id: string) => readonly string[];
  readonly yearOf: (tick: number, startYear: number) => number;
}

const DIFFICULTY_KEYS = ['ui.newGame.easy', 'ui.newGame.normal', 'ui.newGame.hard'] as const;
const CLIMATE_KEYS = [
  'ui.newGame.temperate',
  'ui.newGame.arctic',
  'ui.newGame.tropical',
  'ui.newGame.desert',
] as const;

export function CampaignScreen({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  const locale = useSimStore((s) => s.locale);
  const companyName = useSimStore((s) => s.companyName);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const completed = useSimStore((s) => s.campaignCompleted);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('../scenarios/campaign').then((module) => {
      if (cancelled) return;
      setCatalogue({
        scenarios: module.CAMPAIGN_SCENARIOS,
        stages: module.CAMPAIGN_STAGES,
        title: module.CAMPAIGN_TITLE,
        unlocked: module.unlockedCampaignStages,
        prerequisitesOf: module.campaignPrerequisitesOf,
        yearOf: (tick, startYear) => module.scenarioYearOf(tick, startYear),
      });
      setSelectedId(module.CAMPAIGN_SCENARIOS[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenarios = catalogue?.scenarios ?? [];
  const done = new Set(Object.keys(completed));
  const open = new Set(catalogue?.unlocked(done) ?? []);
  const selected = scenarios.find((entry) => entry.id === selectedId) ?? null;
  const titleOf = (id: string): string => scenarios.find((one) => one.id === id)?.title ?? id;

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{catalogue?.title ?? t('ui.campaign.title')}</h2>
      <p className="panel__hint">{t('ui.campaign.intro')}</p>

      <div className="button-row">
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>

      {catalogue === null ? (
        <p className="panel__hint">{t('ui.campaign.loading')}</p>
      ) : (
        <>
          <p className="row__meta">
            {t('ui.campaign.progress', { done: done.size, of: scenarios.length })}
          </p>
          <ul className="saves">
            {scenarios.map((entry, at) => {
              const medal = completed[entry.id];
              const state =
                medal !== undefined
                  ? t('ui.campaign.done', { medal: t(MEDAL_KEYS[medal] ?? MEDAL_KEYS[0]) })
                  : open.has(entry.id)
                    ? t('ui.campaign.open')
                    : t('ui.campaign.needs', {
                        stages: catalogue
                          .prerequisitesOf(entry.id)
                          .map((one) => titleOf(one))
                          .join(', '),
                      });
              return (
                <li key={entry.id} className="saves__row">
                  <button
                    type="button"
                    className={entry.id === selectedId ? 'button button--active' : 'button'}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    {t('ui.campaign.stage', { number: at + 1, title: entry.title })}
                  </button>
                  <span className="saves__text">
                    <span className="row__meta">
                      {t('ui.campaign.year', { year: entry.rules.startYear })} · {state}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected !== null && catalogue !== null && (
        <>
          <h3 className="panel__title">{selected.title}</h3>
          <p className="row__meta">
            {t('ui.scenario.by', { author: selected.author })} ·{' '}
            {t('ui.scenario.span', {
              from: catalogue.yearOf(selected.fromTick + 1, selected.rules.startYear),
              to: catalogue.yearOf(selected.toTick, selected.rules.startYear),
            })}
          </p>

          {/* Content, not chrome: the stage's own words in the player's
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
          <p className="row__meta">
            {t('ui.campaign.unlocks', {
              stages:
                catalogue.stages
                  .find((stage) => stage.id === selected.id)
                  ?.unlocks.map((one) => titleOf(one))
                  .join(', ') || t('ui.campaign.unlocks.none'),
            })}
          </p>

          <ul className="saves">
            {selected.goals.map((goal, index) => (
              <li key={index} className="saves__row">
                <span className="saves__text">
                  <span className="saves__name">{goal.caption[locale]}</span>
                  <span className="row__meta">
                    {t('ui.scenario.bands', {
                      gold: catalogue.yearOf(goal.spec.goldTick, selected.rules.startYear),
                      silver: catalogue.yearOf(goal.spec.silverTick, selected.rules.startYear),
                      bronze: catalogue.yearOf(goal.spec.bronzeTick, selected.rules.startYear),
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
              disabled={!open.has(selected.id)}
              onClick={() => {
                startCampaignStage(
                  client,
                  selected,
                  companyName === '' ? t('ui.defaultCompanyName') : companyName,
                  companyColorIndex,
                );
              }}
            >
              {t('ui.campaign.start')}
            </button>
          </div>
          {!open.has(selected.id) && <p className="panel__hint">{t('ui.campaign.lockedHint')}</p>}
        </>
      )}
    </section>
  );
}
