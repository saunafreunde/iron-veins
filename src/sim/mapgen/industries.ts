import { INDUSTRY_MIN_DISTANCE, TILES_PER_INDUSTRY } from '../constants';
import type { Cargo } from '../cargo/types';
import {
  INDUSTRY_SPECS,
  industrySpec,
  newIndustry,
  type Industry,
  type IndustrySpec,
  type IndustryType,
} from '../industry/types';
import type { TileMap } from '../map/TileMap';
import { Terrain } from '../map/terrain';
import type { Rng } from '../rng';
import type { Town } from '../town/types';

/**
 * Step 6 of section 6: industry placement, including the guarantee that every
 * processing industry can actually be supplied.
 *
 * A steel mill on an island with no coal is not a challenge, it is a bug: the
 * player cannot tell the difference between "hard" and "impossible". The
 * generator therefore checks every recipe against the land mass the consumer
 * stands on and either adds the missing supplier or removes the consumer.
 */

const PLACEMENT_ATTEMPTS_PER_INDUSTRY = 300;

/** Extra attempts spent on repairing a broken production chain. */
const REPAIR_ATTEMPTS = 2_000;

/**
 * Rounds of supplier placement. The deepest chain of section 7.2 is
 * oil -> chemicals -> plastics -> electronics, so four rounds always suffice.
 */
const MAX_REPAIR_ROUNDS = 4;

export interface Candidate {
  readonly x: number;
  readonly y: number;
}

/** All footprint tiles must be flat, dry, free and at the same height. */
function footprintFits(map: TileMap, spec: IndustrySpec, x: number, y: number): boolean {
  const size = spec.footprint;
  if (x < 1 || y < 1 || x + size >= map.size || y + size >= map.size) return false;

  const baseHeight = map.baseHeight(x, y);
  if (baseHeight < spec.placement.minHeight || baseHeight > spec.placement.maxHeight) return false;

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const index = map.tileIndex(tx, ty);

      if (map.terrain[index] === Terrain.Water) return false;
      if (map.townId[index] !== -1) return false;
      if (map.industryId[index] !== -1) return false;
      if (map.roadBits[index] !== 0) return false;
      if (map.slopeAt(tx, ty) !== 0) return false;
      if (map.baseHeight(tx, ty) !== baseHeight) return false;
      if (!spec.placement.terrains.includes(map.terrain[index]!)) return false;
    }
  }
  return true;
}

/** Is the required neighbouring terrain within reach? */
function nearTerrainSatisfied(map: TileMap, spec: IndustrySpec, x: number, y: number): boolean {
  const rule = spec.placement.nearTerrain;
  if (rule === undefined) return true;

  const radius = rule.maxDistance;
  for (let dy = -radius; dy <= radius; dy++) {
    const ty = y + dy;
    if (ty < 0 || ty >= map.size) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= map.size) continue;
      if (map.terrain[map.tileIndex(tx, ty)] === rule.terrain) return true;
    }
  }
  return false;
}

function nearTownSatisfied(
  spec: IndustrySpec,
  towns: readonly Town[],
  x: number,
  y: number,
): boolean {
  const maxDistance = spec.placement.nearTownDistance;
  if (maxDistance === undefined) return true;

  const limitSq = maxDistance * maxDistance;
  for (let i = 0; i < towns.length; i++) {
    const town = towns[i]!;
    const dx = town.x - x;
    const dy = town.y - y;
    if (dx * dx + dy * dy <= limitSq) return true;
  }
  return false;
}

function farEnoughFromOthers(placed: readonly Industry[], x: number, y: number): boolean {
  const limitSq = INDUSTRY_MIN_DISTANCE * INDUSTRY_MIN_DISTANCE;
  for (let i = 0; i < placed.length; i++) {
    const other = placed[i]!;
    // A works that has closed gave its ground back; it must not go on
    // reserving eight tiles around a hole in the map.
    if (!other.open) continue;
    const dx = other.x - x;
    const dy = other.y - y;
    if (dx * dx + dy * dy < limitSq) return false;
  }
  return true;
}

/** Search a valid spot for one industry type. Returns null if none was found. */
export function findSpot(
  map: TileMap,
  rng: Rng,
  spec: IndustrySpec,
  towns: readonly Town[],
  placed: readonly Industry[],
  attempts: number,
  requiredLandmass: number,
  /**
   * Extra condition the caller cares about. Runtime openings use it to prefer
   * ground no station reaches yet (section 7.3); the generator passes none.
   */
  accept?: (x: number, y: number) => boolean,
): Candidate | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const x = rng.nextInt(map.size);
    const y = rng.nextInt(map.size);

    if (!footprintFits(map, spec, x, y)) continue;
    if (requiredLandmass !== -1 && map.landmassId[map.tileIndex(x, y)] !== requiredLandmass) {
      continue;
    }
    if (!nearTerrainSatisfied(map, spec, x, y)) continue;
    if (!nearTownSatisfied(spec, towns, x, y)) continue;
    if (!farEnoughFromOthers(placed, x, y)) continue;
    if (accept !== undefined && !accept(x, y)) continue;
    return { x, y };
  }
  return null;
}

