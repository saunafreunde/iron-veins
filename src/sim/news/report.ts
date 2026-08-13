import {
  BANKRUPTCY_MONTHS,
  BOTTLENECK_MIN_WAITERS,
  COUNCIL_REFUSAL_RATING,
  DEADLOCK_WARN_TICKS,
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_WARNING_MONTHS,
  TOWN_MILESTONE_POPULATIONS,
  WEATHER_REGION_COUNT,
} from '../constants';
import { weatherRegionOf } from '../weather/field';
import type { Station } from '../station/types';
import { analyseDeadlocks, type DeadlockReport } from '../net/deadlock';
import { isInTrouble } from '../economy/company';
import { industrySpec, type Industry } from '../industry/types';
import { isObsolete } from '../vehicles/lifecycle';
import { COUNCIL_PROFILE_KEYS, councilRating } from '../town/council';
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
  reportNetwork(world);
  reportIndustries(world);
  reportFleet(world);
  reportSolvency(world);
  reportWeather(world);
}

/**
 * A storm that has just arrived over a region the player has a station in
 * (SPEC2 M18: "Sturmwarnung je Region via postOnce").
 *
 * Three decisions, and each of them is about not writing noise:
 *
 *  - it reports ARRIVALS, which `updateWeather` recorded in the one pass that
 *    had yesterday's field and today's in hand. A storm that stands over a
 *    region for a week is one warning, because that is one event;
 *  - it reports only regions where the player HAS something. A storm over
 *    empty desert costs nothing and is not news; a storm over the line is
 *    what the rolling resistance, the drag and the breakdown threshold of
 *    D-201 are about to charge for;
 *  - it names the region by the LOWEST-id player station in it, which is a
 *    canonical key: the same front over the same region produces the same
 *    entry and the same tile whichever order the walk took, so `postOnce`
 *    recognises it.
 *
 * A world with the weather rule off never reaches the loop: `arrivalCount` is
 * zero for ever, because `updateWeather` returns before it is written.
 */
function reportWeather(world: World): void {
  const field = world.weatherField;
  if (field.arrivalCount === 0) return;

  const size = world.map.size;
  for (let region = 0; region < WEATHER_REGION_COUNT; region++) {
    if (field.arrivals[region] !== 1) continue;

    let station: Station | null = null;
    for (const candidate of world.stations) {
      if (candidate.ownerId !== world.playerCompanyId) continue;
      if (weatherRegionOf(candidate.x, candidate.y, size) !== region) continue;
      if (station === null || candidate.id < station.id) station = candidate;
    }
    if (station === null) continue;

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Weather,
      severity: NewsSeverity.Warning,
      messageKey: 'news.stormWarning',
      params: { station: station.name },
      tileIndex: world.map.tileIndex(station.x, station.y),
    });
  }
}

/**
 * What the network is doing wrong, in the sharpest terms available (9.3, and
 * its SPEC2 M15 upgrade).
 *
 * The 9.3 clock says a train is stuck. This pass asks the waiting graph WHY
 * and reports each stuck train under exactly ONE of three headings, sharpest
 * first: a deadlock ring, a queue at a bottleneck, or the plain warning. One
 * heading per train is not tidiness - `postOnce` suppresses a repeat only
 * while it is the most recent entry, so two headings about one situation
 * would take it in turns to be the newest and the daily clock would write
 * both of them every game day, which is the exact spam the method exists to
 * prevent.
 *
 * NOTHING HERE READS THE THROUGHPUT COUNTERS, and that is a decision rather
 * than an omission (D-186). The news log is saved and hashed; the counters
 * are derived and start empty after a load. A message that read them would
 * make the saved log depend on unsaved state - a world that continued would
 * report what a world that reloaded does not, which is Fehlerkatalog 2's
 * Fehler 23 with a sentence instead of a route. The counters draw the heat
 * map, the graph writes the log, and the two never cross.
 */
