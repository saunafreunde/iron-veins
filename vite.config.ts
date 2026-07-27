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

export default defineConfig({
  plugins: [react()],
  // Tauri pipes the vite output through its own logger; clearing the screen
  // would swallow rust-side compiler errors.
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5183,
    strictPort: true,
    headers: crossOriginIsolation,
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
