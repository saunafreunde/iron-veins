import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { depositAtStation } from '../../src/sim/cargo/routing';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Cargo } from '../../src/sim/cargo/types';
import {
  Difficulty,
  LATERAL_ACCEL_PASSENGER,
  MapClimate,
  MAX_TRAIN_LENGTH_M,
  TICKS_PER_DAY,
} from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { Structure, structureCostCt } from '../../src/sim/map/structures';
import {
  curveSpeedMs,
  railUpgradeCostCt,
  RAIL_TYPE_COST_CT,
  RAIL_TYPE_SPEED_MS,
  RailType,
} from '../../src/sim/map/track';
import { planTrack } from '../../src/sim/net/trackBuilder';
import { ModuleKind } from '../../src/sim/station/types';
import {
  availableRailVehicles,
  RailRole,
  VEHICLE_SPECS,
  VehicleKind,
  vehicleSpec,
} from '../../src/sim/vehicles/catalog';
import { aggregateConsist, validateConsist } from '../../src/sim/vehicles/consist';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { World } from '../../src/sim/World';

/**
 * Trains: the catalogue, the composition rules of section 11.2, the rail
 * pathfinder and the longitudinal behaviour that all of it exists for.
 */

/** Big enough that a heavy train can reach its top speed before it has to brake. */
const SIZE = 128;
const GROUND = 5;

/** Steam freight engine, 1950, 224 kN. */
const HEAVY_LOCO = 1004;
/** Express steam engine, 1950, 140 km/h. */
const FAST_LOCO = 1001;
/** Electric, 1952 - only runs under catenary. */
const ELECTRIC_LOCO = 1030;
/** Light diesel railbus, 1950, 80 km/h - the cheapest way onto rails. */
const RAILBUS = 1061;
const PASSENGER_COACH = 1500;
const OPEN_WAGON = 1520;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

/** Flat grassland, no towns, no industry: a test bench for track and trains. */
function flatWorld(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 7,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Eisenbahn AG',
      companyColorIndex: 1,
    },
    { map, towns: [], industries: [], seedUsed: 7 },
  );
  return { world, queue: new CommandQueue() };
}

/** Execute a command now and fail loudly if the world refuses it. */
function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) {
    throw new Error(`command ${command.kind} was rejected: ${String(rejected)}`);
  }
}

