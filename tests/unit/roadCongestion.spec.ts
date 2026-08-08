import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  MAX_CONGESTED_TILES,
  ROAD_CONGESTION_EPOCH_TICKS,
  ROAD_CONGESTION_UNITS_PER_ENTRY,
} from '../../src/sim/constants';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { TileMap } from '../../src/sim/map/TileMap';
import { RoadCongestion, roadSpeedFactor } from '../../src/sim/net/congestion';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The road half of SPEC.md 8.4 (SPEC2 M15, E-02/E-03), closing D-129: the
 * saved congestion layer, the A* term it feeds, the speed cap a vehicle meets
 * on a busy tile, and the level crossing that closes while a train holds it.
 *
 * The fixture is a LADDER, and that is the decision: the two ways round the
 * middle are mirror images - one step off the main line, fourteen straight,
 * one step back - so they cost the identical number of tile equivalents by
 * construction. Nothing here passes because a constant was tuned to a
 * hand-measured detour; the only thing that separates the two branches is the
 * traffic on them. The stretch west of the split is the bottleneck: every
 * journey crosses it and no route avoids it.
 *
 *              (16,19) --------------- (30,19)      north branch
 *             /                               \
 *  (10,20) - (16,20)                       (30,20) - (34,20)
 *             \                               /
 *              (16,21) --------------- (30,21)      south branch
 */

// A power of two, which is what the save format accepts.
const SIZE = 128;
const GROUND = 5;

/** The 1950 bulk lorry - the vehicle SPEC2 M15's acceptance number names. */
const LORRY = 240;

/** The acceptance number itself: 200 lorries on one bottleneck. */
const FLEET = 200;

/**
 * Ticks between two departures. One real second, so the bottleneck sees a
 * steady stream rather than one block of two hundred: a fleet that leaves
 * together routes every vehicle against the same empty layer, crosses in one
 * bunch and leaves an empty road behind it - which would measure the window's
 * decay rather than the traffic.
 */
const STAGGER_TICKS = 20;

const MAIN_Y = 20;
const NORTH_Y = 19;
const SOUTH_Y = 21;
const WEST_X = 10;
const SPLIT_X = 16;
const MERGE_X = 30;
const EAST_X = 34;

/** A vehicle id no road vehicle in these worlds carries. */
const FOREIGN = 900;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

function flatWorld(roadCongestion: boolean): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 4711,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Fuhrpark AG',
      companyColorIndex: 1,
      roadCongestion,
    },
    { map, towns: [], industries: [], seedUsed: 4711 },
  );
  // A fixture act, not an economic claim: 200 lorries cost more than any
  // credit line, and this test is about traffic, not about affording it.
  world.company.cashCt = 900_000_000_00;
  return { world, queue: new CommandQueue() };
}

function road(bench: Bench, x1: number, y1: number, x2: number, y2: number): void {
  run(bench, { kind: CommandKind.BuildRoad, x1, y1, x2, y2 });
}

/**
 * The ladder: main line, two mirror branches, and the bottleneck in front.
 *
 * Built as four segments that each add tiles nobody has laid yet - a segment
 * whose every tile already carries road is refused as nothing to do, which is
 * why the two uprights come first and the main line runs into them.
 */
function ladder(bench: Bench): void {
  road(bench, SPLIT_X, NORTH_Y, SPLIT_X, SOUTH_Y);
  road(bench, MERGE_X, NORTH_Y, MERGE_X, SOUTH_Y);
  road(bench, SPLIT_X, NORTH_Y, MERGE_X, NORTH_Y);
  road(bench, SPLIT_X, SOUTH_Y, MERGE_X, SOUTH_Y);
  road(bench, WEST_X, MAIN_Y, SPLIT_X, MAIN_Y);
  road(bench, MERGE_X, MAIN_Y, EAST_X, MAIN_Y);
}

/**
 * Stops at both ends, a depot beside the western one, and `count` lorries in
 * it - started one real second apart so the fleet meets the road as a stream.
 */
