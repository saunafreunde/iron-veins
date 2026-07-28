import {
  HEIGHT_STEP_M,
  LATERAL_ACCEL_FREIGHT,
  LATERAL_ACCEL_PASSENGER,
  TILE_SIZE_M,
} from '../constants';

/**
 * Rail geometry (section 8.1).
 *
 * Track lies on the tile grid, but the effective curve radius is derived from
 * the sequence of direction changes. That is what makes a gently laid line
 * genuinely faster than a hastily laid one without needing a spline editor -
 * the central promise of the milestone.
 *
 * Eight directions rather than the four the roads use: without diagonals every
 * turn would be a 90 degree corner, every curve would be the 45 m minimum, and
 * no train could ever exceed 70 km/h once it turned. The whole radius table
 * would be decoration.
 */

/** Directions in 45 degree steps, clockwise from east. */
export const TrackDir = {
  East: 0,
  SouthEast: 1,
  South: 2,
  SouthWest: 3,
  West: 4,
  NorthWest: 5,
  North: 6,
  NorthEast: 7,
} as const;
export type TrackDir = (typeof TrackDir)[keyof typeof TrackDir];

export const TRACK_DIR_COUNT = 8;

/** Tile offset per direction. */
export const TRACK_DX = [1, 1, 0, -1, -1, -1, 0, 1] as const;
export const TRACK_DY = [0, 1, 1, 1, 0, -1, -1, -1] as const;

/** Bit set on a tile for each direction that carries track. */
export function trackBit(direction: TrackDir): number {
  return 1 << direction;
}

/** The direction that leads back where you came from. */
export function oppositeDir(direction: TrackDir): TrackDir {
  return ((direction + 4) % TRACK_DIR_COUNT) as TrackDir;
}

/** True for the four diagonal directions. */
export function isDiagonal(direction: TrackDir): boolean {
  return (direction & 1) === 1;
}

/** Ground distance covered by one step in this direction. [m] */
export function stepLengthM(direction: TrackDir): number {
  return isDiagonal(direction) ? TILE_SIZE_M * Math.SQRT2 : TILE_SIZE_M;
}

/**
 * Turn between two directions, in 45 degree steps, signed and in [-4, 4].
 * Negative is anticlockwise.
 */
export function turnSteps(from: TrackDir, to: TrackDir): number {
  let delta = (to - from) % TRACK_DIR_COUNT;
  if (delta > 4) delta -= TRACK_DIR_COUNT;
  if (delta < -4) delta += TRACK_DIR_COUNT;
  return delta;
}

/** Rail types. Electrified track is what lets electric locomotives run. */
export const RailType = {
  None: 0,
  Plain: 1,
  Electrified: 2,
  /** Narrow gauge: cheap, slow, used for branch lines in the mountains. */
  Narrow: 3,
  /** High speed track: expensive, higher line speed. */
  HighSpeed: 4,
} as const;
export type RailType = (typeof RailType)[keyof typeof RailType];

/** Line speed of the track itself, before curves are considered. [m/s] */
export const RAIL_TYPE_SPEED_MS: readonly number[] = [0, 44.4, 55.6, 22.2, 97.2];

/** Steepest gradient each rail type accepts. [per mille] */
export const RAIL_TYPE_MAX_GRADE: readonly number[] = [0, 30, 30, 60, 12.5];

/** Build price per tile of each rail type. [cent] */
export const RAIL_TYPE_COST_CT: readonly number[] = [0, 90_000, 140_000, 55_000, 320_000];

/** Yearly upkeep per tile. [cent] */
export const RAIL_TYPE_UPKEEP_CT: readonly number[] = [0, 4_500, 6_000, 2_800, 14_000];

/**
 * Curve radius at one node of a route, from the turn there and the turn at the
 * following node (section 8.1).
 *
 * The specification gives the radii for five patterns. Reading them as a
 * three-node window:
 *  - no turn                              -> straight
 *  - a 90 degree turn inside one tile     -> 45 m, the minimum
 *  - 45 degrees with straight either side -> 300 m
 *  - two 45 degree turns the same way     -> 90 m, a 90 degree bend over two tiles
 *  - 45 degrees next to any other change  -> 150 m
 */
export function curveRadiusM(
  incoming: TrackDir,
  outgoing: TrackDir,
  previousTurn: number,
  nextTurn: number,
): number {
  const turn = turnSteps(incoming, outgoing);
  if (turn === 0) return Infinity;
  if (Math.abs(turn) >= 2) return 45;

  const neighbourTurns = Math.abs(previousTurn) + Math.abs(nextTurn);
  if (neighbourTurns === 0) return 300;

  // Two 45 degree steps the same way form one continuous 90 degree bend; the
  // opposite way is an S curve, which is easier on the track but still tight.
  const sameWay =
    (previousTurn !== 0 && Math.sign(previousTurn) === Math.sign(turn)) ||
    (nextTurn !== 0 && Math.sign(nextTurn) === Math.sign(turn));
  return sameWay ? 90 : 150;
}

