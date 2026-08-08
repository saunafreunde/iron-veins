import {
  deleteReplay,
  exportReplay,
  importReplay,
  listReplays,
  readReplay,
  writeReplay,
  type ReplayEntry,
} from '../platform/Storage';
import { REPLAY_EXTENSION } from '../sim/save/version';
import type { ReplayMeta } from '../sim/save/replaySession';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The replay shelf: what a recording is called, what the browser lists it by,
 * and which of the three doors a set of bytes came through.
 *
 * The same split as the saves (D-111): the WORKER decides what a recording is
 * - it decodes, converts and describes - and this side decides where the file
 * goes and what it is called. The interface never opens a `.ironreplay`
 * itself; it hands the bytes over and shelves what comes back.
 */

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The file name of a recording.
 *
 * Named after the SPAN it covers rather than after the moment it was made: a
 * player looking for "the game where I built the coal line" is looking for the
 * years, and two recordings of the same years are told apart by the counter.
 */
export function replayFileName(meta: ReplayMeta, existing: number): string {
  return `replay-${meta.startYear}-${meta.endYear}-${pad(existing + 1)}${REPLAY_EXTENSION}`;
}

/** Refresh the list the replay browser shows. */
export async function refreshReplays(): Promise<void> {
  useSimStore.getState().setReplays(await listReplays());
}

/**
 * Shelve a recording the worker just built or read.
 *
 * `verifiable` is frozen HERE, at the moment of shelving, because it is a
 * statement about THIS build against that recording (E-11) and the browser has
 * to be able to grey the button out without decoding a world to find out.
 */
export async function storeReplay(
  bytes: Uint8Array,
  meta: ReplayMeta,
  label: string,
  writtenAt: number,
): Promise<ReplayEntry> {
  const existing = (await listReplays()).length;
  const entry: ReplayEntry = {
    name: replayFileName(meta, existing),
    label,
    gameVersion: meta.gameVersion,
    saveVersion: meta.saveVersion,
    years: meta.years,
    startYear: meta.startYear,
    endYear: meta.endYear,
    companies: meta.companies.map((company) => company.name),
    verifiable: meta.verifiable,
    writtenAt,
  };
  await writeReplay(entry, bytes);
  await refreshReplays();
  return entry;
}

/** Play one: read the bytes and hand the worker the whole recording. */
export async function playReplayNamed(client: SimClient, name: string): Promise<boolean> {
  const bytes = await readReplay(name);
  if (bytes === null) return false;
  client.enterReplay(bytes);
  return true;
}

/** Drop one off the shelf, then refresh the list. */
export async function removeReplayNamed(name: string): Promise<void> {
  await deleteReplay(name);
  await refreshReplays();
}

/** Hand one to the player as a file of their own. */
export async function exportReplayNamed(name: string): Promise<boolean> {
  const bytes = await readReplay(name);
  if (bytes === null) return false;
  return await exportReplay(name, bytes);
}

/**
 * Take a file from anywhere and put it on the replay shelf.
 *
 * Both extensions are accepted, and the difference is the worker's to make: a
 * `.ironreplay` is shelved as it stands, a `.ironsave` is converted into one
 * first. That is the "export replay from save" button reached from the other
 * end - the same conversion, a different door.
 */
export async function importReplayFile(client: SimClient): Promise<boolean> {
  const bytes = await importReplay();
  if (bytes === null) return false;
  client.makeReplay(bytes, '', false);
  return true;
}
