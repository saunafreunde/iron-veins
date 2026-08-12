import {
  SUBSIDY_ENDPOINT_RADIUS,
  SUBSIDY_MAX_DISTANCE,
  SUBSIDY_MIN_DISTANCE,
  SUBSIDY_MAX_OPEN,
  SUBSIDY_MIN_OPEN,
  SUBSIDY_MONTHS_MAX,
  SUBSIDY_MONTHS_MIN,
  SUBSIDY_RATE_MAX,
  SUBSIDY_RATE_MIN,
  SUBSIDY_RATE_STEP,
  SUBSIDY_RATING_BONUS,
  SUBSIDY_STREAM_NAME,
  STATION_CATCHMENT_SCAN_RADIUS,
  TICKS_PER_MONTH,
} from '../constants';
import { industrySpec } from '../industry/types';
import { NewsCategory, NewsSeverity } from '../news/log';
import type { Rng } from '../rng';
import { streamSalt } from '../rng';
import { addGoodwill } from '../town/council';
import type { World } from '../World';

/**
 * The subsidy board (SPEC2 M21): the state pays over the odds for a line
 * nobody runs.
 *
 * A clone of `contracts.ts` in shape and a different animal in kind. A tender
 * is an ORDER - so much cargo, into a town, by a date - and the company that
 * takes it on carries the risk. A subsidy is a STANDING OFFER on a RELATION:
 * between this works and that one, for this cargo, the state pays 1.5 to 2
 * times the tariff for the next N months, and the first company to deliver on
 * it takes the offer for the rest of its life. Nobody accepts it, nobody is
 * charged for failing it, and there is no command: the only way to take part is
 * to build the line, which is the whole point of it.
 *
 * ## The rules
 *
 * 1. **It is offered on an UNSERVED relation somebody could actually run.**
 *    Both ends are picked with no station within
 *    `STATION_CATCHMENT_SCAN_RADIUS` - the same question the AI's
 *    `servedByAnyone` asks, because a subsidy for a line somebody already runs
 *    is a gift to whoever ran it - and inside `SUBSIDY_MIN_DISTANCE` to
 *    `SUBSIDY_MAX_DISTANCE`, which is the window a line pays over at all.
 * 2. **The first delivery wins it, and that is a race** (D-107). `claimedBy`
 *    goes from -1 to a company id the first time cargo of the right kind
 *    travels between the two ends, and every later delivery by anybody else is
 *    paid the ordinary tariff. One relation, one winner, decided by who got
 *    there first and not by who asked first.
 * 3. **It is a RATE and not a bonus.** The factor multiplies the delivery
 *    revenue at the one seam the century already multiplies (the tariff's
 *    `rateFactor`), so a subsidised line earns more per tonne carried and
 *    nothing at all when nothing is carried. A lump sum would pay for building
 *    the line rather than for running it.
 * 4. **The AI sees exactly what the player sees.** `subsidyRateFor` is what
 *    `ai/evaluate.ts` multiplies into both of its payment estimates, so a
 *    relation the state has made profitable clears `AI_MIN_PROFIT_MARGIN` and
 *    is built - which is what makes the board a lever on a competitor that has
 *    refused unprofitable work since D-221/D-229 rather than a player-only
 *    windfall.
 * 5. **The board exists only in a century world**, exactly like the supply
 *    board and for the same reason (Fehlerkatalog 34): `world.economy` is
 *    M21's own off-anchor, and `reviewSubsidies` returns on its first line
 *    without it - no stream, no draw, no record, and every band measured
 *    before this milestone arithmetically untouched.
 */

export interface Subsidy {
  readonly id: number;
  /** A value of Cargo. */
  readonly cargo: number;
  /** Where the goods have to come from, and where they have to go. [tile] */
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** What the state pays, as a multiple of the ordinary rate. [1] */
  readonly rateFactor: number;
  readonly offeredTick: number;
  readonly expiresTick: number;
  /** The company that got there first, or -1 while the race is open. */
  claimedBy: number;
  /** Units carried on the relation since it was claimed. [units] */
  deliveredUnits: number;
}

/** Is this offer still standing? */
export function isSubsidyOpen(world: World, subsidy: Subsidy): boolean {
  return world.tick < subsidy.expiresTick;
}

