import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CHECKPOINT_INTERVAL_TICKS,
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
} from '../../src/sim/constants';
import {
  CheckpointRing,
  encodeCheckpoint,
  restoreCheckpoint,
} from '../../src/sim/save/checkpoints';
import type { Checkpoint } from '../../src/sim/save/format';
import {
  checkLogIntegrity,
  encodeReplay,
  scheduleCommitmentsOf,
  verifyReplay,
} from '../../src/sim/save/replay';
import { decodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The verdict taxonomy of SPEC2 M16 bundle 4 (DECISIONS.md D-191).
 *
 * This file exists because an independent verifier reproduced three failures
 * of the single `firstDivergentTick` answer D-189 shipped, and every one of
 * them is reproduced here EXACTLY as it was found:
 *
 *  (a) a command RETIMED inside its own year - moved from tick 100,000 to
 *      130,000, sequence untouched, ticks still rising - passed
 *      `checkLogIntegrity` and was then reported as a confident exact tick
 *      that was wrong;
 *  (b) a ring entry's `worldDigest` zeroed with the log untouched - a broken
 *      FILE - was reported as a confident divergent tick where nothing had
 *      diverged;
 *  (c) D-189's stated justification ("an entry inserted, removed or MOVED
 *      breaks seq contiguity or tick monotonicity") is empirically false, and
 *      the test below is the counter-example.
 *
 * The fourth test is the one that must NOT change: a payload tamper alone in
 * its bracket still yields the exact tick, and now yields the proof behind it.
 */

const GAME_VERSION = '0.1.0';
const MAP_SIZE = 128;
const SEED = 313_131;

/** Year 0 holds two commands, year 1 holds exactly one, and there is a tail. */
const LOAN_TICK = 0;
const NAME_TICK = 5_000;
/** The lone command of the second year - the retiming victim and the exact case. */
const REPAY_TICK = 100_000;
/** Where the verifier moved it to: the same year bracket, later. */
const RETIMED_TICK = 130_000;
const RECORDING_TICKS = CHECKPOINT_INTERVAL_TICKS * 2 + 6_000;

const YEAR_ONE = CHECKPOINT_INTERVAL_TICKS;
const YEAR_TWO = CHECKPOINT_INTERVAL_TICKS * 2;

interface Game {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly ring: CheckpointRing;
}

function play(ticks: number): Game {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Beweisbahn',
    companyColorIndex: 4,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 3 }, LOAN_TICK);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Beweisbahn AG' }, NAME_TICK);
  queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, REPAY_TICK);

  const ring = new CheckpointRing();
  ring.record(world, queue);
  for (let i = 0; i < ticks; i++) {
    world.step(queue, null);
    ring.record(world, queue);
  }
  return { world, queue, ring };
}

/** The two-year recording every test below decodes - played and encoded once. */
let recorded: { bytes: Uint8Array; finalTick: number; finalHash: string } | null = null;
function recording(): { bytes: Uint8Array; finalTick: number; finalHash: string } {
  if (recorded === null) {
    const game = play(RECORDING_TICKS);
    recorded = {
      bytes: encodeReplay(game.world, game.queue, game.ring, GAME_VERSION),
      finalTick: game.world.tick,
      finalHash: hashWorld(game.world),
    };
  }
  return recorded;
}

/**
 * A checkpoint of a DIFFERENT game standing at `tick` - a coherent world that
 * simply does not belong in this recording.
 */
function anotherWorldAt(tick: number): Checkpoint {
  const world = World.create({
    seed: SEED + 1,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Fremdbahn',
    companyColorIndex: 5,
  });
  const queue = new CommandQueue();
  while (world.tick < tick) world.step(queue, null);
  return encodeCheckpoint(world, queue);
}

/** Decode the recording, change its raw payload, re-encode: a manipulated file. */
function tampered(mutate: (payload: Record<string, unknown>) => void): Uint8Array {
  const payload = decode(unzlibSync(recording().bytes)) as Record<string, unknown>;
  mutate(payload);
  return zlibSync(encode(payload));
}

function logOf(payload: Record<string, unknown>): Record<string, unknown>[] {
  return payload['commandLog'] as Record<string, unknown>[];
}

function ringOf(payload: Record<string, unknown>): Record<string, unknown>[] {
  return payload['checkpoints'] as Record<string, unknown>[];
}

describe('the fixture is the shape the three failures need', () => {
  it('spans two whole years, with one command alone in the second', () => {
    const loaded = decodeSave(recording().bytes);
    expect(loaded.ring.all.map((entry) => entry.tick)).toEqual([0, YEAR_ONE, YEAR_TWO]);
    expect(loaded.queue.log.map((entry) => entry.tick)).toEqual([LOAN_TICK, NAME_TICK, REPAY_TICK]);
    // The retiming target sits in the SAME bracket as the command it moves.
    expect(REPAY_TICK).toBeGreaterThanOrEqual(YEAR_ONE);
    expect(RETIMED_TICK).toBeLessThan(YEAR_TWO);
    expect(verifyReplay(decodeSave(recording().bytes), GAME_VERSION).ok).toBe(true);
  });
});

