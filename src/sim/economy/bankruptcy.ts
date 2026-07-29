import { BANKRUPTCY_MONTHS } from '../constants';
import { sellVehicle } from '../commands/build';
import { reviewSolvency } from './company';
import type { CompanyState } from '../types';
import type { World } from '../World';

/**
 * The end of a company, per section 14.2.
 *
 * Twelve months overdrawn and the fleet is auctioned off and the game is over.
 * The auction goes through the ordinary sale path, so the resale value, the
 * upkeep and the book value all move exactly as they would if the player had
 * sold every vehicle by hand - there is no separate accounting for failure.
 *
 * The infrastructure is deliberately left standing. Track and stations are not
 * a fleet, nobody is bidding for half a branch line, and a map that quietly
 * erased itself would take the evidence of what went wrong with it.
 */
export function reviewBankruptcy(world: World, company: CompanyState): void {
  if (company.bankrupt) return;

  if (reviewSolvency(company) < BANKRUPTCY_MONTHS) return;

  // The auction is the company's own doing, so it acts as that company: the
  // sale books the proceeds against the books being wound up and not against
  // whoever happened to be acting last.
  const previous = world.actingCompanyId;
  world.actingCompanyId = company.id;

  const vehicles = world.vehicles;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== company.id) continue;
    sellVehicle(world, id);
  }

  world.actingCompanyId = previous;
  company.bankrupt = true;
}
