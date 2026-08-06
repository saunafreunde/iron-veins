import {
  MAX_HEIGHT,
  MAX_TERRAFORM_CORNERS,
  SEA_LEVEL,
  TERRAFORM_COST_PER_STEP_CT,
  TERRAFORM_ROCK_SURCHARGE,
  TERRAFORM_WATER_SURCHARGE,
  TILE_PUBLIC,
} from '../constants';
import { computeLandmasses, markOcean } from '../mapgen/hydrology';
import { SignalKind, signalKind } from './signals';
import { Structure } from './structures';
import type { TileMap } from './TileMap';
import { Terrain } from './terrain';

/**
 * Raising and lowering ground.
 *
 * Moving one corner drags its neighbours along, because the map keeps the
 * invariant that adjacent corners never differ by more than one level. The
 * player pays for every corner that actually moved, which is what makes
 * flattening a mountain expensive without needing a separate rule for it.
 */

export const TerraformDirection = {
  Lower: -1,
  Raise: 1,
} as const;
export type TerraformDirection = (typeof TerraformDirection)[keyof typeof TerraformDirection];

export const TerraformReason = {
  OutOfRange: 'terraform.reject.outOfRange',
  AtLimit: 'terraform.reject.atLimit',
  Occupied: 'terraform.reject.occupied',
  ForeignOwner: 'terraform.reject.foreignOwner',
  TooExpensive: 'terraform.reject.tooExpensive',
  TooMuchEarth: 'terraform.reject.tooMuchEarth',
} as const;

export interface TerraformResult {
  readonly ok: boolean;
  /** Set when `ok` is false. */
  readonly reasonKey?: string;
  /** Total price of the operation. [cent] */
  readonly costCt: number;
  /** How many corners the operation moved. */
  readonly changedCorners: number;
  /** True when land turned into water or the other way round. */
  readonly changedShoreline: boolean;
}

const REJECTED_OUT_OF_RANGE: TerraformResult = {
  ok: false,
  reasonKey: TerraformReason.OutOfRange,
  costCt: 0,
  changedCorners: 0,
  changedShoreline: false,
};

/** Surcharge for the ground being moved: rock is hard, water needs filling. */
function surchargeAt(map: TileMap, x: number, y: number): number {
  let worst = 1;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!map.contains(tx, ty)) continue;
      const terrain = map.terrain[map.tileIndex(tx, ty)];
      if (terrain === Terrain.Water) worst = Math.max(worst, TERRAFORM_WATER_SURCHARGE);
      else if (terrain === Terrain.Rock || terrain === Terrain.Snow) {
        worst = Math.max(worst, TERRAFORM_ROCK_SURCHARGE);
      }
    }
  }
  return worst;
}

/**
 * Roads, track, signals, bridges, tunnels, buildings and industries block the
 * ground they stand on: moving a corner bends every tile that shares it, and
 * bending a tile under a live railway corrupts it silently - the audited
 * defect SPEC2 E-11 closes. The guard is unconditional; it is a bugfix, not a
 * versioned world rule.
 *
 * Ownership refines the ANSWER, never the outcome (D-104): infrastructure of
 * another company is named as such, because the acting company cannot clear it
 * and "occupied" would send the player to a demolish tool that refuses too.
 * Own and public obstacles read as occupied - removable first, terraformable
 * after. A tile that is merely OWNED without a mark in the map layers is a
 * station module (an airport, a canopy, a quay - they live in entity state)
 * and blocks all the same, which is what keeps a runway flat.
 *
 * Returns the refusal reason, or null when the corner may move.
 */
function cornerObstruction(map: TileMap, x: number, y: number, actor: number): string | null {
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!map.contains(tx, ty)) continue;
      const index = map.tileIndex(tx, ty);
      const owner = map.owner[index]!;
      const built =
        map.roadBits[index] !== 0 ||
        map.trackBits[index] !== 0 ||
        signalKind(map.signal[index]!) !== SignalKind.None ||
        map.structure[index] !== Structure.None ||
        map.buildingKind[index] !== 0 ||
        map.industryId[index] !== -1 ||
        // A buoy stands on open water the owner layer alone would protect,
        // but the layer check keeps the guard honest even for a marker whose
        // tile somehow stayed public (M11).
        map.waypoint[index] !== 0 ||
        owner !== TILE_PUBLIC;
      if (!built) continue;
      if (owner !== TILE_PUBLIC && owner !== actor) return TerraformReason.ForeignOwner;
      return TerraformReason.Occupied;
    }
  }
  return null;
}

