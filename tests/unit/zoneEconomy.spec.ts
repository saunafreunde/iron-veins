import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import {
  MAIL_PER_INHABITANT_PER_MONTH,
  TOWN_INHABITANTS_PER_FOOD,
  TOWN_INHABITANTS_PER_GOODS,
  TOWN_MAIL_COMMERCIAL_WEIGHT,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
} from '../../src/sim/constants';
import { CommandKind } from '../../src/sim/commands/types';
import {
  refreshCommercialShare,
  stationAccepts,
  TOWN_CARGO,
} from '../../src/sim/industry/catchment';
import { ModuleKind } from '../../src/sim/station/types';
import { electronicsWantedFor, growTowns, produceTownCargo } from '../../src/sim/town/update';
import { BuildingKind } from '../../src/sim/town/types';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The zone economy of SPEC2 M20 (SPEC.md 13.1 put to economic use).
 *
 * The zones have decided how a town LOOKS since M2 and, since SPEC2 M19, which
 * ticket a stop sells (D-207). This bundle is the rest of the sentence:
 * residential produces commuters and consumes goods and food, commercial
 * produces mail and business travellers and consumes goods and electronics.
 *
 * **Which assertions are evidence and which are the no-op proof.**
 * `TOWN_MAIL_COMMERCIAL_WEIGHT` was chosen for the ratio it states, so a test
 * that measured it back would be checking its own arithmetic; the electronics
 * demand is SPEC.md 13.2's own `max(0, (einwohner-3000)) / 2500` since D-235
 * and is hand-checked against the specification in `townFormula.spec.ts`. What
 * is independent of both:
 *
 *  - the town's mail TOTAL is invariant under any zoning, which follows from
 *    the weights being normalised and from no number in the table;
 *  - an all-residential town takes exactly the pre-M20 demands, which is the
 *    D-201 device and the reason every hand-built band of section 19.4 is
 *    untouched by construction;
 *  - a commercial zone is what CREATES electronics demand and what REMOVES
 *    food demand, both compared against the same town with the same goods.
 */

const SIZE = 64;
const ROW = 32;
const TOWN_X = 32;
const POPULATION = 4_000;

function townScenario(): Scenario {
  const scenario = flatScenario(SIZE, [makeTown(0, TOWN_X, ROW, POPULATION, 'Zonenstadt')], []);
  for (const company of scenario.world.companies) company.cashCt = 500_000_000_00;
  return scenario;
}

/** Zone the houses on one side of the east-west arm commercial. */
function zoneCommercial(scenario: Scenario, fromX: number, toX: number): void {
  const map = scenario.world.map;
  for (let x = fromX; x <= toX; x++) {
    for (const y of [ROW - 1, ROW + 1]) {
      const tile = map.tileIndex(x, y);
      if (map.buildingKind[tile] === BuildingKind.None) continue;
      map.buildingKind[tile] = BuildingKind.Commercial;
    }
  }
  for (const station of scenario.world.stations) refreshCommercialShare(map, station);
}

/** Total mail waiting at every station of the world. */
function mailWaiting(scenario: Scenario): number {
  let total = 0;
  for (const station of scenario.world.stations) {
    for (const stack of station.waiting) {
      if (stack.cargo === Cargo.Mail) total += stack.amount;
    }
  }
  return total;
}

function mailAt(scenario: Scenario, stationIndex: number): number {
  let total = 0;
  for (const stack of scenario.world.stations[stationIndex]!.waiting) {
    if (stack.cargo === Cargo.Mail) total += stack.amount;
  }
  return total;
}

// ----------------------------------------------------- the commercial post

