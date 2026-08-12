import type { TileMap } from '../map/TileMap';
import type { World } from '../World';
import type { BenchmarkClaims } from './types';

/**
 * What a built benchmark world actually contains (SPEC2 M22).
 *
 * These are the numbers a benchmark map CLAIMS in its file, read back off the
 * world its log built. The point is the D-197 one: a percentile printed over an
 * unnamed world is a number without a subject, and a fixture that lost half its
 * commands to a map-generation change would print one happily.
 *
 * Everything here walks whole tile layers, so nothing in this file may be
 * called from inside `tick()` (law #7). It is called exactly twice per
 * benchmark - once by the suite, once by the worker - and both times before
 * the clock starts.
 */

/**
 * Directed track arcs on the map - the "edges" architecture law #8 counts.
 *
 * One arc is one direction bit on one tile: a plain-line tile in the middle of
 * a straight carries two (the way in and the way out), a dead end one, a
 * junction three or more. That is the same vocabulary the rail pathfinder
 * searches over (tile plus direction, D-042's own measure), which is why this
 * and not "track tiles" is the honest reading of "a rail graph reaches 100k
 * edges" - a graph is its arcs.
 */
export function railArcCount(map: TileMap): number {
  let arcs = 0;
  for (let tile = 0; tile < map.trackBits.length; tile++) {
    let bits = map.trackBits[tile]!;
    while (bits !== 0) {
      arcs += bits & 1;
      bits >>>= 1;
    }
  }
  return arcs;
}

/**
 * Tiles where three or more directions leave - junctions in the D-055 sense.
 *
 * Two is plain line and one is a dead end; three is where a train chooses, and
 * where no signal may stand. A mega-junction map is a map with a lot of these.
 */
export function railJunctionCount(map: TileMap): number {
  let junctions = 0;
  for (let tile = 0; tile < map.trackBits.length; tile++) {
    let bits = map.trackBits[tile]!;
    let degree = 0;
    while (bits !== 0) {
      degree += bits & 1;
      bits >>>= 1;
    }
    if (degree >= 3) junctions++;
  }
  return junctions;
}

/** Distinct land masses of the generated ground (the derived layer, never saved). */
export function landmassCount(map: TileMap): number {
  const seen = new Set<number>();
  for (let tile = 0; tile < map.landmassId.length; tile++) {
    const id = map.landmassId[tile]!;
    if (id >= 0) seen.add(id);
  }
  return seen.size;
}

/** Read every claim a benchmark map makes off the world its log built. */
export function measureBenchmarkWorld(world: World): BenchmarkClaims {
  return {
    vehicles: world.vehicles.livingCount,
    stations: world.stations.length,
    towns: world.towns.length,
    industries: world.industries.length,
    railArcs: railArcCount(world.map),
    railJunctions: railJunctionCount(world.map),
    landmasses: landmassCount(world.map),
  };
}

/**
 * Every claim, in the order they are reported - written out rather than read
 * off the object, so the message a red build prints cannot depend on key order.
 */
const CLAIM_KEYS: readonly (keyof BenchmarkClaims)[] = [
  'vehicles',
  'stations',
  'towns',
  'industries',
  'railArcs',
  'railJunctions',
  'landmasses',
];

/** The first claim that came back different, as a sentence, or null. */
export function claimMismatch(expected: BenchmarkClaims, actual: BenchmarkClaims): string | null {
  for (const key of CLAIM_KEYS) {
    if (expected[key] !== actual[key]) {
      return `${key}: the log claims ${expected[key]}, the world it built has ${actual[key]}`;
    }
  }
  return null;
}
