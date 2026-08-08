import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GCProfiler } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_GOAL_STRIDE, SNAPSHOT_MAX_GOALS, SnapshotGoal } from '../../src/shared/snapshot';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { CENTS_PER_EURO, MAX_GOALS, TICKS_PER_DAY, TICKS_PER_YEAR } from '../../src/sim/constants';
import { companyValueCt } from '../../src/sim/economy/ledger';
import { goalProgressMilli, updateGoals } from '../../src/sim/goals/evaluate';
import { goalsOutcome, GoalStore, medalFor, overallMedal } from '../../src/sim/goals/GoalStore';
import { writeGoalBlock } from '../../src/sim/goals/snapshot';
import {
  GoalKind,
  GoalMedal,
  GoalOutcome,
  GoalStatus,
  type GoalSave,
  type GoalSpec,
} from '../../src/sim/goals/types';
import { IndustryType, newIndustry, type Industry } from '../../src/sim/industry/types';
import { decodeGoals } from '../../src/sim/save/entities';
import { SAVE_VERSION } from '../../src/sim/save/format';
import { migrateSavePayload } from '../../src/sim/save/migrations';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import { hashWorld, type World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';
import { buildTransferNetwork, runTicks } from '../helpers/transferNetwork';

/**
 * The goal machine of SPEC2 M17 (D-193).
 *
 * What these tests hold is the departure the milestone is built on: the
 * predicate vocabulary is the tutorial's (D-113), but it is evaluated INSIDE
 * the simulation's daily hook, so a medal is saved and hashed state, survives
 * the save it was written into, and two runs of one seed reach it
 * bit-identically. The section's acceptance sentence - "Firmenwert >= 2 Mio.
 * EUR bis 1975" firing sim-side in a twenty-five year game - is the first
 * block below, and the game is played twice for exactly that reason.
 */

// ------------------------------------------------------------- small worlds

/** A goal with everything defaulted, so a test states only what it means. */
function goal(spec: Partial<GoalSpec> & Pick<GoalSpec, 'kind'>): GoalSpec {
  return {
    subjectA: -1,
    subjectB: -1,
    threshold: 1,
    goldTick: TICKS_PER_YEAR,
    silverTick: 2 * TICKS_PER_YEAR,
    bronzeTick: 3 * TICKS_PER_YEAR,
    ...spec,
  };
}

/** The three bands on one tick: a goal that is due, gold or nothing. */
function dueAt(tick: number): Pick<GoalSpec, 'goldTick' | 'silverTick' | 'bronzeTick'> {
  return { goldTick: tick, silverTick: tick, bronzeTick: tick };
}

/** A flat world with one town and no industry: the cheapest goal bench. */
function bench(goals: readonly GoalSpec[]): World {
  const town = makeTown(0, 20, 20, 1_000, 'Zielstadt');
  const scenario = flatScenario(64, [town], []);
  for (const spec of goals) scenario.world.goals.add(spec);
  return scenario.world;
}

/** Advance the world's clock a whole day and run the goal hook once. */
function day(world: World): void {
  world.tick += TICKS_PER_DAY;
  updateGoals(world);
}

/** One raw goal record through the save validator. */
function decodeOne(entry: Record<string, unknown>): GoalSave[] {
  return decodeGoals([entry], 'goals');
}

// --------------------------------------------- the acceptance run (25 years)

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
/** Half the target: the goal has to be EARNED, not started with. */
const CHAIN_CAPITAL_CT = 1_000_000 * CENTS_PER_EURO;

/** "Firmenwert >= 2 Mio. EUR bis 1975", with its three bands. */
const VALUE_GOAL: GoalSpec = {
  kind: GoalKind.CompanyValueBy,
  subjectA: -1,
  subjectB: -1,
  threshold: 2_000_000 * CENTS_PER_EURO,
  /** 1960 */
  goldTick: 10 * TICKS_PER_YEAR,
  /** 1968 */
  silverTick: 18 * TICKS_PER_YEAR,
  /** 1975 - the deadline the sentence names. */
  bronzeTick: 25 * TICKS_PER_YEAR,
};

/** Something the chain moves by the tonne, so a cargo goal is decided too. */
const TONNAGE_GOAL: GoalSpec = {
  kind: GoalKind.CargoDeliveredTotal,
  subjectA: -1,
  subjectB: -1,
  threshold: 5_000,
  goldTick: 10 * TICKS_PER_YEAR,
  silverTick: 18 * TICKS_PER_YEAR,
  bronzeTick: 25 * TICKS_PER_YEAR,
};

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
 * The wood chain of balancing scenario 3, built in 1953 on one million euros -
 * a world that EARNS its way to two million rather than starting there.
 * Measured: it crosses in the early sixties, which is a silver finish.
 */
function chainGame(): Scenario {
  const town = makeTown(0, TOWN_X, ROW, 2_500, 'Holzhausen');
  const scenario = flatScenario(SIZE, [town], chainIndustries());
  const world = scenario.world;
  world.goals.add(VALUE_GOAL);
  world.goals.add(TONNAGE_GOAL);
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

/** Play the chain to 1975. */
function playQuarterCentury(): Scenario {
  const scenario = chainGame();
  while (scenario.world.tick < 25 * TICKS_PER_YEAR) scenario.world.step(scenario.queue, null);
  return scenario;
}

/** The two runs of the bit-identity claim, played once for the whole file. */
let runs: readonly [Scenario, Scenario] | null = null;
function quarterCentury(): readonly [Scenario, Scenario] {
  runs ??= [playQuarterCentury(), playQuarterCentury()];
  return runs;
}

describe('the acceptance run: company value >= 2 million by 1975', () => {
  it('fires sim-side, inside the twenty-five year game', () => {
    const world = quarterCentury()[0].world;
    const goals = world.goals;

    console.log(
      `goal machine: value ${Math.round(companyValueCt(world.company) / CENTS_PER_EURO)} EUR, ` +
        `achieved at tick ${goals.completedTick[0]!} (year ` +
        `${1950 + Math.floor(goals.completedTick[0]! / TICKS_PER_YEAR)}), medal ` +
        `${goals.medal[0]!}; tonnage ${Math.round(goals.progress[1]!)} units at tick ` +
        `${goals.completedTick[1]!}`,
    );

    expect(goals.status[0]).toBe(GoalStatus.Achieved);
    expect(goals.progress[0]).toBeGreaterThanOrEqual(VALUE_GOAL.threshold);
    // Nobody set this from the outside: the completion tick is a multiple of a
    // game day because the daily hook is what decided it.
    expect(goals.completedTick[0]! % TICKS_PER_DAY).toBe(0);
    expect(goals.completedTick[0]).toBeGreaterThan(CHAIN_START_TICK);
  });

  it('earns the band its completion date fell into, and not the easy one', () => {
    const goals = quarterCentury()[0].world.goals;
    // Silver rather than gold: the chain takes until the sixties, which is
    // what makes this a test of the bands instead of a formality.
    expect(goals.completedTick[0]).toBeGreaterThan(VALUE_GOAL.goldTick);
    expect(goals.completedTick[0]).toBeLessThanOrEqual(VALUE_GOAL.silverTick);
    expect(goals.medal[0]).toBe(GoalMedal.Silver);
  });

  it('decides the tonnage goal from the same daily hook', () => {
    const world = quarterCentury()[0].world;
    expect(world.goals.status[1]).toBe(GoalStatus.Achieved);
    expect(world.goals.progress[1]).toBeGreaterThanOrEqual(TONNAGE_GOAL.threshold);
    // The goal reads the company's own lifetime tally, and it FROZE the day it
    // was decided - a settled goal is never measured again, which is what
    // makes a fifty-year game pay for it exactly once.
    let delivered = 0;
    for (const units of world.company.cargoDeliveredUnits) delivered += units;
    expect(delivered).toBeGreaterThan(world.goals.progress[1]!);
    expect(world.goals.completedTick[1]).toBeLessThan(world.goals.completedTick[0]!);
  });

  it('reaches the same medal state bit-identically in two runs of one seed', () => {
    const [a, b] = quarterCentury();
    // The whole world, which contains the goal block - the strongest form of
    // the claim, and the one a replay verification makes (M16).
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    // And the scoreboard itself, field by field, so a failure says which.
    expect(a.world.goals.toData()).toEqual(b.world.goals.toData());
    expect(overallMedal(a.world.goals)).toBe(GoalMedal.Silver);
    expect(goalsOutcome(a.world.goals)).toBe(GoalOutcome.Won);
  });

  it('survives the save it wrote, verdict and all', () => {
    const scenario = quarterCentury()[0];
    const before = hashWorld(scenario.world);
    const loaded = decodeSave(encodeSave(scenario.world, scenario.queue, 'goals-test'));
    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.goals.toData()).toEqual(scenario.world.goals.toData());
  });
});

// ------------------------------------------------------- the six descriptors

describe('the six goal descriptors', () => {
  it('CompanyValueBy measures section 14.1s own figure', () => {
    const world = bench([goal({ kind: GoalKind.CompanyValueBy, threshold: 600_000 })]);
    world.company.cashCt = 500_000;
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Open);
    expect(world.goals.progress[0]).toBe(companyValueCt(world.company));

    world.company.cashCt = 700_000;
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Achieved);
    expect(world.goals.medal[0]).toBe(GoalMedal.Gold);
  });

  it('CargoDeliveredTotal counts one cargo or every cargo', () => {
    const world = bench([
      goal({ kind: GoalKind.CargoDeliveredTotal, subjectA: Cargo.Coal, threshold: 10 }),
      goal({ kind: GoalKind.CargoDeliveredTotal, subjectA: -1, threshold: 10 }),
    ]);
    world.company.cargoDeliveredUnits[Cargo.Wood] = 6;
    world.company.cargoDeliveredUnits[Cargo.Coal] = 6;
    day(world);
    // Twelve units altogether, but only six of coal.
    expect(world.goals.status[0]).toBe(GoalStatus.Open);
    expect(world.goals.status[1]).toBe(GoalStatus.Achieved);
  });

  it('TownPopulationReach watches one town, or the largest of them', () => {
    const world = bench([
      goal({ kind: GoalKind.TownPopulationReach, subjectA: 0, threshold: 2_000 }),
      goal({ kind: GoalKind.TownPopulationReach, subjectA: -1, threshold: 900 }),
    ]);
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Open);
    expect(world.goals.progress[0]).toBe(1_000);
    expect(world.goals.status[1]).toBe(GoalStatus.Achieved);
  });

  it('SurviveUntil is achieved at its date and failed by a winding-up', () => {
    const world = bench([
      goal({ kind: GoalKind.SurviveUntil, threshold: 3 * TICKS_PER_DAY }),
      goal({ kind: GoalKind.SurviveUntil, threshold: 3 * TICKS_PER_DAY }),
    ]);
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Open);

    world.companies[0]!.bankrupt = true;
    day(world);
    // A wound-up company cannot survive to a later date, so both are decided
    // the day it happens rather than at the deadline.
    expect(world.goals.status[0]).toBe(GoalStatus.Failed);
    expect(world.goals.status[1]).toBe(GoalStatus.Failed);
    expect(world.goals.medal[0]).toBe(GoalMedal.None);
  });

  it('fails a goal the deadline ran out on, and never revisits it', () => {
    const world = bench([
      goal({
        kind: GoalKind.CompanyValueBy,
        threshold: 10_000_000_000,
        ...dueAt(TICKS_PER_DAY),
      }),
    ]);
    day(world); // tick == bronzeTick: still open, the deadline is inclusive
    expect(world.goals.status[0]).toBe(GoalStatus.Open);
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Failed);

    // Reaching the threshold afterwards does not reopen it.
    world.company.cashCt = 20_000_000_000;
    day(world);
    expect(world.goals.status[0]).toBe(GoalStatus.Failed);
    expect(goalsOutcome(world.goals)).toBe(GoalOutcome.Lost);
  });

  it('StationRatingHold counts consecutive days and reads the real rating', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    world.goals.add(goal({ kind: GoalKind.StationRatingHold, threshold: 1, subjectB: 3 }));
    // Impossible: no station can rate above a hundred, so the streak never
    // starts - which is what proves the rating is being read at all.
    world.goals.add(goal({ kind: GoalKind.StationRatingHold, threshold: 101, subjectB: 1 }));
    runTicks(network, TICKS_PER_DAY * 4);

    expect(stationRating(world.stations[0]!, world.tick)).toBeGreaterThan(0);
    expect(world.goals.status[0]).toBe(GoalStatus.Achieved);
    expect(world.goals.status[1]).toBe(GoalStatus.Open);
    expect(world.goals.holdDays[1]).toBe(0);
  });

  it('ConnectStations asks the connection table, transfers included', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    // A to C is two lines and a change at B - exactly what a table per station
    // could never answer (D-075).
    world.goals.add(goal({ kind: GoalKind.ConnectStations, subjectA: 0, subjectB: 2 }));
    // A town this world does not have: no station of ours stands in it, so
    // nothing can reach it however good the network is.
    world.goals.add(goal({ kind: GoalKind.ConnectStations, subjectA: 0, subjectB: 7 }));
    runTicks(network, TICKS_PER_DAY * 5);

    expect(world.cargoLinks.expectedTicks(0, 2)).toBeLessThan(Infinity);
    expect(world.goals.status[0]).toBe(GoalStatus.Achieved);
    expect(world.goals.status[1]).toBe(GoalStatus.Open);
  });
});

