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
import { PERSONALITY_COUNT, Personality } from '../../src/sim/ai/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, World } from '../../src/sim/World';
import {
  LOOP_ISSUES,
  looping,
  recordOutcomes,
  refusalTrace,
  undeclared,
  watchForeignStops,
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
  /** Schedules a competitor wrote to a station it does not own (D-223). */
  readonly foreignStops: readonly string[];
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

  // Two pure observers over `World.step`'s own outcome sink: both read what the
  // command layer already decided and write nothing back, so the world they
  // watch is the world the soak fixture replays. The second one watches what
  // the first cannot see - a schedule written to somebody else's stop is a
  // sequence of ACCEPTED commands (D-223).
  const { outcomes, sink } = recordOutcomes();
  const foreign = watchForeignStops(world);
  const both = (
    envelope: Parameters<typeof sink>[0],
    outcome: Parameters<typeof sink>[1],
  ): void => {
    sink(envelope, outcome);
    foreign.sink(envelope, outcome);
  };

  for (let tick = 0; tick < years * TICKS_PER_YEAR; tick++) world.step(queue, both);
  const rows = world.ai.map((state) => measure(world, state.companyId));
  return { seed, world, queue, rows, outcomes, foreignStops: foreign.calls };
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
 * **The per-personality floors, restored** (D-224), because one of them said
 * something the exposure bound does not.
 *
 * The table existed from M11 stage C2 (D-156) until D-220 replaced the whole
 * map with `TOTAL_EXPOSURE_CT` for everybody. Two of its three rows lost
 * nothing by that: D-211 had already moved Rail and Road TO the exposure bound,
 * with its own trace. The third row did. `TownNetwork: 0` asserted that the
 * town-network competitor ends its quarter century having destroyed none of its
 * own equity, and it vanished without an entry of its own - the residual an
 * independent verifier named at 5d32299.
 *
 * It is restored rather than re-derived, and what makes it worth having is that
 * it is the guard on the profitability floor of D-221. Measured at D-220's
 * commit, before that floor existed, the town-network row was the WORST company
 * in the game on nearly every seed - eight seeds, one row each: -117,468 [X],
 * -325,286 [X], -415,716 [X], +147,155, -168,859 [X], -290,949 [X], -145,573
 * [X], +23,385 [X]. **Six of eight below zero, seven of eight wound up, and
 * three of the four seeds this file sweeps red.** Measured at HEAD, over the
 * same eight seeds: +383,214, +500,000, +456,327, +412,641, +500,000, +410,475,
 * +382,931, +500,000 - **eight of eight above the floor, the tightest by
 * 382,931 EUR.**
 *
 * So it is a floor with margin rather than a band under a chaotic run, it is
 * red on the simulation as it stood two bundles ago, and it is the one
 * assertion in this file that would notice the town-pair bus business going
 * back to losing money.
 */
const VALUE_FLOOR_CT: ReadonlyMap<number, number> = new Map([
  [Personality.Rail, -TOTAL_EXPOSURE_CT],
  [Personality.Road, -TOTAL_EXPOSURE_CT],
  [Personality.TownNetwork, 0],
]);

/**
 * **The measured sweep at D-224's HEAD** - the trace the assertions below were
 * written from, printed by the first test on every run so it can never rot into
 * a quoted number nobody re-measured. Format: personality, value EUR,
 * [X] = wound up, l lines / v vehicles / s stations.
 *
 * **D-223 moved not one of these figures**, and that is stated rather than
 * hidden: the eight-seed sweep is identical to the euro before and after it,
 * because the rival-station adoption it removes is not exercised on any of
 * these eight worlds TODAY - it was on seed 60613 at 5d32299, where it cost one
 * company its whole fleet. What guards it is the unit test that is red on the
 * old code and the accepted-order audit below, not a number in this table.
 *
 * ```
 * 4711  p0    55,935     l0 v0 s2  | p4  412,641     l0 v0 s4  | p1 540,495     l1 v6  s4
 * 4713  p4   410,475     l0 v0 s4  | p0 1,687,871    l3 v18 s4 | p3 500,000     l0 v0  s0
 * 4712  p4   500,000     l0 v0 s0  | p2   63,551     l0 v0 s2  | p0 500,000     l0 v0  s0
 * 4714  p4   382,931     l0 v0 s5  | p2  415,718     l1 v6  s5 | p3 500,000     l0 v0  s0
 * ```
 *
 * **Re-measured at D-229's HEAD, where `AI_MIN_PROFIT_MARGIN` moved 1.25 ->
 * 2.00 on a fifteen-value sweep. Not one assertion below moved; the run did,
 * and both are printed rather than one being quoted:**
 *
 * ```
 * 4711  p0   233,189     l0 v0 s3  | p4  471,588     l0 v0 s2  | p1 342,738     l1 v3  s2
 * 4713  p4   500,000     l0 v0 s0  | p0 1,842,457    l3 v18 s4 | p3 500,000     l0 v0  s0
 * 4712  p4   500,000     l0 v0 s0  | p2  329,982     l1 v6  s2 | p0 500,000     l0 v0  s0
 * 4714  p4   500,000     l0 v0 s0  | p2  304,670     l1 v6  s5 | p3 500,000     l0 v0  s0
 * ```
 *
 * Total 5,969,618 -> **6,524,624 EUR**, nobody wound up in either, competitors
 * owning a fleet 3 -> **4 of twelve**, companies that took the field 8 -> 5 -
 * and the last of those is the price D-229 names and measures: a higher floor
 * refuses more, so more competitors sit still, and the ones that do build run a
 * business instead of a graveyard. Over the SIXTEEN seeds of that sweep the
 * same change reads 21,254,922 -> **25,597,942 EUR**, wound up 3 -> **0**,
 * crewed competitors 9 -> **13**, seeds with a live opponent 8 -> **11**.
 *
 * The D-224 numbers above were measured with the floor at 1.25:
 *
 * Total value 5,969,618 EUR, **nobody wound up, THREE of twelve own a fleet**,
 * eight of twelve took the field. D-221 read 4,118,986 with one wound up and
 * ONE of twelve owning a vehicle, and D-220 before it 974,542 with six wound
 * up. What moved that time is the sentence that had not moved since M8: D-222
 * took the rail personalities off a mode they cannot pay for on a generated map
 * and quoted the projection for the single-track railway the builder really
 * lays. Over the wider eight-seed set the same change reads 7,593,553 ->
 * **9,233,799 EUR**, wound up 3 -> **2**, competitors running a line with a
 * fleet 1 -> **4**, living vehicles 6 -> **40**.
 *
 * The assertions are still cut to what all four seeds share rather than to the
 * seed that flatters them:
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
 *    something" (still red on 4712, where the richest is a company that never
 *    left the yard with its 500,000 intact); and any claim about how many
 *    competitors crew what they build - three of twelve here, four seeds of
 *    eight over the wider set, and the floor at the end of this file stays a
 *    floor.
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

        // **Re-measured over all EIGHT seeds after D-222 and D-223, because it
        // was asserted here as if it were a property of the simulation and an
        // independent verifier found it false on seed 60613 at 5d32299** (the
        // richest competitor there finished at +23,385 EUR and wound up). It
        // holds on all eight today - 4711 540,495; 4713 1,687,871; 4712
        // 500,000; 4714 500,000; 2718 500,000; 31415 500,000; 60613 500,000;
        // 12345 383,214, none of them bankrupt - so it stays, and this comment
        // is what says on which worlds that was measured.
        const best = rows.reduce((a, b) => (b.valueCt > a.valueCt ? b : a));
        expect(best.bankrupt, `${best.name} is the richest and was wound up`).toBe(false);

        for (const row of rows) {
          expect(row.valueCt, `${row.name} inside its exposure`).toBeGreaterThanOrEqual(
            -TOTAL_EXPOSURE_CT,
          );
          // And the floor its personality owns, where it owns one that says
          // more than the exposure bound (see VALUE_FLOOR_CT).
          const floor = VALUE_FLOOR_CT.get(row.personality as Personality);
          if (floor === undefined) continue;
          expect(row.valueCt, `${row.name} above its personality floor`).toBeGreaterThanOrEqual(
            floor,
          );
        }
      });

      it('never writes a schedule calling at a stop it does not own', () => {
        // **D-223, and the reason it is watched at the moment the orders are
        // accepted rather than read off year twenty-five.** A project observes
        // its own stops off the map (D-108); the observation did not ask who
        // owned them, so a stop the AI planned onto a tile a rival had already
        // built on was refused `Occupied` - a DECLARED, tolerated refusal - and
        // the next cycle adopted the rival's station, bought six buses and gave
        // them a schedule to a stop no road of theirs could reach. Every one of
        // those commands was ACCEPTED, so the refusal profile above is blind to
        // it; the only visible trace was six `SetVehicleRunning|noRouteToStop`
        // on seed 60613, which is not a seed this file sweeps, and by year
        // twenty-five the review had closed the line and left nothing to audit.
        expect(swept(seed).foreignStops).toEqual([]);
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
    // **This is a FLOOR, not the measurement, and it stays one.** A simulation
    // in which no competitor anywhere runs a line is a decision cycle that does
    // not work; that the floor had to be written at ONE company in twelve was
    // the AI's largest open defect, named in D-218 and D-219 and owned by M24.
    // D-221 stopped the AI destroying capital without moving it. D-222 moved
    // it: three of twelve on the sweep, four of eight SEEDS over the wider set,
    // 6 -> 40 living vehicles, by taking the rail personalities off a mode a
    // generated map does not pay for and quoting the projection for the
    // railway the builder really lays. The assertion is deliberately NOT
    // re-banded to three - it depends on how many seeds the run plays, and a
    // number that moves with a switch guards nothing. What guards the
    // improvement is the trace at the top of this file, re-measured on every
    // run.
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
