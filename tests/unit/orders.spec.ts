import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind, type OrderSpec } from '../../src/sim/commands/types';
import { MAX_ORDER_WAIT_TICKS, TILE_PUBLIC } from '../../src/sim/constants';
import { estimateTerraform, TerraformDirection } from '../../src/sim/map/terraform';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { WaypointKind } from '../../src/sim/map/waypoints';
import { ModuleKind } from '../../src/sim/station/types';
import {
  OrderComparator,
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
} from '../../src/sim/vehicles/VehicleStore';
import {
  apply,
  flatScenario,
  makeTown,
  tryApply,
  twoTownScenario,
  type Scenario,
  type TwoTownScenario,
} from '../balance/scenario';

/**
 * The order grammar of section 12.1 (SPEC2 M11 Stage A): waypoint markers,
 * the new load and unload modes, the per-order refit, the minimum dwell and
 * the conditional jumps - each asserted at the STOP, where all of it is
 * evaluated.
 */

const BUS = 200;
const MAIL_VAN = 220;
/** Light diesel railbus, 1950 - the cheapest way onto rails. */
const RAILBUS = 1061;

/** A default 12.1 order, overridden per test. */
function order(overrides: Partial<OrderSpec> & { targetId: number }): OrderSpec {
  return {
    target: OrderTarget.Station,
    load: OrderLoad.Partial,
    unload: OrderUnload.All,
    ...overrides,
  };
}

function step(scenario: Scenario, ticks: number): void {
  for (let i = 0; i < ticks; i++) scenario.world.step(scenario.queue, null);
}

/** Road, two stops, a depot and one vehicle running `orders`. */
function lineWith(
  scenario: TwoTownScenario,
  specId: number,
  orders: readonly OrderSpec[],
): void {
  const { townA, townB } = scenario;
  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: townA.x,
    y1: townA.y,
    x2: townB.x,
    y2: townB.y,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townA.x + 1,
    y: townA.y,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townB.x - 1,
    y: townB.y,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townA.x + 2,
    y: townA.y,
    moduleKind: ModuleKind.RoadDepot,
  });
  apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: townA.x + 2, y: townA.y, specId });
  apply(scenario, { kind: CommandKind.SetVehicleOrders, vehicleId: 0, orders: [...orders] });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
}

// ------------------------------------------------------------- the markers

describe('waypoint markers', () => {
  it('become what the tile carries, and refuse bare ground', () => {
    const scenario = flatScenario(64, [], []);
    const map = scenario.world.map;

    expect(tryApply(scenario, { kind: CommandKind.BuildWaypoint, x: 5, y: 5 })).toBe(
      'cmd.reject.needsWaypointGround',
    );

    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 20, y2: 10 });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 10 });
    expect(map.waypoint[map.tileIndex(15, 10)]).toBe(WaypointKind.Road);

    apply(scenario, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 20,
      x2: 20,
      y2: 20,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 20 });
    expect(map.waypoint[map.tileIndex(15, 20)]).toBe(WaypointKind.Rail);

    // A hand-made pond: the buoy needs nothing but water.
    map.terrain[map.tileIndex(5, 30)] = Terrain.Water;
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 5, y: 30 });
    expect(map.waypoint[map.tileIndex(5, 30)]).toBe(WaypointKind.Buoy);
    // The buoy claims its open-water tile, exactly as a module claims ground.
    expect(map.owner[map.tileIndex(5, 30)]).toBe(0);

    expect(tryApply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 10 })).toBe(
      'cmd.reject.waypointExists',
    );
  });

  it('is protected while it stands and falls with what it stands beside', () => {
    const scenario = flatScenario(64, [], []);
    const map = scenario.world.map;

    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 20, y2: 10 });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 10 });
    apply(scenario, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 20,
      x2: 20,
      y2: 20,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 20 });

    // No signal on a waypoint tile - the two would fight over the same post.
    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildSignal,
        x: 15,
        y: 20,
        signalKind: 1,
        direction: 0,
      }),
    ).toBe('cmd.reject.waypointInWay');

    // The marker falls with its way, and the money unwinds with it.
    apply(scenario, { kind: CommandKind.DemolishTrack, x: 15, y: 20 });
    expect(map.waypoint[map.tileIndex(15, 20)]).toBe(WaypointKind.None);
    apply(scenario, { kind: CommandKind.DemolishRoad, x: 15, y: 10 });
    expect(map.waypoint[map.tileIndex(15, 10)]).toBe(WaypointKind.None);

    // A buoy blocks the terraform guard of E-11.
    map.terrain[map.tileIndex(5, 30)] = Terrain.Water;
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 5, y: 30 });
    const raise = estimateTerraform(map, 5, 30, TerraformDirection.Raise, 0);
    expect(raise.ok).toBe(false);

    expect(tryApply(scenario, { kind: CommandKind.DemolishWaypoint, x: 40, y: 40 })).toBe(
      'cmd.reject.noWaypointHere',
    );
    apply(scenario, { kind: CommandKind.DemolishWaypoint, x: 5, y: 30 });
    expect(map.waypoint[map.tileIndex(5, 30)]).toBe(WaypointKind.None);
    expect(map.owner[map.tileIndex(5, 30)]).toBe(TILE_PUBLIC);
  });
});

