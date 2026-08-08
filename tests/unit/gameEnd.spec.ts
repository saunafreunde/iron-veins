import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  BANKRUPTCY_MONTHS,
  CENTS_PER_EURO,
  MAX_TICK,
  SCORE_TERM_MAX_POINTS,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { companyScore, gameEndOf } from '../../src/sim/goals/score';
import { gameEndMarker, goalMarkers } from '../../src/sim/goals/markers';
import { GameEnd, GoalKind, GoalMedal, GoalStatus, type GoalSpec } from '../../src/sim/goals/types';
import { computeLandmasses, markOcean } from '../../src/sim/mapgen/hydrology';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import { encodeReplay, verifyReplay } from '../../src/sim/save/replay';
import { ReplaySession } from '../../src/sim/save/replaySession';
import { decodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import { OrderLoad, OrderTarget, OrderUnload } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, type World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * Hash-verified medals, and the end of the game (SPEC2 M17 bundle 4).
 *
 * The milestone's acceptance sentence has a half that only M16 could pay for:
 * "Replay laden => Resim reproduziert den Medaillenstand bit-exakt". This file
 * is that end to end and in the strongest form available - a game is PLAYED
 * with real commands until its goals are decided, exported as an `.ironreplay`,
 * handed to the verifier of D-191, and then re-simulated through the ordinary
 * `ReplaySession` so the scoreboard itself can be compared field by field.
 *
 * Why the world hash is the right instrument here, rather than an assertion
 * about the goal arrays alone: a medal is HASHED state (D-193), so `verified`
 * is already a statement about the medals. The test proves that the other way
 * round too - a world whose only difference is one medal hashes differently -
 * because "the digest covers it" is exactly the kind of claim that quietly
 * stops being true when a field is added to the wrong side of the audit.
 */

const GAME_VERSION = '0.1.0';
const SIZE = 64;
const ROW = 32;
const A_X = 12;
const B_X = 50;
/** The 1950 bus every balancing scenario uses. */
const BUS = 200;
const BUSES = 2;
/** Long enough for two year-boundary checkpoints and a part-year tail. */
const RECORDING_TICKS = 2 * TICKS_PER_YEAR + 9_000;

/** The connection goal: it cannot come true unless the log's commands ran. */
const CONNECT_GOAL: GoalSpec = {
  kind: GoalKind.ConnectStations,
  subjectA: 0,
  subjectB: 1,
  threshold: 1,
  goldTick: TICKS_PER_YEAR,
  silverTick: 2 * TICKS_PER_YEAR,
  bronzeTick: 3 * TICKS_PER_YEAR,
};

/** A rating held for ten days - a verdict the FLEET has to earn day by day. */
const RATING_GOAL: GoalSpec = {
  kind: GoalKind.StationRatingHold,
  subjectA: -1,
  subjectB: 10,
  threshold: 20,
  goldTick: 30 * TICKS_PER_DAY,
  silverTick: TICKS_PER_YEAR,
  bronzeTick: 2 * TICKS_PER_YEAR,
};

/**
 * Still solvent in the second game year - and deliberately banded so it CANNOT
 * be gold: the goal cannot come true before its own date, and the gold band
 * closes half a year earlier. Three goals that all earned gold would let a
 * broken re-simulation pass by handing out gold to everything.
 */
const SURVIVE_GOAL: GoalSpec = {
  kind: GoalKind.SurviveUntil,
  subjectA: -1,
  subjectB: -1,
  threshold: 2 * TICKS_PER_YEAR,
  goldTick: TICKS_PER_YEAR + TICKS_PER_YEAR / 2,
  silverTick: 2 * TICKS_PER_YEAR,
  bronzeTick: 3 * TICKS_PER_YEAR,
};

function stop(stationId: number): {
  target: number;
  targetId: number;
  load: number;
  unload: number;
} {
  return {
    target: OrderTarget.Station,
    targetId: stationId,
    load: OrderLoad.Partial,
    unload: OrderUnload.All,
  };
}

/**
 * A world with goals and nothing built yet, at tick zero.
 *
 * The two derived layers are computed here and this is not decoration. A
 * generated map has them from the mapgen and a LOADED one from `World.fromData`
 * (both call the same pair), but `flatScenario` lays its ground by hand and
 * therefore has neither. The difference is invisible until an industry is
 * spawned by the yearly hook, which reads `map.landmassId` and would record -1
 * before a save and 0 after one - a save round trip that changes a saved field,
 * found by exactly the re-simulation below.
 */
function benchWorld(goals: readonly GoalSpec[]): Scenario {
  const a = makeTown(0, A_X, ROW, 1_600, 'Anfangen');
  const b = makeTown(1, B_X, ROW, 1_600, 'Endingen');
  const scenario = flatScenario(SIZE, [a, b], [], 5);
  markOcean(scenario.world.map);
  computeLandmasses(scenario.world.map);
  for (const spec of goals) scenario.world.goals.add(spec);
  return scenario;
}

interface Recording {
  readonly world: World;
  readonly bytes: Uint8Array;
  readonly finalHash: string;
}

/**
 * Play a bus line for two game years and record it.
 *
 * The checkpoint at tick zero is taken BEFORE anything is built and the world
 * is stepped once before the first command, so every command in the log is
 * stamped at a tick the replay will actually drain. A ring entry taken after
 * the build would hold a world that already has the network while the log
 * still asks for it, and the re-simulation would build it twice.
 */
function record(): Recording {
  const scenario = benchWorld([CONNECT_GOAL, RATING_GOAL, SURVIVE_GOAL]);
  const world = scenario.world;
  const queue = scenario.queue;
  const ring = new CheckpointRing();
  ring.record(world, queue);
  world.step(queue, null);

  apply(scenario, { kind: CommandKind.BuildRoad, x1: A_X, y1: ROW, x2: B_X, y2: ROW });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: A_X + 1,
    y: ROW,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: B_X - 1,
    y: ROW,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: A_X,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });
  for (let i = 0; i < BUSES; i++) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: A_X, y: ROW, specId: BUS });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: i,
      orders: [stop(0), stop(1)],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true });
  }

  while (world.tick < RECORDING_TICKS) {
    world.step(queue, null);
    ring.record(world, queue);
  }

  return {
    world,
    bytes: encodeReplay(world, queue, ring, GAME_VERSION),
    finalHash: hashWorld(world),
  };
}

