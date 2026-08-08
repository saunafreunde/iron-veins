import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BALANCE_SCENARIOS,
  COSTLY_SCENARIOS,
  FULL_HASH_ENV,
  twinRuns,
  type BalanceScenario,
} from '../balance/determinism';

/**
 * The coupling audit behind SPEC2 M16's "every balance scenario asserts hash
 * equality over two runs".
 *
 * The claim is about a SET of files, and a set is exactly what rots: a new
 * balancing scenario is written, nobody remembers the twin, and the suite
 * quietly guards one desync surface fewer while the sentence in the ledger
 * still says "every". So the registry in `tests/balance/determinism.ts` is
 * walked against the directory in both directions - the same shape as the
 * command-parser, i18n and tool-registry audits (D-133, D-183).
 *
 * One file is deliberately exempt and it is named here rather than merely
 * missing, which is the difference between a decision and an oversight.
 */

const BALANCE_DIR = fileURLToPath(new URL('../balance/', import.meta.url));

/**
 * Balancing files that simulate nothing and therefore have no world to
 * reproduce. `tariff.spec.ts` evaluates the closed-form revenue ceiling of
 * every catalogue entry (D-066/D-187); there is no `World` anywhere in it.
 */
const WORLDLESS_SPECS: ReadonlyMap<string, string> = new Map([
  ['tariff.spec.ts', 'closed-form revenue ceilings; the file never builds a world'],
]);

/** Total order over names, so the audit reports the same list every run. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function specFiles(): string[] {
  return readdirSync(BALANCE_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort(byName);
}

/** The scenario ids a file registers a twin under. */
function registeredIn(file: string): string[] {
  const source = readFileSync(`${BALANCE_DIR}${file}`, 'utf8');
  return [...source.matchAll(/hashTwin\(\s*'([A-Za-z]+)'/g)].map((match) => match[1]!);
}

describe('the balance suite as a desync guard', () => {
  const files = specFiles();

  it('finds the balancing scenarios at all', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(BALANCE_SCENARIOS.length).toBeGreaterThan(5);
  });

  it('registers a twin in every scenario file that builds a world', () => {
    const missing = files.filter(
      (file) => !WORLDLESS_SPECS.has(file) && registeredIn(file).length === 0,
    );
    expect(
      missing,
      `balancing scenarios with no hash twin: ${missing.join(', ')} - call hashTwin() in ` +
        'the describe block, or add the file to WORLDLESS_SPECS with the reason it has no world',
    ).toEqual([]);
  });

  it('keeps the exemption list honest: an exempt file really has no world', () => {
    for (const [file, reason] of WORLDLESS_SPECS) {
      expect(files, `${file} is exempt but no longer exists`).toContain(file);
      const source = readFileSync(`${BALANCE_DIR}${file}`, 'utf8');
      expect(source, `${file} is exempt because: ${reason}`).not.toMatch(/\bWorld\b/);
    }
  });

  it('has a registry that matches the ids the files actually use', () => {
    const used = new Set<string>();
    for (const file of files) for (const id of registeredIn(file)) used.add(id);

    const declared = new Set<string>(BALANCE_SCENARIOS);
    const unregistered = [...used].filter((id) => !declared.has(id)).sort(byName);
    const unused = [...declared].filter((id) => !used.has(id)).sort(byName);

    expect(unregistered, 'ids used in a spec but missing from BALANCE_SCENARIOS').toEqual([]);
    expect(unused, 'ids in BALANCE_SCENARIOS that no spec registers').toEqual([]);
  });

  it('registers each scenario exactly once', () => {
    const counts = new Map<string, number>();
    for (const file of files) {
      for (const id of registeredIn(file)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const duplicated = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
    expect(duplicated, 'a scenario registered twice would report one file under another').toEqual(
      [],
    );
  });

  it('lists only real scenarios as costly, and skips exactly those by default', () => {
    const declared = new Set<string>(BALANCE_SCENARIOS);
    for (const id of COSTLY_SCENARIOS) expect(declared.has(id)).toBe(true);

    // The default run twins everything that is not on the costly list, and the
    // costly list is never empty-by-accident: it is what the `soak` job exists
    // for, and a silently empty one would make that job pointless.
    expect(COSTLY_SCENARIOS.length).toBeGreaterThan(0);
    expect(COSTLY_SCENARIOS.length).toBeLessThan(BALANCE_SCENARIOS.length);

    const previous = process.env[FULL_HASH_ENV];
    try {
      delete process.env[FULL_HASH_ENV];
      const skipped = BALANCE_SCENARIOS.filter((id) => !twinRuns(id));
      expect([...skipped].sort(byName)).toEqual([...COSTLY_SCENARIOS].sort(byName));

      process.env[FULL_HASH_ENV] = 'all';
      const skippedInFull = BALANCE_SCENARIOS.filter((id: BalanceScenario) => !twinRuns(id));
      expect(skippedInFull).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env[FULL_HASH_ENV];
      else process.env[FULL_HASH_ENV] = previous;
    }
  });
});
