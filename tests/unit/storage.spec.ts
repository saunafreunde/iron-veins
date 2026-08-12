import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deleteCrashBundle,
  importSave,
  deleteSave,
  hasBackup,
  listCrashBundles,
  listSaves,
  readBackup,
  readCrashBundle,
  readSave,
  writeCrashBundle,
  writeSave,
  type SaveEntry,
} from '../../src/platform/Storage';
import { SaveSlotKind } from '../../src/shared/protocol';
import {
  OPENABLE_EXTENSIONS,
  REPLAY_EXTENSION,
  SAVE_EXTENSION,
  SCENARIO_EXTENSION,
} from '../../src/sim/save/version';
import { scenarioFileName } from '../../src/ui/editor/scenarioExport';

/**
 * The atomic-write contract of the save shelf, exercised through the browser
 * backend - the one backend a headless test can reach. The Tauri backend runs
 * the same dance with real renames (tmp file, previous save to `.bak`, then
 * the final name), and both share every line above the storage primitive.
 *
 * What is being pinned: a write never destroys its predecessor immediately -
 * the previous bytes survive as the backup until the write after next - and a
 * deleted save takes its backup with it.
 */

/** localStorage double: the save INDEX lives there in the browser build. */
function fakeLocalStorage(): Storage {
  const backing = new Map<string, string>();
  return {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => backing.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => {
      backing.delete(key);
    },
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
  };
}

function entryNamed(name: string): SaveEntry {
  return {
    name,
    slot: SaveSlotKind.Manual,
    label: 'test',
    year: 1957,
    month: 3,
    companyValueCt: 1_234_500,
    writtenAt: 1,
    thumbnail: '',
  };
}

beforeAll(() => {
  vi.stubGlobal('window', { localStorage: fakeLocalStorage() });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('the save shelf keeps one backup per save', () => {
  it('has no backup before a save was ever overwritten', async () => {
    await writeSave(entryNamed('first.ironsave'), new Uint8Array([1, 2, 3]));

    expect(await readSave('first.ironsave')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await hasBackup('first.ironsave')).toBe(false);
    expect(await readBackup('first.ironsave')).toBeNull();
  });

  it('keeps the previous bytes as the backup when a save is overwritten', async () => {
    await writeSave(entryNamed('ring.ironsave'), new Uint8Array([10]));
    await writeSave(entryNamed('ring.ironsave'), new Uint8Array([20]));

    expect(await readSave('ring.ironsave')).toEqual(new Uint8Array([20]));
    expect(await hasBackup('ring.ironsave')).toBe(true);
    expect(await readBackup('ring.ironsave')).toEqual(new Uint8Array([10]));
  });

  it('rotates: the backup is always exactly one write behind', async () => {
    await writeSave(entryNamed('rot.ironsave'), new Uint8Array([1]));
    await writeSave(entryNamed('rot.ironsave'), new Uint8Array([2]));
    await writeSave(entryNamed('rot.ironsave'), new Uint8Array([3]));

    expect(await readSave('rot.ironsave')).toEqual(new Uint8Array([3]));
    expect(await readBackup('rot.ironsave')).toEqual(new Uint8Array([2]));
  });

  it('lists the save once however often it was written', async () => {
    await writeSave(entryNamed('once.ironsave'), new Uint8Array([1]));
    await writeSave(entryNamed('once.ironsave'), new Uint8Array([2]));

    const names = (await listSaves()).map((entry) => entry.name);
    expect(names.filter((name) => name === 'once.ironsave')).toHaveLength(1);
    // The backup is a safety net, not a shelf entry.
    expect(names.some((name) => name.endsWith('.bak'))).toBe(false);
  });

  it('hands a crash bundle over as a download in the browser and reports success', async () => {
    // The browser has no crash directory a player could find again, so the
    // fallback is a download (SPEC2 M10, D-132). The DOM pieces are doubles;
    // what is pinned is that the write goes through and says so.
    let clickedName: string | null = null;
    const anchor = {
      href: '',
      download: '',
      click: (): void => {
        clickedName = anchor.download;
      },
    };
    vi.stubGlobal('document', { createElement: () => anchor });
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:crash-bundle',
      revokeObjectURL: () => undefined,
    });

    const stored = await writeCrashBundle('bug-report-test.json', new Uint8Array([123, 125]));

    expect(stored).toBe(true);
    expect(clickedName).toBe('bug-report-test.json');
  });

  it('stores no crash bundles in the browser, so the boot scan finds nothing', async () => {
    // The deliberate asymmetry of D-139: the browser hands a bundle over as a
    // download at CRASH time and keeps nothing, so the offer-on-next-start
    // flow never triggers there. What is pinned is that the crash-shelf reads
    // are honest about that - empty, null, and a no-op - rather than throwing.
    let clickedName: string | null = null;
    const anchor = {
      href: '',
      download: '',
      click: (): void => {
        clickedName = anchor.download;
      },
    };
    vi.stubGlobal('document', { createElement: () => anchor });
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:crash-bundle',
      revokeObjectURL: () => undefined,
    });

    await writeCrashBundle('bug-report-browser.json', new Uint8Array([123, 125]));
    expect(clickedName).toBe('bug-report-browser.json');

    expect(await listCrashBundles()).toEqual([]);
    expect(await readCrashBundle('bug-report-browser.json')).toBeNull();
    await expect(deleteCrashBundle('bug-report-browser.json')).resolves.toBeUndefined();
  });

  it('deletes the backup together with the save', async () => {
    await writeSave(entryNamed('gone.ironsave'), new Uint8Array([1]));
    await writeSave(entryNamed('gone.ironsave'), new Uint8Array([2]));
    await deleteSave('gone.ironsave');

    expect(await readSave('gone.ironsave')).toBeNull();
    expect(await readBackup('gone.ironsave')).toBeNull();
    expect(await hasBackup('gone.ironsave')).toBe(false);
    expect((await listSaves()).some((entry) => entry.name === 'gone.ironsave')).toBe(false);
  });
});

