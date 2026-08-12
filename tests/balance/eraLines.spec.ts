import { describe, expect, it } from 'vitest';
import { CENTS_PER_EURO, START_YEAR, TICKS_PER_YEAR } from '../../src/sim/constants';
import { epochFactor } from '../../src/sim/cargo/payment';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import { stationRating } from '../../src/sim/station/types';
import type { World } from '../../src/sim/World';
import {
  buildCoalLine,
  COAL_LINE_ERA_LOCO,
  COAL_LINE_ERA_WAGON,
  COAL_LINE_ERA_YEAR,
} from './coalLine';
import { hashTwin } from './determinism';
import { buildBusLine, runYears, twoTownScenario } from './scenario';

/**
 * The 1870s twins of balancing scenarios 1 and 2 (SPEC2 M23, D-245).
 *
 * SPEC2 asks for exactly this: "Balance-Suite erhaelt 1870er-Varianten der
 * Szenarien 1-2 (eigenes Inflations-Band fuer 200-Jahre-Spannen)". Both halves
 * of that parenthesis are delivered here, and they are two different things:
 *
 *  - **their own BANDS.** The 1950 payback bands (2-4 years for the bus line,
 *    4-7 for the coal train) are not stretched over the era catalogue and then
 *    declared to hold. They are measured fresh, printed like every other
 *    scenario prints, and banded around what an 1870s railway actually earns
 *    with an 1870s engine. Reusing M6's numbers would have been a band about
 *    nothing: a 62 kN locomotive hauling fourteen-tonne wagons is not the same
 *    business as a 105 kN one hauling twenty-five-tonne ones.
 *  - **their own INFLATION.** This is the sharper half and it is asserted
 *    directly below: the price level is indexed by the world's AGE, not by its
 *    date, so an 1878 world in its sixth year is charged exactly the price
 *    level a 1950 world is charged in its sixth year. Before M23 the index was
 *    `year - 1950`, which over a two-century span would have meant either
 *    eighty flat years followed by compounding, or - if the table had simply
 *    been lengthened - a price level two hundred years deep on a table
 *    calibrated for one century. Neither is a band; both are the mistake the
 *    parenthesis names.
 *
 * Both twins are built by the 1950 scenarios' OWN helpers - `twoTownScenario`
 * and `coalLine.ts` - rather than by a second hand, on the D-187 rule: two
 * files that each built their own world would be measuring two different
 * worlds within a game year of the first edit. The railway is scenario 2's
 * geometry tile for tile; the omnibus line is NOT scenario 1's, and the
 * paragraph over `DISTANCE_TILES` says why, with the losing 25-tile run
 * measured in this file rather than asserted away.
 */

// ------------------------------------------------------------ the era world

/** The decade both twins are played in - the head of the 1870s catalogue. */
const ERA_YEAR = COAL_LINE_ERA_YEAR;

// ---------------------------------------------------------- scenario 1 twin

const POPULATION = 1_200;
/**
 * Twelve tiles, not scenario 1's twenty-five - and the reason IS the band.
 *
 * Scenario 1's own geometry over the 1870s catalogue loses money at every
 * fleet size, and this file measures that rather than asserting it (see the
 * last test in this block). A 34 km/h omnibus needs 13 game days one way over
 * 25 tiles, so a passenger waits half a service period and then travels for
 * another fortnight; the commuter's grace period is four days and the decay
 * five per cent a day, which puts every fare on or near the 10 % floor. The
 * 1870s twin therefore holds the TOWNS, the TRADE and the MEASURE of scenario
 * 1 and moves the LINE - which is the line an operator of that decade would
 * have built. Holding the line and moving the century would have measured
 * nothing but the floor.
 */
const DISTANCE_TILES = 12;
/** The line scenario 1 measures, kept here so the refusal above can be shown. */
const MODERN_DISTANCE_TILES = 25;
/** The 1872 steam omnibus - the newest road passenger vehicle of the decade. */
const ERA_BUS = 303;
/**
 * Four, not scenario 1's two. A round trip over twelve tiles takes about
 * thirteen days, so two buses leave each stop unvisited for a week - and a
 * passenger who waits a week has already lost a third of the fare.
 */
const BUS_COUNT = 4;

