import type { GoalMarker, NewsMarker } from '../shared/protocol';
import { GoalMedal, GoalStatus } from '../sim/goals/types';

/**
 * The achievements of SPEC2 M24: about forty of them, as DATA, triggered by
 * exactly two things - an entry in the news log of section 15, and a goal of
 * the M17 goal machine being achieved.
 *
 * **Zero simulation involvement, and it is grep-provable rather than promised**
 * (`tests/unit/achievements.spec.ts` walks `src/sim` and fails on the word).
 * The simulation has no idea any of this exists: it posts the news it has
 * posted since M8 and decides the medals it has decided since M17, and this
 * file READS those two outputs on the main thread. That is not tidiness -
 * an achievement that the simulation could see would be a saved, hashed,
 * replayed thing, and a player's unlocked list would then change the world.
 * The list lives in `profile.json` (outside the save and outside the hash), and
 * a world plays exactly the same whether it is a player's first game or their
 * hundredth.
 *
 * **Two consequences of that decision, stated rather than discovered:**
 *
 *  - an achievement is earned WITHIN one game. The tally below counts the news
 *    a world has produced - seeded from the log it was loaded with, extended by
 *    the delta as the game runs - and a new world starts it again. What is kept
 *    for ever is that the achievement was earned, which is what the player is
 *    collecting;
 *  - a count can therefore only be as high as one game's log plus one session's
 *    play. Every threshold here is chosen inside that: the largest is ten, and
 *    the news log holds two hundred entries.
 */

/** What has to happen for an achievement to be earned. */
export type AchievementTrigger =
  /** `count` entries carrying this news key have been seen in this world. */
  | { readonly kind: 'news'; readonly messageKey: string; readonly count: number }
  /** `count` goals have been achieved at `medal` or better (M17). */
  | { readonly kind: 'goal'; readonly medal: number; readonly count: number }
  /** Every goal of the running scenario has been achieved, and there is one. */
  | { readonly kind: 'allGoals' };

export interface Achievement {
  /** Stable id; it is what `profile.json` keeps and it never changes. */
  readonly id: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly trigger: AchievementTrigger;
}

function news(id: string, messageKey: string, count: number): Achievement {
  return {
    id,
    titleKey: `achievement.${id}`,
    descriptionKey: `achievement.${id}.hint`,
    trigger: { kind: 'news', messageKey, count },
  };
}

function goal(id: string, medal: number, count: number): Achievement {
  return {
    id,
    titleKey: `achievement.${id}`,
    descriptionKey: `achievement.${id}.hint`,
    trigger: { kind: 'goal', medal, count },
  };
}

