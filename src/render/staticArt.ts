import { MapClimate } from '../sim/constants';
import { INDUSTRY_TYPE_COUNT, IndustryType } from '../sim/industry/types';
import type { TileMap } from '../sim/map/TileMap';
import { Terrain } from '../sim/map/terrain';
import { BuildingKind } from '../sim/town/types';
import type { BakedAtlasManifest, BakedCell } from './bakedAtlas';
import { variantIndex } from './vehicleArt';

/**
 * Static world art from the Kenney bake (SPEC2 M13, E-14/D-140/D-160/D-169):
 * town buildings, industry blocks and trees, the half of the bake D-170 left
 * on the shelf when it wired the vehicles.
 *
 * This is `vehicleArt.ts` for the things that stand still, and deliberately
 * the same architecture: the target grammar, the manifest index, the
 * deterministic per-TILE variant pick and the per-entry fallback are pure
 * functions of their arguments, so the whole policy is unit-testable without
 * Pixi and MapView only executes what these functions decided.
 *
 * Nothing here may reach the simulation. It READS the sim's own vocabulary -
 * `BuildingKind`, `IndustryType`, `MapClimate` - because those are what the
 * manifest targets were named after (D-169), and reading them is what keeps
 * the two from drifting.
 */

/**
 * Facing index every static cell carries: a building does not drive, so the
 * bake gives it exactly one facing (`facings: 1` in the manifest, asserted by
 * tests/unit/assetsBake.spec.ts). A cell claiming any other facing is not
 * static art and is skipped at index time.
 */
export const STATIC_FACING = 0;

/**
 * World pixels a baked static cell may reach ABOVE the ground line it stands
 * on. [px at zoom 1]
 *
 * Measured on the M13 bake, the tallest static cell of all 50: the commercial
 * skyscraper `building:commercial:1:2` lifts 138 px (146 px tall, anchorY 138)
 * at zoom 1, and 137.5 / 137.0 px at zooms 2 and 4. The value is that
 * measurement rounded up with room for one taller kit model, in the D-136
 * spirit - it is a chunk-texture BUDGET, not a promise about any one model.
 *
 * It exists because a chunk texture reserves its headroom from a constant
 * (chunks.ts `CHUNK_ART_HEADROOM_PX`): the procedural cell needed
 * `CELL_HEADROOM_STEPS` = 3 height steps = 48 px, and a 138 px skyscraper
 * baked into a chunk with 48 px of headroom is silently guillotined at the
 * chunk seam - exactly the unwritten-agreement failure D-117 fixed with
 * `anchorY`, one container up.
 */
export const BAKED_STATIC_MAX_LIFT_PX = 160;

/** One resolved static cell: the cell and the atlas page file it lives on. */
export interface StaticCellRef {
  readonly page: string;
  readonly cell: BakedCell;
}

/** Baked static art of ONE zoom level: base target to its declared variants. */
export interface StaticZoomIndex {
  readonly zoom: number;
  readonly byTarget: ReadonlyMap<string, readonly StaticCellRef[]>;
}

/**
 * Target grammars of the three static families (D-169, restated from
 * tools/assets-manifest.json's own comment block):
 *
 * - `building:<zone>:<stage>` plus `:<n>` for a declared extra variant,
 * - `industry:<TypeName>` (no variants declared today, the suffix is legal),
 * - `tree:<climate>:<n>` - here the index is MANDATORY, because a tree has no
 *   canonical body the way a zone stage has.
 *
 * The base target - what a caller asks for - is the part before the variant
 * index, which is why the three regexes are written out rather than reduced to
 * one "strip a trailing number": `tree:temperate:0` and `building:x:0` end in
 * the same shape and mean different things.
 */
const BUILDING_TARGET = /^building:([a-z]+):(\d+)(?::(\d+))?$/;
const INDUSTRY_TARGET = /^industry:([A-Za-z]+)(?::(\d+))?$/;
const TREE_TARGET = /^tree:([a-z]+):(\d+)$/;

/**
 * Town zone names of the manifest, indexed by {@link BuildingKind} - written
 * as an indexed table rather than a literal list so a fourth zone lands in a
 * slot rather than silently shifting the other three.
 */
const BUILDING_ZONE_NAMES: readonly string[] = buildingZoneNames();

