import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { CENTS_PER_EURO, Difficulty, MapClimate } from '../../src/sim/constants';
import { networkValueOf } from '../../src/sim/economy/networkValue';
import { TileMap } from '../../src/sim/map/TileMap';
import { SignalKind } from '../../src/sim/map/signals';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType, TrackDir } from '../../src/sim/map/track';
import { STATION_HISTORY_FIELD_COUNT, StationHistoryField } from '../../src/sim/station/history';
import { CARGO_COUNT } from '../../src/sim/cargo/types';
import { STATION_HISTORY_MONTHS } from '../../src/sim/constants';
import { ModuleKind, stationRating } from '../../src/sim/station/types';
import { VEHICLE_STATE_KEYS } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { makeTown, placeTown } from './scenario';

/**
 * Balancing scenario "Netzdesign" (SPEC2 M15).
 *
 * SPEC.md section 1 promises the core of the game in one sentence: a smooth,
 * well signalled alignment with sensible passing loops carries FOUR TIMES what
 * a slapdash one does, and the player must be able to see it and measure it in
 * the books. SPEC2 M15 turns that into a band - a network-value factor of at
 * least three - and this file is where the promise is either kept or exposed.
 *
 * The worlds differ in the TRACK and in nothing else: same map, same towns,
 * same population, same stations, same two trains, same orders, same world
 * rules, same seed. What separates them is what SPEC.md's sentence names - the
 * botched line wanders and carries no signal at all; the good one runs
 * straight and is signalled into one-way blocks with a return track, so the
 * two trains never meet.
 *
 * A third world - straight but still unsignalled - is measured only so the
 * printout can DECOMPOSE the answer: how much of it is the shape of the
 * ground and how much is the capacity. A ratio without that split sends the
 * reader guessing, which is the one thing a balancing scenario may not do.
 */

const SIZE = 128;
const GROUND = 5;
/** Row the stations stand on; the good line runs straight along it. */
const ROW = 40;
/** Platform columns. The two ends are 64 tiles apart. */
const WEST = 20;
const EAST = 84;
/** Engine shed, three tiles west of the western platform. */
const SHED = WEST - 3;

/** 1950 steam locomotive plus four passenger coaches, twice. */
const LOCO = 1004;
const COACH = 1500;
const COACHES = 3;
const TRAINS = 2;

/**
 * Town population.
 *
 * A town's passenger output is population x rate and does NOT depend on how
 * much of it a station covers (the share only splits it between several
 * stations), so this alone sets the offer: 2,400 inhabitants produce 840
 * passengers a month at each end. That is deliberately a little more than the
 * GOOD line can carry - both lines are limited by what they can move rather
 * than by what is there to move, which is the only way the comparison can be
 * about the track.
 */
const POPULATION = 700;

/** Game years measured. Long enough for the fleet to settle into its rhythm. */
const YEARS = 6;

/** The band of SPEC2 M15: the good line must be worth at least three botched ones. */
const MIN_FACTOR = 3;

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

/**
 * Flat grassland, two towns beside the line, and the M15 route rules ON.
 *
 * Both worlds run with `occupancyPenalty` and `signalPenalty` enabled, because
 * a passing loop is only a passing loop when a train prefers the free way
 * round to the occupied one - which is exactly what the occupancy term of
 * D-184 buys, and it is the rule this milestone shipped. Turning it on in one
 * world and off in the other would make the comparison about a rule instead of
 * about an alignment, so it is on in both; the botched line simply has nothing
 * to reroute onto.
 */
function bench(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  // Six rows south of the line, so no house and no town street ever lands on
  // the track row - both alignments then start from identical ground.
  const towns = [
    makeTown(0, WEST, ROW + 6, POPULATION, 'Westheim'),
    makeTown(1, EAST, ROW + 6, POPULATION, 'Ostheim'),
  ];
  for (const town of towns) placeTown(map, town);

  const world = World.fromGenerated(
    {
      seed: 8_615,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Netzdesign AG',
      companyColorIndex: 2,
      occupancyPenalty: true,
      signalPenalty: true,
    },
    { map, towns, industries: [], seedUsed: 8_615 },
  );
  // The measurement is about tonnage carried, not about who can afford the
  // track: both worlds get the same capital and both spend what their design
  // costs, which the printout reports.
  world.company.cashCt = 50_000_000_00;
  return { world, queue: new CommandQueue() };
}

/** Platforms at both ends and the shed, identical in both worlds. */
function stations(b: Bench): void {
  for (const x of [WEST, WEST + 1, EAST - 1, EAST]) {
    run(b, { kind: CommandKind.BuildRailStop, x, y: ROW, moduleKind: ModuleKind.RailPlatform });
  }
  run(b, { kind: CommandKind.BuildRailStop, x: SHED, y: ROW, moduleKind: ModuleKind.RailDepot });
}

