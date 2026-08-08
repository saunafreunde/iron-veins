import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  LATERAL_ACCEL_FREIGHT,
  MapClimate,
  RAIL_SIGNAL_REPATH_INTERVAL_TICKS,
  RAIL_SIGNAL_REPATH_MIN_WAIT_TICKS,
} from '../../src/sim/constants';
import { SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType, TrackDir } from '../../src/sim/map/track';
import { TileMap } from '../../src/sim/map/TileMap';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';

/**
 * The two route-cost world rules of SPEC.md 8.4 (SPEC2 M15): `occupancyPenalty`
 * and `signalPenalty`, and the capped reroute that lets a train act on the
 * first of them after it has already set off.
 *
 * The fixture is a DIAMOND rather than a main line with a loop beside it, and
 * that is the point: the two ways round are mirror images - one diagonal, eight
 * orthogonal steps, one diagonal, with the same four 45 degree turns - so they
 * cost the identical number of seconds by construction. No hand-tuned geometry
 * decides these tests; the only thing that separates the two branches is the
 * penalty under test.
 *
 *        (15,9) ------------ (23,9)         north branch
 *       /                          \
 *  (10,10) -- (14,10)          (24,10) -- (30,10)
 *       \                          /
 *        (15,11) ----------- (23,11)        south branch
 */

const SIZE = 128;
const GROUND = 5;

/** Railbus, 1950 - light enough to accelerate inside a test. */
const RAILBUS = 1061;

/** A vehicle id no train in these worlds carries, for a claim with no owner. */
const FOREIGN = 900;

/** Junctions and the two branch rows. */
const SPLIT_X = 14;
const MERGE_X = 24;
const NORTH_Y = 9;
const SOUTH_Y = 11;
const MAIN_Y = 10;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

function layTrack(bench: Bench, x1: number, y1: number, x2: number, y2: number): void {
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1,
    y1,
    x2,
    y2,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
}

function flatWorld(occupancyPenalty: boolean, signalPenalty: boolean): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 815,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Ausweich AG',
      companyColorIndex: 1,
      occupancyPenalty,
      signalPenalty,
    },
    { map, towns: [], industries: [], seedUsed: 815 },
  );
  return { world, queue: new CommandQueue() };
}

/**
 * The diamond. Manual track building walks one signed step at a time, so a
 * segment from a junction to the far end of a branch lays exactly the one
 * diagonal and then the straight - which is what makes the two branches
 * mirror images without spelling every tile out.
 */
function diamond(bench: Bench): void {
  layTrack(bench, 10, MAIN_Y, SPLIT_X, MAIN_Y);
  layTrack(bench, SPLIT_X, MAIN_Y, MERGE_X - 1, NORTH_Y);
  layTrack(bench, MERGE_X - 1, NORTH_Y, 30, MAIN_Y);
  // The south branch is laid from both ends towards the middle: a segment
  // whose every tile already carries track is refused as nothing to do, and
  // both junctions exist by now.
  layTrack(bench, SPLIT_X, MAIN_Y, 19, SOUTH_Y);
  layTrack(bench, MERGE_X, MAIN_Y, 19, SOUTH_Y);
}

/** Every tile of one branch, junctions excluded. */
function branchTiles(world: World, y: number): number[] {
  const tiles: number[] = [];
  for (let x = SPLIT_X + 1; x < MERGE_X; x++) tiles.push(world.map.tileIndex(x, y));
  return tiles;
}

function claimBranch(world: World, y: number, owner: number): void {
  for (const tile of branchTiles(world, y)) world.reservations.set(tile, owner);
}

function releaseBranch(world: World, y: number): void {
  for (const tile of branchTiles(world, y)) world.reservations.clearIfOwnedBy(tile, FOREIGN);
}