/** Either the corners an operation would move, or why it cannot happen. */
type AffectedResult =
  | { readonly ok: true; readonly corners: number[] }
  | { readonly ok: false; readonly reasonKey: string };

/**
 * Collect every corner that has to move so that `x, y` can go one level in
 * `direction` without breaking the invariant.
 *
 * Every refusal names its own cause: hitting the height limit, running into
 * built-up ground, or dragging more earth than one action may move. A single
 * generic "not possible here" would leave the player guessing (section 17.3).
 */
function collectAffected(
  map: TileMap,
  x: number,
  y: number,
  direction: TerraformDirection,
  actor: number,
): AffectedResult {
  const stride = map.size + 1;
  const heights = map.cornerHeight;
  const start = y * stride + x;
  const target = heights[start]! + direction;
  if (target < 0 || target > MAX_HEIGHT) {
    return { ok: false, reasonKey: TerraformReason.AtLimit };
  }

  const affected: number[] = [start];
  const seen = new Set<number>([start]);

  // Breadth first over the eight-neighbourhood: a corner that would end up more
  // than one level away from a moved neighbour has to move as well.
  for (let cursor = 0; cursor < affected.length; cursor++) {
    const index = affected[cursor]!;
    const cx = index % stride;
    const cy = (index / stride) | 0;
    const newHeight = heights[index]! + direction;

    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny > map.size) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx > map.size || (dx === 0 && dy === 0)) continue;

        const neighbour = ny * stride + nx;
        if (seen.has(neighbour)) continue;

        const neighbourHeight = heights[neighbour]!;
        const needsToMove =
          direction === TerraformDirection.Raise
            ? newHeight - neighbourHeight > 1
            : neighbourHeight - newHeight > 1;
        if (!needsToMove) continue;

        const neighbourTarget = neighbourHeight + direction;
        if (neighbourTarget < 0 || neighbourTarget > MAX_HEIGHT) {
          return { ok: false, reasonKey: TerraformReason.AtLimit };
        }
        // The cascade may never touch a guarded corner either: dragging one
        // indirectly would corrupt the same infrastructure the direct check
        // protects. Refusing here refuses the WHOLE operation - nothing has
        // been written yet, so refusal is atomic.
        const obstruction = cornerObstruction(map, nx, ny, actor);
        if (obstruction !== null) {
          return { ok: false, reasonKey: obstruction };
        }
        if (affected.length >= MAX_TERRAFORM_CORNERS) {
          return { ok: false, reasonKey: TerraformReason.TooMuchEarth };
        }

        seen.add(neighbour);
        affected.push(neighbour);
      }
    }
  }
  return { ok: true, corners: affected };
}