/** Played once for the file - the recording is the expensive part. */
let recorded: Recording | null = null;
function recording(): Recording {
  recorded ??= record();
  return recorded;
}

describe('a medal survives a replay bit-exactly', () => {
  it('decides its goals during the recording, so there is something to reproduce', () => {
    const goals = recording().world.goals;
    console.log(
      `recorded medals: ${[0, 1, 2]
        .map(
          (at) =>
            `goal ${at} status ${goals.status[at]!} medal ${goals.medal[at]!} at tick ` +
            `${goals.completedTick[at]!}`,
        )
        .join('; ')}`,
    );
    expect(goals.status[0]).toBe(GoalStatus.Achieved);
    expect(goals.status[1]).toBe(GoalStatus.Achieved);
    expect(goals.status[2]).toBe(GoalStatus.Achieved);
    // Not all three at the same band, or the comparison below would pass for a
    // re-simulation that simply awarded gold to everything.
    expect(new Set([0, 1, 2].map((at) => goals.medal[at]!)).size).toBeGreaterThan(1);
  });

  it('verifies as a recording - which is a statement about the medals', () => {
    const verification = verifyReplay(decodeSave(recording().bytes), GAME_VERSION);
    expect(verification.verdict.kind, verification.reasonKey).toBe('verified');
    expect(verification.ok).toBe(true);
    expect(verification.expectedHash).toBe(recording().finalHash);
  });

  it('reproduces the scoreboard field by field when the replay is re-simulated', () => {
    const session = ReplaySession.open(recording().bytes, GAME_VERSION);
    // The ordinary playback path: restore the newest checkpoint below the end
    // and re-simulate the remainder, exactly as the scrub bar does.
    session.seek(session.finalTick);

    expect(session.world.tick).toBe(recording().world.tick);
    expect(session.world.goals.toData()).toEqual(recording().world.goals.toData());
    expect(hashWorld(session.world)).toBe(recording().finalHash);
    // And the reading the end screen puts on it - same numbers, same verdict.
    expect(companyScore(session.world)).toEqual(companyScore(recording().world));
    expect(gameEndMarker(session.world)).toEqual(gameEndMarker(recording().world));
  });

  it('reproduces it from the GENESIS too, not only from the last checkpoint', () => {
    // The strongest form: the whole two years re-simulated from the recording's
    // own tick zero. A medal that depended on anything but the seed and the
    // log would part company somewhere in here.
    const session = ReplaySession.open(recording().bytes, GAME_VERSION);
    session.seek(0);
    expect(session.world.goals.count).toBe(3);
    for (let at = 0; at < 3; at++) expect(session.world.goals.status[at]).toBe(GoalStatus.Open);

    while (session.world.tick < session.finalTick) session.world.step(session.queue, null);
    expect(session.world.goals.toData()).toEqual(recording().world.goals.toData());
    expect(hashWorld(session.world)).toBe(recording().finalHash);
  });

  it('would have noticed: a single changed medal moves the world hash', () => {
    // The other direction of the claim. `verified` means "every commitment was
    // reproduced", and this is what makes that a statement about the medals:
    // the scoreboard is inside the digest the verifier compares.
    const scenario = benchWorld([CONNECT_GOAL]);
    scenario.world.goals.status[0] = GoalStatus.Achieved;
    scenario.world.goals.medal[0] = GoalMedal.Silver;
    scenario.world.goals.completedTick[0] = TICKS_PER_DAY;
    const silver = hashWorld(scenario.world);

    scenario.world.goals.medal[0] = GoalMedal.Gold;
    expect(hashWorld(scenario.world)).not.toBe(silver);
  });
});

