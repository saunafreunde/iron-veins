import { EARLIEST_START_YEAR, TOWN_ERA_START_YEARS } from '../sim/constants';
import { TILE_H } from './projection';
import { BAKED_STATIC_MAX_LIFT_PX } from './staticArt';
import { architectureFor, TOWN_ARCHITECTURE, type TownArchitecture } from './townArchitecture';
import type { MapClimate } from '../sim/constants';

/**
 * What a town is built LIKE, per snapshot year (SPEC2 M23: "Aeren-Optik:
 * Stadtgebaeude-Specs keyed nach Snapshot-Jahr, 1950er-Giebel ->
 * 1980er-Platte -> 2020er-Glas").
 *
 * The fifth face of the milestone and the sibling of `townArchitecture.ts`:
 * the climate says what a town is BUILT OF, the era says what it is built
 * LIKE. They are deliberately two tables and one drawing - a tropical town of
 * 2049 is pale render in a glass curtain wall, an arctic one of 1950 is dark
 * timber under a steep gable - because the two questions have two different
 * inputs and neither is a special case of the other.
 *
 * **Z1, and strictly.** The era is a pure function of the published YEAR, the
 * way the season is a pure function of the published MONTH (D-202) and the
 * architecture a pure function of the announced CLIMATE (D-246). No money and
 * no physics is anywhere near it: the same tile carries the same building,
 * the same zone and the same expansion stage in every year, and only the
 * paint, the pitch of the roof, the window grid and the wall height differ.
 * Nothing in `src/sim` imports this file, and nothing may.
 *
 * **No saved render state, which is the acceptance sentence.** "Ein 1950
 * gestartetes, 2049 geladenes Save zeigt sofort die 2049-Optik (Regeneration
 * aus Snapshot, kein gespeicherter Render-Zustand)": the era is DERIVED from
 * the year the snapshot announces, so a save that is loaded at a 2049 tick
 * regenerates the 2049 artwork on the first frame that carries the calendar,
 * whatever century the world was started in. There is nothing to migrate,
 * nothing to save and nothing that could be stale, because nothing is stored.
 *
 * **It books ZERO atlas cells**, the third time in this milestone and for the
 * third time with the same argument (D-245's sixty era vehicles, D-246's four
 * architectures): the six town cells are PROCEDURAL cells on the base page,
 * so an era variant is a repaint of cells that already exist through the M18
 * regeneration seam (D-202), and M23's ~150 booked cells sit against a detail
 * page that has been full since D-173 (Fehlerkatalog 40).
 */

/**
 * The three eras SPEC2 M23 names.
 *
 * Three rather than one per decade, for the reason `SeasonStage` is four
 * rather than twelve: the artwork is REPAINTED on a change, and a dozen
 * stages would repaint the town for differences nobody could name. Each of
 * the three decades the milestone names sits inside its own era.
 */
export const TownEra = {
  /** Pitched roofs and small windows - everything up to the first boundary. */
  Gable: 0,
  /** Concrete slab: shallow roofs, wider window grid, taller walls. */
  Slab: 1,
  /** Curtain wall: flat roofs, glazing over the whole facade. */
  Glass: 2,
} as const;
export type TownEra = (typeof TownEra)[keyof typeof TownEra];

export const TOWN_ERA_COUNT = 3;

/**
 * Which era a calendar year builds in.
 *
 * Total by construction, in both directions and deliberately: a year before
 * the first boundary is Gable (a world may start in 1850 since D-245, and a
 * gable is exactly what the nineteenth century built - the same judgement
 * E-14 records when it leaves the early eras to the procedural path), and a
 * year past the last boundary stays Glass however long an `endless` game runs.
 */
export function townEraFor(year: number): TownEra {
  let era: TownEra = TownEra.Gable;
  for (let index = 1; index < TOWN_ERA_START_YEARS.length; index++) {
    if (year >= TOWN_ERA_START_YEARS[index]!) era = index as TownEra;
  }
  return era;
}

/**
 * What an era does to the six town cells.
 *
 * Every field is a MODIFIER on the drawing the game already had rather than a
 * second drawing: the era changes no shape, adds no solid and moves no
 * anchor, so nothing here can put a sprite somewhere the cell does not reach.
 * That is also what keeps the rule below checkable - a modifier table has a
 * worst case and a new silhouette does not.
 */
