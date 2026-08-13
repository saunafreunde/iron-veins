import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureCrossOriginIsolation,
  COI_RELOAD_FLAG,
  COI_SERVICE_WORKER_PATH,
  type IsolationEnvironment,
} from '../../src/platform/isolation';
import { autosaveSlots, AUTOSAVE_SLOTS, AUTOSAVE_SLOTS_WEB } from '../../src/ui/saves';

/**
 * The web channel of E-13: the COOP/COEP shim, the OPFS shelf, and the
 * autosave ring a browser gets.
 *
 * The clause this file answers is SPEC2 M25's own - "die Web-Version auf einem
 * Host ohne Header-Kontrolle über den Shim startet, in OPFS speichert und nach
 * Browser-Neustart lädt". Two of the three are testable here exactly as
 * shipped: the shim's own source is loaded and driven, and the OPFS backend is
 * driven through `Storage.ts` against a fake origin filesystem, with the module
 * registry reset in between to stand for the browser restart.
 *
 * The third - that a REAL browser hands out a `SharedArrayBuffer` after the
 * shim's reload - cannot be asserted in a headless suite: there is no service
 * worker registration, no navigation and no `crossOriginIsolated` to observe.
 * That one is named in the report as the owner's step, and what is pinned here
 * is everything it depends on.
 */

// --------------------------------------------------------------- the shim

/** The service worker's own vocabulary, as a fake `self` sees it. */
interface FakeRequest {
  readonly cache: string;
  readonly mode: string;
  readonly url: string;
}

interface FakeFetchEvent {
  readonly request: FakeRequest;
  respondWith(response: Promise<Response>): void;
}

interface FakeExtendableEvent {
  waitUntil(work: Promise<unknown>): void;
}

interface FakeServiceWorkerGlobal {
  addEventListener(type: string, handler: (event: never) => void): void;
  skipWaiting(): void;
  readonly clients: { claim(): Promise<void> };
}

type FetchHandler = (event: FakeFetchEvent) => void;
type LifecycleHandler = (event: FakeExtendableEvent) => void;

const SHIM_SOURCE = readFileSync(
  fileURLToPath(new URL('../../public/coi-serviceworker.js', import.meta.url)),
  'utf8',
);

/**
 * Run the shipped shim against a fake worker global and hand back what it
 * registered.
 *
 * The file is loaded from `public/` rather than reproduced here, because a
 * copy of a service worker in a test is a test that stays green while the
 * shipped file rots - which is exactly the two-lists defect this project
 * writes coupling tests against (D-133/D-183).
 */
function loadShim(fetchImpl: (request: FakeRequest) => Promise<Response>): {
  readonly fetchHandler: FetchHandler;
  readonly install: LifecycleHandler;
  readonly activate: LifecycleHandler;
  skipWaitingCalls(): number;
} {
  const handlers = new Map<string, (event: never) => void>();
  let skipWaiting = 0;
  const self: FakeServiceWorkerGlobal = {
    addEventListener: (type, handler) => {
      handlers.set(type, handler);
    },
    skipWaiting: () => {
      skipWaiting++;
    },
    clients: { claim: async () => undefined },
  };

  const factory = new Function('self', 'fetch', SHIM_SOURCE) as (
    global: FakeServiceWorkerGlobal,
    fetchFn: (request: FakeRequest) => Promise<Response>,
  ) => void;
  factory(self, fetchImpl);

  const fetchHandler = handlers.get('fetch') as FetchHandler | undefined;
  const install = handlers.get('install') as LifecycleHandler | undefined;
  const activate = handlers.get('activate') as LifecycleHandler | undefined;
  if (fetchHandler === undefined || install === undefined || activate === undefined) {
    throw new Error('the shim registered no fetch/install/activate handler');
  }
  return { fetchHandler, install, activate, skipWaitingCalls: () => skipWaiting };
}

function request(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return { cache: 'default', mode: 'navigate', url: 'https://example.test/', ...overrides };
}

/** Drive one request through the shim and await what it responded with. */
async function through(
  shim: ReturnType<typeof loadShim>,
  incoming: FakeRequest,
): Promise<Response | null> {
  let answered: Promise<Response> | null = null;
  shim.fetchHandler({
    request: incoming,
    respondWith: (response) => {
      answered = response;
    },
  });
  return answered === null ? null : await answered;
}

