import { expect, it } from 'vitest';
import { MapClimate } from '../../src/sim/constants';
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
 * **The same switch carries `aiGame`'s seed sweep since D-220.** That file used
 * to play one seed and every claim it made about the AI was a property of that
 * seed; it plays four now, at 40-70 s each, and the same argument applies for
 * the same reason - two seeds on every run, all four in the `soak` job. The
 * split and its measurements are below; `fullBalanceMode()` is what both read.
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
  // The 1870s twins of scenarios 1 and 2 (SPEC2 M23, D-245). Not costly: eight
  // and sixteen game years on 64- and 128-tile hand-built worlds, measured at
  // about 1 s and 2.6 s for the twin run.
  'eraBusLine',
  'eraCoalTrain',
  // The per-climate matrix (SPEC2 M23). Its twin is deliberately ONE world -
  // the arctic coal railway - rather than the whole sixteen-run anchor arm:
  // sixteen twins would cost the anchor arm twice for a desync surface every
  // one of those runs shares, and the file's own equality assertion already
  // compares four climates run for run.
  'climateMatrix',
  // The three difficulty levels of SPEC2 M24 (D-252). Costly - twelve quarter
  // centuries - and run in the full balance job only, so its twin belongs on
  // the costly list beside the two quarter-century AI scenarios.
  'aiDifficulty',
] as const;

export type BalanceScenario = (typeof BALANCE_SCENARIOS)[number];

/**
 * The scenarios whose twin run is skipped unless the full mode is asked for -
 * the two quarter-century AI games, measured at 143 s of the 186 s a complete
 * twin costs.
 */
export const COSTLY_SCENARIOS: readonly BalanceScenario[] = [
  'aiGame',
  'aiCompany',
  'aiDifficulty',
];

/**
 * The environment variable that asks for the whole expensive half of the
 * balance suite.
 *
 * Its NAME is historical - it was born switching hash twins on - and it is kept
 * because CI, `tools/run-full-balance.mjs` and every developer's shell alias
 * already say it. What it means is broader since D-220: this variable is
 * "run the full balance job", and the two things that hang off it are the
 * costly desync twins above and `aiGame`'s four-seed sweep, which is the other
 * quarter-century-per-seed cost in the suite. One switch, because CI's `soak`
 * job is one job.
 */
export const FULL_BALANCE_ENV = 'IRON_VEINS_BALANCE_HASH';

/**
 * True when this run is the full balance job - every twin, and every swept
 * seed. The CI `soak` job's mode, and `npm run test:balance:full` locally.
 */
export function fullBalanceMode(): boolean {
  return process.env[FULL_BALANCE_ENV] === 'all';
}

/** Whether this run twins `scenario`. */
export function twinRuns(scenario: BalanceScenario): boolean {
  return fullBalanceMode() || !COSTLY_SCENARIOS.includes(scenario);
}

/**
 * The seeds `aiGame` sweeps, and the order is deliberate (D-220).
 *
 * 4711 is the seed the whole project's AI evidence is recorded on - the soak
 * fixture replays exactly that game (D-190) - and it is the one seed on which
 * every claim `aiGame` made from M8 to D-219 was true. **4713 is second because
 * it is the counterexample**: two of its three competitors wind up, the richest
 * built nothing at all, and `woundUp.length <= 1` is red on it before D-218 and
 * after it. A run that plays only the lucky seed learns nothing, so the small
 * sweep is the recorded seed AND the seed that breaks it.
 *
 * They live here rather than in the spec because this is the module that says
 * what the full balance job costs and what it therefore buys, and because the
 * coupling audit in `tests/unit/balanceDeterminism.spec.ts` holds the split
 * honest from the outside.
 */
export const AI_SWEEP_SEEDS: readonly number[] = [4_711, 4_713, 4_712, 4_714];

/**
 * How many of them every run plays.
 *
 * **Measured on this machine, one file at a time, and the spread is real**: one
 * quarter century of the `aiGame` fixture takes 40-70 s depending on what else
 * the box is running. Whole-file wall clock, three runs on the same afternoon:
 * the old single-seed file **93.9 s**, the two-seed sweep **106.8 s**, the
 * four-seed sweep with the desync twin **242.1 s** (160.6 s of it the four
 * quarter centuries, 61.6 s the twin's replay). So the small sweep costs about
 * **+13 s on every run** and the full one about **+150 s on every push** - the
 * same trade as the costly twins above, settled the same way and with the same
 * switch.
 */
