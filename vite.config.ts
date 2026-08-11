import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * SharedArrayBuffer is only handed out to cross-origin-isolated documents.
 * Without these two headers `new SharedArrayBuffer(n)` throws, which would take
 * down the whole sim <-> render channel. Tauri gets the same pair via
 * `app.security.headers` in src-tauri/tauri.conf.json - both environments must
 * be configured, otherwise it works in one and breaks in the other.
 */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * The dev port, 5183 unless PORT says otherwise.
 *
 * `strictPort` stays on: a silently relocated dev server is worse than a
 * refusal, because the Tauri shell and the documented URL both point at one
 * place. Reading PORT is what lets a SECOND server run beside a first one
 * (a preview tool, a colleague's session) without either of them guessing.
 */
const devPort = Number(process.env.PORT) || 5183;

export default defineConfig({
  plugins: [react()],
  // Tauri pipes the vite output through its own logger; clearing the screen
  // would swallow rust-side compiler errors.
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: devPort,
    strictPort: true,
    headers: crossOriginIsolation,
    watch: {
      // The rust build writes into src-tauri/target while the watcher is
      // walking it, and node throws EBUSY on the half written executable.
      // Nothing under src-tauri can trigger a front end reload anyway.
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    port: 5184,
    strictPort: true,
    headers: crossOriginIsolation,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
