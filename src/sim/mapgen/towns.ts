import {
  TILES_PER_TOWN,
  TOWN_BUILT_RADIUS_MARGIN,
  TOWN_COUNT_MAX,
  TOWN_COUNT_MIN,
  TOWN_MAIN_ROAD_SPACING_MAX,
  TOWN_MAIN_ROAD_SPACING_MIN,
  TOWN_MAX_SLOPE,
  TOWN_MIN_DISTANCE,
  TOWN_ROAD_MAX_SLOPE,
  TOWN_SIZE_SHARES,
  TOWN_START_POPULATION,
  TOWN_START_RADIUS,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { Structure } from '../map/structures';
import { slopeRise, Terrain } from '../map/terrain';
import type { Rng } from '../rng';
import { BuildingKind, RoadBit, TownSize, type Town } from '../town/types';
import { PlaceNameGenerator } from './names';

/**
 * Step 5 of section 6: town placement, plus the road grid and building zones
 * from section 13.1.
 *
 * The layout is laid in five passes and the ORDER of them is the point
 * (D-216): the streets are laid over the ground the town can actually build
 * on, everything the centre cannot be driven to is dropped, the houses go up
 * along what is left, every street that ended up serving nothing is taken
 * away again, and only then is the ground under the survivors paved.
 * Laying the pavement first - which is what this file did until D-216 - paves
 * streets that are about to be removed and cannot be taken back, because the
 * terrain that was there is overwritten by the time anybody knows.
 */

/** Attempts per requested town before dart throwing gives up. */
const PLACEMENT_ATTEMPTS_PER_TOWN = 220;

/** Towns keep this far away from the map border so they can still be served. */
const BORDER_MARGIN = 8;

/** One building per this many inhabitants at founding. */
const INHABITANTS_PER_BUILDING = 100;

/** Even the smallest hamlet gets a crossroads and four houses. */
const MIN_BUILDINGS = 4;

/** How many towns a map of this size should have. */
export function targetTownCount(size: number): number {
  const byArea = Math.round((size * size) / TILES_PER_TOWN);
  return Math.min(TOWN_COUNT_MAX, Math.max(TOWN_COUNT_MIN, byArea));
}

/** A tile is a usable town centre if it is flat, dry and not on the border. */
function isValidCentre(map: TileMap, x: number, y: number): boolean {
  if (x < BORDER_MARGIN || y < BORDER_MARGIN) return false;
  if (x >= map.size - BORDER_MARGIN || y >= map.size - BORDER_MARGIN) return false;
  if (map.terrain[map.tileIndex(x, y)] === Terrain.Water) return false;
  return slopeRise(map.slopeAt(x, y)) <= TOWN_MAX_SLOPE;
}

/**
 * Dart throwing with a spatial grid, which gives the same minimum distance
 * guarantee as Bridson's algorithm at a fraction of the code. Cell size equals
 * the minimum distance, so only the 3x3 neighbourhood has to be checked.
 */
function placeCentres(map: TileMap, rng: Rng, wanted: number): Array<{ x: number; y: number }> {
  const cell = TOWN_MIN_DISTANCE;
  const gridSize = Math.ceil(map.size / cell);
  const grid = new Int32Array(gridSize * gridSize).fill(-1);
  const centres: Array<{ x: number; y: number }> = [];
  const minDistanceSq = TOWN_MIN_DISTANCE * TOWN_MIN_DISTANCE;

  const attempts = wanted * PLACEMENT_ATTEMPTS_PER_TOWN;
  for (let attempt = 0; attempt < attempts && centres.length < wanted; attempt++) {
    const x = rng.nextInt(map.size);
    const y = rng.nextInt(map.size);
    if (!isValidCentre(map, x, y)) continue;

    const cx = (x / cell) | 0;
    const cy = (y / cell) | 0;
    let blocked = false;

    for (let gy = cy - 1; gy <= cy + 1 && !blocked; gy++) {
      if (gy < 0 || gy >= gridSize) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= gridSize) continue;
        const occupant = grid[gy * gridSize + gx]!;
        if (occupant === -1) continue;
        const other = centres[occupant]!;
        const dx = other.x - x;
        const dy = other.y - y;
        if (dx * dx + dy * dy < minDistanceSq) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;

    grid[cy * gridSize + cx] = centres.length;
    centres.push({ x, y });
  }
  return centres;
}

/** Pick a size class from the configured distribution. */
function rollSizeClass(rng: Rng): TownSize {
  const roll = rng.nextFloat();
  if (roll < TOWN_SIZE_SHARES[0]) return TownSize.City;
  if (roll < TOWN_SIZE_SHARES[0] + TOWN_SIZE_SHARES[1]) return TownSize.Town;
  return TownSize.Village;
}

/**
 * Does a street run along this offset from the centre?
 *
 * Section 13.1's grid with a deliberate irregularity: main axes every 6 to 9
 * tiles, side streets halfway between them. The pattern is anchored on the
 * town centre and depends on the offset alone, so shortening the runs moves no
 * street - it only decides how far each one reaches.
 */
function isStreetOffset(offset: number, spacing: number, half: number): boolean {
  if (offset % spacing === 0) return true;
  return half > 0 && Math.abs(offset % spacing) === half;
}

/**
 * True if a town street may run over this tile.
 *
 * The ownership test is new with D-216 and it is what keeps the layout inside
 * the ground the town claimed (D-101): the grid used to be laid over the whole
 * SQUARE while `claimArea` claims a DISC, so every town wrote roads and
 * pavement onto four corners of open country it did not own.
 */
function streetPassable(map: TileMap, town: Town, x: number, y: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.townId[index] !== town.id) return false;
  if (map.terrain[index] === Terrain.Water) return false;
  return slopeRise(map.slopeAt(x, y)) <= TOWN_ROAD_MAX_SLOPE;
}

