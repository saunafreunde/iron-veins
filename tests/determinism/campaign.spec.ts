import { describe, expect, it } from 'vitest';
import { CAMPAIGN_SCENARIOS } from '../../src/scenarios/campaign';
import { newGameOptionsOf, type ShippedScenario } from '../../src/scenarios/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { TICKS_PER_YEAR } from '../../src/sim/constants';
import { worldParamsFor } from '../../src/sim/newGame';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The twelve campaign stages as determinism fixtures (SPEC2 M24, D-254).
 *
 * The same file the eight of M17 have (`tests/determinism/scenarios.spec.ts`),
 * for the same two reasons and with the same shape - which is the point: a
 * campaign stage is an ordinary shipped scenario, so it is a fixture the same
 * way and through the same pair of functions the campaign screen starts it
 * with. A fixture that assembled its own world would hash its own copy of the
 * rules and stay green while the game started something else.
 *
 * What is new here is the SPREAD: the twelve span four start years, four
 * climates and all five generator presets, so this is the first file in the
 * project that plays a 1850 world, a 1880 world and a 1920 world a game year
 * each and asserts they are reproducible. The era rules of D-245 and the
 * generator rules of D-247 travel through `newGameOptionsOf` on this path and
 * nowhere else.
 */

const COMPANY = 'Iron Veins Reference Co.';
const COLOR_INDEX = 1;
const GAME_VERSION = 'determinism-test';

/** A game year: long enough that everything with a calendar has run once. */
const RUN_TICKS = TICKS_PER_YEAR;

function play(scenario: ShippedScenario): World {
  const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, COLOR_INDEX)));
  const queue = new CommandQueue();
  for (let tick = 0; tick < RUN_TICKS; tick++) world.step(queue, null);
  return world;
}

describe('the campaign stages are determinism fixtures', () => {
  const finals = new Map<string, string>();

  it('ships twelve of them', () => {
    expect(CAMPAIGN_SCENARIOS).toHaveLength(12);
  });

  for (const scenario of CAMPAIGN_SCENARIOS) {
    it(`plays ${scenario.id} to the same hash twice`, () => {
      const first = play(scenario);
      const second = play(scenario);

      expect(first.tick).toBe(RUN_TICKS);
      expect(second.tick).toBe(RUN_TICKS);
      const hash = hashWorld(first);
      expect(hashWorld(second)).toBe(hash);

      // The world's own first year is a hashed rule since D-245, so a stage
      // that lost its start year on the way in would hash differently AND
      // print a different calendar - this says which half moved when it does.
      expect(first.startYear).toBe(scenario.rules.startYear);
      expect(second.date.year).toBe(scenario.rules.startYear + 1);

      // The goals are hashed state (D-193).
      expect(second.goals.count).toBe(first.goals.count);
      for (let at = 0; at < first.goals.count; at++) {
        expect(second.goals.status[at]).toBe(first.goals.status[at]);
        expect(second.goals.progress[at]).toBe(first.goals.progress[at]);
      }

      finals.set(scenario.id, hash);
    });
  }

  it('reaches a different world in every one of them', () => {
    // Twelve stages that hashed alike would be one stage with twelve
    // briefings - "genuinely different" as a number rather than a promise.
    expect(finals.size).toBe(CAMPAIGN_SCENARIOS.length);
    expect(new Set(finals.values()).size).toBe(CAMPAIGN_SCENARIOS.length);
  });

  it('survives a save and a load in the middle of an 1850 stage', () => {
    // The era rules are the ones a save round trip could lose, so the stage
    // this is taken on is deliberately the earliest one.
    const scenario = CAMPAIGN_SCENARIOS[0]!;
    expect(scenario.rules.startYear).toBe(1850);
    const world = play(scenario);
    const before = hashWorld(world);

    const loaded = decodeSave(encodeSave(world, new CommandQueue(), GAME_VERSION));
    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.startYear).toBe(1850);
    expect(loaded.world.mapgen).toEqual(scenario.rules.mapgen);
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
