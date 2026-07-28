import {
  MAX_TRACK_SEARCH_NODES,
  TILE_DIAGONAL_M,
  TILE_SIZE_M,
  TRACK_SEARCH_MARGIN_TILES,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { Terrain } from '../map/terrain';
import {
  curveRadiusM,
  directionFromDelta,
  gradeWindowM,
  measureRoute,
  railUpgradeCostCt,
  windowedGradePermille,
  RAIL_TYPE_COST_CT,
  RAIL_TYPE_MAX_GRADE,
  stepLengthM,
  TRACK_DIR_COUNT,
  TRACK_DX,
  TRACK_DY,
  turnSteps,
  type RailType,
  type RouteGeometry,
  type TrackDir,
} from '../map/track';

/**
 * The route assistant of section 8.2 - "building without frustration".
 *
 * Dragging from A to B produces the smoothest legal alignment rather than a
 * literal straight line. The search runs over (tile, incoming direction) pairs,
 * because the cost of a step depends on where the train came from: that is what
 * lets the cost function charge for curves at all.
 *
 * Costs are expressed in metre equivalents, so length, curvature and gradient
 * can be traded off against each other in one number.
 *
 * Two terms of the specification's cost function are missing on purpose:
 * earthworks and bridges/tunnels, which arrive together with the structures
 * themselves, and the detour around a competitor's property, which cannot
 * exist before the AI companies of M8.
 */

/**
 * Curve penalties, in metres of detour the player would accept instead.
 *
 * With eight directions a 90 degree turn inside a single tile *is* the minimum
 * curve of section 8.1, so it carries the 900 m penalty. Two 45 degree steps in
 * a row cost 2 x 40 m and give a 90 m radius instead of 45 m - which is exactly
 * the incentive the assistant is supposed to create: go round the corner in two
 * steps, not one.
 */
const CURVE_PENALTY_45 = 40;
const CURVE_PENALTY_MINIMUM = 900;

/** Gradient penalty is quadratic: (permille / 5)^2 * 60 m. */
const GRADE_PENALTY_SCALE = 60;
const GRADE_PENALTY_DIVISOR = 5;

/** Building over an existing road crossing costs a little extra. */
const LEVEL_CROSSING_PENALTY = 400;

export interface TrackRoute {
  readonly tiles: number[];
  readonly geometry: RouteGeometry;
  /** Tiles that already carry track of a different type and get converted. */
  readonly upgradedTiles: number;
  /** Total build price, new track and conversions together. [cent] */
  readonly costCt: number;
}

export const TrackReason = {
  OutsideMap: 'track.reject.outsideMap',
  NoRoute: 'track.reject.noRoute',
  TooSteep: 'track.reject.tooSteep',
  OnWater: 'track.reject.onWater',
  Blocked: 'track.reject.blocked',
  NothingToDo: 'track.reject.nothingToDo',
} as const;

export type TrackRouteResult =
  | { readonly ok: true; readonly route: TrackRoute }
  | { readonly ok: false; readonly reasonKey: string };

/** Can track exist on this tile at all? */
function tileBuildable(map: TileMap, x: number, y: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.terrain[index] === Terrain.Water) return false;
  if (map.buildingKind[index] !== 0) return false;
  if (map.industryId[index] !== -1) return false;
  return true;
}

/**
 * Reusable search workspace, sized to a bounding box around the two endpoints
 * rather than to the whole map: a full 1024 x 1024 map has eight million
 * (tile, direction) states, and allocating a hundred megabytes for a search
 * that touches a few thousand of them would be absurd.
 */
class TrackSearch {
  private minX = 0;
  private minY = 0;
  private width = 0;
  private height = 0;

  private gScore = new Float32Array(0);
  private cameFrom = new Int32Array(0);
  private visitStamp = new Int32Array(0);
  private closed = new Uint8Array(0);
  private heapStates = new Int32Array(0);
  private heapScores = new Float32Array(0);
  private heapSize = 0;
  private stamp = 0;

  private prepare(map: TileMap, fromTile: number, toTile: number): void {
    const size = map.size;
    const x1 = fromTile % size;
    const y1 = (fromTile / size) | 0;
    const x2 = toTile % size;
    const y2 = (toTile / size) | 0;

    this.minX = Math.max(0, Math.min(x1, x2) - TRACK_SEARCH_MARGIN_TILES);
    this.minY = Math.max(0, Math.min(y1, y2) - TRACK_SEARCH_MARGIN_TILES);
    const maxX = Math.min(size - 1, Math.max(x1, x2) + TRACK_SEARCH_MARGIN_TILES);
    const maxY = Math.min(size - 1, Math.max(y1, y2) + TRACK_SEARCH_MARGIN_TILES);
    this.width = maxX - this.minX + 1;
    this.height = maxY - this.minY + 1;

    const states = this.width * this.height * TRACK_DIR_COUNT;
    if (this.gScore.length < states) {
      this.gScore = new Float32Array(states);
      this.cameFrom = new Int32Array(states);
      this.visitStamp = new Int32Array(states).fill(-1);
      this.closed = new Uint8Array(states);
      this.heapStates = new Int32Array(states);
      this.heapScores = new Float32Array(states);
    }
    this.stamp++;
    this.heapSize = 0;
  }

