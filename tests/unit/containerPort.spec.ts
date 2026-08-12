import { describe, expect, it } from 'vitest';
import { deliveryRevenueCt, tileDistance } from '../../src/sim/cargo/payment';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  ECONOMY_CONTAINER_BOOM_FROM_YEAR,
  MapClimate,
  PORT_CONTAINER_TEU_PER_MONTH,
  SEA_LEVEL,
  START_YEAR,
  STATION_CARGO_CAPACITY,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
} from '../../src/sim/constants';
import { economyContainerFactor } from '../../src/sim/economy/curve';
import { PORT_OVERSEAS_CARGO, stationAccepts } from '../../src/sim/industry/catchment';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { computeLandmasses, floodSeaLevel, markOcean } from '../../src/sim/mapgen/hydrology';
import { moveOverseasContainers, portContainerOffer } from '../../src/sim/station/containers';
import {
  STATION_HISTORY_FIELD_COUNT,
  StationHistoryField,
  historySlot,
} from '../../src/sim/station/history';
import {
  isContainerPort,
  ModuleKind,
  stationRating,
  type Station,
} from '../../src/sim/station/types';
import { OrderLoad, OrderUnload } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';

/**
 * The container revival of SPEC2 M21 bundle 2 (E-09): `Cargo.Containers` had a
 * rate, a tonnage, a decay curve and eight vehicles for six milestones, and
 * nothing on the map ever made one. A harbour container terminal - a quay with
 * a crane behind it - is now both the producer and the acceptor of an overseas
 * meta-cargo, and this file holds the five rules `station/containers.ts` states:
 * creation, destination, refusal, overflow, and delivery/conservation (D-065).
 */

const SIZE = 128;
const GROUND = 5;
const ROW = 20;

/** The strait. Both quays stand on its edge tiles, `WATER_X1 - WATER_X0` apart. */
const WATER_X0 = 30;
const WATER_X1 = 41;

/** Freight terminals ashore, two tiles behind each quay - inside the join distance. */
const WEST_CRANE_X = WATER_X0 - 2;
const EAST_CRANE_X = WATER_X1 + 2;
const SHIP_DEPOT_Y = ROW + 1;

/** `veh.ship_container1`: 320 TEU, in service from 1968. */
const CONTAINER_SHIP = 2020;
/** `veh.ship_coaster1`: the general-purpose hull the multimodal chain uses. */
const COASTER = 2000;

/**
 * Days the flow cases play. A loaded hull of two thousand tonnes spends most of
 * a short strait accelerating, so two round trips over eleven tiles want two
 * game months rather than the week the distance suggests.
 */
const RUN_DAYS = 60;

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

/** Flat land with a strait cut through it, dug the way the game digs one. */
function straitMap(): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  for (let y = 0; y < SIZE; y++) {
    for (let x = WATER_X0; x <= WATER_X1 + 1; x++) {
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

interface PortOptions {
  /** The century world rule. Off means no overseas trade at all. */
  readonly economy?: boolean;
  /** Calendar year the world is put at before anything is stepped. */
  readonly year?: number;
  /** Give the eastern port its crane, i.e. a partner to trade with. */
  readonly eastCrane?: boolean;
}

/**
 * Two harbours facing each other across a strait, and nothing else on the map.
 *
 * No towns and no industries on purpose: every unit of cargo that exists in this
 * world is a container, which is what makes the conservation sum below a
 * statement about containers rather than about the cargo machinery in general.
 */
function ports(options: PortOptions = {}): Bench {
  const map = straitMap();
  const world = World.fromGenerated(
    {
      seed: 4711,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Reederei Nordstern',
      companyColorIndex: 3,
      economy: options.economy ?? true,
    },
    { map, towns: [], industries: [], seedUsed: 4711 },
  );
  world.tick = ((options.year ?? ECONOMY_CONTAINER_BOOM_FROM_YEAR) - START_YEAR) * TICKS_PER_YEAR;
  world.company.cashCt = 500_000_000_00;
  const bench: Bench = { world, queue: new CommandQueue() };

  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: WATER_X0,
    y: ROW,
    moduleKind: ModuleKind.Quay,
  });
  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: WATER_X0,
    y: SHIP_DEPOT_Y,
    moduleKind: ModuleKind.ShipDepot,
  });
  run(bench, {
    kind: CommandKind.BuildStationModule,
    x: WEST_CRANE_X,
    y: ROW,
    moduleKind: ModuleKind.FreightTerminal,
  });

  run(bench, {
    kind: CommandKind.BuildWaterStop,
    x: WATER_X1,
    y: ROW,
    moduleKind: ModuleKind.Quay,
  });
  if (options.eastCrane !== false) {
    run(bench, {
      kind: CommandKind.BuildStationModule,
      x: EAST_CRANE_X,
      y: ROW,
      moduleKind: ModuleKind.FreightTerminal,
    });
  }
  return bench;
}