/** Try a command and return the refusal reason, or null when it was accepted. */
function tryRun(bench: Bench, command: Command): string | null {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

function layTrack(
  bench: Bench,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  railType: RailType = RailType.Plain,
): void {
  run(bench, {
    kind: CommandKind.BuildTrack,
    x1,
    y1,
    x2,
    y2,
    railType,
    assistant: false,
    signalSpacing: 0,
  });
}

// ---------------------------------------------------------------- catalogue

describe('the rail catalogue', () => {
  it('offers the range section 11.5 asks for', () => {
    const traction = VEHICLE_SPECS.filter((spec) => spec.railRole === RailRole.Traction);
    const wagons = VEHICLE_SPECS.filter((spec) => spec.railRole === RailRole.Wagon);

    expect(traction.length).toBeGreaterThanOrEqual(28);
    expect(wagons.length).toBeGreaterThanOrEqual(20);
  });

  it('gives every entry a unique id and a name in both languages', () => {
    const ids = new Set<number>();
    for (const spec of VEHICLE_SPECS) {
      expect(ids.has(spec.id), `duplicate id ${spec.id}`).toBe(false);
      ids.add(spec.id);
      expect(de, `German name for ${spec.nameKey}`).toHaveProperty(spec.nameKey);
      expect(en, `English name for ${spec.nameKey}`).toHaveProperty(spec.nameKey);
    }
  });

  it('keeps wagons unpowered and locomotives powered', () => {
    for (const spec of VEHICLE_SPECS) {
      if (spec.railRole === RailRole.Wagon) {
        expect(spec.tractiveN, spec.nameKey).toBe(0);
        expect(spec.powerW, spec.nameKey).toBe(0);
      }
      if (spec.railRole === RailRole.Traction) {
        expect(spec.tractiveN, spec.nameKey).toBeGreaterThan(0);
        expect(spec.kind, spec.nameKey).toBe(VehicleKind.Train);
      }
    }
  });

  it('has traction and wagons available in every playable year', () => {
    for (let year = 1950; year <= 2050; year += 5) {
      expect(availableRailVehicles(RailRole.Traction, year).length, `year ${year}`).toBeGreaterThan(
        0,
      );
      expect(availableRailVehicles(RailRole.Wagon, year).length, `year ${year}`).toBeGreaterThan(0);
    }
  });
});

// -------------------------------------------------------------- composition

describe('train composition', () => {
  it('sums mass and length but only the locomotives pull', () => {
    const loco = vehicleSpec(HEAVY_LOCO);
    const wagon = vehicleSpec(OPEN_WAGON);
    const train = aggregateConsist([HEAVY_LOCO, OPEN_WAGON, OPEN_WAGON]);

    expect(train.massKg).toBe(loco.massKg + 2 * wagon.massKg);
    expect(train.lengthM).toBe(loco.lengthM + 2 * wagon.lengthM);
    expect(train.tractiveN).toBe(loco.tractiveN);
    expect(train.tractionUnits).toBe(1);
    expect(train.wagons).toBe(2);
  });

  it('is only as fast as its slowest vehicle', () => {
    const fast = vehicleSpec(FAST_LOCO);
    const slow = vehicleSpec(OPEN_WAGON);
    expect(slow.maxSpeedMs).toBeLessThan(fast.maxSpeedMs);

    const train = aggregateConsist([FAST_LOCO, slow.id]);
    expect(train.maxSpeedMs).toBe(slow.maxSpeedMs);
  });

  it('adds the tractive effort of a second locomotive', () => {
    const single = aggregateConsist([HEAVY_LOCO]);
    const double = aggregateConsist([HEAVY_LOCO, HEAVY_LOCO]);
    expect(double.tractiveN).toBe(2 * single.tractiveN);
  });

  it('refuses a train that no locomotive could move', () => {
    expect(validateConsist([], 1950)).not.toBeNull();
    expect(validateConsist([OPEN_WAGON, OPEN_WAGON], 1950)).toBe('cmd.reject.consistNoTraction');
  });

  it('refuses a train longer than the limit', () => {
    const coaches: number[] = [HEAVY_LOCO];
    while (aggregateConsist(coaches).lengthM <= MAX_TRAIN_LENGTH_M) coaches.push(PASSENGER_COACH);
    expect(validateConsist(coaches, 1950)).toBe('cmd.reject.consistTooLong');
  });

  it('refuses a vehicle that is not rail at all', () => {
    expect(validateConsist([HEAVY_LOCO, 200], 1950)).toBe('cmd.reject.consistNotRail');
  });

  it('refuses a vehicle the year does not offer yet', () => {
    expect(validateConsist([ELECTRIC_LOCO], 1950)).toBe('cmd.reject.notAvailableYet');
  });
});

// --------------------------------------------------------------- build side

describe('rail stations and depots', () => {
  it('needs track under a platform', () => {
    const bench = flatWorld();
    expect(
      tryRun(bench, {
        kind: CommandKind.BuildRailStop,
        x: 10,
        y: 10,
        moduleKind: ModuleKind.RailPlatform,
      }),
    ).toBe('cmd.reject.needsTrack');
  });

  it('builds a platform on existing track and joins it to a nearby station', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10);

    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 12,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 14,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });

    expect(bench.world.stations).toHaveLength(1);
    expect(bench.world.stations[0]!.modules).toHaveLength(2);
  });

  it('only assembles trains in a rail depot', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 12,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });

    expect(tryRun(bench, { kind: CommandKind.BuyTrain, x: 12, y: 10, specIds: [HEAVY_LOCO] })).toBe(
      'cmd.reject.needsRailDepot',
    );
  });

  it('charges the composition and puts the train in the depot', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 12,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });

    const before = bench.world.company.cashCt;
    const units = [HEAVY_LOCO, OPEN_WAGON, OPEN_WAGON];
    run(bench, { kind: CommandKind.BuyTrain, x: 12, y: 10, specIds: units });

    expect(before - bench.world.company.cashCt).toBe(aggregateConsist(units).priceCt);
    expect(bench.world.vehicles.consist[0]).toEqual(units);
    expect(bench.world.vehicles.kind[0]).toBe(VehicleKind.Train);
    expect(bench.world.vehicles.state[0]).toBe(VehicleState.Stopped);
  });
});

// ------------------------------------------------- upgrades and gradients

