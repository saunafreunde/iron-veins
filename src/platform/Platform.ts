/**
 * The single place in the code base that knows which desktop shell we run in.
 *
 * Section 2 of the specification: no @tauri-apps import may appear anywhere
 * else, so swapping Tauri for another shell stays a change to this directory
 * only. The ESLint config enforces that.
 */

export interface PlatformInfo {
  /** True when running inside the native shell rather than a plain browser. */
  readonly isDesktop: boolean;
  /** Version string shown in the status bar and written into save files. */
  readonly appVersion: string;
}

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Resolve shell information. In the browser this answers from the build-time
 * version constant; under Tauri it asks the Rust side, which is the value the
 * installer actually stamped into the binary.
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  if (!hasTauriRuntime()) {
    return { isDesktop: false, appVersion: __APP_VERSION__ };
  }
  const { getVersion } = await import('@tauri-apps/api/app');
  return { isDesktop: true, appVersion: await getVersion() };
}
