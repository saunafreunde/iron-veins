import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CHECKPOINT_INTERVAL_TICKS,
  CHECKPOINT_RING_CAPACITY,
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
} from '../../src/sim/constants';
import {
  CheckpointRing,
  encodeCheckpoint,
  restoreCheckpoint,
  trimLogAtCheckpoint,
  trimLogAtNewestCheckpoint,
} from '../../src/sim/save/checkpoints';
import { SaveCorruptionError, SAVE_VERSION } from '../../src/sim/save/format';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The checkpoint ring of SPEC2 M16 (DECISIONS.md D-188).
 *
 * One mechanism, three jobs - scrubbing, tail verification and log compaction -
 * so the tests here are about the mechanism: does a checkpoint appear at the
 * ticks it must, does it restore the world it recorded, does the ring stay
 * bounded without losing the entry the log hangs from, and does a trimmed log
 * still carry a game that runs on identically.
 */

const GAME_VERSION = '0.1.0';
const MAP_SIZE = 128;
const SEED = 606_060;

/** A small world with a couple of commands in its log. */
function playedGame(ticks: number): { world: World; queue: CommandQueue; ring: CheckpointRing } {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Ringbahn',
    companyColorIndex: 3,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 3 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Ringbahn AG' }, 5_000);
  queue.enqueue(
    { kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT },
    CHECKPOINT_INTERVAL_TICKS + 400,
  );

  const ring = new CheckpointRing();
  ring.record(world);
  for (let i = 0; i < ticks; i++) {
    world.step(queue, null);
    ring.record(world);
  }
  return { world, queue, ring };
}

