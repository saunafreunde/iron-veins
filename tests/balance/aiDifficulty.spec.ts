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
 * **The difficulty bands of SPEC2 M24 - and the close of its ordering clause,
 * on the table the measurements rebuilt** (D-252, D-253, D-256, D-257).
 *
 * SPEC2 M24 asks that "ein Hard-KI-Lauf auf der Referenzkarte bei gleichem Seed
 * messbar hoeheren Firmenwert erreicht als Normal (eigene Testbaender je
 * Stufe)". The bands per level are here and are measured. **The ordering is
 * not, on either instrument, and D-257 closes the clause as NOT ACHIEVABLE with
 * an evaluation-only change rather than leaving it open a fourth time.**
 *
 * Four bundles measured `DIFFICULTY_AI_TRAITS` knob by knob and the answer was
 * uncomfortable rather than ambiguous: three knobs are provably inert on
 * today's worlds (`candidatesTried` never binds - the longest candidate list
 * over eight seeds is FIVE; `fleetHeadroom` is inert at Hard because the 12.3
 * advisor already asks for the cap; the 14.4 tender board never fires because a
 * tender wants finished goods in a TOWN), ONE knob helps (`terrainProbes`), and
 * the chain look-ahead - the only column that separated all three rows - made a
 * competitor WORSE the further it was turned. D-257 rebuilt the table on that
 * evidence: the chain depth left the table for {@link AI_CHAIN_LOOKAHEAD}, one
 * value for every level, and the terrain probe carries Hard.
 *
 * **After the rebuild, at equal capital (D-253), sixteen acceptance seeds, 25
 * years, three competitors, 256 temperate map:**
 *
 * | level  | value at year 25 | created    | per euro | crewed | seeds | lines | vehicles |
 * | ------ | ---------------- | ---------- | -------- | ------ | ----- | ----- | -------- |
 * | Easy   |       26,535,840 | +2,535,840 |   1.1057 |     13 | 11/16 |    18 |      108 |
 * | Normal |       26,215,097 | +2,215,097 |   1.0923 |     12 | 10/16 |    17 |      102 |
 * | Hard   |       25,998,151 | +1,998,151 |   1.0833 |     10 |  9/16 |    18 |      102 |
 *
 * | reading (D-256's instrument)             | Easy | Normal |  Hard | ordered? |
 * | ---------------------------------------- | ---- | ------ | ----- | -------- |
 * | lines opened                             |   36 |     35 |    35 | no |
 * | still standing at year 25                |   18 |     17 |    18 | no |
 * | **survival share [%]**                   | 50.0 |   48.6 |  51.4 | no - Easy above Normal |
 * | mean game year a line was opened in      | 9.96 |   9.70 | 10.05 | no |
 * | mean life of a line that closed [yr]     | 2.67 |   2.70 |  2.77 | no |
 * | survival at 12.5 years of exposure [%]   | 42.9 |   42.9 |  40.9 | **Hard last** |
 *
 * **Normal is bit-identical to every earlier measurement** - 26,215,097 EUR to
 * the cent, and the four `aiGame` seeds inside it still total 7,293,303 EUR
 * (D-248) - which is what says the rebuild moved the LEVELS and not the game.
 *
 * **What the two instruments say about Hard against Normal, and why that is a
 * close and not another open clause:**
 *
 *  - **money.** Hard is 216,946 EUR BELOW Normal over sixteen seeds (-0.8 % of
 *    the total, -9.8 % of what the field created), above it on 6 seeds, level
 *    on 2 and below on 8. The terrain probe's +5.6 % from D-252's eight-seed
 *    one-knob ablation does not reproduce over sixteen seeds once the chain
 *    depth is equal: what is left is chaotic divergence with no sign.
 *  - **survival.** Hard is 28 per mille above Normal, and ONE line is worth 29
 *    per mille at these denominators - the whole gap is a single line deciding
 *    the other way. Its own exposure control (D-256) puts Hard LAST
 *    (40.9 % against 42.9 %), and Easy - which has no probe at all - reads
 *    above Normal on the raw share.
 *
 * So the surviving knobs cannot order the levels on either instrument, and
 * nothing was turned until a number went green (D-197). The clause is amended
 * in SPEC2 M24 in the D-235/D-253 bracketed form to say what difficulty really
 * changes - the PLAYER'S opening capital and loan rate, plus what each
 * surviving knob is worth - and D-257 records what a future pass would have to
 * change to make an ordering true.
 *
 * **What this file asserts** is therefore three things, none of them an
 * ordering: a value band and a survival band per level (the regression net, so
 * a later change cannot move a level silently), the INDISTINGUISHABILITY of
 * Normal and Hard stated as a falsifiable bound (a future pass that really made
 * Hard better goes red here, and that is a re-measurement, never a re-band),
 * and the identity of the Normal row. Every ordering is printed for the reader
 * and claimed by nobody - D-248's posture on the climate matrix's harsh-sky
 * arm.
 *
 * **Sixteen seeds, not four, and that is the standing lesson.** The four-seed
 * view has disagreed with the sixteen-seed one three times in four bundles
 * (D-252's capital confound, D-253's ordering, and D-257's money reading, where
 * the first four seeds alone would have shown Hard above Normal on 3 of 4).
 * D-220 is the entry that says what a claim measured on the seeds a suite
 * happens to play is worth.
 */

const YEARS = 25;
const MAP_SIZE = 256;

/**
 * The seeds: sixteen, the acceptance bar of D-228/D-229/D-252/D-253, now a
 * named constant instead of a number in a throwaway probe.
 *
 * The price is stated rather than discovered: forty-eight quarter centuries.
 * Measured on the reference machine, one file at a time, the whole file costs
 * **654.7 s (2026-08-13, D-256) and 456.2 s the same day on a quieter box
 * (D-257)** against the 194 s of the four-seed version - so about +5 to +8
 * minutes on the `soak` job, which runs on every push. (775.6 s on a third run
 * that shared the box with another suite; the spread is this machine's, not the
 * file's - D-220 measured the same 40-70 s range on one quarter century, and
 * every figure here is quoted WITH ITS DATE for that reason.) That is what an
 * ordering claim over sixteen worlds costs, and a four-seed version of it would
 * be the failure D-220 exists to prevent rather than a saving (SPEC2 6.3
 * carries the booking).
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
 * The value bands, measured on the SIXTEEN acceptance seeds (D-256, re-measured
 * on the rebuilt table in D-257).
 *
 * Easy and Hard moved because their rows did - the chain look-ahead left the
 * table, so Easy stopped playing the pre-D-109 AI (29,873,058 -> 26,535,840)
 * and Hard stopped paying for depth 2 (24,735,440 -> 25,998,151). **Normal did
 * not move by a cent**, which is the identity this whole table is built on, and
 * the four-seed figure inside it is asserted separately below and is still
 * `aiGame`'s own 7,293,303 EUR (D-248).
 *
 * Each is banded at about +-11 % of its measurement, the width the file has
 * carried since D-252.
 */
const BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [23_600_000_00, 29_500_000_00]],
  ['Normal', [23_300_000_00, 29_100_000_00]],
  ['Hard', [23_100_000_00, 28_900_000_00]],
]);