describe('(c) D-189 was wrong: a MOVED entry breaks neither seq nor tick order', () => {
  it('is invisible to the order checks and visible to the schedule commitment', () => {
    const loaded = decodeSave(recording().bytes);
    const moved = loaded.queue.log.map((entry) =>
      entry.tick === REPAY_TICK ? { ...entry, tick: RETIMED_TICK } : entry,
    );

    // The two properties D-189 relied on, measured on the moved log: the
    // sequence numbers are untouched and the ticks still rise. That is the
    // counter-example to its stated justification, and it is why the exactness
    // claim needed a commitment in the FILE rather than an argument.
    expect(moved.map((entry) => entry.seq)).toEqual(loaded.queue.log.map((entry) => entry.seq));
    for (let i = 1; i < moved.length; i++) {
      expect(moved[i]!.tick).toBeGreaterThanOrEqual(moved[i - 1]!.tick);
    }
    expect(checkLogIntegrity(moved, [])).toBeNull();

    // With the commitments the recording carries, the same log is caught - and
    // the finding names the segment rather than an entry, because which entry
    // moved is exactly what a schedule digest cannot say.
    const commitments = scheduleCommitmentsOf(loaded);
    const found = checkLogIntegrity(moved, commitments);
    expect(found?.kind).toBe('schedule');
    expect(found?.reasonKey).toBe('ui.replay.break.schedule');
    expect(found?.fromTick).toBe(YEAR_ONE);
    expect(found?.toTick).toBe(YEAR_TWO);
    expect(found?.index).toBe(-1);
  });
});

