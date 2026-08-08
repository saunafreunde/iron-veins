import { MapClimate } from '../sim/constants';
import { INDUSTRY_TYPE_COUNT, IndustryType } from '../sim/industry/types';
import type { TileMap } from '../sim/map/TileMap';
import { Terrain } from '../sim/map/terrain';
import { MODULE_KIND_COUNT, ModuleKind } from '../sim/station/types';
import { BuildingKind } from '../sim/town/types';
import type { BakedAtlasManifest, BakedCell } from './bakedAtlas';
import { variantIndex } from './vehicleArt';

/**
 * Static world art from the Kenney bake (SPEC2 M13, E-14/D-140/D-160/D-169):
 * town buildings, industry blocks, trees, and since D-208 the STATION MODULES
 * - the half of the bake D-170 left on the shelf when it wired the vehicles.
 *
 * This is `vehicleArt.ts` for the things that stand still, and deliberately
 * the same architecture: the target grammar, the manifest index, the
 * deterministic per-TILE variant pick and the per-entry fallback are pure
 * functions of their arguments, so the whole policy is unit-testable without
 * Pixi and MapView only executes what these functions decided.
 *
 * Nothing here may reach the simulation. It READS the sim's own vocabulary -
 * `BuildingKind`, `IndustryType`, `ModuleKind`, `MapClimate` - because those
 * are what the manifest targets were named after (D-169), and reading them is
 * what keeps the two from drifting.
 */

/**
 * Facing index every static cell carries: a building does not drive, so the
 * bake gives it exactly one facing (`facings: 1` in the manifest, asserted by
 * tests/unit/assetsBake.spec.ts). A cell claiming any other facing is not
 * static art and is skipped at index time.
 */
export const STATIC_FACING = 0;

/**
 * The proportion rule: world pixels a baked static cell may reach ABOVE the
 * TILE CENTRE it stands on. [px at zoom 1]
 *
 * Origin - the procedural atlas cell's own drawable headroom, which is the
 * ceiling every D-117 silhouette has been drawn against since M1 and the
 * ceiling any fallback is physically clipped at:
 *
 *     CELL_HEADROOM_STEPS * HEIGHT_PX  +  TILE_H / 2
 *          3 steps * 16 px = 48 px        16 px      =  64 px
 *
 * The first term is what `TerrainAtlas` reserves above a cell's tile diamond
 * (`CELL_TOP`); the second is the half diamond from that line down to the
 * tile centre, because a baked cell's `anchorY` is measured from the tile
 * CENTRE while `CELL_TOP` is measured from the tile's north corner. The two
 * datums differ by exactly `TILE_H / 2` and confusing them is a 16 px lie.
 * `tests/unit/staticArt.spec.ts` holds the arithmetic against
 * `TerrainAtlas`'s own exports, so the two cannot drift.
 *
 * Read in the projection's units (SPEC.md 16.1: TILE_W 64, TILE_H 32,
 * HEIGHT_PX 16) that ceiling is **2.00 tile heights = 4 height steps = 32 m**.
 * A single 50 m tile carrying a building taller than 32 m is a building that
 * no procedural fallback can express, so the baked and the procedural world
 * would be two different towns depending on whether a fetch completed.
 *
 * It is also the chunk-texture BUDGET: a chunk reserves its headroom from a
 * constant (chunks.ts `CHUNK_ART_HEADROOM_PX`, which reads this one), and a
 * cell taller than that is silently guillotined at a 0.5x chunk seam while
 * drawing whole at 1x - the unwritten-agreement failure D-117 fixed with
 * `anchorY`, one container out. That half is correctness, not taste.
 *
 * Enforced where it can actually be enforced: `tools/bake-lib.ts` restates it
 * as `BAKE_STATIC_MAX_LIFT_PX` and REFUSES to bake a `building:`, `industry:`
 * or `tree:` cell that breaks it (the D-160 coupling device), so an
 * out-of-proportion model is a failed bake rather than a tall grey needle in
 * somebody's town. Measured maxima on the M13 bake after D-206: the tallest
 * town cell `building:commercial:1:3` lifts 43.8 px (1.37 tile heights) and
 * the tallest cell of all, `industry:CementWorks`, 59.5 px (1.86).
 */
