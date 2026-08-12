import {
  RIVER_SOURCE_MIN_HEIGHT,
  RIVER_SOURCES_MAX,
  RIVER_SOURCES_MIN,
  RIVER_WIDTH_2_CATCHMENT,
  RIVER_WIDTH_3_CATCHMENT,
  SEA_LEVEL,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { Terrain } from '../map/terrain';
import type { Rng } from '../rng';

/**
 * Steps 2 and 3 of section 6: sea, lakes, rivers and the connected land
 * components everything later depends on.
 *
 * NOTE ON RIVER CARVING - the specification asks for rivers to cut one height
 * level into the terrain. That is incompatible with the no-steep-slope
 * invariant (see src/sim/map/terrain.ts): lowering one corner forces every
 * corner that sits exactly one level above it to follow, and on a uniform
 * hillside that chain reaches the summit. One carved river would drop a whole
 * mountain range by a level, and two dozen of them would flatten the map.
 * Rivers therefore flow at the height of the valley that erosion already cut
 * for them, which produces the same picture without the landslide.
 */

/** Longest path a single river may take before it is abandoned. [tiles] */
const MAX_RIVER_LENGTH = 4096;

/** River sources keep at least this far apart so they do not braid. [tiles] */
const RIVER_SOURCE_SPACING = 16;

/** How many candidate tiles are inspected per requested source. */
const SOURCE_SEARCH_ATTEMPTS = 400;

/**
 * Raise local depressions until every land tile has a non-ascending way out.
 * Cheap iterative variant of Planchon-Darboux: with only 16 height levels it
 * converges in a handful of passes. Whatever is still a sink after the pass
 * limit simply becomes a lake, which is a perfectly good map feature.
 */
function fillSinks(map: TileMap): Uint8Array {
  const size = map.size;
  const filled = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) filled[y * size + x] = map.baseHeight(x, y);
  }

  const MAX_PASSES = 32;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        const height = filled[index]!;
        if (height <= SEA_LEVEL) continue;

        let lowest = 255;
        if (x > 0) lowest = Math.min(lowest, filled[index - 1]!);
        if (x < size - 1) lowest = Math.min(lowest, filled[index + 1]!);
        if (y > 0) lowest = Math.min(lowest, filled[index - size]!);
        if (y < size - 1) lowest = Math.min(lowest, filled[index + size]!);

        if (height < lowest) {
          filled[index] = lowest;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return filled;
}

/** Pick well separated high ground tiles to start rivers from. */
function chooseSources(map: TileMap, rng: Rng, wanted: number): number[] {
  const size = map.size;
  const sources: number[] = [];
  const attempts = wanted * SOURCE_SEARCH_ATTEMPTS;

  for (let attempt = 0; attempt < attempts && sources.length < wanted; attempt++) {
    const x = rng.nextInt(size);
    const y = rng.nextInt(size);
    if (map.baseHeight(x, y) < RIVER_SOURCE_MIN_HEIGHT) continue;

    let tooClose = false;
    for (let i = 0; i < sources.length; i++) {
      const other = sources[i]!;
      const dx = (other % size) - x;
      const dy = ((other / size) | 0) - y;
      if (dx * dx + dy * dy < RIVER_SOURCE_SPACING * RIVER_SOURCE_SPACING) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) sources.push(y * size + x);
  }
  return sources;
}

/**
 * Follow the steepest descent from every source to the sea, counting how many
 * rivers pass through each tile. The counter is the catchment that decides how
 * wide the river gets.
 */
function traceRivers(map: TileMap, filled: Uint8Array, sources: readonly number[]): Int32Array {
  const size = map.size;
  const catchment = new Int32Array(size * size);
  const visitStamp = new Int32Array(size * size).fill(-1);

  for (let riverIndex = 0; riverIndex < sources.length; riverIndex++) {
    let current = sources[riverIndex]!;

    for (let step = 0; step < MAX_RIVER_LENGTH; step++) {
      if (visitStamp[current] === riverIndex) break; // walked into our own path
      visitStamp[current] = riverIndex;
      catchment[current] = catchment[current]! + 1;

      const x = current % size;
      const y = (current / size) | 0;
      if (filled[current]! <= SEA_LEVEL) break; // reached the sea

      // Lowest neighbour wins; ties are broken by the untouched terrain height
      // and finally by tile index, so the choice never depends on iteration
      // order or floating point noise.
      let best = -1;
      let bestFilled = 255;
      let bestRaw = 255;
      for (let direction = 0; direction < 4; direction++) {
        const nx = x + (direction === 0 ? -1 : direction === 1 ? 1 : 0);
        const ny = y + (direction === 2 ? -1 : direction === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;

        const neighbour = ny * size + nx;
        const neighbourFilled = filled[neighbour]!;
        const neighbourRaw = map.baseHeight(nx, ny);
        if (
          neighbourFilled < bestFilled ||
          (neighbourFilled === bestFilled && neighbourRaw < bestRaw)
        ) {
          best = neighbour;
          bestFilled = neighbourFilled;
          bestRaw = neighbourRaw;
        }
      }

      if (best === -1 || bestFilled > filled[current]!) break; // dead end: a lake
      current = best;
    }
  }
  return catchment;
}

/** Turn the traced paths into water tiles, widening them by catchment. */
function applyRivers(map: TileMap, catchment: Int32Array): number {
  const size = map.size;
  const terrain = map.terrain;
  let riverTiles = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const flow = catchment[index]!;
      if (flow === 0) continue;

      if (terrain[index] !== Terrain.Water) {
        terrain[index] = Terrain.Water;
        riverTiles++;
      }
      if (flow < RIVER_WIDTH_2_CATCHMENT) continue;

      // Widen perpendicular to the flow by flooding the immediate neighbours
      // that are not uphill; wide rivers take all four.
      const wide = flow >= RIVER_WIDTH_3_CATCHMENT;
      const height = map.baseHeight(x, y);
      for (let direction = 0; direction < 4; direction++) {
        if (!wide && direction > 1) break;
        const nx = x + (direction === 0 ? -1 : direction === 1 ? 1 : 0);
        const ny = y + (direction === 2 ? -1 : direction === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;

        const neighbour = ny * size + nx;
        if (terrain[neighbour] === Terrain.Water) continue;
        if (map.baseHeight(nx, ny) > height) continue;
        terrain[neighbour] = Terrain.Water;
        riverTiles++;
      }
    }
  }
  return riverTiles;
}

