import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Cargo } from '../../src/sim/cargo/types';
import { Difficulty, MapClimate } from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { measureBenchmarkWorld, railArcCount } from '../../src/sim/bench/measure';
import type { BenchmarkCommand, BenchmarkMap } from '../../src/sim/bench/types';
import { World } from '../../src/sim/World';

/**
 * How the four canonical benchmark maps of SPEC2 M22 were AUTHORED.
 *
 * The committed files under `src/sim/bench/maps/` are command logs, and this is
 * where they come from: a plan that probes the real world and records only the
 * commands that were ACCEPTED. That is the honest way round, and the only one
 * that survives a generated map. A hand-typed lattice of coordinates would be a
 * list of guesses about where the sea is; a plan that asks the game and keeps
 * the answers is a recording of an authoring session, which is exactly what
 * D-240 says a map is.
 *
 * Nothing here ships. `recordBenchmarkMaps.spec.ts` runs it on demand and
 * writes the four JSON files; the suite and the game read the FILES. If map
 * generation ever moves, the replay guard in `src/sim/bench/build.ts` goes red
 * with the command it could not apply and the answer is to re-record - the
 * `SCENARIO_WORLD_CLAIMS` bargain of D-197, one milestone on.
 */

/** Catalogue ids: the 1950 city bus, the steam locomotive and the open wagon. */
const BUS_SPEC = 200;
const LOCO_SPEC = 1_000;
const WAGON_SPEC = 1_520;

/** A recorder: it runs a command against the world and keeps it if it stuck. */
export class PlanRecorder {
  readonly log: BenchmarkCommand[] = [];
  private readonly queue = new CommandQueue();
  private refused = 0;

  constructor(readonly world: World) {}

  /** Execute `command`; record it when it was accepted. Returns whether it was. */
  try(command: Command): boolean {
    this.queue.enqueue(command, this.world.tick);
    let accepted = true;
    this.world.drainCommands(this.queue, (_envelope, outcome) => {
      if (!outcome.ok) accepted = false;
    });
    if (accepted) this.log.push({ tick: this.world.tick, command });
    else this.refused++;
    return accepted;
  }

  /** Commands that were tried and refused - the plan's own hit rate, for the log. */
  get refusedCount(): number {
    return this.refused;
  }

  /** Id of the vehicle the last accepted purchase created. */
  get lastVehicleId(): number {
    return this.world.vehicles.count - 1;
  }
}

export interface BenchmarkPlan {
  readonly id: string;
  readonly seed: number;
  readonly mapSize: number;
  readonly climate: MapClimate;
  readonly difficulty: Difficulty;
  readonly warmupTicks: number;
  readonly sampleTicks: number;
  /** Build the world's contents through commands, recording what stuck. */
  build(recorder: PlanRecorder): void;
}

/** Create the world a plan describes - the same door `buildBenchmarkWorld` uses. */
export function planWorld(plan: BenchmarkPlan): World {
  return World.create({
    seed: plan.seed,
    difficulty: plan.difficulty,
    climate: plan.climate,
    mapSize: plan.mapSize,
    companyName: `Iron Veins Benchmark (${plan.id})`,
    companyColorIndex: 1,
    editorMode: true,
  });
}

/** Run a plan and hand back the file that describes what it built. */
export function recordPlan(plan: BenchmarkPlan): { map: BenchmarkMap; world: World } {
  const world = planWorld(plan);
  const recorder = new PlanRecorder(world);
  plan.build(recorder);
  const map: BenchmarkMap = {
    id: plan.id,
    seed: plan.seed,
    mapSize: plan.mapSize,
    climate: plan.climate,
    difficulty: plan.difficulty,
    editorMode: true,
    warmupTicks: plan.warmupTicks,
    sampleTicks: plan.sampleTicks,
    claims: measureBenchmarkWorld(world),
    commands: recorder.log,
  };
  return { map, world };
}

// --------------------------------------------------------------- the four plans

