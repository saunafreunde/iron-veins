import { bookExpense } from './company';
import { Account } from './ledger';
import { ENERGY_COST_CT_PER_MJ, JOULES_PER_MJ } from '../constants';
import type { World } from '../World';

/**
 * The energy account of section 14.1: what the fleet actually burned.
 *
 * Not a flat charge per vehicle and not a share of the upkeep - the integral of
 * traction force over distance, which the tick loop accumulates as it moves
 * each vehicle. That is what makes the account say something: a train dragged
 * up a gradient costs more than the same train on the level, a heavy one costs
 * more than a light one, and an electric locomotive costs a fraction of what a
 * steam engine costs for the same work.
 *
 * Drawn once a month and the accumulators reset, which is also what keeps them
 * inside the range a double represents exactly (D-091).
 */
export function bookMonthlyEnergy(world: World): number {
  const vehicles = world.vehicles;
  let totalCt = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const work = vehicles.workJ[id]!;
    vehicles.workJ[id] = 0;
    if (work <= 0) continue;

    const rate = ENERGY_COST_CT_PER_MJ[vehicles.powerCode[id]!] ?? 0;
    totalCt += (work / JOULES_PER_MJ) * rate;
  }

  const amount = Math.round(totalCt * world.costFactor);
  if (amount <= 0) return 0;
  bookExpense(world.company, amount, Account.Energy);
  return amount;
}
