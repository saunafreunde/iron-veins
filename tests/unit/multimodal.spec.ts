import { describe, expect, it } from 'vitest';
import { deliveryRevenueCt, tileDistance } from '../../src/sim/cargo/payment';
import { depositAtStation } from '../../src/sim/cargo/routing';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  SEA_LEVEL,
  START_YEAR,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { INDUSTRY_SPECS, IndustryType, newIndustry } from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { computeLandmasses, floodSeaLevel, markOcean } from '../../src/sim/mapgen/hydrology';
import { ModuleKind, type Station } from '../../src/sim/station/types';
import { World } from '../../src/sim/World';

/**
 * The acceptance case of M7: lorry -> train -> ship -> lorry across the map,
 * billed correctly.
 *
 * It is the M5 chain with a water leg spliced into the middle, and that is the
 * point of it. Nothing in the cargo routing knows what a ship is: a parcel is
 * loaded by whatever vehicle carries it closer to its destination and set down
 * where its route changes lines, and a berth is a station module like any
 * other. If the three-leg chain of M5 was right, the four-leg one falls out.
 *
 * What is genuinely new here and worth a test of its own: a ship must find its
 * way over water and must refuse to be routed over land, however short the cut.
 */

const SIZE = 128;
const GROUND = 5;
const ROW = 20;

/**
 * The chain runs west to east along one row, so the four legs add up exactly.
 *
 * The rail head and the west quay are three tiles apart, and the east quay and
 * the far road stop likewise: within the four tile join distance, so each pair
 * is ONE station with one cargo pool. That is what makes them transfer points
 * rather than two stations that happen to be near each other (section 10).
 */
const ROAD_DEPOT_X = 2;
const MINE_STOP_X = 8;
/** Where the lorry hands over to the train: a bay and a platform, one station. */
const RAIL_HEAD_ROAD_X = 16;
const RAIL_HEAD_RAIL_X = 18;
const RAIL_DEPOT_X = 20;
/** Where the train hands over to the ship: a platform and a quay, one station. */
const RAIL_PORT_X = 27;
/** The water gap: everything between these is sea. */
const WEST_QUAY_X = 30;
const EAST_QUAY_X = 70;
/**
 * The shed sits beside the west quay rather than out in the channel: a water
 * module has to touch the shore, and the middle of a strait does not.
 */
const SHIP_DEPOT_X = WEST_QUAY_X;
const SHIP_DEPOT_Y = ROW + 1;
const EAST_ROAD_X = 73;
const PLANT_STOP_X = 88;
const EAST_DEPOT_X = 94;

const PLANT_X = 88;
const INDUSTRY_ROW = ROW + 2;

const LORRY = 240;
const LOCO = 1000;
const WAGON = 1520;
const COASTER = 2000;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_e, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

function stationOn(world: World, x: number, y: number): Station {
  const tile = world.map.tileIndex(x, y);
  for (const station of world.stations) {
    for (const module of station.modules) {
      if (module.tileIndex === tile) return station;
    }
  }
  throw new Error(`no station on ${x},${y}`);
}

/**
 * Flat land with a channel of open sea cut through the middle.
 *
 * The channel is dug the way the game digs one - by putting the corner heights
 * under the sea level and letting `floodSeaLevel` decide what is water - so the
 * fixture cannot drift away from what a player's terraforming would produce.
 */
function chainMap(): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  for (let y = 0; y < SIZE; y++) {
    for (let x = WEST_QUAY_X; x <= EAST_QUAY_X + 1; x++) {
      // A corner belongs to the four tiles around it, so the channel is dug one
      // corner wider than the tiles it is meant to flood.
      map.cornerHeight[y * (SIZE + 1) + x] = SEA_LEVEL - 1;
      map.cornerHeight[(y + 1) * (SIZE + 1) + x] = SEA_LEVEL - 1;
    }
  }
  floodSeaLevel(map);
  markOcean(map);
  computeLandmasses(map);
  return map;
}