  private inBox(x: number, y: number): boolean {
    return (
      x >= this.minX && y >= this.minY && x < this.minX + this.width && y < this.minY + this.height
    );
  }

  private stateOf(x: number, y: number, direction: number): number {
    return ((y - this.minY) * this.width + (x - this.minX)) * TRACK_DIR_COUNT + direction;
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
   * Gradient of the stretch of line that ends at the candidate tile.
   *
   * Walks back along the route already found until the window is full, so the
   * search judges a climb the same way the finished route will be measured -
   * otherwise the assistant would happily plan alignments that the preview then
   * refuses.
   */
  private gradeInto(
    map: TileMap,
    fromState: number,
    nx: number,
    ny: number,
    direction: TrackDir,
    windowM: number,
  ): number {
    let runM = stepLengthM(direction);
    let state = fromState;

    while (runM < windowM) {
      const previous = this.cameFrom[state]!;
      if (previous === -1) break;
      const cell = (state / TRACK_DIR_COUNT) | 0;
      const x = this.minX + (cell % this.width);
      const y = this.minY + ((cell / this.width) | 0);
      const previousCell = (previous / TRACK_DIR_COUNT) | 0;
      const px = this.minX + (previousCell % this.width);
      const py = this.minY + ((previousCell / this.width) | 0);
      if (px === x && py === y) break; // the duplicated start seed
      runM += px !== x && py !== y ? TILE_DIAGONAL_M : TILE_SIZE_M;
      state = previous;
    }

    const cell = (state / TRACK_DIR_COUNT) | 0;
    const backX = this.minX + (cell % this.width);
    const backY = this.minY + ((cell / this.width) | 0);
    return windowedGradePermille(
      map.baseHeight(nx, ny) - map.baseHeight(backX, backY),
      runM,
      windowM,
    );
  }

  /** Find the cheapest alignment. Returns the tile sequence, or null. */
  find(map: TileMap, fromTile: number, toTile: number, railType: RailType): number[] | null {
    this.prepare(map, fromTile, toTile);
    const size = map.size;
    const stamp = this.stamp;
    const maxGrade = RAIL_TYPE_MAX_GRADE[railType]!;
    const windowM = gradeWindowM(railType);

    const targetX = toTile % size;
    const targetY = (toTile / size) | 0;
    const startX = fromTile % size;
    const startY = (fromTile / size) | 0;

    // The first step may leave in any direction, so every incoming direction of
    // the start tile begins at zero.
    for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
      const state = this.stateOf(startX, startY, direction);
      this.visitStamp[state] = stamp;
      this.gScore[state] = 0;
      this.cameFrom[state] = -1;
      this.closed[state] = 0;
      this.push(state, 0);
    }

    let expanded = 0;
    while (this.heapSize > 0 && expanded < MAX_TRACK_SEARCH_NODES) {
      const state = this.pop();
      if (this.closed[state] === 1 && this.visitStamp[state] === stamp) continue;
      this.closed[state] = 1;
      expanded++;

      const cell = (state / TRACK_DIR_COUNT) | 0;
      const incoming = (state % TRACK_DIR_COUNT) as TrackDir;
      const x = this.minX + (cell % this.width);
      const y = this.minY + ((cell / this.width) | 0);

      if (x === targetX && y === targetY) return this.reconstruct(state, size);

      const cost = this.gScore[state]!;

      for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
        const nx = x + TRACK_DX[direction]!;
        const ny = y + TRACK_DY[direction]!;
        if (!this.inBox(nx, ny) || !tileBuildable(map, nx, ny)) continue;

        // A reversal is not a curve, it is a mistake.
        const turn = turnSteps(incoming, direction as TrackDir);
        if (Math.abs(turn) > 2) continue;

        // The gradient is measured over a stretch of line, not from one tile to
        // the next - see the note on the gradient window in map/track.ts.
        const grade = Math.abs(this.gradeInto(map, state, nx, ny, direction as TrackDir, windowM));
        if (grade > maxGrade) continue;

        let step = stepLengthM(direction as TrackDir);
        step += curvePenalty(turn);
        const gradeUnits = grade / GRADE_PENALTY_DIVISOR;
        step += gradeUnits * gradeUnits * GRADE_PENALTY_SCALE;

        if (map.roadBits[map.tileIndex(nx, ny)] !== 0) step += LEVEL_CROSSING_PENALTY;

        const next = this.stateOf(nx, ny, direction);
        const tentative = cost + step;
        if (this.visitStamp[next] === stamp && tentative >= this.gScore[next]!) continue;

        this.visitStamp[next] = stamp;
        this.gScore[next] = tentative;
        this.cameFrom[next] = state;
        this.closed[next] = 0;

        const dx = targetX - nx;
        const dy = targetY - ny;
        this.push(next, tentative + Math.sqrt(dx * dx + dy * dy) * 50);
      }
    }
    return null;
  }

  private reconstruct(state: number, size: number): number[] {
    const tiles: number[] = [];
    let current = state;
    while (current !== -1) {
      const cell = (current / TRACK_DIR_COUNT) | 0;
      const x = this.minX + (cell % this.width);
      const y = this.minY + ((cell / this.width) | 0);
      tiles.push(y * size + x);
      current = this.cameFrom[current]!;
    }
    tiles.reverse();

    // Every start direction seeds the search, so the first tile can appear twice.
    while (tiles.length > 1 && tiles[0] === tiles[1]) tiles.shift();
    return tiles;
  }
}