const BUS_PAYBACK_MIN_YEARS = 3;
const BUS_PAYBACK_MAX_YEARS = 7;
const BUS_SPAN_YEARS = BUS_PAYBACK_MAX_YEARS + 1;

interface Payback {
  readonly investmentCt: number;
  readonly balances: readonly number[];
  readonly paybackYear: number;
  readonly detail: string;
  readonly world: World;
}

function measureBusLine(distance: number = DISTANCE_TILES): Payback {
  const scenario = twoTownScenario(POPULATION, distance, ERA_YEAR);
  const before = scenario.world.company.cashCt;
  buildBusLine(scenario, ERA_BUS, BUS_COUNT);
  const investmentCt = before - scenario.world.company.cashCt;
  const balances = runYears(scenario, BUS_SPAN_YEARS);
  return {
    investmentCt,
    balances,
    paybackYear: firstYearAtOrAbove(balances, before),
    detail: describe1870sLine(scenario.world),
    world: scenario.world,
  };
}

// ---------------------------------------------------------- scenario 2 twin

/**
 * Ten to fourteen years, not scenario 2's four to seven - measured, and the
 * gap is the whole content of the twin.
 *
 * The railway is scenario 2's own, tile for tile: the difference is entirely
 * the era catalogue. An 1878 "Kurier" pulls eight sixteen-unit wagons at
 * 42 km/h against a 1950 engine's eight twenty-five-unit wagons at 75, so the
 * line earns about two fifths of what scenario 2's earns - while the TRACK,
 * the platforms and the shed cost the same, because both worlds are in their
 * first year and the price level of a world's first year is 1 whatever century
 * it falls in (D-245). A capital-heavy business with an era engine on it pays
 * back in about a decade, and that is what an 1870s railway was.
 */
const TRAIN_PAYBACK_MIN_YEARS = 10;
const TRAIN_PAYBACK_MAX_YEARS = 14;
/** Two years past the top of the band, on scenario 2's own rule. */
const TRAIN_SPAN_YEARS = TRAIN_PAYBACK_MAX_YEARS + 2;

function measureCoalTrain(): Payback {
  const scenario = buildCoalLine(
    undefined,
    undefined,
    ERA_YEAR,
    COAL_LINE_ERA_LOCO,
    COAL_LINE_ERA_WAGON,
  );
  // Scenario 2's own convention: the starting balance is the constant, because
  // the line is built before the first tick.
  const before = 500_000 * CENTS_PER_EURO;
  const investmentCt = before - scenario.world.company.cashCt;
  const balances = runYears(scenario, TRAIN_SPAN_YEARS);
  return {
    investmentCt,
    balances,
    paybackYear: firstYearAtOrAbove(balances, before),
    detail: describe1870sLine(scenario.world),
    world: scenario.world,
  };
}

// --------------------------------------------------------------- reporting

function firstYearAtOrAbove(balances: readonly number[], target: number): number {
  for (let i = 0; i < balances.length; i++) {
    if (balances[i]! >= target) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}

/** Why the line earns what it earns - the same account scenario 1 prints. */
function describe1870sLine(world: World): string {
  const parts: string[] = [`year ${world.date.year}, world age ${world.epochYears} years`];
  for (const station of world.stations) {
    const waiting = station.waiting.reduce((sum, stack) => sum + stack.amount, 0);
    parts.push(
      `${station.name}: rating ${stationRating(station, world.tick)}, ` +
        `${waiting.toFixed(0)} waiting, ${station.visitTicks.length} visits per 20 days`,
    );
  }
  const vehicles = world.vehicles;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    parts.push(`vehicle ${id}: earned ${(vehicles.earnedCt[id]! / CENTS_PER_EURO).toFixed(0)} EUR`);
  }
  parts.push(`upkeep ${(upkeepPerYearCt(world.company) / CENTS_PER_EURO).toFixed(0)} EUR per year`);
  return parts.join('\n  ');
}

const euros = (cents: number): string => (cents / CENTS_PER_EURO).toFixed(0);

// ------------------------------------------------------------- the two twins