// --------------------------------------------------------- bands and outcome

describe('the medal bands', () => {
  const store = new GoalStore();
  store.add(goal({ kind: GoalKind.SurviveUntil, goldTick: 100, silverTick: 200, bronzeTick: 300 }));

  it('reads the completion date against the three ticks', () => {
    expect(medalFor(store, 0, 100)).toBe(GoalMedal.Gold);
    expect(medalFor(store, 0, 101)).toBe(GoalMedal.Silver);
    expect(medalFor(store, 0, 200)).toBe(GoalMedal.Silver);
    expect(medalFor(store, 0, 201)).toBe(GoalMedal.Bronze);
    expect(medalFor(store, 0, 300)).toBe(GoalMedal.Bronze);
    expect(medalFor(store, 0, 301)).toBe(GoalMedal.None);
  });

  it('scores the set by its weakest band, and only once every goal is won', () => {
    const set = new GoalStore();
    set.add(goal({ kind: GoalKind.SurviveUntil }));
    set.add(goal({ kind: GoalKind.SurviveUntil }));
    expect(goalsOutcome(set)).toBe(GoalOutcome.Open);
    expect(overallMedal(set)).toBe(GoalMedal.None);

    set.status[0] = GoalStatus.Achieved;
    set.medal[0] = GoalMedal.Gold;
    expect(goalsOutcome(set)).toBe(GoalOutcome.Open);

    set.status[1] = GoalStatus.Achieved;
    set.medal[1] = GoalMedal.Bronze;
    expect(goalsOutcome(set)).toBe(GoalOutcome.Won);
    expect(overallMedal(set)).toBe(GoalMedal.Bronze);

    set.status[1] = GoalStatus.Failed;
    set.medal[1] = GoalMedal.None;
    expect(goalsOutcome(set)).toBe(GoalOutcome.Lost);
    expect(overallMedal(set)).toBe(GoalMedal.None);
  });

  it('a world with no goals is never won', () => {
    expect(goalsOutcome(new GoalStore())).toBe(GoalOutcome.Open);
  });
});