describe('the COOP/COEP service-worker shim', () => {
  it('puts both isolation headers on every response it passes through', async () => {
    const shim = loadShim(async () => new Response('<!doctype html>', { status: 200 }));
    const response = await through(shim, request());

    expect(response).not.toBeNull();
    expect(response?.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response?.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });

  it('keeps the status, the body and the headers the host sent', async () => {
    const shim = loadShim(
      async () =>
        new Response('module.exports', {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'text/javascript' },
        }),
    );
    const response = await through(shim, request({ mode: 'cors', url: 'https://x.test/main.js' }));

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/javascript');
    expect(await response?.text()).toBe('module.exports');
  });

  it('carries an error status through rather than swallowing it', async () => {
    const shim = loadShim(async () => new Response('nope', { status: 404 }));
    const response = await through(shim, request());
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });

  it('leaves a cache-only cross-origin request to the browser', async () => {
    // Re-wrapping one would turn it into a network fetch, which is the one
    // thing `only-if-cached` says not to do.
    const shim = loadShim(async () => {
      throw new Error('must not be fetched');
    });
    expect(await through(shim, request({ cache: 'only-if-cached', mode: 'cors' }))).toBeNull();
  });

  it('takes over at once, so the page reloads once and not twice', async () => {
    const shim = loadShim(async () => new Response(''));
    shim.install({ waitUntil: () => undefined });
    expect(shim.skipWaitingCalls()).toBe(1);

    let claimed = false;
    shim.activate({
      waitUntil: (work) => {
        claimed = work instanceof Promise;
      },
    });
    expect(claimed).toBe(true);
  });
});

// ------------------------------------------------------ the reload decision

function environment(overrides: Partial<IsolationEnvironment> = {}): {
  readonly env: IsolationEnvironment;
  readonly registered: string[];
  reloads(): number;
} {
  const registered: string[] = [];
  let reloads = 0;
  const flags = new Map<string, string>();
  const env: IsolationEnvironment = {
    crossOriginIsolated: false,
    isDesktop: false,
    register: async (path: string) => {
      registered.push(path);
    },
    session: {
      getItem: (key) => flags.get(key) ?? null,
      setItem: (key, value) => {
        flags.set(key, value);
      },
      removeItem: (key) => {
        flags.delete(key);
      },
    },
    reload: () => {
      reloads++;
    },
    ...overrides,
  };
  return { env, registered, reloads: () => reloads };
}

describe('making the document cross-origin isolated', () => {
  it('does nothing at all when it already is', async () => {
    const { env, registered, reloads } = environment({ crossOriginIsolated: true });
    expect(await ensureCrossOriginIsolation(env)).toBe('isolated');
    expect(registered).toEqual([]);
    expect(reloads()).toBe(0);
    // And it clears the flag, so a later failure in this tab may try again.
    expect(env.session?.getItem(COI_RELOAD_FLAG)).toBeNull();
  });

  it('registers the shim and reloads exactly once', async () => {
    const { env, registered, reloads } = environment();
    expect(await ensureCrossOriginIsolation(env)).toBe('reloading');
    expect(registered).toEqual([COI_SERVICE_WORKER_PATH]);
    expect(reloads()).toBe(1);
    expect(env.session?.getItem(COI_RELOAD_FLAG)).toBe('1');
  });

  it('refuses a second reload in the same tab - the loop guard', async () => {
    // The case that matters: a browser where even the shim does not isolate.
    // One reload is E-13's accepted price; two is a game nobody can even read
    // the error message of.
    const { env, reloads } = environment();
    await ensureCrossOriginIsolation(env);
    expect(await ensureCrossOriginIsolation(env)).toBe('unavailable');
    expect(reloads()).toBe(1);
  });

  it('never installs a shim inside the desktop shell', async () => {
    // Tauri sends the headers itself; a shim over them would be a second
    // answer to a question that is already answered.
    const { env, registered, reloads } = environment({ isDesktop: true });
    expect(await ensureCrossOriginIsolation(env)).toBe('unavailable');
    expect(registered).toEqual([]);
    expect(reloads()).toBe(0);
  });

  it('reports a browser with no service workers rather than throwing', async () => {
    const { env, reloads } = environment({ register: null });
    expect(await ensureCrossOriginIsolation(env)).toBe('unavailable');
    expect(reloads()).toBe(0);
  });

  it('survives a registration the host refuses', async () => {
    const { env, reloads } = environment({
      register: async () => {
        throw new Error('insecure origin');
      },
    });
    expect(await ensureCrossOriginIsolation(env)).toBe('unavailable');
    expect(reloads()).toBe(0);
  });
});

// -------------------------------------------------------------- OPFS shelf

