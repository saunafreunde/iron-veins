import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  BANKRUPTCY_MONTHS,
  BANKRUPTCY_WARNING_MONTHS,
  CENTS_PER_EURO,
  START_CAPITAL_CT,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  Difficulty,
} from '../../src/sim/constants';
import { isInTrouble } from '../../src/sim/economy/company';
import { ModuleKind } from '../../src/sim/station/types';
import { apply, flatScenario, makeTown, type Scenario } from './scenario';

/**
 * Balancing scenario 4 of section 19.4.
 *
 * "Passively doing nothing with the starting capital, ten years: bankrupt
 *  between year 6 and 9 - upkeep eats the capital."
 *
 * A company that owns nothing has no upkeep and would sit on its 500.000 EUR
 * for ever, so "doing nothing" cannot mean "build nothing": it means a player
 * who spends their capital on a network and then stops playing it. What the
 * band actually pins is therefore the RATIO of yearly upkeep to purchase price
 * across the whole catalogue - at roughly a tenth, a company that has put most
 * of its capital into assets and earns nothing runs out in about six years, and
 * the twelve month countdown of 14.2 takes it from there.
 *
 * That reading is recorded in DECISIONS.md D-088 along with why the literal one
 * is not satisfiable.
 */

const SIZE = 128;
const ROW = 40;
const CAPITAL_CT = START_CAPITAL_CT[Difficulty.Normal]!;

/**
 * Share of the starting capital the idle company has sunk into assets.
 *
 * Six tenths is what a player has spent by the time they have a line running
 * and a second one half built, and it is the fraction the scenario's band
 * describes: years to ruin is (1 - f) / (upkeep rate x f).
 */
const INVESTED_SHARE = 0.6;

const BANKRUPT_MIN_YEAR = 6;
const BANKRUPT_MAX_YEAR = 9;

/** A 1950 bus, and the road vehicles that are bought and never run. */
const BUS = 200;

/**
 * A network bought with most of the starting capital and then left alone.
 *
 * Roads and stops first - infrastructure a player cannot sell again - and then
 * buses until the target share is spent. Nothing is ever started, so nothing
 * ever earns: this is a company that stopped playing.
 */
function idleCompany(): Scenario {
  const town = makeTown(0, 30, ROW, 1_200, 'Stillstadt');
  const scenario = flatScenario(SIZE, [town], []);
  const world = scenario.world;
  const target = CAPITAL_CT * INVESTED_SHARE;

  apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: ROW, x2: 110, y2: ROW });
  for (const x of [12, 40, 70, 100]) {
    apply(scenario, { kind: CommandKind.BuildRoadStop, x, y: ROW, moduleKind: ModuleKind.BusStop });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 14,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });

  // Buses until the capital is committed. They are never given orders and
  // never started - they sit in the shed costing money, which is the whole
  // point of the scenario.
  while (CAPITAL_CT - world.company.cashCt < target) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 14, y: ROW, specId: BUS });
  }
  return scenario;
}

/** The game year in which the company is wound up, or -1 inside `years`. */
function yearOfRuin(scenario: Scenario, years: number): number {
  for (let month = 1; month <= years * 12; month++) {
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    if (scenario.world.company.bankrupt) return Math.ceil(month / 12);
  }
  return -1;
}

describe('scenario 4: a company that stops playing', () => {
  it('reports what it measured', () => {
    const scenario = idleCompany();
    const world = scenario.world;
    const investedCt = CAPITAL_CT - world.company.cashCt;
    const upkeepCt = world.company.upkeepPerYearCt;
    const year = yearOfRuin(scenario, 12);

    console.log(
      `idle company: invested ${Math.round(investedCt / CENTS_PER_EURO)} EUR ` +
        `(${Math.round((investedCt / CAPITAL_CT) * 100)} % of capital), ` +
        `upkeep ${Math.round(upkeepCt / CENTS_PER_EURO)} EUR per year ` +
        `(${((upkeepCt / investedCt) * 100).toFixed(1)} % of what it cost), ` +
        `bankrupt in game year ${year}`,
    );
    expect(investedCt).toBeGreaterThan(0);
  });

  it('goes bankrupt between game year 6 and 9', () => {
    const year = yearOfRuin(idleCompany(), 12);
    expect(year).toBeGreaterThanOrEqual(BANKRUPT_MIN_YEAR);
    expect(year).toBeLessThanOrEqual(BANKRUPT_MAX_YEAR);
  });

  it('warns three months in and winds the company up nine months later', () => {
    const scenario = idleCompany();
    const world = scenario.world;

    let warnedAt = -1;
    let ruinedAt = -1;
    for (let month = 1; month <= 12 * 12 && ruinedAt < 0; month++) {
      for (let tick = 0; tick < TICKS_PER_MONTH; tick++) world.step(scenario.queue, null);
      if (warnedAt < 0 && isInTrouble(world.company)) warnedAt = month;
      if (world.company.bankrupt) ruinedAt = month;
    }

    expect(warnedAt).toBeGreaterThan(0);
    expect(ruinedAt - warnedAt).toBe(BANKRUPTCY_MONTHS - BANKRUPTCY_WARNING_MONTHS);
    // The fleet was auctioned; the road it never drove on is still there.
    expect(world.vehicles.livingCount).toBe(0);
    expect(world.map.roadBits[world.map.tileIndex(50, ROW)]).not.toBe(0);
  });

  it('leaves a company that earns its keep alone', () => {
    // The other half of the rule. Nothing here may wind up a solvent company,
    // and a scenario that only ever measures failure would not notice.
    const scenario = idleCompany();
    scenario.world.company.cashCt = CAPITAL_CT * 100;
    for (let tick = 0; tick < TICKS_PER_YEAR * 12; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    expect(scenario.world.company.bankrupt).toBe(false);
    expect(scenario.world.company.monthsInDebt).toBe(0);
  });
});
