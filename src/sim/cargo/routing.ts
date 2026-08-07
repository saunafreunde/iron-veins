import {
  CARGO_DESTINATION_FANOUT,
  CARGO_MAX_WAIT_DAYS,
  CARGO_ROUTE_EPSILON_TICKS,
  STATION_CARGO_CAPACITY,
  TICKS_PER_DAY,
} from '../constants';
import { stationAccepts } from '../industry/catchment';
import { industrySpec } from '../industry/types';
import { scheduleOf } from '../lines/LineStore';
import type { Station } from '../station/types';
import { OrderTarget } from '../vehicles/VehicleStore';
import type { World } from '../World';
import { addCargo, compactStacks, transferCargo, type CargoStack } from './stack';
import type { Cargo } from './types';

/**
 * Where a parcel is going, and who is allowed to carry it (section 7.4).
 *
 * Three decisions live here, and they are the whole of cargo routing:
 *
 *  - when cargo is produced, which stations it is FOR;
 *  - at a platform, which of the waiting parcels a given vehicle may take;
 *  - at a stop, which of the carried parcels belong here - either because this
 *    is their destination or because this is where their route changes lines.
 *
 * All three are answered from the same table: the expected time from a station
 * to a destination in `LinkGraph`. A vehicle may take a parcel when its own next
 * stop is on a shortest route to that parcel's destination, and it must set the
 * parcel down again as soon as that stops being true. Feeder chains are not
 * modelled anywhere - they are what those two rules produce.
 */

/** Destinations the current vehicle would carry cargo towards, by station id. */
let allowedScratch = new Uint8Array(0);

/** Candidate destinations of one deposit, best first. */
const candidateIds = new Int32Array(CARGO_DESTINATION_FANOUT);
const candidateCosts = new Float64Array(CARGO_DESTINATION_FANOUT);

function reserveAllowed(count: number): Uint8Array {
  if (allowedScratch.length < count) allowedScratch = new Uint8Array(count + 64);
  allowedScratch.fill(0);
  return allowedScratch;
}

/**
 * The next station this vehicle will call at, or -1 when it has no other stop.
 *
 * Depot orders are stepped over: a train that visits its shed on the way still
 * arrives at the stop after it, and cargo does not care that it went via the
 * shed. Scanning wraps, because orders are a cycle.
 */
export function nextStationOf(world: World, id: number, here: number): number {
  // The list the vehicle actually runs: its line's when assigned (12.2).
  const orders = scheduleOf(world, id);
  if (orders.length === 0) return -1;
  const current = world.vehicles.orderIndex[id]! % orders.length;

  for (let step = 1; step <= orders.length; step++) {
    const order = orders[(current + step) % orders.length]!;
    if (order.target !== OrderTarget.Station) continue;
    if (order.targetId === here) continue;
    if (world.stations[order.targetId] === undefined) continue;
    return order.targetId;
  }
  return -1;
}

/**
 * Does going via `next` bring a parcel bound for `destination` closer?
 *
 * True exactly when the leg the vehicle is about to drive lies on a shortest
 * route. The epsilon is float noise and nothing else: allowing a real detour
 * lets a parcel ride out and back on the same line, and the second leg would be
 * paid for all over again.
 */
function carriesCloser(world: World, here: number, next: number, destination: number): boolean {
  if (destination < 0) return false;
  if (destination === next) return true;

  const graph = world.cargoLinks;
  const leg = graph.legTicks(here, next);
  if (!Number.isFinite(leg)) return false;

  const onward = graph.expectedTicks(next, destination);
  if (!Number.isFinite(onward)) return false;

  const direct = graph.expectedTicks(here, destination);
  if (!Number.isFinite(direct)) return true;
  return leg + onward <= direct + CARGO_ROUTE_EPSILON_TICKS;
}

/**
 * Flags of the destinations this vehicle would carry cargo towards, or null
 * when it has nowhere to take anything.
 */
function allowedDestinations(world: World, id: number, here: number): Uint8Array | null {
  const next = nextStationOf(world, id, here);
  if (next < 0) return null;

  world.cargoLinks.ensureRouting(world);
  const allowed = reserveAllowed(world.stations.length);
  for (let station = 0; station < world.stations.length; station++) {
    if (station === here) continue;
    if (carriesCloser(world, here, next, station)) allowed[station] = 1;
  }
  return allowed;
}

/**
 * Take on cargo at a platform: the parcels this vehicle actually helps, oldest
 * first. Returns how many units were loaded.
 */