describe('track upgrades', () => {
  it('electrifies an existing line for the difference in price', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10, RailType.Plain);

    const before = bench.world.company.cashCt;
    layTrack(bench, 10, 10, 20, 10, RailType.Electrified);
    const paid = before - bench.world.company.cashCt;

    // Eleven tiles at the conversion price, not at the price of new track.
    expect(paid).toBe(11 * railUpgradeCostCt(RailType.Plain, RailType.Electrified));
    expect(paid).toBeLessThan(11 * RAIL_TYPE_COST_CT[RailType.Electrified]!);
    expect(bench.world.map.railType[bench.world.map.tileIndex(15, 10)]).toBe(RailType.Electrified);
  });

  it('refuses a second attempt that would change nothing', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10, RailType.Plain);

    expect(
      tryRun(bench, {
        kind: CommandKind.BuildTrack,
        x1: 10,
        y1: 10,
        x2: 20,
        y2: 10,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: 0,
      }),
    ).toBe('cmd.reject.nothingToDo');
  });
});

describe('the gradient window', () => {
  /** A ramp rising one 8 m level every `tilesPerLevel` tiles. */
  function ramped(tilesPerLevel: number): Bench {
    const bench = flatWorld();
    const map = bench.world.map;
    for (let y = 0; y <= SIZE; y++) {
      for (let x = 0; x <= SIZE; x++) {
        map.cornerHeight[map.cornerIndex(x, y)] = Math.min(
          12,
          GROUND + Math.floor(Math.max(0, x - 10) / tilesPerLevel),
        );
      }
    }
    return bench;
  }

  it('lets plain track climb one level every six tiles', () => {
    const bench = ramped(6);
    const planned = planTrack(bench.world.map, 10, 10, 50, 10, RailType.Plain, false);

    expect(planned.ok).toBe(true);
    if (planned.ok) expect(planned.route.geometry.maxGradePermille).toBeLessThanOrEqual(30);
  });

  it('refuses the same ramp for high speed track', () => {
    const bench = ramped(6);
    const planned = planTrack(bench.world.map, 10, 10, 50, 10, RailType.HighSpeed, false);

    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.reasonKey).toBe('track.reject.tooSteep');
  });

  it('refuses a ramp that is steep even for narrow gauge', () => {
    const bench = ramped(1);
    const planned = planTrack(bench.world.map, 10, 10, 50, 10, RailType.Narrow, false);

    expect(planned.ok).toBe(false);
  });

  it('measures a single step as the gradient of the stretch, not of the step', () => {
    const bench = ramped(6);
    const planned = planTrack(bench.world.map, 10, 10, 50, 10, RailType.Plain, false);

    // One 8 m level over 300 m of line is 26.7 per mille. Taken literally, the
    // one tile where the ground steps up would read 160 per mille and no rail
    // type on earth could accept it.
    if (planned.ok) {
      expect(planned.route.geometry.maxGradePermille).toBeGreaterThan(20);
      expect(planned.route.geometry.maxGradePermille).toBeLessThan(30);
    }
  });
});

// ------------------------------------------------------ bridges and tunnels