/** A directory of the fake origin filesystem. */
class FakeDirectory {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Map<string, FakeDirectory>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    const existing = this.directories.get(name);
    if (existing !== undefined) return existing;
    if (options?.create !== true) throw new Error(`no directory ${name}`);
    const created = new FakeDirectory();
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>;
  }> {
    if (!this.files.has(name)) {
      if (options?.create !== true) throw new Error(`no file ${name}`);
      this.files.set(name, new Uint8Array());
    }
    const files = this.files;
    return {
      getFile: async () => ({
        arrayBuffer: async () => {
          const bytes = files.get(name)!;
          return bytes.slice().buffer;
        },
      }),
      createWritable: async () => ({
        write: async (data: BufferSource) => {
          const view =
            data instanceof Uint8Array
              ? data
              : new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
          files.set(name, view.slice());
        },
        close: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name);
  }
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the OPFS save shelf', () => {
  it('round-trips a save and finds it again after a browser restart', async () => {
    const root = new FakeDirectory();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
    vi.stubGlobal('window', { localStorage: fakeLocalStorage() });

    vi.resetModules();
    const first = await import('../../src/platform/Storage');
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await first.writeSave(
      {
        name: 'save-1957-04-01.ironsave',
        slot: 2,
        label: 'Sitzung',
        year: 1957,
        month: 3,
        companyValueCt: 1_234_500,
        writtenAt: 42,
        thumbnail: '',
      },
      bytes,
    );

    // The bytes really are in the origin filesystem, not in a Map beside it.
    expect(root.directories.get('saves')?.files.get('save-1957-04-01.ironsave')).toEqual(bytes);
    // And so is the index, which is what makes the list survive as well.
    expect(root.files.has('saves.json')).toBe(true);

    // The browser restart: every module is thrown away and only the origin
    // filesystem is carried over. A shelf that lived in memory reads empty
    // here - that was the pre-M25 web channel.
    vi.resetModules();
    const afterRestart = await import('../../src/platform/Storage');
    expect(await afterRestart.readSave('save-1957-04-01.ironsave')).toEqual(bytes);
    const listed = await afterRestart.listSaves();
    expect(listed.map((entry) => entry.name)).toEqual(['save-1957-04-01.ironsave']);
    expect(listed[0]?.label).toBe('Sitzung');
  });

  it('keeps one backup per save, exactly as the desktop does', async () => {
    const root = new FakeDirectory();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
    vi.stubGlobal('window', { localStorage: fakeLocalStorage() });

    vi.resetModules();
    const storage = await import('../../src/platform/Storage');
    const entry = {
      name: 'ring.ironsave',
      slot: 1,
      label: '',
      year: 1950,
      month: 0,
      companyValueCt: 0,
      writtenAt: 1,
      thumbnail: '',
    };
    await storage.writeSave(entry, new Uint8Array([10]));
    await storage.writeSave(entry, new Uint8Array([20]));

    expect(await storage.readSave('ring.ironsave')).toEqual(new Uint8Array([20]));
    expect(await storage.hasBackup('ring.ironsave')).toBe(true);
    expect(await storage.readBackup('ring.ironsave')).toEqual(new Uint8Array([10]));

    await storage.deleteSave('ring.ironsave');
    expect(await storage.readSave('ring.ironsave')).toBeNull();
    expect(await storage.readBackup('ring.ironsave')).toBeNull();
  });

  it('falls back to memory where the browser has no OPFS at all', async () => {
    // A private window, a hardened profile, a Safari with directories but no
    // `createWritable`: the shelf must be worse, never broken.
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { localStorage: fakeLocalStorage() });

    vi.resetModules();
    const storage = await import('../../src/platform/Storage');
    await storage.writeSave(
      {
        name: 'memory.ironsave',
        slot: 1,
        label: '',
        year: 1950,
        month: 0,
        companyValueCt: 0,
        writtenAt: 1,
        thumbnail: '',
      },
      new Uint8Array([7]),
    );
    expect(await storage.readSave('memory.ironsave')).toEqual(new Uint8Array([7]));
    expect((await storage.listSaves()).map((entry) => entry.name)).toEqual(['memory.ironsave']);
  });
});

describe('the autosave ring of the web profile', () => {
  it('is shorter in a browser than on the desktop', () => {
    expect(autosaveSlots(true)).toBe(AUTOSAVE_SLOTS);
    expect(autosaveSlots(false)).toBe(AUTOSAVE_SLOTS_WEB);
    expect(AUTOSAVE_SLOTS_WEB).toBeLessThan(AUTOSAVE_SLOTS);
    // Still a ring, and still deep enough to reach back past one mistake.
    expect(AUTOSAVE_SLOTS_WEB).toBeGreaterThanOrEqual(2);
  });
});
