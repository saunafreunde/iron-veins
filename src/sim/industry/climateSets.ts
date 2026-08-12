import { CARGO_COUNT, PORT_OVERSEAS_CARGO, type Cargo } from '../cargo/types';
import { MapClimate } from '../constants';
import { Terrain, TERRAIN_COUNT } from '../map/terrain';
import { TOWN_OUTPUTS } from '../town/types';
import { INDUSTRY_TYPE_COUNT, IndustryType, industrySpec } from './types';

/**
 * Which industries exist in which climate - the four economies of SPEC2 M23.
 *
 * The catalogue of `INDUSTRY_SPECS` is partitioned here into a CORE that every
 * world has and four ARMS that are handed out one per climate. The partition
 * is exact and exhaustive (`tests/unit/climateEconomies.spec.ts` asserts both),
 * which is what makes "disjoint recognisable chains" a property of the tables
 * rather than an impression from playing:
 *
 * | arm | industries | terminal cargo | the climate that owns it |
 * | --- | --- | --- | --- |
 * | food | farm, food works | `Food` | temperate |
 * | oil | well, refinery, plastics, electronics | `Electronics` | arctic |
 * | wood | forestry, sawmill, furniture | `Goods` (furniture) | tropical |
 * | stone | gravel pit, cement works, builders' merchant | `Cement` | desert |
 *
 * The core is coal, iron ore, the power station, the steel mill and the
 * machine works: a coal railway and a steel chain exist in every climate,
 * because they are what the balancing scenarios of section 19.4 are calibrated
 * on and what a player is taught to build.
 *
 * **The temperate set is the WHOLE catalogue and that is a decision, not an
 * omission** (D-246). Every arm runs in the temperate world, so `Temperate` is
 * a superset of the other three rather than disjoint from them, and the
 * disjointness the milestone claims lives in the four ARMS - each of which
 * runs in exactly two of the four climates, its own and the temperate one.
 * The reason is the one D-245 gave for closing the era catalogue in 1949: the
 * temperate generator carries every band of section 19.4, the canonical
 * cross-OS hash, the soak fixture and five of the eight shipped scenarios, and
 * moving all of them inside the milestone that introduces the climate tables
 * is exactly what SPEC2's Fehlerkatalog 34 says never to do. Taking one arm
 * away from the temperate world would move every one of them; leaving the set
 * whole moves NOTHING - the weight table, the draw and the placement loop are
 * identical to the pre-M23 ones for `Temperate`, which is why no band, no pin
 * and no temperate scenario claim in this bundle changed by a digit.
 *
 * These are `const` tables under balance-test authority, E-17's CONTENT half.
 */

/** The industries every climate has, whatever else it has. */
export const INDUSTRY_CORE: readonly IndustryType[] = [
  IndustryType.CoalMine,
  IndustryType.IronOreMine,
  IndustryType.PowerPlant,
  IndustryType.SteelMill,
  IndustryType.MachineFactory,
];

/** Farms and the food works: grain and livestock become food. */
export const INDUSTRY_ARM_FOOD: readonly IndustryType[] = [
  IndustryType.Farm,
  IndustryType.FoodFactory,
];

/** The oil chain, four deep: well, refinery, plastics plant, electronics. */
export const INDUSTRY_ARM_OIL: readonly IndustryType[] = [
  IndustryType.OilWell,
  IndustryType.Refinery,
  IndustryType.PlasticsPlant,
  IndustryType.ElectronicsFactory,
];

/** The timber chain: forestry, sawmill, furniture works. */
export const INDUSTRY_ARM_WOOD: readonly IndustryType[] = [
  IndustryType.Forestry,
  IndustryType.Sawmill,
  IndustryType.FurnitureFactory,
];

/** The mineral chain: gravel pit, cement works, builders' merchant. */
export const INDUSTRY_ARM_STONE: readonly IndustryType[] = [
  IndustryType.GravelPit,
  IndustryType.CementWorks,
  IndustryType.BuildersMerchant,
];

/**
 * The arm each climate is recognised by, indexed by {@link MapClimate}.
 *
 * Exported because the disjointness test reads it: these four sets are
 * pairwise disjoint, they do not overlap the core, and together with the core
 * they are the complete catalogue.
 */
export const CLIMATE_SIGNATURE_ARM: readonly (readonly IndustryType[])[] = [
  INDUSTRY_ARM_FOOD, // Temperate - the farming heartland
  INDUSTRY_ARM_OIL, // Arctic - tundra oil, and the plastics chain off it
  INDUSTRY_ARM_WOOD, // Tropical - rainforest timber
  INDUSTRY_ARM_STONE, // Desert - quarries and cement
];

