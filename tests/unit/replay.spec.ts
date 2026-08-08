import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CHECKPOINT_INTERVAL_TICKS,
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
} from '../../src/sim/constants';
import { CheckpointRing, trimLogAtCheckpoint } from '../../src/sim/save/checkpoints';
import { REPLAY_EXTENSION, SAVE_MAGIC, SAVE_VERSION } from '../../src/sim/save/format';
import {
  encodeReplay,
  replayGenesis,
  replayRefusal,
  replayStartAt,
  ReplayVersionError,
  verifyReplay,
} from '../../src/sim/save/replay';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The `.ironreplay` format of SPEC2 M16 (DECISIONS.md D-188).
 *
 * A replay is the save container with the world at the tick its retained log
 * starts from, `commandsExecuted = 0`, and a claim about where the recording
 * ends. Everything below is that claim being tested from both sides: a
 * re-simulation that reaches it, a re-simulation from a checkpoint that
 * reaches the same thing, and a build that refuses to judge a recording it did
 * not make (E-11, D-131).
 */

const GAME_VERSION = '0.1.0';
const OTHER_VERSION = '0.0.9';
const MAP_SIZE = 128;
const SEED = 515_151;
const PLAYED_TICKS = CHECKPOINT_INTERVAL_TICKS + 1_000;

interface Game {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly ring: CheckpointRing;
}

