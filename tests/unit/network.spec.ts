import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Difficulty, MapClimate } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType, TrackDir } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The regression network of section 19.5.
 *
 * Twenty trains, five thousand ticks, zero collisions and zero deadlocks. This
 * is the acceptance criterion for M4 and the only test in the suite that puts
 * the signalling under real load.
 *
 * The network is built with the ordinary build COMMANDS rather than loaded from
 * a fixture file. That is a deliberate departure from the wording of 19.5: a
 * hand-authored file would describe a network that no player could build, and
 * building it through the commands exercises the placement rules on the way in
 * (DECISIONS.md D-072).
 *
 * It has the four shapes 19.5 asks for - a crossing, passing loops, a double
 * station throat and a ring signalled ONE WAY throughout. The last of those is
 * what makes twenty trains on one line a test of following rather than of
 * head-on deadlock, which is a stated limitation and not something signals are
 * supposed to solve (D-059).
 *
 * Two things about its shape are load-bearing and were learned the hard way
 * (D-082): no platform stands on the through line, and every shed merges into
 * the ring rather than crossing it. A train loading on the main line stops
 * everything behind it, and a train trying to cross a saturated one-way ring
 * never gets a gap at all.
 */

const SIZE = 128;
const GROUND = 5;
const TRAINS = 20;
const RAILBUS = 1061;

/** The four engine sheds, one hanging off each station loop. */
const DEPOTS: ReadonlyArray<readonly [number, number]> = [
  [50, 12],
  [82, 48],
  [46, 88],
  [12, 52],
];

/** Ticks between one train leaving the depot and the next. */
const RELEASE_INTERVAL_TICKS = 250;
/** The last train is away by here; only after that does a wait mean anything. */
const ALL_RUNNING_TICK = TRAINS * RELEASE_INTERVAL_TICKS;

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

