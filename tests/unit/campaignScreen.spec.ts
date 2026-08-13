import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SCENARIOS,
  CAMPAIGN_STAGES,
  campaignPrerequisitesOf,
  isCampaignStageUnlocked,
  unlockedCampaignStages,
} from '../../src/scenarios/campaign';
import { SHIPPED_SCENARIOS } from '../../src/scenarios/catalog';
import type { NewGameOptions } from '../../src/shared/protocol';
import { GoalMedal } from '../../src/sim/goals/types';
import {
  startCampaignStage,
  startScenario,
  type ScenarioStarter,
} from '../../src/ui/scenarioStart';
import { useSimStore } from '../../src/ui/store';

/**
 * Starting all twelve from the campaign screen, and booking what they finish
 * (SPEC2 M24's acceptance sentence: "die Kampagne umfasst zwoelf freischaltbare
 * Szenarien", D-254).
 *
 * Driven through the store and a recording client, the way
 * `scenarioBrowser.spec.ts` drives the eight: the screen is a list, a briefing
 * and one button, and what that button DOES is `startCampaignStage` - a plain
 * function precisely so a test drives the same code the player does rather than
 * a re-implementation of it. Two source audits hold the screens to that
 * function, because a panel that built its own options would pass every
 * assertion below while starting something else.
 */

class RecordingClient implements ScenarioStarter {
  readonly started: NewGameOptions[] = [];
  newGame(options: NewGameOptions): void {
    useSimStore.getState().resetWorld();
    this.started.push(options);
  }
}

const COMPANY = 'Kampagnenbahn';
const COLOR = 2;