/** Reserve the footprint tiles for an industry. */
export function occupy(map: TileMap, industry: Industry): void {
  const spec = industrySpec(industry.type);
  for (let dy = 0; dy < spec.footprint; dy++) {
    for (let dx = 0; dx < spec.footprint; dx++) {
      const index = map.tileIndex(industry.x + dx, industry.y + dy);
      map.industryId[index] = industry.id;
      map.terrain[index] = Terrain.TownGround;
    }
  }
}

/** Give the footprint back to open country. */
export function release(map: TileMap, industry: Industry): void {
  const spec = industrySpec(industry.type);
  for (let dy = 0; dy < spec.footprint; dy++) {
    for (let dx = 0; dx < spec.footprint; dx++) {
      const index = map.tileIndex(industry.x + dx, industry.y + dy);
      map.industryId[index] = -1;
      map.terrain[index] = Terrain.Grass;
    }
  }
}

/** Cumulative weight table so a type can be drawn in one random step. */
export function buildWeightTable(): {
  types: IndustryType[];
  cumulative: number[];
  total: number;
} {
  const types: IndustryType[] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (const spec of INDUSTRY_SPECS) {
    total += spec.weight;
    types.push(spec.type);
    cumulative.push(total);
  }
  return { types, cumulative, total };
}

export function drawType(rng: Rng, table: ReturnType<typeof buildWeightTable>): IndustryType {
  const roll = rng.nextInt(table.total);
  for (let i = 0; i < table.cumulative.length; i++) {
    if (roll < table.cumulative[i]!) return table.types[i]!;
  }
  return table.types[table.types.length - 1]!;
}

/** Which industry types produce a given cargo. */
function producersOf(cargo: Cargo): IndustryType[] {
  const result: IndustryType[] = [];
  for (const spec of INDUSTRY_SPECS) {
    if (spec.outputs.includes(cargo)) result.push(spec.type);
  }
  return result;
}

/** Is `cargo` produced anywhere on `landmassId`? */
function hasSupplier(placed: readonly Industry[], landmassId: number, cargo: Cargo): boolean {
  for (let i = 0; i < placed.length; i++) {
    const other = placed[i]!;
    if (other.landmassId !== landmassId) continue;
    if (industrySpec(other.type).outputs.includes(cargo)) return true;
  }
  return false;
}

/**
 * Make sure every consumer can be supplied on its own land mass.
 *
 * Two phases, and both have to be run to a fixed point: a supplier added for
 * one factory may need supplying itself, and a supplier that has to be removed
 * again can strand a factory that was already checked. Phase 2 only ever
 * removes, so it terminates; the recipe graph of section 7.2 is acyclic, so
 * phase 1 terminates after at most as many rounds as the deepest chain.
 */
function repairChains(
  map: TileMap,
  rng: Rng,
  towns: readonly Town[],
  placed: Industry[],
): Industry[] {
  let nextId = placed.length;

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    let addedAny = false;

    for (let i = 0; i < placed.length; i++) {
      const consumer = placed[i]!;
      for (const input of industrySpec(consumer.type).inputs) {
        if (hasSupplier(placed, consumer.landmassId, input)) continue;

        for (const producerType of producersOf(input)) {
          const spot = findSpot(
            map,
            rng,
            industrySpec(producerType),
            towns,
            placed,
            REPAIR_ATTEMPTS,
            consumer.landmassId,
          );
          if (spot === null) continue;

          const industry: Industry = newIndustry(
            nextId++,
            producerType,
            spot.x,
            spot.y,
            consumer.landmassId,
          );
          placed.push(industry);
          occupy(map, industry);
          addedAny = true;
          break;
        }
      }
    }

    if (!addedAny) break;
  }

  for (;;) {
    let removedAny = false;
    for (let i = 0; i < placed.length; i++) {
      const consumer = placed[i]!;
      let unsupplied = false;
      for (const input of industrySpec(consumer.type).inputs) {
        if (!hasSupplier(placed, consumer.landmassId, input)) {
          unsupplied = true;
          break;
        }
      }
      if (!unsupplied) continue;

      // A factory that can never receive its inputs is not a challenge, it is
      // scenery that misleads the player. Take it off the map.
      release(map, consumer);
      placed.splice(i, 1);
      i--;
      removedAny = true;
    }
    if (!removedAny) break;
  }

  // Ids must stay dense because the tile layer references them by index.
  const compacted: Industry[] = [];
  for (let i = 0; i < placed.length; i++) {
    const industry: Industry = { ...placed[i]!, id: i };
    compacted.push(industry);
    occupy(map, industry);
  }
  return compacted;
}

/** Place all industries of the map. */
export function generateIndustries(map: TileMap, rng: Rng, towns: readonly Town[]): Industry[] {
  const wanted = Math.max(1, Math.round(map.tileCount / TILES_PER_INDUSTRY));
  const table = buildWeightTable();
  const placed: Industry[] = [];

  for (let i = 0; i < wanted; i++) {
    const type = drawType(rng, table);
    const spec = industrySpec(type);
    const spot = findSpot(map, rng, spec, towns, placed, PLACEMENT_ATTEMPTS_PER_INDUSTRY, -1);
    if (spot === null) continue;

    const industry: Industry = newIndustry(
      placed.length,
      type,
      spot.x,
      spot.y,
      map.landmassId[map.tileIndex(spot.x, spot.y)]!,
    );
    placed.push(industry);
    occupy(map, industry);
  }

  return repairChains(map, rng, towns, placed);
}
