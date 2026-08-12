import { describe, expect, it } from 'vitest';
import {
  BANKRUPTCY_MONTHS,
  BANKRUPTCY_WARNING_MONTHS,
  CENTS_PER_EURO,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { isInTrouble } from '../../src/sim/economy/company';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import type { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { buildIdleCompany, IDLE_CAPITAL_CT, IDLE_ROW, yearOfRuin } from './idleCompany';
import type { Scenario } from './scenario';

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

/**
 * The company itself lives in `idleCompany.ts` since SPEC2 M23, for the reason
 * `coalLine.ts` exists: that milestone's per-climate matrix winds the same
 * company up in four climates, and two files that each bought their own fleet
 * would be measuring two different companies within a game year of the first
 * edit (D-187). What stays here is the BAND and the two rules around it.
 */

const CAPITAL_CT = IDLE_CAPITAL_CT;
const BANKRUPT_MIN_YEAR = 6;
const BANKRUPT_MAX_YEAR = 9;

/** The idle company, bought exactly as scenario 4 has always bought it. */
function idleCompany(): Scenario {
  return buildIdleCompany();
}

/** The idle company played to its ruin - one whole run, for the desync guard. */
function ruinedWorld(): World[] {
  const scenario = idleCompany();
  yearOfRuin(scenario, 12);
  return [scenario.world];
}

describe('scenario 4: a company that stops playing', () => {
  it('reports what it measured', () => {
    const scenario = idleCompany();
    const world = scenario.world;
    const investedCt = CAPITAL_CT - world.company.cashCt;
    const upkeepCt = upkeepPerYearCt(world.company);
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
    expect(world.map.roadBits[world.map.tileIndex(50, IDLE_ROW)]).not.toBe(0);
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

  hashTwin('idleCompany', ruinedWorld, ruinedWorld);
});
