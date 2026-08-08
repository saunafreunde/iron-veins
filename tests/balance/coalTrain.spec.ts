import { describe, expect, it } from 'vitest';
import { CENTS_PER_EURO } from '../../src/sim/constants';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import { VEHICLE_STATE_KEYS } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';
import { buildCoalLine, COAL_LINE_SPAN_YEARS } from './coalLine';
import { hashTwin } from './determinism';
import { runYears } from './scenario';

/**
 * Balancing scenario 2 of section 19.4.
 *
 * "First rail line, coal mine to power plant, 45 tiles, one train of eight
 *  wagons: pays for itself in 4 to 7 game years."
 *
 * This scenario is the AUTHORITY over the freight tariffs. D-066 recalibrated
 * them against a closed-form ceiling test I wrote myself, because this scenario
 * did not exist yet; it does now, and if the two ever disagree this one wins.
 *
 * When it leaves its band the CONSTANTS get adjusted, never the test.
 *
 * The railway itself lives in `coalLine.ts` since SPEC2 M18, because a second
 * file measures a second thing about the SAME line (what a hard winter costs
 * it) and two hand-built copies would have drifted apart. Weather is OFF here
 * and in every other band of 19.4: all five were measured by a simulation with
 * no weather in it (Fehlerkatalog 34).
 */

const PAYBACK_MIN_YEARS = 4;
const PAYBACK_MAX_YEARS = 7;

interface Measurement {
  readonly investmentCt: number;
  readonly balances: readonly number[];
  readonly paybackYear: number;
  readonly detail: string;
  /** The world the measurement was taken on - the desync guard's subject. */
  readonly world: World;
}

/**
 * Why the line earns what it earns. A balancing test that only says "out of
 * band" sends you guessing; this says which of throughput, service quality or
 * cost is the binding constraint.
 */
function describeLine(world: World, years: number): string {
  const parts: string[] = [];
  const mine = world.industries[0]!;
  const plant = world.industries[1]!;

  for (const station of world.stations) {
    if (station.modules.every((module) => module.kind === ModuleKind.RailDepot)) continue;
    let waiting = 0;
    for (const stack of station.waiting) waiting += stack.amount;
    parts.push(
      `  ${station.name}: rating ${stationRating(station, world.tick)}, ` +
        `${Math.round(waiting)} waiting, ${station.visitTicks.length} visits per 20 days`,
    );
  }
  parts.push(
    `  mine: level ${mine.productionLevel} %, ${Math.round(mine.outputStock0)} in the yard, ` +
      `service ${Math.round(mine.serviceAverage * 100)} %`,
  );
  parts.push(
    `  power plant: ${Math.round(plant.inputStock0)} coal in stock, ` +
      `burning ${Math.round(plant.producedThisMonth)} this month`,
  );

  const train = world.vehicles;
  parts.push(
    `  train: ${VEHICLE_STATE_KEYS[train.state[0]!] ?? ''}, ` +
      `earned ${Math.round(train.earnedCt[0]! / CENTS_PER_EURO / years)} EUR per year`,
  );
  parts.push(
    `  upkeep ${Math.round(upkeepPerYearCt(world.company) / CENTS_PER_EURO)} EUR per year`,
  );
  return parts.join('\n');
}

function measure(years: number): Measurement {
  const scenario = buildCoalLine();
  const world = scenario.world;
  // The balance BEFORE the line was built is what has to be reached again.
  const before = 500_000 * CENTS_PER_EURO;
  const investmentCt = before - world.company.cashCt;

  const balances = runYears(scenario, years);
  const detail = describeLine(world, years);

  let paybackYear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < balances.length; i++) {
    if (balances[i]! >= before) {
      paybackYear = i + 1;
      break;
    }
  }
  return { investmentCt, balances, paybackYear, detail, world };
}

describe('scenario 2: the first rail line', () => {
  const result = measure(COAL_LINE_SPAN_YEARS);

  it('reports what it measured', () => {
    const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
    console.log(
      `coal line: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map(euros).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}`,
    );
    console.log(result.detail);
    expect(result.investmentCt).toBeGreaterThan(0);
    // The span has to outrun the band, or a line that never pays for itself
    // would be reported as one that pays in the last year measured.
    expect(COAL_LINE_SPAN_YEARS).toBeGreaterThan(PAYBACK_MAX_YEARS);
  });

  it('pays for itself in four to seven game years', () => {
    expect(result.paybackYear).toBeGreaterThanOrEqual(PAYBACK_MIN_YEARS);
    expect(result.paybackYear).toBeLessThanOrEqual(PAYBACK_MAX_YEARS);
  });

  it('keeps the mine open and the power plant burning what it is sent', () => {
    // A line that pays for itself while the works it serves shuts down would
    // be a measurement of nothing. The plant holds almost no stock because it
    // burns what arrives, so what is checked is that it is BURNING - a power
    // plant books its own consumption as production.
    const scenario = buildCoalLine();
    runYears(scenario, PAYBACK_MAX_YEARS);
    const mine = scenario.world.industries[0]!;
    const plant = scenario.world.industries[1]!;
    expect(mine.open).toBe(true);
    expect(plant.open).toBe(true);
    expect(plant.producedThisMonth + plant.inputStock0).toBeGreaterThan(0);
  });

  hashTwin(
    'coalTrain',
    () => [result.world],
    () => [measure(COAL_LINE_SPAN_YEARS).world],
  );
});