/** Two identical trains, both working the same two stops. */
function fleet(b: Bench): void {
  const world = b.world;
  const west = world.stations.find((station) =>
    station.modules.some((module) => module.tileIndex === world.map.tileIndex(WEST, ROW)),
  )!;
  const east = world.stations.find((station) =>
    station.modules.some((module) => module.tileIndex === world.map.tileIndex(EAST, ROW)),
  )!;

  const consist = [LOCO];
  for (let i = 0; i < COACHES; i++) consist.push(COACH);
  for (let i = 0; i < TRAINS; i++) {
    run(b, { kind: CommandKind.BuyTrain, x: SHED, y: ROW, specIds: consist });
    run(b, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: i,
      orders: [
        { target: 0, targetId: west.id, load: 1, unload: 0 },
        { target: 0, targetId: east.id, load: 1, unload: 0 },
      ],
    });
    run(b, { kind: CommandKind.SetVehicleRunning, vehicleId: i, running: true });
  }
}

/** Sawtooth waypoints of the botched alignment. */
const KINK = 2;
const PERIOD = 8;

/**
 * The botched line: a sawtooth of kinks, and not one signal.
 *
 * Two failures at once, which is what "hingerotzt" means: the line wanders, so
 * it is longer AND every kink carries a curve speed limit (section 8.1); and
 * without a signal anywhere the whole thing is ONE section - `sectionEnd` runs
 * to the end of the route - so the second train can never enter while the
 * first is on it. Neither is a punishment invented for this test: both are
 * what the simulation does with track laid this way.
 */
function botchedTrack(b: Bench): void {
  track(b, SHED, ROW, WEST + 1, ROW);
  let x = WEST + 1;
  while (x + PERIOD <= EAST - 1) {
    track(b, x, ROW, x + KINK, ROW - KINK);
    track(b, x + KINK, ROW - KINK, x + PERIOD - KINK, ROW - KINK);
    track(b, x + PERIOD - KINK, ROW - KINK, x + PERIOD, ROW);
    x += PERIOD;
  }
  if (x < EAST) track(b, x, ROW, EAST, ROW);
}

function botched(): Bench {
  const b = bench();
  botchedTrack(b);
  stations(b);
  fleet(b);
  return b;
}

/**
 * The straight line with no signals: the alignment fixed, the capacity not.
 *
 * It exists so the printout can say how much of the difference is the shape of
 * the ground and how much is the signalling - a balancing test that reports one
 * ratio and no decomposition sends the reader guessing.
 */
function straightUnsignalled(): Bench {
  const b = bench();
  track(b, SHED, ROW, EAST, ROW);
  stations(b);
  fleet(b);
  return b;
}

/**
 * The good line: straight, level, and a passing arrangement that covers the
 * whole distance - two one-way tracks joined at both stations.
 *
 * A short passing loop on single track was tried first and is not what this
 * engine rewards; the reason is measured and written up in D-187. Two trains
 * shuttling on single track meet wherever their timings put them, and where
 * they meet on plain line they deadlock (D-059) - a loop in the middle only
 * helps when they happen to meet AT it. Making the passing place the whole
 * line is the design that removes opposing traffic altogether, and it is what
 * D-082 recorded as the shape a busy railway has to have.
 */
function signalled(): Bench {
  const b = bench();
  // Eastbound track along the station row, and the shed on the end of it.
  track(b, SHED, ROW, EAST, ROW);
  // Westbound track two rows north, joined to the station row at both ends.
  track(b, WEST + 1, ROW, WEST + 3, ROW - 2);
  track(b, WEST + 3, ROW - 2, EAST - 3, ROW - 2);
  track(b, EAST - 3, ROW - 2, EAST - 1, ROW);

  stations(b);

  // One-way blocks. They do two things at once: they divide each track into
  // sections so a following train is live rather than queued behind a whole
  // line (section 9), and they make the direction of travel part of the
  // TOPOLOGY - a train leaving a terminus cannot take the track meant for the
  // other direction, so the two never meet at all.
  //
  // Junction tiles carry no signal: a signal stands only on plain line
  // (D-055), and the four junctions here are WEST+1, WEST+3, EAST-3, EAST-1.
  for (let x = WEST + 4; x <= EAST - 2; x += 8) {
    run(b, {
      kind: CommandKind.BuildSignal,
      x,
      y: ROW,
      signalKind: SignalKind.BlockOneWay,
      direction: TrackDir.East,
    });
  }
  // The tile that turns the eastbound track back at its far end: without it a
  // train leaving the eastern platform westwards would simply drive back down
  // the track it came up.
  run(b, {
    kind: CommandKind.BuildSignal,
    x: EAST - 2,
    y: ROW,
    signalKind: SignalKind.BlockOneWay,
    direction: TrackDir.East,
  });
  for (let x = WEST + 4; x <= EAST - 4; x += 8) {
    run(b, {
      kind: CommandKind.BuildSignal,
      x,
      y: ROW - 2,
      signalKind: SignalKind.BlockOneWay,
      direction: TrackDir.West,
    });
  }

  fleet(b);
  return b;
}

