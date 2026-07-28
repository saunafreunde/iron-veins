import { MAX_WATER_SEARCH_NODES } from '../constants';
import type { TileMap } from '../map/TileMap';
import { Terrain } from '../map/terrain';

/**
 * A* over water for ships (section 8.4).
 *
 * Deliberately the same shape as `RoadPathfinder`: dense per-tile workspaces
 * sized once, a stamp counter instead of clearing them, a hand-rolled binary
 * heap with a total comparator. The only real difference is what counts as
 * passable and that a ship may move diagonally - open water has no lanes.
 *
 * Section 8.4 asks for a precomputed flow field per port, rebuilt when a port is
 * built. That is an optimisation for many ships sharing few ports and it is not
 * built here: plain A* is the very algorithm the road vehicles already run, over
 * a graph of the same size, and a second mechanism would have to be kept correct
 * against every terraform that moves a shoreline. If ship counts ever make it
 * necessary the search below is the thing to replace, not to wrap
 * (DECISIONS.md D-094).
 *
 * A ship may sail up a river, because a river IS water by the map's own
 * definition and nothing distinguishes it from the sea. That is a consequence
 * of the map model rather than a decision made here, and it is a pleasant one -
 * an inland port on a wide river is a thing players build.
 */

/** Eight directions: open water has no carriageway. */
const DELTA_X = [0, 1, 1, 1, 0, -1, -1, -1] as const;
const DELTA_Y = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

/** Cost of one step; the diagonals really are longer. */
const STEP_COST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2] as const;

export class WaterPathfinder {
  private readonly cameFrom: Int32Array;
  private readonly gScore: Float32Array;
  private readonly closed: Uint8Array;
  private readonly visitStamp: Int32Array;
  private readonly heapTiles: Int32Array;
  private readonly heapScores: Float32Array;
  private heapSize = 0;
  private stamp = 0;

  constructor(tileCount: number) {
    this.cameFrom = new Int32Array(tileCount);
    this.gScore = new Float32Array(tileCount);
    this.closed = new Uint8Array(tileCount);
    this.visitStamp = new Int32Array(tileCount).fill(-1);
    this.heapTiles = new Int32Array(tileCount);
    this.heapScores = new Float32Array(tileCount);
  }

  private push(tile: number, score: number): void {
    let index = this.heapSize++;
    this.heapTiles[index] = tile;
    this.heapScores[index] = score;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private pop(): number {
    const top = this.heapTiles[0]!;
    this.heapSize--;
    if (this.heapSize > 0) {
      this.heapTiles[0] = this.heapTiles[this.heapSize]!;
      this.heapScores[0] = this.heapScores[this.heapSize]!;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;
        if (left < this.heapSize && this.less(left, best)) best = left;
        if (right < this.heapSize && this.less(right, best)) best = right;
        if (best === index) break;
        this.swap(index, best);
        index = best;
      }
    }
    return top;
  }

  /** Total order: score, then tile index, so ties cannot depend on heap order. */
  private less(a: number, b: number): boolean {
    const scoreA = this.heapScores[a]!;
    const scoreB = this.heapScores[b]!;
    if (scoreA !== scoreB) return scoreA < scoreB;
    return this.heapTiles[a]! < this.heapTiles[b]!;
  }

  private swap(a: number, b: number): void {
    const tile = this.heapTiles[a]!;
    this.heapTiles[a] = this.heapTiles[b]!;
    this.heapTiles[b] = tile;
    const score = this.heapScores[a]!;
    this.heapScores[a] = this.heapScores[b]!;
    this.heapScores[b] = score;
  }

  /**
   * Shortest way over water from `fromTile` to `toTile`.
   *
   * Both ends are allowed to be a quay - a station tile that is water - and the
   * search itself never leaves the water, so a ship cannot be routed across a
   * beach however short the cut would be.
   */
  find(map: TileMap, fromTile: number, toTile: number, out: Int32Array): number {
    if (fromTile === toTile) {
      out[0] = fromTile;
      return 1;
    }
    if (map.terrain[fromTile] !== Terrain.Water || map.terrain[toTile] !== Terrain.Water) return 0;

    const size = map.size;
    const stamp = ++this.stamp;
    this.heapSize = 0;

    const targetX = toTile % size;
    const targetY = (toTile / size) | 0;

    this.visitStamp[fromTile] = stamp;
    this.gScore[fromTile] = 0;
    this.cameFrom[fromTile] = -1;
    this.closed[fromTile] = 0;
    this.push(fromTile, 0);

    let expanded = 0;
    while (this.heapSize > 0 && expanded < MAX_WATER_SEARCH_NODES) {
      const tile = this.pop();
      if (this.closed[tile] === 1 && this.visitStamp[tile] === stamp) continue;
      this.closed[tile] = 1;
      expanded++;
      if (tile === toTile) return this.reconstruct(tile, out);

      const x = tile % size;
      const y = (tile / size) | 0;
      const cost = this.gScore[tile]!;

      for (let direction = 0; direction < 8; direction++) {
        const nx = x + DELTA_X[direction]!;
        const ny = y + DELTA_Y[direction]!;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;

        const neighbour = ny * size + nx;
        if (map.terrain[neighbour] !== Terrain.Water) continue;
        // A diagonal between two land corners is a ship cutting a headland; it
        // has to be able to get its beam through.
        if (direction % 2 === 1) {
          if (map.terrain[y * size + nx] !== Terrain.Water) continue;
          if (map.terrain[ny * size + x] !== Terrain.Water) continue;
        }

        const tentative = cost + STEP_COST[direction]!;
        if (this.visitStamp[neighbour] === stamp && tentative >= this.gScore[neighbour]!) continue;

        this.visitStamp[neighbour] = stamp;
        this.gScore[neighbour] = tentative;
        this.cameFrom[neighbour] = tile;
        this.closed[neighbour] = 0;

        // Octile distance: the exact cost of the best unobstructed run, so the
        // heuristic never overestimates and A* stays admissible.
        const dx = Math.abs(targetX - nx);
        const dy = Math.abs(targetY - ny);
        const low = dx < dy ? dx : dy;
        const high = dx < dy ? dy : dx;
        this.push(neighbour, tentative + (high - low) + Math.SQRT2 * low);
      }
    }
    return 0;
  }

  private reconstruct(target: number, out: Int32Array): number {
    let length = 0;
    let tile = target;
    while (tile !== -1) {
      length++;
      tile = this.cameFrom[tile]!;
    }
    if (length > out.length) return 0;

    let index = length - 1;
    tile = target;
    while (tile !== -1) {
      out[index--] = tile;
      tile = this.cameFrom[tile]!;
    }
    return length;
  }
}