/** Mark every tile whose highest corner is at or below the sea as water. */
export function floodSeaLevel(map: TileMap): void {
  const size = map.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (map.isSubmerged(x, y)) map.terrain[y * size + x] = Terrain.Water;
    }
  }
}

/**
 * Flag the water that is connected to the map border. Everything else is an
 * inland lake - the distinction decides where harbours and offshore industries
 * may be built.
 */
export function markOcean(map: TileMap): void {
  const size = map.size;
  const ocean = map.oceanMask;
  const terrain = map.terrain;
  ocean.fill(0);

  // Iterative flood fill with an explicit stack (architecture law #8).
  const stack = new Int32Array(size * size);
  let top = 0;

  const push = (index: number): void => {
    if (terrain[index] !== Terrain.Water || ocean[index] === 1) return;
    ocean[index] = 1;
    stack[top++] = index;
  };

  for (let x = 0; x < size; x++) {
    push(x);
    push((size - 1) * size + x);
  }
  for (let y = 0; y < size; y++) {
    push(y * size);
    push(y * size + size - 1);
  }

  while (top > 0) {
    const index = stack[--top]!;
    const x = index % size;
    const y = (index / size) | 0;
    if (x > 0) push(index - 1);
    if (x < size - 1) push(index + 1);
    if (y > 0) push(index - size);
    if (y < size - 1) push(index + size);
  }
}

/**
 * Label connected land components. Two towns can only be linked by rail if they
 * share a label, which is what the start condition in section 6.7 checks.
 * Returns the number of components.
 */
export function computeLandmasses(map: TileMap): number {
  const size = map.size;
  const labels = map.landmassId;
  const terrain = map.terrain;
  labels.fill(-1);

  const stack = new Int32Array(size * size);
  let components = 0;

  for (let start = 0; start < labels.length; start++) {
    if (terrain[start] === Terrain.Water || labels[start] !== -1) continue;

    const label = components++;
    let top = 0;
    labels[start] = label;
    stack[top++] = start;

    while (top > 0) {
      const index = stack[--top]!;
      const x = index % size;
      const y = (index / size) | 0;

      if (x > 0 && terrain[index - 1] !== Terrain.Water && labels[index - 1] === -1) {
        labels[index - 1] = label;
        stack[top++] = index - 1;
      }
      if (x < size - 1 && terrain[index + 1] !== Terrain.Water && labels[index + 1] === -1) {
        labels[index + 1] = label;
        stack[top++] = index + 1;
      }
      if (y > 0 && terrain[index - size] !== Terrain.Water && labels[index - size] === -1) {
        labels[index - size] = label;
        stack[top++] = index - size;
      }
      if (y < size - 1 && terrain[index + size] !== Terrain.Water && labels[index + size] === -1) {
        labels[index + size] = label;
        stack[top++] = index + size;
      }
    }
  }
  return components;
}

/** Turn land tiles that touch water into coast. */
export function markCoast(map: TileMap): void {
  const size = map.size;
  const terrain = map.terrain;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      if (terrain[index] === Terrain.Water) continue;

      const touchesWater =
        (x > 0 && terrain[index - 1] === Terrain.Water) ||
        (x < size - 1 && terrain[index + 1] === Terrain.Water) ||
        (y > 0 && terrain[index - size] === Terrain.Water) ||
        (y < size - 1 && terrain[index + size] === Terrain.Water);

      if (touchesWater && map.baseHeight(x, y) <= SEA_LEVEL + 1) {
        terrain[index] = Terrain.Coast;
      }
    }
  }
}

/**
 * Cut rivers into the map. Returns how many tiles became river.
 *
 * `scale` is the river-count control of SPEC2 M23, and where it is applied is
 * the whole of its Z3 discipline: the source count is DRAWN exactly as it
 * always was - one roll of `RIVER_SOURCES_MIN..MAX` from the same stream at
 * the same position - and the factor multiplies the RESULT. A control that
 * changed how many words came out of the generator would fork every later
 * draw on the map, which is the stray-draw failure of Fehlerkatalog 25 wearing
 * a slider.
 */
export function generateRivers(map: TileMap, rng: Rng, scale = 1): number {
  const filled = fillSinks(map);
  const drawn = rng.nextRange(RIVER_SOURCES_MIN, RIVER_SOURCES_MAX);
  // `scale` is 1 at the neutral step, and `Math.round` of an integer is that
  // integer, so a neutral world asks for exactly the number it drew.
  const wanted = Math.max(1, Math.round(drawn * scale));
  const sources = chooseSources(map, rng, wanted);
  const catchment = traceRivers(map, filled, sources);
  return applyRivers(map, catchment);
}
