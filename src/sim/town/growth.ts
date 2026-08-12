import {
  MAX_STATIONS,
  STATION_CATCHMENT_SCAN_RADIUS,
  TICKS_PER_DAY,
  TILE_PUBLIC,
  TOWN_GROWTH_ROAD_TILES_PER_MONTH,
} from '../constants';
import { refreshCommercialShare } from '../industry/catchment';
import type { TileMap } from '../map/TileMap';
import { Structure } from '../map/structures';
import { Terrain } from '../map/terrain';
import {
  buildingsWantedFor,
  continuesStreet,
  countTownBuildings,
  joinStreetTile,
  placeBuildings,
  plotBuildable,
  pruneUnservedStreets,
  STREET_STEP_BIT,
  STREET_STEP_DX,
  STREET_STEP_DY,
} from '../mapgen/towns';
import { roadBuildableAt } from '../net/roadBuilder';
import { inCatchment } from '../station/types';
import type { World } from '../World';
import { BuildingKind, type Town } from './types';

/**
 * Physical town growth (SPEC.md 13.2, SPEC2 M20 bundle 1).
 *
 * Until this file existed a town was pixel-identical in 1950 and in 2050: the
 * monthly hook computed a growth RATE and moved a population number, and
 * nothing on the map ever changed. Here the number becomes houses and streets.
 *
 * Four things about it are the decision (D-231):
 *
 *  - **The hook mutates the world directly** (E-10). Architecture law #6 binds
 *    the PLAYER's interventions; `growTowns` has been a legitimate author of
 *    state since M2, and routing a town's own building through a pseudo-company
 *    command would flood the replay log with non-player noise (Fehlerkatalog
 *    29) and hand a company the town's streets on top of it.
 *  - **The placement is `mapgen/towns.ts`'s own**, called with the DEFICIT
 *    rather than with the whole stock. A tile that already carries a house
 *    fails `plotBuildable`, so "place four more" and "place four in total" are
 *    one loop, and there is exactly one answer in the project to "where does a
 *    house go" (D-216's five passes stay the shape growth extends).
 *  - **One town a day, in a fixed order** (E-10, Fehlerkatalog 32). 140 towns
 *    searching for a plot on the first of the month is the 7.3 cadence mistake
 *    transferred to towns. The town whose turn it is comes from the game DAY
 *    and the town count and from nothing else - see {@link growTownFabric}.
 *  - **Zero randomness.** Nothing here draws, from `world.rng` or from a named
 *    stream (Z3, the D-093 precedent): the deficit, the ring order, the
 *    extension candidate and its tie-breaks are all total orders over tile
 *    indices, so no later breakdown roll moves and no existing seed forks
 *    because a town put a house up.
 *
 * SPEC2 M20 bundle 2 gave the pass its second direction: SPEC.md 13.2's
 * "Ohne jede Versorgung schrumpfen Staedte langsam" is a population that falls,
 * and a falling population has to take houses down again or a town would keep
 * a skyline it no longer has anybody for. The same three shapes hold in both
 * directions - the deficit is `buildingsWantedFor` minus what stands, whichever
 * sign it has; the winner is an explicit total order; and D-216's pruning
 * invariant is restored after a removal exactly as it is respected before an
 * extension. Two things are refused on the way down and neither is decoration:
 * a station is never left with an empty catchment (see {@link mayRemoveBuilding}
 * - the 10.1 death spiral has to stay visible in the M14 instruments), and a
 * street a company built or a bay it parked beside one is never touched.
 *
 * What the growth may NOT do, and each of these is a refusal rather than an
 * oversight: it never terraforms (it builds where the ground already allows,
 * through `roadBuildableAt` - the very guard the player's road command and its
 * preview use), it never takes a tile from a company or writes over track, a
 * structure, a waypoint or a station module, and it never claims ownership -
 * every tile it touches stays `TILE_PUBLIC`, which is what D-104 says a town's
 * own street is for ever.
 */

/**
 * Grow the fabric of ONE town, chosen round robin by the game day.
 *
 * The cursor is the day itself - `day % towns.length` - and deliberately not a
 * saved field, although SPEC2's ledger row for v31 names a "Wachstums-Cursor":
 * the tick is already saved and hashed, the town list never changes length
 * after genesis, so a stored cursor would be a second source of truth for a
 * number that is a pure function of the first (the D-174 pattern - the bump the
 * ledger named turned out to be already paid for). What v31 IS spent on is
 * `Town.roadTilesThisMonth`, which is real history and derivable from nothing.
 *
 * Allocation-free (law #7): no arrays, no closures, no iterators - every walk
 * below is an indexed `for` over a typed array, which is why the daily hook can
 * carry it at all.
 */
