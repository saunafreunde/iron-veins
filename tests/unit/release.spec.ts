import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectAttribution,
  manifestUrl,
  renderAttribution,
  runtimeClosure,
  type PackageManifest,
} from '../../tools/attribution-lib';

/**
 * The release automation of SPEC2 M25, and the four claims it makes.
 *
 * The milestone's Fertig-wenn asks that "ein Git-Tag ohne Handarbeit
 * Installer, Web-Build und Attributions-Datei erzeugt". A workflow file cannot
 * be run in a unit test, so what is held here is everything about it that can
 * be: the generator's own rules driven from a synthetic tree, the generator's
 * behaviour on the REAL tree, and the workflow's two structural promises - a
 * tag produces both installer flavours and the notices, and the code-signing
 * gate has BOTH branches with the warning spelled out.
 *
 * The commercial-readiness checklist is bound to its own clause too. It is a
 * document of owner decisions, so nothing can assert that they are RIGHT; what
 * is asserted is that all three the specification names are present and that
 * the privacy note says the two things the specification says it must.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// ------------------------------------------------ the generator's own rules

describe('the attribution generator', () => {
  const tree: Record<string, PackageManifest> = {
    alpha: { name: 'alpha', version: '1.0.0', license: 'MIT', dependencies: { beta: '^2' } },
    beta: {
      name: 'beta',
      version: '2.3.4',
      license: 'ISC',
      // A cycle back to alpha: an npm graph really has them, which is why the
      // walk is iterative with a visited set (architecture law #8's reason,
      // outside the simulation).
      dependencies: { alpha: '^1', gamma: '^3' },
    },
    gamma: {
      name: 'gamma',
      version: '3.0.0',
      license: 'Apache-2.0',
      repository: { url: 'https://example.invalid/gamma' },
    },
    tool: { name: 'tool', version: '9.9.9', license: 'MIT' },
  };
  const read = (name: string): PackageManifest | null => tree[name] ?? null;
  const root: PackageManifest = {
    name: 'root',
    version: '0.1.0',
    dependencies: { alpha: '^1' },
    devDependencies: { tool: '^9' },
  };

  it('walks the runtime closure, survives a cycle and leaves devtools out', () => {
    expect(runtimeClosure(root, read)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('is sorted, so two builds of one commit write the same bytes', () => {
    const shuffled: PackageManifest = { ...root, dependencies: { alpha: '^1', gamma: '^3' } };
    expect(runtimeClosure(shuffled, read)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('takes the homepage, then the repository, then nothing', () => {
    expect(manifestUrl({ homepage: 'https://a.invalid' })).toBe('https://a.invalid');
    expect(manifestUrl({ repository: 'https://b.invalid' })).toBe('https://b.invalid');
    expect(manifestUrl({ repository: { url: 'https://c.invalid' } })).toBe('https://c.invalid');
    expect(manifestUrl({})).toBe('');
  });

  it('REFUSES rather than quietly shipping a package that states no licence', () => {
    // The whole point of the artefact: shipping something the project has no
    // right to ship must be impossible by accident, not caught in review.
    const unlicensed: Record<string, PackageManifest> = {
      ...tree,
      gamma: { name: 'gamma', version: '3.0.0' },
    };
    expect(() => collectAttribution(root, (name) => unlicensed[name] ?? null)).toThrow(/gamma/);
    // A dependency that is not installed at all is the same failure, because
    // it is a package whose terms nobody has seen.
    expect(() =>
      collectAttribution(root, (name) => (name === 'gamma' ? null : (tree[name] ?? null))),
    ).toThrow(/gamma/);
  });

  it('renders every package and names the two things it does not cover', () => {
    const text = renderAttribution(
      { product: 'Iron Veins', version: '1.2.3' },
      collectAttribution(root, read),
    );
    expect(text).toContain('Iron Veins 1.2.3');
    expect(text).toContain('alpha@1.0.0');
    expect(text).toContain('Licence: ISC');
    expect(text).toContain('https://example.invalid/gamma');
    // A credits file whose gaps are invisible is worse than one with none.
    expect(text).toContain('Rust crates');
    expect(text).toContain('Kenney');
    expect(text).not.toContain('tool@');
  });
});

// -------------------------------------------- the generator on the real tree

describe('the attribution generator on this repository', () => {
  it('names every dependency SPEC2 M25 lists, from the installed tree', () => {
    const rootManifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as PackageManifest;
    const read = (name: string): PackageManifest | null => {
      const path = join(REPO_ROOT, 'node_modules', ...name.split('/'), 'package.json');
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
    };

    const entries = collectAttribution(rootManifest, read);
    const names = entries.map((entry) => entry.name);
    // The five the milestone names by hand - PixiJS, React, Tauri, msgpack,
    // zlib - where zlib is fflate, this project's own pure-JS implementation.
    for (const required of [
      'pixi.js',
      'react',
      'react-dom',
      '@tauri-apps/api',
      '@msgpack/msgpack',
      'fflate',
    ]) {
      expect(names, required).toContain(required);
    }
    // And nothing from devDependencies: vite, vitest and eslint do not ship.
    for (const absent of ['vite', 'vitest', 'eslint', 'typescript']) {
      expect(names, absent).not.toContain(absent);
    }
    // Every entry really carries a licence, which is what the refusal buys.
    for (const entry of entries) expect(entry.license.length, entry.name).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------- the workflow

describe('release.yml', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');

  it('runs on a version tag', () => {
    expect(workflow).toMatch(/tags: \['v\*'\]/);
  });

  it('produces the web build, both installer flavours and the notices', () => {
    expect(workflow).toContain('npm run attribution');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('npm run build:desktop');
    expect(workflow).toContain('bundle/msi/*.msi');
    expect(workflow).toContain('bundle/nsis/*.exe');
    // The notices are asserted INSIDE the artefact, because a generated file
    // that silently stops being copied is invisible in a green build.
    expect(workflow).toContain('dist/THIRD-PARTY.txt');
  });

  it('has both halves of the code-signing gate, and warns unmissably', () => {
    // SPEC2 M25: "signiert, wenn das Zertifikat-Secret existiert; warnt sonst".
    expect(workflow).toContain('secrets.WINDOWS_CERTIFICATE');
    expect(workflow).toContain('TAURI_WINDOWS_CERTIFICATE');
    expect(workflow).toMatch(/if: steps\.signing\.outputs\.available != 'true'/);
    expect(workflow).toContain('::warning');
    expect(workflow).toContain('SmartScreen');
  });

  it('creates a DRAFT release, because publishing is an owner decision', () => {
    expect(workflow).toContain('draft: true');
  });

  it('is the only workflow that builds a release, and CI still owns the tests', () => {
    // The release job deliberately does not re-run the suite; if it ever
    // starts to, this assertion is where the argument gets re-read.
    expect(workflow).not.toContain('npm run test:soak');
    expect(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')).toContain(
      'npm run test:soak',
    );
  });
});

// -------------------------------------------- the commercial-readiness list

describe('the commercial-readiness checklist', () => {
  const release = readFileSync(join(REPO_ROOT, 'RELEASE.md'), 'utf8');

  it('carries the three items SPEC2 M25 names', () => {
    expect(release).toMatch(/Licence and end-user agreement/i);
    expect(release).toMatch(/Name and trademark/i);
    expect(release).toMatch(/Privacy note for crash bundles/i);
  });

  it('marks them as owner decisions and proposes a default for each', () => {
    expect(release).toContain('owner decision');
    expect((release.match(/\*\*Proposed default/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('states the two properties the crash-bundle note has to state', () => {
    // "offline, nur nutzerinitiierter Export" - both halves, in the document
    // rather than in somebody's memory of it.
    expect(release).toMatch(/never\s+sent\s+anywhere/i);
    expect(release).toMatch(/only\s+when\s+the\s+player\s+asks/i);
  });
});
