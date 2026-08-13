import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { pickRoadVehicle } from '../../src/sim/ai/build';
import { PERSONALITY_KEYS, PERSONALITY_COUNT } from '../../src/sim/ai/types';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { AI_LINE_REVIEW_TICKS, BANKRUPTCY_MONTHS } from '../../src/sim/constants';
import { reviewBankruptcy } from '../../src/sim/economy/bankruptcy';
import { reportLeagueMovement } from '../../src/sim/news/report';
import { ModuleKind } from '../../src/sim/station/types';
import { flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * The competitors' life in the news (SPEC2 M24: "KI-Leben in den News via
 * postOnce - Linieneroeffnung, Stilllegung, Insolvenz,
 * Jahres-Ranglistenbewegung").
 *
 * All four are edge events the simulation already reaches, so each one is
 * driven here through the code that reaches it rather than by calling the
 * poster: the project's last stage really opens a line, the review really
 * closes one, `reviewBankruptcy` really winds a company up, and the league is
 * really read out of `valueHistory`.
 *
 * The league line is the one worth reading the assertions of. It invents no
 * state, which is what lets it exist in a milestone with no save bump: last
 * year's ranking is this year's archive read one entry further back (D-180's
 * yearly value history, saved and hashed since M6). A remembered "rank last
 * year" would have been a historical input to a sim decision, and therefore
 * save state under Z4.
 */

const SIZE = 64;
const AI = 1;

function keysOf(scenario: Scenario): string[] {
  return scenario.world.news.all.map((entry) => entry.messageKey);
}

/** One competitor on empty flat ground, with money to spend. */
function bench(): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9, 1);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

/**
 * Exactly what `enqueueInfrastructure` orders for a road line, built by hand as
 * the competitor: the trunk, the spur to the shed, two lorry bays and the road
 * depot. The AI's stage 1 assumes all of it is standing (D-108: each stage
 * observes what the last one left behind).
 */
function infrastructure(scenario: Scenario): void {
  const build = (command: Parameters<typeof tryApply>[1]): void => {
    expect(tryApply(scenario, command, AI)).toBeNull();
  };
  build({ kind: CommandKind.BuildRoad, x1: 20, y1: 20, x2: 30, y2: 20 });
  build({ kind: CommandKind.BuildRoad, x1: 30, y1: 20, x2: 30, y2: 21 });
  build({ kind: CommandKind.BuildRoadStop, x: 20, y: 20, moduleKind: ModuleKind.LorryBay });
  build({ kind: CommandKind.BuildRoadStop, x: 30, y: 20, moduleKind: ModuleKind.LorryBay });
  build({ kind: CommandKind.BuildRoadStop, x: 30, y: 21, moduleKind: ModuleKind.RoadDepot });
}

/**
 * Put the competitor one cycle away from opening a line between two stops it
 * owns, and then let the world run until it has (the D-223 fixture's device).
 */
function openALine(scenario: Scenario): void {
  const world = scenario.world;
  infrastructure(scenario);

  const state = world.ai.find((entry) => entry.companyId === AI)!;
  const specId = pickRoadVehicle(world, Cargo.CommuterPax);
  expect(specId).toBeGreaterThanOrEqual(0);
  state.project = {
    stage: 1,
    fromX: 20,
    fromY: 20,
    toX: 30,
    toY: 20,
    depotX: 30,
    depotY: 21,
    rail: false,
    cargo: Cargo.CommuterPax,
    specIds: [specId],
    startedTick: world.tick,
    railTrains: 1,
    lineId: -1,
  };
  state.nextDecisionTick = world.tick;

  // Three decision cycles carry the project from "infrastructure ordered" to
  // "line opened and crewed"; the commands in between are executed by the
  // ordinary step, which is the whole point of the AI issuing them (D-109).
  for (let tick = 0; tick < 1500 && state.project !== null; tick++) {
    world.step(scenario.queue, null);
  }
}

describe('a competitor opening a line is news', () => {
  it('writes the line, its two ends and the size of the fleet', () => {
    const scenario = bench();
    openALine(scenario);

    const entry = scenario.world.news.all.find((one) => one.messageKey === 'news.aiLineOpened');
    expect(entry, keysOf(scenario).join(', ')).toBeDefined();
    expect(entry!.params['company']).toBe(scenario.world.companyOf(AI).name);
    expect(typeof entry!.params['from']).toBe('string');
    expect(typeof entry!.params['to']).toBe('string');
    expect(entry!.params['vehicles']).toBeGreaterThanOrEqual(1);
    // Findable: a news entry with no place is a riddle (the log's own rule).
    expect(entry!.tileIndex).toBeGreaterThanOrEqual(0);
  });

  it('writes a line the competitor gives up on', () => {
    const scenario = bench();
    openALine(scenario);
    const world = scenario.world;

    const state = world.ai.find((entry) => entry.companyId === AI)!;
    expect(state.reviews.length).toBe(1);
    // Age the review past its window with nothing earned since: the line has
    // not covered its own upkeep, which is what `closeDeadLine` closes it for.
    state.reviews[0]!.reviewTick = world.tick - AI_LINE_REVIEW_TICKS - 1;
    state.reviews[0]!.earnedAtReviewCt = 0;
    state.nextDecisionTick = world.tick;
    for (let tick = 0; tick < 500 && state.reviews.length > 0; tick++) {
      world.step(scenario.queue, null);
    }

    expect(state.reviews.length, 'the line was never closed').toBe(0);
    const entry = scenario.world.news.all.find((one) => one.messageKey === 'news.aiLineClosed');
    expect(entry, keysOf(scenario).join(', ')).toBeDefined();
    expect(entry!.params['company']).toBe(world.companyOf(AI).name);
  });
});

