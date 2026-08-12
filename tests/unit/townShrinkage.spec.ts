import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TILE_PUBLIC,
  TOWN_SHRINK_RATE_PER_MONTH,
} from '../../src/sim/constants';
import type { TileMap } from '../../src/sim/map/TileMap';
import { Structure } from '../../src/sim/map/structures';
import { buildingsWantedFor, countTownBuildings } from '../../src/sim/mapgen/towns';
import { historySlot, StationHistoryField } from '../../src/sim/station/history';
import { inCatchment, ModuleKind, stationRating } from '../../src/sim/station/types';
import { BuildingKind, RoadBit, type Town } from '../../src/sim/town/types';
import { hashWorld } from '../../src/sim/World';
import {
  apply,
  buildBusLine,
  flatScenario,
  makeTown,
  SCENARIO_SIZE,
  type Scenario,
  type TwoTownScenario,
} from '../balance/scenario';

/**
 * The dangerous half of SPEC.md 13.2 (SPEC2 M20 bundle 2).
 *
 * "Ohne jede Versorgung schrumpfen Staedte langsam (-0,03 %/Monat)", and the
 * milestone asks for two things beyond the rate itself: the shrinkage has to
 * take BUILDINGS down again, and it has to be tested against station
 * catchments, "die Todesspirale (10.1) darf dadurch nicht unsichtbar
 * eskalieren (die M14-Instrumente zeigen sie)".
 *
 * So this file measures four things:
 *
 *  - an unserved town shrinks at exactly the stated rate, month by month,
 *    against a hand-rolled expectation and not against the code's own;
 *  - it takes houses down as it goes, down to `buildingsWantedFor`;
 *  - a SERVED town does not shrink at all, which is what makes the rule a rule
 *    about service rather than a decay everybody pays;
 *  - the removal never leaves a station with an empty catchment, and the
 *    decline stays legible in the M14 history ring while it happens;
 *  - D-216's pruning invariant - no street tile serving nothing - survives
 *    growth AND shrinkage, and nothing a company built is ever touched.
 */

const POPULATION = 8_000;
const CLAIM_RADIUS = 9;
const DISTANCE_TILES = 25;
const BUS_SPEC = 200;
const BUS_COUNT = 20;
const FIXTURE_CAPITAL_CT = 50_000_000_00;

// --------------------------------------------------------------- the fixture

/** Widen a town's claim, exactly as `townGrowth.spec.ts` does. */
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

function twoTowns(): TwoTownScenario {
  const y = SCENARIO_SIZE >> 1;
  const startX = (SCENARIO_SIZE - DISTANCE_TILES) >> 1;
  const townA = makeTown(0, startX, y, POPULATION, 'Westheim');
  const townB = makeTown(1, startX + DISTANCE_TILES, y, POPULATION, 'Ostheim');
  const scenario = flatScenario(SCENARIO_SIZE, [townA, townB], [], 1);
  claimAround(scenario.world.map, townA, CLAIM_RADIUS);
  claimAround(scenario.world.map, townB, CLAIM_RADIUS);
  scenario.world.company.cashCt = FIXTURE_CAPITAL_CT;
  return { ...scenario, townA, townB };
}

/**
 * A town whose housing stock already matches its population, so the very first
 * month of decline is a SURPLUS rather than a deficit still being filled.
 *
 * The population is set FROM what stands, which is the honest way round: a
 * fixture that set the stock from the population would be asserting the growth
 * pass's own arithmetic back at it.
 */
function settledTown(scenario: TwoTownScenario, town: Town): number {
  const standing = countTownBuildings(scenario.world.map, town, town.radius);
  town.population = standing * 100;
  return standing;
}

function run(scenario: Scenario, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
}

// --------------------------------------------------------------- the rate

