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
 * lazily loaded chunk) -> 907.18 kB, 908,106 B on disk (the save container's
 * identity split off from its parser, minus 32 kB, plus the scrub bar's own
 * code). The budget was that measurement plus ~2.4 %: enough headroom for
 * ordinary interface growth over a milestone or two, and far too little for a
 * sim module to arrive unnoticed - the cheapest such accident found so far
 * weighed 32 kB.
 *
 * **Raised once, in M18's third bundle (D-202), with the measurement beside
 * it** - the booking D-200 and D-201 said this bundle would have to make. The
 * chain since: 924,308 B (M17 as accepted) -> 926,473 (the weather rule's
 * interface, D-200) -> 927,719 (five constant tables, D-201) -> **934,751 B**
 * (the seasonal optics: `seasonArt.ts`, `weatherArt.ts`, the atlas repaint and
 * the MapView scheduler, plus two i18n sentences in two languages). The new
 * number is that measurement plus ~1.6 %, which keeps the rule the original
 * budget was chosen on: room for interface growth, and far less than the
 * smallest sim-import accident this test exists to catch.
 *
 * The file on disk is a few hundred bytes heavier than the number vite prints
 * (the source-map comment); this measures the FILE, because that is what a
 * browser downloads.
 *
 * **Raised again for the ground bundle**, with the measurement beside it and
 * the same rule: 946,301 B was D-212's tree and D-213 landed between the two
 * (the 124 B of the difference); the ground's four render files
 * (`ground.ts`, `TerrainAtlas.ts`, `MapView.ts`, `shapes.ts`) weigh
 * **+4,859 B**, measured by reverting exactly those four in place and
 * rebuilding (946,425 B against 951,284 B on the same tree, so the figure is
 * clean of whatever else was in flight). Every byte of it is the terrain
 * artwork - the light solver, the polygon offset, seven grain tables and the
 * contact shadow - and NONE of it is an import of a `src/sim` module that
 * decodes, serialises or steps the world, which is what this budget exists to
 * catch. 956,000 is that measurement plus ~0.5 %.
 *
 * **Raised again for SPEC2 M20 bundle 3** (the zone economy and the council
 * elections), with the measurement and the same rule. The A/B is two builds of
 * the same tree - a worktree at the bundle's parent commit against the working
 * tree, `NODE_ENV=production` on both: **955,606 B -> 959,448 B, +3,842 B**,
 * against 394 B of headroom left under the old number, so this bundle had to
 * book whatever it weighed. Split by copying ONLY the two catalogues into the
 * baseline worktree and rebuilding: **+1,505 B are the eleven new i18n keys in
 * two languages** (the two measures, the three council profiles, the four
 * council read-outs, the two news sentences and the new-game rule's own
 * paragraph), and the remaining **+2,337 B are the interface and the constant
 * tables it reaches through `constants.ts`** - the council panel's profile and
 * election rows, the new-game checkbox, and the election, profile-factor,
 * measure and milestone tables. **No new static `src/sim` import chain**: the
 * council panel already imported `town/council.ts` for `TOWN_MEASURE_KEYS` and
 * takes `COUNCIL_PROFILE_KEYS` from the same module, and `town/elections.ts` is
 * reached only from `SimWorker.ts`, which is its own chunk. 966,000 is the new
 * measurement plus ~0.7 %.
 *
 * **Raised again for SPEC2 M21 bundle 1** (the century curve), with the
 * measurement and the same rule - and it HAD to be booked: the tree came in at
 * 965,937 B, sixty-three bytes under the old number, which is not headroom, it
 * is a coincidence. The A/B is two builds of the same tree, a worktree at the
 * bundle's parent commit against the working tree: **959,545 B -> 965,937 B,
 * +6,392 B**. Split by copying ONLY the two catalogues into the baseline
 * worktree and rebuilding: **+1,505 B are the eleven new i18n keys in two
 * languages** (the century's seven row names, its two captions, its readout
 * template and the new-game rule's own paragraph), and the remaining
 * **+4,887 B are the interface and `sim/economy/curve.ts` under it** - the
 * century chart in the finance panel, the new-game checkbox, and the four
 * build-preview sites moved from `inflatedCostCt` onto `economyCostCt` so the
 * preview and the bill go through one formula (D-092). **No new static
 * `src/sim` import chain that decodes, serialises or steps a world**, which is
 * what this budget exists to catch: `economy/curve.ts` imports `constants.ts`,
 * `math.ts` and `cargo/payment.ts`, all three of which the interface already
 * pulled in, plus a TYPE-only `rng.ts` that erases. 972,000 is the new
 * measurement plus ~0.6 %.
 *
 * **Raised again for SPEC2 M21 bundle 3** (supply contracts, the subsidy board
 * and the eleventh ledger account): measured **968,190 B -> 972,824 B,
 * +4,634 B**, of which **+1,979 B are the nineteen new i18n keys in two
 * languages** (the account's own name, two reject reasons, ten supply and
 * subsidy captions and the two news sentences - measured by deleting exactly
 * those nineteen lines from both catalogues and rebuilding: 970,845 B) and the
 * remaining **+2,655 B are the interface** - the two new boards in
 * `ContractPanel`, the two marker lists in the store and the client's own
 * three-argument setter. **No new
 * static `src/sim` import chain that decodes, serialises or steps a world**:
 * the panel gained no import at all, and `economy/supply.ts` and
 * `economy/subsidies.ts` are reached only from `World.ts` and `SimWorker.ts`,
 * both of which are already the worker's chunk. 978,000 is the new measurement
 * plus ~0.5 %.
 *
 * **Raised again for SPEC2 M22 bundle 2** (the scenario workshop's palette,
 * brush sizes, debug overlays and scenario export), with the measurement and
 * the same rule. The A/B is two builds of the same tree, `NODE_ENV=production`
 * on both: **976,409 B -> 991,118 B, +14,709 B**, against 1,591 B of headroom
 * under the old number, so this bundle had to book whatever it weighed. Split
 * by deleting exactly the forty new catalogue lines from both languages and
 * rebuilding (983,020 B): **+8,098 B are the i18n keys in two languages** -
 * seven effect-explaining tool tooltips, the brush and river hints, the four
 * overlay captions with their two honesty notes, the export form and its four
 * refusals, and the new-game rule's own paragraph - and the remaining
 * **+6,611 B are the interface**: the tool registry, the four pure overlay
 * fields, the map view's overlay layer, the store's five fields and the
 * new-game checkbox. **The palette itself is NOT in this number**: `EditorPanel`
 * is loaded lazily (the D-192 pattern) into a 5,211 B chunk of its own, because
 * a player who never opens a workshop should not download one.
 *
 * **A finding this budget caught, which is what it is for**: the first build of
 * the bundle came in at 996,464 B, and 5,346 B of that were `map/terraform.ts`
 * and `mapgen/hydrology.ts` under it, dragged into the entry chunk by a palette
 * that imported `TerraformDirection` - two integers - from the module that
 * moves ground. The vocabulary moved to `constants.ts`, where constants live
 * anyway, and the chunk gave the bytes straight back. **No static `src/sim`
 * import chain that decodes, serialises or steps a world**: probed on the built
 * entry chunk, which contains no `decodeSave`, no `hashWorld`, no save magic
 * and no `streamFor`. 998,000 is the new measurement plus ~0.7 %.
 */
const MAIN_CHUNK_BUDGET_BYTES = 998_000;

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