function buildingZoneNames(): readonly string[] {
  const names: string[] = [];
  names[BuildingKind.None] = '';
  names[BuildingKind.Residential] = 'residential';
  names[BuildingKind.Commercial] = 'commercial';
  names[BuildingKind.Industrial] = 'industrial';
  return names;
}

/**
 * Building level at which a town cell moves to its second expansion stage.
 *
 * Restated from `TerrainAtlas.buildingFrame`, which has split the six
 * procedural cells at `level >= 2` since M1; `tests/unit/staticArt.spec.ts`
 * holds the two against each other through the exported
 * `emissiveBuildingFrame`, so the baked stage and the procedural cell can
 * never disagree about what a grown building is. [building level]
 */
export const BUILDING_STAGE_TWO_LEVEL = 2;

/** Which expansion stage a building level belongs to (0 or 1). */
export function buildingStageFor(level: number): number {
  return level >= BUILDING_STAGE_TWO_LEVEL ? 1 : 0;
}

/**
 * Every legal building target, built once at module load and indexed by
 * `[kind][stage]`.
 *
 * A table rather than a template literal per call because these lookups run
 * once per BUILT TILE of every sprite rebuild and once more per chunk bake:
 * six strings that exist for the life of the process cost nothing, and six
 * strings composed per tile are the renderer's own version of law #7. The
 * same argument gives the industries and the tree families their tables.
 */
const BUILDING_TARGETS: readonly (readonly string[])[] = BUILDING_ZONE_NAMES.map((zone) =>
  zone === '' ? [] : [`building:${zone}:0`, `building:${zone}:1`],
);

/**
 * Base target of a town building, or null when the tile carries none.
 *
 * `BuildingKind.None` and anything the enum does not know answer null - the
 * per-entry fallback, one level before the index is even consulted.
 */
export function buildingTargetFor(kind: number, level: number): string | null {
  const row = BUILDING_TARGETS[kind];
  if (row === undefined) return null;
  return row[buildingStageFor(level)] ?? null;
}

/**
 * The three industries that stay procedural whatever the manifest says
 * (E-14 by name, D-169's register): the coal mine's headframe, the oil
 * derrick, and the farm - no pinned kit carries a farmstead, and a suburban
 * house under an industry marker is exactly the wrong silhouette D-117
 * forbids. `shapes.ts` keeps all three.
 *
 * The set is stated HERE as well as in the manifest so the refusal survives a
 * manifest edit: a model mapped onto `industry:Farm` tomorrow would draw
 * nothing, and `tests/unit/staticArt.spec.ts` holds the two lists equal in
 * both directions (the D-160 coupling device).
 */
export const PROCEDURAL_ONLY_INDUSTRIES: ReadonlySet<number> = new Set<number>([
  IndustryType.CoalMine,
  IndustryType.OilWell,
  IndustryType.Farm,
]);

/**
 * `IndustryType` read backwards into targets, minus the procedural-only
 * three: the enum is the source, so a new industry type gets a target here
 * without an edit and gets a red `staticArt.spec.ts` if the manifest has no
 * model for it.
 */
const INDUSTRY_TARGETS: readonly (string | null)[] = industryTargets();

function industryTargets(): readonly (string | null)[] {
  const targets = new Array<string | null>(INDUSTRY_TYPE_COUNT).fill(null);
  for (const [name, value] of Object.entries(IndustryType)) {
    if (PROCEDURAL_ONLY_INDUSTRIES.has(value)) continue;
    targets[value] = `industry:${name}`;
  }
  return targets;
}

/**
 * Base target of an industry block, or null when the type keeps its
 * procedural silhouette ({@link PROCEDURAL_ONLY_INDUSTRIES}) or is not a type
 * at all.
 */
export function industryTargetFor(type: number): string | null {
  return INDUSTRY_TARGETS[type] ?? null;
}

/** Tree-family targets of the manifest, indexed by {@link MapClimate}. */
const CLIMATE_TREE_TARGETS: readonly string[] = climateTreeTargets();

function climateTreeTargets(): readonly string[] {
  const targets: string[] = [];
  for (const [name, value] of Object.entries(MapClimate)) {
    targets[value] = `tree:${name.toLowerCase()}`;
  }
  return targets;
}

/**
 * Base target of the tree family of a climate. Total by construction - an
 * unknown climate falls back to temperate rather than dropping the world's
 * forests, because a wrong tree is a far smaller lie than a bald forest.
 */