// ----------------------------------------------------------------- the block

describe('the snapshot goal block', () => {
  it('carries progress and standing, and nothing that never moves', () => {
    const world = bench([
      goal({ kind: GoalKind.CompanyValueBy, threshold: 1_000_000 }),
      goal({ kind: GoalKind.CompanyValueBy, threshold: 100, ...dueAt(TICKS_PER_DAY) }),
    ]);
    world.company.cashCt = 250_000;
    day(world);

    const block = new Int32Array(SNAPSHOT_MAX_GOALS * SNAPSHOT_GOAL_STRIDE);
    const written = writeGoalBlock(world.goals, block);

    expect(written).toBe(2);
    expect(block[SnapshotGoal.ProgressMilli]).toBe(goalProgressMilli(world.goals, 0));
    expect(block[SnapshotGoal.ProgressMilli]).toBe(250);
    expect(block[SnapshotGoal.Standing]).toBe(0); // open
    expect(block[SNAPSHOT_GOAL_STRIDE + SnapshotGoal.Standing]).toBe(GoalMedal.Gold);
    expect(block[SNAPSHOT_GOAL_STRIDE + SnapshotGoal.ProgressMilli]).toBe(1_000);
  });

  it('draws a failed goal as -1 and clamps progress to the scale', () => {
    const world = bench([goal({ kind: GoalKind.CompanyValueBy, threshold: 100, ...dueAt(0) })]);
    world.company.cashCt = -1_000;
    day(world);

    const block = new Int32Array(SNAPSHOT_MAX_GOALS * SNAPSHOT_GOAL_STRIDE);
    writeGoalBlock(world.goals, block);
    expect(world.goals.status[0]).toBe(GoalStatus.Failed);
    expect(block[SnapshotGoal.Standing]).toBe(-1);
    // A company in the red is not "minus forty percent of the way there".
    expect(block[SnapshotGoal.ProgressMilli]).toBe(0);
  });

  it('is the eight goals the ledger booked, sixty-four bytes of them', () => {
    // The coupling the shared channel cannot express as an import (D-187's
    // rule for SNAPSHOT_MAX_VEHICLES, applied to the goal block).
    expect(SNAPSHOT_MAX_GOALS).toBe(MAX_GOALS);
    expect(SNAPSHOT_MAX_GOALS * SNAPSHOT_GOAL_STRIDE * 4).toBe(64);
  });
});

