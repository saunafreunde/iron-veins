import {
  TILES_PER_TOWN,
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
import { slopeRise, Terrain } from '../map/terrain';
import type { Rng } from '../rng';
import { BuildingKind, RoadBit, TownSize, type Town } from '../town/types';
import { PlaceNameGenerator } from './names';

/**
 * Step 5 of section 6: town placement, plus the road grid and building zones
 * from section 13.1.
 */

/** Attempts per requested town before dart throwing gives up. */
const PLACEMENT_ATTEMPTS_PER_TOWN = 220;

/** Towns keep this far away from the map border so they can still be served. */
const BORDER_MARGIN = 8;

/** One building per this many inhabitants at founding. */
const INHABITANTS_PER_BUILDING = 100;

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

/** True if a road may run between two orthogonally adjacent tiles. */
function roadPassable(map: TileMap, x: number, y: number): boolean {
  if (!map.contains(x, y)) return false;
  if (map.terrain[map.tileIndex(x, y)] === Terrain.Water) return false;
  return slopeRise(map.slopeAt(x, y)) <= TOWN_ROAD_MAX_SLOPE;
}

/** Lay one straight run of road and connect the tiles it actually reached. */
function layRoadRun(
  map: TileMap,
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

    if (!roadPassable(map, x, y)) {
      previousIndex = -1; // the run is interrupted by water or a cliff
      continue;
    }

    const index = map.tileIndex(x, y);
    map.terrain[index] = Terrain.TownGround;

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
 * tiles, side streets halfway between them. Runs stop at water and at anything
 * steeper than the road limit, which is what gives towns their organic outline
 * without any extra logic.
 */
function layRoadGrid(map: TileMap, town: Town, rng: Rng): void {
  const spacing = rng.nextRange(TOWN_MAIN_ROAD_SPACING_MIN, TOWN_MAIN_ROAD_SPACING_MAX);
  const half = spacing >> 1;
  const r = town.radius;
  const length = r * 2 + 1;

  for (let offset = -r; offset <= r; offset++) {
    const isMain = offset % spacing === 0;
    const isSide = half > 0 && Math.abs(offset % spacing) === half;
    if (!isMain && !isSide) continue;

    layRoadRun(map, town.x - r, town.y + offset, 1, 0, length);
    layRoadRun(map, town.x + offset, town.y - r, 0, 1, length);
  }
}

/** Zone of a tile by its distance from the centre: shops inside, works outside. */
function zoneFor(distance: number, radius: number): BuildingKind {
  if (distance < radius * 0.35) return BuildingKind.Commercial;
  if (distance < radius * 0.8) return BuildingKind.Residential;
  return BuildingKind.Industrial;
}

/** Place buildings on tiles that touch a road, from the centre outwards. */
function placeBuildings(map: TileMap, town: Town): void {
  const wanted = Math.max(4, Math.round(town.population / INHABITANTS_PER_BUILDING));
  const r = town.radius;
  let placed = 0;

  // Ring by ring from the centre, so a town that runs out of room stays dense
  // instead of scattering houses along its outer edge.
  for (let ring = 1; ring <= r && placed < wanted; ring++) {
    for (let dy = -ring; dy <= ring && placed < wanted; dy++) {
      for (let dx = -ring; dx <= ring && placed < wanted; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;

        const x = town.x + dx;
        const y = town.y + dy;
        if (!map.contains(x, y)) continue;

        const index = map.tileIndex(x, y);
        if (map.terrain[index] === Terrain.Water) continue;
        if (map.roadBits[index] !== 0) continue;
        if (map.buildingKind[index] !== BuildingKind.None) continue;
        if (slopeRise(map.slopeAt(x, y)) > TOWN_MAX_SLOPE) continue;

        const touchesRoad =
          (x > 0 && map.roadBits[index - 1] !== 0) ||
          (x < map.size - 1 && map.roadBits[index + 1] !== 0) ||
          (y > 0 && map.roadBits[index - map.size] !== 0) ||
          (y < map.size - 1 && map.roadBits[index + map.size] !== 0);
        if (!touchesRoad) continue;

        const distance = Math.sqrt(dx * dx + dy * dy);
        map.buildingKind[index] = zoneFor(distance, r);
        map.buildingLevel[index] = distance < r * 0.5 ? 2 : 1;
        map.terrain[index] = Terrain.TownGround;
        placed++;
      }
    }
  }
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
    };
    towns.push(town);

    claimArea(map, town);
    layRoadGrid(map, town, rng);
    placeBuildings(map, town);
  }
  return towns;
}