function curvePenalty(turn: number): number {
  const steps = Math.abs(turn);
  if (steps === 0) return 0;
  if (steps === 1) return CURVE_PENALTY_45;
  return CURVE_PENALTY_MINIMUM;
}

/** One shared workspace; track laying is a player action, never concurrent. */
const search = new TrackSearch();

/**
 * Plan a route without building it. The result is exactly what the build
 * preview shows and exactly what the command will charge (section 17.3).
 */
export function planTrack(
  map: TileMap,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  railType: RailType,
  assistant: boolean,
): TrackRouteResult {
  if (!map.contains(x1, y1) || !map.contains(x2, y2)) {
    return { ok: false, reasonKey: TrackReason.OutsideMap };
  }
  if (!tileBuildable(map, x1, y1) || !tileBuildable(map, x2, y2)) {
    const blocker = map.terrain[map.tileIndex(x2, y2)] === Terrain.Water;
    return { ok: false, reasonKey: blocker ? TrackReason.OnWater : TrackReason.Blocked };
  }
  if (x1 === x2 && y1 === y2) return { ok: false, reasonKey: TrackReason.NothingToDo };

  const from = map.tileIndex(x1, y1);
  const to = map.tileIndex(x2, y2);
  const tiles = assistant
    ? search.find(map, from, to, railType)
    : straightRoute(map, x1, y1, x2, y2);

  if (tiles === null || tiles.length < 2) {
    return { ok: false, reasonKey: TrackReason.NoRoute };
  }

  const geometry = measureRoute(
    tiles,
    map.size,
    (x, y) => map.baseHeight(x, y),
    railType,
    (tile) => map.trackBits[tile] === 0,
  );

  if (geometry.maxGradePermille > RAIL_TYPE_MAX_GRADE[railType]!) {
    return { ok: false, reasonKey: TrackReason.TooSteep };
  }

  // Laying over a line that is already there but of another type converts it -
  // that is how a plain line gets its catenary once electric traction arrives.
  let costCt = 0;
  let upgradedTiles = 0;
  for (const tile of tiles) {
    const existing = map.railType[tile]! as RailType;
    if (map.trackBits[tile] === 0) {
      costCt += RAIL_TYPE_COST_CT[railType]!;
    } else if (existing !== railType) {
      costCt += railUpgradeCostCt(existing, railType);
      upgradedTiles++;
    }
  }

  return { ok: true, route: { tiles, geometry, upgradedTiles, costCt } };
}

/**
 * Manual mode (the `M` key of section 8.2): the literal line the player drew,
 * diagonal where it can be. No smoothing, no detours - for the people who lay
 * their own station throats.
 */
function straightRoute(
  map: TileMap,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number[] | null {
  const tiles: number[] = [map.tileIndex(x1, y1)];
  let x = x1;
  let y = y1;

  for (let guard = 0; guard < 4096 && (x !== x2 || y !== y2); guard++) {
    const stepX = Math.sign(x2 - x);
    const stepY = Math.sign(y2 - y);
    const direction = directionFromDelta(stepX, stepY);
    x += TRACK_DX[direction]!;
    y += TRACK_DY[direction]!;
    if (!tileBuildable(map, x, y)) return null;
    tiles.push(map.tileIndex(x, y));
  }
  return x === x2 && y === y2 ? tiles : null;
}

/** Radius of the tightest curve a route contains, for the preview text. */
export function tightestCurve(tiles: readonly number[], mapSize: number): number {
  if (tiles.length < 3) return Infinity;
  let tightest = Infinity;

  for (let i = 1; i + 1 < tiles.length; i++) {
    const before = directionBetween(tiles[i - 1]!, tiles[i]!, mapSize);
    const after = directionBetween(tiles[i]!, tiles[i + 1]!, mapSize);
    const previousTurn =
      i >= 2 ? turnSteps(directionBetween(tiles[i - 2]!, tiles[i - 1]!, mapSize), before) : 0;
    const nextTurn =
      i + 2 < tiles.length
        ? turnSteps(after, directionBetween(tiles[i + 1]!, tiles[i + 2]!, mapSize))
        : 0;
    const radius = curveRadiusM(before, after, previousTurn, nextTurn);
    if (radius < tightest) tightest = radius;
  }
  return tightest;
}

function directionBetween(fromTile: number, toTile: number, mapSize: number): TrackDir {
  return directionFromDelta(
    (toTile % mapSize) - (fromTile % mapSize),
    ((toTile / mapSize) | 0) - ((fromTile / mapSize) | 0),
  );
}
