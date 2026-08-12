import { describe, expect, it } from 'vitest';
import { deliveryRevenueCt, tileDistance } from '../../src/sim/cargo/payment';
import { depositAtStation } from '../../src/sim/cargo/routing';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  CARGO_MAX_WAIT_DAYS,
  Difficulty,
  MapClimate,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { INDUSTRY_SPECS, IndustryType, newIndustry } from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind, type Station } from '../../src/sim/station/types';
import { World } from '../../src/sim/World';

/**
 * Cargo routing (section 7.4) and the acceptance case of M5: a chain from the
 * forest to the sawmill with a lorry feeding a freight train, billed
 * proportionally.
 *
 * The interesting thing about that chain is that nothing in the simulation
 * knows it is a chain. The lorry is told to run between two stops and the train
 * between two others; what makes the wood cross from one to the other is that
 * every parcel carries a destination, and every vehicle takes only what it
 * carries closer to that destination and sets it down again the moment it
 * stops helping.
 */

/**
 * 128 rather than the 96 this fixture used to build (D-197).
 *
 * A 96-tile world was one the save format would have refused: it could be
 * created and played and never written down. The rule is one function now and
 * the constructor applies it, so this fixture moved to the next legal size -
 * every coordinate below is unchanged, the map is simply larger around them.
 */
const SIZE = 128;
const GROUND = 5;
const ROW = 20;

/** A bulk lorry that can be converted to timber. */
const LORRY = 240;
/** A 1950 steam locomotive and an open wagon that takes wood. */
const LOCO = 1000;
const WAGON = 1520;

/** Tiles of the chain, all on one row so the two legs add up exactly. */
const ROAD_DEPOT_X = 2;
const WALD_X = 10;
const UMSCHLAG_ROAD_X = 26;
const UMSCHLAG_RAIL_X = 28;
const SAEGEWERK_X = 52;
const RAIL_DEPOT_X = 60;
/**
 * The two industries stand one row off the line. Neither road nor track may be
 * laid across an industry, and both stations still reach them: a two by two
 * works at (53, 22) is inside the four tile catchment of a stop at (52, 20).
 */
const INDUSTRY_ROW = ROW + 2;
const SAWMILL_X = 53;
const FOREST_X = 11;

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

/** The station that owns a tile. Ids depend on build order; this does not. */
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
 * Road to the transfer point, rail on from it, a sawmill at the far end, and -
 * when asked for - a forest at the near end.
 */
function chain(withForest: boolean): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const industries = [newIndustry(0, IndustryType.Sawmill, SAWMILL_X, INDUSTRY_ROW, 0)];
  if (withForest) industries.push(newIndustry(1, IndustryType.Forestry, FOREST_X, INDUSTRY_ROW, 0));
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
      seed: 7,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Holzweg AG',
      companyColorIndex: 2,
    },
    { map, towns: [], industries, seedUsed: 7 },
  );
  // This measures routing and billing, not whether the chain can be afforded.
  world.company.cashCt = 200_000_000_00;
  const bench: Bench = { world, queue: new CommandQueue() };

  run(bench, {
    kind: CommandKind.BuildRoad,
    x1: ROAD_DEPOT_X,
    y1: ROW,
    x2: UMSCHLAG_ROAD_X,
    y2: ROW,
  });
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: UMSCHLAG_RAIL_X,
    y1: ROW,
    x2: RAIL_DEPOT_X,
    y2: ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });

  // The two depots stand well clear of the stops, so they form sheds of their
  // own instead of joining and dragging the station centres about.
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: ROAD_DEPOT_X,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: WALD_X,
    y: ROW,
    moduleKind: ModuleKind.LorryBay,
  });
  // A lorry bay and a platform two tiles apart are ONE station with one cargo
  // pool - which is what makes this the transfer point.
  run(bench, {
    kind: CommandKind.BuildRoadStop,
    x: UMSCHLAG_ROAD_X,
    y: ROW,
    moduleKind: ModuleKind.LorryBay,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: UMSCHLAG_RAIL_X,
    y: ROW,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: SAEGEWERK_X,
    y: ROW,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: RAIL_DEPOT_X,
    y: ROW,
    moduleKind: ModuleKind.RailDepot,
  });

  const wald = stationOn(world, WALD_X, ROW);
  const umschlag = stationOn(world, UMSCHLAG_ROAD_X, ROW);
  const saegewerk = stationOn(world, SAEGEWERK_X, ROW);
  expect(stationOn(world, UMSCHLAG_RAIL_X, ROW).id).toBe(umschlag.id);

  run(bench, { kind: CommandKind.BuyRoadVehicle, x: ROAD_DEPOT_X, y: ROW, specId: LORRY });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 0, cargo: Cargo.Wood });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      { target: 0, targetId: wald.id, load: 1, unload: 0 },
      { target: 0, targetId: umschlag.id, load: 1, unload: 0 },
    ],
  });

  run(bench, { kind: CommandKind.BuyTrain, x: RAIL_DEPOT_X, y: ROW, specIds: [LOCO, WAGON] });
  run(bench, { kind: CommandKind.RefitVehicle, vehicleId: 1, cargo: Cargo.Wood });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 1,
    orders: [
      { target: 0, targetId: umschlag.id, load: 1, unload: 0 },
      { target: 0, targetId: saegewerk.id, load: 1, unload: 0 },
    ],
  });

  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 1, running: true });
  return bench;
}

