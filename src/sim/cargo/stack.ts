import type { Cargo } from './types';

/**
 * A parcel of cargo on its way through the network.
 *
 * `paidFromX/Y` is the point up to which this cargo has already been paid for.
 * Every leg pays for the distance from there to where it is unloaded, and the
 * marker moves along - that is what makes feeder chains (lorry to train to ship
 * to lorry) add up to exactly one direct payment, with no double billing and no
 * penalty for transhipping (section 7.4).
 */
export interface CargoStack {
  readonly cargo: Cargo;
  amount: number;
  /**
   * Tick the cargo appeared, amount-weighted when stacks merge. Fractional on
   * purpose: rounding it would make the decay depend on merge order.
   */
  createdTick: number;
  /** Station the cargo started at, for statistics and the news log. */
  readonly originStationId: number;
  /**
   * Station this parcel is trying to reach, or -1 when the network offered
   * nowhere to take it (section 7.4).
   *
   * It survives being unloaded at an intermediate station, which is what makes a
   * feeder chain a single journey rather than three unrelated ones. A parcel
   * that still has -1 after thirty days is written off.
   */
  destinationStationId: number;
  paidFromX: number;
  paidFromY: number;
}

/**
 * Add cargo to a list, merging it into a matching stack if there is one.
 *
 * Without merging, a station on a busy line accumulates one stack per
 * production slice and the list grows without bound. Merging by
 * (cargo, origin, destination, paid-from point) keeps the payment exact and the
 * routing exact, because those are precisely the fields the two depend on.
 */
export function addCargo(stacks: CargoStack[], incoming: CargoStack): void {
  for (let i = 0; i < stacks.length; i++) {
    const existing = stacks[i]!;
    if (
      existing.cargo !== incoming.cargo ||
      existing.originStationId !== incoming.originStationId ||
      existing.destinationStationId !== incoming.destinationStationId ||
      existing.paidFromX !== incoming.paidFromX ||
      existing.paidFromY !== incoming.paidFromY
    ) {
      continue;
    }
    const total = existing.amount + incoming.amount;
    existing.createdTick =
      (existing.createdTick * existing.amount + incoming.createdTick * incoming.amount) / total;
    existing.amount = total;
    return;
  }
  stacks.push(incoming);
}

/** Total units of any cargo type in a list. */
export function totalAmount(stacks: readonly CargoStack[]): number {
  let total = 0;
  for (let i = 0; i < stacks.length; i++) total += stacks[i]!.amount;
  return total;
}

/** Units of one cargo type in a list. */
export function amountOf(stacks: readonly CargoStack[], cargo: Cargo): number {
  let total = 0;
  for (let i = 0; i < stacks.length; i++) {
    if (stacks[i]!.cargo === cargo) total += stacks[i]!.amount;
  }
  return total;
}

/** Age of the oldest stack in ticks, 0 when the list is empty. */
export function oldestAge(stacks: readonly CargoStack[], nowTick: number): number {
  let oldest = nowTick;
  for (let i = 0; i < stacks.length; i++) {
    const created = stacks[i]!.createdTick;
    if (created < oldest) oldest = created;
  }
  return nowTick - oldest;
}

/**
 * Move up to `limit` units of `cargo` from `from` to `to`, oldest first.
 *
 * Oldest first is not cosmetic: it is what stops a busy station from
 * accumulating a permanent residue of ancient cargo that never gets picked up
 * and drags the station rating down for ever.
 *
 * `allowedDestinations` is a flag per destination station id. When it is given,
 * only parcels bound for a flagged station are moved - which is how a vehicle
 * takes the cargo it can actually carry closer to where that cargo is going,
 * and leaves the rest for the line that serves it (section 7.4). Cargo with no
 * destination at all is never loaded: nobody knows where to take it.
 */
export function transferCargo(
  from: CargoStack[],
  to: CargoStack[],
  cargo: Cargo,
  limit: number,
  allowedDestinations: Uint8Array | null = null,
): number {
  let remaining = limit;

  while (remaining > 0) {
    let oldestIndex = -1;
    let oldestTick = Infinity;
    for (let i = 0; i < from.length; i++) {
      const stack = from[i]!;
      if (stack.cargo !== cargo || stack.amount <= 0) continue;
      if (allowedDestinations !== null) {
        const destination = stack.destinationStationId;
        if (destination < 0 || allowedDestinations[destination] !== 1) continue;
      }
      if (stack.createdTick < oldestTick) {
        oldestTick = stack.createdTick;
        oldestIndex = i;
      }
    }
    if (oldestIndex === -1) break;

    const source = from[oldestIndex]!;
    const moved = Math.min(source.amount, remaining);
    addCargo(to, {
      cargo: source.cargo,
      amount: moved,
      createdTick: source.createdTick,
      originStationId: source.originStationId,
      destinationStationId: source.destinationStationId,
      paidFromX: source.paidFromX,
      paidFromY: source.paidFromY,
    });

    source.amount -= moved;
    remaining -= moved;
    if (source.amount <= 0) from.splice(oldestIndex, 1);
  }

  return limit - remaining;
}

/** Drop empty stacks. */
export function compactStacks(stacks: CargoStack[]): void {
  for (let i = stacks.length - 1; i >= 0; i--) {
    if (stacks[i]!.amount <= 0) stacks.splice(i, 1);
  }
}
