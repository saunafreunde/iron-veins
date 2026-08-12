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
  START_YEAR,
} from '../../src/sim/constants';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import {
  checkLogIntegrity,
  encodeReplay,
  narrowDivergence,
  scheduleCommitmentsOf,
  verifyReplay,
} from '../../src/sim/save/replay';
import {
  replayCheckpointYear,
  replayJumpTicks,
  ReplaySession,
  REPLAY_COMMAND_REFUSAL,
} from '../../src/sim/save/replaySession';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';
import { SimClient } from '../../src/ui/SimClient';
import { useSimStore } from '../../src/ui/store';

/**
 * The replay theatre of SPEC2 M16 bundle 2 (DECISIONS.md D-189).
 *
 * Four properties are pinned here, and they are the four the milestone's
 * "Fertig, wenn" names: a playback reaches the hash the recording claims, a
 * jump to a year lands exactly on it, a manipulated log is caught and the tick
 * it went wrong at is named, and nothing the interface does can reach the
 * world while a recording is playing.
 */

const GAME_VERSION = '0.1.0';
const MAP_SIZE = 128;
const SEED = 828_282;

/** One command in year 0's bracket, one in year 1's - the narrowing fixture. */
const NAME_TICK = 5_000;
const REPAY_TICK = 78_000;
const RECORDING_TICKS = CHECKPOINT_INTERVAL_TICKS + 12_000;

interface Game {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly ring: CheckpointRing;
}

function play(ticks: number, aiCompanies = 0, seed = SEED, mapSize = MAP_SIZE): Game {
  const world = World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize,
    companyName: 'Theaterbahn',
    companyColorIndex: 2,
    aiCompanies,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 3 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Theaterbahn AG' }, NAME_TICK);
  if (ticks > REPAY_TICK) {
    queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, REPAY_TICK);
  }

  const ring = new CheckpointRing();
  ring.record(world, queue);
  for (let i = 0; i < ticks; i++) {
    world.step(queue, null);
    ring.record(world, queue);
  }
  return { world, queue, ring };
}

/** The recording every test below decodes - played and encoded exactly once. */
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

/** Decode a recording, change its raw payload, re-encode: a manipulated file. */
function tampered(mutate: (payload: Record<string, unknown>) => void): Uint8Array {
  const payload = decode(unzlibSync(recording().bytes)) as Record<string, unknown>;
  mutate(payload);
  return zlibSync(encode(payload));
}

function session(): ReplaySession {
  return ReplaySession.open(recording().bytes, GAME_VERSION);
}