function crewedLadder(bench: Bench, count: number): void {
  ladder(bench);
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: WEST_X + 1,
    y: MAIN_Y,
    moduleKind: ModuleKind.LorryBay,
  });
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: WEST_X,
    y: MAIN_Y,
    moduleKind: ModuleKind.RoadDepot,
  });
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: EAST_X,
    y: MAIN_Y,
    moduleKind: ModuleKind.LorryBay,
  });
  expect(bench.world.stations.length).toBe(2);

  for (let i = 0; i < count; i++) {
    run(bench, { kind: CommandKind.BuyRoadVehicle, x: WEST_X, y: MAIN_Y, specId: LORRY });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: bench.world.vehicles.count - 1,
      orders: [
        { target: 0, targetId: 0, load: 1, unload: 0 },
        { target: 0, targetId: 1, load: 1, unload: 0 },
      ],
    });
  }
  // In one monotone pass over the queue, which is the only order it accepts.
  for (let i = 0; i < count; i++) {
    bench.queue.enqueue(
      { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true },
      bench.world.tick + i * STAGGER_TICKS + 1,
    );
  }
}

function advance(bench: Bench, ticks: number): void {
  for (let i = 0; i < ticks; i++) bench.world.step(bench.queue, null);
}

/** Which branch row this vehicle's current route uses, or -1 for neither. */
function branchOf(world: World, id: number): number {
  const path = world.vehicles.paths[id]!;
  for (let i = 0; i < world.vehicles.pathLength[id]!; i++) {
    const y = (path[i]! / SIZE) | 0;
    if (y === NORTH_Y) return NORTH_Y;
    if (y === SOUTH_Y) return SOUTH_Y;
  }
  return -1;
}

/**
 * How many vehicles heading for the given station are on each branch right
 * now. Split by DIRECTION because a route is a pure function of its two ends:
 * without the congestion term every vehicle going the same way has to be on
 * the same branch, and that is the property under test.
 */
function census(world: World, targetStation: number): { north: number; south: number } {
  const vehicles = world.vehicles;
  let north = 0;
  let south = 0;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (vehicles.pathLength[id]! === 0) continue;
    const orders = vehicles.orders[id]!;
    const order = orders[vehicles.orderIndex[id]! % orders.length];
    if (order === undefined || order.targetId !== targetStation) continue;
    const branch = branchOf(world, id);
    if (branch === NORTH_Y) north++;
    else if (branch === SOUTH_Y) south++;
  }
  return { north, south };
}

/** The busiest tile of the bottleneck - the stretch every journey crosses. */
function bottleneckPeak(world: World): number {
  let peak = 0;
  for (let x = WEST_X + 2; x < SPLIT_X; x++) {
    const value = world.map.congestion[world.map.tileIndex(x, MAIN_Y)]!;
    if (value > peak) peak = value;
  }
  return peak;
}

// ------------------------------------------------------------- the layer

describe('the congestion layer under 200 lorries', () => {
  it('builds measurable congestion on the bottleneck and nowhere else', () => {
    const bench = flatWorld(true);
    crewedLadder(bench, FLEET);
    advance(bench, 3_000);

    const world = bench.world;
    // The acceptance number of SPEC2 M15: 200 lorries on one bottleneck.
    expect(world.vehicles.livingCount).toBe(FLEET);

    // "Measurable" in the layer's own units: four vehicles in the 200-tick
    // window is what doubles a tile's A* cost, and the bottleneck is far past
    // that - a queue, not a trickle.
    const peak = bottleneckPeak(world);
    console.log(
      `bottleneck under ${FLEET} lorries: peak ${peak} units = ` +
        `${(peak / ROAD_CONGESTION_UNITS_PER_ENTRY).toFixed(1)} vehicles per 200-tick window, ` +
        `${world.congestion.count} tiles listed of ${world.map.tileCount}`,
    );
    expect(peak).toBeGreaterThanOrEqual(4 * ROAD_CONGESTION_UNITS_PER_ENTRY);

    // A road tile of the ladder that no journey uses stays at zero: the layer
    // records traffic, not roads.
    const unused = world.map.tileIndex(WEST_X, MAIN_Y);
    expect(world.map.congestion[unused]).toBe(0);

    // The dirty list is the working set, not the map (SPEC2 E-02).
    expect(world.congestion.count).toBeGreaterThan(0);
    expect(world.congestion.count).toBeLessThan(world.map.tileCount / 10);
  });

  it('records nothing at all with the rule off', () => {
    const bench = flatWorld(false);
    crewedLadder(bench, FLEET);
    advance(bench, 3_000);

    expect(bench.world.congestion.count).toBe(0);
    let sum = 0;
    for (const value of bench.world.map.congestion) sum += value;
    expect(sum).toBe(0);
  });
});

// ------------------------------------------------------- the two-route test

