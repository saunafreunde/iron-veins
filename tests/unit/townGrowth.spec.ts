import { GCProfiler } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  Difficulty,
  MapClimate,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TILE_PUBLIC,
  TOWN_GROWTH_ROAD_TILES_PER_MONTH,
} from '../../src/sim/constants';
import { assignStationIndustries } from '../../src/sim/industry/catchment';
import type { TileMap } from '../../src/sim/map/TileMap';
import { Structure } from '../../src/sim/map/structures';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { buildingsWantedFor, continuesStreet } from '../../src/sim/mapgen/towns';
import { growTownFabric } from '../../src/sim/town/growth';
import { BuildingKind, RoadBit, type Town } from '../../src/sim/town/types';
import { hashWorld, World } from '../../src/sim/World';
import { CommandKind } from '../../src/sim/commands/types';
import {
  apply,
  buildBusLine,
  flatScenario,
  makeTown,
  SCENARIO_SIZE,
  type TwoTownScenario,
} from '../balance/scenario';

/**
 * Physical town growth (SPEC.md 13.2, SPEC2 M20 bundle 1, D-231).
 *
 * The milestone's own Fertig-wenn asks for exactly one thing here - "eine voll
 * versorgte Stadt baut ueber 10 Spieljahre nachweislich neue Gebaeude und
 * mindestens eine selbst verlaengerte Strasse (Vorher/Nachher-Tile-Diff im
 * Test)" - and the first block is that diff, taken tile by tile off the two
 * map layers rather than off a counter the growth keeps about itself.
 *
 * Everything after it is the constitution the growth had to be written under:
 * the three-tiles-a-month cap of 13.2, the round robin of E-10, the build
 * guards it goes through, the tiles staying PUBLIC (D-104), law #7 in the
 * daily hook, and the derived station field that has to move with the houses
 * or a loaded game stops being the game that was saved.
 */

/** A town with room to grow into: a small cross, a large claim. */
const POPULATION = 8_000;
const CLAIM_RADIUS = 9;
const DISTANCE_TILES = 25;
const BUS_SPEC = 200;
/** Enough to buy the fleet above; this fixture measures houses, not cash. */
const FIXTURE_CAPITAL_CT = 50_000_000_00;
const BUS_COUNT = 20;

/** The layers a growth diff is taken from. */
interface Fabric {
  readonly roads: Uint8Array;
  readonly buildings: Uint8Array;
  readonly owner: Uint8Array;
}

function fabricOf(map: TileMap): Fabric {
  return {
    roads: map.roadBits.slice(),
    buildings: map.buildingKind.slice(),
    owner: map.owner.slice(),
  };
}

function countIn(map: TileMap, layer: Uint8Array, townId: number): number {
  let count = 0;
  for (let i = 0; i < map.tileCount; i++) {
    if (map.townId[i] !== townId) continue;
    if (layer[i] !== 0) count++;
  }
  return count;
}

/**
 * The fixture: two towns of 8,000 laid out the way every balancing scenario
 * lays a town - `placeTown`'s cross of streets with houses along it - and then
 * given the claim a city of that size gets on a generated map.
 *
 * The widening is the whole point of the fixture, and it is honest rather than
 * convenient: `TOWN_START_RADIUS` is what a town CLAIMS (13.3's Stadtgebiet)
 * and it is about twice what the streets of a fresh town reach (D-216), so a
 * generated city has exactly this room. The balance fixtures claim only the
 * ground their cross covers, which is a town with nowhere to grow - a fair
 * world for measuring a bus line, not for measuring growth.
 */
function claimAround(map: TileMap, town: Town, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      map.townId[map.tileIndex(x, y)] = town.id;
    }
  }
  town.radius = radius;
}

