import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { CENTS_PER_EURO, SCORE_TERM_MAX_POINTS, TICKS_PER_YEAR } from '../../src/sim/constants';
import { companyNetworkValue } from '../../src/sim/economy/networkValue';
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
/**
 * 1978 - twenty-five game years after the chain starts, every one simulated.
 *
 * This was `25 * TICKS_PER_YEAR` until the M17 acceptance pass, so a run that
 * began in 1953 played twenty-two years while every sentence around it said a
 * quarter century (D-197). The chain cannot start earlier: crewing only the
 * 1950 wood haul and waiting for the box lorry shuts the sawmill under the
 * 24-month closure clock of D-086.
 */
const HORIZON_TICKS = CHAIN_START_TICK + 25 * TICKS_PER_YEAR;
/**
 * How far north the botched alignment doglegs between two stops. [tiles]
 *
 * Sixteen up and sixteen down turns each thirty-tile leg into sixty-two, on
 * the same fleet, between the same stops, over the same paid distance - so the
 * ceiling is untouched and only the number of round trips falls. That is
 * exactly SPEC.md section 1's promise stated as a control.
 */
const DETOUR_TILES = 16;

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

/**
 * Where the botched alignment comes back down to the row before the town.
 *
 * Not at the town stop itself: `placeTown` puts houses on the whole column
 * either side of the town centre, and a road may not be laid through a
 * building - so the dogleg descends clear of the built-up area and runs the
 * last few tiles along the row.
 */
const TOWN_APPROACH_X = TOWN_X - 8;
/** The columns the doglegs climb, in the order the chain runs through them. */
const DETOUR_XS = [FOREST_X, SAWMILL_X, FURNITURE_X, TOWN_APPROACH_X];

/**
 * Lay the road: straight down the row, or the same stops joined by doglegs.
 *
 * The botched version is the ONLY difference between the two runs of this file
 * - same map, same industries, same stops, same twelve lorries bought on the
 * same day with the same orders. What changes is how far a lorry has to drive
 * between two stops that are the same distance apart on the map.
 */
function layRoad(scenario: Scenario, detour: boolean): void {
  if (!detour) {
    apply(scenario, {
      kind: CommandKind.BuildRoad,
      x1: FOREST_X - 3,
      y1: ROW,
      x2: TOWN_X,
      y2: ROW,
    });
    return;
  }
  const north = ROW - DETOUR_TILES;
  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: FOREST_X - 3,
    y1: ROW,
    x2: FOREST_X,
    y2: ROW,
  });
  for (const x of DETOUR_XS) {
    apply(scenario, { kind: CommandKind.BuildRoad, x1: x, y1: ROW, x2: x, y2: north });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: FOREST_X,
    y1: north,
    x2: TOWN_APPROACH_X,
    y2: north,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: TOWN_APPROACH_X,
    y1: ROW,
    x2: TOWN_X - 1,
    y2: ROW,
  });
}