/** The whole chain, west to east: lorry, train, ship, lorry. */
function chain(): Bench {
  const map = chainMap();
  // Only the power plant. A mine at the near end would keep producing, every
  // vehicle would make a dozen payments, and no single one of them could be
  // checked against the formula - so the one batch that IS checked is put on
  // the platform by hand.
  const industries = [newIndustry(0, IndustryType.PowerPlant, PLANT_X, INDUSTRY_ROW, 0)];
  for (const industry of industries) {
    const size = INDUSTRY_SPECS[industry.type]!.footprint;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        map.industryId[map.tileIndex(industry.x + dx, industry.y + dy)] = industry.id;
      }
    }
  }

  const world = World.fromGenerated(
    {
      seed: 17,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Seeweg AG',
      companyColorIndex: 6,
    },
    { map, towns: [], industries, seedUsed: 17 },
  );
  world.company.cashCt = 500_000_000_00;
  const bench: Bench = { world, queue: new CommandQueue() };

  // West side: road from the shed to the rail head, then rail on to the port.
  run(bench, {
    kind: CommandKind.BuildRoad,
    x1: ROAD_DEPOT_X,
    y1: ROW,
    x2: RAIL_HEAD_ROAD_X,
    y2: ROW,
  });
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: RAIL_HEAD_RAIL_X,
    y1: ROW,
    x2: RAIL_PORT_X,
    y2: ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });

  // East side: road from the far quay past the power plant to its shed.
  run(bench, { kind: CommandKind.BuildRoad, x1: EAST_ROAD_X, y1: ROW, x2: EAST_DEPOT_X, y2: ROW });

  const stops: Array<[number, ModuleKind]> = [
    [ROAD_DEPOT_X, ModuleKind.RoadDepot],
    [MINE_STOP_X, ModuleKind.LorryBay],
    [RAIL_HEAD_ROAD_X, ModuleKind.LorryBay],
    [EAST_ROAD_X, ModuleKind.LorryBay],
    [PLANT_STOP_X, ModuleKind.LorryBay],
    [EAST_DEPOT_X, ModuleKind.RoadDepot],
  ];
  for (const [x, kind] of stops) {
    run(bench, { kind: CommandKind.BuildRoadStop, x, y: ROW, moduleKind: kind });
  }
  for (const [x, kind] of [
    [RAIL_HEAD_RAIL_X, ModuleKind.RailPlatform],
    [RAIL_PORT_X, ModuleKind.RailPlatform],
    [RAIL_DEPOT_X, ModuleKind.RailDepot],
  ] as const) {
    run(bench, { kind: CommandKind.BuildRailStop, x, y: ROW, moduleKind: kind });
  }

  // The two ports. Each quay stands on water within the join distance of the
  // land stop it belongs to, which is what makes them one station.
  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: WEST_QUAY_X,
    y: ROW,
    moduleKind: ModuleKind.Quay,
  });
  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: SHIP_DEPOT_X,
    y: SHIP_DEPOT_Y,
    moduleKind: ModuleKind.ShipDepot,
  });
  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: EAST_QUAY_X,
    y: ROW,
    moduleKind: ModuleKind.Quay,
  });

  const mineStop = stationOn(world, MINE_STOP_X, ROW);
  const railHead = stationOn(world, RAIL_HEAD_ROAD_X, ROW);
  const railPort = stationOn(world, RAIL_PORT_X, ROW);
  const seaPort = stationOn(world, EAST_QUAY_X, ROW);
  const plantStop = stationOn(world, PLANT_STOP_X, ROW);

  // Each transfer point really is ONE station, or the chain is four unrelated
  // shuttles rather than a chain.
  expect(stationOn(world, RAIL_HEAD_RAIL_X, ROW).id).toBe(railHead.id);
  expect(stationOn(world, WEST_QUAY_X, ROW).id).toBe(railPort.id);
  expect(stationOn(world, EAST_ROAD_X, ROW).id).toBe(seaPort.id);

  // Leg 1: the lorry from the mine stop to the rail head.
  run(bench, { kind: CommandKind.BuyRoadVehicle, x: ROAD_DEPOT_X, y: ROW, specId: LORRY });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 0, cargo: Cargo.Coal });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      { target: 0, targetId: mineStop.id, load: 1, unload: 0 },
      { target: 0, targetId: railHead.id, load: 1, unload: 0 },
    ],
  });

  // Leg 2: the train from the rail head to the west quay's station.
  run(bench, { kind: CommandKind.BuyTrain, x: RAIL_DEPOT_X, y: ROW, specIds: [LOCO, WAGON] });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 1, cargo: Cargo.Coal });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 1,
    orders: [
      { target: 0, targetId: railHead.id, load: 1, unload: 0 },
      { target: 0, targetId: railPort.id, load: 1, unload: 0 },
    ],
  });

  // Leg 3: the ship across the water.
  run(bench, { kind: CommandKind.BuyShip, x: SHIP_DEPOT_X, y: SHIP_DEPOT_Y, specId: COASTER });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 2, cargo: Cargo.Coal });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 2,
    orders: [
      { target: 0, targetId: railPort.id, load: 1, unload: 0 },
      { target: 0, targetId: seaPort.id, load: 1, unload: 0 },
    ],
  });

  // Leg 4: the lorry from the far quay to the power plant.
  run(bench, { kind: CommandKind.BuyRoadVehicle, x: EAST_DEPOT_X, y: ROW, specId: LORRY });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 3, cargo: Cargo.Coal });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 3,
    orders: [
      { target: 0, targetId: seaPort.id, load: 1, unload: 0 },
      { target: 0, targetId: plantStop.id, load: 1, unload: 0 },
    ],
  });

  for (let id = 0; id < 4; id++) {
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
  }
  return bench;
}

