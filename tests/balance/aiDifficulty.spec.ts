import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import type { CommandEnvelope, CommandOutcome } from '../../src/sim/commands/types';
import {
  AI_START_CAPITAL_CT,
  Difficulty,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';
import {
  EXPOSURE_YEARS,
  surviving,
  survivalLine,
  watchLines,
  type LineLife,
  type SurvivalReading,
} from './aiLineSurvival';
import { LOOP_ISSUES, looping, recordOutcomes, refusalTrace, undeclared } from './aiRefusals';
import { AI_ACCEPTANCE_SEEDS, fullBalanceMode, hashTwin } from './determinism';

/**
 * **The difficulty bands of SPEC2 M24 - and the instrument its Fertig-wenn
 * needed, built after two bundles reported the clause unmet on the one it
 * names** (D-252, D-253, D-256).
 *
 * SPEC2 M24 asks that "ein Hard-KI-Lauf auf der Referenzkarte bei gleichem Seed
 * messbar hoeheren Firmenwert erreicht als Normal (eigene Testbaender je
 * Stufe)". The bands per level are here, measured. The ORDERING in company
 * value is not, and both earlier bundles said so with their traces:
 *
 * | level  | value at year 25 | created    | per euro | crewed | seeds | lines | vehicles |
 * | ------ | ---------------- | ---------- | -------- | ------ | ----- | ----- | -------- |
 * | Easy   |       29,873,058 | +5,873,058 |   1.2447 |     17 | 14/16 |    28 |      168 |
 * | Normal |       26,215,097 | +2,215,097 |   1.0923 |     12 | 10/16 |    17 |      102 |
 * | Hard   |       24,735,440 |   +735,440 |   1.0306 |     10 |  9/16 |    16 |       90 |
 *
 * (Sixteen acceptance seeds, 25 years, three competitors, 256 temperate map,
 * every level's competitors opening on the same 24,000,000 EUR since D-253 took
 * the player's handicap off them.)
 *
 * **The measurement was against the wrong instrument, and D-253 named the
 * reason without taking the consequence.** What distinguishes Hard is a deeper
 * chain look-ahead; what a deeper chain test buys is a line that is still
 * standing in ten years; and a balance sheet at year twenty-five cannot tell a
 * line that was never built from a line that died - it can only count the
 * money. So D-256 measured the OPPONENT instead of its bank account
 * (`aiLineSurvival.ts`), over the same sixteen seeds, and the four readings do
 * not agree with each other. That disagreement IS the finding:
 *
 * | reading                                  | Easy | Normal |  Hard | ordered? |
 * | ---------------------------------------- | ---- | ------ | ----- | -------- |
 * | lines opened                             |   61 |     35 |    32 | Hard fewest |
 * | still standing at year 25                |   28 |     17 |    16 | - |
 * | **survival share**                       | 45.9 | 48.6 % | 50.0 % | monotone, by under ONE line |
 * | mean game year a line was opened in      | 7.82 |   9.70 | 10.60 | Hard LATEST |
 * | mean life of a line that closed [yr]     | 3.23 |   2.70 |  2.88 | no |
 * | survival with 12.5 years of exposure     | 45.0 |   42.9 | 36.8 % | **reversed** |
 *
 * Per seed the survival share puts Hard ABOVE Normal on 3 of 16, level on 10,
 * BELOW on exactly 1 (seed 4714) and undefined on 2 (nobody opened a line, or
 * Hard opened none) - against 5 above / 2 level / 9 below on company value.
 *
 * **What this file BANDS, what it only pins, and why the clause is still
 * OPEN.** The band per level is the claim: each level's survival share inside
 * its own band, over sixteen seeds, as a regression net. The ORDERING is
 * printed and pinned as today's deterministic number and is deliberately NOT
 * offered as the clause met, because it fails two tests of its own - and the
 * instrument is what makes both visible, which is the argument that it is an
 * honest instrument rather than a flattering one:
 *
 *  - **resolution.** At 61 / 35 / 32 opened lines ONE line is worth 16 / 29 /
 *    31 per mille, and the measured gaps are 27 (Easy to Normal) and 14
 *    (Normal to Hard). Both are narrower than a single line: had one of Hard's
 *    thirty-two lines closed instead of survived it would read 15/32 = 46.9 %
 *    and stand BELOW Normal. `SURVIVAL_BANDS` bands each level at +-100 per
 *    mille and gives that same arithmetic as its reason, so the file's own band
 *    argument is wider than the ordering it would have to claim.
 *  - **confound.** A Hard competitor opens its lines almost three game years
 *    later than an Easy one, so its lines have had less time to die. Hold the
 *    exposure constant and the ordering is GONE and points the other way
 *    (45.0 / 42.9 / 36.8 %). That is not a different question; it is the same
 *    share with a known bias taken out, and when a raw estimate and its
 *    de-biased twin disagree, the de-biased one is the estimate.
 *
 * So D-256 reports the clause OPEN with both sets of numbers instead of banking
 * the one reading that came out the wanted way - an instrument chosen BECAUSE
 * it answers the way somebody wanted is D-197's defect one level up - and no
 * trait table was touched to make anything green (the whole point of D-252's
 * table is that it is ordered by JUDGEMENT and its price is recorded). The
 * posture is D-248's on the climate matrix's harsh-sky arm: assert what is
 * resolvable, print the ordering without claiming it.
 *
 * **Sixteen seeds, not four, and that is the second lesson of the bundle.** The
 * four-seed view has disagreed with the sixteen-seed one twice in three bundles:
 * on those four Hard beats Normal in company value on 3 of 4 (and on 16 it loses
 * on 9), and the survival ordering below is 3-1-10 over sixteen where four would
 * have shown 2-1-1. D-220 is the entry that says what a claim measured on the
 * seeds a suite happens to play is worth.
 */

const YEARS = 25;
const MAP_SIZE = 256;

/**
 * The seeds: sixteen, the acceptance bar of D-228/D-229/D-252/D-253, now a
 * named constant instead of a number in a throwaway probe.
 *
 * The price is stated rather than discovered: forty-eight quarter centuries.
 * Measured on the reference machine, one file at a time, the whole file costs
 * **654.7 s** against the 194 s of the four-seed version - about +7.7 minutes
 * on the `soak` job, which runs on every push. (775.6 s on a second run that
 * shared the box with another suite; the spread is this machine's, not the
 * file's - D-220 measured the same 40-70 s range on one quarter century.) That is what an ordering claim
 * over sixteen worlds costs, and a four-seed version of it would be the failure
 * D-220 exists to prevent rather than a saving (SPEC2 6.3 carries the booking).
 *
 * It paid for itself on the first run: `RefitVehicle|insufficientFunds`, which
 * only seed 2718 produces and which four seeds had therefore never shown, went
 * through D-220's declared-set guard as an undeclared pair and is written down
 * in `aiRefusals.ts` with its measurement.
 */
const SEEDS = AI_ACCEPTANCE_SEEDS;

interface Level {
  readonly name: string;
  readonly difficulty: Difficulty;
  /** Total company value of every competitor on every swept seed. [cent] */
  readonly valueCt: number;
  /** What the same companies started with. [cent] */
  readonly startCt: number;
  readonly crewed: number;
  readonly seedsCrewed: number;
  readonly lines: number;
  readonly vehicles: number;
  readonly woundUp: number;
  readonly noRoute: number;
  /** Every line every competitor opened, over every seed (D-256). */
  readonly lives: readonly LineLife[];
  /** The same lives read per seed, so the ordering can be counted seed by seed. */
  readonly livesBySeed: ReadonlyMap<number, readonly LineLife[]>;
  /** Accepted `CreateLine` commands - the independent count of "opened". */
  readonly createLineAccepted: number;
  /** Company value of every competitor, per seed. [cent] */
  readonly valueBySeed: ReadonlyMap<number, number>;
  readonly worldHashes: readonly string[];
  readonly refusals: readonly string[];
  readonly loops: readonly string[];
  readonly undeclared: readonly string[];
}

function play(seed: number, difficulty: Difficulty): World {
  const world = World.create({
    seed,
    difficulty,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
  return world;
}

function measure(name: string, difficulty: Difficulty): Level {
  const { outcomes, sink } = recordOutcomes();
  let createLineAccepted = 0;
  const countingSink = (envelope: CommandEnvelope, outcome: CommandOutcome): void => {
    sink(envelope, outcome);
    if (!outcome.ok || envelope.companyId === 0) return;
    if (envelope.command.kind === CommandKind.CreateLine) createLineAccepted++;
  };

  let valueCt = 0;
  let startCt = 0;
  let crewed = 0;
  let seedsCrewed = 0;
  let lines = 0;
  let vehicles = 0;
  let woundUp = 0;
  let noRoute = 0;
  const worldHashes: string[] = [];
  const lives: LineLife[] = [];
  const livesBySeed = new Map<number, readonly LineLife[]>();
  const valueBySeed = new Map<number, number>();

  for (const seed of SEEDS) {
    const world = play(seed, difficulty);
    const watcher = watchLines();
    for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) {
      world.step(queueOf(world), countingSink);
      watcher.sample(world);
    }
    const seedLives = watcher.finish();
    livesBySeed.set(seed, seedLives);
    lives.push(...seedLives);
    worldHashes.push(hashWorld(world));

    let crewedHere = 0;
    let seedValueCt = 0;
    for (const state of world.ai) {
      const company = world.companyOf(state.companyId);
      seedValueCt += company.cashCt - company.loanCt + company.fixedAssetsCt;
      // What a COMPETITOR opened with, which since D-253 is the Normal
      // baseline whatever the level is - so "created" below is comparable
      // across the three rows instead of measuring the player's handicap.
      startCt += AI_START_CAPITAL_CT;
      if (company.bankrupt) woundUp++;
      const owned = world.lines.ownedBy(state.companyId);
      lines += owned.length;
      let fleet = 0;
      for (let id = 0; id < world.vehicles.count; id++) {
        if (world.vehicles.alive[id] !== 1) continue;
        if (world.vehicles.ownerId[id] !== state.companyId) continue;
        fleet++;
        if (world.vehicles.state[id] === VehicleState.NoRoute) noRoute++;
      }
      vehicles += fleet;
      if (owned.length > 0 && fleet > 0) crewedHere++;
    }
    valueBySeed.set(seed, seedValueCt);
    valueCt += seedValueCt;
    crewed += crewedHere;
    if (crewedHere > 0) seedsCrewed++;
  }

  return {
    name,
    difficulty,
    valueCt,
    startCt,
    crewed,
    seedsCrewed,
    lines,
    vehicles,
    woundUp,
    noRoute,
    lives,
    livesBySeed,
    createLineAccepted,
    valueBySeed,
    worldHashes,
    refusals: refusalTrace(outcomes),
    loops: looping(outcomes),
    undeclared: undeclared(outcomes),
  };
}

/** One queue per world, and never shared: a command batch belongs to its game. */
const queues = new WeakMap<World, CommandQueue>();
function queueOf(world: World): CommandQueue {
  let queue = queues.get(world);
  if (queue === undefined) {
    queue = new CommandQueue();
    queues.set(world, queue);
  }
  return queue;
}

/**
 * The value bands, measured on the SIXTEEN acceptance seeds (D-256).
 *
 * They moved because the sweep did: the four-seed bands of D-253 (Easy
 * 8,598,241, Normal 7,293,303, Hard 6,922,890 EUR) were four quarter centuries
 * per level and these are sixteen, so the numbers are four times the size and
 * not a re-band of the same measurement. **Normal's four-seed figure is
 * asserted separately below** and is still 7,293,303 EUR to the euro - the
 * number `aiGame`'s own sweep has recorded since D-248 - so the identity that
 * says "the Normal row of the traits table IS the pre-M24 competitor" did not
 * quietly change hands when the sweep grew.
 *
 * Each is banded at about +-11 % of its measurement, the width the file has
 * carried since D-252.
 */
const BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [26_600_000_00, 33_200_000_00]],
  ['Normal', [23_300_000_00, 29_100_000_00]],
  ['Hard', [22_000_000_00, 27_500_000_00]],
]);

