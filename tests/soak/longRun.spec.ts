import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  CHECKPOINT_INTERVAL_TICKS,
  CHECKPOINT_RING_CAPACITY,
  Difficulty,
  MapClimate,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import { SAVE_VERSION } from '../../src/sim/save/format';
import { encodeReplay, verifyReplay } from '../../src/sim/save/replay';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The long-run soak fixture of SPEC2 M16: a recorded twenty-five year AI game,
 * replayed to an identical hash.
 *
 * It is the widest determinism evidence the project has. The balancing
 * scenarios are hand-built worlds a few tiles across; this is a generated 256
 * map with three competitors playing a quarter century through the player's
 * own command queue - mapgen, pathfinding, the industry clock, renewal,
 * bankruptcy, the council, the AI's own decision cycles - and the recording
 * commits to a hash at every game-year boundary the ring holds, so a
 * divergence is located rather than merely announced.
 *
 * **The fixture is a manifest of HASHES, not a `.ironreplay` in the
 * repository.** The recording itself is 1-2 MB of compressed world states
 * (measured below and printed), it would have to be re-recorded on every save
 * bump, and a binary blob in git is exactly what E-14's glob test exists to
 * keep out. What the file has to carry is the CLAIM - the digests the game
 * committed to - and that is a few hundred bytes of text. The recording is
 * rebuilt from the seed on every run, which is the same self-priming pin
 * protocol the canonical cross-OS hash uses (D-137).
 *
 * Two independent things are therefore asserted on every run:
 *
 *  1. **self-consistency**: the recording, decoded from its own bytes,
 *     re-simulates to every hash it committed to. This needs no fixture and
 *     fails on a genuine desync inside one run.
 *  2. **the pin**: those hashes are the ones the fixture recorded. This is the
 *     regression half - it fails when the simulation changed, legitimately or
 *     not, and the protocol for a legitimate change is written into the error.
 *
 * It runs in its own CI job (`soak`) and behind `npm run test:soak` rather
 * than in `npm test`, because it is a couple of minutes of pure simulation.
 */

const PIN_PATH = fileURLToPath(new URL('./fixtures/soak-ai-quarter-century.json', import.meta.url));

/**
 * Wall-clock room for the whole soak. [ms]
 *
 * The first test plays the quarter century AND re-simulates it, measured at
 * about 46 s on the reference machine; the suite default of 120 s would be a
 * coin toss on a loaded CI runner, and a timeout that fires is
 * indistinguishable from a desync.
 */
const SOAK_TIMEOUT_MS = 900_000;

const GAME_VERSION = '0.1.0';
const SEED = 4_711;
const MAP_SIZE = 256;
const YEARS = 25;
const AI_COMPANIES = 3;

interface SoakPin {
  readonly saveVersion: number;
  readonly seed: number;
  readonly mapSize: number;
  readonly years: number;
  readonly aiCompanies: number;
  readonly finalTick: number;
  readonly finalHash: string;
  /** How many commands the competitors issued over the quarter century. */
  readonly commandCount: number;
  /** Every committed year boundary the ring still holds: tick and digest. */
  readonly checkpoints: readonly { readonly tick: number; readonly hash: string }[];
  /** Provenance only - which box recorded the pin. Never compared. */
  readonly recordedOn: { readonly platform: string; readonly arch: string };
}

interface Recorded {
  readonly bytes: Uint8Array;
  readonly saveBytes: Uint8Array;
  readonly ringBytes: number;
  readonly finalTick: number;
  readonly finalHash: string;
  readonly commandCount: number;
  readonly checkpoints: readonly { readonly tick: number; readonly hash: string }[];
}

/**
 * Play the quarter century once, recording a checkpoint at every year
 * boundary, and export it as a `.ironreplay`.
 *
 * The player issues nothing: every command in the log is a competitor's, which
 * is what makes this a test of the AI's own determinism rather than of a
 * script (D-133's reason for filtering recorded fixtures to the player is the
 * mirror image of this - here the competitors ARE the recording, and the
 * sealed queue of D-189 is what stops them being re-derived on top of it).
 */
function record(): Recorded {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: AI_COMPANIES,
  });
  const queue = new CommandQueue();
  const ring = new CheckpointRing();
  ring.record(world);

  for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) {
    world.step(queue, null);
    ring.record(world);
  }

  return {
    bytes: encodeReplay(world, queue, ring, GAME_VERSION),
    saveBytes: encodeSave(world, queue, GAME_VERSION, ring),
    ringBytes: ring.byteLength,
    finalTick: world.tick,
    finalHash: hashWorld(world),
    commandCount: queue.log.length,
    checkpoints: ring.all.map((entry) => ({ tick: entry.tick, hash: entry.worldDigest })),
  };
}

/** The quarter century is played ONCE and shared by every test in this file. */
let recording: Recorded | null = null;
function recorded(): Recorded {
  recording ??= record();
  return recording;
}

function readPin(): SoakPin {
  return JSON.parse(readFileSync(PIN_PATH, 'utf8')) as SoakPin;
}