/** True if a house may stand on this tile - the town's own ground, buildable. */
function plotBuildable(map: TileMap, town: Town, x: number, y: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.townId[index] !== town.id) return false;
  if (map.terrain[index] === Terrain.Water) return false;
  if (map.buildingKind[index] !== BuildingKind.None) return false;
  if (map.roadBits[index] !== 0) return false;
  return slopeRise(map.slopeAt(x, y)) <= TOWN_MAX_SLOPE;
}

/**
 * Would a plot at this offset have a street to stand on?
 *
 * Asked of the street PATTERN rather than of the laid roads, because this runs
 * before anything is laid: a plot is never itself on a street line, so exactly
 * one of its four neighbours can be, and it is a street iff the ground there
 * carries one.
 */
function plotHasStreet(
  map: TileMap,
  town: Town,
  dx: number,
  dy: number,
  spacing: number,
  half: number,
): boolean {
  if (
    isStreetOffset(dx - 1, spacing, half) &&
    streetPassable(map, town, town.x + dx - 1, town.y + dy)
  ) {
    return true;
  }
  if (
    isStreetOffset(dx + 1, spacing, half) &&
    streetPassable(map, town, town.x + dx + 1, town.y + dy)
  ) {
    return true;
  }
  if (
    isStreetOffset(dy - 1, spacing, half) &&
    streetPassable(map, town, town.x + dx, town.y + dy - 1)
  ) {
    return true;
  }
  if (
    isStreetOffset(dy + 1, spacing, half) &&
    streetPassable(map, town, town.x + dx, town.y + dy + 1)
  ) {
    return true;
  }
  return false;
}

/**
 * How far the built-up area reaches: the ring at which the town has counted
 * enough plots for every house it has to put up, plus one ring of slack for
 * the streets those plots stand on.
 *
 * This is the answer to the defect the owner saw. `TOWN_START_RADIUS` is what a
 * town CLAIMS, and it is roughly twice what a starting population can fill: a
 * city of 8,000 wants 80 houses and its radius-10 grid offers some 200 plots,
 * so two thirds of its streets were laid through empty land and stopped there.
 * Measured before D-216, over 200 generated towns: 67.6 % of all town road
 * tiles touched no building at all, and the outermost house stood at 0.45 of
 * the radius the streets ran to.
 */
function builtRadiusFor(
  map: TileMap,
  town: Town,
  spacing: number,
  half: number,
  wanted: number,
): number {
  let plots = 0;
  for (let ring = 1; ring <= town.radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (isStreetOffset(dx, spacing, half) || isStreetOffset(dy, spacing, half)) continue;
        if (!plotBuildable(map, town, town.x + dx, town.y + dy)) continue;
        if (!plotHasStreet(map, town, dx, dy, spacing, half)) continue;
        plots++;
      }
    }
    if (plots >= wanted) return Math.min(town.radius, ring + TOWN_BUILT_RADIUS_MARGIN);
  }
  return town.radius;
}

/**
 * Lay one straight run of street and connect the tiles it actually reached.
 *
 * Writes road BITS and nothing else. A tile that ends the run with no bit set
 * - a lone passable tile in a lake, say - is therefore not a street at all,
 * where before D-216 it was paved ground with no road on it.
 */
