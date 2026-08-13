import type { NewGameOptions } from '../shared/protocol';
import { newGameOptionsOf, type ShippedScenario } from '../scenarios/types';
import { useSimStore } from './store';

/**
 * Starting a shipped scenario (SPEC2 M17).
 *
 * Deliberately a plain function rather than something the browser component
 * keeps to itself: this is the whole of what pressing "Starten" does, and a
 * test can drive it exactly as the panel does. What it must NOT be is a second
 * way to build a world - it hands `newGameOptionsOf` to the ordinary new-game
 * message, so the scenario the player starts and the world the determinism
 * suite hashes are built by one function from one definition.
 *
 * The one thing this adds to a new game is the scenario's IDENTITY in the
 * store. The goals travel in the message and become hashed world state; the
 * title is presentation and stays here (D-110's split, applied to content).
 */

/** The part of `SimClient` starting a scenario needs. */
export interface ScenarioStarter {
  newGame(options: NewGameOptions): void;
}

export function startScenario(
  client: ScenarioStarter,
  scenario: ShippedScenario,
  companyName: string,
  companyColorIndex: number,
): NewGameOptions {
  const options = newGameOptionsOf(scenario, companyName, companyColorIndex);
  const store = useSimStore.getState();
  // `newGame` resets the world, and the reset clears whatever scenario was
  // running - so the new identity has to be set AFTER it, never before.
  client.newGame(options);
  store.setActiveScenario({ id: scenario.id, title: scenario.title });
  store.setOverlay(null);
  return options;
}

/**
 * Starting one stage of the campaign (SPEC2 M24, D-254).
 *
 * `startScenario` and one more line, and the line is the whole difference: a
 * campaign stage is booked as a completion when its world is WON, and a stage
 * started from the ordinary scenario browser must not be. Everything else - the
 * options, the world, the goals - is identical, because a campaign stage IS a
 * shipped scenario.
 */
export function startCampaignStage(
  client: ScenarioStarter,
  scenario: ShippedScenario,
  companyName: string,
  companyColorIndex: number,
): NewGameOptions {
  const options = startScenario(client, scenario, companyName, companyColorIndex);
  useSimStore.getState().setActiveCampaignStage(scenario.id);
  return options;
}
