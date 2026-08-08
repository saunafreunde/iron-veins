import { MAX_BLOCK_CLAIM_TILES, MAX_TRAIN_OCCUPIED_TILES } from '../constants';
import { claimsWholeBlock, signalKind, SignalKind } from '../map/signals';
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
 * A BLOCK signal claims more: every tile of the block ahead, whether the train
 * drives over it or not. That is the whole difference between the two families
 * of section 9.1, and it is why a station throat wants path signals - two
 * trains can cross the same junction on paths that never touch, but they cannot
 * share a block.
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
 * Working buffer for the tiles of one block.
 *
 * A block larger than this is a rail network of ten kilometres with no signal
 * in it, and a block signal on such a thing would be meaningless anyway; the
 * claim falls back to the path-style route range and says so in the log of the
 * decision, not silently. One shared buffer: claiming is never concurrent.
 */
const blockScratch = new Int32Array(MAX_BLOCK_CLAIM_TILES);

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
 *
 * The route end is the other safe stopping place section 9.2 names - a platform
 * or a depot is always where the route ends, because that is what the order
 * sent the train to.
 */
export function sectionEnd(world: World, id: number, from: number): number {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  const last = vehicles.pathLength[id]! - 1;
  const signal = world.map.signal;

  let end = from;
  while (end < last && signalKind(signal[path[end + 1]!]!) === SignalKind.None) end++;
  return end;
}

/**
 * Tiles of the block a claim beginning at route node `from` would take, into
 * {@link blockScratch}. Zero unless the tile carries a block signal.
 */
function claimedBlockTiles(world: World, id: number, from: number): number {
  const path = world.vehicles.paths[id]!;
  if (!claimsWholeBlock(signalKind(world.map.signal[path[from]!]!))) return 0;
  world.blocks.refresh(world.map);
  const collected = world.blocks.collectBlock(world.map, path[from]!, blockScratch);
  return collected < 0 ? 0 : collected;
}

/**
 * First tile of a claim over `first..last` (plus `blockTiles` entries of
 * {@link blockScratch}) that somebody OTHER than `id` holds, or -1.
 *
 * The whole test `tryClaim` makes before it writes anything, in one place -
 * so that the M15 deadlock detector can ask "who is refusing this train"
 * without a second opinion about what a refusal is.
 */
function firstForeignTile(
  world: World,
  id: number,
  first: number,
  last: number,
  blockTiles: number,
): number {
  const path = world.vehicles.paths[id]!;
  const reservations = world.reservations;
  for (let index = first; index <= last; index++) {
    if (!reservations.freeFor(path[index]!, id)) return path[index]!;
  }
  for (let i = 0; i < blockTiles; i++) {
    if (!reservations.freeFor(blockScratch[i]!, id)) return blockScratch[i]!;
  }
  return -1;
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
  // A block signal takes the whole block, not just the line through it.
  const blockTiles = claimedBlockTiles(world, id, from);

  if (firstForeignTile(world, id, first, last, blockTiles) >= 0) {
    holdBody(world, id, first);
    return false;
  }

  for (let index = first; index <= last; index++) reservations.set(path[index]!, id);
  for (let i = 0; i < blockTiles; i++) reservations.set(blockScratch[i]!, id);

  vehicles.reservedFromIndex[id] = first;
  vehicles.reservedToIndex[id] = last;
  if (blockTiles > 0) vehicles.reservedBlockTile[id] = path[from]!;
  return true;
}

/**
 * The tile that is stopping this train from getting any further, or -1.
 *
 * The edge of the M15 waiting graph, and it is deliberately the ANSWER
 * `tryClaim` would give rather than a second guess at it: the same range, the
 * same block collection, the same `freeFor` test. A train's next claim starts
 * one node past what it already holds (or one node past its head when it
 * holds nothing yet, which is where the tile-boundary gate asks), and the
 * first tile of that claim in somebody else's hands is what it is waiting
 * for.
 *
 * -1 covers every case that is not a refusal: a vehicle with no route, a
 * train at the end of one, and - importantly - a train standing still for a
 * reason nobody else caused. Those stay the plain 9.3 warning; only a
 * refusal by a NAMED other train can be part of a cycle.
 *
 * Shares `blockScratch` with the claim path above, which is sound for the
 * same reason the claim path may: neither claiming nor diagnosing is ever
 * concurrent, and the diagnosis runs on the news day, between ticks.
 */
