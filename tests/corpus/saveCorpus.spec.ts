import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { Difficulty, LOAN_STEP_CT, MapClimate, TICKS_PER_MONTH } from '../../src/sim/constants';
import { readSaveHeader, SAVE_MAGIC, SAVE_VERSION } from '../../src/sim/save/format';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The save compatibility corpus (SPEC2, M10).
 *
 * The fixtures under ./fixtures are REAL saves, written by the sim itself on a
 * small map, one per save version from 22 on. The manifest records what each
 * one must decode to: the world hash AFTER migration to the current format.
 * Every run of this suite loads every fixture and verifies that hash - which
 * is the difference between "the migration ran" and "the migration produced
 * the world we reviewed".
 *
 * Maintenance protocol:
 *
 * - A new SAVE_VERSION: run this suite once; it writes the missing
 *   `v<N>-played.ironsave` fixture via the sim and refuses to pass until the
 *   manifest is re-recorded (delete manifest.json, run again, commit both).
 * - A legitimate change to `hashWorld` or to a migration shifts the recorded
 *   hashes: the failure names the fixture, and re-recording the manifest is
 *   the conscious act that approves the new decoded state.
 *
 * Both regeneration paths are self-priming (a missing file is written and then
 * verified in the same run), so CI - where everything is committed - only ever
 * reads.
 */

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL('./fixtures/manifest.json', import.meta.url));

/** Seed and length of the recorded game; part of the corpus' identity. */
const CORPUS_SEED = 20_260_806;
const CORPUS_MAP_SIZE = 128;
const CORPUS_TICKS = TICKS_PER_MONTH + 50;
const CORPUS_GAME_VERSION = 'corpus';

interface CorpusEntry {
  readonly file: string;
  readonly saveVersion: number;
  readonly seed: number;
  readonly tick: number;
  readonly worldHash: string;
}

/**
 * The recorded game behind every fixture: a small world, a handful of always
 * valid commands, one full game month so the monthly hooks have fired.
 */
function playCorpusGame(): { world: World; queue: CommandQueue } {
  const world = World.create({
    seed: CORPUS_SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: CORPUS_MAP_SIZE,
    companyName: 'Corpus Line',
    companyColorIndex: 1,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 4 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Corpus Line AG' }, 120);
  queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, TICKS_PER_MONTH + 5);

  for (let i = 0; i < CORPUS_TICKS; i++) world.step(queue, null);
  return { world, queue };
}

function fixtureName(saveVersion: number): string {
  return `v${saveVersion}-played.ironsave`;
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.ironsave'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Write the fixture for the CURRENT save version, plus - only when the corpus
 * is empty - the version 22 predecessor.
 *
 * The v22 fixture is the same played world in the container the v22 encoder
 * wrote: identical fields in identical order, minus the digest v23 added.
 * That reconstruction is legitimate exactly once, because v23 is a
 * container-only change; every later version writes its fixture with the
 * encoder of its own build and never reconstructs an older one.
 */
function ensureFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const existing = listFixtures();
  if (existing.includes(fixtureName(SAVE_VERSION))) return;

  const { world, queue } = playCorpusGame();

  if (existing.length === 0) {
    const v22 = {
      magic: SAVE_MAGIC,
      saveVersion: 22,
      gameVersion: CORPUS_GAME_VERSION,
      seed: world.seed,
      tick: world.tick,
      state: world.toData(),
      commandLog: queue.log,
      commandsExecuted: queue.executedCount,
    };
    writeFileSync(FIXTURE_DIR + fixtureName(22), zlibSync(encode(v22), { level: 6 }));
  }

  writeFileSync(
    FIXTURE_DIR + fixtureName(SAVE_VERSION),
    encodeSave(world, queue, CORPUS_GAME_VERSION),
  );
}

/** Decode a fixture and describe what this build makes of it. */
function recordEntry(file: string): CorpusEntry {
  const bytes = readFileSync(FIXTURE_DIR + file);
  const header = readSaveHeader(decode(unzlibSync(bytes)));
  const loaded = decodeSave(bytes);
  return {
    file,
    saveVersion: header.saveVersion,
    seed: loaded.world.seed,
    tick: loaded.world.tick,
    worldHash: hashWorld(loaded.world),
  };
}

function readManifest(): CorpusEntry[] {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as CorpusEntry[];
}

beforeAll(() => {
  ensureFixtures();
  if (!existsSync(MANIFEST_PATH)) {
    const entries = listFixtures().map(recordEntry);
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  }
});

describe('the save compatibility corpus', () => {
  it('loads every fixture and verifies its recorded world hash', () => {
    const manifest = readManifest();
    expect(manifest.length).toBeGreaterThan(0);

    for (const entry of manifest) {
      const loaded = decodeSave(readFileSync(FIXTURE_DIR + entry.file));
      expect(hashWorld(loaded.world), entry.file).toBe(entry.worldHash);
      expect(loaded.world.seed, entry.file).toBe(entry.seed);
      expect(loaded.world.tick, entry.file).toBe(entry.tick);
    }
  });

  it('has a fixture for the previous and the current save version', () => {
    // The ledger rule made checkable: a SAVE_VERSION bump without a corpus
    // fixture for it fails here, and a corpus that lost its oldest real
    // fixture fails here too.
    const versions = readManifest().map((entry) => entry.saveVersion);
    expect(versions).toContain(22);
    expect(versions).toContain(SAVE_VERSION);
  });

  it('lists every fixture on disk in the manifest, and nothing else', () => {
    const manifest = readManifest()
      .map((entry) => entry.file)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(manifest).toEqual(listFixtures());
  });

  it('carries the verified digest inside the current-version fixture', () => {
    const manifest = readManifest();
    const current = manifest.find((entry) => entry.saveVersion === SAVE_VERSION);
    expect(current).toBeDefined();

    const payload = decode(unzlibSync(readFileSync(FIXTURE_DIR + current!.file))) as Record<
      string,
      unknown
    >;
    // The container digest is the same hash the manifest records: encode-time
    // digest, decode-time verification and the corpus expectation are one
    // number, not three.
    expect(payload['worldDigest']).toBe(current!.worldHash);
  });

  it('records the identical world for the v22 and the v23 fixture', () => {
    // v23 is a container-only change (Fehlerkatalog 2): the same played game
    // must hash identically whether it travelled in the v22 container and was
    // migrated, or in the v23 container with its digest. Both fixtures stay in
    // the corpus for good, so this invariant outlives every later version.
    const manifest = readManifest();
    const previous = manifest.find((entry) => entry.saveVersion === 22);
    const current = manifest.find((entry) => entry.saveVersion === 23);
    expect(previous).toBeDefined();
    expect(current).toBeDefined();
    expect(previous!.worldHash).toBe(current!.worldHash);
  });
});
