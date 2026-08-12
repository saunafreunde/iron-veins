import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  AI_START_CAPITAL_CT,
  Difficulty,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';
import { LOOP_ISSUES, looping, recordOutcomes, refusalTrace, undeclared } from './aiRefusals';
import { AI_SWEEP_SEEDS, fullBalanceMode, hashTwin } from './determinism';

/**
 * **The difficulty band of SPEC2 M24 - now with the capital confound removed,
 * and the Fertig-wenn measured against the traits alone** (D-252, D-253).
 *
 * SPEC2 M24 asks for "ein Hard-KI-Lauf auf der Referenzkarte bei gleichem Seed
 * messbar hoeherer Firmenwert als Normal (eigene Testbaender je Stufe)". The
 * bands per level are here and they are measured. The ORDERING is not.
 *
 * **What changed since D-252: a competitor no longer plays the player's
 * handicap.** `createCompany` used to be handed the world's difficulty for
 * EVERY company, so a Hard world's three competitors opened 750,000 EUR poorer
 * than a Normal world's and an Easy world's 900,000 richer - a factor of two
 * against a trait table worth single-digit percent, which made the levels
 * incomparable in the only currency the clause names. Since D-253 the player's
 * company opens on `START_CAPITAL_CT[difficulty]` and every competitor on
 * `AI_START_CAPITAL_CT`, the Normal baseline, at all three levels. Nothing is
 * given to the opposition that a player could not have (SPEC.md 15's
 * "Ressourcen-Boni"): a competitor's purse is exactly what a player starting a
 * Normal game holds, in every level.
 *
 * **Measured over the SIXTEEN acceptance seeds after that fix** (25 years, 3
 * competitors, 256 map, temperate; all three levels now start their
 * competitors on the same 24,000,000 EUR):
 *
 * | level  | value at year 25 | created    | per euro | crewed | seeds | lines | vehicles | wound up |
 * | ------ | ---------------- | ---------- | -------- | ------ | ----- | ----- | -------- | -------- |
 * | Easy   |       29,873,058 | +5,873,058 |   1.2447 |     17 | 14/16 |    28 |      168 |        0 |
 * | Normal |       26,215,097 | +2,215,097 |   1.0923 |     12 | 10/16 |    17 |      102 |        0 |
 * | Hard   |       24,735,440 |   +735,440 |   1.0306 |     10 |  9/16 |    16 |       90 |        2 |
 *
 * **The Hard level is worth +14,214,449 EUR against D-252's measurement of it
 * and the clause is still not met**: Hard reaches a HIGHER company value than
 * Normal on **5 of 16 seeds**, the same figure on 2 (nobody built on either
 * arm) and a lower one on 9, and in aggregate it is 5.6 % below Normal while
 * Easy is 14.0 % above it. The ordering is now the reverse of the one asked
 * for, at equal capital, and D-252 already named the mechanism: **company value
 * at year twenty-five is anti-correlated with the chain look-ahead**, which is
 * the one knob that differs across all three rows (0 / 1 / 2). What a deeper
 * chain test buys is a line that is still standing in ten years (D-225's steel
 * mill closed in 1958 and took the sink of two lines with it), and a balance
 * sheet at year twenty-five cannot tell a line that was never built from a line
 * that died - it can only count the money.
 *
 * **On the four swept seeds Hard beats Normal on 3 of 4, and that is exactly
 * why this file does not assert it.** A level ordering that holds on the seeds
 * the suite happens to play is the failure D-220 exists to prevent. So the file
 * bands each level where it is, asserts that the confound is gone, asserts that
 * the three levels are three different games, and reports the ordering rather
 * than claiming it.
 */

const YEARS = 25;
const MAP_SIZE = 256;

/**
 * The seeds, and there are four of them whatever the mode.
 *
 * `aiGame` sweeps two by default and four in the full job because it is in the
 * suite every developer runs; this file is in the full job ONLY (see the
 * `runIf` below), so there is no cheap arm for a short list to belong to. Four
 * quarter centuries per level is what the bands below were measured on, and a
 * band measured on four seeds and asserted on two would be a different band.
 */
const SEEDS = AI_SWEEP_SEEDS;

interface Level {
  readonly name: string;
  readonly difficulty: Difficulty;
  /** Total company value of every competitor on every swept seed. [cent] */
  readonly valueCt: number;
  /** What the same companies started with. [cent] */
  readonly startCt: number;
  readonly crewed: number;
  readonly lines: number;
  readonly vehicles: number;
  readonly woundUp: number;
  readonly noRoute: number;
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
  let valueCt = 0;
  let startCt = 0;
  let crewed = 0;
  let lines = 0;
  let vehicles = 0;
  let woundUp = 0;
  let noRoute = 0;
  const worldHashes: string[] = [];

  for (const seed of SEEDS) {
    const world = play(seed, difficulty);
    for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) world.step(queueOf(world), sink);
    worldHashes.push(hashWorld(world));

