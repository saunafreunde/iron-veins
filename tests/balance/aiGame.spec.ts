import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  Difficulty,
  LOAN_MIN_LIMIT_CT,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_YEAR,
  TILE_PUBLIC,
} from '../../src/sim/constants';
import { PERSONALITY_COUNT } from '../../src/sim/ai/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';
import {
  LOOP_ISSUES,
  looping,
  recordOutcomes,
  refusalTrace,
  undeclared,
  type CompanyOutcomes,
} from './aiRefusals';
import { AI_SWEEP_SEEDS, aiSweepSeeds, hashTwin } from './determinism';

/**
 * The acceptance criterion of M8: a twenty-five year game against three AI
 * companies runs through with no player input, and the competitors build
 * plausible, DISTINGUISHABLE networks.
 *
 * **This file used to play ONE seed, and every claim it made about the AI was
 * a property of that seed.** D-216 measured it: played at HEAD on 4712, 4713
 * and 4714, two competitors wind up, nobody owns a vehicle after twenty-five
 * years, and the richest company is the one that never built. D-218 and D-219
 * each found a defect the green single-seed run had been sitting on top of for
 * the whole project - a road run refused before it wrote its junctions, and a
 * railway ordered on ground its owner was never allowed to build on, re-ordered
 * every month for two and a half centuries of game time.
 *
 * So the acceptance run is a SEED SWEEP now, and the assertions below are the
 * properties that hold on EVERY swept seed, measured rather than hoped for. A
 * claim that holds on one of the four is a printed number in the trace and
 * nothing more.
 */

const YEARS = 25;
const MAP_SIZE = 256;

/**
 * The swept seeds and the size of the small sweep live in `./determinism.ts`,
 * beside the costly-twin split they share a switch with, and the coupling audit
 * in `tests/unit/balanceDeterminism.spec.ts` holds both honest. The order of
 * the seeds and the measured cost of a seed are argued there.
 *
 * In short, measured whole-file on this machine: the default run plays the
 * first two seeds (`AI_SWEEP_DEFAULT_SIZE`) at **106.8 s** against the old
 * single-seed file's **93.9 s**, and `IRON_VEINS_BALANCE_HASH=all` - the CI
 * `soak` job of SPEC2 6.3, on every push, plus `npm run test:balance:full`
 * locally - plays all four with the desync twin at **242.1 s**. Coverage of
 * every swept seed is therefore per-push, not "eventually".
 */
function sweptSeeds(): readonly number[] {
  return aiSweepSeeds();
}

/**
 * The refusal net both AI scenarios share lives in `./aiRefusals.ts` - the
 * declared table of rejections, the loop guard and their argument. It is one
 * table because what the AI orders and is refused for is a property of the AI
 * and not of the fixture it is measured in.
 */

interface Measured {
  readonly name: string;
  readonly personality: number;
  readonly roadTiles: number;
  readonly railTiles: number;
  readonly stations: number;
  readonly vehicles: number;
  readonly noRoute: number;
  readonly lines: number;
  readonly loanCt: number;
  readonly valueCt: number;
  readonly bankrupt: boolean;
}

function measure(world: World, companyId: number): Measured {
  const map = world.map;
  let roadTiles = 0;
  let railTiles = 0;
  for (let tile = 0; tile < map.tileCount; tile++) {
    if (map.owner[tile] !== companyId) continue;
    if (map.trackBits[tile] !== 0) railTiles++;
    else if (map.roadBits[tile] !== 0) roadTiles++;
  }

  let vehicles = 0;
  let noRoute = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] !== 1 || world.vehicles.ownerId[id] !== companyId) continue;
    vehicles++;
    if (world.vehicles.state[id] === VehicleState.NoRoute) noRoute++;
  }

  const company = world.companyOf(companyId);
  const state = world.ai.find((entry) => entry.companyId === companyId);
  return {
    name: company.name,
    personality: state?.personality ?? -1,
    roadTiles,
    railTiles,
    stations: world.stations.filter((station) => station.ownerId === companyId).length,
    vehicles,
    noRoute,
    // Real line entities since M11 (E-06): a competitor's lines are counted
    // where everybody's are, in the world's own store.
    lines: world.lines.ownedBy(companyId).length,
    loanCt: company.loanCt,
    valueCt: company.cashCt - company.loanCt + company.fixedAssetsCt,
    bankrupt: company.bankrupt,
  };
}

interface Run {
  readonly seed: number;
  readonly world: World;
  readonly queue: CommandQueue;
  readonly rows: readonly Measured[];
  readonly outcomes: CompanyOutcomes;
}