interface Measurement {
  readonly share: number;
  readonly earnedCt: number;
  readonly ceilingCt: number;
  readonly detail: string;
  /** The world the measurement was taken on - the desync guard's subject. */
  readonly world: World;
}

/** Why the line earns what it earns - the house rule for a balancing test. */
function explain(b: Bench, years: number): string {
  const world = b.world;
  const parts: string[] = [];
  for (const station of world.stations) {
    if (station.modules.every((module) => module.kind === ModuleKind.RailDepot)) continue;
    let waiting = 0;
    for (const stack of station.waiting) waiting += stack.amount;
    let collected = 0;
    let expired = 0;
    for (let month = 0; month < STATION_HISTORY_MONTHS; month++) {
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        const slot = (month * CARGO_COUNT + cargo) * STATION_HISTORY_FIELD_COUNT;
        collected += station.history[slot + StationHistoryField.Collected]!;
        expired += station.history[slot + StationHistoryField.Expired]!;
      }
    }
    parts.push(
      `  ${station.name}: rating ${stationRating(station, world.tick)}, ` +
        `${Math.round(waiting)} waiting, ${station.visitTicks.length} visits per 20 days, ` +
        `last 12 months collected ${collected}, expired ${expired}`,
    );
  }
  const vehicles = world.vehicles;
  for (let id = 0; id < vehicles.count; id++) {
    parts.push(
      `  train ${id}: ${VEHICLE_STATE_KEYS[vehicles.state[id]!] ?? ''}, ` +
        `earned ${Math.round(vehicles.earnedCt[id]! / CENTS_PER_EURO / years)} EUR per year, ` +
        `standing for ${
          vehicles.waitingSinceTick[id]! < 0 ? 0 : world.tick - vehicles.waitingSinceTick[id]!
        } ticks`,
    );
  }
  return parts.join('\n');
}

function measure(b: Bench): Measurement {
  for (let tick = 0; tick < YEARS * 72_000; tick++) b.world.step(b.queue, null);

  const ids: number[] = [];
  const vehicles = b.world.vehicles;
  for (let id = 0; id < vehicles.count; id++) if (vehicles.alive[id] === 1) ids.push(id);

  const value = networkValueOf(b.world, ids);
  return { ...value, detail: explain(b, YEARS), world: b.world };
}

describe('scenario Netzdesign: what good track is worth', () => {
  const bad = measure(botched());
  const middle = measure(straightUnsignalled());
  const good = measure(signalled());
  const factor = bad.share > 0 ? good.share / bad.share : Number.POSITIVE_INFINITY;

  it('reports what it measured', () => {
    const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
    const pct = (share: number): string => `${(share * 100).toFixed(1)} %`;
    console.log(
      `netzdesign over ${YEARS} game years, ${TRAINS} identical trains on each line:
` +
        `  botched (sawtooth, no signals): network value ${pct(bad.share)} ` +
        `(${euros(bad.earnedCt)} of ${euros(bad.ceilingCt)} EUR)
` +
        `${bad.detail}
` +
        `  straight but still unsignalled: network value ${pct(middle.share)} ` +
        `(${euros(middle.earnedCt)} EUR) - the alignment alone is worth ` +
        `${(middle.share / bad.share).toFixed(2)}x
` +
        `${middle.detail}
` +
        `  signalled (straight, one-way blocks, return track): network value ` +
        `${pct(good.share)} (${euros(good.earnedCt)} of ${euros(good.ceilingCt)} EUR) - ` +
        `the capacity on top of that is worth ${(good.share / middle.share).toFixed(2)}x
` +
        `${good.detail}
` +
        `  factor ${factor.toFixed(2)} (band >= ${MIN_FACTOR})`,
    );
    expect(bad.ceilingCt).toBeGreaterThan(0);
    expect(good.ceilingCt).toBeGreaterThan(0);
  });

  it('gives both lines the identical ceiling, so the factor is the track', () => {
    // Same vehicles, same age, same cargo: the denominator cannot differ, and
    // the whole factor therefore lives in what was actually carried.
    expect(good.ceilingCt).toBeCloseTo(bad.ceilingCt, 6);
  });

  it('pays at least three times as much for the well designed line', () => {
    expect(factor).toBeGreaterThanOrEqual(MIN_FACTOR);
  });

  // All three railways, because the factor is a comparison and a divergence
  // in either half would move it.
  hashTwin(
    'netzdesign',
    () => [bad.world, middle.world, good.world],
    () => [
      measure(botched()).world,
      measure(straightUnsignalled()).world,
      measure(signalled()).world,
    ],
  );
});
