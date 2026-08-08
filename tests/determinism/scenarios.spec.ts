import { describe, expect, it } from 'vitest';
import { SHIPPED_SCENARIOS } from '../../src/scenarios/catalog';
import { newGameOptionsOf, type ShippedScenario } from '../../src/scenarios/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { TICKS_PER_YEAR } from '../../src/sim/constants';
import { worldParamsFor } from '../../src/sim/newGame';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The eight shipped scenarios as determinism fixtures (SPEC2 M17).
 *
 * SPEC2 asks for eight scenarios "die zugleich Determinismus-Fixtures sind",
 * and the acceptance sentence is that they end hash-identical in the
 * determinism run. That is what this file is: each scenario built twice from
 * its own definition, played a game year with no commands at all, and the two
 * world digests compared.
 *
 * Two things make it a fixture rather than a ritual:
 *
 *  - the world is built through `worldParamsFor(newGameOptionsOf(...))`, which
 *    is the SAME pair of functions the scenario browser starts a game through
 *    (`ui/scenarioStart.ts`) and the same one `SimWorker.restart` uses. A
 *    fixture that assembled the world itself would hash its own copy of the
 *    rules and stay green while the game started something else.
 *  - the run is a whole game year, so the monthly hooks, the industry clock,
 *    the yearly close, the competitors' own commands and the daily goal hook
 *    all take part. A world that is only generated and hashed proves the map
 *    generator deterministic and nothing else.
 *
 * The catalogue is walked rather than listed: a ninth scenario is covered the
 * day it is added, and the count below is what states that there are eight.
 */

const COMPANY = 'Iron Veins Reference Co.';
const COLOR_INDEX = 1;
const GAME_VERSION = 'determinism-test';

/** A game year: long enough that everything with a calendar has run once. */
const RUN_TICKS = TICKS_PER_YEAR;

function build(scenario: ShippedScenario): World {
  return World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, COLOR_INDEX)));
}

function play(scenario: ShippedScenario): World {
  const world = build(scenario);
  const queue = new CommandQueue();
  for (let tick = 0; tick < RUN_TICKS; tick++) world.step(queue, null);
  return world;
}

describe('the shipped scenarios are determinism fixtures', () => {
  const finals = new Map<string, string>();

  it('ships eight of them', () => {
    expect(SHIPPED_SCENARIOS).toHaveLength(8);
  });

  for (const scenario of SHIPPED_SCENARIOS) {
    it(`plays ${scenario.id} to the same hash twice`, () => {
      const first = play(scenario);
      const second = play(scenario);

      expect(first.tick).toBe(RUN_TICKS);
      expect(second.tick).toBe(RUN_TICKS);
      const hash = hashWorld(first);
      expect(hashWorld(second)).toBe(hash);

      // The goals are hashed state (D-193), so a scoreboard that moved between
      // two runs would have shown up in the digest above - this says which
      // half moved when it ever does.
      expect(second.goals.count).toBe(first.goals.count);
      for (let at = 0; at < first.goals.count; at++) {
        expect(second.goals.status[at]).toBe(first.goals.status[at]);
        expect(second.goals.progress[at]).toBe(first.goals.progress[at]);
      }

      finals.set(scenario.id, hash);
    });
  }

  it('reaches a different world in every one of them', () => {
    // Eight scenarios that hashed alike would be one scenario with eight
    // briefings - the "genuinely different" half of SPEC2's sentence, as a
    // number rather than as a promise.
    expect(finals.size).toBe(SHIPPED_SCENARIOS.length);
    expect(new Set(finals.values()).size).toBe(SHIPPED_SCENARIOS.length);
  });

  it('survives a save and a load in the middle of one', () => {
    // A scenario is a save with a briefing (D-194), so the world a scenario
    // starts has to travel the ordinary save path with its goals aboard.
    const scenario = SHIPPED_SCENARIOS[0]!;
    const world = play(scenario);
    const before = hashWorld(world);

    const loaded = decodeSave(encodeSave(world, new CommandQueue(), GAME_VERSION));
    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.goals.count).toBe(scenario.goals.length);

    const liveQueue = new CommandQueue();
    const loadedQueue = new CommandQueue();
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) {
      world.step(liveQueue, null);
      loaded.world.step(loadedQueue, null);
    }
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });
});
