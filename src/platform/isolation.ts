/**
 * Getting the browser channel isolated (E-13, SPEC2 M25).
 *
 * The desktop shell and the dev server both send COOP/COEP themselves
 * (`src-tauri/tauri.conf.json`, `vite.config.ts`), so this whole file is about
 * ONE case: a web build on a host whose headers nobody controls. There the
 * service worker of `public/coi-serviceworker.js` supplies them, and the price
 * is one uncontrolled reload on the first visit of a browser profile - which
 * E-13 accepts by name and which is why it is written down here as well.
 *
 * What this is NOT is a fallback. `SharedArrayBuffer` stays mandatory (law #10;
 * a single-threaded path would fork the architecture), so when isolation is
 * still missing after the reload the answer is the fatal message `SimClient`
 * has shown since M0, not a lesser game.
 *
 * The decision is a pure function of an environment record, so the reload loop
 * - the one thing that can break a game so badly the player cannot even read
 * the error - is a test rather than something discovered on a host.
 */

/** Where the shim is served from. It must be at the site root to claim '/'. */
export const COI_SERVICE_WORKER_PATH = 'coi-serviceworker.js';

/**
 * Session flag saying "this tab has already reloaded for isolation once".
 *
 * SESSION storage rather than local: a browser that refuses to isolate even
 * with the shim (a hardened profile, an extension stripping the headers) must
 * cost the player one reload per tab, never a loop - and a NEW tab must still
 * be allowed to try, because the reason may have been fixed since.
 */
export const COI_RELOAD_FLAG = 'ironveins.coiReload';

/** What the attempt did. Every outcome is reported, none is thrown. */
export type IsolationOutcome =
  /** Already isolated - the desktop shell, a configured host, or the reload. */
  | 'isolated'
  /** The page is reloading under the shim; nothing else may start. */
  | 'reloading'
  /** No shim and no isolation. The game will say so and stop (law #10). */
  | 'unavailable';

/** The registration surface, narrowed to what this decision needs. */
export interface IsolationEnvironment {
  readonly crossOriginIsolated: boolean;
  /** The desktop shell sends the headers itself; there is nothing to do. */
  readonly isDesktop: boolean;
  readonly register: ((path: string) => Promise<unknown>) | null;
  readonly session: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  } | null;
  readonly reload: () => void;
}

/**
 * Make the document cross-origin isolated, or say why it is not.
 *
 * The order of the four refusals is the argument. Already isolated wins, and
 * it CLEARS the flag: the next start of this tab may try again, because a
 * profile that is isolated today got there somehow and the flag would only
 * make a future failure permanent. The desktop is next, because registering a
 * service worker inside Tauri would install a shim over headers that are
 * already right. Then no service worker at all. And last the flag itself - a
 * second reload would be the loop this function exists to make impossible.
 */
export async function ensureCrossOriginIsolation(
  env: IsolationEnvironment,
): Promise<IsolationOutcome> {
  if (env.crossOriginIsolated) {
    env.session?.removeItem(COI_RELOAD_FLAG);
    return 'isolated';
  }
  if (env.isDesktop || env.register === null) return 'unavailable';
  if (env.session?.getItem(COI_RELOAD_FLAG) === '1') return 'unavailable';

  try {
    await env.register(COI_SERVICE_WORKER_PATH);
  } catch {
    // A host that refuses service workers (an insecure origin, a policy) is a
    // host with no web channel. It is not a crash.
    return 'unavailable';
  }

  // Set BEFORE the reload, or a shim that installs and still does not isolate
  // reloads for ever.
  env.session?.setItem(COI_RELOAD_FLAG, '1');
  env.reload();
  return 'reloading';
}

/** The real browser, as {@link ensureCrossOriginIsolation} wants to see it. */
export function browserIsolationEnvironment(): IsolationEnvironment {
  const hasWindow = typeof window !== 'undefined';
  const container = hasWindow && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  return {
    crossOriginIsolated: hasWindow && window.crossOriginIsolated,
    isDesktop: hasWindow && '__TAURI_INTERNALS__' in window,
    register: container === null ? null : (path) => container.register(path),
    session: hasWindow ? window.sessionStorage : null,
    reload: () => window.location.reload(),
  };
}
