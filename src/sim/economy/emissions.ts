import { bookExpense } from './company';
import { Account } from './ledger';
import { PowerCode } from '../vehicles/spec';
import {
  CO2_ELECTRIFICATION_GRANT_SHARE,
  CO2_GRANT_FROM_YEAR,
  CO2_KG_PER_MJ,
  CO2_LEVY_CT_PER_TONNE,
  CO2_LEVY_FROM_YEAR,
  CO2_LEVY_RISE_FROM_YEAR,
  CO2_LEVY_RISE_PER_YEAR,
  CO2_VEHICLE_GRANT_MAX_SHARE,
  JOULES_PER_MJ,
  KG_PER_TONNE,
} from '../constants';
import type { CompanyState } from '../types';
import type { World } from '../World';

/**
 * The environment rating and the CO2 levy of section 14.3.
 *
 * The spec measures emissions as kilometres driven times a per-kilometre
 * figure. This measures them from the ENERGY each vehicle actually turned into
 * work, which the tick loop has been integrating since M6 - and that is a
 * strictly better answer to the same question (DECISIONS.md D-105). A train
 * dragged up a gradient emits more than the same train on the level, a heavy
 * one more than a light one, and an electric locomotive a fraction of what a
 * steam engine emits for the same work. A per-kilometre constant says none of
 * that, and it would need a new invented number on all sixty-odd vehicles.
 *
 * It is an incentive and not a rule. There is no cap, nothing is forbidden, and
 * the whole thing can be switched off when the game is started.
 */

/** What one company burned this month, in kilograms of CO2. */
export function monthlyEmissionsKg(world: World, companyId: number): number {
  const vehicles = world.vehicles;
  let kg = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== companyId) continue;
    const work = vehicles.workJ[id]!;
    if (work <= 0) continue;
    kg += (work / JOULES_PER_MJ) * (CO2_KG_PER_MJ[vehicles.powerCode[id]!] ?? 0);
  }
  return kg;
}

/**
 * The levy per tonne in a given year (section 14.3).
 *
 * Nothing before 2000, a flat rate until 2005, and rising from there. The rise
 * is linear rather than exponential: a player who electrified in 2010 should be
 * able to work out what it saved them, and an exponential curve turns the last
 * decades of a century-long game into a single decision made for them.
 */
export function levyCtPerTonne(year: number): number {
  if (year < CO2_LEVY_FROM_YEAR) return 0;
  if (year <= CO2_LEVY_RISE_FROM_YEAR) return CO2_LEVY_CT_PER_TONNE;
  return CO2_LEVY_CT_PER_TONNE + (year - CO2_LEVY_RISE_FROM_YEAR) * CO2_LEVY_RISE_PER_YEAR;
}

/**
 * Meter every company's emissions and charge the levy. Called from the monthly
 * hook, in the same pass as the energy bill and for the same reason: reading a
 * work accumulator is what empties it, so this has to run BEFORE the energy
 * pass clears them.
 */
export function bookMonthlyEmissions(world: World): number {
  if (!world.emissions) return 0;
  const rateCtPerTonne = levyCtPerTonne(world.date.year);
  let charged = 0;

  for (let index = 0; index < world.companies.length; index++) {
    const company = world.companies[index]!;
    const kg = monthlyEmissionsKg(world, company.id);
    company.co2ThisYearKg += kg;
    if (rateCtPerTonne <= 0) continue;

    const amount = Math.round((kg / KG_PER_TONNE) * rateCtPerTonne * world.costFactor);
    if (amount <= 0) continue;
    bookExpense(company, amount, Account.Emissions);
    charged += amount;
  }
  return charged;
}

/** Close the emissions year: this year's total becomes last year's figure. */
export function closeEmissionsYear(company: CompanyState): void {
  company.co2LastYearKg = company.co2ThisYearKg;
  company.co2ThisYearKg = 0;
}

/**
 * The share of an electrification bill the state pays back (section 14.3).
 *
 * Grants exist from the same year the levy does - the two are one policy, and a
 * levy with no way to avoid it is the moral lecture the spec explicitly does not
 * want. Zero before then, so the first fifty years of a game are untouched.
 */
export function electrificationGrantShare(world: World): number {
  if (!world.emissions) return 0;
  if (world.date.year < CO2_GRANT_FROM_YEAR) return 0;
  return CO2_ELECTRIFICATION_GRANT_SHARE;
}

/**
 * The share of a VEHICLE's price the state pays back (SPEC.md 14.3, SPEC2 M21).
 *
 * D-105's policy, one purchase further along: the levy charges for the carbon a
 * vehicle turns into work, the wires grant pays for the infrastructure, and
 * this pays for the machine. It is a FUNCTION of `CO2_KG_PER_MJ` and not a
 * second table - the grant is the diesel figure less this traction's, over the
 * diesel figure, times the ceiling - so a catalogue entry can never be dirty
 * for the levy and clean for the grant.
 *
 * Diesel is the datum because it is what a 1950s operator would otherwise buy.
 * Steam scores negative and is clamped to nothing; electric reaches 0.786 of
 * the ceiling, battery 0.714 and hydrogen 0.262.
 *
 * Zero without the `emissions` rule and zero before `CO2_GRANT_FROM_YEAR`, on
 * the same two lines the electrification grant uses: a grant with no levy
 * beside it would be the state paying for something it has not asked for.
 */
export function cleanVehicleGrantShare(world: World, powerCode: number): number {
  if (!world.emissions) return 0;
  if (world.date.year < CO2_GRANT_FROM_YEAR) return 0;

  const datum = CO2_KG_PER_MJ[PowerCode.Diesel] ?? 0;
  const here = CO2_KG_PER_MJ[powerCode] ?? datum;
  if (datum <= 0 || here >= datum) return 0;
  return ((datum - here) / datum) * CO2_VEHICLE_GRANT_MAX_SHARE;
}

/**
 * What a company really pays for a vehicle after the grant. [cent]
 *
 * The ONE function all four buy commands call, so a grant can never exist for
 * a lorry and not for a train. `world.costCt` is applied first, because the
 * grant is a share of the bill as it stands in this year's money.
 *
 * **What the fleet panel quotes is the catalogue's LIST price and always has
 * been** - it shows `spec.priceCt` raw, so it has disagreed with the bill by
 * the whole of inflation since M6 and now by the grant as well. That is a real
 * gap in D-119's rule and it is named here rather than half-closed: the panel
 * needs the world's `emissions` flag and its cost factor to quote the true
 * figure, neither of which reaches the interface today, and inventing a second
 * price formula in the panel is exactly how a preview and a bill come apart.
 */
export function grantedPriceCt(world: World, priceCt: number, powerCode: number): number {
  return Math.round(world.costCt(priceCt) * (1 - cleanVehicleGrantShare(world, powerCode)));
}

/**
 * How clean a company's FLEET is, as kilograms of CO2 per megajoule of work -
 * or -1 when it has no vehicles to judge.
 *
 * A rate, not a total. A total would mean a company improves its standing by
 * running fewer trains, and the one thing an environmental rule in a transport
 * game must not reward is doing less transport.
 *
 * Read from what the fleet IS rather than from what it has burned, because a
 * lifetime energy total would be another number per vehicle to save, hash and
 * migrate - and because it is what a council could actually observe.
 */
export function emissionIntensity(world: World, companyId: number): number {
  const vehicles = world.vehicles;
  let kg = 0;
  let counted = 0;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== companyId) continue;
    kg += CO2_KG_PER_MJ[vehicles.powerCode[id]!] ?? 0;
    counted++;
  }
  return counted > 0 ? kg / counted : -1;
}