// ------------------------------------------------------------ the four ends

describe('where the game stands', () => {
  it('is running while a goal is open', () => {
    const world = benchWorld([CONNECT_GOAL]).world;
    expect(gameEndOf(world)).toBe(GameEnd.Running);
  });

  it('is won when every goal was achieved', () => {
    const world = benchWorld([CONNECT_GOAL]).world;
    world.goals.status[0] = GoalStatus.Achieved;
    world.goals.medal[0] = GoalMedal.Bronze;
    expect(gameEndOf(world)).toBe(GameEnd.Won);
  });

  it('stays won when the company is wound up afterwards, because a verdict is final', () => {
    // D-193: an achieved goal is never revisited. A company that met every
    // goal and then went broke has won the scenario and lost the company, and
    // the score says both - its value and network terms collapse on their own.
    const world = benchWorld([CONNECT_GOAL]).world;
    world.goals.status[0] = GoalStatus.Achieved;
    world.goals.medal[0] = GoalMedal.Gold;
    world.playerCompany.bankrupt = true;
    expect(gameEndOf(world)).toBe(GameEnd.Won);
  });

  it('is a winding-up before it is a defeat, because open goals never decide', () => {
    // Only `SurviveUntil` fails early on a bankruptcy; everything else sits
    // Open for ever, so the goal outcome alone would report "still running"
    // for a game that is unmistakably over.
    const world = benchWorld([CONNECT_GOAL]).world;
    world.playerCompany.bankrupt = true;
    expect(gameEndOf(world)).toBe(GameEnd.Bankrupt);
  });

  it('is lost when every goal is decided and one of them failed', () => {
    const world = benchWorld([CONNECT_GOAL, SURVIVE_GOAL]).world;
    world.goals.status[0] = GoalStatus.Achieved;
    world.goals.medal[0] = GoalMedal.Gold;
    world.goals.status[1] = GoalStatus.Failed;
    expect(gameEndOf(world)).toBe(GameEnd.Lost);
  });

  it('is the century summary for a sandbox that ran out of years', () => {
    const world = benchWorld([]).world;
    expect(gameEndOf(world)).toBe(GameEnd.Running);
    world.tick = MAX_TICK;
    expect(gameEndOf(world)).toBe(GameEnd.Century);
  });

  it('reports a bankruptcy the M8 path produced, not one a test set by hand', () => {
    // The gap this bundle closes: since M8 a winding-up produced a news entry
    // and a red line in the finance panel and nothing else. It is an ENDING
    // now, and it has to be reachable from the rule of 14.2 rather than from a
    // flag somebody flipped.
    const scenario = benchWorld([]);
    const world = scenario.world;
    world.company.cashCt = -1_000 * CENTS_PER_EURO;
    for (let month = 0; month <= BANKRUPTCY_MONTHS && !world.company.bankrupt; month++) {
      for (let tick = 0; tick < 6_000; tick++) world.step(scenario.queue, null);
    }
    expect(world.company.bankrupt).toBe(true);
    expect(gameEndOf(world)).toBe(GameEnd.Bankrupt);
    expect(gameEndMarker(world).reason).toBe(GameEnd.Bankrupt);
  });
});

// ----------------------------------------------------------------- the score

