import { describe, expect, it } from 'vitest';
import { Cargo, cargoSpec } from '../../src/sim/cargo/types';
import { CENTS_PER_EURO, MapClimate, WeatherRule } from '../../src/sim/constants';
import { climateIndustryTypes, CLIMATE_SIGNATURE_ARM } from '../../src/sim/industry/climateSets';
import { industrySpec, IndustryType } from '../../src/sim/industry/types';
import { specAvailable } from '../../src/sim/vehicles/availability';
import { VEHICLE_SPECS } from '../../src/sim/vehicles/catalog';
import type { World } from '../../src/sim/World';
import {
  BOX_LORRY,
  BULK_LORRY,
  BULK_LORRY_1971,
  buildChain,
  CHAIN_LORRIES_PER_LINE,
  CHAIN_CAPITAL_CT,
  CHAIN_ROW,
  CHAIN_SIZE,
  FOOD_LORRY,
  TANKER_LORRY,
  WOOD_CHAIN,
  type ChainSpec,
} from './chains';
import { buildCoalLine, COAL_LINE_SPAN_YEARS } from './coalLine';
import { climateSweep, fullBalanceMode, hashTwin } from './determinism';
import { buildIdleCompany, IDLE_CAPITAL_CT, yearOfRuin } from './idleCompany';
import { buildBusLine, runYears, twoTownScenario } from './scenario';

/**
 * The balance MATRIX of SPEC2 M23: "Szenarien 1-4 je Klima gebandet (Suite x4 -
 * CI-Split aus 6.3 traegt das); D-118-Kettenlauf je Klima-Set."
 *
 * Four scenarios times four climates is four times a suite that already cost
 * two minutes, so the first thing this file owes is an honest account of what
 * it is for and what it costs. It has three arms and they answer three
 * different questions:
 *
 *  - **the ANCHOR arm** plays scenarios 1-4 in every swept climate with every
 *    world rule off, which is the condition every band of section 19.4 was
 *    measured under (Fehlerkatalog 34). Its band per climate is the band of
 *    section 19.4 itself - that is SPEC2's "Szenarien 1-4 je Klima gebandet" -
 *    and it carries the finding this file was written to make: **the four
 *    climates do NOT measure the same money even with the sky off**, and the
 *    test that says so names the mechanism, bisects it to the game year it
 *    starts in, and bounds it.
 *  - **the SKY arm** plays the same four scenarios in the same climates with
 *    the weather rule harsh, which is the one way a climate is in the money by
 *    design. What it can and cannot claim from one run per cell is argued at
 *    `skyBand` and at the ordering test, rather than assumed here.
 *  - **the CHAIN arm** is D-118 per climate set, PLAYED. `climateEconomies.spec.ts`
 *    (D-246) asks the tables whether every chain closes in both directions;
 *    this asks each climate's own signature chain to actually be built, driven
 *    and paid on a world of that climate - a different question, and the one
 *    that catches a chain whose cargo has an acceptor on paper and no vehicle
 *    allowed to carry it.
 *
 * **The CI split of SPEC2 6.3, and the measurement behind it.** Measured on the
 * reference machine, this file alone, vitest startup included: **65.7 s** for
 * the two default arms over two climates, **121.4 s** for all three arms over
 * all four - against the **132.9 s** the whole balance suite cost before this
 * file existed. A file that doubles the suite on every push is not a split, it
 * is a tax, so the matrix sweeps CLIMATES the way `aiGame` sweeps seeds
 * (D-220): every run plays the first two of `CLIMATE_SWEEP` (temperate and
 * arctic) in the anchor and chain arms, and the `soak` job - which runs on
 * every push - plays all four climates and the sky arm as well, through the
 * SAME `IRON_VEINS_BALANCE_HASH=all` switch that already carries the costly
 * twins and the AI seed sweep. Coverage of every climate is therefore
 * per-push, not "eventually" (D-190's own sentence), and it is one switch
 * because CI's `soak` job is one job.
 *
 * The sky arm is the half that is gated hardest, and the reason is that no
 * constant in this project is calibrated against it: every band the sky arm
 * could move is measured in the anchor arm first.
 */

/**
 * The climates THIS run measures - two by default, all four in the full
 * balance job (`tests/balance/determinism.ts`, the D-220 device one milestone
 * on). Temperate is always first, so every comparison below is against the
 * reference climate whichever sweep is running.
 */