/**
 * Put a ship on the strait, calling at both ports.
 *
 * The point of it in most cases below is the CONNECTION rather than the cargo:
 * the link graph is built from the vehicles' ORDERS (D-075), so a hull that
 * calls at both harbours is what makes them reachable from one another - which
 * is the condition `depositRoutedAtStation` refuses on. `addLink` is that hull
 * for the years in which no container ship has been built yet; `addShip` is the
 * real box carrier.
 */
function addLink(bench: Bench): number {
  return addVessel(bench, COASTER, null);
}

function addShip(bench: Bench): number {
  return addVessel(bench, CONTAINER_SHIP, Cargo.Containers);
}

function addVessel(bench: Bench, specId: number, refit: Cargo | null): number {
  const west = stationOn(bench.world, WATER_X0, ROW);
  const east = stationOn(bench.world, WATER_X1, ROW);
  const id = bench.world.vehicles.count;
  run(bench, { kind: CommandKind.BuyShip, x: WATER_X0, y: SHIP_DEPOT_Y, specId });
  if (refit !== null) {
    run(bench, { kind: CommandKind.RefitVehicle, vehicleId: id, cargo: refit });
  }
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: id,
    orders: [
      { target: 0, targetId: west.id, load: OrderLoad.Partial, unload: OrderUnload.All },
      { target: 0, targetId: east.id, load: OrderLoad.Partial, unload: OrderUnload.All },
    ],
  });
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
  return id;
}

/** Containers waiting at a station, over every stack. [TEU] */
function waitingContainers(station: Station): number {
  let total = 0;
  for (const stack of station.waiting) {
    if (stack.cargo === Cargo.Containers) total += stack.amount;
  }
  return total;
}

/** Containers aboard every vehicle in the world. [TEU] */
function aboardContainers(world: World): number {
  let total = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    for (const stack of world.vehicles.cargo[id] ?? []) {
      if (stack.cargo === Cargo.Containers) total += stack.amount;
    }
  }
  return total;
}

/**
 * A station's whole recorded history of one counter for containers: the closed
 * months in the Int32 ring PLUS the month in progress.
 *
 * The ring rounds when a month rolls, so a run that crosses a month boundary
 * carries up to half a unit of rounding per closed month - which is why the
 * conservation case below stays inside one game month and asserts to the
 * thousandth rather than trusting a tolerance to cover a rounding it never
 * measured.
 */
function recorded(station: Station, field: StationHistoryField): number {
  let total = station.monthCounters[Cargo.Containers * STATION_HISTORY_FIELD_COUNT + field]!;
  for (let monthsAgo = 0; monthsAgo < 12; monthsAgo++) {
    total += station.history[historySlot(station, monthsAgo, Cargo.Containers, field)]!;
  }
  return total;
}