describe('a town nothing at all reaches', () => {
  it('loses 0.03 % of its people a month, month by month', () => {
    const scenario = twoTowns();
    const town = scenario.townA;
    settledTown(scenario, town);
    const start = town.population;

    // Rolled by hand from the specification's own figure, with the game's own
    // integer rounding and nothing else.
    let expected = start;
    const MONTHS = 24;
    for (let month = 0; month < MONTHS; month++) {
      run(scenario, TICKS_PER_MONTH);
      expected = Math.round(expected * (1 - 0.0003));
      expect(town.population, `after month ${month + 1}`).toBe(expected);
    }
    expect(TOWN_SHRINK_RATE_PER_MONTH).toBe(0.0003);
    console.log(`unserved town over ${MONTHS} months: ${start} -> ${town.population} inhabitants`);
    expect(town.population).toBeLessThan(start);
  });

  it('takes houses down as it goes, and never more than the population asks for', () => {
    const scenario = twoTowns();
    const town = scenario.townA;
    const standing = settledTown(scenario, town);
    const YEARS = 25;
    run(scenario, YEARS * TICKS_PER_YEAR);

    const after = countTownBuildings(scenario.world.map, town, town.radius);
    console.log(
      `unserved town over ${YEARS} game years: population ${standing * 100} -> ` +
        `${town.population}, buildings ${standing} -> ${after} ` +
        `(wanted ${buildingsWantedFor(town.population)})`,
    );
    expect(town.population).toBeLessThan(standing * 100);
    expect(after).toBeLessThan(standing);
    // It stops exactly where the housing ratio says it should - a town that
    // over-demolished would start BUILDING again the next day and thrash.
    expect(after).toBe(buildingsWantedFor(town.population));
  });
});

describe('a town that is served', () => {
  it('does not shrink, and that is the whole difference', () => {
    const served = twoTowns();
    const starved = twoTowns();
    settledTown(served, served.townA);
    settledTown(starved, starved.townA);
    const start = served.townA.population;
    expect(starved.townA.population).toBe(start);

    buildBusLine(served, BUS_SPEC, BUS_COUNT);
    const YEARS = 5;
    run(served, YEARS * TICKS_PER_YEAR);
    run(starved, YEARS * TICKS_PER_YEAR);

    console.log(
      `after ${YEARS} game years: served ${served.townA.population}, ` +
        `unserved ${starved.townA.population} (both started at ${start})`,
    );
    expect(served.townA.population).toBeGreaterThan(start);
    expect(starved.townA.population).toBeLessThan(start);
  });
});

// ------------------------------------------ the catchment and the 10.1 spiral

/**
 * A stop that nobody drives to: the town has a station, produces passengers
 * into it and never gets one carried away, so `versorgungPass` is zero and the
 * town shrinks WITH a station standing on it. That is the only shape in which
 * shrinkage and a station can be in the same world, and it is exactly the
 * escalation SPEC2 M20 asks to be tested.
 */
function stoppedLine(): TwoTownScenario {
  const scenario = twoTowns();
  settledTown(scenario, scenario.townA);
  settledTown(scenario, scenario.townB);
  buildBusLine(scenario, BUS_SPEC, 1);
  for (let id = 0; id < scenario.world.vehicles.count; id++) {
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: false });
  }
  return scenario;
}

describe('shrinkage against the station catchments', () => {
  it('never leaves a station of the town with an empty catchment', () => {
    const scenario = stoppedLine();
    const world = scenario.world;
    const town = scenario.townA;
    // Force the extreme case the slow rate would take three centuries to
    // reach: a population that wants four houses where eighty stand.
    town.population = 400;

    // A month of daily growth passes is far more turns than the town needs.
    for (let day = 0; day < 30 * TICKS_PER_DAY; day++) {
      world.step(scenario.queue, null);
      for (const station of world.stations) {
        if (station.townId !== town.id) continue;
        let covered = 0;
        for (let dy = -12; dy <= 12; dy++) {
          for (let dx = -12; dx <= 12; dx++) {
            const x = station.x + dx;
            const y = station.y + dy;
            if (!world.map.contains(x, y)) continue;
            if (!inCatchment(station, x, y)) continue;
            const tile = world.map.tileIndex(x, y);
            if (world.map.townId[tile] !== town.id) continue;
            if (world.map.buildingKind[tile] !== BuildingKind.None) covered++;
          }
        }
        expect(covered, `station ${station.id} was left with nothing to serve`).toBeGreaterThan(0);
      }
    }
    const left = countTownBuildings(world.map, town, town.radius);
    console.log(
      `a town cut back to 400 inhabitants keeps ${left} buildings, ` +
        `${buildingsWantedFor(400)} of them because the housing ratio asks for them and ` +
        'the rest because a station covers them',
    );
    // It really did tear most of the town down - the assertion above is not
    // vacuous - and it stopped where the catchments began.
    expect(left).toBeLessThan(countTownBuildings(world.map, scenario.townB, scenario.townB.radius));
  });

  it('leaves the decline legible in the M14 history ring (the 10.1 spiral)', () => {
    const scenario = stoppedLine();
    const world = scenario.world;
    const town = scenario.townA;
    const station = world.stations.find((entry) => entry.townId === town.id)!;

    // A year to fill the ring and settle the queue at its cap, then read the
    // ring's own month; then a long stretch of decline, then read it again.
    run(scenario, 2 * TICKS_PER_YEAR);
    const early =
      station.history[historySlot(station, 0, Cargo.CommuterPax, StationHistoryField.Expired)]!;
    const earlyPopulation = town.population;
    const earlyRating = stationRating(station, world.tick);

    run(scenario, 40 * TICKS_PER_YEAR);
    const late =
      station.history[historySlot(station, 0, Cargo.CommuterPax, StationHistoryField.Expired)]!;

    console.log(
      `unserved stop: population ${earlyPopulation} -> ${town.population}, ` +
        `commuters lost at the platform ${early} -> ${late} a month, ` +
        `rating ${earlyRating} -> ${stationRating(station, world.tick)}`,
    );
    // The instrument SEES it: the ring's monthly figure falls with the town,
    // so a player watching the station panel watches the spiral rather than
    // discovering it as an empty map twenty years later.
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(early);
    expect(town.population).toBeLessThan(earlyPopulation);
    // And the station is still a station: it has a town, and it still offers
    // something. A stop that had been orphaned would read zero here.
    expect(station.townId).toBe(town.id);
  });
});

