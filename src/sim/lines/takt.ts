import { CONNECTION_WAIT_MAX_TICKS, MAX_VEHICLES } from '../constants';
import { OrderTarget, VehicleState } from '../vehicles/VehicleStore';
import { scheduleOf } from './LineStore';
import type { Station } from '../station/types';
import type { World } from '../World';

/**
 * The takt and the connection protection of section 12.3 (SPEC2 M11, E-07).
 *
 * Everything here runs at STOP events - arrival and departure - never per
 * tick per vehicle: the per-tick share of a wait is one integer compare in
 * the state machine, exactly like a loading countdown. The slot arithmetic
 * is pure integer mathematics over (tick, takt, offset) and draws ZERO
 * randomness, not even a named stream (E-07, D-093 precedent).
 *
 * The waiting graph of the connection protection is DERIVED (D-054 pattern):
 * an edge "A waits for B" is a function of current state - A stands at a
 * transfer node in WaitingForConnection, B is inbound to it - and is rebuilt
 * from the stores wherever it is asked; nothing about the graph is ever
 * saved. Cycle search is iterative (law #8), and a wait that would close a
 * cycle is never entered - which IS the immediate break the spec demands,
 * because an edge can only appear at the moment a wait starts.
 */

/** Takt of the line a vehicle runs, or 0: off, no line, or a dead line. */
export function taktOf(world: World, id: number): number {
  const lineId = world.vehicles.lineId[id]!;
  if (lineId < 0 || world.lines.alive[lineId] !== 1) return 0;
  return world.lines.taktTicks[lineId]!;
}

/** True when this vehicle is standing at a station working a stop. */
function standingAtStop(state: number): boolean {
  return (
    state === VehicleState.Loading ||
    state === VehicleState.WaitingForCargo ||
    state === VehicleState.WaitingForSlot ||
    state === VehicleState.WaitingForConnection
  );
}

/**
 * The first slot of the line's grid at or after `notBefore` that no OTHER
 * vehicle of the same line standing at this station has latched.
 *
 * The grid is `offset + n * takt`; the skip rule is what spaces a bunched
 * pair back out to one takt apart: the second arrival finds the slot taken
 * and is pushed one takt further. Arrivals are processed in tick order and
 * ties inside one tick in the deterministic step order, so the choice is a
 * pure function of state. Integer arithmetic only - no randomness (E-07).
 */
export function nextFreeSlotTick(
  world: World,
  id: number,
  lineId: number,
  stationId: number,
  notBefore: number,
): number {
  const takt = world.lines.taktTicks[lineId]!;
  const offset = world.lines.taktOffsetTicks[lineId]!;

  let slot = offset;
  if (notBefore > offset) {
    const since = notBefore - offset;
    slot = offset + (((since + takt - 1) / takt) | 0) * takt;
  }

  const vehicles = world.vehicles;
  for (;;) {
    let taken = false;
    for (let other = 0; other < vehicles.count; other++) {
      if (other === id || vehicles.alive[other] !== 1) continue;
      if (vehicles.lineId[other] !== lineId) continue;
      if (vehicles.taktDueTick[other] !== slot) continue;
      if (vehicles.lastStationId[other] !== stationId) continue;
      if (!standingAtStop(vehicles.state[other]!)) continue;
      taken = true;
      break;
    }
    if (!taken) return slot;
    slot += takt;
  }
}

/**
 * The takt point of a line: the index of its FIRST station order - its
 * Startbahnhof - or -1 for a line with no station stop.
 *
 * ONE takt point per line, deliberately. A grid enforced at every stop
 * quantises every LEG up to a whole takt: a line whose legs measure 19 and
 * 27 days against a 22-day takt then needs 1 + 2 = three takts per round,
 * and its stations see service at alternating [T, 2T] gaps - the takt
 * making regularity WORSE. Anchored at one point, the round rounds up once,
 * the departures leave the Startbahnhof every takt, and every later stop
 * inherits that spacing shifted by the (measured) legs - which is what a
 * clock-face timetable is.
 */
export function taktAnchorIndex(orders: readonly { target: number }[]): number {
  for (let index = 0; index < orders.length; index++) {
    if (orders[index]!.target === OrderTarget.Station) return index;
  }
  return -1;
}

/**
 * Latch the takt slot a vehicle owes this stop. Called from `serveStation`,
 * i.e. at ARRIVAL - the takt point is the platform the vehicle is standing
 * at, and only the line's anchor stop is ever a takt point (E-07: never a
 * waypoint, never a depot, never open line, never an intermediate stop).
 */
