import { CommandKind } from '../../src/sim/commands/types';
import { ModuleKind } from '../../src/sim/station/types';
import { OrderLoad, OrderTarget, OrderUnload } from '../../src/sim/vehicles/VehicleStore';
import { apply, flatScenario, makeTown, SCENARIO_SIZE, type Scenario } from '../balance/scenario';

/**
 * The three-line transfer network of M14's acceptance sentence ("Fertig,
 * wenn: in einem 3-Linien-Transfernetz ..."), built once and shared: the
 * flow-atlas export test reads its measured legs, and the station
 * cargo-history ring (M14 bundle 2) reads the same stations' months.
 *
 * Four towns on flat grassland, one interchange:
 *
 *          A ----L0---- B ----L1---- C
 *                       |
 *                      L2
 *                       |
 *                       D
 *
 * Every station is a single bus stop; B's stop serves all three lines, so a
 * passenger produced in A and bound for C or D has to transfer there - the
 * feeder behaviour D-078's two loading rules produce, exercised over real
 * Line entities (section 12.2) so every leg carries a line id.
 */

/** The 1950 bus of the catalogue - the same spec every balance scenario uses. */
export const TRANSFER_BUS_SPEC = 200;

/** Buses per line. Two keep every leg measured within a couple of months. */
export const TRANSFER_BUSES_PER_LINE = 2;

export interface TransferNetwork extends Scenario {
  /** Station ids in build order: a, b (the interchange), c, d. */
  readonly stations: {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
  };
  /** Line ids: ab = A-B, bc = B-C, bd = B-D. */
  readonly lines: { readonly ab: number; readonly bc: number; readonly bd: number };
  /** Vehicle ids per line, in buy order. */
  readonly buses: { readonly ab: number[]; readonly bc: number[]; readonly bd: number[] };
}

/** A full stop order at one station. */
function stopAt(stationId: number): {
  target: number;
  targetId: number;
  load: number;
  unload: number;
} {
  return {
    target: OrderTarget.Station,
    targetId: stationId,
    load: OrderLoad.Partial,
    unload: OrderUnload.All,
  };
}

/**
 * Build one line: create it, give it the two-stop schedule, buy its buses at
 * the given depot, assign them and set them running. Returns the vehicle ids.
 */
function buildLine(
  scenario: Scenario,
  lineId: number,
  stops: readonly [number, number],
  depot: readonly [number, number],
): number[] {
  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, {
    kind: CommandKind.SetLineOrders,
    lineId,
    orders: [stopAt(stops[0]), stopAt(stops[1])],
  });

  const buses: number[] = [];
  for (let i = 0; i < TRANSFER_BUSES_PER_LINE; i++) {
    apply(scenario, {
      kind: CommandKind.BuyRoadVehicle,
      x: depot[0],
      y: depot[1],
      specId: TRANSFER_BUS_SPEC,
    });
    const vehicleId = scenario.world.vehicles.count - 1;
    apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId, lineId });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
    buses.push(vehicleId);
  }
  return buses;
}

/**
 * Lay the whole network through ordinary commands (D-072: a refused build
 * throws) and hand back every id a test needs to address it.
 */
export function buildTransferNetwork(): TransferNetwork {
  const mid = SCENARIO_SIZE >> 1; // 32
  const townA = makeTown(0, 10, mid, 1_400, 'Ahausen');
  const townB = makeTown(1, mid, mid, 1_400, 'Beeck');
  const townC = makeTown(2, 54, mid, 1_400, 'Cehausen');
  const townD = makeTown(3, mid, 52, 1_400, 'Dedorf');
  const scenario = flatScenario(SCENARIO_SIZE, [townA, townB, townC, townD], [], 1);

  // The three arms of the cross, all through B's centre.
  apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: mid, x2: mid, y2: mid });
  apply(scenario, { kind: CommandKind.BuildRoad, x1: mid, y1: mid, x2: 54, y2: mid });
  apply(scenario, { kind: CommandKind.BuildRoad, x1: mid, y1: mid, x2: mid, y2: 52 });

  // One stop per town, a tile off the centre so no house is replaced; build
  // order fixes the station ids at 0..3.
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 11,
    y: mid,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: mid + 1,
    y: mid,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 53,
    y: mid,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: mid,
    y: 51,
    moduleKind: ModuleKind.BusStop,
  });
  const stations = { a: 0, b: 1, c: 2, d: 3 };

  // A depot at each line's outer end.
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 12,
    y: mid,
    moduleKind: ModuleKind.RoadDepot,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 52,
    y: mid,
    moduleKind: ModuleKind.RoadDepot,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: mid,
    y: 50,
    moduleKind: ModuleKind.RoadDepot,
  });

  const buses = {
    ab: buildLine(scenario, 0, [stations.a, stations.b], [12, mid]),
    bc: buildLine(scenario, 1, [stations.b, stations.c], [52, mid]),
    bd: buildLine(scenario, 2, [stations.b, stations.d], [mid, 50]),
  };

  return { ...scenario, stations, lines: { ab: 0, bc: 1, bd: 2 }, buses };
}

/** Step the network `ticks` ticks with an empty command queue. */
export function runTicks(network: TransferNetwork, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) network.world.step(network.queue, null);
}