// --------------------------------------- a whole generated world, unserved

/**
 * The figure D-231 published and later bundles invalidated (D-235).
 *
 * Bundle 1 measured a generated 256 world, seed 4,711, forty towns, nobody
 * serving anything, and recorded "661 -> 695 buildings, 872 -> 881 street
 * tiles, population 66,100 -> 69,772 ... which is what an unserved world should
 * look like". Bundle 2 then made an unserved town SHRINK, which turns every one
 * of those arrows round - and the sentence stayed in `CLAUDE.md` and in
 * `DECISIONS.md` for two more bundles because nothing red read it.
 *
 * So it is a test now rather than a paragraph. It asserts the DIRECTION, which
 * is the claim, and prints the figures for whoever writes the next digest.
 */
describe('a generated world nobody serves', () => {
  it('loses houses, streets and people over ten years', async () => {
    const { World } = await import('../../src/sim/World');
    const { CommandQueue } = await import('../../src/sim/commands/queue');
    const { Difficulty, MapClimate } = await import('../../src/sim/constants');

    const world = World.create({
      seed: 4_711,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 256,
      companyName: 'Wachstum',
      companyColorIndex: 1,
    });
    const map = world.map;
    const count = (): { buildings: number; roads: number; people: number } => {
      let buildings = 0;
      let roads = 0;
      for (let i = 0; i < map.tileCount; i++) {
        if (map.buildingKind[i] !== BuildingKind.None) buildings++;
        if (map.roadBits[i] !== 0) roads++;
      }
      let people = 0;
      for (const town of world.towns) people += town.population;
      return { buildings, roads, people };
    };

    const before = count();
    const queue = new CommandQueue();
    for (let tick = 0; tick < 10 * TICKS_PER_YEAR; tick++) world.step(queue, null);
    const after = count();

    console.log(
      `a generated 256 world of ${world.towns.length} towns, nobody serving anything, over ` +
        `ten game years: ${before.buildings} -> ${after.buildings} buildings, ${before.roads} -> ` +
        `${after.roads} street tiles, population ${before.people} -> ${after.people}`,
    );
    expect(world.towns.length).toBeGreaterThan(10);
    expect(after.people).toBeLessThan(before.people);
    expect(after.buildings).toBeLessThan(before.buildings);
    expect(after.roads).toBeLessThan(before.roads);
  });
});

// ------------------------------------------------ which house comes down

/**
 * The removal order of `town/growth.ts`, re-implemented from the sentence that
 * documents it rather than from the code that executes it (D-235).
 *
 * The comment there had said "farthest from the centre first, ties on the
 * HIGHEST tile index" and stopped, which reads as an unconditional winner; what
 * runs is that order FILTERED by `mayRemoveBuilding`, and on the fixture below
 * the two differ on a third of the removals. Nothing about the executed choice
 * was wrong - this test is what makes the corrected sentence checkable, and
 * what stops either half drifting from the other.
 */
function orderedCandidates(world: Scenario['world'], town: Town): number[] {
  const map = world.map;
  const out: number[] = [];
  for (let dy = -town.radius; dy <= town.radius; dy++) {
    for (let dx = -town.radius; dx <= town.radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const index = map.tileIndex(x, y);
      if (map.townId[index] !== town.id) continue;
      if (map.buildingKind[index] === BuildingKind.None) continue;
      out.push(index);
    }
  }
  const distanceSq = (index: number): number => {
    const dx = (index % map.size) - town.x;
    const dy = ((index / map.size) | 0) - town.y;
    return dx * dx + dy * dy;
  };
  // The documented total order, as a comparator: farthest first, then highest
  // tile index. No two candidates tie on both, so it is total.
  out.sort((a, b) => distanceSq(b) - distanceSq(a) || b - a);
  return out;
}

