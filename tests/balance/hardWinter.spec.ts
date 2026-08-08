import { describe, expect, it } from 'vitest';
import {
  CENTS_PER_EURO,
  LEDGER_HISTORY_MONTHS,
  MONTHS_PER_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  WeatherCell,
  WeatherRule,
} from '../../src/sim/constants';
import { Account, ACCOUNT_COUNT } from '../../src/sim/economy/ledger';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';
import { buildCoalLine, COAL_LINE_SEED, COAL_LINE_SPAN_YEARS } from './coalLine';
import { hashTwin } from './determinism';

/**
 * SPEC2 M18's new balancing scenario: what a hard winter costs the reference
 * coal line.
 *
 * The subject is scenario 2's railway, built by the same `buildCoalLine` and
 * played for the same nine years - once in a world with the weather rule OFF
 * (which is scenario 2's own world, and every other band of 19.4's) and once
 * with it HARSH. What is compared is the freight account, because the coal
 * line has no other revenue.
 *
 * **The band is 3-7 % and SPEC2 asked for 8-15 %. That is a re-band, and the
 * measurement is why.** Measured on this build: 3,510,797 EUR of freight over
 * six seeds and nine years with no weather against 3,357,840 EUR under the
 * harsh rule, a drop of **4.36 %**. No constant was tuned towards the
 * sentence. This is the D-158 precedent: a number written before the physics
 * existed, replaced by the number the physics pays, with the trace beside it
 * so nobody "fixes" it again.
 *
 * **D-203 banded this at 4.95 % and named a DEFECT as the reason it was not
 * larger; D-204 fixed the defect first and then re-measured** (which is the
 * order the project's own rule requires - an evidence-based re-band is allowed,
 * one whose stated justification is a bug is not). The defect was that the
 * sky's frost gate was indexed by month and by nothing else, so a tropical
 * January could freeze; the gate is the SEASON's own climate-aware winter
 * curve now. It moved the number by 0.59 points, and DOWNWARD: a temperate
 * December and February carry 0.917 of a full winter month against the flat 1
 * the old table gave them, so the reference line - which is temperate - gets
 * marginally less frost in the deep winter and a little in April and October
 * instead. The gap to 8-15 % was never the tropics.
 *
 * **What actually bounds the effect, re-measured on the fixed build**
 * (DECISIONS.md D-204 carries the table): the breakdown threshold is worth
 * ~3.8 of the 4.36 points and every other channel is inside the noise of a
 * six-seed ensemble - two of them measure NEGATIVE, which is what a chaotic
 * one-train line does to a single-channel neutralisation. The seams are not
 * too weak: a permanent winter (every sky behaving as frost, full severity in
 * all twelve months) costs the same six seeds **25.24 %**. What is small is
 * how much of the year the expensive sky owns - frost holds 9.1 % of
 * December/January/February region-days under the harsh rule, because its
 * weight is 14 and never boosted while rain's 20 is multiplied by up to 2.4 by
 * the neighbour pull.
 *
 * **Why an ensemble rather than one world.** One coal line is a chaotic
 * system: a breakdown that falls on the wrong day costs a month of trips, and
 * the weather moves a THRESHOLD rather than a draw, so the two arms take the
 * same numbers out of the gameplay stream and get different outcomes from the
 * first frosty morning on. On a single seed the year-to-year swing is larger
 * than the effect (seed 9 with the rule off runs between 45 k and 75 k EUR
 * from one year to the next). Six seeds are therefore played in both arms and
 * the ENSEMBLE is banded; the per-seed figures are printed and their spread -
 * measured 1.48 % to 6.31 %, so a single seed lands well outside the band - is
 * the honest error bar on the mean. It is a wider spread than D-203 recorded
 * (3.33-8.15 %) on the same six seeds: the frost gate moved, so the days the
 * two arms diverge on moved, and a chaotic line reshuffles its year around
 * them. The MEAN moved by 0.59 points; the seeds moved by up to 2.3.
 *
 * **What is evidence and what is a read-back.** The band itself is a
 * measurement of this build and nothing more: it restates what D-201's four
 * factor tables do to this line, so it is a read-back of those tables in the
 * same sense scenario 2's payback year is a read-back of the freight tariffs.
 * What it is worth is that a seam which stops being wired, a factor table that
 * collapses to 1, or a weather field that stops producing weather all turn the
 * build red. Independent of the band, and the reason this scenario is about a
 * WINTER at all:
 *
 *  - the loss is winter-loaded, on two instruments that are not the banded
 *    figure. Breakdowns rise further in December, January and February
 *    (measured +32.9 %) than in the other nine months (+7.3 %), and the
 *    train's mean speed while it is moving falls further (-4.94 % against
 *    -2.97 %). Both point at the months `frostSeasonFactor` opens its gate
 *    for, and both separated FURTHER under D-204 than they had under the
 *    climate-blind table;
 *  - the sky never pays: not one of the six seeds earns more with weather than
 *    without;
 *  - and the two arms really are two arms - the off world's field is clear on
 *    every one of its region-days and the harsh world's is not.
 */