/**
 * The survival bands, per mille of the lines a level's competitors opened.
 *
 * Measured 500 / 486 / 514 over the sixteen seeds on the rebuilt table (D-257;
 * 459 / 486 / 500 before it), banded +-100 per mille - wide on purpose, because
 * the denominators are 36, 35 and 35 lines and ONE line is worth 28 to 29 per
 * mille. The band is this file's regression net on the instrument; the
 * differences BETWEEN the levels are inside one line and are printed rather
 * than asserted as an ordering.
 */
const SURVIVAL_BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [400, 600]],
  ['Normal', [386, 586]],
  ['Hard', [414, 614]],
]);

/**
 * How far apart Normal and Hard may drift before this file has something new to
 * say - the CLOSE of the ordering clause, stated as a falsifiable bound (D-257).
 *
 * Measured: Hard is 216,946 EUR below Normal on 26,215,097 (0.83 %) and 28 per
 * mille above it in surviving lines, where one line is worth 29. Both are
 * inside the instruments' own resolution, which is exactly why the clause is
 * closed as not achievable with an evaluation-only change instead of being
 * reported open a fourth time. The bounds below are three times the measured
 * separation on money and two lines on survival: **a future pass that really
 * made a Hard competitor better goes RED here**, and a red is a re-measurement
 * and an entry, never a widened band.
 */