describe('what a container port IS', () => {
  it('needs a berth AND a crane - neither alone is a terminal', () => {
    expect(isContainerPort([{ kind: ModuleKind.Quay, x: 0, y: 0 }])).toBe(false);
    expect(isContainerPort([{ kind: ModuleKind.FreightTerminal, x: 0, y: 0 }])).toBe(false);
    expect(isContainerPort([{ kind: ModuleKind.LorryBay, x: 0, y: 0 }])).toBe(false);
    expect(
      isContainerPort([
        { kind: ModuleKind.Quay, x: 0, y: 0 },
        { kind: ModuleKind.FreightTerminal, x: 1, y: 0 },
      ]),
    ).toBe(true);
    // Order must not matter: the crane may be built before the berth.
    expect(
      isContainerPort([
        { kind: ModuleKind.FreightTerminal, x: 1, y: 0 },
        { kind: ModuleKind.Quay, x: 0, y: 0 },
      ]),
    ).toBe(true);
  });

  it('is the ONLY thing on the map that accepts a container', () => {
    const bench = ports();
    const west = stationOn(bench.world, WATER_X0, ROW);
    const east = stationOn(bench.world, WATER_X1, ROW);
    expect(stationAccepts(west, Cargo.Containers)).toBe(true);
    expect(stationAccepts(east, Cargo.Containers)).toBe(true);

    // The same harbour without its crane is a plain port and takes no boxes -
    // which is what makes the acceptance a property of the TERMINAL.
    const plain = ports({ eastCrane: false });
    expect(stationAccepts(stationOn(plain.world, WATER_X1, ROW), Cargo.Containers)).toBe(false);
  });

  it('accepts containers whatever the year, because the mask is derived', () => {
    // Deliberately ungated on the calendar: `acceptedCargo` is recomputed only
    // when a station changes or a save is loaded, so a year term in it would go
    // stale for as long as nobody touched the port. It costs nothing, because
    // in 1951 nothing produces a box.
    const early = ports({ year: START_YEAR + 1 });
    expect(stationAccepts(stationOn(early.world, WATER_X0, ROW), Cargo.Containers)).toBe(true);
  });
});

describe('nothing produces a container before the curve opens', () => {
  it('produces nothing in a world without the century at all', () => {
    const bench = ports({ economy: false, year: ECONOMY_CONTAINER_BOOM_FROM_YEAR + 20 });
    addShip(bench);
    expect(economyContainerFactor(bench.world.economyCurve, bench.world.date.year)).toBe(0);
    for (let day = 0; day < 40; day++) {
      expect(moveOverseasContainers(bench.world)).toBe(0);
    }
    expect(waitingContainers(stationOn(bench.world, WATER_X0, ROW))).toBe(0);
  });

  it('produces nothing in every year before the boom year, and something in it', () => {
    for (let year = START_YEAR; year < ECONOMY_CONTAINER_BOOM_FROM_YEAR; year += 4) {
      const bench = ports({ year });
      addLink(bench);
      expect(economyContainerFactor(bench.world.economyCurve, year), `factor ${year}`).toBe(0);
      expect(moveOverseasContainers(bench.world), `offer ${year}`).toBe(0);
    }

    const opened = ports({ year: ECONOMY_CONTAINER_BOOM_FROM_YEAR });
    addLink(opened);
    expect(
      economyContainerFactor(opened.world.economyCurve, ECONOMY_CONTAINER_BOOM_FROM_YEAR),
    ).toBeGreaterThan(0);
    expect(moveOverseasContainers(opened.world)).toBeGreaterThan(0);
  });

  it('runs a whole pre-1970 game year through World.step and makes no box', () => {
    const bench = ports({ year: ECONOMY_CONTAINER_BOOM_FROM_YEAR - 2 });
    addLink(bench);
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) bench.world.step(bench.queue, null);
    expect(waitingContainers(stationOn(bench.world, WATER_X0, ROW))).toBe(0);
    expect(waitingContainers(stationOn(bench.world, WATER_X1, ROW))).toBe(0);
    expect(aboardContainers(bench.world)).toBe(0);
    expect(bench.world.company.cargoDeliveredUnits[Cargo.Containers] ?? 0).toBe(0);
  });
});

describe('a port with nowhere to send a box makes none', () => {
  it('refuses outright rather than piling up cargo that can never leave', () => {
    // The eastern harbour has no crane, so it accepts nothing; the western one
    // is a container port with no partner in the world.
    const bench = ports({ eastCrane: false });
    addLink(bench);
    const west = stationOn(bench.world, WATER_X0, ROW);

    for (let day = 0; day < 60; day++) {
      expect(moveOverseasContainers(bench.world)).toBe(0);
      bench.world.tick += TICKS_PER_DAY;
    }
    // Nothing placed, nothing counted as overflow, nothing written off: a port
    // with no partner is exactly a port with no container business.
    expect(waitingContainers(west)).toBe(0);
    expect(west.overflowUnits).toBe(0);
    expect(recorded(west, StationHistoryField.Expired)).toBe(0);
  });

  it('and starts the moment a partner exists', () => {
    const bench = ports({ eastCrane: false });
    addLink(bench);
    bench.world.step(bench.queue, null);
    expect(moveOverseasContainers(bench.world)).toBe(0);

    run(bench, {
      kind: CommandKind.BuildStationModule,
      x: EAST_CRANE_X,
      y: ROW,
      moduleKind: ModuleKind.FreightTerminal,
    });
    expect(moveOverseasContainers(bench.world)).toBeGreaterThan(0);
  });
});

