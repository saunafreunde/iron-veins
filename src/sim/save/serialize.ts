import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { CommandQueue } from '../commands/queue';
import { hashWorld, World } from '../World';
import { CheckpointRing } from './checkpoints';
import {
  parseSaveFile,
  readSaveHeader,
  SAVE_MAGIC,
  SAVE_VERSION,
  SaveCorruptionError,
  type ReplayClaim,
  type SaveFile,
} from './format';
import { migrateSavePayload } from './migrations';

/** zlib level 6 - roughly 3x smaller than raw MessagePack at a few ms per MB. */
const COMPRESSION_LEVEL = 6;

/** Restored game, ready to continue running. */
export interface LoadedGame {
  readonly world: World;
  readonly queue: CommandQueue;
  /** The checkpoint ring the file carried; empty for a pre-M16 recording. */
  readonly ring: CheckpointRing;
  readonly gameVersion: string;
  /**
   * The save format version as RECORDED in the file, before migration. This
   * is one half of the pair a replay is evidence about (D-131); the other is
   * `gameVersion`.
   */
  readonly saveVersion: number;
  /** Where the recording claims to end - present in a replay, null in a save. */
  readonly replay: ReplayClaim | null;
}

/**
 * Serialise world and command log into a compressed `.ironsave` payload.
 *
 * The container carries `hashWorld` of the state it wraps. The digest lives in
 * the CONTAINER on purpose (Fehlerkatalog 2): a digest inside the hashed state
 * would have to contribute to itself, and a container field can change shape in
 * a migration without moving a single world hash.
 *
 * The checkpoint ring of SPEC2 M16 travels the same way and for the same
 * reason: it is HISTORY, like the command log, not state. Passing none writes
 * an empty ring, which is what every caller that does not keep one - the
 * balancing scenarios, the determinism fixtures - honestly has.
 */
export function encodeSave(
  world: World,
  queue: CommandQueue,
  gameVersion: string,
  ring: CheckpointRing | null = null,
  replay: ReplayClaim | null = null,
): Uint8Array {
  const file: SaveFile = {
    magic: SAVE_MAGIC,
    saveVersion: SAVE_VERSION,
    gameVersion,
    seed: world.seed,
    tick: world.tick,
    worldDigest: hashWorld(world),
    state: world.toData(),
    commandLog: queue.log,
    commandsExecuted: queue.executedCount,
    logBaseTick: queue.baseTick,
    checkpoints: ring === null ? [] : ring.all,
    replay,
  };
  return zlibSync(encode(file), { level: COMPRESSION_LEVEL });
}

/**
 * Decode a `.ironsave` payload, migrating older formats on the way.
 *
 * Failures keep their two different names: bytes that do not decode or a state
 * that no longer matches its own digest are {@link SaveCorruptionError} - the
 * file is damaged and the loader should offer the `.bak` - while a payload that
 * decodes but fails validation is a {@link SaveFormatError} naming the exact
 * field, which is what a bug report needs.
 */
export function decodeSave(bytes: Uint8Array): LoadedGame {
  let payload: unknown;
  try {
    payload = decode(unzlibSync(bytes));
  } catch (error) {
    throw new SaveCorruptionError(
      `Save file could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const header = readSaveHeader(payload);
  const migrated = migrateSavePayload(payload as Record<string, unknown>, header.saveVersion);
  const file = parseSaveFile(migrated);

  const world = World.fromData(file.state);

  // An empty digest is a save from before version 23: there is nothing to
  // verify and pretending otherwise would refuse every legitimate old save.
  //
  // A digest is only VERIFIABLE for a save of the current format version.
  // It fingerprints the state as the WRITING build hashed it, and a migrated
  // save has neither of those things any more: the state was just rewritten,
  // and hashWorld may cover fields the old function never saw - so comparing
  // would refuse every healthy old save the moment either moved (M11 was the
  // first migration to hit this). That is D-131's version-pinning argument
  // applied to the digest: evidence about one version is not judged by
  // another. An old save's digest rides along unverified, exactly like the
  // v22 empty string, and the next write records a fresh one.
  if (file.worldDigest !== '' && header.saveVersion === SAVE_VERSION) {
    const actual = hashWorld(world);
    if (actual !== file.worldDigest) {
      throw new SaveCorruptionError(
        `save.worldDigest: the state hashes to ${actual} but the file says ` +
          `${file.worldDigest} - the save is corrupt`,
        'save.worldDigest',
      );
    }
  }

  const queue = new CommandQueue();
  queue.loadLog(file.commandLog, file.commandsExecuted, file.logBaseTick);

  const ring = new CheckpointRing();
  ring.load(file.checkpoints);

  return {
    world,
    queue,
    ring,
    gameVersion: file.gameVersion,
    saveVersion: header.saveVersion,
    replay: file.replay,
  };
}