function play(years: number, seed: number): Run {
  const world = World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
  const queue = new CommandQueue();

  // A pure observer over `World.step`'s own outcome sink: it reads what the
  // command layer already decided and writes nothing back, so the world it
  // watches is the world the soak fixture replays.
  const { outcomes, sink } = recordOutcomes();

  for (let tick = 0; tick < years * TICKS_PER_YEAR; tick++) world.step(queue, sink);
  const rows = world.ai.map((state) => measure(world, state.companyId));
  return { seed, world, queue, rows, outcomes };
}

/**
 * Each swept quarter century is played ONCE and shared: every test in this file
 * reads its runs and none of them writes, and replaying the same deterministic
 * quarter century per assertion was most of the suite's wall time.
 */
const played = new Map<number, Run>();
function swept(seed: number): Run {
  let run = played.get(seed);
  if (run === undefined) {
    run = play(YEARS, seed);
    played.set(seed, run);
  }
  return run;
}

/** The recorded seed - the soak fixture's own game, and the twin's world. */
function quarterCentury(): Run {
  return swept(AI_SWEEP_SEEDS[0]!);
}

/**
 * Everything a company can possibly lose: what it started with plus the credit
 * line every company may draw whatever its balance sheet says. Below this line
 * money came from nowhere, which is a defect and not a bad run (D-211).
 *
 * It replaced a set of per-personality figures that had been re-banded three
 * times in one milestone as the shared world reshuffled which husk dies, and
 * the reason it replaced them stands: a band that moves with every bundle
 * guards nothing. What the old numbers caught that an exposure bound cannot - a
 * personality that stops BUILDING - is asserted directly, per seed, below.
 */
const TOTAL_EXPOSURE_CT = START_CAPITAL_CT[Difficulty.Normal]! + LOAN_MIN_LIMIT_CT;

/**
 * **The measured sweep at D-221's HEAD** - the trace the assertions below were
 * written from, printed by the first test on every run so it can never rot into
 * a quoted number nobody re-measured. Format: personality, value EUR,
 * [X] = wound up, l lines / v vehicles / s stations.
 *
 * ```
 * 4711  p0   55,935     l0 v0 s2  | p4  412,641     l0 v0 s4  | p1  540,495     l1 v6 s4
 * 4713  p4  411,226     l0 v0 s4  | p0 -247,794 [X] l0 v0 s2  | p3  500,000     l0 v0 s0
 * 4712  p4  500,000     l0 v0 s0  | p2   63,551     l0 v0 s2  | p0  500,000     l0 v0 s0
 * 4714  p4  382,931     l0 v0 s5  | p2  500,000     l0 v0 s0  | p3  500,000     l0 v0 s0
 * ```
 *
 * Total value 4,118,986 EUR, **one of twelve wound up, ONE of twelve owns a
 * vehicle**, seven of twelve took the field at all. Before D-221 refused the
 * lines that cannot pay it read 974,542 EUR with SIX of twelve wound up and
 * nine of twelve on the field: the competitors that stopped building were
 * building businesses measured to lose money, twenty-nine stations and 643 road
 * tiles at a time. What did not move is the sentence that matters most, and it
 * is still the sweep-wide floor at the end of this file: **one company in twelve
 * runs a line with a fleet.** The assertions are cut to what all four seeds
 * share rather than to the seed that flatters them:
 *
 *  - **holds on all four**: at least one competitor alive; the richest
 *    competitor solvent; somebody built a network; everybody who took the field
 *    still owns it; everybody inside the exposure bound; three distinct
 *    personalities producing distinguishable networks; no living vehicle
 *    stranded in `NoRoute`; no company looping on a command it is never
 *    allowed; no undeclared rejection.
 *  - **does NOT hold, and is therefore not asserted**: `woundUp.length <= 1`
 *    was red on 4712, 4713 and 4714 when this was written and is green on all
 *    four today - it stays out, because a claim that became true by accident of
 *    one bundle is not a property of the simulation; "the richest company built
 *    something" (still red on 4712 and 4714, where the richest is a company
 *    that never left the yard with its 500,000 intact); and any claim that a
 *    competitor crews what it builds - eleven of twelve do not.
 */
