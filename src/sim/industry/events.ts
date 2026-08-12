import {
  INDUSTRY_EVENT_MONTHLY_ODDS,
  INDUSTRY_EVENT_STREAM_NAME,
  INDUSTRY_HARVEST_FACTOR,
  INDUSTRY_HARVEST_MONTHS_MAX,
  INDUSTRY_HARVEST_MONTHS_MIN,
  INDUSTRY_STRIKE_MONTHS,
  TICKS_PER_MONTH,
} from '../constants';
import { NewsCategory, NewsSeverity } from '../news/log';
import { streamSalt } from '../rng';
import type { World } from '../World';
import { industrySpec } from './types';

/**
 * Industry events (SPEC2 M21): a record harvest and a strike.
 *
 * Two things happen to a works that nobody decided: it has a very good few
 * months, or its people stop working for one. Both are drawn from the
 * milestone's own named stream (`streams.events`, Z3) and both are read by the
 * industry clock of section 7.3 that was already there - a harvest is a factor
 * in the SAME product the season and the century already multiply, and a
 * strike is a month in which `produceIndustryCargo` makes nothing.
 *
 * ## The trap this feature walks into, named before it is sprung
 *
 * A strike is a month with no production, and section 7.3's review counts
 * months in which nothing was collected towards the 24-month closure clock.
 * **A strike month must not count** - "Dormanz zählt per D-086 nicht zur
 * Schließung" is SPEC2 M21's own clause, and D-086 is the entry that removed
 * the decline rule for exactly this reason: a works must never be punished for
 * a month in which there was nothing to carry away.
 *
 * The dormancy rule already in `reviewIndustries` does NOT cover it. That test
 * is "produced nothing AND has nothing standing in its yard", and a struck
 * works usually has a full yard - it was producing until last month. So the
 * strike is asserted explicitly, through {@link industryStruckMonthEnding},
 * and the test for it is a CONTROL: the same works, the same month, with and
 * without the strike, compared on `monthsWithoutCollection`.
 *
 * ## The rules, written down rather than left to be discovered
 *
 * 1. **One draw per open works per month.** How many numbers this subsystem
 *    takes out of its stream depends on the industry LIST and on nothing the
 *    draws themselves said, which is what keeps two worlds that differ only in
 *    their event history from forking every later month (Z3, the argument
 *    `supply.ts` builds its candidate list whole for).
 * 2. **A record harvest is for a works that HARVESTS.** Only an industry with
 *    no inputs can have one - a mine, a forest, a farm, an oil well - because a
 *    factory's output is capped by the input it was delivered, so a multiplier
 *    there would silently do nothing most months and the event would be a lie
 *    in the news log. A processing works can still be struck: a strike is about
 *    the people, not the recipe.
 * 3. **A strike stops the works, not the trains.** Collection carries on
 *    normally, because a picket line that also seized the platform would punish
 *    the player twice for something they did not cause - and would make a
 *    strike indistinguishable from a station failure. It is also precisely why
 *    rule 4 has to be explicit.
 * 4. **A strike month never counts towards closure** (D-086, above), and it
 *    does not enter the twelve-month service average either: a ratio of zero
 *    that the player could not have changed would block the works' own growth
 *    for a year. A collection that DID happen during the strike still re-arms
 *    the clock, because it happened.
 * 5. **The board exists only in a century world.** `world.economy` is SPEC2
 *    M21's off-anchor - "Weltregel Konjunktur: aus pinnt alle Referenzläufe" -
 *    and `reviewIndustryEvents` returns on its first line without it, drawing
 *    nothing and writing nothing, exactly like the supply and subsidy boards of
 *    D-238 (Fehlerkatalog 34). Every band this game owns is arithmetically
 *    untouched, by construction rather than by luck.
 */

export const IndustryEventKind = {
  /** A very good few months: the output multiplier of `INDUSTRY_HARVEST_FACTOR`. */
  RecordHarvest: 0,
  /** One month in which the works produces nothing at all. */
  Strike: 1,
} as const;
export type IndustryEventKind = (typeof IndustryEventKind)[keyof typeof IndustryEventKind];

export const INDUSTRY_EVENT_KIND_COUNT = 2;

/**
 * One thing that is happening to one works.
 *
 * It has no id, and that is a decision rather than an omission: a tender, a
 * supply order and a subsidy all carry one because a COMMAND refers to them,
 * and there is no command here. An event is something the world does to an
 * industry; nothing the player can send names one.
 */
export interface IndustryEvent {
  /** The works it is happening to. */
  readonly industryId: number;
  /** A value of IndustryEventKind. */
  readonly kind: number;
  /** The month boundary it began at. */
  readonly startTick: number;
  /** The month boundary it ends at; the event covers `[start, end)`. */
  readonly endTick: number;
}

