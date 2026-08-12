import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
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
 * **The difficulty band of SPEC2 M24, and the measurement that says its
 * Fertig-wenn cannot be met by an evaluation function** (D-252).
 *
 * SPEC2 M24 asks for "ein Hard-KI-Lauf auf der Referenzkarte bei gleichem Seed
 * messbar hoeherer Firmenwert als Normal (eigene Testbaender je Stufe)". The
 * bands per level are here and they are measured. The ORDERING is not, and the
 * reason is not the traits:
 *
 * **A difficulty level's dominant effect on a competitor is `START_CAPITAL_CT`,
 * and it points the other way.** Every company in a world - the player's and
 * every competitor's - starts on the level's own capital (`company/roster.ts`
 * hands `createCompany` the world's difficulty), so a Hard competitor begins
 * with **250,000 EUR against a Normal one's 500,000** and an Easy one's
 * 800,000. Three competitors are therefore 750,000 EUR poorer per seed at Hard
 * and 900,000 richer at Easy, before a single judgement is made. Giving the
 * Hard AI more would be exactly the "Ressourcen-Bonus" SPEC.md 15 forbids, so
 * the handicap is correct and it is not this bundle's to remove.
 *
 * Measured over the SIXTEEN acceptance seeds (25 years, 3 competitors, 256 map,
 * temperate), and the ordering fails on 16 of 16 - an ordering that held on one
 * seed would be the exact failure D-220 exists to prevent:
 *
 * | level  | start capital | value at year 25 | created    | per euro | crewed | seeds |
 * | ------ | ------------- | ---------------- | ---------- | -------- | ------ | ----- |
 * | Easy   |    38,400,000 |       40,803,531 | +2,403,531 |   1.0626 |     20 | 14/16 |
 * | Normal |    24,000,000 |       26,215,097 | +2,215,097 |   1.0923 |     12 | 10/16 |
 * | Hard   |    12,000,000 |       10,520,991 | -1,479,009 |   0.8767 |      7 |  7/16 |
 *
 * What the traits are worth is measured separately and at CONSTANT capital, one
 * knob at a time, and that measurement is the honest one: the terrain probe is
 * **+5.6 %** over eight seeds, the chain look-ahead **-4.3 %** at depth 2 and
 * **+16.9 %** at depth 0, the building rights **-0.2 %**, and the candidate
 * depth, the fleet headroom and the tender board are all EXACTLY inert. The
 * whole table is therefore worth single-digit percent where the capital step is
 * a factor of two. The trace is in D-252 and in the fields' own comments.
 *
 * So this file bands each level where it is, prints the table, and asserts the
 * one ordering claim that is true - that the three levels are three different
 * games.
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
      startCt += START_CAPITAL_CT[difficulty]!;
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
 * The bands, measured on the four swept seeds at the commit that introduced
 * `DIFFICULTY_AI_TRAITS`. Each is its own band - SPEC2 M24's "eigene
 * Testbaender je Stufe" - and NOT a band on the difference between them, which
 * is the thing this bundle measured and could not deliver.
 *
 * Normal's figure is the identity anchor and it is not an approximation: the
 * four-seed total below is **7,293,303 EUR to the euro**, which is the number
 * `aiGame`'s own sweep has recorded since D-248 (SPEC2 M23 bundle 4). The
 * Normal row of the traits table is the pre-M24 competitor, and that is the
 * cheapest proof of it there is.
 */
const BANDS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['Easy', [10_500_000_00, 13_200_000_00]],
  ['Normal', [6_500_000_00, 8_100_000_00]],
  ['Hard', [3_000_000_00, 3_900_000_00]],
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
   * **The ordering SPEC2 M24 asks for, asserted in the direction it holds.**
   * Every competitor of a Hard world starts on a quarter of a million against a
   * Normal one's half million, so the levels are ordered by the capital they
   * are handed and the traits are worth single-digit percent on top. Asserting
   * "Hard is richer" would be asserting something measured false on 16 of 16
   * seeds; what is asserted is the confound itself, so the day somebody
   * changes it this file says so.
   */
  it('is ordered by the start capital the level hands every company', () => {
    expect(START_CAPITAL_CT[Difficulty.Easy]!).toBeGreaterThan(START_CAPITAL_CT[Difficulty.Normal]!);
    expect(START_CAPITAL_CT[Difficulty.Normal]!).toBeGreaterThan(START_CAPITAL_CT[Difficulty.Hard]!);
    expect(level('Easy').valueCt).toBeGreaterThan(level('Normal').valueCt);
    expect(level('Normal').valueCt).toBeGreaterThan(level('Hard').valueCt);
    // And the traits do not close it: the whole table is worth single-digit
    // percent at constant capital (D-252), the capital step is a factor of two.
    expect(level('Normal').valueCt / level('Hard').valueCt).toBeGreaterThan(1.5);
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
