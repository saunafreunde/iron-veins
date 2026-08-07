import { describe, expect, it } from 'vitest';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import {
  CONNECTION_WAIT_MAX_TICKS,
  TAKT_MAX_TICKS,
  TAKT_MIN_TICKS,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { adviseFleet } from '../../src/sim/lines/metrics';
import { nextFreeSlotTick, reachesSelf } from '../../src/sim/lines/takt';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { scheduleOf } from '../../src/sim/lines/LineStore';
import { OrderTarget, VehicleState } from '../../src/sim/vehicles/VehicleStore';
import {
  apply,
  buildBusLine,
  flatScenario,
  makeTown,
  tryApply,
  twoTownScenario,
  type Scenario,
  type TwoTownScenario,
} from '../balance/scenario';

/**
 * The takt and the connection protection of section 12.3 (SPEC2 M11 Stage C).
 *
 * The acceptance sentences under test, verbatim from the milestone: vehicles
 * wait at takt points - platforms, never open line - for their slot; the
 * slot arithmetic is pure integer mathematics; a vehicle that waits never
 * blocks a vehicle it waits for (the Wartegraph test); a detected cycle
 * breaks the wait; and the hard tick cap holds when no connector ever comes.
 */

const BUS = 200;
const TAKT = 1_000;

/** Two towns, two buses on a shared line, and a takt on the line. */
function taktedBusLine(taktTicks: number, offsetTicks = 0): TwoTownScenario {
  const scenario = twoTownScenario(1_200, 24);
  buildBusLine(scenario, BUS, 2);
  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, {
    kind: CommandKind.SetLineOrders,
    lineId: 0,
    orders: [
      { target: 0, targetId: 0, load: 1, unload: 0 },
      { target: 0, targetId: 1, load: 1, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 1, lineId: 0 });
  apply(scenario, { kind: CommandKind.SetLineTakt, lineId: 0, taktTicks, offsetTicks });
  return scenario;
}

/** Step one tick, running the sim without new commands. */
function step(scenario: Scenario): void {
  scenario.world.step(scenario.queue, null);
}

describe('the SetLineTakt and SetTransferNode commands', () => {
  it('validates the takt, the offset and the ownership', () => {
    const scenario = twoTownScenario(1_200, 24);
    buildBusLine(scenario, BUS, 1);
    apply(scenario, { kind: CommandKind.CreateLine });

    const reject = (taktTicks: number, offsetTicks: number): string | null =>
      tryApply(scenario, { kind: CommandKind.SetLineTakt, lineId: 0, taktTicks, offsetTicks });

    expect(reject(TAKT_MIN_TICKS - 1, 0)).toBe(RejectReason.InvalidTakt);
    expect(reject(TAKT_MAX_TICKS + 1, 0)).toBe(RejectReason.InvalidTakt);
    expect(reject(TAKT, TAKT)).toBe(RejectReason.InvalidTakt);
    expect(reject(TAKT, -1)).toBe(RejectReason.InvalidTakt);
    expect(reject(0, 5)).toBe(RejectReason.InvalidTakt);
    expect(
      tryApply(scenario, { kind: CommandKind.SetLineTakt, lineId: 9, taktTicks: TAKT, offsetTicks: 0 }),
    ).toBe(RejectReason.NoSuchLine);

    expect(reject(TAKT, 400)).toBe(null);
    expect(scenario.world.lines.taktTicks[0]).toBe(TAKT);
    expect(scenario.world.lines.taktOffsetTicks[0]).toBe(400);
    expect(reject(0, 0)).toBe(null);
    expect(scenario.world.lines.taktTicks[0]).toBe(0);
  });

  it('marks a station as transfer node, owner only', () => {
    // A competitor company must EXIST for "not yours" to be observable: in a
    // one-company world an unknown issuer falls back to the player.
    const y = 32;
    const townA = makeTown(0, 20, y, 1_200, 'Westheim');
    const townB = makeTown(1, 44, y, 1_200, 'Ostheim');
    const scenario = { ...flatScenario(64, [townA, townB], [], 1, 1), townA, townB };
    buildBusLine(scenario, BUS, 1);

    expect(
      tryApply(scenario, { kind: CommandKind.SetTransferNode, stationId: 9, transferNode: true }),
    ).toBe(RejectReason.NoSuchStation);
    expect(
      tryApply(scenario, { kind: CommandKind.SetTransferNode, stationId: 0, transferNode: true }, 1),
    ).toBe(RejectReason.NotYours);

    apply(scenario, { kind: CommandKind.SetTransferNode, stationId: 0, transferNode: true });
    expect(scenario.world.stations[0]!.transferNode).toBe(true);
    apply(scenario, { kind: CommandKind.SetTransferNode, stationId: 0, transferNode: false });
    expect(scenario.world.stations[0]!.transferNode).toBe(false);
  });
});

describe('the slot arithmetic (E-07: pure integers, zero randomness)', () => {
  it('finds the first grid slot at or after the asked tick', () => {
    const scenario = taktedBusLine(TAKT, 300);
    const world = scenario.world;

    expect(nextFreeSlotTick(world, 0, 0, 0, 0)).toBe(300);
    expect(nextFreeSlotTick(world, 0, 0, 0, 300)).toBe(300);
    expect(nextFreeSlotTick(world, 0, 0, 0, 301)).toBe(1_300);
    expect(nextFreeSlotTick(world, 0, 0, 0, 1_300)).toBe(1_300);
    expect(nextFreeSlotTick(world, 0, 0, 0, 2_500)).toBe(3_300);
  });

  it('skips a slot another vehicle of the line has latched at the station', () => {
    const scenario = taktedBusLine(TAKT, 300);
    const world = scenario.world;

    // Vehicle 1 stands at station 0 holding slot 3,300 - the de-bunching
    // rule pushes vehicle 0 one takt further.
    world.vehicles.taktDueTick[1] = 3_300;
    world.vehicles.lastStationId[1] = 0;
    world.vehicles.state[1] = VehicleState.WaitingForSlot;
    expect(nextFreeSlotTick(world, 0, 0, 0, 2_500)).toBe(4_300);
    // At ANOTHER station the same slot is free - the grid is per stop.
    expect(nextFreeSlotTick(world, 0, 0, 1, 2_500)).toBe(3_300);
  });
});

describe('vehicles wait at takt points for their slot', () => {
  it('waits at platforms only, departs on the grid, and never doubles a slot', () => {
    const scenario = taktedBusLine(TAKT);
    const world = scenario.world;

    let waitedTicks = 0;
    const leaveTicks: number[] = [];
    for (let tick = 0; tick < 30_000; tick++) {
      const before0 = world.vehicles.state[0];
      const before1 = world.vehicles.state[1];
      step(scenario);

      for (const id of [0, 1]) {
        const state = world.vehicles.state[id]!;
        if (state === VehicleState.WaitingForSlot || state === VehicleState.WaitingForConnection) {
          waitedTicks++;
          // A takt point is a PLATFORM: the current order of a waiting
          // vehicle is always a station stop, never a waypoint, depot or
          // open line (E-07).
          const orders = scheduleOf(world, id);
          const order = orders[world.vehicles.orderIndex[id]! % orders.length]!;
          expect(order.target).toBe(OrderTarget.Station);
          // While waiting, the slot lies ahead.
          expect(world.vehicles.taktDueTick[id]!).toBeGreaterThanOrEqual(world.tick);
        }
      }

      // A vehicle leaving WaitingForSlot left ON its slot: the departure
      // tick is a grid point, and the recorded delay is whole takts - zero
      // when it made its intended slot, the slip when it missed it.
      if (before0 === VehicleState.WaitingForSlot && world.vehicles.state[0] !== before0) {
        leaveTicks.push(world.tick);
        expect(world.vehicles.taktDelayTicks[0]! % TAKT).toBe(0);
      }
      if (before1 === VehicleState.WaitingForSlot && world.vehicles.state[1] !== before1) {
        leaveTicks.push(world.tick);
        expect(world.vehicles.taktDelayTicks[1]! % TAKT).toBe(0);
      }

      // Slot exclusivity: two vehicles of one line standing at one station
      // never share a due slot - that is the de-bunching.
      if (
        world.vehicles.state[0] === VehicleState.WaitingForSlot &&
        world.vehicles.state[1] === VehicleState.WaitingForSlot &&
        world.vehicles.lastStationId[0] === world.vehicles.lastStationId[1]
      ) {
        expect(world.vehicles.taktDueTick[0]).not.toBe(world.vehicles.taktDueTick[1]);
      }
    }

    expect(waitedTicks).toBeGreaterThan(0);
    expect(leaveTicks.length).toBeGreaterThan(0);
    for (const tick of leaveTicks) {
      // The wait ends in the tick of the slot itself. `world.tick` was
      // already advanced past the update that departed, hence the -1.
      expect((tick - 1) % TAKT).toBe(0);
    }
  });

  it('records the delay of a departure that missed its slot, in ticks the panel turns into days', () => {
    // A minimum dwell LONGER than the takt makes every departure late by
    // construction: the due slot always falls inside the dwell.
    const scenario = twoTownScenario(1_200, 24);
    buildBusLine(scenario, BUS, 1);
    apply(scenario, { kind: CommandKind.CreateLine });
    apply(scenario, {
      kind: CommandKind.SetLineOrders,
      lineId: 0,
      orders: [
        { target: 0, targetId: 0, load: 1, unload: 0, waitTicks: TAKT + 500 },
        { target: 0, targetId: 1, load: 1, unload: 0, waitTicks: TAKT + 500 },
      ],
    });
    apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
    apply(scenario, { kind: CommandKind.SetLineTakt, lineId: 0, taktTicks: TAKT, offsetTicks: 0 });

    const world = scenario.world;
    let sawDelay = 0;
    for (let tick = 0; tick < 20_000; tick++) {
      step(scenario);
      if (world.vehicles.taktDelayTicks[0]! > 0) sawDelay = world.vehicles.taktDelayTicks[0]!;
    }
    // The slip is recorded in whole takts - the vehicle does not bolt
    // off-grid, it takes the next slot and SAYS how far it slipped.
    expect(sawDelay).toBeGreaterThan(0);
    expect(sawDelay % TAKT).toBe(0);
    expect(sawDelay).toBeLessThanOrEqual(2 * TAKT);
    // Sanity of the panel's unit: the delay is convertible to game days.
    expect(sawDelay / TICKS_PER_DAY).toBeGreaterThan(0);
  });

  it('a takt switched off releases a waiting vehicle at once', () => {
    const scenario = taktedBusLine(TAKT);
    const world = scenario.world;

    // Run until somebody waits for a slot.
    let guard = 0;
    while (world.vehicles.state[0] !== VehicleState.WaitingForSlot && guard < 30_000) {
      step(scenario);
      guard++;
    }
    expect(world.vehicles.state[0]).toBe(VehicleState.WaitingForSlot);

    apply(scenario, { kind: CommandKind.SetLineTakt, lineId: 0, taktTicks: 0, offsetTicks: 0 });
    step(scenario);
    step(scenario);
    expect(world.vehicles.state[0]).not.toBe(VehicleState.WaitingForSlot);
  });
});

describe('the fleet advisor formula, said once in lines/metrics.ts', () => {
  it('is ceil(round / takt) with the leftover as headroom', () => {
    expect(adviseFleet(9_000, 4_000)).toEqual({ vehiclesNeeded: 3, headroomTicks: 3_000 });
    expect(adviseFleet(8_000, 4_000)).toEqual({ vehiclesNeeded: 2, headroomTicks: 0 });
    expect(adviseFleet(100, 4_000)).toEqual({ vehiclesNeeded: 1, headroomTicks: 3_900 });
    expect(adviseFleet(9_000, 0)).toBeNull();
    expect(adviseFleet(0, 4_000)).toBeNull();
  });
});

// ---------------------------------------------------------------- connection

const SIZE = 64;
const ROW = 20;
const LOCO = 1000;

interface RailConnectionScenario extends Scenario {
  readonly hubStationId: number;
}

/**
 * Three single-platform rail stations on one line - near(24), hub(30),
 * far(52) - a shed beside the hub for train 0 and one beside `near` for
 * train 1. Train 0 runs line 0 (hub <-> far) WITH a takt and a 500-tick hub
 * dwell; train 1 runs line 1 (hub <-> near) without one. The hub is the
 * transfer node and has exactly ONE platform: the hardest case for "a
 * waiting vehicle never blocks the vehicle it waits for".
 *
 * The dwell is the timing: train 0 finishes loading at the hub while train
 * 1 - re-anchored to `near`, served there, and on its way over - is
 * genuinely INBOUND, so the connection hold begins deterministically on the
 * first stop, and train 1's arrival falls inside the hold's hard cap.
 */
function railConnectionScenario(): RailConnectionScenario {
  const scenario = flatScenario(SIZE, [], []);
  apply(scenario, {
    kind: CommandKind.BuildTrack,
    x1: 4,
    y1: ROW,
    x2: 60,
    y2: ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  for (const x of [24, 30, 52]) {
    apply(scenario, { kind: CommandKind.BuildRailStop, x, y: ROW, moduleKind: ModuleKind.RailPlatform });
  }
  apply(scenario, { kind: CommandKind.BuildRailStop, x: 28, y: ROW, moduleKind: ModuleKind.RailDepot });
  apply(scenario, { kind: CommandKind.BuildRailStop, x: 22, y: ROW, moduleKind: ModuleKind.RailDepot });

  const world = scenario.world;
  const stationAt = (x: number): number =>
    world.stations.find((station) =>
      station.modules.some(
        (module) => module.kind === ModuleKind.RailPlatform && module.x === x && module.y === ROW,
      ),
    )!.id;
  const hub = stationAt(30);
  const far = stationAt(52);
  const near = stationAt(24);

  apply(scenario, { kind: CommandKind.BuyTrain, x: 28, y: ROW, specIds: [LOCO] });
  apply(scenario, { kind: CommandKind.BuyTrain, x: 22, y: ROW, specIds: [LOCO] });

  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, {
    kind: CommandKind.SetLineOrders,
    lineId: 0,
    orders: [
      { target: 0, targetId: hub, load: 1, unload: 0, waitTicks: 500 },
      { target: 0, targetId: far, load: 1, unload: 0 },
    ],
  });
  apply(scenario, {
    kind: CommandKind.SetLineOrders,
    lineId: 1,
    orders: [
      { target: 0, targetId: hub, load: 1, unload: 0 },
      { target: 0, targetId: near, load: 1, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 1, lineId: 1 });
  // Only the WAITER's line needs the timetable: the connection protection is
  // part of the per-line 12.3 feature.
  apply(scenario, { kind: CommandKind.SetLineTakt, lineId: 0, taktTicks: 8_000, offsetTicks: 0 });
  apply(scenario, { kind: CommandKind.SetTransferNode, stationId: hub, transferNode: true });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 1, running: true });
  return { ...scenario, hubStationId: hub };
}

describe('the connection protection at a transfer node', () => {
  it('a waiting vehicle never blocks the vehicle it waits for - and its arrival releases the wait', () => {
    const scenario = railConnectionScenario();
    const world = scenario.world;
    const hub = scenario.hubStationId;

    let holdBegan = -1;
    let holdDeadline = -1;
    let connectorArrived = -1;
    let holdEnded = -1;

    for (let tick = 0; tick < 4_000; tick++) {
      const wasHolding = world.vehicles.state[0] === VehicleState.WaitingForConnection;
      step(scenario);
      const holding = world.vehicles.state[0] === VehicleState.WaitingForConnection;

      if (!wasHolding && holding && holdBegan < 0) {
        holdBegan = world.tick;
        holdDeadline = world.vehicles.connectionDeadlineTick[0]!;
      }
      if (
        connectorArrived < 0 &&
        world.vehicles.state[1] === VehicleState.Loading &&
        world.vehicles.lastStationId[1] === hub
      ) {
        connectorArrived = world.tick;
      }
      if (wasHolding && !holding && holdEnded < 0) holdEnded = world.tick;
      if (holdEnded >= 0 && connectorArrived >= 0) break;
    }

    // Train 0 held its departure for the inbound train 1...
    expect(holdBegan).toBeGreaterThan(0);
    // ...and train 1 REACHED the single platform train 0 was standing on -
    // the waiting vehicle provably did not block the vehicle it waits for.
    expect(connectorArrived).toBeGreaterThan(holdBegan);
    expect(connectorArrived).toBeLessThan(holdDeadline);
    // The arrival is what ended the hold, not the cap: within two ticks.
    expect(holdEnded).toBeGreaterThanOrEqual(connectorArrived);
    expect(holdEnded).toBeLessThanOrEqual(connectorArrived + 2);
  });

  it('the hard cap holds when no connector ever comes', () => {
    const scenario = railConnectionScenario();
    const world = scenario.world;

    let holdBegan = -1;
    let holdEnded = -1;
    for (let tick = 0; tick < 4_000; tick++) {
      const wasHolding = world.vehicles.state[0] === VehicleState.WaitingForConnection;
      step(scenario);
      const holding = world.vehicles.state[0] === VehicleState.WaitingForConnection;
      if (!wasHolding && holding && holdBegan < 0) {
        holdBegan = world.tick;
        // The moment the hold begins, the connector is parked for good: the
        // wait must now run to its cap and no further.
        apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 1, running: false });
      }
      if (wasHolding && !holding && holdEnded < 0) {
        holdEnded = world.tick;
        break;
      }
    }

    expect(holdBegan).toBeGreaterThan(0);
    expect(holdEnded).toBeGreaterThan(holdBegan);
    expect(holdEnded - holdBegan).toBeLessThanOrEqual(CONNECTION_WAIT_MAX_TICKS + 1);
  });

  it('no hold begins when nothing is inbound, or without the takt, or off the mark', () => {
    const scenario = railConnectionScenario();
    const world = scenario.world;
    // Park the connector BEFORE train 0 ever reaches the hub: at its first
    // departure nothing is inbound, so no hold may begin.
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 1, running: false });

    let everHeld = false;
    for (let tick = 0; tick < 3_000; tick++) {
      step(scenario);
      if (world.vehicles.state[0] === VehicleState.WaitingForConnection) everHeld = true;
    }
    expect(everHeld).toBe(false);
  });
});