describe('a competitor being wound up is news', () => {
  it('is written once, where the winding-up happens', () => {
    const scenario = bench();
    const world = scenario.world;
    const rival = world.companyOf(AI);

    // Twelve closed months in the red is the 14.2 rule; `reviewSolvency` counts
    // them off the balance, so a company with nothing and a debt qualifies.
    rival.cashCt = -1;
    for (let month = 0; month <= BANKRUPTCY_MONTHS; month++) reviewBankruptcy(world, rival);

    expect(rival.bankrupt).toBe(true);
    const entries = keysOf(scenario).filter((key) => key === 'news.aiBankrupt');
    expect(entries).toEqual(['news.aiBankrupt']);
  });

  it('is not written for the player, who has an end screen instead', () => {
    const scenario = bench();
    const world = scenario.world;
    const player = world.playerCompany;

    player.cashCt = -1;
    for (let month = 0; month <= BANKRUPTCY_MONTHS; month++) reviewBankruptcy(world, player);

    expect(player.bankrupt).toBe(true);
    expect(keysOf(scenario)).not.toContain('news.aiBankrupt');
  });
});

describe('the year-end league', () => {
  /** Give every company an archive of two closed years. */
  function archive(scenario: Scenario, years: readonly number[][]): void {
    const companies = scenario.world.companies;
    for (let index = 0; index < companies.length; index++) {
      companies[index]!.valueHistory = years.map((year) => year[index]!);
    }
  }

  it('says nothing while the standings hold', () => {
    const scenario = bench();
    // Player second in both years: the world went on as it was, which is the
    // one thing a log must not report every year for a century.
    archive(scenario, [
      [100, 200],
      [110, 220],
    ]);
    reportLeagueMovement(scenario.world);
    expect(keysOf(scenario)).not.toContain('news.leagueMove');
  });

  it('says so when the player moves, and names where they stand now', () => {
    const scenario = bench();
    archive(scenario, [
      [100, 200],
      [300, 220],
    ]);
    reportLeagueMovement(scenario.world);

    const entry = scenario.world.news.all.find((one) => one.messageKey === 'news.leagueMove');
    expect(entry).toBeDefined();
    expect(entry!.params['rank']).toBe(1);
    expect(entry!.params['previous']).toBe(2);
    expect(entry!.params['leader']).toBe(scenario.world.playerCompany.name);
  });

  it('is silent with no competitors, and in the first year of a game', () => {
    const alone = flatScenario(SIZE, [], [], 9, 0);
    alone.world.playerCompany.valueHistory = [100, 200];
    reportLeagueMovement(alone.world);
    expect(alone.world.news.all.map((one) => one.messageKey)).not.toContain('news.leagueMove');

    // One closed year is one ranking, and a movement needs two.
    const young = bench();
    for (const company of young.world.companies) company.valueHistory = [100];
    reportLeagueMovement(young.world);
    expect(keysOf(young)).not.toContain('news.leagueMove');
  });

  it('breaks a tie on the company id, which is a total order', () => {
    const scenario = bench();
    // Equal value both years: the player (id 0) is ahead of id 1 by the tie
    // break, and a tie that resolved by walk order would make the rank flap.
    archive(scenario, [
      [100, 100],
      [100, 100],
    ]);
    reportLeagueMovement(scenario.world);
    expect(keysOf(scenario)).not.toContain('news.leagueMove');
  });
});

describe('the four new lines have words, and the personalities finally have a reader', () => {
  it('translates every new news key in both languages', () => {
    const german = de as Record<string, string>;
    const english = en as Record<string, string>;
    for (const key of [
      'news.aiLineOpened',
      'news.aiLineClosed',
      'news.aiBankrupt',
      'news.leagueMove',
    ]) {
      expect(key in german, key).toBe(true);
      expect(key in english, key).toBe(true);
    }
  });

  it('publishes a personality per competitor and none for the player', () => {
    expect(PERSONALITY_KEYS.length).toBe(PERSONALITY_COUNT);
    const scenario = bench();
    const rival = scenario.world.ai.find((entry) => entry.companyId === AI)!;
    expect(rival.personality).toBeGreaterThanOrEqual(0);
    expect(rival.personality).toBeLessThan(PERSONALITY_COUNT);
    // The player's company is in no `AiState`, which is what the marker's -1
    // means - looked up rather than stored, so there is one copy of the fact.
    expect(scenario.world.ai.some((entry) => entry.companyId === 0)).toBe(false);
  });
});