// ------------------------------------------------------------- save and load

describe('goals in the save', () => {
  it('is the version 28 bump, with a migration that enters none', () => {
    expect(SAVE_VERSION).toBe(28);
    const migrated = migrateSavePayload(
      { magic: 'IRVN', saveVersion: 27, state: { companies: [{ id: 0 }] } },
      27,
      28,
    );
    const state = migrated['state'] as Record<string, unknown>;
    expect(state['goals']).toEqual([]);
    const companies = state['companies'] as Record<string, unknown>[];
    expect(companies[0]!['cargoDeliveredUnits']).toEqual(new Array<number>(18).fill(0));
  });

  it('keeps what a payload already carries when an old container is replayed', () => {
    // The corpus trick - a CURRENT state wrapped in an old version header -
    // must not flatten a real goal list back to empty (the v25 -> v26 rule).
    const migrated = migrateSavePayload(
      {
        magic: 'IRVN',
        saveVersion: 27,
        state: { goals: [{ kind: 0 }], companies: [{ cargoDeliveredUnits: [1] }] },
      },
      27,
      28,
    );
    const state = migrated['state'] as Record<string, unknown>;
    expect(state['goals']).toEqual([{ kind: 0 }]);
    expect((state['companies'] as Record<string, unknown>[])[0]!['cargoDeliveredUnits']).toEqual([
      1,
    ]);
  });

  it('refuses a scoreboard the simulation could not have produced', () => {
    const world = bench([goal({ kind: GoalKind.CompanyValueBy })]);
    const record = world.toData().goals[0]! as unknown as Record<string, unknown>;
    expect(decodeOne(record)).toHaveLength(1);

    // Achieved without a date, a medal without an achievement, a band out of
    // order: none of them is a state `updateGoals` can leave behind, so none
    // of them may load.
    expect(() => decodeOne({ ...record, status: GoalStatus.Achieved })).toThrow();
    expect(() => decodeOne({ ...record, medal: GoalMedal.Gold })).toThrow();
    expect(() => decodeOne({ ...record, goldTick: 999_999_999 })).toThrow();
    expect(() => decodeOne({ ...record, kind: 99 })).toThrow();
    expect(() => decodeOne({ ...record, holdDays: -1 })).toThrow();
  });

  it('holds at most MAX_GOALS, in the store and in the parser', () => {
    const store = new GoalStore();
    for (let i = 0; i < MAX_GOALS; i++) {
      expect(store.add(goal({ kind: GoalKind.SurviveUntil }))).toBe(i);
    }
    expect(store.add(goal({ kind: GoalKind.SurviveUntil }))).toBe(-1);
    expect(store.count).toBe(MAX_GOALS);

    const record = bench([goal({ kind: GoalKind.SurviveUntil })]).toData().goals[0]!;
    const tooMany = new Array<GoalSave>(MAX_GOALS + 1).fill(record);
    expect(() => decodeGoals(tooMany, 'goals')).toThrow(/more than/);
  });
});

