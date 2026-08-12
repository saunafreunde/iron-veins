import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TOWN_BUILDING_MATERIAL_RADIUS,
  TOWN_GROWTH_BASE_RATE,
  TOWN_GROWTH_BUILDING_WEIGHT,
  TOWN_GROWTH_FOOD_WEIGHT,
  TOWN_GROWTH_GOODS_WEIGHT,
  TOWN_GROWTH_PASSENGER_WEIGHT,
  TOWN_GROWTH_RATING_FLOOR,
  TOWN_GROWTH_RATING_SPAN,
  TOWN_INHABITANTS_PER_BUILDING_MATERIAL,
  TOWN_INHABITANTS_PER_FOOD,
  TOWN_INHABITANTS_PER_GOODS,
  TOWN_SHRINK_RATE_PER_MONTH,
  TOWN_SUPPLY_WINDOW_MONTHS,
} from '../../src/sim/constants';
import { IndustryType, newIndustry, type Industry } from '../../src/sim/industry/types';
import { ModuleKind } from '../../src/sim/station/types';
import {
  growTowns,
  noteBuildingMaterial,
  servingCompanyRating,
  townGrowthRate,
} from '../../src/sim/town/update';
import type { Town } from '../../src/sim/town/types';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * SPEC.md 13.2, complete (SPEC2 M20 bundle 2).
 *
 * The milestone's own Fertig-wenn asks for exactly this: "die 13.2-Formel
 * enthaelt alle SPEC-Terme (Formel-Test gegen Handrechnung)". So the first
 * block below computes the formula BY HAND from the specification's own
 * numerals - never from the constants the implementation reads, which would
 * only prove that a file agrees with itself - and then takes it apart term by
 * term. The second block proves the one term that could not exist before this
 * bundle, `versorgungBau`, over a real cement haul into a real merchant, and
 * the third and fourth prove the company-rating factor and the twelve-month
 * window that 13.2 annotates the passenger term with.
 *
 * The specification, verbatim:
 *
 * ```
 * wachstumsRate = 0.0015
 *   * (1 + 0.55*versorgungPass + 0.45*versorgungWaren
 *        + 0.45*versorgungFood + 0.35*versorgungBau)
 *   * gelaendeFaktor
 *   * (0.5 + 0.5 * firmenRating/100)
 * ```
 */

// --------------------------------------------- the constants ARE SPEC's own

describe('the numbers of SPEC.md 13.2', () => {
  it('are the specification and not a draft of it', () => {
    expect(TOWN_GROWTH_BASE_RATE).toBe(0.0015);
    expect(TOWN_GROWTH_PASSENGER_WEIGHT).toBe(0.55);
    expect(TOWN_GROWTH_GOODS_WEIGHT).toBe(0.45);
    expect(TOWN_GROWTH_FOOD_WEIGHT).toBe(0.45);
    expect(TOWN_GROWTH_BUILDING_WEIGHT).toBe(0.35);
    expect(TOWN_GROWTH_RATING_FLOOR).toBe(0.5);
    expect(TOWN_GROWTH_RATING_SPAN).toBe(0.5);
    expect(TOWN_SHRINK_RATE_PER_MONTH).toBe(0.0003);
    expect(TOWN_SUPPLY_WINDOW_MONTHS).toBe(12);
    // The two demand ratios 13.2 writes out, and the third it leaves open.
    expect(TOWN_INHABITANTS_PER_GOODS).toBe(900);
    expect(TOWN_INHABITANTS_PER_FOOD).toBe(700);
    expect(TOWN_INHABITANTS_PER_BUILDING_MATERIAL).toBe(1_200);
  });
});

// ------------------------------------------------------- the hand reckoning