export function loadFromStation(
  world: World,
  id: number,
  station: Station,
  cargo: Cargo,
  space: number,
): number {
  if (space <= 0) return 0;
  const allowed = allowedDestinations(world, id, station.id);
  if (allowed === null) return 0;

  const moved = transferCargo(station.waiting, world.vehicles.cargo[id]!, cargo, space, allowed);
  if (moved > 0) {
    compactStacks(station.waiting);
    creditCollection(world, station, cargo, moved);
  }
  return moved;
}

/**
 * Book cargo that has just been carried away against the industries that made
 * it (section 7.3: "at least 80 % ABTRANSPORT over twelve months").
 *
 * Carried away, not handed to a station. Crediting the deposit instead makes
 * the growth signal meaningless: an industry then reads full service while its
 * output rots on a platform nobody calls at, grows on the strength of it, and
 * makes still more of what cannot be moved. Measured on the coal line of
 * scenario 2, that alone doubled the mine to 190 % while the train it fed was
 * carrying six month old coal at the decay floor (DECISIONS.md D-085).
 *
 * Split evenly between the works at this station that make this cargo, which is
 * as fair as it can be without tracking which yard each parcel came out of.
 */
function creditCollection(world: World, station: Station, cargo: Cargo, amount: number): void {
  let producers = 0;
  for (const industryId of station.servedIndustries) {
    const industry = world.industries[industryId];
    if (industry === undefined || !industry.open) continue;
    if (industrySpec(industry.type).outputs.includes(cargo)) producers++;
  }
  if (producers === 0) return;

  const share = amount / producers;
  for (const industryId of station.servedIndustries) {
    const industry = world.industries[industryId];
    if (industry === undefined || !industry.open) continue;
    if (!industrySpec(industry.type).outputs.includes(cargo)) continue;
    industry.collectedThisMonth += share;
  }
}

/** What is to become of a parcel the vehicle is carrying at this stop. */
export const CargoDisposition = {
  /** It is going further on this vehicle. */
  Stay: 0,
  /** This is where it was going: hand it to the industry or the town. */
  Deliver: 1,
  /** Its route changes lines here: pay the leg and set it down to wait. */
  Transfer: 2,
} as const;
export type CargoDisposition = (typeof CargoDisposition)[keyof typeof CargoDisposition];

/**
 * What to do with one carried parcel at the station the vehicle has reached.
 *
 * A parcel whose destination this is, but which the station has since stopped
 * accepting - the works it fed closed down - is set down rather than delivered,
 * and looks for a new destination from here. That is a rare case, and dropping
 * it into the transfer path is what stops it being carried round for ever.
 */
export function dispositionOf(
  world: World,
  id: number,
  station: Station,
  stack: CargoStack,
): CargoDisposition {
  if (stack.destinationStationId === station.id) {
    return stationAccepts(station, stack.cargo)
      ? CargoDisposition.Deliver
      : CargoDisposition.Transfer;
  }

  const next = nextStationOf(world, id, station.id);
  if (next < 0) return CargoDisposition.Transfer;

  world.cargoLinks.ensureRouting(world);
  return carriesCloser(world, station.id, next, stack.destinationStationId)
    ? CargoDisposition.Stay
    : CargoDisposition.Transfer;
}

/**
 * Set a parcel down at an intermediate station, keeping origin and destination.
 * Returns the units the station had room for.
 *
 * The paid-from marker moves to this station, so the next vehicle is paid for
 * the distance IT covers and the journey as a whole earns exactly what one
 * direct run would have earned - which is the whole point of section 7.4.
 *
 * A station with no room takes nothing and the parcel rides on. Destroying
 * cargo that has already been carried and paid for would be a worse answer than
 * carrying it round once more.
 */
export function transferToStation(station: Station, stack: CargoStack): number {
  let waiting = 0;
  for (const other of station.waiting) waiting += other.amount;

  const space = STATION_CARGO_CAPACITY - waiting;
  if (space <= 0) return 0;
  const placed = stack.amount < space ? stack.amount : space;

  addCargo(station.waiting, {
    cargo: stack.cargo,
    amount: placed,
    createdTick: stack.createdTick,
    originStationId: stack.originStationId,
    // Arriving at its own destination and not being wanted there means the
    // parcel needs somewhere new to go; the daily sweep finds it.
    destinationStationId:
      station.id === stack.destinationStationId ? -1 : stack.destinationStationId,
    paidFromX: station.x,
    paidFromY: station.y,
  });
  return placed;
}

// ------------------------------------------------------------- destinations

/**
 * Choose where a batch of newly produced cargo is going.
 *
 * Candidates are the stations that take this cargo and that the network can
 * reach from here at all. The batch is split between the best few, weighted by
 * the reciprocal of the expected journey - so a nearby works gets most of a
 * mine's output and a distant one still gets some, and a town's passengers fan
 * out over the stops around it instead of all queueing for the nearest.
 *
 * Returns how many candidates were found; ids and weights are left in the
 * module scratch, normalised.
 */
