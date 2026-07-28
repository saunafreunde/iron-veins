import { Cargo } from '../cargo/types';
import { INDUSTRY_LEVEL_START } from '../constants';
import { Terrain } from '../map/terrain';

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
  nearTownDistance: 12,
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
}

/** A freshly placed industry, at its starting level with nothing in stock. */
export function newIndustry(
  id: number,
  type: IndustryType,
  x: number,
  y: number,
  landmassId: number,
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
  };
}
