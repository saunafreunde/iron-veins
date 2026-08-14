import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The hosted web build's admission ticket, held against the two places that
 * already send it.
 *
 * `SharedArrayBuffer` - the double-buffered snapshot of architecture law #10 -
 * exists only in a cross-origin-isolated document, and a document is isolated
 * only when the SERVER sends `Cross-Origin-Opener-Policy: same-origin` and
 * `Cross-Origin-Embedder-Policy: require-corp`. Three files now say that pair
 * out loud: `vite.config.ts` for the dev server and `vite preview`,
 * `public/coi-serviceworker.js` for a host that cannot be configured, and
 * `vercel.json` for the one that can. The comment in `vite.config.ts` already
 * warns that "both environments must be configured, otherwise it works in one
 * and breaks in the other" - this is that warning with something red behind
 * it, the D-133/D-183 shape.
 *
 * It also holds three things about `vercel.json` that are easy to add later
 * and expensive to notice: the output directory the build really writes, the
 * absence of an `env` block (a known way to make environment values go wrong
 * silently in this workspace - they belong in the dashboard), and the absence
 * of a catch-all rewrite. The last one is E-14's fallback: a missing
 * `assets-baked/baked-manifest.json` has to answer 404 so that
 * `src/render/bakedAtlas.ts` says "no baked art; using procedural art". A
 * rewrite to `index.html` would answer 200 with a page of HTML instead.
 */

const REPO = new URL('../../', import.meta.url);
const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, REPO)), 'utf8');

const COOP = 'Cross-Origin-Opener-Policy';
const COEP = 'Cross-Origin-Embedder-Policy';

/** Both headers as one source file states them, whatever its syntax. */
function isolationPairIn(source: string): Record<string, string> {
  const pair: Record<string, string> = {};
  for (const name of [COOP, COEP]) {
    const match = new RegExp(`['"]${name}['"]\\s*:\\s*['"]([^'"]+)['"]`).exec(source);
    if (match !== null) pair[name] = match[1]!;
  }
  return pair;
}

interface VercelHeaderRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}

interface VercelConfig {
  readonly buildCommand?: string;
  readonly outputDirectory?: string;
  readonly installCommand?: string;
  readonly headers?: readonly VercelHeaderRule[];
  readonly rewrites?: readonly unknown[];
  readonly env?: unknown;
}

describe('vercel.json, the hosted web build', () => {
  const config = JSON.parse(read('vercel.json')) as VercelConfig;
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };

  /** The rule that applies to every path, i.e. to the document itself. */
  const catchAll = (config.headers ?? []).find((rule) => rule.source === '/(.*)');

  it('sends the isolation pair on every path', () => {
    expect(catchAll, 'vercel.json has no rule matching every path').toBeDefined();
    const sent = Object.fromEntries(catchAll!.headers.map((h) => [h.key, h.value]));
    expect(sent[COOP]).toBe('same-origin');
    expect(sent[COEP]).toBe('require-corp');
  });

  it('sends exactly what the dev server and the service-worker shim send', () => {
    // Three copies of one pair. They may only ever be three copies of the SAME
    // pair - a host that sends `credentialless` where the shim sends
    // `require-corp` is a game that works until somebody clears a worker.
    const fromVite = isolationPairIn(read('vite.config.ts'));
    const fromShim = isolationPairIn(read('public/coi-serviceworker.js'));
    const fromVercel = Object.fromEntries(catchAll!.headers.map((h) => [h.key, h.value]));

    expect(fromVite).toEqual({ [COOP]: 'same-origin', [COEP]: 'require-corp' });
    expect(fromShim).toEqual(fromVite);
    expect({ [COOP]: fromVercel[COOP], [COEP]: fromVercel[COEP] }).toEqual(fromVite);
  });

  it('publishes the directory vite writes and runs a script that exists', () => {
    expect(config.outputDirectory).toBe('dist');
    // vite.config.ts is the authority on where the build lands.
    expect(read('vite.config.ts')).toMatch(/outDir:\s*'dist'/);

    const command = config.buildCommand ?? '';
    const script = /^npm run ([\w:-]+)$/.exec(command)?.[1];
    expect(script, `buildCommand ${command} is not a plain npm script`).toBeDefined();
    expect(packageJson.scripts[script!]).toBeTypeOf('string');

    // Every file that chain invokes really is in the tree.
    for (const match of packageJson.scripts[script!]!.matchAll(/(tools\/[\w.-]+)/g)) {
      expect(existsSync(fileURLToPath(new URL(match[1]!, REPO))), `${match[1]} exists`).toBe(true);
    }
  });

  it('carries no env block - environment values belong in the dashboard', () => {
    expect(config.env).toBeUndefined();
  });

  it('rewrites nothing, so a missing atlas stays a 404 and the game goes procedural', () => {
    expect(config.rewrites ?? []).toEqual([]);
  });
});