// ------------------------------------------------------ setting the orders

describe('SetVehicleOrders validation', () => {
  function busOnRoad(): Scenario {
    const scenario = flatScenario(64, [makeTown(0, 20, 20, 1_200, 'Prüfstadt')], []);
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 30, y1: 40, x2: 45, y2: 40 });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 30,
      y: 40,
      moduleKind: ModuleKind.RoadDepot,
    });
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 30, y: 40, specId: BUS });
    return scenario;
  }

  it('refuses what the grammar cannot mean, by name', () => {
    const scenario = busOnRoad();
    const map = scenario.world.map;
    const command = (orders: OrderSpec[]): string | null =>
      tryApply(scenario, { kind: CommandKind.SetVehicleOrders, vehicleId: 0, orders });

    // A waypoint order needs a matching marker on the tile.
    expect(
      command([order({ target: OrderTarget.Waypoint, targetId: map.tileIndex(40, 40) })]),
    ).toBe('cmd.reject.noSuchWaypoint');

    // A rail marker is no target for a bus.
    apply(scenario, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 10,
      x2: 20,
      y2: 10,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 15, y: 10 });
    expect(
      command([order({ target: OrderTarget.Waypoint, targetId: map.tileIndex(15, 10) })]),
    ).toBe('cmd.reject.noSuchWaypoint');

    // ...while a road sign is.
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 40, y: 40 });
    expect(
      command([
        order({
          target: OrderTarget.Waypoint,
          targetId: map.tileIndex(40, 40),
          load: OrderLoad.None,
          unload: OrderUnload.None,
        }),
      ]),
    ).toBeNull();

    // A jump has to land inside the list.
    expect(
      command([
        order({
          targetId: 0,
          condKind: OrderConditionKind.Reliability,
          condComparator: OrderComparator.Less,
          condValue: 50,
          condJumpTo: 5,
        }),
      ]),
    ).toBe('cmd.reject.badJumpTarget');

    // Enums out of range, dwell out of range, a refit the vehicle cannot do.
    expect(command([order({ targetId: 0, load: 9 })])).toBe('cmd.reject.invalidOrder');
    expect(command([order({ targetId: 0, waitTicks: -5 })])).toBe('cmd.reject.invalidOrder');
    expect(command([order({ targetId: 0, waitTicks: MAX_ORDER_WAIT_TICKS + 1 })])).toBe(
      'cmd.reject.invalidOrder',
    );
    expect(command([order({ targetId: 0, refitTo: Cargo.Coal })])).toBe('cmd.reject.cannotCarry');
  });
});

// ------------------------------------------------------- the stop semantics