describe('a ship on open water', () => {
  it('finds its way along the channel', () => {
    const bench = chain();
    const world = bench.world;
    const path = new Int32Array(2_048);

    const from = world.map.tileIndex(WEST_QUAY_X, ROW);
    const to = world.map.tileIndex(EAST_QUAY_X, ROW);
    const length = world.waterPathfinder.find(world.map, from, to, path);

    expect(length).toBeGreaterThan(0);
    expect(path[0]).toBe(from);
    expect(path[length - 1]).toBe(to);
    // Every step of it is water. A ship that cut a corner over a beach would be
    // the whole failure this pathfinder exists to prevent.
    for (let i = 0; i < length; i++) {
      expect(world.map.terrain[path[i]!]).toBe(Terrain.Water);
    }
  });

  it('refuses a destination on dry land, however close', () => {
    const bench = chain();
    const world = bench.world;
    const path = new Int32Array(2_048);

    const fromWater = world.map.tileIndex(WEST_QUAY_X, ROW);
    const ashore = world.map.tileIndex(WEST_QUAY_X - 2, ROW);
    expect(world.map.terrain[ashore]).not.toBe(Terrain.Water);
    expect(world.waterPathfinder.find(world.map, fromWater, ashore, path)).toBe(0);
  });

  it('claims no water, so two ships may share a strait', () => {
    // Ships pass each other at sea. The reservation system is for track, and a
    // ship that claimed tiles would deadlock a channel the moment two met.
    const bench = chain();
    const world = bench.world;
    for (let tick = 0; tick < 400; tick++) world.step(bench.queue, null);
    expect(world.vehicles.reservedToIndex[2]).toBe(-1);
  });
});