/**
 * The table. Order is the order the panel lists them in and the order they are
 * awarded in when several come due in the same moment, so it is a total order
 * and nothing here sorts.
 *
 * Every `news` entry names a key the simulation really posts - the audit holds
 * the table against the message keys found under `src/sim`, in both directions,
 * so an achievement nobody can ever earn is a red build (the D-118/D-169
 * shape) and a key with no achievement is merely allowed.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  // --- the calendar and the books
  news('first-year', 'news.yearClosed', 1),
  news('ten-years', 'news.yearClosed', 10),
  news('red-ink', 'news.inDebt', 1),
  news('wound-up', 'news.bankrupt', 1),
  news('carbon-levy', 'news.carbonLevy', 1),
  // --- the boards of M21
  news('first-contract', 'news.contractWon', 1),
  news('contract-run', 'news.contractWon', 5),
  news('contract-missed', 'news.contractFailed', 1),
  news('first-subsidy', 'news.subsidyWon', 1),
  news('subsidy-run', 'news.subsidyWon', 3),
  news('supply-breach', 'news.supplyBreach', 1),
  // --- the industry clock of 7.3
  news('new-works', 'news.industryOpened', 1),
  news('industrial-age', 'news.industryOpened', 10),
  news('works-lost', 'news.industryClosed', 1),
  news('neglect-warning', 'news.industryNeglected', 1),
  news('record-harvest', 'news.recordHarvest', 1),
  news('strike', 'news.strike', 1),
  // --- the fleet
  news('first-obsolete', 'news.vehicleObsolete', 1),
  news('first-renewal', 'news.vehicleRenewed', 1),
  news('renewal-run', 'news.vehicleRenewed', 10),
  // --- the network, and what goes wrong on it
  news('stuck-train', 'news.trainStuck', 1),
  news('bottleneck', 'news.bottleneck', 1),
  news('deadlock', 'news.deadlockCycle', 1),
  news('deadlock-again', 'news.deadlockCycle', 3),
  // --- towns and their councils
  news('town-milestone', 'news.townMilestone', 1),
  news('town-boom', 'news.townMilestone', 5),
  news('election', 'news.election', 1),
  news('exclusive-rights', 'news.exclusiveRights', 1),
  news('council-refuses', 'news.councilRefuses', 1),
  // --- the sky
  news('storm', 'news.stormWarning', 1),
  news('storm-season', 'news.stormWarning', 10),
  // --- the opposition (SPEC2 M24's own news lines)
  news('rival-line', 'news.aiLineOpened', 1),
  news('rival-retreat', 'news.aiLineClosed', 1),
  news('rival-ruin', 'news.aiBankrupt', 1),
  news('league-move', 'news.leagueMove', 1),
  // --- the goal machine of M17
  goal('first-goal', GoalMedal.Bronze, 1),
  goal('three-goals', GoalMedal.Bronze, 3),
  goal('silver-goal', GoalMedal.Silver, 1),
  goal('gold-goal', GoalMedal.Gold, 1),
  goal('three-golds', GoalMedal.Gold, 3),
  {
    id: 'every-goal',
    titleKey: 'achievement.every-goal',
    descriptionKey: 'achievement.every-goal.hint',
    trigger: { kind: 'allGoals' },
  },
];

/** What the evaluator is allowed to know. Two outputs, nothing else. */
export interface AchievementFacts {
  /** News key to how many entries carrying it this world has produced. */
  readonly newsCounts: ReadonlyMap<string, number>;
  /** The goal markers of the running world, exactly as the store holds them. */
  readonly goals: readonly GoalMarker[];
}

/**
 * Add news entries to a tally.
 *
 * Called once with the whole log the world arrived with, and then with each
 * delta (`newNewsEntries`), which is the same seam the notification host of
 * D-182 consumes. Mutates the map it is given: the tally belongs to one world
 * and is thrown away with it.
 */
export function countNews(tally: Map<string, number>, entries: readonly NewsMarker[]): void {
  for (const entry of entries) {
    tally.set(entry.messageKey, (tally.get(entry.messageKey) ?? 0) + 1);
  }
}

/** Whether one trigger is satisfied by what the world has produced. */
function isEarned(trigger: AchievementTrigger, facts: AchievementFacts): boolean {
  if (trigger.kind === 'news') {
    return (facts.newsCounts.get(trigger.messageKey) ?? 0) >= trigger.count;
  }
  if (trigger.kind === 'goal') {
    let count = 0;
    for (const marker of facts.goals) {
      if (marker.status === GoalStatus.Achieved && marker.medal >= trigger.medal) count++;
    }
    return count >= trigger.count;
  }
  // Every goal achieved, and a world with no goals has not achieved them all -
  // that is the same reading the end screen takes of `GameEnd.Won` (D-196).
  if (facts.goals.length === 0) return false;
  return facts.goals.every((marker) => marker.status === GoalStatus.Achieved);
}

/**
 * Which achievements are earned now and were not held before, in table order.
 *
 * A pure function of the two outputs and the set already held, so the whole
 * mechanism can be driven headless - the component around it only decides WHEN
 * to ask.
 */
export function newlyEarnedAchievements(
  facts: AchievementFacts,
  held: ReadonlySet<string>,
): string[] {
  const earned: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (held.has(achievement.id)) continue;
    if (isEarned(achievement.trigger, facts)) earned.push(achievement.id);
  }
  return earned;
}
