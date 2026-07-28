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
}
