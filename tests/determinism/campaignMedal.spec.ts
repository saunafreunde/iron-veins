import { describe, expect, it } from 'vitest';
import { campaignScenarioById } from '../../src/scenarios/campaign';
import { newGameOptionsOf } from '../../src/scenarios/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { TICKS_PER_YEAR } from '../../src/sim/constants';
import { gameEndMarker } from '../../src/sim/goals/markers';
import { companyScore } from '../../src/sim/goals/score';
import { GoalKind, GoalMedal, GoalStatus } from '../../src/sim/goals/types';
import { worldParamsFor } from '../../src/sim/newGame';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import { encodeReplay, verifyReplay } from '../../src/sim/save/replay';
import { ReplaySession } from '../../src/sim/save/replaySession';
import { decodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import {
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
} from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';

/**
 * **The campaign medal run of SPEC2 M24's Fertig-wenn, as an artefact**
 * (D-256; the clause is "und ein Kampagnen-Medaillenlauf per M16-Replay
 * verifiziert").
 *
 * D-254 left this open and said honestly what stood in its place: D-196 had
 * proved the chain medal -> hash -> replay end to end on a HAND-BUILT world,
 * and a campaign stage is an ordinary shipped scenario, so the same proof
 * applies. That is an argument, not a run. This file is the run: one of the
 * twelve campaign maps, played through the player's own commands, a medal
 * decided by the simulation on it, recorded as an `.ironreplay`, verified, and
 * reproduced from the checkpoint AND from the genesis.
 *
 * **Why stage 08 and not stage 01.** The stage had to be one where a line the
 * player builds really RUNS, because a medal earned on a map full of stalled
 * vehicles would be a medal about nothing. Measured while choosing:
 *
 *  - on stage 01 (1850) the four omnibuses never left the depot tile: the 1850
 *    catalogue's 3,200 N against 2,600 kg cannot start on the height step at
 *    the depot's own door, so the line delivered ZERO units in ten game years;
 *  - on stage 04 (1880) the same line delivered 1,003 units in its first year
 *    and then stopped earning entirely for five more;
 *  - on stage 08 (1920) it runs: 5,127 units in the first game year and
 *    42,082 by the eighth, every bus still earning.
 *
 * That difference is the era economics D-250 named as open work, met from the
 * physical side rather than the economic one, and it is written down here
 * because it is what decided the fixture.
 *
 * **What this run does NOT show, said plainly.** The stage is not WON: its
 * second goal wants twelve thousand units of coal, which is a freight business
 * and not this bus line, so `GameEnd` stays `Running` and no campaign
 * progression is booked from here. The booking path - `GameEnd.Won` ->
 * `profile.json` - is held by `tests/unit/campaignScreen.spec.ts` on the store,
 * and what this file adds under it is the half that needs a simulation: that
 * the medal such a booking would carry is the simulation's own and survives a
 * replay bit for bit.
 */

const STAGE_ID = 'eisenadern-08';
const COMPANY = 'Eisenadern-Medaillenlauf';
const GAME_VERSION = 'campaign-medal-test';

/** The two towns the stage's connection goal names: Brackcombe and Far-Bramwick. */
const TOWN_A = 9;
const TOWN_B = 11;

/** The 1899 motor omnibus - the newest road passenger vehicle of 1920. */
const BUS = 306;
const BUS_COUNT = 4;

/**
 * Three game years, and the length is a measurement rather than a taste: the
 * first year already delivers over five thousand units, so the recorded world
 * is a working line rather than a build order, and the verifier re-simulates
 * everything it covers twice.
 */
const RECORDING_YEARS = 3;
const RECORDING_TICKS = RECORDING_YEARS * TICKS_PER_YEAR;

interface Recording {
  readonly world: World;
  readonly bytes: Uint8Array;
  readonly finalHash: string;
  readonly deliveredUnits: number;
}

/**
 * Play the stage: build the road, two stops and a shed, crew the line, run.
 *
 * The checkpoint at tick zero is taken BEFORE anything is built and the world
 * is stepped once before the first command, so every command in the log is
 * stamped at a tick the replay will really drain - the rule `gameEnd.spec.ts`
 * records for the same reason (a ring entry taken after the build would hold a
 * world that already has the network while the log still asks for it).
 */
function record(): Recording {
  const scenario = campaignScenarioById(STAGE_ID)!;
  const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, 1)));
  const queue = new CommandQueue();
  const ring = new CheckpointRing();
  ring.record(world, queue);
  world.step(queue, null);

  const issue = (command: Command): void => {
    queue.enqueue(command, world.tick);
    let rejected: string | null = null;
    world.drainCommands(queue, (_envelope, outcome) => {
      if (!outcome.ok) rejected = outcome.reasonKey;
    });
    if (rejected !== null)
      throw new Error(`${STAGE_ID}: command ${command.kind} refused: ${rejected}`);
  };

  const a = world.towns[TOWN_A]!;
  const b = world.towns[TOWN_B]!;
  issue({ kind: CommandKind.BuildRoad, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  issue({ kind: CommandKind.BuildRoadStop, x: a.x + 1, y: a.y, moduleKind: ModuleKind.BusStop });
  issue({ kind: CommandKind.BuildRoadStop, x: b.x - 1, y: b.y, moduleKind: ModuleKind.BusStop });
  issue({ kind: CommandKind.BuildRoadStop, x: a.x + 2, y: a.y, moduleKind: ModuleKind.RoadDepot });

  const stopA = world.stations.find((station) => station.townId === TOWN_A)!;
  const stopB = world.stations.find((station) => station.townId === TOWN_B)!;
  for (let i = 0; i < BUS_COUNT; i++) {
    issue({ kind: CommandKind.BuyRoadVehicle, x: a.x + 2, y: a.y, specId: BUS });
    const vehicleId = world.vehicles.count - 1;
    issue({
      kind: CommandKind.SetVehicleOrders,
      vehicleId,
      orders: [
        {
          target: OrderTarget.Station,
          targetId: stopA.id,
          load: OrderLoad.Partial,
          unload: OrderUnload.All,
        },
        {
          target: OrderTarget.Station,
          targetId: stopB.id,
          load: OrderLoad.Partial,
          unload: OrderUnload.All,
        },
      ],
    });
    issue({ kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
  }

  while (world.tick < RECORDING_TICKS) {
    world.step(queue, null);
    ring.record(world, queue);
  }

  let deliveredUnits = 0;
  for (const units of world.playerCompany.cargoDeliveredUnits) deliveredUnits += units;

  return {
    world,
    bytes: encodeReplay(world, queue, ring, GAME_VERSION),
    finalHash: hashWorld(world),
    deliveredUnits,
  };
}

/** Played once for the file - the recording is the expensive part. */
let recorded: Recording | null = null;
function recording(): Recording {
  recorded ??= record();
  return recorded;
}

describe('a campaign medal run, verified by an M16 replay', () => {
  it('earns a medal on a campaign map by running a line, not by standing still', () => {
    const world = recording().world;
    const scenario = campaignScenarioById(STAGE_ID)!;

    // The stage is the shipped one, reached through the door the campaign
    // screen starts it with - not a world assembled here (D-195's ONE door).
    expect(world.startYear).toBe(scenario.rules.startYear);
    expect(world.goals.count).toBe(scenario.goals.length);
    expect(scenario.goals[0]!.spec.kind).toBe(GoalKind.ConnectStations);

    // The medal is the simulation's: status, band and tick all decided by the
    // daily hook of D-193 while the line was being built and run.
    expect(world.goals.status[0]).toBe(GoalStatus.Achieved);
    expect(world.goals.medal[0]).toBe(GoalMedal.Gold);
    expect(world.goals.completedTick[0]).toBeGreaterThan(0);
    expect(world.goals.completedTick[0]).toBeLessThanOrEqual(scenario.goals[0]!.spec.goldTick);

    // And the run is a run: the fleet is alive, moving and paid, which is what
    // separates this fixture from a schedule nobody drives (the reason stage 08
    // is the stage - see the head of this file).
    let earning = 0;
    for (let id = 0; id < world.vehicles.count; id++) {
      if (world.vehicles.alive[id] !== 1) continue;
      if (world.vehicles.ownerId[id] !== world.playerCompanyId) continue;
      expect(world.vehicles.state[id], `bus ${id} has no route`).not.toBe(VehicleState.NoRoute);
      if (world.vehicles.earnedCt[id]! > 0) earning++;
    }
    expect(earning, 'buses that have earned something').toBe(BUS_COUNT);
    expect(recording().deliveredUnits, 'units delivered in three game years').toBeGreaterThan(
      1_000,
    );

    // The second goal is still open, which is what makes the comparison below
    // discriminating: a re-simulation that handed out medals for everything
    // would differ in this field before it differed anywhere else.
    expect(world.goals.status[1]).toBe(GoalStatus.Open);
    expect(world.goals.medal[1]).toBe(GoalMedal.None);
  });

  it('verifies as a recording - which is a statement about that medal', () => {
    const verification = verifyReplay(decodeSave(recording().bytes), GAME_VERSION);
    expect(verification.verdict.kind, verification.reasonKey).toBe('verified');
    expect(verification.ok).toBe(true);
    expect(verification.expectedHash).toBe(recording().finalHash);
  });

  it('reproduces the medal field by field from the last checkpoint', () => {
    const session = ReplaySession.open(recording().bytes, GAME_VERSION);
    session.seek(session.finalTick);

    expect(session.world.tick).toBe(recording().world.tick);
    expect(session.world.goals.toData()).toEqual(recording().world.goals.toData());
    expect(hashWorld(session.world)).toBe(recording().finalHash);
    // The reading the end screen puts on it: same score, same verdict.
    expect(companyScore(session.world)).toEqual(companyScore(recording().world));
    expect(gameEndMarker(session.world)).toEqual(gameEndMarker(recording().world));
  });

  it('reproduces it from the GENESIS of the campaign world too', () => {
    // The strongest form, and on a campaign stage it says one thing more than
    // it does on a hand-built world: the map itself is regenerated from the
    // stage's own seed and rules on the way through, so a medal that depended
    // on anything but those and the command log would part company here.
    const session = ReplaySession.open(recording().bytes, GAME_VERSION);
    session.seek(0);
    expect(session.world.startYear).toBe(campaignScenarioById(STAGE_ID)!.rules.startYear);
    for (let at = 0; at < session.world.goals.count; at++) {
      expect(session.world.goals.status[at]).toBe(GoalStatus.Open);
    }

    while (session.world.tick < session.finalTick) session.world.step(session.queue, null);
    expect(session.world.goals.toData()).toEqual(recording().world.goals.toData());
    expect(hashWorld(session.world)).toBe(recording().finalHash);
  });
});