/**
 * A lattice of rail with a junction wherever two lines meet, and trains that
 * have to choose at every one of them.
 *
 * Horizontal runs first, then the vertical connectors that turn crossings into
 * junctions, then platforms and trains. The trains are what make it a benchmark
 * rather than a picture: a train on this map paths over a graph whose branching
 * factor is three or four at every eighth tile, and it re-paths whenever a
 * section it wanted is claimed (D-184).
 */
const MEGA_JUNCTION: BenchmarkPlan = {
  id: 'megaJunction',
  seed: 7,
  mapSize: 512,
  climate: MapClimate.Temperate,
  difficulty: Difficulty.Normal,
  warmupTicks: 400,
  sampleTicks: 2_000,
  build(recorder) {
    const size = recorder.world.map.size;
    const RUN = 24;
    const ROW_STEP = 8;
    const corridors: { x: number; y: number }[] = [];

    for (let y = 16; y < size - 16; y += ROW_STEP) {
      for (let x = 16; x + RUN < size - 16; x += RUN) {
        const laid = recorder.try({
          kind: CommandKind.BuildTrack,
          x1: x,
          y1: y,
          x2: x + RUN,
          y2: y,
          railType: RailType.Plain,
          assistant: false,
          signalSpacing: 6,
        });
        if (laid) corridors.push({ x, y });
      }
    }

    // The connectors. Every one that sticks turns two crossings into junctions.
    for (let x = 16; x < size - 16; x += 12) {
      for (let y = 16; y + ROW_STEP < size - 16; y += ROW_STEP) {
        recorder.try({
          kind: CommandKind.BuildTrack,
          x1: x,
          y1: y,
          x2: x,
          y2: y + ROW_STEP,
          railType: RailType.Plain,
          assistant: false,
          signalSpacing: 0,
        });
      }
    }

    // Platforms, sheds and trains on the corridors that were laid whole.
    let trains = 0;
    for (const corridor of corridors) {
      if (trains >= 48) break;
      const { x, y } = corridor;
      const before = recorder.world.stations.length;
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 6,
          y,
          moduleKind: ModuleKind.RailPlatform,
        })
      ) {
        continue;
      }
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 18,
          y,
          moduleKind: ModuleKind.RailPlatform,
        })
      ) {
        continue;
      }
      if (recorder.world.stations.length !== before + 2) continue;
      const near = recorder.world.stations[before]!;
      const far = recorder.world.stations[before + 1]!;
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 2,
          y,
          moduleKind: ModuleKind.RailDepot,
        })
      ) {
        continue;
      }
      if (
        !recorder.try({
          kind: CommandKind.BuyTrain,
          x: x + 2,
          y,
          specIds: [LOCO_SPEC, WAGON_SPEC, WAGON_SPEC, WAGON_SPEC],
        })
      ) {
        continue;
      }
      const vehicleId = recorder.lastVehicleId;
      recorder.try({ kind: CommandKind.RefitVehicle, vehicleId, cargo: Cargo.Coal });
      recorder.try({
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          { target: 0, targetId: near.id, load: 1, unload: 0 },
          { target: 0, targetId: far.id, load: 1, unload: 0 },
        ],
      });
      recorder.try({ kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
      trains++;
    }
  },
};