function reportNetwork(world: World): void {
  const report = analyseDeadlocks(world, DEADLOCK_WARN_TICKS);
  reportDeadlockCycles(world, report);
  reportBottlenecks(world, report);
  reportStuckTrains(world, report);
}

/** Tile index as the "(x, y)" a player reads off the map. */
function tileLabel(world: World, tile: number): string {
  const size = world.map.size;
  return `(${tile % size}, ${(tile / size) | 0})`;
}

/**
 * A ring of trains each holding what the next one needs (SPEC2 M15).
 *
 * The message names EVERY participant and EVERY contested tile, because a
 * deadlock is only findable if the player knows how far round it goes -
 * naming one train would send them to the symptom. `tileIndex` is the ring's
 * lowest contested tile, which is a canonical key: the same ring produces the
 * same entry however the search reached it, so `postOnce` recognises it the
 * next day. No auto-fix (SPEC.md Fehler 18) - this is a sentence and a
 * blinking overlay, nothing else.
 */
function reportDeadlockCycles(world: World, report: DeadlockReport): void {
  for (let cycle = 0; cycle < report.cycleCount; cycle++) {
    const from = report.cycleStarts[cycle]!;
    const to = report.cycleStarts[cycle + 1]!;

    let trains = '';
    let tiles = '';
    let lowestTile = -1;
    for (let index = from; index < to; index++) {
      const id = report.cycleMembers[index]!;
      const tile = report.refusedAt[id]!;
      trains += index === from ? `${id}` : `, ${id}`;
      tiles += index === from ? tileLabel(world, tile) : `, ${tileLabel(world, tile)}`;
      if (lowestTile < 0 || tile < lowestTile) lowestTile = tile;
    }

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Network,
      severity: NewsSeverity.Alarm,
      messageKey: 'news.deadlockCycle',
      params: { count: to - from, trains, tiles },
      tileIndex: lowestTile,
    });
  }
}

/**
 * Several trains queueing for ONE piece of track: an Engpass (SPEC2 M15).
 *
 * The definition is the queue itself, not a throughput reading - see the note
 * on `reportNetwork` for why the log may not read the derived counters. Two
 * trains waiting for the identical tile is the smallest fact that says demand
 * for it exceeds what it passes; one train waiting says nothing about
 * capacity at all. Reported once per tile, by its lowest-id waiter, so the
 * key is stable while the queue shuffles.
 */
function reportBottlenecks(world: World, report: DeadlockReport): void {
  for (let i = 0; i < report.waiterCount; i++) {
    const id = report.waiters[i]!;
    if (report.inCycle[id] === 1) continue;
    if (report.queueLength[id]! < BOTTLENECK_MIN_WAITERS) continue;
    // Only the first waiter of this tile in ascending id order speaks for it.
    const tile = report.refusedAt[id]!;
    let first = true;
    for (let k = 0; k < i && first; k++) {
      if (
        report.inCycle[report.waiters[k]!] !== 1 &&
        report.refusedAt[report.waiters[k]!] === tile
      ) {
        first = false;
      }
    }
    if (!first) continue;

    world.news.postOnce({
      tick: world.tick,
      category: NewsCategory.Network,
      severity: NewsSeverity.Warning,
      messageKey: 'news.bottleneck',
      params: { count: report.queueLength[id]!, place: tileLabel(world, tile) },
      tileIndex: tile,
    });
  }
}

/**
 * Trains that have been standing at a red long enough to count (9.3), and
 * that neither of the two sharper headings above has already explained.
 */