describe('the two-route test', () => {
  /** The fleet after long enough that every vehicle has routed several times. */
  function circulated(roadCongestion: boolean): World {
    const bench = flatWorld(roadCongestion);
    crewedLadder(bench, FLEET);
    advance(bench, 6_000);
    return bench.world;
  }

  it('sends journeys the other way round once the natural branch is busy', () => {
    // Rule off: a route is a pure function of its two ends, so every vehicle
    // heading the same way is on the SAME branch - the fleet has no choice.
    const plain = circulated(false);
    const plainEast = census(plain, 1);
    const plainWest = census(plain, 0);
    expect(plainEast.north + plainEast.south).toBeGreaterThan(10);
    expect(plainWest.north + plainWest.south).toBeGreaterThan(10);
    expect(Math.min(plainEast.north, plainEast.south)).toBe(0);
    expect(Math.min(plainWest.north, plainWest.south)).toBe(0);

    // Rule on: the same fixture, one flag, and journeys demonstrably take the
    // alternative route - in BOTH directions, because the congestion a
    // journey causes is what the next one is priced against.
    const busy = circulated(true);
    const busyEast = census(busy, 1);
    const busyWest = census(busy, 0);
    console.log(
      `two-route census (north/south) - rule off: eastbound ${plainEast.north}/${plainEast.south}, ` +
        `westbound ${plainWest.north}/${plainWest.south}; rule on: eastbound ` +
        `${busyEast.north}/${busyEast.south}, westbound ${busyWest.north}/${busyWest.south}`,
    );
    expect(busyEast.north).toBeGreaterThan(0);
    expect(busyEast.south).toBeGreaterThan(0);
    expect(busyWest.north).toBeGreaterThan(0);
    expect(busyWest.south).toBeGreaterThan(0);
  });

  it('leaves the search untouched when the rule is off, whatever the layer holds', () => {
    // The inertness property every pre-M15 seed lives on. The layer is loaded
    // by hand here, because a world with the rule off never fills it itself.
    const bench = flatWorld(false);
    ladder(bench);
    const world = bench.world;
    const before = new Int32Array(512);
    const after = new Int32Array(512);

    const from = world.map.tileIndex(WEST_X, MAIN_Y);
    const to = world.map.tileIndex(EAST_X, MAIN_Y);
    const clean = world.roadPathfinder.find(world.map, from, to, false, before);
    expect(clean).toBeGreaterThan(0);

    const natural = (before[clean >> 1]! / SIZE) | 0;
    for (let x = SPLIT_X; x <= MERGE_X; x++) {
      world.map.congestion[world.map.tileIndex(x, natural)] = 255;
    }
    expect(world.roadPathfinder.find(world.map, from, to, false, after)).toBe(clean);
    for (let i = 0; i < clean; i++) expect(after[i]).toBe(before[i]);

    // And with the rule on, the same layer moves the route - so the test
    // above proves inertness rather than an unreachable fixture.
    const diverted = world.roadPathfinder.find(world.map, from, to, true, after);
    expect(diverted).toBeGreaterThan(0);
    let usesNatural = false;
    for (let i = 0; i < diverted; i++) {
      if (((after[i]! / SIZE) | 0) === natural) usesNatural = true;
    }
    expect(usesNatural).toBe(false);
  });
});

// ------------------------------------------------------------ save and load

describe('the layer survives a save', () => {
  it('reloads bit-identically, hash included', () => {
    const bench = flatWorld(true);
    crewedLadder(bench, 40);
    advance(bench, 2_000);

    const world = bench.world;
    let sum = 0;
    for (const value of world.map.congestion) sum += value;
    expect(sum).toBeGreaterThan(0);
    const before = hashWorld(world);
    const listed = world.congestion.count;
    expect(listed).toBeGreaterThan(0);

    const loaded = decodeSave(encodeSave(world, bench.queue, 'test'));

    // The Fertig-wenn of SPEC2 M15 asks for exactly this: hash equality
    // across the round trip. It is what a DERIVED layer could not give -
    // the loaded world would price its roads differently from the saved one.
    expect(hashWorld(loaded.world)).toBe(before);
    for (let tile = 0; tile < world.map.tileCount; tile++) {
      expect(loaded.world.map.congestion[tile]).toBe(world.map.congestion[tile]);
    }
    // ...and the derived dirty list is rebuilt from it, not stored.
    expect(loaded.world.congestion.count).toBe(listed);
  });
});

// ---------------------------------------------------------------- the decay