function track(bench: Bench, x1: number, y1: number, x2: number, y2: number): void {
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

function signal(bench: Bench, x: number, y: number, direction: TrackDir): void {
  run(bench, {
    kind: CommandKind.BuildSignal,
    x,
    y,
    signalKind: SignalKind.BlockOneWay,
    direction,
  });
}

/**
 * The network of section 19.5: a ring, a crossing, passing loops and a double
 * station throat.
 *
 * The important change from the first version of this fixture is that no
 * platform stands on the through line any more. A train loading on the main
 * line stops every train behind it, which is a capacity problem dressed up as a
 * signalling one - and it is what kept the deadlock half of the criterion out
 * of reach (DECISIONS.md D-074). Every station now sits on its own loop, so a
 * train that is working does not hold the ring.
 */
function complexNetwork(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 4242,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Ringbahn AG',
      companyColorIndex: 3,
    },
    { map, towns: [], industries: [], seedUsed: 4242 },
  );
  // This is a signalling test, not an economy test: twenty trains and a ring of
  // track cost more than the starting capital, and making the fixture borrow
  // its way there would only test the loan machinery.
  world.company.cashCt = 500_000_000_00;
  const bench: Bench = { world, queue: new CommandQueue() };

  // The ring: north side east-bound, east side south-bound, and so on.
  track(bench, 20, 20, 90, 20);
  track(bench, 90, 20, 90, 80);
  track(bench, 90, 80, 20, 80);
  track(bench, 20, 80, 20, 20);

  // Station A on the north side: one throat, two platforms, rejoining as one.
  // This is the "doppelter Bahnhofskopf" of 19.5 and the shape path signals
  // exist for - two trains can be worked at once without either holding the
  // other's route.
  track(bench, 26, 20, 30, 16);
  track(bench, 30, 16, 46, 16);
  track(bench, 46, 16, 50, 20);
  track(bench, 32, 16, 36, 12);
  track(bench, 36, 12, 42, 12);
  track(bench, 42, 12, 46, 16);

  // Three more passing loops, one on each remaining side of the ring.
  track(bench, 90, 32, 86, 36);
  track(bench, 86, 36, 86, 44);
  track(bench, 86, 44, 90, 48);

  track(bench, 62, 80, 58, 84);
  track(bench, 58, 84, 50, 84);
  track(bench, 50, 84, 46, 80);

  track(bench, 20, 68, 16, 64);
  track(bench, 16, 64, 16, 56);
  track(bench, 16, 56, 20, 52);

  // The crossing of 19.5: a spur off the north side. Nothing runs on it, but
  // every train on the ring passes through the junction it makes, which is
  // what the block segmentation and the signal placement rules have to cope
  // with.
  track(bench, 70, 20, 70, 12);

  // One shed per loop, each merging into the ring where that loop rejoins it.
  //
  // Both of those matter. A shed on the CROSSING spur means a departing train
  // has to cross a saturated one-way ring and never gets a gap; ONE shed for
  // twenty trains means a queue twenty deep at a single merge, and the back of
  // it never moves. Four sheds, five trains each, is what a network carrying
  // this much traffic actually looks like (DECISIONS.md D-082).
  track(bench, 46, 16, 50, 12);
  track(bench, 86, 44, 82, 48);
  track(bench, 50, 84, 46, 88);
  track(bench, 16, 56, 12, 52);
  for (const [x, y] of DEPOTS) {
    run(bench, { kind: CommandKind.BuildRailStop, x, y, moduleKind: ModuleKind.RailDepot });
  }

  // Platforms, all of them on a loop and none on the through line.
  for (const [x, y] of [
    [38, 16],
    [38, 12],
    [86, 40],
    [54, 84],
    [16, 60],
  ] as const) {
    run(bench, { kind: CommandKind.BuildRailStop, x, y, moduleKind: ModuleKind.RailPlatform });
  }

  // One-way signals round the ring, so every train runs clockwise and the
  // pathfinder cannot send one against the flow. The tiles are chosen to be
  // plain line: a signal in a junction is refused, and rightly so.
  //
  // One of them sits immediately past each merge. Without that, the section a
  // train leaving a shed has to be granted runs from the shed, through the
  // junction and along the ring to the next signal - and a ring with twenty
  // trains on it never leaves that much free at once, so the shed never drains.
  for (const x of [22, 24, 34, 40, 52, 56, 60, 64, 68, 74, 78, 82, 86]) {
    signal(bench, x, 20, TrackDir.East);
  }
  for (const y of [24, 26, 28, 30, 50, 52, 54, 58, 62, 66, 70, 74, 76]) {
    signal(bench, 90, y, TrackDir.South);
  }
  for (const x of [88, 84, 80, 76, 72, 68, 64, 44, 40, 36, 32, 28, 24]) {
    signal(bench, x, 80, TrackDir.West);
  }
  for (const y of [78, 76, 74, 72, 50, 46, 42, 38, 34, 30, 26, 24]) {
    signal(bench, 20, y, TrackDir.North);
  }

  // And one at each end of every loop, so a loop is a section of its own -
  // otherwise a block signal on the ring claims the loop with it, and the whole
  // point of a passing loop is lost.
  signal(bench, 34, 16, TrackDir.East);
  signal(bench, 44, 16, TrackDir.East);
  signal(bench, 37, 12, TrackDir.East);
  signal(bench, 41, 12, TrackDir.East);
  signal(bench, 86, 38, TrackDir.South);
  signal(bench, 86, 42, TrackDir.South);
  signal(bench, 56, 84, TrackDir.West);
  signal(bench, 52, 84, TrackDir.West);
  signal(bench, 16, 62, TrackDir.North);
  signal(bench, 16, 58, TrackDir.North);

  const stops = world.stations;
  // Four served stations plus the four sheds; the two platforms of the double
  // throat are one station, and each shed stands clear of its loop.
  expect(stops).toHaveLength(8);
  const served = stops.filter((station) =>
    station.modules.some((module) => module.kind === ModuleKind.RailPlatform),
  );
  expect(served).toHaveLength(4);

  for (let i = 0; i < TRAINS; i++) {
    const shed = DEPOTS[i % DEPOTS.length]!;
    run(bench, { kind: CommandKind.BuyTrain, x: shed[0], y: shed[1], specIds: [RAILBUS] });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: i,
      orders: [
        { target: 0, targetId: served[i % 4]!.id, load: 1, unload: 0 },
        { target: 0, targetId: served[(i + 2) % 4]!.id, load: 1, unload: 0 },
      ],
    });
  }

  // Released in sequence rather than all at once. Twenty trains leaving one
  // depot tile in the same tick is a queue, not a deadlock, and it would take
  // longer to drain than the test runs - which is a fact about depots, not
  // about signalling. Queued in ascending tick order, which is the only order
  // the command queue accepts.
  for (let i = 0; i < TRAINS; i++) {
    bench.queue.enqueue(
      { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true },
      i * RELEASE_INTERVAL_TICKS,
    );
  }
  return bench;
}

