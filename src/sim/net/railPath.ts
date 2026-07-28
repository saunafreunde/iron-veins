import { MAX_RAIL_SEARCH_NODES, TILE_SIZE_M } from '../constants';
import type { TileMap } from '../map/TileMap';
import {
  curveRadiusM,
  curveSpeedMs,
  oppositeDir,
  RailType,
  RAIL_TYPE_SPEED_MS,
  stepLengthM,
  trackBit,
  TRACK_DIR_COUNT,
  TRACK_DX,
  TRACK_DY,
  turnSteps,
  type TrackDir,
} from '../map/track';

/**
 * A* for trains over the track graph (section 8.4).
 *
 * The state is (track tile, incoming direction), not just the tile: what a step
 * costs depends on where the train came from, because that is what decides
 * whether it is running straight through or taking a curve at 45 m radius. The
 * same reason the route assistant of M3 needs it - only here the cost is in
 * seconds rather than in metres, since a train picks the FASTEST way and not
 * the shortest one.
 *
 * The workspace is indexed by track tiles rather than by map tiles. Eight
 * states for each of a million tiles would be a hundred megabytes for a search
 * that touches a few thousand of them; the rail network is a thin graph laid
 * over the map and deserves to be stored as one.
 */

/** Cost of a step the search cannot take. */
const IMPASSABLE = -1;

export class RailPathfinder {
  /** Dense node id per map tile, -1 where there is no track. */
  private readonly nodeOf: Int32Array;
  /** Map tile per dense node id. */
  private tileOf = new Int32Array(0);
  private indexedRevision = -1;

  private gScore = new Float32Array(0);
  private cameFrom = new Int32Array(0);
  private visitStamp = new Int32Array(0);
  private closed = new Uint8Array(0);
  private heapStates = new Int32Array(0);
  private heapScores = new Float32Array(0);
  private heapSize = 0;
  private stamp = 0;

  constructor(tileCount: number) {
    this.nodeOf = new Int32Array(tileCount).fill(-1);
  }

  /**
   * Rebuild the dense track index. Runs when the map revision moved on, which
   * is a player action - never inside a tick that only moves vehicles.
   */
  private reindex(map: TileMap): void {
    if (this.indexedRevision === map.revision) return;
    this.indexedRevision = map.revision;
    this.nodeOf.fill(-1);

    let count = 0;
    for (let tile = 0; tile < map.trackBits.length; tile++) {
      if (map.trackBits[tile] !== 0) count++;
    }

    if (this.tileOf.length < count) this.tileOf = new Int32Array(count);
    let node = 0;
    for (let tile = 0; tile < map.trackBits.length; tile++) {
      if (map.trackBits[tile] === 0) continue;
      this.nodeOf[tile] = node;
      this.tileOf[node] = tile;
      node++;
    }

    const states = count * TRACK_DIR_COUNT;
    if (this.gScore.length < states) {
      this.gScore = new Float32Array(states);
      this.cameFrom = new Int32Array(states);
      this.visitStamp = new Int32Array(states).fill(-1);
      this.closed = new Uint8Array(states);
      this.heapStates = new Int32Array(states);
      this.heapScores = new Float32Array(states);
    }
  }

