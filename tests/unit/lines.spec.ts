import { describe, expect, it } from 'vitest';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import { MAX_LINES, TICKS_PER_DAY } from '../../src/sim/constants';
import { scheduleOf } from '../../src/sim/lines/LineStore';
import { lineRoundTicks, lineStations, lineVehicles } from '../../src/sim/lines/metrics';
import {
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
} from '../../src/sim/vehicles/VehicleStore';
import {
  apply,
  buildBusLine,
  flatScenario,
  makeTown,
  tryApply,
  twoTownScenario,
  SCENARIO_SIZE,
  type TwoTownScenario,
} from '../balance/scenario';

/**
 * The Line entity of section 12.2 (SPEC2 M11 Stage B): a shared, live order
 * list, the re-anchor rule, the private copy on release, and the per-line
 * auto-renewal ownership rules - each of them the exact acceptance sentence
 * of the milestone, not a paraphrase.
 */

const BUS = 200;

/** Two towns, a road, two stops, a depot, two buses on private schedules. */
function scenarioWithBuses(): TwoTownScenario {
  const scenario = twoTownScenario(1_200, 24);
  buildBusLine(scenario, BUS, 2);
  return scenario;
}

/**
 * The same world WITH a competitor company, so "not yours" is a refusal a
 * test can actually observe - in a one-company world an unknown issuer falls
 * back to the player and every ownership check would pass vacuously.
 */
function scenarioWithRival(): TwoTownScenario {
  const y = SCENARIO_SIZE >> 1;
  const townA = makeTown(0, (SCENARIO_SIZE - 24) >> 1, y, 1_200, 'Westheim');
  const townB = makeTown(1, ((SCENARIO_SIZE - 24) >> 1) + 24, y, 1_200, 'Ostheim');
  const scenario = { ...flatScenario(SCENARIO_SIZE, [townA, townB], [], 1, 1), townA, townB };
  buildBusLine(scenario, BUS, 2);
  return scenario;
}

/** The classic A-B schedule as line orders. */
function abOrders(scenario: TwoTownScenario): {
  target: number;
  targetId: number;
  load: number;
  unload: number;
}[] {
  return [
    {
      target: OrderTarget.Station,
      targetId: scenario.world.stations[0]!.id,
      load: OrderLoad.Partial,
      unload: OrderUnload.All,
    },
    {
      target: OrderTarget.Station,
      targetId: scenario.world.stations[1]!.id,
      load: OrderLoad.Partial,
      unload: OrderUnload.All,
    },
  ];
}

/** Create line 0 with the A-B schedule and put both buses on it. */
function sharedLine(scenario: TwoTownScenario): void {
  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, { kind: CommandKind.SetLineOrders, lineId: 0, orders: abOrders(scenario) });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 1, lineId: 0 });
}

describe('the line commands', () => {
  it('creates, fills and deletes a line through the ordinary queue', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;

    expect(world.lines.isAlive(0)).toBe(true);
    expect(world.lines.ownerId[0]).toBe(0);
    expect(world.lines.orders[0]).toHaveLength(2);
    expect(lineVehicles(world, 0)).toEqual([0, 1]);

    apply(scenario, { kind: CommandKind.DeleteLine, lineId: 0 });
    expect(world.lines.isAlive(0)).toBe(false);
    expect(world.vehicles.lineId[0]).toBe(-1);
    expect(world.vehicles.lineId[1]).toBe(-1);
  });

  it('refuses foreign lines, unknown lines and a full store', () => {
    const scenario = scenarioWithRival();
    sharedLine(scenario);

    expect(tryApply(scenario, { kind: CommandKind.DeleteLine, lineId: 7 })).toBe(
      RejectReason.NoSuchLine,
    );
    // Company 1 does not own line 0 - and may not touch it.
    expect(tryApply(scenario, { kind: CommandKind.DeleteLine, lineId: 0 }, 1)).toBe(
      RejectReason.NotYours,
    );
    expect(tryApply(scenario, { kind: CommandKind.SetLineOrders, lineId: 0, orders: [] }, 1)).toBe(
      RejectReason.NotYours,
    );
    expect(
      tryApply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 }, 1),
    ).toBe(RejectReason.NotYours);

    for (let i = 1; i < MAX_LINES; i++) {
      apply(scenario, { kind: CommandKind.CreateLine });
    }
    expect(tryApply(scenario, { kind: CommandKind.CreateLine })).toBe(RejectReason.TooManyLines);
  });

  it('reuses the lowest freed slot, so ids survive a save round trip', () => {
    const scenario = scenarioWithBuses();
    apply(scenario, { kind: CommandKind.CreateLine });
    apply(scenario, { kind: CommandKind.CreateLine });
    apply(scenario, { kind: CommandKind.CreateLine });
    apply(scenario, { kind: CommandKind.DeleteLine, lineId: 1 });
    apply(scenario, { kind: CommandKind.CreateLine });

    const world = scenario.world;
    expect(world.lines.isAlive(1)).toBe(true);
    expect(world.lines.count).toBe(3);
  });

  it('releasing a vehicle that runs no line is refused by name', () => {
    const scenario = scenarioWithBuses();
    expect(tryApply(scenario, { kind: CommandKind.ReleaseVehicleFromLine, vehicleId: 0 })).toBe(
      RejectReason.NothingToDo,
    );
  });
});

