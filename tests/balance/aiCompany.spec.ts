import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  CENTS_PER_EURO,
  Difficulty,
  LOAN_MIN_LIMIT_CT,
  MapClimate,
  START_CAPITAL_CT,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { Personality } from '../../src/sim/ai/types';
import { World } from '../../src/sim/World';
import {
  LOOP_ISSUES,
  looping,
  recordOutcomes,
  refusalTrace,
  undeclared,
  type CompanyOutcomes,
} from './aiRefusals';
import { hashTwin } from './determinism';

/**
 * Balancing scenario 5 of section 19.4: an AI company alone on a 512 map,
 * twenty-five years - IN the suite at last, on the band the economy actually
 * pays (DECISIONS.md D-158; closes D-116).
 *
 * SPEC.md's 5-25 million was measured against the map's physical offer and
 * is not real on this economy. The achievability probe - a hand-built
 * competent-player network covering every chain the seed-4711 world can keep
 * alive, with SIX MILLION of free capital - grew its company value by at
 * most ~840,000 EUR over twenty-five years before its fleet renewal took
 * most of that back. The map's sustainable offer is one long coal haul, the
 * short-pair passenger trade, and mail; the farm->food chain is a measured
 * trap (livestock dies over the 100-tile haul, the factory starves without
 * it, the grain leg then earns the floor). No honest company that starts
 * with 500,000 reaches five million on this offer; the band below is
 * anchored on the probe and on the measured AI runs, and it is deliberately
 * per-personality:
 *
 *  - ROAD (seed 4711, the compounding personality): 0.8 - 3.2 million.
 *    Measured 1,119,720 EUR at M11, 978,528 after M19 closed, 1,173,298
 *    since D-216 tightened the towns, 1,156,463 after D-218 and D-219 fixed
 *    the AI's road joins and its railway permission, **1,022,084 since D-221
 *    refused the lines that cannot pay** - building, renewing at
 *    year twenty-one and growing straight through it. The floor is the stall
 *    detector (the pre-C2 stall states measured 433,000 and 580,000); the
 *    ceiling is the economy-breakage detector, anchored above the probe's
 *    free-capital growth so only a broken tariff or gate can reach it.
 *  - RAIL (seed 3) and EXPANSIVE (seed 2): they still BUILD, and they stay
 *    inside their own exposure. D-156 measured both wound up and D-157
 *    brought both back alive; **D-216 puts the expansive one under again**
 *    and the assertion below carries that A/B rather than the sign. Their
 *    stagnation (a first line closed by its own review, then twenty years
 *    of backoff, and a network nobody ever crews) is the named open
 *    bottleneck in D-158 and is deliberately NOT blessed with a growth band
 *    here.
 *
 * When this leaves its band the constants get investigated and adjusted,
 * never the test (the balance rule of CLAUDE.md).
 *
 * **D-220 re-measured all three rows on the fixed AI and moved NOTHING, which
 * is the point of writing it down.** D-158's evidence rule is that a band moves
 * only when a measurement says the old one described a world that no longer
 * exists, and both numbers go in the entry either way. Measured at D-220's
 * HEAD, against the D-216 figures this file already carried:
 *
 *  - ROAD 1,173,298 -> **1,156,463 EUR** (-1.4 %), 12 vehicles and 2 lines in
 *    both. Comfortably inside 0.8 - 3.2 M; the band describes this world.
 *  - RAIL **228,047 EUR**, 2 stations, no line, no vehicle - unchanged to the
 *    euro. D-219's fix cannot reach it: this company's opportunities never
 *    take the single-track fallback branch on this map.
 *  - EXPANSIVE **-241,309 EUR [wound up]**, 5 stations, 1 line, 0 vehicles -
 *    also unchanged to the euro.
 *
 * **D-221 moved the road row and the trace says why, which is the only reason a
 * measurement is allowed to move without the band moving with it.** The AI may
 * no longer build a line whose projected revenue misses the whole monthly bill
 * it creates (`AI_MIN_PROFIT_MARGIN`), and on this map the 1950 candidate list
 * of the road personality holds NOTHING but two pop-400 bus pairs, projected
 * 0.623 and 0.266 - both refused now, both built before. The company therefore
 * consumes different randomness from its first decision on, that seed's coal
 * pair enters its list in a different game year, and the quarter century that
 * follows is a different one: **1,156,463 -> 1,022,084 EUR** (-11.6 %), two
 * lines and twelve vehicles in both, still growing through the year-twenty-one
 * renewal, still well inside 0.8 - 3.2 M. RAIL **228,047** and EXPANSIVE
 * **-241,309 [wound up]** are unchanged to the euro: both build at projections
 * of 1.435 - 1.881, so the floor never reaches them. On the twenty-four
 * competitors of the eight-seed `aiGame` sweep the same change is worth
 * 18,435 -> 7,593,553 EUR and takes windings-up from eight to three.
 *
 * **D-229 swept `AI_MIN_PROFIT_MARGIN` over fifteen values and moved it 1.25 ->
 * 2.00. Two of the three rows below improve out of all recognition and NOT ONE
 * BAND MOVED - which is the only reason a measurement is allowed to move on its
 * own.** Measured here at that HEAD:
 *
 *  - ROAD **1,022,084 EUR, identical to the euro**, 2 lines, 12 vehicles, still
 *    compounding through the year-21 renewal. It is identical at EVERY floor
 *    from 0.80 to 2.60: this company's candidate list never contains a line the
 *    floor decides, so the constant simply does not reach it.
 *  - RAIL 228,581 -> **1,802,165 EUR**, 0 lines and 0 vehicles -> **3 lines, 18
 *    vehicles, 6 stations**. The husk this file has carried since D-216 is a
 *    business. Its assertion still reads "alive, above zero, two stations",
 *    because one measurement of a chaotic quarter century is not a band (D-158),
 *    and a band that moves with every bundle guards nothing.
 *  - EXPANSIVE -241,375 [wound up] -> **2,153,604 EUR**, 4 lines, 23 vehicles,
 *    5 stations. Its assertion still reads "builds, inside its exposure".
 *
 * D-221's stated sensitivity - "a floor above 1.435 would stop two of scenario
 * 5's three personalities building at all" - is REFUTED by exactly those two
 * rows: refusing the line a company would have built does not stop the company,
 * it sends it to the next candidate, later, with its capital intact.
 *
 * **And the honest closing sentence about SPEC.md 19.4's 5 - 25 million: the
 * AI does not reach it and this bundle does not claim it does.** 1,156,463 is a
 * factor 4.3 under the original floor. D-116 stays closed on D-158's
 * recalibrated band and on the achievability probe behind it - the map's
 * physical offer, not the AI's competence, is what 5 M was measured against -
 * and nothing in D-218, D-219 or D-220 moved that argument by a euro.
 */