export function treeTargetFor(climate: number): string {
  return CLIMATE_TREE_TARGETS[climate] ?? CLIMATE_TREE_TARGETS[MapClimate.Temperate]!;
}

/** Split one manifest target into its base target and variant index. */
function splitStaticTarget(target: string): { base: string; variant: number } | null {
  const building = BUILDING_TARGET.exec(target);
  if (building !== null) {
    return {
      base: `building:${building[1]}:${building[2]}`,
      variant: building[3] === undefined ? 0 : Number(building[3]),
    };
  }
  const industry = INDUSTRY_TARGET.exec(target);
  if (industry !== null) {
    return {
      base: `industry:${industry[1]}`,
      variant: industry[2] === undefined ? 0 : Number(industry[2]),
    };
  }
  const tree = TREE_TARGET.exec(target);
  if (tree !== null) return { base: `tree:${tree[1]}`, variant: Number(tree[2]) };
  return null;
}

/**
 * Index the baked manifest for the static draw path: per zoom, per base
 * target, the declared variants in manifest-suffix order.
 *
 * Unlike a vehicle a static has exactly one cell per variant, so nothing can
 * be "incomplete" here - the D-170 drop-a-variant-whole rule has no work to
 * do. A cell with a facing other than {@link STATIC_FACING} is not static art
 * and is skipped; a base target with no cell at all simply stays absent,
 * which IS the per-entry fallback of {@link staticVariantFor}.
 */
export function buildStaticIndex(manifest: BakedAtlasManifest): readonly StaticZoomIndex[] {
  const zooms = new Map<number, Map<string, Map<number, StaticCellRef>>>();
  for (const page of manifest.pages) {
    for (const cell of page.cells) {
      if (cell.facing !== STATIC_FACING) continue;
      const split = splitStaticTarget(cell.target);
      if (split === null) continue;
      let byTarget = zooms.get(page.zoom);
      if (byTarget === undefined) {
        byTarget = new Map();
        zooms.set(page.zoom, byTarget);
      }
      let variants = byTarget.get(split.base);
      if (variants === undefined) {
        variants = new Map();
        byTarget.set(split.base, variants);
      }
      variants.set(split.variant, { page: page.file, cell });
    }
  }

  const result: StaticZoomIndex[] = [];
  for (const [zoom, byTargetRaw] of zooms) {
    const byTarget = new Map<string, readonly StaticCellRef[]>();
    for (const [base, variantsRaw] of byTargetRaw) {
      // Variant order is the manifest suffix order, so hash(tile) lands on
      // the same body whatever order the pages listed the cells (D-170).
      const ordered: StaticCellRef[] = [];
      for (const variant of [...variantsRaw.keys()].sort((a, b) => a - b)) {
        ordered.push(variantsRaw.get(variant)!);
      }
      if (ordered.length > 0) byTarget.set(base, ordered);
    }
    result.push({ zoom, byTarget });
  }
  result.sort((a, b) => a.zoom - b.zoom);
  return result;
}

/**
 * The per-entry fallback decision (SPEC2 M13, the E-14 floor one level down):
 * baked art exists for this base target, or it does not - and when it does
 * not (no bake at all, a procedural-only industry, a manifest that never
 * mapped this zone stage), the caller draws the D-117 procedural cell.
 * Null is that answer; a non-null return is the hash-chosen variant.
 */
export function staticVariantFor(
  index: StaticZoomIndex | null,
  target: string | null,
  seed: number,
): StaticCellRef | null {
  if (index === null || target === null) return null;
  const variants = index.byTarget.get(target);
  if (variants === undefined || variants.length === 0) return null;
  return variants[variantIndex(seed, variants.length)]!;
}

/**
 * Deterministic per-tile seed (the `speckleHash`/`hash(vehicleId)` pattern of
 * D-170, keyed by tile instead of by id): an integer avalanche over the tile
 * coordinates and a salt, so the same tile wears the same body on every
 * machine, frame and reload - render-side variance with zero contact to any
 * RNG stream (Z3 untouched) and no `Math.random` anywhere near it.
 */
export function tileVariantSeed(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 0x27d4eb2f) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Salt of the building variant pick, so two families never share a draw. */
export const BUILDING_VARIANT_SALT = 0x4255494c;
/** Salt of the tree variant pick. */
export const TREE_VARIANT_SALT = 0x54524545;
/** Salt of the tree jitter, separate from the variant so a body change and a
 * position change are independent facts about a tile. */
