import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import {
  INDUSTRY_HARVEST_FACTOR,
  INDUSTRY_STRIKE_MONTHS,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import {
  IndustryEventKind,
  industryEventOutputFactor,
  industryOnStrike,
  industryStruckMonthEnding,
  type IndustryEvent,
} from '../../src/sim/industry/events';
import {
  industrySpec,
  IndustryType,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import { NewsCategory } from '../../src/sim/news/log';
import { hashWorld, World, type World as WorldType } from '../../src/sim/World';
import { flatScenario, type Scenario } from '../balance/scenario';

/**
 * Industry events (SPEC2 M21): a record harvest and a strike.
 *
 * The one assertion this file exists for is the TRAP: a strike is a month with
 * no production, section 7.3 counts months without collection towards the
 * 24-month closure clock, and a struck works usually has a full yard - so the
 * dormancy rule already in `reviewIndustries` does NOT cover it. Every claim
 * about that clock here is measured against a CONTROL: the identical world,
 * the identical months, with and without the strike. A counter that merely
 * "looks right" proves nothing, because a mine nobody collects from advances
 * that clock every month anyway.
 */

const SIZE = 64;

/** One coal mine on flat ground, and a century unless asked otherwise. */
function scenario(economy = true, industries: Industry[] = [mine(0, 30, 30)]): Scenario {
  return flatScenario(SIZE, [], industries, 9, 0, true, undefined, false, economy);
}

function mine(id: number, x: number, y: number): Industry {
  return newIndustry(id, IndustryType.CoalMine, x, y, 0);
}

/**
 * A fresh grid of works, built per world.
 *
 * A FUNCTION and not a shared array: `flatScenario` hands the list straight to
 * the world, so two scenarios built from one array would share the industry
 * objects themselves and every "same seed twice" comparison would be comparing
 * a world with itself.
 */
function grid(count: number, type: IndustryType = IndustryType.CoalMine): Industry[] {
  const works: Industry[] = [];
  for (let id = 0; id < count; id++) {
    works.push(newIndustry(id, type, 4 + (id % 5) * 10, 4 + Math.floor(id / 5) * 10, 0));
  }
  return works;
}

function runMonths(s: Scenario, months: number): void {
  for (let tick = 0; tick < TICKS_PER_MONTH * months; tick++) s.world.step(s.queue, null);
}

/**
 * The same months, with the works kept in business.
 *
 * These worlds have no stations, so nothing is ever collected and every works
 * on them shuts down after the twenty-four months of section 7.3 - which would
 * make a long run measure the closure clock rather than the event board. The
 * clock is re-armed between months, which is what a served works would do
 * anyway, and it is never used by the tests that are ABOUT that clock.
 */
function runServedMonths(s: Scenario, months: number): void {
  for (let month = 0; month < months; month++) {
    runMonths(s, 1);
    for (const works of s.world.industries) works.monthsWithoutCollection = 0;
  }
}

/**
 * Plant one event that STARTS at the next month boundary.
 *
 * The next one and not this one: the monthly block has already produced for
 * the month in progress by the time a test gets the world back, so an event
 * stamped at the current tick would be a month the works had already worked.
 */
function plant(world: WorldType, kind: number, months: number): IndustryEvent {
  const event: IndustryEvent = {
    industryId: 0,
    kind,
    startTick: world.tick + TICKS_PER_MONTH,
    endTick: world.tick + (1 + months) * TICKS_PER_MONTH,
  };
  world.industryEvents.push(event);
  return event;
}

describe('the industry event board', () => {
  it('exists only in a century world', () => {
    const without = scenario(false, grid(20));
    runServedMonths(without, 120);
    expect(without.world.industryEvents).toHaveLength(0);

    // Twenty works over ten game years is 2,400 works-months against odds of
    // one in 240, so "nothing happened" would be the finding, not the noise.
    const with_ = scenario(true, grid(20));
    let seen = 0;
    for (let month = 0; month < 120; month++) {
      runServedMonths(with_, 1);
      seen += with_.world.industryEvents.length > 0 ? 1 : 0;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('draws the same board twice for the same seed', () => {
    const first = scenario(true, grid(12));
    const second = scenario(true, grid(12));
    runServedMonths(first, 200);
    runServedMonths(second, 200);
    expect(second.world.industryEvents).toEqual(first.world.industryEvents);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
  });

  it('never puts two things at once on one works', () => {
    const s = scenario(true, grid(12));
    for (let month = 0; month < 300; month++) {
      runServedMonths(s, 1);
      const holders = s.world.industryEvents.map((event) => event.industryId);
      expect(new Set(holders).size).toBe(holders.length);
    }
  });
});

describe('a strike', () => {
  it('stops production for exactly the month it covers', () => {
    const s = scenario();
    runMonths(s, 3);
    plant(s.world, IndustryEventKind.Strike, INDUSTRY_STRIKE_MONTHS);
    const works = s.world.industries[0]!;

    const before = works.outputStock0;
    runMonths(s, 1);
    expect(industryOnStrike(s.world, 0)).toBe(true);
    expect(works.outputStock0).toBe(before);

    // And the month after it, the works is back at work.
    const struck = works.outputStock0;
    runMonths(s, 1);
    expect(industryOnStrike(s.world, 0)).toBe(false);
    expect(works.outputStock0).toBeGreaterThan(struck);
  });

  it('does NOT count its month towards the closure clock - measured against a control', () => {
    // Both worlds are the same world: one coal mine, no stations, so nothing
    // is ever collected and the closure clock of 7.3 advances every month in
    // BOTH of them. That is what makes this a measurement rather than a
    // reading - the difference between the two counters is the strike, and
    // nothing else can be (D-086).
    const struck = scenario();
    const control = scenario();
    runMonths(struck, 3);
    runMonths(control, 3);
    expect(struck.world.industries[0]!.monthsWithoutCollection).toBe(
      control.world.industries[0]!.monthsWithoutCollection,
    );

    plant(struck.world, IndustryEventKind.Strike, INDUSTRY_STRIKE_MONTHS);
    runMonths(struck, 2);
    runMonths(control, 2);

    const a = struck.world.industries[0]!;
    const b = control.world.industries[0]!;
    // Measured, and stated: the control counts four (the first month's review
    // finds a works that has not made anything yet and is genuinely dormant),
    // the struck works counts three - exactly the one month it stood still.
    expect(b.monthsWithoutCollection).toBe(4);
    expect(a.monthsWithoutCollection).toBe(3);
    // The yard is the reason the ordinary dormancy test could not have done
    // this: the works has plenty standing in it, so `idle` is false.
    expect(a.outputStock0).toBeGreaterThan(0);
    // Nothing else moved: the level is untouched, which is D-086's own rule.
    expect(a.productionLevel).toBe(b.productionLevel);
  });

  it('leaves the twelve-month service average alone', () => {
    const struck = scenario();
    const control = scenario();
    runMonths(struck, 3);
    runMonths(control, 3);

    plant(struck.world, IndustryEventKind.Strike, INDUSTRY_STRIKE_MONTHS);
    runMonths(struck, 2);
    runMonths(control, 2);

    // The control has one more month of a zero collected share in its window;
    // the struck works skipped it rather than being marked down for a month it
    // could not have served.
    expect(struck.world.industries[0]!.serviceMonths).toBe(
      control.world.industries[0]!.serviceMonths - 1,
    );
  });

  it('is what `industryStruckMonthEnding` reads one boundary later', () => {
    const s = scenario();
    runMonths(s, 3);
    const event = plant(s.world, IndustryEventKind.Strike, INDUSTRY_STRIKE_MONTHS);

    // Inside the month: on strike now, and the month that ENDED was not.
    s.world.tick = event.startTick;
    expect(industryOnStrike(s.world, 0)).toBe(true);
    expect(industryStruckMonthEnding(s.world, 0)).toBe(false);

    // At the boundary that closes it: no longer standing still, and the month
    // the review is about was the struck one.
    s.world.tick = event.endTick;
    expect(industryOnStrike(s.world, 0)).toBe(false);
    expect(industryStruckMonthEnding(s.world, 0)).toBe(true);
  });
});

describe('a record harvest', () => {
  it('multiplies the month it covers by exactly its factor', () => {
    const harvest = scenario();
    const control = scenario();
    runMonths(harvest, 3);
    runMonths(control, 3);

    plant(harvest.world, IndustryEventKind.RecordHarvest, 1);
    const beforeA = harvest.world.industries[0]!.outputStock0;
    const beforeB = control.world.industries[0]!.outputStock0;
    runMonths(harvest, 1);
    runMonths(control, 1);

    const madeA = harvest.world.industries[0]!.outputStock0 - beforeA;
    const madeB = control.world.industries[0]!.outputStock0 - beforeB;
    expect(madeB).toBeGreaterThan(0);
    expect(madeA / madeB).toBeCloseTo(INDUSTRY_HARVEST_FACTOR, 9);
  });

  it('is never offered to a works that has no harvest to have', () => {
    // A factory's output is capped by the input it was delivered, so a
    // multiplier there would silently do nothing most months - the event would
    // be a sentence in the log about something that did not happen.
    const s = scenario(true, grid(12, IndustryType.SteelMill));

    let harvests = 0;
    let strikes = 0;
    for (let month = 0; month < 400; month++) {
      runServedMonths(s, 1);
      for (const event of s.world.industryEvents) {
        const works = s.world.industries[event.industryId]!;
        const primary = industrySpec(works.type).inputs.length === 0;
        if (event.kind === IndustryEventKind.RecordHarvest) {
          expect(primary).toBe(true);
          harvests++;
        } else {
          strikes++;
        }
      }
    }
    // The world grows its own works over four centuries of game time (7.3
    // opens one a year), so both arms are actually exercised: the planted
    // steel mills can only ever be struck, and the mines that open later can
    // have either.
    expect(strikes).toBeGreaterThan(0);
    expect(harvests).toBeGreaterThan(0);
  });

  it('is exactly 1 for every works that is not having one', () => {
    const s = scenario();
    expect(industryEventOutputFactor(s.world, 0)).toBe(1);
    runMonths(s, 3);
    plant(s.world, IndustryEventKind.RecordHarvest, 2);
    expect(industryEventOutputFactor(s.world, 0)).toBe(1);
    s.world.tick += TICKS_PER_MONTH;
    expect(industryEventOutputFactor(s.world, 0)).toBe(INDUSTRY_HARVEST_FACTOR);
    // Another works on the same board is untouched by it.
    expect(industryEventOutputFactor(s.world, 1)).toBe(1);
  });
});

describe('the news', () => {
  it('reports both kinds, with a place and a translatable sentence', () => {
    const mineKeys = ['news.recordHarvest', 'news.strike'];
    const s = scenario(true, grid(20));
    const seen = new Set<string>();

    for (let month = 0; month < 400; month++) {
      runServedMonths(s, 1);
      const entries = s.world.news.all;
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        if (!mineKeys.includes(entry.messageKey)) continue;
        seen.add(entry.messageKey);
        expect(entry.category).toBe(NewsCategory.Industry);
        expect(entry.tileIndex).toBeGreaterThanOrEqual(0);
        expect(entry.messageKey in de).toBe(true);
        // The works is named by its own catalogue key, which `formatNewsMessage`
        // resolves through `t()` - not by a sentence baked into the simulation.
        const named = entry.params['industry'];
        expect(typeof named).toBe('string');
        expect(named as string).toMatch(/^industry\./);
        expect((named as string) in de).toBe(true);

        // `postOnce`, which SPEC2 M21 asks for by name: the same sentence
        // about the same place is never appended straight after itself.
        const previous = entries[index - 1];
        if (previous === undefined) continue;
        expect(
          previous.messageKey === entry.messageKey && previous.tileIndex === entry.tileIndex,
        ).toBe(false);
      }
    }
    expect(seen).toEqual(new Set(mineKeys));
  });
});

describe('the board is save state', () => {
  it('survives a round trip and is fingerprinted', () => {
    const s = scenario(true, grid(12));
    // An event lasts one to four months, so a fixed number of months is a coin
    // toss on whether the board happens to be occupied: run until it is.
    for (let month = 0; month < 400 && s.world.industryEvents.length === 0; month++) {
      runServedMonths(s, 1);
    }
    expect(s.world.industryEvents.length).toBeGreaterThan(0);

    const reloaded = World.fromData(s.world.toData());
    expect(reloaded.industryEvents).toEqual(s.world.industryEvents);
    expect(hashWorld(reloaded)).toBe(hashWorld(s.world));

    // A board that changed is a world that fingerprints differently - which is
    // the whole reason it is hashed rather than rebuilt on load (Z4).
    const before = hashWorld(reloaded);
    reloaded.industryEvents[0] = { ...reloaded.industryEvents[0]!, endTick: 1 };
    expect(hashWorld(reloaded)).not.toBe(before);
  });
});
