import { bookExpense, bookRevenue } from './company';
import {
  CONTRACT_AMOUNT_STEP,
  CONTRACT_BONUS_FACTOR,
  CONTRACT_MAX_AMOUNT,
  CONTRACT_MAX_OPEN,
  CONTRACT_MIN_AMOUNT,
  CONTRACT_MIN_OPEN,
  CONTRACT_MONTHS_MAX,
  CONTRACT_MONTHS_MIN,
  CONTRACT_PENALTY_SHARE,
  CONTRACT_RATING_MALUS,
  TICKS_PER_MONTH,
} from '../constants';
import { Cargo } from '../cargo/types';
import { deliveryRevenueCt } from '../cargo/payment';
import { NewsCategory, NewsSeverity } from '../news/log';
import { Rng } from '../rng';
import { addGoodwill } from '../town/council';
import type { World } from '../World';

/**
 * Contracts and tenders (section 14.4).
 *
 * A town puts out a standing order - so many units of one cargo, delivered
 * inside a deadline - and pays over the odds for it. Accepting is optional and
 * free; failing is not. That is the whole shape: an opt-in bet on a line the
 * company thinks it can run, and the only thing in the game that pays more than
 * the tariff.
 *
 * Every contract is EXCLUSIVE. Several companies may accept the same one, and
 * the first to finish it takes the money - which is what makes a tender a race
 * with an AI rather than a private task list.
 */

export interface Contract {
  readonly id: number;
  /** A value of Cargo. */
  readonly cargo: number;
  /** Town the goods have to reach. */
  readonly townId: number;
  /** How much of it. [units] */
  readonly amountUnits: number;
  /** Tick the offer was made, and the tick it dies. */
  readonly offeredTick: number;
  readonly deadlineTick: number;
  /** What completing it pays, over and above the ordinary freight revenue. [cent] */
  readonly bonusCt: number;
  /** Companies that have taken it on. */
  acceptedBy: number[];
  /** Units delivered so far, indexed by company id. */
  progress: number[];
  /** Company that finished it, or -1 while it is still open. */
  completedBy: number;
}

/** Cargoes a town will ever tender for. Nobody orders passengers by the tonne. */
const TENDER_CARGOES: readonly number[] = [Cargo.Goods, Cargo.Food, Cargo.Steel, Cargo.Planks];

/** Is this contract still open for business? */
export function isOpen(world: World, contract: Contract): boolean {
  return contract.completedBy < 0 && world.tick < contract.deadlineTick;
}

/** How far a company has got with one, as a share of what it owes. */
export function contractProgress(contract: Contract, companyId: number): number {
  const done = contract.progress[companyId] ?? 0;
  return Math.min(1, done / contract.amountUnits);
}

/**
 * Count a delivery towards every contract it satisfies.
 *
 * Called from the delivery path, so a load only counts if it was actually
 * carried to the town - the contract cannot be satisfied by moving cargo into
 * the yard and back out again.
 */
export function creditDelivery(
  world: World,
  companyId: number,
  townId: number,
  cargo: number,
  amount: number,
): void {
  if (townId < 0 || amount <= 0) return;

  for (let index = 0; index < world.contracts.length; index++) {
    const contract = world.contracts[index]!;
    if (contract.townId !== townId || contract.cargo !== cargo) continue;
    if (!isOpen(world, contract)) continue;
    if (!contract.acceptedBy.includes(companyId)) continue;

    contract.progress[companyId] = (contract.progress[companyId] ?? 0) + amount;
    if (contract.progress[companyId]! >= contract.amountUnits) complete(world, contract, companyId);
  }
}

function complete(world: World, contract: Contract, companyId: number): void {
  contract.completedBy = companyId;
  bookRevenue(world.companyOf(companyId), contract.bonusCt, contract.cargo as Cargo);

  const town = world.towns[contract.townId];
  world.news.post({
    tick: world.tick,
    category: NewsCategory.Finance,
    severity: NewsSeverity.Info,
    messageKey: 'news.contractWon',
    params: {
      company: world.companyOf(companyId).name,
      town: town?.name ?? '',
      bonusCt: contract.bonusCt,
    },
    tileIndex: town === undefined ? -1 : world.map.tileIndex(town.x, town.y),
  });
}

/**
 * Take a contract on.
 *
 * Nothing is charged and nothing is reserved: the bet is the penalty at the
 * far end, and a company that accepts everything and delivers nothing pays for
 * all of it.
 */
export function acceptContract(contract: Contract, companyId: number): void {
  if (contract.acceptedBy.includes(companyId)) return;
  contract.acceptedBy.push(companyId);
  contract.progress[companyId] = 0;
}

/**
 * Retire the contracts whose time is up, and charge whoever accepted and did
 * not deliver. Called monthly.
 */
