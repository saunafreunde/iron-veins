import { describe, expect, it } from 'vitest';
import { enqueueInfrastructure } from '../../src/sim/ai/build';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import { AI_RAIL_MAX_TRAINS } from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * **A railway is planned onto tiles that can still take its platforms and its
 * shed** (D-230).
 *
 * `buildTrack` lays rails straight through a tile a station module stands on -
 * a level crossing is a legal thing - and `buildRailStop` refuses that same
 * tile `cmd.reject.occupied`. The AI's rail planner asked neither question: it
 * validated the alignment for ownership (D-219) and for bare ground, and the
 * first tile of the assistant's route is where `enqueueSingleTrack` puts the
 * ENGINE SHED.
 *
 * So a competitor that planned a railway starting on its own lorry bay laid
 * the whole line, had four platforms accepted, was refused its depot, and the
 * next cycle ordered a train at a shed that does not exist -
 * `BuyTrain|cmd.reject.needsRailDepot`. Measured on seeds 4714 and 555777 of
 * the sixteen-seed sweep: seed 4714, company 2, 28 February 1955, sixty-two
 * tiles of track and four platforms bought and never crewed.
 *
 * The tests below pin the asymmetry that causes it, both branches of the
 * builder, and the control that an ordinary railway is still planned.
 */

const SIZE = 64;
const AI = 2;

function bench(): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9, 2);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

/** A road with a lorry bay at its western end, laid by `companyId`. */
function stopAt(scenario: Scenario, x: number, y: number, companyId: number): void {
  expect(
    tryApply(scenario, { kind: CommandKind.BuildRoad, x1: x, y1: y, x2: x + 4, y2: y }, companyId),
  ).toBeNull();
  expect(
    tryApply(
      scenario,
      { kind: CommandKind.BuildRoadStop, x, y, moduleKind: ModuleKind.LorryBay },
      companyId,
    ),
  ).toBeNull();
}

/**
 * What the builder plans between two points, and everything it would order.
 * The queue is a scratch one, exactly as `startProject`'s dry run uses.
 */
function plan(
  scenario: Scenario,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { line: ReturnType<typeof enqueueInfrastructure>; queue: CommandQueue } {
  const queue = new CommandQueue();
  const line = enqueueInfrastructure(queue, scenario.world, AI, {
    from,
    to,
    depot: { x: from.x, y: from.y + 1 },
    rail: true,
  });
  return { line, queue };
}

/**
 * A pair too far off the corridor's own skew for an oval, so the single-track
 * fallback of D-153 is what plans it - the branch every rail company reaches.
 */
const FAR = { x: 34, y: 34 };
const NEAR = { x: 10, y: 10 };

describe('the AI plans a railway onto tiles that can still take its stops', () => {
  it('reproduces the asymmetry: track goes over a module, a stop does not', () => {
    const scenario = bench();
    stopAt(scenario, NEAR.x, NEAR.y, AI);

    // The track is laid THROUGH the company's own bay without a murmur.
    expect(
      tryApply(
        scenario,
        {
          kind: CommandKind.BuildTrack,
          x1: NEAR.x,
          y1: NEAR.y,
          x2: NEAR.x + 6,
          y2: NEAR.y,
          railType: RailType.Plain,
          assistant: false,
          signalSpacing: 0,
        },
        AI,
      ),
      'buildTrack refuses a tile a module stands on',
    ).toBeNull();

    // And the shed the railway exists for is refused on that same tile. Both
    // verdicts are the command layer's own; the planner has to know both.
    expect(
      tryApply(
        scenario,
        { kind: CommandKind.BuildRailStop, x: NEAR.x, y: NEAR.y, moduleKind: ModuleKind.RailDepot },
        AI,
      ),
    ).toBe(RejectReason.Occupied);
  });

  it('plans the ordinary single-track railway with its shed on the first tile', () => {
    const { line, queue } = plan(bench(), NEAR, FAR);

    expect(line, 'a railway on empty ground is planned').not.toBeNull();
    // The fallback branch, not the oval: exactly one train, and the shed is
    // the alignment's own first tile (D-153).
    expect(line!.railTrains).toBe(1);
    expect(line!.shed).toEqual(NEAR);
    expect(
      queue.log.some(
        (envelope) =>
          envelope.command.kind === CommandKind.BuildRailStop &&
          envelope.command.moduleKind === ModuleKind.RailDepot,
      ),
    ).toBe(true);
  });

  it('refuses the plan whose shed tile already carries its own stop', () => {
    const scenario = bench();
    stopAt(scenario, NEAR.x, NEAR.y, AI);

    const { line, queue } = plan(scenario, NEAR, FAR);

    // Refused WHOLE, like a route the assistant could not find: nothing is
    // ordered at all, so the company keeps the money it would have sunk into
    // track and platforms it could never crew.
    expect(line, 'a railway whose shed tile is taken was planned anyway').toBeNull();
    expect(queue.log.length, 'ordered part of a railway it cannot finish').toBe(0);
  });

  it('refuses it for a RIVAL stop on that tile as well', () => {
    // The control for the other owner. The ownership question of D-219 already
    // covered this one; it is asserted so that a future narrowing of the new
    // test to "its own" cannot quietly reopen it.
    const scenario = bench();
    stopAt(scenario, NEAR.x, NEAR.y, 1);

    expect(plan(scenario, NEAR, FAR).line).toBeNull();
  });

  it('moves the oval shed off a taken tile instead of ordering onto it', () => {
    // The straight corridor, where `clearRailTile` carries the same question:
    // the shed stands on a stub off the return row, and the stub is searched
    // outward from the middle.
    const straight = { from: { x: 10, y: 20 }, to: { x: 34, y: 20 } };
    const first = plan(bench(), straight.from, straight.to).line;
    expect(first, 'an oval on empty flat ground is planned').not.toBeNull();
    expect(first!.railTrains).toBe(AI_RAIL_MAX_TRAINS);

    const blocked = bench();
    stopAt(blocked, first!.shed.x, first!.shed.y, AI);
    const second = plan(blocked, straight.from, straight.to).line;

    expect(second, 'the oval was abandoned rather than shifted').not.toBeNull();
    expect(second!.shed, 'the shed was ordered onto the tile of a standing stop').not.toEqual(
      first!.shed,
    );
  });
});
