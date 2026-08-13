import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AI_CANDIDATES_TRIED,
  AI_CHAIN_LOOKAHEAD,
  AI_DECISION_INTERVAL_TICKS,
  AI_MAX_VEHICLES_PER_LINE,
  AI_START_CAPITAL_CT,
  AI_TENDER_MIN_MONTHS,
  COUNCIL_EXCLUSIVE_MIN_RATING,
  COUNCIL_RATING_NEVER,
  DIFFICULTY_AI_TRAITS,
  Difficulty,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_MONTH,
  type DifficultyAiTraits,
} from '../../src/sim/constants';
import {
  aiTraits,
  exclusiveRightsTown,
  fleetFor,
  opportunities,
  tenderWorthTaking,
} from '../../src/sim/ai/evaluate';
import { Personality } from '../../src/sim/ai/types';
import { Cargo } from '../../src/sim/cargo/types';
import type { Contract } from '../../src/sim/economy/contracts';
import { World } from '../../src/sim/World';

/**
 * **SPEC.md 15 promises three difficulty levels with better evaluation
 * functions, and until SPEC2 M24 `evaluate.ts` never read `world.difficulty`
 * once** (D-252). The level moved the start capital and the loan interest and
 * left all three playing the identical opponent - and the capital it moved was
 * handed to the COMPETITORS too, which is the defect D-253 closed: the player's
 * purse follows the level, a competitor's is the Normal baseline in all three.
 *
 * `DIFFICULTY_AI_TRAITS` is the data table that closes it, rebuilt in D-257 on
 * the four bundles of measurement behind it - the chain look-ahead left the
 * table for `AI_CHAIN_LOOKAHEAD` because it made a competitor WORSE the further
 * it was turned, and the terrain probe, the one knob measured to help, carries
 * the level. This file holds the four things that would otherwise rot (the
 * fourth is that missing column, asserted absent):
 *
 *  1. **The Normal row is the identity.** Every AI measurement this project has
 *     ever taken - the five bands of section 19.4, scenario 5, the `aiGame`
 *     sweep, the soak fixture, the canonical cross-OS pin - is a Normal world.
 *     A Normal row that merely approximated today's behaviour would re-band all
 *     of them inside the milestone that introduces the table (Fehlerkatalog
 *     34), so each field is asserted against the constant it must reproduce.
 *  2. **The table is read in exactly one place.** A second reader is how a data
 *     table and the behaviour it describes come apart (the D-133/D-183 shape).
 *  3. **The terrain probe is priced, and it is not in the tick hot path.**
 *     SPEC2 M24 bounds it at 1 ms per candidate check and forbids it in the
 *     tick; both are measured rather than promised.
 */

const SIM_DIR = fileURLToPath(new URL('../../src/sim', import.meta.url));

/** Total order over file names, so a failure reads the same every run. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The eight seeds the AI evidence of D-221/D-229 was measured over. */
const SEEDS = [4711, 4713, 4712, 4714, 2718, 31415, 60613, 12345] as const;