describe('bridges and tunnels', () => {
  /**
   * Flat land with a river running north to south at x = `at`.
   *
   * The ground stays where it is: rivers do not carve (DECISIONS.md D-019), so
   * a river really is a run of water tiles at the height of the land around it.
   */
  function withRiver(at: number, widthTiles: number): Bench {
    const bench = flatWorld();
    const map = bench.world.map;
    for (let y = 0; y < SIZE; y++) {
      for (let x = at; x < at + widthTiles; x++) map.terrain[map.tileIndex(x, y)] = Terrain.Water;
    }
    return bench;
  }

  /** Flat land with a ridge `widthTiles` wide, `levels` higher, at x = `at`. */
  function withRidge(at: number, widthTiles: number, levels: number): Bench {
    const bench = flatWorld();
    const map = bench.world.map;
    for (let y = 0; y <= SIZE; y++) {
      for (let x = at; x <= at + widthTiles; x++) {
        map.cornerHeight[map.cornerIndex(x, y)] = GROUND + levels;
      }
    }
    map.enforceSlopeInvariant();
    return bench;
  }

  it('bridges a river the assistant cannot walk round', () => {
    const bench = withRiver(30, 3);
    const planned = planTrack(bench.world.map, 20, 10, 40, 10, RailType.Plain, true);

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.route.structures).toContain(Structure.Bridge);
    expect(planned.route.structures).not.toContain(Structure.Tunnel);
  });

  it('keeps the deck at bank level all the way across', () => {
    const bench = withRiver(30, 3);
    const planned = planTrack(bench.world.map, 20, 10, 40, 10, RailType.Plain, true);
    if (!planned.ok) return;

    const bank = bench.world.map.baseHeight(20, 10);
    for (let i = 0; i < planned.route.tiles.length; i++) {
      if (planned.route.structures[i] !== Structure.Bridge) continue;
      expect(planned.route.heights[i]!).toBe(bank);
    }
    // And because it is level, the route has no gradient at all.
    expect(planned.route.geometry.maxGradePermille).toBe(0);
  });

  it('charges for the span on top of the track', () => {
    const bench = withRiver(30, 3);
    const planned = planTrack(bench.world.map, 20, 10, 40, 10, RailType.Plain, true);
    if (!planned.ok) return;

    const bridgeTiles = planned.route.structures.filter((s) => s === Structure.Bridge).length;
    const trackOnly = planned.route.tiles.length * RAIL_TYPE_COST_CT[RailType.Plain]!;

    expect(bridgeTiles).toBeGreaterThan(0);
    expect(planned.route.costCt).toBeGreaterThan(trackOnly);
    expect(planned.route.costCt).toBe(
      trackOnly + structureCostCt(Structure.Bridge, bridgeTiles + 1),
    );
  });

  it('actually builds the bridge and charges for it', () => {
    const bench = withRiver(30, 3);
    const planned = planTrack(bench.world.map, 20, 10, 40, 10, RailType.Plain, true);
    if (!planned.ok) return;

    const before = bench.world.company.cashCt;
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 20,
      y1: 10,
      x2: 40,
      y2: 10,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: 0,
    });

    expect(before - bench.world.company.cashCt).toBe(planned.route.costCt);

    const map = bench.world.map;
    const midTile = map.tileIndex(31, 10);
    expect(map.structure[midTile]).toBe(Structure.Bridge);
    expect(map.trackBits[midTile]).not.toBe(0);
    // The ground under the deck is still water - the track crosses it, the
    // river is not filled in.
    expect(map.terrain[midTile]).toBe(Terrain.Water);
    expect(map.railHeight(31, 10)).toBe(map.baseHeight(20, 10));
  });

  it('bores through a ridge that is too steep to climb', () => {
    const bench = withRidge(30, 4, 4);
    const planned = planTrack(bench.world.map, 20, 10, 45, 10, RailType.Plain, true);

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.route.structures).toContain(Structure.Tunnel);
  });

  it('does not reach for a structure it does not need', () => {
    const bench = flatWorld();
    const planned = planTrack(bench.world.map, 20, 10, 40, 10, RailType.Plain, true);

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.route.structures.every((s) => s === Structure.None)).toBe(true);
  });

  it('lets a train run over a bridge', () => {
    const bench = withRiver(30, 3);
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 20,
      y1: 10,
      x2: 40,
      y2: 10,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: 0,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 20,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 40,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, { kind: CommandKind.BuyTrain, x: 20, y: 10, specIds: [RAILBUS] });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    const map = bench.world.map;
    let crossedWater = false;
    for (let i = 0; i < 3_000; i++) {
      bench.world.step(bench.queue, null);
      const tile = bench.world.vehicles.tileIndex[0]!;
      if (map.structure[tile] === Structure.Bridge) crossedWater = true;
      if (tile === map.tileIndex(40, 10)) break;
    }

    expect(crossedWater).toBe(true);
    expect(bench.world.vehicles.tileIndex[0]).toBe(map.tileIndex(40, 10));
  });

  it('takes the bridge out with the tile it stands on', () => {
    const bench = withRiver(30, 3);
    run(bench, {
      kind: CommandKind.BuildTrack,
      x1: 20,
      y1: 10,
      x2: 40,
      y2: 10,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: 0,
    });

    const map = bench.world.map;
    expect(map.structure[map.tileIndex(31, 10)]).toBe(Structure.Bridge);

    run(bench, { kind: CommandKind.DemolishTrack, x: 31, y: 10 });
    expect(map.structure[map.tileIndex(31, 10)]).toBe(Structure.None);
    expect(map.trackBits[map.tileIndex(31, 10)]).toBe(0);
  });
});

// ------------------------------------------------------------ pathfinding

