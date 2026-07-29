import { bookExpense } from '../economy/company';
import {
  COUNCIL_EXCLUSIVE_MIN_RATING,
  TOWN_MEASURE_COOLDOWN_TICKS,
  TOWN_MEASURE_COST_CT,
  TOWN_MEASURE_GOODWILL,
} from '../constants';
import { ACCEPTED, RejectReason, type CommandOutcome } from '../commands/types';
import {
  addGoodwill,
  councilRating,
  exclusiveRightsCostCt,
  fundRoads,
  grantExclusiveRights,
  plantTrees,
  TOWN_MEASURE_COUNT,
  TownMeasure,
} from './council';
import type { World } from '../World';

/**
 * The two things a company can do ABOUT a council rather than to it: buy the
 * exclusive building rights of section 13.3, and pay for one of the measures.
 *
 * They live beside the council rather than in `commands/build.ts` because
 * neither of them builds anything; what they change is a town's opinion.
 */

function reject(reasonKey: string): CommandOutcome {
  return { ok: false, reasonKey };
}

/** Twelve months during which no competitor may build in this town. */
export function buyExclusiveRights(world: World, townId: number): CommandOutcome {
  const town = world.towns[townId];
  if (town === undefined) return reject(RejectReason.NoSuchTown);

  const company = world.company;
  if (town.exclusiveCompanyId >= 0 && world.tick < town.exclusiveUntilTick) {
    // Including when the buyer already holds them: rights do not stack, and
    // charging twice for the same twelve months would be a trap.
    return reject(RejectReason.RightsTaken);
  }
  if (councilRating(town, company.id) < COUNCIL_EXCLUSIVE_MIN_RATING) {
    return reject(RejectReason.RatingTooLow);
  }

  const chargeCt = exclusiveRightsCostCt(world, town);
  if (chargeCt > company.cashCt) return reject(RejectReason.InsufficientFunds);

  bookExpense(company, chargeCt);
  grantExclusiveRights(world, town, company.id);
  return ACCEPTED;
}

/**
 * Pay for trees, streets or a campaign.
 *
 * Each measure has a price, an effect and a cooldown, and the cooldown is per
 * company AND per measure: a company that has just run the big campaign can
 * still plant trees, and one town's campaign says nothing about the next.
 */
export function applyTownMeasure(
  world: World,
  townId: number,
  measure: TownMeasure,
): CommandOutcome {
  const town = world.towns[townId];
  if (town === undefined) return reject(RejectReason.NoSuchTown);
  if (!Number.isInteger(measure) || measure < 0 || measure >= TOWN_MEASURE_COUNT) {
    return reject(RejectReason.UnknownMeasure);
  }

  const company = world.company;
  const slot = company.id * TOWN_MEASURE_COUNT + measure;
  if (world.tick < (town.measureReadyTick[slot] ?? 0)) {
    return reject(RejectReason.MeasureNotReady);
  }

  const chargeCt = world.costCt(TOWN_MEASURE_COST_CT[measure]!);
  if (chargeCt > company.cashCt) return reject(RejectReason.InsufficientFunds);

  // Trees and streets can find nowhere to go - a town packed to its radius has
  // no bare ground left. Nothing is charged for nothing.
  if (measure === TownMeasure.PlantTrees && plantTrees(world, town) === 0) {
    return reject(RejectReason.NothingToDo);
  }
  if (measure === TownMeasure.FundRoads && fundRoads(world, town) === 0) {
    return reject(RejectReason.NothingToDo);
  }

  bookExpense(company, chargeCt);
  addGoodwill(town, company.id, TOWN_MEASURE_GOODWILL[measure]!);
  town.measureReadyTick[slot] = world.tick + TOWN_MEASURE_COOLDOWN_TICKS[measure]!;
  return ACCEPTED;
}