describe('a town offers its post where its shops are', () => {
  it('splits the same total between two stops by their zone mix', () => {
    const scenario = townScenario();
    // Two stops on the same arm, one at each end, so both cover houses and
    // neither covers the other's.
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 4,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X + 4,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });
    const [west, east] = scenario.world.stations;
    expect(west).toBeDefined();
    expect(east).toBeDefined();

    // All residential first: the two stops differ only in what they cover, so
    // whatever they get, they get it in the same proportion as the passengers.
    produceTownCargo(scenario.world);
    const flatWest = mailAt(scenario, 0);
    const flatEast = mailAt(scenario, 1);
    const flatTotal = flatWest + flatEast;
    expect(flatTotal).toBeGreaterThan(0);

    // Now zone the east end commercial and produce another slice.
    zoneCommercial(scenario, TOWN_X + 1, TOWN_X + 6);
    expect(east!.commercialShare).toBeGreaterThan(0);
    expect(west!.commercialShare).toBe(0);

    produceTownCargo(scenario.world);
    const zonedWest = mailAt(scenario, 0) - flatWest;
    const zonedEast = mailAt(scenario, 1) - flatEast;

    // The TOTAL is the town's and did not move - the whole point of a weight
    // that is normalised rather than a rate that is scaled.
    expect(zonedWest + zonedEast).toBeCloseTo(flatTotal, 6);
    // And the shopping end now takes more of it than it did.
    expect(zonedEast).toBeGreaterThan(flatEast);
    expect(zonedWest).toBeLessThan(flatWest);
    // The weight is the one the constant states: the ratio of the two stops'
    // shares moves by exactly `1 + w * share` on the commercial side.
    const expected =
      ((flatEast / flatWest) * (1 + TOWN_MAIL_COMMERCIAL_WEIGHT * east!.commercialShare)) /
      (1 + TOWN_MAIL_COMMERCIAL_WEIGHT * west!.commercialShare);
    expect(zonedEast / zonedWest).toBeCloseTo(expected, 6);
  });

  it('is the pre-M20 distribution wherever no stop is commercial', () => {
    // The D-201 device, and the reason every hand-built world of section 19.4
    // is untouched: with every share at zero the weights are equal and cancel,
    // so the mail lands exactly where the coverage-times-rating share puts it.
    const scenario = townScenario();
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 4,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X,
      y: ROW + 3,
      moduleKind: ModuleKind.BusStop,
    });
    for (const station of scenario.world.stations) expect(station.commercialShare).toBe(0);

    produceTownCargo(scenario.world);
    const total = mailWaiting(scenario);
    const perSlice =
      (POPULATION * MAIL_PER_INHABITANT_PER_MONTH) / TOWN_PRODUCTION_SLICES_PER_MONTH;
    expect(total).toBeCloseTo(perSlice, 6);

    const [a, b] = scenario.world.stations;
    const weightA = a!.buildingsCovered;
    const weightB = b!.buildingsCovered;
    expect(mailAt(scenario, 0) / mailAt(scenario, 1)).toBeCloseTo(weightA / weightB, 6);
  });
});

// ------------------------------------------------------ what a zone consumes

/** One month of deliveries, then the monthly growth that reads them. */
function deliverAndGrow(
  scenario: Scenario,
  goods: number,
  food: number,
  electronics: number,
): number {
  const town = scenario.world.towns[0]!;
  town.goodsDeliveredThisMonth = goods;
  town.foodDeliveredThisMonth = food;
  town.electronicsDeliveredThisMonth = electronics;
  const before = town.population;
  growTowns(scenario.world);
  return town.population - before;
}

