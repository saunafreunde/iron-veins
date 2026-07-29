import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Write the version from package.json through to the two places the desktop
 * build reads it from.
 *
 * Three files carry the same number: package.json (which the web build stamps
 * into `__APP_VERSION__`), tauri.conf.json (which names the installer) and
 * Cargo.toml (which the binary reports through `getVersion`). A release where
 * those disagree produces an installer called one thing containing a binary
 * that says another, and the version in a bug report is then worth nothing.
 *
 * This is deliberately a one-way sync from package.json rather than a check:
 * `npm version` already moves that one, and a tool that only complains still
 * leaves somebody editing three files by hand.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const pkgPath = join(root, 'package.json');
const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version ${String(version)} is not a three-part version`);
}

// tauri.conf.json: rewritten as JSON, so the file stays exactly as formatted
// apart from the one field.
const confPath = join(root, 'src-tauri', 'tauri.conf.json');
const conf = readFileSync(confPath, 'utf8');
const confNext = conf.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
if (confNext === conf && !conf.includes(`"version": "${version}"`)) {
  throw new Error('src-tauri/tauri.conf.json has no version field to update');
}
writeFileSync(confPath, confNext);

// Cargo.toml: only the FIRST version line, which is the package's own. A
// dependency pinned to "2" further down must not be touched.
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
const cargoNext = cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`);
if (cargoNext === cargo && !cargo.includes(`version = "${version}"`)) {
  throw new Error('src-tauri/Cargo.toml has no package version to update');
}
writeFileSync(cargoPath, cargoNext);

console.log(`version ${version} written to tauri.conf.json and Cargo.toml`);
