import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_WARNING_MONTHS,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { closureWarningLevel } from '../../src/sim/industry/lifecycle';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import { flatScenario, type Scenario } from './scenario';

/**
 * Balancing scenario 6 of section 19.4.
 *
 * "Coal mine with nothing carried away: closes after 24 +/- 1 months."
 *
 * It reads like a unit test and it is not: what it pins is that the closure
 * clock runs on the CALENDAR and at the rate the calendar actually advances.
 * A closure driven off the tick clock, or a production pass that books a month
 * more than once, both pass every unit test in the suite and both show up here
 * as a mine that shuts in its third game month.
 */

const SIZE = 64;
const MINE_X = 20;
const MINE_Y = 20;

/** The month a works with nothing collected finally closes, or -1. */
function monthOfClosure(scenario: Scenario, months: number): number {
  const mine = scenario.world.industries[0]!;
  for (let month = 1; month <= months; month++) {
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    if (!mine.open) return month;
  }
  return -1;
}

function mineScenario(): Scenario {
  return flatScenario(SIZE, [], [newIndustry(0, IndustryType.CoalMine, MINE_X, MINE_Y, 0)]);
}

describe('scenario 6: a coal mine nobody collects from', () => {
  it('closes after 24 months, give or take one', () => {
    const scenario = mineScenario();
    const closed = monthOfClosure(scenario, INDUSTRY_CLOSURE_MONTHS + 12);

    console.log(`coal mine with no line: closed in game month ${closed}`);
    expect(closed).toBeGreaterThanOrEqual(INDUSTRY_CLOSURE_MONTHS - 1);
    expect(closed).toBeLessThanOrEqual(INDUSTRY_CLOSURE_MONTHS + 1);
  });

  it('warns twice on the way there, and gives the ground back at the end', () => {
    const scenario = mineScenario();
    const world = scenario.world;
    const mine = world.industries[0]!;

    // One month longer than the closure period: the first game month produces
    // nothing yet - the review runs before the first batch is made - so the
    // whole clock is shifted by one, which is what the "+/- 1" is for.
    const warnings: number[] = [];
    let level = 0;
    for (let month = 1; month <= INDUSTRY_CLOSURE_MONTHS + 1; month++) {
      for (let tick = 0; tick < TICKS_PER_MONTH; tick++) world.step(scenario.queue, null);
      const now = closureWarningLevel(mine);
      if (now > level) warnings.push(month);
      level = now;
    }

    // One warning after a game year, one after twenty months (section 7.3).
    expect(warnings).toHaveLength(INDUSTRY_WARNING_MONTHS.length);
    expect(warnings[0]).toBeGreaterThanOrEqual(INDUSTRY_WARNING_MONTHS[0]!);
    expect(warnings[0]).toBeLessThanOrEqual(INDUSTRY_WARNING_MONTHS[0]! + 1);
    expect(warnings[1]).toBeGreaterThanOrEqual(INDUSTRY_WARNING_MONTHS[1]!);
    expect(warnings[1]).toBeLessThanOrEqual(INDUSTRY_WARNING_MONTHS[1]! + 1);

    expect(mine.open).toBe(false);
    expect(world.map.industryId[world.map.tileIndex(MINE_X, MINE_Y)]).toBe(-1);
  });

  it('keeps a mine that IS collected from open indefinitely', () => {
    // The other half of the rule, and the one a bug would break silently: a
    // works that ships something every month must never run its closure clock.
    const scenario = mineScenario();
    const mine = scenario.world.industries[0]!;

    for (let month = 1; month <= INDUSTRY_CLOSURE_MONTHS * 2; month++) {
      for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
        scenario.world.step(scenario.queue, null);
        // One unit a day leaves the yard, as a line would take it.
        if (mine.outputStock0 > 1) {
          mine.outputStock0 -= 1;
          mine.collectedThisMonth += 1;
        }
      }
    }
    expect(mine.open).toBe(true);
    expect(mine.monthsWithoutCollection).toBe(0);
  });
});