describe('the shared, live order list', () => {
  it('switches every vehicle of the line to an edited list in the same tick', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;

    // Both vehicles read the very same array, and both run the A-B schedule.
    expect(scheduleOf(world, 0)).toBe(world.lines.orders[0]);
    expect(scheduleOf(world, 1)).toBe(world.lines.orders[0]);

    // The edit lands in ONE command - and in the tick it executes, both
    // vehicles are already reading the new list. No per-vehicle propagation,
    // no next-stop delay: they share the array (the Stage B acceptance
    // sentence).
    const reversed = [abOrders(scenario)[1]!, abOrders(scenario)[0]!];
    apply(scenario, { kind: CommandKind.SetLineOrders, lineId: 0, orders: reversed });

    expect(scheduleOf(world, 0)).toBe(world.lines.orders[0]);
    expect(scheduleOf(world, 1)).toBe(world.lines.orders[0]);
    expect(scheduleOf(world, 0)[0]!.targetId).toBe(scenario.world.stations[1]!.id);
    expect(scheduleOf(world, 1)[0]!.targetId).toBe(scenario.world.stations[1]!.id);
  });

  it('re-anchors every vehicle to its nearest stop on a line edit', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;
    const size = world.map.size;

    // Stand bus 0 next to station A and bus 1 next to station B.
    const a = world.stations[0]!;
    const b = world.stations[1]!;
    world.vehicles.tileIndex[0] = a.y * size + a.x;
    world.vehicles.tileIndex[1] = b.y * size + b.x;

    // The edited list carries B first, A second: the nearest-stop rule must
    // give the two vehicles DIFFERENT anchors from the same list.
    apply(scenario, {
      kind: CommandKind.SetLineOrders,
      lineId: 0,
      orders: [abOrders(scenario)[1]!, abOrders(scenario)[0]!],
    });

    expect(world.vehicles.orderIndex[0]).toBe(1); // A sits second now
    expect(world.vehicles.orderIndex[1]).toBe(0); // B sits first
    // The old routes died with the old list, and the legs in progress were
    // forgotten - the time either side of an edit measures nothing (D-077).
    expect(world.vehicles.pathLength[0]).toBe(0);
    expect(world.vehicles.pathLength[1]).toBe(0);
    expect(world.vehicles.lastStationId[0]).toBe(-1);
    expect(world.vehicles.lastArrivalTick[1]).toBe(-1);
  });

  it('breaks a distance tie on the lower order index', () => {
    const scenario = scenarioWithBuses();
    apply(scenario, { kind: CommandKind.CreateLine });
    const world = scenario.world;
    const a = world.stations[0]!;

    // Twice the same stop: both entries are equally near, the first wins.
    apply(scenario, {
      kind: CommandKind.SetLineOrders,
      lineId: 0,
      orders: [abOrders(scenario)[0]!, abOrders(scenario)[0]!],
    });
    world.vehicles.tileIndex[0] = a.y * world.map.size + a.x;
    apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
    expect(world.vehicles.orderIndex[0]).toBe(0);
  });

  it('a released vehicle keeps a private copy the next edit cannot reach', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;

    apply(scenario, { kind: CommandKind.ReleaseVehicleFromLine, vehicleId: 1 });
    expect(world.vehicles.lineId[1]).toBe(-1);
    // A COPY, not the shared array - same content, different identity.
    expect(scheduleOf(world, 1)).not.toBe(world.lines.orders[0]);
    expect(scheduleOf(world, 1)).toEqual(world.lines.orders[0]);

    const reversed = [abOrders(scenario)[1]!, abOrders(scenario)[0]!];
    apply(scenario, { kind: CommandKind.SetLineOrders, lineId: 0, orders: reversed });

    // Vehicle 0 follows the line; vehicle 1 still runs the old schedule.
    expect(scheduleOf(world, 0)[0]!.targetId).toBe(world.stations[1]!.id);
    expect(scheduleOf(world, 1)[0]!.targetId).toBe(world.stations[0]!.id);
  });

  it('an explicit private edit takes the vehicle off its line', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;

    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [abOrders(scenario)[0]!],
    });
    expect(world.vehicles.lineId[0]).toBe(-1);
    expect(scheduleOf(world, 0)).toHaveLength(1);
    // Its former companion still runs the line.
    expect(world.vehicles.lineId[1]).toBe(0);
  });

  it('vehicles on a deleted line keep running their copy of its schedule', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;

    apply(scenario, { kind: CommandKind.DeleteLine, lineId: 0 });
    expect(scheduleOf(world, 0)).toHaveLength(2);
    expect(scheduleOf(world, 1)).toHaveLength(2);
    // And they genuinely keep driving: a full game day moves them.
    for (let tick = 0; tick < TICKS_PER_DAY; tick++) world.step(scenario.queue, null);
    expect(world.vehicles.state[0]).not.toBe(VehicleState.Stopped);
  });
});