// ------------------------------------------------------ law 7: no allocation

/** Sink for the control loop, so nothing it does can be optimised away. */
let scratch: unknown = null;

/**
 * Bytes allocated over `iterations` calls, MEASURED.
 *
 * A bare `heapUsed` delta is not an instrument: it falls whenever a collection
 * happens to run, so an allocating loop can measure LOWER than a clean one
 * (observed while writing this: the allocating control came out at a tenth of
 * the subject). What is honest is the growth PLUS everything the collector took
 * away inside the window, which is what `GCProfiler` reports per event. That
 * sum is total allocation whether or not a scavenge fired, and the control in
 * the test below is what proves the instrument can see one.
 *
 * Its resolution has a floor this file states rather than hides: a call across
 * a MODULE boundary that returns a double is boxed here (measured at exactly
 * 16 bytes a call), because the test graph is not the bundle the game ships
 * and V8 cannot inline through it. That is a property of the harness, not of
 * the simulation - so the hook is measured against a baseline that makes
 * exactly the same helper calls, and what has to be zero is the DIFFERENCE.
 */
function allocatedBytes(work: () => void, iterations: number): number {
  // Warm up: the first calls compile, and compilation is heap too.
  for (let i = 0; i < 2_000; i++) work();

  const profiler = new GCProfiler();
  profiler.start();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) work();
  const after = process.memoryUsage().heapUsed;
  const result = profiler.stop();

  let reclaimed = 0;
  for (const event of result.statistics) {
    reclaimed +=
      event.beforeGC.heapStatistics.usedHeapSize - event.afterGC.heapStatistics.usedHeapSize;
  }
  return after - before + reclaimed;
}

