import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { DEFAULT_SPEED_INDEX } from '../../src/sim/constants';
import { VehicleKind } from '../../src/sim/vehicles/spec';
import { useSimStore, type SimUiState } from '../../src/ui/store';
import { LESSONS, type CommandCounts, type LessonStep } from '../../src/ui/tutorial';

/**
 * The tutorial's predicates, executed (M26).
 *
 * Not one of this project's tests had ever CALLED a `done()`, which is exactly
 * how `ui.tutorial.signals.step1` came to count road vehicles for a lesson
 * about trains: the step compiled, the panel rendered its sentence, and the box
 * simply never ticked. A predicate is a pure function of the store plus the
 * command counts, so there is nothing to stop it being run - and this file runs
 * every one of them, twice: once against a world where the thing has not been
 * done and once against a world where it has.
 *
 * The store's own initial state is the "nothing done yet" fixture, taken from
 * `useSimStore` rather than hand-written: a field that gains a meaning later
 * arrives here with the value the application really starts on.
 */

/** The state a fresh game starts on, as the store itself defines it. */
function freshState(): SimUiState {
  return useSimStore.getState();
}

function withState(patch: Partial<SimUiState>): SimUiState {
  return { ...freshState(), ...patch } as SimUiState;
}

const NO_COMMANDS: CommandCounts = {};

function counted(kind: number, times = 1): CommandCounts {
  return { [kind]: times };
}

/** A vehicle marker with only the fields a lesson looks at. */
function vehicle(patch: Partial<{ kind: number; earnedCt: number; waitingTicks: number }>) {
  return {
    id: 1,
    specId: 0,
    kind: VehicleKind.Road,
    state: 0,
    cargoUnits: 0,
    capacity: 0,
    earnedCt: 0,
    lineId: -1,
    tileIndex: 0,
    x: 0,
    y: 0,
    heightPx: 0,
    speedMs: 0,
    waitingTicks: 0,
    blockedTile: -1,
    consist: [],
    ...patch,
  } as unknown as SimUiState['fleet'][number];
}

/**
 * Every step, with the world that satisfies it.
 *
 * The list is checked against `LESSONS` in both directions below, so a lesson
 * that grows a step without a case here is a red build rather than a step
 * nobody ever ran (the D-133/D-183 shape).
 */
const SATISFIED: Readonly<Record<string, { state?: Partial<SimUiState>; counts?: CommandCounts }>> =
  {
    // basics
    'ui.tutorial.basics.step1': { state: { speedIndex: DEFAULT_SPEED_INDEX + 1 } },
    'ui.tutorial.basics.step2': { counts: counted(CommandKind.BuildRoad) },
    'ui.tutorial.basics.step3': {
      state: { stations: [{ id: 1 }, { id: 2 }] as unknown as SimUiState['stations'] },
    },
    'ui.tutorial.basics.step4': { counts: counted(CommandKind.BuyRoadVehicle) },
    'ui.tutorial.basics.step5': { state: { fleet: [vehicle({ earnedCt: 500 })] } },
    // rail
    'ui.tutorial.rail.step1': { counts: counted(CommandKind.BuildTrack) },
    'ui.tutorial.rail.step2': { counts: counted(CommandKind.BuildRailStop, 2) },
    'ui.tutorial.rail.step3': { counts: counted(CommandKind.BuyTrain) },
    'ui.tutorial.rail.step4': { counts: counted(CommandKind.SetVehicleOrders) },
    'ui.tutorial.rail.step5': { counts: counted(CommandKind.SetVehicleRunning) },
    // signals
    'ui.tutorial.signals.step1': {
      state: { fleet: [vehicle({ kind: VehicleKind.Train }), vehicle({ kind: VehicleKind.Train })] },
    },
    'ui.tutorial.signals.step2': { counts: counted(CommandKind.BuildSignal, 2) },
    'ui.tutorial.signals.step3': { state: { showDebug: true } },
    // step4 is satisfied by the empty fleet of a fresh state and is asserted
    // on its own below, because "no vehicle is waiting" is true before the
    // lesson starts - a floor the tutorial has always had.
    // chain
    'ui.tutorial.chain.step1': {
      state: { stations: [{ waiting: 4 }] as unknown as SimUiState['stations'] },
    },
    'ui.tutorial.chain.step2': {
      state: { industries: [{ service: 50 }] as unknown as SimUiState['industries'] },
    },
    'ui.tutorial.chain.step3': {
      state: { industries: [{ level: 140 }] as unknown as SimUiState['industries'] },
    },
    'ui.tutorial.chain.step4': { counts: counted(CommandKind.BuildStationModule) },
    // transfer
    'ui.tutorial.transfer.step1': {
      state: {
        stations: [{ modules: [{}, {}] }] as unknown as SimUiState['stations'],
      },
    },
    'ui.tutorial.transfer.step2': { counts: counted(CommandKind.RefitVehicle) },
    'ui.tutorial.transfer.step3': {
      state: { fleet: [vehicle({}), vehicle({}), vehicle({})] },
    },
    'ui.tutorial.transfer.step4': {
      state: { finances: { year: [0, 1200] } as unknown as SimUiState['finances'] },
    },
  };

