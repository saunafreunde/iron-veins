import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { CENTS_PER_EURO } from '../../src/sim/constants';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import { RailType } from '../../src/sim/map/track';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import { VEHICLE_STATE_KEYS } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { apply, flatScenario, runYears, type Scenario } from './scenario';

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
 */

const SIZE = 128;
const ROW = 30;
const DISTANCE_TILES = 45;

const MINE_X = 20;
const PLANT_X = MINE_X + DISTANCE_TILES;
/** Both works stand one row off the line: track may not cross an industry. */
const INDUSTRY_ROW = ROW + 2;

/** A 1950 steam locomotive and eight open wagons. */
const LOCO = 1000;
const WAGON = 1520;
const WAGON_COUNT = 8;
/**
 * Tiles of platform at each end.
 *
 * A locomotive and eight wagons is 98 m, which is exactly two tiles - so two is
 * what the line needs and a third would be a platform nothing ever stands on.
 */
const PLATFORM_TILES = 2;

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

/** Mine, power plant, a line between them and one train working it. */
function coalLine(): Scenario {
  const scenario = flatScenario(
    SIZE,
    [],
    [
      newIndustry(0, IndustryType.CoalMine, MINE_X, INDUSTRY_ROW, 0),
      newIndustry(1, IndustryType.PowerPlant, PLANT_X, INDUSTRY_ROW, 0),
    ],
  );

  // The line, a platform at each end and a shed just past the mine.
  apply(scenario, {
    kind: CommandKind.BuildTrack,
    x1: MINE_X - 4,
    y1: ROW,
    x2: PLANT_X + PLATFORM_TILES + 1,
    y2: ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  // Platforms long enough to hold the whole train. A locomotive and eight
  // wagons is 98 m, which is two tiles; a train hanging off the end works only
  // the share that fits, minus forty percent (section 10), and that alone took
  // this line's throughput down to a third.
  for (let i = 0; i < PLATFORM_TILES; i++) {
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: MINE_X + i,
      y: ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: PLANT_X + i,
      y: ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRailStop,
    x: MINE_X - 4,
    y: ROW,
    moduleKind: ModuleKind.RailDepot,
  });

  const world = scenario.world;
  const mineStop = world.stations.find((station) =>
    station.modules.some((module) => module.tileIndex === world.map.tileIndex(MINE_X, ROW)),
  )!;
  const plantStop = world.stations.find((station) =>
    station.modules.some((module) => module.tileIndex === world.map.tileIndex(PLANT_X, ROW)),
  )!;

  const consist = [LOCO];
  for (let i = 0; i < WAGON_COUNT; i++) consist.push(WAGON);
  apply(scenario, { kind: CommandKind.BuyTrain, x: MINE_X - 4, y: ROW, specIds: consist });
  apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId: 0, cargo: Cargo.Coal });
  apply(scenario, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      // Take what is there rather than waiting for a full load. Waiting looks
      // like the thrifty choice and is the opposite: coal ages on the platform
      // while the train stands next to it, the station is visited less often,
      // its rating falls, and the gate of section 10.1 then lets less coal out
      // of the mine in the first place.
      { target: 0, targetId: mineStop.id, load: 1, unload: 0 },
      { target: 0, targetId: plantStop.id, load: 2, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  return scenario;
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
  const scenario = coalLine();
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
  const result = measure(PAYBACK_MAX_YEARS + 2);

  it('reports what it measured', () => {
    const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
    console.log(
      `coal line: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map(euros).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}`,
    );
    console.log(result.detail);
    expect(result.investmentCt).toBeGreaterThan(0);
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
    const scenario = coalLine();
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
    () => [measure(PAYBACK_MAX_YEARS + 2).world],
  );
});
