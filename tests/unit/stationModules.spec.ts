import { describe, expect, it } from 'vitest';
import { addCargo } from '../../src/sim/cargo/stack';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason, type Command } from '../../src/sim/commands/types';
import {
  CANOPY_DECAY_FACTOR,
  CARGO_EXPIRY_FRACTION_PER_DAY,
  CARGO_MAX_WAIT_DAYS,
  Difficulty,
  MapClimate,
  PLATFORM_OVERHANG_PENALTY,
  RATING_CANOPY_BONUS,
  TICKS_PER_DAY,
  TILE_SIZE_M,
} from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import {
  hasModule,
  ModuleKind,
  platformLength,
  stationRating,
  type Station,
} from '../../src/sim/station/types';
import { expireStaleCargo } from '../../src/sim/vehicles/lifecycle';
import { platformShare } from '../../src/sim/vehicles/update';
import { World } from '../../src/sim/World';

/**
 * The support modules of section 10 - crane, canopy and cold store - and the
 * platform length rule that decides how much of a train can be worked at once.
 *
 * All three stand beside the line rather than on it, which is why they need
 * neither road nor track and why they cannot be built out in a field: a canopy
 * with no station to join is a shed, not a station.
 */

const SIZE = 64;
const GROUND = 5;
const ROW = 20;

/** A 1950 locomotive and an open wagon. */
const LOCO = 1000;
const WAGON = 1520;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function bench(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 3,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Bahnhof AG',
      companyColorIndex: 5,
    },
    { map, towns: [], industries: [], seedUsed: 3 },
  );
  world.company.cashCt = 50_000_000_00;
  return { world, queue: new CommandQueue() };
}