describe('the M7 acceptance case', () => {
  it('carries coal over four legs and bills each one for its own distance', () => {
    const bench = chain();
    const world = bench.world;
    const vehicles = world.vehicles;

    const mineStop = stationOn(world, MINE_STOP_X, ROW);
    const railHead = stationOn(world, RAIL_HEAD_ROAD_X, ROW);
    const railPort = stationOn(world, RAIL_PORT_X, ROW);
    const seaPort = stationOn(world, EAST_QUAY_X, ROW);
    const plantStop = stationOn(world, PLANT_STOP_X, ROW);

    // One batch, small enough for a single lorry load, so every payment is one
    // event and can be checked against the formula exactly.
    const BATCH = 20;
    const depositTick = world.tick;
    expect(depositAtStation(world, mineStop, Cargo.Coal, BATCH)).toBe(BATCH);
    expect(mineStop.waiting[0]!.createdTick).toBe(depositTick);
    // The power plant is the only thing on the map that burns coal, so that is
    // where this batch is going - three changes of mode away.
    expect(mineStop.waiting[0]!.destinationStationId).toBe(plantStop.id);

    const paidTick = [-1, -1, -1, -1];
    // What each vehicle was actually carrying when it unloaded. Not the batch
    // it started as: a sea crossing takes months, and coal past its grace
    // period loses a tenth of itself a day standing on a quay (section 7.5).
    // Assuming the twenty units survived would be testing the wrong thing.
    const paidAmount = [0, 0, 0, 0];
    const paidCt = [0, 0, 0, 0];
    const paidStamp = [0, 0, 0, 0];
    const carrying = (id: number): number => {
      let total = 0;
      for (const stack of vehicles.cargo[id]!) total += stack.amount;
      return total;
    };
    /**
     * The age stamp the payment will actually use.
     *
     * NOT the tick the batch was deposited. Cargo that outlives its grace period
     * has its `createdTick` walked FORWARD one day at a time, which is how the
     * daily write-off is applied exactly once a day - so on a months-long sea
     * crossing the stamp the formula sees is nothing like the deposit.
     */
    const stampOf = (id: number): number => {
      let total = 0;
      let weighted = 0;
      for (const stack of vehicles.cargo[id]!) {
        total += stack.amount;
        weighted += stack.createdTick * stack.amount;
      }
      return total > 0 ? weighted / total : 0;
    };

    let sawShipCargo = false;
    for (let tick = 0; tick < 900 * TICKS_PER_DAY; tick++) {
      const stamp = world.tick;
      const aboard = [carrying(0), carrying(1), carrying(2), carrying(3)];
      const stamps = [stampOf(0), stampOf(1), stampOf(2), stampOf(3)];
      world.step(bench.queue, null);
      for (let id = 0; id < 4; id++) {
        if (paidTick[id]! < 0 && vehicles.earnedCt[id]! > 0) {
          paidTick[id] = stamp;
          paidAmount[id] = aboard[id]!;
          // The FIRST payment, not the running total: a ship that has since
          // been back for a second load would otherwise be compared against a
          // single delivery.
          paidCt[id] = vehicles.earnedCt[id]!;
          paidStamp[id] = stamps[id]!;
        }
      }
      if (vehicles.cargo[2]!.length > 0) sawShipCargo = true;
      if (paidTick[3]! >= 0) break;
    }

    // The ship really carried it; a chain that quietly went round by road would
    // otherwise pass every other assertion here.
    expect(sawShipCargo).toBe(true);
    for (let id = 0; id < 4; id++) expect(paidTick[id]).toBeGreaterThan(0);

    // Four legs between five points, collinear, so together they are the whole
    // journey and nothing has been counted twice.
    const points = [mineStop, railHead, railPort, seaPort, plantStop];
    const legs: number[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      legs.push(tileDistance(points[i]!.x, points[i]!.y, points[i + 1]!.x, points[i + 1]!.y));
    }
    const whole = tileDistance(mineStop.x, mineStop.y, plantStop.x, plantStop.y);
    expect(legs.reduce((sum, leg) => sum + leg, 0)).toBeCloseTo(whole, 6);

    // Four vehicles, four legs, in order: lorry 0 mine->rail head, train 1 rail
    // head->west port, ship 2 west port->east port, lorry 3 east port->plant.
    // Each is checked against the formula for ITS OWN distance and its own
    // transit time - which is what "correctly billed" means.
    const expected = (distance: number, at: number, amount: number, stamp: number): number =>
      deliveryRevenueCt({
        cargo: Cargo.Coal,
        amount,
        distanceTiles: distance,
        ticksInTransit: at - stamp,
        hasCooling: false,
        year: START_YEAR,
      });

    for (let id = 0; id < 4; id++) {
      expect(paidAmount[id], `leg ${id} carried nothing`).toBeGreaterThan(0);
      expect(paidCt[id], `leg ${id}`).toBe(
        expected(legs[id]!, paidTick[id]!, paidAmount[id]!, paidStamp[id]!),
      );
    }

    // Every leg is paid for its OWN distance, and the four together are the
    // whole journey - no stretch counted twice, none given away.
    const together = legs.reduce((sum, leg) => sum + leg, 0);
    expect(together).toBeCloseTo(whole, 6);

    // And the coal is where it was sent.
    const plant = world.industries[0]!;
    expect(plant.inputStock0 + plant.producedThisMonth).toBeGreaterThan(0);
  });
});
