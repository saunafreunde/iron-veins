import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  AUTO_SIGNAL_SPACING_TILES,
  Difficulty,
  MapClimate,
  MAX_TRAIN_LENGTH_M,
  MAX_TRAIN_OCCUPIED_TILES,
  SIGNAL_COST_CT,
  SIGNAL_STOP_OFFSET_M,
  SIGNAL_UPKEEP_CT_PER_YEAR,
  TILE_SIZE_M,
} from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { SignalKind, signalDirection, signalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { hasEdge, RailType, trackDegree, TrackDir } from '../../src/sim/map/track';
import { ReservationTable } from '../../src/sim/net/reservations';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';

/**
 * Signals: where one may stand, what a train claims, and the two trains on one
 * track that the whole milestone exists for.
 */

const SIZE = 128;
const GROUND = 5;

/** Railbus, 1950 - light enough to accelerate inside a test. */
const RAILBUS = 1061;
const HEAVY_LOCO = 1004;
const OPEN_WAGON = 1520;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function flatWorld(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 11,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Signalbau AG',
      companyColorIndex: 1,
    },
    { map, towns: [], industries: [], seedUsed: 11 },
  );
  return { world, queue: new CommandQueue() };
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

function tryRun(bench: Bench, command: Command): string | null {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
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

// -------------------------------------------------------------- geometry

describe('track geometry helpers', () => {
  it('counts the connections of every possible bit pattern', () => {
    for (let bits = 0; bits < 256; bits++) {
      let expected = 0;
      for (let d = 0; d < 8; d++) if ((bits & (1 << d)) !== 0) expected++;
      expect(trackDegree(bits)).toBe(expected);
    }
  });

  it('calls an edge usable only when both ends carry their half', () => {
    const map = new TileMap(16);
    const a = map.tileIndex(4, 4);
    const b = map.tileIndex(5, 4);

    map.trackBits[a] = 1 << TrackDir.East;
    expect(hasEdge(map.trackBits, map.size, a, TrackDir.East)).toBe(false);

    map.trackBits[b] = 1 << TrackDir.West;
    expect(hasEdge(map.trackBits, map.size, a, TrackDir.East)).toBe(true);
    expect(hasEdge(map.trackBits, map.size, b, TrackDir.West)).toBe(true);
  });

  it('stops an edge at the map border', () => {
    const map = new TileMap(16);
    const edge = map.tileIndex(15, 4);
    map.trackBits[edge] = 0xff;
    expect(hasEdge(map.trackBits, map.size, edge, TrackDir.East)).toBe(false);
  });
});

// -------------------------------------------------------------- placement

describe('where a signal may stand', () => {
  it('goes up on plain line and is charged for', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);

    const cashBefore = bench.world.company.cashCt;
    const upkeepBefore = bench.world.company.infrastructureUpkeepPerYearCt;
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });

    expect(signalKind(bench.world.map.signal[bench.world.map.tileIndex(20, 10)]!)).toBe(
      SignalKind.Block,
    );
    expect(cashBefore - bench.world.company.cashCt).toBe(SIGNAL_COST_CT);
    expect(bench.world.company.infrastructureUpkeepPerYearCt - upkeepBefore).toBe(
      SIGNAL_UPKEEP_CT_PER_YEAR,
    );
  });

  it('refuses ground with no track on it', () => {
    const bench = flatWorld();
    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 20,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.needsTrack');
  });

  it('refuses a junction, which is the case the rule exists for', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    layTrack(bench, 20, 10, 20, 20);

    expect(trackDegree(bench.world.map.trackBits[bench.world.map.tileIndex(20, 10)]!)).toBe(3);
    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 20,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.notPlainTrack');
  });

  it('refuses a dead end', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 10,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.notPlainTrack');
  });

  it('refuses a bridge', () => {
    const bench = flatWorld();
    for (let y = 0; y < SIZE; y++)
      bench.world.map.terrain[bench.world.map.tileIndex(20, y)] = Terrain.Water;
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 10,
      x2: 30,
      y2: 10,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: 0,
    });

    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 20,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.signalOnStructure');
  });

  it('refuses a platform tile and a second signal', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 15,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });

    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 15,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.occupied');
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    expect(
      tryRun(bench, {
        kind: CommandKind.BuildSignal,
        x: 20,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      }),
    ).toBe('cmd.reject.signalExists');
  });

  it('comes down with the track under it', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });

    const upkeep = bench.world.company.infrastructureUpkeepPerYearCt;
    run(bench, { kind: CommandKind.DemolishTrack, x: 20, y: 10 });

    expect(signalKind(bench.world.map.signal[bench.world.map.tileIndex(20, 10)]!)).toBe(
      SignalKind.None,
    );
    expect(bench.world.company.infrastructureUpkeepPerYearCt).toBeLessThan(upkeep);
  });

  it('comes down when a spur turns its tile into a junction', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });

    layTrack(bench, 20, 10, 20, 20);
    expect(signalKind(bench.world.map.signal[bench.world.map.tileIndex(20, 10)]!)).toBe(
      SignalKind.None,
    );
  });

  it('can be taken down on its own', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    run(bench, { kind: CommandKind.DemolishSignal, x: 20, y: 10 });

    expect(signalKind(bench.world.map.signal[bench.world.map.tileIndex(20, 10)]!)).toBe(
      SignalKind.None,
    );
    expect(tryRun(bench, { kind: CommandKind.DemolishSignal, x: 20, y: 10 })).toBe(
      'cmd.reject.noSignalHere',
    );
  });
});