describe('the grammar at the stop', () => {
  it('holds a vehicle for the minimum dwell of its order', () => {
    const scenario = twoTownScenario(1_200, 25);
    lineWith(scenario, BUS, [
      order({ targetId: 0, waitTicks: 600 }),
      order({ targetId: 1 }),
    ]);

    // Drive to the first stop and begin serving it.
    let guard = 0;
    while (scenario.world.vehicles.state[0] !== VehicleState.Loading && guard++ < 3_000) {
      step(scenario, 1);
    }
    expect(scenario.world.vehicles.state[0]).toBe(VehicleState.Loading);
    expect(scenario.world.vehicles.loadTicks[0]!).toBeGreaterThanOrEqual(600);
  });

  it('nur_transfer sets everything down as a transfer, even at its destination', () => {
    const scenario = twoTownScenario(1_200, 25);
    lineWith(scenario, BUS, [
      order({ targetId: 0, unload: OrderUnload.None }),
      order({ targetId: 1, load: OrderLoad.None, unload: OrderUnload.TransferOnly }),
    ]);

    // Long enough for passengers to be produced, carried and set down.
    step(scenario, 6_000);

    const stationB = scenario.world.stations[1]!;
    const transferred = stationB.waiting.filter((stack) => stack.cargo === Cargo.Passengers);
    expect(transferred.length).toBeGreaterThan(0);
    // The leg was still paid: transfer is a hand-over, not a write-off.
    expect(scenario.world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
  });

  it('erzwungen forces even through-cargo off the vehicle', () => {
    // Three towns in a line; passengers from A bound for C would normally
    // RIDE THROUGH B - the forced unload at B is what puts them down there.
    const towns = [
      makeTown(0, 12, 32, 1_200, 'Anfang'),
      makeTown(1, 32, 32, 1_200, 'Mitte'),
      makeTown(2, 52, 32, 1_200, 'Ende'),
    ];
    const scenario = flatScenario(64, towns, []);
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 12, y1: 32, x2: 52, y2: 32 });
    for (const x of [13, 32, 51]) {
      apply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x,
        y: 32,
        moduleKind: ModuleKind.BusStop,
      });
    }
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 14,
      y: 32,
      moduleKind: ModuleKind.RoadDepot,
    });
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 14, y: 32, specId: BUS });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        order({ targetId: 0, unload: OrderUnload.None }),
        order({ targetId: 1, load: OrderLoad.None, unload: OrderUnload.Forced }),
        order({ targetId: 2, load: OrderLoad.None }),
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    step(scenario, 6_000);

    // Everything the bus carried came off at B: what was bound for C waits
    // there as a transfer, and nothing rode through.
    const stationB = scenario.world.stations[1]!;
    const forwarded = stationB.waiting.some(
      (stack) => stack.cargo === Cargo.Passengers && stack.destinationStationId === 2,
    );
    expect(forwarded).toBe(true);
  });

  it('refits at the stop, for the same price the depot charges', () => {
    const scenario = twoTownScenario(1_200, 25);
    lineWith(scenario, MAIL_VAN, [
      order({ targetId: 0, refitTo: Cargo.Passengers }),
      order({ targetId: 1 }),
    ]);

    const before = scenario.world.company.cashCt;
    let guard = 0;
    while (scenario.world.vehicles.refitCargo[0] !== Cargo.Passengers && guard++ < 3_000) {
      step(scenario, 1);
    }
    expect(scenario.world.vehicles.refitCargo[0]).toBe(Cargo.Passengers);
    // The mail van now measures its load in passengers - and it paid for it.
    expect(scenario.world.vehicles.capacityUnits[0]).toBe(44);
    expect(scenario.world.company.cashCt).toBeLessThan(before);
  });

  it('runs the depot round trip of section 12.1: skipped while healthy, taken when worn', () => {
    const scenario = twoTownScenario(1_200, 25);
    const depotTile = scenario.world.map.tileIndex(scenario.townA.x + 2, scenario.townA.y);
    lineWith(scenario, BUS, [
      order({ targetId: 0 }),
      order({ targetId: 1 }),
      order({
        target: OrderTarget.Depot,
        targetId: depotTile,
        load: OrderLoad.None,
        unload: OrderUnload.None,
        condKind: OrderConditionKind.Reliability,
        condComparator: OrderComparator.Greater,
        condValue: 50,
        condJumpTo: 0,
      }),
    ]);

    // A fresh bus reads 83 %: the guard holds and the shed is never visited.
    let visited = false;
    for (let i = 0; i < 4_000; i++) {
      step(scenario, 1);
      if (scenario.world.vehicles.state[0] === VehicleState.InDepot) visited = true;
    }
    expect(visited).toBe(false);

    // Worn below the guard, the next lap goes through the shed - and the
    // vehicle is serviced and RUNS ON, which is what makes it a round trip.
    scenario.world.vehicles.reliability[0] = 3_000;
    let sawDepot = false;
    let ranOn = false;
    for (let i = 0; i < 8_000; i++) {
      step(scenario, 1);
      if (scenario.world.vehicles.state[0] === VehicleState.InDepot) sawDepot = true;
      if (sawDepot && scenario.world.vehicles.state[0] === VehicleState.Driving) {
        ranOn = true;
        break;
      }
    }
    expect(sawDepot).toBe(true);
    expect(ranOn).toBe(true);
    expect(scenario.world.vehicles.reliability[0]!).toBeGreaterThan(3_000);
  });

  it('caps a cycle of true conditions instead of spinning', () => {
    const scenario = twoTownScenario(1_200, 25);
    lineWith(scenario, BUS, [
      order({
        targetId: 0,
        condKind: OrderConditionKind.DateYear,
        condComparator: OrderComparator.GreaterOrEqual,
        condValue: 1900,
        condJumpTo: 1,
      }),
      order({
        targetId: 1,
        condKind: OrderConditionKind.DateYear,
        condComparator: OrderComparator.GreaterOrEqual,
        condValue: 1900,
        condJumpTo: 0,
      }),
    ]);

    // Every condition is true for ever; the cap breaks the chain at a stop
    // and the vehicle simply runs the order it landed on.
    step(scenario, 2_000);
    const state = scenario.world.vehicles.state[0]!;
    expect(state === VehicleState.Stopped || state === VehicleState.NoRoute).toBe(false);
  });
});

