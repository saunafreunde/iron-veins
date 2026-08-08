import { MAX_VEHICLES } from '../constants';
import { refusedTile } from '../vehicles/reservations';
import { VehicleKind } from '../vehicles/spec';
import type { World } from '../World';

/**
 * The deadlock CYCLE detector of SPEC2 M15 - the upgrade of the 9.3 warning.
 *
 * Section 9.3 has had a clock since M4: a train that has stood still for
 * DEADLOCK_WARN_TICKS is stuck, the news log says so and the F3 overlay
 * blinks it. What the clock cannot say is WHY, and the two answers a player
 * has to tell apart look identical from one train: a queue in front of a busy
 * block resolves on its own, and a ring of trains each holding what the next
 * one needs never does. This finds the ring.
 *
 * It composes with the two decisions that taught the clock to see (rather
 * than repeating them):
 *
 *  - D-083 taught it the train that never reaches a signal at all - standing
 *    still holding nothing beyond its own body;
 *  - D-157 widened it to "standing still mid-route, WHATEVER it holds", which
 *    is the arrival-gate freeze finishing that arc.
 *
 * So the membership test here is not a third definition of stuck: it is
 * `waitingSinceTick`, the clock those two decisions own, plus the one thing a
 * cycle additionally needs - a NAMED other train refusing this one. A train
 * standing still for a reason nobody caused is stuck, not deadlocked, and
 * stays the plain warning.
 *
 * THE GRAPH IS DERIVED AND HAS OUT-DEGREE ONE. Every node is a stuck train
 * and its single edge points at the train holding the first tile its next
 * claim needs (`refusedTile`, which is `tryClaim`'s own test read backwards).
 * A functional graph makes cycle detection a walk: follow the pointers,
 * colouring nodes on the current walk, and a walk that re-enters its own
 * colour has found a ring. ITERATIVE with an explicit walk buffer
 * (architecture law #8), O(trains), and allocation-free apart from the small
 * result object - it runs once per game day from the news pass, never in the
 * tick.
 *
 * NO AUTO-FIX. SPEC.md Fehler 18 by name: the game helps the player FIND a
 * deadlock and never resolves one. Nothing here writes to the world.
 */

/** Colours of the walk: unvisited, on the current walk, finished. */
const UNVISITED = 0;
const ON_WALK = 1;
const DONE = 2;

/**
 * Per-vehicle working arrays. Module level and reused, the `waitingOrder`
 * precedent in vehicles/update.ts: the pass is never concurrent and never
 * re-entered.
 */
const refusedAt = new Int32Array(MAX_VEHICLES);
const waitsFor = new Int32Array(MAX_VEHICLES);
const queueLength = new Int32Array(MAX_VEHICLES);
const inCycle = new Uint8Array(MAX_VEHICLES);
const colour = new Uint8Array(MAX_VEHICLES);
const walkPosition = new Int32Array(MAX_VEHICLES);
const walk = new Int32Array(MAX_VEHICLES);
const waiters = new Int32Array(MAX_VEHICLES);
const cycleMembers = new Int32Array(MAX_VEHICLES);
const cycleStarts = new Int32Array(MAX_VEHICLES + 1);

/**
 * What one pass over the waiting graph found.
 *
 * The arrays are indexed BY VEHICLE ID and are the module's own buffers -
 * read them before calling again. Everything a caller needs to classify a
 * stuck train is here: whether somebody is refusing it, who, how many trains
 * are queueing for the same tile, and whether it sits in a ring.
 */
export interface DeadlockReport {
  /** Stuck trains that a named other train is refusing, ascending id. */
  readonly waiters: Int32Array;
  readonly waiterCount: number;
  /** Per vehicle id: the tile it is refused at, or -1. */
  readonly refusedAt: Int32Array;
  /** Per vehicle id: the train holding that tile, or -1. */
  readonly waitsFor: Int32Array;
  /** Per vehicle id: how many waiters are refused at the SAME tile. */
  readonly queueLength: Int32Array;
  /** Per vehicle id: 1 when the train is part of a cycle. */
  readonly inCycle: Uint8Array;
  /** How many cycles were found. */
  readonly cycleCount: number;
  /** Cycle i occupies members[starts[i] .. starts[i + 1] - 1]. */
  readonly cycleStarts: Int32Array;
  /** Members of every cycle, each ring rotated to start at its lowest id. */
  readonly cycleMembers: Int32Array;
}

