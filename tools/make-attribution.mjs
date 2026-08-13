import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAttribution, renderAttribution } from './attribution-lib.ts';

/**
 * Write the third-party notices of SPEC2 M25 into `public/`, from where vite
 * copies them into `dist/` and the Tauri bundler into the installer.
 *
 * The file is a BUILD ARTEFACT and is gitignored, exactly like the baked
 * atlases (E-14): it is a pure function of `package.json` plus the installed
 * tree, so committing it would be committing a derived file that goes stale
 * the moment a dependency moves.
 *
 * Everything with a decision in it lives in `attribution-lib.ts`, which is
 * driven from a synthetic tree by `tests/unit/attribution.spec.ts`. This file
 * is the part that touches the disk: it reads, it writes, and it says where.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/**
 * Read one installed package's manifest, or null when it is not there.
 *
 * Flat `node_modules` only - npm has hoisted for a decade, and a nested copy
 * that the flat lookup misses would be a package whose licence this file
 * silently failed to name. So a miss is a refusal (`collectAttribution`
 * throws), never a shrug.
 */
function readInstalled(name) {
  const path = join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const entries = collectAttribution(rootManifest, readInstalled);
const text = renderAttribution({ product: 'Iron Veins', version: rootManifest.version }, entries);

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'THIRD-PARTY.txt');
writeFileSync(outPath, text, 'utf8');

console.log(`attribution: ${entries.length} runtime packages -> public/THIRD-PARTY.txt`);