export function refusedTile(world: World, id: number): number {
  const vehicles = world.vehicles;
  const length = vehicles.pathLength[id]!;
  if (length === 0) return -1;

  const held = vehicles.reservedToIndex[id]!;
  const from = held >= 0 ? held + 1 : vehicles.pathIndex[id]! + 1;
  if (from >= length) return -1;

  const first = tailIndex(world, id);
  const last = sectionEnd(world, id, from);
  return firstForeignTile(world, id, first, last, claimedBlockTiles(world, id, from));
}

/**
 * A train holds the ground it is standing on, always, signals or no signals.
 *
 * This is what stops two trains occupying one tile, and it is what "zero
 * collisions" means. Without it a train held at a red owns nothing, is
 * invisible to the train behind, and gets rolled onto - after which NEITHER can
 * claim again, because each one's own body is held by the other. They wait for
 * each other for ever and it presents as a signalling bug (DECISIONS.md D-073).
 *
 * A stopped train, and a train in a depot, hold nothing: several trains sharing
 * one depot tile is a legitimate state that this rule must not forbid. A train
 * takes its body the moment it starts moving, and if it cannot - because the
 * train it was parked behind has not left yet - it simply waits, which is what
 * it would do anyway.
 */
export function holdBody(world: World, id: number, from = -1): boolean {
  const vehicles = world.vehicles;
  const path = vehicles.paths[id]!;
  if (vehicles.pathLength[id]! === 0) return false;

  const first = from >= 0 ? from : tailIndex(world, id);
  const head = vehicles.pathIndex[id]!;
  const reservations = world.reservations;

  for (let index = first; index <= head; index++) {
    if (!reservations.freeFor(path[index]!, id)) return false;
  }
  for (let index = first; index <= head; index++) reservations.set(path[index]!, id);

  // Never shrink a claim that already runs further ahead.
  vehicles.reservedFromIndex[id] = first;
  if (vehicles.reservedToIndex[id]! < head) vehicles.reservedToIndex[id] = head;
  return true;
}

/**
 * Give back the block a train claimed once its tail has left it.
 *
 * The route range is re-stamped afterwards, because the block and the route
 * overlap and clearing the block would otherwise hand away the tiles the train
 * is standing on.
 */
function releaseBlockIfClear(world: World, id: number): void {
  const vehicles = world.vehicles;
  const claimed = vehicles.reservedBlockTile[id]!;
  if (claimed < 0) return;

  world.blocks.refresh(world.map);
  const here = vehicles.paths[id]![tailIndex(world, id)]!;
  if (world.blocks.blockAt(here) === world.blocks.blockAt(claimed)) return;

  const collected = world.blocks.collectBlock(world.map, claimed, blockScratch);
  for (let i = 0; i < collected; i++) {
    world.reservations.clearIfOwnedBy(blockScratch[i]!, id);
  }
  vehicles.reservedBlockTile[id] = -1;

  const path = vehicles.paths[id]!;
  const to = vehicles.reservedToIndex[id]!;
  for (let index = vehicles.reservedFromIndex[id]!; index <= to; index++) {
    world.reservations.set(path[index]!, id);
  }
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
  releaseBlockIfClear(world, id);
}

/**
 * Give up the whole claim. Called wherever a route is abandoned - a repath, new
 * orders, arrival, being sold - because a claim outliving its route locks a
 * section for the rest of the game and presents as a pathfinding bug.
 */
export function releaseAll(world: World, id: number): void {
  const vehicles = world.vehicles;
  const claimed = vehicles.reservedBlockTile[id]!;

  if (claimed >= 0) {
    world.blocks.refresh(world.map);
    const collected = world.blocks.collectBlock(world.map, claimed, blockScratch);
    for (let i = 0; i < collected; i++) {
      world.reservations.clearIfOwnedBy(blockScratch[i]!, id);
    }
    vehicles.reservedBlockTile[id] = -1;
  }

  const to = vehicles.reservedToIndex[id]!;
  if (to < 0) return;

  const path = vehicles.paths[id]!;
  for (let index = vehicles.reservedFromIndex[id]!; index <= to; index++) {
    world.reservations.clearIfOwnedBy(path[index]!, id);
  }
  vehicles.reservedFromIndex[id] = -1;
  vehicles.reservedToIndex[id] = -1;
}
