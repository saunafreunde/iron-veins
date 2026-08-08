import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Cargo } from '../../src/sim/cargo/types';
import { Difficulty, MapClimate } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';

/**
 * The arrival gate under a dead stop on the final approach (DECISIONS.md
 * D-157, measured in D-156).
 *
 * A vehicle forced to a dead stop on its final approach - a breakdown during
 * the arrival brake does it reliably - must still arrive and earn. The failure
 * this file pins: `routeRemainingM` is a Float32 fed by repeated subtraction,
 * so at the last path node it sits a few float ulps off the freshly
 * recomputed float64 step - and the arrival brake targets exactly
 * `routeRemainingM - progressM = 0`. A vehicle that stops inside the sliver
 * between the two numbers has `remaining <= 0`, is held in Braking at speed
 * zero, and its `pathIndex` stays two short of `pathLength` for ever.
 *
 * The gate lives in the mode-shared Driving/Braking case of `stepVehicle`, so
 * the freeze is pinned on rail AND on the modes without reservations (air here
 * for the diagonal steps that produce the drift; roads are 4-directional -
 * every step exactly 50 m, float-exact - so a bus only gets the contract
 * test).
 */

/**
 * 128 rather than the 96 this fixture used to build (D-197): a 96-tile world
 * is one the save format refuses, so it could be created and played and never
 * written down. Coordinates below are unchanged; the map is larger around them.
 */
const SIZE = 128;
const GROUND = 5;

/** Light diesel railbus, 1950. */
const RAILBUS = 1061;
/** The 1950 bus. */
const BUS = 200;
/** The 1950 piston airliner. */
const PROP = 3000;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function flatWorld(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 7,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Bench AG',
      companyColorIndex: 1,
    },
    { map, towns: [], industries: [], seedUsed: 7 },
  );
  return { world, queue: new CommandQueue() };
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) {
    throw new Error(`command ${command.kind} was rejected: ${String(rejected)}`);
  }
}

/** Break the vehicle down exactly as lifecycle.ts rollBreakdowns writes it. */
function breakDown(bench: Bench, id: number, ticks: number): void {
  const vehicles = bench.world.vehicles;
  vehicles.state[id] = VehicleState.BrokenDown;
  vehicles.speedMs[id] = 0;
  vehicles.breakdownTicks[id] = ticks;
}

/** Put paid cargo aboard so the arrival is measurable as revenue. */
function loadParcel(bench: Bench, id: number, destinationStationId: number): void {
  bench.world.vehicles.cargo[id]!.push({
    cargo: Cargo.Passengers,
    amount: 10,
    createdTick: bench.world.tick,
    originStationId: 0,
    destinationStationId,
    paidFromX: 10,
    paidFromY: 10,
  });
  bench.world.vehicles.refreshAggregate(id);
}

/** Step until the vehicle stands on `targetTile`, or the tick budget runs out. */
function driveUntilArrival(bench: Bench, id: number, targetTile: number, budget: number): boolean {
  for (let i = 0; i < budget; i++) {
    bench.world.step(bench.queue, null);
    if (bench.world.vehicles.tileIndex[id] === targetTile) return true;
  }
  return false;
}

/**
 * Rail line with a diagonal leg, so the route-length arithmetic runs over
 * mixed 50 m and 70.71 m steps - the mix the Float32 accumulator needs to
 * drift away from the recomputed float64 step. A straight line of identical
 * integer steps subtracts exactly and cannot produce the sliver.
 */
function railBench(): { bench: Bench; targetTile: number } {
  const bench = flatWorld();
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: 10,
    y1: 10,
    x2: 30,
    y2: 10,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: 30,
    y1: 10,
    x2: 40,
    y2: 20,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  run(bench, { kind: CommandKind.BuildRailStop, x: 10, y: 10, moduleKind: ModuleKind.RailDepot });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: 40,
    y: 20,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [RAILBUS] });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [{ target: 0, targetId: 1, load: 2, unload: 0 }],
  });
  loadParcel(bench, 0, 1);
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  return { bench, targetTile: bench.world.map.tileIndex(40, 20) };
}

