import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gravityMassOf } from '../../src/sim/cargo/routing';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { AIRPORT_RUNWAYS, GRAVITY_BASE_POPULATION, TICKS_PER_DAY } from '../../src/sim/constants';
import { ModuleKind, type Station } from '../../src/sim/station/types';
import { BuildingKind } from '../../src/sim/town/types';
import type { World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, SCENARIO_SIZE, type Scenario } from '../balance/scenario';

/**
 * Destinations by gravitation (SPEC2 M19 bundle 2).
 *
 * A traveller is likelier to go to a big place than to a small one, and the
 * simulation says so by MULTIPLYING the mass of the destination onto the
 * network-time weight that already decided the split. Everything below is
 * built so that the two factors can be told apart:
 *
 *  - the two destinations are the same journey away, and every test that
 *    claims a gravity effect ASSERTS that equality first. A split that could
 *    be explained by a shorter trip is not evidence of gravity, and the fleet
 *    is deliberately parked so that the two legs keep the identical
 *    straight-line estimate for the whole of a test rather than drifting apart
 *    as trips are measured;
 *  - the same world carries MAIL, which is a town cargo and not a passenger
 *    class. Mail must stay an even split under the identical geometry, which
 *    is what says the passenger figure is the gravity rule and not the map.
 */

const ROW = SCENARIO_SIZE >> 1;
const HUB_X = SCENARIO_SIZE >> 1;
/** Town centre spacing. Both branches use it, so both journeys are equal. */
const REACH = 12;
const HUB_POPULATION = 900;
const POPULATION = 1_200;
/** The bus of balancing scenario 1. Bought, ordered - and never started. */
const BUS = 200;

interface Trio extends Scenario {
  readonly hub: Station;
  readonly west: Station;
  readonly east: Station;
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
 * A hub town with a branch to the west and a branch to the east, laid out
 * symmetrically about the hub so that the two journeys are the same journey.
 *
 * The two buses are bought and given orders but never set running. Orders are
 * all the link graph needs to know a leg exists (`refreshLinks` reads them),
 * and a fleet that never completes a trip never replaces the straight-line
 * estimate with a measurement - so the two legs stay bit-identical for as long
 * as the test runs, which is what makes "at equal network time" a fact rather
 * than a hope. Nothing is collected either, so what a station holds is exactly
 * what the daily deposit put there.
 */
function trio(westPopulation: number, eastPopulation: number, mixedHubZoning = false): Trio {
  const towns = [
    makeTown(0, HUB_X, ROW, HUB_POPULATION, 'Mittheim'),
    makeTown(1, HUB_X - REACH, ROW, westPopulation, 'Westheim'),
    makeTown(2, HUB_X + REACH, ROW, eastPopulation, 'Ostheim'),
  ];
  const scenario = flatScenario(SCENARIO_SIZE, towns, [], 1);

  // Zoned BEFORE the stops are built, because `commercialShare` is derived by
  // the catchment scan a build runs (D-207) and nothing repaints it later.
  if (mixedHubZoning) {
    const map = scenario.world.map;
    let painted = 0;
    for (let index = 0; index < map.buildingKind.length; index++) {
      if (map.townId[index] !== 0) continue;
      if (map.buildingKind[index] !== BuildingKind.Residential) continue;
      if (painted % 2 === 0) map.buildingKind[index] = BuildingKind.Commercial;
      painted++;
    }
  }

  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: HUB_X - REACH,
    y1: ROW,
    x2: HUB_X + REACH,
    y2: ROW,
  });

  const westX = HUB_X - REACH + 1;
  const eastX = HUB_X + REACH - 1;
  for (const x of [HUB_X, westX, eastX]) {
    apply(scenario, { kind: CommandKind.BuildRoadStop, x, y: ROW, moduleKind: ModuleKind.BusStop });
  }
  // The depot joins the hub stop, exactly as it does in balancing scenario 1.
  // That moves the hub's centre one tile down the vertical arm - and one tile
  // TOWARDS neither branch, so the two distances stay equal.
  const depotY = ROW + 2;
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: HUB_X,
    y: depotY,
    moduleKind: ModuleKind.RoadDepot,
  });

  const world = scenario.world;
  const hub = stationOn(world, HUB_X, ROW);
  const west = stationOn(world, westX, ROW);
  const east = stationOn(world, eastX, ROW);

  for (const branch of [west, east]) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: HUB_X, y: depotY, specId: BUS });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: world.vehicles.count - 1,
      orders: [
        { target: 0, targetId: hub.id, load: 1, unload: 0 },
        { target: 0, targetId: branch.id, load: 1, unload: 0 },
      ],
    });
  }

  return { ...scenario, hub, west, east };
}

