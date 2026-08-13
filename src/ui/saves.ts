import {
  deleteSave,
  exportSave,
  importSave,
  isDesktopRuntime,
  listSaves,
  readBackup,
  readSave,
  writeSave,
  type SaveEntry,
} from '../platform/Storage';
import { SaveSlotKind } from '../shared/protocol';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The save shelf: what a file is called, which ones get overwritten, and what
 * the load screen has to show without opening any of them.
 *
 * The worker encodes; this decides where the bytes go. That split is forced by
 * architecture law #1 - the simulation may no more reach a filesystem than it
 * may reach the renderer - and it turns out to be the right split anyway,
 * because naming and rotation are policy and the encoder should not have an
 * opinion about either.
 */

/** How many autosaves are kept before the oldest is written over (section 19.1). */
export const AUTOSAVE_SLOTS = 5;

/**
 * The same ring in a browser (E-13, SPEC2 M25's "Autosave-Ring-Cap fürs
 * Web-Profil"). [saves]
 *
 * Three rather than five, and it is a storage decision rather than a taste
 * one: the desktop writes into the player's own application-data directory,
 * where a save is as permanent as any other file, while OPFS shares one origin
 * quota with everything else the browser keeps for this site and is EVICTABLE
 * under pressure. A quarter-century game's save is a few hundred kilobytes, so
 * five of them plus their `.bak` copies is ten files of a quota the player
 * never sees; three keeps the same "an hour of play ago" reach - the ring
 * turns every six game months either way - at 40 % less of somebody else's
 * disk.
 */
export const AUTOSAVE_SLOTS_WEB = 3;

/**
 * How deep the ring is here. Pure, so the rule is a test rather than a
 * property of the machine the test happens to run on.
 */
export function autosaveSlots(desktop: boolean): number {
  return desktop ? AUTOSAVE_SLOTS : AUTOSAVE_SLOTS_WEB;
}

/** How often an autosave is taken, in game months (section 19.1). */
export const AUTOSAVE_EVERY_MONTHS = 6;

/** Quick saves are a single slot: F5 means "the one I keep pressing". */
const QUICK_NAME = 'quicksave.ironsave';

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The file name for a save.
 *
 * An autosave is one of the ring's slots - five on the desktop, three in a
 * browser - chosen by the game month so the ring turns by itself and no
 * counter has to be stored anywhere. A manual save is named after the date in
 * the game, which is what a player actually looks for.
 */
function nameFor(slot: SaveSlotKind, year: number, month: number, existing: number): string {
  if (slot === SaveSlotKind.Quick) return QUICK_NAME;
  if (slot === SaveSlotKind.Auto) {
    const index = (year * 12 + month) % autosaveSlots(isDesktopRuntime());
    return `autosave-${index + 1}.ironsave`;
  }
  return `save-${year}-${pad(month + 1)}-${pad(existing + 1)}.ironsave`;
}

/** Refresh the list the load screen shows. */
export async function refreshSaves(): Promise<void> {
  useSimStore.getState().setSaves(await listSaves());
}

/**
 * Put a save the worker just encoded onto the shelf.
 *
 * The thumbnail comes from the minimap, which is already a picture of the
 * whole world and costs nothing extra to read - and a load screen of dated
 * filenames with no picture is a load screen nobody can find their game in.
 *
 * Returns the shelf entry it wrote, so the caller can tell the crash
 * reporter which save is the freshest one to copy into a bundle (D-132).
 */
export async function storeSave(
  bytes: Uint8Array,
  slot: SaveSlotKind,
  label: string,
  year: number,
  month: number,
  companyValueCt: number,
  thumbnail: string,
  writtenAt: number,
): Promise<SaveEntry> {
  const existing = (await listSaves()).filter((entry) => entry.slot === SaveSlotKind.Manual).length;
  const entry: SaveEntry = {
    name: nameFor(slot, year, month, existing),
    slot,
    label,
    year,
    month,
    companyValueCt,
    writtenAt,
    thumbnail,
  };
  await writeSave(entry, bytes);
  await refreshSaves();
  return entry;
}

/**
 * The save name of the last load attempt, or null when the bytes came from an
 * imported file that has no shelf entry and therefore no backup. This is what
 * lets the panel offer the right `.bak` when a load comes back "corrupt".
 */
let lastLoadedName: string | null = null;

/** Which shelf entry the last load attempt was for, or null. */
export function lastLoadName(): string | null {
  return lastLoadedName;
}

/** Load one back into the running worker. */
export async function loadNamed(client: SimClient, name: string): Promise<boolean> {
  const bytes = await readSave(name);
  if (bytes === null) return false;
  lastLoadedName = name;
  client.load(bytes);
  return true;
}

/**
 * Load the backup the last write of this save kept - the answer to a save
 * whose current file is corrupt. One write older than what the player asked
 * for, but a world instead of an error message.
 */
export async function loadBackupNamed(client: SimClient, name: string): Promise<boolean> {
  const bytes = await readBackup(name);
  if (bytes === null) return false;
  client.load(bytes);
  return true;
}

/** Drop one off the shelf, then refresh the list. */
export async function removeNamed(name: string): Promise<void> {
  await deleteSave(name);
  await refreshSaves();
}

/** Hand a save to the player as a file of their own. */
export async function exportNamed(name: string): Promise<boolean> {
  const bytes = await readSave(name);
  if (bytes === null) return false;
  return await exportSave(name, bytes);
}

/**
 * F9: load the quick save, or the newest save there is.
 *
 * Falling back to the newest rather than doing nothing, because a player who
 * has never pressed F5 and presses F9 means "the last game", and refusing on a
 * technicality is not an answer.
 */
export async function quickLoad(client: SimClient): Promise<boolean> {
  const saves = await listSaves();
  const quick = saves.find((entry) => entry.slot === SaveSlotKind.Quick);
  const target = quick ?? saves[0];
  if (target === undefined) return false;
  return await loadNamed(client, target.name);
}

/** Take a save file from anywhere and play it. */
export async function importAndLoad(client: SimClient): Promise<boolean> {
  const bytes = await importSave();
  if (bytes === null) return false;
  // An imported file lives wherever the player keeps it; there is no shelf
  // entry and no .bak to offer if it fails to load.
  lastLoadedName = null;
  client.load(bytes);
  return true;
}
