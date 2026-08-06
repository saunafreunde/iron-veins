import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { CommandQueue } from '../commands/queue';
import { hashWorld, World } from '../World';
import {
  parseSaveFile,
  readSaveHeader,
  SAVE_MAGIC,
  SAVE_VERSION,
  SaveCorruptionError,
  type SaveFile,
} from './format';
import { migrateSavePayload } from './migrations';

/** zlib level 6 - roughly 3x smaller than raw MessagePack at a few ms per MB. */
const COMPRESSION_LEVEL = 6;

/** Restored game, ready to continue running. */
export interface LoadedGame {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly gameVersion: string;
}

/**
 * Serialise world and command log into a compressed `.ironsave` payload.
 *
 * The container carries `hashWorld` of the state it wraps. The digest lives in
 * the CONTAINER on purpose (Fehlerkatalog 2): a digest inside the hashed state
 * would have to contribute to itself, and a container field can change shape in
 * a migration without moving a single world hash.
 */
export function encodeSave(world: World, queue: CommandQueue, gameVersion: string): Uint8Array {
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
  if (file.worldDigest !== '') {
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
  queue.loadLog(file.commandLog, file.commandsExecuted);

  return { world, queue, gameVersion: file.gameVersion };
}