describe('the offer itself', () => {
  it('is the monthly figure, sliced, times the rating and times the century', () => {
    const perSlice = PORT_CONTAINER_TEU_PER_MONTH / TOWN_PRODUCTION_SLICES_PER_MONTH;
    expect(portContainerOffer(100, 1)).toBeCloseTo(perSlice, 12);
    expect(portContainerOffer(50, 1)).toBeCloseTo(perSlice / 2, 12);
    expect(portContainerOffer(100, 0.5)).toBeCloseTo(perSlice / 2, 12);
    expect(portContainerOffer(0, 1)).toBe(0);
  });

  it('is what the daily hook actually deposits at one port', () => {
    const bench = ports();
    addLink(bench);
    const west = stationOn(bench.world, WATER_X0, ROW);
    const east = stationOn(bench.world, WATER_X1, ROW);
    const factor = economyContainerFactor(bench.world.economyCurve, bench.world.date.year);
    const expected =
      portContainerOffer(stationRating(west, bench.world.tick), factor) +
      portContainerOffer(stationRating(east, bench.world.tick), factor);

    expect(moveOverseasContainers(bench.world)).toBeCloseTo(expected, 9);
    expect(waitingContainers(west) + waitingContainers(east)).toBeCloseTo(expected, 9);
  });

  it('counts boxes against the ordinary station capacity and refuses at the door', () => {
    // The overflow rule of D-065's neighbourhood: containers get no reserved
    // room of their own. A port filled to STATION_CARGO_CAPACITY turns the
    // next day's boxes away and wears the loss like any other station.
    const bench = ports();
    addLink(bench);
    const west = stationOn(bench.world, WATER_X0, ROW);
    west.waiting.push({
      cargo: Cargo.Containers,
      amount: STATION_CARGO_CAPACITY,
      createdTick: bench.world.tick,
      originStationId: west.id,
      destinationStationId: stationOn(bench.world, WATER_X1, ROW).id,
      paidFromX: west.x,
      paidFromY: west.y,
    });

    const before = west.overflowUnits;
    moveOverseasContainers(bench.world);
    expect(west.overflowUnits).toBeGreaterThan(before);
    expect(recorded(west, StationHistoryField.Expired)).toBeGreaterThan(0);
    expect(waitingContainers(west)).toBe(STATION_CARGO_CAPACITY);
  });
});

describe('containers flow between two ports and are paid', () => {
  it('carries boxes across the strait and bills them by the payment formula', () => {
    const bench = ports();
    const world = bench.world;
    const shipId = addShip(bench);
    const west = stationOn(world, WATER_X0, ROW);
    const east = stationOn(world, WATER_X1, ROW);

    for (let tick = 0; tick < RUN_DAYS * TICKS_PER_DAY; tick++) world.step(bench.queue, null);

    const delivered = world.company.cargoDeliveredUnits[Cargo.Containers] ?? 0;
    const earned = world.vehicles.earnedCt[shipId]!;
    expect(delivered, 'boxes delivered overseas').toBeGreaterThan(0);
    expect(earned, 'the ship earned something').toBeGreaterThan(0);

    // Both directions: the strait is a two-way trade, not a one-way feeder.
    expect(recorded(west, StationHistoryField.Delivered)).toBeGreaterThan(0);
    expect(recorded(east, StationHistoryField.Delivered)).toBeGreaterThan(0);

    // And the money is the game's own formula, not a container special case:
    // the whole of the ship's earnings must lie between the same tonnage priced
    // at the fastest and at the slowest a box on this line can possibly have
    // been - which also pins the century's tariff seam onto the container row.
    const distance = tileDistance(west.x, west.y, east.x, east.y);
    const priced = (ticks: number): number =>
      deliveryRevenueCt({
        cargo: Cargo.Containers,
        amount: delivered,
        distanceTiles: distance,
        ticksInTransit: ticks,
        hasCooling: false,
        epochYears: world.epochYears,
        rateFactor: economyContainerFactor(world.economyCurve, world.date.year),
      });
    expect(earned).toBeLessThanOrEqual(priced(0));
    expect(earned).toBeGreaterThanOrEqual(priced(RUN_DAYS * TICKS_PER_DAY));
  });

  it('measures a year of a two-port line, and the band owns the supply constant', () => {
    const bench = ports();
    const world = bench.world;
    const shipId = addShip(bench);
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(bench.queue, null);

    const teu = world.company.cargoDeliveredUnits[Cargo.Containers] ?? 0;
    const revenue = world.vehicles.earnedCt[shipId]! / 100;
    process.stdout.write(
      `container line: ${teu.toFixed(0)} TEU delivered, ${revenue.toFixed(0)} EUR over ` +
        `${(WATER_X1 - WATER_X0).toString()} tiles to ${world.date.year.toString()}\n`,
    );

    // What this bands is the SUPPLY constant, and nothing else. Two ports at
    // PORT_CONTAINER_TEU_PER_MONTH cannot between them hand over more than
    // twelve times that in a year, before the rating and the century have had
    // their say, and the floor says a single hull really does clear a useful
    // share of it. It is deliberately NOT a profitability measurement: a
    // 320-TEU ship on an eleven-tile strait is not a line anybody would build,
    // and the figure printed above says so. Nothing in section 19.4 owns this
    // constant yet, so this band is what owns it - see DECISIONS.md D-237.
    expect(teu).toBeGreaterThan(2 * PORT_CONTAINER_TEU_PER_MONTH);
    expect(teu).toBeLessThan(2 * 12 * PORT_CONTAINER_TEU_PER_MONTH);
    expect(revenue).toBeGreaterThan(0);
  });
});