export const TREE_JITTER_SALT = 0x4a495454;

/**
 * Trees drawn on one forest tile. [count]
 *
 * A baked tree is 6-10 px wide against a 64 px tile, so one tree per tile
 * reads as a lone shrub rather than as woodland; three fill the diamond and
 * still cost less than the four sprites a built-up town tile already places.
 * The number is a render budget, not a simulation fact - `Terrain.Forest` is
 * one bit and says nothing about how many trees stand on it.
 */
export const FOREST_TREES_PER_TILE = 3;

/**
 * Slot centres of the three trees in tile space (u along +x, v along +y),
 * ORDERED BACK TO FRONT by (u + v).
 *
 * The three share one `drawOrder` key - the key is per tile and per layer -
 * so what orders them is Pixi's stable sort over insertion order, which is
 * this table's order. The sums are -0.42, 0.00 and +0.42 and the jitter below
 * can move a sum by at most +-0.16, so the three bands stay disjoint and a
 * jittered tree can never overtake its neighbour.
 */
const FOREST_SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [-0.21, -0.21],
  [0.24, -0.24],
  [0.21, 0.21],
];

/**
 * Does this tile grow trees?
 *
 * Woodland the player has not built on: forest ground with no road, no track
 * and no town building. Every layer this reads is folded into
 * `chunks.chunkChecksum`'s FULL profile, and that is not a coincidence but
 * the rule - a baked chunk that drew a tree must go stale the moment the
 * reason for that tree does, and a gate reading a layer outside the checksum
 * (the industry ids, say) would leave a wood standing on a factory until the
 * camera happened to evict the chunk.
 */
export function isWoodedTile(map: TileMap, index: number, terrain: number): boolean {
  return (
    terrain === Terrain.Forest &&
    map.roadBits[index] === 0 &&
    map.trackBits[index] === 0 &&
    map.buildingKind[index] === 0
  );
}

/** Half-width of the per-tile jitter applied to a slot centre. [tiles] */
const FOREST_JITTER_TILES = 0.08;

/**
 * Tile-space offset of one tree on one forest tile, written into `out` as
 * (u, v) - allocation-free, because this runs once per tree per rebuild.
 *
 * The jitter is the tile hash, not a random draw: the same tile grows the
 * same wood after a reload, a save/load and on another machine.
 */
export function forestTreeOffset(x: number, y: number, slot: number, out: number[]): void {
  const centre = FOREST_SLOT_OFFSETS[slot % FOREST_TREES_PER_TILE]!;
  const seed = tileVariantSeed(x, y, TREE_JITTER_SALT + slot);
  // Two independent 8-bit fields of one avalanche: an axis each, mapped to
  // [-1, 1) and scaled. 255 rather than 256 so the range is symmetric.
  const u = ((seed & 0xff) / 127.5 - 1) * FOREST_JITTER_TILES;
  const v = (((seed >>> 8) & 0xff) / 127.5 - 1) * FOREST_JITTER_TILES;
  out[0] = centre[0] + u;
  out[1] = centre[1] + v;
}

/**
 * Named emitter points a baked cell may carry, in the order the smoke reads
 * them (D-169: the chimney anchors were measured from the models' own
 * top-vertex clusters, and the refinery is the one body with two stacks).
 */
const BAKED_EMITTER_KEYS: readonly string[] = ['chimney', 'chimney2'];

/**
 * The n-th emitter point of a baked cell in CELL pixels, or null when the
 * model declares fewer.
 *
 * This is what keeps D-174's "the drawings consume the same table, so smoke
 * leaves the drawn stack by construction" true once the drawing is a Kenney
 * model: the plume comes from the cell's own measured anchor rather than from
 * the procedural silhouette's, which is somewhere else entirely.
 */
export function bakedEmitterPoint(
  cell: BakedCell,
  index: number,
): readonly [number, number] | null {
  const key = BAKED_EMITTER_KEYS[index];
  if (key === undefined) return null;
  const point = cell.points?.[key];
  return point === undefined ? null : point;
}

/** How many emitter points a baked cell declares (0-2). */
export function bakedEmitterCount(cell: BakedCell): number {
  let count = 0;
  while (count < BAKED_EMITTER_KEYS.length && bakedEmitterPoint(cell, count) !== null) count++;
  return count;
}
