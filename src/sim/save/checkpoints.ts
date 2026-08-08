import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import type { CommandQueue } from '../commands/queue';
import { CHECKPOINT_INTERVAL_TICKS, CHECKPOINT_RING_CAPACITY } from '../constants';
import { hashWorld, World } from '../World';
import { parseWorldState, SaveCorruptionError, type Checkpoint } from './format';

/**
 * The checkpoint ring of SPEC2 M16 - ONE mechanism for three jobs.
 *
 * A checkpoint is the whole world at a year boundary, encoded with the codec
 * the save itself uses. That single object serves:
 *
 *  - **scrubbing**: a replay jumps to a year by restoring its checkpoint and
 *    re-simulating the remainder, instead of re-running the game from 1950;
 *  - **tail verification**: the newest checkpoint plus the log after it is all
 *    a build needs to check that a recording really ends where it claims;
 *  - **log compaction**: everything before the oldest kept checkpoint is
 *    replayable from that checkpoint, so it may be TRIMMED - which is what
 *    finally bounds the command log the M10 audit flagged as unbounded.
 *
 * Two properties are worth stating because they are load bearing:
 *
 * **The payload is compressed at record time.** Sixteen live states of a 1024
 * map are hundreds of megabytes; sixteen compressed ones are single-digit
 * megabytes. Measured on the 25-year AI game (256 map, three competitors) one
 * payload is 25-39 kB against 1.2 MB of raw MessagePack, and encoding it costs
 * 24-41 ms - a once-a-game-year price on the save path, never inside `tick()`.
 *
 * **The oldest entry is never evicted.** It is the tick the retained log
 * starts from; dropping it would orphan every command before the second
 * checkpoint and leave a recording that begins at a world nobody holds.
 * Eviction therefore takes the second-oldest entry, so a long game keeps its
 * base plus the newest `CHECKPOINT_RING_CAPACITY - 1` years.
 */
export class CheckpointRing {
  private readonly entries: Checkpoint[] = [];

  /** The ring, oldest first. */
  get all(): readonly Checkpoint[] {
    return this.entries;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Tick of the oldest checkpoint, or -1 for an empty ring. */
  get baseTick(): number {
    return this.entries[0]?.tick ?? -1;
  }

  /** Tick of the newest checkpoint, or -1 for an empty ring. */
  get newestTick(): number {
    return this.entries[this.entries.length - 1]?.tick ?? -1;
  }

  /** Compressed bytes the ring occupies - the memory price of the ring. */
  get byteLength(): number {
    let total = 0;
    for (let i = 0; i < this.entries.length; i++) total += this.entries[i]!.payload.byteLength;
    return total;
  }

  /** Replace the contents, e.g. when loading a save or a replay. */
  load(entries: readonly Checkpoint[]): void {
    this.entries.length = 0;
    for (let i = 0; i < entries.length; i++) this.entries.push(entries[i]!);
  }

  /**
   * Record the world as a checkpoint, if its tick is a year boundary the ring
   * does not already hold. Returns the entry that was written, or null.
   *
   * Idempotent by tick on purpose: the scheduler calls this after every step
   * AND after adopting a loaded world, and a world loaded exactly on a year
   * boundary must not push a duplicate of a checkpoint it just read.
   */
  record(world: World): Checkpoint | null {
    if (world.tick % CHECKPOINT_INTERVAL_TICKS !== 0) return null;
    if (this.entries.some((entry) => entry.tick === world.tick)) return null;
    if (world.tick < this.newestTick) {
      // The same class of mistake `CommandQueue.enqueue` refuses, and the same
      // answer: a recording written out of order is not a recording.
      throw new Error(
        `CheckpointRing: tick ${world.tick} is older than the newest checkpoint ` +
          `${this.newestTick}; the ring is ordered`,
      );
    }

    const entry = encodeCheckpoint(world);
    this.entries.push(entry);
    // Never entry 0: the base is what makes the retained log reachable. A ring
    // read from a file written under a larger capacity collapses to this one
    // here, which is the right way round - the budget belongs to this build.
    while (this.entries.length > CHECKPOINT_RING_CAPACITY && this.entries.length > 1) {
      this.entries.splice(1, 1);
    }
    return entry;
  }

  /** The newest checkpoint at or before `tick`, or null. */
  bestFor(tick: number): Checkpoint | null {
    let found: Checkpoint | null = null;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      if (entry.tick <= tick) found = entry;
    }
    return found;
  }

  /** The checkpoint standing exactly at `tick`, or null. */
  at(tick: number): Checkpoint | null {
    return this.entries.find((entry) => entry.tick === tick) ?? null;
  }

  /** Drop every checkpoint older than `tick`. Returns how many went. */
  dropBefore(tick: number): number {
    let dropped = 0;
    while (dropped < this.entries.length && this.entries[dropped]!.tick < tick) dropped++;
    if (dropped > 0) this.entries.splice(0, dropped);
    return dropped;
  }
}

/** Encode the world as a checkpoint payload plus its digest. */
export function encodeCheckpoint(world: World): Checkpoint {
  return {
    tick: world.tick,
    worldDigest: hashWorld(world),
    payload: zlibSync(encode(world.toData()), { level: 6 }),
  };
}

/**
 * Rebuild the world a checkpoint holds.
 *
 * The digest is verified HERE rather than at load time: opening a save must
 * not decompress a history nobody asked to see, and a checkpoint that fails
 * its own digest is a corrupt file in exactly the sense D-130 gave the word.
 */
export function restoreCheckpoint(entry: Checkpoint): World {
  let payload: unknown;
  try {
    payload = decode(unzlibSync(entry.payload));
  } catch (error) {
    throw new SaveCorruptionError(
      `checkpoint at tick ${entry.tick} could not be decoded: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      'save.checkpoints',
    );
  }

  const world = World.fromData(parseWorldState(payload, `checkpoint@${entry.tick}.state`));
  if (world.tick !== entry.tick) {
    throw new SaveCorruptionError(
      `checkpoint claims tick ${entry.tick} but holds a world at tick ${world.tick}`,
      'save.checkpoints',
    );
  }
  const actual = hashWorld(world);
  if (actual !== entry.worldDigest) {
    throw new SaveCorruptionError(
      `checkpoint at tick ${entry.tick} hashes to ${actual} but the file says ` +
        `${entry.worldDigest} - the recording is corrupt`,
      'save.checkpoints',
    );
  }
  return world;
}

/**
 * Trim the command log at a checkpoint - the legal save variant of SPEC2 M16.
 *
 * Everything before `tick` becomes unreachable by design: the recording now
 * begins at that checkpoint, and both halves of that statement are written
 * down (the queue's base tick and the ring's oldest entry), because a log that
 * has forgotten where it starts cannot be replayed honestly.
 *
 * This is a one-way door and deliberately never automatic: the price of the
 * bound is that the game can no longer be replayed from its first day.
 */
export function trimLogAtCheckpoint(
  queue: CommandQueue,
  ring: CheckpointRing,
  tick: number,
): number {
  if (ring.at(tick) === null) {
    throw new Error(
      `trimLogAtCheckpoint: no checkpoint stands at tick ${tick}; the log would start at a ` +
        'world nobody holds',
    );
  }
  ring.dropBefore(tick);
  return queue.trimBefore(tick);
}

/** Trim at the newest checkpoint there is - the maximal compaction. */
export function trimLogAtNewestCheckpoint(queue: CommandQueue, ring: CheckpointRing): number {
  const tick = ring.newestTick;
  if (tick <= 0) return 0;
  return trimLogAtCheckpoint(queue, ring, tick);
}
