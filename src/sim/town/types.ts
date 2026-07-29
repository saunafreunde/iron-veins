/**
 * Town model. M1 creates towns, their layout and their population; growth,
 * demand and the town council follow in M2 and M8.
 */

/** Size classes, used for the starting population and the layout radius. */
export const TownSize = {
  City: 0,
  Town: 1,
  Village: 2,
} as const;
export type TownSize = (typeof TownSize)[keyof typeof TownSize];

/** Building zones placed inside a town. Values match TileMap.buildingKind. */
export const BuildingKind = {
  None: 0,
  Residential: 1,
  Commercial: 2,
  Industrial: 3,
} as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

/** Road connection bits, one per orthogonal tile neighbour. */
export const RoadBit = {
  /** towards x - 1 */
  West: 1,
  /** towards x + 1 */
  East: 2,
  /** towards y - 1 */
  North: 4,
  /** towards y + 1 */
  South: 8,
} as const;

export interface Town {
  readonly id: number;
  name: string;
  /** Tile coordinates of the town centre. */
  readonly x: number;
  readonly y: number;
  readonly sizeClass: TownSize;
  population: number;
  /** Half width of the built-up area. [tiles] */
  radius: number;
  /** Passengers offered at the town's stations this month. */
  producedThisMonth: number;
  /** Of those, how many were actually carried away. */
  transportedThisMonth: number;
  /** Goods and food delivered into the town this month. [units] */
  goodsDeliveredThisMonth: number;
  foodDeliveredThisMonth: number;

  /**
   * Of the passengers and mail carried away this month, how much each company
   * took. Indexed by company id (section 13.3).
   *
   * Separate from `transportedThisMonth` rather than replacing it: growth asks
   * what left the town at all, the council asks who took it, and those are two
   * different questions that happen to be counted in the same place.
   */
  transportedByCompany: number[];
  /** What the council thinks of each company, 0..100. Recomputed monthly. */
  councilRating: number[];
  /**
   * The part of the rating each company earned or lost by ACTING - campaigns,
   * trees, streets funded, buildings knocked down. Decays every month.
   */
  councilGoodwill: number[];
  /** Company holding exclusive building rights here, or -1 for none. */
  exclusiveCompanyId: number;
  /** Tick those rights lapse. Meaningless while exclusiveCompanyId is -1. */
  exclusiveUntilTick: number;
  /** Earliest tick each company may buy each measure again. Company-major. */
  measureReadyTick: number[];
}