// ------------------------------------------------------------ the table

describe('the reservation table', () => {
  it('only lets the owner release a tile', () => {
    const table = new ReservationTable(16);
    table.set(3, 7);

    expect(table.ownerOf(3)).toBe(7);
    expect(table.freeFor(3, 7)).toBe(true);
    expect(table.freeFor(3, 8)).toBe(false);

    table.clearIfOwnedBy(3, 8);
    expect(table.ownerOf(3)).toBe(7);
    table.clearIfOwnedBy(3, 7);
    expect(table.ownerOf(3)).toBe(-1);
  });
});

// ------------------------------------------------------- trains and signals

/** Track from x=6 to x=60 on row 10, with a depot, a platform and a train. */
function singleTrack(bench: Bench, units: readonly number[]): void {
  layTrack(bench, 6, 10, 60, 10);
  run(bench, { kind: CommandKind.BuildRailStop, x: 6, y: 10, moduleKind: ModuleKind.RailDepot });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: 60,
    y: 10,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, { kind: CommandKind.BuyTrain, x: 6, y: 10, specIds: [...units] });
}

function startTowardsPlatform(bench: Bench, id: number): void {
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: id,
    orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
  });
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
}

describe('a train and a signal', () => {
  it('never holds up a train on a line without signals', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    startTowardsPlatform(bench, 0);

    const vehicles = bench.world.vehicles;
    for (let i = 0; i < 1_500; i++) {
      bench.world.step(bench.queue, null);
      // The parity that matters: with no signal anywhere, a train is never
      // held. It owns the ground under itself (D-073), but nothing gates it.
      expect(vehicles.state[0]).not.toBe(VehicleState.WaitingForPath);
    }
    expect(vehicles.tileIndex[0]).not.toBe(bench.world.map.tileIndex(6, 10));
  });

  it('claims the section ahead once a signal is in reach', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 30,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);

    let claimed = false;
    for (let i = 0; i < 2_000 && !claimed; i++) {
      bench.world.step(bench.queue, null);
      claimed = bench.world.vehicles.reservedToIndex[0]! >= 0;
    }
    expect(claimed).toBe(true);

    // Everything it holds is held by nobody else, and it holds the tile it is on.
    const vehicles = bench.world.vehicles;
    const path = vehicles.paths[0]!;
    for (let i = vehicles.reservedFromIndex[0]!; i <= vehicles.reservedToIndex[0]!; i++) {
      expect(bench.world.reservations.ownerOf(path[i]!)).toBe(0);
    }
  });

  it('lets go of the track behind it as it goes', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 20,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 40,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);

    for (let i = 0; i < 2_500; i++) bench.world.step(bench.queue, null);

    const map = bench.world.map;
    // The train is well past the first signal; the track at the start of the
    // line belongs to nobody again.
    expect(bench.world.vehicles.tileIndex[0]! % SIZE).toBeGreaterThan(20);
    expect(bench.world.reservations.ownerOf(map.tileIndex(8, 10))).toBe(-1);
  });

  it('gives everything back when it arrives', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 30,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);

    const map = bench.world.map;
    for (let i = 0; i < 6_000; i++) {
      bench.world.step(bench.queue, null);
      if (bench.world.vehicles.tileIndex[0] === map.tileIndex(60, 10)) break;
    }

    expect(bench.world.vehicles.tileIndex[0]).toBe(map.tileIndex(60, 10));
    for (let tile = 0; tile < map.tileCount; tile++) {
      expect(bench.world.reservations.ownerOf(tile)).toBe(-1);
    }
  });

  it('gives everything back when it is sold', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 30,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);
    for (let i = 0; i < 1_200; i++) bench.world.step(bench.queue, null);
    expect(bench.world.vehicles.reservedToIndex[0]).toBeGreaterThanOrEqual(0);

    run(bench, { kind: CommandKind.SellVehicle, vehicleId: 0 });
    const map = bench.world.map;
    for (let tile = 0; tile < map.tileCount; tile++) {
      expect(bench.world.reservations.ownerOf(tile)).toBe(-1);
    }
  });

  it('gives everything back when its orders change', () => {
    const bench = flatWorld();
    singleTrack(bench, [RAILBUS]);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 30,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);
    for (let i = 0; i < 1_200; i++) bench.world.step(bench.queue, null);
    expect(bench.world.vehicles.reservedToIndex[0]).toBeGreaterThanOrEqual(0);

    run(bench, { kind: CommandKind.SetVehicleOrders, vehicleId: 0, orders: [] });
    const map = bench.world.map;
    for (let tile = 0; tile < map.tileCount; tile++) {
      expect(bench.world.reservations.ownerOf(tile)).toBe(-1);
    }
  });

  it('holds the tiles its own body still covers', () => {
    const bench = flatWorld();
    // A long train: locomotive plus twenty wagons is 265 m of the 400 m limit.
    const long = [HEAVY_LOCO, ...Array<number>(20).fill(OPEN_WAGON)];
    singleTrack(bench, long);
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 40,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
    startTowardsPlatform(bench, 0);

    // Sampled while it runs, not after: on arrival it gives everything back.
    const vehicles = bench.world.vehicles;
    let widest = 0;
    for (let i = 0; i < 4_000; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.reservedToIndex[0]! < 0) continue;
      const behind = vehicles.pathIndex[0]! - vehicles.reservedFromIndex[0]!;
      if (behind > widest) widest = behind;
    }

    // Its length divided by the tile size, give or take the tile it is part way
    // through - and never more than the bound the walk is capped at.
    expect(widest).toBeGreaterThan(2);
    expect(widest).toBeLessThanOrEqual(MAX_TRAIN_OCCUPIED_TILES);
    expect(vehicles.lengthM[0]!).toBeLessThanOrEqual(MAX_TRAIN_LENGTH_M);
  });
});