    for (const state of world.ai) {
      const company = world.companyOf(state.companyId);
      valueCt += company.cashCt - company.loanCt + company.fixedAssetsCt;
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
      if (owned.length > 0 && fleet > 0) crewed++;
    }
  }

  return {
    name,
    difficulty,
    valueCt,
    startCt,
    crewed,
    lines,
    vehicles,
    woundUp,
    noRoute,
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
 * The bands, measured on the four swept seeds. Each is its own band - SPEC2
 * M24's "eigene Testbaender je Stufe" - and NOT a band on the difference
 * between them, which is the thing this file measured and could not deliver.
 *
 * Measured after D-253 took the player's handicap off the competitors: Easy
 * **8,598,241**, Normal **7,293,303**, Hard **6,922,890 EUR**, each banded at
 * about +-11 % of its measurement, which is the width the first three carried.
 *
 * **Normal's band did not move and did not need to**: its four-seed total is
 * **7,293,303 EUR to the euro**, the number `aiGame`'s own sweep has recorded
 * since D-248 (SPEC2 M23 bundle 4), measured again through this file after the
 * capital change. The Normal row of the traits table is the pre-M24 competitor
 * AND a Normal world's competitors were never handed anything but the baseline,
 * so the identity is proved twice over by one figure. Easy fell 11,869,470 ->
 * 8,598,241 and Hard rose 3,425,685 -> 6,922,890: that is the 300,000 EUR a
 * competitor used to be given at Easy and the 250,000 it used to be docked at
 * Hard, played out over a quarter century by three companies on four seeds.
 */
const BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [7_650_000_00, 9_550_000_00]],
  ['Normal', [6_500_000_00, 8_100_000_00]],
  ['Hard', [6_150_000_00, 7_700_000_00]],
]);

const LEVELS: ReadonlyArray<readonly [string, Difficulty]> = [
  ['Easy', Difficulty.Easy],
  ['Normal', Difficulty.Normal],
  ['Hard', Difficulty.Hard],
];

/**
 * Full balance job only (SPEC2 6.3, the D-248 precedent for the climate
 * matrix's harsh-sky arm): twelve quarter centuries against a suite that runs
 * fourteen files in about 160 s. The CI `soak` job runs on every push, so the
 * coverage is per-push and not "eventually".
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

  it('bands each level where it is, and prints why they are not comparable', () => {
    const rows = LEVELS.map(([name]) => level(name));
    for (const row of rows) {
      const created = row.valueCt - row.startCt;
      console.log(
        `${row.name.padEnd(6)} start ${(row.startCt / 100).toFixed(0).padStart(10)} ` +
          `value ${(row.valueCt / 100).toFixed(0).padStart(10)} ` +
          `created ${(created / 100).toFixed(0).padStart(10)} ` +
          `perEuro ${(row.valueCt / row.startCt).toFixed(4)} ` +
          `crewed ${row.crewed} lines ${row.lines} vehicles ${row.vehicles} ` +
          `woundUp ${row.woundUp} noRoute ${row.noRoute}`,
      );
      for (const line of row.refusals.slice(0, 6)) console.log(`  ${row.name}: ${line}`);
    }

    for (const row of rows) {
      const [low, high] = BANDS.get(row.name)!;
      expect(row.valueCt, `${row.name} left its band`).toBeGreaterThanOrEqual(low);
      expect(row.valueCt, `${row.name} left its band`).toBeLessThanOrEqual(high);
    }
  });

  /**
   * The table is read END TO END in a played game, which no unit test can say:
   * three levels, the same four seeds, three different worlds. It is the
   * property that would go quiet if somebody deleted the wiring and left the
   * table standing.
   */
  it('makes three different games out of the same four seeds', () => {
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
   * says, so the three arms above differ by JUDGEMENT and by nothing on the
   * balance sheet (D-253). Asserting "Hard is richer" is still refused: it is
   * true on 3 of the 4 seeds this file plays and false on 11 of the 16 the
   * measurement above sweeps, which is precisely the seed-selection failure
   * D-220 exists to prevent. What is asserted is the thing that would have to
   * be true for the clause to mean anything at all.
   */
  it('hands every competitor the same capital at every level', () => {
    expect(START_CAPITAL_CT[Difficulty.Easy]!).toBeGreaterThan(START_CAPITAL_CT[Difficulty.Normal]!);
    expect(START_CAPITAL_CT[Difficulty.Normal]!).toBeGreaterThan(START_CAPITAL_CT[Difficulty.Hard]!);
    // The competitors' purse is the Normal row - the game's own baseline, and
    // never more than a player starting a Normal game holds.
    expect(AI_START_CAPITAL_CT).toBe(START_CAPITAL_CT[Difficulty.Normal]);
    const starts = LEVELS.map(([name]) => level(name).startCt);
    expect(new Set(starts).size, `three levels, ${starts.join(' / ')} of start capital`).toBe(1);
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
 * The twin is ONE world - the Hard level on the recorded seed - and not twelve.
 * The desync surface every arm of this file shares is the AI decision cycle,
 * and the Hard arm is the one that exercises every new path in it (the terrain
 * probe, the tender board, the building rights). Twelve twins would cost the
 * whole file twice for the same evidence, which is the trade `hardWinter` made
 * for the same reason (D-203).
 */
function replayed(world: World): World {
  const queue = new CommandQueue();
  for (let tick = 0; tick < 3 * TICKS_PER_YEAR; tick++) world.step(queue, null);
  return world;
}
