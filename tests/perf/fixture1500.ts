import type { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { Cargo } from '../../src/sim/cargo/types';
import { TICKS_PER_DAY } from '../../src/sim/constants';
import { IndustryType, newIndustry, type Industry } from '../../src/sim/industry/types';
import { SignalKind } from '../../src/sim/map/signals';
import { RailType, TrackDir } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import type { Town } from '../../src/sim/town/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The measured foundation of SPEC2 (Z6, M10): the world section 21 actually
 * names, built for real.
 *
 * Section 21's tick budget row reads "1,500 vehicles / 1024^2 / 120 towns /
 * 300 industries: p99 <= 8 ms". Until M10 the suite measured 300 road vehicles
 * and PRINTED a linear projection to 1,500 (D-120); every millisecond promise
 * in SPEC2's shared-resource ledger is priced against the 1,500-vehicle
 * baseline, so the projection had to become a measurement. This fixture is
 * that measurement's subject:
 *
 * - 1024^2 map, 120 towns, 300 industries - the full row, not a scaled one.
 * - 1,350 buses on 60 town-to-town lines carrying passengers, and 150 coal
 *   trains (a locomotive and eight wagons each) on 150 signalled mine-to-plant
 *   lines. Trains exercise the reservation table and the block signals every
 *   tick; the industries feed the daily collection gate and the monthly
 *   production hooks; the towns and the mixed cargo keep the M5 routing graph
 *   and the parcel expiry live. Nothing in the hot path is idle.
 * - every vehicle is RUNNING. A parked fleet is skipped by the update loop in
 *   a few instructions each, and measuring one would say the simulation is
 *   thirty times faster than it is - which is the same as not measuring it.
 *
 * The map is hand-built flat grassland in the balance suite's manner (D-038):
 * a generated 1024 map cannot yield 210 identical working lines, and the
 * measurement is about the simulation's cost, not about which seed the test
 * drew. Terrain-dependent costs (slope lookups, height reads) are the same
 * calls on flat ground; map GENERATION has its own budget and its own spec.
 *
 * Every line is built through ordinary commands and every rejection throws
 * (D-072): a fixture that silently lost fifty vehicles would measure a
 * different world than the one it claims to.
 */

export const MEASURED_MAP_SIZE = 1024;
export const MEASURED_VEHICLES = 1_500;
export const MEASURED_TOWNS = 120;
export const MEASURED_INDUSTRIES = 300;

/** 60 bus lines of two towns each is exactly the 120 towns of section 21. */
const BUS_LINES = 60;
/** 150 mine-to-plant pairs is exactly the 300 industries of section 21. */
const RAIL_LINES = 150;
const TRAINS = RAIL_LINES;
const BUSES = MEASURED_VEHICLES - TRAINS;

/**
 * The map is tiled into 64x16 cells of 64 tiles' width; each cell hosts one
 * self-contained line. 14 rows of 16 cells, spread over the whole map so the
 * working set touches the full tile arrays rather than one warm corner.
 */
const GRID_COLS = 16;
const CELL_W = 64;
const ROW_STRIDE = 72;
const FIRST_ROW = 8;

/** Stop-to-stop length of every line, the coal scenario's proven 45. [tiles] */
const LINE_TILES = 45;

/** Catalogue ids: the 1950 city bus, steam locomotive and open wagon. */
const BUS_SPEC = 200;
const LOCO_SPEC = 1_000;
const WAGON_SPEC = 1_520;
const WAGON_COUNT = 8;

/** Big enough that the passenger routing always has parcels in flight. */
const TOWN_POPULATION = 2_000;

/** A block signal roughly every seven tiles of plain line. [tiles] */
const SIGNAL_SPACING = 7;

/**
 * Days simulated before anything is measured: long enough for every bus to
 * file out of its depot, every train to reach its line and the first daily
 * collection hooks to have fired.
 */
const WARMUP_DAYS = 5;

export interface MeasuredWorld {
  readonly world: World;
  readonly queue: CommandQueue;
}

/** A bus line between two towns: road, two stops, one depot, its buses. */
function busModule(scenario: Scenario, oy: number, townA: Town, townB: Town, buses: number): void {
  const world = scenario.world;

  apply(scenario, { kind: CommandKind.BuildRoad, x1: townA.x, y1: oy, x2: townB.x, y2: oy });

  const before = world.stations.length;
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townA.x + 1,
    y: oy,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townB.x - 1,
    y: oy,
    moduleKind: ModuleKind.BusStop,
  });
  // Adjacent to the first stop, so it joins that station rather than adding one.
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townA.x + 2,
    y: oy,
    moduleKind: ModuleKind.RoadDepot,
  });
  if (world.stations.length !== before + 2) {
    throw new Error(
      `bus module at row ${oy}: expected 2 stations, got ${world.stations.length - before}`,
    );
  }
  const near = world.stations[before]!;
  const far = world.stations[before + 1]!;

  for (let i = 0; i < buses; i++) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: townA.x + 2, y: oy, specId: BUS_SPEC });
    const vehicleId = world.vehicles.count - 1;
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId,
      orders: [
        { target: 0, targetId: near.id, load: 1, unload: 0 },
        { target: 0, targetId: far.id, load: 1, unload: 0 },
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
  }
}