const LEVELS_INDISTINGUISHABLE_VALUE_SHARE = 0.025;
const LEVELS_INDISTINGUISHABLE_SURVIVAL_LINES = 2;

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
   * **The close: on the rebuilt table a Hard competitor and a Normal one are
   * the same game to within both instruments' resolution** (D-257).
   *
   * SPEC2 M24 wants a Hard opponent measurably better than a Normal one at the
   * same seed. What separates them since D-257 is the terrain probe, the tender
   * board and the exclusive-rights threshold - the tender board never fires, the
   * rights cost about ten thousand euro, and the probe measures to nothing over
   * sixteen seeds once the chain depth is equal.
   *
   * So this test states the FINDING as a bound instead of pretending to an
   * ordering: the two levels differ by less than
   * {@link LEVELS_INDISTINGUISHABLE_VALUE_SHARE} of company value and by less
   * than {@link LEVELS_INDISTINGUISHABLE_SURVIVAL_LINES} lines of survival. It
   * is falsifiable in the direction that matters - a future pass that really
   * made Hard better goes red here and gets an entry, which is the whole point
   * of closing a clause rather than leaving it open.
   */
  it('closes the ordering clause: Normal and Hard are one game to the instruments', () => {
    const easy = reading('Easy');
    const normal = reading('Normal');
    const hard = reading('Hard');
    console.log(
      `survival share: Easy ${(easy.survivalPerMille / 10).toFixed(1)} % / ` +
        `Normal ${(normal.survivalPerMille / 10).toFixed(1)} % / ` +
        `Hard ${(hard.survivalPerMille / 10).toFixed(1)} %`,
    );
    const perLine = (one: SurvivalReading): number => (one.opened === 0 ? 0 : 1_000 / one.opened);
    console.log(
      `  resolution: ONE line is worth ${perLine(easy).toFixed(0)} / ` +
        `${perLine(normal).toFixed(0)} / ${perLine(hard).toFixed(0)} per mille, ` +
        `the gaps are ${normal.survivalPerMille - easy.survivalPerMille} and ` +
        `${hard.survivalPerMille - normal.survivalPerMille} - both under one line, ` +
        `so NO ordering is claimed (D-257 closes the clause)`,
    );

    const normalValue = level('Normal').valueCt;
    const hardValue = level('Hard').valueCt;
    const valueGap = Math.abs(hardValue - normalValue) / normalValue;
    console.log(
      `  money: Hard ${((hardValue - normalValue) / 100).toFixed(0)} EUR against Normal, ` +
        `${(valueGap * 100).toFixed(2)} % of it`,
    );
    expect(valueGap, 'Hard and Normal have stopped being one game in money').toBeLessThan(
      LEVELS_INDISTINGUISHABLE_VALUE_SHARE,
    );

    const survivalGap = Math.abs(hard.survivalPerMille - normal.survivalPerMille);
    const oneLine = perLine(hard);
    expect(
      survivalGap,
      `Hard ${hard.alive}/${hard.opened} against Normal ${normal.alive}/${normal.opened}`,
    ).toBeLessThan(LEVELS_INDISTINGUISHABLE_SURVIVAL_LINES * oneLine);
  });

  /**
   * **The clause's own question on the MONEY instrument, per seed** (D-257).
   *
   * SPEC2 M24 asks for a measurably higher company value at the same seed, so
   * the comparison is printed seed by seed rather than only in the aggregate -
   * an aggregate can be carried by one rich world, which is the failure D-220
   * is about.
   */
  it('counts the value ordering seed by seed', () => {
    const normal = level('Normal');
    const hard = level('Hard');
    const easy = level('Easy');
    let above = 0;
    let below = 0;
    let equal = 0;
    for (const seed of SEEDS) {
      const normalCt = normal.valueBySeed.get(seed)!;
      const hardCt = hard.valueBySeed.get(seed)!;
      const easyCt = easy.valueBySeed.get(seed)!;
      console.log(
        `  seed ${String(seed).padStart(8)}: easy ${(easyCt / 100).toFixed(0).padStart(10)} ` +
          `normal ${(normalCt / 100).toFixed(0).padStart(10)} ` +
          `hard ${(hardCt / 100).toFixed(0).padStart(10)}`,
      );
      if (hardCt > normalCt) above++;
      else if (hardCt < normalCt) below++;
      else equal++;
    }
    console.log(
      `value per seed: Hard above Normal on ${above}, level on ${equal}, below on ${below}`,
    );
    expect(above + below + equal).toBe(SEEDS.length);
  });

  /**
   * **Per seed, which is the form the clause is written in** - and the reason
   * the aggregate above is not enough on its own (D-220).
   *
   * Two of the sixteen are not comparable and are counted as such rather than
   * quietly scored: on one nobody opened a line at either level, and on one Hard
   * opened none at all.
   *
   * A record of today's distribution and not evidence that a Hard line lasts
   * longer: measured 3 above, 10 level, 1 below, 2 incomparable, and the seeds
   * that separate carry one to four lines each. The two bounds below are what
   * that distribution supports - no seed-wide collapse - and they are
   * deliberately not an ordering (D-257 closes the clause; the head of this
   * file says on which numbers).
   */
  it('keeps its lines on all but one of the sixteen seeds', () => {
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
   * **The exposure control, kept because it is what made the raw share
   * unusable** - the D-253 device, one instrument along (D-256, re-measured in
   * D-257).
   *
   * The raw survival share counts a line opened in year twenty-four as a
   * survivor, and the three levels do not build at the same time. On the
   * rebuilt table the mean opening years are 9.96 / 9.70 / 10.05 - Hard latest,
   * Easy in between, no ordering - and among the lines that had
   * {@link EXPOSURE_YEARS} game years to fail in the shares are
   * **42.9 / 42.9 / 40.9 %**, i.e. Hard LAST on the reading with the bias taken
   * out, while the mean life of a line that DID close (2.67 / 2.70 / 2.77 yr)
   * carries no ordering either. That is the second half of D-257's close, and
   * it is printed here in the same file that bands the raw share so the two can
   * never be read apart.
   */
  it('reads the same lines with their exposure held constant', () => {
    const rows = LEVELS.map(([name]) => [name, reading(name)] as const);
    for (const [name, one] of rows) {
      console.log(
        `  ${name.padEnd(6)} opened in year ${one.meanOpenedYear.toFixed(2)} on average, ` +
          `closed lines lived ${one.meanClosedLifeYears.toFixed(2)} yr, ` +
          `exposure-controlled survival ${(one.exposedSurvivalPerMille / 10).toFixed(1)} % ` +
          `(${one.exposedAlive}/${one.exposed} with ${EXPOSURE_YEARS} years to fail in)`,
      );
    }
    // Every level opens its lines around the middle of the quarter century and
    // every one of them is measured with a real exposed sample - the two
    // properties the control needs to mean anything. The ORDER of the three is
    // printed above and claimed nowhere.
    for (const [name, one] of rows) {
      expect(one.exposed, `${name}: nothing exposed for ${EXPOSURE_YEARS} years`).toBeGreaterThan(
        0,
      );
      expect(one.meanOpenedYear, `${name}: opened absurdly early`).toBeGreaterThan(1);
      expect(one.meanOpenedYear, `${name}: opened absurdly late`).toBeLessThan(YEARS);
    }
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
