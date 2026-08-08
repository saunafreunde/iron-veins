import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import type { GameEndMarker, GoalMarker } from '../../src/shared/protocol';
import { Cargo } from '../../src/sim/cargo/types';
import { GOAL_PROGRESS_SCALE, TICKS_PER_DAY, TICKS_PER_YEAR } from '../../src/sim/constants';
import { goalProgressMilli, goalTarget } from '../../src/sim/goals/evaluate';
import { GoalStore } from '../../src/sim/goals/GoalStore';
import {
  GAME_END_COUNT,
  GameEnd,
  GoalKind,
  GoalMedal,
  GoalStatus,
  GOAL_KIND_COUNT,
  GOAL_MEDAL_COUNT,
  GOAL_STATUS_COUNT,
  type GoalSpec,
} from '../../src/sim/goals/types';
import {
  describeGoal,
  END_BODY_KEYS,
  END_TITLE_KEYS,
  goalFigure,
  goalProgressOf,
  MEDAL_KEYS,
  showsEndScreen,
  STATUS_KEYS,
} from '../../src/ui/goalText';

/**
 * The goal panel and the end screen, driven headless (SPEC2 M17 bundle 4).
 *
 * Everything the two components print goes through the pure functions in
 * `ui/goalText.ts`, which is what lets this file test what a player SEES
 * rather than a re-implementation of it (the `ui/chart.ts` and
 * `ui/replayScrub.ts` pattern). The parts that matter:
 *
 *  - every sentence the panel can reach has a string in BOTH catalogues, and
 *    "every" is enumerated from the goal vocabulary rather than counted by
 *    hand (the D-183 rule for the tool registry);
 *  - the bar reads the simulation's own `goalProgressMilli`;
 *  - the end screen appears for an ending, once.
 */

const CATALOGUES = { de, en } as const;
type Key = keyof typeof de;

function expectTranslated(key: string): void {
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    expect((catalogue as Record<string, string>)[key], `${key} missing in ${locale}`).toBeTruthy();
  }
}

/** A marker with everything defaulted, so a case states only what it means. */
function marker(partial: Partial<GoalMarker> & Pick<GoalMarker, 'kind'>): GoalMarker {
  return {
    subjectA: -1,
    subjectB: -1,
    threshold: 1_000,
    target: 1_000,
    progress: 0,
    status: GoalStatus.Open,
    medal: GoalMedal.None,
    projectedMedal: GoalMedal.Gold,
    thresholdYear: 0,
    goldYear: 1960,
    silverYear: 1968,
    bronzeYear: 1975,
    completedYear: 0,
    townAName: 'Anfangen',
    townBName: 'Endingen',
    ...partial,
  };
}

/** One marker per kind, in both the named and the "any" form. */
const EVERY_FORM: readonly GoalMarker[] = [
  marker({ kind: GoalKind.CompanyValueBy }),
  marker({ kind: GoalKind.CargoDeliveredTotal, subjectA: Cargo.Coal }),
  marker({ kind: GoalKind.CargoDeliveredTotal, subjectA: -1 }),
  marker({ kind: GoalKind.TownPopulationReach, subjectA: 0 }),
  marker({ kind: GoalKind.TownPopulationReach, subjectA: -1 }),
  marker({ kind: GoalKind.ConnectStations, subjectA: 0, subjectB: 1 }),
  marker({ kind: GoalKind.StationRatingHold, subjectA: 0, subjectB: 30, target: 30 }),
  marker({ kind: GoalKind.StationRatingHold, subjectA: -1, subjectB: 30, target: 30 }),
  marker({ kind: GoalKind.SurviveUntil, thresholdYear: 1975 }),
];

function endMarker(reason: number): GameEndMarker {
  const term = { share: 0.5, points: 1_250, measured: 1 };
  return {
    reason,
    year: 1975,
    month: 0,
    day: 0,
    goals: term,
    value: term,
    network: term,
    cargo: term,
    total: 5_000,
    goalCount: 2,
    goalsAchieved: 2,
    medal: GoalMedal.Silver,
  };
}