describe('what a town wants is a property of its zones', () => {
  it('asks an all-residential town for exactly the pre-M20 demands', () => {
    // Goods from the whole population, food from the whole population, no
    // electronics demand at all: the arithmetic every balancing world of
    // section 19.4 has been growing on since M5.
    const scenario = townScenario();
    const town = scenario.world.towns[0]!;
    const goodsWanted = POPULATION / TOWN_INHABITANTS_PER_GOODS;
    const foodWanted = POPULATION / TOWN_INHABITANTS_PER_FOOD;

    // A hair under full supply grows less than a hair over it; at the exact
    // demand the term is capped and more changes nothing.
    const under = deliverAndGrow(scenario, goodsWanted * 0.5, foodWanted * 0.5, 0);
    town.population = POPULATION;
    const exact = deliverAndGrow(scenario, goodsWanted, foodWanted, 0);
    town.population = POPULATION;
    const over = deliverAndGrow(scenario, goodsWanted * 4, foodWanted * 4, 0);

    expect(under).toBeLessThan(exact);
    expect(over).toBe(exact);
  });

  it('wants electronics only where it has shops', () => {
    const scenario = townScenario();
    const town = scenario.world.towns[0]!;
    // SPEC.md 13.2's electronics demand is `max(0, (einwohner-3000)) / 2500`
    // (D-235), so it is a CITY's demand by construction: at this fixture's
    // 4,000 inhabitants it is 0.4 t a month against a goods basket of 4.4, and
    // the integer population rounds the difference away. The town is therefore
    // given a city's population for this one test. The MAP is untouched, so
    // the zoning below is the same third of the same buildings.
    const CITY = 120_000;
    town.population = CITY;
    const goodsWanted = CITY / TOWN_INHABITANTS_PER_GOODS;
    const foodWanted = CITY / TOWN_INHABITANTS_PER_FOOD;

    // Fully supplied with goods and food, all residential: the two terms are
    // at their cap.
    const residential = deliverAndGrow(scenario, goodsWanted, foodWanted, 0);
    town.population = CITY;

    // Zone a third of the town commercial and deliver exactly the same. The
    // goods basket is now short of what the shops want, so the town grows less
    // on the identical haul - the zone economy having teeth.
    zoneCommercial(scenario, TOWN_X - 10, TOWN_X + 10);
    const zoned = deliverAndGrow(scenario, goodsWanted, foodWanted, 0);
    expect(zoned).toBeLessThan(residential);
    town.population = CITY;

    // And the shortfall is closed by ELECTRONICS, which is what those shops
    // wanted: the same haul plus the specification's own electronics demand
    // reaches the cap again.
    const supplied = deliverAndGrow(scenario, goodsWanted, foodWanted, electronicsWantedFor(CITY));
    expect(supplied).toBe(residential);
  });

  it('eats for its houses and not for its shops', () => {
    // The other half of the sentence: food is the residential zone's demand,
    // so a town that is a third shops is fed by two thirds of the deliveries a
    // wholly residential one needs.
    const scenario = townScenario();
    const town = scenario.world.towns[0]!;
    const goodsWanted = POPULATION / TOWN_INHABITANTS_PER_GOODS;
    const foodWanted = POPULATION / TOWN_INHABITANTS_PER_FOOD;

    const halfFed = deliverAndGrow(scenario, goodsWanted, foodWanted * 0.5, 0);
    town.population = POPULATION;

    zoneCommercial(scenario, TOWN_X - 10, TOWN_X + 10);
    const zonedHalfFed = deliverAndGrow(scenario, goodsWanted * 4, foodWanted * 0.5, 0);
    expect(zonedHalfFed).toBeGreaterThan(halfFed);
  });
});

// ------------------------------------------- production and consumption meet

describe('the zone economy balances over a played month', () => {
  it('books every unit a town offers and every unit delivered into it', () => {
    const scenario = townScenario();
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 4,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });
    zoneCommercial(scenario, TOWN_X + 1, TOWN_X + 6);

    const town = scenario.world.towns[0]!;
    const days = 20;
    for (let day = 0; day < days; day++) produceTownCargo(scenario.world);

    // Production: passengers of both classes plus mail, and the mail is the
    // town's whole slice however its stops are zoned.
    const perSlice =
      (POPULATION * MAIL_PER_INHABITANT_PER_MONTH) / TOWN_PRODUCTION_SLICES_PER_MONTH;
    expect(mailWaiting(scenario)).toBeCloseTo(perSlice * days, 4);
    expect(town.producedThisMonth).toBeGreaterThan(0);

    // Consumption: the three counters are cleared by the month that reads
    // them, so nothing can be counted twice.
    town.goodsDeliveredThisMonth = 12;
    town.foodDeliveredThisMonth = 8;
    town.electronicsDeliveredThisMonth = 3;
    growTowns(scenario.world);
    expect(town.goodsDeliveredThisMonth).toBe(0);
    expect(town.foodDeliveredThisMonth).toBe(0);
    expect(town.electronicsDeliveredThisMonth).toBe(0);
    expect(town.producedThisMonth).toBe(0);
  });

  it('still takes radios wherever the town has houses', () => {
    // What the split does NOT change: a stop covering houses accepts
    // electronics whether or not the town has a commercial zone. The demand is
    // the shops'; the acceptance is the houses', and unhooking the second from
    // the first would re-open the dead end D-118 found (an electronics works
    // whose output nobody takes closes in twenty-four months).
    const scenario = townScenario();
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 4,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });
    const station = scenario.world.stations[0]!;
    expect(station.buildingsCovered).toBeGreaterThan(0);
    expect(station.commercialShare).toBe(0);
    expect(TOWN_CARGO).toContain(Cargo.Electronics);
    expect(stationAccepts(station, Cargo.Electronics)).toBe(true);
  });
});