function servedTowns(): TwoTownScenario {
  const y = SCENARIO_SIZE >> 1;
  const startX = (SCENARIO_SIZE - DISTANCE_TILES) >> 1;
  const townA = makeTown(0, startX, y, POPULATION, 'Westheim');
  const townB = makeTown(1, startX + DISTANCE_TILES, y, POPULATION, 'Ostheim');
  const scenario = flatScenario(SCENARIO_SIZE, [townA, townB], [], 1);
  claimAround(scenario.world.map, townA, CLAIM_RADIUS);
  claimAround(scenario.world.map, townB, CLAIM_RADIUS);
  // A fleet that actually clears two cities of 8,000 costs more than a
  // starting company has, and "fully served" is the condition the Fertig-wenn
  // names - so the capital is granted rather than earned. Nothing here
  // measures money; the Netzdesign scenario capitalises itself for the same
  // reason (D-187).
  scenario.world.company.cashCt = FIXTURE_CAPITAL_CT;
  return { ...scenario, townA, townB };
}

function run(scenario: TwoTownScenario, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
}

// ------------------------------------------------- the Fertig-wenn: the diff

describe('a fully served town over ten game years', () => {
  const scenario = servedTowns();
  buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
  const map = scenario.world.map;
  const before = fabricOf(map);
  const roadsBefore = countIn(map, before.roads, 0);
  const buildingsBefore = countIn(map, before.buildings, 0);
  // Half a month in, so the monthly counters the supply share is read off are
  // half full rather than freshly cleared by `growTowns`.
  run(scenario, 10 * TICKS_PER_YEAR + TICKS_PER_MONTH / 2);
  const after = fabricOf(map);
  const roadsAfter = countIn(map, after.roads, 0);
  const buildingsAfter = countIn(map, after.buildings, 0);

  it('was in fact fully served, which is what the Fertig-wenn asks about', () => {
    const town = scenario.townA;
    const share = town.transportedThisMonth / town.producedThisMonth;
    console.log(
      `town growth: ${buildingsBefore} -> ${buildingsAfter} buildings, ` +
        `${roadsBefore} -> ${roadsAfter} street tiles, population ${POPULATION} -> ` +
        `${town.population}, passenger supply ${(share * 100).toFixed(1)} %`,
    );
    expect(town.producedThisMonth).toBeGreaterThan(0);
    expect(share).toBeGreaterThan(0.9);
  });

  it('puts up buildings it did not have', () => {
    expect(buildingsAfter).toBeGreaterThan(buildingsBefore);
  });

  it('extends a street of its own - at least one tile that was not there', () => {
    expect(roadsAfter).toBeGreaterThan(roadsBefore);
  });

  it('leaves every street it laid PUBLIC (D-104)', () => {
    let laid = 0;
    for (let i = 0; i < map.tileCount; i++) {
      if (before.roads[i] !== 0 || after.roads[i] === 0) continue;
      if (map.townId[i] !== 0) continue;
      laid++;
      expect(after.owner[i], `tile ${i} was taken by a company`).toBe(TILE_PUBLIC);
    }
    expect(laid).toBeGreaterThan(0);
  });

  it('joins every street it laid in both directions', () => {
    for (let i = 0; i < map.tileCount; i++) {
      if (before.roads[i] !== 0 || after.roads[i] === 0) continue;
      const bits = after.roads[i]!;
      if ((bits & RoadBit.West) !== 0) expect(after.roads[i - 1]! & RoadBit.East).not.toBe(0);
      if ((bits & RoadBit.East) !== 0) expect(after.roads[i + 1]! & RoadBit.West).not.toBe(0);
      if ((bits & RoadBit.North) !== 0) {
        expect(after.roads[i - map.size]! & RoadBit.South).not.toBe(0);
      }
      if ((bits & RoadBit.South) !== 0) {
        expect(after.roads[i + map.size]! & RoadBit.North).not.toBe(0);
      }
    }
  });

  it('leaves no street it laid serving nothing (D-216 held over a played map)', () => {
    for (let i = 0; i < map.tileCount; i++) {
      if (before.roads[i] !== 0 || after.roads[i] === 0) continue;
      const beside =
        after.buildings[i - 1] !== 0 ||
        after.buildings[i + 1] !== 0 ||
        after.buildings[i - map.size] !== 0 ||
        after.buildings[i + map.size] !== 0;
      expect(beside, `the street the town laid at tile ${i} serves nothing`).toBe(true);
    }
  });

  it('paves what it built on, so a house never stands in open grass', () => {
    for (let i = 0; i < map.tileCount; i++) {
      if (before.buildings[i] !== 0 || after.buildings[i] === 0) continue;
      expect(map.terrain[i]).toBe(Terrain.TownGround);
    }
  });

  it('never builds more houses than the population asks for', () => {
    expect(buildingsAfter).toBeLessThanOrEqual(buildingsWantedFor(scenario.townA.population));
  });
});

