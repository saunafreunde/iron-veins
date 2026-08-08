import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { CENTS_PER_EURO, TICKS_PER_YEAR } from '../../src/sim/constants';
import {
  industrySpec,
  IndustryType,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import type { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { apply, flatScenario, makeTown, runYears, type Scenario } from './scenario';

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

const SIZE = 128;
const ROW = 40;
/** Works stand one row off the road: a road may not cross an industry. */
const WORKS_ROW = ROW + 2;

const FOREST_X = 10;
const SAWMILL_X = 40;
const FURNITURE_X = 70;
const TOWN_X = 100;

/** A 1950 bulk lorry for the timber, and a 1950 box lorry for planks and goods. */
const BULK_LORRY = 240;
const BOX_LORRY = 250;
const LORRIES_PER_LINE = 4;

/** The chain cannot exist before the box lorry does. */
const START_TICK = 3 * TICKS_PER_YEAR;

const PROFIT_MIN_CT = 80_000 * CENTS_PER_EURO;
const PROFIT_MAX_CT = 200_000 * CENTS_PER_EURO;

interface Haul {
  readonly fromX: number;
  readonly toX: number;
  readonly cargo: Cargo;
  readonly specId: number;
}

/** The three hauls, in the order the cargo travels. */
const HAULS: readonly Haul[] = [
  { fromX: FOREST_X, toX: SAWMILL_X, cargo: Cargo.Wood, specId: BULK_LORRY },
  { fromX: SAWMILL_X, toX: FURNITURE_X, cargo: Cargo.Planks, specId: BOX_LORRY },
  { fromX: FURNITURE_X, toX: TOWN_X, cargo: Cargo.Goods, specId: BOX_LORRY },
];

function industries(): Industry[] {
  return [
    newIndustry(0, IndustryType.Forestry, FOREST_X, WORKS_ROW, 0),
    newIndustry(1, IndustryType.Sawmill, SAWMILL_X, WORKS_ROW, 0),
    newIndustry(2, IndustryType.FurnitureFactory, FURNITURE_X, WORKS_ROW, 0),
  ];
}

/** The whole chain: one road, a stop at each works, and lorries on each haul. */
function woodChain(): Scenario {
  const town = makeTown(0, TOWN_X, ROW, 2_500, 'Holzhausen');
  const scenario = flatScenario(SIZE, [town], industries());
  const world = scenario.world;
  // Four lorries a haul is more than the starting capital buys; this scenario
  // measures a chain that is already built, not the climb to build it.
  world.company.cashCt = 5_000_000 * CENTS_PER_EURO;
  // The box lorry the planks and the goods need is a 1953 vehicle, and nothing
  // in 1950 can carry either. The chain therefore starts in 1953 - which is
  // also when a player would first be able to build it.
  world.tick = START_TICK;

  apply(scenario, { kind: CommandKind.BuildRoad, x1: FOREST_X - 3, y1: ROW, x2: TOWN_X, y2: ROW });
  for (const x of [FOREST_X, SAWMILL_X, FURNITURE_X, TOWN_X - 1]) {
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x,
      y: ROW,
      moduleKind: ModuleKind.LorryBay,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: FOREST_X - 3,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });

  const stopAt = (x: number): number => {
    const tile = world.map.tileIndex(x, ROW);
    return world.stations.find((station) =>
      station.modules.some((module) => module.tileIndex === tile),
    )!.id;
  };
  const townStop = stopAt(TOWN_X - 1);

  let vehicleId = 0;
  for (const haul of HAULS) {
    const from = stopAt(haul.fromX);
    const to = haul.toX === TOWN_X ? townStop : stopAt(haul.toX);
    for (let i = 0; i < LORRIES_PER_LINE; i++) {
      apply(scenario, {
        kind: CommandKind.BuyRoadVehicle,
        x: FOREST_X - 3,
        y: ROW,
        specId: haul.specId,
      });
      apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId, cargo: haul.cargo });
      apply(scenario, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          { target: 0, targetId: from, load: 1, unload: 0 },
          { target: 0, targetId: to, load: 1, unload: 0 },
        ],
      });
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
      vehicleId++;
    }
  }
  return scenario;
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
