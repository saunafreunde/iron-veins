import type { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CENTS_PER_EURO,
  MapClimate,
  START_YEAR,
  TICKS_PER_YEAR,
  WeatherRule,
} from '../../src/sim/constants';
import { IndustryType, newIndustry, type Industry } from '../../src/sim/industry/types';
import { ModuleKind } from '../../src/sim/station/types';
import { Cargo as CargoIds } from '../../src/sim/cargo/types';
import { apply, flatScenario, makeTown, type Scenario } from './scenario';

/**
 * THE road-hauled production chains, as one builder rather than as one per
 * file - `coalLine.ts` for chains, and for exactly its reason (D-187).
 *
 * Balancing scenario 3 (`woodChain.spec.ts`) measures what a fully built chain
 * EARNS; SPEC2 M23's per-climate D-118 run (`climateMatrix.spec.ts`) measures
 * that each climate's own signature chain can actually be built and driven.
 * Two files that each laid their own road, placed their own works and bought
 * their own lorries would be measuring two different chains within a game year
 * of the first edit, and scenario 3's band would quietly stop being about the
 * chain the climate run proves.
 *
 * What a caller may vary is the SPEC - which works, which hauls, which
 * decade - plus the climate and the weather rule. Everything else (the road,
 * the stop layout, the depot, four lorries a haul, the orders, the capital)
 * lives here, because that is what "a fully built chain" means in this
 * project.
 */

/** One works of a chain, and where it stands. */
export interface ChainWorks {
  readonly type: IndustryType;
  readonly x: number;
}

/** One haul of a chain: from a stop, to a stop, carrying one cargo. */
export interface ChainHaul {
  readonly fromX: number;
  readonly toX: number;
  readonly cargo: Cargo;
  readonly specId: number;
}

/** Everything that makes one chain the chain it is. */
export interface ChainSpec {
  readonly size: number;
  /** The row the road runs along; the works stand two rows off it. */
  readonly row: number;
  readonly works: readonly ChainWorks[];
  /** A town at the end of the chain, or null when the sink is a works. */
  readonly town: { readonly x: number; readonly population: number; readonly name: string } | null;
  readonly roadFromX: number;
  readonly roadToX: number;
  readonly depotX: number;
  /** Where a lorry bay stands, in the order they are built. */
  readonly stopXs: readonly number[];
  readonly hauls: readonly ChainHaul[];
  /** Lorries on each haul. */
  readonly lorriesPerHaul: number;
  /** The first calendar year every vehicle of the chain exists in. */
  readonly firstYear: number;
  /** Capital, because this measures a chain that is already built. */
  readonly capitalCt: number;
}

export const CHAIN_SIZE = 128;
export const CHAIN_ROW = 40;
/** Works stand one row off the road: a road may not cross an industry. */
export const CHAIN_WORKS_ROW = CHAIN_ROW + 2;

/** A 1950 bulk lorry for raw material, and a 1950 box lorry for the rest. */
export const BULK_LORRY = 240;
export const BOX_LORRY = 250;
/** The 1971 bulk lorry - the first road vehicle that can carry cement. */
export const BULK_LORRY_1971 = 241;
/** The 1958 refrigerated lorry, for livestock and food. */
export const FOOD_LORRY = 260;
/** The 1955 tanker, for oil and chemicals. */
export const TANKER_LORRY = 270;

export const CHAIN_LORRIES_PER_LINE = 4;
export const CHAIN_CAPITAL_CT = 5_000_000 * CENTS_PER_EURO;

const FOREST_X = 10;
const SAWMILL_X = 40;
const FURNITURE_X = 70;
const WOOD_TOWN_X = 100;

/**
 * Balancing scenario 3's own chain: forest, sawmill, furniture works, town.
 *
 * The numbers are scenario 3's to the tile and to the year - the chain cannot
 * exist before the box lorry of 1953 does, which is also when a player could
 * first build it.
 */