const CLIMATES: readonly MapClimate[] = climateSweep() as readonly MapClimate[];

const ALL_CLIMATE_NAMES: readonly string[] = ['temperate', 'arctic', 'tropical', 'desert'];
const CLIMATE_NAMES: readonly string[] = CLIMATES.map((climate) => ALL_CLIMATE_NAMES[climate]!);

const euros = (cents: number): number => Math.round(cents / CENTS_PER_EURO);

/** What a cargo is called, for the accounts these runs print. */
const cargoName = (cargo: Cargo): string => cargoSpec(cargo).nameKey.replace('cargo.', '');

// ------------------------------------------------------------ the four rows

/** Scenario 1: the first bus line, in one climate under one sky. */
function measureBusLine(climate: MapClimate, weather: WeatherRule): Row {
  const scenario = twoTownScenario(1_200, 25, undefined, climate, weather);
  const before = scenario.world.company.cashCt;
  buildBusLine(scenario, 200, 2);
  const balances = runYears(scenario, 6);
  return {
    yieldCt: balances[balances.length - 1]! - before,
    milestone: firstYearAtOrAbove(balances, before),
    balances,
    world: scenario.world,
  };
}

/** Scenario 2: the reference coal railway. */
function measureCoalTrain(climate: MapClimate, weather: WeatherRule): Row {
  const scenario = buildCoalLine(weather, undefined, undefined, undefined, undefined, climate);
  const before = 500_000 * CENTS_PER_EURO;
  const balances = runYears(scenario, COAL_LINE_SPAN_YEARS);
  return {
    yieldCt: balances[balances.length - 1]! - before,
    milestone: firstYearAtOrAbove(balances, before),
    balances,
    world: scenario.world,
  };
}

/** Scenario 3: the whole wood chain, three hauls and a town. */
function measureWoodChain(climate: MapClimate, weather: WeatherRule): Row {
  const scenario = buildChain(WOOD_CHAIN, climate, weather);
  const filling = runYears(scenario, 3);
  const balances = runYears(scenario, 3);
  return {
    yieldCt: Math.round((balances[2]! - balances[0]!) / 2),
    milestone: 0,
    balances: [...filling, ...balances],
    world: scenario.world,
  };
}

/** Scenario 4: a company that stops playing. */
function measureIdleCompany(climate: MapClimate, weather: WeatherRule): Row {
  const scenario = buildIdleCompany(climate, weather);
  const year = yearOfRuin(scenario, 12);
  return {
    yieldCt: scenario.world.company.cashCt - IDLE_CAPITAL_CT,
    milestone: year,
    balances: [scenario.world.company.cashCt],
    world: scenario.world,
  };
}

interface Row {
  /** What the scenario earned or lost over its own span. [cents] */
  readonly yieldCt: number;
  /** The year the scenario is banded ON - payback, or ruin. [game year] */
  readonly milestone: number;
  /** The balance at the end of every game year - the bisect instrument. */
  readonly balances: readonly number[];
  readonly world: World;
}

interface ScenarioRow {
  readonly name: string;
  readonly measure: (climate: MapClimate, weather: WeatherRule) => Row;
  /** The section 19.4 band on `milestone`, or null where the band is money. */
  readonly milestoneBand: readonly [number, number] | null;
  /** The section 19.4 band on `yieldCt`, or null. [cents] */
  readonly yieldBand: readonly [number, number] | null;
  /**
   * What a harsh sky may cost this scenario, as a share of its anchor yield,
   * in ANY climate - the SKY arm's band. [share, positive = the sky costs
   * money]
   *
   * Deliberately one band per SCENARIO rather than one per (scenario,
   * climate) cell, and the measurement is why. A single run of one line over
   * six or nine years is chaotic - D-203 measured 1.48-6.31 % across six seeds
   * of ONE coal train and built an ensemble because of it - and this arm plays
   * one run per cell, because sixteen ensembles is not a test, it is a second
   * suite. So the band is what a single run can carry: the sky always costs
   * something, it never pays, and it never costs a multiple of what it costs
   * today. The ORDERING between climates is printed and deliberately not
   * asserted; the measured table below says why.
   */
  readonly skyBand: readonly [number, number];
}

