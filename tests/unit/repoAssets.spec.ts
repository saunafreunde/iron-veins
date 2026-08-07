import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The repo-glob guard of E-14: no binary asset ever enters git. The Kenney
 * pipeline (M12 stage 0, D-160) downloads kits and bakes PNG atlases, and
 * BOTH live in gitignored directories - this test walks the actual git
 * index, so a stray `git add -f` of a model or an atlas page turns the
 * build red instead of quietly bloating the repository (Fehlerkatalog 31).
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Everything that is an image, a model, an archive, a font or a sound.
 * The list errs towards breadth: a false positive costs one allowlist line,
 * a false negative costs the regeneration-cost advantage for ever.
 */
const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|bmp|tiff?|ico|icns|glb|gltf|fbx|obj|blend|zip|gz|tgz|tar|7z|rar|ttf|otf|woff2?|eot|mp3|ogg|wav|flac|mp4|webm|bin|dat|exe|dll|so|dylib|wasm)$/i;

/**
 * The Tauri application icons are the one deliberate exception: generated
 * by `npm run icons` from tools/make-icons.mjs (reproducible from code, the
 * 16.2 rule) but committed because the desktop bundler reads them from disk
 * at build time. Nothing else earns a place here.
 */
const ALLOWED_PREFIXES = ['src-tauri/icons/'];

function gitLines(...args: string[]): string[] {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('no binary asset in the git index (E-14 glob test)', () => {
  it('finds no tracked binary file outside the icon allowlist', () => {
    const tracked = gitLines('ls-files');
    expect(tracked.length).toBeGreaterThan(0);
    const violations = tracked.filter(
      (file) =>
        BINARY_EXTENSIONS.test(file) &&
        !ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect(violations).toEqual([]);
  });

  it('keeps the asset cache and the bake output ignored', () => {
    // check-ignore exits non-zero when a path is NOT ignored - both pipeline
    // directories must stay outside the index by construction, not by care.
    for (const path of ['assets-cache/probe.zip', 'public/assets-baked/atlas-z1-p0.png']) {
      expect(() => execFileSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT })).not.toThrow();
    }
  });
});