export function growTownFabric(world: World): void {
  const towns = world.towns;
  if (towns.length === 0) return;

  const day = (world.tick / TICKS_PER_DAY) | 0;
  const town = towns[day % towns.length]!;
  const map = world.map;
  const radius = town.radius;

  const wanted = buildingsWantedFor(town.population);
  const standing = countTownBuildings(map, town, radius);
  // SPEC.md 13.2's other direction (SPEC2 M20 bundle 2): a town whose
  // population has fallen below its housing stock takes a house down again.
  if (standing > wanted) {
    if (!removeBuilding(world, town, radius)) return;
    refreshTownStationShares(world, town);
    map.revision++;
    return;
  }
  if (standing === wanted) return;

  let built = placeBuildings(map, town, radius, wanted - standing);
  let laidStreet = false;

  // SPEC.md 13.2: "Neue Gebaeude werden entlang bestehender Strassen
  // platziert; wenn kein Platz, verlaengert die Stadt selbst eine Strasse."
  // The order is the sentence: the street is the answer to there being no
  // plot, never the first move - a street laid before the plots beside the old
  // one are full is the unserved stub D-216 spent a bundle removing.
  if (built === 0 && town.roadTilesThisMonth < TOWN_GROWTH_ROAD_TILES_PER_MONTH) {
    laidStreet = extendStreet(map, town, radius);
    if (laidStreet) {
      town.roadTilesThisMonth++;
      // The extension is only ever laid where it opens a plot, so the house
      // goes up in the SAME step: a town street that serves nothing is what
      // D-216 measured 1,013 of and removed, and growth must not put them back.
      built = placeBuildings(map, town, radius, wanted - standing);
    }
  }

  if (built === 0 && !laidStreet) return;
  // Buildings moved, so the zone mix every stop of this town sells tickets by
  // has moved with them. It is DERIVED and recomputed on load, so leaving it
  // stale here would make a loaded game split its passengers differently from
  // the game that was saved (law #3).
  if (built > 0) refreshTownStationShares(world, town);
  map.revision++;
}

/**
 * Live count of the buildings each station covers, for the removal guard.
 *
 * Preallocated at `MAX_STATIONS` and indexed by the station's POSITION in
 * `world.stations`, which is the order every loop below walks (law #7 - the
 * daily hook may not allocate, and a shrinking town runs in exactly that hook).
 * It is a scratch buffer and never state: it is filled at the top of every
 * removal and read only until that removal ends.
 */
const coveredBuildings = new Int32Array(MAX_STATIONS);

/**
 * Count, for every station of this town, how many of its buildings it covers.
 *
 * `station.buildingsCovered` is a BUILD-TIME reading that nothing refreshes
 * (the residual D-231 names), so it cannot answer this: it would say a station
 * still covers eight houses on the day the last one came down. The guard has to
 * read the map.
 */
function countCoveredBuildings(world: World, town: Town): void {
  const map = world.map;
  const stations = world.stations;
  const scan = STATION_CATCHMENT_SCAN_RADIUS;

  for (let s = 0; s < stations.length && s < MAX_STATIONS; s++) {
    const station = stations[s]!;
    coveredBuildings[s] = 0;
    if (station.townId !== town.id) continue;

    let count = 0;
    for (let dy = -scan; dy <= scan; dy++) {
      const y = station.y + dy;
      if (y < 0 || y >= map.size) continue;
      for (let dx = -scan; dx <= scan; dx++) {
        const x = station.x + dx;
        if (x < 0 || x >= map.size) continue;
        if (!inCatchment(station, x, y)) continue;
        const index = map.tileIndex(x, y);
        if (map.townId[index] !== town.id) continue;
        if (map.buildingKind[index] !== BuildingKind.None) count++;
      }
    }
    coveredBuildings[s] = count;
  }
}