const SCENARIOS: readonly ScenarioRow[] = [
  {
    name: 'scenario 1 bus line',
    measure: measureBusLine,
    milestoneBand: [2, 4],
    yieldBand: null,
    // Measured over the four climates: 18.6 / 18.6 / 31.2 / 42.3 %. A bus
    // line is the smallest business in the suite - two vehicles, a six year
    // span, a net yield of about 20,000 EUR - so a handful of breakdown rolls
    // is tens of per cent of it, and the spread between climates here is one
    // run's luck rather than one climate's weather.
    skyBand: [0.005, 0.6],
  },
  {
    name: 'scenario 2 coal train',
    measure: measureCoalTrain,
    milestoneBand: [4, 7],
    yieldBand: null,
    // Measured: 19.4 / 24.8 / 28.4 / 24.2 %. The reference coal line under a
    // permanent harsh sky - which is a different measurement from M18's own
    // band (-3 to -7 % of the FREIGHT YEAR over an ensemble of six seeds,
    // hardWinter.spec.ts): this one is the whole company balance of one run.
    skyBand: [0.005, 0.6],
  },
  {
    name: 'scenario 3 wood chain',
    measure: measureWoodChain,
    milestoneBand: null,
    yieldBand: [80_000 * CENTS_PER_EURO, 200_000 * CENTS_PER_EURO],
    // Measured: 5.4 / 14.9 / 3.6 / 2.4 %. Twelve lorries on a hundred tiles of
    // road is the steadiest business in the suite, and it is the one row where
    // the arctic reads as the hard climate it is.
    skyBand: [0.005, 0.6],
  },
  {
    name: 'scenario 4 idle company',
    measure: measureIdleCompany,
    milestoneBand: [6, 9],
    yieldBand: null,
    // A company that never moves a vehicle cannot pay for weather: no
    // friction, no breakdown, no cargo to spoil. The band is a hard zero and
    // it is the sharpest assertion in the sky arm.
    skyBand: [0, 0],
  },
];

/**
 * How far apart the best and the worst climate end, as a share of the best.
 * [share of the largest absolute yield]
 */
function climateSpread(row: readonly Row[]): number {
  let best = -Infinity;
  let worst = Infinity;
  for (const entry of row) {
    if (entry.yieldCt > best) best = entry.yieldCt;
    if (entry.yieldCt < worst) worst = entry.yieldCt;
  }
  const scale = Math.max(Math.abs(best), Math.abs(worst));
  return scale === 0 ? 0 : (best - worst) / scale;
}

/**
 * How much two climates may disagree before the disagreement is a re-band
 * rather than a different future. [share]
 *
 * Measured on the four rows below: 30 % (bus line), 14 % (coal train), 2 %
 * (wood chain), 0 % (idle company). Banded at half again over the loudest,
 * on D-167's rule that a guard should catch a regression of multiples.
 */
const CLIMATE_SPREAD_MAX = 0.45;

/** The first year two runs' balances differ, or -1 when they never do. */
function firstDifferentYear(a: readonly number[], b: readonly number[]): number {
  for (let year = 0; year < Math.min(a.length, b.length); year++) {
    if (a[year] !== b[year]) return year + 1;
  }
  return -1;
}