describe('a dead stop on the final approach (D-157)', () => {
  it('a train that stops exactly ON its brake target still crosses the last boundary', () => {
    const { bench, targetTile } = railBench();
    const vehicles = bench.world.vehicles;

    // Drive onto the second-to-last path node - the state D-156 measured.
    let onFinalNode = false;
    for (let i = 0; i < 6_000 && !onFinalNode; i++) {
      bench.world.step(bench.queue, null);
      onFinalNode =
        vehicles.pathLength[0]! > 0 && vehicles.pathIndex[0]! === vehicles.pathLength[0]! - 2;
    }
    expect(onFinalNode).toBe(true);

    // The mid-brake breakdown, landed exactly on the brake's own target:
    // remaining = routeRemainingM - progressM = 0 at a dead stop.
    breakDown(bench, 0, 60);
    vehicles.progressM[0] = vehicles.routeRemainingM[0]!;

    expect(driveUntilArrival(bench, 0, targetTile, 2_000)).toBe(true);
    expect(vehicles.earnedCt[0]!).toBeGreaterThan(0);
  });

  it('a train broken down mid-brake still arrives and earns', () => {
    const { bench, targetTile } = railBench();
    const vehicles = bench.world.vehicles;

    // Drive until the arrival brake has begun...
    let braked = false;
    for (let i = 0; i < 6_000 && !braked; i++) {
      bench.world.step(bench.queue, null);
      braked = vehicles.state[0] === VehicleState.Braking;
    }
    expect(braked).toBe(true);

    // ...then 258 ticks deeper into it: the offset at which this bench's
    // measured post-repair creep landed inside the sliver and froze for ever
    // before the fix (a scan over 300 breakdown timings froze exactly there).
    // Under the fixed gate every offset arrives; this one is kept because it
    // is the one that was measured freezing.
    for (let i = 0; i < 258; i++) bench.world.step(bench.queue, null);
    breakDown(bench, 0, 60);

    expect(driveUntilArrival(bench, 0, targetTile, 20_000)).toBe(true);
    expect(vehicles.earnedCt[0]!).toBeGreaterThan(0);
  });

  it('the deadlock clock sees a train standing still that holds its whole approach', () => {
    const { bench } = railBench();
    const vehicles = bench.world.vehicles;

    // Mid-route, well clear of both ends, with the claim extended ahead.
    for (let i = 0; i < 400; i++) bench.world.step(bench.queue, null);
    expect(vehicles.state[0]).toBe(VehicleState.Driving);
    expect(vehicles.pathIndex[0]!).toBeGreaterThan(2);
    expect(vehicles.pathIndex[0]!).toBeLessThan(vehicles.pathLength[0]! - 4);
    expect(vehicles.reservedToIndex[0]!).toBeGreaterThan(vehicles.pathIndex[0]!);

    // Forced to a stand. One tick later it is still below standing speed -
    // and the clock must be running, although the train holds its whole
    // approach (the D-083 test "holds nothing beyond its own body" was blind
    // exactly here).
    vehicles.speedMs[0] = 0;
    bench.world.step(bench.queue, null);
    expect(vehicles.waitingSinceTick[0]!).toBeGreaterThanOrEqual(0);

    // Rolling again clears it.
    for (let i = 0; i < 60; i++) bench.world.step(bench.queue, null);
    expect(vehicles.speedMs[0]!).toBeGreaterThan(1);
    expect(vehicles.waitingSinceTick[0]).toBe(-1);
  });

  it('a bus broken down mid-brake still arrives and earns (shared gate)', () => {
    const bench = flatWorld();
    run(bench, { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 40, y2: 10 });
    run(bench, { kind: CommandKind.BuildRoadStop, x: 11, y: 10, moduleKind: ModuleKind.RoadDepot });
    run(bench, { kind: CommandKind.BuildRoadStop, x: 12, y: 10, moduleKind: ModuleKind.BusStop });
    run(bench, { kind: CommandKind.BuildRoadStop, x: 40, y: 10, moduleKind: ModuleKind.BusStop });
    run(bench, { kind: CommandKind.BuyRoadVehicle, x: 11, y: 10, specId: BUS });
    // Stations 0 (depot+near stop) and 1 (far stop); the far stop is the order.
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: 1, load: 2, unload: 0 }],
    });
    loadParcel(bench, 0, 1);
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
    const vehicles = bench.world.vehicles;
    const targetTile = bench.world.map.tileIndex(40, 10);

    let braked = false;
    for (let i = 0; i < 6_000 && !braked; i++) {
      bench.world.step(bench.queue, null);
      braked = vehicles.state[0] === VehicleState.Braking;
    }
    expect(braked).toBe(true);
    breakDown(bench, 0, 60);

    expect(driveUntilArrival(bench, 0, targetTile, 20_000)).toBe(true);
    expect(vehicles.earnedCt[0]!).toBeGreaterThan(0);
  });

  it('an aircraft that stops exactly ON its brake target still lands (shared gate)', () => {
    const bench = flatWorld();
    bench.world.company.cashCt = 500_000_000_00;
    // Diagonal flight: every step is 70.71 m, so the accumulator drifts.
    run(bench, { kind: CommandKind.BuildAirport, x: 10, y: 10, moduleKind: ModuleKind.Airstrip });
    run(bench, { kind: CommandKind.BuildAirport, x: 40, y: 40, moduleKind: ModuleKind.Airstrip });
    run(bench, { kind: CommandKind.BuyAircraft, x: 10, y: 10, specId: PROP });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: 1, load: 2, unload: 0 }],
    });
    loadParcel(bench, 0, 1);
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
    const vehicles = bench.world.vehicles;

    let onFinalNode = false;
    for (let i = 0; i < 6_000 && !onFinalNode; i++) {
      bench.world.step(bench.queue, null);
      onFinalNode =
        vehicles.pathLength[0]! > 0 && vehicles.pathIndex[0]! === vehicles.pathLength[0]! - 2;
    }
    expect(onFinalNode).toBe(true);

    breakDown(bench, 0, 60);
    vehicles.progressM[0] = vehicles.routeRemainingM[0]!;

    const targetTile = vehicles.paths[0]![vehicles.pathLength[0]! - 1]!;
    expect(driveUntilArrival(bench, 0, targetTile, 4_000)).toBe(true);
    expect(vehicles.earnedCt[0]!).toBeGreaterThan(0);
  });
});