/**
 * May this house come down without leaving a station with nothing to serve?
 *
 * The refusal SPEC2 M20 asks for by name: "Schrumpfung/Rueckbau gegen
 * Stationseinzugsgebiete getestet - die Todesspirale (10.1) darf dadurch nicht
 * unsichtbar eskalieren". A station whose catchment holds ONE building of its
 * town keeps it. The stop then goes on selling the tickets its town still
 * produces, its rating goes on being readable, and the decline stays something
 * the M14 history ring and the x-ray can show the player month by month -
 * rather than a stop that silently stops existing economically because the
 * houses around it were taken away by a pass nobody is watching.
 *
 * It is deliberately the LAST one and not the last few: a town that may never
 * shrink inside a catchment would keep its full housing stock for ever wherever
 * a stop was ever built, and the shrinkage 13.2 asks for would be unobservable
 * in exactly the towns a player has touched.
 */
function mayRemoveBuilding(world: World, town: Town, x: number, y: number): boolean {
  const stations = world.stations;
  for (let s = 0; s < stations.length && s < MAX_STATIONS; s++) {
    const station = stations[s]!;
    if (station.townId !== town.id) continue;
    if (coveredBuildings[s]! > 1) continue;
    if (inCatchment(station, x, y)) return false;
  }
  return true;
}

/**
 * Take ONE house down, from the edge inwards, and answer whether one went.
 *
 * The mirror image of `placeBuildings`, which fills ring by ring from the
 * centre out: a town shrinks where it grew last, so the candidates are ranked
 * FARTHEST from the centre first with ties on the HIGHEST tile index - a total
 * order no two candidates tie on, decided before the walk and never by it
 * (law #3).
 *
 * **What goes is the first candidate in that order that
 * {@link mayRemoveBuilding} PERMITS**, and the distinction is not pedantry: on
 * a town whose stop sits out at the edge of its claim the guard refuses the
 * winner on four removals in five, and a reader of the sentence above alone
 * would expect the house nearest the stop to come down. The guard is a filter
 * over the candidate set, never a reordering of it - which is why the walk may
 * test it lazily, only for a candidate that already beats the best so far, and
 * still answer the same tile. `townShrinkage.spec.ts` pins exactly that against
 * an independent implementation of the order, on a fixture where the guard is
 * measured to bite.
 *
 * The walk visits tiles in ascending index, so the tie-break can only ever
 * keep the LAST tie seen; the comparison is written out in full anyway,
 * because it is what makes the order a property of the code rather than of the
 * loop bounds.
 *
 * One a day rather than the whole surplus at once. The surplus of a shrinking
 * town is one house every three or four game years, so the pass converges long
 * before the next one appears; and a pass that could clear a whole quarter in a
 * day would let one edited population number level a town.
 *
 * The pruning invariant of D-216 is restored afterwards and not promised: the
 * street that served the house may now serve nothing, and `pruneUnservedStreets`
 * is the same sweep, to the same fixed point, that the map generator runs -
 * with the owner check that makes it safe over a played map, so a company's
 * road and a bay beside the street are never touched.
 */
function removeBuilding(world: World, town: Town, radius: number): boolean {
  const map = world.map;
  countCoveredBuildings(world, town);

  let bestTile = -1;
  let bestDistanceSq = -1;

  for (let dy = -radius; dy <= radius; dy++) {
    const y = town.y + dy;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      if (!map.contains(x, y)) continue;
      const index = map.tileIndex(x, y);
      if (map.townId[index] !== town.id) continue;
      if (map.buildingKind[index] === BuildingKind.None) continue;

      const distanceSq = dx * dx + dy * dy;
      if (bestTile !== -1) {
        if (distanceSq < bestDistanceSq) continue;
        if (distanceSq === bestDistanceSq && index < bestTile) continue;
      }
      if (!mayRemoveBuilding(world, town, x, y)) continue;
      bestTile = index;
      bestDistanceSq = distanceSq;
    }
  }

  if (bestTile === -1) return false;
  map.buildingKind[bestTile] = BuildingKind.None;
  map.buildingLevel[bestTile] = 0;
  pruneUnservedStreets(map, town, radius);
  return true;
}

/** Refresh the derived zone mix of every station this town's growth reached. */
function refreshTownStationShares(world: World, town: Town): void {
  const stations = world.stations;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    if (station.townId !== town.id) continue;
    refreshCommercialShare(world.map, station);
  }
}

