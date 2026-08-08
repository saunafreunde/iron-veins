import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import {
  DEADLOCK_WARN_TICKS,
  Difficulty,
  MapClimate,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType, TrackDir } from '../../src/sim/map/track';
import { TileMap } from '../../src/sim/map/TileMap';
import { analyseDeadlocks } from '../../src/sim/net/deadlock';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';
import { ALL_RUNNING_TICK, complexNetwork } from '../helpers/regressionNetwork';

/**
 * The deadlock CYCLE detector of SPEC2 M15 (D-186) - the upgrade of the 9.3
 * warning from "this train is stuck" to "these trains are stuck ON EACH
 * OTHER, here".
 *
 * Three things are tested, and the split between them is deliberate:
 *
 *  - the nose-to-nose case of D-059 END TO END, with two trains that really
 *    drive into each other on real track. That is the evidence that the
 *    waiting graph describes something the simulation can produce;
 *  - a three-train ring CONSTRUCTED on the graph itself. A three-way ring
 *    needs a geometry whose own quirks would then be doing the arguing, so
 *    the trains and their claims are placed by hand and the detector is asked
 *    the one question it exists to answer;
 *  - the M4 regression network, run in full, where it must find NOTHING. A
 *    detector that fires on twenty trains queueing round a busy one-way ring
 *    would be worse than none - D-084 measured that queue at 3,300 ticks of
 *    standstill and it is congestion, not deadlock.
 *
 * And in every case: NO AUTO-FIX (SPEC.md Fehler 18). The trains are still
 * stuck after the detector has spoken.
 */

const SIZE = 128;
const GROUND = 5;
const RAILBUS = 1061;

/** The single-track line the two trains meet on, and its signal spacing. */
const LINE_Y = 20;
const WEST_X = 10;
const EAST_X = 60;
const SIGNAL_XS = [20, 30, 40, 50] as const;

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

function flatWorld(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 1815,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Eingleisig AG',
      companyColorIndex: 2,
    },
    { map, towns: [], industries: [], seedUsed: 1815 },
  );
  world.company.cashCt = 100_000_000_00;
  return { world, queue: new CommandQueue() };
}

/**
 * One single-track line with a shed and a platform at either end, signalled
 * into five sections - the shape D-059 names as the stated deadlock: two
 * trains meeting nose to nose on single track, with no passing loop and
 * nothing in the pathfinder that could avoid it (the M15 occupancy rule is
 * OFF here, as it is in every world that did not ask for it).
 */
