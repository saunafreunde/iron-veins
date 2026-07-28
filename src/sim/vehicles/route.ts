import { TILE_DIAGONAL_M, TILE_SIZE_M } from '../constants';
import { directionFromDelta, type TrackDir } from '../map/track';

/**
 * Reading a computed route.
 *
 * These three live apart from the vehicle update loop only so that the
 * reservation logic can use them without importing it back - one definition of
 * "how long is this step" is what keeps the physics, the reservations and the
 * renderer from ever disagreeing about where a train is.
 */

/** Ground distance of the route step that starts at `index`. [m] */
export function pathStepM(path: Int32Array, index: number, size: number): number {
  const from = path[index]!;
  const to = path[index + 1]!;
  const dx = (to % size) - (from % size);
  const dy = ((to / size) | 0) - ((from / size) | 0);
  return dx !== 0 && dy !== 0 ? TILE_DIAGONAL_M : TILE_SIZE_M;
}

/** Direction of the route step that starts at `index`. */
export function pathDirection(path: Int32Array, index: number, size: number): TrackDir {
  const from = path[index]!;
  const to = path[index + 1]!;
  return directionFromDelta((to % size) - (from % size), ((to / size) | 0) - ((from / size) | 0));
}

/** Total ground distance of a route that has just been written. [m] */
export function routeLengthM(path: Int32Array, length: number, size: number): number {
  let total = 0;
  for (let i = 0; i + 1 < length; i++) total += pathStepM(path, i, size);
  return total;
}
