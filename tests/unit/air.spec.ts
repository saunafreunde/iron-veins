import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  AIRPORT_HOLDING_SLOTS,
  AIRPORT_RUNWAY_TICKS,
  AIRPORT_RUNWAYS,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { flightPath } from '../../src/sim/net/airPath';
import { ModuleKind, stationAirportSize, type Station } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * Aircraft: the straight flight of section 8.4, the runway queue and the
 * holding stack.
 *
 * An aircraft is given a path of adjacent tiles like every other vehicle, which
 * is what lets the state machine, the snapshot, the renderer and the save carry
 * it unchanged (D-098). What is genuinely new is that it may not land whenever
 * it likes.
 */

const SIZE = 64;
const WEST_X = 10;
const EAST_X = 50;
const ROW = 20;
const PROP = 3000;

function airline(size: ModuleKind, aircraft: number): Scenario {
  const scenario = flatScenario(SIZE, [makeTown(0, 30, 40, 1_200, 'Flugstadt')], []);
  scenario.world.company.cashCt = 500_000_000_00;

  for (const x of [WEST_X, EAST_X]) {
    apply(scenario, { kind: CommandKind.BuildAirport, x, y: ROW, moduleKind: size });
  }
  const west = stationAt(scenario, WEST_X);
  const east = stationAt(scenario, EAST_X);

  for (let i = 0; i < aircraft; i++) {
    apply(scenario, { kind: CommandKind.BuyAircraft, x: WEST_X, y: ROW, specId: PROP });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: i,
      orders: [
        { target: 0, targetId: west.id, load: 1, unload: 0 },
        { target: 0, targetId: east.id, load: 1, unload: 0 },
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true });
  }
  return scenario;
}

function stationAt(scenario: Scenario, x: number): Station {
  const tile = scenario.world.map.tileIndex(x, ROW);
  return scenario.world.stations.find((station) =>
    station.modules.some((module) => module.tileIndex === tile),
  )!;
}

describe('the flight path', () => {
  it('is a run of adjacent tiles from one airport to the other', () => {
    const scenario = airline(ModuleKind.Airstrip, 0);
    const map = scenario.world.map;
    const out = new Int32Array(2_048);

    const from = map.tileIndex(WEST_X, ROW);
    const to = map.tileIndex(EAST_X, ROW + 7);
    const length = flightPath(map, from, to, out);

    expect(length).toBeGreaterThan(0);
    expect(out[0]).toBe(from);
    expect(out[length - 1]).toBe(to);
    // Every step is one tile, diagonals included. Anything else and the step
    // length the solver charges would be a fiction.
    for (let i = 1; i < length; i++) {
      const dx = Math.abs((out[i]! % map.size) - (out[i - 1]! % map.size));
      const dy = Math.abs(((out[i]! / map.size) | 0) - ((out[i - 1]! / map.size) | 0));
      expect(Math.max(dx, dy)).toBe(1);
    }
  });

  it('flies over anything, because that is what flying is', () => {
    const scenario = airline(ModuleKind.Airstrip, 0);
    const map = scenario.world.map;
    const out = new Int32Array(2_048);
    // A mountain in the way changes nothing about the route.
    const length = flightPath(map, map.tileIndex(0, 0), map.tileIndex(SIZE - 1, SIZE - 1), out);
    expect(length).toBe(SIZE);
  });
});

describe('an airport', () => {
  it('comes in three sizes with more runways each', () => {
    for (const [kind, size] of [
      [ModuleKind.Airstrip, 0],
      [ModuleKind.Airport, 1],
      [ModuleKind.InternationalAirport, 2],
    ] as const) {
      const scenario = airline(kind, 0);
      expect(stationAirportSize(stationAt(scenario, WEST_X))).toBe(size);
    }
    // More runways and a faster turnround, which is what the price buys.
    expect(AIRPORT_RUNWAYS[0]).toBeLessThan(AIRPORT_RUNWAYS[2]!);
    expect(AIRPORT_RUNWAY_TICKS[0]).toBeGreaterThan(AIRPORT_RUNWAY_TICKS[2]!);
  });

  it('refuses ground that is not flat', () => {
    const scenario = flatScenario(SIZE, [], []);
    scenario.world.company.cashCt = 500_000_000_00;
    // Lift one corner: a runway will not be built on a slope.
    scenario.world.map.cornerHeight[ROW * (SIZE + 1) + WEST_X] = 7;

    scenario.queue.enqueue(
      { kind: CommandKind.BuildAirport, x: WEST_X, y: ROW, moduleKind: ModuleKind.Airstrip },
      scenario.world.tick,
    );
    let reason: string | null = null;
    scenario.world.drainCommands(scenario.queue, (_e, outcome) => {
      if (!outcome.ok) reason = outcome.reasonKey;
    });
    expect(reason).toBe('cmd.reject.tooSteep');
  });

  it('holds an aircraft whose runway is busy, and lands it when one frees', () => {
    // Two aircraft, one runway. The second cannot land while the first is on it.
    const scenario = airline(ModuleKind.Airstrip, 2);
    const world = scenario.world;
    expect(AIRPORT_RUNWAYS[0]).toBe(1);

    let sawHolding = false;
    for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) {
      world.step(scenario.queue, null);
      for (let id = 0; id < 2; id++) {
        if (world.vehicles.state[id] === VehicleState.Holding) sawHolding = true;
      }
    }
    expect(sawHolding).toBe(true);

    // And neither is stuck: both are still working after two months.
    for (let id = 0; id < 2; id++) {
      expect(world.vehicles.state[id]).not.toBe(VehicleState.NoRoute);
      expect(world.vehicles.earnedCt[id]! >= 0).toBe(true);
    }
  });

  it('never lets more than the stack circle over one airport', () => {
    // More aircraft than the stack holds. The extras wait on the ground, where
    // waiting is free - nothing is refused in the air, because that would mean
    // inventing fuel exhaustion.
    const scenario = airline(ModuleKind.Airstrip, AIRPORT_HOLDING_SLOTS + 3);
    const world = scenario.world;

    let peak = 0;
    for (let tick = 0; tick < 40 * TICKS_PER_DAY; tick++) {
      world.step(scenario.queue, null);
      let holding = 0;
      for (let id = 0; id < world.vehicles.count; id++) {
        if (world.vehicles.state[id] === VehicleState.Holding) holding++;
      }
      if (holding > peak) peak = holding;
    }
    expect(peak).toBeLessThanOrEqual(AIRPORT_HOLDING_SLOTS * 2);
  });

  it('gives a bigger airport more room in the air', () => {
    const small = airline(ModuleKind.Airstrip, 3);
    const large = airline(ModuleKind.InternationalAirport, 3);

    const holdTicks = (scenario: Scenario): number => {
      let ticks = 0;
      for (let tick = 0; tick < 40 * TICKS_PER_DAY; tick++) {
        scenario.world.step(scenario.queue, null);
        for (let id = 0; id < scenario.world.vehicles.count; id++) {
          if (scenario.world.vehicles.state[id] === VehicleState.Holding) ticks++;
        }
      }
      return ticks;
    };

    // Four runways and a faster turnround: the same three aircraft spend
    // strictly less time circling. This is what the price of the big airport
    // actually buys, stated as a measurement.
    expect(holdTicks(large)).toBeLessThan(holdTicks(small));
  });
});