describe('the checkpoint ring records a year at a time', () => {
  it('writes a checkpoint at tick 0 and at every year boundary, and nowhere else', () => {
    const { ring } = playedGame(CHECKPOINT_INTERVAL_TICKS * 2 + 500);

    expect(ring.all.map((entry) => entry.tick)).toEqual([
      0,
      CHECKPOINT_INTERVAL_TICKS,
      CHECKPOINT_INTERVAL_TICKS * 2,
    ]);
    expect(ring.baseTick).toBe(0);
    expect(ring.newestTick).toBe(CHECKPOINT_INTERVAL_TICKS * 2);
  });

  it('refuses a tick that is not a year boundary, and never records one twice', () => {
    const world = World.create({
      seed: SEED,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: MAP_SIZE,
      companyName: 'Ringbahn',
      companyColorIndex: 3,
    });
    const ring = new CheckpointRing();

    expect(ring.record(world)).not.toBeNull();
    // Idempotent by tick: the scheduler records after every step AND after
    // adopting a loaded world, and a world loaded on a boundary must not push
    // a duplicate of the checkpoint it just read.
    expect(ring.record(world)).toBeNull();

    world.tick = CHECKPOINT_INTERVAL_TICKS - 1;
    expect(ring.record(world)).toBeNull();
    world.tick = CHECKPOINT_INTERVAL_TICKS;
    expect(ring.record(world)).not.toBeNull();
    expect(ring.size).toBe(2);
  });

  it('stays bounded and never evicts the entry the log hangs from', () => {
    // The ring policy is arithmetic over ticks, so it is driven over ticks:
    // stepping twenty game years to prove an eviction rule would be a minute
    // of CPU for a property that never looks at the world.
    const { world } = playedGame(0);
    const ring = new CheckpointRing();
    for (let year = 0; year <= CHECKPOINT_RING_CAPACITY + 3; year++) {
      world.tick = year * CHECKPOINT_INTERVAL_TICKS;
      ring.record(world);
    }

    expect(ring.size).toBe(CHECKPOINT_RING_CAPACITY);
    // The base survives; what goes is the second oldest, so the ring holds the
    // genesis plus the newest capacity-1 years. Four years were recorded over
    // the capacity, so the four after the genesis are the ones that went -
    // year five is the oldest survivor whatever the capacity is.
    expect(ring.baseTick).toBe(0);
    expect(ring.newestTick).toBe((CHECKPOINT_RING_CAPACITY + 3) * CHECKPOINT_INTERVAL_TICKS);
    expect(ring.all[1]!.tick).toBe(5 * CHECKPOINT_INTERVAL_TICKS);
  });

  it('answers with the newest checkpoint at or before a tick', () => {
    const { ring } = playedGame(CHECKPOINT_INTERVAL_TICKS * 2 + 500);

    expect(ring.bestFor(0)!.tick).toBe(0);
    expect(ring.bestFor(CHECKPOINT_INTERVAL_TICKS - 1)!.tick).toBe(0);
    expect(ring.bestFor(CHECKPOINT_INTERVAL_TICKS * 2 + 10_000)!.tick).toBe(
      CHECKPOINT_INTERVAL_TICKS * 2,
    );
    expect(ring.at(CHECKPOINT_INTERVAL_TICKS)!.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(ring.at(1)).toBeNull();
    expect(new CheckpointRing().bestFor(1_000)).toBeNull();
  });
});

describe('a checkpoint restores the world it recorded', () => {
  it('rebuilds a bit-identical world', () => {
    const { world } = playedGame(CHECKPOINT_INTERVAL_TICKS + 120);
    const entry = encodeCheckpoint(world);
    const restored = restoreCheckpoint(entry);

    expect(restored.tick).toBe(world.tick);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(entry.worldDigest).toBe(hashWorld(world));
  });

  it('is compressed, and by a large factor', () => {
    const { world, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 120);
    const raw = encode(world.toData()).byteLength;
    const entry = ring.at(CHECKPOINT_INTERVAL_TICKS)!;

    // The measured shape of the thing (D-188): a whole world costs tens of
    // kilobytes, not the megabyte its raw MessagePack is - which is what makes
    // keeping sixteen of them a bounded price rather than a memory leak.
    console.log(
      `checkpoint on a ${MAP_SIZE} map: ${entry.payload.byteLength} B compressed of ${raw} B raw; ` +
        `ring of ${ring.size} = ${ring.byteLength} B`,
    );
    expect(entry.payload.byteLength).toBeLessThan(raw / 4);
    expect(ring.byteLength).toBeGreaterThan(0);
  });

  it('refuses a payload that no longer hashes to its digest', () => {
    const { world } = playedGame(0);
    const entry = encodeCheckpoint(world);
    const wrong = { ...entry, worldDigest: '0123456789abcdef' };

    expect(() => restoreCheckpoint(wrong)).toThrow(SaveCorruptionError);
    expect(() => restoreCheckpoint(wrong)).toThrow(/hashes to/);
  });

  it('refuses bytes that are not a world at all', () => {
    const { world } = playedGame(0);
    const entry = encodeCheckpoint(world);

    expect(() => restoreCheckpoint({ ...entry, payload: new Uint8Array([1, 2, 3, 4]) })).toThrow(
      SaveCorruptionError,
    );
  });

  it('refuses a payload whose world stands at another tick', () => {
    const { world } = playedGame(0);
    const entry = encodeCheckpoint(world);

    expect(() => restoreCheckpoint({ ...entry, tick: CHECKPOINT_INTERVAL_TICKS })).toThrow(
      /holds a world at tick/,
    );
  });
});

describe('the ring travels in the save container', () => {
  it('survives a save round trip byte for byte', () => {
    const { world, queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 700);
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION, ring));

    expect(loaded.ring.all.map((entry) => entry.tick)).toEqual([0, CHECKPOINT_INTERVAL_TICKS]);
    for (let i = 0; i < ring.size; i++) {
      expect(loaded.ring.all[i]!.worldDigest).toBe(ring.all[i]!.worldDigest);
      expect(loaded.ring.all[i]!.payload).toEqual(ring.all[i]!.payload);
    }
    // And the restored checkpoint is still the world it was, after the trip.
    const restored = restoreCheckpoint(loaded.ring.at(CHECKPOINT_INTERVAL_TICKS)!);
    expect(hashWorld(restored)).toBe(ring.at(CHECKPOINT_INTERVAL_TICKS)!.worldDigest);
    expect(loaded.saveVersion).toBe(SAVE_VERSION);
    expect(loaded.replay).toBeNull();
  });

  it('gives a save written without a ring an empty one', () => {
    const { world, queue } = playedGame(200);
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));

    expect(loaded.ring.size).toBe(0);
    expect(loaded.queue.baseTick).toBe(0);
  });

  it('refuses a ring the log cannot hang from', () => {
    const { world, queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 700);
    const payload = decode(unzlibSync(encodeSave(world, queue, GAME_VERSION, ring))) as Record<
      string,
      unknown
    >;
    payload['logBaseTick'] = 5_000;

    expect(() => decodeSave(zlibSync(encode(payload)))).toThrow(/no checkpoint stands there/);
  });

  it('refuses a log base past the world it is saved with', () => {
    const { world, queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 700);
    const payload = decode(unzlibSync(encodeSave(world, queue, GAME_VERSION, ring))) as Record<
      string,
      unknown
    >;
    payload['logBaseTick'] = CHECKPOINT_INTERVAL_TICKS * 2;

    expect(() => decodeSave(zlibSync(encode(payload)))).toThrow(/is outside 0\.\./);
  });

  it('refuses a checkpoint that is not on a year boundary', () => {
    const { world, queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 700);
    const payload = decode(unzlibSync(encodeSave(world, queue, GAME_VERSION, ring))) as Record<
      string,
      unknown
    >;
    const entries = payload['checkpoints'] as Record<string, unknown>[];
    entries[1]!['tick'] = CHECKPOINT_INTERVAL_TICKS + 1;

    expect(() => decodeSave(zlibSync(encode(payload)))).toThrow(/is not a multiple of/);
  });
});