export interface TownEraSpec {
  /** Factor on the wall height of every zone. [1] */
  readonly wallHeight: number;
  /** Factor on the roof rise - the gable, the sawtooth and the roof plant. [1] */
  readonly roofPitch: number;
  /** Window rows added to every facade. [rows] */
  readonly windowRows: number;
  /** Window columns added to every facade. [columns] */
  readonly windowColumns: number;
  /** How far the climate's wall colour is mixed towards {@link material}. [0-1] */
  readonly wallMix: number;
  /** The era's own building material. [CSS hex] */
  readonly material: string;
  /** How far the zone's glazing is mixed towards {@link glass}. [0-1] */
  readonly glassMix: number;
  /** The era's own glazing. [CSS hex] */
  readonly glass: string;
}

/**
 * The three eras, indexed by {@link TownEra}.
 *
 * **The Gable row is the identity**, exactly as the temperate row of
 * `TOWN_ARCHITECTURE` is: every factor is 1, every mix is 0, so a 1950 town
 * is drawn pixel for pixel the way it was before this bundle and the whole
 * body of measured optics this project owns keeps its meaning. The other two
 * rows are read off the century they are named for: a 1980s slab is concrete
 * over a wide window grid under a roof that has nearly stopped being one, and
 * a 2020s tower is glazing over the whole facade under a flat top.
 *
 * The wall-height factors are the one place proportion can be lost, and they
 * are deliberately small: 1.15 and 1.28 take the tallest cell in the game
 * from 1.21 to 1.45 tile heights against the 2.00 the cell reserves
 * (`townCellLiftPx` below measures it and `townEra.spec.ts` asserts it). An
 * era that reached for a skyscraper would be reintroducing exactly the needle
 * tower D-206 removed, on the very axis D-206 handed to this milestone.
 */
export const TOWN_ERA_SPECS: readonly TownEraSpec[] = [
  {
    // Gable: the pre-M23 town, unchanged in every number.
    wallHeight: 1,
    roofPitch: 1,
    windowRows: 0,
    windowColumns: 0,
    wallMix: 0,
    material: '#c9b79c',
    glassMix: 0,
    glass: '#5d7f92',
  },
  {
    // Slab: precast concrete, a wider grid of windows, a roof gone shallow.
    wallHeight: 1.15,
    roofPitch: 0.35,
    windowRows: 1,
    windowColumns: 1,
    wallMix: 0.45,
    material: '#b6b4ad',
    glassMix: 0.3,
    glass: '#6d8ea3',
  },
  {
    // Glass: a curtain wall over a flat top, and the windows are the facade.
    wallHeight: 1.28,
    roofPitch: 0.12,
    windowRows: 2,
    windowColumns: 2,
    wallMix: 0.6,
    material: '#9fb0bb',
    glassMix: 0.55,
    glass: '#8fd0e6',
  },
];

/** How a town of this era is built. Total, like `architectureFor`. */
export function eraSpecFor(era: TownEra): TownEraSpec {
  return TOWN_ERA_SPECS[era] ?? TOWN_ERA_SPECS[TownEra.Gable]!;
}

/** Mix two hex colours, and give back something a fill style accepts. */
export function mixHex(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number): number => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t);
  };
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

/**
 * The three colours one town cell is drawn from, after the climate and the
 * era have both had their say.
 *
 * The order is the argument: the CLIMATE picks the material a town is built
 * of and the ERA mixes it towards what that century built with, so a desert
 * town of 2049 is glazed adobe rather than a glass tower that could stand
 * anywhere. A replacement instead of a mix would have made the era win
 * outright and quietly deleted D-246 from two thirds of the century.
 */
export interface TownPalette {
  readonly wall: string;
  readonly roof: string;
  readonly glazing: string;
}