function world(seed: number, difficulty: Difficulty): World {
  return World.create({
    seed,
    difficulty,
    climate: MapClimate.Temperate,
    mapSize: 256,
    companyName: 'Testbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
}

function simSources(): string[] {
  const files = readdirSync(SIM_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replaceAll('\\', '/'));
  expect(files.length).toBeGreaterThan(10);
  return files;
}

function speaking(pattern: RegExp): string[] {
  return simSources().filter((name) => pattern.test(readFileSync(join(SIM_DIR, name), 'utf-8')));
}

/**
 * The same walk with the comments taken out, because prose is not a reader -
 * the rule this file already applies to `DIFFICULTY_AI_TRAITS` below, needed
 * once more since `economy/company.ts` NAMES the constant it stopped looking
 * up (D-253).
 */
function speakingInCode(pattern: RegExp): string[] {
  return simSources().filter((name) =>
    pattern.test(
      readFileSync(join(SIM_DIR, name), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' '),
    ),
  );
}

const EASY = DIFFICULTY_AI_TRAITS[Difficulty.Easy]!;
const NORMAL = DIFFICULTY_AI_TRAITS[Difficulty.Normal]!;
const HARD = DIFFICULTY_AI_TRAITS[Difficulty.Hard]!;

describe('the difficulty table SPEC.md 15 asks for', () => {
  it('has one row per level and nothing else', () => {
    expect(DIFFICULTY_AI_TRAITS).toHaveLength(3);
    expect(aiTraits({ difficulty: Difficulty.Easy } as World)).toBe(EASY);
    expect(aiTraits({ difficulty: Difficulty.Normal } as World)).toBe(NORMAL);
    expect(aiTraits({ difficulty: Difficulty.Hard } as World)).toBe(HARD);
  });

  /**
   * The claim that keeps every band in this project where it is. Each field is
   * compared with the constant or the literal the pre-M24 code used, not with
   * "whatever the table happens to say" - a test that read the table twice
   * would agree with any edit at all.
   */
  it('is the exact identity of the pre-M24 competitor at Normal', () => {
    expect(NORMAL.candidatesTried).toBe(AI_CANDIDATES_TRIED);
    expect(NORMAL.terrainProbes).toBe(0);
    expect(NORMAL.fleetHeadroom).toBe(1);
    expect(NORMAL.tenders).toBe(false);
    expect(NORMAL.exclusiveRightsRating).toBe(COUNCIL_RATING_NEVER);
    // A rating is clamped to 0..100 by `ratingFor`, so NEVER really is never.
    expect(COUNCIL_RATING_NEVER).toBeGreaterThan(100);
  });

  /**
   * **The chain look-ahead is not in the table, and that is asserted rather
   * than left to a reader** (D-257). It was a column - 0 / 1 / 2 - and it was
   * the only one that separated all three rows, which is exactly why the level
   * could not be ordered: it was measured anti-correlated with company value
   * in both directions (D-252) and, once its own exposure confound was taken
   * out, with the D-256 survival share too. A knob that makes a competitor
   * worse the further it is turned cannot carry a difficulty in either
   * direction, so it lives at ONE depth for every level.
   */
  it('keeps the chain look-ahead out of the level, at one depth for everybody', () => {
    expect(AI_CHAIN_LOOKAHEAD).toBe(1);
    for (const row of [EASY, NORMAL, HARD]) {
      expect(Object.keys(row)).not.toContain('chainLookahead');
    }
    // The collector is fed the constant and nothing per level: `aiTraits` is
    // the one accessor and the depth may not travel through it again.
    const evaluateSource = readFileSync(join(SIM_DIR, 'ai/evaluate.ts'), 'utf-8');
    expect(evaluateSource).toContain(
      'collectIndustryPairs(world, found, rail, companyId, AI_CHAIN_LOOKAHEAD)',
    );
    expect(evaluateSource).not.toContain('traits.chainLookahead');
  });

  it('orders the three levels on every knob it has', () => {
    const rows: readonly DifficultyAiTraits[] = [EASY, NORMAL, HARD];
    for (const pick of [
      (row: DifficultyAiTraits): number => row.candidatesTried,
      (row: DifficultyAiTraits): number => row.terrainProbes,
      (row: DifficultyAiTraits): number => row.fleetHeadroom,
    ]) {
      expect(pick(rows[0]!)).toBeLessThanOrEqual(pick(rows[1]!));
      expect(pick(rows[1]!)).toBeLessThanOrEqual(pick(rows[2]!));
    }
    expect([EASY.tenders, NORMAL.tenders, HARD.tenders]).toEqual([false, false, true]);
    // Building rights the other way round: a LOWER threshold buys them sooner,
    // and Hard's is the earliest the command would allow a player.
    expect(HARD.exclusiveRightsRating).toBe(COUNCIL_EXCLUSIVE_MIN_RATING);
    expect(EASY.exclusiveRightsRating).toBe(COUNCIL_RATING_NEVER);
  });

  /**
   * **A level reaches a competitor through the judgement table and nowhere
   * else** (D-253). It used to reach it through the purse as well:
   * `createCompany` was handed `world.difficulty` for every company, so a Hard
   * world's three competitors were 750,000 EUR poorer than a Normal world's
   * before a judgement was made - a factor of two against a table worth
   * single-digit percent (D-252), and the reason SPEC2 M24's ordering clause
   * could not be measured at all.
   *
   * The audit is a source walk rather than a promise: exactly one file may look
   * the player's row up, and it is the door the PLAYER'S company is built at.
   */
  it('reaches a competitor through the table and not through the purse', () => {
    // `\b` before START excludes `AI_START_CAPITAL_CT`, whose own definition
    // indexes the row - that is the derivation, not a second policy.
    expect(speakingInCode(/\bSTART_CAPITAL_CT\[/).sort(byName)).toEqual([
      'World.ts',
      'constants.ts',
    ]);
    expect(speakingInCode(/AI_START_CAPITAL_CT/).sort(byName)).toEqual([
      'company/roster.ts',
      'constants.ts',
    ]);
    // Every competitor opens on the baseline, at every level.
    for (const difficulty of [Difficulty.Easy, Difficulty.Normal, Difficulty.Hard]) {
      const built = world(4711, difficulty);
      for (const state of built.ai) {
        expect(built.companyOf(state.companyId).cashCt).toBe(AI_START_CAPITAL_CT);
      }
      expect(built.playerCompany.cashCt).toBe(START_CAPITAL_CT[difficulty]);
    }
  });

  /**
   * SPEC2 M24 says the table is "gelesen von `evaluate.ts`". It is read there
   * and nowhere else in the simulation - `ai.ts` asks `aiTraits`, which is the
   * one accessor.
   */
  it('is read in exactly one file, through one accessor', () => {
    // A LOOKUP, not a mention: `ai.ts` names the table in a comment, and prose
    // is not a second reader.
    expect(speaking(/DIFFICULTY_AI_TRAITS\[/)).toEqual(['ai/evaluate.ts']);
    const evaluateSource = readFileSync(join(SIM_DIR, 'ai/evaluate.ts'), 'utf-8');
    const reads = [...evaluateSource.matchAll(/DIFFICULTY_AI_TRAITS\[/g)];
    // `aiTraits` looks the row up and falls back to Normal - two indexings,
    // one accessor. A third would be somebody reaching past it.
    expect(reads.length).toBeLessThanOrEqual(2);
    expect(reads.length).toBeGreaterThan(0);
    expect(speaking(/\baiTraits\(/).sort(byName)).toEqual(['ai/ai.ts', 'ai/evaluate.ts']);
  });
});

describe('the fleet headroom is a branch, not a multiplication', () => {
  it('gives back exactly the advised fleet at Normal', () => {
    for (const round of [4_000, 12_000, 40_000]) {
      for (const output of [50, 300, 3_000]) {
        const advised = fleetFor(round, 120, output, AI_MAX_VEHICLES_PER_LINE, 1);
        expect(advised).toBeGreaterThanOrEqual(1);
        expect(advised).toBeLessThanOrEqual(AI_MAX_VEHICLES_PER_LINE);
        // Hard never fields fewer, Easy never fields more - and neither may
        // leave the cap the drain gate and the profitability floor are quoted
        // for.
        const hard = fleetFor(round, 120, output, AI_MAX_VEHICLES_PER_LINE, HARD.fleetHeadroom);
        const easy = fleetFor(round, 120, output, AI_MAX_VEHICLES_PER_LINE, EASY.fleetHeadroom);
        expect(hard).toBeGreaterThanOrEqual(advised);
        expect(easy).toBeLessThanOrEqual(advised);
        expect(hard).toBeLessThanOrEqual(AI_MAX_VEHICLES_PER_LINE);
        expect(easy).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('the level reaches the candidate list', () => {
  /**
   * The whole point of the table, asserted where it can be seen cheaply: the
   * ranked list a competitor is offered at game start is not the same list on
   * all three levels. It is asserted over a SWEEP rather than on one seed,
   * because an ordering that holds on one seed is the failure D-220 exists to
   * prevent - and it is asserted as "somewhere", because a seed whose map
   * offers nothing legitimately offers nothing on every level.
   */
  it('offers three different lists over the eight measured seeds', () => {
    let hardDiffers = 0;
    let easyDiffers = 0;
    let nonEmpty = 0;

    for (const seed of SEEDS) {
      const easy = opportunities(world(seed, Difficulty.Easy), Personality.Road, 1);
      const normal = opportunities(world(seed, Difficulty.Normal), Personality.Road, 1);
      const hard = opportunities(world(seed, Difficulty.Hard), Personality.Road, 1);
      if (normal.length > 0) nonEmpty++;
      const signature = (list: ReturnType<typeof opportunities>): string =>
        list.map((one) => `${one.fromX},${one.fromY}>${one.toX},${one.toY}@${one.score}`).join('|');
      if (signature(hard) !== signature(normal)) hardDiffers++;
      if (signature(easy) !== signature(normal)) easyDiffers++;
    }

    console.log(
      `difficulty reaches the ranking: ${nonEmpty}/8 seeds offer anything at Normal, ` +
        `Hard differs on ${hardDiffers}/8, Easy on ${easyDiffers}/8`,
    );
    expect(nonEmpty).toBeGreaterThan(0);
    expect(hardDiffers).toBeGreaterThan(0);
  });
});

describe('the terrain probe is priced, and it is not in the tick', () => {
  /**
   * SPEC2 M24: "Terrain-Probe via `planTrack` fuer Top-N - amortisiert im
   * KI-Bauzyklus, <= 1 ms pro Kandidatenpruefung, nie im Tick-Hot-Path".
   *
   * The measurement is the delta between one Hard ranking and one Normal
   * ranking over the same world, divided by the number of candidates the level
   * probes - so it prices exactly the thing the clause bounds. The GATE is four
   * times the clause, which is this project's own rule about wall-clock
   * assertions (D-167: gates are multiples, the acceptance number is the one
   * printed here).
   */
  it('costs a fraction of a millisecond per probed candidate', () => {
    const per: number[] = [];
    for (const seed of SEEDS) {
      const hardWorld = world(seed, Difficulty.Hard);
      const normalWorld = world(seed, Difficulty.Normal);
      // Warm both paths, so neither measurement pays for a first-call compile.
      opportunities(hardWorld, Personality.Road, 1);
      opportunities(normalWorld, Personality.Road, 1);

      const beforeHard = performance.now();
      opportunities(hardWorld, Personality.Road, 1);
      const hardMs = performance.now() - beforeHard;
      const beforeNormal = performance.now();
      opportunities(normalWorld, Personality.Road, 1);
      const normalMs = performance.now() - beforeNormal;
      per.push(Math.max(0, hardMs - normalMs) / HARD.terrainProbes);
    }
    per.sort((a, b) => a - b);
    const median = per[per.length >> 1]!;
    const worst = per[per.length - 1]!;
    console.log(
      `terrain probe over ${SEEDS.length} seeds: p50 ${median.toFixed(3)} ms, ` +
        `max ${worst.toFixed(3)} ms per probed candidate (SPEC2 M24 clause: 1 ms)`,
    );
    expect(median).toBeLessThan(4);
  });

  /**
   * "Never in the tick hot path" is a structural claim and is checked
   * structurally: the ranking has exactly one caller in the simulation, that
   * caller is `startProject`, and `startProject` is behind the decision
   * interval AND the retry interval. A wall-clock assertion here would measure
   * the machine, not the code.
   */
  it('is reachable only from the build cycle', () => {
    expect(speaking(/\bopportunities\(/)).toEqual(['ai/ai.ts', 'ai/evaluate.ts']);
    const source = readFileSync(join(SIM_DIR, 'ai/ai.ts'), 'utf-8');
    expect([...source.matchAll(/\bopportunities\(/g)]).toHaveLength(1);
    const startProject = source.slice(source.indexOf('function startProject'));
    expect(startProject).toContain('opportunities(');
    expect(startProject).toContain('AI_RETRY_TICKS');
    expect(source).toContain('AI_DECISION_INTERVAL_TICKS');
    expect(AI_DECISION_INTERVAL_TICKS).toBeGreaterThan(1);
  });
});

describe('the two boards a level opens', () => {
  function tender(world: World, townId: number): Contract {
    return {
      id: 1,
      cargo: Cargo.Goods,
      townId,
      amountUnits: 200,
      offeredTick: world.tick,
      deadlineTick: world.tick + 4 * TICKS_PER_MONTH,
      bonusCt: 1_000_00,
      acceptedBy: [],
      progress: [],
      completedBy: -1,
    };
  }

  it('never takes a tender below the level that participates', () => {
    for (const difficulty of [Difficulty.Easy, Difficulty.Normal]) {
      const w = world(4711, difficulty);
      expect(tenderWorthTaking(w, 1, tender(w, 0), aiTraits(w))).toBe(false);
    }
  });

  it('refuses a tender no running line of this company could serve', () => {
    const w = world(4711, Difficulty.Hard);
    // A brand new world: nobody owns a line, so there is nothing to bet on.
    expect(tenderWorthTaking(w, 1, tender(w, 0), aiTraits(w))).toBe(false);
    // And a deadline too short to be worth a bet is refused before the network
    // is even looked at.
    const soon = { ...tender(w, 0), deadlineTick: w.tick + AI_TENDER_MIN_MONTHS * TICKS_PER_MONTH };
    expect(tenderWorthTaking(w, 1, soon, aiTraits(w))).toBe(false);
  });

  it('never buys building rights below the level that buys them', () => {
    for (const difficulty of [Difficulty.Easy, Difficulty.Normal]) {
      const w = world(4711, difficulty);
      expect(w.towns.length).toBeGreaterThan(0);
      expect(exclusiveRightsTown(w, 1, aiTraits(w))).toBe(-1);
    }
  });

  it('buys none in a town it does not serve, even at the level that buys them', () => {
    const w = world(4711, Difficulty.Hard);
    // A competitor with no station anywhere: rights over a town it has never
    // served buy nothing but a bill.
    expect(exclusiveRightsTown(w, 1, aiTraits(w))).toBe(-1);
  });
});