function run(b: Bench, command: Command): string | null {
  b.queue.enqueue(command, b.world.tick);
  let rejected: string | null = null;
  b.world.drainCommands(b.queue, (_e, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

function must(b: Bench, command: Command): void {
  const rejected = run(b, command);
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${rejected}`);
}

/** A station of `platforms` contiguous platform tiles starting at x = 10. */
function railStation(b: Bench, platforms: number): Station {
  must(b, {
    kind: CommandKind.BuildTrack,
    x1: 8,
    y1: ROW,
    x2: 8 + platforms + 4,
    y2: ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  for (let i = 0; i < platforms; i++) {
    must(b, {
      kind: CommandKind.BuildRailStop,
      x: 10 + i,
      y: ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
  }
  return b.world.stations[0]!;
}

describe('building a support module', () => {
  it('joins the station beside it and charges for itself', () => {
    const b = bench();
    const station = railStation(b, 2);
    const before = b.world.company.cashCt;

    must(b, {
      kind: CommandKind.BuildStationModule,
      x: 11,
      y: ROW + 2,
      moduleKind: ModuleKind.Canopy,
    });

    expect(b.world.stations).toHaveLength(1);
    expect(hasModule(station, ModuleKind.Canopy)).toBe(true);
    expect(b.world.company.cashCt).toBeLessThan(before);
  });

  it('refuses open country, occupied ground and a module it does not know', () => {
    const b = bench();
    railStation(b, 2);

    // Nothing to join out here.
    expect(
      run(b, {
        kind: CommandKind.BuildStationModule,
        x: 40,
        y: 40,
        moduleKind: ModuleKind.Canopy,
      }),
    ).toBe(RejectReason.NeedsStation);

    // On the track itself.
    expect(
      run(b, {
        kind: CommandKind.BuildStationModule,
        x: 13,
        y: ROW,
        moduleKind: ModuleKind.ColdStore,
      }),
    ).toBe(RejectReason.GroundNotClear);

    // A platform is not a support module and does not belong here.
    expect(
      run(b, {
        kind: CommandKind.BuildStationModule,
        x: 11,
        y: ROW + 2,
        moduleKind: ModuleKind.RailPlatform,
      }),
    ).toBe(RejectReason.UnknownModule);
  });
});

describe('what the modules do', () => {
  it('gives a canopy eight rating points', () => {
    const b = bench();
    const station = railStation(b, 2);
    const plain = stationRating(station, b.world.tick);

    must(b, {
      kind: CommandKind.BuildStationModule,
      x: 11,
      y: ROW + 2,
      moduleKind: ModuleKind.Canopy,
    });

    // The extra module also nudges the module count term, so the canopy is
    // worth at least its eight points and a shade more.
    expect(stationRating(station, b.world.tick)).toBeGreaterThanOrEqual(
      plain + RATING_CANOPY_BONUS,
    );
  });

  it('holds back a third of the spoilage under a canopy', () => {
    const withCanopy = bench();
    const plain = bench();
    const stationA = railStation(withCanopy, 2);
    const stationB = railStation(plain, 2);
    must(withCanopy, {
      kind: CommandKind.BuildStationModule,
      x: 11,
      y: ROW + 2,
      moduleKind: ModuleKind.Canopy,
    });

    // Cargo old enough to be past its grace period, with a route, at both.
    for (const [b, station] of [
      [withCanopy, stationA],
      [plain, stationB],
    ] as const) {
      b.world.tick = (CARGO_MAX_WAIT_DAYS + 5) * TICKS_PER_DAY;
      addCargo(station.waiting, {
        cargo: Cargo.Coal,
        amount: 1_000,
        createdTick: 0,
        originStationId: station.id,
        destinationStationId: station.id,
        paidFromX: station.x,
        paidFromY: station.y,
      });
      expireStaleCargo(b.world);
    }

    const sheltered = 1_000 * (1 - CARGO_EXPIRY_FRACTION_PER_DAY * CANOPY_DECAY_FACTOR);
    const exposed = 1_000 * (1 - CARGO_EXPIRY_FRACTION_PER_DAY);
    expect(stationA.waiting[0]!.amount).toBeCloseTo(sheltered, 6);
    expect(stationB.waiting[0]!.amount).toBeCloseTo(exposed, 6);
  });

  it('stops perishable cargo spoiling at all in a cold store', () => {
    const b = bench();
    const station = railStation(b, 2);
    must(b, {
      kind: CommandKind.BuildStationModule,
      x: 11,
      y: ROW + 2,
      moduleKind: ModuleKind.ColdStore,
    });

    b.world.tick = (CARGO_MAX_WAIT_DAYS + 5) * TICKS_PER_DAY;
    // Food needs cooling; coal does not, and is not sheltered by a cold store.
    for (const cargo of [Cargo.Food, Cargo.Coal]) {
      addCargo(station.waiting, {
        cargo,
        amount: 1_000,
        createdTick: 0,
        originStationId: station.id,
        destinationStationId: station.id,
        paidFromX: station.x,
        paidFromY: station.y,
      });
    }
    expireStaleCargo(b.world);

    const food = station.waiting.find((stack) => stack.cargo === Cargo.Food)!;
    const coal = station.waiting.find((stack) => stack.cargo === Cargo.Coal)!;
    expect(food.amount).toBe(1_000);
    expect(coal.amount).toBeCloseTo(1_000 * (1 - CARGO_EXPIRY_FRACTION_PER_DAY), 6);
  });
});

describe('platform length', () => {
  it('measures the longest unbroken run, not the module count', () => {
    const b = bench();
    const station = railStation(b, 3);
    expect(platformLength(station)).toBe(3);

    // A fourth platform four tiles further along joins the same station but is
    // a second, shorter platform - not an extension of the first.
    must(b, {
      kind: CommandKind.BuildTrack,
      x1: 16,
      y1: ROW,
      x2: 18,
      y2: ROW,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    must(b, {
      kind: CommandKind.BuildRailStop,
      x: 16,
      y: ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
    expect(station.modules).toHaveLength(4);
    expect(platformLength(station)).toBe(3);
  });

  it('lets a train that fits load everything, and one that hangs off a fraction', () => {
    const long = bench();
    const short = bench();
    const longStation = railStation(long, 6);
    const shortStation = railStation(short, 1);

    // The same train in both worlds: a locomotive and nine wagons, a bit over
    // a hundred metres, which is three tiles of platform.
    const consist = [LOCO, WAGON, WAGON, WAGON, WAGON, WAGON, WAGON, WAGON, WAGON, WAGON];
    for (const b of [long, short]) {
      must(b, { kind: CommandKind.BuildRailStop, x: 9, y: ROW, moduleKind: ModuleKind.RailDepot });
      must(b, { kind: CommandKind.BuyTrain, x: 9, y: ROW, specIds: consist });
    }

    const trainTiles = Math.ceil(long.world.vehicles.lengthM[0]! / TILE_SIZE_M);
    expect(trainTiles).toBeGreaterThan(1);

    expect(platformShare(long.world, 0, longStation)).toBe(1);
    expect(platformShare(short.world, 0, shortStation)).toBeCloseTo(
      (1 / trainTiles) * (1 - PLATFORM_OVERHANG_PENALTY),
      6,
    );
  });
});