describe('per-line statistics, recomputed from the stores', () => {
  it('reads the line round time from the D-077 legs, flagged while estimated', () => {
    const scenario = scenarioWithBuses();
    sharedLine(scenario);
    const world = scenario.world;
    world.cargoLinks.refreshLinks(world);

    expect(lineStations(world, 0)).toEqual([0, 1]);

    // Before anybody drove the legs: the straight-line 54 km/h seed, and the
    // figure says so.
    const before = lineRoundTicks(world, 0);
    expect(before.ticks).toBeGreaterThan(0);
    expect(before.measured).toBe(false);
    expect(before.ticks).toBeCloseTo(
      world.cargoLinks.legTicks(0, 1) + world.cargoLinks.legTicks(1, 0),
      6,
    );

    // Once both legs carry a real trip, the flag flips and the sum follows
    // the measured means - the SINGLE round-time source (D-077).
    world.cargoLinks.observe(0, 1, 900, 0, 0, -1, world.tick);
    world.cargoLinks.observe(1, 0, 1_100, 0, 0, -1, world.tick);
    const after = lineRoundTicks(world, 0);
    expect(after.measured).toBe(true);
    expect(after.ticks).toBe(2_000);
  });
});

describe('per-line auto-renewal ownership', () => {
  it('flips one line, refuses foreign ones, and -1 addresses every own line', () => {
    const scenario = scenarioWithRival();
    sharedLine(scenario);
    apply(scenario, { kind: CommandKind.CreateLine });
    const world = scenario.world;

    apply(scenario, { kind: CommandKind.SetAutoRenew, lineId: 0, enabled: true });
    expect(world.lines.autoRenew[0]).toBe(1);
    expect(world.lines.autoRenew[1]).toBe(0);

    expect(
      tryApply(scenario, { kind: CommandKind.SetAutoRenew, lineId: 0, enabled: false }, 1),
    ).toBe(RejectReason.NotYours);
    expect(tryApply(scenario, { kind: CommandKind.SetAutoRenew, lineId: 9, enabled: true })).toBe(
      RejectReason.NoSuchLine,
    );

    // -1 is the pre-M11 log's parse: every line the acting company owns, and
    // a quiet success even with none.
    apply(scenario, { kind: CommandKind.SetAutoRenew, lineId: -1, enabled: true });
    expect(world.lines.autoRenew[1]).toBe(1);
    apply(scenario, { kind: CommandKind.SetAutoRenew, lineId: -1, enabled: false }, 1);
    expect(world.lines.autoRenew[0]).toBe(1);
  });
});
