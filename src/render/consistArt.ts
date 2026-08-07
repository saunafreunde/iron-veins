import { MAX_CONSIST_UNITS, MAX_TRAIN_LENGTH_M, TILE_SIZE_M } from '../sim/constants';
import { hasVehicleSpec, vehicleSpec } from '../sim/vehicles/catalog';
import { TELEPORT_TILES_SQ } from './interpolation';

/**
 * Consist rendering (SPEC2 M13, E-05): a ten-wagon coal train is ten visible
 * wagons. This file is the pure half - the per-vehicle breadcrumb ring the
 * renderer maintains from published head positions, and the arc-length walk
 * that places every trailing unit along it - so the whole policy is testable
 * without Pixi, and MapView only executes what these functions decided.
 *
 * Everything here is render-side derivation from what the simulation
 * published (D-162's rule): the head positions come from the snapshot
 * generations the interpolator already copies, the composition comes from the
 * fleet-marker channel (E-05: consists travel low-frequency, never in the
 * 20 Hz stride), and nothing flows back into the sim. Rail only - road,
 * water and air stay single-sprite (SPEC2 M13).
 */

/**
 * Arc-length gap between two stored breadcrumbs. [tiles]
 * 0.25 tiles is 12.5 m - half a short wagon, so a wagon always spans at
 * least two samples and the polyline resolves every curve the track model
 * can express (curve radii are tile-scale, section 8.1). Smaller would grow
 * every ring for no visible gain; render-side judgment, M13.
 */
export const BREADCRUMB_SPACING_TILES = 0.25;

/**
 * Breadcrumbs one ring holds. Sized from the sim's own hard cap: the longest
 * legal train is MAX_TRAIN_LENGTH_M (validateConsist enforces it), and the
 * ring must cover that distance behind the head at the stored spacing -
 * crumbs recorded at generation cadence can only be SPARSER than the
 * spacing floor (fast-forward skips generations), which covers MORE
 * distance per entry, never less. +4 margin for the partial segment at each
 * end. [breadcrumbs]
 */
export const BREADCRUMB_CAPACITY =
  Math.ceil(MAX_TRAIN_LENGTH_M / TILE_SIZE_M / BREADCRUMB_SPACING_TILES) + 4;

/**
 * Below this squared segment length two breadcrumbs count as the same point
 * and the segment is skipped rather than divided by. [tiles squared]
 */
const MIN_SEGMENT_SQ = 1e-12;

/**
 * A trailing unit's resolved place on the breadcrumb path: fractional tile
 * position, interpolated height, and the FORWARD travel direction of its
 * local path segment (tile axes, unnormalised) - what the caller quantises
 * to a facing, so a wagon points where its own stretch of track runs, not
 * where the locomotive does. Mutable and preallocated by the caller: the
 * placement walk runs inside the frame loop and allocates nothing.
 */
export interface ConsistPlacement {
  fx: number;
  fy: number;
  h: number;
  dirX: number;
  dirY: number;
}

/**
 * The per-vehicle path-history ring of E-05's consist mechanism: the last
 * {@link BREADCRUMB_CAPACITY} positions a rail vehicle's head was published
 * at, spaced at least {@link BREADCRUMB_SPACING_TILES} apart, newest first.
 * Fully preallocated; `record` and every accessor allocate nothing.
 *
 * The renderer records the sample of the generation that just became the
 * PREVIOUS one - the position the interpolated head has provably passed -
 * so the walk from the drawn head into the ring always runs backwards along
 * the path, never towards a position the head has not reached yet.
 */
export class BreadcrumbRing {
  private readonly fx: Float32Array;
  private readonly fy: Float32Array;
  private readonly h: Float32Array;
  private readonly capacity: number;
  /** Ring slot of the newest breadcrumb; meaningless while `used` is 0. */
  private newest = 0;
  private used = 0;

  constructor(capacity: number = BREADCRUMB_CAPACITY) {
    this.capacity = capacity;
    this.fx = new Float32Array(capacity);
    this.fy = new Float32Array(capacity);
    this.h = new Float32Array(capacity);
  }

  /** Breadcrumbs currently stored. */
  get length(): number {
    return this.used;
  }

  /** Fractional tile X of breadcrumb `i` (0 = newest). */
  fxAt(i: number): number {
    return this.fx[(this.newest - i + this.capacity * 2) % this.capacity]!;
  }

  /** Fractional tile Y of breadcrumb `i` (0 = newest). */
  fyAt(i: number): number {
    return this.fy[(this.newest - i + this.capacity * 2) % this.capacity]!;
  }

  /** Interpolated height of breadcrumb `i` (0 = newest). [height levels] */
  hAt(i: number): number {
    return this.h[(this.newest - i + this.capacity * 2) % this.capacity]!;
  }

  /** Forget every breadcrumb - the whole-consist snap of D-162. */
  reset(): void {
    this.used = 0;
  }

  /**
   * Record a published head sample. Below the spacing floor it is dropped
   * (a standing train must not spam identical crumbs); past the D-162
   * teleport distance the ring RESETS first - a relocated train's wagons
   * must snap with it, never stream across the map along a path nobody
   * drove. Returns true when the ring was reset by this call.
   */
  record(fx: number, fy: number, h: number): boolean {
    if (this.used > 0) {
      const dx = fx - this.fx[this.newest]!;
      const dy = fy - this.fy[this.newest]!;
      const distSq = dx * dx + dy * dy;
      if (distSq <= BREADCRUMB_SPACING_TILES * BREADCRUMB_SPACING_TILES) return false;
      if (distSq > TELEPORT_TILES_SQ) {
        this.reset();
        this.push(fx, fy, h);
        return true;
      }
    }
    this.push(fx, fy, h);
    return false;
  }