function step(scenario: Scenario, ticks: number): void {
  for (let i = 0; i < ticks; i++) scenario.world.step(scenario.queue, null);
}

/** Units of one cargo waiting here that are bound for one destination. */
function destinedFor(station: Station, cargo: Cargo, destinationId: number): number {
  let units = 0;
  for (const stack of station.waiting) {
    if (stack.cargo === cargo && stack.destinationStationId === destinationId)
      units += stack.amount;
  }
  return units;
}

/** Everything waiting at a station, whatever it is and wherever it is going. */
function waitingTotal(station: Station): number {
  let units = 0;
  for (const stack of station.waiting) units += stack.amount;
  return units;
}

/**
 * The two journeys, asserted equal - the control every gravity claim below
 * rests on. Returned so a test can also show it is a real journey and not two
 * unreachable infinities.
 */
function equalJourneys(trioWorld: Trio): number {
  const graph = trioWorld.world.cargoLinks;
  const toWest = graph.expectedTicks(trioWorld.hub.id, trioWorld.west.id);
  const toEast = graph.expectedTicks(trioWorld.hub.id, trioWorld.east.id);
  expect(Number.isFinite(toWest), 'the west branch is a real journey').toBe(true);
  expect(toEast, 'the two branches must be the SAME journey').toBe(toWest);
  return toWest;
}

// ------------------------------------------------------------------- the mass

describe('what a destination weighs', () => {
  it('is the destination town plus the floor, and nothing else', () => {
    const scenario = trio(POPULATION, 2 * POPULATION);
    const world = scenario.world;

    expect(gravityMassOf(world, scenario.west)).toBe(GRAVITY_BASE_POPULATION + POPULATION);
    expect(gravityMassOf(world, scenario.east)).toBe(GRAVITY_BASE_POPULATION + 2 * POPULATION);
  });

  it('falls back to the floor where there is no town at all', () => {
    const scenario = trio(POPULATION, POPULATION);
    const orphan: Station = { ...scenario.west, townId: -1 };
    expect(gravityMassOf(scenario.world, orphan)).toBe(GRAVITY_BASE_POPULATION);
  });

  it('multiplies by the airport size, which is the runway count', () => {
    const scenario = trio(POPULATION, POPULATION);
    const world = scenario.world;
    const plain = gravityMassOf(world, scenario.east);

    const kinds = [ModuleKind.Airstrip, ModuleKind.Airport, ModuleKind.InternationalAirport];
    for (let size = 0; size < kinds.length; size++) {
      const withAir: Station = {
        ...scenario.east,
        modules: [
          ...scenario.east.modules,
          { kind: kinds[size]!, tileIndex: 0, x: scenario.east.x, y: scenario.east.y },
        ],
      };
      expect(gravityMassOf(world, withAir), `airport size ${size}`).toBe(
        plain * AIRPORT_RUNWAYS[size]!,
      );
    }
  });
});

// ------------------------------------------------- the split, at equal time