function reportStuckTrains(world: World, report: DeadlockReport): void {
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const since = vehicles.waitingSinceTick[id]!;
    if (since < 0 || world.tick - since < DEADLOCK_WARN_TICKS) continue;
    if (report.inCycle[id] === 1) continue;
    if (report.queueLength[id]! >= BOTTLENECK_MIN_WAITERS) continue;

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

/**
 * A council that has just changed hands (SPEC2 M20). Called from the election.
 *
 * Two filters, and both of them are about not writing noise into a log the
 * player is meant to keep open:
 *
 *  - only towns the PLAYER has a station in. A hundred and forty towns voting
 *    on one day is a hundred and forty sentences about places the player has
 *    never been; a council that decides what the player's own track costs in
 *    rating is news. The storm warning of D-202 filters on exactly this and
 *    for exactly this reason;
 *  - only a council that actually CHANGED, which `runElections` decides where
 *    it holds both results. A re-elected council is the world going on as it
 *    was.
 *
 * `postOnce` is the guard behind those, not in front of them: it suppresses a
 * repeat only while the entry is the newest, so two towns changing on the same
 * day both get their line - different tiles - and neither can repeat.
 */
export function reportElection(world: World, town: Town, profile: number): void {
  let served = false;
  for (const station of world.stations) {
    if (station.ownerId !== world.playerCompanyId) continue;
    if (station.townId !== town.id) continue;
    served = true;
    break;
  }
  if (!served) return;

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Town,
    severity: NewsSeverity.Info,
    messageKey: 'news.election',
    params: { town: town.name, profile: COUNCIL_PROFILE_KEYS[profile] ?? '' },
    tileIndex: world.map.tileIndex(town.x, town.y),
  });
}

/**
 * A town that has just grown past one of the milestones of SPEC2 M20.
 *
 * Edge-triggered by `growTowns`, which holds the population before and after
 * the month it just applied, so a town sitting at 5,001 for thirty years is
 * ONE entry: the population is compared against
 * {@link TOWN_MILESTONE_POPULATIONS} on both sides and the entry is written
 * only for a threshold that lies between them. Upwards only - a shrinking town
 * has the 10.1 instruments and does not need a headline for every thousand it
 * loses on the way down.
 *
 * Filtered to towns the player serves, like every other town line in this
 * file, and posted through `postOnce` behind that.
 *
 * **The stated floor of using `postOnce` here**: its key is the message AND
 * the place, so a town that crosses two thresholds with nothing else written
 * in between gets one line rather than two. That is the price of the guard
 * SPEC2 M20 asks for by name, and it is priced in months - the thresholds are
 * a factor of two apart, so a town takes years to cross two of them, and a
 * game year with no other news in it is not a game anybody is playing.
 * `elections.spec.ts` pins the collapse rather than hiding it.
 */
export function reportTownMilestone(world: World, town: Town, before: number): void {
  const after = town.population;
  if (after <= before) return;

  let crossed = -1;
  for (const milestone of TOWN_MILESTONE_POPULATIONS) {
    if (before < milestone && after >= milestone) crossed = milestone;
  }
  if (crossed < 0) return;

  let served = false;
  for (const station of world.stations) {
    if (station.ownerId !== world.playerCompanyId) continue;
    if (station.townId !== town.id) continue;
    served = true;
    break;
  }
  if (!served) return;

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Town,
    severity: NewsSeverity.Info,
    messageKey: 'news.townMilestone',
    params: { town: town.name, population: crossed },
    tileIndex: world.map.tileIndex(town.x, town.y),
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

// ------------------------------------------------------ the competitors' life
//
// SPEC2 M24 asks for "KI-Leben in den News via postOnce (Linieneroeffnung,
// Stilllegung, Insolvenz, Jahres-Ranglistenbewegung)". All four are EDGE events
// the simulation already reaches - a project's last stage, the review that
// closes a line, the winding-up of 14.2, the year boundary - so none of them
// needs a clock of its own and none of them is filtered by "does the player
// have a station here": a competitor's line is news wherever it is, and a
// player who cannot see the opposition is playing alone.
//
// `postOnce` rather than `post` for all four, per the milestone's own sentence.
// It guards the one collapse that can happen here: two competitors doing the
// same thing at the same place on the same day is one event as far as the log
// is concerned, and that is the correct reading of it.

/** A competitor that has just opened and crewed a line (section 15, step 2). */
export function reportAiLineOpened(
  world: World,
  companyId: number,
  from: Station,
  to: Station,
  vehicles: number,
): void {
  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Network,
    severity: NewsSeverity.Info,
    messageKey: 'news.aiLineOpened',
    params: {
      company: world.companyOf(companyId).name,
      from: from.name,
      to: to.name,
      vehicles,
    },
    tileIndex: world.map.tileIndex(from.x, from.y),
  });
}