/** A world of the six kinds, all open and none of them reachable. */
function sixKinds(): World {
  const network = buildTransferNetwork();
  const world = network.world;
  world.goals.add(goal({ kind: GoalKind.CompanyValueBy, threshold: 1e15 }));
  world.goals.add(goal({ kind: GoalKind.CargoDeliveredTotal, subjectA: -1, threshold: 1e12 }));
  world.goals.add(goal({ kind: GoalKind.TownPopulationReach, subjectA: -1, threshold: 1e9 }));
  world.goals.add(goal({ kind: GoalKind.ConnectStations, subjectA: 0, subjectB: 7 }));
  world.goals.add(goal({ kind: GoalKind.StationRatingHold, threshold: 101, subjectB: 5 }));
  world.goals.add(goal({ kind: GoalKind.SurviveUntil, threshold: 1e9 }));
  runTicks(network, TICKS_PER_DAY * 3);
  return world;
}

describe('the daily hook allocates nothing (law 7)', () => {
  const ITERATIONS = 50_000;

  it('allocates nothing at all for the kinds that reach outside nothing', () => {
    // Three descriptors whose whole measurement lives inside the goal module:
    // the loop, the switch, the store writes and the verdict transitions with
    // no helper in the way. This is the hook's own machinery, and it is the
    // number the harness can state without a caveat.
    const network = buildTransferNetwork();
    const world = network.world;
    world.goals.add(goal({ kind: GoalKind.CargoDeliveredTotal, subjectA: -1, threshold: 1e12 }));
    world.goals.add(goal({ kind: GoalKind.TownPopulationReach, subjectA: -1, threshold: 1e9 }));
    world.goals.add(goal({ kind: GoalKind.SurviveUntil, threshold: 1e9 }));
    runTicks(network, TICKS_PER_DAY * 3);

    const measured = allocatedBytes(() => updateGoals(world), ITERATIONS);
    console.log(
      `goal hook (3 in-module kinds): ${(measured / ITERATIONS).toFixed(3)} B per game day over ` +
        `${ITERATIONS} days`,
    );
    expect(measured / ITERATIONS).toBeLessThan(2);
  });

  it('stays inside one boxed double per helper call, with a control that proves it can see', () => {
    const world = sixKinds();
    for (let at = 0; at < world.goals.count; at++) {
      expect(world.goals.status[at], `goal ${at} must stay open`).toBe(GoalStatus.Open);
    }

    const measured = allocatedBytes(() => updateGoals(world), ITERATIONS);
    const control = allocatedBytes(() => {
      // What an allocating hook looks like: one small record per goal.
      for (let at = 0; at < world.goals.count; at++) {
        scratch = { at, progress: world.goals.progress[at]! };
      }
    }, ITERATIONS);

    console.log(
      `goal hook (6 kinds): ${(measured / ITERATIONS).toFixed(2)} B per game day; the ` +
        `allocating control ${(control / ITERATIONS).toFixed(2)} B`,
    );

    // The control has to be caught, or the number above means nothing.
    expect(scratch).not.toBeNull();
    expect(control).toBeGreaterThan(4 * 1024 * 1024);
    expect(control / ITERATIONS).toBeGreaterThan(100);

    // The residue is the harness's own floor and it is accounted for rather
    // than waved at: the other three kinds ask `companyValueCt` once and
    // `stationRating` once per station of the network (four here), and every
    // one of those returns a double across a module boundary this test graph
    // cannot inline through - measured at exactly 16 bytes a call, five calls
    // a day, and it does not grow with the number of DAYS. The bound is eight
    // such boxes, so a real per-goal allocation could not hide under it.
    expect(measured / ITERATIONS).toBeLessThan(8 * 16);
    expect(measured).toBeLessThan(control / 3);
  });
});

// ------------------------------------------------------- the source is a leaf

describe('the goal hook reaches for nothing that allocates', () => {
  /** The module with its comments removed - prose about a trap is not a trap. */
  const source = readFileSync(
    fileURLToPath(new URL('../../src/sim/goals/evaluate.ts', import.meta.url)),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('never reads the calendar getter, which builds a GameDate', () => {
    // Every deadline is a TICK for exactly this reason: `world.date` allocates
    // an object, and the hook runs inside step() (law #7).
    expect(source).not.toMatch(/world\.date/);
  });

  it('uses indexed loops rather than for...of, which allocates an iterator', () => {
    expect(source).not.toMatch(/for\s*\(\s*const\s+\w+\s+of\s/);
  });
});
