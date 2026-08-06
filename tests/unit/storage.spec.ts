import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deleteSave,
  hasBackup,
  listSaves,
  readBackup,
  readSave,
  writeCrashBundle,
  writeSave,
  type SaveEntry,
} from '../../src/platform/Storage';
import { SaveSlotKind } from '../../src/shared/protocol';

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