  private push(state: number, score: number): void {
    let index = this.heapSize++;
    this.heapStates[index] = state;
    this.heapScores[index] = score;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private pop(): number {
    const top = this.heapStates[0]!;
    this.heapSize--;
    if (this.heapSize > 0) {
      this.heapStates[0] = this.heapStates[this.heapSize]!;
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

  /** Total order: score, then state index, so ties never depend on ordering. */
  private less(a: number, b: number): boolean {
    const scoreA = this.heapScores[a]!;
    const scoreB = this.heapScores[b]!;
    if (scoreA !== scoreB) return scoreA < scoreB;
    return this.heapStates[a]! < this.heapStates[b]!;
  }

  private swap(a: number, b: number): void {
    const state = this.heapStates[a]!;
    this.heapStates[a] = this.heapStates[b]!;
    this.heapStates[b] = state;
    const score = this.heapScores[a]!;
    this.heapScores[a] = this.heapScores[b]!;
    this.heapScores[b] = score;
  }

  /**
   * Seconds one step costs, or {@link IMPASSABLE}.
   *
   * The curve radius is taken from the immediate turn alone; the neighbouring
   * turns that would sharpen it further are not part of the search state. The
   * search therefore optimises a slightly optimistic model of its own route -
   * the speed the train actually drives is measured with the full context in
   * vehicles/update.ts.
   */
  private stepSeconds(
    map: TileMap,
    fromTile: number,
    toTile: number,
    incoming: TrackDir,
    outgoing: TrackDir,
    maxSpeedMs: number,
    lateralAccel: number,
    needsCatenary: boolean,
  ): number {
    if ((map.trackBits[fromTile]! & trackBit(outgoing)) === 0) return IMPASSABLE;
    if ((map.trackBits[toTile]! & trackBit(oppositeDir(outgoing))) === 0) return IMPASSABLE;

    const railType = map.railType[toTile]!;
    if (needsCatenary && railType !== RailType.Electrified) return IMPASSABLE;

    const lineSpeed = RAIL_TYPE_SPEED_MS[railType] ?? 0;
    if (lineSpeed <= 0) return IMPASSABLE;

    let speed = lineSpeed < maxSpeedMs ? lineSpeed : maxSpeedMs;
    const radius = curveRadiusM(incoming, outgoing, 0, 0);
    const curve = curveSpeedMs(radius, lateralAccel);
    if (curve < speed) speed = curve;

    return stepLengthM(outgoing) / speed;
  }

  /**
   * Fastest route from `fromTile` to `toTile` over existing track. Writes the
   * tile sequence into `out` and returns its length, or 0 when there is none.
   */
  find(
    map: TileMap,
    fromTile: number,
    toTile: number,
    maxSpeedMs: number,
    lateralAccel: number,
    needsCatenary: boolean,
    out: Int32Array,
  ): number {
    this.reindex(map);

    if (fromTile === toTile) {
      out[0] = fromTile;
      return 1;
    }
    if (maxSpeedMs <= 0) return 0;

    const startNode = this.nodeOf[fromTile] ?? -1;
    const targetNode = this.nodeOf[toTile] ?? -1;
    if (startNode < 0 || targetNode < 0) return 0;
    if (needsCatenary && map.railType[fromTile] !== RailType.Electrified) return 0;

    const size = map.size;
    const stamp = ++this.stamp;
    this.heapSize = 0;

    const targetX = toTile % size;
    const targetY = (toTile / size) | 0;

    // A standing train may leave in any direction, so every incoming direction
    // of the start tile begins at zero.
    for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
      const state = startNode * TRACK_DIR_COUNT + direction;
      this.visitStamp[state] = stamp;
      this.gScore[state] = 0;
      this.cameFrom[state] = -1;
      this.closed[state] = 0;
      this.push(state, 0);
    }

    let expanded = 0;
    while (this.heapSize > 0 && expanded < MAX_RAIL_SEARCH_NODES) {
      const state = this.pop();
      if (this.closed[state] === 1 && this.visitStamp[state] === stamp) continue;
      this.closed[state] = 1;
      expanded++;

      const node = (state / TRACK_DIR_COUNT) | 0;
      const incoming = (state % TRACK_DIR_COUNT) as TrackDir;
      const tile = this.tileOf[node]!;
      if (node === targetNode) return this.reconstruct(state, out);

      const x = tile % size;
      const y = (tile / size) | 0;
      const cost = this.gScore[state]!;

      for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
        // A reversal is not a curve; a train needs a run-round for that.
        if (Math.abs(turnSteps(incoming, direction as TrackDir)) > 2) continue;

        const nx = x + TRACK_DX[direction]!;
        const ny = y + TRACK_DY[direction]!;
        if (!map.contains(nx, ny)) continue;

        const neighbourTile = ny * size + nx;
        const neighbourNode = this.nodeOf[neighbourTile] ?? -1;
        if (neighbourNode < 0) continue;

        const seconds = this.stepSeconds(
          map,
          tile,
          neighbourTile,
          incoming,
          direction as TrackDir,
          maxSpeedMs,
          lateralAccel,
          needsCatenary,
        );
        if (seconds === IMPASSABLE) continue;

        const next = neighbourNode * TRACK_DIR_COUNT + direction;
        const tentative = cost + seconds;
        if (this.visitStamp[next] === stamp && tentative >= this.gScore[next]!) continue;

        this.visitStamp[next] = stamp;
        this.gScore[next] = tentative;
        this.cameFrom[next] = state;
        this.closed[next] = 0;

        // Straight-line time at line speed: never longer than the real journey.
        const dx = targetX - nx;
        const dy = targetY - ny;
        const heuristic = (Math.sqrt(dx * dx + dy * dy) * TILE_SIZE_M) / maxSpeedMs;
        this.push(next, tentative + heuristic);
      }
    }
    return 0;
  }

  private reconstruct(target: number, out: Int32Array): number {
    let length = 0;
    let state = target;
    while (state !== -1) {
      length++;
      state = this.cameFrom[state]!;
    }

    // Every start direction seeds the search, so the start tile is written once
    // here and the duplicate seed state simply is not part of the chain.
    if (length > out.length) return 0;

    let index = length - 1;
    state = target;
    while (state !== -1) {
      out[index--] = this.tileOf[(state / TRACK_DIR_COUNT) | 0]!;
      state = this.cameFrom[state]!;
    }
    return length;
  }
}