describe('long-run soak: a recorded twenty-five year AI game', () => {
  it(
    'replays to an identical hash, checkpoint by checkpoint',
    () => {
      const run = recorded();
      // A SECOND decode of the same bytes, so the re-simulation shares nothing
      // with the world that was recorded - the same separation the replay
      // theatre's verification keeps (D-189).
      const verified = verifyReplay(decodeSave(run.bytes), GAME_VERSION);

      console.log(
        `soak: ${YEARS} years, seed ${SEED}, ${AI_COMPANIES} competitors, ` +
          `${run.commandCount} recorded commands, final hash ${run.finalHash} at tick ` +
          `${run.finalTick}\n  compared at ${verified.checkedTicks.length} committed ticks ` +
          `(${run.checkpoints.length} checkpoints in the ring, capacity ${CHECKPOINT_RING_CAPACITY})` +
          `\n  sizes: replay ${run.bytes.length} B, save ${run.saveBytes.length} B, ` +
          `ring ${run.ringBytes} B compressed`,
      );

      expect(verified.ok, `first divergent tick ${verified.firstDivergentTick}`).toBe(true);
      expect(verified.firstDivergentTick).toBe(-1);
      expect(verified.logBreak).toBeNull();
      // The comparison really did walk the whole quarter century: every ring
      // entry above the start, plus the recorded end.
      expect(verified.startedAtTick).toBe(0);
      expect(verified.checkedTicks[verified.checkedTicks.length - 1]).toBe(run.finalTick);
      expect(verified.checkedTicks.length).toBeGreaterThan(1);
    },
    SOAK_TIMEOUT_MS,
  );

  it('is a real game: the competitors filled the log and the ring is full', () => {
    // A soak that reproduces an empty world reproduces nothing. This is the
    // liveness half, in the spirit of the recorded road fixture (D-133).
    const run = recorded();
    expect(run.commandCount).toBeGreaterThan(0);
    expect(run.finalTick).toBe(YEARS * TICKS_PER_YEAR);
    expect(run.checkpoints.length).toBe(CHECKPOINT_RING_CAPACITY);
    // Eviction never takes entry zero, so the base is still the genesis while
    // the newest checkpoint is the last year boundary reached - and twenty-five
    // whole years end exactly on one (D-188).
    expect(run.checkpoints[0]!.tick).toBe(0);
    expect(run.finalTick % CHECKPOINT_INTERVAL_TICKS).toBe(0);
    expect(run.checkpoints[run.checkpoints.length - 1]!.tick).toBe(run.finalTick);
    // The gap between the base and the newest fifteen is what "a year older
    // than the ring is re-simulated from the nearest checkpoint below it"
    // means in practice, and it is the whole reason the base is never evicted.
    expect(run.checkpoints[1]!.tick).toBeGreaterThan(CHECKPOINT_INTERVAL_TICKS);
  });

  it('reaches the hashes the fixture pinned', () => {
    const run = recorded();

    if (!existsSync(PIN_PATH)) {
      const pin: SoakPin = {
        saveVersion: SAVE_VERSION,
        seed: SEED,
        mapSize: MAP_SIZE,
        years: YEARS,
        aiCompanies: AI_COMPANIES,
        finalTick: run.finalTick,
        finalHash: run.finalHash,
        commandCount: run.commandCount,
        checkpoints: run.checkpoints,
        recordedOn: { platform: process.platform, arch: process.arch },
      };
      writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`);
      console.log(`soak fixture pinned: ${run.finalHash} (commit ${PIN_PATH})`);
    }

    const pin = readPin();
    if (
      pin.seed !== SEED ||
      pin.mapSize !== MAP_SIZE ||
      pin.years !== YEARS ||
      pin.aiCompanies !== AI_COMPANIES
    ) {
      throw new Error(
        `the soak fixture was recorded for a different game (seed ${pin.seed}, ${pin.mapSize} map, ` +
          `${pin.years} years, ${pin.aiCompanies} competitors) than this suite plays - ` +
          `delete ${PIN_PATH}, re-run, and commit the new fixture`,
      );
    }
    if (pin.saveVersion !== SAVE_VERSION) {
      throw new Error(
        `the soak fixture was recorded under save version ${pin.saveVersion}, current is ` +
          `${SAVE_VERSION}. If the simulation legitimately changed, delete ${PIN_PATH}, ` +
          'run npm run test:soak, and commit the new fixture',
      );
    }
    if (run.finalHash !== pin.finalHash) {
      throw new Error(
        `the quarter century diverged from the pinned soak fixture.\n` +
          `  pinned:   ${pin.finalHash} (recorded on ${pin.recordedOn.platform}/${pin.recordedOn.arch})\n` +
          `  computed: ${run.finalHash} (this run: ${process.platform}/${process.arch})\n` +
          `If this run is on another OS than the pin, that is a cross-platform determinism ` +
          `break - law #3 - and must be debugged, never re-pinned. If the simulation itself ` +
          `changed, re-record on the reference platform: delete ${PIN_PATH}, run ` +
          `npm run test:soak, commit the fixture.`,
      );
    }

    expect(run.finalTick).toBe(pin.finalTick);
    expect(run.commandCount).toBe(pin.commandCount);
    expect(run.checkpoints).toEqual(pin.checkpoints);
  });

  it('keeps the fixture a text manifest rather than a recording in the repository', () => {
    // The size argument, asserted rather than asserted-in-a-comment: the pin
    // is a few hundred bytes of JSON, the recording it stands for is
    // megabytes, and only one of the two belongs in git (E-14).
    const run = recorded();
    const pinBytes = readFileSync(PIN_PATH).length;
    expect(pinBytes).toBeLessThan(4_096);
    expect(pinBytes).toBeLessThan(run.bytes.length / 10);
  });
});
