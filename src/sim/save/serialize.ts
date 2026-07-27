import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { CommandQueue } from '../commands/queue';
import { World } from '../World';
import {
  parseSaveFile,
  readSaveHeader,
  SAVE_MAGIC,
  SAVE_VERSION,
  SaveFormatError,
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

/** Serialise world and command log into a compressed `.ironsave` payload. */
export function encodeSave(world: World, queue: CommandQueue, gameVersion: string): Uint8Array {
  const file: SaveFile = {
    magic: SAVE_MAGIC,
    saveVersion: SAVE_VERSION,
    gameVersion,
    seed: world.seed,
    tick: world.tick,
    state: world.toData(),
    commandLog: queue.log,
    commandsExecuted: queue.executedCount,
  };
  return zlibSync(encode(file), { level: COMPRESSION_LEVEL });
}

/** Decode a `.ironsave` payload, migrating older formats on the way. */
export function decodeSave(bytes: Uint8Array): LoadedGame {
  let payload: unknown;
  try {
    payload = decode(unzlibSync(bytes));
  } catch (error) {
    throw new SaveFormatError(
      `Save file could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const header = readSaveHeader(payload);
  const migrated = migrateSavePayload(payload as Record<string, unknown>, header.saveVersion);
  const file = parseSaveFile(migrated);

  const world = World.fromData(file.state);
  const queue = new CommandQueue();
  queue.loadLog(file.commandLog, file.commandsExecuted);

  return { world, queue, gameVersion: file.gameVersion };
}
