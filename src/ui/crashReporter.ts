import {
  deleteCrashBundle,
  exportCrashBundle,
  listCrashBundles,
  readCrashBundle,
  readSave,
  writeCrashBundle,
  type SaveEntry,
} from '../platform/Storage';
import type { Command } from '../sim/commands/types';
import { SAVE_VERSION } from '../sim/save/format';
import {
  assembleCrashBundle,
  bugReportFileName,
  COMMAND_LOG_BYTE_BUDGET,
  CommandLogTail,
  planCrashBundleScan,
  summariseCrashBundle,
  type CrashErrorInput,
} from './crashBundle';
import { useSimStore } from './store';

/**
 * The main thread's side of crash safety (SPEC2 M10, D-132).
 *
 * Everything a crash report needs is collected HERE, while the game is
 * healthy: the name of the last save that reached the shelf, and a rolling
 * ~1 MB tail of every command the player issued. When the worker dies, its
 * `simCrashed` message is a bonus - the stack and the exact tick - but the
 * bundle assembles the same way if that message never arrives, because a
 * crashed worker cannot be trusted to encode anything (D-111).
 */

const tail = new CommandLogTail(COMMAND_LOG_BYTE_BUDGET);

/** The last save that reached the shelf, autosaves included; null before any. */
let lastSave: SaveEntry | null = null;

/** The bundle written at crash time, kept for the dialog's export button. */
let crashBundle: { readonly name: string; readonly bytes: Uint8Array } | null = null;

let crashHandled = false;

/**
 * Record one player command into the rolling tail.
 *
 * The tick is the last published snapshot's - close enough to say WHERE in
 * the game a command fell, which is what reading a crash log is about. The
 * worker's own exact stamp dies with the worker.
 */
export function recordCommand(command: Command): void {
  tail.push(JSON.stringify({ atTick: useSimStore.getState().tick, command }));
}

/**
 * Record that the world underneath the log was swapped out. The older lines
 * stay - a crash shortly after a load is a crash the load probably caused,
 * and the marker is what lets a reader see the boundary.
 */
export function recordWorldReplaced(kind: 'load' | 'newGame'): void {
  tail.push(JSON.stringify({ marker: kind, atTick: useSimStore.getState().tick }));
}

/** Remember which save reached the shelf last; the bundle copies that one. */
export function recordSaveWritten(entry: SaveEntry): void {
  lastSave = entry;
}

async function assembleBundle(error: CrashErrorInput | null): Promise<Uint8Array> {
  const store = useSimStore.getState();
  // Wall clock is fine here - this is the UI side, and a report needs a date.
  const writtenAt = new Date().toISOString();
  const saved = lastSave;
  const bytes = saved === null ? null : await readSave(saved.name);
  return assembleCrashBundle({
    appVersion: store.appVersion === '' ? __APP_VERSION__ : store.appVersion,
    saveVersion: SAVE_VERSION,
    writtenAt,
    error,
    context: {
      seed: store.seed,
      mapSize: store.mapSize,
      tick: store.tick,
      stateHash: store.stateHash,
      isDesktop: store.isDesktop,
    },
    commandLog: tail.lines(),
    autosave: saved === null || bytes === null ? null : { name: saved.name, bytes },
  });
}

/**
 * The worker died. Show the dialog and put a bundle away immediately - the
 * player's next click is "restart", and a report that only existed in memory
 * would not survive it.
 *
 * First crash wins: the in-worker handler and the Worker object's error event
 * can both fire for one death, and two bundles of the same corpse help nobody.
 */
export async function handleWorkerCrash(error: CrashErrorInput): Promise<void> {
  if (crashHandled) return;
  crashHandled = true;

  const store = useSimStore.getState();
  store.setCrash({ message: error.message, stack: error.stack, tick: error.tick });

  const bytes = await assembleBundle(error);
  const name = bugReportFileName(new Date().toISOString());
  crashBundle = { name, bytes };
  store.setCrashBundleStored(await writeCrashBundle(name, bytes));
}

/**
 * The export button - on the crash dialog and in the menu of a healthy game.
 * After a crash it hands over the exact bundle that was written; from a
 * running game it assembles a fresh one with `error: null`, which is the
 * "something is wrong but nothing crashed" report.
 */
export async function exportBugReport(): Promise<boolean> {
  const bundle = crashBundle;
  if (bundle !== null) {
    return await exportCrashBundle(bundle.name, bundle.bytes);
  }
  const bytes = await assembleBundle(null);
  return await exportCrashBundle(bugReportFileName(new Date().toISOString()), bytes);
}

/**
 * The boot-time half of the M10 clause "a hard-terminated worker offers a
 * loadable crash bundle on the NEXT start" (D-139). Called once at startup,
 * after the settings load: scan the crashes directory, prune it to the newest
 * MAX_STORED_CRASH_BUNDLES, and put the newest bundle that actually parses
 * into the store for the offer notice. A bundle that does not parse is not
 * loadable and is discarded rather than offered.
 *
 * In the browser this finds nothing by construction - the bundle already left
 * as a download at crash time (see listCrashBundles) - so the notice simply
 * never renders there.
 */
export async function scanStoredCrashBundles(): Promise<void> {
  const plan = planCrashBundleScan(await listCrashBundles());
  for (const name of plan.prune) {
    await deleteCrashBundle(name);
  }
  for (const name of plan.keep) {
    const bytes = await readCrashBundle(name);
    const summary = bytes === null ? null : summariseCrashBundle(bytes);
    if (summary === null) {
      await deleteCrashBundle(name);
      continue;
    }
    useSimStore.getState().setStoredCrashOffer({ name, summary });
    return;
  }
}

/**
 * The offer notice's export action: the stored bundle goes out through the
 * same door as every bug report, and a SUCCESSFUL export retires the stored
 * copy - the player owns the report now, and a bundle that stayed behind
 * would nag again on the next start. A cancelled save dialog keeps both the
 * file and the offer.
 */
export async function exportStoredCrashBundle(): Promise<boolean> {
  const store = useSimStore.getState();
  const offer = store.storedCrashOffer;
  if (offer === null) return false;
  const bytes = await readCrashBundle(offer.name);
  if (bytes === null) {
    // The file vanished under us; there is nothing left to offer.
    store.setStoredCrashOffer(null);
    return false;
  }
  const exported = await exportCrashBundle(offer.name, bytes);
  if (exported) {
    await deleteCrashBundle(offer.name);
    store.setStoredCrashOffer(null);
  }
  return exported;
}

/**
 * The offer notice's discard action. Dismissal DELETES the stored file, which
 * is what makes "never nags twice for the same crash" structural: the next
 * scan cannot re-offer what no longer exists.
 */
export async function dismissStoredCrashBundle(): Promise<void> {
  const store = useSimStore.getState();
  const offer = store.storedCrashOffer;
  if (offer === null) return;
  await deleteCrashBundle(offer.name);
  store.setStoredCrashOffer(null);
}
