import { CommandKind } from '../sim/commands/types';
import { DEFAULT_SPEED_INDEX } from '../sim/constants';
// From `spec.ts` rather than from the catalogue: it is the import-free leaf
// that owns the enum, and a lesson needs the four numbers, not the tables
// (the D-191 rule about what a panel drags into the main chunk).
import { VehicleKind } from '../sim/vehicles/spec';
import type { SimUiState } from './store';

/**
 * The five lessons of section 17.5.
 *
 * A lesson is a list of steps, and a step is a sentence plus a PREDICATE over
 * the state the interface already has. That is the whole mechanism, and the
 * important half of it is what it refuses to be: a lesson never builds
 * anything, never moves the camera and never touches the simulation. It
 * watches. A tutorial that plays itself teaches nobody, and a tutorial that
 * writes into the world would be a second author of state alongside the
 * command queue, which architecture law #6 does not allow.
 *
 * Two things a step can watch:
 *  - the store, which carries the fleet, the stations, the money and the date;
 *  - the commands the player has issued, counted by kind.
 *
 * Between them they cover every goal the section names without inventing a
 * single new signal.
 */

/** How many of each command kind the player has issued this lesson. */
export type CommandCounts = Readonly<Record<number, number>>;

export interface LessonStep {
  /** What to do, as a translation key. */
  readonly textKey: string;
  /** True once the player has done it. */
  readonly done: (state: SimUiState, counts: CommandCounts) => boolean;
}

export interface Lesson {
  readonly id: string;
  readonly titleKey: string;
  readonly introKey: string;
  readonly steps: readonly LessonStep[];
}

function used(counts: CommandCounts, kind: number, atLeast = 1): boolean {
  return (counts[kind] ?? 0) >= atLeast;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'basics',
    titleKey: 'ui.tutorial.basics.title',
    introKey: 'ui.tutorial.basics.intro',
    steps: [
      {
        textKey: 'ui.tutorial.basics.step1',
        // The world RUNS from the first tick since M26, so "start the clock"
        // was a step that ticked itself off before the lesson opened. What is
        // worth teaching instead is the same control one step further: the
        // speed keys, which are how a player waits out a payback period.
        done: (state) => state.speedIndex > DEFAULT_SPEED_INDEX,
      },
      {
        textKey: 'ui.tutorial.basics.step2',
        done: (_state, counts) => used(counts, CommandKind.BuildRoad),
      },
      {
        textKey: 'ui.tutorial.basics.step3',
        done: (state) => state.stations.length >= 2,
      },
      {
        textKey: 'ui.tutorial.basics.step4',
        done: (_state, counts) => used(counts, CommandKind.BuyRoadVehicle),
      },
      {
        textKey: 'ui.tutorial.basics.step5',
        done: (state) => state.fleet.some((vehicle) => vehicle.earnedCt > 0),
      },
    ],
  },
  {
    id: 'rail',
    titleKey: 'ui.tutorial.rail.title',
    introKey: 'ui.tutorial.rail.intro',
    steps: [
      {
        textKey: 'ui.tutorial.rail.step1',
        done: (_state, counts) => used(counts, CommandKind.BuildTrack),
      },
      {
        textKey: 'ui.tutorial.rail.step2',
        done: (_state, counts) => used(counts, CommandKind.BuildRailStop, 2),
      },
      {
        textKey: 'ui.tutorial.rail.step3',
        done: (_state, counts) => used(counts, CommandKind.BuyTrain),
      },
      {
        textKey: 'ui.tutorial.rail.step4',
        done: (_state, counts) => used(counts, CommandKind.SetVehicleOrders),
      },
      {
        textKey: 'ui.tutorial.rail.step5',
        done: (_state, counts) => used(counts, CommandKind.SetVehicleRunning),
      },
    ],
  },
  {
    id: 'signals',
    titleKey: 'ui.tutorial.signals.title',
    introKey: 'ui.tutorial.signals.intro',
    steps: [
      {
        textKey: 'ui.tutorial.signals.step1',
        // TRAINS, which is what the step asks for in both languages ("buy a
        // second train for the same line"). It read `kind === 1` - a magic
        // literal, and the wrong one: 1 is Road and Train is 0 - so two buses
        // ticked the signal lesson off and two trains never did (M26). No
        // test had ever run a lesson predicate; `tests/unit/tutorial.spec.ts`
        // now runs all of them.
        done: (state) =>
          state.fleet.filter((vehicle) => vehicle.kind === VehicleKind.Train).length >= 2,
      },
      {
        textKey: 'ui.tutorial.signals.step2',
        done: (_state, counts) => used(counts, CommandKind.BuildSignal, 2),
      },
      {
        textKey: 'ui.tutorial.signals.step3',
        done: (state) => state.showDebug,
      },
      {
        textKey: 'ui.tutorial.signals.step4',
        done: (state) => !state.fleet.some((vehicle) => vehicle.waitingTicks > 0),
      },
    ],
  },
  {
    id: 'chain',
    titleKey: 'ui.tutorial.chain.title',
    introKey: 'ui.tutorial.chain.intro',
    steps: [
      {
        textKey: 'ui.tutorial.chain.step1',
        done: (state) => state.stations.some((station) => station.waiting > 0),
      },
      {
        textKey: 'ui.tutorial.chain.step2',
        done: (state) => state.industries.some((industry) => industry.service > 0),
      },
      {
        textKey: 'ui.tutorial.chain.step3',
        done: (state) => state.industries.some((industry) => industry.level > 100),
      },
      {
        textKey: 'ui.tutorial.chain.step4',
        done: (_state, counts) => used(counts, CommandKind.BuildStationModule),
      },
    ],
  },
  {
    id: 'transfer',
    titleKey: 'ui.tutorial.transfer.title',
    introKey: 'ui.tutorial.transfer.intro',
    steps: [
      {
        textKey: 'ui.tutorial.transfer.step1',
        done: (state) => state.stations.some((station) => station.modules.length >= 2),
      },
      {
        textKey: 'ui.tutorial.transfer.step2',
        done: (_state, counts) => used(counts, CommandKind.RefitVehicle),
      },
      {
        textKey: 'ui.tutorial.transfer.step3',
        done: (state) => state.fleet.length >= 3,
      },
      {
        textKey: 'ui.tutorial.transfer.step4',
        done: (state) => (state.finances?.year[1] ?? 0) > 0,
      },
    ],
  },
];
