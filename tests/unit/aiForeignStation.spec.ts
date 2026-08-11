import { describe, expect, it } from 'vitest';
import { updateAi } from '../../src/sim/ai/ai';
import { pickRoadVehicle } from '../../src/sim/ai/build';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import { ModuleKind } from '../../src/sim/station/types';
import { flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * **A project reads its stops back off the map, and the read-back asks who owns
 * them** (D-223).
 *
 * D-108's rule is that each stage of a build OBSERVES what the previous one
 * left behind rather than trusting the commands it sent - the AI cannot know a
 * station id while the command that makes it is still queued. The observation
 * was `stationAtTile`, and it answered with whatever station stood on the tile.
 *
 * That is a whole line built on somebody else's stop. The AI plans its stop
 * onto a tile a rival has already built on; `BuildRoadStop` refuses it
 * `Occupied` - a refusal this project has DECLARED and tolerated since D-220 -
 * and the next cycle finds the rival's station there, adopts it, buys the
 * fleet, opens the line and gives it a schedule calling at a stop the company
 * neither owns nor can lay a road to (the tile is the rival's, so `BuildRoad`
 * answers `NotYours`). Every vehicle of that line is then refused
 * `SetVehicleRunning|noRouteToStop` and stands in its shed for the rest of the
 * game.
 *
 * Traced on seed 60613 at D-220's own commit - six buses of company 3, all
 * standing on their shed tile at 196,103 with eighty-one tiles of the company's
 * own road under them reaching its own far stop at 228,108, and the near stop
 * the rival's bay one tile away at 196,104, joined to nothing of theirs.
 */

const SIZE = 64;
const RIVAL = 1;
const AI = 2;

/** Two AI competitors on empty flat ground, both with money to spend. */
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
 * Put the AI in the state the trace found it in: infrastructure ordered, one
 * stop planned at `from` and one at `to`, waiting for the cycle that reads them
 * back and buys the fleet.
 */
function project(
  scenario: Scenario,
  from: { x: number; y: number },
  to: { x: number; y: number },
): CommandQueue {
  const world = scenario.world;
  const state = world.ai.find((entry) => entry.companyId === AI)!;
  const specId = pickRoadVehicle(world, Cargo.CommuterPax);
  expect(specId).toBeGreaterThanOrEqual(0);
  state.project = {
    stage: 1,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    depotX: to.x,
    depotY: to.y + 1,
    rail: false,
    cargo: Cargo.CommuterPax,
    specIds: [specId],
    startedTick: world.tick,
    railTrains: 1,
    lineId: -1,
  };
  state.nextDecisionTick = world.tick;

  const queue = new CommandQueue();
  updateAi(world, queue);
  return queue;
}

function bought(queue: CommandQueue): number {
  return queue.log.filter((envelope) => envelope.command.kind === CommandKind.BuyRoadVehicle)
    .length;
}

describe("the AI's project reads back its OWN stops", () => {
  it('reproduces the refusal that starts it: a stop may not be planted on a rival station', () => {
    const scenario = bench();
    stopAt(scenario, 20, 20, RIVAL);

    // The command layer's own verdict, and it is the declared refusal the
    // acceptance sweep prints as tolerated. Tolerating it is only safe if what
    // comes AFTER it does not adopt the rival's stop.
    expect(
      tryApply(
        scenario,
        { kind: CommandKind.BuildRoadStop, x: 20, y: 20, moduleKind: ModuleKind.LorryBay },
        AI,
      ),
    ).toBe(RejectReason.Occupied);
    // And the road to it is refused too, which is what leaves the fleet with no
    // route: the tile is the rival's the moment it is paved (D-101).
    expect(
      tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 20, y1: 20, x2: 20, y2: 24 }, AI),
    ).toBe(RejectReason.NotYours);
  });

  it('does not adopt a rival station standing on the tile it planned its stop at', () => {
    const scenario = bench();
    stopAt(scenario, 20, 20, RIVAL);
    stopAt(scenario, 30, 20, AI);

    const queue = project(scenario, { x: 20, y: 20 }, { x: 30, y: 20 });

    // Nothing ordered, and the project is over: whatever WAS built stays
    // standing and stays paid for, exactly as a failed project costs a player.
    expect(bought(queue), 'bought a fleet for a line it cannot run').toBe(0);
    expect(scenario.world.ai.find((entry) => entry.companyId === AI)!.project).toBeNull();
  });

  it('still adopts its OWN stop on that tile - the read-back is about the owner', () => {
    const scenario = bench();
    // The identical geometry, with the near stop built by the company that is
    // building the line. This is the control: what must not happen is a project
    // that stops working at all.
    stopAt(scenario, 20, 20, AI);
    stopAt(scenario, 30, 20, AI);

    const queue = project(scenario, { x: 20, y: 20 }, { x: 30, y: 20 });

    expect(bought(queue), 'the ordinary project buys its fleet').toBeGreaterThanOrEqual(1);
    expect(scenario.world.ai.find((entry) => entry.companyId === AI)!.project?.stage).toBe(2);
  });

  it('is not a test of the OTHER end either: a rival stop at the far end is refused too', () => {
    const scenario = bench();
    stopAt(scenario, 20, 20, AI);
    stopAt(scenario, 30, 20, RIVAL);

    const queue = project(scenario, { x: 20, y: 20 }, { x: 30, y: 20 });

    expect(bought(queue)).toBe(0);
    expect(scenario.world.ai.find((entry) => entry.companyId === AI)!.project).toBeNull();
  });
});