function singleTrackLine(bench: Bench): void {
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: WEST_X,
    y1: LINE_Y,
    x2: EAST_X,
    y2: LINE_Y,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  for (const x of SIGNAL_XS) {
    run(bench, {
      kind: CommandKind.BuildSignal,
      x,
      y: LINE_Y,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
  }
  for (const [x, kind] of [
    [WEST_X, ModuleKind.RailDepot],
    [WEST_X + 2, ModuleKind.RailPlatform],
    [EAST_X, ModuleKind.RailDepot],
    [EAST_X - 2, ModuleKind.RailPlatform],
  ] as const) {
    run(bench, { kind: CommandKind.BuildRailStop, x, y: LINE_Y, moduleKind: kind });
  }
}

/** The station a platform on this tile belongs to. */
function stationAt(bench: Bench, x: number): number {
  const tile = bench.world.map.tileIndex(x, LINE_Y);
  const station = bench.world.stations.find((candidate) =>
    candidate.modules.some(
      (module) => module.kind === ModuleKind.RailPlatform && module.tileIndex === tile,
    ),
  );
  expect(station, `no station with a platform at ${x}`).toBeDefined();
  return station!.id;
}

describe('two trains nose to nose on single track (D-059)', () => {
  it('is found as a two-train cycle and the message names both trains and both tiles', () => {
    const bench = flatWorld();
    const world = bench.world;
    singleTrackLine(bench);

    const westStation = stationAt(bench, WEST_X + 2);
    const eastStation = stationAt(bench, EAST_X - 2);

    run(bench, { kind: CommandKind.BuyTrain, x: WEST_X, y: LINE_Y, specIds: [RAILBUS] });
    run(bench, { kind: CommandKind.BuyTrain, x: EAST_X, y: LINE_Y, specIds: [RAILBUS] });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: eastStation, load: 1, unload: 0 }],
    });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 1,
      orders: [{ target: 0, targetId: westStation, load: 1, unload: 0 }],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 1, running: true });

    // Long enough that the 9.3 clock has run out on both of them, and that
    // several news days have passed since it did.
    for (let tick = 0; tick < 4 * DEADLOCK_WARN_TICKS; tick++) world.step(bench.queue, null);

    const vehicles = world.vehicles;
    for (const id of [0, 1]) {
      expect(vehicles.waitingSinceTick[id], `train ${id} is not waiting`).toBeGreaterThanOrEqual(0);
      expect(world.tick - vehicles.waitingSinceTick[id]!).toBeGreaterThanOrEqual(
        DEADLOCK_WARN_TICKS,
      );
    }

    const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
    expect(report.cycleCount).toBe(1);
    expect(report.cycleStarts[1]! - report.cycleStarts[0]!).toBe(2);
    const members = [report.cycleMembers[0]!, report.cycleMembers[1]!].sort((a, b) => a - b);
    expect(members).toEqual([0, 1]);
    // Each is waiting for the other, and on track the other really holds.
    expect(report.waitsFor[0]).toBe(1);
    expect(report.waitsFor[1]).toBe(0);
    expect(world.reservations.ownerOf(report.refusedAt[0]!)).toBe(1);
    expect(world.reservations.ownerOf(report.refusedAt[1]!)).toBe(0);
    // The ring is rotated to its lowest id, so the same deadlock always reads
    // the same way whichever train the search reached first.
    expect(report.cycleMembers[0]).toBe(0);

    // The message: one entry, naming EVERY participant and EVERY contested
    // tile - and NOT the vaguer per-train warning for the same trains.
    const network = world.news.all.filter((entry) => entry.messageKey === 'news.deadlockCycle');
    expect(network.length).toBe(1);
    const params = network[0]!.params;
    expect(params['count']).toBe(2);
    expect(String(params['trains'])).toBe('0, 1');
    const size = world.map.size;
    for (const id of [0, 1]) {
      const tile = report.refusedAt[id]!;
      expect(String(params['tiles'])).toContain(`(${tile % size}, ${(tile / size) | 0})`);
    }
    // The click target is a contested tile, so the news panel jumps to the
    // ring rather than to one of its trains.
    expect([report.refusedAt[0]!, report.refusedAt[1]!]).toContain(network[0]!.tileIndex);
    // From the moment the ring was named, the vaguer per-train warning is
    // not written about its members any more - one heading per situation.
    const named = network[0]!.tick;
    expect(
      world.news.all.filter(
        (entry) => entry.messageKey === 'news.trainStuck' && entry.tick >= named,
      ).length,
    ).toBe(0);
    // Both catalogues can say it (the sentence carries three substitutions).
    expect('news.deadlockCycle' in de).toBe(true);
    expect('news.deadlockCycle' in en).toBe(true);

    // NO AUTO-FIX (SPEC.md Fehler 18): a thousand more ticks and the two are
    // exactly where the detector found them.
    const before = [vehicles.tileIndex[0]!, vehicles.tileIndex[1]!];
    for (let tick = 0; tick < 1_000; tick++) world.step(bench.queue, null);
    expect([vehicles.tileIndex[0]!, vehicles.tileIndex[1]!]).toEqual(before);
    for (const id of [0, 1]) {
      expect(vehicles.speedMs[id]).toBe(0);
      // Braked to a stand short of the end of its own claim rather than
      // refused at a tile boundary - D-157's observation, which is exactly
      // why the clock (and this detector) key on standing still rather than
      // on `WaitingForPath`.
      expect([VehicleState.Driving, VehicleState.Braking]).toContain(vehicles.state[id]);
      expect(vehicles.waitingSinceTick[id]).toBeGreaterThanOrEqual(0);
    }
    expect(analyseDeadlocks(world, DEADLOCK_WARN_TICKS).cycleCount).toBe(1);
  });
});

// ------------------------------------------------------- constructed rings

/**
 * Put a train on a route by hand, standing still, holding the tiles behind
 * and under itself, and waiting since tick 0.
 *
 * The detector reads a WAITING GRAPH - route, claim, clock - and this writes
 * exactly that, so a ring of any size can be posed without a fixture whose
 * geometry would then be doing the arguing. The end-to-end test above is what
 * proves the graph is a real state of this simulation.
 */