describe('the connection table', () => {
  it('knows the sawmill is two lines away before anybody has driven there', () => {
    const bench = chain(false);
    const world = bench.world;
    const wald = stationOn(world, WALD_X, ROW);
    const umschlag = stationOn(world, UMSCHLAG_ROAD_X, ROW);
    const saegewerk = stationOn(world, SAEGEWERK_X, ROW);
    world.cargoLinks.ensureRouting(world);

    // The legs come straight out of the orders, both ways round each line.
    expect(world.cargoLinks.isActive(wald.id, umschlag.id)).toBe(true);
    expect(world.cargoLinks.isActive(umschlag.id, saegewerk.id)).toBe(true);
    // And nothing runs from the forest stop to the sawmill directly.
    expect(world.cargoLinks.isActive(wald.id, saegewerk.id)).toBe(false);

    // Two lines, one journey: the transfer is inferred, not configured.
    const direct = world.cargoLinks.expectedTicks(wald.id, saegewerk.id);
    const first = world.cargoLinks.legTicks(wald.id, umschlag.id);
    const second = world.cargoLinks.legTicks(umschlag.id, saegewerk.id);
    expect(direct).toBeCloseTo(first + second, 6);
  });

  it('replaces its estimate with what the line actually does', () => {
    const bench = chain(true);
    const world = bench.world;
    const wald = stationOn(world, WALD_X, ROW);
    const umschlag = stationOn(world, UMSCHLAG_ROAD_X, ROW);

    const estimate = world.cargoLinks.legTicks(wald.id, umschlag.id);
    for (let tick = 0; tick < 40 * TICKS_PER_DAY; tick++) world.step(bench.queue, null);
    const measured = world.cargoLinks.legTicks(wald.id, umschlag.id);

    // The estimate is a straight line at a nominal speed; a real lorry stops to
    // load at both ends and accelerates out of them, so it is always slower.
    expect(measured).toBeGreaterThan(estimate);
    expect(Number.isFinite(measured)).toBe(true);
  });
});

