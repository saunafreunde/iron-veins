import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  type AppSettings,
} from '../shared/settings';
import {
  OPENABLE_EXTENSIONS,
  REPLAY_EXTENSION,
  SAVE_EXTENSION,
  SCENARIO_EXTENSION,
} from '../sim/save/version';

/**
 * Where things are kept between sessions: the player's settings, and their
 * save games.
 *
 * This file and `Platform.ts` are the only two in the project allowed to
 * import `@tauri-apps/*`, and ESLint fails the build if that ever stops being
 * true. Everything above this line asks for "the settings" and "a list of
 * saves" and never learns whether that is a filesystem, a browser store, or
 * something that has not been written yet.
 *
 * Both targets are real. The desktop shell writes into
 * `%APPDATA%/IronVeins/`, which is what section 19.1 asks for. A browser has
 * no such place, so it uses `localStorage` for the settings and keeps saves in
 * memory with a download as the way out. That is not a lesser fallback bolted
 * on: `npm run dev` is how this game is developed, and a save system that only
 * works in the packaged build cannot be tested until the very end.
 */

const SETTINGS_FILE = 'settings.json';
const SETTINGS_KEY = 'ironveins.settings';
const SAVE_DIR = 'saves';
const SAVE_INDEX_KEY = 'ironveins.saves';
const CRASH_DIR = 'crashes';

/**
 * The file dialogs' vocabulary, taken from `save/version.ts` and never restated
 * here.
 *
 * A Tauri filter wants the extension without its dot and a browser `accept`
 * attribute wants it with one, which is the whole reason a dialog is tempted to
 * write the string out again - and writing it out again is how `.ironscenario`
 * became a format the workshop could write and no dialog could open (SPEC2 M22,
 * the correction bundle). Both shapes are derived from the one list;
 * `tests/unit/storage.spec.ts` fails on an extension literal in this file.
 */
function bare(extension: string): string {
  return extension.startsWith('.') ? extension.slice(1) : extension;
}

/** Every openable format, as a Tauri dialog filter wants them. */
const OPENABLE_FILTER: readonly string[] = OPENABLE_EXTENSIONS.map(bare);

/** The same, as the `accept` attribute of a browser file input. */
const OPENABLE_ACCEPT = OPENABLE_EXTENSIONS.join(',');

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ------------------------------------------------------------------ settings

/** Read the settings, or the defaults when there is nothing to read. */
export async function readSettings(): Promise<AppSettings> {
  try {
    if (hasTauriRuntime()) {
      const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppConfig }))) {
        return DEFAULT_SETTINGS;
      }
      const text = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppConfig });
      return normaliseSettings(JSON.parse(text));
    }
    const text = window.localStorage.getItem(SETTINGS_KEY);
    return text === null ? DEFAULT_SETTINGS : normaliseSettings(JSON.parse(text));
  } catch {
    // A settings file that cannot be read costs the player their preferences.
    // It must never cost them the game, so there is no rethrow here.
    return DEFAULT_SETTINGS;
  }
}

/** Write the settings back. Failure is silent by the same argument. */
export async function writeSettings(settings: AppSettings): Promise<void> {
  const text = JSON.stringify(settings);
  try {
    if (hasTauriRuntime()) {
      const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await mkdir('', { baseDir: BaseDirectory.AppConfig, recursive: true });
      await writeTextFile(SETTINGS_FILE, text, { baseDir: BaseDirectory.AppConfig });
      return;
    }
    window.localStorage.setItem(SETTINGS_KEY, text);
  } catch {
    return;
  }
}

// --------------------------------------------------------------------- saves

/** One save on the shelf, as the load screen lists it. */
export interface SaveEntry {
  /** File name without the directory; the id everything else refers to. */
  readonly name: string;
  /** A value of SaveSlotKind. */
  readonly slot: number;
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly companyValueCt: number;
  /** Wall-clock time it was written, as a number for sorting only. */
  readonly writtenAt: number;
  /** A data URL of the minimap at the moment it was saved, or ''. */
  readonly thumbnail: string;
}