/** Which branch row a route runs over, or -1 when it uses neither. */
function branchOf(world: World, path: Int32Array, length: number): number {
  for (let i = 0; i < length; i++) {
    const y = (path[i]! / world.map.size) | 0;
    if (y === NORTH_Y) return NORTH_Y;
    if (y === SOUTH_Y) return SOUTH_Y;
  }
  return -1;
}

/**
 * Route over the diamond at a fixed speed. 20 m/s is under plain track's own
 * line speed, so nothing but the geometry and the penalties decides.
 */
function route(bench: Bench, out: Int32Array, vehicleId = -1): number {
  const world = bench.world;
  return world.railPathfinder.find(
    world.map,
    world.reservations,
    vehicleId,
    world.map.tileIndex(10, MAIN_Y),
    world.map.tileIndex(30, MAIN_Y),
    20,
    LATERAL_ACCEL_FREIGHT,
    false,
    world.occupancyPenalty,
    world.signalPenalty,
    out,
  );
}

// --------------------------------------------------------- the cost function

describe('the occupancy penalty in railPath', () => {
  it('sends the train the free way round when the other way is claimed', () => {
    const bench = flatWorld(true, false);
    diamond(bench);
    const path = new Int32Array(2_048);

    // With nothing claimed the two branches cost the same to the last float,
    // so whichever the total order picks is the "natural" one. Which of the
    // two it is must not matter to this test - so it is measured, not assumed.
    const clean = route(bench, path);
    expect(clean).toBe(21);
    const natural = branchOf(bench.world, path, clean);
    expect(natural).not.toBe(-1);

    // Claim exactly that branch. The other is now three seconds cheaper.
    claimBranch(bench.world, natural, FOREIGN);
    const avoided = route(bench, path);
    expect(avoided).toBe(21);
    expect(branchOf(bench.world, path, avoided)).toBe(natural === NORTH_Y ? SOUTH_Y : NORTH_Y);
  });

  it('charges nothing for a claim the searching train holds itself', () => {
    const bench = flatWorld(true, false);
    diamond(bench);
    const path = new Int32Array(2_048);

    const clean = route(bench, path);
    const natural = branchOf(bench.world, path, clean);
    // The same tiles, held by the searching train itself: a train must not
    // route around its own reservation.
    claimBranch(bench.world, natural, 7);
    expect(branchOf(bench.world, path, route(bench, path, 7))).toBe(natural);
  });

  it('leaves the route untouched when the rule is off', () => {
    // The inertness property every pre-M15 seed lives on: with the rule off
    // the search returns the very same tiles whether the track ahead is
    // claimed or free.
    const bench = flatWorld(false, false);
    diamond(bench);
    const before = new Int32Array(2_048);
    const after = new Int32Array(2_048);

    const cleanLength = route(bench, before);
    claimBranch(bench.world, branchOf(bench.world, before, cleanLength), FOREIGN);
    const claimedLength = route(bench, after);

    expect(claimedLength).toBe(cleanLength);
    for (let i = 0; i < cleanLength; i++) expect(after[i]).toBe(before[i]);
  });
});

describe('the signal penalty in railPath', () => {
  function signalOneBranch(bench: Bench, y: number): void {
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 19,
      y,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
  }

  it('prefers the branch with fewer signals when the running time is equal', () => {
    const bench = flatWorld(false, true);
    diamond(bench);
    const path = new Int32Array(2_048);

    const natural = branchOf(bench.world, path, route(bench, path));
    signalOneBranch(bench, natural);

    expect(branchOf(bench.world, path, route(bench, path))).toBe(
      natural === NORTH_Y ? SOUTH_Y : NORTH_Y,
    );
  });

  it('leaves the route untouched when the rule is off', () => {
    const bench = flatWorld(false, false);
    diamond(bench);
    const before = new Int32Array(2_048);
    const after = new Int32Array(2_048);

    const cleanLength = route(bench, before);
    signalOneBranch(bench, branchOf(bench.world, before, cleanLength));
    const signalledLength = route(bench, after);

    expect(signalledLength).toBe(cleanLength);
    for (let i = 0; i < cleanLength; i++) expect(after[i]).toBe(before[i]);
  });
});

