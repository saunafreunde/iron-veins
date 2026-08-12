import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  START_YEAR,
  TICKS_PER_YEAR,
  WeatherRule,
} from '../../src/sim/constants';
import { industrySpec, type Industry } from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { ModuleKind } from '../../src/sim/station/types';
import { CouncilProfile } from '../../src/sim/town/council';
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

/**
 * Lay a block of town: a road cross with houses along it.
 *
 * Exported since SPEC2 M15: the Netzdesign scenario builds its own world (it
 * needs the 8.4 route rules on and a fleet's worth of capital), but it must
 * place its towns exactly the way every other balancing scenario does, or the
 * catchment it measures would be a different catchment.
 */
export function placeTown(map: TileMap, town: Town): void {
  const half = town.radius;

  // The whole built-up area belongs to the town, exactly as the map generator
  // claims it - the council of section 13.3 asks a TILE which town it is in.
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      if (!map.contains(town.x + dx, town.y + dy)) continue;
      map.townId[map.tileIndex(town.x + dx, town.y + dy)] = town.id;
    }
  }

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

/** Anything the shared helpers below can drive. */
export interface Scenario {
  readonly world: World;
  readonly queue: CommandQueue;
}

export interface TwoTownScenario extends Scenario {
  readonly townA: Town;
  readonly townB: Town;
}

/**
 * Flat grassland with hand-placed towns and industries, and nothing random.
 *
 * The chain scenarios need a coal mine exactly 45 tiles from a power plant, or
 * a forest, a sawmill and a furniture works in a line - which no generated map
 * will ever offer. Building the ground by hand is what keeps the measurement
 * about the economy rather than about which seed the test drew.
 */
export function flatScenario(
  size: number,
  towns: Town[],
  industries: Industry[],
  seed = 9,
  aiCompanies = 0,
  emissions = true,
  /**
   * The weather rule of SPEC2 M18. Off by default and off in every balancing
   * scenario: all five bands of section 19.4 were measured by a simulation
   * with no weather in it, and a rule that shipped on by default would re-band
   * the lot (Fehlerkatalog 34). It is a parameter because the seasonal seams
   * have to be provable on a controlled world.
   */
  weather: WeatherRule = WeatherRule.Off,
  /**
   * The council-election rule of SPEC2 M20. Off by default and off in every
   * balancing scenario, for the reason above it one milestone on: every band
   * of section 19.4 was measured by councils that never faced a voter, and an
   * election reweights the rating that SPEC.md 13.2's growth formula is scaled
   * by (D-232). It is a parameter because the ballot has to be provable on a
   * controlled world.
   */
  elections = false,
  /**
   * The century rule of SPEC2 M21 (E-09). Off by default and off in every
   * balancing scenario, for the reason above it one milestone on: every band
   * this game owns was measured on a flat century, and the curve multiplies
   * exactly the tariff, cost, output and energy seams those bands are made of
   * (Fehlerkatalog 34). It is a parameter because the four seams have to be
   * provable on a controlled world.
   */
  economy = false,
  /**
   * The start year of SPEC2 E-15 (M23). `START_YEAR` by default and in every
   * band measured before M23: the calendar decides which vehicles exist, what
   * a delivery pays and what a build costs, so a scenario that began in
   * another century would be a different measurement of a different economy.
   * It is a parameter because the 1870s twins of scenarios 1 and 2 have to be
   * playable on the same controlled worlds (D-245).
   */
  startYear: number = START_YEAR,
  /**
   * The world's climate (SPEC2 M23, D-246). `Temperate` by default and in
   * every band measured before the climate matrix: the temperate set IS the
   * whole catalogue, so a temperate world is the world every number in
   * section 19.4 was measured on and goes on being measured on.
   *
   * It is a parameter because SPEC2 M23 asks for scenarios 1-4 banded PER
   * CLIMATE, and a matrix that built its own worlds would be measuring four
   * different economies rather than one economy under four climates (the
   * D-187 rule this file already lives by).
   */
  climate: MapClimate = MapClimate.Temperate,
): Scenario {
  const map = new TileMap(size);
  map.cornerHeight.fill(GROUND_HEIGHT);
  map.terrain.fill(Terrain.Grass);

  for (const town of towns) placeTown(map, town);
  for (const industry of industries) {
    const footprint = industrySpec(industry.type).footprint;
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        map.industryId[map.tileIndex(industry.x + dx, industry.y + dy)] = industry.id;
      }
    }
  }

  const world = World.fromGenerated(
    {
      seed,
      difficulty: Difficulty.Normal,
      climate,
      mapSize: size,
      companyName: 'Balancing AG',
      companyColorIndex: 1,
      startYear,
      aiCompanies,
      emissions,
      weather,
      elections,
      economy,
    },
    { map, towns, industries, seedUsed: seed },
  );
  return { world, queue: new CommandQueue() };
}