describe('the decay is epoch-lazy', () => {
  it('sweeps the dirty list once per epoch and never the map', () => {
    const bench = flatWorld(true);
    crewedLadder(bench, 40);
    advance(bench, 1_000);

    const world = bench.world;
    const window = 400;
    const spy = vi.spyOn(world.congestion, 'decay');
    advance(bench, window);

    const calls = spy.mock.results.map((result) => result.value as number);
    spy.mockRestore();

    // One sweep per epoch, not one per tick.
    expect(calls.length).toBe(window / ROAD_CONGESTION_EPOCH_TICKS);
    // Every sweep walked the tiles that carry traffic, and nothing else: a
    // per-tick scan of this map would be twenty times its 16,384 tiles over
    // the same window.
    const worked = calls.reduce((total, value) => total + value, 0);
    expect(Math.max(...calls)).toBeGreaterThan(0);
    expect(Math.max(...calls)).toBeLessThan(world.map.tileCount / 10);
    expect(worked).toBeLessThan(world.map.tileCount);
  });

  it('never sweeps with the rule off', () => {
    const bench = flatWorld(false);
    crewedLadder(bench, 10);
    advance(bench, 200);
    const spy = vi.spyOn(bench.world.congestion, 'decay');
    advance(bench, 400);
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(0);
  });

  it('brings a tile back to zero and drops it from the list', () => {
    const layer = new Uint8Array(64);
    const field = new RoadCongestion();
    field.note(layer, 7);
    expect(layer[7]).toBe(ROAD_CONGESTION_UNITS_PER_ENTRY);
    expect(field.count).toBe(1);

    // Rounded-up losses are what make this terminate instead of approaching
    // zero for ever.
    let epochs = 0;
    while (field.count > 0 && epochs < 100) {
      field.decay(layer);
      epochs++;
    }
    expect(layer[7]).toBe(0);
    expect(field.count).toBe(0);
    expect(epochs).toBeLessThan(20);
  });

  it('refuses a tile past the cap rather than recording one it cannot decay', () => {
    const layer = new Uint8Array(MAX_CONGESTED_TILES + 4);
    const field = new RoadCongestion();
    for (let tile = 0; tile < layer.length; tile++) field.note(layer, tile);

    expect(field.count).toBe(MAX_CONGESTED_TILES);
    expect(layer[MAX_CONGESTED_TILES - 1]).toBe(ROAD_CONGESTION_UNITS_PER_ENTRY);
    // The refused tile keeps NOTHING: a value the sweep can never reach again
    // would be a phantom jam in the A* costs for the rest of the game.
    expect(layer[MAX_CONGESTED_TILES]).toBe(0);
  });
});

// ----------------------------------------------------------- the speed cap

describe('the leader speed cap', () => {
  it('is one for a vehicle alone on its tile and falls with the traffic ahead', () => {
    expect(roadSpeedFactor(0)).toBe(1);
    // A vehicle's OWN entry never slows it: what it queues behind is the
    // traffic that went through ahead of it.
    expect(roadSpeedFactor(ROAD_CONGESTION_UNITS_PER_ENTRY)).toBe(1);
    expect(roadSpeedFactor(4 * ROAD_CONGESTION_UNITS_PER_ENTRY)).toBeLessThan(1);
    expect(roadSpeedFactor(255)).toBeLessThan(roadSpeedFactor(128));
    expect(roadSpeedFactor(255)).toBeGreaterThan(0);
  });

  /** One lorry on a straight road, with the middle of it already saturated. */
  function soloRun(roadCongestion: boolean): { speed: number; top: number; factor: number } {
    const bench = flatWorld(roadCongestion);
    road(bench, WEST_X, MAIN_Y, EAST_X, MAIN_Y);
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: WEST_X + 1,
      y: MAIN_Y,
      moduleKind: ModuleKind.LorryBay,
    });
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: WEST_X,
      y: MAIN_Y,
      moduleKind: ModuleKind.RoadDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: EAST_X,
      y: MAIN_Y,
      moduleKind: ModuleKind.LorryBay,
    });
    run(bench, { kind: CommandKind.BuyRoadVehicle, x: WEST_X, y: MAIN_Y, specId: LORRY });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        { target: 0, targetId: 0, load: 1, unload: 0 },
        { target: 0, targetId: 1, load: 1, unload: 0 },
      ],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    const world = bench.world;
    const jam = 255;
    const from = WEST_X + 8;
    const to = EAST_X - 4;

    let speed = 0;
    for (let i = 0; i < 4_000; i++) {
      // Held saturated: this test is about what a vehicle may drive on a busy
      // tile, not about how the tile got busy.
      for (let x = from; x <= to; x++) world.map.congestion[world.map.tileIndex(x, MAIN_Y)] = jam;
      world.step(bench.queue, null);
      const x = world.vehicles.tileIndex[0]! % SIZE;
      // Two tiles inside the jam at BOTH ends: the tick a vehicle crosses
      // into the stretch was priced by the free tile it came from, and on the
      // way back the far end is that boundary.
      if (x < from + 2 || x > to - 2) continue;
      if (world.vehicles.state[0] !== VehicleState.Driving) continue;
      if (world.vehicles.speedMs[0]! > speed) speed = world.vehicles.speedMs[0]!;
    }
    return { speed, top: world.vehicles.maxSpeedMs[0]!, factor: roadSpeedFactor(jam) };
  }

  it('holds a lorry below its top speed on a saturated tile, and not with the rule off', () => {
    const capped = soloRun(true);
    expect(capped.speed).toBeGreaterThan(0);
    expect(capped.speed).toBeLessThanOrEqual(capped.top * capped.factor + 1e-9);
    expect(capped.speed).toBeLessThan(capped.top);

    const free = soloRun(false);
    expect(free.speed).toBeGreaterThan(capped.top * capped.factor);
  });
});

