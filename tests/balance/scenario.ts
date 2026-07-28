import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { Difficulty, MapClimate, TICKS_PER_YEAR } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { ModuleKind } from '../../src/sim/station/types';
import { BuildingKind, RoadBit, TownSize, type Town } from '../../src/sim/town/types';
import { World } from '../../src/sim/World';

/**
 * Controlled worlds for the balancing scenarios of section 19.4.
 *
 * A generated map cannot produce "two towns of 1,200 inhabitants exactly 25
 * tiles apart", so the scenarios build their own: flat grassland, hand placed
 * towns, nothing random. That keeps the measurement about the economy rather
 * than about which seed the test happened to draw.
 */

export const SCENARIO_SIZE = 64;
const GROUND_HEIGHT = 5;

/** Lay a block of town: a road cross with houses along it. */
function placeTown(map: TileMap, town: Town): void {
  const half = town.radius;

  for (let offset = -half; offset <= half; offset++) {
    for (const [x, y] of [
      [town.x + offset, town.y],
      [town.x, town.y + offset],
    ]) {
      if (!map.contains(x!, y!)) continue;
      const index = map.tileIndex(x!, y!);
      map.terrain[index] = Terrain.TownGround;
      map.townId[index] = town.id;
    }
  }

  // Connect the road tiles of both arms.
  for (let offset = -half; offset < half; offset++) {
    const a = map.tileIndex(town.x + offset, town.y);
    const b = map.tileIndex(town.x + offset + 1, town.y);
    map.roadBits[a] = map.roadBits[a]! | RoadBit.East;
    map.roadBits[b] = map.roadBits[b]! | RoadBit.West;

    const c = map.tileIndex(town.x, town.y + offset);
    const d = map.tileIndex(town.x, town.y + offset + 1);
    map.roadBits[c] = map.roadBits[c]! | RoadBit.South;
    map.roadBits[d] = map.roadBits[d]! | RoadBit.North;
  }

  // Houses either side of the arms, which is what a station's catchment counts.
  for (let offset = -half; offset <= half; offset++) {
    for (const [x, y] of [
      [town.x + offset, town.y - 1],
      [town.x + offset, town.y + 1],
      [town.x - 1, town.y + offset],
      [town.x + 1, town.y + offset],
    ]) {
      if (!map.contains(x!, y!)) continue;
      const index = map.tileIndex(x!, y!);
      if (map.roadBits[index] !== 0) continue;
      map.buildingKind[index] = BuildingKind.Residential;
      map.buildingLevel[index] = 1;
      map.terrain[index] = Terrain.TownGround;
      map.townId[index] = town.id;
    }
  }
}

export interface TwoTownScenario {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly townA: Town;
  readonly townB: Town;
}

/** Flat map with two towns `distance` tiles apart on the same row. */
export function twoTownScenario(population: number, distance: number): TwoTownScenario {
  const map = new TileMap(SCENARIO_SIZE);
  map.cornerHeight.fill(GROUND_HEIGHT);
  map.terrain.fill(Terrain.Grass);

  const y = SCENARIO_SIZE >> 1;
  const startX = (SCENARIO_SIZE - distance) >> 1;

  const makeTown = (id: number, x: number, name: string): Town => ({
    id,
    name,
    x,
    y,
    sizeClass: TownSize.Town,
    population,
    radius: 4,
    producedThisMonth: 0,
    transportedThisMonth: 0,
  });

  const townA = makeTown(0, startX, 'Westheim');
  const townB = makeTown(1, startX + distance, 'Ostheim');
  placeTown(map, townA);
  placeTown(map, townB);

  const world = World.fromGenerated(
    {
      seed: 1,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SCENARIO_SIZE,
      companyName: 'Balancing AG',
      companyColorIndex: 1,
    },
    { map, towns: [townA, townB], industries: [], seedUsed: 1 },
  );

  return { world, queue: new CommandQueue(), townA, townB };
}

/** Execute a command immediately, and fail loudly if the world refuses it. */
export function apply(scenario: TwoTownScenario, command: Command): void {
  scenario.queue.enqueue(command, scenario.world.tick);
  let rejected: string | null = null;
  scenario.world.drainCommands(scenario.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) {
    throw new Error(`scenario command ${command.kind} was rejected: ${String(rejected)}`);
  }
}

/**
 * Build the classic starter line: a road between the two towns, a stop at each
 * end, a depot, and `busCount` buses running back and forth.
 */
export function buildBusLine(scenario: TwoTownScenario, specId: number, busCount: number): void {
  const { world, townA, townB } = scenario;

  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: townA.x,
    y1: townA.y,
    x2: townB.x,
    y2: townB.y,
  });

  // Stops sit one tile outside the town centre so they do not replace a house.
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townA.x + 1,
    y: townA.y,
    moduleKind: ModuleKind.BusStop,
  });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: townB.x - 1,
    y: townB.y,
    moduleKind: ModuleKind.BusStop,
  });
  const depotX = townA.x + 2;
  const depotY = townA.y;
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: depotX,
    y: depotY,
    moduleKind: ModuleKind.RoadDepot,
  });

  // The depot is close enough to the first stop to join its station, so the
  // depot tile has to be addressed directly rather than through a station.
  const stopA = world.stations[0]!;
  const stopB = world.stations[1]!;

  for (let i = 0; i < busCount; i++) {
    apply(scenario, {
      kind: CommandKind.BuyRoadVehicle,
      x: depotX,
      y: depotY,
      specId,
    });
    const vehicleId = world.vehicles.count - 1;
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId,
      orders: [
        { target: 0, targetId: stopA.id, load: 1, unload: 0 },
        { target: 0, targetId: stopB.id, load: 1, unload: 0 },
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
  }
}

/** Run `years` game years, returning the company balance at each year end. */
export function runYears(scenario: TwoTownScenario, years: number): number[] {
  const balances: number[] = [];
  for (let year = 0; year < years; year++) {
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    balances.push(scenario.world.company.cashCt);
  }
  return balances;
}