describe('every sentence the goal panel can reach exists in both languages', () => {
  it('covers every goal kind, in its named and its any form', () => {
    // The enumeration is the point: a seventh descriptor would land in the
    // default branch and this list would stop covering the vocabulary, so the
    // count is asserted rather than assumed.
    expect(GOAL_KIND_COUNT).toBe(6);
    const kinds = new Set(EVERY_FORM.map((goal) => goal.kind));
    expect(kinds.size).toBe(GOAL_KIND_COUNT);

    for (const goal of EVERY_FORM) {
      const phrase = describeGoal(goal);
      expectTranslated(phrase.key);
      // A cargo name is itself a key, and the panel resolves it - so it has to
      // be one the catalogues carry too.
      const cargo = phrase.params['cargo'];
      if (typeof cargo === 'string') expectTranslated(cargo);
    }
  });

  it('covers every figure line, including the two that are not a quotient', () => {
    for (const goal of EVERY_FORM) {
      const figure = goalFigure(goal);
      if (figure !== null) expectTranslated(figure.key);
    }
    // Both sides of the connection answer, not just the one the default hits.
    expectTranslated(goalFigure(marker({ kind: GoalKind.ConnectStations }))!.key);
    expectTranslated(goalFigure(marker({ kind: GoalKind.ConnectStations, progress: 1 }))!.key);
    // A survival goal has no honest running figure - the calendar is the
    // status bar's job.
    expect(goalFigure(marker({ kind: GoalKind.SurviveUntil }))).toBeNull();
  });

  it('covers every medal, status and ending, counted from the enumerations', () => {
    expect(MEDAL_KEYS).toHaveLength(GOAL_MEDAL_COUNT);
    expect(STATUS_KEYS).toHaveLength(GOAL_STATUS_COUNT);
    expect(END_TITLE_KEYS).toHaveLength(GAME_END_COUNT);
    expect(END_BODY_KEYS).toHaveLength(GAME_END_COUNT);
    for (const key of [...MEDAL_KEYS, ...STATUS_KEYS, ...END_TITLE_KEYS, ...END_BODY_KEYS]) {
      expectTranslated(key);
    }
  });

  it('carries the chrome around them', () => {
    const keys: Key[] = [
      'ui.goal.title',
      'ui.goal.bands',
      'ui.goal.projected',
      'ui.goal.earned',
      'ui.goal.score',
      'ui.end.medal',
      'ui.end.score',
      'ui.end.term.goals',
      'ui.end.term.goals.detail',
      'ui.end.term.goals.none',
      'ui.end.term.value',
      'ui.end.term.value.detail',
      'ui.end.term.network',
      'ui.end.term.network.detail',
      'ui.end.term.cargo',
      'ui.end.term.cargo.detail',
      'ui.end.keepLooking',
      'ui.end.toMenu',
    ];
    for (const key of keys) expectTranslated(key);
  });

  it('names the subject rather than printing a blank for "any"', () => {
    const named = describeGoal(marker({ kind: GoalKind.TownPopulationReach, subjectA: 0 }));
    expect(named.params['town']).toBe('Anfangen');
    const any = describeGoal(marker({ kind: GoalKind.TownPopulationReach, subjectA: -1 }));
    expect(any.key).not.toBe(named.key);
    expect(any.params['town']).toBeUndefined();
  });
});

