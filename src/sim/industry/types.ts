import { Cargo } from '../cargo/types';
import {
  INDUSTRY_BASE_OUTPUT_PER_MONTH,
  INDUSTRY_FLUCTUATION_AMPLITUDE,
  INDUSTRY_FLUCTUATION_PERIOD_YEARS,
  INDUSTRY_LEVEL_START,
  INDUSTRY_NEAR_TOWN_DISTANCE,
  INDUSTRY_STOCK_MONTHS,
  TICKS_PER_YEAR,
  TRIG_TABLE_SIZE,
} from '../constants';
import { Terrain } from '../map/terrain';
import { sinTurns } from '../math';

/**
 * Industry catalogue and the placement rules of section 6.6.
 *
 * Production mechanics (stock, expansion, closure) arrive in M5; what the map
 * generator needs now is the recipe graph, because it has to prove that every
 * processing industry can actually be supplied on its own land mass.
 */

export const IndustryType = {
  CoalMine: 0,
  IronOreMine: 1,
  OilWell: 2,
  Forestry: 3,
  Farm: 4,
  GravelPit: 5,
  PowerPlant: 6,
  SteelMill: 7,
  Sawmill: 8,
  FurnitureFactory: 9,
  MachineFactory: 10,
  ElectronicsFactory: 11,
  FoodFactory: 12,
  Refinery: 13,
  PlasticsPlant: 14,
  CementWorks: 15,
  BuildersMerchant: 16,
} as const;
export type IndustryType = (typeof IndustryType)[keyof typeof IndustryType];

export const INDUSTRY_TYPE_COUNT = 17;

/** Where an industry of a given type is allowed to stand. */
export interface PlacementRule {
  /** Terrain types the industry may be built on. */
  readonly terrains: readonly number[];
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Optional: a terrain that has to be within `maxDistance` tiles. */
  readonly nearTerrain?: { readonly terrain: number; readonly maxDistance: number };
  /** Optional: distance within which a town centre has to be. [tiles] */
  readonly nearTownDistance?: number;
}

export interface IndustrySpec {
  readonly type: IndustryType;
  readonly nameKey: string;
  /** Cargo consumed. Empty for primary industries. */
  readonly inputs: readonly Cargo[];
  /** Cargo produced. Empty for pure sinks such as the power plant. */
  readonly outputs: readonly Cargo[];
  /** Edge length of the square the industry occupies. [tiles] */
  readonly footprint: number;
  /** Relative frequency when the generator picks a type to place. */
  readonly weight: number;
  readonly placement: PlacementRule;
}

const HILLS: PlacementRule = {
  terrains: [Terrain.Rock, Terrain.Grass, Terrain.Snow],
  minHeight: 7,
  maxHeight: 14,
};

const LOWLAND: PlacementRule = {
  terrains: [Terrain.Grass, Terrain.Field],
  minHeight: 4,
  maxHeight: 9,
};

const NEAR_TOWN: PlacementRule = {
  terrains: [Terrain.Grass, Terrain.Field, Terrain.Coast],
  minHeight: 4,
  maxHeight: 10,
  nearTownDistance: INDUSTRY_NEAR_TOWN_DISTANCE,
};

