import {
  BANKRUPTCY_MONTHS,
  COUNCIL_REFUSAL_RATING,
  DEADLOCK_WARN_TICKS,
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_WARNING_MONTHS,
} from '../constants';
import { isInTrouble } from '../economy/company';
import { industrySpec, type Industry } from '../industry/types';
import { isObsolete } from '../vehicles/lifecycle';
import { councilRating } from '../town/council';
import type { Town } from '../town/types';
import type { World } from '../World';
import { NewsCategory, NewsSeverity } from './log';

/**
 * Turning the simulation's clocks into things the player is told.
 *
 * Every one of these conditions was already being recorded - the deadlock timer
 * since M4, the closure count since M5, the solvency months since M6 - and none
 * of them reached the player. This is the one place that reads them, so the
 * rules that produce them stay free of message keys and the messages stay in
 * one list that can be reviewed for tone.
 *
 * Called once a game day. Everything here uses `postOnce`, because a clock that
 * ticks daily would otherwise fill the log with the same sentence.
 */
export function reportNews(world: World): void {
  reportStuckTrains(world);
  reportIndustries(world);
  reportFleet(world);
  reportSolvency(world);
}

/** Trains that have been standing at a red long enough to count (9.3). */
function reportStuckTrains(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const since = vehicles.waitingSinceTick[id]!;
    if (since < 0 || world.tick - since < DEADLOCK_WARN_TICKS) continue;

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Network,
      severity: NewsSeverity.Alarm,
      messageKey: 'news.trainStuck',
      params: { id, minutes: Math.round((world.tick - since) / 1_200) },
      tileIndex: vehicles.tileIndex[id]!,
    });
  }
}

/** The two warnings and the closure of section 7.3. */
function reportIndustries(world: World): void {
  for (const industry of world.industries) {
    const tile = world.map.tileIndex(industry.x, industry.y);
    const name = industrySpec(industry.type).nameKey;

    if (!industry.open) {
      world.news.postOnce({
        tick: world.tick,
        category: NewsCategory.Industry,
        severity: NewsSeverity.Alarm,
        messageKey: 'news.industryClosed',
        params: { industry: name },
        tileIndex: tile,
      });
      continue;
    }
    if (industry.monthsWithoutCollection < INDUSTRY_WARNING_MONTHS[0]!) continue;

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Industry,
      severity:
        industry.monthsWithoutCollection >= INDUSTRY_WARNING_MONTHS[1]!
          ? NewsSeverity.Alarm
          : NewsSeverity.Warning,
      messageKey: 'news.industryNeglected',
      params: {
        industry: name,
        months: INDUSTRY_CLOSURE_MONTHS - industry.monthsWithoutCollection,
      },
      tileIndex: tile,
    });
  }
}

/** Vehicles past their design life, and ones standing broken (11.3). */
function reportFleet(world: World): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    if (!isObsolete(world, id)) continue;

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Fleet,
      severity: NewsSeverity.Warning,
      messageKey: 'news.vehicleObsolete',
      params: { id },
      tileIndex: vehicles.tileIndex[id]!,
    });
  }
}

/** Three months in the red, and the winding-up twelve months later (14.2). */
function reportSolvency(world: World): void {
  const company = world.company;
  if (company.bankrupt) {
    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Finance,
      severity: NewsSeverity.Alarm,
      messageKey: 'news.bankrupt',
      params: {},
      tileIndex: -1,
    });
    return;
  }
  if (!isInTrouble(company)) return;

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Finance,
    severity: NewsSeverity.Alarm,
    messageKey: 'news.inDebt',
    params: {
      months: company.monthsInDebt,
      left: BANKRUPTCY_MONTHS - company.monthsInDebt,
    },
    tileIndex: -1,
  });
}

/**
 * A town whose council has locked us out, and one where somebody bought the
 * building rights (13.3). Called from the monthly council review.
 */
export function reportCouncil(world: World, town: Town): void {
  const tile = world.map.tileIndex(town.x, town.y);

  if (town.exclusiveCompanyId >= 0 && town.exclusiveCompanyId !== world.playerCompanyId) {
    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Town,
      severity: NewsSeverity.Warning,
      messageKey: 'news.exclusiveRights',
      params: { company: world.companyOf(town.exclusiveCompanyId).name, town: town.name },
      tileIndex: tile,
    });
    return;
  }
  if (councilRating(town, world.playerCompanyId) >= COUNCIL_REFUSAL_RATING) return;

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Town,
    severity: NewsSeverity.Alarm,
    messageKey: 'news.councilRefuses',
    params: { town: town.name },
    tileIndex: tile,
  });
}

/** A works that has just opened (7.3). Called from the yearly hook. */
export function reportNewIndustry(world: World, industry: Industry): void {
  world.news.post({
    tick: world.tick,
    category: NewsCategory.Industry,
    severity: NewsSeverity.Info,
    messageKey: 'news.industryOpened',
    params: { industry: industrySpec(industry.type).nameKey },
    tileIndex: world.map.tileIndex(industry.x, industry.y),
  });
}

/** A vehicle replaced by auto-renewal (11.3). */
export function reportRenewal(world: World, id: number, replaced: number): void {
  world.news.post({
    tick: world.tick,
    category: NewsCategory.Fleet,
    severity: NewsSeverity.Info,
    messageKey: 'news.vehicleRenewed',
    params: { count: replaced },
    tileIndex: world.vehicles.tileIndex[id]!,
  });
}
