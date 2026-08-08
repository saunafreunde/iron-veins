import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The main bundle is a shared resource with a budget, exactly like the tick
 * millisecond and the atlas page (SPEC2 6, D-191).
 *
 * The defect this exists to catch: one static
 * `import { fn } from '../sim/save/…'` in a panel pulls `serialize` and with
 * it the whole `World` into the main chunk, silently defeating a dynamic
 * import somebody else wrote for exactly that reason. It cost +248 kB (+30 %)
 * before a verifier found it BY READING THE BUILD OUTPUT - nothing in the
 * suite noticed, because a bundle nobody measures has no size. A second, much
 * smaller instance of the same chain (+32 kB through `save/format.ts`) was
 * found in the same milestone's correction bundle, which is the argument for
 * a number rather than for a rule: the rule was written down after the first
 * one and did not catch the second.
 *
 * The number below is a LEDGER entry, not a property of the machine. Raising
 * it is a deliberate act with a fresh measurement beside it - an atlas-page
 * booking in another currency (6.2, Fehlerkatalog 40) - and the test says so
 * in its failure message.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(REPO_ROOT, 'dist');

/**
 * What the main chunk may weigh. [bytes]
 *
 * Origin: M16's correction bundle, measured with `npm run build` on the
 * reference machine. The chain of the milestone reads 1,083.31 kB (the
 * regression) -> 936.94 kB (D-191, the sim's replay half moved into its own
 * lazily loaded chunk) -> 907.18 kB, 908,106 B on disk (this bundle: the save
 * container's identity split off from its parser, minus 32 kB, plus the scrub
 * bar's own code). The budget is that measurement plus ~2.4 %: enough headroom
 * for ordinary interface growth over a milestone or two, and far too little
 * for a sim module to arrive unnoticed - the cheapest such accident found so
 * far weighed 32 kB.
 *
 * The file on disk is a few hundred bytes heavier than the number vite prints
 * (the source-map comment); this measures the FILE, because that is what a
 * browser downloads.
 */
const MAIN_CHUNK_BUDGET_BYTES = 930_000;

/** The verdict, separated from the measuring so a planted size can be judged. */
interface BudgetVerdict {
  readonly withinBudget: boolean;
  readonly sizeBytes: number;
  readonly overBytes: number;
}

function judge(sizeBytes: number, budgetBytes = MAIN_CHUNK_BUDGET_BYTES): BudgetVerdict {
  return {
    withinBudget: sizeBytes <= budgetBytes,
    sizeBytes,
    overBytes: Math.max(0, sizeBytes - budgetBytes),
  };
}

/** The entry chunk index.html actually loads - never a chunk that merely looks like it. */
function entryChunkFrom(html: string): string {
  const match = /<script[^>]+src="\/assets\/([^"]+\.js)"/.exec(html);
  if (match === null) throw new Error('dist/index.html loads no module script');
  return match[1]!;
}

/** Newest mtime under a directory tree, iteratively (law #8, and it is deep). */
function newestMtime(root: string): number {
  let newest = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}

/**
 * The built bundle, built here when there is none or the sources moved after
 * it.
 *
 * A guard that skips when `dist` is absent is a guard that is green on every
 * fresh checkout and on CI, which is precisely where a regression lands. So it
 * builds - vite only, ~10 s; the type check is `npm run typecheck`'s job and
 * running it twice would be the slower half for nothing.
 */
function builtEntryPath(): string {
  const html = join(DIST, 'index.html');
  // Sources, the entry document and the build's own configuration. Modification
  // times are a heuristic - a checkout can hand back older files than the
  // artefact - and that is why it errs towards rebuilding rather than towards
  // trusting: on CI there is no `dist` at all and the build always runs.
  const inputs = Math.max(
    newestMtime(join(REPO_ROOT, 'src')),
    ...['index.html', 'vite.config.ts', 'package-lock.json'].map(
      (file) => statSync(join(REPO_ROOT, file)).mtimeMs,
    ),
  );
  const stale = !existsSync(html) || statSync(html).mtimeMs < inputs;
  if (stale) {
    execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      // NODE_ENV explicitly, because the test runner sets it to `test` and
      // vite honours an inherited value: a bundle built under it carries the
      // DEVELOPMENT React (measured +305 kB) and would fail this budget for a
      // reason that has nothing to do with what the budget is about.
      env: { ...process.env, NODE_ENV: 'production' },
    });
  }
  return join(DIST, 'assets', entryChunkFrom(readFileSync(html, 'utf8')));
}

describe('the main bundle budget (SPEC2 6, D-191)', () => {
  it('reads the entry chunk out of index.html rather than guessing its name', () => {
    const html =
      '<script type="module" crossorigin src="/assets/index-DK4yZCRo.js"></script>' +
      '<link rel="stylesheet" href="/assets/index-DWg5704u.css">';
    expect(entryChunkFrom(html)).toBe('index-DK4yZCRo.js');
    expect(() => entryChunkFrom('<html></html>')).toThrow();
  });

  it('fires on a planted oversize', () => {
    // The guard has to be shown failing, or a test that only ever sees a
    // passing measurement proves nothing about the comparison itself.
    const planted = judge(MAIN_CHUNK_BUDGET_BYTES + 248_000);
    expect(planted.withinBudget).toBe(false);
    expect(planted.overBytes).toBe(248_000);

    expect(judge(MAIN_CHUNK_BUDGET_BYTES).withinBudget).toBe(true);
    expect(judge(MAIN_CHUNK_BUDGET_BYTES + 1).withinBudget).toBe(false);
  });

  it('keeps the main chunk under its budget', { timeout: 300_000 }, () => {
    const verdict = judge(statSync(builtEntryPath()).size);
    expect(
      verdict.withinBudget,
      `the main chunk is ${verdict.sizeBytes} B, ${verdict.overBytes} B over the ` +
        `${MAIN_CHUNK_BUDGET_BYTES} B budget. Before raising the number: check whether a ` +
        'panel grew a STATIC import of a src/sim module that decodes, serialises or steps ' +
        'the world - that is what this budget is for (D-191). If the growth is genuine ' +
        'interface code, raise the number here WITH the measurement that justifies it.',
    ).toBe(true);
  });
});
