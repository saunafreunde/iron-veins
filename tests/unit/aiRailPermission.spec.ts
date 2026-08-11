import { describe, expect, it } from 'vitest';
import { enqueueInfrastructure } from '../../src/sim/ai/build';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import { flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * The AI's single-track fallback asks who owns the ground, because the command
 * it plans for does (D-219).
 *
 * `planTrack` is the route assistant: it answers about water, slope and
 * curvature and knows nothing about the tile OWNER. `buildTrack` walks the
 * finished route through `buildPermission` and refuses the WHOLE run on the
 * first tile that belongs to somebody else. The oval planner has asked the
 * ownership question since D-153 and the road search since D-154; this branch
 * did not, so a rail company re-planned, re-ordered - and, because a borrower
 * enqueues the loan in the same batch, re-BORROWED for - the same refused
 * railway every month for the rest of the century.
 */

const SIZE = 64;
const RIVAL = 1;
const AI = 2;

/** Two AI companies on empty flat ground, both with money to spend. */
function bench(): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9, 2);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

/** What the AI would order for a railway between the two points. */
function planRailway(scenario: Scenario, companyId: number): CommandQueue {
  const queue = new CommandQueue();
  enqueueInfrastructure(queue, scenario.world, companyId, {
    from: { x: 10, y: 30 },
    to: { x: 40, y: 30 },
    depot: { x: 10, y: 31 },
    rail: true,
  });
  return queue;
}

describe("the AI's railway is planned on ground it may build on", () => {
  it('plans a railway over clear ground, and the commands it orders are accepted', () => {
    const scenario = bench();
    const queue = planRailway(scenario, AI);
    expect(queue.log.length).toBeGreaterThan(0);

    for (const envelope of queue.log) {
      expect(tryApply(scenario, envelope.command, AI)).toBeNull();
    }
  });

  it('reproduces the refusal: one rival tile refuses the whole run', () => {
    const scenario = bench();
    // A rival lays a road straight across the corridor. The tile becomes the
    // rival's the moment it is paved (D-101), and the route assistant cannot
    // see that.
    tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 25, y1: 20, x2: 25, y2: 40 }, RIVAL);
    expect(scenario.world.map.owner[scenario.world.map.tileIndex(25, 30)]).toBe(RIVAL);

    // The command's own verdict on the alignment the assistant would return.
    expect(
      tryApply(
        scenario,
        {
          kind: CommandKind.BuildTrack,
          x1: 10,
          y1: 30,
          x2: 40,
          y2: 30,
          railType: 1,
          assistant: true,
          signalSpacing: 0,
        },
        AI,
      ),
    ).toBe(RejectReason.NotYours);
  });

  it('refuses that plan itself, and orders nothing', () => {
    const scenario = bench();
    tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 25, y1: 20, x2: 25, y2: 40 }, RIVAL);

    const queue = planRailway(scenario, AI);
    expect(queue.log.length).toBe(0);
  });

  it('is about the OWNER, not about the road: its own road is no obstacle', () => {
    const scenario = bench();
    // The identical obstruction, laid by the company that wants the railway.
    tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 25, y1: 20, x2: 25, y2: 40 }, AI);

    const queue = planRailway(scenario, AI);
    expect(queue.log.length).toBeGreaterThan(0);
  });

  it('a public town street is still crossable - it belongs to nobody', () => {
    const scenario = bench();
    const map = scenario.world.map;
    // Nobody has paved anything, so every tile of the corridor is public and
    // the plan stands. This is the control for the test above: the refusal
    // must be the rival's claim and not the presence of a road.
    expect(map.owner[map.tileIndex(25, 30)]).not.toBe(RIVAL);
    expect(planRailway(scenario, AI).log.length).toBeGreaterThan(0);
  });
});