/** Seeds played in both arms. The first is the reference line's own. */
const SEEDS: readonly number[] = [COAL_LINE_SEED, 1, 5, 13, 21, 33];

/** Calendar months that are the winter: December, January, February. */
const WINTER_MONTHS: readonly number[] = [11, 0, 1];

/**
 * The band, as a share of the freight revenue a weather-free world earns over
 * the same span. Re-banded from SPEC2 M18's 8-15 % in D-203 and CONFIRMED on
 * the defect-free build in D-204; measured 4.36 %.
 *
 * It is a band on the ENSEMBLE and not on a seed: the per-seed figures span
 * 1.48 % to 6.31 % on this build, which is the chaos of one train and not
 * disagreement about what a winter costs.
 */
const DROP_MIN = 0.03;
const DROP_MAX = 0.07;

interface Arm {
  /** Freight revenue over the whole span. [cent] */
  revenueCt: number;
  breakdownsWinter: number;
  breakdownsRest: number;
  /** Sum of the train's speed over the ticks it was moving. [m/s] */
  speedSumWinter: number;
  speedSumRest: number;
  movingTicksWinter: number;
  movingTicksRest: number;
  /** Region-days on which the sky was anything but clear. */
  weatherDays: number;
  world: World;
}

function isWinter(month: number): boolean {
  return WINTER_MONTHS.includes(month);
}

/**
 * Play the reference coal line for its whole span and collect the four
 * instruments.
 *
 * The month is walked explicitly rather than the year, because two of the
 * instruments are split by calendar month; the freight account is read out of
 * the ledger ring the month it was just archived into, which is the same
 * number the books show the player.
 */
function play(weather: WeatherRule, seed: number): Arm {
  const scenario = buildCoalLine(weather, seed);
  const world = scenario.world;
  const arm: Arm = {
    revenueCt: 0,
    breakdownsWinter: 0,
    breakdownsRest: 0,
    speedSumWinter: 0,
    speedSumRest: 0,
    movingTicksWinter: 0,
    movingTicksRest: 0,
    weatherDays: 0,
    world,
  };

  for (let month = 0; month < COAL_LINE_SPAN_YEARS * MONTHS_PER_YEAR; month++) {
    const winter = isWinter(month % MONTHS_PER_YEAR);
    const breakdownsBefore = world.vehicles.breakdownCount[0]!;
    let speedSum = 0;
    let movingTicks = 0;

    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
      world.step(scenario.queue, null);
      const state = world.vehicles.state[0]!;
      if (state === VehicleState.Driving || state === VehicleState.Braking) {
        speedSum += world.vehicles.speedMs[0]!;
        movingTicks++;
      }
      if (world.tick % TICKS_PER_DAY === 0) {
        for (const cell of world.weatherField.cells) {
          if (cell !== WeatherCell.Clear) arm.weatherDays++;
        }
      }
    }

    const breakdowns = world.vehicles.breakdownCount[0]! - breakdownsBefore;
    if (winter) {
      arm.breakdownsWinter += breakdowns;
      arm.speedSumWinter += speedSum;
      arm.movingTicksWinter += movingTicks;
    } else {
      arm.breakdownsRest += breakdowns;
      arm.speedSumRest += speedSum;
      arm.movingTicksRest += movingTicks;
    }
    // The month that has just been archived sits in the slot before the
    // cursor; `monthHistory` is flat, ACCOUNT_COUNT wide.
    const slot = (world.company.historyCursor + LEDGER_HISTORY_MONTHS - 1) % LEDGER_HISTORY_MONTHS;
    arm.revenueCt += world.company.monthHistory[slot * ACCOUNT_COUNT + Account.RevenueFreight]!;
  }
  return arm;
}