/** Build road lines between town pairs and fill them with buses. */
function roadNetwork(
  recorder: PlanRecorder,
  wantedVehicles: number,
  minSpan: number,
  maxSpan: number,
): void {
  const world = recorder.world;
  const towns = [...world.towns].sort((a, b) => a.id - b.id);
  const used = new Set<number>();
  const lines: { lineId: number; depotX: number; depotY: number }[] = [];

  for (let i = 0; i < towns.length; i++) {
    if (used.has(i)) continue;
    const a = towns[i]!;
    let best = -1;
    let bestSpan = Number.MAX_SAFE_INTEGER;
    for (let j = 0; j < towns.length; j++) {
      if (j === i || used.has(j)) continue;
      const b = towns[j]!;
      const span = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (span >= minSpan && span <= maxSpan && span < bestSpan) {
        bestSpan = span;
        best = j;
      }
    }
    if (best < 0) continue;
    const b = towns[best]!;
    if (!recorder.try({ kind: CommandKind.BuildRoad, x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
      continue;

    const before = world.stations.length;
    if (
      !recorder.try({
        kind: CommandKind.BuildRoadStop,
        x: a.x,
        y: a.y,
        moduleKind: ModuleKind.BusStop,
      })
    ) {
      continue;
    }
    if (
      !recorder.try({
        kind: CommandKind.BuildRoadStop,
        x: b.x,
        y: b.y,
        moduleKind: ModuleKind.BusStop,
      })
    ) {
      continue;
    }
    if (world.stations.length !== before + 2) continue;
    const near = world.stations[before]!;
    const far = world.stations[before + 1]!;

    // The shed stands BESIDE the carriageway where it can (D-210) - the
    // command decides which shape it is, and the plan only has to find a tile
    // it accepts.
    let depotX = -1;
    let depotY = -1;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = a.x + dx!;
      const y = a.y + dy!;
      if (
        recorder.try({ kind: CommandKind.BuildRoadStop, x, y, moduleKind: ModuleKind.RoadDepot })
      ) {
        depotX = x;
        depotY = y;
        break;
      }
    }
    if (depotX < 0) continue;

    if (!recorder.try({ kind: CommandKind.CreateLine })) continue;
    const lineId = world.lines.count - 1;
    if (
      !recorder.try({
        kind: CommandKind.SetLineOrders,
        lineId,
        orders: [
          { target: 0, targetId: near.id, load: 1, unload: 0 },
          { target: 0, targetId: far.id, load: 1, unload: 0 },
        ],
      })
    ) {
      continue;
    }
    used.add(i);
    used.add(best);
    lines.push({ lineId, depotX, depotY });
  }

  if (lines.length === 0) throw new Error('road network plan: no line could be built');

  // Fill the lines evenly, so the last one is never the only busy one.
  for (let bought = 0; bought < wantedVehicles; bought++) {
    const line = lines[bought % lines.length]!;
    if (
      !recorder.try({
        kind: CommandKind.BuyRoadVehicle,
        x: line.depotX,
        y: line.depotY,
        specId: BUS_SPEC,
      })
    ) {
      throw new Error('road network plan: a bus could not be bought');
    }
    const vehicleId = recorder.lastVehicleId;
    recorder.try({ kind: CommandKind.AssignVehicleToLine, vehicleId, lineId: line.lineId });
    recorder.try({ kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
  }
}

/**
 * The 1,500-vehicle megalopolis: section 21's own fleet size, on section 21's
 * own map size, built entirely out of commands.
 *
 * The difference from `fixture1500.ts` is the whole point of this milestone.
 * That fixture hand-builds flat ground and hand-places towns because a
 * balancing measurement must not depend on a seed; this one is a MAP - a
 * generated world an author laid a network over - and every tile of that
 * network is in the log.
 */
const MEGALOPOLIS: BenchmarkPlan = {
  id: 'megalopolis',
  seed: 7,
  mapSize: 1_024,
  climate: MapClimate.Temperate,
  difficulty: Difficulty.Normal,
  warmupTicks: 1_000,
  sampleTicks: 2_000,
  build(recorder) {
    roadNetwork(recorder, 1_500, 20, 70);
  },
};

/**
 * The 2048 archipelago: the largest map the game can hold, on a seed whose
 * ground is islands rather than one continent.
 *
 * What this one benchmarks is SIZE - 4.2 million tiles of layer, a land-mass
 * pass over all of them, a save that has to carry them - and the fleet on top
 * is deliberately modest, because a 2048 map with 1,500 vehicles would measure
 * the fleet again and this map exists to measure the other thing.
 */
const ARCHIPELAGO: BenchmarkPlan = {
  id: 'archipelago',
  seed: 3,
  mapSize: 2_048,
  climate: MapClimate.Temperate,
  difficulty: Difficulty.Normal,
  warmupTicks: 600,
  sampleTicks: 1_500,
  build(recorder) {
    // A wider span than the megalopolis's, and it is kept although the reason
    // it was written down has gone: until SPEC2 M23 bundle 3 the town ceiling
    // truncated this map to 140 towns over 4.2 million tiles, so a pairing
    // rule tuned for 1024 found almost nothing here. The ceiling scales with
    // area now (D-247) and the map carries 559, i.e. the same town density as
    // the megalopolis - the wide span survives because a big map is what this
    // benchmark exists to measure, and long hauls are what a big map has.
    roadNetwork(recorder, 300, 20, 160);
  },
};

/**
 * The 100k-edge network: architecture law #8's own number, built for real.
 *
 * Law #8 says "rail graphs reach 100k edges. Always iterative." Until this map
 * nothing in the repository had ever built one, so the law was a promise about
 * a world nobody had. An edge is a directed track arc (`railArcCount`), which
 * is the vocabulary the pathfinder searches over.
 */
const HUNDRED_K_EDGES: BenchmarkPlan = {
  id: 'hundredKEdges',
  seed: 42,
  mapSize: 1_024,
  climate: MapClimate.Temperate,
  difficulty: Difficulty.Normal,
  warmupTicks: 400,
  sampleTicks: 1_500,
  build(recorder) {
    const world = recorder.world;
    const size = world.map.size;
    const RUN = 32;
    const corridors: { x: number; y: number }[] = [];

    // Stop the moment the graph is big enough: every further run is another
    // line in a file somebody has to read, for an arc the law already has.
    for (let y = 8; y < size - 8 && railArcCount(world.map) < 88_000; y += 4) {
      for (let x = 8; x + RUN < size - 8; x += RUN) {
        const laid = recorder.try({
          kind: CommandKind.BuildTrack,
          x1: x,
          y1: y,
          x2: x + RUN,
          y2: y,
          railType: RailType.Plain,
          assistant: false,
          signalSpacing: 0,
        });
        if (laid) corridors.push({ x, y });
      }
    }

    // Connectors every fourth row, so the hundred thousand arcs are ONE graph
    // with junctions in it rather than a stack of unconnected straights.
    for (let x = 8; x < size - 8 && railArcCount(world.map) < 104_000; x += 24) {
      for (let y = 8; y + 4 < size - 8; y += 4) {
        recorder.try({
          kind: CommandKind.BuildTrack,
          x1: x,
          y1: y,
          x2: x,
          y2: y + 4,
          railType: RailType.Plain,
          assistant: false,
          signalSpacing: 0,
        });
      }
    }

    // A small fleet, because the point is the GRAPH: these trains path over a
    // hundred thousand arcs, which is the search law #8 exists for.
    let trains = 0;
    for (const corridor of corridors) {
      if (trains >= 24) break;
      const { x, y } = corridor;
      const before = world.stations.length;
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 8,
          y,
          moduleKind: ModuleKind.RailPlatform,
        })
      ) {
        continue;
      }
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 24,
          y,
          moduleKind: ModuleKind.RailPlatform,
        })
      ) {
        continue;
      }
      if (world.stations.length !== before + 2) continue;
      const near = world.stations[before]!;
      const far = world.stations[before + 1]!;
      if (
        !recorder.try({
          kind: CommandKind.BuildRailStop,
          x: x + 2,
          y,
          moduleKind: ModuleKind.RailDepot,
        })
      ) {
        continue;
      }
      if (
        !recorder.try({
          kind: CommandKind.BuyTrain,
          x: x + 2,
          y,
          specIds: [LOCO_SPEC, WAGON_SPEC, WAGON_SPEC],
        })
      ) {
        continue;
      }
      const vehicleId = recorder.lastVehicleId;
      recorder.try({ kind: CommandKind.RefitVehicle, vehicleId, cargo: Cargo.Coal });
      recorder.try({
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          { target: 0, targetId: near.id, load: 1, unload: 0 },
          { target: 0, targetId: far.id, load: 1, unload: 0 },
        ],
      });
      recorder.try({ kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
      trains++;
    }
  },
};

/** The four plans, in the catalogue's own order. */
export const BENCHMARK_PLANS: readonly BenchmarkPlan[] = [
  MEGA_JUNCTION,
  MEGALOPOLIS,
  ARCHIPELAGO,
  HUNDRED_K_EDGES,
];