// --------------------------------------------------------- SPEC.md 13.2: 3/month

describe("a town's own road building", () => {
  it('never exceeds three tiles in a game month', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const map = scenario.world.map;
    let previous = countIn(map, map.roadBits, 0);
    let worst = 0;

    for (let month = 0; month < 12; month++) {
      for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
        scenario.world.step(scenario.queue, null);
        expect(scenario.townA.roadTilesThisMonth).toBeLessThanOrEqual(
          TOWN_GROWTH_ROAD_TILES_PER_MONTH,
        );
      }
      const now = countIn(map, map.roadBits, 0);
      if (now - previous > worst) worst = now - previous;
      previous = now;
    }

    console.log(`busiest month of town road building: ${worst} tiles of 3 allowed`);
    expect(worst).toBeLessThanOrEqual(TOWN_GROWTH_ROAD_TILES_PER_MONTH);
    // The cap has to BIND on this fixture, or the assertion above is vacuous.
    expect(worst).toBe(TOWN_GROWTH_ROAD_TILES_PER_MONTH);
  });

  it('clears the month budget with the other monthly counters', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    run(scenario, TICKS_PER_MONTH + 10 * TICKS_PER_DAY);
    expect(scenario.townA.roadTilesThisMonth).toBeGreaterThan(0);
    run(scenario, TICKS_PER_MONTH);
    // A month boundary was crossed, so the budget was spent again from zero
    // rather than carrying the previous month's tally.
    expect(scenario.townA.roadTilesThisMonth).toBeLessThanOrEqual(TOWN_GROWTH_ROAD_TILES_PER_MONTH);
  });
});

// --------------------------------------------------- E-10: one town per day

