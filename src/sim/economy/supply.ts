import { bookExpense, bookRevenue } from './company';
import {
  SUPPLY_BONUS_FACTOR,
  SUPPLY_BREACH_MONTHS,
  SUPPLY_HUNGER_SHARE,
  SUPPLY_MAX_OPEN,
  SUPPLY_MAX_QUOTA,
  SUPPLY_MIN_OPEN,
  SUPPLY_MIN_QUOTA,
  SUPPLY_MONTHS_MAX,
  SUPPLY_MONTHS_MIN,
  SUPPLY_PENALTY_SHARE,
  SUPPLY_QUOTA_STEP,
  SUPPLY_STREAM_NAME,
  TICKS_PER_MONTH,
} from '../constants';
import { Account } from './ledger';
import type { Cargo } from '../cargo/types';
import { deliveryRevenueCt } from '../cargo/payment';
import { economyRateFactor } from './curve';
import { CONTRACT_REFERENCE_DISTANCE } from './contracts';
import { industrySpec } from '../industry/types';
import { inputStock, setInputStock } from '../industry/production';
import { NewsCategory, NewsSeverity } from '../news/log';
import type { Rng } from '../rng';
import { streamSalt } from '../rng';
import type { World } from '../World';

/**
 * Supply contracts (SPEC2 M21): a consuming works orders a monthly quota.
 *
 * A 14.4 tender is a one-off bet - so much cargo into a town before a deadline,
 * once. A supply contract is the other half of the same idea and the half a
 * transport game is actually about: a steel works needs two hundred tonnes of
 * coal EVERY month, it pays over the tariff for a supply it can rely on, it
 * charges for a month it did not get, and if it goes without for long enough it
 * eats into the reserve it has been running on. That last rule is what makes
 * the contract a relationship rather than a bonus: a line that lapses damages
 * the works at the far end of it.
 *
 * ## The rules, stated rather than left to be discovered
 *
 * 1. **Opt-in, like every other contract.** `AcceptSupplyContract` is the
 *    player's own command, and several companies may hold the same order at
 *    once - a works does not care which of them brings the coal, and two
 *    suppliers each delivering half the quota between them satisfy it (the
 *    total is what the works measures) while each is judged on its own share.
 * 2. **Fulfilment is what the WORKS TOOK.** `creditSupply` is called from the
 *    delivery path with what `deliverToIndustry` accepted, which is D-085's
 *    measure one step further along: a load a full works refused is a load that
 *    did not supply it, and crediting it would let a company satisfy a quota by
 *    tipping coal onto a platform.
 * 3. **Both sides are booked monthly.** A company over its share earns
 *    `bonusCtFor` on the freight it has already been paid for; a company under
 *    it pays a penalty scaled by the shortfall, into
 *    `Account.ContractPenalties` and nowhere else.
 * 4. **Persistent breach starves the input.** After `SUPPLY_BREACH_MONTHS`
 *    consecutive months in which the works did not get its quota FROM ANYBODY,
 *    it loses `SUPPLY_HUNGER_SHARE` of the input it is short of. Nothing else
 *    moves: the production LEVEL is untouched, because nothing shrinks an
 *    industry (D-086) and a supply contract may not be a back door to the
 *    decline rule that was measured and removed.
 * 5. **The board exists only in a century world.** `world.economy` is SPEC2
 *    M21's own off-anchor - "Weltregel Konjunktur: aus pinnt alle
 *    Referenzläufe" - and `reviewSupply` returns on its first line without it,
 *    drawing nothing and writing nothing. Every band this game owns was
 *    measured on a world with the rule off and stays exactly where it was
 *    (Fehlerkatalog 34), by construction rather than by luck.
 */

export interface SupplyContract {
  readonly id: number;
  /** The works that placed the order. */
  readonly industryId: number;
  /** A value of Cargo - one of the works' own inputs. */
  readonly cargo: number;
  /** What it wants every month. [units/month] */
  readonly quotaUnits: number;
  readonly offeredTick: number;
  /** The tick the standing order runs out. */
  readonly endTick: number;
  /** What one met month pays, over and above the freight. [cent] */
  readonly bonusCt: number;
  /** Companies that have taken it on. */
  acceptedBy: number[];
  /** Units delivered into the works this month, indexed by company id. */
  deliveredThisMonth: number[];
  /** Consecutive months the works did not get its quota from anybody. */
  monthsMissed: number;
  /** Months the quota was met, over the whole life of the order. */
  monthsMet: number;
}

/** Is this order still standing? */
export function isSupplyOpen(world: World, contract: SupplyContract): boolean {
  return world.tick < contract.endTick;
}

