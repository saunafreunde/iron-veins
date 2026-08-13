/*
 * The COOP/COEP shim of E-13, and the whole of the web channel's admission
 * ticket.
 *
 * `SharedArrayBuffer` - the double-buffered snapshot of architecture law #10 -
 * exists only in a cross-origin-isolated document, and a document is isolated
 * only when the SERVER sends `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp` with it. On a host where those
 * headers cannot be configured - a static pages host, somebody's file share -
 * the game would simply refuse to start (`SimClient.start`).
 *
 * A service worker can send them, because once it controls the page every
 * navigation is a fetch it answers. That is what this file does and all it
 * does: it passes every request through and puts the two headers on the way
 * back. The price is stated in E-13 and is accepted rather than hidden: the
 * FIRST load of a fresh browser profile is not isolated, because nothing
 * controls it yet, so `src/platform/isolation.ts` registers this worker and
 * reloads the page exactly once.
 *
 * The hard SAB requirement stays (E-13, and law #10 with it). This shim gives
 * a browser the headers it was missing; it is NOT a fallback, and there is no
 * single-threaded path behind it. Where isolation still fails after the reload,
 * the game says so and stops.
 *
 * Plain JavaScript in `public/` on purpose: a service worker is fetched by the
 * browser as a top-level script from the site root, so it cannot be part of the
 * module graph vite builds. `tests/unit/webChannel.spec.ts` loads THIS file,
 * drives the handler it registers with a fake fetch event and asserts the two
 * headers on the response it produces - so the shim is tested as shipped rather
 * than as a copy of itself.
 */

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

self.addEventListener('install', () => {
  // Take over immediately: the page that registered this worker is about to
  // reload, and a worker still "waiting" would let that reload through
  // unisolated as well - two reloads instead of one.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // A cache-only request for another origin must be left to the browser: this
  // handler would turn it into a network fetch, which is exactly what
  // `only-if-cached` says not to do.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(
    fetch(request).then((response) => {
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
    }),
  );
});