function stall(world: World, id: number, tiles: readonly number[]): void {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  for (let i = 0; i < tiles.length; i++) path[i] = tiles[i]!;
  vehicles.pathLength[id] = tiles.length;
  // Head on the second tile: the first is the tile its tail still covers, so
  // the claim is [0..1] and the tile it needs next is index 2.
  vehicles.pathIndex[id] = 1;
  vehicles.progressM[id] = 0;
  vehicles.speedMs[id] = 0;
  vehicles.tileIndex[id] = tiles[1]!;
  vehicles.reservedFromIndex[id] = 0;
  vehicles.reservedToIndex[id] = 1;
  vehicles.state[id] = VehicleState.WaitingForPath;
  vehicles.waitingSinceTick[id] = 0;
  world.reservations.set(tiles[0]!, id);
  world.reservations.set(tiles[1]!, id);
}

/**
 * The same placement for a train that HOLDS contested track without waiting
 * for anything: parked, so a step of the world leaves it exactly there (a
 * train in `WaitingForPath` whose way is clear drives off, which would take
 * the fixture with it).
 */
function park(world: World, id: number, tiles: readonly number[]): void {
  stall(world, id, tiles);
  world.vehicles.state[id] = VehicleState.Stopped;
  world.vehicles.waitingSinceTick[id] = -1;
}

/** A world with `count` trains bought and nothing running. */
function parkedTrains(count: number): Bench {
  const bench = flatWorld();
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: WEST_X,
    y1: LINE_Y,
    x2: EAST_X,
    y2: LINE_Y,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: WEST_X,
    y: LINE_Y,
    moduleKind: ModuleKind.RailDepot,
  });
  for (let i = 0; i < count; i++) {
    run(bench, { kind: CommandKind.BuyTrain, x: WEST_X, y: LINE_Y, specIds: [RAILBUS] });
  }
  // The clock is measured against `world.tick`, so the world has to be past
  // the 9.3 threshold for a wait that started at tick 0 to count - and ONE
  // tick short of a day boundary, so a single `step` runs the news pass.
  bench.world.tick = 2 * DEADLOCK_WARN_TICKS - 1;
  expect((bench.world.tick + 1) % TICKS_PER_DAY).toBe(0);
  return bench;
}

describe('a three-train ring', () => {
  it('is found whole, rotated to its lowest id, and named in one message', () => {
    const bench = parkedTrains(3);
    const world = bench.world;
    const at = (x: number, y: number): number => world.map.tileIndex(x, y);

    // Three trains on three lines, each needing the tile the next one is
    // standing on: 0 -> 1 -> 2 -> 0.
    stall(world, 0, [at(20, 40), at(21, 40), at(31, 41)]);
    stall(world, 1, [at(30, 41), at(31, 41), at(41, 42)]);
    stall(world, 2, [at(40, 42), at(41, 42), at(21, 40)]);

    const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
    expect(report.waiterCount).toBe(3);
    expect(report.cycleCount).toBe(1);
    expect([...report.cycleMembers.slice(0, 3)]).toEqual([0, 1, 2]);
    expect(report.inCycle[0]).toBe(1);
    expect(report.inCycle[1]).toBe(1);
    expect(report.inCycle[2]).toBe(1);
    expect(report.waitsFor[0]).toBe(1);
    expect(report.waitsFor[1]).toBe(2);
    expect(report.waitsFor[2]).toBe(0);

    // The message names all three trains and all three contested tiles.
    world.step(bench.queue, null);
    const entries = world.news.all.filter((entry) => entry.messageKey === 'news.deadlockCycle');
    expect(entries.length).toBe(1);
    expect(String(entries[0]!.params['trains'])).toBe('0, 1, 2');
    expect(entries[0]!.params['count']).toBe(3);
    const size = world.map.size;
    for (const id of [0, 1, 2]) {
      const tile = report.refusedAt[id]!;
      expect(String(entries[0]!.params['tiles'])).toContain(
        `(${tile % size}, ${(tile / size) | 0})`,
      );
    }
  });

  it('separates a ring from the queue standing elsewhere on the same day', () => {
    const bench = parkedTrains(5);
    const world = bench.world;
    const at = (x: number, y: number): number => world.map.tileIndex(x, y);

    // The ring.
    stall(world, 0, [at(20, 40), at(21, 40), at(31, 41)]);
    stall(world, 1, [at(30, 41), at(31, 41), at(21, 40)]);
    // And, quite separately, two trains queueing for one tile a parked train
    // is standing on: a queue is not a ring, and the walk must not join them.
    stall(world, 2, [at(50, 44), at(51, 44), at(71, 46)]);
    stall(world, 3, [at(60, 45), at(61, 45), at(71, 46)]);
    park(world, 4, [at(70, 46), at(71, 46), at(72, 46)]);

    const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
    expect(report.waiterCount).toBe(4);
    expect(report.cycleCount).toBe(1);
    expect([...report.cycleMembers.slice(0, 2)]).toEqual([0, 1]);
    expect(report.inCycle[2]).toBe(0);
    expect(report.inCycle[3]).toBe(0);
    // The two queueing trains are refused at the identical tile, which is
    // what makes it a bottleneck rather than two unrelated waits.
    expect(report.refusedAt[3]).toBe(report.refusedAt[2]);
    expect(report.queueLength[2]).toBe(2);
    expect(report.queueLength[0]).toBe(1);

    // One day: one ring message, one bottleneck message, no plain warning.
    world.step(bench.queue, null);
    const keys = world.news.all.map((entry) => entry.messageKey);
    expect(keys.filter((key) => key === 'news.deadlockCycle').length).toBe(1);
    expect(keys.filter((key) => key === 'news.bottleneck').length).toBe(1);
    expect(keys).not.toContain('news.trainStuck');
  });
});