/**
 * The survival bands, per mille of the lines a level's competitors opened.
 *
 * Measured 459 / 486 / 500 over the sixteen seeds, banded +-100 per mille -
 * wide on purpose, because the denominators are 61, 35 and 32 lines and one
 * line is worth 16 to 31 per mille. The band is the regression net; the
 * ORDERING below is the sharp claim, and it is asserted separately so a failure
 * says which of the two moved.
 */
const SURVIVAL_BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [359, 559]],
  ['Normal', [386, 586]],
  ['Hard', [400, 600]],
]);

const LEVELS: ReadonlyArray<readonly [string, Difficulty]> = [
  ['Easy', Difficulty.Easy],
  ['Normal', Difficulty.Normal],
  ['Hard', Difficulty.Hard],
];

/**
 * Full balance job only (SPEC2 6.3, the D-248 precedent for the climate
 * matrix's harsh-sky arm): forty-eight quarter centuries. The CI `soak` job
 * runs on every push, so the coverage is per-push and not "eventually".
 */
describe.runIf(fullBalanceMode())('Schwierigkeit mit Zaehnen (SPEC2 M24)', () => {
  const played = new Map<string, Level>();
  function level(name: string): Level {
    let row = played.get(name);
    if (row === undefined) {
      const entry = LEVELS.find(([levelName]) => levelName === name)!;
      row = measure(entry[0], entry[1]);
      played.set(name, row);
    }
    return row;
  }

  /** The survival reading of a whole level, over every seed it played. */
  function reading(name: string): SurvivalReading {
    return surviving(level(name).lives, YEARS * TICKS_PER_YEAR);
  }

  it('bands each level where it is, in money and in surviving lines', () => {
    const rows = LEVELS.map(([name]) => level(name));
    for (const row of rows) {
      const created = row.valueCt - row.startCt;
      console.log(
        `${row.name.padEnd(6)} start ${(row.startCt / 100).toFixed(0).padStart(10)} ` +
          `value ${(row.valueCt / 100).toFixed(0).padStart(10)} ` +
          `created ${(created / 100).toFixed(0).padStart(10)} ` +
          `perEuro ${(row.valueCt / row.startCt).toFixed(4)} ` +
          `crewed ${row.crewed} seeds ${row.seedsCrewed}/${SEEDS.length} lines ${row.lines} ` +
          `vehicles ${row.vehicles} woundUp ${row.woundUp} noRoute ${row.noRoute}`,
      );
      console.log(`  ${survivalLine(row.name, surviving(row.lives, YEARS * TICKS_PER_YEAR))}`);
      for (const line of row.refusals.slice(0, 4)) console.log(`  ${row.name}: ${line}`);
    }

    for (const row of rows) {
      const [low, high] = BANDS.get(row.name)!;
      expect(row.valueCt, `${row.name} left its value band`).toBeGreaterThanOrEqual(low);
      expect(row.valueCt, `${row.name} left its value band`).toBeLessThanOrEqual(high);

      const survival = surviving(row.lives, YEARS * TICKS_PER_YEAR).survivalPerMille;
      const [survivalLow, survivalHigh] = SURVIVAL_BANDS.get(row.name)!;
      expect(survival, `${row.name} left its survival band`).toBeGreaterThanOrEqual(survivalLow);
      expect(survival, `${row.name} left its survival band`).toBeLessThanOrEqual(survivalHigh);
    }
  });

  /**
   * **The instrument itself, cross-checked against a different observer.**
   *
   * `watchLines` samples the line store once a game day; D-220's outcome sink
   * counts accepted `CreateLine` commands. They measure the same event through
   * two entirely different surfaces, so agreement is evidence that the sampling
   * cadence really is fine enough (a line opened and closed between two samples
   * would show up here as a missing life) and that nothing but a command opens
   * a competitor's line.
   */
  it('counts every line a competitor opened, twice and identically', () => {
    for (const [name] of LEVELS) {
      const row = level(name);
      expect(row.lives.length, `${name}: sampled lines vs accepted CreateLine`).toBe(
        row.createLineAccepted,
      );
      expect(row.lives.length, `${name}: opened nothing at all`).toBeGreaterThan(0);
    }
  });

  /**
   * **The clause's own question, asked of the quantity that can answer it - and
   * PINNED rather than claimed.**
   *
   * SPEC2 M24 wants a Hard opponent to be measurably better than a Normal one at
   * the same seed. In company value it is measurably WORSE (the table at the
   * head of this file); in lines that are still standing after a quarter century
   * it is better, monotonically in the one knob that differs across all three
   * rows and was NOT measured inert in D-252 - the chain look-ahead, 0 / 1 / 2.
   * (Candidate depth and fleet headroom differ across all three rows too and
   * measure exactly inert; the terrain probe separates only Normal from Hard.)
   *
   * **The two expectations below are a pin on today's deterministic numbers and
   * NOT the clause met.** The margins are 27 and 14 per mille against 16 to 31
   * per mille for ONE line, so one line deciding the other way reverses them;
   * the head of this file carries that arithmetic and the exposure control that
   * points the other way, and SPEC2 M24's B5 note reports the clause open. The
   * pin still earns its place: it is what goes red the day the AI's line
   * lifecycle moves, and a red here is a re-measurement, never a re-band.
   */
  it('pins the ordering of the levels by surviving lines, and prints its resolution', () => {
    const easy = reading('Easy');
    const normal = reading('Normal');
    const hard = reading('Hard');
    console.log(
      `survival share: Easy ${(easy.survivalPerMille / 10).toFixed(1)} % < ` +
        `Normal ${(normal.survivalPerMille / 10).toFixed(1)} % < ` +
        `Hard ${(hard.survivalPerMille / 10).toFixed(1)} %`,
    );
    const perLine = (one: SurvivalReading): number => (one.opened === 0 ? 0 : 1_000 / one.opened);
    console.log(
      `  resolution: ONE line is worth ${perLine(easy).toFixed(0)} / ` +
        `${perLine(normal).toFixed(0)} / ${perLine(hard).toFixed(0)} per mille, ` +
        `the gaps are ${normal.survivalPerMille - easy.survivalPerMille} and ` +
        `${hard.survivalPerMille - normal.survivalPerMille} - both under one line, ` +
        `so this ordering is PINNED and not claimed (D-256)`,
    );

    expect(
      hard.survivalPerMille,
      `Hard ${hard.alive}/${hard.opened} against Normal ${normal.alive}/${normal.opened}`,
    ).toBeGreaterThanOrEqual(normal.survivalPerMille);
    expect(
      normal.survivalPerMille,
      `Normal ${normal.alive}/${normal.opened} against Easy ${easy.alive}/${easy.opened}`,
    ).toBeGreaterThanOrEqual(easy.survivalPerMille);
    // And the levels are not the same game: Hard commits to the fewest lines.
    expect(hard.opened, 'Hard opened as many lines as Easy').toBeLessThan(easy.opened);
  });

  /**
   * **Per seed, which is the form the clause is written in** - and the reason
   * the aggregate above is not enough on its own (D-220).
   *
   * Two of the sixteen are not comparable and are counted as such rather than
   * quietly scored: on one nobody opened a line at either level, and on one Hard
   * opened none at all.
   *
   * A pin, on the same terms as the aggregate above: ten of the sixteen are
   * LEVEL, and the seeds that separate carry one to four lines each, so this is
   * a record of today's distribution rather than evidence that a Hard line
   * lasts longer. It prints the distribution for the reader either way.
   */
  it('is at or above Normal on all but one of the sixteen seeds', () => {
    let above = 0;
    let below = 0;
    let equal = 0;
    let incomparable = 0;
    for (const seed of SEEDS) {
      const normal = surviving(level('Normal').livesBySeed.get(seed)!, YEARS * TICKS_PER_YEAR);
      const hard = surviving(level('Hard').livesBySeed.get(seed)!, YEARS * TICKS_PER_YEAR);
      if (normal.opened === 0 || hard.opened === 0) {
        incomparable++;
        continue;
      }
      if (hard.survivalPerMille > normal.survivalPerMille) above++;
      else if (hard.survivalPerMille < normal.survivalPerMille) below++;
      else equal++;
    }
    console.log(
      `per seed: Hard above Normal on ${above}, level on ${equal}, below on ${below}, ` +
        `incomparable on ${incomparable}`,
    );
    expect(below, 'seeds where a Hard competitor keeps fewer of its lines').toBeLessThanOrEqual(1);
    expect(above, 'seeds where it keeps more').toBeGreaterThanOrEqual(below);
  });

  /**
   * **The confound, asserted so the ordering above can never be read as
   * durability** - the D-253 device, one instrument along.
   *
   * The survival share counts a line opened in year twenty-four as a survivor,
   * and the three levels do not build at the same time: measured mean opening
   * year 7.82 / 9.70 / 10.60. Controlled for exposure the ordering is GONE -
   * among lines that had {@link EXPOSURE_YEARS} game years to fail in, the
   * shares are 45.0 / 42.9 / 36.8 % - and the mean life of a line that DID close
   * carries no ordering either (3.23 / 2.70 / 2.88 years). So what a deeper
   * chain look-ahead demonstrably buys is FEWER and LATER lines, and this file
   * says that in the same breath as it asserts the share, because the honest
   * reading of the clause depends on both halves.
   */
  it('names the confound under that ordering instead of hiding behind it', () => {
    const rows = LEVELS.map(([name]) => [name, reading(name)] as const);
    for (const [name, one] of rows) {
      console.log(
        `  ${name.padEnd(6)} opened in year ${one.meanOpenedYear.toFixed(2)} on average, ` +
          `closed lines lived ${one.meanClosedLifeYears.toFixed(2)} yr, ` +
          `exposure-controlled survival ${(one.exposedSurvivalPerMille / 10).toFixed(1)} % ` +
          `(${one.exposedAlive}/${one.exposed} with ${EXPOSURE_YEARS} years to fail in)`,
      );
    }
    const [easy, normal, hard] = rows.map(([, one]) => one);
    expect(hard!.meanOpenedYear, 'Hard opens later than Normal').toBeGreaterThan(
      normal!.meanOpenedYear,
    );
    expect(normal!.meanOpenedYear, 'Normal opens later than Easy').toBeGreaterThan(
      easy!.meanOpenedYear,
    );
  });

  /**
   * The table is read END TO END in a played game, which no unit test can say:
   * three levels, the same sixteen seeds, three different worlds. It is the
   * property that would go quiet if somebody deleted the wiring and left the
   * table standing.
   */
  it('makes three different games out of the same sixteen seeds', () => {
    const easy = level('Easy').worldHashes;
    const normal = level('Normal').worldHashes;
    const hard = level('Hard').worldHashes;
    expect(easy).toHaveLength(SEEDS.length);
    expect(hard).not.toEqual(normal);
    expect(easy).not.toEqual(normal);
  });

  /**
   * **The confound the clause could not be measured through, asserted gone.**
   *
   * The player's purse still moves with the level - that is what a level IS -
   * and every competitor now opens on the Normal baseline whatever the level
   * says, so the three arms differ by JUDGEMENT and by nothing on the balance
   * sheet (D-253).
   */
  it('hands every competitor the same capital at every level', () => {
    expect(START_CAPITAL_CT[Difficulty.Easy]!).toBeGreaterThan(
      START_CAPITAL_CT[Difficulty.Normal]!,
    );
    expect(START_CAPITAL_CT[Difficulty.Normal]!).toBeGreaterThan(
      START_CAPITAL_CT[Difficulty.Hard]!,
    );
    // The competitors' purse is the Normal row - the game's own baseline, and
    // never more than a player starting a Normal game holds.
    expect(AI_START_CAPITAL_CT).toBe(START_CAPITAL_CT[Difficulty.Normal]);
    const starts = LEVELS.map(([name]) => level(name).startCt);
    expect(new Set(starts).size, `three levels, ${starts.join(' / ')} of start capital`).toBe(1);
  });

  /**
   * **The identity D-252 proved and this file must not lose when its sweep
   * grows**: the Normal row of the traits table is the pre-M24 competitor, and
   * the number that says so is `aiGame`'s own four-seed total.
   */
  it('still plays the pre-M24 competitor on the four seeds aiGame sweeps', () => {
    const normal = level('Normal');
    // Read out of the sixteen-seed pass rather than played again: the first
    // four acceptance seeds ARE `AI_SWEEP_SEEDS`, in that order, so this is the
    // same four quarter centuries `aiGame` measures and not a second opinion.
    let fourSeedCt = 0;
    for (const seed of SEEDS.slice(0, 4)) fourSeedCt += normal.valueBySeed.get(seed)!;
    console.log(`Normal on the four aiGame seeds: ${(fourSeedCt / 100).toFixed(0)} EUR`);
    // To the euro, which is the unit D-248 recorded it in: the exact total is
    // 729,330,260 cent, i.e. 7,293,302.60 EUR.
    expect(Math.round(fourSeedCt / 100), 'the D-248 figure for the aiGame sweep').toBe(7_293_303);
    expect(normal.valueCt, 'sixteen seeds carry the four').toBeGreaterThan(fourSeedCt);
  });

  it('leaves no competitor ordering what the command layer exists to refuse', () => {
    for (const [name] of LEVELS) {
      const row = level(name);
      expect(row.loops, `${name}: ${row.loops.join(' | ')} (>= ${LOOP_ISSUES} issues)`).toEqual([]);
      expect(row.undeclared, `${name}: ${row.undeclared.join(' | ')}`).toEqual([]);
      expect(row.noRoute, `${name}: a living vehicle with no route`).toBe(0);
    }
  });

  hashTwin(
    'aiDifficulty',
    () => [play(SEEDS[0]!, Difficulty.Hard)].map(replayed),
    () => [play(SEEDS[0]!, Difficulty.Hard)].map(replayed),
  );
});

/**
 * The twin is ONE world - the Hard level on the recorded seed - and not sixteen.
 * The desync surface every arm of this file shares is the AI decision cycle,
 * and the Hard arm is the one that exercises every new path in it (the terrain
 * probe, the tender board, the building rights). Sixteen twins would cost the
 * whole file twice for the same evidence, which is the trade `hardWinter` made
 * for the same reason (D-203).
 */
function replayed(world: World): World {
  const queue = new CommandQueue();
  for (let tick = 0; tick < 3 * TICKS_PER_YEAR; tick++) world.step(queue, null);
  return world;
}
