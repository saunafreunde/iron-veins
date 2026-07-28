import { bookExpense } from '../economy/company';
import {
  DEMOLITION_REFUND,
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_DEPOT_UPKEEP_CT,
  ROAD_STOP_COST_CT,
  ROAD_STOP_UPKEEP_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  STATION_JOIN_DISTANCE,
  TOWN_ROAD_MAX_SLOPE,
} from '../constants';
import { slopeRise, Terrain } from '../map/terrain';
import { ModuleKind, recomputeCentre, type Station } from '../station/types';
import { assignStationCatchment } from '../town/update';
import { RoadBit } from '../town/types';
import { defaultCargo, vehicleSpec, VehicleKind } from '../vehicles/catalog';
import { VehicleState } from '../vehicles/VehicleStore';
import type { World } from '../World';
import { ACCEPTED, RejectReason, type CommandOutcome } from './types';

/**
 * Construction: roads, road stops, depots and vehicles.
 *
 * Every refusal names the concrete obstacle rather than "cannot build here"
 * (section 17.3) - the player has to be able to tell a slope from a river from
 * an empty bank account.
 */

function reject(reasonKey: string): CommandOutcome {
  return { ok: false, reasonKey };
}

/** Can a road tile exist here at all? */
function roadBuildable(world: World, x: number, y: number): string | null {
  if (!world.map.contains(x, y)) return RejectReason.OutsideMap;
  const index = world.map.tileIndex(x, y);
  if (world.map.terrain[index] === Terrain.Water) return RejectReason.OnWater;
  if (world.map.industryId[index] !== -1) return RejectReason.Occupied;
  if (world.map.buildingKind[index] !== 0) return RejectReason.Occupied;
  if (slopeRise(world.map.slopeAt(x, y)) > TOWN_ROAD_MAX_SLOPE) return RejectReason.TooSteep;
  return null;
}

/**
 * Tiles of an L-shaped run from (x1,y1) to (x2,y2): along x first, then along
 * y. One drag therefore produces one connected road, and the shape is fully
 * determined by the two endpoints, which keeps the command replayable.
 */
function routeTiles(world: World, x1: number, y1: number, x2: number, y2: number): number[] {
  const tiles: number[] = [];
  const stepX = Math.sign(x2 - x1);
  const stepY = Math.sign(y2 - y1);

  let x = x1;
  let y = y1;
  tiles.push(world.map.tileIndex(x, y));
  while (x !== x2) {
    x += stepX;
    tiles.push(world.map.tileIndex(x, y));
  }
  while (y !== y2) {
    y += stepY;
    tiles.push(world.map.tileIndex(x, y));
  }
  return tiles;
}

/** Connect two orthogonally adjacent tiles in both directions. */
function connect(world: World, fromTile: number, toTile: number): void {
  const size = world.map.size;
  const dx = (toTile % size) - (fromTile % size);
  const dy = ((toTile / size) | 0) - ((fromTile / size) | 0);
  const bits = world.map.roadBits;

  if (dx === 1) {
    bits[fromTile] = bits[fromTile]! | RoadBit.East;
    bits[toTile] = bits[toTile]! | RoadBit.West;
  } else if (dx === -1) {
    bits[fromTile] = bits[fromTile]! | RoadBit.West;
    bits[toTile] = bits[toTile]! | RoadBit.East;
  } else if (dy === 1) {
    bits[fromTile] = bits[fromTile]! | RoadBit.South;
    bits[toTile] = bits[toTile]! | RoadBit.North;
  } else if (dy === -1) {
    bits[fromTile] = bits[fromTile]! | RoadBit.North;
    bits[toTile] = bits[toTile]! | RoadBit.South;
  }
}

export function buildRoad(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CommandOutcome {
  if (!world.map.contains(x1, y1) || !world.map.contains(x2, y2)) {
    return reject(RejectReason.OutsideMap);
  }

  const tiles = routeTiles(world, x1, y1, x2, y2);
  const size = world.map.size;
  let newTiles = 0;

  for (const tile of tiles) {
    const blocker = roadBuildable(world, tile % size, (tile / size) | 0);
    if (blocker !== null) return reject(blocker);
    if (world.map.roadBits[tile] === 0) newTiles++;
  }

  const cost = newTiles * ROAD_COST_PER_TILE_CT;
  if (cost > world.company.cashCt) return reject(RejectReason.InsufficientFunds);
  if (newTiles === 0) return reject(RejectReason.NothingToDo);

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    if (world.map.terrain[tile] !== Terrain.TownGround) {
      world.map.terrain[tile] = Terrain.TownGround;
    }
    if (i > 0) connect(world, tiles[i - 1]!, tile);
  }

  bookExpense(world.company, cost);
  world.company.upkeepPerYearCt += newTiles * ROAD_UPKEEP_PER_TILE_CT;
  world.company.fixedAssetsCt += cost;
  world.map.revision++;
  return ACCEPTED;
}