  private push(fx: number, fy: number, h: number): void {
    this.newest = this.used === 0 ? 0 : (this.newest + 1) % this.capacity;
    this.fx[this.newest] = fx;
    this.fy[this.newest] = fy;
    this.h[this.newest] = h;
    if (this.used < this.capacity) this.used++;
  }
}

/**
 * Centre-of-unit distances of every TRAILING unit behind the head anchor,
 * from the aggregate lengths of the composition (SPEC2 M13). The lead unit
 * draws at the head anchor itself - exactly where the single sprite always
 * drew - so follower `k` (consist index `k + 1`) sits at half the lead's
 * length, plus every intermediate unit, plus half its own. Ascending by
 * construction, which the placement walk relies on. [tiles]
 *
 * Precondition: every id has a catalogue entry (`hasVehicleSpec`) - marker
 * consists come from the simulation and always do; the caller guards.
 * Returns the follower count written (consist length - 1, capped by `out`).
 */
export function consistFollowerDistances(specIds: readonly number[], out: Float64Array): number {
  if (specIds.length < 2) return 0;
  const count = Math.min(specIds.length - 1, out.length);
  let cumM = vehicleSpec(specIds[0]!).lengthM / 2;
  for (let k = 0; k < count; k++) {
    const lengthM = vehicleSpec(specIds[k + 1]!).lengthM;
    out[k] = (cumM + lengthM / 2) / TILE_SIZE_M;
    cumM += lengthM;
  }
  return count;
}

/** Does every unit of a marker consist have a catalogue entry? */
export function consistKnown(specIds: readonly number[]): boolean {
  for (const id of specIds) {
    if (!hasVehicleSpec(id)) return false;
  }
  return true;
}

/**
 * Are two compositions identical, id for id? The reconciliation test that
 * keeps a fleet-marker refresh from wiping a train's breadcrumb ring: only
 * a genuinely changed composition re-derives anything.
 */
export function sameConsist(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Place `count` trailing units at the given arc-length distances behind the
 * drawn head, walking the breadcrumb ring back along the path the head
 * actually drove. One pass for the whole consist - the distances are
 * ascending, so the walk never restarts.
 *
 * Where the history runs out - a fresh spawn with an empty ring, a short
 * ring after a teleport reset, a train longer than what has been recorded -
 * the remaining units extend in a STRAIGHT line along the last known
 * segment, or along `fallbackDirX/Y` (the head's facing, any magnitude;
 * zero falls back to east) when no segment exists at all. That is the
 * honest floor: the renderer only knows published positions, and a
 * straight tail that heals into the real curve as crumbs accumulate beats
 * inventing a path nobody drove.
 *
 * Writes into the caller's preallocated `out` slots; allocates nothing.
 */
export function placeConsist(
  ring: BreadcrumbRing,
  headFx: number,
  headFy: number,
  headH: number,
  fallbackDirX: number,
  fallbackDirY: number,
  distances: ArrayLike<number>,
  count: number,
  out: readonly ConsistPlacement[],
): void {
  // The current segment start (nearer the head) and the walk state.
  let curX = headFx;
  let curY = headFy;
  let curH = headH;
  let travelled = 0;
  let index = 0;

  // Last known FORWARD direction, for facings and for the straight
  // extension when the ring is exhausted. Falls back to the head's facing,
  // and last of all to east - a total answer, never NaN.
  let lastDirX = fallbackDirX;
  let lastDirY = fallbackDirY;
  if (lastDirX === 0 && lastDirY === 0) lastDirX = 1;

  for (let k = 0; k < count; k++) {
    const target = distances[k]!;
    let placed = false;

    while (index < ring.length) {
      const nextX = ring.fxAt(index);
      const nextY = ring.fyAt(index);
      const nextH = ring.hAt(index);
      const dx = curX - nextX;
      const dy = curY - nextY;
      const segSq = dx * dx + dy * dy;
      if (segSq < MIN_SEGMENT_SQ) {
        index++;
        continue;
      }
      const segLen = Math.sqrt(segSq);
      // Forward is towards the head: from the older point to the newer one.
      lastDirX = dx;
      lastDirY = dy;
      if (travelled + segLen >= target) {
        const t = (target - travelled) / segLen;
        const slot = out[k]!;
        slot.fx = curX + (nextX - curX) * t;
        slot.fy = curY + (nextY - curY) * t;
        slot.h = curH + (nextH - curH) * t;
        slot.dirX = dx;
        slot.dirY = dy;
        placed = true;
        break;
      }
      travelled += segLen;
      curX = nextX;
      curY = nextY;
      curH = nextH;
      index++;
    }

    if (!placed) {
      // History exhausted: extend straight BACKWARDS along the last known
      // forward direction, at the constant height of the last known point.
      const norm = Math.sqrt(lastDirX * lastDirX + lastDirY * lastDirY);
      const backX = -lastDirX / norm;
      const backY = -lastDirY / norm;
      const rest = target - travelled;
      const slot = out[k]!;
      slot.fx = curX + backX * rest;
      slot.fy = curY + backY * rest;
      slot.h = curH;
      slot.dirX = lastDirX;
      slot.dirY = lastDirY;
    }
  }
}

/** Cap on trailing units one consist can draw, sizing the scratch slots. */
export const MAX_CONSIST_FOLLOWERS = MAX_CONSIST_UNITS - 1;