/** Recompute water, coast and the derived layers after the shoreline moved. */
function refreshShoreline(map: TileMap, corners: readonly number[]): boolean {
  const stride = map.size + 1;
  let changed = false;

  for (const corner of corners) {
    const cx = corner % stride;
    const cy = (corner / stride) | 0;
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (!map.contains(tx, ty)) continue;

        const index = map.tileIndex(tx, ty);
        const submerged = map.isSubmerged(tx, ty);
        const isWater = map.terrain[index] === Terrain.Water;

        if (submerged && !isWater) {
          map.terrain[index] = Terrain.Water;
          changed = true;
        } else if (!submerged && isWater) {
          map.terrain[index] =
            map.baseHeight(tx, ty) <= SEA_LEVEL + 1 ? Terrain.Coast : Terrain.Grass;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    // Land masses and the ocean mask decide where industries may go and which
    // towns can be connected, so they must never be stale. A full relabel of a
    // 1024 map costs a few milliseconds and only happens when the player
    // actually moved a coastline.
    markOcean(map);
    computeLandmasses(map);
  }
  return changed;
}

/** Price of moving `count` corners at the given ground surcharge. */
function priceFor(count: number, surcharge: number): number {
  return Math.round(count * TERRAFORM_COST_PER_STEP_CT * surcharge);
}

/**
 * What would this operation cost? Used by the build preview, which must show
 * the price before the player commits (section 17.3).
 *
 * `actor` is the company doing the digging; corners under another company's
 * infrastructure are refused with their own reason.
 */
export function estimateTerraform(
  map: TileMap,
  x: number,
  y: number,
  direction: TerraformDirection,
  actor: number,
): TerraformResult {
  if (x < 0 || y < 0 || x > map.size || y > map.size) return REJECTED_OUT_OF_RANGE;
  const obstruction = cornerObstruction(map, x, y, actor);
  if (obstruction !== null) {
    return {
      ok: false,
      reasonKey: obstruction,
      costCt: 0,
      changedCorners: 0,
      changedShoreline: false,
    };
  }

  const affected = collectAffected(map, x, y, direction, actor);
  if (!affected.ok) {
    return {
      ok: false,
      reasonKey: affected.reasonKey,
      costCt: 0,
      changedCorners: 0,
      changedShoreline: false,
    };
  }

  return {
    ok: true,
    costCt: priceFor(affected.corners.length, surchargeAt(map, x, y)),
    changedCorners: affected.corners.length,
    changedShoreline: false,
  };
}

/**
 * Move one corner by one level, dragging whatever has to follow. The caller is
 * responsible for taking the money.
 */
export function applyTerraform(
  map: TileMap,
  x: number,
  y: number,
  direction: TerraformDirection,
  actor: number,
): TerraformResult {
  const estimate = estimateTerraform(map, x, y, direction, actor);
  if (!estimate.ok) return estimate;

  const affected = collectAffected(map, x, y, direction, actor);
  if (!affected.ok) return { ...estimate, ok: false, reasonKey: affected.reasonKey };

  for (const corner of affected.corners) {
    map.cornerHeight[corner] = map.cornerHeight[corner]! + direction;
  }
  map.revision++;

  const changedShoreline = refreshShoreline(map, affected.corners);
  return {
    ok: true,
    costCt: estimate.costCt,
    changedCorners: affected.corners.length,
    changedShoreline,
  };
}

/**
 * Flatten a tile to its lowest corner. Expressed as repeated single-corner
 * lowering so it obeys exactly the same rules and pricing.
 *
 * `budgetCt` is checked before each individual step, so the operation can never
 * move ground the player cannot pay for. Levelling that runs out of money stops
 * where it is and reports what it did - the same behaviour as dragging a
 * terraform tool until the balance is empty.
 */
export function levelTile(
  map: TileMap,
  x: number,
  y: number,
  budgetCt: number,
  actor: number,
): TerraformResult {
  if (!map.contains(x, y)) return REJECTED_OUT_OF_RANGE;

  const stride = map.size + 1;
  const corners = [
    y * stride + x,
    y * stride + x + 1,
    (y + 1) * stride + x,
    (y + 1) * stride + x + 1,
  ];
  const base = map.baseHeight(x, y);

  let costCt = 0;
  let changedCorners = 0;
  let changedShoreline = false;

  for (const corner of corners) {
    while (map.cornerHeight[corner]! > base) {
      const cx = corner % stride;
      const cy = (corner / stride) | 0;

      const estimate = estimateTerraform(map, cx, cy, TerraformDirection.Lower, actor);
      if (!estimate.ok) {
        // Levelling that ran into a refusal stops where it is - the documented
        // budget behaviour. When it never moved anything, the caller needs the
        // concrete reason (section 17.3), not a bare "no".
        return changedCorners > 0
          ? { ok: true, costCt, changedCorners, changedShoreline }
          : { ok: false, reasonKey: estimate.reasonKey, costCt, changedCorners, changedShoreline };
      }
      if (costCt + estimate.costCt > budgetCt) {
        return changedCorners > 0
          ? { ok: true, costCt, changedCorners, changedShoreline }
          : {
              ok: false,
              reasonKey: TerraformReason.TooExpensive,
              costCt: 0,
              changedCorners: 0,
              changedShoreline: false,
            };
      }

      const result = applyTerraform(map, cx, cy, TerraformDirection.Lower, actor);
      if (!result.ok) {
        return changedCorners > 0
          ? { ok: true, costCt, changedCorners, changedShoreline }
          : { ok: false, reasonKey: result.reasonKey, costCt, changedCorners, changedShoreline };
      }
      costCt += result.costCt;
      changedCorners += result.changedCorners;
      changedShoreline = changedShoreline || result.changedShoreline;
    }
  }
  return { ok: true, costCt, changedCorners, changedShoreline };
}
