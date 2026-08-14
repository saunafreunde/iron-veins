/**
 * The two ends of a hosted web build (`npm run build:vercel`).
 *
 *   node tools/web-deploy.mjs prepare   # before the build: the baked art
 *   node tools/web-deploy.mjs finish    # after it: what may be published
 *
 * Plain `.mjs` and node built-ins plus `fflate` on purpose. Everything under
 * `tools/` that ends in `.ts` needs Node's type stripping, and a build host
 * picks its own Node minor; a deploy that works on one runner and not on the
 * next is exactly the failure this file exists to prevent.
 *
 * ---------------------------------------------------------------- prepare
 *
 * `public/assets-baked/` is the Kenney bake, and E-14/D-140 keep it OUT of git
 * (the repo-assets glob test is the guard). A clean clone therefore has no
 * Kenney art at all, and the renderer answers that the way E-14 orders it: a
 * warning in the console and the procedural cells, never a refusal to start.
 *
 * So this step has exactly one job and one rule.
 *
 * The job: use a bake that is already there; otherwise fetch a PRE-BAKED
 * archive when `IRON_VEINS_ATLAS_URL` names one (D-262 - a build artefact
 * published where build artefacts belong, six megabytes instead of the
 * forty-five the twelve Kenney packs weigh, and no third-party host in the
 * critical path of a deploy); otherwise say so and let the game draw itself.
 *
 * The rule: **it never fails the build.** Every failure - no variable, a dead
 * URL, a wrong checksum, a truncated zip, a manifest naming a page that is not
 * in the archive - ends in the same place, which is the procedural game with a
 * line saying which of those it was. A deployment that 500s because an art
 * download 404'd would be a worse outcome than a plainer-looking game, and
 * E-14's "the game always starts" is not a runtime-only promise.
 *
 * ----------------------------------------------------------------- finish
 *
 * Two things, and the difference between them is the whole point.
 *
 * It DELETES the source maps from `dist/`. `vite.config.ts` builds them for
 * the desktop shell and the dev loop, and they inline the complete TypeScript
 * source of a project whose README says "not licensed for redistribution":
 * publishing them at a public URL publishes the source with the game. They are
 * 10.19 MB of a 19.75 MB `dist/`, so this also more than halves what is
 * uploaded. The desktop build and `npm run build` are untouched.
 *
 * And it REFUSES to finish when `dist/index.html` or the COOP/COEP shim is
 * missing (`release.yml`'s `test -s dist/THIRD-PARTY.txt`, one step on): those
 * are a broken build rather than absent art, and the two must not be reported
 * the same way.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAKE_DIR = join(REPO_ROOT, 'public', 'assets-baked');
const BAKE_MANIFEST = 'baked-manifest.json';
const DIST_DIR = join(REPO_ROOT, 'dist');

/** Every line this script writes carries the same prefix, so a build log greps. */
function say(message) {
  console.log(`web-deploy: ${message}`);
}

/** What "no art" sounds like. Never an error - E-14 (D-140): the game starts. */
function procedural(reason) {
  say(`no baked art (${reason})`);
  say('the deployment will draw the world procedurally - this is a supported state, not a failure');
}

// --------------------------------------------------------------------- prepare

/**
 * Is what lies in `public/assets-baked/` a bake the game can use?
 *
 * The manifest VERSION is deliberately not checked here. `src/render/
 * bakedAtlas.ts` owns that number and refuses a stale bake with its own log
 * line; restating it in a build script would be a second place for it to be
 * wrong. What this asks is only what a build script can honestly know: does
 * the manifest parse, and is every page it names actually on disk.
 */
function bakeLooksComplete(dir) {
  const manifestPath = join(dir, BAKE_MANIFEST);
  if (!existsSync(manifestPath)) return 'no manifest';
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return `manifest did not parse (${String(error)})`;
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0)
    return 'manifest names no pages';
  for (const page of manifest.pages) {
    if (typeof page?.file !== 'string') return 'a page entry has no file name';
    if (!existsSync(join(dir, page.file))) return `page ${page.file} is missing`;
  }
  return null;
}

function directoryBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? directoryBytes(path) : statSync(path).size;
  }
  return total;
}