describe('train pathfinding', () => {
  function trainOnLine(bench: Bench, units: readonly number[], railType: RailType): number {
    layTrack(bench, 10, 10, 30, 10, railType);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [...units] });
    return 0;
  }

  it('finds a route over connected track', () => {
    const bench = flatWorld();
    const id = trainOnLine(bench, [HEAVY_LOCO], RailType.Plain);
    const path = new Int32Array(2048);

    const length = bench.world.railPathfinder.find(
      bench.world.map,
      bench.world.map.tileIndex(10, 10),
      bench.world.map.tileIndex(30, 10),
      bench.world.vehicles.maxSpeedMs[id]!,
      LATERAL_ACCEL_PASSENGER,
      false,
      path,
    );

    expect(length).toBe(21);
    expect(path[0]).toBe(bench.world.map.tileIndex(10, 10));
    expect(path[length - 1]).toBe(bench.world.map.tileIndex(30, 10));
  });

  it('finds nothing across a gap in the rails', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 20, 10);
    layTrack(bench, 24, 10, 30, 10);
    const path = new Int32Array(2048);

    const length = bench.world.railPathfinder.find(
      bench.world.map,
      bench.world.map.tileIndex(10, 10),
      bench.world.map.tileIndex(30, 10),
      40,
      LATERAL_ACCEL_PASSENGER,
      false,
      path,
    );
    expect(length).toBe(0);
  });

  it('keeps an electric locomotive off unelectrified track', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10, RailType.Plain);
    const path = new Int32Array(2048);

    const plain = bench.world.railPathfinder.find(
      bench.world.map,
      bench.world.map.tileIndex(10, 10),
      bench.world.map.tileIndex(30, 10),
      40,
      LATERAL_ACCEL_PASSENGER,
      true,
      path,
    );
    expect(plain).toBe(0);

    // The same line, this time with wires up.
    layTrack(bench, 10, 10, 30, 10, RailType.Electrified);
    const electrified = bench.world.railPathfinder.find(
      bench.world.map,
      bench.world.map.tileIndex(10, 10),
      bench.world.map.tileIndex(30, 10),
      40,
      LATERAL_ACCEL_PASSENGER,
      true,
      path,
    );
    expect(electrified).toBe(21);
  });

  it('prefers the straight line to a detour of the same length', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    // A parallel loop that rejoins: longer, so it must lose.
    layTrack(bench, 12, 10, 16, 6);
    layTrack(bench, 16, 6, 20, 10);
    const path = new Int32Array(2048);

    const length = bench.world.railPathfinder.find(
      bench.world.map,
      bench.world.map.tileIndex(10, 10),
      bench.world.map.tileIndex(30, 10),
      40,
      LATERAL_ACCEL_PASSENGER,
      false,
      path,
    );
    expect(length).toBe(21);
  });
});

// ------------------------------------------------------------------ physics