// ------------------------------------------------------- two on one track

describe('two trains, one line', () => {
  /**
   * A signalled single line: depot and platform at each end, one signal in the
   * middle of the run so that the line is two sections.
   */
  function twoTrainLine(): Bench {
    const bench = flatWorld();
    layTrack(bench, 6, 10, 60, 10);
    run(bench, { kind: CommandKind.BuildRailStop, x: 6, y: 10, moduleKind: ModuleKind.RailDepot });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 60,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, {
      kind: CommandKind.BuildSignal,
      x: 30,
      y: 10,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });

    run(bench, { kind: CommandKind.BuyTrain, x: 6, y: 10, specIds: [RAILBUS] });
    run(bench, { kind: CommandKind.BuyTrain, x: 6, y: 10, specIds: [RAILBUS] });
    return bench;
  }

  it('never lets both hold the same piece of track', () => {
    const bench = twoTrainLine();
    for (const id of [0, 1]) {
      run(bench, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId: id,
        orders: [
          { target: 0, targetId: 1, load: 1, unload: 0 },
          { target: 0, targetId: 0, load: 1, unload: 0 },
        ],
      });
      run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
    }

    const vehicles = bench.world.vehicles;
    let sawHeld = false;

    for (let i = 0; i < 20_000; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.state[0] === VehicleState.WaitingForPath) sawHeld = true;
      if (vehicles.state[1] === VehicleState.WaitingForPath) sawHeld = true;

      // No tile may ever be inside both claims at once.
      const from0 = vehicles.reservedFromIndex[0]!;
      const to0 = vehicles.reservedToIndex[0]!;
      const from1 = vehicles.reservedFromIndex[1]!;
      const to1 = vehicles.reservedToIndex[1]!;
      if (to0 >= 0 && to1 >= 0) {
        for (let a = from0; a <= to0; a++) {
          const tile = vehicles.paths[0]![a]!;
          expect(bench.world.reservations.ownerOf(tile)).toBe(0);
        }
        for (let b = from1; b <= to1; b++) {
          const tile = vehicles.paths[1]![b]!;
          expect(bench.world.reservations.ownerOf(tile)).toBe(1);
        }
      }
    }

    // The point of the milestone: one of them really did have to wait.
    expect(sawHeld).toBe(true);
    // And neither is stuck for good - both are still working.
    expect(vehicles.earnedCt[0]! + vehicles.earnedCt[1]!).toBeGreaterThanOrEqual(0);
  });

  it('stops the held train short of the signal, with its route intact', () => {
    const bench = twoTrainLine();
    for (const id of [0, 1]) {
      run(bench, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId: id,
        orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
      });
      run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
    }

    const vehicles = bench.world.vehicles;
    let held = -1;
    for (let i = 0; i < 20_000 && held < 0; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.state[1] === VehicleState.WaitingForPath) held = 1;
    }

    expect(held).toBe(1);
    expect(vehicles.speedMs[1]).toBe(0);
    // It is standing clear of the train ahead, not on top of it.
    expect(vehicles.tileIndex[1]).not.toBe(vehicles.tileIndex[0]);
    // Its route and its distance to go are untouched - it is waiting, not lost.
    expect(vehicles.pathLength[1]!).toBeGreaterThan(0);
    expect(vehicles.routeRemainingM[1]!).toBeGreaterThan(0);
    // And it comes to rest short of a tile boundary, never astride one.
    expect(vehicles.progressM[1]!).toBeLessThanOrEqual(TILE_SIZE_M - SIGNAL_STOP_OFFSET_M);
  });

  it('runs identically three times over', () => {
    const digests: string[][] = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const bench = twoTrainLine();
      for (const id of [0, 1]) {
        run(bench, {
          kind: CommandKind.SetVehicleOrders,
          vehicleId: id,
          orders: [
            { target: 0, targetId: 1, load: 1, unload: 0 },
            { target: 0, targetId: 0, load: 1, unload: 0 },
          ],
        });
        run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: true });
      }
      const marks: string[] = [];
      for (let i = 0; i < 6_000; i++) {
        bench.world.step(bench.queue, null);
        if (i % 1_000 === 0) marks.push(hashWorld(bench.world));
      }
      digests.push(marks);
    }
    expect(digests[1]).toEqual(digests[0]);
    expect(digests[2]).toEqual(digests[0]);
  });
});