/**
 * Build the waiting graph and search it for cycles.
 *
 * `minWaitTicks` is the 9.3 threshold: a train is considered only once the
 * clock this milestone did not invent has already called it stuck. A ring
 * that forms and resolves inside a minute was a queue, and reporting it would
 * make the message mean less than the one it upgrades - the M15 reroute
 * (D-184) exists precisely so that some of those resolve themselves.
 */
export function analyseDeadlocks(world: World, minWaitTicks: number): DeadlockReport {
  const vehicles = world.vehicles;
  const count = vehicles.count;
  refusedAt.fill(-1, 0, count);
  waitsFor.fill(-1, 0, count);
  queueLength.fill(0, 0, count);
  inCycle.fill(0, 0, count);
  colour.fill(UNVISITED, 0, count);

  let waiterCount = 0;
  for (let id = 0; id < count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    // Only trains claim track, so only trains can refuse one another.
    if (vehicles.kind[id] !== VehicleKind.Train) continue;
    const since = vehicles.waitingSinceTick[id]!;
    if (since < 0 || world.tick - since < minWaitTicks) continue;

    const tile = refusedTile(world, id);
    if (tile < 0) continue;
    const owner = world.reservations.ownerOf(tile);
    if (owner < 0 || owner === id) continue;

    refusedAt[id] = tile;
    waitsFor[id] = owner;
    waiters[waiterCount++] = id;
  }

  // How many of them are queueing for the identical tile. Quadratic in the
  // number of STUCK trains, which is a handful even on the M4 regression
  // network - never in the fleet.
  for (let i = 0; i < waiterCount; i++) {
    const id = waiters[i]!;
    let sharing = 0;
    for (let k = 0; k < waiterCount; k++) {
      if (refusedAt[waiters[k]!] === refusedAt[id]!) sharing++;
    }
    queueLength[id] = sharing;
  }

  const cycleCount = findCycles(waiterCount);
  return {
    waiters,
    waiterCount,
    refusedAt,
    waitsFor,
    queueLength,
    inCycle,
    cycleCount,
    cycleStarts,
    cycleMembers,
  };
}

/**
 * Walk the functional graph and record every ring. Returns the cycle count.
 *
 * Each node is entered at most once as `UNVISITED`, so the whole search is
 * linear however the pointers are tangled. A walk ends three ways: at a train
 * nobody is refusing (`waitsFor` -1, the common case - the train ahead is
 * simply moving), at a node an earlier walk already finished (no new ring),
 * or at a node of the walk itself, which IS the ring.
 */
function findCycles(waiterCount: number): number {
  let cycles = 0;
  let members = 0;
  cycleStarts[0] = 0;

  for (let i = 0; i < waiterCount; i++) {
    const seed = waiters[i]!;
    if (colour[seed] !== UNVISITED) continue;

    let length = 0;
    let node = seed;
    while (node >= 0 && colour[node] === UNVISITED) {
      colour[node] = ON_WALK;
      walkPosition[node] = length;
      walk[length++] = node;
      node = waitsFor[node]!;
    }

    if (node >= 0 && colour[node] === ON_WALK) {
      const start = walkPosition[node]!;
      const ringLength = length - start;
      // Rotate the ring to start at its lowest id: a canonical form, so the
      // same deadlock reads the same way whichever train the outer loop
      // happened to reach first - and the news key it produces is stable.
      let lowest = start;
      for (let k = start + 1; k < length; k++) {
        if (walk[k]! < walk[lowest]!) lowest = k;
      }
      for (let step = 0; step < ringLength; step++) {
        const member = walk[start + ((lowest - start + step) % ringLength)]!;
        inCycle[member] = 1;
        cycleMembers[members++] = member;
      }
      cycles++;
      cycleStarts[cycles] = members;
    }

    for (let k = 0; k < length; k++) colour[walk[k]!] = DONE;
  }
  return cycles;
}