export const INDUSTRY_SPECS: readonly IndustrySpec[] = [
  {
    type: IndustryType.CoalMine,
    nameKey: 'industry.coalMine',
    inputs: [],
    outputs: [Cargo.Coal],
    footprint: 2,
    weight: 10,
    placement: HILLS,
  },
  {
    type: IndustryType.IronOreMine,
    nameKey: 'industry.ironOreMine',
    inputs: [],
    outputs: [Cargo.IronOre],
    footprint: 2,
    weight: 8,
    placement: HILLS,
  },
  {
    type: IndustryType.OilWell,
    nameKey: 'industry.oilWell',
    inputs: [],
    outputs: [Cargo.Oil],
    footprint: 2,
    weight: 6,
    placement: {
      terrains: [Terrain.Desert, Terrain.Coast, Terrain.Marsh],
      minHeight: 4,
      maxHeight: 8,
    },
  },
  {
    type: IndustryType.Forestry,
    nameKey: 'industry.forestry',
    inputs: [],
    outputs: [Cargo.Wood],
    footprint: 2,
    weight: 10,
    placement: {
      terrains: [Terrain.Forest, Terrain.Grass],
      minHeight: 4,
      maxHeight: 12,
      nearTerrain: { terrain: Terrain.Forest, maxDistance: 8 },
    },
  },
  {
    type: IndustryType.Farm,
    nameKey: 'industry.farm',
    inputs: [],
    outputs: [Cargo.Grain, Cargo.Livestock],
    footprint: 3,
    weight: 12,
    placement: LOWLAND,
  },
  {
    type: IndustryType.GravelPit,
    nameKey: 'industry.gravelPit',
    inputs: [],
    outputs: [Cargo.Gravel],
    footprint: 2,
    weight: 6,
    placement: {
      terrains: [Terrain.Rock, Terrain.Grass, Terrain.Desert],
      minHeight: 5,
      maxHeight: 11,
    },
  },
  {
    type: IndustryType.PowerPlant,
    nameKey: 'industry.powerPlant',
    inputs: [Cargo.Coal],
    outputs: [],
    footprint: 3,
    weight: 5,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.SteelMill,
    nameKey: 'industry.steelMill',
    inputs: [Cargo.Coal, Cargo.IronOre],
    outputs: [Cargo.Steel],
    footprint: 3,
    weight: 5,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.Sawmill,
    nameKey: 'industry.sawmill',
    inputs: [Cargo.Wood],
    outputs: [Cargo.Planks],
    footprint: 2,
    weight: 6,
    placement: {
      terrains: [Terrain.Grass, Terrain.Field, Terrain.Forest],
      minHeight: 4,
      maxHeight: 11,
    },
  },
  {
    type: IndustryType.FurnitureFactory,
    nameKey: 'industry.furnitureFactory',
    inputs: [Cargo.Planks],
    outputs: [Cargo.Goods],
    footprint: 2,
    weight: 4,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.MachineFactory,
    nameKey: 'industry.machineFactory',
    inputs: [Cargo.Steel],
    outputs: [Cargo.Goods],
    footprint: 3,
    weight: 4,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.ElectronicsFactory,
    nameKey: 'industry.electronicsFactory',
    inputs: [Cargo.Steel, Cargo.Plastics],
    outputs: [Cargo.Electronics],
    footprint: 2,
    weight: 3,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.FoodFactory,
    nameKey: 'industry.foodFactory',
    inputs: [Cargo.Grain, Cargo.Livestock],
    outputs: [Cargo.Food],
    footprint: 2,
    weight: 5,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.Refinery,
    nameKey: 'industry.refinery',
    inputs: [Cargo.Oil],
    outputs: [Cargo.Chemicals],
    footprint: 3,
    weight: 4,
    placement: {
      terrains: [Terrain.Coast, Terrain.Grass, Terrain.Desert],
      minHeight: 4,
      maxHeight: 8,
    },
  },
  {
    type: IndustryType.PlasticsPlant,
    nameKey: 'industry.plasticsPlant',
    inputs: [Cargo.Chemicals],
    outputs: [Cargo.Plastics],
    footprint: 2,
    weight: 3,
    placement: NEAR_TOWN,
  },
  {
    type: IndustryType.CementWorks,
    nameKey: 'industry.cementWorks',
    inputs: [Cargo.Gravel],
    outputs: [Cargo.Cement],
    footprint: 2,
    weight: 4,
    placement: {
      terrains: [Terrain.Grass, Terrain.Field, Terrain.Rock, Terrain.Desert],
      minHeight: 4,
      maxHeight: 10,
    },
  },
  {
    type: IndustryType.BuildersMerchant,
    nameKey: 'industry.buildersMerchant',
    inputs: [Cargo.Cement],
    outputs: [],
    footprint: 2,
    weight: 4,
    placement: NEAR_TOWN,
  },
];

export function industrySpec(type: IndustryType): IndustrySpec {
  return INDUSTRY_SPECS[type]!;
}

/**
 * A placed industry, with the production state of section 6.
 *
 * The stock slots are flat scalars indexed positionally into the spec's inputs
 * and outputs rather than a per-cargo array: no industry in the catalogue has
 * more than two of either, there are a couple of hundred of them on a large
 * map, and the production passes run once a day rather than once a tick. An
 * industry with three inputs would need a third slot, and the invariant test
 * fails the moment somebody adds one.
 */
export interface Industry {
  readonly id: number;
  readonly type: IndustryType;
  /** North-west corner of the footprint. */
  readonly x: number;
  readonly y: number;
  /** Land component the industry stands on, for reachability checks. */
  readonly landmassId: number;

