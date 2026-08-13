import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import type { GoalMarker, NewsMarker } from '../../src/shared/protocol';
import { GoalMedal, GoalStatus } from '../../src/sim/goals/types';
import {
  ACHIEVEMENTS,
  countNews,
  newlyEarnedAchievements,
  type AchievementFacts,
} from '../../src/ui/achievements';

/**
 * The achievements of SPEC2 M24: "~40 Achievements als Daten, ausgeloest
 * ausschliesslich durch News-Log-Ereignisse und M17-Zielabschluesse - null
 * Sim-Beteiligung".
 *
 * Three of the four clauses in that sentence are properties a test can hold, so
 * they are held here rather than described:
 *
 *  - **at least forty**, each with a unique id and words in both languages;
 *  - **exclusively news and goals**: the trigger union has three shapes and all
 *    three read one of those two outputs, and every news key an achievement
 *    names is a key the simulation really posts (both directions, the D-118 /
 *    D-169 audit shape). An achievement keyed on a message nobody writes can
 *    never be earned, and nothing else in the repository would notice;
 *  - **null Sim-Beteiligung, grep-provable**: the word does not occur anywhere
 *    under `src/sim`.
 */

const SIM_DIR = fileURLToPath(new URL('../../src/sim/', import.meta.url));
const UI_DIR = fileURLToPath(new URL('../../src/ui/', import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}${name}`;
    if (statSync(path).isDirectory()) out.push(...sourceFiles(`${path}/`));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** Every news key the SIMULATION posts, read out of its own source. */
function postedNewsKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(SIM_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/'(news\.[A-Za-z]+)'/g)) {
      const key = match[1]!;
      // The category labels of the filter row are not events.
      if (key.startsWith('news.category.')) continue;
      keys.add(key);
    }
  }
  return keys;
}

function news(messageKey: string, tick = 0): NewsMarker {
  return {
    tick,
    year: 1950,
    month: 0,
    day: 0,
    category: 0,
    severity: 0,
    messageKey,
    params: {},
    tileIndex: -1,
  };
}

function goal(status: number, medal: number): GoalMarker {
  return {
    kind: 0,
    subjectA: -1,
    subjectB: -1,
    threshold: 0,
    target: 1,
    progress: 0,
    status,
    medal,
    projectedMedal: medal,
    thresholdYear: 0,
    completedYear: 1955,
    goldYear: 1955,
    silverYear: 1958,
    bronzeYear: 1960,
    townAName: '',
    townBName: '',
  };
}

function facts(counts: Record<string, number>, goals: readonly GoalMarker[] = []): AchievementFacts {
  return { newsCounts: new Map(Object.entries(counts)), goals };
}

const german = de as Record<string, string>;
const english = en as Record<string, string>;

describe('the achievement table', () => {
  it('carries at least the forty SPEC2 M24 asks for, each with its own id', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((one) => one.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('has a title and a condition in both languages', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.titleKey in german, achievement.titleKey).toBe(true);
      expect(achievement.titleKey in english, achievement.titleKey).toBe(true);
      expect(achievement.descriptionKey in german, achievement.descriptionKey).toBe(true);
      expect(achievement.descriptionKey in english, achievement.descriptionKey).toBe(true);
    }
  });

  it('is triggered by news and by goals, and by nothing else', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(['news', 'goal', 'allGoals'], achievement.id).toContain(achievement.trigger.kind);
    }
    // Both halves of SPEC2's sentence are really used - a table that was all
    // news would satisfy every assertion above and half the requirement.
    const kinds = new Set(ACHIEVEMENTS.map((one) => one.trigger.kind));
    expect(kinds.has('news')).toBe(true);
    expect(kinds.has('goal')).toBe(true);
    expect(kinds.has('allGoals')).toBe(true);
  });

  it('names only news keys the simulation really posts', () => {
    // The coupling that makes the table honest: an achievement keyed on a
    // message nobody writes is one nobody can ever earn, and it would look
    // exactly like a working one.
    const posted = postedNewsKeys();
    expect(posted.size).toBeGreaterThan(20);
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.trigger.kind !== 'news') continue;
      expect(posted.has(achievement.trigger.messageKey), achievement.id).toBe(true);
    }
  });

  it('asks for counts one game can really produce', () => {
    // Every count is earned inside one world - the tally is seeded from the log
    // that world was loaded with and extended as it plays - so a threshold
    // above the log's own size would be an achievement nobody could see coming.
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.trigger.kind === 'allGoals') continue;
      expect(achievement.trigger.count, achievement.id).toBeGreaterThanOrEqual(1);
      expect(achievement.trigger.count, achievement.id).toBeLessThanOrEqual(10);
    }
  });
});

describe('what earns an achievement', () => {
  it('counts news by key, and only reaches the threshold when it is reached', () => {
    const tally = new Map<string, number>();
    countNews(tally, [news('news.yearClosed'), news('news.yearClosed'), news('news.storm')]);
    expect(tally.get('news.yearClosed')).toBe(2);
    expect(tally.get('news.storm')).toBe(1);

    expect(newlyEarnedAchievements(facts({ 'news.yearClosed': 1 }), new Set())).toContain(
      'first-year',
    );
    expect(newlyEarnedAchievements(facts({ 'news.yearClosed': 9 }), new Set())).not.toContain(
      'ten-years',
    );
    expect(newlyEarnedAchievements(facts({ 'news.yearClosed': 10 }), new Set())).toContain(
      'ten-years',
    );
  });

  it('never offers one that is already held', () => {
    const held = new Set(['first-year']);
    const earned = newlyEarnedAchievements(facts({ 'news.yearClosed': 10 }), held);
    expect(earned).not.toContain('first-year');
    expect(earned).toContain('ten-years');
  });

  it('answers in table order, so several earned at once are awarded in one order', () => {
    const earned = newlyEarnedAchievements(facts({ 'news.yearClosed': 10 }), new Set());
    expect(earned).toEqual(['first-year', 'ten-years']);
  });

  it('reads a goal only when it is ACHIEVED, and reads its medal', () => {
    const open = [goal(GoalStatus.Open, GoalMedal.Gold)];
    expect(newlyEarnedAchievements(facts({}, open), new Set())).toEqual([]);

    const bronze = [goal(GoalStatus.Achieved, GoalMedal.Bronze)];
    const fromBronze = newlyEarnedAchievements(facts({}, bronze), new Set());
    expect(fromBronze).toContain('first-goal');
    expect(fromBronze).not.toContain('silver-goal');
    expect(fromBronze).toContain('every-goal');

    const gold = [goal(GoalStatus.Achieved, GoalMedal.Gold)];
    const fromGold = newlyEarnedAchievements(facts({}, gold), new Set());
    expect(fromGold).toContain('silver-goal');
    expect(fromGold).toContain('gold-goal');
    expect(fromGold).not.toContain('three-goals');
  });

  it('needs every goal for the every-goal achievement, and a world with none has none', () => {
    const mixed = [goal(GoalStatus.Achieved, GoalMedal.Gold), goal(GoalStatus.Failed, 0)];
    expect(newlyEarnedAchievements(facts({}, mixed), new Set())).not.toContain('every-goal');
    // A plain game has no goals, and "all of nothing" is not a victory - the
    // same reading `GameEnd.Won` takes (D-196).
    expect(newlyEarnedAchievements(facts({}, []), new Set())).not.toContain('every-goal');
  });
});

describe('the simulation has never heard of any of this', () => {
  it('does not carry the vocabulary anywhere under src/sim', () => {
    // The plural, the type and the constant - everything this mechanism is
    // made of. The singular lower-case word is deliberately NOT banned: three
    // files under `src/goals` use it as ordinary English about a GOAL being
    // achieved ("tick of the achievement, or -1"), which predates M24 by a
    // milestone and is a different thing entirely.
    const offenders: string[] = [];
    for (const file of sourceFiles(SIM_DIR)) {
      if (/achievements|ACHIEVEMENT|Achievement/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads the news through the delta seam the notification host uses', () => {
    // The host is the only stateful part, and what it must not do is invent a
    // second way of noticing that the log moved (D-182's `newNewsEntries`).
    const host = readFileSync(`${UI_DIR}AchievementHost.tsx`, 'utf8');
    expect(host).toContain('newNewsEntries');
    expect(host).toContain('newlyEarnedAchievements');
    // And it must not reach for the simulation: everything it needs is in the
    // store, put there by the worker.
    expect(host).not.toContain("from '../sim/World'");
  });
});
