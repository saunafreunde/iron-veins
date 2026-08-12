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
   * Building material delivered into a builders' merchant of this town this
   * month. [units]
   *
   * SPEC.md 13.2's `versorgungBau`, and with it the first thing SPEC.md 7.2's
   * "Baustoffhandel (Senke, treibt Stadtwachstum)" actually drives. Booked when
   * the cement goes INTO the yard rather than when the yard consumes it,
   * because the formula says "geliefert"; which town a yard belongs to is
   * decided by `TOWN_BUILDING_MATERIAL_RADIUS`.
   *
   * Cleared by `growTowns` with the other monthly counters.
   */
  buildingMaterialThisMonth: number;
  /**
   * The twelve-month passenger window of SPEC.md 13.2, kept D-079's way.
   *
   * `versorgungPass` is the ONE term of 13.2 the specification annotates with
   * "letzte 12 Monate", and a window is historical input to a simulation
   * decision, so it is saved state rather than a figure rebuilt on load (Z4,
   * Fehlerkatalog 23): a town reloaded with an empty window would grow at the
   * unserved rate for a game year and then at the served one, which is the same
   * world priced differently after a load.
   *
   * Two running means rather than a ring of twenty-four numbers, exactly as the
   * industry service window (D-079) and the return-journey ledger (D-213) keep
   * theirs, and `supplyMonths` is what makes them TRUE means while the window
   * is still filling: rolled from zero instead, a town served perfectly from
   * its first day would read two thirds of its own service for a game year.
   */
  supplyProducedMean: number;
  supplyTransportedMean: number;
  /** Completed months in the window above, capped at TOWN_SUPPLY_WINDOW_MONTHS. */
  supplyMonths: number;
  /**
   * Tiles of street the town has laid for itself this game month. [tiles]
   *
   * SPEC.md 13.2 caps a town's own road building at three tiles a month, and
   * the cap is per MONTH while the growth pass runs per DAY (E-10's round
   * robin), so the count is real history: it is not derivable from the tick,
   * from the map or from anything else the world holds, which under SPEC2's Z4
   * makes it saved state rather than a field rebuilt on load. A counter
   * rebuilt as zero would let a loaded game lay three more tiles in a month it
   * had already spent - the same road, priced differently after a load, which
   * is law #3 broken in the silence Z4 was written about.
   *
   * Cleared by `growTowns` with the other monthly counters, on the convention
   * that whoever reads a monthly figure is the one who resets it.
   */
  roadTilesThisMonth: number;

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