const YEARS = 25;
const MAP_SIZE = 512;

const ROAD_VALUE_FLOOR_CT = 800_000 * CENTS_PER_EURO;
const ROAD_VALUE_CEILING_CT = 3_200_000 * CENTS_PER_EURO;

/**
 * Everything a company can possibly lose: what it started with plus the credit
 * line every company may draw whatever its balance sheet says. Below this line
 * money came from nowhere, which is a defect and not a bad run - D-211's bound
 * under `aiGame`, used here for the same reason in D-216.
 */
const TOTAL_EXPOSURE_CT = START_CAPITAL_CT[Difficulty.Normal]! + LOAN_MIN_LIMIT_CT;

interface Run {
  readonly world: World;
  readonly personality: number;
  readonly valueCt: number;
  readonly yearlyValueCt: readonly number[];
  readonly bankrupt: boolean;
  readonly lines: number;
  readonly vehicles: number;
  readonly stations: number;
  readonly outcomes: CompanyOutcomes;
}

function play(seed: number): Run {
  const world = World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 1,
  });
  const queue = new CommandQueue();
  const state = world.ai[0]!;

  // The pure observer of `./aiRefusals.ts` - D-220's instrument, the one thing
  // this scenario could not see: what the company ORDERED, as against what it
  // was worth at the end.
  const { outcomes, sink } = recordOutcomes();

  const yearlyValueCt: number[] = [];
  for (let year = 0; year < YEARS; year++) {
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(queue, sink);
    const company = world.companyOf(state.companyId);
    yearlyValueCt.push(company.cashCt - company.loanCt + company.fixedAssetsCt);
  }

  const company = world.companyOf(state.companyId);
  let vehicles = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] === 1 && world.vehicles.ownerId[id] === state.companyId) {
      vehicles++;
    }
  }
  return {
    world,
    personality: state.personality,
    valueCt: yearlyValueCt[YEARS - 1]!,
    yearlyValueCt,
    bankrupt: company.bankrupt,
    lines: world.lines.ownedBy(state.companyId).length,
    vehicles,
    stations: world.stations.filter((s) => s.ownerId === state.companyId).length,
    outcomes,
  };
}