describe('the round robin', () => {
  it('grows the town the game day names, and no other (Fehlerkatalog 32)', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const map = scenario.world.map;
    const towns = scenario.world.towns;
    expect(towns.length).toBe(2);

    let daysThatBuilt = 0;
    for (let day = 0; day < 40; day++) {
      const before = fabricOf(map);
      run(scenario, TICKS_PER_DAY);
      const expected = ((scenario.world.tick / TICKS_PER_DAY) | 0) % towns.length;
      for (let i = 0; i < map.tileCount; i++) {
        if (before.roads[i] === map.roadBits[i] && before.buildings[i] === map.buildingKind[i]) {
          continue;
        }
        // A tile changed: it has to belong to the town whose turn it was.
        expect(map.townId[i], `day ${day} touched a town that was not its turn`).toBe(expected);
        daysThatBuilt++;
        break;
      }
    }
    expect(daysThatBuilt).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------- the build guards

describe('the guards a town builds through', () => {
  /**
   * The three tiles the growth would extend a street onto next, blocked one
   * way each: track on the first, a company's name on the second, a bridge on
   * the third. Nothing else about the world changes, so the control below
   * proves each tile really was the next one.
   */
  const candidates = (town: Town, map: TileMap): number[] => [
    map.tileIndex(town.x - 5, town.y),
    map.tileIndex(town.x, town.y - 5),
    map.tileIndex(town.x, town.y + 5),
  ];

  it('lays street on those tiles when nothing is in the way (the control)', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const map = scenario.world.map;
    const blocked = candidates(scenario.townA, map);
    run(scenario, TICKS_PER_MONTH);
    let laid = 0;
    for (const tile of blocked) if (map.roadBits[tile] !== 0) laid++;
    expect(laid).toBe(blocked.length);
  });

  it('refuses track, another owner and a structure, and takes no tile instead', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const map = scenario.world.map;
    const blocked = candidates(scenario.townA, map);

    map.trackBits[blocked[0]!] = 1;
    map.railType[blocked[0]!] = RailType.Plain;
    map.owner[blocked[1]!] = 0;
    map.structure[blocked[2]!] = Structure.Bridge;

    const roadsBefore = countIn(map, map.roadBits, 0);
    run(scenario, TICKS_PER_MONTH);

    for (const tile of blocked) {
      expect(map.roadBits[tile], `tile ${tile} was built on through a guard`).toBe(0);
    }
    // And it did not go round them either: with its three candidates blocked
    // the town has nowhere legal to extend, so it lays nothing at all.
    expect(countIn(map, map.roadBits, 0)).toBe(roadsBefore);
  });

  it('never lays street outside the ground the town claimed', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const map = scenario.world.map;
    const before = fabricOf(map);
    run(scenario, 2 * TICKS_PER_YEAR);
    for (let i = 0; i < map.tileCount; i++) {
      if (before.roads[i] !== 0 || map.roadBits[i] === 0) continue;
      if (before.owner[i] !== TILE_PUBLIC) continue;
      expect(map.townId[i], `tile ${i} is not the town's ground`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ------------------------------------- a street's next tile is not a plot

describe('continuesStreet', () => {
  it('reserves the tile a street runs into, and only that one', () => {
    const scenario = servedTowns();
    const map = scenario.world.map;
    const town = scenario.townA;
    // The cross `placeTown` lays runs from -4 to +4 through the centre, so the
    // tile at +5 is the street's own next tile and the one at (+5, +1) is not.
    expect(continuesStreet(map, town.x + 5, town.y)).toBe(true);
    expect(continuesStreet(map, town.x + 5, town.y + 1)).toBe(false);
    // A tile that already carries road is nobody's continuation.
    expect(continuesStreet(map, town.x + 4, town.y)).toBe(false);
  });
});

// ------------------------------- the derived zone mix moves with the houses

describe('the zone mix a stop sells tickets by', () => {
  it('survives a save and a load unchanged after ten years of growth', async () => {
    const { encodeSave, decodeSave } = await import('../../src/sim/save/serialize');
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    run(scenario, 10 * TICKS_PER_YEAR);

    const shares = scenario.world.stations.map((station) => station.commercialShare);
    const bytes = encodeSave(scenario.world, scenario.queue, 'test');
    const loaded = decodeSave(bytes);
    expect(loaded.world.stations.map((station) => station.commercialShare)).toEqual(shares);
    expect(hashWorld(loaded.world)).toBe(hashWorld(scenario.world));
  });

  it('is refreshed when a building is demolished, not left stale', () => {
    const scenario = servedTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    const world = scenario.world;
    const map = world.map;
    const station = world.stations[0]!;

    // Zone a handful of covered tiles commercial by hand and let the station
    // read them, so the share starts well away from zero.
    let commercial = 0;
    for (let dx = -2; dx <= 2 && commercial < 4; dx++) {
      const tile = map.tileIndex(station.x + dx, station.y - 1);
      if (map.buildingKind[tile] === BuildingKind.None) continue;
      map.buildingKind[tile] = BuildingKind.Commercial;
      commercial++;
    }
    expect(commercial).toBeGreaterThan(0);
    assignStationIndustries(world, station);
    const before = station.commercialShare;
    expect(before).toBeGreaterThan(0);

    // Knock one of them down through the command the player has.
    let demolishedX = -1;
    for (let dx = -2; dx <= 2; dx++) {
      const tile = map.tileIndex(station.x + dx, station.y - 1);
      if (map.buildingKind[tile] !== BuildingKind.Commercial) continue;
      demolishedX = station.x + dx;
      break;
    }
    expect(demolishedX).toBeGreaterThanOrEqual(0);
    apply(scenario, {
      kind: CommandKind.DemolishBuilding,
      x: demolishedX,
      y: station.y - 1,
    });

    const afterCommand = station.commercialShare;
    expect(afterCommand).not.toBe(before);
    // And it is exactly what a fresh read of the map says - which is what the
    // decoder does on load, so the two can no longer disagree.
    assignStationIndustries(world, station);
    expect(station.commercialShare).toBe(afterCommand);
  });
});

// -------------------------------------------------- law 7: no allocation

/** Sink for the control loop, so nothing it does can be optimised away. */
let scratch: unknown = null;

/** Bytes allocated over `iterations` calls - the M17 instrument, verbatim. */
function allocatedBytes(work: () => void, iterations: number): number {
  for (let i = 0; i < 2_000; i++) work();

  const profiler = new GCProfiler();
  profiler.start();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) work();
  const after = process.memoryUsage().heapUsed;
  const result = profiler.stop();

  let reclaimed = 0;
  for (const event of result.statistics) {
    reclaimed +=
      event.beforeGC.heapStatistics.usedHeapSize - event.afterGC.heapStatistics.usedHeapSize;
  }
  return after - before + reclaimed;
}

describe('the growth pass in the daily hook (law 7)', () => {
  const ITERATIONS = 50_000;

  it('allocates nothing on a played world, with an allocating control', () => {
    const world = World.create({
      seed: 4_711,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 256,
      companyName: 'Wachstum',
      companyColorIndex: 1,
    });
    const queue = new CommandQueue();
    for (let tick = 0; tick < 2 * TICKS_PER_YEAR; tick++) world.step(queue, null);
    expect(world.towns.length).toBeGreaterThan(10);

    const measured = allocatedBytes(() => growTownFabric(world), ITERATIONS);
    const control = allocatedBytes(() => {
      for (const town of world.towns) scratch = { id: town.id, roads: town.roadTilesThisMonth };
    }, ITERATIONS);

    console.log(
      `town growth pass: ${(measured / ITERATIONS).toFixed(3)} B per game day over ` +
        `${ITERATIONS} days; the allocating control ${(control / ITERATIONS).toFixed(2)} B`,
    );
    expect(scratch).not.toBeNull();
    expect(control / ITERATIONS).toBeGreaterThan(30);
    expect(measured / ITERATIONS).toBeLessThan(2);
  });

  it('costs what the milestone claims it costs, measured', () => {
    const world = World.create({
      seed: 20_260_811,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 512,
      companyName: 'Wachstum',
      companyColorIndex: 1,
    });
    const queue = new CommandQueue();
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(queue, null);

    const samples = 20_000;
    for (let i = 0; i < 2_000; i++) growTownFabric(world);
    const started = performance.now();
    for (let i = 0; i < samples; i++) growTownFabric(world);
    const perCall = ((performance.now() - started) / samples) * 1_000;
    console.log(
      `town growth pass on ${world.towns.length} towns of a 512 map: ` +
        `${perCall.toFixed(2)} us per game day (one town), i.e. ` +
        `${((perCall * TICKS_PER_MONTH) / TICKS_PER_DAY / 1_000).toFixed(4)} ms per game month`,
    );
    // A generous multiple of the measurement, in the D-167 posture: this is a
    // tripwire against a regression of multiples, never an acceptance number.
    expect(perCall).toBeLessThan(500);
  });
});
