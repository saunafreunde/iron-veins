import { CARGO_COUNT } from '../cargo/types';
import { GOAL_PROGRESS_SCALE } from '../constants';
import { companyValueCt } from '../economy/ledger';
import { stationRating } from '../station/types';
import type { CompanyState } from '../types';
import type { World } from '../World';
import { medalFor, type GoalStore } from './GoalStore';
import { GoalKind, GoalMedal, GoalStatus } from './types';

/**
 * Decide every open goal, once per game day.
 *
 * Called from the daily block of `World.step` and from nowhere else. That is
 * the departure from D-113 the milestone exists to make: the tutorial's
 * predicates run in the interface and may never write, while these run in the
 * simulation and write their verdict into hashed state - which is what makes a
 * medal survive a save, replay bit-identically and be provable with M16's
 * verifier (see goals/types.ts for the full argument).
 *
 * Allocation-free from top to bottom, because the daily hook is inside
 * `step()` and law #7 covers everything below it: indexed loops only (a
 * `for...of` over an array allocates an iterator), no object literals, no
 * closures, and deliberately no `world.date` - the calendar getter builds a
 * `GameDate`, so every deadline here is a TICK instead. The only allocation
 * the goal machine ever performs is the one in `GoalStore`'s constructor.
 *
 * An achieved or failed goal is final and is skipped from then on, so a
 * fifty-year game pays for a decided goal exactly once.
 */
export function updateGoals(world: World): void {
  const goals = world.goals;
  if (goals.count === 0) return;

  const tick = world.tick;
  const player = world.companies[world.playerCompanyId]!;

  for (let at = 0; at < goals.count; at++) {
    if (goals.status[at] !== GoalStatus.Open) continue;

    let met = false;
    let failedEarly = false;

    switch (goals.kind[at]) {
      case GoalKind.CompanyValueBy: {
        const value = companyValueCt(player);
        goals.progress[at] = value;
        met = value >= goals.threshold[at]!;
        break;
      }
      case GoalKind.CargoDeliveredTotal: {
        const units = deliveredUnits(player, goals.subjectA[at]!);
        goals.progress[at] = units;
        met = units >= goals.threshold[at]!;
        break;
      }
      case GoalKind.TownPopulationReach: {
        const population = bestPopulation(world, goals.subjectA[at]!);
        goals.progress[at] = population;
        met = population >= goals.threshold[at]!;
        break;
      }
      case GoalKind.ConnectStations: {
        const connected = townsConnected(world, goals.subjectA[at]!, goals.subjectB[at]!);
        goals.progress[at] = connected ? 1 : 0;
        met = connected;
        break;
      }
      case GoalKind.StationRatingHold: {
        // The streak is a historical input to a simulation decision and is
        // therefore saved state, not something recomputed on load (Z4).
        const rating = bestRating(world, player.id, goals.subjectA[at]!, tick);
        const held = rating >= goals.threshold[at]! ? goals.holdDays[at]! + 1 : 0;
        goals.holdDays[at] = held;
        goals.progress[at] = held;
        met = held >= goals.subjectB[at]!;
        break;
      }
      case GoalKind.SurviveUntil: {
        goals.progress[at] = tick;
        // A wound-up company cannot survive to a later date, so the goal is
        // decided the day it happens rather than at the deadline.
        if (player.bankrupt) failedEarly = true;
        else met = tick >= goals.threshold[at]!;
        break;
      }
      default:
        break;
    }

    if (met) {
      goals.status[at] = GoalStatus.Achieved;
      goals.completedTick[at] = tick;
      goals.medal[at] = medalFor(goals, at, tick);
      continue;
    }
    // The deadline is judged on the day boundary that follows it: the hook
    // runs once a game day, and a goal missed by half a day is missed.
    if (failedEarly || tick > goals.bronzeTick[at]!) {
      goals.status[at] = GoalStatus.Failed;
      goals.medal[at] = GoalMedal.None;
      goals.completedTick[at] = -1;
    }
  }
}

/** Lifetime units delivered, for one cargo or for all of them. */
function deliveredUnits(company: CompanyState, cargo: number): number {
  if (cargo >= 0) return company.cargoDeliveredUnits[cargo] ?? 0;
  let total = 0;
  for (let c = 0; c < CARGO_COUNT; c++) total += company.cargoDeliveredUnits[c]!;
  return total;
}

/** Population of one town, or of the largest town when `townId` is -1. */
function bestPopulation(world: World, townId: number): number {
  if (townId >= 0) {
    const town = world.towns[townId];
    return town === undefined ? 0 : town.population;
  }
  let best = 0;
  for (let i = 0; i < world.towns.length; i++) {
    const population = world.towns[i]!.population;
    if (population > best) best = population;
  }
  return best;
}

/**
 * Whether cargo can travel from a station of the player's in `fromTown` to one
 * in `toTown`, asked of the connection table of section 7.4 - the same table
 * that decides what a parcel is allowed to board (D-075).
 *
 * The table is rebuilt at the head of the same daily block by
 * `refreshCargoRouting`, so what a goal reads is this day's network rather
 * than yesterday's.
 */
function townsConnected(world: World, fromTown: number, toTown: number): boolean {
  const stations = world.stations;
  const player = world.playerCompanyId;
  for (let i = 0; i < stations.length; i++) {
    const from = stations[i]!;
    if (from.ownerId !== player || from.townId !== fromTown) continue;
    for (let j = 0; j < stations.length; j++) {
      const to = stations[j]!;
      if (to.ownerId !== player || to.townId !== toTown) continue;
      if (from.id === to.id) continue;
      if (world.cargoLinks.expectedTicks(from.id, to.id) < Infinity) return true;
    }
  }
  return false;
}

/**
 * The best rating among the player's stations in `townId`, or among all of
 * them when it is -1.
 *
 * The network's best stop rather than one named station: a goal authored
 * before any station exists cannot name one, and "keep at least one stop at
 * this standard" is what the sentence means. Zero stations rates zero, so an
 * empty network can never satisfy the hold by default.
 */
function bestRating(world: World, ownerId: number, townId: number, tick: number): number {
  const stations = world.stations;
  let best = 0;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    if (station.ownerId !== ownerId) continue;
    if (townId >= 0 && station.townId !== townId) continue;
    const rating = stationRating(station, tick);
    if (rating > best) best = rating;
  }
  return best;
}

/**
 * Progress towards the threshold in thousandths, clamped to 0..1000 - the
 * figure the snapshot carries and the panel draws.
 *
 * A pure function of the store, so the block writer, the tests and any later
 * panel all read one definition.
 */
export function goalProgressMilli(store: GoalStore, at: number): number {
  if (store.status[at] === GoalStatus.Achieved) return GOAL_PROGRESS_SCALE;
  const threshold = store.threshold[at]!;
  if (threshold <= 0) return 0;
  const milli = Math.round((store.progress[at]! / threshold) * GOAL_PROGRESS_SCALE);
  if (milli < 0) return 0;
  return milli > GOAL_PROGRESS_SCALE ? GOAL_PROGRESS_SCALE : milli;
}
