import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { scheduleOf } from '../../src/sim/lines/LineStore';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld } from '../../src/sim/World';
import fixture from './fixtures/line-commands.json';
import { advance, createScenario, parseScenarioFixture, type Scenario } from './runner';

/**
 * The line commands of section 12.2 under the determinism lens (SPEC2 M11
 * Stage B): a fixture that opens two lines, deletes one, crews the other
 * with two buses, flips its per-line auto-renewal, EDITS the shared list
 * while both vehicles are driving - the same-tick switch plus the re-anchor
 * rule, live - and finally releases one vehicle onto its private copy. All
 * five commands travel through the one shared parser, replayed to cross-run
 * hash equality and across a v24 save/load round trip.
 *
 * The fixture shares the road-line fixture's geography (seed 424,242), so
 * its build commands are known-good; the zero-rejections assertion is what
 * keeps that true when the map generator or the validation ever moves.
 */

const SEED = 424_242;
const TOTAL_TICKS = 20_000;
const CHECKPOINTS = [2_000, 10_000, 20_000] as const;
const GAME_VERSION = 'line-commands-test';

const script = parseScenarioFixture(fixture);

/** Advance while counting rejected commands - a rejection is fixture rot. */
function advanceCounting(
  scenario: Scenario,
  toTick: number,
  checkpoints: readonly number[],
): { hashes: Record<number, string>; rejections: number } {
  const wanted = new Set(checkpoints);
  const hashes: Record<number, string> = {};
  let rejections = 0;
  while (scenario.world.tick < toTick) {
    scenario.world.step(scenario.queue, (_envelope, outcome) => {
      if (!outcome.ok) rejections++;
    });
    if (wanted.has(scenario.world.tick)) {
      hashes[scenario.world.tick] = hashWorld(scenario.world);
    }
  }
  return { hashes, rejections };
}

describe('determinism - the 12.2 line commands', () => {
  it('exercises every line command through the shared parser', () => {
    const kinds = new Set(script.map((entry) => entry.command.kind));
    for (const kind of [
      CommandKind.CreateLine,
      CommandKind.DeleteLine,
      CommandKind.SetLineOrders,
      CommandKind.AssignVehicleToLine,
      CommandKind.ReleaseVehicleFromLine,
      CommandKind.SetAutoRenew,
    ]) {
      expect(kinds, `fixture carries command kind ${kind}`).toContain(kind);
    }
  });

  it('produces identical checkpoint hashes across two runs, with the line alive', () => {
    const first = advanceCounting(createScenario(SEED, script), TOTAL_TICKS, CHECKPOINTS);
    const live = createScenario(SEED, script);
    const second = advanceCounting(live, TOTAL_TICKS, CHECKPOINTS);

    expect(Object.keys(first.hashes)).toHaveLength(CHECKPOINTS.length);
    expect(second.hashes).toEqual(first.hashes);

    // Not one command of the fixture may be refused: a rejected build is a
    // world that still hashes equally across runs while replaying nothing.
    expect(first.rejections).toBe(0);
    expect(live.queue.executedCount).toBe(script.length);
    expect(live.queue.pendingCount).toBe(0);

    const world = live.world;
    // Line 0 survived with its edited schedule and its renewal flag; line 1
    // was deleted and its slot is dead.
    expect(world.lines.isAlive(0)).toBe(true);
    expect(world.lines.orders[0]).toHaveLength(2);
    expect(world.lines.orders[0]![0]!.targetId).toBe(1);
    expect(world.lines.autoRenew[0]).toBe(1);
    expect(world.lines.isAlive(1)).toBe(false);

    // Vehicle 0 still runs the line; vehicle 1 was released onto a private
    // copy of the edited list - and both genuinely drove and EARNED.
    expect(world.vehicles.lineId[0]).toBe(0);
    expect(world.vehicles.lineId[1]).toBe(-1);
    expect(scheduleOf(world, 0)).toBe(world.lines.orders[0]);
    expect(world.vehicles.orders[1]).toHaveLength(2);
    expect(world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(world.vehicles.earnedCt[1]!).toBeGreaterThan(0);
  });

  it('survives a save, load and continue in the middle of the run', () => {
    const reference = advance(createScenario(SEED, script), TOTAL_TICKS, CHECKPOINTS);

    const live = createScenario(SEED, script);
    const beforeSave = advance(live, CHECKPOINTS[1], CHECKPOINTS);
    expect(beforeSave[CHECKPOINTS[1]]).toBe(reference[CHECKPOINTS[1]]);

    const bytes = encodeSave(live.world, live.queue, GAME_VERSION);
    const loaded = decodeSave(bytes);
    expect(hashWorld(loaded.world)).toBe(reference[CHECKPOINTS[1]]);

    const resumed: Scenario = { world: loaded.world, queue: loaded.queue };
    const afterLoad = advance(resumed, TOTAL_TICKS, CHECKPOINTS);
    expect(afterLoad[TOTAL_TICKS]).toBe(reference[TOTAL_TICKS]);
  });
});