/**
 * What a works' monthly output is multiplied by right now: 1, or the harvest.
 *
 * Read by `produceIndustryCargo` in the same product as the century and the
 * season, so a record year in a boom in a good summer is one number and not
 * three rules arguing. Returns on its first line in every world without an
 * event board, which is every world without a century.
 */
export function industryEventOutputFactor(world: World, industryId: number): number {
  const events = world.industryEvents;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.industryId !== industryId) continue;
    if (event.kind !== IndustryEventKind.RecordHarvest) continue;
    if (world.tick < event.startTick || world.tick >= event.endTick) continue;
    return INDUSTRY_HARVEST_FACTOR;
  }
  return 1;
}

/** Is this works standing still this month? */
export function industryOnStrike(world: World, industryId: number): boolean {
  const events = world.industryEvents;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.industryId !== industryId) continue;
    if (event.kind !== IndustryEventKind.Strike) continue;
    if (world.tick < event.startTick || world.tick >= event.endTick) continue;
    return true;
  }
  return false;
}

/**
 * Was this works on strike during the month that has just ENDED?
 *
 * The half-open window of {@link industryOnStrike} read one boundary later:
 * `reviewIndustries` judges the month behind it, and at that moment a strike
 * that covered it has `endTick === world.tick`. It is why `reviewIndustryEvents`
 * retires an expired event AFTER the review and never before - the review is
 * the last reader of a month, and pruning first would hand it a month whose
 * strike had already been forgotten.
 */
export function industryStruckMonthEnding(world: World, industryId: number): boolean {
  const events = world.industryEvents;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.industryId !== industryId) continue;
    if (event.kind !== IndustryEventKind.Strike) continue;
    if (event.startTick < world.tick && event.endTick >= world.tick) return true;
  }
  return false;
}

/**
 * Retire what has run out, then roll for the month that starts now.
 *
 * Called monthly, between `reviewIndustries` (which judges the month that has
 * ended and therefore has to see a strike that covered it) and
 * `produceIndustryCargo` (which is what a strike or a harvest changes).
 */
export function reviewIndustryEvents(world: World): void {
  if (!world.economy) return;

  for (let index = world.industryEvents.length - 1; index >= 0; index--) {
    if (world.industryEvents[index]!.endTick <= world.tick) world.industryEvents.splice(index, 1);
  }

  // Folded with the tick exactly as the tender, supply and subsidy boards fold
  // theirs (D-128): a named stream alone is a constant per world, so every
  // month would roll the same numbers for ever.
  const rng = world.streamFor(streamSalt(INDUSTRY_EVENT_STREAM_NAME) + world.tick);

  for (let index = 0; index < world.industries.length; index++) {
    const works = world.industries[index]!;
    if (!works.open) continue;
    // The draw is taken for every open works whatever comes of it - see rule 1
    // in the head of this file.
    if (rng.nextInt(INDUSTRY_EVENT_MONTHLY_ODDS) !== 0) continue;
    if (hasEvent(world, works.id)) continue;

    const primary = industrySpec(works.type).inputs.length === 0;
    // A works that cannot harvest is struck without a second draw: an event
    // that is decided and then thrown away would make the strike rate depend
    // on how many mines happen to stand on the map.
    const harvest = primary && rng.nextInt(INDUSTRY_EVENT_KIND_COUNT) === 0;
    const months = harvest
      ? INDUSTRY_HARVEST_MONTHS_MIN +
        rng.nextInt(INDUSTRY_HARVEST_MONTHS_MAX - INDUSTRY_HARVEST_MONTHS_MIN + 1)
      : INDUSTRY_STRIKE_MONTHS;

    world.industryEvents.push({
      industryId: works.id,
      kind: harvest ? IndustryEventKind.RecordHarvest : IndustryEventKind.Strike,
      startTick: world.tick,
      endTick: world.tick + months * TICKS_PER_MONTH,
    });

    // `postOnce` rather than `post`, which SPEC2 M21 asks for by name: the
    // guard is against the same sentence about the same place twice in a row,
    // and one works being struck in two consecutive months is exactly the
    // repetition a reader would take for a stuck log.
    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Industry,
      severity: harvest ? NewsSeverity.Info : NewsSeverity.Warning,
      messageKey: harvest ? 'news.recordHarvest' : 'news.strike',
      params: harvest
        ? {
            industry: industrySpec(works.type).nameKey,
            months,
            percent: Math.round((INDUSTRY_HARVEST_FACTOR - 1) * 100),
          }
        : { industry: industrySpec(works.type).nameKey, months },
      tileIndex: world.map.tileIndex(works.x, works.y),
    });
  }
}

/** Is something already happening to this works? */
function hasEvent(world: World, industryId: number): boolean {
  for (let index = 0; index < world.industryEvents.length; index++) {
    if (world.industryEvents[index]!.industryId === industryId) return true;
  }
  return false;
}