export const BAKED_STATIC_MAX_LIFT_PX = 64;

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
 * Target grammars of the four static families (D-169/D-208, restated from
 * tools/assets-manifest.json's own comment block):
 *
 * - `building:<zone>:<stage>` plus `:<n>` for a declared extra variant,
 * - `industry:<TypeName>` (no variants declared today, the suffix is legal),
 * - `module:<ModuleKindName>` - the things the PLAYER builds, same shape as
 *   `industry:` because both read a sim enum backwards by name,
 * - `tree:<climate>:<n>` - here the index is MANDATORY, because a tree has no
 *   canonical body the way a zone stage has.
 *
 * The base target - what a caller asks for - is the part before the variant
 * index, which is why the four regexes are written out rather than reduced to
 * one "strip a trailing number": `tree:temperate:0` and `building:x:0` end in
 * the same shape and mean different things.
 */
const BUILDING_TARGET = /^building:([a-z]+):(\d+)(?::(\d+))?$/;
const INDUSTRY_TARGET = /^industry:([A-Za-z]+)(?::(\d+))?$/;
const MODULE_TARGET = /^module:([A-Za-z]+)(?::(\d+))?$/;
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

/**
 * Station-module kinds that deliberately keep the `shapes.ts` box (E-14's
 * floor, stated by NAME the way {@link PROCEDURAL_ONLY_INDUSTRIES} is).
 *
 * **It is EMPTY, and that is the point.** D-208 mapped all thirteen kinds,
 * because until it did, every station, depot, platform, quay, canopy and
 * terminal in the game drew `moduleFrame`'s white box under the company tint -
 * a saturated box the size of a house on the objects the player looks at most.
 * The set exists so the audit in tests/unit/assetsBake.spec.ts can hold the
 * manifest against `ModuleKind` in BOTH directions: a kind with no model and
 * no entry HERE is a red build, never a silent orange box, and a kind that
 * belongs on the procedural side (a future kind no kit carries) is a
 * documented line rather than an absence.
 */
export const PROCEDURAL_ONLY_MODULES: ReadonlySet<number> = new Set<number>();

/**
 * `ModuleKind` read backwards into targets, minus the procedural-only set -
 * the `industryTargets` device, one enum along. Built once at module load,
 * because `placeStations` looks a target up per module per rebuild and a
 * template literal per station module is the renderer's own law #7 (D-205's
 * 9.7 ms measurement).
 */
const MODULE_TARGETS: readonly (string | null)[] = moduleTargets();

function moduleTargets(): readonly (string | null)[] {
  const targets = new Array<string | null>(MODULE_KIND_COUNT).fill(null);
  for (const [name, value] of Object.entries(ModuleKind)) {
    if (PROCEDURAL_ONLY_MODULES.has(value)) continue;
    targets[value] = `module:${name}`;
  }
  return targets;
}

/**
 * Base target of a station module, or null when the kind keeps its procedural
 * silhouette ({@link PROCEDURAL_ONLY_MODULES}) or is not a kind at all.
 *
 * There is no variant seed anywhere near this: a module kind is its IDENTITY,
 * exactly like an industry type - a player must be able to tell a depot from a
 * cold store at a glance, and two bodies for one kind would cost that.
 */
export function moduleTargetFor(kind: number): string | null {
  return MODULE_TARGETS[kind] ?? null;
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
  const module = MODULE_TARGET.exec(target);
  if (module !== null) {
    return {
      base: `module:${module[1]}`,
      variant: module[2] === undefined ? 0 : Number(module[2]),
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
 * How many trees a forest tile can carry at most - the SLOT table's length,
 * not a per-tile count. [count]
 *
 * A baked tree is 9-28 px wide against a 128 px tile at zoom 2, so one tree
 * per tile reads as a lone shrub rather than as woodland. Until D-209 every
 * wooded tile carried exactly three, which is the other failure: a constant
 * count over a whole region is a CARPET, and a carpet of the same three slot
 * centres is the wallpaper the owner reported. How many of these four slots a
 * given tile actually grows is {@link forestTreeAt}'s answer, and it is
 * usually fewer than three - measured mean 2.22 over a quarter million tiles
 * (tests/unit/staticArt.spec.ts pins the band), so the maximum went UP while
 * the placement count went DOWN by 26 %.
 *
 * The number is a render budget, not a simulation fact - `Terrain.Forest` is
 * one bit and says nothing about how many trees stand on it. A real 50 m tile
 * of woodland holds fifty mature trees; four is a symbol, not a census.
 */
export const FOREST_TREE_SLOTS = 4;

/**
 * Slot centres of the four trees in tile space (u along +x, v along +y),
 * ORDERED BACK TO FRONT by (u + v).
 *
 * The four share one `drawOrder` key - the key is per tile and per layer - so
 * what orders them is Pixi's stable sort over insertion order, which is this
 * table's order. Skipping a slot preserves the order of the rest, so a tile
 * that grows two trees is ordered by construction like one that grows four.
 *
 * The depth sums are -0.52, -0.18, +0.18 and +0.52; the depth jitter below
 * moves a sum by at most +-0.12, so the four bands
 * ([-0.64,-0.40], [-0.30,-0.06], [+0.06,+0.30], [+0.40,+0.64]) stay disjoint
 * and a jittered tree can never overtake its neighbour. The two middle slots
 * carry the lateral spread (+-0.34 in `u - v`, i.e. +-10.9 world px), the two
 * end slots sit on the tile's centre line because that is where the diamond
 * is narrow - which is what keeps every tree inside its own tile.
 *
 * The table sums to ZERO on both axes. The M13/D-206 table did not: its three
 * centres averaged (+0.08, -0.08), so every tile in the game drew its wood
 * 5.1 world px right of the tile centre - a constant offset repeated a
 * hundred thousand times, which is a lattice signature in itself.
 */
const FOREST_SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [-0.26, -0.26],
  [0.08, -0.26],
  [-0.08, 0.26],
  [0.26, 0.26],
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

/**
 * Half-width of the per-tile jitter ALONG THE DEPTH axis (u + v). [tiles]
 *
 * This is the constrained one: the depth sum is what the back-to-front slot
 * order above rests on. A displacement of `d` on each axis moves the sum by
 * `2d`, so two neighbouring bands stay disjoint exactly while `4d` is under
 * the slot spacing. The narrowest spacing in the four-slot table is 0.34, so
 * the bound is `d < 0.085`; 0.06 leaves a margin of 0.10 tile - two and a
 * half times what the three-slot table had, on a table with one more slot.
 */
const FOREST_JITTER_DEPTH_TILES = 0.06;

/**
 * Half-width of the per-tile jitter ACROSS the depth axis (u - v). [tiles]
 *
 * The depth key reads `u + v` and nothing else, so a displacement of `+l` on
 * u and `-l` on v is invisible to the painter order BY CONSTRUCTION - which
 * is what lets the lateral scatter be nearly three times the depth one
 * without touching the disjoint-band proof.
 *
 * The value is the tile's own half-width less what is already spent:
 * `0.5 - 0.26 (the farthest slot centre) - 0.06 (the depth jitter) = 0.18`,
 * minus a hundredth so the containment test stays a STRICT inequality.
 * Lateral travel on screen is `2 * l * TILE_W / 2` = +-10.9 px at zoom 1.
 */
const FOREST_JITTER_LATERAL_TILES = 0.17;

/**
 * How far a tree may fall short of, or overshoot, its baked cell's own size -
 * a HALF-width, like the two jitters above. [fraction of 1]
 *
 * A climate has only three or four bodies in the bake, so without this a wood
 * is built from four rubber stamps and the eye finds them: the temperate
 * family measures 0.45 / 0.58 / 0.73 / 0.88 tile heights and nothing in
 * between. A per-INSTANCE multiplier turns that four-rung ladder into a
 * continuum without a single new atlas cell - the SPEC2 6.2 booking a fifth
 * body would cost (Fehlerkatalog 40) buys nothing this does not.
 *
 * Bounded from above by the proportion rule of D-206: the tallest tree in the
 * bake lifts 28.0 px at zoom 1, so the tallest tree the renderer can draw is
 * 32.2 px against {@link BAKED_STATIC_MAX_LIFT_PX} = 64. `staticArt.spec.ts`
 * asserts that headroom against the real manifest, so a future tree model
 * that eats it is a red test rather than a crown clipped at a chunk seam.
 */
export const FOREST_TREE_SCALE_JITTER = 0.15;

/** Salt of the stand-density field, separate from body, jitter and buildings. */
export const FOREST_DENSITY_SALT = 0x44454e53;

/**
 * Edge length of one cell of the stand-density lattice. [tiles]
 *
 * Eight tiles is 400 m on the game's own 50 m tile - the scale of a stand, a
 * ride or a clearing rather than of a single tree. Smaller and the density
 * field is per-tile noise again (salt and pepper, not woodland); larger and a
 * whole viewport at zoom 2 - about 33 x 33 tiles - sits inside one gradient
 * and the carpet is back.
 */
export const FOREST_STAND_TILES = 8;

/** log2({@link FOREST_STAND_TILES}), so a lattice lookup is a shift. */
const FOREST_STAND_SHIFT = 3;

/**
 * Density a tile of open clearing still carries, and the span from there to a
 * full stand. [fraction of 1]
 *
 * The floor is deliberately not zero: a tile the field calls empty still has
 * roughly a one-in-eight chance per slot, so a clearing keeps its stragglers
 * instead of being a hard-edged hole. The ceiling is 1, so the densest stands
 * really do fill all four slots. Together they set the measured distribution -
 * 8.4 % of wooded tiles empty, 20.5 / 28.0 / 26.7 / 16.5 % carrying one to
 * four, mean 2.22 - which `staticArt.spec.ts` bands.
 */
const FOREST_DENSITY_FLOOR = 0.12;
const FOREST_DENSITY_SPAN = 0.88;

/** One lattice corner of the density field, in [0, 1). */
function forestStandValue(cellX: number, cellY: number): number {
  return tileVariantSeed(cellX, cellY, FOREST_DENSITY_SALT) / 4294967296;
}

/**
 * How dense the wood is at this tile - the field that gives a forest
 * clearings, dense stands and therefore EDGES, instead of one uniform carpet
 * of three trees per tile. [fraction of 1]
 *
 * Smoothstep-interpolated value noise over a lattice of
 * {@link FOREST_STAND_TILES}: four tile hashes and three lerps, allocation
 * free, no `Math.random`, no RNG stream (Z3 untouched, Fehlerkatalog 25/39) -
 * so the same tile has the same density on every machine, after every reload
 * and on BOTH render paths, which is what stops the map from changing
 * appearance as the camera crosses the 0.5x chunk threshold.
 *
 * Smoothstep rather than raw bilinear because raw bilinear value noise creases
 * along the lattice lines, and the creases would be a grid of their own.
 */
export function forestDensityAt(x: number, y: number): number {
  const cellX = x >> FOREST_STAND_SHIFT;
  const cellY = y >> FOREST_STAND_SHIFT;
  const fx = (x & (FOREST_STAND_TILES - 1)) / FOREST_STAND_TILES;
  const fy = (y & (FOREST_STAND_TILES - 1)) / FOREST_STAND_TILES;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = forestStandValue(cellX, cellY);
  const n10 = forestStandValue(cellX + 1, cellY);
  const n01 = forestStandValue(cellX, cellY + 1);
  const n11 = forestStandValue(cellX + 1, cellY + 1);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return FOREST_DENSITY_FLOOR + FOREST_DENSITY_SPAN * (top + (bottom - top) * sy);
}

/**
 * One tree slot of one forest tile: writes its tile-space offset (u, v) and
 * its size multiplier into `out`, and RETURNS whether a tree stands there at
 * all.
 *
 * `out` is always written, present or not, because the back-to-front proof
 * above is a property of the SLOT and a test has to be able to walk every
 * slot of every tile. Allocation-free - this runs once per slot per wooded
 * tile per rebuild, and once more per chunk bake.
 *
 * ONE avalanche over the tile and the slot pays for all four decisions, a
 * byte each: where across the depth axis (free), where along it (bounded by
 * the slot bands), whether the slot grows anything, and how big it is. That
 * is the same hash budget M13 spent on position alone, so the density and the
 * size variance cost nothing on top of the lattice they replace.
 *
 * `density` is {@link forestDensityAt} for this tile, passed in rather than
 * recomputed because it is a per-TILE fact and this is a per-SLOT call.
 */
export function forestTreeAt(
  x: number,
  y: number,
  slot: number,
  density: number,
  out: number[],
): boolean {
  const centre = FOREST_SLOT_OFFSETS[slot % FOREST_TREE_SLOTS]!;
  const seed = tileVariantSeed(x, y, TREE_JITTER_SALT + slot);
  // Bytes 0 and 1 - position, mapped to [-1, 1]; 127.5 rather than 128 so the
  // range is symmetric about the slot centre.
  const lateral = ((seed & 0xff) / 127.5 - 1) * FOREST_JITTER_LATERAL_TILES;
  const depth = (((seed >>> 8) & 0xff) / 127.5 - 1) * FOREST_JITTER_DEPTH_TILES;
  out[0] = centre[0] + lateral + depth;
  out[1] = centre[1] - lateral + depth;
  // Byte 3 - size, written whether or not the slot grows, like the offset.
  out[2] = 1 + (((seed >>> 24) & 0xff) / 127.5 - 1) * FOREST_TREE_SCALE_JITTER;
  // Byte 2 - presence, against the stand density. A Bernoulli draw per slot
  // whose probability is a SMOOTH function of position, which is what makes
  // the empty slots cluster into clearings instead of speckling the wood.
  return ((seed >>> 16) & 0xff) / 256 < density;
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