/** Sorted, de-duplicated union of the given lists. */
function unite(...lists: readonly (readonly IndustryType[])[]): readonly IndustryType[] {
  const seen: boolean[] = new Array<boolean>(INDUSTRY_TYPE_COUNT).fill(false);
  for (const list of lists) for (const type of list) seen[type] = true;
  const result: IndustryType[] = [];
  for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) {
    if (seen[type] === true) result.push(type as IndustryType);
  }
  return result;
}

/**
 * The industry types a world of this climate may hold, in catalogue order.
 *
 * Temperate is core plus ALL four arms, i.e. the catalogue in its original
 * order and with its original weights - the identity, by construction rather
 * than by a copied list.
 */
export const CLIMATE_INDUSTRY_SETS: readonly (readonly IndustryType[])[] = [
  unite(INDUSTRY_CORE, INDUSTRY_ARM_FOOD, INDUSTRY_ARM_OIL, INDUSTRY_ARM_WOOD, INDUSTRY_ARM_STONE),
  unite(INDUSTRY_CORE, INDUSTRY_ARM_OIL),
  unite(INDUSTRY_CORE, INDUSTRY_ARM_WOOD),
  unite(INDUSTRY_CORE, INDUSTRY_ARM_STONE),
];

/** Membership as a flat lookup, so the generator asks with one array read. */
const MEMBERSHIP: readonly Uint8Array[] = CLIMATE_INDUSTRY_SETS.map((set) => {
  const row = new Uint8Array(INDUSTRY_TYPE_COUNT);
  for (const type of set) row[type] = 1;
  return row;
});

/** The types this climate holds, in catalogue order. */
export function climateIndustryTypes(climate: MapClimate): readonly IndustryType[] {
  return CLIMATE_INDUSTRY_SETS[climate] ?? CLIMATE_INDUSTRY_SETS[MapClimate.Temperate]!;
}

/** May a works of this type stand in a world of this climate? */
export function industryAllowedIn(climate: MapClimate, type: IndustryType): boolean {
  const row = MEMBERSHIP[climate] ?? MEMBERSHIP[MapClimate.Temperate]!;
  return row[type] === 1;
}

/**
 * Ground of this climate that STANDS IN for a temperate terrain, indexed by
 * climate: `[local terrain, the terrains a placement rule may name instead]`.
 *
 * **The table exists because the placement rules of `industry/types.ts` were
 * written for the temperate palette and M23 shipped four of them.** A rule
 * names the terrain a works may stand on - `NEAR_TOWN` is grass, field and
 * coast; the oil well is desert, coast and marsh - and those are the SIX
 * terrains a temperate map is mostly made of. Measured on the four generated
 * 1024 worlds of seed 4711 (land tiles, water and town ground left out):
 *
 * | climate | what the map is actually made of |
 * | --- | --- |
 * | temperate | grass 270,779 · rock 196,111 · forest 173,903 · field 40,887 · snow 36,814 · marsh 4,673 |
 * | arctic | **snow 723,786** · coast 7,317 · nothing else at all |
 * | tropical | forest 325,482 · marsh 309,139 · rock 46,580 · grass 42,331 · no field |
 * | desert | field 566,913 · grass 90,443 · rock 46,664 · desert 19,079 |
 *
 * An arctic map is snow from shore to summit, and of the nine industries the
 * arctic set offers, only the two MINES stand on a rule that names snow. The
 * measured funnel on that world: 175 draws, 5,700 attempted sites for the oil
 * well and 4,500 for the power station, **every one of them refused for the
 * ground**, and a map with 49 coal mines, 27 iron ore mines and not one works
 * that takes either - a shipped climate on which nothing can be delivered
 * anywhere. Tropical lost its terminal works the same way: a NEAR_TOWN rule
 * reaches 5.8 % of that map, so the furniture factory drew nine times and
 * placed none.
 *
 * **The rules are widened per climate rather than rewritten.** Naming snow in
 * `NEAR_TOWN` would move the temperate world, which carries 36,814 snow tiles,
 * the canonical cross-OS hash, the soak fixture, five shipped scenarios and
 * every band of section 19.4 - the D-246 argument, one table along. A climate
 * row instead says what that world's OWN ground is the equivalent of, and the
 * temperate row is EMPTY, so a temperate map admits exactly the tiles it
 * always did, tile for tile.
 *
 * The desert row is empty too, and that is a measurement rather than an
 * omission: four fifths of a desert map is `Field` and another eighth is
 * `Grass`, so the temperate rules already admit it, and all eight industries
 * of the desert set place on the generated world. A row there would move
 * Ueberleben's pinned industry count and the numeral its briefing quotes in
 * both languages, for nothing that was refused.
 *
 * It widens the FOOTPRINT question only - what a works may stand on - and
 * never `nearTerrain`, which asks what has to be NEARBY: the forestry needs a
 * real forest within eight tiles, and a climate that has none should not grow
 * one by equivalence. No climate that owns the timber arm lacks forest.
 */
