import {
  EROSION_PASSES,
  MAPGEN_MAX_SEED_RETRIES,
  START_PAIR_MAX_DISTANCE,
  START_PAIR_MIN_DISTANCE,
  type MapClimate,
} from '../constants';
import type { Industry } from '../industry/types';
import { TileMap } from '../map/TileMap';
import { Rng } from '../rng';
import type { Town } from '../town/types';
import { assignBiomes } from './climate';
import { generateRelief } from './heightfield';
import { applyHeightmapRelief, type ReliefImport } from './heightmap';
import {
  computeLandmasses,
  floodSeaLevel,
  generateRivers,
  markCoast,
  markOcean,
} from './hydrology';
import { generateIndustries } from './industries';
import { generateTowns } from './towns';

/**
 * Orchestrates section 6. The order of the steps is part of the contract:
 * hydrology decides what counts as land, land masses are what the industry
 * reachability check runs on, and towns claim ground before industries look
 * for a spot.
 */

export const MapGenPhase = {
  Relief: 0,
  Water: 1,
  Rivers: 2,
  Climate: 3,
  Towns: 4,
  Industries: 5,
  Validate: 6,
} as const;
export type MapGenPhase = (typeof MapGenPhase)[keyof typeof MapGenPhase];

export const MAPGEN_PHASE_COUNT = 7;

/** Progress reporting so the UI can show something during the eight seconds. */
export type MapGenProgress = (phase: MapGenPhase, seedAttempt: number) => void;

export interface MapGenParams {
  readonly size: number;
  readonly seed: number;
  readonly climate: MapClimate;
  /** Lower values make generation faster; only tests change this. */
  readonly erosionPasses?: number;
  /**
   * A relief the author imported instead of one the seed drew (SPEC2 M22).
   *
   * It replaces step 1 of section 6 and NOTHING else: water, rivers, climate,
   * towns and industries are the seed's work on the imported ground, which is
   * what makes an imported map a map this game can play rather than a picture
   * with nothing on it. Absent means the noise field, i.e. every world before
   * this milestone.
   */
  readonly relief?: ReliefImport;
}

export interface GeneratedWorld {
  readonly map: TileMap;
  readonly towns: Town[];
  readonly industries: Industry[];
  /** The seed that actually produced this map - may differ after a retry. */
  readonly seedUsed: number;
}

export class MapGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapGenerationError';
  }
}

/**
 * A map is only playable if the player can start somewhere: two towns on the
 * same land mass, far enough apart to be worth connecting and close enough to
 * afford. Without this check roughly one seed in ten produces an archipelago
 * of isolated villages.
 */
export function findStartingPair(
  map: TileMap,
  towns: readonly Town[],
): { readonly a: number; readonly b: number } | null {
  const minSq = START_PAIR_MIN_DISTANCE * START_PAIR_MIN_DISTANCE;
  const maxSq = START_PAIR_MAX_DISTANCE * START_PAIR_MAX_DISTANCE;

  for (let i = 0; i < towns.length; i++) {
    const a = towns[i]!;
    const landmassA = map.landmassId[map.tileIndex(a.x, a.y)]!;
    if (landmassA === -1) continue;

    for (let j = i + 1; j < towns.length; j++) {
      const b = towns[j]!;
      if (map.landmassId[map.tileIndex(b.x, b.y)] !== landmassA) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= minSq && distanceSq <= maxSq) return { a: i, b: j };
    }
  }
  return null;
}

function generateOnce(
  params: MapGenParams,
  seed: number,
  report: MapGenProgress | null,
  importedRelief: Uint8Array | null,
): {
  world: GeneratedWorld;
  playable: boolean;
} {
  const rng = Rng.fromSeed(seed);
  const map = new TileMap(params.size);
  const attempt = seed - params.seed;

  report?.(MapGenPhase.Relief, attempt);
  if (importedRelief !== null) {
    // The imported chain ran once, in `generateMap`. A retry changes the SEED,
    // and the seed has nothing to do with an imported relief - re-eroding a
    // million corners per attempt would be the same answer at twenty times the
    // price, on the one path that has an eight-second promise over it.
    map.cornerHeight.set(importedRelief);
  } else {
    generateRelief(map, rng, params.erosionPasses ?? EROSION_PASSES);
  }

  report?.(MapGenPhase.Water, attempt);
  floodSeaLevel(map);

  report?.(MapGenPhase.Rivers, attempt);
  generateRivers(map, rng);
  markOcean(map);
  computeLandmasses(map);

  report?.(MapGenPhase.Climate, attempt);
  assignBiomes(map, rng, params.climate);
  markCoast(map);

  report?.(MapGenPhase.Towns, attempt);
  const towns = generateTowns(map, rng);

  report?.(MapGenPhase.Industries, attempt);
  const industries = generateIndustries(map, rng, towns);

  report?.(MapGenPhase.Validate, attempt);
  const playable = findStartingPair(map, towns) !== null;

  return { world: { map, towns, industries, seedUsed: seed }, playable };
}

/**
 * Generate a playable map. Unplayable seeds are retried with seed + 1 rather
 * than with a fresh random number, so the whole result stays a pure function of
 * the seed the player typed in.
 */
export function generateMap(
  params: MapGenParams,
  report: MapGenProgress | null = null,
): GeneratedWorld {
  let importedRelief: Uint8Array | null = null;
  if (params.relief !== undefined) {
    const scratch = new TileMap(params.size);
    applyHeightmapRelief(scratch, params.relief, params.erosionPasses ?? EROSION_PASSES);
    importedRelief = new Uint8Array(scratch.cornerHeight);
  }

  for (let attempt = 0; attempt < MAPGEN_MAX_SEED_RETRIES; attempt++) {
    const result = generateOnce(params, (params.seed + attempt) | 0, report, importedRelief);
    if (result.playable) return result.world;
  }
  throw new MapGenerationError(
    `No playable map found for seed ${params.seed} after ${MAPGEN_MAX_SEED_RETRIES} attempts. ` +
      'Try a different seed or a larger map.',
  );
}