function chooseDestinations(world: World, station: Station, cargo: Cargo): number {
  world.cargoLinks.ensureRouting(world);
  const graph = world.cargoLinks;
  let found = 0;

  for (let id = 0; id < world.stations.length; id++) {
    if (id === station.id) continue;
    const candidate = world.stations[id];
    if (candidate === undefined) continue;
    if (!stationAccepts(candidate, cargo)) continue;

    const cost = graph.expectedTicks(station.id, id);
    if (!Number.isFinite(cost)) continue;

    // Insertion sort into the top few. Ties break on the station id, so the
    // choice cannot depend on the order the stations were built in.
    let at = found < CARGO_DESTINATION_FANOUT ? found : CARGO_DESTINATION_FANOUT;
    while (at > 0 && candidateCosts[at - 1]! > cost) at--;
    if (at >= CARGO_DESTINATION_FANOUT) continue;

    for (let slot = CARGO_DESTINATION_FANOUT - 1; slot > at; slot--) {
      candidateIds[slot] = candidateIds[slot - 1]!;
      candidateCosts[slot] = candidateCosts[slot - 1]!;
    }
    candidateIds[at] = id;
    candidateCosts[at] = cost;
    if (found < CARGO_DESTINATION_FANOUT) found++;
  }
  if (found === 0) return 0;

  // Weights: the reciprocal of the journey, normalised. The +1 keeps a station
  // one tick away from taking the entire output of the region.
  let total = 0;
  for (let i = 0; i < found; i++) {
    const weight = 1 / (candidateCosts[i]! + 1);
    candidateCosts[i] = weight;
    total += weight;
  }
  for (let i = 0; i < found; i++) candidateCosts[i] = candidateCosts[i]! / total;
  return found;
}

/**
 * Put cargo produced nearby into a station, respecting its capacity, and give
 * every parcel of it a destination.
 *
 * Returns how much was actually taken - which is what tells an industry whether
 * anybody is collecting from it. Cargo the network cannot place goes in with no
 * destination and is written off after thirty days; that is deliberate, and it
 * is what a mine with no line to a works looks like.
 */
export function depositAtStation(
  world: World,
  station: Station,
  cargo: Cargo,
  amount: number,
): number {
  if (amount <= 0) return 0;

  let waiting = 0;
  for (const stack of station.waiting) waiting += stack.amount;

  const space = STATION_CARGO_CAPACITY - waiting;
  if (space <= 0) {
    station.overflowUnits += amount;
    return 0;
  }
  const accepted = amount < space ? amount : space;
  station.overflowUnits += amount - accepted;

  const found = chooseDestinations(world, station, cargo);
  if (found === 0) {
    addCargo(station.waiting, {
      cargo,
      amount: accepted,
      createdTick: world.tick,
      originStationId: station.id,
      destinationStationId: -1,
      paidFromX: station.x,
      paidFromY: station.y,
    });
    return accepted;
  }

  for (let i = 0; i < found; i++) {
    const share = accepted * candidateCosts[i]!;
    if (share <= 0) continue;
    addCargo(station.waiting, {
      cargo,
      amount: share,
      createdTick: world.tick,
      originStationId: station.id,
      destinationStationId: candidateIds[i]!,
      paidFromX: station.x,
      paidFromY: station.y,
    });
  }
  return accepted;
}

/**
 * Once a game day: re-read the network, give homeless parcels a destination and
 * write off the ones that never found one.
 *
 * A parcel keeps looking for as long as it is allowed to wait. A line built a
 * fortnight after a mine opened therefore finds coal waiting for it, which is
 * both what a player expects and what stops the first month of every chain being
 * thrown away.
 */
export function refreshCargoRouting(world: World): void {
  world.cargoLinks.refreshDaily(world);
  const cutoff = CARGO_MAX_WAIT_DAYS * TICKS_PER_DAY;

  for (const station of world.stations) {
    let dropped = false;

    for (const stack of station.waiting) {
      const known =
        stack.destinationStationId >= 0 &&
        Number.isFinite(world.cargoLinks.expectedTicks(station.id, stack.destinationStationId));
      if (known) continue;

      const found = chooseDestinations(world, station, stack.cargo);
      if (found > 0) {
        stack.destinationStationId = candidateIds[0]!;
        continue;
      }
      // Nowhere to go, and out of patience (section 7.4). The station wears the
      // loss: cargo nobody could ever move is a badly placed station, and the
      // rating is where the player is told so.
      stack.destinationStationId = -1;
      if (world.tick - stack.createdTick <= cutoff) continue;
      station.overflowUnits += stack.amount;
      stack.amount = 0;
      dropped = true;
    }

    if (dropped) compactStacks(station.waiting);
  }
}
