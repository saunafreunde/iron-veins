import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { Cargo } from '../../src/sim/cargo/types';
import { WaypointKind } from '../../src/sim/map/waypoints';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import {
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
} from '../../src/sim/vehicles/VehicleStore';
import { hashWorld } from '../../src/sim/World';
import fixture from './fixtures/order-grammar-commands.json';
import { advance, createScenario, parseScenarioFixture, type Scenario } from './runner';

/**
 * The order grammar of section 12.1 under the determinism lens (SPEC2 M11
 * Stage A): a fixture whose schedules use EVERY new order option - waypoint
 * and depot targets, voll_beliebig, nur_transfer, erzwungen, a per-order
 * refit, a minimum dwell, and one conditional jump of every condition kind -
 * plus the two waypoint build commands, replayed to cross-run hash equality
 * and across a v24 save/load round trip.
 *
 * The fixture shares the road-line fixture's geography (seed 424,242, the
 * same road run), so its build commands are known-good; the zero-rejections
 * assertion below is what keeps that true when the map generator or the
 * validation ever moves.
 */

const SEED = 424_242;
const TOTAL_TICKS = 20_000;
const CHECKPOINTS = [2_000, 10_000, 20_000] as const;
const GAME_VERSION = 'order-grammar-test';

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

describe('determinism - the 12.1 order grammar', () => {
  it('exercises every new order option and both waypoint commands', () => {
    const kinds = new Set(script.map((entry) => entry.command.kind));
    expect(kinds).toContain(CommandKind.BuildWaypoint);
    expect(kinds).toContain(CommandKind.DemolishWaypoint);

    const orders = script
      .filter((entry) => entry.command.kind === CommandKind.SetVehicleOrders)
      .flatMap((entry) =>
        entry.command.kind === CommandKind.SetVehicleOrders ? [...entry.command.orders] : [],
      );

    const targets = new Set(orders.map((order) => order.target));
    expect(targets).toContain(OrderTarget.Waypoint);
    expect(targets).toContain(OrderTarget.Depot);

    const loads = new Set(orders.map((order) => order.load));
    expect(loads).toContain(OrderLoad.Full);
    expect(loads).toContain(OrderLoad.FullAny);

    const unloads = new Set(orders.map((order) => order.unload));
    expect(unloads).toContain(OrderUnload.TransferOnly);
    expect(unloads).toContain(OrderUnload.Forced);

    expect(orders.some((order) => (order.refitTo ?? -1) >= 0)).toBe(true);
    expect(orders.some((order) => (order.waitTicks ?? 0) > 0)).toBe(true);

    const conditions = new Set(orders.map((order) => order.condKind ?? OrderConditionKind.None));
    for (const kind of [
      OrderConditionKind.LoadPercent,
      OrderConditionKind.Reliability,
      OrderConditionKind.AgeYears,
      OrderConditionKind.WaitingDays,
      OrderConditionKind.DateYear,
    ]) {
      expect(conditions, `fixture carries condition kind ${kind}`).toContain(kind);
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
    // The marker survived, the demolished one did not.
    expect(world.map.waypoint[41 * 128 + 103]).toBe(WaypointKind.Road);
    expect(world.map.waypoint[41 * 128 + 100]).toBe(WaypointKind.None);
    // Both vehicles genuinely drove their schedules: the bus through its
    // waypoint, the mail van through its per-order refit.
    expect(world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(world.vehicles.earnedCt[1]!).toBeGreaterThan(0);
    expect(world.vehicles.refitCargo[1]).toBe(Cargo.Passengers);
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