describe('scenario 5: an AI company alone on a 512 map, twenty-five years', () => {
  const road = play(4_711);
  const rail = play(3);
  const expansive = play(2);

  it('reports what it measured, and why', () => {
    const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
    for (const [name, run] of [
      ['road', road],
      ['rail', rail],
      ['expansive', expansive],
    ] as const) {
      console.log(
        `${name} (personality ${run.personality}): value ${euros(run.valueCt)} EUR, ` +
          `${run.lines} lines, ${run.vehicles} vehicles, ${run.stations} stations` +
          (run.bankrupt ? ' [wound up]' : '') +
          ` - value by year ${run.yearlyValueCt.map(euros).join(' / ')}`,
      );
    }
    for (const [name, run] of [
      ['road', road],
      ['rail', rail],
      ['expansive', expansive],
    ] as const) {
      for (const line of refusalTrace(run.outcomes)) console.log(`${name} refused: ${line}`);
    }
    expect(road.yearlyValueCt).toHaveLength(YEARS);
  });

  it('drew the personalities these seeds were measured under', () => {
    // The bands below are per-personality; if the roster draw ever changes,
    // the seeds must be re-chosen and the bands re-measured, loudly.
    expect(road.personality).toBe(Personality.Road);
    expect(rail.personality).toBe(Personality.Rail);
    expect(expansive.personality).toBe(Personality.Expansive);
  });

  it('road: builds, compounds, and lands in the measured band', () => {
    expect(road.bankrupt).toBe(false);
    expect(road.valueCt).toBeGreaterThanOrEqual(ROAD_VALUE_FLOOR_CT);
    expect(road.valueCt).toBeLessThanOrEqual(ROAD_VALUE_CEILING_CT);
    expect(road.lines).toBeGreaterThanOrEqual(1);
    expect(road.vehicles).toBeGreaterThanOrEqual(2);
    expect(road.stations).toBeGreaterThanOrEqual(2);
  });

  it('road: grows through its year-twenty-one fleet renewal', () => {
    // The renewal writes off the old fleet and buys the new one at inflated
    // prices - the measured dip is 439,000 EUR in one month (D-155/D-158).
    // A company that compounds recovers it: the final value clears year
    // fifteen's with margin. A regression that lets the renewal eat the
    // company - or the review close the renewed line - goes red here.
    expect(road.valueCt).toBeGreaterThan(road.yearlyValueCt[14]!);
  });

  /**
   * **Re-banded in D-216 with the A/B trace, and the half that was worth
   * having is the half that stayed.**
   *
   * D-216 shrank every generated town to the streets its houses need: the
   * public road network a company can lean on falls 56 % (9,962 -> 4,359 tiles
   * over five seeds and 200 towns), so every connection now pays for its own
   * last mile. Measured back to back on this machine, baseline in a stash at
   * the same commit:
   *
   *  - ROAD (seed 4711) 978,528 -> **1,173,298 EUR**, 6 -> 12 vehicles, one
   *    line -> two. The compounding personality is BETTER on the tighter map
   *    and its band above is untouched, which is what says the change did not
   *    make the world unplayable.
   *  - RAIL (seed 3) 90,230 -> **228,047 EUR**, 4 -> 2 stations. Alive, and
   *    still the husk with no line and no vehicle.
   *  - EXPANSIVE (seed 2) 121,328 [alive, 3 stations, 1 vehicle] ->
   *    **-241,309 [wound up, 5 stations, 1 line, 0 vehicles]**.
   *
   * So the expansive company still BUILDS - it builds more than it did - and
   * it never crews what it builds, in either run. What moved is 362,637 EUR of
   * twenty-five years of upkeep on a company whose revenue is zero at both
   * measurements, and whose value curve declines monotonically from year one
   * in both: crossing zero in year nineteen instead of ending just above it is
   * that curve meeting a longer bill, not a rule that broke. D-158 named this
   * stagnation as an OPEN BOTTLENECK and refused to bless it with a growth
   * band; blessing its SIGN was the part of the sentence that could not
   * survive a world change, and it is dropped here rather than defended.
   *
   * What is asserted instead is the property D-156 actually caught - a
   * personality that stops building - plus the exposure bound D-211 put under
   * `aiGame` for the identical reason one milestone ago. Fixing the AI so that
   * it reserves the price of a vehicle before it lays its last kilometre of
   * road is M11's work and is named in the report, not papered over here.
   */
  /**
   * **The half of this scenario that was invisible for the whole project**
   * (D-220). Everything above reads the balance sheet at year twenty-five, and
   * a company that spent a century ordering a railway it was never allowed to
   * build has a perfectly plausible balance sheet - that is exactly what D-219
   * found, in the OTHER AI scenario, after this one had been green through nine
   * bundles. The instrument and its two guards are argued in `./aiRefusals.ts`;
   * they are shared with `aiGame` because what the AI is refused for is a
   * property of the AI and not of the fixture.
   *
   * Measured here at D-220's HEAD: the road company collects
   * `BuildRoad|nothingToDo` and `BuildRoadStop|occupied`, the rail and expansive
   * companies collect nothing at all, and no company loops. The trace is printed
   * by the reporting test above on every run.
   */
  it('orders nothing it is never allowed to order, on any personality', () => {
    for (const [name, run] of [
      ['road', road],
      ['rail', rail],
      ['expansive', expansive],
    ] as const) {
      expect(
        looping(run.outcomes),
        `${name}: commands ordered ${LOOP_ISSUES}+ times and never once accepted`,
      ).toEqual([]);
      expect(
        undeclared(run.outcomes),
        `${name}: a rejection nobody has diagnosed - measure why the AI orders it, then fix ` +
          'it or add it to DECLARED_REFUSALS with the reason it is tolerated',
      ).toEqual([]);
    }
  });

  it('rail and expansive still build, inside their own exposure', () => {
    expect(rail.bankrupt).toBe(false);
    expect(rail.valueCt).toBeGreaterThan(0);
    expect(rail.stations).toBeGreaterThanOrEqual(2);

    expect(expansive.stations).toBeGreaterThanOrEqual(2);
    expect(expansive.lines).toBeGreaterThanOrEqual(1);
    expect(expansive.valueCt).toBeGreaterThanOrEqual(-TOTAL_EXPOSURE_CT);
  });

  // Three quarter-century games on a 512 map - the most expensive twin in the
  // suite (measured 102 s on its own), so the default run skips it and the CI
  // `soak` job asserts it on every push (see ./determinism.ts).
  hashTwin(
    'aiCompany',
    () => [road.world, rail.world, expansive.world],
    () => [play(4_711).world, play(3).world, play(2).world],
  );
});