describe('trimming the log at a checkpoint', () => {
  it('drops the commands before it and records where the log now starts', () => {
    const { queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 1_000);
    const before = queue.log.length;

    const dropped = trimLogAtCheckpoint(queue, ring, CHECKPOINT_INTERVAL_TICKS);

    expect(dropped).toBe(2); // the loan at tick 0 and the rename at 5,000
    expect(queue.log.length).toBe(before - dropped);
    expect(queue.baseTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(queue.executedCount).toBe(queue.log.length);
    // The ring loses what the log lost: the base is the checkpoint the
    // recording now begins at.
    expect(ring.all.map((entry) => entry.tick)).toEqual([CHECKPOINT_INTERVAL_TICKS]);
  });

  it('refuses to trim where no checkpoint stands', () => {
    const { queue, ring } = playedGame(CHECKPOINT_INTERVAL_TICKS + 1_000);
    expect(() => trimLogAtCheckpoint(queue, ring, 5_000)).toThrow(/no checkpoint stands/);
    expect(queue.baseTick).toBe(0);
  });

  it('does nothing to a game that has no checkpoint but its genesis', () => {
    const { queue, ring } = playedGame(500);
    expect(trimLogAtNewestCheckpoint(queue, ring)).toBe(0);
    expect(queue.baseTick).toBe(0);
    expect(ring.size).toBe(1);
  });

  it('leaves a save that loads and runs on identically', () => {
    // The point of the whole exercise: a trimmed log is a LEGAL save, not a
    // damaged one. Two games diverging here would mean the compaction dropped
    // something the simulation still needed.
    const untrimmed = playedGame(CHECKPOINT_INTERVAL_TICKS + 1_000);
    const trimmed = playedGame(CHECKPOINT_INTERVAL_TICKS + 1_000);
    trimLogAtCheckpoint(trimmed.queue, trimmed.ring, CHECKPOINT_INTERVAL_TICKS);

    const a = decodeSave(
      encodeSave(untrimmed.world, untrimmed.queue, GAME_VERSION, untrimmed.ring),
    );
    const b = decodeSave(encodeSave(trimmed.world, trimmed.queue, GAME_VERSION, trimmed.ring));

    expect(b.queue.baseTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(b.queue.log.length).toBeLessThan(a.queue.log.length);
    expect(hashWorld(b.world)).toBe(hashWorld(a.world));

    for (let i = 0; i < 3_000; i++) {
      a.world.step(a.queue, null);
      b.world.step(b.queue, null);
    }
    expect(hashWorld(b.world)).toBe(hashWorld(a.world));
  });

  it('makes the save smaller than the one that kept everything', () => {
    const kept = playedGame(CHECKPOINT_INTERVAL_TICKS * 2 + 1_000);
    const compacted = playedGame(CHECKPOINT_INTERVAL_TICKS * 2 + 1_000);
    trimLogAtNewestCheckpoint(compacted.queue, compacted.ring);

    const keptBytes = encodeSave(kept.world, kept.queue, GAME_VERSION, kept.ring).byteLength;
    const compactedBytes = encodeSave(
      compacted.world,
      compacted.queue,
      GAME_VERSION,
      compacted.ring,
    ).byteLength;

    console.log(
      `save with the whole ring ${keptBytes} B, compacted to one checkpoint ${compactedBytes} B`,
    );
    expect(compacted.ring.size).toBe(1);
    expect(compactedBytes).toBeLessThan(keptBytes);
  });
});