describe('conservation and D-065', () => {
  it('a delivered box leaves the game: no stock, no town counter, no waiting pile', () => {
    const bench = ports();
    const world = bench.world;
    addShip(bench);
    for (let tick = 0; tick < RUN_DAYS * TICKS_PER_DAY; tick++) world.step(bench.queue, null);

    // This world has no industries and no towns at all, so the only place a
    // delivered container COULD have landed is the receiving station's waiting
    // pile - which is precisely the leak D-065 forbids, and the leak that would
    // let one box be carried back and forth and paid for for ever.
    for (const station of world.stations) {
      expect(recorded(station, StationHistoryField.Delivered)).toBeGreaterThan(0);
      // Every stack standing here was OFFERED here. A delivered box that had
      // been added to the pile would carry the OTHER port's id.
      for (const stack of station.waiting) {
        expect(stack.originStationId, `foreign stack at ${station.id}`).toBe(station.id);
      }
    }
  });

  it('is conserved tick by tick: only the daily hook adds, and nothing loses one', () => {
    // Inside ONE game month on purpose: the history ring rounds to Int32 when a
    // month closes, and a conservation statement that needs a tolerance to
    // survive its own bookkeeping is not one. `world.tick` starts on a year
    // boundary, so the month would roll at TICKS_PER_MONTH and this stops short.
    const bench = ports();
    const world = bench.world;
    addShip(bench);

    /** Every container in the world, in whichever of the four buckets it sits. */
    const total = (): number => {
      let sum = aboardContainers(world);
      for (const station of world.stations) {
        sum += waitingContainers(station);
        sum += recorded(station, StationHistoryField.Delivered);
        sum += recorded(station, StationHistoryField.Expired);
      }
      return sum;
    };

    let previous = total();
    let added = 0;
    const start = world.tick;
    while (world.tick - start < TICKS_PER_MONTH - TICKS_PER_DAY) {
      world.step(bench.queue, null);
      const now = total();
      const delta = now - previous;
      if (world.tick % TICKS_PER_DAY === 0) {
        // The day the ports are offered boxes. It may add and may never take.
        expect(delta, `day tick ${world.tick}`).toBeGreaterThan(-1e-9);
        added += delta;
      } else {
        // Every other tick only MOVES boxes between the buckets - loading,
        // unloading, delivering, transferring, expiring. Not one of them may
        // change the total, and a container that fell out of the world would
        // show here as a negative delta on a tick that creates nothing.
        expect(Math.abs(delta), `tick ${world.tick}`).toBeLessThan(1e-9);
      }
      previous = now;
    }

    expect(added, 'the month produced containers at all').toBeGreaterThan(0);
    expect(previous).toBeCloseTo(added, 9);
  });
});

describe('the acceptance list is the production list', () => {
  it('names exactly the overseas meta-cargo, once', () => {
    expect([...PORT_OVERSEAS_CARGO]).toEqual([Cargo.Containers]);
  });
});
