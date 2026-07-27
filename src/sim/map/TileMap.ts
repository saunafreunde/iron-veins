import { MAX_HEIGHT, SEA_LEVEL } from '../constants';
import { SlopeBit, Terrain } from './terrain';

/**
 * All per-tile data of the world, kept as parallel typed arrays.
 *
 * Architecture law #7: never a million JavaScript objects. At 1024 x 1024 every
 * byte-per-tile layer costs exactly 1 MB, which is why layers are added
 * deliberately and derived data (landmass ids, ocean mask) is recomputed after
 * loading instead of being stored.
 */
export class TileMap {
  /** Edge length in tiles. */
  readonly size: number;

  /** Corner heights on a (size+1)^2 grid, 0..15. */
  readonly cornerHeight: Uint8Array;

  /** Terrain type per tile, see {@link Terrain}. */
  readonly terrain: Uint8Array;

  /** Road direction bits per tile (added in M2, zero until then). */
  readonly roadBits: Uint8Array;

  /** Town that owns this tile, -1 for open country. */
  readonly townId: Int16Array;

  /** Industry that occupies this tile, -1 for none. */
  readonly industryId: Int16Array;

  /** Building zone on this tile: 0 none, 1 residential, 2 commercial, 3 industrial. */
  readonly buildingKind: Uint8Array;

  /** Building expansion stage, 0 when there is no building. */
  readonly buildingLevel: Uint8Array;

  /**
   * Connected land component per tile, -1 for water. Derived - recomputed on
   * load rather than serialised.
   */
  readonly landmassId: Int32Array;

  /** 1 for water connected to the map border, 0 for inland lakes. Derived. */
  readonly oceanMask: Uint8Array;

  constructor(size: number) {
    this.size = size;
    const tiles = size * size;
    const corners = (size + 1) * (size + 1);

    this.cornerHeight = new Uint8Array(corners);
    // Terrain.Water is 0, so a zero-filled array would be an all-sea world and
    // every later step that skips water would skip everything. A fresh map is
    // flat grassland until the hydrology step floods it.
    this.terrain = new Uint8Array(tiles).fill(Terrain.Grass);
    this.roadBits = new Uint8Array(tiles);
    this.townId = new Int16Array(tiles).fill(-1);
    this.industryId = new Int16Array(tiles).fill(-1);
    this.buildingKind = new Uint8Array(tiles);
    this.buildingLevel = new Uint8Array(tiles);
    this.landmassId = new Int32Array(tiles).fill(-1);
    this.oceanMask = new Uint8Array(tiles);
  }

  get tileCount(): number {
    return this.size * this.size;
  }

  /** Index into the tile layers. Caller guarantees the coordinates are valid. */
  tileIndex(x: number, y: number): number {
    return y * this.size + x;
  }

  /** Index into {@link cornerHeight}. Valid for 0..size inclusive. */
  cornerIndex(x: number, y: number): number {
    return y * (this.size + 1) + x;
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  /** Height of the tile's north corner. */
  heightAt(x: number, y: number): number {
    return this.cornerHeight[this.cornerIndex(x, y)]!;
  }

  /** Lowest of the four corners - the height the tile "stands" at. */
  baseHeight(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    return Math.min(Math.min(n, e), Math.min(w, s));
  }

  /** Highest of the four corners. */
  topHeight(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    return Math.max(Math.max(n, e), Math.max(w, s));
  }

  /**
   * Slope bits of a tile, relative to its base height. Relies on the invariant
   * that no corner is more than one level above the base.
   */
  slopeAt(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    const base = Math.min(Math.min(n, e), Math.min(w, s));

    let slope = 0;
    if (n > base) slope |= SlopeBit.North;
    if (e > base) slope |= SlopeBit.East;
    if (s > base) slope |= SlopeBit.South;
    if (w > base) slope |= SlopeBit.West;
    return slope;
  }

  /** A tile is water when even its highest corner is at or below the sea. */
  isSubmerged(x: number, y: number): boolean {
    return this.topHeight(x, y) <= SEA_LEVEL;
  }

  isWater(x: number, y: number): boolean {
    return this.terrain[this.tileIndex(x, y)] === Terrain.Water;
  }

  isLand(x: number, y: number): boolean {
    return this.terrain[this.tileIndex(x, y)] !== Terrain.Water;
  }

  /**
   * Restore the invariant that neighbouring corners - including diagonal ones -
   * never differ by more than one level. Any two corners of a tile lie within
   * each other's eight-neighbourhood, so this also guarantees that every tile
   * has one of the 16 representable slopes.
   *
   * Returns the number of corners that had to be lowered.
   */
  enforceSlopeInvariant(): number {
    const stride = this.size + 1;
    const heights = this.cornerHeight;
    let totalChanged = 0;
    let changed = true;

    // Each pass can only lower corners, and heights are bounded by MAX_HEIGHT,
    // so the loop terminates after at most MAX_HEIGHT rounds.
    while (changed) {
      changed = false;
      for (let y = 0; y <= this.size; y++) {
        for (let x = 0; x <= this.size; x++) {
          const i = y * stride + x;
          const h = heights[i]!;
          if (h === 0) continue;

          let lowest = MAX_HEIGHT;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny > this.size) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx > this.size || (dx === 0 && dy === 0)) continue;
              const nh = heights[ny * stride + nx]!;
              if (nh < lowest) lowest = nh;
            }
          }

          if (h > lowest + 1) {
            heights[i] = lowest + 1;
            totalChanged++;
            changed = true;
          }
        }
      }
    }
    return totalChanged;
  }
}