describe('scenario 1, 1870s: the first steam omnibus line', () => {
  const result = measureBusLine();

  it('reports what it measured', () => {
    console.log(
      `1870s bus line: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map((b) => euros(b)).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}\n  ${result.detail}`,
    );
    expect(result.investmentCt).toBeGreaterThan(0);
  });

  it('opens in the 1870s and earns money at all', () => {
    expect(result.world.startYear).toBe(ERA_YEAR);
    expect(result.balances[result.balances.length - 1]!).toBeGreaterThan(result.balances[0]!);
  });

  it('pays for itself inside its own band', () => {
    expect(result.paybackYear).toBeGreaterThanOrEqual(BUS_PAYBACK_MIN_YEARS);
    expect(result.paybackYear).toBeLessThanOrEqual(BUS_PAYBACK_MAX_YEARS);
  });

  it('would not be a business at all over scenario 1 geometry', () => {
    // The measurement behind the shortened line. It is asserted rather than
    // asserted-away: the day a rule change makes a 25-tile omnibus line pay,
    // this test goes red and the twin's geometry is re-decided deliberately
    // instead of staying short out of habit.
    const long = measureBusLine(MODERN_DISTANCE_TILES);
    const first = long.balances[0]!;
    const last = long.balances[long.balances.length - 1]!;
    console.log(
      `1870s bus line over ${MODERN_DISTANCE_TILES} tiles: ` +
        `balance by year ${long.balances.map((b) => euros(b)).join(' / ')} EUR`,
    );
    expect(last).toBeLessThan(first);
    expect(long.paybackYear).toBe(Number.POSITIVE_INFINITY);
  });

  hashTwin(
    'eraBusLine',
    () => [result.world],
    () => [measureBusLine().world],
  );
});

describe('scenario 2, 1870s: the first steam coal railway', () => {
  const result = measureCoalTrain();

  it('reports what it measured', () => {
    console.log(
      `1870s coal train: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map((b) => euros(b)).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}\n  ${result.detail}`,
    );
    expect(result.investmentCt).toBeGreaterThan(0);
  });

  it('opens in the 1870s and keeps both works open', () => {
    expect(result.world.startYear).toBe(ERA_YEAR);
    expect(result.world.industries[0]!.open).toBe(true);
    expect(result.world.industries[1]!.open).toBe(true);
  });

  it('pays for itself inside its own band', () => {
    expect(result.paybackYear).toBeGreaterThanOrEqual(TRAIN_PAYBACK_MIN_YEARS);
    expect(result.paybackYear).toBeLessThanOrEqual(TRAIN_PAYBACK_MAX_YEARS);
  });

  hashTwin(
    'eraCoalTrain',
    () => [result.world],
    () => [measureCoalTrain().world],
  );
});

// ------------------------------------------------- the inflation band itself

describe('a two-century span does not stretch the one-century price table', () => {
  it('charges an 1878 world its AGE, not its date', () => {
    // The claim in one line. Before M23 the index was `year - START_YEAR`, so
    // an 1878 world would have sat at price level 1 for seventy-two years and
    // then started compounding - and `inflatedYearsBetween`, which has always
    // integrated the same table over `tick / TICKS_PER_YEAR`, would have
    // disagreed with it the whole time (D-245).
    const era = twoTownScenario(POPULATION, DISTANCE_TILES, ERA_YEAR).world;
    const modern = twoTownScenario(POPULATION, DISTANCE_TILES, START_YEAR).world;
    for (const years of [0, 1, 5, 20, 100]) {
      era.tick = years * TICKS_PER_YEAR;
      modern.tick = years * TICKS_PER_YEAR;
      expect(era.epochYears, `age at ${years}`).toBe(years);
      expect(era.costFactor, `price level at ${years}`).toBe(modern.costFactor);
      expect(era.costFactor).toBe(epochFactor(years));
    }
    // And the dates are a century apart the whole time, which is what makes
    // the equality above a statement rather than a tautology.
    expect(era.date.year).toBe(ERA_YEAR + 100);
    expect(modern.date.year).toBe(START_YEAR + 100);
  });

  it('never compounds past the table, however long the world runs', () => {
    // The other half: an `endless` two-century game reaches the end of the
    // 101-entry table and stays there rather than running off it. A table
    // stretched over two hundred years would put the price level at 33x.
    const ceiling = epochFactor(100);
    expect(epochFactor(200)).toBe(ceiling);
    expect(epochFactor(1_000)).toBe(ceiling);
    expect(ceiling).toBeLessThan(7);
  });
});