function emptyArm(world: World): Arm {
  return {
    revenueCt: 0,
    breakdownsWinter: 0,
    breakdownsRest: 0,
    speedSumWinter: 0,
    speedSumRest: 0,
    movingTicksWinter: 0,
    movingTicksRest: 0,
    weatherDays: 0,
    world,
  };
}

function add(total: Arm, arm: Arm): Arm {
  return {
    revenueCt: total.revenueCt + arm.revenueCt,
    breakdownsWinter: total.breakdownsWinter + arm.breakdownsWinter,
    breakdownsRest: total.breakdownsRest + arm.breakdownsRest,
    speedSumWinter: total.speedSumWinter + arm.speedSumWinter,
    speedSumRest: total.speedSumRest + arm.speedSumRest,
    movingTicksWinter: total.movingTicksWinter + arm.movingTicksWinter,
    movingTicksRest: total.movingTicksRest + arm.movingTicksRest,
    weatherDays: total.weatherDays + arm.weatherDays,
    world: total.world,
  };
}

interface Ensemble {
  readonly off: Arm;
  readonly harsh: Arm;
  readonly perSeed: readonly { seed: number; offCt: number; harshCt: number }[];
  /** The harsh arm of the first seed - the desync guard's subject. */
  readonly reference: World;
}

function measure(): Ensemble {
  const perSeed: { seed: number; offCt: number; harshCt: number }[] = [];
  let off: Arm | null = null;
  let harsh: Arm | null = null;
  let reference: World | null = null;

  for (const seed of SEEDS) {
    const offArm = play(WeatherRule.Off, seed);
    const harshArm = play(WeatherRule.Harsh, seed);
    if (reference === null) reference = harshArm.world;
    off = off === null ? offArm : add(off, offArm);
    harsh = harsh === null ? harshArm : add(harsh, harshArm);
    perSeed.push({ seed, offCt: offArm.revenueCt, harshCt: harshArm.revenueCt });
  }
  return {
    off: off ?? emptyArm(reference!),
    harsh: harsh ?? emptyArm(reference!),
    perSeed,
    reference: reference!,
  };
}

const euros = (ct: number): number => Math.round(ct / CENTS_PER_EURO);
const percent = (from: number, to: number): string => (((to - from) / from) * 100).toFixed(2);