  /** Delivered input waiting to be used, per input slot. [units] */
  inputStock0: number;
  inputStock1: number;
  /** Finished output waiting to be collected, per output slot. [units] */
  outputStock0: number;
  outputStock1: number;

  /**
   * Output as a percentage of the base figure. An integer, so a monthly step is
   * bit exact and cannot drift.
   */
  productionLevel: number;
  /** What it made this month, BEFORE the service gate. */
  producedThisMonth: number;
  /** What actually left for a station this month. */
  collectedThisMonth: number;
  /** Months since the level last moved; the hysteresis dead band. */
  monthsSinceLevelChange: number;

  /**
   * Running average of the share collected, over the last twelve months.
   *
   * A ring of twelve figures would be the literal reading of section 7.3; this
   * is the same window kept as one number, which is what the expansion rule
   * actually asks it (DECISIONS.md D-079).
   */
  serviceAverage: number;
  /** Months that average has seen, until the window is full. */
  serviceMonths: number;
  /**
   * Consecutive months in which nothing at all was collected. Twenty-four of
   * them close the works; twelve and twenty are the two warnings.
   */
  monthsWithoutCollection: number;
  /**
   * False once the works has closed. The slot stays, because ids index the
   * array and the map layer refers to them; the footprint is given back to
   * open country and no station serves it any more.
   */
  open: boolean;
  /** Tick the works opened. New industries appear once a game year. */
  openedTick: number;
}

/** A freshly placed industry, at its starting level with nothing in stock. */
export function newIndustry(
  id: number,
  type: IndustryType,
  x: number,
  y: number,
  landmassId: number,
  openedTick = 0,
): Industry {
  return {
    id,
    type,
    x,
    y,
    landmassId,
    inputStock0: 0,
    inputStock1: 0,
    outputStock0: 0,
    outputStock1: 0,
    productionLevel: INDUSTRY_LEVEL_START,
    producedThisMonth: 0,
    collectedThisMonth: 0,
    monthsSinceLevelChange: 0,
    serviceAverage: 0,
    serviceMonths: 0,
    monthsWithoutCollection: 0,
    open: true,
    openedTick,
  };
}

/**
 * How much of one cargo this industry holds before it takes no more (7.3).
 *
 * Eight months of its own production, so the figure means the same thing to a
 * gravel pit and to an electronics works. A flat cap would make the small
 * industries hoard and choke the large ones.
 */
export function industryStockCap(type: IndustryType): number {
  return INDUSTRY_STOCK_MONTHS * (INDUSTRY_BASE_OUTPUT_PER_MONTH[type] ?? 0);
}

/**
 * Base rate this month, with the swing of a primary industry applied (7.3).
 *
 * A works with inputs runs on what is delivered and does not swing; a mine, a
 * forest, a farm or an oil well does, plus or minus a quarter over five game
 * years. The phase comes from the id so a region does not boom in unison, and
 * the sine comes from the lookup table because Math.sin is not bit exact across
 * engines (architecture law #4).
 *
 * `cycle` is the worldwide recession/boom window of SPEC2 M21 (E-09), and 1 in
 * a world without the economy rule. It multiplies the swing rather than adding
 * a second one - E-09 asks for the century to MODULATE this sine, not to sit
 * beside it - so the mine keeps its own five-year rhythm and the century
 * decides how much the world is buying. It reaches only the industries that
 * swing at all, which is where the sine is: a works with inputs runs on what
 * was delivered to it, and a century that changed that would be pricing the
 * same slump twice, once at the mine and once at the mill it feeds.
 */
export function industryBaseOutput(industry: Industry, tick: number, cycle = 1): number {
  const base = INDUSTRY_BASE_OUTPUT_PER_MONTH[industry.type] ?? 0;
  if (industrySpec(industry.type).inputs.length > 0) return base;

  const period = INDUSTRY_FLUCTUATION_PERIOD_YEARS * TICKS_PER_YEAR;
  const phase = (industry.id * PHASE_STRIDE) / TRIG_TABLE_SIZE;
  const turns = tick / period + phase;
  return base * (1 + INDUSTRY_FLUCTUATION_AMPLITUDE * sinTurns(turns)) * cycle;
}

/**
 * Step between the phases of two neighbouring ids, in table entries.
 *
 * A prime fraction of the table, so consecutive ids land far apart and the
 * pattern does not repeat for any run of industries a map will hold.
 */
const PHASE_STRIDE = 1_619;