/** Is this tile within reach of one end of the relation? */
function atEndpoint(x: number, y: number, endX: number, endY: number): boolean {
  const dx = x - endX;
  const dy = y - endY;
  return dx * dx + dy * dy <= SUBSIDY_ENDPOINT_RADIUS * SUBSIDY_ENDPOINT_RADIUS;
}

/**
 * What a company is paid per tonne for carrying this cargo from there to here,
 * as a multiple of the ordinary rate - and the moment of the race.
 *
 * Called from the delivery path with the position the parcel STARTED at and the
 * position it arrived at. It is the only writer on the board outside the
 * monthly review, and what it writes is the claim: an unclaimed offer whose
 * relation has just been run belongs to the company that ran it, from that
 * delivery on.
 *
 * `claim` is false wherever the question is hypothetical - the AI's two
 * estimates, the interface - so that looking at a subsidy can never win it.
 */
export function subsidyRateFor(
  world: World,
  companyId: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  cargo: number,
  claim: boolean,
): number {
  if (!world.economy) return 1;

  for (let index = 0; index < world.subsidies.length; index++) {
    const subsidy = world.subsidies[index]!;
    if (subsidy.cargo !== cargo) continue;
    if (!isSubsidyOpen(world, subsidy)) continue;
    if (subsidy.claimedBy >= 0 && subsidy.claimedBy !== companyId) continue;
    if (!atEndpoint(fromX, fromY, subsidy.fromX, subsidy.fromY)) continue;
    if (!atEndpoint(toX, toY, subsidy.toX, subsidy.toY)) continue;

    if (claim) {
      if (subsidy.claimedBy < 0) win(world, subsidy, companyId);
      subsidy.deliveredUnits++;
    }
    return subsidy.rateFactor;
  }
  return 1;
}

/**
 * The delivery path's own door to the board, and the ONE place a subsidy is
 * ever claimed.
 *
 * The relation is measured between the station the parcel STARTED at and the
 * station it is being delivered to - never `paidFromX/Y`, which moves along
 * with every transfer, so a feeder chain that ends at the subsidised sink is
 * paid for the relation it really ran. It returns on its first line in a world
 * without a century and in a world with an empty board, which is every world
 * any band of this game was measured on.
 */
export function subsidyRateForDelivery(
  world: World,
  companyId: number,
  originStationId: number,
  toX: number,
  toY: number,
  cargo: number,
): number {
  if (!world.economy || world.subsidies.length === 0 || originStationId < 0) return 1;

  for (let index = 0; index < world.stations.length; index++) {
    const origin = world.stations[index]!;
    if (origin.id !== originStationId) continue;
    return subsidyRateFor(world, companyId, origin.x, origin.y, toX, toY, cargo, true);
  }
  return 1;
}

/** The race is over: this company holds the relation for the rest of its life. */
function win(world: World, subsidy: Subsidy, companyId: number): void {
  subsidy.claimedBy = companyId;

  // The towns at either end notice the line the state paid for. `addGoodwill`
  // is the council's own memory of what a company DID (D-102), which is where
  // a public contract belongs.
  for (const town of world.towns) {
    if (
      atEndpoint(town.x, town.y, subsidy.fromX, subsidy.fromY) ||
      atEndpoint(town.x, town.y, subsidy.toX, subsidy.toY)
    ) {
      addGoodwill(town, companyId, SUBSIDY_RATING_BONUS);
    }
  }

  world.news.post({
    tick: world.tick,
    category: NewsCategory.Finance,
    severity: NewsSeverity.Info,
    messageKey: 'news.subsidyWon',
    params: {
      company: world.companyOf(companyId).name,
      rate: Math.round(subsidy.rateFactor * 100),
    },
    tileIndex: world.map.tileIndex(subsidy.toX, subsidy.toY),
  });
}

/**
 * Keep the board stocked and retire what has run out. Called monthly, from the
 * same block as the tender and supply reviews.
 */
