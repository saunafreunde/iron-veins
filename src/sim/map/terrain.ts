/**
 * Terrain vocabulary and the slope model.
 *
 * Heights are stored per CORNER on a (size+1)^2 grid; a tile owns the four
 * corners around it. That is what makes slopes well defined without special
 * casing the map border, and it is the reason the height array is one row and
 * one column larger than every other layer.
 *
 *        N (x, y)
 *       /        \
 *   W (x, y+1)   E (x+1, y)
 *       \        /
 *        S (x+1, y+1)
 *
 * The screen projection puts +x towards the lower right and +y towards the
 * lower left, so the corner named N really is the topmost one on screen.
 */

export const Terrain = {
  Water: 0,
  Coast: 1,
  Grass: 2,
  Field: 3,
  Forest: 4,
  Rock: 5,
  Snow: 6,
  Desert: 7,
  Marsh: 8,
  TownGround: 9,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_COUNT = 10;

/** Translation keys, one per terrain type, indexed by the value above. */
export const TERRAIN_NAME_KEYS: readonly string[] = [
  'terrain.water',
  'terrain.coast',
  'terrain.grass',
  'terrain.field',
  'terrain.forest',
  'terrain.rock',
  'terrain.snow',
  'terrain.desert',
  'terrain.marsh',
  'terrain.townGround',
];

/** True for terrain that cannot carry roads, rails or buildings. */
export function isWaterTerrain(terrain: number): boolean {
  return terrain === Terrain.Water;
}

// ------------------------------------------------------------------- slopes

/** Corner bits of a slope. A set bit means "this corner sits one level high". */
export const SlopeBit = {
  North: 1,
  East: 2,
  South: 4,
  West: 8,
} as const;

/** A flat tile. */
export const SLOPE_FLAT = 0;

/**
 * Number of distinct slopes. Only 16 because the generator and the terraform
 * command maintain the invariant that no two corners of a tile differ by more
 * than one level - there are no steep slopes. Keeping that invariant costs one
 * smoothing pass and removes a whole class of special cases from rendering,
 * pathfinding and vehicle physics.
 */
export const SLOPE_COUNT = 16;

/** Slopes whose two raised corners face each other across the tile. */
export function isDiagonalSlope(slope: number): boolean {
  return slope === (SlopeBit.North | SlopeBit.South) || slope === (SlopeBit.East | SlopeBit.West);
}

/**
 * How much a tile with this slope rises along the north-east / south-west
 * diagonal, used for the gradient of roads and rails. Expressed in height
 * levels over the tile length.
 */
export function slopeRise(slope: number): number {
  const north = (slope & SlopeBit.North) !== 0 ? 1 : 0;
  const east = (slope & SlopeBit.East) !== 0 ? 1 : 0;
  const south = (slope & SlopeBit.South) !== 0 ? 1 : 0;
  const west = (slope & SlopeBit.West) !== 0 ? 1 : 0;
  const high = Math.max(north, east, south, west);
  const low = Math.min(north, east, south, west);
  return high - low;
}
