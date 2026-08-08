import { beforeEach, describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { SHIPPED_SCENARIOS } from '../../src/scenarios/catalog';
import { newGameOptionsOf } from '../../src/scenarios/types';
import type { NewGameOptions } from '../../src/shared/protocol';
import { worldParamsFor } from '../../src/sim/newGame';
import { startScenario, type ScenarioStarter } from '../../src/ui/scenarioStart';
import { useSimStore } from '../../src/ui/store';

/**
 * Starting all eight from the browser (SPEC2 M17's acceptance sentence:
 * "acht Szenarien im Browser starten").
 *
 * Driven through the store and a recording client, the way the other interface
 * tests in this suite are (`replayTheatre.spec.ts`): the panel is a list, a
 * briefing and one button, and what that button DOES is `startScenario` -
 * which is a plain function precisely so that this test drives the same code
 * the player does rather than a re-implementation of it.
 */

class RecordingClient implements ScenarioStarter {
  readonly started: NewGameOptions[] = [];
  /** What the real client does first, and what the order below depends on. */
  newGame(options: NewGameOptions): void {
    useSimStore.getState().resetWorld();
    this.started.push(options);
  }
}

const COMPANY = 'Szenariobahn';
const COLOR = 3;

beforeEach(() => {
  const store = useSimStore.getState();
  store.setActiveScenario(null);
  store.setOverlay(null);
});

describe('the scenario browser starts a scenario', () => {
  it('starts every one of the eight, with that scenario’s own rules and goals', () => {
    const client = new RecordingClient();

    for (const scenario of SHIPPED_SCENARIOS) {
      useSimStore.getState().setOverlay('scenarios');
      const options = startScenario(client, scenario, COMPANY, COLOR);

      // What left for the worker is the scenario, whole.
      expect(options.seed, scenario.id).toBe(scenario.rules.seed);
      expect(options.mapSize, scenario.id).toBe(scenario.rules.mapSize);
      expect(options.climate, scenario.id).toBe(scenario.rules.climate);
      expect(options.difficulty, scenario.id).toBe(scenario.rules.difficulty);
      expect(options.aiCompanies, scenario.id).toBe(scenario.rules.aiCompanies);
      expect(options.inflation, scenario.id).toBe(scenario.rules.inflation);
      expect(options.emissions, scenario.id).toBe(scenario.rules.emissions);
      expect(options.occupancyPenalty, scenario.id).toBe(scenario.rules.occupancyPenalty);
      expect(options.signalPenalty, scenario.id).toBe(scenario.rules.signalPenalty);
      expect(options.roadCongestion, scenario.id).toBe(scenario.rules.roadCongestion);
      expect(options.goals, scenario.id).toEqual(scenario.goals.map((goal) => goal.spec));

      // ... and the player is still the player: a scenario states the world,
      // never who is playing it.
      expect(options.companyName, scenario.id).toBe(COMPANY);
      expect(options.companyColorIndex, scenario.id).toBe(COLOR);

      // The screen closed and the game knows which scenario it is in.
      const state = useSimStore.getState();
      expect(state.overlay, scenario.id).toBeNull();
      expect(state.activeScenario, scenario.id).toEqual({
        id: scenario.id,
        title: scenario.title,
      });
    }

    expect(client.started).toHaveLength(SHIPPED_SCENARIOS.length);
  });

  it('sets the identity AFTER the world reset, not before it', () => {
    // `SimClient.newGame` resets the world, and the reset clears the running
    // scenario (a stale title over a plain new game would be a lie). Setting
    // the new identity first would therefore lose it - which is invisible in
    // every test that does not order the two.
    const client = new RecordingClient();
    startScenario(client, SHIPPED_SCENARIOS[0]!, COMPANY, COLOR);
    expect(useSimStore.getState().activeScenario?.id).toBe(SHIPPED_SCENARIOS[0]!.id);
  });

  it('lets a plain new game leave the scenario behind', () => {
    const client = new RecordingClient();
    startScenario(client, SHIPPED_SCENARIOS[1]!, COMPANY, COLOR);
    expect(useSimStore.getState().activeScenario).not.toBeNull();

    useSimStore.getState().resetWorld();
    expect(useSimStore.getState().activeScenario).toBeNull();
  });

  it('hands the worker parameters a world can actually be created from', () => {
    // The browser's options and the worker's world parameters are one mapping
    // (`worldParamsFor`), and the determinism fixtures use it too. Checking it
    // here keeps the three honest without generating eight maps.
    for (const scenario of SHIPPED_SCENARIOS) {
      const params = worldParamsFor(newGameOptionsOf(scenario, COMPANY, COLOR));
      expect(params.seed, scenario.id).toBe(scenario.rules.seed);
      expect(params.goals, scenario.id).toHaveLength(scenario.goals.length);
      expect(params.companyName, scenario.id).toBe(COMPANY);
    }
  });
});

describe('the browser’s own chrome', () => {
  it('has a sentence in both catalogues for everything it prints', () => {
    const keys = [
      'ui.menu.scenarios',
      'ui.scenario.title',
      'ui.scenario.intro',
      'ui.scenario.loading',
      'ui.scenario.by',
      'ui.scenario.span',
      'ui.scenario.map',
      'ui.scenario.rules',
      'ui.scenario.rules.none',
      'ui.scenario.bands',
      'ui.scenario.start',
    ] as const;
    for (const key of keys) {
      expect(de[key], key).toBeTruthy();
      expect(en[key], key).toBeTruthy();
    }
  });

  it('keeps the briefings OUT of the translation catalogues', () => {
    // The distinction the milestone rests on: chrome is translated through
    // t(), content travels with the scenario. A briefing that had been copied
    // into de.json would make a scenario somebody else writes untranslatable,
    // and this is the check that says so out loud.
    const catalogue = JSON.stringify(de) + JSON.stringify(en);
    for (const scenario of SHIPPED_SCENARIOS) {
      expect(catalogue, scenario.id).not.toContain(scenario.briefing.de);
      expect(catalogue, scenario.id).not.toContain(scenario.briefing.en);
      for (const goal of scenario.goals) {
        expect(catalogue, scenario.id).not.toContain(goal.caption.de);
        expect(catalogue, scenario.id).not.toContain(goal.caption.en);
      }
    }
  });
});