/** The sidecar that carries everything the list shows without opening a save. */
interface SaveIndex {
  readonly entries: SaveEntry[];
}

const INDEX_FILE = 'saves.json';

/**
 * Suffixes of the atomic-write dance. `.tmp` is the incomplete file being
 * written; `.bak` is the previous save, kept until the write after next. Both
 * live beside the save so a rename stays inside one directory - which is what
 * makes it atomic on every filesystem the desktop shell can land on.
 */
const TMP_SUFFIX = '.tmp';
const BAK_SUFFIX = '.bak';

/** In-memory shelf for the browser, where there is nowhere else to put one. */
const memorySaves = new Map<string, Uint8Array>();

async function readIndex(): Promise<SaveEntry[]> {
  try {
    if (hasTauriRuntime()) {
      const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(INDEX_FILE, { baseDir: BaseDirectory.AppData }))) return [];
      const text = await readTextFile(INDEX_FILE, { baseDir: BaseDirectory.AppData });
      return (JSON.parse(text) as SaveIndex).entries;
    }
    const text = window.localStorage.getItem(SAVE_INDEX_KEY);
    return text === null ? [] : (JSON.parse(text) as SaveIndex).entries;
  } catch {
    return [];
  }
}

async function writeIndex(entries: readonly SaveEntry[]): Promise<void> {
  const text = JSON.stringify({ entries });
  if (hasTauriRuntime()) {
    const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(INDEX_FILE, text, { baseDir: BaseDirectory.AppData });
    return;
  }
  window.localStorage.setItem(SAVE_INDEX_KEY, text);
}