/**
 * Fastest a vehicle may take a curve of this radius.
 * v = sqrt(a_lateral * r) - the standard comfort limit.
 */
export function curveSpeedMs(radiusM: number, lateralAccel: number): number {
  if (!Number.isFinite(radiusM)) return Infinity;
  return Math.sqrt(lateralAccel * radiusM);
}

/** Comfort limit for passengers; freight tolerates more. [m/s] */
export function passengerCurveSpeedMs(radiusM: number): number {
  return curveSpeedMs(radiusM, LATERAL_ACCEL_PASSENGER);
}

export function freightCurveSpeedMs(radiusM: number): number {
  return curveSpeedMs(radiusM, LATERAL_ACCEL_FREIGHT);
}

/** Gradient of a step between two height levels, in per mille and signed. */
export function gradePermille(fromHeight: number, toHeight: number, direction: TrackDir): number {
  const rise = (toHeight - fromHeight) * HEIGHT_STEP_M;
  return (rise * 1000) / stepLengthM(direction);
}

/**
 * Speed a finished route allows, and the geometry that limits it.
 * This is what the build preview shows before the player commits (section 17.3).
 */
export interface RouteGeometry {
  /** Total ground distance. [m] */
  readonly lengthM: number;
  /** Tightest curve anywhere on the route. [m] */
  readonly minRadiusM: number;
  /** Steepest gradient anywhere on the route. [per mille] */
  readonly maxGradePermille: number;
  /** Resulting line speed for a passenger train. [m/s] */
  readonly maxSpeedMs: number;
  /** How many of the tiles are new rather than already track. */
  readonly newTiles: number;
}

/**
 * Measure a route given as a tile sequence.
 *
 * `heightAt` is passed in rather than the map, so this stays a pure function of
 * geometry and can be unit tested without building a world.
 */
export function measureRoute(
  tiles: readonly number[],
  mapSize: number,
  heightAt: (x: number, y: number) => number,
  railType: RailType,
  isNewTile: (tile: number) => boolean,
): RouteGeometry {
  if (tiles.length < 2) {
    return {
      lengthM: 0,
      minRadiusM: Infinity,
      maxGradePermille: 0,
      maxSpeedMs: RAIL_TYPE_SPEED_MS[railType]!,
      newTiles: tiles.length === 1 && isNewTile(tiles[0]!) ? 1 : 0,
    };
  }

  const directions: TrackDir[] = [];
  for (let i = 0; i + 1 < tiles.length; i++) {
    const from = tiles[i]!;
    const to = tiles[i + 1]!;
    const dx = (to % mapSize) - (from % mapSize);
    const dy = ((to / mapSize) | 0) - ((from / mapSize) | 0);
    directions.push(directionFromDelta(dx, dy));
  }

  const turns: number[] = [];
  for (let i = 0; i + 1 < directions.length; i++) {
    turns.push(turnSteps(directions[i]!, directions[i + 1]!));
  }

  let lengthM = 0;
  let maxGrade = 0;
  let minRadius = Infinity;
  let newTiles = 0;

  for (let i = 0; i < directions.length; i++) {
    const direction = directions[i]!;
    lengthM += stepLengthM(direction);

    const from = tiles[i]!;
    const to = tiles[i + 1]!;
    const grade = Math.abs(
      gradePermille(
        heightAt(from % mapSize, (from / mapSize) | 0),
        heightAt(to % mapSize, (to / mapSize) | 0),
        direction,
      ),
    );
    if (grade > maxGrade) maxGrade = grade;

    if (i + 1 < directions.length) {
      const radius = curveRadiusM(
        direction,
        directions[i + 1]!,
        turns[i - 1] ?? 0,
        turns[i + 1] ?? 0,
      );
      if (radius < minRadius) minRadius = radius;
    }
  }

  for (const tile of tiles) if (isNewTile(tile)) newTiles++;

  const typeSpeed = RAIL_TYPE_SPEED_MS[railType]!;
  const curveSpeed = passengerCurveSpeedMs(minRadius);
  return {
    lengthM,
    minRadiusM: minRadius,
    maxGradePermille: maxGrade,
    maxSpeedMs: Math.min(typeSpeed, curveSpeed),
    newTiles,
  };
}

/** Direction of a one-tile step, or East if the step is not a single tile. */
export function directionFromDelta(dx: number, dy: number): TrackDir {
  for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
    if (TRACK_DX[direction] === dx && TRACK_DY[direction] === dy) return direction as TrackDir;
  }
  throw new Error(`Not a single tile step: ${dx}, ${dy}`);
}