// ------------------------------------------------------- a train that drives

/** Depot at the west end, platform at the east end, one railbus in the shed. */
function crewedDiamond(bench: Bench): void {
  diamond(bench);
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: 10,
    y: MAIN_Y,
    moduleKind: ModuleKind.RailDepot,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: 30,
    y: MAIN_Y,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, { kind: CommandKind.BuyTrain, x: 10, y: MAIN_Y, specIds: [RAILBUS] });
}

function startTowardsPlatform(bench: Bench): void {
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    // Station 1 is the platform at the east end; station 0 is the shed.
    orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
  });
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
}

describe('a departing train reads the live reservations', () => {
  /** Which branch a freshly crewed train sets off along, given a claim. */
  function departedBranch(occupancyPenalty: boolean, claimed: number | null): number {
    const bench = flatWorld(occupancyPenalty, false);
    crewedDiamond(bench);
    if (claimed !== null) claimBranch(bench.world, claimed, FOREIGN);
    startTowardsPlatform(bench);
    const vehicles = bench.world.vehicles;
    return branchOf(bench.world, vehicles.paths[0]!, vehicles.pathLength[0]!);
  }

  it('takes the free branch under the rule and the claimed one without it', () => {
    // Which branch an unhindered train picks out of two equal ones is the
    // heap's total order and nothing this test may assume - so it is measured
    // with the train itself, at the train's own speed and lateral limit.
    const natural = departedBranch(false, null);
    expect(natural).not.toBe(-1);
    const other = natural === NORTH_Y ? SOUTH_Y : NORTH_Y;

    // Rule off: a claim on that branch changes nothing at all.
    expect(departedBranch(false, natural)).toBe(natural);
    // Rule on: the same claim sends it the free way round.
    expect(departedBranch(true, natural)).toBe(other);
  });
});

