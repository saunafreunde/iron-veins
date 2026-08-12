import { CommandKind } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_MONTH,
  WeatherRule,
} from '../../src/sim/constants';
import { ModuleKind } from '../../src/sim/station/types';
import { apply, flatScenario, makeTown, type Scenario } from './scenario';

/**
 * THE idle company - balancing scenario 4 of section 19.4, as one object
 * rather than as two copies (`coalLine.ts`'s reason, one scenario along).
 *
 * `bankruptcy.spec.ts` owns the BAND (bankrupt in game year 6 to 9, which pins
 * upkeep as a share of purchase price); SPEC2 M23's per-climate matrix asks
 * the same company the same question in four climates. Two files that each
 * bought their own fleet would be measuring two different companies within a
 * game year of the first edit (D-187).
 */

export const IDLE_SIZE = 128;
export const IDLE_ROW = 40;
export const IDLE_CAPITAL_CT = START_CAPITAL_CT[Difficulty.Normal]!;

/**
 * Share of the starting capital the idle company has sunk into assets.
 *
 * Six tenths is what a player has spent by the time they have a line running
 * and a second one half built, and it is the fraction the scenario's band
 * describes: years to ruin is (1 - f) / (upkeep rate x f).
 */
export const IDLE_INVESTED_SHARE = 0.6;

/** A 1950 bus, and the road vehicles that are bought and never run. */
export const IDLE_BUS = 200;

/**
 * A network bought with most of the starting capital and then left alone.
 *
 * Roads and stops first - infrastructure a player cannot sell again - and then
 * buses until the target share is spent. Nothing is ever started, so nothing
 * ever earns: this is a company that stopped playing.
 */
export function buildIdleCompany(
  climate: MapClimate = MapClimate.Temperate,
  weather: WeatherRule = WeatherRule.Off,
): Scenario {
  const town = makeTown(0, 30, IDLE_ROW, 1_200, 'Stillstadt');
  const scenario = flatScenario(
    IDLE_SIZE,
    [town],
    [],
    9,
    0,
    true,
    weather,
    false,
    false,
    undefined,
    climate,
  );
  const world = scenario.world;
  const target = IDLE_CAPITAL_CT * IDLE_INVESTED_SHARE;

  apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: IDLE_ROW, x2: 110, y2: IDLE_ROW });
  for (const x of [12, 40, 70, 100]) {
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x,
      y: IDLE_ROW,
      moduleKind: ModuleKind.BusStop,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 14,
    y: IDLE_ROW,
    moduleKind: ModuleKind.RoadDepot,
  });

  // Buses until the capital is committed. They are never given orders and
  // never started - they sit in the shed costing money, which is the whole
  // point of the scenario.
  while (IDLE_CAPITAL_CT - world.company.cashCt < target) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 14, y: IDLE_ROW, specId: IDLE_BUS });
  }
  return scenario;
}

/** The game year in which the company is wound up, or -1 inside `years`. */
export function yearOfRuin(scenario: Scenario, years: number): number {
  for (let month = 1; month <= years * 12; month++) {
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    if (scenario.world.company.bankrupt) return Math.ceil(month / 12);
  }
  return -1;
}