function layStreetRun(
  map: TileMap,
  town: Town,
  fromX: number,
  fromY: number,
  stepX: number,
  stepY: number,
  length: number,
): void {
  let previousIndex = -1;
  for (let i = 0; i < length; i++) {
    const x = fromX + stepX * i;
    const y = fromY + stepY * i;

    if (!streetPassable(map, town, x, y)) {
      previousIndex = -1; // the run is interrupted by water, a cliff or a border
      continue;
    }

    const index = map.tileIndex(x, y);
    if (previousIndex !== -1) {
      if (stepX === 1) {
        map.roadBits[previousIndex] = map.roadBits[previousIndex]! | RoadBit.East;
        map.roadBits[index] = map.roadBits[index]! | RoadBit.West;
      } else {
        map.roadBits[previousIndex] = map.roadBits[previousIndex]! | RoadBit.South;
        map.roadBits[index] = map.roadBits[index]! | RoadBit.North;
      }
    }
    previousIndex = index;
  }
}

/**
 * Rectangular grid with a deliberate irregularity: main axes every 6 to 9
 * tiles, side streets halfway between them. Runs stop at water, at anything
 * steeper than the road limit and at the edge of the town's own ground, which
 * is what gives towns their organic outline without any extra logic.
 */
function layStreets(map: TileMap, town: Town, spacing: number, half: number, radius: number): void {
  const length = radius * 2 + 1;
  for (let offset = -radius; offset <= radius; offset++) {
    if (!isStreetOffset(offset, spacing, half)) continue;
    layStreetRun(map, town, town.x - radius, town.y + offset, 1, 0, length);
    layStreetRun(map, town, town.x + offset, town.y - radius, 0, 1, length);
  }
}

/**
 * Zone of a tile by its distance from the centre: shops inside, works outside.
 *
 * Measured against the town's CLAIMED radius and deliberately not against the
 * built-up one D-216 derives. The zones are the town's economy - a station's
 * `commercialShare` reads them and with it the M19 fare classes - so scaling
 * them to the streets would turn a street change into an economic one. On the
 * reference city the two readings differ by a whole band: at the built radius
 * the works start 5.6 tiles out instead of 8, and the outer third of every
 * town becomes industrial.
 */
function zoneFor(distance: number, radius: number): BuildingKind {
  if (distance < radius * 0.35) return BuildingKind.Commercial;
  if (distance < radius * 0.8) return BuildingKind.Residential;
  return BuildingKind.Industrial;
}

/** Place buildings on tiles that touch a street, from the centre outwards. */
function placeBuildings(map: TileMap, town: Town, radius: number, wanted: number): void {
  let placed = 0;

  // Ring by ring from the centre, so a town that runs out of room stays dense
  // instead of scattering houses along its outer edge.
  for (let ring = 1; ring <= radius && placed < wanted; ring++) {
    for (let dy = -ring; dy <= ring && placed < wanted; dy++) {
      for (let dx = -ring; dx <= ring && placed < wanted; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;

        const x = town.x + dx;
        const y = town.y + dy;
        if (!plotBuildable(map, town, x, y)) continue;

        const index = map.tileIndex(x, y);
        const touchesRoad =
          (x > 0 && map.roadBits[index - 1] !== 0) ||
          (x < map.size - 1 && map.roadBits[index + 1] !== 0) ||
          (y > 0 && map.roadBits[index - map.size] !== 0) ||
          (y < map.size - 1 && map.roadBits[index + map.size] !== 0);
        if (!touchesRoad) continue;

        // Both readings are against the CLAIMED radius, not the built one -
        // see `zoneFor`. The stage follows the zoning for the same reason: a
        // shorter street must not make a house taller.
        const distance = Math.sqrt(dx * dx + dy * dy);
        map.buildingKind[index] = zoneFor(distance, town.radius);
        map.buildingLevel[index] = distance < town.radius * 0.5 ? 2 : 1;
        placed++;
      }
    }
  }
}

/** A tile with something on it a street could exist for. */
function occupiedTile(map: TileMap, index: number): boolean {
  return map.buildingKind[index] !== BuildingKind.None || map.industryId[index] !== -1;
}