export function latchTaktSlot(world: World, id: number, station: Station): void {
  const lineId = world.vehicles.lineId[id]!;
  if (lineId < 0 || world.lines.alive[lineId] !== 1) return;
  if (world.lines.taktTicks[lineId]! <= 0) return;
  const orders = world.lines.orders[lineId]!;
  const anchor = taktAnchorIndex(orders);
  if (anchor < 0) return;
  if (orders.length > 0 && world.vehicles.orderIndex[id]! % orders.length !== anchor) return;
  if (orders[anchor]!.targetId !== station.id) return;
  world.vehicles.taktDueTick[id] = nextFreeSlotTick(world, id, lineId, station.id, world.tick);
}

/**
 * Resolve a finished stop against the latched slot: true parks the caller in
 * WaitingForSlot until its departure slot.
 *
 * A vehicle that is READY past its slot does not bolt off-grid: it records
 * how late it ran and slips to the NEXT free slot. Every anchor departure
 * therefore leaves ON the grid, which is what keeps two vehicles' phases
 * locked a takt apart - an off-grid departure was tried first and produced
 * exactly the irregularity the takt exists to remove: one late round and the
 * pair drifted into [10, 42]-day gaps that never re-converged, because
 * phases only re-sort when both vehicles stand at the anchor together.
 */
export function beginSlotWait(world: World, id: number): boolean {
  const vehicles = world.vehicles;
  const due = vehicles.taktDueTick[id]!;
  if (due < 0) return false;
  const lineId = vehicles.lineId[id]!;
  if (taktOf(world, id) <= 0) {
    // The takt was switched off (or the line dissolved) under the latch.
    vehicles.taktDueTick[id] = -1;
    return false;
  }
  if (world.tick > due) {
    // Missed: the recorded delay is the slip to the slot actually taken -
    // whole takts, the unit the timetable thinks in (section 12.3).
    const stationId = vehicles.lastStationId[id]!;
    const next = nextFreeSlotTick(world, id, lineId, stationId, world.tick);
    vehicles.taktDelayTicks[id] = next - due;
    vehicles.taktDueTick[id] = next;
  } else {
    vehicles.taktDelayTicks[id] = 0;
  }
  if (world.tick < vehicles.taktDueTick[id]!) {
    vehicles.state[id] = VehicleState.WaitingForSlot;
    return true;
  }
  // Ready in the very tick of the slot: depart now, on time.
  vehicles.taktDueTick[id] = -1;
  return false;
}

/** A slot wait that ran its course: the vehicle departs on its slot. */
export function finishSlotWait(world: World, id: number): void {
  world.vehicles.taktDueTick[id] = -1;
}

/** Drop the latched holds - the stop they belonged to is over or gone. */
export function dropLatchedHolds(world: World, id: number): void {
  world.vehicles.taktDueTick[id] = -1;
  world.vehicles.connectionDeadlineTick[id] = -1;
}

/**
 * Everything a stopped journey leaves behind: the holds AND the displayed
 * delay. For the stop command and its relatives; an ordinary waypoint or
 * depot dwell drops only the holds, because the delay of the last takt
 * departure is still the truth the panel should show.
 */
export function clearStopHolds(world: World, id: number): void {
  dropLatchedHolds(world, id);
  world.vehicles.taktDelayTicks[id] = 0;
}

/**
 * Is `other` a connecting vehicle the group of `id` is waiting on at
 * `stationId`? Same owner, a DIFFERENT line, and genuinely inbound: its
 * current order targets this station and it is under way towards it. A
 * vehicle standing at some station is never "inbound" anywhere - its current
 * order is the stop it stands at - which is what makes the waiting graph
 * acyclic by construction: edges only ever point from a standing vehicle to
 * a moving one, and a moving vehicle waits for nobody.
 */
function isInboundConnector(world: World, id: number, other: number, stationId: number): boolean {
  const vehicles = world.vehicles;
  if (other === id || vehicles.alive[other] !== 1) return false;
  if (vehicles.ownerId[other] !== vehicles.ownerId[id]) return false;
  const otherLine = vehicles.lineId[other]!;
  if (otherLine < 0 || otherLine === vehicles.lineId[id]) return false;

  const state = vehicles.state[other]!;
  const underWay =
    state === VehicleState.Driving ||
    state === VehicleState.Braking ||
    state === VehicleState.WaitingForPath ||
    state === VehicleState.Holding ||
    state === VehicleState.BrokenDown;
  if (!underWay) return false;

  const orders = scheduleOf(world, other);
  if (orders.length === 0) return false;
  const order = orders[vehicles.orderIndex[other]! % orders.length]!;
  return order.target === OrderTarget.Station && order.targetId === stationId;
}

