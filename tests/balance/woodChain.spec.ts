import { describe, expect, it } from 'vitest';
import { CENTS_PER_EURO } from '../../src/sim/constants';
import { industrySpec } from '../../src/sim/industry/types';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import type { World } from '../../src/sim/World';
import { buildWoodChain } from './chains';
import { hashTwin } from './determinism';
import { runYears, type Scenario } from './scenario';

/**
 * Balancing scenario 3 of section 19.4.
 *
 * "Fully built chain forest -> sawmill -> town, three lines: 80,000 to 200,000
 *  EUR of profit a year."
 *
 * The chain of 7.2 is four links, not three - wood to the sawmill, planks to
 * the furniture works, goods to the town - so the three LINES are the three
 * hauls between them. "Fully built" is taken at its word: enough lorries on
 * each haul that the stations are properly served, which is what opens the
 * collection gate and lets the industries expand.
 *
 * When it leaves its band the CONSTANTS get adjusted, never the test.
 */

/**
 * The chain itself lives in `chains.ts` since SPEC2 M23, for the reason
 * `coalLine.ts` exists: the per-climate D-118 run of that milestone drives the
 * same three hauls in three other climates, and two files that each built
 * their own would be measuring two different chains within a game year of the
 * first edit (D-187). Everything this file still owns is the MEASUREMENT: the
 * band, the years it is measured over and the account it prints.
 */

const PROFIT_MIN_CT = 80_000 * CENTS_PER_EURO;
const PROFIT_MAX_CT = 200_000 * CENTS_PER_EURO;

/** The chain, built exactly as scenario 3 has always built it. */
function woodChain(): Scenario {
  return buildWoodChain();
}

/** Why the chain earns what it earns, link by link. */
function describeChain(world: World): string {
  const parts: string[] = [];
  for (const industry of world.industries) {
    parts.push(
      `  ${industrySpec(industry.type).nameKey}: level ${industry.productionLevel} %, ` +
        `in ${Math.round(industry.inputStock0)}, out ${Math.round(industry.outputStock0)}, ` +
        `service ${Math.round(industry.serviceAverage * 100)} %`,
    );
  }
  for (const station of world.stations) {
    if (station.modules.every((module) => module.kind === ModuleKind.RoadDepot)) continue;
    let waiting = 0;
    for (const stack of station.waiting) waiting += stack.amount;
    parts.push(
      `  ${station.name} (${station.x}): rating ${stationRating(station, world.tick)}, ` +
        `${Math.round(waiting)} waiting, ${station.visitTicks.length} visits per 20 days`,
    );
  }
  parts.push(`  town: ${world.towns[0]!.population} inhabitants`);
  parts.push(
    `  upkeep ${Math.round(upkeepPerYearCt(world.company) / CENTS_PER_EURO)} EUR per year`,
  );
  return parts.join('\n');
}

/** Profit of the last measured year, once the chain has filled up. */
function measure(): { profitCt: number; balances: number[]; detail: string; world: World } {
  const scenario = woodChain();
  // Three years for the chain to fill - the sawmill cannot make planks before
  // the first timber arrives, and the furniture works waits on the sawmill.
  runYears(scenario, 3);

  const balances = runYears(scenario, 3);
  const profitCt = Math.round((balances[2]! - balances[0]!) / 2);
  return { profitCt, balances, detail: describeChain(scenario.world), world: scenario.world };
}

describe('scenario 3: the whole wood chain', () => {
  const result = measure();

  it('reports what it measured', () => {
    const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
    console.log(
      `wood chain: profit ${euros(result.profitCt)} EUR per year, ` +
        `balance by year ${result.balances.map(euros).join(' / ')} EUR`,
    );
    console.log(result.detail);
    expect(result.balances).toHaveLength(3);
  });

  it('earns between 80.000 and 200.000 EUR a year once it is running', () => {
    expect(result.profitCt).toBeGreaterThanOrEqual(PROFIT_MIN_CT);
    expect(result.profitCt).toBeLessThanOrEqual(PROFIT_MAX_CT);
  });

  it('keeps every link of the chain alive', () => {
    const scenario = woodChain();
    runYears(scenario, 6);
    for (const industry of scenario.world.industries) {
      expect(industry.open, industrySpec(industry.type).nameKey).toBe(true);
    }
    // And the town grew on the goods it was sent.
    expect(scenario.world.towns[0]!.population).toBeGreaterThan(2_500);
  });

  hashTwin(
    'woodChain',
    () => [result.world],
    () => [measure().world],
  );
});
