import type { BakedAtlasManifest, BakedCell } from './bakedAtlas';

/**
 * Vehicle art from the Kenney bake (SPEC2 M13, E-14/D-160/D-169): the pure
 * half of putting a baked sprite under every catalogue vehicle. Everything
 * here is a function of its arguments - facing quantisation, the
 * deterministic per-vehicle variant pick, the manifest index and the
 * per-entry fallback decision - so the whole policy is unit-testable without
 * Pixi, and MapView only executes what these functions decided.
 *
 * Nothing in this file may reach the simulation: a facing is DERIVED from
 * the published snapshot samples, per D-162's rule that the renderer draws
 * only what the simulation published.
 */

/**
 * The eight travel directions a facing index encodes, as (dx, dy) tile
 * deltas in the map's axes (+x lower-right on screen, +y lower-left) -
 * restated from tools/bake-lib.ts FACING_DELTAS because the game cannot
 * import build tools; the coupling test in tests/unit/vehicleArt.spec.ts
 * asserts the two lists equal, the assetsBake.spec.ts device (D-160).
 */
export const VEHICLE_FACING_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Facings per vehicle, the bake's contract (8 per driving model, D-160). */
export const VEHICLE_FACING_COUNT = 8;

/**
 * Sentinel for "no facing cached yet" in a per-vehicle Uint8Array - outside
 * 0..7, so a fresh vehicle is distinguishable from one facing east.
 */
export const FACING_NONE = 255;

/**
 * Below this squared tile-space movement between two generation samples a
 * vehicle counts as standing, and its facing is NOT recomputed: the residual
 * float noise of a halted lerp must not spin the sprite. One tick of the
 * slowest catalogue vehicle moves ~1e-3 tiles, two orders of magnitude
 * above this floor. [tiles squared]
 */
const MOVE_EPSILON_SQ = 1e-10;

/**
 * Quantise a tile-space movement vector to the nearest of the eight facings,
 * or -1 for a zero vector. The eight exact FACING_DELTAS map to their own
 * index by construction (each sits at a multiple of 45 degrees); anything
 * between - the blended vector of a vehicle rounding a corner mid-lerp -
 * lands on the nearest facing, which is what keeps the sprite from snapping
 * a whole quarter turn at a tile edge (SPEC2 M13).
 */
export function facingFromDelta(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return -1;
  // atan2 is fine on the render side; the sim-side ban (law #4) protects
  // the deterministic core, and no facing ever flows back into it.
  const eighth = Math.atan2(dy, dx) / (Math.PI / 4);
  return ((Math.round(eighth) % 8) + 8) % 8;
}

/**
 * Facing from the INTERPOLATED movement vector: the delta between the
 * previous and the current generation's fractional tile positions - the
 * direction the sprite actually glides on screen (D-162), not the direction
 * of whichever tile step it happens to be on. Returns -1 when the vehicle
 * is standing (below {@link MOVE_EPSILON_SQ}); the caller keeps the cached
 * facing then, because a stopped vehicle does not spin.
 */
export function facingFromMovement(
  prevFx: number,
  prevFy: number,
  currFx: number,
  currFy: number,
): number {
  const dx = currFx - prevFx;
  const dy = currFy - prevFy;
  if (dx * dx + dy * dy < MOVE_EPSILON_SQ) return -1;
  return facingFromDelta(dx, dy);
}

/**
 * Deterministic per-vehicle variant pick (SPEC2 M13: "deterministische
 * Varianz via hash(vehicleId)"): an integer avalanche over the vehicle id,
 * reduced to the variant count. Pure integer maths, so the same vehicle
 * wears the same body on every machine, every frame and every reload -
 * render-side determinism without touching any RNG stream.
 */
export function variantIndex(vehicleId: number, variantCount: number): number {
  if (variantCount <= 1) return 0;
  let h = vehicleId | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) % variantCount;
}

/** One facing of one variant: the cell and the atlas page file it lives on. */
export interface VehicleFacingCell {
  /** Page file name - the eight facings of one model CAN span pages. */
  readonly page: string;
  readonly cell: BakedCell;
}

/** One complete vehicle variant: all eight facing cells. */
export interface VehicleVariant {
  readonly cells: readonly VehicleFacingCell[];
}

/** Baked vehicle art of ONE zoom level: catalogue id to its variants. */
export interface VehicleZoomIndex {
  readonly zoom: number;
  readonly bySpec: ReadonlyMap<number, readonly VehicleVariant[]>;
}

