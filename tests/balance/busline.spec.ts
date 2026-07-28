import { describe, expect, it } from 'vitest';
import { CENTS_PER_EURO } from '../../src/sim/constants';
import { stationRating } from '../../src/sim/station/types';
import { VEHICLE_STATE_KEYS } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';
import { buildBusLine, runYears, twoTownScenario } from './scenario';

/**
 * Balancing scenario 1 of section 19.4.
 *
 * "First bus line, two towns of 1,200 inhabitants, 25 tiles apart, two buses:
 *  pays for itself in 2 to 4 game years."
 *
 * When this leaves its band the CONSTANTS get adjusted, never the test - the
 * numbers in the tables are starting values, this band is the requirement.
 */

const POPULATION = 1_200;
const DISTANCE_TILES = 25;
const BUS_SPEC = 200; // the 1950 bus
const BUS_COUNT = 2;

const PAYBACK_MIN_YEARS = 2;
const PAYBACK_MAX_YEARS = 4;

interface Measurement {
  readonly investmentCt: number;
  readonly balances: readonly number[];
  readonly paybackYear: number;
  /** Plain-language account of what the line actually did, for calibration. */
  readonly detail: string;
}

function measure(years: number): Measurement {
  const scenario = twoTownScenario(POPULATION, DISTANCE_TILES);
  const before = scenario.world.company.cashCt;

  buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
  const investmentCt = before - scenario.world.company.cashCt;

  const balances = runYears(scenario, years);
  const detail = describeLine(scenario.world, years);
  let paybackYear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < balances.length; i++) {
    if (balances[i]! >= before) {
      paybackYear = i + 1;
      break;
    }
  }
  return { investmentCt, balances, paybackYear, detail };
}

/**
 * Why the line earns what it earns. A balancing test that only says "out of
 * band" sends you guessing; this says which of throughput, service quality or
 * cost is the binding constraint.
 */
function describeLine(world: World, years: number): string {
  const parts: string[] = [];

  for (const station of world.stations) {
    const waiting = station.waiting.reduce((sum, stack) => sum + stack.amount, 0);
    parts.push(
      `${station.name}: rating ${stationRating(station, world.tick)}, ` +
        `${waiting.toFixed(0)} waiting, ${station.visitTicks.length} visits per 20 days, ` +
        `covers ${station.buildingsCovered} buildings`,
    );
  }

  const vehicles = world.vehicles;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const carried = vehicles.cargo[id]!.reduce((sum, stack) => sum + stack.amount, 0);
    parts.push(
      `bus ${id}: ${VEHICLE_STATE_KEYS[vehicles.state[id]!]}, ` +
        `carrying ${carried.toFixed(0)}, ` +
        `earned ${(vehicles.earnedCt[id]! / CENTS_PER_EURO / years).toFixed(0)} EUR per year`,
    );
  }

  parts.push(`upkeep ${(world.company.upkeepPerYearCt / CENTS_PER_EURO).toFixed(0)} EUR per year`);
  return parts.join('\n  ');
}

describe('scenario 1: the first bus line', () => {
  const result = measure(PAYBACK_MAX_YEARS + 2);

  it('reports what it measured', () => {
    const euros = (cents: number) => (cents / CENTS_PER_EURO).toFixed(0);
    console.log(
      `bus line: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map((b) => euros(b)).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}\n  ${result.detail}`,
    );
    expect(result.investmentCt).toBeGreaterThan(0);
  });

  it('earns money at all', () => {
    // Year six must be better than year one, or the line is simply a loss.
    expect(result.balances[result.balances.length - 1]!).toBeGreaterThan(result.balances[0]!);
  });

  it('pays for itself within two to four game years', () => {
    expect(result.paybackYear).toBeGreaterThanOrEqual(PAYBACK_MIN_YEARS);
    expect(result.paybackYear).toBeLessThanOrEqual(PAYBACK_MAX_YEARS);
  });
});