describe('train physics', () => {
  /**
   * Put a running train on a straight line and return the bench after `ticks`.
   *
   * `tilesPerLevel` builds a ramp: the ground is sampled in whole 8 m levels, so
   * a climb is one level every so many tiles. Six tiles per level is 26.7 per
   * mille, just inside what plain track accepts.
   */
  function runLine(
    units: readonly number[],
    ticks: number,
    tilesPerLevel = 0,
    railType: RailType = RailType.Plain,
  ): Bench {
    const bench = flatWorld();
    const map = bench.world.map;

    if (tilesPerLevel > 0) {
      for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
          const level = Math.min(12, GROUND + Math.floor(Math.max(0, x - 10) / tilesPerLevel));
          map.cornerHeight[map.cornerIndex(x, y)] = level;
        }
      }
    }

    layTrack(bench, 10, 10, 120, 10, railType);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 120,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [...units] });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      // Station 1 is the far platform; station 0 is the depot the train is in.
      orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    for (let i = 0; i < ticks; i++) bench.world.step(bench.queue, null);
    return bench;
  }

  it('accelerates a railbus up to its own top speed', () => {
    const bench = runLine([RAILBUS], 900);
    const vehicles = bench.world.vehicles;
    const top = vehicleSpec(RAILBUS).maxSpeedMs;

    expect(vehicles.speedMs[0]!).toBeGreaterThan(top - 1);
    expect(vehicles.speedMs[0]!).toBeLessThanOrEqual(top + 0.001);
    expect(vehicles.tileIndex[0]!).not.toBe(bench.world.map.tileIndex(10, 10));
  });

  it('holds a fast train to the line speed of slow track', () => {
    const bench = runLine([FAST_LOCO], 900, 0, RailType.Narrow);
    const narrowLimit = RAIL_TYPE_SPEED_MS[RailType.Narrow]!;

    expect(vehicleSpec(FAST_LOCO).maxSpeedMs).toBeGreaterThan(narrowLimit);
    expect(bench.world.vehicles.speedMs[0]!).toBeLessThanOrEqual(narrowLimit + 0.001);
    expect(bench.world.vehicles.speedMs[0]!).toBeGreaterThan(narrowLimit - 1);
  });

  it('makes a heavy train markedly slower on a climb', () => {
    // Twenty-four open wagons behind a big steam engine: 400 t, and the wagons
    // cap the whole train at their own 80 km/h.
    const heavy = [HEAVY_LOCO, ...Array<number>(24).fill(OPEN_WAGON)];
    const capMs = vehicleSpec(OPEN_WAGON).maxSpeedMs;

    const flat = runLine(heavy, 2_000).world.vehicles.speedMs[0]!;
    // Six tiles per height level is 26.7 per mille, just inside what plain
    // track accepts - and it costs this train a third of its speed.
    const climbing = runLine(heavy, 2_000, 6).world.vehicles.speedMs[0]!;

    expect(flat).toBeGreaterThan(capMs - 0.5);
    expect(climbing).toBeGreaterThan(5);
    expect(climbing).toBeLessThan(17);
  });

  it('weighs the load, not only the wagons', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 30, 10);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [HEAVY_LOCO, OPEN_WAGON] });

    const empty = bench.world.vehicles.massKg[0]!;
    bench.world.vehicles.cargo[0]!.push({
      cargo: Cargo.Coal,
      amount: 25,
      createdTick: 0,
      originStationId: 0,
      destinationStationId: -1,
      paidFromX: 0,
      paidFromY: 0,
    });
    bench.world.vehicles.refreshAggregate(0);

    // 25 t of coal on a 12 t wagon: the load is the heavier half.
    expect(bench.world.vehicles.massKg[0]! - empty).toBe(25_000);
  });

  it('slows a train down for a tight corner', () => {
    const bench = flatWorld();
    layTrack(bench, 10, 10, 40, 10);
    layTrack(bench, 40, 10, 40, 40);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 40,
      y: 40,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [FAST_LOCO, PASSENGER_COACH] });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    // The tightest curve the geometry allows is 45 m; a passenger train may take
    // it at sqrt(0.65 * 45) = 5.4 m/s and no faster.
    const cornerLimit = curveSpeedMs(45, LATERAL_ACCEL_PASSENGER);
    const cornerTile = bench.world.map.tileIndex(40, 10);

    let sawCorner = false;
    let topSpeed = 0;
    for (let i = 0; i < 4_000; i++) {
      bench.world.step(bench.queue, null);
      const vehicles = bench.world.vehicles;
      if (vehicles.speedMs[0]! > topSpeed) topSpeed = vehicles.speedMs[0]!;
      if (vehicles.tileIndex[0] === cornerTile) {
        sawCorner = true;
        expect(vehicles.speedMs[0]!).toBeLessThanOrEqual(cornerLimit + 0.5);
      }
    }

    expect(sawCorner).toBe(true);
    // ... but it was fast on the straight before it, so this is braking for the
    // curve and not a train that never got going. The coach caps the train at
    // its own 100 km/h, which is why the bar is not higher.
    expect(topSpeed).toBeGreaterThan(25);
  });
});

// ------------------------------------------------------------------- the line

describe('a working rail line', () => {
  it('carries cargo between two stations and books the revenue', () => {
    const bench = flatWorld();
    layTrack(bench, 8, 10, 40, 10);
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 8,
      y: 10,
      moduleKind: ModuleKind.RailDepot,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    run(bench, {
      kind: CommandKind.BuildRailStop,
      x: 40,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });

    const west = bench.world.stations[0]!;
    const east = bench.world.stations[1]!;
    expect(west.modules).toHaveLength(2); // depot and platform, joined
    expect(east.modules).toHaveLength(1);

    run(bench, {
      kind: CommandKind.BuyTrain,
      x: 8,
      y: 10,
      specIds: [FAST_LOCO, PASSENGER_COACH, PASSENGER_COACH],
    });
    run(bench, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        { target: 0, targetId: west.id, load: 1, unload: 0 },
        { target: 0, targetId: east.id, load: 1, unload: 0 },
      ],
    });
    run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
    expect(bench.world.vehicles.state[0]).toBe(VehicleState.Driving);

    depositAtStation(bench.world, west, Cargo.Passengers, 120);
    const cashBefore = bench.world.company.cashCt;

    for (let i = 0; i < TICKS_PER_DAY * 20; i++) {
      bench.world.step(bench.queue, null);
      depositAtStation(bench.world, west, Cargo.Passengers, 1);
    }

    expect(bench.world.company.cashCt).toBeGreaterThan(cashBefore);
    expect(bench.world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(east.visitTicks.length).toBeGreaterThan(0);
  });
});