describe('a lorry feeding a freight train', () => {
  it('bills each leg for the distance it actually covered', () => {
    const bench = chain(false);
    const world = bench.world;
    const vehicles = world.vehicles;
    const wald = stationOn(world, WALD_X, ROW);
    const umschlag = stationOn(world, UMSCHLAG_ROAD_X, ROW);
    const saegewerk = stationOn(world, SAEGEWERK_X, ROW);

    // One batch, small enough for a single lorry load, so both payments are a
    // single event each and can be checked against the formula exactly.
    const BATCH = 20;
    const createdTick = world.tick;
    expect(depositAtStation(world, wald, Cargo.Wood, BATCH)).toBe(BATCH);

    // The sawmill is the only thing on the map that takes wood, so that is
    // where this batch is going - two lines away.
    expect(wald.waiting).toHaveLength(1);
    expect(wald.waiting[0]!.destinationStationId).toBe(saegewerk.id);

    let lorryPaidTick = -1;
    let trainPaidTick = -1;
    let transferSeen = false;
    let carriedBackwards = false;

    for (let tick = 0; tick < 120 * TICKS_PER_DAY; tick++) {
      // Vehicles move BEFORE the tick counter advances, so a payment made
      // during this step was stamped with the tick as it is right now.
      const stamp = world.tick;
      world.step(bench.queue, null);

      if (lorryPaidTick < 0 && vehicles.earnedCt[0]! > 0) lorryPaidTick = stamp;
      if (trainPaidTick < 0 && vehicles.earnedCt[1]! > 0) trainPaidTick = stamp;

      // Set down at the transfer point: it keeps where it came from and where
      // it is going, and it has been paid for as far as here.
      for (const stack of umschlag.waiting) {
        if (stack.cargo !== Cargo.Wood) continue;
        transferSeen = true;
        expect(stack.originStationId).toBe(wald.id);
        expect(stack.destinationStationId).toBe(saegewerk.id);
        expect(stack.paidFromX).toBe(umschlag.x);
        expect(stack.paidFromY).toBe(umschlag.y);
        expect(stack.createdTick).toBe(createdTick);
      }
      // And the lorry, whose next stop is the forest again, must not pick it
      // back up: that would carry it away from where it is going.
      for (const stack of vehicles.cargo[0]!) {
        if (stack.paidFromX === umschlag.x) carriedBackwards = true;
      }
      if (trainPaidTick >= 0) break;
    }

    expect(transferSeen).toBe(true);
    expect(carriedBackwards).toBe(false);
    expect(lorryPaidTick).toBeGreaterThan(0);
    expect(trainPaidTick).toBeGreaterThan(lorryPaidTick);

    // The two legs, measured between the station centres. They are collinear,
    // so together they are the whole journey and nothing has been counted twice.
    const first = tileDistance(wald.x, wald.y, umschlag.x, umschlag.y);
    const second = tileDistance(umschlag.x, umschlag.y, saegewerk.x, saegewerk.y);
    const whole = tileDistance(wald.x, wald.y, saegewerk.x, saegewerk.y);
    expect(first + second).toBeCloseTo(whole, 6);

    const expectedLorry = deliveryRevenueCt({
      cargo: Cargo.Wood,
      amount: BATCH,
      distanceTiles: first,
      ticksInTransit: lorryPaidTick - createdTick,
      hasCooling: false,
      epochYears: 0,
    });
    // The train is paid from the TRANSFER point, not from the forest. If it
    // were paid from the origin this figure would be roughly two and a half
    // times what it is, and the chain would earn more than a direct run.
    const expectedTrain = deliveryRevenueCt({
      cargo: Cargo.Wood,
      amount: BATCH,
      distanceTiles: second,
      ticksInTransit: trainPaidTick - createdTick,
      hasCooling: false,
      epochYears: 0,
    });

    expect(vehicles.earnedCt[0]).toBe(expectedLorry);
    expect(vehicles.earnedCt[1]).toBe(expectedTrain);

    // The wood is where it was sent, and the sawmill is working on it.
    const sawmill = world.industries[0]!;
    expect(sawmill.inputStock0 + sawmill.outputStock0).toBeGreaterThan(0);
  });

  it('runs the whole chain from the forest and turns wood into planks', () => {
    const bench = chain(true);
    const world = bench.world;
    const saegewerk = stationOn(world, SAEGEWERK_X, ROW);
    const wald = stationOn(world, WALD_X, ROW);

    for (let tick = 0; tick < 200 * TICKS_PER_DAY; tick++) world.step(bench.queue, null);

    const sawmill = world.industries[0]!;
    const forest = world.industries[1]!;
    expect(forest.producedThisMonth + forest.collectedThisMonth).toBeGreaterThan(0);
    // Wood came in over two lines and left again as planks.
    expect(sawmill.outputStock0).toBeGreaterThan(0);

    // Both vehicles are earning; neither is sitting on cargo it cannot place.
    expect(world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(world.vehicles.earnedCt[1]!).toBeGreaterThan(0);

    // Nothing at the forest is bound anywhere but the sawmill, and nothing has
    // been left without a destination while a route existed.
    for (const stack of wald.waiting) {
      expect(stack.destinationStationId).toBe(saegewerk.id);
    }
  });
});

describe('cargo with nowhere to go', () => {
  it('waits thirty days and is then written off against the station', () => {
    const bench = chain(false);
    const world = bench.world;
    // Take the lorry off the road, which leaves the forest stop connected to
    // nothing: there is no route to the sawmill any more.
    run(bench, { kind: CommandKind.SetVehicleOrders, vehicleId: 0, orders: [] });
    run(bench, { kind: CommandKind.SetVehicleOrders, vehicleId: 1, orders: [] });

    const wald = stationOn(world, WALD_X, ROW);
    depositAtStation(world, wald, Cargo.Wood, 40);
    expect(wald.waiting[0]!.destinationStationId).toBe(-1);

    // The write-off is charged to the station as overflow, and that memory
    // fades again by design - so the peak is what has to be caught, not the
    // figure at the end of the run.
    let peakOverflow = wald.overflowUnits;
    let waitingAfterAMonth = -1;
    for (let tick = 0; tick < (CARGO_MAX_WAIT_DAYS + 2) * TICKS_PER_DAY; tick++) {
      world.step(bench.queue, null);
      if (wald.overflowUnits > peakOverflow) peakOverflow = wald.overflowUnits;
      if (waitingAfterAMonth < 0 && wald.waiting.length === 0) {
        waitingAfterAMonth = Math.floor(world.tick / TICKS_PER_DAY);
      }
    }

    expect(wald.waiting).toHaveLength(0);
    // Part of the charge is already faded off by the end of the very tick that
    // made it - both run on the daily clock - so what is visible from outside
    // is less than the forty units, and the point is that it is not nothing.
    expect(peakOverflow).toBeGreaterThan(0);
    // Not a day early: it is allowed to wait its thirty days first.
    expect(waitingAfterAMonth).toBeGreaterThan(CARGO_MAX_WAIT_DAYS);
  });

  it('picks the route up again when a line appears within those thirty days', () => {
    const bench = chain(false);
    const world = bench.world;
    run(bench, { kind: CommandKind.SetVehicleOrders, vehicleId: 0, orders: [] });

    const wald = stationOn(world, WALD_X, ROW);
    const umschlag = stationOn(world, UMSCHLAG_ROAD_X, ROW);
    const saegewerk = stationOn(world, SAEGEWERK_X, ROW);
    depositAtStation(world, wald, Cargo.Wood, 40);
    expect(wald.waiting[0]!.destinationStationId).toBe(-1);

    for (let tick = 0; tick < 5 * TICKS_PER_DAY; tick++) world.step(bench.queue, null);

    // The line the wood needed is built after the wood was made. It must find
    // it, rather than sit there until it is written off.
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        { target: 0, targetId: wald.id, load: 1, unload: 0 },
        { target: 0, targetId: umschlag.id, load: 1, unload: 0 },
      ],
    });
    for (let tick = 0; tick < 2 * TICKS_PER_DAY; tick++) world.step(bench.queue, null);

    expect(wald.waiting.length).toBeGreaterThan(0);
    expect(wald.waiting[0]!.destinationStationId).toBe(saegewerk.id);
  });
});