export function townPalette(
  kind: number,
  climate: MapClimate,
  era: TownEra,
  glazingHex: string,
): TownPalette {
  const build: TownArchitecture = architectureFor(climate);
  const spec = eraSpecFor(era);
  const wall = kind === 0 ? build.houseWall : kind === 1 ? build.blockWall : build.shedWall;
  const roof = kind === 0 ? build.houseRoof : kind === 1 ? build.blockRoof : build.shedRoof;
  return {
    wall: mixHex(wall, spec.material, spec.wallMix),
    // The roof keeps the climate's own colour further than the wall does: it
    // is the surface the season snows over (D-202), and a roof mixed as far
    // as the wall would take the arctic and the desert to the same grey.
    roof: mixHex(roof, spec.material, spec.wallMix * 0.5),
    glazing: mixHex(glazingHex, spec.glass, spec.glassMix),
  };
}

/**
 * The geometry of one town cell, in ZOOM-1 pixels and tile widths.
 *
 * **This is the table the drawing consumes**, which is the whole reason it
 * exists as a function instead of as six literals inside `drawTownBuilding`:
 * D-174's device (the smoke anchors the drawing itself reads) and D-206's
 * (the rule the baker enforces) applied to the era axis, so the silhouette
 * that is MEASURED below and the silhouette that is DRAWN cannot be two
 * different silhouettes.
 *
 * `kind` is the zone (0 residential, 1 commercial, 2 industrial) and `stage`
 * the expansion stage (0 or 1), exactly as `drawTownBuilding` has always
 * indexed its six cells.
 */
export interface TownCellShape {
  /** Footprint across the u axis. [tile widths] */
  readonly u: number;
  /** Footprint across the v axis. [tile widths] */
  readonly v: number;
  /** Wall height above the ground. [zoom-1 px] */
  readonly wall: number;
  /** Roof rise above the wall - gable ridge, sawtooth, or roof plant. [zoom-1 px] */
  readonly roof: number;
  readonly windowRows: number;
  readonly windowColumns: number;
}

/**
 * Overhang `gableRoof` adds on each side by default. [tile widths]
 *
 * Restated here because the lift bound below has to account for it, and a
 * bound that forgot it would be a bound that is smaller than the drawing.
 */
export const GABLE_OVERHANG = 0.06;

export function townCellShape(
  kind: number,
  stage: number,
  era: TownEra,
  climate: MapClimate = 0 as MapClimate,
): TownCellShape {
  const spec = eraSpecFor(era);
  const grow = stage;
  if (kind === 0) {
    const u = 0.5 + grow * 0.06;
    return {
      u,
      v: u * 0.78,
      wall: (9 + grow * 7) * spec.wallHeight,
      // The one place the two tables multiply: the house gable is the roof
      // the CLIMATE pitches (D-246 - an arctic roof sheds snow, a desert one
      // is nearly a terrace) and the ERA flattens. Both factors land in the
      // shape rather than one of them staying in the drawing, or the lift
      // bound below would be measuring a roof the atlas does not draw.
      roof: (6 + grow) * spec.roofPitch * architectureFor(climate).roofPitch,
      windowRows: 1 + grow + spec.windowRows,
      windowColumns: 2 + spec.windowColumns,
    };
  }
  if (kind === 1) {
    const u = 0.54 + grow * 0.05;
    return {
      u,
      v: u * 0.86,
      wall: (15 + grow * 12) * spec.wallHeight,
      roof: 3 * spec.roofPitch,
      windowRows: 3 + grow + spec.windowRows,
      windowColumns: 3 + spec.windowColumns,
    };
  }
  const u = 0.62 + grow * 0.06;
  return {
    u,
    v: u * 0.7,
    wall: (8 + grow * 4) * spec.wallHeight,
    roof: 3 * spec.roofPitch,
    windowRows: 0,
    windowColumns: 0,
  };
}

/**
 * How far above the tile centre this cell can possibly draw. [zoom-1 px]
 *
 * An UPPER BOUND rather than a measurement, and it says so: the projection
 * puts the highest ink of a solid at `(u/2 + v/2) * TILE_H / 2` above its own
 * top face, so wall plus roof plus the full diamond half-width bounds every
 * point of every one of the four primitives a town cell is made of. The
 * commercial block's roof plant is narrower than its walls, so the bound is
 * a few per cent over the ink - which is the safe direction and the only one
 * a rule may err in.
 *
 * The datum is the tile CENTRE, which is the datum `BAKED_STATIC_MAX_LIFT_PX`
 * uses (D-206), so the two paths are comparable without a conversion.
 */