describe('the growth rate against a hand computation', () => {
  /** One worked example, chosen so no two terms share a value. */
  const PASS = 0.8;
  const GOODS = 0.5;
  const FOOD = 0.25;
  const BUILDING = 1;
  const TERRAIN = 0.6;
  const RATING = 80;

  /**
   * By hand, from the specification's own numerals:
   *
   *   bracket = 1 + 0.55*0.8 + 0.45*0.5 + 0.45*0.25 + 0.35*1
   *           = 1 + 0.44 + 0.225 + 0.1125 + 0.35 = 2.1275
   *   rating  = 0.5 + 0.5 * 80/100 = 0.9
   *   rate    = 0.0015 * 2.1275 * 0.6 * 0.9 = 0.001723275
   */
  const BY_HAND = 0.0015 * 2.1275 * 0.6 * 0.9;

  it('reaches the hand-computed figure', () => {
    expect(BY_HAND).toBeCloseTo(0.001723275, 15);
    expect(townGrowthRate(PASS, GOODS, FOOD, BUILDING, TERRAIN, RATING)).toBeCloseTo(BY_HAND, 15);
  });

  it('carries every one of the four supply terms, each at its own weight', () => {
    const outer = 0.0015 * TERRAIN * 0.9;
    // Drop one term at a time: what the rate loses is that term's weight times
    // its share, times everything outside the bracket. A term that was missing
    // - which is what `versorgungBau` was until this bundle - loses nothing.
    const terms: readonly [string, number, number, number][] = [
      ['pass', 0.55, PASS, townGrowthRate(0, GOODS, FOOD, BUILDING, TERRAIN, RATING)],
      ['waren', 0.45, GOODS, townGrowthRate(PASS, 0, FOOD, BUILDING, TERRAIN, RATING)],
      ['food', 0.45, FOOD, townGrowthRate(PASS, GOODS, 0, BUILDING, TERRAIN, RATING)],
      ['bau', 0.35, BUILDING, townGrowthRate(PASS, GOODS, FOOD, 0, TERRAIN, RATING)],
    ];
    for (const [name, weight, share, without] of terms) {
      expect(BY_HAND - without, `${name} is missing or carries the wrong weight`).toBeCloseTo(
        weight * share * outer,
        15,
      );
    }
  });

  it('scales by the terrain factor and by nothing else at 1.0', () => {
    const flat = townGrowthRate(PASS, GOODS, FOOD, BUILDING, 1, RATING);
    expect(townGrowthRate(PASS, GOODS, FOOD, BUILDING, 0.6, RATING)).toBeCloseTo(flat * 0.6, 15);
    expect(townGrowthRate(PASS, GOODS, FOOD, BUILDING, 0.3, RATING)).toBeCloseTo(flat * 0.3, 15);
  });

  it('halves the growth of a town whose company the council thinks nothing of', () => {
    const full = townGrowthRate(PASS, GOODS, FOOD, BUILDING, TERRAIN, 100);
    expect(townGrowthRate(PASS, GOODS, FOOD, BUILDING, TERRAIN, 0)).toBeCloseTo(full * 0.5, 15);
    expect(townGrowthRate(PASS, GOODS, FOOD, BUILDING, TERRAIN, 50)).toBeCloseTo(full * 0.75, 15);
  });

  it('shrinks a town nothing at all reaches, at the rate 13.2 states', () => {
    expect(townGrowthRate(0, 0, 0, 0, 1, 100)).toBe(-0.0003);
    // The flat rate is the SENTENCE and not the formula evaluated at zero: it
    // takes neither the terrain nor the council with it, and the product would
    // have been positive in any case.
    expect(townGrowthRate(0, 0, 0, 0, 0.3, 0)).toBe(-0.0003);
    expect(townGrowthRate(0, 0, 0, 0, 1, 100)).toBeLessThan(0);
    // Any supply at all, however thin, puts the town back on the formula.
    expect(townGrowthRate(0.0001, 0, 0, 0, 1, 100)).toBeGreaterThan(0);
    expect(townGrowthRate(0, 0, 0, 0.0001, 1, 100)).toBeGreaterThan(0);
  });
});

// ------------------------------------------- versorgungBau, over a real haul

const SIZE = 64;
const ROW = 32;
/** Works stand one row off the road: a road may not cross an industry. */
const WORKS_ROW = ROW + 2;
const CEMENT_X = 12;
const MERCHANT_X = 30;
const TOWN_X = 40;
const DEPOT_X = 9;
/** The cement lorry of the catalogue, a 1966 vehicle. */
const CEMENT_LORRY = 291;
const START_YEAR_OFFSET = 16;
const LORRIES = 3;
const POPULATION = 3_000;

function cementIndustries(): Industry[] {
  return [
    newIndustry(0, IndustryType.CementWorks, CEMENT_X, WORKS_ROW, 0),
    newIndustry(1, IndustryType.BuildersMerchant, MERCHANT_X, WORKS_ROW, 0),
  ];
}

/**
 * A cement works, a builders' merchant beside a town, and lorries between them.
 *
 * The merchant sits ten tiles from the town centre - inside
 * `TOWN_BUILDING_MATERIAL_RADIUS` and outside the ground the town claimed,
 * which is where the map generator can actually put one (it refuses any
 * industry on a claimed tile). Its lorry bay reaches the yard and NOT the town,
 * so nothing in this world carries a passenger and `versorgungPass` is zero
 * throughout: the only supply this town ever has is the cement.
 */