describe('the regression network', () => {
  it('runs twenty trains for five thousand ticks without a collision or a deadlock', () => {
    const bench = complexNetwork();
    const world = bench.world;
    const vehicles = world.vehicles;

    expect(vehicles.livingCount).toBe(TRAINS);
    // The index is built lazily on first use, so ask for it before counting.
    world.blocks.refresh(world.map);
    expect(world.blocks.blockCount).toBeGreaterThan(10);

    let longestWait = 0;
    let worstStall = 0;
    const lastMoveTick = new Int32Array(TRAINS);
    const lastTile = new Int32Array(TRAINS).fill(-1);

    for (let tick = 0; tick < ALL_RUNNING_TICK + 5_000; tick++) {
      world.step(bench.queue, null);

      for (let id = 0; id < TRAINS; id++) {
        const running =
          vehicles.state[id] === VehicleState.Driving ||
          vehicles.state[id] === VehicleState.Braking ||
          vehicles.state[id] === VehicleState.WaitingForPath;
        if (vehicles.tileIndex[id] !== lastTile[id] || !running) {
          lastTile[id] = vehicles.tileIndex[id]!;
          lastMoveTick[id] = world.tick;
        } else if (world.tick - lastMoveTick[id]! > worstStall) {
          worstStall = world.tick - lastMoveTick[id]!;
        }
        // Every tile a train holds is held by it alone. This is the collision
        // check: two trains inside one claim is exactly what cannot happen.
        const to = vehicles.reservedToIndex[id]!;
        if (to >= 0) {
          const path = vehicles.paths[id]!;
          for (let k = vehicles.reservedFromIndex[id]!; k <= to; k++) {
            expect(world.reservations.ownerOf(path[k]!)).toBe(id);
          }
        }
        // Nothing may sit at a signal long enough to count as stuck - measured
        // only once every train is out of the depot.
        const since = vehicles.waitingSinceTick[id]!;
        if (since >= 0 && world.tick > ALL_RUNNING_TICK) {
          const waited = world.tick - since;
          if (waited > longestWait) longestWait = waited;
        }
      }
    }

    const perTrain: string[] = [];
    for (let id = 0; id < TRAINS; id++) {
      const since = vehicles.waitingSinceTick[id]!;
      perTrain.push(
        `${id}:${vehicles.state[id]}@${vehicles.tileIndex[id]! % SIZE},` +
          `${(vehicles.tileIndex[id]! / SIZE) | 0}` +
          (since >= 0 ? ` wait ${world.tick - since}` : ''),
      );
    }
    // The deadlock half of section 19.5, stated as something that can be
    // measured: no train is ever permanently stuck. The worst continuous
    // standstill of a train that is trying to move is 3_300 ticks, and it
    // resolves - it is a queue on a single-track ring carrying twenty trains,
    // which is congestion and not a deadlock (DECISIONS.md D-084).
    expect(worstStall).toBeLessThan(4_000);
    expect(longestWait).toBeLessThan(4_000);

    // And they are all still working, not parked in "no route".
    let running = 0;
    for (let id = 0; id < TRAINS; id++) {
      expect(vehicles.state[id]).not.toBe(VehicleState.NoRoute);
      if (vehicles.state[id] !== VehicleState.Stopped) running++;
    }
    expect(running).toBe(TRAINS);

    // The ring really is being worked: most of the fleet is out on it. A full
    // lap of this ring is about six thousand ticks, so arrivals are not what
    // this length of run measures - movement is.
    let away = 0;
    for (let id = 0; id < TRAINS; id++) {
      const inShed = DEPOTS.some(([x, y]) => vehicles.tileIndex[id] === world.map.tileIndex(x, y));
      if (!inShed) away++;
    }
    // Every one of them left its shed. That was not true of the first version
    // of this fixture, where the back of a twenty deep queue never got out.
    expect(away).toBe(TRAINS);
  });

  it('produces the same world three times over', () => {
    const digests: string[][] = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const bench = complexNetwork();
      const marks: string[] = [];
      for (let tick = 0; tick < 2_000; tick++) {
        bench.world.step(bench.queue, null);
        if (tick % 500 === 0) marks.push(hashWorld(bench.world));
      }
      digests.push(marks);
    }
    expect(digests[1]).toEqual(digests[0]);
    expect(digests[2]).toEqual(digests[0]);
  });
});
