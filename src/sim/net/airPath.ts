import type { TileMap } from '../map/TileMap';

/**
 * The straight line an aircraft flies (section 8.4: "direct flight").
 *
 * There is no search here and there is nothing to search: an aircraft goes from
 * one airport to the other over whatever is in between. What this does produce
 * is a path of ADJACENT tiles, which is the whole reason it exists - every piece
 * of machinery downstream measures a step from the delta between two path
 * entries, walks one tile per boundary crossing, and sends (tile, next tile,
 * progress) to the renderer. Handing it two endpoints instead would mean a
 * second motion model, a second snapshot shape and a second thing to keep
 * correct (DECISIONS.md D-098).
 *
 * The line is a Bresenham walk in eight directions, so a diagonal really is one
 * step and `pathStepM` charges it the diagonal length.
 */
export function flightPath(
  map: TileMap,
  fromTile: number,
  toTile: number,
  out: Int32Array,
): number {
  const size = map.size;
  let x = fromTile % size;
  let y = (fromTile / size) | 0;
  const targetX = toTile % size;
  const targetY = (toTile / size) | 0;

  const stepX = targetX === x ? 0 : targetX > x ? 1 : -1;
  const stepY = targetY === y ? 0 : targetY > y ? 1 : -1;
  let remainingX = Math.abs(targetX - x);
  let remainingY = Math.abs(targetY - y);

  let length = 0;
  out[length++] = fromTile;

  // Walk the diagonal part first and the straight remainder after it. Which
  // order is chosen does not change the LENGTH - both are the octile distance -
  // and doing the diagonal first keeps the track over the ground closer to the
  // straight line a passenger would expect to see.
  while (remainingX > 0 || remainingY > 0) {
    if (length >= out.length) return 0;
    if (remainingX > 0 && remainingY > 0) {
      x += stepX;
      y += stepY;
      remainingX--;
      remainingY--;
    } else if (remainingX > 0) {
      x += stepX;
      remainingX--;
    } else {
      y += stepY;
      remainingY--;
    }
    out[length++] = y * size + x;
  }
  return length;
}