export function reviewSubsidies(world: World): void {
  if (!world.economy) return;

  let open = 0;
  for (let index = 0; index < world.subsidies.length; index++) {
    if (isSubsidyOpen(world, world.subsidies[index]!)) open++;
  }

  const rng = world.streamFor(streamSalt(SUBSIDY_STREAM_NAME) + world.tick);
  const wanted = SUBSIDY_MIN_OPEN + rng.nextInt(SUBSIDY_MAX_OPEN - SUBSIDY_MIN_OPEN + 1);

  while (open < wanted) {
    const subsidy = offer(world, rng);
    if (subsidy === null) break;
    world.subsidies.push(subsidy);
    open++;
  }

  const cutoff = world.tick - SUBSIDY_MONTHS_MAX * TICKS_PER_MONTH;
  for (let index = world.subsidies.length - 1; index >= 0; index--) {
    const subsidy = world.subsidies[index]!;
    if (isSubsidyOpen(world, subsidy)) continue;
    if (subsidy.expiresTick > cutoff) continue;
    world.subsidies.splice(index, 1);
  }
}

/**
 * One new offer, or null when the map has no unserved relation left to make.
 *
 * The candidate list is built whole and then indexed, for the reason
 * `supply.ts` builds its own that way: a draw-and-retry loop would make the
 * NUMBER of draws depend on how much of the map happens to be served, and two
 * worlds that differ only in that would fork their streams for ever (Z3).
 */
function offer(world: World, rng: Rng): Subsidy | null {
  const froms: number[] = [];
  const tos: number[] = [];

  for (let source = 0; source < world.industries.length; source++) {
    const from = world.industries[source]!;
    if (!from.open) continue;
    const outputs = industrySpec(from.type).outputs;
    if (outputs.length === 0) continue;
    if (servedByAnyone(world, from.x, from.y)) continue;

    for (let sink = 0; sink < world.industries.length; sink++) {
      const to = world.industries[sink]!;
      if (sink === source || !to.open) continue;
      if (to.landmassId !== from.landmassId) continue;
      if (!industrySpec(to.type).inputs.includes(outputs[0]!)) continue;
      if (servedByAnyone(world, to.x, to.y)) continue;
      // Inside the window a line can actually be run over. Measured: without
      // it the board offers relations nobody can build and nobody ever claims
      // one (the constant carries the figure).
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
      if (distance < SUBSIDY_MIN_DISTANCE || distance > SUBSIDY_MAX_DISTANCE) continue;
      if (hasOffer(world, source, sink)) continue;
      froms.push(source);
      tos.push(sink);
    }
  }
  if (froms.length === 0) return null;

  const pick = rng.nextInt(froms.length);
  const from = world.industries[froms[pick]!]!;
  const to = world.industries[tos[pick]!]!;

  const steps = Math.round((SUBSIDY_RATE_MAX - SUBSIDY_RATE_MIN) / SUBSIDY_RATE_STEP);
  const rateFactor = SUBSIDY_RATE_MIN + rng.nextInt(steps + 1) * SUBSIDY_RATE_STEP;
  const months = SUBSIDY_MONTHS_MIN + rng.nextInt(SUBSIDY_MONTHS_MAX - SUBSIDY_MONTHS_MIN + 1);

  return {
    id: world.nextSubsidyId++,
    cargo: industrySpec(from.type).outputs[0]!,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    rateFactor,
    offeredTick: world.tick,
    expiresTick: world.tick + months * TICKS_PER_MONTH,
    claimedBy: -1,
    deliveredUnits: 0,
  };
}

/** Is this relation already on the board? */
function hasOffer(world: World, sourceIndex: number, sinkIndex: number): boolean {
  const from = world.industries[sourceIndex]!;
  const to = world.industries[sinkIndex]!;
  for (let index = 0; index < world.subsidies.length; index++) {
    const subsidy = world.subsidies[index]!;
    if (!isSubsidyOpen(world, subsidy)) continue;
    if (subsidy.fromX === from.x && subsidy.fromY === from.y) return true;
    if (subsidy.toX === to.x && subsidy.toY === to.y) return true;
  }
  return false;
}

/**
 * Does anybody already have a station within reach of this tile?
 *
 * The same question `ai/evaluate.ts` asks under the same name, at the same
 * radius: "unserved" has to mean one thing, or the state would subsidise
 * relations the competitors already price as served.
 */
function servedByAnyone(world: World, x: number, y: number): boolean {
  for (const station of world.stations) {
    const dx = station.x - x;
    const dy = station.y - y;
    if (dx * dx + dy * dy <= STATION_CATCHMENT_SCAN_RADIUS * STATION_CATCHMENT_SCAN_RADIUS) {
      return true;
    }
  }
  return false;
}