function settleExpired(world: World): void {
  for (let index = 0; index < world.contracts.length; index++) {
    const contract = world.contracts[index]!;
    if (contract.completedBy >= 0 || world.tick < contract.deadlineTick) continue;

    const penaltyCt = Math.round(contract.bonusCt * CONTRACT_PENALTY_SHARE);
    for (const companyId of contract.acceptedBy) {
      if ((contract.progress[companyId] ?? 0) >= contract.amountUnits) continue;
      bookExpense(world.companyOf(companyId), penaltyCt);

      const town = world.towns[contract.townId];
      if (town !== undefined) addGoodwill(town, companyId, -CONTRACT_RATING_MALUS);
      if (companyId !== world.playerCompanyId) continue;

      world.news.post({
        tick: world.tick,
        category: NewsCategory.Finance,
        severity: NewsSeverity.Warning,
        messageKey: 'news.contractFailed',
        params: { town: town?.name ?? '', penaltyCt },
        tileIndex: town === undefined ? -1 : world.map.tileIndex(town.x, town.y),
      });
    }
    // Marking it settled rather than deleting it: the id is what the interface
    // and the command refer to, and reusing one would let a stale click accept
    // a contract the player never saw.
    contract.completedBy = -2;
  }
}

/**
 * Keep between two and five offers on the table (section 14.4).
 *
 * Called monthly, after the expired ones have been settled, so a tender that
 * lapses is replaced rather than leaving the board short for a month.
 */
export function reviewContracts(world: World): void {
  settleExpired(world);

  let open = 0;
  for (let index = 0; index < world.contracts.length; index++) {
    if (isOpen(world, world.contracts[index]!)) open++;
  }
  if (world.towns.length === 0) return;

  // A stream of its own, reseeded from the world seed and the tick, rather than
  // draws from the gameplay RNG (DECISIONS.md D-106). Drawing from the shared
  // stream would move every breakdown and every industry roll in the game by
  // however many tenders happened to be offered that month - and it did: adding
  // this feature shifted balancing scenario 3 far enough to close an industry.
  // It needs no saved state, because the seed and the tick are both saved.
  const rng = Rng.fromSeed((world.seed + world.tick) | 0);

  const wanted = CONTRACT_MIN_OPEN + rng.nextInt(CONTRACT_MAX_OPEN - CONTRACT_MIN_OPEN + 1);
  while (open < wanted) {
    world.contracts.push(offer(world, rng));
    open++;
  }

  // The list is the save and the panel; an unbounded one would grow for a
  // century. Anything settled and older than the longest deadline is gone.
  const cutoff = world.tick - CONTRACT_MONTHS_MAX * TICKS_PER_MONTH;
  for (let index = world.contracts.length - 1; index >= 0; index--) {
    const contract = world.contracts[index]!;
    if (contract.completedBy >= -1 && isOpen(world, contract)) continue;
    if (contract.deadlineTick > cutoff) continue;
    world.contracts.splice(index, 1);
  }
}

function offer(world: World, rng: Rng): Contract {
  const town = world.towns[rng.nextInt(world.towns.length)]!;
  const cargo = TENDER_CARGOES[rng.nextInt(TENDER_CARGOES.length)]!;

  const steps = (CONTRACT_MAX_AMOUNT - CONTRACT_MIN_AMOUNT) / CONTRACT_AMOUNT_STEP;
  const amountUnits = CONTRACT_MIN_AMOUNT + rng.nextInt(steps + 1) * CONTRACT_AMOUNT_STEP;
  const months =
    CONTRACT_MONTHS_MIN + rng.nextInt(CONTRACT_MONTHS_MAX - CONTRACT_MONTHS_MIN + 1);

  return {
    id: world.nextContractId++,
    cargo,
    townId: town.id,
    amountUnits,
    offeredTick: world.tick,
    deadlineTick: world.tick + months * TICKS_PER_MONTH,
    bonusCt: bonusCtFor(world, cargo, amountUnits),
    acceptedBy: [],
    progress: [],
    completedBy: -1,
  };
}

/**
 * What a contract pays on top.
 *
 * Priced off the ordinary tariff for the same cargo over a typical haul, so the
 * bonus stays worth roughly what section 14.4 says - half as much again as
 * carrying it normally - however the freight rates are balanced later.
 */
export function bonusCtFor(world: World, cargo: number, amountUnits: number): number {
  const ordinary = deliveryRevenueCt({
    cargo: cargo as Cargo,
    amount: amountUnits,
    distanceTiles: CONTRACT_REFERENCE_DISTANCE,
    ticksInTransit: 0,
    hasCooling: false,
    year: world.date.year,
  });
  return Math.round(ordinary * CONTRACT_BONUS_FACTOR);
}

/** The haul a contract's bonus is priced against. [tiles] */
const CONTRACT_REFERENCE_DISTANCE = 40;