/** A town of `population` at (x, y), laid out the way placeTown expects. */
export function makeTown(id: number, x: number, y: number, population: number, name: string): Town {
  return {
    id,
    name,
    x,
    y,
    sizeClass: TownSize.Town,
    population,
    radius: 4,
    producedThisMonth: 0,
    transportedThisMonth: 0,
    goodsDeliveredThisMonth: 0,
    foodDeliveredThisMonth: 0,
    electronicsDeliveredThisMonth: 0,
    buildingMaterialThisMonth: 0,
    supplyProducedMean: 0,
    supplyTransportedMean: 0,
    supplyMonths: 0,
    roadTilesThisMonth: 0,
    transportedByCompany: [],
    councilRating: [],
    councilGoodwill: [],
    exclusiveCompanyId: -1,
    exclusiveUntilTick: 0,
    measureReadyTick: [],
    councilProfile: CouncilProfile.Balanced,
    noiseBarrierUntilTick: [],
  };
}

/**
 * Flat map with two towns `distance` tiles apart on the same row.
 *
 * `startYear` is SPEC2 E-15's rule and defaults to `START_YEAR`, which is the
 * world every caller of this helper measured before M23. The 1870s twin of
 * scenario 1 is the one caller that passes something else, and it passes it
 * HERE rather than building its own two-town world - the D-187 discipline
 * `coalLine.ts` states for scenario 2: two files that each built their own
 * would be measuring two different towns within a game year of the first edit.
 */
export function twoTownScenario(
  population: number,
  distance: number,
  startYear: number = START_YEAR,
  climate: MapClimate = MapClimate.Temperate,
  weather: WeatherRule = WeatherRule.Off,
): TwoTownScenario {
  const y = SCENARIO_SIZE >> 1;
  const startX = (SCENARIO_SIZE - distance) >> 1;
  const townA = makeTown(0, startX, y, population, 'Westheim');
  const townB = makeTown(1, startX + distance, y, population, 'Ostheim');

  const scenario = flatScenario(
    SCENARIO_SIZE,
    [townA, townB],
    [],
    1,
    0,
    true,
    weather,
    false,
    false,
    startYear,
    climate,
  );
  return { ...scenario, townA, townB };
}

/** Execute a command immediately, and fail loudly if the world refuses it. */
export function apply(scenario: Scenario, command: Command, companyId = 0): void {
  scenario.queue.enqueue(command, scenario.world.tick, companyId);
  let rejected: string | null = null;
  scenario.world.drainCommands(scenario.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) {
    throw new Error(`scenario command ${command.kind} was rejected: ${String(rejected)}`);
  }
}

/** Execute a command and return the rejection key, or null if it was accepted. */
export function tryApply(scenario: Scenario, command: Command, companyId = 0): string | null {
  scenario.queue.enqueue(command, scenario.world.tick, companyId);
  let rejected: string | null = null;
  scenario.world.drainCommands(scenario.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
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
export function runYears(scenario: Scenario, years: number): number[] {
  const balances: number[] = [];
  for (let year = 0; year < years; year++) {
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) {
      scenario.world.step(scenario.queue, null);
    }
    balances.push(scenario.world.company.cashCt);
  }
  return balances;
}
