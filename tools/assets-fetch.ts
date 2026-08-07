/**
 * `npm run assets:fetch` - download the Kenney packs (E-14/D-140/D-160).
 *
 * A developer/build step, never game runtime: the game itself stays fully
 * offline. Every pack is pinned by SHA-256 in tools/assets-manifest.json;
 * a mismatch is a hard error, because silently baking different geometry
 * than the manifest promises is how art regressions become archaeology.
 *
 * Everything lands under assets-cache/ (gitignored - the repo-assets glob
 * test proves no binary ever reaches the index):
 *   assets-cache/downloads/<id>.zip   the verified archives
 *   assets-cache/packs/<id>/...       the unpacked model files
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

interface PackEntry {
  readonly id: string;
  readonly name: string;
  readonly page: string;
  readonly url: string;
  readonly sha256: string;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'assets-manifest.json');
const CACHE_DIR = join(REPO_ROOT, 'assets-cache');
const DOWNLOAD_DIR = join(CACHE_DIR, 'downloads');
const PACKS_DIR = join(CACHE_DIR, 'packs');

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchPack(pack: PackEntry): Promise<boolean> {
  const zipPath = join(DOWNLOAD_DIR, `${pack.id}.zip`);
  let bytes: Uint8Array | null = null;

  if (existsSync(zipPath)) {
    const cached = readFileSync(zipPath);
    if (sha256Hex(cached) === pack.sha256) {
      console.log(`assets:fetch ${pack.id}: cached and verified`);
      bytes = cached;
    } else {
      console.log(`assets:fetch ${pack.id}: cached file failed its checksum, re-downloading`);
    }
  }

  if (!bytes) {
    console.log(`assets:fetch ${pack.id}: downloading ${pack.url}`);
    let response: Response;
    try {
      response = await fetch(pack.url);
    } catch (error) {
      console.error(`assets:fetch ${pack.id}: network error - ${String(error)}`);
      console.error(`  Re-pin the URL from ${pack.page} if the download moved.`);
      return false;
    }
    if (!response.ok) {
      console.error(`assets:fetch ${pack.id}: HTTP ${response.status} for ${pack.url}`);
      console.error(`  Re-pin the URL from ${pack.page} if the download moved.`);
      return false;
    }
    const downloaded = new Uint8Array(await response.arrayBuffer());
    const digest = sha256Hex(downloaded);
    if (digest !== pack.sha256) {
      console.error(`assets:fetch ${pack.id}: checksum mismatch`);
      console.error(`  expected ${pack.sha256}`);
      console.error(`  got      ${digest}`);
      console.error('  The pack changed upstream; verify it and re-pin url + sha256 together.');
      return false;
    }
    writeFileSync(zipPath, downloaded);
    bytes = downloaded;
  }

  // Unpack only what the bake can read: models, textures and the licence.
  const files = unzipSync(bytes, {
    filter: (file) =>
      !file.name.endsWith('/') &&
      (/\.(glb|gltf|png|bin)$/i.test(file.name) || /license/i.test(file.name)),
  });
  const packDir = join(PACKS_DIR, pack.id);
  let count = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.includes('..')) continue; // zip-slip guard
    const outPath = join(packDir, name);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, data);
    count++;
  }
  console.log(`assets:fetch ${pack.id}: unpacked ${count} files`);
  return true;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { packs: PackEntry[] };
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  mkdirSync(PACKS_DIR, { recursive: true });
  let failures = 0;
  for (const pack of manifest.packs) {
    const ok = await fetchPack(pack);
    if (!ok) failures++;
  }
  if (failures > 0) {
    console.error(`assets:fetch: ${failures} of ${manifest.packs.length} packs failed`);
    process.exitCode = 1;
  } else {
    console.log(`assets:fetch: all ${manifest.packs.length} packs verified and unpacked`);
  }
}

await main();
