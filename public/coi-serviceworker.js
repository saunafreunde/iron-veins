/*
 * The service worker of the web channel: the COOP/COEP shim of E-13, and the
 * offline shell of D-278. ONE worker for both, on purpose - two workers cannot
 * share a scope, and a second one would replace the first.
 *
 * THE SHIM. `SharedArrayBuffer` - the double-buffered snapshot of architecture
 * law #10 - exists only in a cross-origin-isolated document, and a document is
 * isolated only when the SERVER sends `Cross-Origin-Opener-Policy: same-origin`
 * and `Cross-Origin-Embedder-Policy: require-corp` with it. On a host where
 * those headers cannot be configured - a static pages host, somebody's file
 * share - the game would simply refuse to start (`SimClient.start`). A service
 * worker can send them, because once it controls the page every navigation is
 * a fetch it answers. The price is stated in E-13 and accepted rather than
 * hidden: the FIRST load of a fresh browser profile on such a host is not
 * isolated, because nothing controls it yet, so `src/platform/isolation.ts`
 * registers this worker and reloads the page exactly once. That is why
 * install and activate must stay instant: the reload must find this worker
 * already in charge.
 *
 * THE OFFLINE SHELL (D-278). The same worker keeps a copy of the game:
 *
 * - **Every response it serves carries the two headers**, whether it came
 *   from the network or from the cache - an answer from the cache with no COEP
 *   would be a document without `SharedArrayBuffer`, i.e. no game (law #10).
 * - **The page asks for the precache** (a `iron-veins:precache` message) once
 *   this worker controls it, and the work happens inside that message's
 *   `waitUntil`, never inside install: a 10 MB download in install would make
 *   the shim's one reload arrive before the worker is active.
 * - **Navigations go to the network first** and keep the newest shell; only
 *   when the network fails is the cached shell answered. Everything else of
 *   this origin comes from the cache first: the build's files are hashed or
 *   pinned, and a version of this worker is a version of all of them.
 * - **The version is a hash of the build** written into this file by
 *   `tools/web-shell.ts` (`CACHE_VERSION`, `PRECACHE_FILES`). A deployment that
 *   changes any byte changes this file, which is what makes a browser install
 *   the new worker; its activation deletes every older cache.
 *
 * The hard SAB requirement stays (E-13, and law #10 with it). This worker
 * gives a browser the headers it was missing; it is NOT a fallback, and there
 * is no single-threaded path behind it.
 *
 * Plain JavaScript in `public/` on purpose: a service worker is fetched by the
 * browser as a top-level script from the site root, so it cannot be part of the
 * module graph vite builds. `tests/unit/webChannel.spec.ts` loads THIS file and
 * drives its handlers with fake events, so it is tested as shipped rather than
 * as a copy of itself.
 */

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Filled by the build (tools/web-shell.ts). Left as they are, the worker is
// the plain shim it always was: nothing is cached ahead.
const CACHE_VERSION = 'dev';
const PRECACHE_FILES = [];

const CACHE_PREFIX = 'iron-veins-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const PRECACHE_MESSAGE = 'iron-veins:precache';

self.addEventListener('install', () => {
  // Take over immediately: the page that registered this worker is about to
  // reload, and a worker still "waiting" would let that reload through
  // unisolated as well - two reloads instead of one.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), dropOlderCaches()]));
});

self.addEventListener('message', (event) => {
  if (event.data !== PRECACHE_MESSAGE) return;
  event.waitUntil(precache());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // A cache-only request for another origin must be left to the browser: this
  // handler would turn it into a network fetch, which is exactly what
  // `only-if-cached` says not to do.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(answer(request).then(isolated));
});

/** The response with the two isolation headers on it. */
function isolated(response) {
  // An opaque response (a no-cors cross-origin fetch) has no readable body
  // and no headers to copy - re-wrapping it would destroy it. The game is
  // offline and same-origin, so this is a guard rather than a path.
  if (response.status === 0) return response;

  const headers = new Headers(response.headers);
  for (const name of Object.keys(ISOLATION_HEADERS)) {
    headers.set(name, ISOLATION_HEADERS[name]);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Whether this request is one the offline shell keeps. */
function cacheable(request) {
  if (typeof caches === 'undefined' || request.method !== 'GET') return false;
  if (self.location === undefined) return false;
  return new URL(request.url).origin === self.location.origin;
}

/** The URL the shell (index.html) is kept under: the scope itself. */
function shellUrl() {
  return new URL('./', self.registration.scope).href;
}

/** A navigation to the shell, as opposed to a file opened directly. */
function isShell(url) {
  const path = new URL(url).pathname;
  const scope = new URL(self.registration.scope).pathname;
  return path === scope || path === scope + 'index.html';
}

/**
 * How the cache is asked. `ignoreVary`, because a host may send `Vary: Origin`
 * (vite preview does) and the precache fetched each file WITHOUT an Origin,
 * while the page's module scripts are CORS requests WITH one - so a strict
 * match missed the main chunk, and the first offline start failed on the very
 * file it had cached. Nothing this origin serves differs by request header.
 */
const MATCH = { ignoreVary: true };

/** Whether a network answer may be kept: complete, ours, and not partial. */
function keepable(response) {
  return response.status === 200 && response.type === 'basic';
}

async function answer(request) {
  if (!cacheable(request)) return fetch(request);
  const cache = await caches.open(CACHE_NAME);

  if (request.mode === 'navigate') {
    const key = isShell(request.url) ? shellUrl() : request.url;
    try {
      const response = await fetch(request);
      if (keepable(response)) await cache.put(key, response.clone());
      return response;
    } catch (error) {
      const cached = (await cache.match(key, MATCH)) ?? (await cache.match(shellUrl(), MATCH));
      if (cached !== undefined) return cached;
      throw error;
    }
  }

  const cached = await cache.match(request, MATCH);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  if (keepable(response)) await cache.put(request, response.clone());
  return response;
}

/**
 * Fetch whatever of the build is not in the cache yet. Each file on its own,
 * so one that fails costs that file and not the rest; a later start of the
 * game asks again and fills the gap.
 */
async function precache() {
  if (typeof caches === 'undefined' || PRECACHE_FILES.length === 0) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_FILES.map(async (file) => {
      const url = new URL(file, self.registration.scope).href;
      if ((await cache.match(url, MATCH)) !== undefined) return;
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (keepable(response)) await cache.put(url, response);
      } catch {
        // Offline right now: the next start asks again.
      }
    }),
  );
}

/** Every cache of an older version of this worker. */
async function dropOlderCaches() {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)),
  );
}
