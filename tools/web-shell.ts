/**
 * The installable, offline web shell at build time (D-278).
 *
 * Two jobs, both for `vite build` and both pure enough to be tested without
 * running one:
 *
 * - **The web-app icons** the manifest names, rendered from the same artwork
 *   as the desktop icons (`tools/icon-art.ts`) and emitted into the bundle -
 *   never committed (E-14), never downloaded.
 * - **The precache list** of the service worker. `public/coi-serviceworker.js`
 *   is copied verbatim by vite, so after the build has written `dist/` this
 *   fills its two markers: every file the build shipped (source maps excluded)
 *   and a version that is a hash of their bytes. A deployment that changes a
 *   single byte therefore ships a service worker with different bytes, which
 *   is what makes a browser install it and drop the previous cache - a worker
 *   whose own file never changes is a worker that serves last month's game.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { encodePng, renderIcon, renderMaskableIcon } from './icon-art.ts';

/** Where the service worker sits in `dist/` - the root, to claim the scope. */
export const SERVICE_WORKER_FILE = 'coi-serviceworker.js';

/** The two lines of the worker the build replaces. */
export const VERSION_MARKER = "const CACHE_VERSION = 'dev';";
export const PRECACHE_MARKER = 'const PRECACHE_FILES = [];';

/** The three icons `public/manifest.webmanifest` names. */
export const WEB_ICONS: readonly {
  readonly file: string;
  readonly size: number;
  readonly maskable: boolean;
}[] = [
  { file: 'icons/icon-192.png', size: 192, maskable: false },
  { file: 'icons/icon-512.png', size: 512, maskable: false },
  { file: 'icons/icon-maskable-512.png', size: 512, maskable: true },
];

function iconBytes(size: number, maskable: boolean): Buffer {
  return encodePng(size, maskable ? renderMaskableIcon(size) : renderIcon(size));
}

/** A file the build wrote, as the precache list sees it. */
export interface ShippedFile {
  /** Relative to `dist/`, forward slashes. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

/**
 * What the worker should cache ahead: the shell (`./`, which IS `index.html`)
 * and every shipped file except the source maps (deleted before a public
 * deployment, D-262, and never asked for by the game), the worker itself (a
 * browser fetches a service worker past every service worker) and
 * `.well-known/` (read by Android and Google from the network, never by the
 * game). Sorted, so the version below is a function of the files and not of
 * the order a directory listed them in. The version still covers
 * `index.html`, which the list names as `./`.
 */
export function precacheManifest(files: readonly ShippedFile[]): {
  readonly version: string;
  readonly files: readonly string[];
} {
  const kept = files
    .filter(
      (file) =>
        !file.path.endsWith('.map') &&
        file.path !== SERVICE_WORKER_FILE &&
        !file.path.startsWith('.well-known/'),
    )
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const file of kept) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.bytes);
  }
  return {
    version: hash.digest('hex').slice(0, 16),
    files: ['./', ...kept.filter((file) => file.path !== 'index.html').map((file) => file.path)],
  };
}

/**
 * The worker with its markers filled. Throws when a marker is missing, because
 * a worker that silently kept `'dev'` would cache one version for ever.
 */
export function injectPrecache(
  source: string,
  manifest: { readonly version: string; readonly files: readonly string[] },
): string {
  if (!source.includes(VERSION_MARKER) || !source.includes(PRECACHE_MARKER)) {
    throw new Error(
      `${SERVICE_WORKER_FILE} lost its precache markers - the offline shell would never update`,
    );
  }
  return source
    .replace(VERSION_MARKER, `const CACHE_VERSION = '${manifest.version}';`)
    .replace(PRECACHE_MARKER, `const PRECACHE_FILES = ${JSON.stringify(manifest.files)};`);
}

/** Every file under a directory, iteratively (law #8's habit). */
function shippedFiles(root: string): ShippedFile[] {
  const out: ShippedFile[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else out.push({ path: relative(root, path).split(sep).join('/'), bytes: readFileSync(path) });
    }
  }
  return out;
}

/** The vite plugin: icons into the bundle, the precache list into the worker. */
export function webShell(): Plugin {
  let outDir = '';
  let building = false;
  return {
    name: 'iron-veins-web-shell',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      building = config.command === 'build';
    },
    // The dev server has no bundle to emit into; it answers the three icon
    // paths itself, so the manifest it links is whole there too.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const icon = WEB_ICONS.find((entry) => request.url === `/${entry.file}`);
        if (icon === undefined) {
          next();
          return;
        }
        response.setHeader('Content-Type', 'image/png');
        response.end(iconBytes(icon.size, icon.maskable));
      });
    },
    generateBundle() {
      for (const icon of WEB_ICONS) {
        this.emitFile({
          type: 'asset',
          fileName: icon.file,
          source: iconBytes(icon.size, icon.maskable),
        });
      }
    },
    closeBundle() {
      // Also called when a dev server closes - with yesterday's dist/ on disk.
      if (!building) return;
      const worker = join(outDir, SERVICE_WORKER_FILE);
      if (!existsSync(worker)) return;
      const manifest = precacheManifest(shippedFiles(outDir));
      writeFileSync(worker, injectPrecache(readFileSync(worker, 'utf8'), manifest));
    },
  };
}
