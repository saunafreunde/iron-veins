import { MAX_TRAIN_OCCUPIED_TILES } from '../constants';
import { SignalKind } from '../map/signals';
import type { World } from '../World';
import { pathStepM } from './route';

/**
 * What a train claims, and when it lets go (section 9).
 *
 * A train owns a contiguous run of its own route: from the tile its tail is
 * still on, forward to the tile before the next signal. It claims that run all
 * or nothing - it either takes every tile or writes nothing at all - and it
 * releases from behind as its tail clears.
 *
 * All-or-nothing is not tidiness. A partial claim that then fails leaves tiles
 * owned by a train that never entered them, which is a deadlock nobody can
 * reproduce and nothing detects. Because a claim always covers the train's own
 * body as well as the run ahead, two trains can never hold the same tile even
 * transiently - which is in turn what makes the load-time rebuild of the table
 * a sound check rather than a guess.
 *
 * Everything here runs inside the tick: plain `for` loops, no allocation.
 */

/**
 * First route index the train's body still occupies.
 *
 * Walks back from the head accumulating step lengths until the train's own
 * length is covered - the same idiom the gradient window uses. `lengthM` is a
 * cached aggregate, so this costs no catalogue lookup.
 *
 * Right after a repath, `pathIndex` is 0 and the tiles the body still stands on
 * lie behind the start of the new route, so this clamps to 0 and the train
 * briefly under-claims its own tail. That is deliberate: a train is always
 * standing still when it is given a new route, and M3 already let a following
 * train drive through a standing one (DECISIONS.md D-058).
 */
export function tailIndex(world: World, id: number): number {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const size = world.map.size;
  const head = vehicles.pathIndex[id]!;

  let behind = vehicles.progressM[id]!;
  const bodyM = vehicles.lengthM[id]!;
  let index = head;

  for (let step = 0; step < MAX_TRAIN_OCCUPIED_TILES && index > 0 && behind < bodyM; step++) {
    index--;
    behind += pathStepM(path, index, size);
  }
  return index;
}

/**
 * Last route index of the section that begins at `from`: the tile just before
 * the next signal, or the end of the route.
 */
export function sectionEnd(world: World, id: number, from: number): number {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const last = vehicles.pathLength[id]! - 1;
  const signal = world.map.signal;

  let end = from;
  while (end < last && signal[path[end + 1]!] === SignalKind.None) end++;
  return end;
}

/**
 * Claim from the train's tail through to the end of the section beginning at
 * `from`. Returns false and writes nothing when any tile is held by somebody
 * else.
 */
export function tryClaim(world: World, id: number, from: number): boolean {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const reservations = world.reservations;

  const first = tailIndex(world, id);
  const last = sectionEnd(world, id, from);

  for (let index = first; index <= last; index++) {
    if (!reservations.freeFor(path[index]!, id)) return false;
  }
  for (let index = first; index <= last; index++) {
    reservations.set(path[index]!, id);
  }

  vehicles.reservedFromIndex[id] = first;
  vehicles.reservedToIndex[id] = last;
  return true;
}

/** Let go of everything the train's tail has already left behind. */
export function releaseBehind(world: World, id: number): void {
  const vehicles = world.vehicles;
  if (vehicles.reservedToIndex[id]! < 0) return;

  const path = vehicles.paths[id]!;
  const reservations = world.reservations;
  const tail = tailIndex(world, id);

  let from = vehicles.reservedFromIndex[id]!;
  while (from < tail) {
    reservations.clearIfOwnedBy(path[from]!, id);
    from++;
  }
  vehicles.reservedFromIndex[id] = from;
}

/**
 * Give up the whole claim. Called wherever a route is abandoned - a repath, new
 * orders, arrival, being sold - because a claim outliving its route locks a
 * section for the rest of the game and presents as a pathfinding bug.
 */
export function releaseAll(world: World, id: number): void {
  const vehicles = world.vehicles;
  const to = vehicles.reservedToIndex[id]!;
  if (to < 0) return;

  const path = vehicles.paths[id]!;
  const reservations = world.reservations;
  for (let index = vehicles.reservedFromIndex[id]!; index <= to; index++) {
    reservations.clearIfOwnedBy(path[index]!, id);
  }
  vehicles.reservedFromIndex[id] = -1;
  vehicles.reservedToIndex[id] = -1;
}