/**
 * Download the pre-baked archive and unpack it into `public/assets-baked/`.
 *
 * Entries are written by BASENAME. The bake output is flat (ten pages plus the
 * manifest), so nothing is lost by it - and it makes a path-traversal entry
 * inside a downloaded zip unexpressible rather than guarded against.
 */
async function downloadBake(url, expectedSha256) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  say(`downloaded ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);

  if (expectedSha256) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedSha256.toLowerCase()) {
      throw new Error(`checksum mismatch: expected ${expectedSha256}, got ${actual}`);
    }
    say('checksum verified');
  }

  const files = unzipSync(bytes);
  mkdirSync(BAKE_DIR, { recursive: true });
  let written = 0;
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    writeFileSync(join(BAKE_DIR, basename(name)), content);
    written += 1;
  }
  say(`unpacked ${written} files into public/assets-baked/`);
}

async function prepare() {
  const present = existsSync(BAKE_DIR) ? bakeLooksComplete(BAKE_DIR) : 'no directory';
  if (present === null) {
    say(
      `using the bake already in public/assets-baked/ (${(directoryBytes(BAKE_DIR) / 1024 / 1024).toFixed(2)} MB)`,
    );
    return;
  }

  const url = process.env.IRON_VEINS_ATLAS_URL;
  if (!url) {
    procedural(`${present}; IRON_VEINS_ATLAS_URL is not set`);
    say('see WEB.md if you want the Kenney art in the deployment');
    return;
  }

  say(`fetching the pre-baked atlases from ${url}`);
  try {
    await downloadBake(url, process.env.IRON_VEINS_ATLAS_SHA256);
  } catch (error) {
    // Whatever we managed to write is not a bake, and a half-unpacked atlas
    // would cost the player pages rather than the whole fallback. It goes.
    rmSync(BAKE_DIR, { recursive: true, force: true });
    procedural(String(error));
    return;
  }

  const broken = bakeLooksComplete(BAKE_DIR);
  if (broken !== null) {
    rmSync(BAKE_DIR, { recursive: true, force: true });
    procedural(`the downloaded archive is incomplete - ${broken}`);
    return;
  }
  say(`baked art ready (${(directoryBytes(BAKE_DIR) / 1024 / 1024).toFixed(2)} MB)`);
}

// ---------------------------------------------------------------------- finish

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function finish() {
  if (!existsSync(DIST_DIR)) {
    console.error('web-deploy: dist/ does not exist - the build did not run');
    process.exit(1);
  }

  const files = walk(DIST_DIR);
  const missing = ['index.html', 'coi-serviceworker.js'].filter(
    (name) => !existsSync(join(DIST_DIR, name)),
  );
  if (missing.length > 0) {
    // Not the art case: index.html is the application and the shim is the web
    // channel's fallback ticket (E-13). Either one absent is a broken build.
    console.error(`web-deploy: dist/ is missing ${missing.join(', ')} - refusing to publish it`);
    process.exit(1);
  }

  let removed = 0;
  let bytes = 0;
  for (const file of files) {
    if (!file.endsWith('.map')) continue;
    bytes += statSync(file).size;
    rmSync(file);
    removed += 1;
  }
  // The comment that points at a file which is no longer there. Harmless, but
  // it is one 404 per chunk the first time anybody opens the dev tools.
  for (const file of walk(DIST_DIR)) {
    if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
    const text = readFileSync(file, 'utf8');
    const stripped = text.replace(/^\/[/*]#\s*sourceMappingURL=.*$/gm, '').replace(/\n+$/, '\n');
    if (stripped !== text) writeFileSync(file, stripped);
  }
  say(
    `removed ${removed} source maps (${(bytes / 1024 / 1024).toFixed(2)} MB) - they carry the whole source`,
  );

  const bakeInDist = existsSync(join(DIST_DIR, 'assets-baked'));
  say(
    `dist/ is ${(directoryBytes(DIST_DIR) / 1024 / 1024).toFixed(2)} MB, Kenney art ${bakeInDist ? 'included' : 'absent (procedural)'}`,
  );
}

const phase = process.argv[2];
if (phase === 'prepare') {
  await prepare();
} else if (phase === 'finish') {
  finish();
} else {
  console.error('usage: node tools/web-deploy.mjs <prepare|finish>');
  process.exit(1);
}