/** How far a company has got with this month's quota, 0..1. */
export function supplyProgress(contract: SupplyContract, companyId: number): number {
  const done = contract.deliveredThisMonth[companyId] ?? 0;
  return Math.min(1, done / contract.quotaUnits);
}

/** Take a standing order on. Nothing is charged and nothing is reserved. */
export function acceptSupply(contract: SupplyContract, companyId: number): void {
  if (contract.acceptedBy.includes(companyId)) return;
  contract.acceptedBy.push(companyId);
  contract.deliveredThisMonth[companyId] = 0;
}

/**
 * Count what a works accepted towards the standing order it placed.
 *
 * `creditDelivery`'s twin on the industry side, called from the same delivery
 * path and measuring the same event one recipient further along. It takes what
 * the WORKS took rather than what the vehicle unloaded, which is the only
 * honest measure of a supply: a full input shed accepts nothing, and a quota is
 * about what arrived in the shed.
 */
export function creditSupply(
  world: World,
  companyId: number,
  industryId: number,
  cargo: number,
  amount: number,
): void {
  if (industryId < 0 || amount <= 0) return;

  for (let index = 0; index < world.supplyContracts.length; index++) {
    const contract = world.supplyContracts[index]!;
    if (contract.industryId !== industryId || contract.cargo !== cargo) continue;
    if (!isSupplyOpen(world, contract)) continue;
    if (!contract.acceptedBy.includes(companyId)) continue;

    contract.deliveredThisMonth[companyId] = (contract.deliveredThisMonth[companyId] ?? 0) + amount;
  }
}

/**
 * Judge the month that has just ended and put the next offers on the board.
 * Called monthly, from the same block as `reviewContracts`.
 */
export function reviewSupply(world: World): void {
  // The whole subsystem is the century's, and a world without one never
  // constructs a stream, draws a number or writes a record.
  if (!world.economy) return;

  settleMonth(world);

  let open = 0;
  for (let index = 0; index < world.supplyContracts.length; index++) {
    if (isSupplyOpen(world, world.supplyContracts[index]!)) open++;
  }

  // Its own stream, folded with the tick exactly as the tender board folds it
  // (D-128): a named stream alone is a constant per world, so every month would
  // draw the same order. Nothing here touches `world.rng`, so switching the
  // century on cannot move a breakdown roll (Z3).
  const rng = world.streamFor(streamSalt(SUPPLY_STREAM_NAME) + world.tick);
  const wanted = SUPPLY_MIN_OPEN + rng.nextInt(SUPPLY_MAX_OPEN - SUPPLY_MIN_OPEN + 1);

  while (open < wanted) {
    const contract = offer(world, rng);
    if (contract === null) break;
    world.supplyContracts.push(contract);
    open++;
  }

  // The list is the save and the panel. An expired order is kept until the
  // longest possible life has passed, for the reason a settled tender is kept:
  // its id is what a command refers to.
  const cutoff = world.tick - SUPPLY_MONTHS_MAX * TICKS_PER_MONTH;
  for (let index = world.supplyContracts.length - 1; index >= 0; index--) {
    const contract = world.supplyContracts[index]!;
    if (isSupplyOpen(world, contract)) continue;
    if (contract.endTick > cutoff) continue;
    world.supplyContracts.splice(index, 1);
  }
}

/**
 * Book the month for every standing order: bonus, penalty, hunger.
 *
 * The order of the three matters and is part of the deterministic contract:
 * every company is judged on its own share first, the WORKS is judged on the
 * total second, and the hunger it suffers is a consequence of that total and
 * never of who was to blame for it.
 */
function settleMonth(world: World): void {
  for (let index = 0; index < world.supplyContracts.length; index++) {
    const contract = world.supplyContracts[index]!;
    if (!isSupplyOpen(world, contract)) continue;

    let total = 0;
    for (const companyId of contract.acceptedBy) {
      total += contract.deliveredThisMonth[companyId] ?? 0;
    }
    // What each holder owes: the quota split evenly over the companies that
    // took the order on. Two suppliers each owe half, which is the reading that
    // makes a shared order worth sharing - charging each of them the whole
    // quota would make a second holder a competitor's sabotage tool.
    const share = contract.quotaUnits / Math.max(1, contract.acceptedBy.length);

    for (const companyId of contract.acceptedBy) {
      const delivered = contract.deliveredThisMonth[companyId] ?? 0;
      const company = world.companyOf(companyId);
      if (delivered >= share) {
        bookRevenue(company, contract.bonusCt, contract.cargo as Cargo);
      } else {
        const missed = (share - delivered) / share;
        const penaltyCt = Math.round(contract.bonusCt * SUPPLY_PENALTY_SHARE * missed);
        if (penaltyCt > 0) bookExpense(company, penaltyCt, Account.ContractPenalties);
      }
      contract.deliveredThisMonth[companyId] = 0;
    }

    if (total >= contract.quotaUnits) {
      contract.monthsMet++;
      contract.monthsMissed = 0;
      continue;
    }
    contract.monthsMissed++;
    if (contract.monthsMissed < SUPPLY_BREACH_MONTHS) continue;
    starve(world, contract);
    contract.monthsMissed = 0;
  }
}