export function townCellLiftPx(
  kind: number,
  stage: number,
  era: TownEra,
  climate: MapClimate = 0 as MapClimate,
): number {
  const shape = townCellShape(kind, stage, era, climate);
  const halfDiamond =
    (shape.u / 2 + GABLE_OVERHANG + (shape.v / 2 + GABLE_OVERHANG)) * (TILE_H / 2);
  return halfDiamond + shape.wall + shape.roof;
}

/**
 * The tallest thing any era can put on a town tile. [zoom-1 px]
 *
 * Computed rather than recorded, so an era added or a factor raised moves it
 * by construction - and `townEra.spec.ts` holds it under
 * {@link BAKED_STATIC_MAX_LIFT_PX}, which is the ONE number D-206 owns and
 * `tools/bake-lib.ts` refuses a baked cell over. Same rule, same datum, both
 * halves of the world.
 */
export function tallestTownCellLiftPx(eras: readonly TownEra[] = ALL_TOWN_ERAS): number {
  let tallest = 0;
  for (const era of eras) {
    for (let climate = 0; climate < TOWN_ARCHITECTURE_COUNT; climate++) {
      for (let kind = 0; kind < 3; kind++) {
        for (let stage = 0; stage < 2; stage++) {
          const lift = townCellLiftPx(kind, stage, era, climate as MapClimate);
          if (lift > tallest) tallest = lift;
        }
      }
    }
  }
  return tallest;
}

/** The three eras in order, so a walk over them is never hand-written. */
export const ALL_TOWN_ERAS: readonly TownEra[] = [TownEra.Gable, TownEra.Slab, TownEra.Glass];

/**
 * Does every era's town cell stay inside the proportion rule of D-206?
 *
 * **The rule this milestone was handed, restated as code rather than as a
 * promise.** D-206 measured a 4.30-tile-height baked skyscraper against a
 * 1.12-tile-height procedural fallback, took the ceiling from what a cell
 * physically reserves - `CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2` = 64 px
 * = 2.00 tile heights = 32 m - and named the era axis as where the towers it
 * removed belonged. So an era table is exactly the place a needle tower could
 * come back, and it is answered against the SAME number the baker refuses a
 * baked cell over (`tools/bake-lib.ts`, `BAKE_STATIC_MAX_LIFT_PX`): one rule,
 * one datum, both halves of the world.
 */
export function townErasFitProportionRule(): boolean {
  return tallestTownCellLiftPx() <= BAKED_STATIC_MAX_LIFT_PX;
}

/**
 * Whether the baked `building:` cells may draw in this era.
 *
 * **They may not, past the gable era, and this is the honest half of the
 * bundle.** The Kenney city kits are one century's architecture: D-206
 * removed the four skyscrapers and `building-m` from the mapping precisely
 * because "stage 1 means grown, not 1999", and named this milestone as where
 * an era axis in the BAKE belongs - four times the building cells, against a
 * detail page that has been full since D-173. This bundle does not spend that
 * booking, so the eras it does deliver are the procedural ones, and where the
 * bake has no era the game draws the era it has: E-14's own rule, which names
 * the procedural path as the gap-filler for the eras the kits do not reach.
 *
 * The price, stated rather than discovered: on a machine with a filled asset
 * cache, a town loses the Kenney silhouettes from the slab era on and draws
 * the D-117 procedural cells instead. It gets them back when the art bundle
 * that owns M23's ~150 cells bakes `building:<zone>:<stage>:<era>`; nothing
 * here makes that harder, because the target grammar is untouched and an era
 * becomes one more variant dimension.
 */
export function bakedBuildingsAllowedIn(era: TownEra): boolean {
  return era === TownEra.Gable;
}

/** The first year the game can be played in, for the era table's own audit. */
export const TOWN_ERA_FIRST_YEAR = EARLIEST_START_YEAR;

/** How many architectures the climate table holds - the walk's other axis. */
const TOWN_ARCHITECTURE_COUNT = TOWN_ARCHITECTURE.length;
