import { describe, expect, it } from 'vitest';
import { enqueueInfrastructure } from '../../src/sim/ai/build';
import { Personality } from '../../src/sim/ai/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { AI_DECISION_INTERVAL_TICKS, LOAN_MIN_LIMIT_CT } from '../../src/sim/constants';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import { ModuleKind } from '../../src/sim/station/types';
import { flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * **A competitor does not start a project it cannot finish** (D-228).
 *
 * Two halves of one rule, and the AI had neither.
 *
 * The estimate quoted a STRAIGHT-LINE way and a FIXED number of stops whatever
 * the plan really was, while the builder lays the alignment the assistant found
 * and the stops the shape it chose needs. That is D-219's lesson about money: a
 * filter and the builder it filters for must not disagree about what is being
 * built. Measured on seed 4711's rail company, a pair 72 tiles apart is laid as
 * 119 tiles of track - the way alone was under-quoted by a third.
 *
 * And `takeLoan` borrowed whatever the credit line had ROOM for and reported
 * success either way, so a company whose project cost more than its cash plus
 * its whole credit line took a part loan, laid the way, built the stops,
 * ordered its fleet - and was refused it for want of funds. Seed 4711's rail
 * company ended owning 119 tiles of railway, one of the two trains it needed
 * and the interest, and was wound up.
 */

const SIZE = 128;
const MINE = { x: 12, y: 40 };
const PLANT = { x: 112, y: 40 };

/**
 * Decision cycles played. A competitor waits AI_RETRY_TICKS - a game month, 15
 * cycles - before its FIRST scan, and a line is then built over four more
 * (D-108), so anything under about twenty cycles measures the wait rather than
 * the decision.
 */
const CYCLES = 40;

/**
 * Credit the short company has left. Ten whole loan steps - comfortably more
 * than the LOAN_STEP_CT floor `takeLoan` refuses below, so what stops the build
 * is the RULE and not an empty credit line.
 */
const ROOM_CT = 100_000 * 100;

/**
 * A coal mine, a power station a hundred tiles away and one competitor - the
 * smallest world whose decision cycle plans a line at all. What it picks is a
 * ROAD (D-222: on a generated economy the industry pairs that pay by rail are
 * a subset of those that pay by road), and that is deliberate: the rule under
 * test is about a PROJECT, not about a mode.
 */
function bench(cashCt: number, loanCt = 0): Scenario {
  const scenario = flatScenario(
    SIZE,
    [makeTown(0, 20, 20, 400, 'Kohlstadt')],
    [
      newIndustry(0, IndustryType.CoalMine, MINE.x, MINE.y, 0),
      newIndustry(1, IndustryType.PowerPlant, PLANT.x, PLANT.y, 0),
    ],
    9,
    1,
  );
  const state = scenario.world.ai[0]!;
  // The draw is a pure function of the seed, so the bench states what it got
  // rather than writing it: seed 9 hands this world the rail personality, and
  // if the roster ever changes that is a loud failure rather than a quiet one.
  expect(state.personality).toBe(Personality.Rail);
  const company = scenario.world.companyOf(state.companyId);
  company.cashCt = cashCt;
  // A company that has already drawn most of its credit line. It is the only
  // way to put a REAL borrowing ceiling under a competitor on a bench: the
  // credit line is floored at LOAN_MIN_LIMIT_CT and cannot be made smaller,
  // and a project on a world this small never costs more than that on its own.
  company.loanCt = loanCt;
  return scenario;
}

/** Play a few decision cycles and report what the competitor got accepted. */
function ordered(scenario: Scenario, cycles: number): Map<number, number> {
  const counts = new Map<number, number>();
  const sink = (
    envelope: { readonly command: { readonly kind: number } },
    outcome: { readonly ok: boolean },
  ): void => {
    if (!outcome.ok) return;
    counts.set(envelope.command.kind, (counts.get(envelope.command.kind) ?? 0) + 1);
  };
  for (let tick = 0; tick < cycles * AI_DECISION_INTERVAL_TICKS; tick++) {
    scenario.world.step(scenario.queue, sink);
  }
  return counts;
}

/** What the company has sunk into the ground and into its fleet. [cent] */
function outlayCt(scenario: Scenario): number {
  return scenario.world.companyOf(scenario.world.ai[0]!.companyId).fixedAssetsCt;
}

describe('a competitor does not start a project it cannot finish', () => {
  it('prices the plan the builder really orders, way and stops alike', () => {
    // The two numbers the estimate is built from are the PLAN'S own: the stop
    // count is the number of stops the plan enqueued, and the way price is the
    // planner's price for the alignment it enqueued rather than for a straight
    // line. A railway is the shape where the two can differ, so a railway is
    // what is asked here even though the decision cycle below picks a road.
    const scenario = bench(50_000_000_00);
    const queue = new CommandQueue();
    const built = enqueueInfrastructure(queue, scenario.world, scenario.world.ai[0]!.companyId, {
      from: MINE,
      to: PLANT,
      depot: { x: MINE.x, y: MINE.y + 1 },
      rail: true,
    })!;

    let platforms = 0;
    for (const envelope of queue.log) {
      const command = envelope.command;
      if (
        command.kind === CommandKind.BuildRailStop &&
        command.moduleKind === ModuleKind.RailPlatform
      ) {
        platforms++;
      }
    }
    expect(platforms).toBeGreaterThan(0);
    expect(built.platformTiles).toBe(platforms);
    expect(built.wayCostCt).toBeGreaterThan(0);
  });

  it('builds and crews the line when it can pay for the whole of it', () => {
    const scenario = bench(50_000_000_00);
    const counts = ordered(scenario, CYCLES);
    expect(counts.get(CommandKind.BuildRoad) ?? 0, 'laid its way').toBeGreaterThan(0);
    expect(counts.get(CommandKind.BuyRoadVehicle) ?? 0, 'crewed it').toBeGreaterThan(0);
    expect(outlayCt(scenario)).toBeGreaterThan(0);
  });

  it('lays nothing and borrows nothing when cash plus the whole credit line is short', () => {
    // The bar is the REAL outlay of the same project on the same world rather
    // than a figure typed in here: the company is left a quarter of it, and
    // the credit line every company has is smaller than the rest. On the old
    // code `takeLoan` drew that line anyway and reported success, and the
    // company built as much of the project as the money reached.
    const rich = bench(50_000_000_00);
    ordered(rich, CYCLES);
    const spentCt = outlayCt(rich);
    expect(spentCt).toBeGreaterThan(0);

    // A quarter of the bill in the bank and a credit line already drawn down
    // to ROOM_CT of room: cash plus everything it could still borrow is under
    // half of what the project costs, and there is no arrangement of the two
    // that finishes it.
    const cashCt = Math.floor(spentCt / 4);
    expect(cashCt + ROOM_CT).toBeLessThan(spentCt);

    const counts = ordered(bench(cashCt, LOAN_MIN_LIMIT_CT - ROOM_CT), CYCLES);
    expect(counts.get(CommandKind.TakeLoan) ?? 0, 'borrowed for a project it cannot finish').toBe(
      0,
    );
    expect(counts.get(CommandKind.BuildRoad) ?? 0, 'laid a way it cannot crew').toBe(0);
    expect(counts.get(CommandKind.BuildRoadStop) ?? 0, 'built stops it cannot crew').toBe(0);
  });
});
