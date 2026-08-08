import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CHECKPOINT_INTERVAL_TICKS,
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
} from '../../src/sim/constants';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import { SAVE_VERSION } from '../../src/sim/save/format';
import { ReplaySession } from '../../src/sim/save/replaySession';
import { encodeSave } from '../../src/sim/save/serialize';
import { World } from '../../src/sim/World';
import { assembleCrashBundle, type CrashBundleInput } from '../../src/ui/crashBundle';
import { NO_SAVE_YET, sessionReplayFrom } from '../../src/ui/sessionReplay';

/**
 * The crash bundle's `.ironreplay` (SPEC2 M16, on top of M10/D-132).
 *
 * The claim under test is the one the milestone makes: a bug report is a
 * deterministic REPRO. So the test does what a developer receiving one does -
 * takes the bundle apart, pulls the recording out of the base64, opens it and
 * asks the game whether it reproduces - and it does that over a real save
 * encoded by the real codec, not over a stub.
 */

const GAME_VERSION = '0.1.0';
const OTHER_VERSION = '0.0.9';
const MAP_SIZE = 128;
const SEED = 606_060;
/** Past the first year boundary, so the ring holds genesis AND a second entry. */
const PLAYED_TICKS = CHECKPOINT_INTERVAL_TICKS + 600;

interface Game {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly ring: CheckpointRing;
}

function play(): Game {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Absturzbahn',
    companyColorIndex: 2,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 3 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Absturzbahn AG' }, 4_000);
  queue.enqueue(
    { kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT },
    CHECKPOINT_INTERVAL_TICKS + 200,
  );

  const ring = new CheckpointRing();
  ring.record(world, queue);
  for (let i = 0; i < PLAYED_TICKS; i++) {
    world.step(queue, null);
    ring.record(world, queue);
  }
  return { world, queue, ring };
}

/** The session's last autosave, as the crash reporter reads it back off disk. */
let savedBytes: Uint8Array | null = null;
let savedTick = -1;
function autosave(): Uint8Array {
  if (savedBytes === null) {
    const game = play();
    savedBytes = encodeSave(game.world, game.queue, GAME_VERSION, game.ring);
    savedTick = game.world.tick;
  }
  return savedBytes;
}

const WRITTEN_AT = '2026-08-08T09:00:00.000Z';

function bundleInput(overrides: Partial<CrashBundleInput>): CrashBundleInput {
  return {
    appVersion: GAME_VERSION,
    saveVersion: SAVE_VERSION,
    writtenAt: WRITTEN_AT,
    error: { message: 'boom', stack: 'Error: boom', tick: savedTick + 900 },
    context: {
      seed: SEED,
      mapSize: MAP_SIZE,
      tick: savedTick + 900,
      stateHash: '',
      isDesktop: true,
    },
    commandLog: ['{"atTick":1}'],
    autosave: null,
    replay: null,
    replayError: null,
    ...overrides,
  };
}

interface DecodedBundle {
  schemaVersion: number;
  replay: {
    name: string;
    base64: string;
    finalTick: number;
    baseTick: number;
    commandCount: number;
    checkpointTicks: number[];
    verifiable: boolean;
  } | null;
  replayError: string | null;
}

function decodeBundle(bytes: Uint8Array): DecodedBundle {
  return JSON.parse(new TextDecoder().decode(bytes)) as DecodedBundle;
}

describe('the crash bundle carries a recording of the session', () => {
  it('converts the last save into a verifiable recording', async () => {
    const result = await sessionReplayFrom(autosave(), WRITTEN_AT, GAME_VERSION);

    expect(result.error).toBeNull();
    expect(result.replay).not.toBeNull();
    const replay = result.replay!;
    expect(replay.name).toBe('bug-report-2026-08-08T09-00-00-000Z.ironreplay');
    expect(replay.finalTick).toBe(savedTick);
    expect(replay.baseTick).toBe(0);
    expect(replay.commandCount).toBe(3);
    // The ring the save carried: genesis plus the first year boundary.
    expect(replay.checkpointTicks).toEqual([0, CHECKPOINT_INTERVAL_TICKS]);
    expect(replay.verifiable).toBe(true);
  });

  it('is a repro: the recording out of a real bundle replays to the recorded hash', async () => {
    // The whole point of the milestone, end to end: assemble the bundle the
    // crash path assembles, take it apart the way a developer would, and let
    // the game itself judge the recording.
    const result = await sessionReplayFrom(autosave(), WRITTEN_AT, GAME_VERSION);
    const bundle = decodeBundle(assembleCrashBundle(bundleInput({ replay: result.replay })));

    expect(bundle.schemaVersion).toBe(2);
    const bytes = new Uint8Array(Buffer.from(bundle.replay?.base64 ?? '', 'base64'));
    const session = ReplaySession.open(bytes, GAME_VERSION);

    expect(session.meta.verifiable).toBe(true);
    expect(session.finalTick).toBe(savedTick);

    const verified = session.verify();
    expect(verified.ok).toBe(true);
    expect(verified.verdict).toEqual({ kind: 'verified' });
    // Compared at every committed tick on the way, not only at the end.
    expect(verified.checkedTicks).toEqual([CHECKPOINT_INTERVAL_TICKS, savedTick]);
  });

  it('scrubs on the ring the recording brought with it', async () => {
    const result = await sessionReplayFrom(autosave(), WRITTEN_AT, GAME_VERSION);
    const bytes = new Uint8Array(
      Buffer.from(
        decodeBundle(assembleCrashBundle(bundleInput({ replay: result.replay }))).replay?.base64 ??
          '',
        'base64',
      ),
    );

    const session = ReplaySession.open(bytes, GAME_VERSION);
    session.seek(CHECKPOINT_INTERVAL_TICKS);
    expect(session.world.tick).toBe(CHECKPOINT_INTERVAL_TICKS);
  });

  it('is honest when there is nothing to convert', async () => {
    const result = await sessionReplayFrom(null, WRITTEN_AT, GAME_VERSION);
    expect(result.replay).toBeNull();
    expect(result.error).toBe(NO_SAVE_YET);

    const bundle = decodeBundle(
      assembleCrashBundle(bundleInput({ replay: null, replayError: result.error })),
    );
    expect(bundle.replay).toBeNull();
    expect(bundle.replayError).toBe(NO_SAVE_YET);
  });

  it('reports rather than throws when the bytes are not a save at all', async () => {
    const result = await sessionReplayFrom(
      new Uint8Array([0, 1, 2, 3, 255]),
      WRITTEN_AT,
      GAME_VERSION,
    );
    expect(result.replay).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it('marks a recording this build could not judge as unverifiable', async () => {
    // A save written by another build is shelved as it stands (D-189); the
    // bundle says so up front rather than promising a verdict nobody can give.
    const result = await sessionReplayFrom(autosave(), WRITTEN_AT, OTHER_VERSION);
    expect(result.replay?.verifiable).toBe(false);
  });

  it('ends where the save ended, and the report shows the gap to the crash', async () => {
    // The commands after the last save live in the log tail as text and are
    // deliberately NOT spliced into the recording: the main thread has neither
    // the worker's exact ticks nor the queue's sequence numbers, so a splice
    // would manufacture a history that cannot reproduce.
    const result = await sessionReplayFrom(autosave(), WRITTEN_AT, GAME_VERSION);
    const input = bundleInput({ replay: result.replay });
    expect(result.replay!.finalTick).toBeLessThan(input.error!.tick);
  });
});