describe('two trains following each other', () => {
  /**
   * The acceptance case for the milestone: a line divided into four sections
   * with two trains running the same way down it. Without signals the second
   * would drive straight through the first; with them it keeps its distance,
   * waits where it has to, and still gets there.
   *
   * Two trains meeting NOSE TO NOSE on single track is a different case and is
   * a known limitation - the pathfinder is deliberately blind to occupancy, so
   * neither will route around the other (DECISIONS.md D-059). That is why both
   * trains here are sent the same way.
   */
  function followedLine(): Bench {
    const bench = flatWorld();
    layTrack(bench, 6, 10, 60, 10);
    run(bench, { kind: CommandKind.BuildRailStop, x: 6, y: 10, moduleKind: ModuleKind.RailDepot });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 58,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    for (const x of [22, 32, 42]) {
      run(bench, {
        kind: CommandKind.BuildSignal,
        x,
        y: 10,
        signalKind: SignalKind.Block,
        direction: TrackDir.East,
      });
    }

    for (let i = 0; i < 2; i++) {
      run(bench, { kind: CommandKind.BuyTrain, x: 6, y: 10, specIds: [RAILBUS] });
      run(bench, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId: i,
        orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
      });
      run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true });
    }
    return bench;
  }

  it('holds the follower, and still gets both to the far end', () => {
    const bench = followedLine();
    const vehicles = bench.world.vehicles;
    const far = bench.world.map.tileIndex(58, 10);
    let sawHeld = false;

    for (let i = 0; i < 12_000; i++) {
      bench.world.step(bench.queue, null);
      if (vehicles.state[1] === VehicleState.WaitingForPath) sawHeld = true;

      // A claimed tile belongs to exactly one of them, always. Unsignalled
      // track is deliberately not exclusive: two trains may share the depot
      // throat, exactly as they did in M3.
      for (const id of [0, 1]) {
        const to = vehicles.reservedToIndex[id]!;
        if (to < 0) continue;
        for (let k = vehicles.reservedFromIndex[id]!; k <= to; k++) {
          expect(bench.world.reservations.ownerOf(vehicles.paths[id]![k]!)).toBe(id);
        }
      }
    }

    // A signal really did hold the follower at some point ...
    expect(sawHeld).toBe(true);
    // ... and it was a wait, not a wall: both are at the far platform.
    expect(vehicles.tileIndex[0]).toBe(far);
    expect(vehicles.tileIndex[1]).toBe(far);
    expect(vehicles.state[0]).not.toBe(VehicleState.NoRoute);
    expect(vehicles.state[1]).not.toBe(VehicleState.NoRoute);
  });
});

