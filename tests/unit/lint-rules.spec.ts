import { ESLint } from 'eslint';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The architecture laws are only worth something if a machine enforces them
 * (failure #1: "just a quick window.innerWidth" creeps in over months). These
 * tests lint synthetic files against the real eslint.config.js and assert that
 * the guard rails actually fire.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: REPO_ROOT });
});

async function ruleIdsFor(relativePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: join(REPO_ROOT, relativePath) });
  return results.flatMap((result) =>
    result.messages.map((message) => message.ruleId ?? 'fatal-parse-error'),
  );
}

describe('law #1: the simulation cannot reach the renderer', () => {
  it('blocks a PixiJS import inside src/sim', async () => {
    const rules = await ruleIdsFor('src/sim/__probe__.ts', "import 'pixi.js';\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('blocks React, zustand and relative render imports as well', async () => {
    for (const specifier of ['react', 'zustand', '../render/IsoCamera', '../ui/store']) {
      const rules = await ruleIdsFor('src/sim/__probe__.ts', `import '${specifier}';\n`);
      expect(rules).toContain('no-restricted-imports');
    }
  });

  it('still allows the renderer to import PixiJS', async () => {
    const rules = await ruleIdsFor('src/ui/__probe__.tsx', "import 'pixi.js';\n");
    expect(rules).not.toContain('no-restricted-imports');
  });

  it('keeps the Tauri API inside src/platform', async () => {
    expect(await ruleIdsFor('src/ui/__probe__.ts', "import '@tauri-apps/api/app';\n")).toContain(
      'no-restricted-imports',
    );
    expect(
      await ruleIdsFor('src/platform/__probe__.ts', "import '@tauri-apps/api/app';\n"),
    ).not.toContain('no-restricted-imports');
  });
});

describe('laws #3 and #4: the simulation core stays deterministic', () => {
  it('blocks Math.random and engine dependent Math functions', async () => {
    for (const expression of [
      'Math.random()',
      'Math.sin(1)',
      'Math.pow(2, 3)',
      'Math.atan2(1, 2)',
    ]) {
      const rules = await ruleIdsFor('src/sim/__probe__.ts', `export const v = ${expression};\n`);
      expect(rules).toContain('no-restricted-properties');
    }
  });

  it('allows the arithmetic that IEEE-754 specifies exactly', async () => {
    const rules = await ruleIdsFor(
      'src/sim/__probe__.ts',
      'export const v = Math.sqrt(2) + Math.abs(-1) * Math.floor(1.5);\n',
    );
    expect(rules).not.toContain('no-restricted-properties');
  });

  it('blocks wall-clock and host globals', async () => {
    for (const expression of ['performance.now()', 'window.innerWidth', 'localStorage.length']) {
      const rules = await ruleIdsFor('src/sim/__probe__.ts', `export const v = ${expression};\n`);
      expect(rules).toContain('no-restricted-globals');
    }
    expect(await ruleIdsFor('src/sim/__probe__.ts', 'export const v = new Date();\n')).toContain(
      'no-restricted-syntax',
    );
  });

  it('blocks for...in and comparator-less sort', async () => {
    expect(
      await ruleIdsFor(
        'src/sim/__probe__.ts',
        'export function f(o: Record<string, number>): void { for (const k in o) void k; }\n',
      ),
    ).toContain('no-restricted-syntax');

    expect(
      await ruleIdsFor('src/sim/__probe__.ts', 'export const v = [3, 1, 2].sort();\n'),
    ).toContain('no-restricted-syntax');
  });

  it('exempts the worker scheduler, which owns the wall clock on purpose', async () => {
    const rules = await ruleIdsFor('src/sim/SimWorker.ts', 'const now = performance.now();\n');
    expect(rules).not.toContain('no-restricted-globals');
  });
});

describe('Z3: RNG stream discipline (D-106 as an API)', () => {
  const worldParam = "import type { World } from '../World';\n";

  it('flags a new raw draw on the shared gameplay stream inside src/sim', async () => {
    const rules = await ruleIdsFor(
      'src/sim/economy/__probe__.ts',
      `${worldParam}export function f(world: World): number { return world.rng.nextFloat(); }\n`,
    );
    expect(rules).toContain('no-restricted-syntax');
  });

  it('does not flag a stream derived through world.streamFor', async () => {
    const rules = await ruleIdsFor(
      'src/sim/economy/__probe__.ts',
      `${worldParam}export function f(world: World): number { return world.streamFor('probe').nextFloat(); }\n`,
    );
    expect(rules).not.toContain('no-restricted-syntax');
  });

  it('leaves the pre-existing draw sites alone', async () => {
    // Breakdown and industry rolls keep the shared stream deliberately -
    // migrating them would send every existing seed down a different future.
    for (const site of ['src/sim/vehicles/lifecycle.ts', 'src/sim/industry/lifecycle.ts']) {
      const rules = await ruleIdsFor(
        site,
        `${worldParam}export function f(world: World): number { return world.rng.nextFloat(); }\n`,
      );
      expect(rules).not.toContain('no-restricted-syntax');
    }
  });

  it('keeps the core determinism selectors in the allowlisted files', async () => {
    // The allowlist lifts ONLY the raw-draw tripwire; flat config replaces a
    // rule wholesale, so this asserts the restated block did not drop the
    // law #3 selectors on the way.
    const rules = await ruleIdsFor(
      'src/sim/vehicles/lifecycle.ts',
      'export const v = new Date();\n',
    );
    expect(rules).toContain('no-restricted-syntax');
  });
});

describe('repository hygiene (section 24)', () => {
  it('rejects leftover markers in any source file', async () => {
    for (const marker of ['// TODO: later', '// FIXME broken', '// not implemented yet']) {
      const rules = await ruleIdsFor('src/ui/__probe__.ts', `${marker}\nexport const v = 1;\n`);
      expect(rules).toContain('no-warning-comments');
    }
  });

  it('rejects any and @ts-ignore', async () => {
    expect(await ruleIdsFor('src/ui/__probe__.ts', 'export const v: any = 1;\n')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
    expect(
      await ruleIdsFor('src/ui/__probe__.ts', '// @ts-ignore\nexport const v = 1;\n'),
    ).toContain('@typescript-eslint/ban-ts-comment');
  });
});

describe('the real source tree passes its own rules', () => {
  it('reports no errors for src, tests and tools', async () => {
    const results = await eslint.lintFiles(['src', 'tests', 'tools', 'eslint.config.js']);
    const problems = results
      .flatMap((result) =>
        result.messages.map((message) => ({
          file: result.filePath,
          line: message.line,
          rule: message.ruleId,
          text: message.message,
        })),
      )
      .filter((problem) => problem.rule !== null);

    expect(problems).toEqual([]);
  });
});