describe('the score is a reading of hashed state', () => {
  it('has four terms, each capped, and nothing else in the total', () => {
    const score = companyScore(recording().world);
    expect(score.total).toBe(
      score.goals.points + score.value.points + score.network.points + score.cargo.points,
    );
    for (const term of [score.goals, score.value, score.network, score.cargo]) {
      expect(term.points).toBeLessThanOrEqual(SCORE_TERM_MAX_POINTS);
      expect(term.points).toBeGreaterThanOrEqual(0);
      expect(term.share).toBeLessThanOrEqual(1);
    }
  });

  it('cannot earn the goal quarter in a world that has no goals', () => {
    const world = benchWorld([]).world;
    const score = companyScore(world);
    expect(score.goalCount).toBe(0);
    expect(score.goals.points).toBe(0);
    expect(score.medal).toBe(GoalMedal.None);
  });

  it('keeps the tonnage a winding-up cannot erase', () => {
    // The fleet is auctioned and the network value goes with it; what the
    // company DELIVERED is a lifetime tally and stays, which is why a
    // bankruptcy screen can still say what it achieved.
    const world = benchWorld([]).world;
    world.company.cargoDeliveredUnits[0] = 40_000;
    const before = companyScore(world).cargo.points;
    world.playerCompany.bankrupt = true;
    expect(companyScore(world).cargo.points).toBe(before);
    expect(before).toBeGreaterThan(0);
  });

  it('quotes the company value at the first year’s prices', () => {
    // Or a company would read as improving simply because the century wore on
    // (D-187's rule for the network-value denominator).
    const scenario = benchWorld([]);
    const world = scenario.world;
    world.company.cashCt = 1_000_000 * CENTS_PER_EURO;
    const early = companyScore(world).value.measured;
    world.tick = 40 * TICKS_PER_YEAR;
    expect(world.costFactor).toBeGreaterThan(1);
    expect(companyScore(world).value.measured).toBeLessThan(early);
  });
});

// --------------------------------------------------------------- the markers

describe('the goal markers carry what the panel prints', () => {
  it('resolves band ticks to years and town subjects to names', () => {
    const world = benchWorld([CONNECT_GOAL, RATING_GOAL, SURVIVE_GOAL]).world;
    const markers = goalMarkers(world);

    expect(markers).toHaveLength(3);
    expect(markers[0]!.townAName).toBe('Anfangen');
    expect(markers[0]!.townBName).toBe('Endingen');
    expect(markers[0]!.goldYear).toBe(1951);
    expect(markers[0]!.bronzeYear).toBe(1953);
    // "any station" names no town, and the marker says so rather than
    // printing the town that happens to sit at index -1.
    expect(markers[1]!.townAName).toBe('');
    // The one kind whose threshold IS a tick arrives as a year.
    expect(markers[2]!.thresholdYear).toBe(1952);
    expect(markers[0]!.thresholdYear).toBe(0);
  });

  it('measures a rating hold against the DAYS it needs, not the rating points', () => {
    // The defect this bundle found: `goalProgressMilli` divided progress by the
    // threshold for every kind, and a rating hold's progress is a run of days
    // while its threshold is a rating. Ten days of a "hold 20 for 10 days"
    // goal read as half done at the moment it was met.
    const world = benchWorld([RATING_GOAL]).world;
    expect(goalMarkers(world)[0]!.target).toBe(RATING_GOAL.subjectB);
    expect(goalMarkers(world)[0]!.threshold).toBe(RATING_GOAL.threshold);
  });

  it('projects the band an open goal is still playing for', () => {
    const world = benchWorld([CONNECT_GOAL]).world;
    expect(goalMarkers(world)[0]!.projectedMedal).toBe(GoalMedal.Gold);
    world.tick = TICKS_PER_YEAR + TICKS_PER_DAY;
    expect(goalMarkers(world)[0]!.projectedMedal).toBe(GoalMedal.Silver);
    world.tick = 4 * TICKS_PER_YEAR;
    expect(goalMarkers(world)[0]!.projectedMedal).toBe(GoalMedal.None);

    // A decided goal keeps the band it EARNED - projecting a settled verdict
    // forward would let it decay past its own deadlines.
    world.goals.status[0] = GoalStatus.Achieved;
    world.goals.medal[0] = GoalMedal.Gold;
    expect(goalMarkers(world)[0]!.projectedMedal).toBe(GoalMedal.Gold);
  });
});