/**
 * A coal line in the shape balancing scenario 2 proved: track, two two-tile
 * platforms, a shed past the mine, block signals along the plain line, one
 * train of a locomotive and eight wagons refitted to coal.
 */
function railModule(scenario: Scenario, ox: number, oy: number): void {
  const world = scenario.world;
  const mineX = ox + 8;
  const plantX = mineX + LINE_TILES;

  apply(scenario, {
    kind: CommandKind.BuildTrack,
    x1: mineX - 4,
    y1: oy,
    x2: plantX + 3,
    y2: oy,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });

  const before = world.stations.length;
  for (let i = 0; i < 2; i++) {
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: mineX + i,
      y: oy,
      moduleKind: ModuleKind.RailPlatform,
    });
  }
  for (let i = 0; i < 2; i++) {
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: plantX + i,
      y: oy,
      moduleKind: ModuleKind.RailPlatform,
    });
  }
  // Four tiles short of the mine platforms, close enough to join their
  // station - a depot module never serves as a stop anyway (D-049).
  apply(scenario, {
    kind: CommandKind.BuildRailStop,
    x: mineX - 4,
    y: oy,
    moduleKind: ModuleKind.RailDepot,
  });
  if (world.stations.length !== before + 2) {
    throw new Error(
      `rail module at (${ox}, ${oy}): expected 2 stations, got ${world.stations.length - before}`,
    );
  }
  const mineStop = world.stations[before]!;
  const plantStop = world.stations[before + 1]!;

  // Two-way block signals on the plain line between the platforms, so the one
  // train claims and releases sections all day instead of one whole-line block.
  for (let x = mineX + SIGNAL_SPACING; x < plantX - 2; x += SIGNAL_SPACING) {
    apply(scenario, {
      kind: CommandKind.BuildSignal,
      x,
      y: oy,
      signalKind: SignalKind.Block,
      direction: TrackDir.East,
    });
  }

  const consist = [LOCO_SPEC];
  for (let i = 0; i < WAGON_COUNT; i++) consist.push(WAGON_SPEC);
  apply(scenario, { kind: CommandKind.BuyTrain, x: mineX - 4, y: oy, specIds: consist });
  const vehicleId = world.vehicles.count - 1;
  apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId, cargo: Cargo.Coal });
  apply(scenario, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId,
    orders: [
      // Take what is there rather than waiting for a full load - waiting parks
      // the train, and a parked train is exactly what this fixture must not
      // contain (and what ruins the mine's rating, per scenario 2's comment).
      { target: 0, targetId: mineStop.id, load: 1, unload: 0 },
      { target: 0, targetId: plantStop.id, load: 2, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
}

/** Build the section 21 world, warmed up until the whole fleet is working. */
export function buildMeasuredWorld(): MeasuredWorld {
  // Lay the ground plan first: flatScenario needs every town and industry
  // before the world exists. Cells 0..59 are bus lines, 60..209 rail lines.
  const towns: Town[] = [];
  const industries: Industry[] = [];
  for (let cell = 0; cell < BUS_LINES + RAIL_LINES; cell++) {
    const ox = (cell % GRID_COLS) * CELL_W;
    const oy = FIRST_ROW + ((cell / GRID_COLS) | 0) * ROW_STRIDE;
    if (cell < BUS_LINES) {
      towns.push(makeTown(towns.length, ox + 7, oy, TOWN_POPULATION, `Perfstadt ${towns.length}`));
      towns.push(
        makeTown(
          towns.length,
          ox + 7 + LINE_TILES,
          oy,
          TOWN_POPULATION,
          `Perfstadt ${towns.length}`,
        ),
      );
    } else {
      industries.push(newIndustry(industries.length, IndustryType.CoalMine, ox + 8, oy + 2, 0));
      industries.push(
        newIndustry(industries.length, IndustryType.PowerPlant, ox + 8 + LINE_TILES, oy + 2, 0),
      );
    }
  }
  if (towns.length !== MEASURED_TOWNS || industries.length !== MEASURED_INDUSTRIES) {
    throw new Error(`ground plan: ${towns.length} towns, ${industries.length} industries`);
  }

  const scenario = flatScenario(MEASURED_MAP_SIZE, towns, industries, 21_000);
  const world = scenario.world;
  // A perf fixture, not an economy one: 210 lines and 1,500 vehicles cost more
  // than any starting capital, and going bankrupt mid-measurement would swap
  // the fleet being measured for a winding-up.
  world.company.cashCt = 900_000_000_00;

  for (let cell = 0; cell < BUS_LINES + RAIL_LINES; cell++) {
    const ox = (cell % GRID_COLS) * CELL_W;
    const oy = FIRST_ROW + ((cell / GRID_COLS) | 0) * ROW_STRIDE;
    if (cell < BUS_LINES) {
      // 1,350 buses over 60 lines: the first 30 lines carry 23, the rest 22.
      const buses = (BUSES / BUS_LINES) | 0;
      const extra = cell < BUSES - buses * BUS_LINES ? 1 : 0;
      busModule(scenario, oy, towns[cell * 2]!, towns[cell * 2 + 1]!, buses + extra);
    } else {
      railModule(scenario, ox, oy);
    }
  }

  if (world.vehicles.livingCount !== MEASURED_VEHICLES) {
    throw new Error(
      `fixture built ${world.vehicles.livingCount} vehicles, wanted ${MEASURED_VEHICLES}`,
    );
  }

  for (let i = 0; i < TICKS_PER_DAY * WARMUP_DAYS; i++) world.step(scenario.queue, null);

  return { world, queue: scenario.queue };
}

/** How many vehicles of the fixture are in each state, for the log. */
export function stateHistogram(world: World): Map<number, number> {
  const counts = new Map<number, number>();
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] !== 1) continue;
    const state = world.vehicles.state[id]!;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}

/**
 * A vehicle is WORKING when it is out on its orders: driving, braking,
 * loading, held at a signal or even broken down mid-journey - anything except
 * parked, still in the shed, or routeless. The distinction is the whole point
 * of the fixture (the "parked fleet" trap of M9's perf notes).
 */
export function workingCount(world: World): number {
  let working = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] !== 1) continue;
    const state = world.vehicles.state[id]!;
    if (
      state !== VehicleState.Stopped &&
      state !== VehicleState.InDepot &&
      state !== VehicleState.NoRoute
    ) {
      working++;
    }
  }
  return working;
}