describe('scenario "harter Winter": what the sky costs the reference coal line', () => {
  const result = measure();
  const drop = (result.off.revenueCt - result.harsh.revenueCt) / result.off.revenueCt;

  it('reports why the line earns what it earns', () => {
    console.log(
      `hard winter: ${SEEDS.length} seeds x ${COAL_LINE_SPAN_YEARS} years, ` +
        `freight revenue ${euros(result.off.revenueCt)} EUR with the weather rule off ` +
        `against ${euros(result.harsh.revenueCt)} EUR harsh ` +
        `(${percent(result.off.revenueCt, result.harsh.revenueCt)} %, band ` +
        `-${(DROP_MIN * 100).toFixed(0)} to -${(DROP_MAX * 100).toFixed(0)} %)`,
    );
    for (const row of result.perSeed) {
      console.log(
        `  seed ${row.seed}: ${euros(row.offCt)} -> ${euros(row.harshCt)} EUR ` +
          `(${percent(row.offCt, row.harshCt)} %)`,
      );
    }
    console.log(
      `  breakdowns Dec/Jan/Feb ${result.off.breakdownsWinter} -> ` +
        `${result.harsh.breakdownsWinter} ` +
        `(${percent(result.off.breakdownsWinter, result.harsh.breakdownsWinter)} %), ` +
        `the other nine months ${result.off.breakdownsRest} -> ${result.harsh.breakdownsRest} ` +
        `(${percent(result.off.breakdownsRest, result.harsh.breakdownsRest)} %)`,
    );
    const speed = (arm: Arm, winter: boolean): number =>
      winter ? arm.speedSumWinter / arm.movingTicksWinter : arm.speedSumRest / arm.movingTicksRest;
    console.log(
      `  mean speed while moving Dec/Jan/Feb ${speed(result.off, true).toFixed(3)} -> ` +
        `${speed(result.harsh, true).toFixed(3)} m/s ` +
        `(${percent(speed(result.off, true), speed(result.harsh, true))} %), ` +
        `the other nine months ${speed(result.off, false).toFixed(3)} -> ` +
        `${speed(result.harsh, false).toFixed(3)} m/s ` +
        `(${percent(speed(result.off, false), speed(result.harsh, false))} %)`,
    );
    console.log(
      `  non-clear region-days: off ${result.off.weatherDays}, harsh ${result.harsh.weatherDays}`,
    );
    expect(result.off.revenueCt).toBeGreaterThan(0);
  });

  it('costs the line 3 to 7 percent of its freight year', () => {
    expect(drop).toBeGreaterThanOrEqual(DROP_MIN);
    expect(drop).toBeLessThanOrEqual(DROP_MAX);
  });

  it('never pays: not one seed earns more with weather than without', () => {
    for (const row of result.perSeed) {
      expect(row.harshCt, `seed ${row.seed} earned more in the weather`).toBeLessThan(row.offCt);
    }
  });

  it('is a WINTER effect: the frost months lose more than the other nine', () => {
    // Two instruments, neither of them the banded figure. The breakdown
    // threshold is the seam with the most reach (D-204) and its frost entry is
    // the largest in the table; the solver seams show up as speed. Both are
    // gated to the winter by `frostSeasonFactor`, so both have to be deeper
    // there - if they were not, the scenario would be measuring a climate
    // rather than a season.
    const breakdownRise = (arm: Arm, winter: boolean): number =>
      winter ? arm.breakdownsWinter : arm.breakdownsRest;
    const winterRise = breakdownRise(result.harsh, true) / breakdownRise(result.off, true);
    const restRise = breakdownRise(result.harsh, false) / breakdownRise(result.off, false);
    expect(winterRise).toBeGreaterThan(restRise);
    expect(winterRise).toBeGreaterThan(1);

    const speedLoss = (winter: boolean): number => {
      const off = winter
        ? result.off.speedSumWinter / result.off.movingTicksWinter
        : result.off.speedSumRest / result.off.movingTicksRest;
      const harsh = winter
        ? result.harsh.speedSumWinter / result.harsh.movingTicksWinter
        : result.harsh.speedSumRest / result.harsh.movingTicksRest;
      return (off - harsh) / off;
    };
    expect(speedLoss(true)).toBeGreaterThan(speedLoss(false));
    expect(speedLoss(true)).toBeGreaterThan(0);
  });

  it('measures two worlds that really differ: one has weather in it and one has none', () => {
    // Without this the band could read zero for the most boring reason there
    // is - a rule that never switched on - and a broken gate would look like a
    // mild winter.
    expect(result.off.weatherDays).toBe(0);
    expect(result.harsh.weatherDays).toBeGreaterThan(0);
  });

  hashTwin(
    'hardWinter',
    () => [result.reference],
    // The harsh arm of the reference seed, and only that one: it is the arm
    // that draws from the weather stream and the only surface this scenario
    // adds. The off arm is `buildCoalLine()` played by scenario 2's own guard.
    () => [play(WeatherRule.Harsh, COAL_LINE_SEED).world],
  );
});
