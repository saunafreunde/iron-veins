import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld } from '../../src/sim/World';
import fixture from './fixtures/takt-commands.json';
import { advance, createScenario, parseScenarioFixture, type Scenario } from './runner';

/**
 * The timetable commands of section 12.3 under the determinism lens (SPEC2
 * M11 Stage C): a recorded bus line gets a takt with a start offset, its
 * first station becomes a transfer node, and the takt is re-gridded mid-run.
 * Both new kinds travel through the one shared parser; the run is held to
 * cross-run hash equality, to zero rejections, and to a save/load/continue
 * round trip across the v24 format - and the takt has to provably BITE
 * (vehicles observed waiting for a slot), because a fixture whose commands
 * change nothing would replay equality between two worlds that never
 * exercised the feature.
 */

const SEED = 424_242;
const TOTAL_TICKS = 20_000;
const CHECKPOINTS = [2_000, 10_000, 20_000] as const;
const GAME_VERSION = 'takt-commands-test';

const script = parseScenarioFixture(fixture);

function advanceWatching(
  scenario: Scenario,
  toTick: number,
  checkpoints: readonly number[],
): { hashes: Record<number, string>; rejections: number; slotWaitTicks: number } {
  const wanted = new Set(checkpoints);
  const hashes: Record<number, string> = {};
  let rejections = 0;
  let slotWaitTicks = 0;
  while (scenario.world.tick < toTick) {
    scenario.world.step(scenario.queue, (_envelope, outcome) => {
      if (!outcome.ok) rejections++;
    });
    const vehicles = scenario.world.vehicles;
    for (let id = 0; id < vehicles.count; id++) {
      if (vehicles.alive[id] === 1 && vehicles.state[id] === VehicleState.WaitingForSlot) {
        slotWaitTicks++;
      }
    }
    if (wanted.has(scenario.world.tick)) {
      hashes[scenario.world.tick] = hashWorld(scenario.world);
    }
  }
  return { hashes, rejections, slotWaitTicks };
}

describe('determinism - the 12.3 timetable commands', () => {
  it('exercises both new command kinds through the shared parser', () => {
    const kinds = new Set(script.map((entry) => entry.command.kind));
    expect(kinds).toContain(CommandKind.SetLineTakt);
    expect(kinds).toContain(CommandKind.SetTransferNode);
  });

  it('produces identical checkpoint hashes across two runs, with the takt biting', () => {
    const first = advanceWatching(createScenario(SEED, script), TOTAL_TICKS, CHECKPOINTS);
    const live = createScenario(SEED, script);
    const second = advanceWatching(live, TOTAL_TICKS, CHECKPOINTS);

    expect(Object.keys(first.hashes)).toHaveLength(CHECKPOINTS.length);
    expect(second.hashes).toEqual(first.hashes);
    expect(first.rejections).toBe(0);
    expect(live.queue.executedCount).toBe(script.length);

    const world = live.world;
    // The re-grid of tick 12,000 is what the line ends the run on.
    expect(world.lines.taktTicks[0]).toBe(3_000);
    expect(world.lines.taktOffsetTicks[0]).toBe(0);
    expect(world.stations[0]!.transferNode).toBe(true);
    // The takt genuinely held vehicles at their platforms...
    expect(first.slotWaitTicks).toBeGreaterThan(0);
    expect(second.slotWaitTicks).toBe(first.slotWaitTicks);
    // ...and the line still worked: both buses EARNED under the timetable.
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