// ------------------------------------------------------- the level crossing

describe('the level crossing', () => {
  /**
   * A straight road with a single track crossing it. The claim is written
   * into the ONE reservation table by hand (the railRules.spec.ts idiom):
   * what closes the crossing is a claim, and whose claim it is does not
   * matter to the road.
   */
  function crossingBench(roadCongestion: boolean): { bench: Bench; crossing: number } {
    const bench = flatWorld(roadCongestion);
    road(bench, WEST_X, MAIN_Y, EAST_X, MAIN_Y);
    const crossX = WEST_X + 12;
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: crossX,
      y1: MAIN_Y - 3,
      x2: crossX,
      y2: MAIN_Y + 3,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: WEST_X + 1,
      y: MAIN_Y,
      moduleKind: ModuleKind.LorryBay,
    });
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: WEST_X,
      y: MAIN_Y,
      moduleKind: ModuleKind.RoadDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRoadStop,
      x: EAST_X,
      y: MAIN_Y,
      moduleKind: ModuleKind.LorryBay,
    });
    run(bench, { kind: CommandKind.BuyRoadVehicle, x: WEST_X, y: MAIN_Y, specId: LORRY });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        { target: 0, targetId: 0, load: 1, unload: 0 },
        { target: 0, targetId: 1, load: 1, unload: 0 },
      ],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    const crossing = bench.world.map.tileIndex(crossX, MAIN_Y);
    // It really is one: both layers on one tile.
    expect(bench.world.map.roadBits[crossing]).not.toBe(0);
    expect(bench.world.map.trackBits[crossing]).not.toBe(0);
    return { bench, crossing };
  }

  /** Run until the lorry stands on the tile before the crossing, or give up. */
  function runUpToCrossing(bench: Bench, crossing: number, limit: number): boolean {
    const vehicles = bench.world.vehicles;
    for (let i = 0; i < limit; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.tileIndex[0] === crossing) return false;
      if (vehicles.tileIndex[0] === crossing - 1 && vehicles.speedMs[0] === 0) return true;
    }
    return false;
  }

  it('holds road traffic while a train holds the crossing, and lets it go again', () => {
    const { bench, crossing } = crossingBench(true);
    bench.world.reservations.set(crossing, FOREIGN);

    expect(runUpToCrossing(bench, crossing, 4_000)).toBe(true);

    // Still standing a hundred ticks later: this is a gate, not a stutter.
    advance(bench, 100);
    expect(bench.world.vehicles.tileIndex[0]).toBe(crossing - 1);
    expect(bench.world.vehicles.speedMs[0]).toBe(0);

    // The barriers rise with the claim, and nothing else has to happen.
    bench.world.reservations.clearIfOwnedBy(crossing, FOREIGN);
    advance(bench, 400);
    expect(bench.world.vehicles.tileIndex[0]! % SIZE).toBeGreaterThan(crossing % SIZE);
  });

  it('does not exist with the rule off', () => {
    const { bench, crossing } = crossingBench(false);
    bench.world.reservations.set(crossing, FOREIGN);
    expect(runUpToCrossing(bench, crossing, 4_000)).toBe(false);
    expect(bench.world.vehicles.tileIndex[0]).not.toBe(crossing - 1);
  });
});