describe('the capped reroute at a signal stop', () => {
  /**
   * A signal on the west leg, just short of the split. A train held at it has
   * both branches ahead of it and nothing else to do - the exact situation
   * SPEC2 M15 describes.
   */
  function signalBeforeTheSplit(bench: Bench): void {
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: SPLIT_X - 1,
      y: MAIN_Y,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
  }

  /**
   * Run until the train stands still on open line, or give up.
   *
   * The shed tile is excluded deliberately: a train that has been given a
   * route but has not accelerated yet is standing still mid-route too, and
   * counting that as "held" would put the departure run inside the measured
   * window. The signal stop the M15 reroute is about is the one out on the
   * line, and it is a train at speed zero in `Driving` rather than in
   * `WaitingForPath` - the lookahead brakes it short of the red, so it never
   * reaches the tile-boundary gate (D-157's observation, met again).
   */
  function runUntilHeld(bench: Bench, limit: number): boolean {
    const vehicles = bench.world.vehicles;
    const shed = bench.world.map.tileIndex(10, MAIN_Y);
    for (let i = 0; i < limit; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.waitingSinceTick[0]! >= 0 && vehicles.tileIndex[0] !== shed) return true;
    }
    return false;
  }

  it('reroutes a held train onto the branch that has come free', () => {
    const bench = flatWorld(true, false);
    crewedDiamond(bench);
    signalBeforeTheSplit(bench);

    // Claim the south branch first, so the departure route goes north...
    claimBranch(bench.world, SOUTH_Y, FOREIGN);
    startTowardsPlatform(bench);
    const vehicles = bench.world.vehicles;
    expect(branchOf(bench.world, vehicles.paths[0]!, vehicles.pathLength[0]!)).toBe(NORTH_Y);

    // ...then swap the claims while the train is still in the shed. Its route
    // now runs into an occupied branch and the free way round is the other one.
    releaseBranch(bench.world, SOUTH_Y);
    claimBranch(bench.world, NORTH_Y, FOREIGN);

    expect(runUntilHeld(bench, 2_000)).toBe(true);
    expect(branchOf(bench.world, vehicles.paths[0]!, vehicles.pathLength[0]!)).toBe(NORTH_Y);

    // Where it actually DROVE, not what it planned: the plan is gone again by
    // the time it reaches the platform, and the plan is not the promise.
    const rows = new Set<number>();
    let furthestX = 0;
    for (let i = 0; i < 2_000; i++) {
      bench.world.step(bench.queue, null);
      const tile = vehicles.tileIndex[0]!;
      rows.add((tile / SIZE) | 0);
      furthestX = Math.max(furthestX, tile % SIZE);
    }

    expect(rows.has(SOUTH_Y)).toBe(true);
    expect(rows.has(NORTH_Y)).toBe(false);
    // And it is running, not merely holding a nicer plan: it got past the
    // merge, which only the free branch leads to.
    expect(furthestX).toBeGreaterThan(MERGE_X);
  });

  it('searches at most once per interval while held, and never with the rule off', () => {
    for (const occupancyPenalty of [true, false]) {
      const bench = flatWorld(occupancyPenalty, false);
      crewedDiamond(bench);
      signalBeforeTheSplit(bench);

      // BOTH branches claimed: there is no way round, so the train stays held
      // for the whole window and every search is a search that changed nothing
      // - which is exactly the storm the cap exists to bound.
      claimBranch(bench.world, NORTH_Y, FOREIGN);
      claimBranch(bench.world, SOUTH_Y, FOREIGN);
      startTowardsPlatform(bench);
      expect(runUntilHeld(bench, 2_000)).toBe(true);

      const window = 1_000;
      const spy = vi.spyOn(bench.world.railPathfinder, 'find');
      for (let i = 0; i < window; i++) bench.world.step(bench.queue, null);
      const searches = spy.mock.calls.length;
      spy.mockRestore();

      // Standing still for the whole window, so every one of those thousand
      // ticks was a tick an uncapped reroute would have searched on.
      expect(bench.world.vehicles.speedMs[0]).toBe(0);
      expect(bench.world.vehicles.state[0]).not.toBe(VehicleState.Stopped);
      expect(bench.world.vehicles.waitingSinceTick[0]!).toBeGreaterThanOrEqual(0);

      if (!occupancyPenalty) {
        expect(searches, 'rule off: the reroute must never run').toBe(0);
        continue;
      }
      // Exactly the cadence: one search per interval, no more and not none.
      expect(searches).toBeGreaterThan(0);
      expect(searches).toBeLessThanOrEqual(
        Math.ceil(window / RAIL_SIGNAL_REPATH_INTERVAL_TICKS) + 1,
      );
      // The floor the cap buys, stated as a ratio rather than a count: two
      // orders of magnitude below one search per tick.
      expect(searches).toBeLessThan(window / 10);
    }
  });

  it('does not search before the minimum wait has passed', () => {
    const bench = flatWorld(true, false);
    crewedDiamond(bench);
    signalBeforeTheSplit(bench);
    claimBranch(bench.world, NORTH_Y, FOREIGN);
    claimBranch(bench.world, SOUTH_Y, FOREIGN);
    startTowardsPlatform(bench);
    expect(runUntilHeld(bench, 2_000)).toBe(true);

    const heldSince = bench.world.vehicles.waitingSinceTick[0]!;
    const spy = vi.spyOn(bench.world.railPathfinder, 'find');
    while (bench.world.tick - heldSince < RAIL_SIGNAL_REPATH_MIN_WAIT_TICKS) {
      bench.world.step(bench.queue, null);
    }
    const searches = spy.mock.calls.length;
    spy.mockRestore();
    expect(searches).toBe(0);
  });
});