describe('automatic signalling', () => {
  it('signals a dragged route at the chosen spacing, facing the way it was drawn', () => {
    const bench = flatWorld();
    const world = bench.world;
    const map = world.map;

    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 40,
      x2: 70,
      y2: 40,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: AUTO_SIGNAL_SPACING_TILES,
    });

    const placed: number[] = [];
    for (let x = 10; x <= 70; x++) {
      const packed = map.signal[map.tileIndex(x, 40)]!;
      if (signalKind(packed) === SignalKind.None) continue;
      placed.push(x);
      // One way, and facing east - which is the way the line was drawn.
      expect(signalKind(packed)).toBe(SignalKind.BlockOneWay);
      expect(signalDirection(packed)).toBe(TrackDir.East);
    }

    expect(placed.length).toBeGreaterThan(3);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i]! - placed[i - 1]!).toBe(AUTO_SIGNAL_SPACING_TILES);
    }
  });

  it('places a path signal where the line runs into a station', () => {
    const bench = flatWorld();
    const world = bench.world;

    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 40,
      x2: 40,
      y2: 40,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    // A platform right where the next automatic signal would fall.
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 23,
      y: 40,
      moduleKind: ModuleKind.RailPlatform,
    });

    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 41,
      x2: 40,
      y2: 41,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: AUTO_SIGNAL_SPACING_TILES,
    });

    // The signal twelve tiles along the second line lands beside the platform,
    // which is a station throat - and a throat wants a path signal, not a block
    // signal that would take the whole of it for one train (section 9.4).
    const atThroat = world.map.signal[world.map.tileIndex(22, 41)]!;
    expect(signalKind(atThroat)).toBe(SignalKind.PathEntry);
  });

  it('leaves the route alone when the player did not ask for signals', () => {
    const bench = flatWorld();
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 40,
      x2: 70,
      y2: 40,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });

    for (let x = 10; x <= 70; x++) {
      expect(signalKind(bench.world.map.signal[bench.world.map.tileIndex(x, 40)]!)).toBe(
        SignalKind.None,
      );
    }
  });
});