function cementLine(withLorries: boolean): { scenario: Scenario; town: Town } {
  const town = makeTown(0, TOWN_X, ROW, POPULATION, 'Kalkheim');
  const scenario = flatScenario(SIZE, [town], cementIndustries());
  const world = scenario.world;
  world.company.cashCt = 5_000_000_00;
  // The cement lorry is a 1966 vehicle and nothing before it carries cement,
  // so the fixture starts where a player could first build the haul at all
  // (the woodChain rule).
  world.tick = START_YEAR_OFFSET * TICKS_PER_YEAR;
  // The gravel a quarry would have hauled in, granted: this fixture measures
  // what a delivery does to a town, not a two-link chain.
  world.industries[0]!.inputStock0 = 100_000;

  apply(scenario, { kind: CommandKind.BuildRoad, x1: DEPOT_X, y1: ROW, x2: MERCHANT_X, y2: ROW });
  for (const x of [CEMENT_X, MERCHANT_X]) {
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x,
      y: ROW,
      moduleKind: ModuleKind.LorryBay,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: DEPOT_X,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });

  if (withLorries) {
    const stopAt = (x: number): number => {
      const tile = world.map.tileIndex(x, ROW);
      return world.stations.find((station) =>
        station.modules.some((module) => module.tileIndex === tile),
      )!.id;
    };
    const from = stopAt(CEMENT_X);
    const to = stopAt(MERCHANT_X);
    for (let i = 0; i < LORRIES; i++) {
      apply(scenario, {
        kind: CommandKind.BuyRoadVehicle,
        x: DEPOT_X,
        y: ROW,
        specId: CEMENT_LORRY,
      });
      apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId: i, cargo: Cargo.Cement });
      apply(scenario, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId: i,
        orders: [
          { target: 0, targetId: from, load: 1, unload: 0 },
          { target: 0, targetId: to, load: 1, unload: 0 },
        ],
      });
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true });
    }
  }
  return { scenario, town: world.towns[0]! };
}

describe('versorgungBau - the sink of SPEC.md 7.2 finally drives something', () => {
  it('books cement delivered into the merchant against the town beside it', () => {
    const { scenario, town } = cementLine(true);
    // Six and a half game months: the works produces monthly and the lorries
    // collect daily, and the read lands MID-month, because `growTowns` clears
    // the counter on every boundary.
    const ticks = 6 * TICKS_PER_MONTH + TICKS_PER_MONTH / 2;
    for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
    const merchant = scenario.world.industries[1]!;

    console.log(
      `builders' merchant: took ${merchant.inputStock0.toFixed(1)} t of cement in stock, ` +
        `town booked ${town.buildingMaterialThisMonth.toFixed(1)} t this month against a ` +
        `demand of ${(town.population / TOWN_INHABITANTS_PER_BUILDING_MATERIAL).toFixed(2)} t`,
    );
    expect(town.buildingMaterialThisMonth).toBeGreaterThan(0);
  });

  it('is the difference between a town that grows and a town that shrinks', () => {
    const supplied = cementLine(true);
    const control = cementLine(false);
    const YEARS = 3;
    for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) {
      supplied.scenario.world.step(supplied.scenario.queue, null);
      control.scenario.world.step(control.scenario.queue, null);
    }
    console.log(
      `after ${YEARS} game years: cement served ${supplied.town.population}, ` +
        `nothing delivered ${control.town.population} (both started at ${POPULATION})`,
    );
    // Nothing else differs between the two worlds, so the whole gap is 13.2's
    // building-material term - the first thing the "Senke, treibt
    // Stadtwachstum" of SPEC.md 7.2 has ever driven.
    expect(supplied.town.population).toBeGreaterThan(POPULATION);
    expect(control.town.population).toBeLessThan(POPULATION);
  });

  it('gives the yard to the NEAREST town in reach, and to no town out of it', () => {
    const near = makeTown(0, 20, 20, 1_000, 'Nahdorf');
    const far = makeTown(1, 20, 20 + TOWN_BUILDING_MATERIAL_RADIUS - 2, 1_000, 'Fernau');
    const outside = makeTown(2, 50, 50, 1_000, 'Weitweg');
    const scenario = flatScenario(SIZE, [near, far, outside], []);

    noteBuildingMaterial(scenario.world, 20, 21, 7);
    expect(near.buildingMaterialThisMonth).toBe(7);
    expect(far.buildingMaterialThisMonth).toBe(0);
    expect(outside.buildingMaterialThisMonth).toBe(0);

    // A yard beyond the reach of every town belongs to none of them, and the
    // tonnes are not quietly given to the nearest one anyway.
    noteBuildingMaterial(scenario.world, 5, 40, 9);
    expect(near.buildingMaterialThisMonth + far.buildingMaterialThisMonth).toBe(7);
    expect(outside.buildingMaterialThisMonth).toBe(0);
  });
});