/** `mayRemoveBuilding`'s rule, counted live off the map (the guard). */
function guardPermits(world: Scenario['world'], town: Town, index: number): boolean {
  const map = world.map;
  const x = index % map.size;
  const y = (index / map.size) | 0;
  for (const station of world.stations) {
    if (station.townId !== town.id) continue;
    let covered = 0;
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const tx = station.x + dx;
        const ty = station.y + dy;
        if (!map.contains(tx, ty)) continue;
        if (!inCatchment(station, tx, ty)) continue;
        const tile = map.tileIndex(tx, ty);
        if (map.townId[tile] !== town.id) continue;
        if (map.buildingKind[tile] !== BuildingKind.None) covered++;
      }
    }
    if (covered > 1) continue;
    if (inCatchment(station, x, y)) return false;
  }
  return true;
}

describe('the house a shrinking town takes down', () => {
  it('is the first in the documented total order that the catchment guard permits', () => {
    const scenario = stoppedLine();
    const world = scenario.world;
    const town = scenario.townA;

    // A stop out at the edge of the town, reached by its own road, so the
    // buildings it covers are the FARTHEST from the centre - the only geometry
    // in which the guard can refuse the winner of the order while permitting a
    // nearer candidate. Without it the guard is never selective and this test
    // would pass on a fixture that cannot tell the two rules apart.
    apply(scenario, {
      kind: CommandKind.BuildRoad,
      x1: town.x,
      y1: town.y - 1,
      x2: town.x,
      y2: town.y - 6,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: town.x,
      y: town.y - 6,
      moduleKind: ModuleKind.BusStop,
    });
    const edgeStop = world.stations.find(
      (station) => station.x === town.x && station.y === town.y - 6,
    );
    expect(edgeStop?.townId).toBe(town.id);

    town.population = 400;
    const map = world.map;
    let removals = 0;
    let guardBit = 0;
    let tieDecided = 0;

    for (let day = 0; day < 200; day++) {
      const before = map.buildingKind.slice();
      const order = orderedCandidates(world, town);
      const permitted = order.filter((index) => guardPermits(world, town, index));
      const expected = permitted[0] ?? -1;
      for (let tick = 0; tick < TICKS_PER_DAY; tick++) world.step(scenario.queue, null);

      let removed = -1;
      for (let i = 0; i < map.tileCount; i++) {
        if (before[i] !== BuildingKind.None && map.buildingKind[i] === BuildingKind.None) {
          removed = i;
          break;
        }
      }
      if (removed === -1) continue;
      removals++;
      expect(removed, `day ${day}`).toBe(expected);
      // The guard was selective on this removal: the winner of the order alone
      // is not the tile that went.
      if (order[0] !== expected) guardBit++;
      // And the tie-break decided it: another permitted candidate stood at the
      // same distance from the centre.
      const dx = (expected % map.size) - town.x;
      const dy = ((expected / map.size) | 0) - town.y;
      const tied = permitted.filter((index) => {
        const ix = (index % map.size) - town.x;
        const iy = ((index / map.size) | 0) - town.y;
        return ix * ix + iy * iy === dx * dx + dy * dy;
      });
      if (tied.length > 1) tieDecided++;
    }

    console.log(
      `removals ${removals}: the guard refused the winner of the order on ${guardBit} of them, ` +
        `the tie-break on the highest tile index decided ${tieDecided}`,
    );
    // Non-vacuous in both directions: houses really came down, the guard really
    // was selective, and the tie-break really was load bearing.
    expect(removals).toBeGreaterThan(5);
    expect(guardBit).toBeGreaterThan(0);
    expect(tieDecided).toBeGreaterThan(0);
  });
});

// ------------------------------------------- D-216's invariant, both ways

/**
 * D-216's rule, re-implemented on the TEST side so it cannot be satisfied by
 * calling the pruner's own predicate: a street tile with exactly one connection
 * has to have something on it or beside it.
 */