/**
 * Iterative self-reachability over a directed relation (law #8): does a walk
 * along `edges` starting from the vertices already on `stack` (the first
 * `stackSize` entries) ever reach `self`?
 *
 * Factored out and exported so the cycle guard is a function a test can feed
 * a PLANTED cycle - the acyclicity argument above is by construction, and a
 * guard whose failure mode cannot be exercised is a comment, not a guard.
 * `edges(vertex, out)` writes the vertex's successors into `out` and returns
 * how many.
 */
export function reachesSelf(
  self: number,
  stack: Int32Array,
  stackSize: number,
  visited: Uint8Array,
  edges: (vertex: number, out: Int32Array, at: number) => number,
): boolean {
  let top = stackSize;
  while (top > 0) {
    const vertex = stack[--top]!;
    if (vertex === self) return true;
    if (visited[vertex] === 1) continue;
    visited[vertex] = 1;
    top = edges(vertex, stack, top);
  }
  return false;
}

/** Scratch for the cycle walk; stops are sequential, never concurrent. */
const walkStack = new Int32Array(MAX_VEHICLES);
const walkVisited = new Uint8Array(MAX_VEHICLES);

/** Successors of `vertex` in the derived waiting graph, pushed onto `out`. */
function pushWaitEdges(world: World, vertex: number, out: Int32Array, at: number): number {
  const vehicles = world.vehicles;
  // Only a vehicle holding a departure has outgoing edges; everything it
  // could wait for is at the station it stands at.
  if (vehicles.state[vertex] !== VehicleState.WaitingForConnection) return at;
  const stationId = vehicles.lastStationId[vertex]!;
  if (stationId < 0) return at;
  let top = at;
  for (let other = 0; other < vehicles.count; other++) {
    if (isInboundConnector(world, vertex, other, stationId)) out[top++] = other;
  }
  return top;
}

/**
 * Begin a connection hold at a transfer node, when one is owed: the station
 * is marked, the vehicle's line runs a takt (section 12.3 is the per-line
 * timetable feature - no takt, no Anschlusssicherung), at least one
 * connecting vehicle is inbound, and waiting for it closes no cycle in the
 * derived waiting graph. Returns true when the vehicle is now holding.
 */
export function beginConnectionHold(world: World, id: number, station: Station): boolean {
  if (!station.transferNode) return false;
  if (taktOf(world, id) <= 0) return false;

  const vehicles = world.vehicles;
  let seeds = 0;
  for (let other = 0; other < vehicles.count; other++) {
    if (isInboundConnector(world, id, other, station.id)) walkStack[seeds++] = other;
  }
  if (seeds === 0) return false;

  walkVisited.fill(0, 0, vehicles.count);
  if (
    reachesSelf(id, walkStack, seeds, walkVisited, (vertex, out, at) =>
      pushWaitEdges(world, vertex, out, at),
    )
  ) {
    // A cycle: somebody this vehicle would wait for is - transitively -
    // waiting for it. The wait is broken before it starts (E-07).
    return false;
  }

  vehicles.state[id] = VehicleState.WaitingForConnection;
  vehicles.connectionDeadlineTick[id] = world.tick + CONNECTION_WAIT_MAX_TICKS;
  return true;
}

/**
 * An arrival releases the holds it satisfies: every vehicle of the same
 * group holding at this station for a connection may now depart. Called from
 * `serveStation` - the arrival IS the stop event the release happens at. The
 * hold is expired rather than the state rewritten, so the waiter runs its
 * own departure sequence (slot wait included) on its next step.
 */
export function releaseConnectionWaiters(world: World, arrivedId: number, station: Station): void {
  const vehicles = world.vehicles;
  const arrivedLine = vehicles.lineId[arrivedId]!;
  if (arrivedLine < 0) return;
  const owner = vehicles.ownerId[arrivedId]!;

  for (let other = 0; other < vehicles.count; other++) {
    if (other === arrivedId || vehicles.alive[other] !== 1) continue;
    if (vehicles.state[other] !== VehicleState.WaitingForConnection) continue;
    if (vehicles.ownerId[other] !== owner) continue;
    const otherLine = vehicles.lineId[other]!;
    if (otherLine < 0 || otherLine === arrivedLine) continue;
    if (vehicles.lastStationId[other] !== station.id) continue;
    vehicles.connectionDeadlineTick[other] = world.tick;
  }
}