/** True if anything at all stands on this street or beside it. */
function streetServesSomething(map: TileMap, x: number, y: number): boolean {
  const index = map.tileIndex(x, y);
  if (map.trackBits[index] !== 0) return true;
  if (map.structure[index] !== Structure.None) return true;
  if (map.industryId[index] !== -1) return true;
  if (x > 0 && occupiedTile(map, index - 1)) return true;
  if (x < map.size - 1 && occupiedTile(map, index + 1)) return true;
  if (y > 0 && occupiedTile(map, index - map.size)) return true;
  return y < map.size - 1 && occupiedTile(map, index + map.size);
}

/** Index of the tile a single road bit points at. */
function neighbourOf(map: TileMap, index: number, bit: number): number {
  if (bit === RoadBit.West) return index - 1;
  if (bit === RoadBit.East) return index + 1;
  if (bit === RoadBit.North) return index - map.size;
  return index + map.size;
}

/** The bit the far end of a connection carries back. */
function oppositeBit(bit: number): number {
  if (bit === RoadBit.West) return RoadBit.East;
  if (bit === RoadBit.East) return RoadBit.West;
  if (bit === RoadBit.North) return RoadBit.South;
  return RoadBit.North;
}

/**
 * Throw away every street tile the town centre cannot be driven to.
 *
 * A run that crosses a river reaches the far bank and lays a fragment there;
 * the town has no bridge, so those tiles are a piece of street nobody can get
 * to. Measured on seed 360: eight houses of Nieder-Weidengrund stood on such a
 * fragment across a river. A flood fill from the centre is also what makes the
 * pruner's job well posed - after it, every street is part of ONE network, so
 * a removal can never cut the town in two.
 *
 * Iterative with an explicit queue (law #8), read in insertion order, so the
 * result is a set and the order is only how it is found (law #3).
 */
function keepStreetsReachedFromCentre(map: TileMap, town: Town, radius: number): void {
  const centre = map.tileIndex(town.x, town.y);
  if (map.roadBits[centre] === 0) return; // a centre with no street: leave it be

  const span = radius * 2 + 1;
  const queue = new Int32Array(span * span);
  const reached = new Uint8Array(span * span);
  const slotOf = (index: number): number => {
    const x = (index % map.size) - town.x + radius;
    const y = ((index / map.size) | 0) - town.y + radius;
    if (x < 0 || y < 0 || x >= span || y >= span) return -1;
    return y * span + x;
  };

  let head = 0;
  let tail = 0;
  queue[tail++] = centre;
  reached[slotOf(centre)] = 1;

  while (head < tail) {
    const index = queue[head++]!;
    const bits = map.roadBits[index]!;
    for (let bit = 1; bit <= RoadBit.South; bit <<= 1) {
      if ((bits & bit) === 0) continue;
      const next = neighbourOf(map, index, bit);
      const slot = slotOf(next);
      if (slot === -1 || reached[slot] === 1) continue;
      reached[slot] = 1;
      queue[tail++] = next;
    }
  }

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const index = map.tileIndex(x, y);
      if (map.roadBits[index] === 0) continue;
      if (reached[(dy + radius) * span + (dx + radius)] === 1) continue;
      map.roadBits[index] = 0;
    }
  }
}

/**
 * Take away every street that serves nothing, one leaf at a time, until none
 * is left.
 *
 * A street with one connection and nothing beside it is a stub running into
 * open country; removing it can turn its neighbour into the same thing, so the
 * sweep repeats to a fixed point (law #8 - iterative, an explicit sweep, never
 * recursion). The fixed point is UNIQUE and independent of the sweep order:
 * removing a leaf can only create leaves, never remove one, and a protected
 * tile is never taken - so the row-major order below decides how many sweeps
 * it takes and nothing about the result (law #3).
 *
 * **A street may be shortened, never dissolved.** Clearing a leaf clears the
 * bit its neighbour carried back, and if that was the neighbour's only bit the
 * neighbour becomes a tile with a road layer and no connection - not a street
 * at all, and the house beside it would be left with none. That case is
 * refused rather than repaired afterwards, which is the whole of why the
 * "every house has a street" assertion in `mapgen.spec.ts` holds.
 *
 * Nothing but a building can stand beside a street while the map is being
 * generated - stations are the player's and industries are placed afterwards -
 * but the test asks about track, bridges and industry too, because M20 grows
 * towns with the same rule over a played map.
 */