/** Steps that a fresh, untouched world already satisfies, with the reason. */
const TRUE_AT_START: Readonly<Record<string, string>> = {
  'ui.tutorial.signals.step4':
    'no vehicle is waiting when there are no vehicles - the lesson asks the player to make a jam go away',
};

const ALL_STEPS: readonly (LessonStep & { lesson: string })[] = LESSONS.flatMap((lesson) =>
  lesson.steps.map((step) => ({ ...step, lesson: lesson.id })),
);

describe('the tutorial predicates', () => {
  it('has the five lessons of section 17.5 and twenty-two steps', () => {
    expect(LESSONS.length).toBe(5);
    expect(ALL_STEPS.length).toBe(22);
  });

  it('runs every step against a world where it is not done yet', () => {
    const fresh = freshState();
    for (const step of ALL_STEPS) {
      const reason = TRUE_AT_START[step.textKey];
      const answer = step.done(fresh, NO_COMMANDS);
      if (reason !== undefined) {
        expect(answer, `${step.textKey} should be true at start (${reason})`).toBe(true);
        continue;
      }
      expect(answer, `${step.textKey} is already ticked on a fresh world`).toBe(false);
    }
  });

  it('runs every step against a world where it IS done', () => {
    for (const step of ALL_STEPS) {
      if (TRUE_AT_START[step.textKey] !== undefined) continue;
      const fixture = SATISFIED[step.textKey];
      expect(fixture, `no fixture for ${step.textKey}`).toBeDefined();
      const state = withState(fixture?.state ?? {});
      expect(step.done(state, fixture?.counts ?? NO_COMMANDS), `${step.textKey} did not tick`).toBe(
        true,
      );
    }
  });

  /** The fixture table and the lessons, held against each other both ways. */
  it('has a fixture for every step and no fixture for a step that is gone', () => {
    const keys = new Set(ALL_STEPS.map((step) => step.textKey));
    const covered = new Set([...Object.keys(SATISFIED), ...Object.keys(TRUE_AT_START)]);
    expect([...keys].filter((key) => !covered.has(key))).toEqual([]);
    expect([...covered].filter((key) => !keys.has(key))).toEqual([]);
  });

  /**
   * The first step of the first lesson, against the speed a game really opens
   * on (M26).
   *
   * The store's own default is 0, so "not ticked on a fresh state" is true for
   * `> 0` as well and would not have noticed. What a player actually sees is
   * `DEFAULT_SPEED_INDEX`, and a first step that is already done at that speed
   * is a lesson telling somebody to do what the game did for them.
   */
  it('does not tick the first step at the speed a game opens on', () => {
    const step = ALL_STEPS.find((entry) => entry.textKey === 'ui.tutorial.basics.step1');
    expect(step).toBeDefined();
    expect(step!.done(withState({ speedIndex: DEFAULT_SPEED_INDEX }), NO_COMMANDS)).toBe(false);
    expect(step!.done(withState({ speedIndex: DEFAULT_SPEED_INDEX + 1 }), NO_COMMANDS)).toBe(true);
  });

  /**
   * The defect this file was written for, pinned from the other side: the
   * signal lesson asks for two TRAINS, so two road vehicles must not tick it.
   */
  it('does not tick the signal lesson for two road vehicles', () => {
    const step = ALL_STEPS.find((entry) => entry.textKey === 'ui.tutorial.signals.step1');
    expect(step).toBeDefined();
    const buses = withState({
      fleet: [vehicle({ kind: VehicleKind.Road }), vehicle({ kind: VehicleKind.Road })],
    });
    expect(step!.done(buses, NO_COMMANDS)).toBe(false);
    const trains = withState({
      fleet: [vehicle({ kind: VehicleKind.Train }), vehicle({ kind: VehicleKind.Train })],
    });
    expect(step!.done(trains, NO_COMMANDS)).toBe(true);
  });

  /** Every step names a text key that exists in both catalogues. */
  it('names a translated sentence for every step', async () => {
    const de = (await import('../../src/i18n/de.json')).default as Record<string, string>;
    const en = (await import('../../src/i18n/en.json')).default as Record<string, string>;
    for (const lesson of LESSONS) {
      for (const key of [lesson.titleKey, lesson.introKey]) {
        expect(de[key], `de is missing ${key}`).toBeTruthy();
        expect(en[key], `en is missing ${key}`).toBeTruthy();
      }
      for (const step of lesson.steps) {
        expect(de[step.textKey], `de is missing ${step.textKey}`).toBeTruthy();
        expect(en[step.textKey], `en is missing ${step.textKey}`).toBeTruthy();
      }
    }
  });
});