export const AI_SWEEP_DEFAULT_SIZE = 2;

/**
 * **The sixteen acceptance seeds**: the bar every AI-wide claim since D-228 has
 * been measured on, written down here for the first time (D-256).
 *
 * D-228 (the rail question), D-229 (the profit-floor sweep) and D-252/D-253
 * (the difficulty levels) all measured "over sixteen seeds" with the list living
 * in a throwaway probe, so a later bundle could reproduce the CONCLUSION only by
 * guessing the seeds. `aiDifficulty.spec.ts` sweeps it, which is why it lives
 * beside the four-seed list it extends: **the first four ARE
 * {@link AI_SWEEP_SEEDS}, in that order**, so the difficulty file and the
 * `aiGame` acceptance run agree about which worlds they are talking about.
 *
 * Why sixteen and not four, in one sentence: the four-seed view has now
 * disagreed with the sixteen-seed one twice in three bundles (D-252's capital
 * confound, D-253's ordering, which holds on 3 of the 4 swept seeds and on 5 of
 * the 16), and D-220 is the entry that says what a claim measured on the seeds
 * a suite happens to play is worth.
 */
export const AI_ACCEPTANCE_SEEDS: readonly number[] = [
  ...AI_SWEEP_SEEDS,
  2_718,
  31_415,
  60_613,
  12_345,
  77_003,
  918_273,
  131_313,
  860_213,
  8_675_309,
  246_813,
  555_777,
  22_071_969,
];

/** The seeds this run sweeps: the first two, or all of them in the full job. */
export function aiSweepSeeds(): readonly number[] {
  return fullBalanceMode() ? AI_SWEEP_SEEDS : AI_SWEEP_SEEDS.slice(0, AI_SWEEP_DEFAULT_SIZE);
}

/**
 * The climates the per-climate balance matrix sweeps, in order (SPEC2 M23).
 *
 * The third thing the full-balance switch carries, and it is the same trade as
 * the two above it. `climateMatrix.spec.ts` plays scenarios 1-4 and each
 * climate's own D-118 chain in EVERY climate, which SPEC2 M23 asks for in as
 * many words ("Szenarien 1-4 je Klima gebandet (Suite x4 - CI-Split aus 6.3
 * traegt das)"); measured on the reference machine, the whole matrix costs
 * 114 s in the default arms alone and about 175 s with the harsh-sky arm.
 *
 * **Temperate is first because it is the reference climate** - the set that IS
 * the whole catalogue (D-246), the one every band of section 19.4 was measured
 * on, and the one the canonical pin and five of the eight shipped scenarios
 * use. **Arctic is second because it is the counterexample**: it is the
 * climate whose industry set is furthest from the temperate one, and the
 * scenario-1 spread this matrix measures (30 %) is at its widest between those
 * two ends of the sweep.
 */
export const CLIMATE_SWEEP: readonly number[] = [
  MapClimate.Temperate,
  MapClimate.Arctic,
  MapClimate.Tropical,
  MapClimate.Desert,
];

/**
 * How many of them every run plays.
 *
 * Measured: the four-climate matrix costs 114 s of the balance suite's 133 s
 * again in its two default arms; the two-climate sweep costs 57 s. So the
 * small sweep is what a developer and the ordinary `npm test` job pay, and
 * the `soak` job - which runs on EVERY push - plays all four. Coverage of
 * every climate is therefore per-push, not "eventually" (D-190's own
 * sentence, one milestone on).
 */
export const CLIMATE_SWEEP_DEFAULT_SIZE = 2;

/** The climates this run sweeps: the first two, or all four in the full job. */
export function climateSweep(): readonly number[] {
  return fullBalanceMode() ? CLIMATE_SWEEP : CLIMATE_SWEEP.slice(0, CLIMATE_SWEEP_DEFAULT_SIZE);
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
