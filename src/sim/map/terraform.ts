import {
  MAX_HEIGHT,
  MAX_TERRAFORM_CORNERS,
  SEA_LEVEL,
  TERRAFORM_COST_PER_STEP_CT,
  TERRAFORM_ROCK_SURCHARGE,
  TERRAFORM_WATER_SURCHARGE,
  TerraformDirection,
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

/**
 * Ask the shoreline question of EVERY tile, not only of the corners one action
 * moved.
 *
 * **No command may call this, and the M22 correction bundle is why.** A
 * complete pass cannot leave a tile whose terrain disagrees with its own
 * corners - which sounds like a guarantee and is really a demolition order:
 * {@link standingWaterAboveSeaLevel} counts the tiles the GENERATOR leaves in
 * exactly that state, and on a 256 map there are 198 of them. `PaintRiver` used
 * this to finish a one-tile brush at the coast and deleted every one of them,
 * across the whole map, in both the preview and the refusal path. The commands
 * ask {@link refreshShorelineAt} about the corners they moved instead;
 * `enforceSlopeInvariant` hands its own corner list out for the same reason.
 *
 * What is left here is the INSTRUMENT: the quirk of SPEC2 M22 is "a mountain
 * river is water until somebody asks the shoreline question near it", and
 * asking it everywhere is how a test demonstrates that in one line.
 *
 * Returns true when anything changed, on the same terms as the corner-local
 * version, and does the same relabelling when it did.
 */
export function refreshShorelineEverywhere(map: TileMap): boolean {
  let changed = false;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const index = map.tileIndex(x, y);
      const submerged = map.isSubmerged(x, y);
      const isWater = map.terrain[index] === Terrain.Water;
      if (submerged && !isWater) {
        map.terrain[index] = Terrain.Water;
        changed = true;
      } else if (!submerged && isWater) {
        map.terrain[index] =
          map.baseHeight(x, y) <= SEA_LEVEL + 1 ? Terrain.Coast : Terrain.Grass;
        changed = true;
      }
    }
  }
  if (changed) {
    markOcean(map);
    computeLandmasses(map);
  }
  return changed;
}

/**
 * How many tiles hold water their own corners do not justify.
 *
 * The measuring instrument behind SPEC2 M22's "standing water at height X":
 * `applyRivers` paints `Terrain.Water` along a traced course whatever height
 * the valley is at, while every shoreline refresh since M2 answers the question
 * with {@link TileMap.isSubmerged} alone - so a mountain river is water until
 * the first terraform anywhere near it, and then it is grass. The editor's own
 * commands may never add to this count (that is what `PaintRiver` refusing to
 * write terrain buys); what the GENERATOR leaves behind is measured rather than
 * asserted away, and `tests/unit/editorCommands.spec.ts` pins both halves.
 */
export function standingWaterAboveSeaLevel(map: TileMap): number {
  let count = 0;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      if (map.terrain[map.tileIndex(x, y)] !== Terrain.Water) continue;
      if (!map.isSubmerged(x, y)) count++;
    }
  }
  return count;
}

/**
 * Recompute water, coast and the derived layers after the shoreline moved.
 *
 * **Scoped by construction, and that is the whole point.** The question this
 * asks a tile - "does your terrain agree with your own corners?" - has a wrong
 * answer on ground NOBODY touched: `applyRivers` paints water along a traced
 * course whatever height the valley is at (see {@link standingWaterAboveSeaLevel}),
 * so a sweep that asks it everywhere turns every mountain river on the map into
 * grass as a side effect of an edit at the coast. Ask it only of the corners the
 * edit moved and that cannot happen.
 */
