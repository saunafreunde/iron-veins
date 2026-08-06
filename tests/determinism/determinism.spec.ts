import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';
import fixture from './fixtures/m0-commands.json';
import roadFixture from './fixtures/road-line-commands.json';
import {
  advance,
  createScenario,
  parseScenarioFixture,
  SCENARIO_COMPANY_NAME,
  SCENARIO_MAP_SIZE,
  type Scenario,
} from './runner';

/**
 * Section 19.3. This suite runs from M0 onwards and must never be red:
 * determinism cannot be repaired after the fact, because by the time a desync
 * is noticed there is no way to tell which of the last thousand commits caused
 * it. Same seed plus same command log must produce the same 64 bit state hash
 * three times in one process and once more after a save/load round trip.
 */

const SEED = 424_242;
const TOTAL_TICKS = 50_000;
const CHECKPOINTS = [1_000, 10_000, 50_000] as const;
const SAVE_AT_TICK = 10_000;
const GAME_VERSION = 'determinism-test';

const script = parseScenarioFixture(fixture);

function fullRun(seed: number): Record<number, string> {
  return advance(createScenario(seed, script), TOTAL_TICKS, CHECKPOINTS);
}

describe('determinism', () => {
  it('produces identical checkpoint hashes across three runs in one process', () => {
    const first = fullRun(SEED);
    const second = fullRun(SEED);
    const third = fullRun(SEED);

    expect(Object.keys(first)).toHaveLength(CHECKPOINTS.length);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('survives a save, load and continue in the middle of the run', () => {
    const reference = fullRun(SEED);

    const live = createScenario(SEED, script);
    const beforeSave = advance(live, SAVE_AT_TICK, CHECKPOINTS);
    expect(beforeSave[SAVE_AT_TICK]).toBe(reference[SAVE_AT_TICK]);

    const bytes = encodeSave(live.world, live.queue, GAME_VERSION);
    const loaded = decodeSave(bytes);
    expect(hashWorld(loaded.world)).toBe(reference[SAVE_AT_TICK]);

    const resumed: Scenario = { world: loaded.world, queue: loaded.queue };
    const afterLoad = advance(resumed, TOTAL_TICKS, CHECKPOINTS);
    expect(afterLoad[TOTAL_TICKS]).toBe(reference[TOTAL_TICKS]);
  });

  it('reaches the same state no matter how the ticks are batched', () => {
    // The scheduler runs 1 tick per frame at 1x and 20 at 20x. If batching
    // changed anything, replays recorded at one speed would not reproduce at
    // another.
    const single = createScenario(SEED, script);
    while (single.world.tick < TOTAL_TICKS) single.world.step(single.queue, null);

    const batched = createScenario(SEED, script);
    while (batched.world.tick < TOTAL_TICKS) {
      const target = Math.min(TOTAL_TICKS, batched.world.tick + 20);
      while (batched.world.tick < target) batched.world.step(batched.queue, null);
    }

    expect(hashWorld(batched.world)).toBe(hashWorld(single.world));
  });

  it('separates worlds that differ only in their seed', () => {
    const a = fullRun(SEED);
    const b = fullRun(SEED + 1);
    expect(b[TOTAL_TICKS]).not.toBe(a[TOTAL_TICKS]);
  });

  it('executes the whole recorded command log', () => {
    const scenario = createScenario(SEED, script);
    advance(scenario, TOTAL_TICKS, CHECKPOINTS);
    expect(scenario.queue.executedCount).toBe(script.length);
    expect(scenario.queue.pendingCount).toBe(0);
  });

  it('replays a stored command log into a fresh world', () => {
    const original = createScenario(SEED, script);
    advance(original, TOTAL_TICKS, CHECKPOINTS);

    const replayQueue = new CommandQueue();
    replayQueue.loadLog(original.queue.log, 0);
    const replayWorld = World.create({
      seed: SEED,
      difficulty: original.world.difficulty,
      climate: original.world.climate,
      mapSize: SCENARIO_MAP_SIZE,
      companyName: SCENARIO_COMPANY_NAME,
      companyColorIndex: 1,
    });
    while (replayWorld.tick < TOTAL_TICKS) replayWorld.step(replayQueue, null);

    expect(hashWorld(replayWorld)).toBe(hashWorld(original.world));
  });
});

/**
 * The richer scenario of SPEC2 M10: a bus line built, crewed, ordered and run
 * entirely from a recorded command log - roads, two stops, a depot, a vehicle
 * and its orders. Recorded from a played save via tools/record-fixture.mjs,
 * which is why every command in it went through `parseCommand` twice: once on
 * the way into the save, once on the way out of the fixture.
 */
const ROAD_TOTAL_TICKS = 20_000;
const ROAD_CHECKPOINTS = [2_000, 10_000, 20_000] as const;

const roadScript = parseScenarioFixture(roadFixture);

describe('determinism - recorded road line', () => {
  it('reaches beyond the four kinds the runner used to know', () => {
    // The point of reusing the save parser: a fixture can carry construction.
    // If this shrinks, the fixture stopped exercising what it was recorded for.
    const kinds = new Set(roadScript.map((entry) => entry.command.kind));
    for (const kind of [
      CommandKind.BuildRoad,
      CommandKind.BuildRoadStop,
      CommandKind.BuyRoadVehicle,
      CommandKind.SetVehicleOrders,
      CommandKind.SetVehicleRunning,
      CommandKind.SetAutoRenew,
    ]) {
      expect(kinds, `fixture carries command kind ${kind}`).toContain(kind);
    }
  });

  it('produces identical checkpoint hashes across two runs, with the line alive', () => {
    const first = advance(createScenario(SEED, roadScript), ROAD_TOTAL_TICKS, ROAD_CHECKPOINTS);
    const live = createScenario(SEED, roadScript);
    const second = advance(live, ROAD_TOTAL_TICKS, ROAD_CHECKPOINTS);

    expect(Object.keys(first)).toHaveLength(ROAD_CHECKPOINTS.length);
    expect(second).toEqual(first);

    // Guards against fixture rot: cross-run equality alone would stay green if
    // every build command were suddenly rejected and the fixture replayed an
    // empty plain. The world at the end must contain the line that was
    // recorded - and a vehicle that has EARNED proves it actually drove.
    expect(live.queue.executedCount).toBe(roadScript.length);
    expect(live.queue.pendingCount).toBe(0);
    expect(live.world.stations.length).toBeGreaterThanOrEqual(2);
    expect(live.world.vehicles.alive[0]).toBe(1);
    expect(live.world.vehicles.orders[0]!.length).toBe(2);
    expect(live.world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(live.world.cargoLinks.links.length).toBeGreaterThan(0);
  });

  it('survives a save, load and continue in the middle of the run', () => {
    const reference = advance(
      createScenario(SEED, roadScript),
      ROAD_TOTAL_TICKS,
      ROAD_CHECKPOINTS,
    );

    const live = createScenario(SEED, roadScript);
    const beforeSave = advance(live, ROAD_CHECKPOINTS[1], ROAD_CHECKPOINTS);
    expect(beforeSave[ROAD_CHECKPOINTS[1]]).toBe(reference[ROAD_CHECKPOINTS[1]]);

    const bytes = encodeSave(live.world, live.queue, GAME_VERSION);
    const loaded = decodeSave(bytes);
    expect(hashWorld(loaded.world)).toBe(reference[ROAD_CHECKPOINTS[1]]);

    const resumed: Scenario = { world: loaded.world, queue: loaded.queue };
    const afterLoad = advance(resumed, ROAD_TOTAL_TICKS, ROAD_CHECKPOINTS);
    expect(afterLoad[ROAD_TOTAL_TICKS]).toBe(reference[ROAD_TOTAL_TICKS]);
  });
});