// --------------------------------------------------- the route obeys a marker

describe('waypoints and the pathfinders', () => {
  it('forces a train onto the longer of two routes', () => {
    const scenario = flatScenario(128, [], []);
    const map = scenario.world.map;

    // The short way: a straight line. The long way: a detour over (20,16).
    for (const [x1, y1, x2, y2] of [
      [10, 10, 30, 10],
      [10, 10, 20, 16],
      [20, 16, 30, 10],
    ]) {
      apply(scenario, {
        kind: CommandKind.BuildTrack,
        x1: x1!,
        y1: y1!,
        x2: x2!,
        y2: y2!,
        railType: RailType.Plain,
        assistant: true,
        signalSpacing: 0,
      });
    }
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: 30,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 20, y: 16 });
    expect(map.waypoint[map.tileIndex(20, 16)]).toBe(WaypointKind.Rail);

    apply(scenario, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [RAILBUS] });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        order({
          target: OrderTarget.Waypoint,
          targetId: map.tileIndex(20, 16),
          load: OrderLoad.None,
          unload: OrderUnload.None,
        }),
        order({ targetId: 1, load: OrderLoad.None }),
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    // The first leg aims at the MARKER, not at the platform.
    const vehicles = scenario.world.vehicles;
    const firstLeg = vehicles.paths[0]!.slice(0, vehicles.pathLength[0]!);
    expect([...firstLeg]).toContain(map.tileIndex(20, 16));

    // And the train genuinely drives the detour to the platform.
    let viaMarker = false;
    for (let i = 0; i < 4_000; i++) {
      step(scenario, 1);
      if (vehicles.tileIndex[0] === map.tileIndex(20, 16)) viaMarker = true;
      if (vehicles.tileIndex[0] === map.tileIndex(30, 10)) break;
    }
    expect(viaMarker).toBe(true);
    expect(vehicles.tileIndex[0]).toBe(map.tileIndex(30, 10));
  });

  it('routes a road vehicle over its roadside sign', () => {
    const scenario = flatScenario(64, [], []);
    const map = scenario.world.map;

    // A ring: the direct road along y=20, the detour along y=30.
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 20, x2: 40, y2: 20 });
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 20, x2: 10, y2: 30 });
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 30, x2: 40, y2: 30 });
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 40, y1: 30, x2: 40, y2: 20 });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: 20,
      moduleKind: ModuleKind.RoadDepot,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 40,
      y: 20,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, { kind: CommandKind.BuildWaypoint, x: 25, y: 30 });

    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 10, y: 20, specId: BUS });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        order({
          target: OrderTarget.Waypoint,
          targetId: map.tileIndex(25, 30),
          load: OrderLoad.None,
          unload: OrderUnload.None,
        }),
        order({ targetId: 1, load: OrderLoad.None }),
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    let viaSign = false;
    for (let i = 0; i < 4_000; i++) {
      step(scenario, 1);
      if (scenario.world.vehicles.tileIndex[0] === map.tileIndex(25, 30)) viaSign = true;
      if (scenario.world.vehicles.tileIndex[0] === map.tileIndex(40, 20)) break;
    }
    expect(viaSign).toBe(true);
    expect(scenario.world.vehicles.tileIndex[0]).toBe(map.tileIndex(40, 20));
  });
});
