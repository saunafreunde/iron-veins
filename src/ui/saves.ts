import {
  deleteSave,
  exportSave,
  importSave,
  listSaves,
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
 * An autosave is one of five, chosen by the game month so the ring turns by
 * itself and no counter has to be stored anywhere. A manual save is named
 * after the date in the game, which is what a player actually looks for.
 */
function nameFor(slot: SaveSlotKind, year: number, month: number, existing: number): string {
  if (slot === SaveSlotKind.Quick) return QUICK_NAME;
  if (slot === SaveSlotKind.Auto) {
    const index = (year * 12 + month) % AUTOSAVE_SLOTS;
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
): Promise<void> {
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
}

/** Load one back into the running worker. */
export async function loadNamed(client: SimClient, name: string): Promise<boolean> {
  const bytes = await readSave(name);
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
  client.load(bytes);
  return true;
}