// -------------------------------------------- what the open dialog will take

/**
 * Everything this build WRITES, it can also OPEN (SPEC2 M22, the correction
 * bundle to D-241).
 *
 * The defect was not subtle and nothing caught it: `exportScenario` wrote
 * `.ironscenario` out of the workshop and every open dialog in the game
 * filtered `ironsave` (and, for the replay door, `ironreplay`) - so the only
 * way to open a scenario an author had just exported was to rename the file.
 * Two lists is how that happens, so there is one now, in `save/version.ts`
 * beside the extensions themselves.
 *
 * The audit is over the SOURCE rather than over the exported constant, because
 * a constant only binds the dialogs that already use it: what has to be
 * impossible is a fourth dialog writing the string out again.
 */
describe('coupling: a format this build writes is a format it can open', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../src/platform/Storage.ts', import.meta.url)),
    'utf-8',
  );

  /** Every `iron…` extension literal in a file, with its line, ignoring prose. */
  function extensionLiterals(text: string): string[] {
    const found: string[] = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
      for (const match of line.matchAll(/['"`]\.?(iron[a-z]+)['"`]/g)) {
        found.push(`${match[1]!} at line ${i + 1}`);
      }
    }
    return found;
  }

  it('states no extension of its own - every dialog reads save/version.ts', () => {
    expect(extensionLiterals(source)).toEqual([]);
  });

  it('meta: catches a dialog that writes the string out again', () => {
    const planted = "      filters: [{ name: 'Iron Veins', extensions: ['ironsave'] }],";
    expect(extensionLiterals(planted)).toEqual(['ironsave at line 1']);
  });

  it('offers the scenario the workshop exports', () => {
    // The three formats are one container with one parser, so an open dialog
    // that takes one takes all three - and the scenario is the one that was
    // missing.
    expect(OPENABLE_EXTENSIONS).toContain(SCENARIO_EXTENSION);
    expect(OPENABLE_EXTENSIONS).toContain(SAVE_EXTENSION);
    expect(OPENABLE_EXTENSIONS).toContain(REPLAY_EXTENSION);
    expect(scenarioFileName('Werkstatt-Insel').endsWith(SCENARIO_EXTENSION)).toBe(true);
  });

  it('hands the browser input every one of them', async () => {
    // The `accept` attribute is the browser half of the same dialog, and it is
    // where the defect was visible without a desktop build.
    const input = { type: '', accept: '', addEventListener: () => undefined, click: () => undefined };
    vi.stubGlobal('document', { createElement: () => input });
    void importSave();
    await Promise.resolve();

    for (const extension of OPENABLE_EXTENSIONS) {
      expect(input.accept.split(','), extension).toContain(extension);
    }
  });
});