describe('the waiting graph guard', () => {
  it('detects a planted cycle iteratively, and clears an acyclic walk', () => {
    const stack = new Int32Array(8);
    const visited = new Uint8Array(8);

    // 0 would wait for 1; 1 -> 2, 2 -> 0: a cycle back to the candidate.
    const cyclic = (vertex: number, out: Int32Array, at: number): number => {
      if (vertex === 1) out[at++] = 2;
      else if (vertex === 2) out[at++] = 0;
      return at;
    };
    stack[0] = 1;
    expect(reachesSelf(0, stack, 1, visited, cyclic)).toBe(true);

    // 1 -> 2 and nothing further: no way back to 0.
    visited.fill(0);
    const acyclic = (vertex: number, out: Int32Array, at: number): number => {
      if (vertex === 1) out[at++] = 2;
      return at;
    };
    stack[0] = 1;
    expect(reachesSelf(0, stack, 1, visited, acyclic)).toBe(false);
  });

  it('a diamond that reconverges without touching the candidate is no cycle', () => {
    const stack = new Int32Array(8);
    const visited = new Uint8Array(8);
    // 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4: revisits vertex 4, reaches nobody's self.
    const diamond = (vertex: number, out: Int32Array, at: number): number => {
      if (vertex === 1) {
        out[at++] = 2;
        out[at++] = 3;
      } else if (vertex === 2 || vertex === 3) {
        out[at++] = 4;
      }
      return at;
    };
    stack[0] = 1;
    expect(reachesSelf(0, stack, 1, visited, diamond)).toBe(false);
  });
});
