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
 *
 * Every company is metered in the same pass, because reading an accumulator
 * empties it: a pass per company would skip the others' vehicles and would
 * then never clear them.
 */
export function bookMonthlyEnergy(world: World): number {
  const vehicles = world.vehicles;
  const perCompany = world.companyScratch;
  perCompany.fill(0);

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const work = vehicles.workJ[id]!;
    vehicles.workJ[id] = 0;
    if (work <= 0) continue;

    const rate = ENERGY_COST_CT_PER_MJ[vehicles.powerCode[id]!] ?? 0;
    perCompany[vehicles.ownerId[id]!]! += (work / JOULES_PER_MJ) * rate;
  }

  let charged = 0;
  for (let index = 0; index < world.companies.length; index++) {
    const company = world.companies[index]!;
    const amount = Math.round(perCompany[company.id]! * world.costFactor);
    if (amount <= 0) continue;
    bookExpense(company, amount, Account.Energy);
    charged += amount;
  }
  return charged;
}
