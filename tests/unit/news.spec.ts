import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import { hasTranslation } from '../../src/i18n';
import { INDUSTRY_CLOSURE_MONTHS, NEWS_LOG_SIZE, TICKS_PER_MONTH } from '../../src/sim/constants';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import { NewsCategory, NewsLog, NewsSeverity, NEWS_CATEGORY_KEYS } from '../../src/sim/news/log';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { flatScenario } from '../balance/scenario';

/**
 * The news log of section 15.
 *
 * Everything it reports was already being counted somewhere - the deadlock
 * timer since M4, the closure clock since M5, the solvency months since M6.
 * What is tested here is that those counters now reach the player, that a daily
 * clock does not turn into a daily sentence, and that the log survives a save.
 */

const SIZE = 64;
const MINE_X = 20;
const MINE_Y = 20;

function entry(messageKey: string, tileIndex: number) {
  return {
    tick: 0,
    category: NewsCategory.Network,
    severity: NewsSeverity.Info,
    messageKey,
    params: {},
    tileIndex,
  };
}

describe('the news log', () => {
  it('keeps the newest entries and drops the oldest', () => {
    const log = new NewsLog();
    for (let i = 0; i < NEWS_LOG_SIZE + 25; i++) log.post(entry(`key.${i}`, i));

    expect(log.all.length).toBe(NEWS_LOG_SIZE);
    expect(log.all[0]!.messageKey).toBe('key.25');
    expect(log.all[NEWS_LOG_SIZE - 1]!.messageKey).toBe(`key.${NEWS_LOG_SIZE + 24}`);
  });

  it('does not repeat the message it has just posted about the same place', () => {
    const log = new NewsLog();
    log.postOnce(entry('news.trainStuck', 7));
    log.postOnce(entry('news.trainStuck', 7));
    log.postOnce(entry('news.trainStuck', 7));
    expect(log.all.length).toBe(1);

    // Another place is another event, and so is the same place once something
    // else has happened in between - the warning is news again by then.
    log.postOnce(entry('news.trainStuck', 8));
    log.postOnce(entry('news.trainStuck', 7));
    expect(log.all.length).toBe(3);
  });

  it('moves its revision on every entry, so the worker can tell it changed', () => {
    const log = new NewsLog();
    const before = log.revision;
    log.postOnce(entry('news.trainStuck', 7));
    expect(log.revision).toBe(before + 1);
    // The suppressed duplicate is not a change.
    log.postOnce(entry('news.trainStuck', 7));
    expect(log.revision).toBe(before + 1);
  });
});

describe('what the simulation reports', () => {
  it('warns about a works nobody collects from, and then reports its closure', () => {
    const scenario = flatScenario(SIZE, [], [
      newIndustry(0, IndustryType.CoalMine, MINE_X, MINE_Y, 0),
    ]);
    const world = scenario.world;

    for (let month = 0; month <= INDUSTRY_CLOSURE_MONTHS + 2; month++) {
      for (let tick = 0; tick < TICKS_PER_MONTH; tick++) world.step(scenario.queue, null);
    }

    const keys = world.news.all.map((n) => n.messageKey);
    expect(keys).toContain('news.industryNeglected');
    expect(keys).toContain('news.industryClosed');

    // Two game years of a daily clock, and the log is not full of the same
    // sentence: the warning is posted once per escalation, not once per day.
    expect(keys.filter((key) => key === 'news.industryClosed').length).toBe(1);
    expect(world.news.all.length).toBeLessThan(20);

    // Every entry can be found on the map, and every one names a real string.
    for (const news of world.news.all) {
      if (news.category === NewsCategory.Industry) expect(news.tileIndex).toBeGreaterThanOrEqual(0);
      // `hasTranslation` rather than `key in de`: a sentence that learned to
      // count (SPEC2 M25) has plural rows and no bare row, so membership is
      // the wrong question about the catalogue now.
      expect(hasTranslation(news.messageKey), news.messageKey).toBe(true);
    }
  });

  it('survives a save', () => {
    const scenario = flatScenario(SIZE, [], [
      newIndustry(0, IndustryType.CoalMine, MINE_X, MINE_Y, 0),
    ]);
    const world = scenario.world;
    for (let tick = 0; tick < TICKS_PER_MONTH * (INDUSTRY_CLOSURE_MONTHS + 2); tick++) {
      world.step(scenario.queue, null);
    }
    expect(world.news.all.length).toBeGreaterThan(0);

    const reloaded = decodeSave(encodeSave(world, scenario.queue, '0.1.0')).world;
    expect(reloaded.news.all).toEqual(world.news.all);
  });
});

describe('the category list', () => {
  it('has a translated label for every category', () => {
    for (const key of NEWS_CATEGORY_KEYS) expect(key in de).toBe(true);
    expect(NEWS_CATEGORY_KEYS.length).toBe(Object.keys(NewsCategory).length);
  });
});