/** Every save on the shelf, newest first. */
export async function listSaves(): Promise<SaveEntry[]> {
  const entries = await readIndex();
  // A total order: newest first, then by name, so two saves written in the same
  // millisecond still list the same way every time.
  return [...entries].sort((a, b) => {
    if (a.writtenAt !== b.writtenAt) return b.writtenAt - a.writtenAt;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * Put a save on the shelf under an exact name, replacing whatever was there.
 *
 * The caller owns the naming, because the caller is the only side that knows
 * whether this is an autosave rotating through a ring or a file the player
 * asked for.
 *
 * The write is atomic, and the file it replaces survives one more round: the
 * bytes go to `name.tmp` first, the previous save is renamed to `name.bak`,
 * and only then does the temp file take the real name. A crash mid-write
 * therefore leaves either the old save or the new one on disk - never half a
 * file under the name the loader trusts - and a save that turns out corrupt
 * on load still has yesterday's version sitting beside it. The worker only
 * ever encodes the bytes; whether and how they are kept safe is decided here,
 * on the main thread (D-111).
 */
export async function writeSave(entry: SaveEntry, bytes: Uint8Array): Promise<void> {
  if (hasTauriRuntime()) {
    const { exists, mkdir, rename, writeFile, BaseDirectory } =
      await import('@tauri-apps/plugin-fs');
    const baseDir = BaseDirectory.AppData;
    const path = `${SAVE_DIR}/${entry.name}`;

    await mkdir(SAVE_DIR, { baseDir, recursive: true });
    await writeFile(path + TMP_SUFFIX, bytes, { baseDir });
    if (await exists(path, { baseDir })) {
      // rename replaces an existing target, so the older backup goes with it.
      await rename(path, path + BAK_SUFFIX, {
        oldPathBaseDir: baseDir,
        newPathBaseDir: baseDir,
      });
    }
    await rename(path + TMP_SUFFIX, path, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
  } else {
    const previous = memorySaves.get(entry.name);
    if (previous !== undefined) {
      memorySaves.set(entry.name + BAK_SUFFIX, previous);
    }
    memorySaves.set(entry.name, bytes);
  }

  const entries = (await readIndex()).filter((existing) => existing.name !== entry.name);
  entries.push(entry);
  await writeIndex(entries);
}

/** Read one back, or null when it is not there any more. */
export async function readSave(name: string): Promise<Uint8Array | null> {
  try {
    if (hasTauriRuntime()) {
      const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return await readFile(`${SAVE_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    }
    return memorySaves.get(name) ?? null;
  } catch {
    return null;
  }
}

/**
 * The previous version of a save, kept by the last write, or null.
 *
 * This is what the load screen offers when the current file turns out corrupt:
 * one write older than what the player asked for, but a world that loads.
 */
export async function readBackup(name: string): Promise<Uint8Array | null> {
  return await readSave(name + BAK_SUFFIX);
}

/** Whether {@link readBackup} has something to offer for this save. */
export async function hasBackup(name: string): Promise<boolean> {
  try {
    if (hasTauriRuntime()) {
      const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return await exists(`${SAVE_DIR}/${name}${BAK_SUFFIX}`, {
        baseDir: BaseDirectory.AppData,
      });
    }
    return memorySaves.has(name + BAK_SUFFIX);
  } catch {
    return false;
  }
}

/** Take one off the shelf, its backup included - a deleted save stays deleted. */
export async function deleteSave(name: string): Promise<void> {
  try {
    if (hasTauriRuntime()) {
      const { exists, remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const baseDir = BaseDirectory.AppData;
      await remove(`${SAVE_DIR}/${name}`, { baseDir });
      if (await exists(`${SAVE_DIR}/${name}${BAK_SUFFIX}`, { baseDir })) {
        await remove(`${SAVE_DIR}/${name}${BAK_SUFFIX}`, { baseDir });
      }
    } else {
      memorySaves.delete(name);
      memorySaves.delete(name + BAK_SUFFIX);
    }
  } catch {
    // Already gone is the outcome that was wanted.
  }
  await writeIndex((await readIndex()).filter((entry) => entry.name !== name));
}

/**
 * Hand a save to the player as a file they own.
 *
 * On the desktop that is a save dialog; in a browser it is a download. Either
 * way it is the answer to "I want to keep this one somewhere safe", which an
 * application-data directory is not.
 */
export async function exportSave(name: string, bytes: Uint8Array): Promise<boolean> {
  if (hasTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'Iron Veins', extensions: [bare(SAVE_EXTENSION)] }],
    });
    if (path === null) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return true;
  }

  downloadBytes(name, bytes);
  return true;
}

/**
 * Hand a scenario the workshop just wrote to the author as a file (M22).
 *
 * Deliberately EXPORT only, with no shelf and no index behind it. A save is a
 * game somebody wants to continue and a recording is evidence, so both live in
 * application data where the game can list them; a scenario is something an
 * author gives away, and the place for that is wherever they keep the things
 * they share. The scenario BROWSER lists the shipped catalogue, which is code
 * (D-191), so there is no list here for this file to join.
 */
export async function exportScenario(name: string, bytes: Uint8Array): Promise<boolean> {
  if (hasTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'Iron Veins Scenario', extensions: [bare(SCENARIO_EXTENSION)] }],
    });
    if (path === null) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return true;
  }

  downloadBytes(name, bytes);
  return true;
}

/** The browser's only way out: hand the bytes over as a download. */
function downloadBytes(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------- the replays
//
// A second shelf beside the saves (SPEC2 M16). Deliberately its own directory
// and its own index rather than a slot on the save shelf: a recording is not a
// game to continue, it carries different metadata (the build that made it, how
// many game years it spans, who played), and mixing the two would put files
// the load screen must never load in the load screen's own list.
//
// There is no `.bak` dance here. A save is the only copy of somebody's game
// and is worth an atomic write; a recording is a copy of something else by
// construction, and the write that would need protecting is the save's.

const REPLAY_DIR = 'replays';
const REPLAY_INDEX_FILE = 'replays.json';
const REPLAY_INDEX_KEY = 'ironveins.replays';

/** In-memory replay shelf for the browser, mirroring {@link memorySaves}. */
const memoryReplays = new Map<string, Uint8Array>();

/** One recording on the shelf, as the replay browser lists it. */
export interface ReplayEntry {
  /** File name without the directory; the id everything else refers to. */
  readonly name: string;
  readonly label: string;
  /** Build that recorded it - the version triple of E-11. */
  readonly gameVersion: string;
  /** Save format it was written in. */
  readonly saveVersion: number;
  /** Length of the recording in game years. */
  readonly years: number;
  readonly startYear: number;
  readonly endYear: number;
  /** Names of the companies in the recording, the player's first. */
  readonly companies: readonly string[];
  /** Whether THIS build may verify it (E-11), decided when it was shelved. */
  readonly verifiable: boolean;
  /** Wall-clock time it was shelved, as a number for sorting only. */
  readonly writtenAt: number;
}

interface ReplayIndex {
  readonly entries: ReplayEntry[];
}

async function readReplayIndex(): Promise<ReplayEntry[]> {
  try {
    if (hasTauriRuntime()) {
      const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(REPLAY_INDEX_FILE, { baseDir: BaseDirectory.AppData }))) return [];
      const text = await readTextFile(REPLAY_INDEX_FILE, { baseDir: BaseDirectory.AppData });
      return (JSON.parse(text) as ReplayIndex).entries;
    }
    const text = window.localStorage.getItem(REPLAY_INDEX_KEY);
    return text === null ? [] : (JSON.parse(text) as ReplayIndex).entries;
  } catch {
    return [];
  }
}

async function writeReplayIndex(entries: readonly ReplayEntry[]): Promise<void> {
  const text = JSON.stringify({ entries });
  if (hasTauriRuntime()) {
    const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(REPLAY_INDEX_FILE, text, { baseDir: BaseDirectory.AppData });
    return;
  }
  window.localStorage.setItem(REPLAY_INDEX_KEY, text);
}

/** Every recording on the shelf, newest first. */
export async function listReplays(): Promise<ReplayEntry[]> {
  const entries = await readReplayIndex();
  return [...entries].sort((a, b) => {
    if (a.writtenAt !== b.writtenAt) return b.writtenAt - a.writtenAt;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Put a recording on the shelf under an exact name, replacing what was there. */
export async function writeReplay(entry: ReplayEntry, bytes: Uint8Array): Promise<void> {
  if (hasTauriRuntime()) {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const baseDir = BaseDirectory.AppData;
    await mkdir(REPLAY_DIR, { baseDir, recursive: true });
    await writeFile(`${REPLAY_DIR}/${entry.name}`, bytes, { baseDir });
  } else {
    memoryReplays.set(entry.name, bytes);
  }

  const entries = (await readReplayIndex()).filter((existing) => existing.name !== entry.name);
  entries.push(entry);
  await writeReplayIndex(entries);
}

/** Read one back, or null when it is not there any more. */
export async function readReplay(name: string): Promise<Uint8Array | null> {
  try {
    if (hasTauriRuntime()) {
      const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return await readFile(`${REPLAY_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    }
    return memoryReplays.get(name) ?? null;
  } catch {
    return null;
  }
}

/** Take one off the shelf. Already gone is the outcome that was wanted. */
export async function deleteReplay(name: string): Promise<void> {
  try {
    if (hasTauriRuntime()) {
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await remove(`${REPLAY_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    } else {
      memoryReplays.delete(name);
    }
  } catch {
    // Already gone is the outcome that was wanted.
  }
  await writeReplayIndex((await readReplayIndex()).filter((entry) => entry.name !== name));
}

/** Hand a recording to the player as a file of their own. */
export async function exportReplay(name: string, bytes: Uint8Array): Promise<boolean> {
  if (hasTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'Iron Veins Replay', extensions: [bare(REPLAY_EXTENSION)] }],
    });
    if (path === null) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return true;
  }

  downloadBytes(name, bytes);
  return true;
}

/**
 * Take a recording - or a save to make one out of - from wherever the player
 * keeps it. Null means they cancelled.
 */
export async function importReplay(): Promise<Uint8Array | null> {
  if (hasTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Iron Veins', extensions: [...OPENABLE_FILTER] }],
    });
    if (typeof path !== 'string') return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return await readFile(path);
  }

  return await new Promise<Uint8Array | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = OPENABLE_ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
    });
    input.click();
  });
}

// ------------------------------------------------------------- crash bundles

/**
 * Keep a crash bundle where bug reports live, without asking anybody.
 *
 * The desktop writes it into `$APPDATA/crashes/` so a report survives the
 * restart the player is about to click; a browser profile has no directory a
 * player could ever find again, so there the bundle goes straight out as a
 * download. Returns false instead of throwing - a failed crash write must
 * never crash the crash handler, and the dialog says so instead.
 */
export async function writeCrashBundle(name: string, bytes: Uint8Array): Promise<boolean> {
  try {
    if (hasTauriRuntime()) {
      const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await mkdir(CRASH_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
      await writeFile(`${CRASH_DIR}/${name}`, bytes, { baseDir: BaseDirectory.AppData });
      return true;
    }
    downloadBytes(name, bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Names of the crash bundles kept in `$APPDATA/crashes`, newest first.
 *
 * Desktop only in substance, and the asymmetry is deliberate: the browser
 * build hands a bundle over as a download at CRASH time (see
 * {@link writeCrashBundle}) and stores nothing, so there is never anything to
 * list and the offer-on-next-start flow (D-139) simply never triggers there.
 *
 * Newest first costs no second timestamp: `bugReportFileName` embeds the
 * flattened ISO stamp behind a constant prefix, so reverse-lexicographic IS
 * reverse-chronological.
 */
export async function listCrashBundles(): Promise<string[]> {
  try {
    if (hasTauriRuntime()) {
      const { exists, readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(CRASH_DIR, { baseDir: BaseDirectory.AppData }))) return [];
      const entries = await readDir(CRASH_DIR, { baseDir: BaseDirectory.AppData });
      return entries
        .filter((entry) => entry.isFile)
        .map((entry) => entry.name)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    }
    return [];
  } catch {
    return [];
  }
}

/** Read one stored crash bundle back, or null when it is not there (any more). */
export async function readCrashBundle(name: string): Promise<Uint8Array | null> {
  try {
    if (hasTauriRuntime()) {
      const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      return await readFile(`${CRASH_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    }
    // The browser never stored one - the bundle already left as a download.
    return null;
  } catch {
    return null;
  }
}

/** Retire a stored crash bundle. Already gone is the outcome that was wanted. */
export async function deleteCrashBundle(name: string): Promise<void> {
  try {
    if (hasTauriRuntime()) {
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await remove(`${CRASH_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    }
  } catch {
    return;
  }
}

/**
 * Hand a bug report to the player as a file of their own - the export button,
 * as opposed to the automatic write above. On the desktop that is a save
 * dialog; in a browser it is the same download either way.
 */
export async function exportCrashBundle(name: string, bytes: Uint8Array): Promise<boolean> {
  if (hasTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'Iron Veins Bug Report', extensions: ['json'] }],
    });
    if (path === null) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return true;
  }

  downloadBytes(name, bytes);
  return true;
}

/** A file an author picked, with the name to show them beside the bytes. */
export interface PickedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * Take a heightmap PNG from wherever the author keeps it (SPEC2 M22).
 *
 * Deliberately no shelf, no index and no copy: a heightmap is read once, turned
 * into a corner grid and forgotten (the picture is not part of the world), so
 * there is nothing here for the game to list or keep. The NAME travels back
 * only so the new-game screen can say which file it is holding - a file dialog
 * that forgets what it opened is one an author cannot check.
 *
 * The dialog's filter is a courtesy and never the guard: a filter can be
 * overridden in every file picker there is, so what decides whether these bytes
 * are a heightmap is `readHeightmap`, which answers with a reason.
 */
export async function importHeightmap(): Promise<PickedFile | null> {
  if (hasTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (typeof path !== 'string') return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const bytes = await readFile(path);
    const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return { name: path.slice(cut + 1), bytes };
  }

  return await new Promise<PickedFile | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,image/png';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file
        .arrayBuffer()
        .then((buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }));
    });
    input.click();
  });
}

/** Take a save file from wherever the player keeps it. Null means they cancelled. */
export async function importSave(): Promise<Uint8Array | null> {
  if (hasTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Iron Veins', extensions: [...OPENABLE_FILTER] }],
    });
    if (typeof path !== 'string') return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return await readFile(path);
  }

  return await new Promise<Uint8Array | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = OPENABLE_ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
    });
    input.click();
  });
}