// ------------------------------------------------- the company rating factor

describe("the council's opinion of whoever serves the town", () => {
  it('is the transported share weighted mean, and 0 where nobody serves at all', () => {
    const town = makeTown(0, 20, 20, 1_000, 'Ratsheim');
    const scenario = flatScenario(SIZE, [town], []);

    // No station, nobody carried anything: the town has no company rating, so
    // the factor sits on its 0.5 floor.
    expect(servingCompanyRating(scenario.world, town)).toBe(0);

    town.councilRating[0] = 90;
    town.councilRating[1] = 30;
    town.transportedByCompany[0] = 30;
    town.transportedByCompany[1] = 10;
    // (30*90 + 10*30) / 40 = 75
    expect(servingCompanyRating(scenario.world, town)).toBeCloseTo(75, 12);

    // The company that carried nothing does not drag the mean down.
    town.transportedByCompany[1] = 0;
    expect(servingCompanyRating(scenario.world, town)).toBeCloseTo(90, 12);
  });
});

// -------------------------------------------------- the twelve-month window

describe('the twelve-month passenger window', () => {
  /** One bare town, so `growTowns` is the only thing that touches it. */
  function bareTown(): { scenario: Scenario; town: Town } {
    const town = makeTown(0, 20, 20, 5_000, 'Fensterheim');
    const scenario = flatScenario(SIZE, [town], []);
    return { scenario, town };
  }

  it('is a TRUE mean while it fills, so a served town is not judged on invented zeros', () => {
    const { scenario, town } = bareTown();
    // One perfectly served month, then read the window back.
    town.producedThisMonth = 100;
    town.transportedThisMonth = 100;
    growTowns(scenario.world);
    expect(town.supplyMonths).toBe(1);
    expect(town.supplyProducedMean).toBeCloseTo(100, 12);
    expect(town.supplyTransportedMean).toBeCloseTo(100, 12);
    // A rolled-from-zero mean would read 100/12 here and the town would grow
    // as if it were served one month in twelve.
    expect(town.supplyTransportedMean / town.supplyProducedMean).toBeCloseTo(1, 12);
  });

  it('remembers a year of service after the traffic stops, and then forgets it', () => {
    const { scenario, town } = bareTown();
    for (let month = 0; month < TOWN_SUPPLY_WINDOW_MONTHS; month++) {
      town.producedThisMonth = 100;
      town.transportedThisMonth = 100;
      growTowns(scenario.world);
    }
    expect(town.supplyMonths).toBe(TOWN_SUPPLY_WINDOW_MONTHS);
    const grown = town.population;
    expect(grown).toBeGreaterThan(5_000);

    // The line closes. The town still produces (it has a stop) but nothing is
    // carried, so the share decays over the window instead of falling to zero
    // in one month - which is the whole point of 13.2's "letzte 12 Monate".
    const shares: number[] = [];
    for (let month = 0; month < TOWN_SUPPLY_WINDOW_MONTHS; month++) {
      town.producedThisMonth = 100;
      town.transportedThisMonth = 0;
      growTowns(scenario.world);
      shares.push(town.supplyTransportedMean / town.supplyProducedMean);
    }
    expect(shares[0]!).toBeGreaterThan(0.9);
    expect(shares[0]!).toBeLessThan(1);
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeLessThan(shares[i - 1]!);
    expect(shares[shares.length - 1]!).toBeLessThan(0.5);
    // The town went on growing the whole time - a closed line is a decline and
    // never a cliff.
    expect(town.population).toBeGreaterThan(grown);
  });

  it('survives a save and a load, because a window is history (Z4)', async () => {
    const { encodeSave, decodeSave } = await import('../../src/sim/save/serialize');
    const { scenario, town } = bareTown();
    for (let month = 0; month < 5; month++) {
      town.producedThisMonth = 80;
      town.transportedThisMonth = 60;
      growTowns(scenario.world);
    }
    expect(town.supplyMonths).toBe(5);

    const loaded = decodeSave(encodeSave(scenario.world, scenario.queue, 'test'));
    const reloaded = loaded.world.towns[0]!;
    expect(reloaded.supplyMonths).toBe(town.supplyMonths);
    expect(reloaded.supplyProducedMean).toBe(town.supplyProducedMean);
    expect(reloaded.supplyTransportedMean).toBe(town.supplyTransportedMean);
  });
});
