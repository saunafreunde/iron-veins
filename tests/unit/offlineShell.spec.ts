import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COI_SERVICE_WORKER_PATH,
  installOfflineShell,
  PRECACHE_MESSAGE,
  type OfflineShellEnvironment,
} from '../../src/platform/isolation';
import { renderIcon, renderMaskableIcon } from '../../tools/icon-art';
import {
  injectPrecache,
  precacheManifest,
  PRECACHE_MARKER,
  SERVICE_WORKER_FILE,
  VERSION_MARKER,
  WEB_ICONS,
} from '../../tools/web-shell';

/**
 * The installable, offline web shell of D-278, in the halves a suite can hold.
 *
 * The service worker is loaded from `public/` exactly as shipped and driven
 * with a fake origin - a fake `self`, a fake `fetch` that can be switched
 * offline, and a fake CacheStorage - because the one claim that decides
 * whether the cache is worth having is that an answer FROM the cache still
 * carries COOP and COEP. Without them the document is not cross-origin
 * isolated, there is no `SharedArrayBuffer`, and an offline start is the
 * fatal "no shared memory" screen (law #10).
 *
 * What cannot be held here is a real browser's service-worker lifecycle: that
 * a registration on a configured host really claims the open page, and that a
 * reload with the network off really starts the game. That was exercised in
 * headless Chrome against `vite preview` (DECISIONS.md, the Android section).
 */

const REPO = new URL('../../', import.meta.url);
const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, REPO)), 'utf8');

const WORKER_SOURCE = read('public/coi-serviceworker.js');
const ORIGIN = 'https://iron-veins.example';
const SCOPE = `${ORIGIN}/`;

// ------------------------------------------------------------ the fakes

class FakeCache {
  readonly entries = new Map<string, Response>();

  /**
   * Honours `Vary` the way a browser's cache does in the one case that bit:
   * an entry stored under a bare URL (the precache) does not match a CORS
   * request carrying an Origin (a module script) unless the lookup says
   * `ignoreVary`.
   */
  async match(
    key: string | { url: string },
    options?: { ignoreVary?: boolean },
  ): Promise<Response | undefined> {
    const hit = this.entries.get(typeof key === 'string' ? key : key.url);
    if (hit === undefined) return undefined;
    const varies = hit.headers.get('Vary') !== null && options?.ignoreVary !== true;
    if (varies && typeof key !== 'string') return undefined;
    return hit.clone();
  }

  async put(key: string | { url: string }, response: Response): Promise<void> {
    this.entries.set(typeof key === 'string' ? key : key.url, response);
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (cache === undefined) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

interface FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly cache: string;
}

type Handler = (event: never) => void;

/** A host: what it serves, whether it is reachable, and what was asked of it. */
class FakeHost {
  online = true;
  readonly asked: string[] = [];
  readonly files = new Map<string, string>([
    [`${ORIGIN}/`, '<!doctype html><title>Iron Veins</title>'],
    [`${ORIGIN}/assets/index-abc.js`, 'console.log(1)'],
    [`${ORIGIN}/assets-baked/atlas-z1-p0.png`, 'PNG'],
  ]);

  readonly fetch = async (input: FakeRequest | string): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    this.asked.push(url);
    if (!this.online) throw new TypeError('Failed to fetch');
    const body = this.files.get(url);
    // vite preview sends `Vary: Origin` on every file; so may a host.
    const response =
      body === undefined
        ? new Response('missing', { status: 404 })
        : new Response(body, { headers: { Vary: 'Origin' } });
    // A same-origin answer as a worker sees it.
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  };
}

/** Load the shipped worker against a fake origin. */
function loadWorker(source = WORKER_SOURCE): {
  readonly host: FakeHost;
  readonly storage: FakeCacheStorage;
  dispatch(type: string, event: object): Promise<void>;
  request(url: string, mode?: string): Promise<Response>;
} {
  const handlers = new Map<string, Handler>();
  const host = new FakeHost();
  const storage = new FakeCacheStorage();
  const self = {
    location: new URL(SCOPE),
    registration: { scope: SCOPE },
    addEventListener: (type: string, handler: Handler) => {
      handlers.set(type, handler);
    },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  const factory = new Function('self', 'fetch', 'caches', source) as (
    global: typeof self,
    fetchFn: FakeHost['fetch'],
    cacheStorage: FakeCacheStorage,
  ) => void;
  factory(self, host.fetch, storage);

  const dispatch = async (type: string, event: object): Promise<void> => {
    const work: Promise<unknown>[] = [];
    handlers.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => work.push(p) } as never);
    await Promise.all(work);
  };

  const request = async (url: string, mode = 'no-cors'): Promise<Response> => {
    let answered: Promise<Response> | null = null;
    const incoming: FakeRequest = { url, method: 'GET', mode, cache: 'default' };
    handlers.get('fetch')?.({
      request: incoming,
      respondWith: (response: Promise<Response>) => {
        answered = response;
      },
    } as never);
    if (answered === null) throw new Error('the worker did not answer');
    return await answered;
  };

  return { host, storage, dispatch, request };
}

