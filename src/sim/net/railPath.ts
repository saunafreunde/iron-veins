import {
  MAX_RAIL_SEARCH_NODES,
  RAIL_OCCUPANCY_PENALTY_SECONDS,
  RAIL_SIGNAL_PENALTY_SECONDS,
  TILE_SIZE_M,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { isOneWay, signalDirection, signalKind, SignalKind } from '../map/signals';
import type { ReservationTable } from './reservations';
import {
  curveRadiusM,
  curveSpeedMs,
  hasEdge,
  RailType,
  RAIL_TYPE_SPEED_MS,
  stepLengthM,
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
 *
 * THE TWO WORLD RULES OF M15 (SPEC.md 8.4)
 *
 * `occupancyPenalty` prices a section another train has claimed, and
 * `signalPenalty` prices passing a signal. Both are world rules (SPEC2 Z2,
 * D-110): saved, hashed, chosen once at new-game time, off in every world that
 * predates them - so the search below is BIT-IDENTICAL to the M3 one whenever
 * both are false, which is the property the pre-M15 seeds live on.
 *
 * The occupancy term reads `ReservationTable` - the SAME tile-keyed derived
 * table the claim logic writes (D-054), never a copy of it. A snapshot of the
 * live claims IS the honest input here: it is what the claim logic will refuse
 * the train at, and D-060's rule that the claim runs from where the train IS
 * is exactly why a second, path-shaped occupancy model would drift from it.
 *
 * The charge falls ONCE PER RUN of foreign-claimed tiles, not once per tile:
 * the entry step into a claimed run pays, every further step inside the same
 * owner's run is free. A per-tile charge would scale with how much track the
 * train ahead happens to hold - a long block would read as a catastrophe and a
 * short one as nothing, for the same wait. What the player pays for is
 * MEETING a train, and that is what the run entry is.
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
   *
   * The two M15 penalties are added on top of the driving time. Both are
   * additive and non-negative, so the straight-line heuristic below stays a
   * lower bound on the true remaining cost and A* stays admissible; and both
   * are functions of the two TILES and the two directions alone, so the cost
   * still depends on nothing but the search state.
   */
  private stepSeconds(
    map: TileMap,
    reservations: ReservationTable,
    vehicleId: number,
    fromTile: number,
    toTile: number,
    incoming: TrackDir,
    outgoing: TrackDir,
    maxSpeedMs: number,
    lateralAccel: number,
    needsCatenary: boolean,
    occupancyPenalty: boolean,
    signalPenalty: boolean,
  ): number {
    if (!hasEdge(map.trackBits, map.size, fromTile, outgoing)) return IMPASSABLE;

    // A one-way signal is part of the topology, not of the traffic: routing a
    // train the wrong way through one would strand it at the tile edge with no
    // way ever to pass. Occupancy is priced below rather than forbidden - a
    // claimed block is a wait, never a wall (D-059 stands: the search must not
    // refuse a section, or two trains meeting on single track would become a
    // NoRoute instead of the stated deadlock).
    const packed = map.signal[toTile]!;
    const kind = signalKind(packed);
    if (isOneWay(kind) && signalDirection(packed) !== outgoing) return IMPASSABLE;

    const railType = map.railType[toTile]!;
    if (needsCatenary && railType !== RailType.Electrified) return IMPASSABLE;

    const lineSpeed = RAIL_TYPE_SPEED_MS[railType] ?? 0;
    if (lineSpeed <= 0) return IMPASSABLE;

    let speed = lineSpeed < maxSpeedMs ? lineSpeed : maxSpeedMs;
    const radius = curveRadiusM(incoming, outgoing, 0, 0);
    const curve = curveSpeedMs(radius, lateralAccel);
    if (curve < speed) speed = curve;

    let seconds = stepLengthM(outgoing) / speed;

    if (signalPenalty && kind !== SignalKind.None) seconds += RAIL_SIGNAL_PENALTY_SECONDS;

    if (occupancyPenalty) {
      const owner = reservations.ownerOf(toTile);
      // Charged on ENTRY to a foreign run only: the same owner one step back
      // means the train is already inside that claim and has paid for it.
      if (owner !== -1 && owner !== vehicleId && reservations.ownerOf(fromTile) !== owner) {
        seconds += RAIL_OCCUPANCY_PENALTY_SECONDS;
      }
    }

    return seconds;
  }

  /**
   * Fastest route from `fromTile` to `toTile` over existing track. Writes the
   * tile sequence into `out` and returns its length, or 0 when there is none.
   *
   * `reservations` and `vehicleId` are REQUIRED rather than optional on
   * purpose: there is exactly one reservation truth in the game (D-054) and a
   * caller that could omit it would be a caller routing against a different
   * world than the one the claim logic lives in. `vehicleId` is what keeps a
   * train from paying the occupancy charge for its own claim.
   */
  find(
    map: TileMap,
    reservations: ReservationTable,
    vehicleId: number,
    fromTile: number,
    toTile: number,
    maxSpeedMs: number,
    lateralAccel: number,
    needsCatenary: boolean,
    occupancyPenalty: boolean,
    signalPenalty: boolean,
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
          reservations,
          vehicleId,
          tile,
          neighbourTile,
          incoming,
          direction as TrackDir,
          maxSpeedMs,
          lateralAccel,
          needsCatenary,
          occupancyPenalty,
          signalPenalty,
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