describe('the bar is the simulation’s own progress', () => {
  it('prefers the published block over its own arithmetic', () => {
    const goal = marker({ kind: GoalKind.CompanyValueBy, progress: 250, target: 1_000 });
    expect(goalProgressOf(goal, [617], 0)).toBe(617);
    // ... and falls back only where the block has not been read yet.
    expect(goalProgressOf(goal, [], 0)).toBe(250);
  });

  it('measures a rating hold against its DAYS, in the sim and in the fallback', () => {
    // The defect this bundle found and fixed: `goalProgressMilli` divided
    // progress by the THRESHOLD for every kind, and a rating hold's progress
    // is a run of days while its threshold is a rating. "Hold 60 for 30 days"
    // read as one sixth done on the day it was met.
    const spec: GoalSpec = {
      kind: GoalKind.StationRatingHold,
      subjectA: -1,
      subjectB: 30,
      threshold: 60,
      goldTick: TICKS_PER_YEAR,
      silverTick: 2 * TICKS_PER_YEAR,
      bronzeTick: 3 * TICKS_PER_YEAR,
    };
    const store = new GoalStore();
    store.add(spec);
    expect(goalTarget(store, 0)).toBe(30);

    store.progress[0] = 15;
    store.holdDays[0] = 15;
    expect(goalProgressMilli(store, 0)).toBe(GOAL_PROGRESS_SCALE / 2);

    const fallback = marker({ kind: GoalKind.StationRatingHold, progress: 15, target: 30 });
    expect(goalProgressOf(fallback, [], 0)).toBe(500);
  });

  it('clamps rather than drawing a negative or an overfull bar', () => {
    const behind = marker({ kind: GoalKind.CompanyValueBy, progress: -5_000, target: 1_000 });
    expect(goalProgressOf(behind, [], 0)).toBe(0);
    const past = marker({ kind: GoalKind.CompanyValueBy, progress: 9_000, target: 1_000 });
    expect(goalProgressOf(past, [], 0)).toBe(1_000);
  });

  it('draws an achieved goal full even when its target moved out of reach', () => {
    const won = marker({
      kind: GoalKind.CompanyValueBy,
      progress: 0,
      target: 1_000,
      status: GoalStatus.Achieved,
    });
    expect(goalProgressOf(won, [], 0)).toBe(1_000);
  });
});

describe('the end screen appears once, for an ending, and never over a replay', () => {
  it('stays away while the game is running', () => {
    expect(showsEndScreen(endMarker(GameEnd.Running), null, false)).toBe(false);
    expect(showsEndScreen(null, null, false)).toBe(false);
  });

  it('shows for each of the four endings', () => {
    for (const reason of [GameEnd.Won, GameEnd.Bankrupt, GameEnd.Lost, GameEnd.Century]) {
      expect(showsEndScreen(endMarker(reason), null, false), `reason ${reason}`).toBe(true);
    }
  });

  it('stays dismissed by REASON, so the daily marker cannot bring it back', () => {
    // The marker is re-sent every game day with a fresh date; a dismissal
    // keyed to a tick would last exactly one day.
    expect(showsEndScreen(endMarker(GameEnd.Bankrupt), GameEnd.Bankrupt, false)).toBe(false);
    // A DIFFERENT ending still gets its screen: dismissing the bankruptcy of
    // one game must not silence the victory of the next.
    expect(showsEndScreen(endMarker(GameEnd.Won), GameEnd.Bankrupt, false)).toBe(true);
  });

  it('never interrupts a recording', () => {
    // The screen offers to start and load games, and a replay is somebody
    // else's game to begin with (D-189).
    expect(showsEndScreen(endMarker(GameEnd.Won), null, true)).toBe(false);
  });
});

describe('the progress fallback and the day boundary', () => {
  it('has one entry per goal, in slot order', () => {
    const goals = [
      marker({ kind: GoalKind.CompanyValueBy, progress: 100, target: 1_000 }),
      marker({ kind: GoalKind.CompanyValueBy, progress: 900, target: 1_000 }),
    ];
    const live = [111, 999];
    expect(goals.map((goal, at) => goalProgressOf(goal, live, at))).toEqual(live);
  });

  it('is a day’s worth of resolution and no more, which is what the hook gives', () => {
    // The goal machine decides once a game day (D-193), so nothing here has to
    // be finer than that - and the marker cadence in SimWorker is exactly it.
    expect(TICKS_PER_DAY).toBe(200);
  });
});