function pruneUnservedStreets(map: TileMap, town: Town, radius: number): void {
  let removed = true;
  while (removed) {
    removed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = town.x + dx;
        const y = town.y + dy;
        if (!map.contains(x, y)) continue;

        const index = map.tileIndex(x, y);
        const bits = map.roadBits[index]!;
        if (bits === 0) continue;
        // Exactly one connection: a power of two, and zero is already out.
        if ((bits & (bits - 1)) !== 0) continue;
        if (streetServesSomething(map, x, y)) continue;

        const neighbour = neighbourOf(map, index, bits);
        const back = oppositeBit(bits);
        if (map.roadBits[neighbour] === back) continue; // would dissolve the pair

        map.roadBits[index] = 0;
        map.roadBits[neighbour] = map.roadBits[neighbour]! & ~back;
        removed = true;
      }
    }
  }
}

/**
 * Pave what the town built on, once, at the end.
 *
 * Two passes and the second one is what makes the settled area a SURFACE
 * rather than a lattice: a tile with no street and no house whose four
 * neighbours are all built on is a yard inside the town, not open country, and
 * leaving it green cut the town up into islands one tile wide. The test reads
 * the road and building layers and never the terrain it is writing, so the
 * result does not depend on the direction of the sweep (law #3).
 */
function paveTownGround(map: TileMap, town: Town, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const index = map.tileIndex(x, y);
      if (map.townId[index] !== town.id) continue;
      if (map.roadBits[index] === 0 && map.buildingKind[index] === BuildingKind.None) continue;
      map.terrain[index] = Terrain.TownGround;
    }
  }

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y) || x === 0 || y === 0 || x === map.size - 1 || y === map.size - 1) {
        continue;
      }
      const index = map.tileIndex(x, y);
      if (map.townId[index] !== town.id) continue;
      if (map.terrain[index] === Terrain.Water) continue;
      if (map.roadBits[index] !== 0 || map.buildingKind[index] !== BuildingKind.None) continue;
      if (!builtTile(map, index - 1)) continue;
      if (!builtTile(map, index + 1)) continue;
      if (!builtTile(map, index - map.size)) continue;
      if (!builtTile(map, index + map.size)) continue;
      map.terrain[index] = Terrain.TownGround;
    }
  }
}

/** A tile the town has put a street or a house on. */
function builtTile(map: TileMap, index: number): boolean {
  return map.roadBits[index] !== 0 || map.buildingKind[index] !== BuildingKind.None;
}

/** Claim every tile inside the town radius for the town. */
function claimArea(map: TileMap, town: Town): void {
  const r = town.radius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      if (dx * dx + dy * dy > r * r) continue;
      map.townId[map.tileIndex(x, y)] = town.id;
    }
  }
}

/**
 * Lay one town out on the ground it has just claimed.
 *
 * The single draw from the generator is the street spacing, taken first and
 * exactly once, so the built radius derived from it cannot move any later
 * draw: town centres, names, size classes and the industry pass all keep the
 * stream position they had (law #3).
 */
function layOutTown(map: TileMap, town: Town, rng: Rng): void {
  const spacing = rng.nextRange(TOWN_MAIN_ROAD_SPACING_MIN, TOWN_MAIN_ROAD_SPACING_MAX);
  const half = spacing >> 1;
  const wanted = Math.max(MIN_BUILDINGS, Math.round(town.population / INHABITANTS_PER_BUILDING));
  const radius = builtRadiusFor(map, town, spacing, half, wanted);

  layStreets(map, town, spacing, half, radius);
  keepStreetsReachedFromCentre(map, town, radius);
  placeBuildings(map, town, radius, wanted);
  pruneUnservedStreets(map, town, radius);
  paveTownGround(map, town, radius);
}

/** Create every town of the map, laid out and claimed. */
export function generateTowns(map: TileMap, rng: Rng): Town[] {
  const centres = placeCentres(map, rng, targetTownCount(map.size));
  const names = new PlaceNameGenerator(rng);
  const towns: Town[] = [];

  for (let i = 0; i < centres.length; i++) {
    const centre = centres[i]!;
    const sizeClass = rollSizeClass(rng);
    const town: Town = {
      id: i,
      name: names.next(),
      x: centre.x,
      y: centre.y,
      sizeClass,
      population: TOWN_START_POPULATION[sizeClass],
      radius: TOWN_START_RADIUS[sizeClass],
      producedThisMonth: 0,
      transportedThisMonth: 0,
      transportedByCompany: [],
      councilRating: [],
      councilGoodwill: [],
      exclusiveCompanyId: -1,
      exclusiveUntilTick: 0,
      measureReadyTick: [],
      goodsDeliveredThisMonth: 0,
      foodDeliveredThisMonth: 0,
    };
    towns.push(town);

    claimArea(map, town);
    layOutTown(map, town, rng);
  }
  return towns;
}