describe('passenger flow by gravitation', () => {
  it('sends measurably more travellers to a town twice the size at the SAME network time', () => {
    const scenario = trio(POPULATION, 2 * POPULATION);
    // One production slice, with the links already known: the first day
    // boundary registers the legs (refreshCargoRouting runs before the town
    // produces), the second deposits against them.
    step(scenario, 2 * TICKS_PER_DAY);

    const journey = equalJourneys(scenario);
    expect(journey).toBeGreaterThan(0);

    const toWest = destinedFor(scenario.hub, Cargo.CommuterPax, scenario.west.id);
    const toEast = destinedFor(scenario.hub, Cargo.CommuterPax, scenario.east.id);
    expect(toWest).toBeGreaterThan(0);
    expect(toEast).toBeGreaterThan(0);

    // The masses are the ONLY thing that differs, so the split is their ratio.
    const west = gravityMassOf(scenario.world, scenario.west);
    const east = gravityMassOf(scenario.world, scenario.east);
    expect(toEast / toWest).toBeCloseTo(east / west, 9);
    // And it is a difference worth the name: 2,500 against 1,300.
    expect(toEast / toWest).toBeGreaterThan(1.9);
  });

  it('splits evenly between two equal towns on the identical geometry', () => {
    // The confound control. Same map, same stops, same parked buses, same
    // journey - only the far town's population is now the west town's. If the
    // test above measured the road rather than the population, this one would
    // measure the same imbalance, and it does not.
    const scenario = trio(POPULATION, POPULATION);
    step(scenario, 2 * TICKS_PER_DAY);
    equalJourneys(scenario);

    const toWest = destinedFor(scenario.hub, Cargo.CommuterPax, scenario.west.id);
    const toEast = destinedFor(scenario.hub, Cargo.CommuterPax, scenario.east.id);
    expect(toWest).toBeGreaterThan(0);
    expect(toEast / toWest).toBeCloseTo(1, 9);
  });

  it('leaves mail on the same map an even split - the rule is passengers only', () => {
    // Mail is a town cargo, is always accepted, travels the identical legs and
    // is deposited in the same daily pass by the same function. It is the
    // second control: gravity is a PASSENGER rule (SPEC2 M19), so a works or a
    // post office at the far end has no opinion about how big the town is.
    const scenario = trio(POPULATION, 2 * POPULATION);
    step(scenario, 2 * TICKS_PER_DAY);
    equalJourneys(scenario);

    const toWest = destinedFor(scenario.hub, Cargo.Mail, scenario.west.id);
    const toEast = destinedFor(scenario.hub, Cargo.Mail, scenario.east.id);
    expect(toWest).toBeGreaterThan(0);
    expect(toEast / toWest).toBeCloseTo(1, 9);
  });

  it('gives both passenger classes the same split, because the mass is the place', () => {
    // The shared search of D-207 survives gravity by construction: the mass
    // reads the DESTINATION's town and modules and nothing about the cargo.
    // Half the hub is a shopping street, so it offers both classes at once.
    const scenario = trio(POPULATION, 2 * POPULATION, true);
    expect(scenario.hub.commercialShare).toBeGreaterThan(0.2);
    expect(scenario.hub.commercialShare).toBeLessThan(0.8);

    step(scenario, 2 * TICKS_PER_DAY);
    equalJourneys(scenario);

    const west = gravityMassOf(scenario.world, scenario.west);
    const east = gravityMassOf(scenario.world, scenario.east);
    const expected = east / (east + west);

    for (const cargo of [Cargo.CommuterPax, Cargo.BusinessPax]) {
      const toWest = destinedFor(scenario.hub, cargo, scenario.west.id);
      const toEast = destinedFor(scenario.hub, cargo, scenario.east.id);
      expect(toWest, `cargo ${cargo} reached the west`).toBeGreaterThan(0);
      expect(toEast / (toEast + toWest), `cargo ${cargo}`).toBeCloseTo(expected, 9);
    }
  });
});

// ----------------------------------------------------------------- the cadence

describe('the cadence of the gravity scores', () => {
  it('is once a game day, measured tick by tick', () => {
    // SPEC2 M19 is explicit that this must never be a tick hot path. The
    // fleet is parked, so nothing but the daily deposit can move a station's
    // pile - and the ticks on which it moves are counted rather than assumed.
    const scenario = trio(POPULATION, 2 * POPULATION);
    step(scenario, TICKS_PER_DAY);

    const days = 4;
    const movedOn: number[] = [];
    let previous = waitingTotal(scenario.hub);
    for (let i = 0; i < days * TICKS_PER_DAY; i++) {
      step(scenario, 1);
      const now = waitingTotal(scenario.hub);
      if (now !== previous) movedOn.push(scenario.world.tick);
      previous = now;
    }

    expect(movedOn.length, 'one deposit per game day and not one more').toBe(days);
    for (const tick of movedOn) expect(tick % TICKS_PER_DAY).toBe(0);
  });

  it('is reached from the daily block of World.step and from nowhere else', () => {
    // The structural half: the three entry points that choose destinations,
    // and the one place in the simulation that calls them.
    const source = readFileSync(
      fileURLToPath(new URL('../../src/sim/World.ts', import.meta.url)),
      'utf8',
    );
    const daily = source.indexOf('if (this.tick % TICKS_PER_DAY === 0) {');
    expect(daily, 'World.step still has a daily block').toBeGreaterThan(0);
    const monthly = source.indexOf('if (this.tick % TICKS_PER_MONTH === 0) {', daily);
    expect(monthly).toBeGreaterThan(daily);

    const block = source.slice(daily, monthly);
    for (const hook of ['refreshCargoRouting(this)', 'produceTownCargo(this)']) {
      expect(source.split(hook).length - 1, `${hook} is called exactly once`).toBe(1);
      expect(block.includes(hook), `${hook} sits in the daily block`).toBe(true);
    }
  });
});