export const WOOD_CHAIN: ChainSpec = {
  size: CHAIN_SIZE,
  row: CHAIN_ROW,
  works: [
    { type: IndustryType.Forestry, x: FOREST_X },
    { type: IndustryType.Sawmill, x: SAWMILL_X },
    { type: IndustryType.FurnitureFactory, x: FURNITURE_X },
  ],
  town: { x: WOOD_TOWN_X, population: 2_500, name: 'Holzhausen' },
  roadFromX: FOREST_X - 3,
  roadToX: WOOD_TOWN_X,
  depotX: FOREST_X - 3,
  stopXs: [FOREST_X, SAWMILL_X, FURNITURE_X, WOOD_TOWN_X - 1],
  hauls: [
    { fromX: FOREST_X, toX: SAWMILL_X, cargo: CargoIds.Wood, specId: BULK_LORRY },
    { fromX: SAWMILL_X, toX: FURNITURE_X, cargo: CargoIds.Planks, specId: BOX_LORRY },
    { fromX: FURNITURE_X, toX: WOOD_TOWN_X, cargo: CargoIds.Goods, specId: BOX_LORRY },
  ],
  lorriesPerHaul: CHAIN_LORRIES_PER_LINE,
  firstYear: 1953,
  capitalCt: CHAIN_CAPITAL_CT,
};

/**
 * The whole chain: one road, a stop at each works, and lorries on each haul.
 *
 * Every command goes through `apply`, so a chain that cannot be built in this
 * world - a vehicle the climate refuses (D-246), a works on a tile the road
 * wants - is a loud failure rather than a quiet zero.
 */
export function buildChain(
  spec: ChainSpec,
  climate: MapClimate = MapClimate.Temperate,
  weather: WeatherRule = WeatherRule.Off,
): Scenario {
  const industries: Industry[] = spec.works.map((works, index) =>
    newIndustry(index, works.type, works.x, CHAIN_WORKS_ROW, 0),
  );
  const towns =
    spec.town === null
      ? []
      : [makeTown(0, spec.town.x, spec.row, spec.town.population, spec.town.name)];
  const scenario = flatScenario(
    spec.size,
    towns,
    industries,
    9,
    0,
    true,
    weather,
    false,
    false,
    START_YEAR,
    climate,
  );
  const world = scenario.world;
  // Four lorries a haul is more than the starting capital buys; a chain
  // scenario measures a chain that is already built, not the climb to build it.
  world.company.cashCt = spec.capitalCt;
  // The chain cannot exist before its own vehicles do, and the year it can
  // first be built in is part of what the chain IS.
  world.tick = (spec.firstYear - START_YEAR) * TICKS_PER_YEAR;

  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: spec.roadFromX,
    y1: spec.row,
    x2: spec.roadToX,
    y2: spec.row,
  });
  for (const x of spec.stopXs) {
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x,
      y: spec.row,
      moduleKind: ModuleKind.LorryBay,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: spec.depotX,
    y: spec.row,
    moduleKind: ModuleKind.RoadDepot,
  });

  const stopAt = (x: number): number => {
    const tile = world.map.tileIndex(x, spec.row);
    return world.stations.find((station) =>
      station.modules.some((module) => module.tileIndex === tile),
    )!.id;
  };
  const sinkX = spec.town === null ? null : spec.town.x;
  const townStop = sinkX === null ? -1 : stopAt(sinkX - 1);

  let vehicleId = 0;
  for (const haul of spec.hauls) {
    const from = stopAt(haul.fromX);
    const to = haul.toX === sinkX ? townStop : stopAt(haul.toX);
    for (let i = 0; i < spec.lorriesPerHaul; i++) {
      apply(scenario, {
        kind: CommandKind.BuyRoadVehicle,
        x: spec.depotX,
        y: spec.row,
        specId: haul.specId,
      });
      apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId, cargo: haul.cargo });
      apply(scenario, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          { target: 0, targetId: from, load: 1, unload: 0 },
          { target: 0, targetId: to, load: 1, unload: 0 },
        ],
      });
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
      vehicleId++;
    }
  }
  return scenario;
}

/** Balancing scenario 3's chain, built exactly as scenario 3 builds it. */
export function buildWoodChain(
  climate: MapClimate = MapClimate.Temperate,
  weather: WeatherRule = WeatherRule.Off,
): Scenario {
  return buildChain(WOOD_CHAIN, climate, weather);
}
