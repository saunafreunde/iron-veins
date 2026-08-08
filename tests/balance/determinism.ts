import { expect, it } from 'vitest';
import { hashWorld, type World } from '../../src/sim/World';

/**
 * The balance suite as a desync guard (SPEC2 M16).
 *
 * Every balancing scenario is a long, deliberately varied game: a bus line, a
 * coal train, a whole wood chain, a takted railway, three quarter-century AI
 * companies. Each of them already runs; SPEC2 M16 asks that each of them also
 * runs TWICE and asserts hash equality, so the suite that owns the constants
 * doubles as the widest desync net in the project. A determinism break that
 * only shows up under a working economy - a stray draw in a renewal, an
 * iteration order that depends on a Map's insertion history - has nowhere left
 * to hide.
 *
 * **The cost is real and it is measured** (reference machine, one file at a
 * time, vitest startup included): busline 6.6 s, coalTrain 9.1 s, woodChain
 * 12.3 s, bankruptcy 10.7 s, mineClosure 6.0 s, taktLine 9.4 s, netzdesign
 * 12.9 s - but aiGame 40.9 s and aiCompany 109.9 s. A twin run of everything
 * costs about +186 s of CPU, of which the two quarter-century AI scenarios are
 * 143 s: 77 % of the price for 2 of the 9 scenarios.
 *
 * SPEC2 M18's `hardWinter` is the eleventh entry and the most expensive cheap
 * one: measured 32.5 s for the file, because the band is an ensemble of six
 * seeds played in two arms (D-203). Its twin is deliberately ONE world rather
 * than twelve - measured 2.3-3.2 s of that - and the entry says which one and
 * why.
 *
 * So the twin is split rather than dropped, and the split is stated rather
 * than hidden:
 *
 *  - **every run** twins the scenarios whose second run is cheap (+43 s for
 *    the seven measured above, +2.3-3.2 s for `hardWinter`), which is what a
 *    developer gets from `npm run test:balance` and what CI's ordinary
 *    `npm test` job asserts;
 *  - **the `soak` job** (and `npm run test:balance:full` locally) sets
 *    `IRON_VEINS_BALANCE_HASH=all` and twins all nine, on every push. Coverage
 *    of every scenario is therefore per-push, not "eventually".
 *
 * The two costly ones are not unguarded in the meantime either: the long-run
 * soak fixture re-simulates a full twenty-five year AI game and compares it
 * against twenty-six committed hashes on every push, which is the same
 * evidence one size larger.
 */

/**
 * Every balancing scenario that SIMULATES, by the id it registers under.
 *
 * `tariff.spec.ts` is deliberately absent: it evaluates the closed-form
 * revenue ceiling of every catalogue entry and never builds a world, so there
 * is no hash for it to reproduce. The coupling audit in
 * `tests/unit/balanceDeterminism.spec.ts` knows that by name, so the absence
 * cannot rot into an oversight.
 */
export const BALANCE_SCENARIOS = [
  'busline',
  'coalTrain',
  'hardWinter',
  'woodChain',
  'idleCompany',
  'mineClosure',
  'taktLine',
  'netzdesign',
  'gameScore',
  'aiGame',
  'aiCompany',
] as const;

export type BalanceScenario = (typeof BALANCE_SCENARIOS)[number];

/**
 * The scenarios whose twin run is skipped unless the full mode is asked for -
 * the two quarter-century AI games, measured at 143 s of the 186 s a complete
 * twin costs.
 */
export const COSTLY_SCENARIOS: readonly BalanceScenario[] = ['aiGame', 'aiCompany'];

/** The environment variable that asks for every twin. */
export const FULL_HASH_ENV = 'IRON_VEINS_BALANCE_HASH';

/** True when every scenario is to be twinned - the CI `soak` job's mode. */
export function fullHashMode(): boolean {
  return process.env[FULL_HASH_ENV] === 'all';
}

/** Whether this run twins `scenario`. */
export function twinRuns(scenario: BalanceScenario): boolean {
  return fullHashMode() || !COSTLY_SCENARIOS.includes(scenario);
}

/**
 * Register the desync guard for one scenario.
 *
 * `recorded` hands back the world (or worlds) the file has ALREADY built for
 * its band assertions, so the guard costs exactly one extra construction and
 * not two; `again` builds the same thing a second time. Both are thunks, so a
 * skipped twin computes nothing at all.
 */
export function hashTwin(
  scenario: BalanceScenario,
  recorded: () => readonly World[],
  again: () => readonly World[],
): void {
  const runner = twinRuns(scenario) ? it : it.skip;
  runner(`is a desync guard: ${scenario} reaches the same world hash twice`, () => {
    const first = recorded().map(hashWorld);
    expect(first.length).toBeGreaterThan(0);
    const second = again().map(hashWorld);
    expect(second).toEqual(first);
  });
}