describe('a playback runs the recording and reaches what it claims', () => {
  it('plays from the base to the recorded final hash', () => {
    const play_ = session();
    expect(play_.world.tick).toBe(0);
    expect(play_.finalTick).toBe(recording().finalTick);
    expect(play_.atEnd).toBe(false);

    while (!play_.atEnd) play_.world.step(play_.queue, null);
    expect(play_.world.tick).toBe(recording().finalTick);
    expect(hashWorld(play_.world)).toBe(recording().finalHash);
  });

  it('describes the recording without playing it', () => {
    const meta = session().meta;
    expect(meta.gameVersion).toBe(GAME_VERSION);
    expect(meta.seed).toBe(SEED);
    expect(meta.mapSize).toBe(MAP_SIZE);
    expect(meta.baseTick).toBe(0);
    expect(meta.finalTick).toBe(recording().finalTick);
    // 84 000 ticks against 72 000 per game year.
    expect(meta.years).toBeCloseTo(1.2, 5);
    expect(meta.startYear).toBeLessThan(meta.endYear);
    // The company as the recording BEGINS - a replay's state is its base, so
    // the rename at tick 5 000 is still ahead of it. That is the honest thing
    // for a browser to list: it names the game that was played, not the one
    // the last command left behind.
    expect(meta.companies.map((company) => company.name)).toEqual(['Theaterbahn']);
    expect(meta.companies[0]!.ai).toBe(false);
    expect(meta.checkpointTicks).toEqual([0, CHECKPOINT_INTERVAL_TICKS]);
    expect(meta.commandCount).toBe(3);
    expect(meta.verifiable).toBe(true);
    // The scrub chips ARE the ring, and a chip is labelled with the year it
    // lands in rather than with a tick nobody can read.
    expect(replayJumpTicks(meta)).toEqual([0, CHECKPOINT_INTERVAL_TICKS]);
    expect(replayCheckpointYear(CHECKPOINT_INTERVAL_TICKS, START_YEAR)).toBe(
      replayCheckpointYear(0, START_YEAR) + 1,
    );
  });

  it('replays a game with a competitor, whose own commands are in the log', () => {
    // The AI enqueues its moves from inside `step` (D-108), so they are part
    // of the recording. Replaying re-derives them - and the sealed queue drops
    // every one, because taking them from the log AND from the AI would run
    // each competitor command twice. Without the seal this test does not fail
    // an assertion, it THROWS on the queue's monotonic-tick check.
    //
    // **The world moved to a 256 map in D-229, and it is the fixture that
    // moved rather than an assertion.** This test needs a competitor that
    // ACTS; what world it acts in is not its subject. D-229 raised
    // `AI_MIN_PROFIT_MARGIN` to 2.00 and measured that on the 128-tile map this
    // file uses for cheapness, the lone competitor then issues NOT ONE command
    // in 120,000 ticks - on any of eight seeds, seed 828,282 among them (at
    // 1.25 it issued 55 by tick 20,000). A 128 map is not a size the game
    // offers: `MAP_SIZES` is 256, 512, 1024, 2048, and on the smallest of those
    // this competitor's first command lands at tick 5,601 exactly as before.
    // The recorded fixture every other test in this file decodes is untouched.
    const game = play(20_000, 1, 4_711, 256);
    const bytes = encodeReplay(game.world, game.queue, game.ring, GAME_VERSION);
    const rival = game.queue.log.filter((envelope) => envelope.companyId !== 0);
    expect(rival.length).toBeGreaterThan(0);

    const play_ = ReplaySession.open(bytes, GAME_VERSION);
    expect(play_.meta.companies).toHaveLength(2);
    expect(play_.meta.companies[1]!.ai).toBe(true);

    while (!play_.atEnd) play_.world.step(play_.queue, null);
    expect(hashWorld(play_.world)).toBe(hashWorld(game.world));
    // The log came out of the recording unchanged - a playback records nothing.
    expect(play_.queue.log).toHaveLength(game.queue.log.length);
  });
});

describe('replay mode refuses every command the interface could inject', () => {
  it('drops what is enqueued into a playing recording, and the world never sees it', () => {
    const play_ = session();
    expect(play_.queue.sealed).toBe(true);

    const clean = session();
    for (let i = 0; i < 400; i++) clean.world.step(clean.queue, null);

    const before = play_.queue.log.length;
    play_.queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 40 }, 0);
    play_.queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Fälschung' }, 100);
    expect(play_.queue.log).toHaveLength(before);
    for (let i = 0; i < 400; i++) play_.world.step(play_.queue, null);

    // Bit for bit the world the untouched playback reached.
    expect(hashWorld(play_.world)).toBe(hashWorld(clean.world));
    expect(play_.world.playerCompany.name).toBe('Theaterbahn');
  });

  it('names the refusal with a key both catalogues carry', () => {
    expect(REPLAY_COMMAND_REFUSAL).toBe('ui.replay.readOnly');
    expect(de).toHaveProperty(REPLAY_COMMAND_REFUSAL);
    expect(en).toHaveProperty(REPLAY_COMMAND_REFUSAL);
  });

  it('does not even let a command leave the main thread', () => {
    // The cheaper half of the same rule: `SimClient.send` is the ONE door
    // every panel goes through, so the replay is defended there as well as in
    // the worker. Two layers on purpose - the worker's refusal is the
    // authority, this one is what a test can reach and what keeps the crash
    // log free of commands that never happened.
    const client = new SimClient();
    const loan = { kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT } as const;
    const store = useSimStore.getState();

    expect(client.send(loan)).toBe(true);
    store.setReplay(session().meta);
    expect(client.send(loan)).toBe(false);
    store.setReplay(null);
    expect(client.send(loan)).toBe(true);
  });

  it('leaves the game that was put aside recoverable, bit for bit', () => {
    // What "leaving replay mode returns to a clean state" is made of: the
    // worker encodes the live game before it swaps the world out and loads it
    // back afterwards. Both halves are this round trip.
    const game = play(3_000);
    const aside = encodeSave(game.world, game.queue, GAME_VERSION, game.ring);

    // ... a whole replay is watched in between ...
    const play_ = session();
    while (!play_.atEnd) play_.world.step(play_.queue, null);

    const back = decodeSave(aside);
    expect(hashWorld(back.world)).toBe(hashWorld(game.world));
    expect(back.world.tick).toBe(game.world.tick);
    expect(back.queue.executedCount).toBe(game.queue.executedCount);
    expect(back.queue.baseTick).toBe(game.queue.baseTick);
    expect(back.queue.sealed).toBe(false);
    expect(back.ring.all.map((entry) => entry.tick)).toEqual(
      game.ring.all.map((entry) => entry.tick),
    );
  });
});