export const CLIMATE_GROUND_SUBSTITUTES: readonly (readonly (readonly [
  number,
  readonly number[],
])[])[] = [
  // Temperate - the palette every placement rule was written for.
  [],
  // Arctic - the tundra IS the pasture, the ploughed land and the frozen bog.
  [[Terrain.Snow, [Terrain.Grass, Terrain.Field, Terrain.Marsh]]],
  // Tropical - the flood plain is where a rainforest town's works stand.
  [[Terrain.Marsh, [Terrain.Field, Terrain.Grass]]],
  // Desert - measured: nothing is refused for want of ground.
  [],
];

/** `[climate][local * TERRAIN_COUNT + stands-in-for] = 1`, built once. */
const GROUND: readonly Uint8Array[] = CLIMATE_GROUND_SUBSTITUTES.map((rows) => {
  const table = new Uint8Array(TERRAIN_COUNT * TERRAIN_COUNT);
  for (const [local, standsFor] of rows) {
    for (const other of standsFor) table[local * TERRAIN_COUNT + other] = 1;
  }
  return table;
});

/**
 * May a works whose rule names `allowed` stand on `terrain` in this climate?
 *
 * The rule's own list first - so a temperate world, whose row is empty, asks
 * exactly the question it asked before M23 - and then the climate's own
 * stand-ins.
 */
export function terrainAdmitted(
  climate: MapClimate,
  allowed: readonly number[],
  terrain: number,
): boolean {
  if (allowed.includes(terrain)) return true;
  const table = GROUND[climate] ?? GROUND[MapClimate.Temperate]!;
  const base = terrain * TERRAIN_COUNT;
  for (let i = 0; i < allowed.length; i++) {
    if (table[base + allowed[i]!] === 1) return true;
  }
  return false;
}

/**
 * What a world of this climate can PRODUCE, indexed by climate then cargo.
 *
 * Derived from the sets above plus the two producers that are not industries -
 * a town (mail and both passenger classes) and a harbour container terminal -
 * so that a cargo counts as available exactly when something on the map makes
 * one. Acceptance is deliberately NOT part of it: a town accepts electronics
 * wherever it stands, and a desert with no electronics works still has nobody
 * to buy a radio from.
 *
 * This is the table the vehicle mask of `vehicles/availability.ts` reads, and
 * it is derived rather than written out: an industry moved between two arms
 * moves the shop on the same edit.
 *
 * The two non-industry producers are read from the LEAF modules that hold
 * them, never from the hook or the catchment that uses them (D-246): asking
 * `town/update.ts` what a town makes pulled the monthly town hook, the station
 * and the world into the main chunk - measured at +10,115 B against the D-191
 * budget - for three cargo ids. The enumeration stays in one place; the place
 * is one a reader can afford.
 *
 * It is built on first use rather than at module scope, so a cycle through the
 * catalogue cannot make it depend on evaluation order. Built once and then
 * read, so nothing pays for it twice.
 */
let produces: Uint8Array[] | null = null;

function producedTable(): Uint8Array[] {
  if (produces !== null) return produces;
  const built: Uint8Array[] = [];
  for (const set of CLIMATE_INDUSTRY_SETS) {
    const row = new Uint8Array(CARGO_COUNT);
    for (const type of set) {
      for (const cargo of industrySpec(type).outputs) row[cargo] = 1;
    }
    for (const cargo of TOWN_OUTPUTS) row[cargo] = 1;
    for (const cargo of PORT_OVERSEAS_CARGO) row[cargo] = 1;
    built.push(row);
  }
  produces = built;
  return built;
}

/** Does anything in a world of this climate produce this cargo? */
export function climateProducesCargo(climate: MapClimate, cargo: Cargo): boolean {
  const table = producedTable();
  const row = table[climate] ?? table[MapClimate.Temperate]!;
  return row[cargo] === 1;
}