/**
 * May the town lay a street tile here?
 *
 * `roadBuildableAt` is the player's own ground test (D-210), so the town
 * refuses water, industry, a house and anything steeper than
 * `TOWN_ROAD_MAX_SLOPE` for exactly the reasons the player does. On top of it
 * the town asks three questions the player's command answers elsewhere: the
 * tile must be its OWN claimed ground, it must belong to nobody - which in one
 * array read covers a company's road, its track and every station module,
 * because all three take the tile (D-101, `attachModule`) - and it must carry
 * no track, structure or waypoint of any kind. A town does not build level
 * crossings, and it may not pave over a bridge.
 */
function streetGroundFree(map: TileMap, town: Town, x: number, y: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.townId[index] !== town.id) return false;
  if (map.roadBits[index] !== 0) return false;
  if (map.owner[index] !== TILE_PUBLIC) return false;
  if (map.trackBits[index] !== 0) return false;
  if (map.structure[index] !== Structure.None) return false;
  if (map.waypoint[index] !== 0) return false;
  return roadBuildableAt(map, x, y) === null;
}

/** How many buildable plots a street tile at (x, y) would open up. */
function plotsOpenedBy(map: TileMap, town: Town, x: number, y: number): number {
  let plots = 0;
  for (let k = 0; k < 4; k++) {
    const px = x + STREET_STEP_DX[k]!;
    const py = y + STREET_STEP_DY[k]!;
    if (!plotBuildable(map, town, px, py)) continue;
    if (continuesStreet(map, px, py)) continue;
    plots++;
  }
  return plots;
}

/**
 * Lay ONE tile of street, extending an existing one, or answer false.
 *
 * A candidate is a bare tile of the town's own ground that (a) is the straight
 * continuation of a street running into it - which is what keeps the 13.1 grid
 * a grid instead of growing blobs, and what `continuesStreet` reserves from the
 * houses - (b) touches exactly ONE street, so the tile extends a street rather
 * than closing a loop that opens nothing, and (c) would put at least one new
 * building plot within reach. A candidate that opens no plot is a stub, and a
 * town does not build stubs.
 *
 * The winner is chosen by an explicit total order and never by the order of the
 * walk (law #3): nearest to the centre first, so the town stays dense in the
 * way `placeBuildings` is dense; then the most plots opened; then the lowest
 * tile index, which no two candidates can tie on.
 */
function extendStreet(map: TileMap, town: Town, radius: number): boolean {
  let bestTile = -1;
  let bestNeighbour = -1;
  let bestDirection = -1;
  let bestDistanceSq = 0;
  let bestPlots = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    const y = town.y + dy;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = town.x + dx;
      if (!streetGroundFree(map, town, x, y)) continue;

      // Exactly one street neighbour, and the street has to run THROUGH it
      // away from us - `continuesStreet`'s identity, spelled out here because
      // the extension needs the direction and not just the answer.
      let touching = 0;
      let direction = -1;
      for (let k = 0; k < 4; k++) {
        const nx = x + STREET_STEP_DX[k]!;
        const ny = y + STREET_STEP_DY[k]!;
        if (!map.contains(nx, ny)) continue;
        const bits = map.roadBits[map.tileIndex(nx, ny)]!;
        if (bits === 0) continue;
        touching++;
        if ((bits & STREET_STEP_BIT[k]!) !== 0) direction = k;
      }
      if (touching !== 1 || direction === -1) continue;
      const neighbour = map.tileIndex(
        x + STREET_STEP_DX[direction]!,
        y + STREET_STEP_DY[direction]!,
      );

      const plots = plotsOpenedBy(map, town, x, y);
      if (plots === 0) continue;

      const index = map.tileIndex(x, y);
      const distanceSq = dx * dx + dy * dy;
      if (bestTile !== -1) {
        if (distanceSq > bestDistanceSq) continue;
        if (distanceSq === bestDistanceSq) {
          if (plots < bestPlots) continue;
          if (plots === bestPlots && index > bestTile) continue;
        }
      }
      bestTile = index;
      bestNeighbour = neighbour;
      bestDirection = direction;
      bestDistanceSq = distanceSq;
      bestPlots = plots;
    }
  }

  if (bestTile === -1) return false;
  joinStreetTile(map, bestTile, bestNeighbour, bestDirection);
  map.terrain[bestTile] = Terrain.TownGround;
  return true;
}
