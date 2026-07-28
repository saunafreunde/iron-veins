import {
  HEIGHT_STEP_M,
  LATERAL_ACCEL_FREIGHT,
  LATERAL_ACCEL_PASSENGER,
  TILE_DIAGONAL_M,
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

/**
 * How many directions leave this tile.
 *
 * Two is plain line, one is a dead end, three or more is a junction. That
 * distinction is what decides where a signal may stand: a train held at a
 * signal must not be standing in a junction throat, and refusing to place one
 * there is cheaper than modelling the case (DECISIONS.md D-055).
 */
export function trackDegree(bits: number): number {
  let count = 0;
  for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
    if ((bits & (1 << direction)) !== 0) count++;
  }
  return count;
}

/** The direction that leads back where you came from. */
export function oppositeDir(direction: TrackDir): TrackDir {
  return ((direction + 4) % TRACK_DIR_COUNT) as TrackDir;
}

/**
 * Is there a usable edge from `tile` in `direction`?
 *
 * Track is stored twice, once as a bit on each end, and an edge counts only
 * when both halves are there. One definition, used by the pathfinder and by
 * everything that walks the network, so a block rule and a route can never
 * disagree about what is connected.
 */
export function hasEdge(
  trackBits: Uint8Array,
  size: number,
  tile: number,
  direction: TrackDir,
): boolean {
  if ((trackBits[tile]! & trackBit(direction)) === 0) return false;
  const x = (tile % size) + TRACK_DX[direction]!;
  const y = ((tile / size) | 0) + TRACK_DY[direction]!;
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  return (trackBits[y * size + x]! & trackBit(oppositeDir(direction))) !== 0;
}

/** True for the four diagonal directions. */
export function isDiagonal(direction: TrackDir): boolean {
  return (direction & 1) === 1;
}

/** Ground distance covered by one step in this direction. [m] */
export function stepLengthM(direction: TrackDir): number {
  return isDiagonal(direction) ? TILE_DIAGONAL_M : TILE_SIZE_M;
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
 * Least an upgrade can cost, as a share of the new type's build price.
 *
 * Converting track is mostly the difference between the two - stringing wire
 * over an existing line is cheaper than laying that line was. But it is never
 * free, not even when the new type is the cheaper one: the old track still has
 * to come up.
 */
export const RAIL_UPGRADE_MIN_SHARE = 0.25;

/** Price of converting one tile from one rail type to another. [cent] */
export function railUpgradeCostCt(from: RailType, to: RailType): number {
  const difference = RAIL_TYPE_COST_CT[to]! - RAIL_TYPE_COST_CT[from]!;
  const floor = RAIL_TYPE_COST_CT[to]! * RAIL_UPGRADE_MIN_SHARE;
  return Math.round(difference > floor ? difference : floor);
}

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

/** Gradient of a single step between two height levels, in per mille and signed. */
export function gradePermille(fromHeight: number, toHeight: number, direction: TrackDir): number {
  const rise = (toHeight - fromHeight) * HEIGHT_STEP_M;
  return (rise * 1000) / stepLengthM(direction);
}

/**
 * ---------------------------------------------------------------------------
 * THE GRADIENT WINDOW - read this before touching anything about gradients.
 * ---------------------------------------------------------------------------
 * The ground is sampled in whole height levels of 8 m on a 50 m grid, so the
 * smallest step the terrain can express is 8 m over 50 m: 160 per mille. Taken
 * literally, no rail type could ever climb anything at all - not even the 60
 * per mille narrow gauge - and every railway in the game would be confined to
 * perfectly flat ground.
 *
 * That is a measuring error, not a fact about railways. Track has its own
 * vertical alignment: it leaves the ground on an embankment, climbs steadily
 * and meets it again further along. What matters is therefore the height gained
 * over a STRETCH of line, not the sample-to-sample difference.
 *
 * So gradients are measured over a window, and the window is the length over
 * which one height level is exactly at the type's limit:
 *
 *   plain / electrified  30    per mille ->  6 tiles (300 m)
 *   narrow gauge         60    per mille ->  3 tiles (150 m)
 *   high speed           12.5  per mille -> 13 tiles (650 m)
 *
 * Read as a rule: plain track may gain one level every six tiles, high speed
 * one every thirteen, narrow gauge one every three. Which is the promise the
 * rail types are supposed to make.
 */
export function gradeWindowTiles(railType: RailType): number {
  const maxGrade = RAIL_TYPE_MAX_GRADE[railType] ?? 0;
  if (maxGrade <= 0) return 1;
  return Math.ceil((HEIGHT_STEP_M * 1000) / (maxGrade * TILE_SIZE_M));
}

/** Length of that window. [m] */
export function gradeWindowM(railType: RailType): number {
  return gradeWindowTiles(railType) * TILE_SIZE_M;
}

/**
 * Gradient of a stretch of line, in per mille and signed.
 *
 * `runM` is floored at the window length: a route that starts halfway up a
 * slope is judged no more harshly than the middle of one, because the track it
 * connects to has already been climbing.
 */
export function windowedGradePermille(riseLevels: number, runM: number, windowM: number): number {
  const run = runM > windowM ? runM : windowM;
  return (riseLevels * HEIGHT_STEP_M * 1000) / run;
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
 * Measure a route given as a tile sequence and the height the track runs at on
 * each of those tiles.
 *
 * The heights are passed in rather than read from the map, because a planned
 * bridge does not exist yet: its deck is eight levels above the water it
 * crosses, and asking the map would measure the river bed.
 */
export function measureRoute(
  tiles: readonly number[],
  heights: readonly number[],
  mapSize: number,
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

  const windowM = gradeWindowM(railType);

  for (let i = 0; i < directions.length; i++) {
    const direction = directions[i]!;
    lengthM += stepLengthM(direction);

    // Gradient over the window that ends at the tile just entered.
    let runM = 0;
    let back = i;
    while (back >= 0 && runM < windowM) {
      runM += stepLengthM(directions[back]!);
      back--;
    }
    const grade = Math.abs(
      windowedGradePermille(heights[i + 1]! - heights[back + 1]!, runM, windowM),
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