/**
 * A works that has gone without for a quarter eats its reserve.
 *
 * It touches the INPUT stock of the cargo the order names and nothing else -
 * not the production level, not the closure clock, not the output shed. The
 * next month's production is smaller because there is less to make it from,
 * which is the 7.3 rule working normally rather than a new one.
 */
function starve(world: World, contract: SupplyContract): void {
  const works = world.industries[contract.industryId];
  if (works === undefined || !works.open) return;

  const slots = industrySpec(works.type).inputs;
  for (let slot = 0; slot < slots.length; slot++) {
    if (slots[slot] !== contract.cargo) continue;
    const held = inputStock(works, slot);
    if (held <= 0) break;
    setInputStock(works, slot, held * (1 - SUPPLY_HUNGER_SHARE));
    break;
  }

  world.news.postOnce({
    tick: world.tick,
    category: NewsCategory.Industry,
    severity: NewsSeverity.Warning,
    messageKey: 'news.supplyBreach',
    params: { industry: industrySpec(works.type).nameKey, months: SUPPLY_BREACH_MONTHS },
    tileIndex: world.map.tileIndex(works.x, works.y),
  });
}

/**
 * One new standing order, or null when no works on this map consumes anything.
 *
 * The candidate list is built and then indexed, rather than drawn from and
 * retried: a retry loop makes the number of draws depend on how many works
 * happen to be open, and two worlds that differ only in that would fork their
 * whole later stream (Z3).
 */
function offer(world: World, rng: Rng): SupplyContract | null {
  const candidates: number[] = [];
  for (let index = 0; index < world.industries.length; index++) {
    const works = world.industries[index]!;
    if (!works.open) continue;
    if (industrySpec(works.type).inputs.length === 0) continue;
    if (hasOrder(world, works.id)) continue;
    candidates.push(index);
  }
  if (candidates.length === 0) return null;

  const works = world.industries[candidates[rng.nextInt(candidates.length)]!]!;
  const inputs = industrySpec(works.type).inputs;
  const cargo = inputs[rng.nextInt(inputs.length)]!;

  const steps = (SUPPLY_MAX_QUOTA - SUPPLY_MIN_QUOTA) / SUPPLY_QUOTA_STEP;
  const quotaUnits = SUPPLY_MIN_QUOTA + rng.nextInt(steps + 1) * SUPPLY_QUOTA_STEP;
  const months = SUPPLY_MONTHS_MIN + rng.nextInt(SUPPLY_MONTHS_MAX - SUPPLY_MONTHS_MIN + 1);

  return {
    id: world.nextSupplyContractId++,
    industryId: works.id,
    cargo,
    quotaUnits,
    offeredTick: world.tick,
    endTick: world.tick + months * TICKS_PER_MONTH,
    bonusCt: supplyBonusCtFor(world, cargo, quotaUnits),
    acceptedBy: [],
    deliveredThisMonth: [],
    monthsMissed: 0,
    monthsMet: 0,
  };
}

/** Does this works already have a standing order? */
function hasOrder(world: World, industryId: number): boolean {
  for (let index = 0; index < world.supplyContracts.length; index++) {
    const contract = world.supplyContracts[index]!;
    if (contract.industryId === industryId && isSupplyOpen(world, contract)) return true;
  }
  return false;
}

/**
 * What one met month pays on top.
 *
 * Priced off the ordinary tariff over the same reference haul the 14.4 bonus is
 * priced off, so the two premiums stay comparable however the freight rates are
 * balanced later - and off the century, for the reason `bonusCtFor` gives: a
 * quota of coal in 2040 that was paid at 1950's coal price would be the one
 * contract in the game that pays a company to move something nobody wants.
 */
export function supplyBonusCtFor(world: World, cargo: number, quotaUnits: number): number {
  const ordinary = deliveryRevenueCt({
    cargo: cargo as Cargo,
    amount: quotaUnits,
    distanceTiles: CONTRACT_REFERENCE_DISTANCE,
    ticksInTransit: 0,
    hasCooling: false,
    year: world.date.year,
    rateFactor: economyRateFactor(world.economyCurve, cargo, world.date.year),
  });
  return Math.round(ordinary * SUPPLY_BONUS_FACTOR);
}
