import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  type AppSettings,
} from '../shared/settings';

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
 */
export async function writeSave(entry: SaveEntry, bytes: Uint8Array): Promise<void> {
  if (hasTauriRuntime()) {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir(SAVE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    await writeFile(`${SAVE_DIR}/${entry.name}`, bytes, { baseDir: BaseDirectory.AppData });
  } else {
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

/** Take one off the shelf. */
export async function deleteSave(name: string): Promise<void> {
  try {
    if (hasTauriRuntime()) {
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await remove(`${SAVE_DIR}/${name}`, { baseDir: BaseDirectory.AppData });
    } else {
      memorySaves.delete(name);
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
      filters: [{ name: 'Iron Veins', extensions: ['ironsave'] }],
    });
    if (path === null) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return true;
  }

  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Take a save file from wherever the player keeps it. Null means they cancelled. */
export async function importSave(): Promise<Uint8Array | null> {
  if (hasTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Iron Veins', extensions: ['ironsave'] }],
    });
    if (typeof path !== 'string') return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return await readFile(path);
  }

  return await new Promise<Uint8Array | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ironsave';
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