/** The company: a whole chain, built once and then run. */
function chainRun(detour: boolean): Scenario {
  const town = makeTown(0, TOWN_X, ROW, 2_500, 'Punktstadt');
  const scenario = flatScenario(SIZE, [town], chainIndustries());
  const world = scenario.world;
  for (const spec of GOALS) world.goals.add(spec);
  world.company.cashCt = CHAIN_CAPITAL_CT;
  world.tick = CHAIN_START_TICK;

  layRoad(scenario, detour);
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

function playQuarterCentury(detour = false): Scenario {
  const scenario = chainRun(detour);
  while (scenario.world.tick < HORIZON_TICKS) scenario.world.step(scenario.queue, null);
  return scenario;
}

/** Played once for the whole file; the twin builds its own. */
let played: Scenario | null = null;
function quarterCentury(): Scenario {
  played ??= playQuarterCentury();
  return played;
}

/** The same chain on a botched alignment - the control of the network term. */
let botched: Scenario | null = null;
function botchedCentury(): Scenario {
  botched ??= playQuarterCentury(true);
  return botched;
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

/**
 * The network term, held against something it was NOT derived from (D-197).
 *
 * **What is calibration here, and therefore proves nothing.**
 * `SCORE_NETWORK_FULL_SHARE` (0.35) was set FROM this very run: the competent
 * chain reaches 20.1 % of D-066's closed-form ceiling, and the constant is that
 * figure with headroom for a network that also earns on the return leg. So
 * "the competent run reaches 57 % of the full mark" is arithmetic on the
 * constant's own derivation, and the band above - total in range, no term over
 * 45 % or under 5 % - is satisfied by construction for this one term. A
 * self-fulfilling measurement is not evidence, however green it is.
 *
 * **What is evidence.** Everything below runs a SECOND quarter century that had
 * no part in setting any constant: the same map, the same industries, the same
 * stops, the same twelve lorries bought on the same day with the same orders,
 * and one difference - the road between the stops doglegs sixteen tiles north
 * and back, so every leg is sixty-two tiles of driving instead of thirty over
 * an unchanged PAID distance. That makes the ceiling (capacity x tariff x top
 * speed x years, D-187) identical by construction and puts the whole difference
 * in the numerator, which is the property the network value exists to have.
 *
 * None of the three assertions follows from the constant's derivation:
 *
 *  - the botched share is a number nobody put into 0.35;
 *  - the RATIO between the two shares is independent of the full mark entirely
 *    (it would be the same for any value of the constant);
 *  - "neither run saturates" is a statement about two structurally different
 *    runs, and the second one is the one the constant knows nothing about.
 */
describe('the network term measures the network, not the constant it came from', () => {
  it('reports both runs, so the comparison can be read', () => {
    const good = companyNetworkValue(quarterCentury().world, 0);
    const bad = companyNetworkValue(botchedCentury().world, 0);
    console.log(
      `network value: straight alignment ${(good.share * 100).toFixed(1)} % of the ceiling, ` +
        `dogleg ${(bad.share * 100).toFixed(1)} % - factor ${(good.share / bad.share).toFixed(2)}; ` +
        `score term ${companyScore(quarterCentury().world).network.points} against ` +
        `${companyScore(botchedCentury().world).network.points} points`,
    );
    expect(bad.share).toBeGreaterThan(0);
  });

  it('gives both runs the same ceiling, which is what makes them comparable', () => {
    // If this drifts the comparison below is measuring two fleets rather than
    // two networks, and the whole control is void - so it is asserted, not
    // assumed. Vehicles age identically in both runs (same build tick, same
    // horizon), so the only way it moves is a lorry dying in one and not the
    // other.
    const good = companyNetworkValue(quarterCentury().world, 0);
    const bad = companyNetworkValue(botchedCentury().world, 0);
    expect(bad.ceilingCt / good.ceilingCt).toBeGreaterThan(0.99);
    expect(bad.ceilingCt / good.ceilingCt).toBeLessThan(1.01);
  });

  it('scores the botched alignment materially lower on the identical fleet', () => {
    const good = companyNetworkValue(quarterCentury().world, 0);
    const bad = companyNetworkValue(botchedCentury().world, 0);
    // Twice the driving for the same paid distance should cost roughly half
    // the trips; the band is deliberately loose because what is being held is
    // that the term DISCRIMINATES, not by how much.
    expect(bad.share).toBeLessThan(good.share * 0.75);
    expect(bad.share).toBeGreaterThan(good.share * 0.2);
    // And it has to reach the SCORE, not stop at the share: a term that moves
    // by less than a point is a term the end screen cannot show.
    const goodPoints = companyScore(quarterCentury().world).network.points;
    const badPoints = companyScore(botchedCentury().world).network.points;
    expect(goodPoints - badPoints).toBeGreaterThan(SCORE_TERM_MAX_POINTS * 0.1);
  });

  it('does not saturate on either of the two runs', () => {
    // The competent run staying under the full mark is calibration. The second
    // one staying under it - and well above zero - is the part that says the
    // term still has range on a network it was never fitted to.
    for (const world of [quarterCentury().world, botchedCentury().world]) {
      const share = companyScore(world).network.share;
      expect(share).toBeGreaterThan(0.05);
      expect(share).toBeLessThan(1);
    }
  });
});