/** One game year and a bit, with commands before and after the year boundary. */
function play(ticks = PLAYED_TICKS): Game {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Wiederholbahn',
    companyColorIndex: 1,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 4 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Wiederholbahn AG' }, 5_000);
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

/** The recorded game, played once and exported once - every test decodes it. */
let recorded: { bytes: Uint8Array; finalHash: string; finalTick: number } | null = null;
function replayBytes(): { bytes: Uint8Array; finalHash: string; finalTick: number } {
  if (recorded === null) {
    const game = play();
    recorded = {
      bytes: encodeReplay(game.world, game.queue, game.ring, GAME_VERSION),
      finalHash: hashWorld(game.world),
      finalTick: game.world.tick,
    };
  }
  return recorded;
}

/** Decode a replay, change its raw payload, re-encode: a manipulated recording. */
function tampered(mutate: (payload: Record<string, unknown>) => void): Uint8Array {
  const payload = decode(unzlibSync(replayBytes().bytes)) as Record<string, unknown>;
  mutate(payload);
  return zlibSync(encode(payload));
}

describe('a replay is the save container with the recording settled', () => {
  it('holds the world the log starts from, with nothing executed', () => {
    const { bytes, finalHash, finalTick } = replayBytes();
    const loaded = decodeSave(bytes);

    expect(REPLAY_EXTENSION).toBe('.ironreplay');
    expect(loaded.world.tick).toBe(0);
    expect(loaded.queue.baseTick).toBe(0);
    expect(loaded.queue.executedCount).toBe(0);
    expect(loaded.queue.pendingCount).toBe(loaded.queue.log.length);
    expect(loaded.queue.log.length).toBe(3);
    expect(loaded.replay).toEqual({ finalTick, finalHash });
    // The ring travels whole: the genesis it starts from and the year it
    // passed through.
    expect(loaded.ring.all.map((entry) => entry.tick)).toEqual([0, CHECKPOINT_INTERVAL_TICKS]);
  });

  it('starts from the genesis checkpoint rather than a reconstruction', () => {
    // The state a replay carries IS the genesis checkpoint's world, so the
    // container digest that decodeSave verifies covers it.
    const loaded = decodeSave(replayBytes().bytes);
    expect(hashWorld(loaded.world)).toBe(loaded.ring.at(0)!.worldDigest);
  });
});

describe('verification re-simulates and compares', () => {
  it('reaches the hash the recording claims', () => {
    const loaded = decodeSave(replayBytes().bytes);
    const result = verifyReplay(loaded, GAME_VERSION);

    expect(result.ok).toBe(true);
    expect(result.firstDivergentTick).toBe(-1);
    expect(result.startedAtTick).toBe(0);
    // Compared at the year checkpoint on the way AND at the end - the ring is
    // what gives a divergence a year rather than only a verdict.
    expect(result.checkedTicks).toEqual([CHECKPOINT_INTERVAL_TICKS, replayBytes().finalTick]);
  });

  it('names the first checkpoint a manipulated log diverges at', () => {
    // The loan at tick 0 is doubled: the world is different from the first
    // month on, and the year checkpoint is the first hash that says so.
    const bytes = tampered((payload) => {
      const log = payload['commandLog'] as Record<string, unknown>[];
      const command = log[0]!['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 2;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    expect(result.firstDivergentTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it('catches a manipulation past the last checkpoint at the final tick', () => {
    const bytes = tampered((payload) => {
      const log = payload['commandLog'] as Record<string, unknown>[];
      const command = log[2]!['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 3;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    // The running comparison finds it at the recorded end - that is the last
    // hash the recording commits to. The bracket back to the year checkpoint
    // holds exactly one command, so B2's narrowing turns that into the tick
    // the repayment actually runs at (D-189).
    expect(result.checkedTicks).toContain(replayBytes().finalTick);
    expect(result.lastMatchingTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(result.firstDivergentTick).toBe(CHECKPOINT_INTERVAL_TICKS + 400);
    expect(result.exact).toBe(true);
  });

  it('refuses a file that claims no end at all', () => {
    const game = play(500);
    const loaded = decodeSave(encodeSave(game.world, game.queue, GAME_VERSION, game.ring));
    expect(() => verifyReplay(loaded, GAME_VERSION)).toThrow(/nothing to verify/);
  });
});

describe('a re-simulation from a checkpoint is the same world', () => {
  it('reaches the recorded hash from the year checkpoint, without replaying the year', () => {
    const { bytes, finalTick, finalHash } = replayBytes();
    const loaded = decodeSave(bytes);

    const fromCheckpoint = replayStartAt(loaded, CHECKPOINT_INTERVAL_TICKS);
    expect(fromCheckpoint.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
    // The command stamped with the checkpoint's own tick is still due: a
    // checkpoint holds the world BEFORE that tick ran.
    expect(fromCheckpoint.queue.executedCount).toBe(2);

    while (fromCheckpoint.world.tick < finalTick)
      fromCheckpoint.world.step(fromCheckpoint.queue, null);
    expect(hashWorld(fromCheckpoint.world)).toBe(finalHash);

    // ... and it is the same world the long way round reaches.
    const fromZero = replayStartAt(decodeSave(bytes), 0);
    expect(fromZero.world.tick).toBe(0);
    while (fromZero.world.tick < finalTick) fromZero.world.step(fromZero.queue, null);
    expect(hashWorld(fromZero.world)).toBe(hashWorld(fromCheckpoint.world));
  });

  it('picks the newest checkpoint at or before the tick asked for', () => {
    const loaded = decodeSave(replayBytes().bytes);
    expect(replayStartAt(loaded, CHECKPOINT_INTERVAL_TICKS - 1).world.tick).toBe(0);
    expect(replayStartAt(decodeSave(replayBytes().bytes), 500_000).world.tick).toBe(
      CHECKPOINT_INTERVAL_TICKS,
    );
  });

  it('rebuilds the genesis of a recording that has no checkpoint for it', () => {
    // The pre-M16 path: a game whose ring is empty is still replayable from
    // tick 0, because every world rule, the seed and the map are saved state.
    const game = play(300);
    const genesis = replayGenesis(game.world);

    expect(genesis.tick).toBe(0);
    expect(hashWorld(genesis)).toBe(game.ring.at(0)!.worldDigest);
  });

  it('replays a save that carries no ring at all from its reconstructed genesis', () => {
    const game = play(2_000);
    const loaded = decodeSave(encodeSave(game.world, game.queue, GAME_VERSION));
    expect(loaded.ring.size).toBe(0);

    const start = replayStartAt(loaded, 0);
    expect(start.world.tick).toBe(0);
    while (start.world.tick < game.world.tick) start.world.step(start.queue, null);
    expect(hashWorld(start.world)).toBe(hashWorld(game.world));
  });
});

describe('a compacted recording replays from its base', () => {
  it('verifies from the checkpoint the trimmed log starts at', () => {
    const game = play();
    trimLogAtCheckpoint(game.queue, game.ring, CHECKPOINT_INTERVAL_TICKS);
    const bytes = encodeReplay(game.world, game.queue, game.ring, GAME_VERSION);
    const loaded = decodeSave(bytes);

    // The replay now BEGINS at the year checkpoint: its state is that world,
    // its log is what came after, and nothing claims the first year exists.
    expect(loaded.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(loaded.queue.baseTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(loaded.queue.log.length).toBe(1);
    expect(loaded.ring.all.map((entry) => entry.tick)).toEqual([CHECKPOINT_INTERVAL_TICKS]);

    const result = verifyReplay(loaded, GAME_VERSION);
    expect(result.ok).toBe(true);
    expect(result.startedAtTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(result.expectedHash).toBe(hashWorld(game.world));
  });
});

describe('replay validity is pinned to the version that recorded it', () => {
  it('refuses a recording from an older save format, naming both versions', () => {
    // A version 26 container around today's state is what the v26 build
    // wrote; loading it is legitimate and migrates, VERIFYING it is not.
    const game = play(400);
    const v26 = {
      magic: SAVE_MAGIC,
      saveVersion: 26,
      gameVersion: GAME_VERSION,
      seed: game.world.seed,
      tick: game.world.tick,
      worldDigest: hashWorld(game.world),
      state: game.world.toData(),
      commandLog: game.queue.log,
      commandsExecuted: game.queue.executedCount,
    };
    const loaded = decodeSave(zlibSync(encode(v26)));

    expect(loaded.saveVersion).toBe(26);
    expect(loaded.ring.size).toBe(0);
    expect(() => verifyReplay(loaded, GAME_VERSION)).toThrow(ReplayVersionError);
    expect(() => verifyReplay(loaded, GAME_VERSION)).toThrow(/save format 26/);
    expect(() => verifyReplay(loaded, GAME_VERSION)).toThrow(
      new RegExp(`save format ${SAVE_VERSION}`),
    );
    expect(() => verifyReplay(loaded, GAME_VERSION)).toThrow(/refused across versions/);
  });

  it('refuses a recording from another build, naming both builds', () => {
    const loaded = decodeSave(replayBytes().bytes);
    expect(loaded.gameVersion).toBe(GAME_VERSION);

    let thrown: unknown = null;
    try {
      verifyReplay(loaded, OTHER_VERSION);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReplayVersionError);
    const error = thrown as ReplayVersionError;
    expect(error.recordedGameVersion).toBe(GAME_VERSION);
    expect(error.currentGameVersion).toBe(OTHER_VERSION);
    expect(error.message).toContain(GAME_VERSION);
    expect(error.message).toContain(OTHER_VERSION);
  });

  it('is a pure predicate over the pair, and says yes to its own build', () => {
    expect(
      replayRefusal({ saveVersion: SAVE_VERSION, gameVersion: GAME_VERSION }, GAME_VERSION),
    ).toBeNull();
    expect(
      replayRefusal({ saveVersion: SAVE_VERSION - 1, gameVersion: GAME_VERSION }, GAME_VERSION),
    ).toBeInstanceOf(ReplayVersionError);
    expect(
      replayRefusal({ saveVersion: SAVE_VERSION, gameVersion: OTHER_VERSION }, GAME_VERSION),
    ).toBeInstanceOf(ReplayVersionError);
  });

  it('still LOADS the older recording it will not verify', () => {
    // D-131's other half: refusing to judge is not refusing to play. An old
    // save migrates, plays on, and can be watched from tick 0.
    const game = play(400);
    const v26 = {
      magic: SAVE_MAGIC,
      saveVersion: 26,
      gameVersion: GAME_VERSION,
      seed: game.world.seed,
      tick: game.world.tick,
      worldDigest: hashWorld(game.world),
      state: game.world.toData(),
      commandLog: game.queue.log,
      commandsExecuted: game.queue.executedCount,
    };
    const loaded = decodeSave(zlibSync(encode(v26)));

    expect(hashWorld(loaded.world)).toBe(hashWorld(game.world));
    const start = replayStartAt(loaded, 0);
    while (start.world.tick < game.world.tick) start.world.step(start.queue, null);
    expect(hashWorld(start.world)).toBe(hashWorld(game.world));
  });
});