/**
 * Target grammar of a vehicle cell: `vehicle:<specId>` is the base variant,
 * `vehicle:<specId>:<n>` a manifest-declared extra variant (the grammar the
 * building cells already use). Anything else is not vehicle art.
 */
const VEHICLE_TARGET = /^vehicle:(\d+)(?::(\d+))?$/;

/**
 * Index the baked manifest for the vehicle draw path: per zoom, per
 * catalogue id, the declared variants with all eight facing cells resolved.
 * A variant missing any facing is DROPPED whole - drawing seven facings
 * baked and one procedural would be exactly the wrong-silhouette flicker
 * D-117 forbids - and a catalogue id with no complete variant simply stays
 * absent, which is the per-entry fallback of {@link vehicleVariantsFor}.
 */
export function buildVehicleIndex(manifest: BakedAtlasManifest): readonly VehicleZoomIndex[] {
  const zooms = new Map<number, Map<number, Map<number, (VehicleFacingCell | undefined)[]>>>();
  for (const page of manifest.pages) {
    for (const cell of page.cells) {
      const match = VEHICLE_TARGET.exec(cell.target);
      if (match === null) continue;
      const specId = Number(match[1]);
      const variant = match[2] === undefined ? 0 : Number(match[2]);
      if (cell.facing < 0 || cell.facing >= VEHICLE_FACING_COUNT) continue;
      let bySpec = zooms.get(page.zoom);
      if (bySpec === undefined) {
        bySpec = new Map();
        zooms.set(page.zoom, bySpec);
      }
      let variants = bySpec.get(specId);
      if (variants === undefined) {
        variants = new Map();
        bySpec.set(specId, variants);
      }
      let cells = variants.get(variant);
      if (cells === undefined) {
        // Filled explicitly: a sparse array's holes are invisible to
        // `some`, and an incomplete variant must be SEEN to be dropped.
        cells = new Array<VehicleFacingCell | undefined>(VEHICLE_FACING_COUNT).fill(undefined);
        variants.set(variant, cells);
      }
      cells[cell.facing] = { page: page.file, cell };
    }
  }

  const result: VehicleZoomIndex[] = [];
  for (const [zoom, bySpecRaw] of zooms) {
    const bySpec = new Map<number, readonly VehicleVariant[]>();
    for (const [specId, variantsRaw] of bySpecRaw) {
      const complete: VehicleVariant[] = [];
      // Variant order is the manifest suffix order, so hash(vehicleId)
      // lands on the same body whatever order the pages listed the cells.
      for (const variant of [...variantsRaw.keys()].sort((a, b) => a - b)) {
        const cells = variantsRaw.get(variant)!;
        if (cells.some((entry) => entry === undefined)) continue;
        complete.push({ cells: cells as VehicleFacingCell[] });
      }
      if (complete.length > 0) bySpec.set(specId, complete);
    }
    result.push({ zoom, bySpec });
  }
  result.sort((a, b) => a.zoom - b.zoom);
  return result;
}

/**
 * Which baked zoom serves a display zoom: the largest baked zoom that does
 * not exceed it - one texture pixel is at most one screen pixel, never an
 * upscale (the D-163 rule) - and the smallest baked zoom for the chunked
 * display zooms below 1x, where vehicles are the one thing still drawn as
 * live sprites (D-161) and a downscale is what the procedural page does too.
 */
export function bakedZoomFor(displayZoom: number, zooms: readonly number[]): number {
  let best = -1;
  for (const zoom of zooms) {
    if (zoom <= displayZoom && zoom > best) best = zoom;
  }
  if (best > 0) return best;
  let smallest = Infinity;
  for (const zoom of zooms) {
    if (zoom < smallest) smallest = zoom;
  }
  // An empty zoom list cannot happen behind atlasSourceFor, but a total
  // function beats a NaN sprite scale if it ever does.
  return Number.isFinite(smallest) ? smallest : 1;
}

/**
 * The per-entry fallback decision (SPEC2 M13, the E-14 floor one level
 * down): baked art exists for this catalogue id, or it does not - and when
 * it does not (an aircraft, an unmapped id, a specId the markers have not
 * delivered yet, spelled -1), the caller draws the M10 white-box frame.
 * Null is that answer; a non-null return is the hash-chosen variant.
 */
export function vehicleVariantFor(
  index: VehicleZoomIndex | null,
  specId: number,
  vehicleId: number,
): VehicleVariant | null {
  if (index === null || specId < 0) return null;
  const variants = index.bySpec.get(specId);
  if (variants === undefined || variants.length === 0) return null;
  return variants[variantIndex(vehicleId, variants.length)]!;
}
