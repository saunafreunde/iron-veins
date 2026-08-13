/**
 * The browser's own filesystem: the Origin Private File System (E-13, SPEC2
 * M25).
 *
 * Until this file existed a browser kept its saves in a `Map` that died with
 * the tab, which made the web channel a demo you could not come back to. OPFS
 * is real storage, per origin, with no picker and no permission prompt, and it
 * is what `Storage.ts` writes into when it is there.
 *
 * Everything here answers with `null` or `false` instead of throwing, and the
 * caller falls back to memory. That posture is the same one `readSettings` has
 * had since M9 and it is deliberate: a browser that has OPFS behind a flag, a
 * private window with a zero quota, or a Safari that offers directories but no
 * `createWritable` must cost the player their SHELF, never their game.
 *
 * The handles are typed structurally rather than through `lib.dom`, and that is
 * not a style choice: the DOM types for OPFS differ between TypeScript
 * versions, and this project bans `any` and `@ts-ignore` outright. A structural
 * interface says exactly which four calls are used, and it is also what lets
 * `tests/unit/webChannel.spec.ts` drive the whole backend against a fake.
 */

interface OpfsWritable {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface OpfsFileHandle {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable?: () => Promise<OpfsWritable>;
}

interface OpfsDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface OpfsStorageManager {
  getDirectory?: () => Promise<OpfsDirectoryHandle>;
}

/** The origin's root directory, or null when this browser has none. */
async function root(): Promise<OpfsDirectoryHandle | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = (navigator as { storage?: OpfsStorageManager }).storage;
  if (storage === undefined || typeof storage.getDirectory !== 'function') return null;
  try {
    return await storage.getDirectory();
  } catch {
    return null;
  }
}

/**
 * The directory a file lives in, created on demand.
 *
 * `''` is the root, which is where the two indexes live; the saves and the
 * recordings get a directory each, exactly as they do on the desktop, so the
 * two shelves cannot collide on a name.
 */
async function directoryOf(dir: string, create: boolean): Promise<OpfsDirectoryHandle | null> {
  const base = await root();
  if (base === null) return null;
  if (dir === '') return base;
  try {
    return await base.getDirectoryHandle(dir, { create });
  } catch {
    return null;
  }
}

/** Write bytes. False means "this browser could not", never "it went wrong". */
export async function opfsWrite(dir: string, name: string, bytes: Uint8Array): Promise<boolean> {
  const directory = await directoryOf(dir, true);
  if (directory === null) return false;
  try {
    const handle = await directory.getFileHandle(name, { create: true });
    // Safari's OPFS is write-through a sync access handle in a worker only;
    // without `createWritable` there is nothing to write with from here.
    if (typeof handle.createWritable !== 'function') return false;
    const writable = await handle.createWritable();
    // A fresh copy: `write` may keep the view, and the caller's buffer is a
    // save the worker is free to reuse.
    await writable.write(bytes.slice());
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/** Read bytes back, or null when there is no such file. */
export async function opfsRead(dir: string, name: string): Promise<Uint8Array | null> {
  const directory = await directoryOf(dir, false);
  if (directory === null) return null;
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/** Whether a file is there. */
export async function opfsHas(dir: string, name: string): Promise<boolean> {
  return (await opfsRead(dir, name)) !== null;
}

/** Remove a file. Already gone is the outcome that was wanted. */
export async function opfsDelete(dir: string, name: string): Promise<void> {
  const directory = await directoryOf(dir, false);
  if (directory === null) return;
  try {
    await directory.removeEntry(name);
  } catch {
    return;
  }
}

/** Read a text file (the shelf indexes), or null. */
export async function opfsReadText(dir: string, name: string): Promise<string | null> {
  const bytes = await opfsRead(dir, name);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** Write a text file. False by the same rule as {@link opfsWrite}. */
export async function opfsWriteText(dir: string, name: string, text: string): Promise<boolean> {
  return await opfsWrite(dir, name, new TextEncoder().encode(text));
}