describe('the bottleneck heading', () => {
  it('names a tile two trains are queueing for, instead of warning about each', () => {
    const bench = parkedTrains(3);
    const world = bench.world;
    const at = (x: number, y: number): number => world.map.tileIndex(x, y);

    // Train 0 is parked on the contested tile; trains 1 and 2 converge on it
    // from two branches.
    park(world, 0, [at(20, 40), at(21, 40), at(22, 40)]);
    stall(world, 1, [at(30, 41), at(31, 41), at(21, 40)]);
    stall(world, 2, [at(40, 42), at(41, 42), at(21, 40)]);

    const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
    expect(report.cycleCount).toBe(0);
    expect(report.queueLength[1]).toBe(2);
    expect(report.queueLength[2]).toBe(2);

    world.step(bench.queue, null);

    const keys = world.news.all.map((entry) => entry.messageKey);
    // ONE bottleneck entry for the tile, and no per-train warning about the
    // two trains it already explains.
    expect(keys.filter((key) => key === 'news.bottleneck').length).toBe(1);
    expect(keys).not.toContain('news.trainStuck');
    const entry = world.news.all.find((news) => news.messageKey === 'news.bottleneck')!;
    expect(entry.params['count']).toBe(2);
    expect(entry.tileIndex).toBe(at(21, 40));
    expect('news.bottleneck' in de).toBe(true);
    expect('news.bottleneck' in en).toBe(true);

    // A daily clock must not write a daily sentence (the M8 postOnce rule).
    for (let tick = 0; tick < 3 * TICKS_PER_DAY; tick++) world.step(bench.queue, null);
    expect(world.news.all.filter((news) => news.messageKey === 'news.bottleneck').length).toBe(1);
  });

  it('leaves a single stuck train as the plain 9.3 warning', () => {
    const bench = parkedTrains(2);
    const world = bench.world;
    const at = (x: number, y: number): number => world.map.tileIndex(x, y);

    park(world, 0, [at(20, 40), at(21, 40), at(22, 40)]);
    stall(world, 1, [at(30, 41), at(31, 41), at(21, 40)]);

    world.step(bench.queue, null);

    const keys = world.news.all.map((entry) => entry.messageKey);
    expect(keys).toContain('news.trainStuck');
    expect(keys).not.toContain('news.bottleneck');
    expect(keys).not.toContain('news.deadlockCycle');
  });
});

describe('the M4 regression network', () => {
  it('produces no cycle at any point of the acceptance run', () => {
    const bench = complexNetwork();
    const world = bench.world;

    let sampled = 0;
    for (let tick = 0; tick < ALL_RUNNING_TICK + 5_000; tick++) {
      world.step(bench.queue, null);
      if (world.tick % 250 !== 0) continue;
      sampled++;
      const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
      expect(report.cycleCount, `cycle at tick ${world.tick}`).toBe(0);
    }
    expect(sampled).toBeGreaterThan(30);

    // And nothing in the log either: twenty trains queueing round a one-way
    // ring is congestion (D-084 measured the worst standstill at 3,300
    // ticks), and a detector that called that a deadlock would be worse than
    // no detector at all.
    const keys = world.news.all.map((entry) => entry.messageKey);
    expect(keys).not.toContain('news.deadlockCycle');
  });
});