function isolatedHeaders(response: Response): [string | null, string | null] {
  return [
    response.headers.get('Cross-Origin-Opener-Policy'),
    response.headers.get('Cross-Origin-Embedder-Policy'),
  ];
}

const ISOLATED: [string, string] = ['same-origin', 'require-corp'];

/** Strings in code-unit order - a total comparator, as the lint rule asks. */
const sorted = (values: Iterable<string>): string[] =>
  [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// ------------------------------------------------------------ the worker

describe('the offline shell in the service worker (D-278)', () => {
  it('answers a navigation from the network and keeps the newest shell', async () => {
    const worker = loadWorker();
    const response = await worker.request(`${ORIGIN}/`, 'navigate');
    expect(await response.text()).toContain('Iron Veins');
    expect(isolatedHeaders(response)).toEqual(ISOLATED);
    const cache = worker.storage.caches.get('iron-veins-dev')!;
    expect(cache.entries.has(SCOPE)).toBe(true);
  });

  it('starts offline from the cached shell - WITH the isolation headers', async () => {
    const worker = loadWorker();
    await worker.request(`${ORIGIN}/`, 'navigate');
    worker.host.online = false;
    const response = await worker.request(`${ORIGIN}/`, 'navigate');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Iron Veins');
    // Without these the cached document has no SharedArrayBuffer (law #10).
    expect(isolatedHeaders(response)).toEqual(ISOLATED);
  });

  it('answers index.html offline from the same shell', async () => {
    const worker = loadWorker();
    await worker.request(`${ORIGIN}/`, 'navigate');
    worker.host.online = false;
    const response = await worker.request(`${ORIGIN}/index.html`, 'navigate');
    expect(await response.text()).toContain('Iron Veins');
  });

  it('serves a file it has from the cache, not the network', async () => {
    const worker = loadWorker();
    const url = `${ORIGIN}/assets/index-abc.js`;
    await worker.request(url);
    const before = worker.host.asked.length;
    const response = await worker.request(url);
    expect(worker.host.asked.length).toBe(before);
    expect(await response.text()).toBe('console.log(1)');
    expect(isolatedHeaders(response)).toEqual(ISOLATED);
  });

  it('never keeps a 404, so a missing atlas stays missing and the game goes procedural', async () => {
    // E-14's fallback (D-262): `bakedAtlas.ts` must see the 404, and a cached
    // one would outlive the deployment that finally ships the art.
    const worker = loadWorker();
    const url = `${ORIGIN}/assets-baked/baked-manifest.json`;
    expect((await worker.request(url)).status).toBe(404);
    expect(worker.storage.caches.get('iron-veins-dev')!.entries.has(url)).toBe(false);
  });

  it('passes another origin straight through, with the headers', async () => {
    const worker = loadWorker();
    const response = await worker.request('https://elsewhere.example/x.js', 'cors');
    expect(response.status).toBe(404);
    expect(worker.storage.caches.size).toBe(0);
  });

  it('caches ahead exactly the files the build lists, once, when the page asks', async () => {
    const files = ['./', 'assets/index-abc.js', 'assets-baked/atlas-z1-p0.png'];
    const worker = loadWorker(injectPrecache(WORKER_SOURCE, { version: 'v1', files }));
    await worker.dispatch('message', { data: PRECACHE_MESSAGE });
    const cache = worker.storage.caches.get('iron-veins-v1')!;
    expect(sorted(cache.entries.keys())).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/assets-baked/atlas-z1-p0.png`,
      `${ORIGIN}/assets/index-abc.js`,
    ]);
    // A second request fetches nothing that is already there.
    const asked = worker.host.asked.length;
    await worker.dispatch('message', { data: PRECACHE_MESSAGE });
    expect(worker.host.asked.length).toBe(asked);
    // And with all of it in, the game starts with the network gone.
    worker.host.online = false;
    expect(isolatedHeaders(await worker.request(`${ORIGIN}/`, 'navigate'))).toEqual(ISOLATED);
    expect(await (await worker.request(`${ORIGIN}/assets/index-abc.js`)).text()).toBe(
      'console.log(1)',
    );
  });

  it('finds a precached module script although the host varies on Origin', async () => {
    // Measured in headless Chrome: the precache fetched the main chunk without
    // an Origin, the page asked for it as a CORS module script with one, and
    // a strict match missed it - the first offline start failed on a file
    // that was in the cache.
    const files = ['./', 'assets/index-abc.js'];
    const worker = loadWorker(injectPrecache(WORKER_SOURCE, { version: 'v1', files }));
    await worker.dispatch('message', { data: PRECACHE_MESSAGE });
    worker.host.online = false;
    const response = await worker.request(`${ORIGIN}/assets/index-abc.js`, 'cors');
    expect(await response.text()).toBe('console.log(1)');
  });

  it('ignores any other message', async () => {
    const worker = loadWorker(injectPrecache(WORKER_SOURCE, { version: 'v1', files: ['./'] }));
    await worker.dispatch('message', { data: 'something else' });
    expect(worker.host.asked).toEqual([]);
  });

  it("drops the caches of older versions on activation, and nobody else's", async () => {
    const worker = loadWorker(injectPrecache(WORKER_SOURCE, { version: 'v2', files: ['./'] }));
    await worker.storage.open('iron-veins-v1');
    await worker.storage.open('iron-veins-v2');
    await worker.storage.open('some-other-app');
    await worker.dispatch('activate', {});
    expect(sorted(worker.storage.caches.keys())).toEqual(['iron-veins-v2', 'some-other-app']);
  });

  it('asks for the precache with the word the page sends', () => {
    expect(WORKER_SOURCE).toContain(`const PRECACHE_MESSAGE = '${PRECACHE_MESSAGE}';`);
  });
});

// --------------------------------------------------- registering the shell

function shellEnvironment(overrides: Partial<OfflineShellEnvironment> = {}): {
  readonly env: OfflineShellEnvironment;
  readonly registered: string[];
  readonly posted: string[];
} {
  const registered: string[] = [];
  const posted: string[] = [];
  const env: OfflineShellEnvironment = {
    enabled: true,
    register: async (path) => {
      registered.push(path);
    },
    whenActive: async () => ({ postMessage: (message) => posted.push(message) }),
    ...overrides,
  };
  return { env, registered, posted };
}

describe('installing the offline shell (D-278)', () => {
  it('registers the ONE worker of the web channel and asks it to cache', async () => {
    const { env, registered, posted } = shellEnvironment();
    expect(await installOfflineShell(env)).toBe(true);
    // The same path as the isolation shim: never a second worker.
    expect(registered).toEqual([COI_SERVICE_WORKER_PATH]);
    expect(posted).toEqual([PRECACHE_MESSAGE]);
  });

  it('does nothing in the dev server or the desktop shell', async () => {
    const { env, registered } = shellEnvironment({ enabled: false });
    expect(await installOfflineShell(env)).toBe(false);
    expect(registered).toEqual([]);
  });

  it('answers false rather than throwing when a host refuses workers', async () => {
    const { env } = shellEnvironment({
      register: async () => {
        throw new Error('insecure origin');
      },
    });
    expect(await installOfflineShell(env)).toBe(false);
    expect(await installOfflineShell(shellEnvironment({ register: null }).env)).toBe(false);
  });

  it('posts nothing when the worker never became active', async () => {
    const { env, posted } = shellEnvironment({ whenActive: async () => null });
    expect(await installOfflineShell(env)).toBe(false);
    expect(posted).toEqual([]);
  });
});

// ----------------------------------------------------- the build's half

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('the precache list the build writes into the worker', () => {
  const shipped = [
    { path: 'index.html', bytes: bytes('<html>') },
    { path: 'assets/index-abc.js', bytes: bytes('js') },
    { path: 'assets/index-abc.js.map', bytes: bytes('map') },
    { path: SERVICE_WORKER_FILE, bytes: bytes('sw') },
    { path: 'assets-baked/baked-manifest.json', bytes: bytes('{}') },
    { path: '.well-known/assetlinks.json', bytes: bytes('[]') },
  ];

  it('lists the shell and the shipped files - no maps, no worker, no .well-known - sorted', () => {
    // index.html is the shell, `./`, and is not fetched a second time.
    expect(precacheManifest(shipped).files).toEqual([
      './',
      'assets-baked/baked-manifest.json',
      'assets/index-abc.js',
    ]);
  });

  it('still versions the shell itself', () => {
    const changed = shipped.map((file) =>
      file.path === 'index.html' ? { ...file, bytes: bytes('<html lang=en>') } : file,
    );
    expect(precacheManifest(changed).version).not.toBe(precacheManifest(shipped).version);
  });

  it('versions the bytes, not the order a directory listed them in', () => {
    const version = precacheManifest(shipped).version;
    expect(precacheManifest([...shipped].reverse()).version).toBe(version);
    const changed = shipped.map((file) =>
      file.path === 'assets/index-abc.js' ? { ...file, bytes: bytes('js2') } : file,
    );
    expect(precacheManifest(changed).version).not.toBe(version);
    // A source map is not shipped to a player, so it does not move the version.
    const mapOnly = shipped.map((file) =>
      file.path.endsWith('.map') ? { ...file, bytes: bytes('other') } : file,
    );
    expect(precacheManifest(mapOnly).version).toBe(version);
  });

  it('fills both markers of the shipped worker', () => {
    expect(WORKER_SOURCE).toContain(VERSION_MARKER);
    expect(WORKER_SOURCE).toContain(PRECACHE_MARKER);
    const filled = injectPrecache(WORKER_SOURCE, { version: 'abc', files: ['./', 'a.js'] });
    expect(filled).toContain("const CACHE_VERSION = 'abc';");
    expect(filled).toContain('const PRECACHE_FILES = ["./","a.js"];');
  });

  it('refuses a worker that lost its markers rather than shipping one that never updates', () => {
    expect(() => injectPrecache('self.addEventListener()', { version: 'x', files: [] })).toThrow(
      /markers/,
    );
  });
});

// ----------------------------------------------------------- the manifest

interface WebManifest {
  readonly name: string;
  readonly short_name: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: string;
  readonly orientation: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly { src: string; sizes: string; type: string; purpose: string }[];
}

describe('the web app manifest (D-278)', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as WebManifest;

  it('names the game and starts it full screen at the root', () => {
    expect(manifest.name).toBe('Iron Veins');
    // A launcher shows at most about twelve characters under an icon.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.orientation).toBe('any');
  });

  it("takes its colours from the game's own sheet", () => {
    const css = read('src/ui/styles.css');
    expect(css).toContain(`--surface: ${manifest.background_color};`);
    expect(css).toContain(`--card: ${manifest.theme_color};`);
    expect(read('index.html')).toContain(
      `<meta name="theme-color" content="${manifest.theme_color}"`,
    );
  });

  it('names exactly the icons the build emits, a maskable one among them', () => {
    expect(manifest.icons.map((icon) => icon.src)).toEqual(WEB_ICONS.map((icon) => icon.file));
    for (const icon of manifest.icons) {
      const emitted = WEB_ICONS.find((entry) => entry.file === icon.src)!;
      expect(icon.sizes).toBe(`${emitted.size}x${emitted.size}`);
      expect(icon.purpose).toBe(emitted.maskable ? 'maskable' : 'any');
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(
      true,
    );
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
  });

  it('is linked from the page', () => {
    expect(read('index.html')).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });
});

describe('the web app icons (D-278)', () => {
  const size = 48;
  const alphaAt = (pixels: Uint8Array, x: number, y: number): number =>
    pixels[(y * size + x) * 4 + 3]!;

  it('leaves the plain icon transparent outside its rounded square', () => {
    const pixels = renderIcon(size);
    expect(alphaAt(pixels, 0, 0)).toBe(0);
    expect(alphaAt(pixels, size / 2, size / 2)).toBe(255);
  });

  it('fills the maskable icon to every edge, so no launcher shape shows a hole', () => {
    const pixels = renderMaskableIcon(size);
    for (const [x, y] of [
      [0, 0],
      [size - 1, 0],
      [0, size - 1],
      [size - 1, size - 1],
    ] as const) {
      expect(alphaAt(pixels, x, y)).toBe(255);
    }
  });
});