/** Remove a single road tile and its connections. */
export function demolishRoad(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (world.map.roadBits[tile] === 0) return reject(RejectReason.NothingToDo);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);

  const size = world.map.size;
  const bits = world.map.roadBits;
  const neighbours: ReadonlyArray<readonly [number, number, number]> = [
    [-1, 0, RoadBit.East],
    [1, 0, RoadBit.West],
    [0, -1, RoadBit.South],
    [0, 1, RoadBit.North],
  ];
  for (const [dx, dy, oppositeBit] of neighbours) {
    const nx = x + dx;
    const ny = y + dy;
    if (!world.map.contains(nx, ny)) continue;
    const neighbour = ny * size + nx;
    bits[neighbour] = bits[neighbour]! & ~oppositeBit;
  }
  bits[tile] = 0;

  world.company.cashCt += Math.round(ROAD_COST_PER_TILE_CT * DEMOLITION_REFUND);
  world.company.upkeepPerYearCt -= ROAD_UPKEEP_PER_TILE_CT;
  world.map.revision++;
  return ACCEPTED;
}

/** Station that owns a tile, or null. */
function stationAt(world: World, tile: number): Station | null {
  for (const station of world.stations) {
    for (const module of station.modules) {
      if (module.tileIndex === tile) return station;
    }
  }
  return null;
}

/**
 * Nearest station of the same company within the join distance, so adjacent
 * modules form one station with a shared cargo pool (section 10).
 */
function joinTarget(world: World, x: number, y: number): Station | null {
  let best: Station | null = null;
  let bestDistanceSq = Infinity;

  for (const station of world.stations) {
    if (station.ownerId !== world.playerCompanyId) continue;
    for (const module of station.modules) {
      const dx = module.x - x;
      const dy = module.y - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > STATION_JOIN_DISTANCE * STATION_JOIN_DISTANCE) continue;
      if (
        distanceSq < bestDistanceSq ||
        (distanceSq === bestDistanceSq && best !== null && station.id < best.id)
      ) {
        bestDistanceSq = distanceSq;
        best = station;
      }
    }
  }
  return best;
}

/** Place a bus stop or lorry bay on an existing road tile. */
export function buildRoadStop(
  world: World,
  x: number,
  y: number,
  kind: ModuleKind,
): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (world.map.roadBits[tile] === 0) return reject(RejectReason.NeedsRoad);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);

  const cost = kind === ModuleKind.RoadDepot ? ROAD_DEPOT_COST_CT : ROAD_STOP_COST_CT;
  const upkeep = kind === ModuleKind.RoadDepot ? ROAD_DEPOT_UPKEEP_CT : ROAD_STOP_UPKEEP_CT;
  if (cost > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  const module = { kind, tileIndex: tile, x, y };
  let station = joinTarget(world, x, y);

  if (station === null) {
    station = {
      id: world.stations.length,
      name: world.nextStationName(x, y),
      ownerId: world.playerCompanyId,
      modules: [module],
      x,
      y,
      waiting: [],
      visitTicks: [],
      servedReliability: 0,
      overflowUnits: 0,
      townId: -1,
      buildingsCovered: 0,
    };
    world.stations.push(station);
  } else {
    station.modules.push(module);
  }

  recomputeCentre(station);
  assignStationCatchment(world, station);

  bookExpense(world.company, cost);
  world.company.upkeepPerYearCt += upkeep;
  world.company.fixedAssetsCt += cost;
  world.map.revision++;
  return ACCEPTED;
}

/** Buy a road vehicle at a depot module. */
export function buyRoadVehicle(
  world: World,
  depotX: number,
  depotY: number,
  specId: number,
): CommandOutcome {
  if (!world.map.contains(depotX, depotY)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(depotX, depotY);

  const station = stationAt(world, tile);
  const isDepot =
    station !== null &&
    station.modules.some((m) => m.tileIndex === tile && m.kind === ModuleKind.RoadDepot);
  if (!isDepot) return reject(RejectReason.NeedsDepot);

  const spec = vehicleSpec(specId);
  if (spec.kind !== VehicleKind.Road) return reject(RejectReason.WrongVehicleKind);

  const year = world.date.year;
  if (year < spec.introYear || year > spec.retireYear) return reject(RejectReason.NotAvailableYet);
  if (spec.priceCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(
    specId,
    world.playerCompanyId,
    tile,
    world.tick,
    defaultCargo(spec),
  );
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  world.vehicles.reliability[id] = spec.reliability0;
  world.vehicles.state[id] = VehicleState.Stopped;

  bookExpense(world.company, spec.priceCt);
  world.company.upkeepPerYearCt += spec.upkeepCtPerYear;
  world.company.fixedAssetsCt += spec.priceCt;
  return ACCEPTED;
}

export function sellVehicle(world: World, vehicleId: number): CommandOutcome {
  if (!world.vehicles.isAlive(vehicleId)) return reject(RejectReason.NoSuchVehicle);

  const spec = vehicleSpec(world.vehicles.specId[vehicleId]!);
  const ageYears = (world.tick - world.vehicles.builtTick[vehicleId]!) / 72_000;
  const wear = Math.min(1, ageYears / spec.lifetimeYears);
  const refund = Math.round(spec.priceCt * (1 - wear) * 0.6);

  world.company.cashCt += refund;
  world.company.upkeepPerYearCt -= spec.upkeepCtPerYear;
  world.company.fixedAssetsCt -= spec.priceCt;
  world.vehicles.destroy(vehicleId);
  return ACCEPTED;
}