export function refreshShorelineAt(map: TileMap, corners: readonly number[]): boolean {
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

/**
 * Every byte a terraform-shaped edit can move, kept so that a PREVIEW or a
 * REFUSAL can put them all back.
 *
 * The two callers that need this - `terraformBrush(commit: false)` and the
 * workshop's `PaintRiver` - restore through ONE pair of functions rather than
 * two copies of the same three lines, because the copies were what let
 * `PaintRiver` restore the heights and then rebuild the terrain from them with
 * a whole-map sweep (the M22 correction bundle). Restoring is not "undo the
 * bits I remember changing": it is putting the map back byte for byte and
 * recomputing what is DERIVED from those bytes.
 */
export interface GroundSnapshot {
  readonly cornerHeight: Uint8Array;
  readonly terrain: Uint8Array;
  readonly revision: number;
  readonly trackRevision: number;
}

/** Take the snapshot. Deliberately outside the hot path - law #7 is untouched. */
export function captureGround(map: TileMap): GroundSnapshot {
  return {
    cornerHeight: Uint8Array.from(map.cornerHeight),
    terrain: Uint8Array.from(map.terrain),
    revision: map.revision,
    trackRevision: map.trackRevision,
  };
}

/**
 * Put the ground back exactly as it was, including the two revision counters -
 * a preview that bumped them would rebuild the world on every pointer move, and
 * a refused command that bumped them would be observable in the one place a
 * refusal must not be observable at all.
 *
 * `changedShoreline` says whether the run recomputed `oceanMask` and
 * `landmassId`; those are derived from the bytes above, so restoring the bytes
 * and recomputing them is a complete restoration and not an approximation.
 */
export function restoreGround(
  map: TileMap,
  snapshot: GroundSnapshot,
  changedShoreline: boolean,
): void {
  map.cornerHeight.set(snapshot.cornerHeight);
  map.terrain.set(snapshot.terrain);
  map.revision = snapshot.revision;
  map.trackRevision = snapshot.trackRevision;
  if (changedShoreline) {
    markOcean(map);
    computeLandmasses(map);
  }
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
  map.noteChange();

  const changedShoreline = refreshShorelineAt(map, affected.corners);
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

/**
 * The scenario workshop's bulk terraform (SPEC2 M22).
 *
 * ONE function for the preview and for the command, which is D-119's rule
 * applied to the dearest edit in the game: `commit: false` runs the WHOLE
 * operation against the real map and then puts every byte it touched back, so
 * the figure the palette quotes is not computed by a second implementation
 * that agrees with this one today. Restoring the two revision counters is part
 * of that - a preview that bumped them would make the renderer rebuild the
 * world on every pointer move, and a preview must be observable in nothing but
 * its answer.
 *
 * The region is the square of CORNERS of half width `radius` around (x, y),
 * walked row-major, which is a total order no two corners tie on (law #3). Each
 * corner runs the ordinary single-corner cascade - so the invariant, the
 * obstruction guard of E-11 and the pricing are all exactly the ones a single
 * click obeys - and the sweep afterwards is SPEC2 M22's own second half: the
 * cascade holds the invariant per corner, `enforceSlopeInvariant` proves it for
 * the region, and anything it pulls down asks the shoreline question again.
 *
 * A corner that refuses does NOT refuse the brush: a bulk tool that stopped at
 * the first boulder would be unusable on real ground. The behaviour is
 * `levelTile`'s, one instrument up - what moved is applied and paid for, and a
 * brush that moved NOTHING answers with the first concrete reason it met
 * (section 17.3) rather than a generic no.
 *
 * `budgetCt` is checked before every corner, so the operation can never move
 * ground the caller cannot pay for.
 */
export function terraformBrush(
  map: TileMap,
  x: number,
  y: number,
  radius: number,
  direction: TerraformDirection,
  actor: number,
  budgetCt: number,
  commit: boolean,
): TerraformResult {
  if (radius < 0 || x < 0 || y < 0 || x > map.size || y > map.size) return REJECTED_OUT_OF_RANGE;

  const snapshot = commit ? null : captureGround(map);

  let costCt = 0;
  let changedCorners = 0;
  let changedShoreline = false;
  let firstRefusal: string | null = null;

  for (let cy = y - radius; cy <= y + radius; cy++) {
    if (cy < 0 || cy > map.size) continue;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      if (cx < 0 || cx > map.size) continue;

      const estimate = estimateTerraform(map, cx, cy, direction, actor);
      if (!estimate.ok) {
        if (firstRefusal === null) firstRefusal = estimate.reasonKey ?? '';
        continue;
      }
      if (costCt + estimate.costCt > budgetCt) {
        if (firstRefusal === null) firstRefusal = TerraformReason.TooExpensive;
        continue;
      }

      const result = applyTerraform(map, cx, cy, direction, actor);
      if (!result.ok) {
        if (firstRefusal === null) firstRefusal = result.reasonKey ?? '';
        continue;
      }
      costCt += result.costCt;
      changedCorners += result.changedCorners;
      changedShoreline = changedShoreline || result.changedShoreline;
    }
  }

  // SPEC2 M22 asks for the cascade AND the sweep, and the sweep is not
  // decoration: it is the proof that a bulk edit cannot leave the map in a
  // state the sixteen slopes cannot express. In practice the cascades have
  // already held it and this moves nothing - which is an assertion in
  // `tests/unit/editorCommands.spec.ts`, not an assumption here.
  //
  // The sweep asks the shoreline question only of the corners it actually
  // pulled. A whole-map pass here would relabel ground the brush never touched
  // - see {@link refreshShorelineAt} for the tiles that would lose their water.
  const pulled: number[] = [];
  if (changedCorners > 0 && map.enforceSlopeInvariant(pulled) > 0) {
    map.noteChange();
    changedShoreline = refreshShorelineAt(map, pulled) || changedShoreline;
  }

  if (snapshot !== null) restoreGround(map, snapshot, changedShoreline);

  if (changedCorners === 0) {
    return {
      ok: false,
      reasonKey: firstRefusal ?? TerraformReason.AtLimit,
      costCt: 0,
      changedCorners: 0,
      changedShoreline: false,
    };
  }
  return { ok: true, costCt, changedCorners, changedShoreline };
}

/**
 * Dig one tile down until the sea covers it, or refuse the tile whole.
 *
 * The engine behind `PaintRiver` and the reason that command writes no terrain
 * at all (SPEC2 M22's "formalised or refused", decided as REFUSED): the game
 * has exactly ONE water surface - "a tile is water when even its highest corner
 * is at or below `SEA_LEVEL`" - and D-097 already recorded that there is no
 * second level for a lock to connect. So the workshop may not paint standing
 * water at height X; what it may do is take the ground away until the sea is
 * there by the game's own rule, after which the water is as stable as any other
 * coast and no later terraform can revert it.
 *
 * Atomic per tile: the caller passes `commit: false` first if it wants to know,
 * and this function never leaves a tile half dug - a corner it cannot lower
 * refuses before anything below it is written, exactly as `collectAffected`
 * refuses a cascade.
 */
export function digTileToSeaLevel(
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

  let costCt = 0;
  let changedCorners = 0;
  let changedShoreline = false;

  for (const corner of corners) {
    while (map.cornerHeight[corner]! > SEA_LEVEL) {
      const cx = corner % stride;
      const cy = (corner / stride) | 0;

      const estimate = estimateTerraform(map, cx, cy, TerraformDirection.Lower, actor);
      if (!estimate.ok) {
        return {
          ok: false,
          reasonKey: estimate.reasonKey,
          costCt,
          changedCorners,
          changedShoreline,
        };
      }
      if (costCt + estimate.costCt > budgetCt) {
        return {
          ok: false,
          reasonKey: TerraformReason.TooExpensive,
          costCt,
          changedCorners,
          changedShoreline,
        };
      }

      const result = applyTerraform(map, cx, cy, TerraformDirection.Lower, actor);
      if (!result.ok) {
        return { ok: false, reasonKey: result.reasonKey, costCt, changedCorners, changedShoreline };
      }
      costCt += result.costCt;
      changedCorners += result.changedCorners;
      changedShoreline = changedShoreline || result.changedShoreline;
    }
  }
  return { ok: true, costCt, changedCorners, changedShoreline };
}