/**
 * A competitor that has just shut a line down (section 15, step 3).
 *
 * Reported for the DELIBERATE closure - the review that judged the line not
 * worth its upkeep and sold the fleet - and not for the housekeeping branches
 * beside it, where the line was already gone or had no vehicles left. Those are
 * the AI tidying its own memory, which is not an event in the world.
 */
export function reportAiLineClosed(world: World, companyId: number, at: Station): void {
  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Network,
    severity: NewsSeverity.Info,
    messageKey: 'news.aiLineClosed',
    params: { company: world.companyOf(companyId).name, place: at.name },
    tileIndex: world.map.tileIndex(at.x, at.y),
  });
}

/**
 * A competitor wound up (14.2). Posted where the winding-up HAPPENS rather than
 * from the daily pass, because `reportSolvency`'s daily `postOnce` reads the
 * flag and would therefore announce whichever bankrupt company the walk met
 * first - for ever, and never the others.
 */
export function reportAiBankrupt(world: World, companyId: number): void {
  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Finance,
    severity: NewsSeverity.Info,
    messageKey: 'news.aiBankrupt',
    params: { company: world.companyOf(companyId).name },
    tileIndex: -1,
  });
}

/**
 * Where the player stands in the league after the year that has just closed,
 * and only when that answer MOVED (SPEC2 M24's "Jahres-Ranglistenbewegung").
 *
 * It invents no state, which is the whole reason it can exist in a milestone
 * with no save bump: `closeFinancialYear` has appended this year's company value
 * to every company's `valueHistory` by the time this runs (D-180's yearly
 * archive, saved and hashed since M6), so last year's ranking is the same list
 * read one entry further back. A remembered "rank last year" would have been a
 * historical input to a sim decision and therefore save state (Z4).
 *
 * A rank that did not move is not news: a hundred years of "still second" is
 * how a log becomes something nobody opens (the argument `postOnce` itself is
 * written for).
 */
export function reportLeagueMovement(world: World): void {
  const companies = world.companies;
  if (companies.length < 2) return;
  // Both years have to exist for every company, or the two rankings would be
  // taken over different fields. The first year of a game has one entry.
  for (const company of companies) {
    if (company.valueHistory.length < 2) return;
  }

  const now = leagueRankOf(world, 1);
  const before = leagueRankOf(world, 2);
  if (now === before) return;

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Finance,
    severity: now < before ? NewsSeverity.Info : NewsSeverity.Warning,
    messageKey: 'news.leagueMove',
    params: {
      rank: now,
      previous: before,
      leader: leagueLeaderName(world),
      year: world.date.year - 1,
    },
    tileIndex: -1,
  });
}

/**
 * The player's place in the league `back` entries from the end of the value
 * archive, counting from 1. Ties break on the company id, which is a total
 * order (law #3): two companies worth the same must not swap places because a
 * walk happened to reach them in a different order.
 */
function leagueRankOf(world: World, back: number): number {
  const mine = world.playerCompany.valueHistory;
  const value = mine[mine.length - back]!;
  let rank = 1;
  for (const company of world.companies) {
    if (company.id === world.playerCompanyId) continue;
    const theirs = company.valueHistory[company.valueHistory.length - back]!;
    if (theirs > value || (theirs === value && company.id < world.playerCompanyId)) rank++;
  }
  return rank;
}

/** Who is top of the league on the year that has just closed. */
function leagueLeaderName(world: World): string {
  let best = world.companies[0]!;
  for (const company of world.companies) {
    const theirs = company.valueHistory[company.valueHistory.length - 1]!;
    const held = best.valueHistory[best.valueHistory.length - 1]!;
    if (theirs > held || (theirs === held && company.id < best.id)) best = company;
  }
  return best.name;
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