describe('scrubbing lands on the tick it names', () => {
  it('jumps to a year checkpoint exactly, with the hash the recording committed to', () => {
    const play_ = session();
    play_.seek(CHECKPOINT_INTERVAL_TICKS);

    expect(play_.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
    const committed = decodeSave(recording().bytes).ring.at(CHECKPOINT_INTERVAL_TICKS);
    expect(hashWorld(play_.world)).toBe(committed!.worldDigest);
    // A checkpoint holds the world BEFORE its own tick ran, so the two
    // commands stamped earlier have run and the third has not.
    expect(play_.queue.executedCount).toBe(2);
    expect(play_.queue.sealed).toBe(true);
  });

  it('re-simulates the remainder to land exactly between checkpoints', () => {
    const play_ = session();
    play_.seek(CHECKPOINT_INTERVAL_TICKS + 3_000);
    expect(play_.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS + 3_000);

    const straight = session();
    while (straight.world.tick < CHECKPOINT_INTERVAL_TICKS + 3_000) {
      straight.world.step(straight.queue, null);
    }
    expect(hashWorld(play_.world)).toBe(hashWorld(straight.world));
  });

  it('clamps a jump to the recording and reaches the same end either way', () => {
    const play_ = session();
    play_.seek(-5_000);
    expect(play_.world.tick).toBe(0);

    play_.seek(recording().finalTick + 500_000);
    expect(play_.world.tick).toBe(recording().finalTick);
    expect(hashWorld(play_.world)).toBe(recording().finalHash);
    expect(play_.atEnd).toBe(true);
  });
});

describe('verification names the first divergent tick', () => {
  it('reports the exact tick when the divergent year holds one command', () => {
    // The repayment at REPAY_TICK is the ONLY command between the year
    // checkpoint and the end of the recording, so the bracket the running
    // comparison finds has exactly one candidate and the answer is a tick.
    const bytes = tampered((payload) => {
      const log = payload['commandLog'] as Record<string, unknown>[];
      const command = log[2]!['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 2;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    expect(result.verdict.kind).toBe('divergedAt');
    if (result.verdict.kind !== 'divergedAt') throw new Error('not a tick verdict');
    expect(result.verdict.tick).toBe(REPAY_TICK);
    expect(result.lastMatchingTick).toBe(CHECKPOINT_INTERVAL_TICKS);
    expect(result.logBreak).toBeNull();
    expect(result.reasonKey).toBe('ui.replay.verify.divergedAt');
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it('reports the committed tick and says it is a bracket when several could be it', () => {
    const bytes = tampered((payload) => {
      const log = payload['commandLog'] as Record<string, unknown>[];
      const command = log[0]!['command'] as Record<string, unknown>;
      command['amountCt'] = (command['amountCt'] as number) * 2;
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    // Two commands live in year 0 - the loan and the rename - and the
    // recording committed to nothing between them.
    expect(result.verdict).toEqual({
      kind: 'divergedInBracket',
      fromTick: 0,
      toTick: CHECKPOINT_INTERVAL_TICKS,
      whyKey: 'ui.replay.bracket.multipleCommands',
    });
    expect(result.lastMatchingTick).toBe(0);
    expect(result.reasonKey).toBe('ui.replay.verify.bracket');
  });

  it('names the entry when the log contradicts its own numbering', () => {
    const bytes = tampered((payload) => {
      const log = payload['commandLog'] as Record<string, unknown>[];
      log.splice(1, 1);
    });
    const result = verifyReplay(decodeSave(bytes), GAME_VERSION);

    expect(result.ok).toBe(false);
    expect(result.logBreak).not.toBeNull();
    expect(result.logBreak!.tick).toBe(REPAY_TICK);
    expect(result.logBreak!.reasonKey).toBe('ui.replay.break.sequence');
    // A structural break withdraws the exactness argument: the executed
    // sequence is not the recorded one, so the candidate rule cannot hold.
    expect(result.verdict.kind).toBe('divergedInBracket');
    if (result.verdict.kind !== 'divergedInBracket') throw new Error('not a bracket verdict');
    expect(result.verdict.whyKey).toBe('ui.replay.bracket.logBreak');
    expect(result.reasonKey).toBe('ui.replay.verify.bracket');
  });

  it('reproduces the untouched recording and says so', () => {
    const result = verifyReplay(decodeSave(recording().bytes), GAME_VERSION);
    expect(result.ok).toBe(true);
    expect(result.verdict).toEqual({ kind: 'verified' });
    expect(result.logBreak).toBeNull();
    expect(result.checkedTicks).toEqual([CHECKPOINT_INTERVAL_TICKS, recording().finalTick]);
    expect(result.reasonKey).toBe('ui.replay.verify.ok');
  });

  it('verifies without disturbing the playback it belongs to', () => {
    const play_ = session();
    play_.seek(CHECKPOINT_INTERVAL_TICKS);
    const result = play_.verify();

    expect(result.ok).toBe(true);
    // The verification ran on its own world: the player is still standing
    // where they scrubbed to.
    expect(play_.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
  });

  it('translates every verdict it can reach, in both catalogues', () => {
    const keys = [
      'ui.replay.verify.ok',
      'ui.replay.verify.divergedAt',
      'ui.replay.verify.proof',
      'ui.replay.verify.bracket',
      'ui.replay.verify.corrupt',
      'ui.replay.verify.hashes',
      'ui.replay.bracket.multipleCommands',
      'ui.replay.bracket.noCommands',
      'ui.replay.bracket.schedule',
      'ui.replay.bracket.logBreak',
      'ui.replay.bracket.uncommitted',
      'ui.replay.bracket.unproven',
      'ui.replay.corrupt.checkpointDigest',
      'ui.replay.corrupt.checkpointPayload',
      'ui.replay.corrupt.checkpointUnreachable',
      'ui.replay.break.tickOrder',
      'ui.replay.break.sequence',
      'ui.replay.break.schedule',
    ];
    for (const key of keys) {
      expect(de, key).toHaveProperty(key);
      expect(en, key).toHaveProperty(key);
    }
  });
});

describe('a plain save is a recording that makes no claim', () => {
  it('plays from its reconstructed genesis to the state it holds', () => {
    // SPEC2 M16's "Alt-Saves ohne Checkpoints bleiben abspielbar (Resim ab
    // Tick 0)": a save carries a world, a log and - before v27 - no ring at
    // all, so the base has to be rebuilt from the parameters the world itself
    // saves (D-188). The end is the save's own tick; there is no claim.
    const game = play(4_000);
    const bytes = encodeSave(game.world, game.queue, GAME_VERSION);
    const play_ = ReplaySession.open(bytes, GAME_VERSION);

    expect(play_.meta.verifiable).toBe(false);
    expect(play_.meta.finalTick).toBe(game.world.tick);
    expect(play_.meta.checkpointTicks).toEqual([]);
    // With no ring, the only jump the scrubber can offer is the beginning.
    expect(replayJumpTicks(play_.meta)).toEqual([0]);
    expect(play_.world.tick).toBe(0);

    while (!play_.atEnd) play_.world.step(play_.queue, null);
    expect(hashWorld(play_.world)).toBe(hashWorld(game.world));
    expect(() => play_.verify()).toThrow(/nothing to verify/);
  });

  it('refuses a file that records nothing at all', () => {
    const world = World.create({
      seed: SEED,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: MAP_SIZE,
      companyName: 'Leerfahrt',
      companyColorIndex: 3,
    });
    const bytes = encodeSave(world, new CommandQueue(), GAME_VERSION);
    expect(() => ReplaySession.open(bytes, GAME_VERSION)).toThrow(/nothing to play/);
  });
});

describe('the two locators are pure and say only what they know', () => {
  it('finds a reordered entry and a numbering gap, and nothing in a healthy log', () => {
    const loaded = decodeSave(recording().bytes);
    const log = loaded.queue.log;
    const commitments = scheduleCommitmentsOf(loaded);
    expect(commitments.length).toBeGreaterThan(0);
    expect(checkLogIntegrity(log, commitments)).toBeNull();

    // Two entries swapped whole: the NUMBERING is what catches that, because
    // the sequence stops following before the ticks do.
    const swapped = [log[0]!, { ...log[2]! }, { ...log[1]! }];
    expect(checkLogIntegrity(swapped, [])?.reasonKey).toBe('ui.replay.break.sequence');

    // Ticks moved while the numbering was kept tidy - the other check.
    const retimed = [log[0]!, { ...log[1]!, tick: REPAY_TICK }, { ...log[2]!, tick: NAME_TICK }];
    const timeBreak = checkLogIntegrity(retimed, []);
    expect(timeBreak?.reasonKey).toBe('ui.replay.break.tickOrder');
    expect(timeBreak?.index).toBe(2);

    const renumbered = [log[0]!, { ...log[1]!, seq: log[1]!.seq + 5 }, log[2]!];
    expect(checkLogIntegrity(renumbered, [])?.reasonKey).toBe('ui.replay.break.sequence');
  });

  it('narrows to a tick only when the bracket holds exactly one command tick', () => {
    const loaded = () => decodeSave(recording().bytes);
    expect(
      narrowDivergence(loaded(), CHECKPOINT_INTERVAL_TICKS, RECORDING_TICKS, null),
    ).toMatchObject({ kind: 'divergedAt', tick: REPAY_TICK });
    expect(narrowDivergence(loaded(), 0, CHECKPOINT_INTERVAL_TICKS, null)).toEqual({
      kind: 'divergedInBracket',
      fromTick: 0,
      toTick: CHECKPOINT_INTERVAL_TICKS,
      whyKey: 'ui.replay.bracket.multipleCommands',
    });
    // A bracket with no command in it cannot be explained by the log at all -
    // a divergence with no input behind it may have begun at any tick, and
    // saying "exactly here" would be an invention.
    expect(narrowDivergence(loaded(), 10_000, 20_000, null)).toEqual({
      kind: 'divergedInBracket',
      fromTick: 10_000,
      toTick: 20_000,
      whyKey: 'ui.replay.bracket.noCommands',
    });
    // ... and a broken log withdraws the argument even for the single case.
    expect(
      narrowDivergence(loaded(), CHECKPOINT_INTERVAL_TICKS, RECORDING_TICKS, {
        kind: 'sequence',
        index: 1,
        tick: NAME_TICK,
        seq: 1,
        fromTick: NAME_TICK,
        toTick: NAME_TICK,
        reasonKey: 'ui.replay.break.sequence',
      }),
    ).toEqual({
      kind: 'divergedInBracket',
      fromTick: CHECKPOINT_INTERVAL_TICKS,
      toTick: RECORDING_TICKS,
      whyKey: 'ui.replay.bracket.logBreak',
    });
  });
});