function unservedDeadEnds(scenario: Scenario, town: Town): number {
  const map = scenario.world.map;
  let found = 0;
  for (let dy = -town.radius; dy <= town.radius; dy++) {
    for (let dx = -town.radius; dx <= town.radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const index = map.tileIndex(x, y);
      const bits = map.roadBits[index]!;
      if (bits === 0) continue;
      if ((bits & (bits - 1)) !== 0) continue;

      if (map.trackBits[index] !== 0) continue;
      if (map.structure[index] !== Structure.None) continue;
      if (map.industryId[index] !== -1) continue;
      if (map.owner[index] !== TILE_PUBLIC) continue;
      const beside = [index - 1, index + 1, index - map.size, index + map.size];
      if (
        beside.some(
          (tile) =>
            map.buildingKind[tile] !== BuildingKind.None ||
            map.industryId[tile] !== -1 ||
            map.owner[tile] !== TILE_PUBLIC,
        )
      ) {
        continue;
      }
      found++;
    }
  }
  return found;
}

describe("D-216's pruning invariant", () => {
  it('holds while a town GROWS', () => {
    const scenario = twoTowns();
    buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
    expect(unservedDeadEnds(scenario, scenario.townA)).toBe(0);
    run(scenario, 10 * TICKS_PER_YEAR);
    expect(countTownBuildings(scenario.world.map, scenario.townA, CLAIM_RADIUS)).toBeGreaterThan(0);
    expect(unservedDeadEnds(scenario, scenario.townA)).toBe(0);
  });

  it('holds while a town SHRINKS, and the streets keep their joins', () => {
    const scenario = stoppedLine();
    const map = scenario.world.map;
    const town = scenario.townA;
    town.population = 400;
    run(scenario, 30 * TICKS_PER_DAY);

    expect(unservedDeadEnds(scenario, town)).toBe(0);
    // Every remaining connection is still symmetric - a pruner that cleared a
    // leaf without clearing the bit its neighbour carried back would leave a
    // road pointing at open country (D-218's invariant).
    for (let i = 0; i < map.tileCount; i++) {
      const bits = map.roadBits[i]!;
      if (bits === 0) continue;
      if ((bits & RoadBit.West) !== 0) expect(map.roadBits[i - 1]! & RoadBit.East).not.toBe(0);
      if ((bits & RoadBit.East) !== 0) expect(map.roadBits[i + 1]! & RoadBit.West).not.toBe(0);
      if ((bits & RoadBit.North) !== 0) {
        expect(map.roadBits[i - map.size]! & RoadBit.South).not.toBe(0);
      }
      if ((bits & RoadBit.South) !== 0) {
        expect(map.roadBits[i + map.size]! & RoadBit.North).not.toBe(0);
      }
    }
  });

  it('never takes a tile a company owns, however far the town falls', () => {
    const scenario = stoppedLine();
    const map = scenario.world.map;
    const before = map.roadBits.slice();
    const owner = map.owner.slice();
    scenario.townA.population = 400;
    scenario.townB.population = 400;
    run(scenario, 60 * TICKS_PER_DAY);

    let ownedTiles = 0;
    for (let i = 0; i < map.tileCount; i++) {
      if (owner[i] === TILE_PUBLIC) continue;
      ownedTiles++;
      expect(map.owner[i], `tile ${i} changed hands`).toBe(owner[i]);
      if (before[i] !== 0) expect(map.roadBits[i], `tile ${i} lost its road`).not.toBe(0);
    }
    expect(ownedTiles).toBeGreaterThan(0);
  });

  it('is the same world after a save and a load', async () => {
    const { encodeSave, decodeSave } = await import('../../src/sim/save/serialize');
    const scenario = stoppedLine();
    scenario.townA.population = 1_200;
    run(scenario, 40 * TICKS_PER_DAY);
    const loaded = decodeSave(encodeSave(scenario.world, scenario.queue, 'test'));
    expect(hashWorld(loaded.world)).toBe(hashWorld(scenario.world));
  });
});

// ---------------------------------------------------------------- the stop

describe('a shrinking town and the stop that stands in it', () => {
  it('keeps the stop buildable and the bus line intact', () => {
    const scenario = stoppedLine();
    const world = scenario.world;
    const stops = world.stations.filter((station) =>
      station.modules.some((module) => module.kind === ModuleKind.BusStop),
    );
    expect(stops.length).toBe(2);
    scenario.townA.population = 400;
    run(scenario, 60 * TICKS_PER_DAY);
    // Nothing about the town's decline removes a module, a station or a line.
    expect(
      world.stations.filter((station) =>
        station.modules.some((module) => module.kind === ModuleKind.BusStop),
      ).length,
    ).toBe(2);
    for (const stop of stops) expect(stop.modules.length).toBeGreaterThan(0);
  });
});