function sourceOf(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../src/ui/${file}`, import.meta.url)), 'utf8');
}

beforeEach(() => {
  const store = useSimStore.getState();
  store.setActiveScenario(null);
  store.setActiveCampaignStage(null);
  store.setOverlay(null);
});

describe('the campaign screen starts a stage', () => {
  it('starts every one of the twelve, with that stage’s own rules and goals', () => {
    const client = new RecordingClient();

    for (const scenario of CAMPAIGN_SCENARIOS) {
      useSimStore.getState().setOverlay('campaign');
      const options = startCampaignStage(client, scenario, COMPANY, COLOR);

      expect(options.seed, scenario.id).toBe(scenario.rules.seed);
      expect(options.mapSize, scenario.id).toBe(scenario.rules.mapSize);
      expect(options.climate, scenario.id).toBe(scenario.rules.climate);
      expect(options.difficulty, scenario.id).toBe(scenario.rules.difficulty);
      // The two rules a campaign stage cannot do without: the era it plays in
      // and the ground it plays on (D-245, D-247). A stage that lost either on
      // the way to the worker would be a different world under the same text.
      expect(options.startYear, scenario.id).toBe(scenario.rules.startYear);
      expect(options.mapgen, scenario.id).toEqual(scenario.rules.mapgen);
      expect(options.aiCompanies, scenario.id).toBe(scenario.rules.aiCompanies);
      expect(options.inflation, scenario.id).toBe(scenario.rules.inflation);
      expect(options.emissions, scenario.id).toBe(scenario.rules.emissions);
      expect(options.occupancyPenalty, scenario.id).toBe(scenario.rules.occupancyPenalty);
      expect(options.signalPenalty, scenario.id).toBe(scenario.rules.signalPenalty);
      expect(options.roadCongestion, scenario.id).toBe(scenario.rules.roadCongestion);
      expect(options.weather, scenario.id).toBe(scenario.rules.weather);
      expect(options.elections, scenario.id).toBe(scenario.rules.elections);
      expect(options.economy, scenario.id).toBe(scenario.rules.economy);
      expect(options.goals, scenario.id).toEqual(scenario.goals.map((goal) => goal.spec));

      expect(options.companyName, scenario.id).toBe(COMPANY);
      expect(options.companyColorIndex, scenario.id).toBe(COLOR);

      const state = useSimStore.getState();
      expect(state.overlay, scenario.id).toBeNull();
      expect(state.activeScenario, scenario.id).toEqual({
        id: scenario.id,
        title: scenario.title,
      });
      expect(state.activeCampaignStageId, scenario.id).toBe(scenario.id);
    }

    expect(client.started).toHaveLength(CAMPAIGN_SCENARIOS.length);
  });

  it('sets the stage identity AFTER the world reset, not before it', () => {
    // `resetWorld` clears the running stage, so an identity set before the
    // reset would be wiped and every completion would be booked against null.
    const client = new RecordingClient();
    useSimStore.getState().setActiveCampaignStage('eisenadern-12');
    startCampaignStage(client, CAMPAIGN_SCENARIOS[0]!, COMPANY, COLOR);
    expect(useSimStore.getState().activeCampaignStageId).toBe('eisenadern-01');
  });

  it('books nothing for a stage started from the ordinary scenario browser', () => {
    // The whole reason `startCampaignStage` exists beside `startScenario`:
    // playing a campaign world out of the browser is a game, not a campaign
    // run, and it must not advance the chain.
    const client = new RecordingClient();
    startScenario(client, CAMPAIGN_SCENARIOS[0]!, COMPANY, COLOR);
    expect(useSimStore.getState().activeCampaignStageId).toBeNull();
  });

  it('is the ONLY door the screen uses', () => {
    // The audit under the assertions above: a screen that assembled
    // `NewGameOptions` itself would start a world nothing here has checked.
    const screen = sourceOf('CampaignScreen.tsx');
    expect(screen).toContain('startCampaignStage(');
    expect(screen).not.toContain('newGameOptionsOf');
    expect(screen).not.toContain('client.newGame');
  });
});

describe('the end screen books a campaign completion', () => {
  it('books only a WIN, and books the verdict the simulation reached', () => {
    // The source half, because the booking itself needs a rendered component:
    // the effect is guarded on `GameEnd.Won` and hands `end.medal` through
    // untouched - nothing about a campaign completion is decided in the
    // interface (D-196).
    const screen = sourceOf('GameEndScreen.tsx');
    expect(screen).toContain('completeCampaignStage(stageId, end.medal)');
    expect(screen).toContain('end.reason !== GameEnd.Won');
  });

  it('keeps the best medal a stage was ever finished with', () => {
    const store = useSimStore.getState();
    store.completeCampaignStage('eisenadern-01', GoalMedal.Silver);
    expect(useSimStore.getState().campaignCompleted['eisenadern-01']).toBe(GoalMedal.Silver);
    store.completeCampaignStage('eisenadern-01', GoalMedal.Bronze);
    expect(useSimStore.getState().campaignCompleted['eisenadern-01']).toBe(GoalMedal.Silver);
    store.completeCampaignStage('eisenadern-01', GoalMedal.Gold);
    expect(useSimStore.getState().campaignCompleted['eisenadern-01']).toBe(GoalMedal.Gold);
    useSimStore.setState({ campaignCompleted: {} });
  });

  it('survives the world reset that clears the running stage', () => {
    // Progress is the PROFILE's, the running stage is the WORLD's: a reset
    // takes the second and never the first.
    const store = useSimStore.getState();
    store.completeCampaignStage('eisenadern-01', GoalMedal.Gold);
    store.setActiveCampaignStage('eisenadern-02');
    useSimStore.getState().resetWorld();
    expect(useSimStore.getState().activeCampaignStageId).toBeNull();
    expect(useSimStore.getState().campaignCompleted['eisenadern-01']).toBe(GoalMedal.Gold);
    useSimStore.setState({ campaignCompleted: {} });
  });
});

describe('the chain can be played from end to end', () => {
  it('reaches all twelve, each one unlocked at the moment it is started', () => {
    // The acceptance sentence as a run rather than as a graph property: begin
    // with nothing completed, always take the first stage that is open and not
    // yet done, start it through the real function, book it, and repeat. If the
    // graph had an unreachable stage or a cycle this loop would stop short.
    const client = new RecordingClient();
    const completed = new Set<string>();
    const played: string[] = [];

    for (let step = 0; step < CAMPAIGN_STAGES.length; step++) {
      const next = unlockedCampaignStages(completed).find((id) => !completed.has(id));
      expect(next, `step ${step}: nothing left to play`).toBeDefined();
      const scenario = CAMPAIGN_SCENARIOS.find((one) => one.id === next)!;

      expect(isCampaignStageUnlocked(scenario.id, completed), `${scenario.id} was locked`).toBe(
        true,
      );
      for (const needed of campaignPrerequisitesOf(scenario.id)) {
        expect(completed.has(needed), `${scenario.id} needs ${needed}`).toBe(true);
      }

      startCampaignStage(client, scenario, COMPANY, COLOR);
      expect(useSimStore.getState().activeCampaignStageId).toBe(scenario.id);
      completed.add(scenario.id);
      played.push(scenario.id);
    }

    expect(played).toHaveLength(CAMPAIGN_STAGES.length);
    expect(new Set(played).size).toBe(CAMPAIGN_STAGES.length);
    expect(played[0]).toBe('eisenadern-01');
    expect(played[played.length - 1]).toBe('eisenadern-12');
    expect(client.started).toHaveLength(CAMPAIGN_STAGES.length);
  });

  it('keeps the campaign ids out of the eight shipped scenarios', () => {
    // Two catalogues, one browser each, and no id shared between them: an id
    // in both would make `scenarioById` and `campaignScenarioById` disagree
    // about what a saved identity means.
    const shipped = new Set(SHIPPED_SCENARIOS.map((one) => one.id));
    for (const scenario of CAMPAIGN_SCENARIOS) {
      expect(shipped.has(scenario.id), scenario.id).toBe(false);
    }
  });
});