describe('(a) a retimed command is reported honestly, never as an exact tick', () => {
  it('names the bracket and says the recorded timings are not evidence', () => {
    const bytes = tampered((payload) => {
      const entry = logOf(payload).find((row) => row['tick'] === REPAY_TICK)!;
      entry['tick'] = RETIMED_TICK;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    // The old answer was "tick 130,000, exactly" - the tick the tamper chose,
    // while the world really parted at 100,000 where the recording ran the
    // command. Neither number is claimed now.
    expect(result.verdict).toEqual({
      kind: 'divergedInBracket',
      fromTick: YEAR_ONE,
      toTick: YEAR_TWO,
      whyKey: 'ui.replay.bracket.schedule',
    });
    expect(result.logBreak?.kind).toBe('schedule');
    expect(JSON.stringify(result.verdict)).not.toContain(String(RETIMED_TICK));
  });
});

describe('(b) a tampered CLAIM is a broken file, not a divergent tick', () => {
  it('reports the checkpoint that contradicts its own payload', () => {
    const bytes = tampered((payload) => {
      const entry = ringOf(payload).find((row) => row['tick'] === YEAR_TWO)!;
      entry['worldDigest'] = '0000000000000000';
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    expect(result.verdict.kind).toBe('corruptRecording');
    if (result.verdict.kind !== 'corruptRecording') throw new Error('not a corruption verdict');
    expect(result.verdict.tick).toBe(YEAR_TWO);
    expect(result.verdict.where).toBe('save.checkpoints[2]');
    expect(result.verdict.whatKey).toBe('ui.replay.corrupt.checkpointDigest');
    expect(result.verdict.detail).toContain('hashes to');
    // Nothing diverged, so no tick is named and the log is not blamed.
    expect(result.logBreak).toBeNull();
    expect(result.reasonKey).toBe('ui.replay.verify.corrupt');
  });

  it('reports a checkpoint whose payload is not a world at all the same way', () => {
    // The payload alone is deliberately NOT enough to fail a verification: a
    // checkpoint is verified when it is RESTORED, so a damaged payload under a
    // healthy digest is caught by the scrub that decodes it (D-188). What this
    // covers is the pair being broken - the mark fails, and asking it about
    // itself says the file is damaged rather than the simulation divergent.
    const bytes = tampered((payload) => {
      const entry = ringOf(payload).find((row) => row['tick'] === YEAR_TWO)!;
      entry['worldDigest'] = '0000000000000000';
      entry['payload'] = new Uint8Array([7, 7, 7, 7]);
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.verdict.kind).toBe('corruptRecording');
    if (result.verdict.kind !== 'corruptRecording') throw new Error('not a corruption verdict');
    expect(result.verdict.whatKey).toBe('ui.replay.corrupt.checkpointPayload');
  });

  it('reports a coherent checkpoint that no re-simulation reaches as corrupt too', () => {
    // Both halves replaced consistently: the payload is a real world and the
    // digest is really its hash - just not the world that belongs at that tick.
    // Self-consistency cannot see that; what does is the mark AFTER it, which
    // the very same trajectory reproduces exactly (the one-mark lookahead).
    const stranger = anotherWorldAt(YEAR_ONE);
    expect(stranger.worldDigest).not.toBe(
      decodeSave(recording().bytes).ring.at(YEAR_ONE)!.worldDigest,
    );

    const bytes = tampered((payload) => {
      const entry = ringOf(payload).find((row) => row['tick'] === YEAR_ONE)!;
      entry['worldDigest'] = stranger.worldDigest;
      entry['payload'] = stranger.payload;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.verdict.kind).toBe('corruptRecording');
    if (result.verdict.kind !== 'corruptRecording') throw new Error('not a corruption verdict');
    expect(result.verdict.tick).toBe(YEAR_ONE);
    expect(result.verdict.whatKey).toBe('ui.replay.corrupt.checkpointUnreachable');
  });
});

describe('the good case is not regressed: an exact tick, with its proof', () => {
  it('proves the tick by re-simulation: to t-1 it matches, at t it does not', () => {
    const bytes = tampered((payload) => {
      const entry = logOf(payload).find((row) => row['tick'] === REPAY_TICK)!;
      const command = entry['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 2;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    expect(result.verdict.kind).toBe('divergedAt');
    if (result.verdict.kind !== 'divergedAt') throw new Error('not a tick verdict');
    expect(result.verdict.tick).toBe(REPAY_TICK);
    const proof = result.verdict.proof;
    expect(proof.fromTick).toBe(YEAR_ONE);

    // The proof, checked against the recording the tamper was made from - the
    // one reference the verifier itself does not have. Re-simulate the ORIGINAL
    // from the same checkpoint: entering tick t the two agree, and after t has
    // run they do not. That is "resim to t-1 matched, resim to t did not",
    // measured rather than argued.
    const original = decodeSave(recording().bytes);
    const world = restoreCheckpoint(original.ring.at(YEAR_ONE)!);
    const queue = new CommandQueue();
    queue.loadLog(original.queue.log, 0, 0);
    queue.seekToTick(YEAR_ONE);
    queue.seal();
    while (world.tick < REPAY_TICK) world.step(queue, null);
    expect(hashWorld(world)).toBe(proof.matchedHash);
    world.step(queue, null);
    expect(hashWorld(world)).not.toBe(proof.hashAfter);
    // ... and the tampered command really did something at that tick.
    expect(proof.hashAfter).not.toBe(proof.controlHashAfter);
  });

  it('withdraws the exact answer when the recording committed to no schedule', () => {
    // A recording written by an earlier build of save version 27 carries no
    // schedule digests, and the honest reading of that is "committed to
    // nothing": the same tamper is then a bracket, not a tick (D-191).
    const bytes = tampered((payload) => {
      for (const entry of ringOf(payload)) delete entry['scheduleDigest'];
      delete (payload['replay'] as Record<string, unknown>)['scheduleDigest'];
      const entry = logOf(payload).find((row) => row['tick'] === REPAY_TICK)!;
      const command = entry['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 2;
    });
    const loaded = decodeSave(bytes);
    expect(scheduleCommitmentsOf(loaded)).toEqual([]);

    const result = verifyReplay(loaded, GAME_VERSION);
    expect(result.verdict).toEqual({
      kind: 'divergedInBracket',
      fromTick: YEAR_ONE,
      toTick: YEAR_TWO,
      whyKey: 'ui.replay.bracket.uncommitted',
    });
  });

  it('says so when the divergent bracket holds no command at all', () => {
    // Year 0 is tampered THROUGH the checkpoint payload rather than through the
    // log: the recording's own claims about year 2 then fail with an empty
    // bracket behind them, and a divergence no input can explain is one that
    // may have begun at any tick.
    const bytes = tampered((payload) => {
      const claim = payload['replay'] as Record<string, unknown>;
      claim['finalHash'] = '0123456789abcdef';
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.verdict).toEqual({
      kind: 'divergedInBracket',
      fromTick: YEAR_TWO,
      toTick: recording().finalTick,
      whyKey: 'ui.replay.bracket.noCommands',
    });
  });
});

describe('every verdict the taxonomy can produce has a sentence in both languages', () => {
  it('translates the four verdicts, the six bracket reasons and the three corruptions', () => {
    const keys = [
      'ui.replay.verify.ok',
      'ui.replay.verify.divergedAt',
      'ui.replay.verify.proof',
      'ui.replay.verify.bracket',
      'ui.replay.verify.corrupt',
      'ui.replay.bracket.multipleCommands',
      'ui.replay.bracket.noCommands',
      'ui.replay.bracket.schedule',
      'ui.replay.bracket.logBreak',
      'ui.replay.bracket.uncommitted',
      'ui.replay.bracket.unproven',
      'ui.replay.corrupt.checkpointDigest',
      'ui.replay.corrupt.checkpointPayload',
      'ui.replay.corrupt.checkpointUnreachable',
      'ui.replay.break.schedule',
    ];
    for (const key of keys) {
      expect(de, key).toHaveProperty(key);
      expect(en, key).toHaveProperty(key);
    }
  });
});
