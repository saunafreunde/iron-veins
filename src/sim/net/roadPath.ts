import type { TileMap } from '../map/TileMap';
import { slopeRise } from '../map/terrain';
import { RoadBit } from '../town/types';

/**
 * A* over the road tile grid.
 *
 * Iterative with an explicit binary heap (architecture law #8), and every
 * comparison falls back to the tile index so the result cannot depend on
 * insertion order (failure #14). All working arrays are allocated once and
 * reused, because pathfinding runs whenever a vehicle reaches a station.
 */

/** Search is abandoned beyond this many expanded nodes. */
const MAX_EXPANDED = 20_000;

/** Extra cost of climbing a slope, in tile equivalents. */
const SLOPE_PENALTY = 1.5;

/** Bit that connects a tile to its neighbour, indexed by direction. */
const CONNECT_BITS = [RoadBit.West, RoadBit.East, RoadBit.North, RoadBit.South];
const OPPOSITE_BITS = [RoadBit.East, RoadBit.West, RoadBit.South, RoadBit.North];
const DELTA_X = [-1, 1, 0, 0];
const DELTA_Y = [0, 0, -1, 1];

/**
 * Reusable A* workspace. One instance per caller keeps the search allocation
 * free; the simulation owns a single shared one.
 */
export class RoadPathfinder {
  private readonly cameFrom: Int32Array;
  private readonly gScore: Float32Array;
  private readonly closed: Uint8Array;
  private readonly heapTiles: Int32Array;
  private readonly heapScores: Float32Array;
  private heapSize = 0;
  /** Bumped per search so the score arrays need no clearing. */
  private readonly visitStamp: Int32Array;
  private stamp = 0;

  constructor(tileCount: number) {
    this.cameFrom = new Int32Array(tileCount);
    this.gScore = new Float32Array(tileCount);
    this.closed = new Uint8Array(tileCount);
    this.visitStamp = new Int32Array(tileCount).fill(-1);
    this.heapTiles = new Int32Array(tileCount + 1);
    this.heapScores = new Float32Array(tileCount + 1);
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
        let smallest = index;
        if (left < this.heapSize && this.less(left, smallest)) smallest = left;
        if (right < this.heapSize && this.less(right, smallest)) smallest = right;
        if (smallest === index) break;
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  /** Total order: score first, tile index as the tie breaker. */
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
   * Find a road route from `fromTile` to `toTile`, writing the tile sequence
   * into `out` (start tile first). Returns the number of tiles written, or 0
   * when there is no route.
   */
  find(map: TileMap, fromTile: number, toTile: number, out: Int32Array): number {
    if (fromTile === toTile) {
      out[0] = fromTile;
      return 1;
    }
    if (map.roadBits[fromTile] === 0 || map.roadBits[toTile] === 0) return 0;

    const size = map.size;
    const stamp = ++this.stamp;
    const targetX = toTile % size;
    const targetY = (toTile / size) | 0;

    this.heapSize = 0;
    this.visitStamp[fromTile] = stamp;
    this.gScore[fromTile] = 0;
    this.cameFrom[fromTile] = -1;
    this.closed[fromTile] = 0;
    this.push(fromTile, 0);

    let expanded = 0;
    while (this.heapSize > 0 && expanded < MAX_EXPANDED) {
      const current = this.pop();
      if (current === toTile) return this.reconstruct(current, out);
      if (this.closed[current] === 1 && this.visitStamp[current] === stamp) continue;
      this.closed[current] = 1;
      expanded++;

      const x = current % size;
      const y = (current / size) | 0;
      const bits = map.roadBits[current]!;

      for (let direction = 0; direction < 4; direction++) {
        if ((bits & CONNECT_BITS[direction]!) === 0) continue;

        const nx = x + DELTA_X[direction]!;
        const ny = y + DELTA_Y[direction]!;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;

        const neighbour = ny * size + nx;
        // Roads are only passable when both sides carry the connection.
        if ((map.roadBits[neighbour]! & OPPOSITE_BITS[direction]!) === 0) continue;

        const step = 1 + slopeRise(map.slopeAt(nx, ny)) * SLOPE_PENALTY;
        const tentative = this.gScore[current]! + step;

        const seen = this.visitStamp[neighbour] === stamp;
        if (seen && tentative >= this.gScore[neighbour]!) continue;

        this.visitStamp[neighbour] = stamp;
        this.gScore[neighbour] = tentative;
        this.cameFrom[neighbour] = current;
        this.closed[neighbour] = 0;

        const heuristic = Math.abs(nx - targetX) + Math.abs(ny - targetY);
        this.push(neighbour, tentative + heuristic);
      }
    }
    return 0;
  }

  private reconstruct(target: number, out: Int32Array): number {
    let length = 0;
    let node = target;
    while (node !== -1) {
      length++;
      node = this.cameFrom[node]!;
    }
    if (length > out.length) return 0;

    let index = length - 1;
    node = target;
    while (node !== -1) {
      out[index--] = node;
      node = this.cameFrom[node]!;
    }
    return length;
  }
}
