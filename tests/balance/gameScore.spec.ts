import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { CENTS_PER_EURO, SCORE_TERM_MAX_POINTS, TICKS_PER_YEAR } from '../../src/sim/constants';
import { companyScore } from '../../src/sim/goals/score';
import { GoalKind, GoalStatus, type GoalSpec } from '../../src/sim/goals/types';
import { IndustryType, newIndustry, type Industry } from '../../src/sim/industry/types';
import { ModuleKind } from '../../src/sim/station/types';
import type { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { apply, flatScenario, makeTown, type Scenario } from './scenario';

/**
 * The balancing band of the final score (SPEC2 M17).
 *
 * Every other scenario in this directory pins a TARIFF or a rule. This one
 * pins a FORMULA, and the property it holds is not "a good player scores
 * 5,000" - it is that the four quarters of the score are commensurate on a
 * competent run. A score whose value term is nine tenths of the total is a
 * score that only asks how rich the player is, and the goals, the network and
 * the tonnage beside it are decoration; a score whose value term is a
 * rounding error is a score that ignores the books entirely. Either way the
 * end screen would be telling the player to play for the wrong thing.
 *
 * So the band has two halves and the second is the interesting one:
 *
 *  - the TOTAL lands in a stated range for a competent quarter century, and
 *  - NO single term is more than 45 % of it, and none is under 5 %.
 *
 * What it owns are the four full-mark constants in `constants.ts`
 * (`SCORE_VALUE_FULL_CT`, `SCORE_NETWORK_FULL_SHARE`, `SCORE_CARGO_FULL_UNITS`
 * and the medal weights). When this test leaves its band those constants
 * change, never the test - the standing rule of section 19.4. It will also go
 * red if something underneath moves: freight tariffs, upkeep, the network
 * value definition of D-187 or the medal bands of D-193 all land here.
 *
 * The run itself is balancing scenario 3's wood chain, played a quarter
 * century with two goals hanging over it - deliberately the same shape as the
 * economy the other scenarios measure, so a score band and an earnings band
 * cannot drift apart without one of them saying so.
 */

const SIZE = 128;
const ROW = 40;
const WORKS_ROW = ROW + 2;
const FOREST_X = 10;
const SAWMILL_X = 40;
const FURNITURE_X = 70;
const TOWN_X = 100;
const BULK_LORRY = 240;
const BOX_LORRY = 250;
const LORRIES_PER_HAUL = 4;
/** The box lorry the planks and the goods need is a 1953 vehicle. */
const CHAIN_START_TICK = 3 * TICKS_PER_YEAR;
/** Half the goal: the company has to EARN the rest rather than start with it. */
const CHAIN_CAPITAL_CT = 1_000_000 * CENTS_PER_EURO;
const HORIZON_TICKS = 25 * TICKS_PER_YEAR;

/** The band the total has to land in for a competent quarter century. */
const SCORE_MIN = 3_000;
const SCORE_MAX = 7_000;
/** No quarter may dominate the sum, and none may be a rounding error. */
const TERM_SHARE_MAX = 0.45;
const TERM_SHARE_MIN = 0.05;

const GOALS: readonly GoalSpec[] = [
  {
    kind: GoalKind.CompanyValueBy,
    subjectA: -1,
    subjectB: -1,
    threshold: 2_000_000 * CENTS_PER_EURO,
    goldTick: 10 * TICKS_PER_YEAR,
    silverTick: 18 * TICKS_PER_YEAR,
    bronzeTick: 25 * TICKS_PER_YEAR,
  },
  {
    kind: GoalKind.CargoDeliveredTotal,
    subjectA: -1,
    subjectB: -1,
    threshold: 5_000,
    goldTick: 10 * TICKS_PER_YEAR,
    silverTick: 18 * TICKS_PER_YEAR,
    bronzeTick: 25 * TICKS_PER_YEAR,
  },
];

const HAULS = [
  { fromX: FOREST_X, toX: SAWMILL_X, cargo: Cargo.Wood, specId: BULK_LORRY },
  { fromX: SAWMILL_X, toX: FURNITURE_X, cargo: Cargo.Planks, specId: BOX_LORRY },
  { fromX: FURNITURE_X, toX: TOWN_X, cargo: Cargo.Goods, specId: BOX_LORRY },
];

function chainIndustries(): Industry[] {
  return [
    newIndustry(0, IndustryType.Forestry, FOREST_X, WORKS_ROW, 0),
    newIndustry(1, IndustryType.Sawmill, SAWMILL_X, WORKS_ROW, 0),
    newIndustry(2, IndustryType.FurnitureFactory, FURNITURE_X, WORKS_ROW, 0),
  ];
}

/** The competent company: a whole chain, built once and then run. */
function competentRun(): Scenario {
  const town = makeTown(0, TOWN_X, ROW, 2_500, 'Punktstadt');
  const scenario = flatScenario(SIZE, [town], chainIndustries());
  const world = scenario.world;
  for (const spec of GOALS) world.goals.add(spec);
  world.company.cashCt = CHAIN_CAPITAL_CT;
  world.tick = CHAIN_START_TICK;

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

  let vehicleId = 0;
  for (const haul of HAULS) {
    const from = stopAt(haul.fromX);
    const to = stopAt(haul.toX === TOWN_X ? TOWN_X - 1 : haul.toX);
    for (let i = 0; i < LORRIES_PER_HAUL; i++) {
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

function playQuarterCentury(): Scenario {
  const scenario = competentRun();
  while (scenario.world.tick < HORIZON_TICKS) scenario.world.step(scenario.queue, null);
  return scenario;
}

/** Played once for the whole file; the twin builds its own. */
let played: Scenario | null = null;
function quarterCentury(): Scenario {
  played ??= playQuarterCentury();
  return played;
}

function scoredWorld(): World[] {
  return [quarterCentury().world];
}

describe('the score formula: what a competent quarter century is worth', () => {
  it('reports what it measured, term by term', () => {
    const world = quarterCentury().world;
    const score = companyScore(world);
    const parts = [
      ['goals', score.goals],
      ['value', score.value],
      ['network', score.network],
      ['cargo', score.cargo],
    ] as const;

    console.log(
      `final score ${score.total} of ${4 * SCORE_TERM_MAX_POINTS}: ` +
        parts
          .map(
            ([name, term]) =>
              `${name} ${term.points} (${Math.round((term.points / score.total) * 100)} %)`,
          )
          .join(', '),
    );
    console.log(
      `  measured: ${score.goalsAchieved}/${score.goalCount} goals at medal ${score.medal}, ` +
        `value ${Math.round(score.value.measured / CENTS_PER_EURO)} EUR at first-year prices, ` +
        `network ${(score.network.measured * 100).toFixed(1)} % of the ceiling, ` +
        `${Math.round(score.cargo.measured)} units delivered`,
    );
    expect(score.total).toBeGreaterThan(0);
  });

  it('achieves both goals, so the goal term is actually exercised', () => {
    const goals = quarterCentury().world.goals;
    expect(goals.status[0]).toBe(GoalStatus.Achieved);
    expect(goals.status[1]).toBe(GoalStatus.Achieved);
  });

  it('scores a competent quarter century inside the band', () => {
    const score = companyScore(quarterCentury().world);
    expect(score.total).toBeGreaterThanOrEqual(SCORE_MIN);
    expect(score.total).toBeLessThanOrEqual(SCORE_MAX);
  });

  it('keeps the four quarters commensurate - no term dominates, none vanishes', () => {
    const score = companyScore(quarterCentury().world);
    for (const [name, term] of [
      ['goals', score.goals],
      ['value', score.value],
      ['network', score.network],
      ['cargo', score.cargo],
    ] as const) {
      const share = term.points / score.total;
      expect(share, `${name} is ${Math.round(share * 100)} % of the score`).toBeLessThanOrEqual(
        TERM_SHARE_MAX,
      );
      expect(share, `${name} is ${Math.round(share * 100)} % of the score`).toBeGreaterThanOrEqual(
        TERM_SHARE_MIN,
      );
    }
  });

  it('leaves no term saturated, or it would have stopped measuring', () => {
    // A term pinned at its full mark is a term that cannot tell a good run
    // from a great one. The full marks are set so a competent run sits under
    // every one of them.
    const score = companyScore(quarterCentury().world);
    for (const term of [score.value, score.network, score.cargo]) {
      expect(term.share).toBeLessThan(1);
    }
  });

  hashTwin('gameScore', scoredWorld, () => [playQuarterCentury().world]);
});