describe('M8 acceptance: a quarter century against three competitors, swept over seeds', () => {
  it('reports what every swept seed measured', () => {
    for (const seed of sweptSeeds()) {
      const run = swept(seed);
      expect(run.world.date.year).toBe(1950 + YEARS);
      for (const row of run.rows) {
        console.log(
          `seed ${seed} ${row.name} (personality ${row.personality}): ` +
            `${row.lines} lines, ${row.railTiles} rail, ${row.roadTiles} road, ` +
            `${row.stations} stations, ${row.vehicles} vehicles, ` +
            `loan ${Math.round(row.loanCt / 100)}, value ${Math.round(row.valueCt / 100)}` +
            (row.bankrupt ? ' [wound up]' : ''),
        );
      }
      // The refusal profile is printed beside the balance sheet, because it is
      // the half of the trace that was invisible for the whole project, and
      // because the two guards below read it: a scenario that starts collecting
      // a new refusal should be readable in the log before it is red.
      for (const line of refusalTrace(run.outcomes)) console.log(`seed ${seed} refused: ${line}`);
    }

    const rows = sweptSeeds().flatMap((seed) => swept(seed).rows);
    const withFleet = rows.filter((row) => row.vehicles > 0).length;
    console.log(
      `sweep: ${rows.length} competitors over ${sweptSeeds().length} seeds, ` +
        `${rows.filter((row) => row.bankrupt).length} wound up, ` +
        `${rows.filter((row) => row.stations > 0).length} took the field, ` +
        `${withFleet} own a vehicle, ` +
        `total value ${Math.round(rows.reduce((sum, row) => sum + row.valueCt, 0) / 100)} EUR`,
    );
  });

  for (const seed of sweptSeeds()) {
    describe(`seed ${seed}`, () => {
      it('runs through without the player touching anything, and somebody builds', () => {
        const { world, rows } = swept(seed);

        expect(world.date.year).toBe(1950 + YEARS);
        expect(world.companies.length).toBe(4);
        expect(world.ai.length).toBe(3);

        // A twenty-five year game in which no competitor ever laid a rail is a
        // decision cycle that does not work, however tidy the code is - and on
        // every swept seed at least one competitor builds a real network, not
        // merely a tile.
        expect(rows.some((row) => row.stations >= 2)).toBe(true);
      });

      it('leaves at least one competitor solvent, inside its own exposure', () => {
        const { rows } = swept(seed);

        // Not "at most one dies" - that was seed 4711's luck and it is red on
        // the other three. What must hold is that the quarter century does not
        // wipe the field, and that the richest survivor is a survivor.
        const woundUp = rows.filter((row) => row.bankrupt);
        expect(rows.length - woundUp.length).toBeGreaterThanOrEqual(1);

        const best = rows.reduce((a, b) => (b.valueCt > a.valueCt ? b : a));
        expect(best.bankrupt, `${best.name} is the richest and was wound up`).toBe(false);

        for (const row of rows) {
          expect(row.valueCt, `${row.name} inside its exposure`).toBeGreaterThanOrEqual(
            -TOTAL_EXPOSURE_CT,
          );
        }
      });

      it('keeps the network of every competitor that took the field', () => {
        // The regression M11 stage C2 dug out (D-156): a personality that
        // stops BUILDING, and a company that prunes itself back to nothing.
        for (const row of swept(seed).rows) {
          if (row.stations === 0) continue;
          expect(row.stations, `${row.name} kept its stations`).toBeGreaterThanOrEqual(2);
          expect(row.roadTiles + row.railTiles, `${row.name} kept its way`).toBeGreaterThan(0);
        }
      });

      it('builds networks that can be told apart', () => {
        const { rows } = swept(seed);

        // Three personalities drawn from five without replacement, which is the
        // whole reason personalities exist.
        const personalities = new Set(rows.map((row) => row.personality));
        expect(personalities.size).toBe(rows.length);
        for (const row of rows) {
          expect(row.personality).toBeGreaterThanOrEqual(0);
          expect(row.personality).toBeLessThan(PERSONALITY_COUNT);
        }

        // And the networks themselves differ. Two companies with identical tile
        // counts, station counts and fleet sizes would mean the personality is
        // a label rather than a behaviour.
        const shapes = new Set(
          rows.map((row) => `${row.railTiles}:${row.roadTiles}:${row.stations}`),
        );
        expect(shapes.size).toBeGreaterThan(1);
      });

      it('runs the fleet it owns, and strands none of it', () => {
        for (const row of swept(seed).rows) {
          if (row.vehicles === 0) continue;
          // A fleet works a network rather than being the degenerate pile the
          // 4.05M note in the project history warns about.
          expect(row.stations, `${row.name} works stations`).toBeGreaterThanOrEqual(2);
          expect(row.vehicles, `${row.name} fleet density`).toBeLessThanOrEqual(row.stations * 6);
          // D-218's own damage, read at the end of the run: buses whose stops
          // were never joined by road lived their whole lives in NoRoute. Six
          // living vehicles across the sweep is all this can see today, and it
          // gets stronger exactly as the AI gets better at crewing.
          expect(row.noRoute, `${row.name} has vehicles with no route`).toBe(0);
        }
      });

      it('never loops on a command it is never allowed to issue', () => {
        // **The net that was missing.** D-219's rail company issued 253
        // BuildTrack and 1,265 BuildRailStop over two hundred and fifty game
        // months and had not one of them accepted; the balance sheet at year
        // twenty-five showed a tidy husk and every assertion in this file was
        // green. A kind tried LOOP_ISSUES times without a single accept is a
        // planner ordering what the command layer exists to refuse.
        const loops = looping(swept(seed).outcomes);
        expect(loops, `commands ordered ${LOOP_ISSUES}+ times and never once accepted`).toEqual([]);
      });

      it('collects only rejections this project has looked at and named', () => {
        expect(
          undeclared(swept(seed).outcomes),
          'a rejection nobody has diagnosed - measure why the AI orders it, then fix it or ' +
            'add it to DECLARED_REFUSALS with the reason it is tolerated',
        ).toEqual([]);
      });

      it('plays by the same rules the player does', () => {
        const { world } = swept(seed);

        for (const state of world.ai) {
          const company = world.companyOf(state.companyId);
          // No resource bonus: a competitor's money came from its own revenue
          // and its own credit line, so it can be overdrawn and wound up.
          expect(company.cashCt + company.fixedAssetsCt).toBeLessThan(1_000_000_000_00);
          expect(company.id).toBeGreaterThan(0);
        }

        // Everything a competitor built is marked as its own on the map,
        // exactly as a player's is - which is also what a council reads as
        // noise.
        const map = world.map;
        let ownedByAi = 0;
        for (let tile = 0; tile < map.tileCount; tile++) {
          const owner = map.owner[tile]!;
          if (owner !== TILE_PUBLIC && owner > 0) ownedByAi++;
        }
        console.log(`seed ${seed}: tiles owned by competitors: ${ownedByAi}`);
        expect(ownedByAi).toBeGreaterThan(0);
      });
    });
  }

  it('has, somewhere in the sweep, a competitor that crews what it builds', () => {
    // **The floor is one company in twelve and it is stated as such.** A
    // simulation in which no competitor anywhere runs a line is a decision
    // cycle that does not work; that this is the FLOOR rather than the
    // measurement is the AI's largest open defect, named in D-218 and D-219
    // and owned by M24. Raising it is what closing that defect will look like -
    // and D-221 deliberately did NOT: it stopped the AI destroying capital
    // (18,435 -> 7,593,553 EUR over the eight measured seeds, eight windings-up
    // down to three) without making one more competitor crew a line, because
    // the offer three of five personalities can see is empty on a generated map
    // and widening it while the bus business still lost money was measured at
    // -3,123,753 EUR. Order first, then breadth.
    const rows = sweptSeeds().flatMap((seed) => swept(seed).rows);
    const crewed = rows.filter((row) => row.lines >= 1 && row.vehicles >= 2);
    expect(
      crewed.length,
      'no competitor on any swept seed runs a line with a fleet',
    ).toBeGreaterThanOrEqual(1);
  });

  it('seed 4711 stays the run the soak fixture recorded', () => {
    // The one deliberately seed-SPECIFIC block left, and it is labelled: this
    // seed is what `tests/soak` replays and what the desync twin below hashes,
    // so a change that quietly makes it worse should be a red test here and not
    // only a re-recorded fixture. Nothing in it is claimed of the simulation -
    // it is red on 4713 by construction.
    const { rows } = quarterCentury();
    expect(rows.filter((row) => row.bankrupt).length, 'seed 4711: nobody wound up').toBe(0);
    expect(
      rows.some((row) => row.lines >= 1 && row.vehicles >= 2),
      'seed 4711: the road company still runs its line',
    ).toBe(true);
  });

  it('is reproducible: the same seed plays the same game', () => {
    const first = play(5, AI_SWEEP_SEEDS[0]!);
    const second = play(5, AI_SWEEP_SEEDS[0]!);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
  });

  it('leaves every command it issued in the replay log', () => {
    const { queue } = play(3, AI_SWEEP_SEEDS[0]!);

    // The player did nothing, so every command in the log is a competitor's -
    // and there IS a log, which is what "uses the same commands as the player"
    // has to mean if it means anything.
    expect(queue.log.length).toBeGreaterThan(0);
    for (const envelope of queue.log) expect(envelope.companyId).toBeGreaterThan(0);
  });

  // The quarter century itself, not the five-year probe above: costly enough to
  // be one of the two scenarios the default run skips (see ./determinism.ts),
  // and covered on every push by the CI `soak` job and by the long-run fixture,
  // which replays exactly this game against the sixteen hashes its checkpoint
  // ring committed to.
  //
  // The twin is deliberately ONE world - the recorded seed - and not the whole
  // sweep, for `hardWinter`'s reason (D-203): a desync shows up in one world as
  // well as in four, and four replayed quarter centuries would put the full job
  // over its budget for evidence it already has.
  hashTwin(
    'aiGame',
    () => [quarterCentury().world],
    () => [play(YEARS, AI_SWEEP_SEEDS[0]!).world],
  );
});