function firstYearAtOrAbove(balances: readonly number[], target: number): number {
  for (let i = 0; i < balances.length; i++) {
    if (balances[i]! >= target) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}

// -------------------------------------------------------------- the anchor

describe('the balance matrix, anchor arm: scenarios 1-4 in four climates', () => {
  const anchor = SCENARIOS.map((scenario) =>
    CLIMATES.map((climate) => scenario.measure(climate, WeatherRule.Off)),
  );

  it('reports what it measured, scenario by scenario and climate by climate', () => {
    const lines: string[] = [];
    for (let s = 0; s < SCENARIOS.length; s++) {
      const row = anchor[s]!;
      lines.push(
        `${SCENARIOS[s]!.name}: ` +
          CLIMATES.map(
            (_, c) =>
              `${CLIMATE_NAMES[c]} ${euros(row[c]!.yieldCt)} EUR / year ${row[c]!.milestone}`,
          ).join(', '),
      );
    }
    console.log(`climate matrix, rules off:\n  ${lines.join('\n  ')}`);
    expect(lines).toHaveLength(SCENARIOS.length);
  });

  it('holds every scenario in its section 19.4 band in EVERY climate', () => {
    for (let s = 0; s < SCENARIOS.length; s++) {
      const spec = SCENARIOS[s]!;
      for (let c = 0; c < CLIMATES.length; c++) {
        const row = anchor[s]![c]!;
        const where = `${spec.name} in ${CLIMATE_NAMES[c]}`;
        if (spec.milestoneBand !== null) {
          expect(row.milestone, where).toBeGreaterThanOrEqual(spec.milestoneBand[0]);
          expect(row.milestone, where).toBeLessThanOrEqual(spec.milestoneBand[1]);
        }
        if (spec.yieldBand !== null) {
          expect(row.yieldCt, where).toBeGreaterThanOrEqual(spec.yieldBand[0]);
          expect(row.yieldCt, where).toBeLessThanOrEqual(spec.yieldBand[1]);
        }
      }
    }
  });

  it('opens the same books in all four until the first works opens, and not after', () => {
    // **The claim this arm was written to make was wrong, and the measurement
    // is what says so.** The first version asserted that four climates measure
    // the same money to the cent with the sky off - the climate reaches the
    // generator, the names, the architecture and the vehicle mask, none of
    // which is money on a hand-built world. Measured: they do not. Scenario 1
    // earns 21,260 EUR temperate against 14,937 desert, a spread of 30 %.
    //
    // The mechanism is `industry/lifecycle.ts#openNewIndustries`, and it is
    // DELIBERATE: one works opens a game year, its type is drawn from the
    // climate's own weight table (D-246 - "a works that opens during a game
    // has to come from the same set the map was generated from"), and that
    // draw plus the placement search that follows it come off the SHARED
    // gameplay stream. Two climates therefore part company at the first year
    // boundary and every breakdown roll after it is a different roll - the
    // Fehlerkatalog 25 shape without a stray draw in sight, because the draw
    // COUNT depends on the type that was drawn.
    //
    // So the property is bisected rather than denied: the four climates agree
    // exactly through their FIRST game year, which is before any works has
    // opened, and diverge afterwards. That is the assertion a rule change can
    // falsify - if a future rule puts the climate into a tariff, year one goes
    // red here instead of quietly re-banding section 19.4.
    for (let s = 0; s < SCENARIOS.length; s++) {
      const row = anchor[s]!;
      for (let c = 1; c < CLIMATES.length; c++) {
        expect(row[c]!.balances[0], `${SCENARIOS[s]!.name} year 1 in ${CLIMATE_NAMES[c]}`).toBe(
          row[0]!.balances[0],
        );
      }
    }
  });

  it('reports where the four climates part company, and how far apart they end', () => {
    const lines: string[] = [];
    for (let s = 0; s < SCENARIOS.length; s++) {
      const row = anchor[s]!;
      const spread = climateSpread(row);
      const parted = CLIMATES.map((_, c) => firstDifferentYear(row[0]!.balances, row[c]!.balances));
      lines.push(
        `${SCENARIOS[s]!.name}: spread ${(spread * 100).toFixed(1)} %, ` +
          `parts from the temperate run in year ${parted.slice(1).join(' / ')}`,
      );
    }
    console.log(['climate matrix, where the climates diverge:', ...lines].join('\n  '));
    expect(lines).toHaveLength(SCENARIOS.length);
  });

  it('keeps the spread between climates bounded, so the sky stays the loud term', () => {
    // A band on the disagreement itself. It is deliberately generous - the
    // divergence is a different FUTURE rather than a different economy, and a
    // different future is worth tens of per cent on a single coal train - but
    // it is bounded, so a change that makes one climate twice the business of
    // another is a red build and a deliberate decision.
    for (let s = 0; s < SCENARIOS.length; s++) {
      expect(climateSpread(anchor[s]!), SCENARIOS[s]!.name).toBeLessThan(CLIMATE_SPREAD_MAX);
    }
  });

  it('leaves a company with no vehicles identical to the cent in all four', () => {
    // The control that turns the paragraph above into a mechanism rather than
    // a shrug: scenario 4 never moves a vehicle, never carries a parcel and
    // never rolls a breakdown, so nothing downstream of the yearly draw can
    // reach its books - and it measures the same loss and the same year of
    // ruin in all four climates. If the climate were in a COST or a TARIFF,
    // this row would move with the others.
    for (let c = 1; c < CLIMATES.length; c++) {
      expect(anchor[3]![c]!.yieldCt, CLIMATE_NAMES[c]).toBe(anchor[3]![0]!.yieldCt);
      expect(anchor[3]![c]!.milestone, CLIMATE_NAMES[c]).toBe(anchor[3]![0]!.milestone);
    }
  });

  it('is not a vacuous comparison: each scenario really did something', () => {
    expect(anchor[0]![0]!.yieldCt).toBeGreaterThan(0);
    expect(anchor[1]![0]!.yieldCt).toBeGreaterThan(0);
    expect(anchor[2]![0]!.yieldCt).toBeGreaterThan(0);
    expect(anchor[3]![0]!.yieldCt).toBeLessThan(0);
  });

  hashTwin(
    'climateMatrix',
    () => [anchor[1]![MapClimate.Arctic]!.world],
    () => [measureCoalTrain(MapClimate.Arctic, WeatherRule.Off).world],
  );
});

// ----------------------------------------------------------------- the sky

describe.runIf(fullBalanceMode())(
  'the balance matrix, sky arm: what a harsh climate costs each scenario',
  () => {
    const anchor = SCENARIOS.map((scenario) =>
      CLIMATES.map((climate) => scenario.measure(climate, WeatherRule.Off)),
    );
    const harsh = SCENARIOS.map((scenario) =>
      CLIMATES.map((climate) => scenario.measure(climate, WeatherRule.Harsh)),
    );
    const cost = (s: number, c: number): number =>
      (anchor[s]![c]!.yieldCt - harsh[s]![c]!.yieldCt) / Math.abs(anchor[s]![c]!.yieldCt);

    it('reports what the sky cost, per scenario and per climate', () => {
      const lines: string[] = [];
      for (let s = 0; s < SCENARIOS.length; s++) {
        lines.push(
          `${SCENARIOS[s]!.name}: ` +
            CLIMATES.map(
              (_, c) =>
                `${CLIMATE_NAMES[c]} ${(cost(s, c) * 100).toFixed(2)} % ` +
                `(${euros(anchor[s]![c]!.yieldCt)} -> ${euros(harsh[s]![c]!.yieldCt)} EUR)`,
            ).join(', '),
        );
      }
      console.log(`climate matrix, weather harsh:\n  ${lines.join('\n  ')}`);
      expect(lines).toHaveLength(SCENARIOS.length);
    });

    it('keeps every scenario inside its own weather band in every climate', () => {
      for (let s = 0; s < SCENARIOS.length; s++) {
        const spec = SCENARIOS[s]!;
        for (let c = 0; c < CLIMATES.length; c++) {
          const share = cost(s, c);
          const where = `${spec.name} in ${CLIMATE_NAMES[c]}`;
          expect(share, where).toBeGreaterThanOrEqual(spec.skyBand[0]);
          expect(share, where).toBeLessThanOrEqual(spec.skyBand[1]);
        }
      }
    });

    it('never lets a harsh sky EARN money, in any scenario or any climate', () => {
      // The one-sided property, and the only claim about the sky that a single
      // run per cell can carry. It is the same shape D-203 used when it could
      // not band a chaotic quantity: "no seed earns more in the weather".
      for (let s = 0; s < SCENARIOS.length; s++) {
        for (let c = 0; c < CLIMATES.length; c++) {
          expect(
            harsh[s]![c]!.yieldCt,
            `${SCENARIOS[s]!.name} in ${CLIMATE_NAMES[c]}`,
          ).toBeLessThanOrEqual(anchor[s]![c]!.yieldCt);
        }
      }
    });

    it('does not claim an ordering between the climates, and says what it measured', () => {
      // **What this arm looked for and did NOT find.** The obvious claim - an
      // arctic line pays more for its sky than a tropical one - is true on the
      // wood chain (14.9 % against 3.6 %) and FALSE on the coal train (24.8 %
      // against 28.4 %), measured. Two reasons, and both are real: the tropics
      // have heat since this milestone gave the sky a climate column
      // (`SEASON_CLIMATE_HEAT`), and heat spoils cargo where frost slows
      // wheels - so a slow railway with an ageing load can lose more to a hot
      // sky than to a cold one. And one run of one line is chaotic (D-203).
      // The assertion below is therefore about the SPREAD being real rather
      // than about its direction, which is what the numbers support.
      const shares: number[] = [];
      for (let s = 0; s < 3; s++) for (let c = 0; c < CLIMATES.length; c++) shares.push(cost(s, c));
      const min = Math.min(...shares);
      const max = Math.max(...shares);
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThan(min * 2);
    });

    it('charges a company that stopped playing exactly nothing, in every climate', () => {
      // The control, and the reason the numbers above are weather rather than
      // noise: an idle fleet is not driven, so no friction, no breakdown and
      // no spoilage can reach it. Any sky cost here would be an accounting
      // leak rather than weather.
      for (let c = 0; c < CLIMATES.length; c++) {
        expect(harsh[3]![c]!.yieldCt, CLIMATE_NAMES[c]).toBe(anchor[3]![c]!.yieldCt);
        expect(harsh[3]![c]!.milestone, CLIMATE_NAMES[c]).toBe(anchor[3]![c]!.milestone);
      }
    });
  },
);

// --------------------------------------------------------- the chain runs

/**
 * Each climate's SIGNATURE chain, built out of that climate's own arm.
 *
 * The four arms of D-246 are disjoint and each runs in exactly two climates,
 * so "the chain a climate has that the others do not" is well defined: food in
 * the temperate world, oil in the arctic, wood in the tropics, stone in the
 * desert. Three of the four end in an industry rather than in a town, because
 * only Goods, Food and Electronics are town cargo (D-118) - and an acceptor is
 * an acceptor.
 */
const SIGNATURE_CHAINS: readonly { climate: MapClimate; spec: ChainSpec }[] = [
  {
    climate: MapClimate.Temperate,
    spec: {
      size: CHAIN_SIZE,
      row: CHAIN_ROW,
      works: [
        { type: IndustryType.Farm, x: 10 },
        { type: IndustryType.FoodFactory, x: 40 },
      ],
      town: { x: 70, population: 2_500, name: 'Kornstadt' },
      roadFromX: 7,
      roadToX: 70,
      depotX: 7,
      stopXs: [10, 40, 69],
      hauls: [
        { fromX: 10, toX: 40, cargo: Cargo.Grain, specId: BULK_LORRY },
        { fromX: 10, toX: 40, cargo: Cargo.Livestock, specId: FOOD_LORRY },
        { fromX: 40, toX: 70, cargo: Cargo.Food, specId: FOOD_LORRY },
      ],
      lorriesPerHaul: CHAIN_LORRIES_PER_LINE,
      // The refrigerated lorry of 1958 is the first vehicle that can carry
      // livestock or food at all: the food arm is not a road business before
      // it, and that is a fact about the catalogue rather than about this test.
      firstYear: 1958,
      capitalCt: CHAIN_CAPITAL_CT,
    },
  },
  {
    climate: MapClimate.Arctic,
    spec: {
      size: CHAIN_SIZE,
      row: CHAIN_ROW,
      works: [
        { type: IndustryType.OilWell, x: 10 },
        { type: IndustryType.Refinery, x: 40 },
        { type: IndustryType.PlasticsPlant, x: 70 },
        { type: IndustryType.ElectronicsFactory, x: 100 },
      ],
      town: null,
      roadFromX: 7,
      roadToX: 100,
      depotX: 7,
      stopXs: [10, 40, 70, 100],
      hauls: [
        { fromX: 10, toX: 40, cargo: Cargo.Oil, specId: TANKER_LORRY },
        { fromX: 40, toX: 70, cargo: Cargo.Chemicals, specId: TANKER_LORRY },
        { fromX: 70, toX: 100, cargo: Cargo.Plastics, specId: BOX_LORRY },
      ],
      lorriesPerHaul: CHAIN_LORRIES_PER_LINE,
      firstYear: 1958,
      capitalCt: CHAIN_CAPITAL_CT,
    },
  },
  { climate: MapClimate.Tropical, spec: WOOD_CHAIN },
  {
    climate: MapClimate.Desert,
    spec: {
      size: CHAIN_SIZE,
      row: CHAIN_ROW,
      works: [
        { type: IndustryType.GravelPit, x: 10 },
        { type: IndustryType.CementWorks, x: 40 },
        { type: IndustryType.BuildersMerchant, x: 70 },
      ],
      town: null,
      roadFromX: 7,
      roadToX: 70,
      depotX: 7,
      stopXs: [10, 40, 70],
      hauls: [
        { fromX: 10, toX: 40, cargo: Cargo.Gravel, specId: BULK_LORRY },
        { fromX: 40, toX: 70, cargo: Cargo.Cement, specId: BULK_LORRY_1971 },
      ],
      lorriesPerHaul: CHAIN_LORRIES_PER_LINE,
      // Cement has no road hauler before the 1971 bulk lorry - the stone arm
      // is a rail business for the first twenty years of a 1950 game. Named
      // here because it is the sort of thing a table check cannot see.
      firstYear: 1971,
      capitalCt: CHAIN_CAPITAL_CT,
    },
  },
];

describe('the D-118 chain run, per climate set', () => {
  const played = SIGNATURE_CHAINS.filter(({ climate }) => CLIMATES.includes(climate)).map(
    ({ climate, spec }) => {
      const scenario = buildChain(spec, climate, WeatherRule.Off);
      const balances = runYears(scenario, 5);
      return { climate, spec, scenario, balances };
    },
  );

  it('reports what each climate`s own chain did', () => {
    const lines = played.map(({ climate, spec, scenario, balances }) => {
      const world = scenario.world;
      const carried = spec.hauls
        .map(
          (haul) =>
            `${cargoName(haul.cargo)} ${Math.round(world.company.cargoDeliveredUnits[haul.cargo]!)}`,
        )
        .join(', ');
      return (
        `${ALL_CLIMATE_NAMES[climate]} (${spec.works.map((w) => industrySpec(w.type).nameKey.replace('industry.', '')).join(' -> ')}` +
        `, from ${spec.firstYear}): delivered ${carried}; ` +
        `balance ${euros(balances[balances.length - 1]!)} EUR`
      );
    });
    console.log(`climate chain runs (D-118, played):\n  ${lines.join('\n  ')}`);
    expect(lines).toHaveLength(CLIMATES.length);
  });

  it('drives every link of every climate`s signature chain', () => {
    for (const { climate, spec, scenario } of played) {
      const world = scenario.world;
      for (const haul of spec.hauls) {
        expect(
          world.company.cargoDeliveredUnits[haul.cargo]!,
          `${ALL_CLIMATE_NAMES[climate]} ${cargoName(haul.cargo)}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every works of every chain open for five years', () => {
    for (const { climate, spec, scenario } of played) {
      for (let index = 0; index < spec.works.length; index++) {
        const industry = scenario.world.industries[index]!;
        expect(industry.type).toBe(spec.works[index]!.type);
        expect(
          industry.open,
          `${ALL_CLIMATE_NAMES[climate]} ${industrySpec(industry.type).nameKey}`,
        ).toBe(true);
      }
    }
  });

  it('builds each chain out of the arm that climate actually has', () => {
    // The chains are the SIGNATURE arms of D-246, not four copies of one
    // chain: each of them uses at least one works that the climate's own set
    // has and that two of the other three do not.
    for (const { climate, spec } of played) {
      const set = new Set<IndustryType>(climateIndustryTypes(climate));
      const arm = new Set<IndustryType>(CLIMATE_SIGNATURE_ARM[climate]!);
      let fromArm = 0;
      for (const works of spec.works) {
        expect(set.has(works.type), `${ALL_CLIMATE_NAMES[climate]} ${works.type}`).toBe(true);
        if (arm.has(works.type)) fromArm++;
      }
      expect(
        fromArm,
        `${ALL_CLIMATE_NAMES[climate]} works from its own arm`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('can buy every lorry it needs, under the availability gate of D-246', () => {
    // The half a table check cannot see: a cargo with an acceptor and no
    // vehicle allowed to carry it in that world is a chain that closes on
    // paper and cannot be driven. `buildChain` would already have thrown on
    // the buy command, so this states the property rather than discovering it.
    for (const { climate, spec } of played) {
      for (const haul of spec.hauls) {
        const vehicle = VEHICLE_SPECS.find((entry) => entry.id === haul.specId)!;
        expect(
          specAvailable(vehicle, spec.firstYear, climate),
          `${ALL_CLIMATE_NAMES[climate]} ${vehicle.nameKey} in ${spec.firstYear}`,
        ).toBe(true);
      }
    }
  });

  it('leaves every cargo it carries with an acceptor in that very world', () => {
    // D-118 in the direction that matters here, asked of the PLAYED world
    // rather than of the table: everything the chain produces is taken by
    // something standing on that map.
    for (const { climate, spec, scenario } of played) {
      for (const haul of spec.hauls) {
        const accepted = scenario.world.industries.some((industry) =>
          industrySpec(industry.type).inputs.includes(haul.cargo),
        );
        const townTakes =
          haul.cargo === Cargo.Goods ||
          haul.cargo === Cargo.Food ||
          haul.cargo === Cargo.Electronics;
        expect(
          accepted || townTakes,
          `${ALL_CLIMATE_NAMES[climate]} ${cargoName(haul.cargo)}`,
        ).toBe(true);
      }
    }
  });
});
