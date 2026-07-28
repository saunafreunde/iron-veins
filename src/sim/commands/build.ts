import { bookExpense } from '../economy/company';
import {
  AUTO_SIGNAL_STATION_RADIUS,
  CANOPY_COST_CT,
  CANOPY_UPKEEP_CT,
  COLD_STORE_COST_CT,
  COLD_STORE_UPKEEP_CT,
  FREIGHT_TERMINAL_COST_CT,
  FREIGHT_TERMINAL_UPKEEP_CT,
} from '../constants';
import {
  DEMOLITION_REFUND,
  RAIL_DEPOT_COST_CT,
  RAIL_DEPOT_UPKEEP_CT,
  RAIL_PLATFORM_COST_CT,
  RAIL_PLATFORM_UPKEEP_CT,
  REFIT_COST_SHARE,
  RESALE_SHARE,
  SIGNAL_COST_CT,
  SIGNAL_UPKEEP_CT_PER_YEAR,
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_DEPOT_UPKEEP_CT,
  ROAD_STOP_COST_CT,
  ROAD_STOP_UPKEEP_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  STATION_JOIN_DISTANCE,
  TICKS_PER_YEAR,
  TOWN_ROAD_MAX_SLOPE,
} from '../constants';
import {
  isOneWay,
  packSignal,
  signalKind,
  SignalKind,
  SIGNAL_KIND_COUNT,
  SIGNAL_TRACK_DEGREE,
} from '../map/signals';
import { Structure, structureUpkeepCt } from '../map/structures';
import { slopeRise, Terrain } from '../map/terrain';
import {
  directionFromDelta,
  oppositeDir,
  trackDegree,
  RAIL_TYPE_COST_CT,
  RAIL_TYPE_UPKEEP_CT,
  trackBit,
  TRACK_DX,
  TRACK_DY,
  type RailType,
  type TrackDir,
} from '../map/track';
import { planTrack } from '../net/trackBuilder';
import {
  isSupportModule,
  ModuleKind,
  recomputeCentre,
  type Station,
  type StationModule,
} from '../station/types';
import { assignStationCatchment } from '../town/update';
import { RoadBit } from '../town/types';
import type { Cargo } from '../cargo/types';
import { capacityFor, defaultCargo, vehicleSpec, VehicleKind } from '../vehicles/catalog';
import {
  aggregateConsist,
  consistCapacityFor,
  consistDefaultCargo,
  validateConsist,
} from '../vehicles/consist';
import { releaseAll } from '../vehicles/reservations';
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
  const chargeCt = world.costCt(cost);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);
  if (newTiles === 0) return reject(RejectReason.NothingToDo);

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    if (world.map.terrain[tile] !== Terrain.TownGround) {
      world.map.terrain[tile] = Terrain.TownGround;
    }
    if (i > 0) connect(world, tiles[i - 1]!, tile);
  }

  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += newTiles * ROAD_UPKEEP_PER_TILE_CT;
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
  world.company.infrastructureUpkeepPerYearCt -= ROAD_UPKEEP_PER_TILE_CT;
  world.map.revision++;
  return ACCEPTED;
}

/**
 * Lay track along a planned route.
 *
 * The route comes from the same planner the preview uses, so what the player
 * was shown is exactly what is built and exactly what is charged.
 */
export function buildTrack(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  railType: RailType,
  assistant: boolean,
  signalSpacing = 0,
): CommandOutcome {
  const planned = planTrack(world.map, x1, y1, x2, y2, railType, assistant);
  if (!planned.ok) return reject(planned.reasonKey);

  const route = planned.route;
  if (route.geometry.newTiles === 0 && route.upgradedTiles === 0) {
    return reject(RejectReason.NothingToDo);
  }
  const chargeCt = world.costCt(route.costCt);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  const map = world.map;

  // Upkeep is worked out before the type is overwritten, because a converted
  // tile stops costing what the old type cost.
  let upkeepDelta = 0;
  for (let i = 0; i < route.tiles.length; i++) {
    const tile = route.tiles[i]!;
    const existing = map.railType[tile]!;
    if (map.trackBits[tile] === 0) {
      upkeepDelta += RAIL_TYPE_UPKEEP_CT[railType]!;
    } else if (existing !== railType) {
      upkeepDelta += RAIL_TYPE_UPKEEP_CT[railType]! - RAIL_TYPE_UPKEEP_CT[existing]!;
    }
    const structure = route.structures[i]! as Structure;
    if (structure !== Structure.None && map.structure[tile] === Structure.None) {
      upkeepDelta += structureUpkeepCt(structure);
    }
  }

  // Bridges and tunnels go down before the rails, so that the height the track
  // runs at is right the moment anything asks for it.
  for (let i = 0; i < route.tiles.length; i++) {
    const structure = route.structures[i]!;
    if (structure === Structure.None) continue;
    const tile = route.tiles[i]!;
    map.structure[tile] = structure;
    map.structureHeight[tile] = route.heights[i]!;
  }

  for (let i = 0; i + 1 < route.tiles.length; i++) {
    const from = route.tiles[i]!;
    const to = route.tiles[i + 1]!;
    const direction = directionFromDelta(
      (to % map.size) - (from % map.size),
      ((to / map.size) | 0) - ((from / map.size) | 0),
    );

    map.trackBits[from] = map.trackBits[from]! | trackBit(direction);
    map.trackBits[to] = map.trackBits[to]! | trackBit(oppositeDir(direction));
    map.railType[from] = railType;
    map.railType[to] = railType;
  }

  // A spur laid through a signalled tile turns it into a junction, and a signal
  // standing in a junction is the one state the placement rule exists to
  // prevent. It comes down with a refund rather than silently becoming illegal.
  for (const tile of route.tiles) {
    if (signalKind(map.signal[tile]!) === SignalKind.None) continue;
    if (trackDegree(map.trackBits[tile]!) !== SIGNAL_TRACK_DEGREE) clearSignal(world, tile);
  }

  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeepDelta;
  world.company.fixedAssetsCt += route.costCt;
  map.revision++;

  if (signalSpacing > 0) autoSignal(world, route.tiles, signalSpacing);
  return ACCEPTED;
}

/**
 * Automatic signalling along a route that has just been laid (section 9.4).
 *
 * One-way block signals every `spacing` tiles, facing the way the line was
 * drawn, and a path signal where the line runs into a station instead - a
 * station throat is exactly the shape path signals exist for.
 *
 * Every signal goes down through `buildSignal`, so the placement rules, the
 * price and the upkeep are the same ones a player gets by hand. A tile that is
 * not plain line, or one the company cannot afford, is simply skipped: the
 * player can add it themselves, and refusing the whole route because one
 * junction was in the way would be far worse.
 */
function autoSignal(world: World, tiles: readonly number[], spacing: number): void {
  const map = world.map;

  for (let i = spacing; i + 1 < tiles.length; i += spacing) {
    const tile = tiles[i]!;
    const direction = directionFromDelta(
      (tiles[i + 1]! % map.size) - (tile % map.size),
      ((tiles[i + 1]! / map.size) | 0) - ((tile / map.size) | 0),
    );

    const kind = nearStation(world, tile) ? SignalKind.PathEntry : SignalKind.BlockOneWay;
    buildSignal(world, tile % map.size, (tile / map.size) | 0, kind, direction);
  }
}

/** Is a station within a couple of tiles of this piece of line? */
function nearStation(world: World, tile: number): boolean {
  const map = world.map;
  const x = tile % map.size;
  const y = (tile / map.size) | 0;

  for (const station of world.stations) {
    for (const module of station.modules) {
      const dx = module.x - x;
      const dy = module.y - y;
      if (dx * dx + dy * dy <= AUTO_SIGNAL_STATION_RADIUS * AUTO_SIGNAL_STATION_RADIUS) return true;
    }
  }
  return false;
}

/** Remove the track from one tile, including the neighbours' connections. */
export function demolishTrack(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const map = world.map;
  const tile = map.tileIndex(x, y);
  if (map.trackBits[tile] === 0) return reject(RejectReason.NothingToDo);

  const railType = map.railType[tile]! as RailType;
  for (let direction = 0; direction < 8; direction++) {
    if ((map.trackBits[tile]! & trackBit(direction as TrackDir)) === 0) continue;
    const nx = x + TRACK_DX[direction]!;
    const ny = y + TRACK_DY[direction]!;
    if (!map.contains(nx, ny)) continue;
    const neighbour = map.tileIndex(nx, ny);
    map.trackBits[neighbour] =
      map.trackBits[neighbour]! & ~trackBit(oppositeDir(direction as TrackDir));
    if (map.trackBits[neighbour] === 0) map.railType[neighbour] = 0;
  }
  map.trackBits[tile] = 0;
  map.railType[tile] = 0;
  clearSignal(world, tile);

  // Taking out one tile of a bridge takes out the bridge: half a viaduct is not
  // a thing, and leaving the deck standing with a hole in it would be worse.
  const structure = map.structure[tile]! as Structure;
  if (structure !== Structure.None) {
    world.company.infrastructureUpkeepPerYearCt -= structureUpkeepCt(structure);
    map.structure[tile] = Structure.None;
    map.structureHeight[tile] = 0;
  }

  world.company.cashCt += Math.round(RAIL_TYPE_COST_CT[railType]! * DEMOLITION_REFUND);
  world.company.infrastructureUpkeepPerYearCt -= RAIL_TYPE_UPKEEP_CT[railType]!;
  map.revision++;
  return ACCEPTED;
}

/**
 * Place a signal on plain line (section 9).
 *
 * Everything this refuses is refused for one reason: a train held here has to
 * be standing somewhere that does not block anybody else. A junction throat is
 * the case that matters, and refusing the placement removes it entirely -
 * which is why there are no pre-signals in this design (DECISIONS.md D-055).
 */
export function buildSignal(
  world: World,
  x: number,
  y: number,
  kind: SignalKind,
  direction: TrackDir,
): CommandOutcome {
  if (kind === SignalKind.None || kind >= SIGNAL_KIND_COUNT) {
    return reject(RejectReason.UnknownSignal);
  }
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const map = world.map;
  const tile = map.tileIndex(x, y);

  if (map.trackBits[tile] === 0) return reject(RejectReason.NeedsTrack);
  // A one-way signal has to face along the track it stands on, or it would be
  // a wall in both directions.
  if (isOneWay(kind) && (map.trackBits[tile]! & trackBit(direction)) === 0) {
    return reject(RejectReason.SignalNeedsDirection);
  }
  if (trackDegree(map.trackBits[tile]!) !== SIGNAL_TRACK_DEGREE) {
    return reject(RejectReason.NotPlainTrack);
  }
  if (map.structure[tile] !== Structure.None) return reject(RejectReason.SignalOnStructure);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  if (signalKind(map.signal[tile]!) !== SignalKind.None) return reject(RejectReason.SignalExists);
  const chargeCt = world.costCt(SIGNAL_COST_CT);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  map.signal[tile] = packSignal(kind, direction);
  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += SIGNAL_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt += SIGNAL_COST_CT;
  map.revision++;
  return ACCEPTED;
}

export function demolishSignal(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (signalKind(world.map.signal[tile]!) === SignalKind.None) {
    return reject(RejectReason.NoSignalHere);
  }

  clearSignal(world, tile);
  world.map.revision++;
  return ACCEPTED;
}

/** Take a signal away and unwind what it cost, wherever that happens. */
function clearSignal(world: World, tile: number): void {
  if (signalKind(world.map.signal[tile]!) === SignalKind.None) return;
  world.map.signal[tile] = SignalKind.None;
  world.company.cashCt += Math.round(SIGNAL_COST_CT * DEMOLITION_REFUND);
  world.company.infrastructureUpkeepPerYearCt -= SIGNAL_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt -= SIGNAL_COST_CT;
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

/**
 * Add a module to the nearest station of the company, or open a new one.
 * Shared by every mode, so a bus stop and a platform four tiles apart really do
 * become one station with one cargo pool (section 10).
 */
function attachModule(world: World, module: StationModule): Station {
  let station = joinTarget(world, module.x, module.y);

  if (station === null) {
    station = {
      id: world.stations.length,
      name: world.nextStationName(module.x, module.y),
      ownerId: world.playerCompanyId,
      modules: [module],
      x: module.x,
      y: module.y,
      waiting: [],
      visitTicks: [],
      servedReliability: 0,
      overflowUnits: 0,
      townId: -1,
      buildingsCovered: 0,
      acceptedCargo: 0,
      servedIndustries: [],
    };
    world.stations.push(station);
  } else {
    station.modules.push(module);
  }

  recomputeCentre(station);
  assignStationCatchment(world, station);
  return station;
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
  const chargeCt = world.costCt(cost);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeep;
  world.company.fixedAssetsCt += cost;
  world.map.revision++;
  return ACCEPTED;
}

/**
 * Place a platform tile or a rail depot on existing track.
 *
 * A platform is built ON the track rather than beside it, so the tile keeps its
 * rails and a train simply stops there. That is what lets a through station be
 * a piece of a line instead of a terminus.
 */
export function buildRailStop(
  world: World,
  x: number,
  y: number,
  kind: ModuleKind,
): CommandOutcome {
  if (kind !== ModuleKind.RailPlatform && kind !== ModuleKind.RailDepot) {
    return reject(RejectReason.UnknownModule);
  }
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);

  const tile = world.map.tileIndex(x, y);
  if (world.map.trackBits[tile] === 0) return reject(RejectReason.NeedsTrack);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);

  const cost = kind === ModuleKind.RailDepot ? RAIL_DEPOT_COST_CT : RAIL_PLATFORM_COST_CT;
  const upkeep = kind === ModuleKind.RailDepot ? RAIL_DEPOT_UPKEEP_CT : RAIL_PLATFORM_UPKEEP_CT;
  const chargeCt = world.costCt(cost);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeep;
  world.company.fixedAssetsCt += cost;
  world.map.revision++;
  return ACCEPTED;
}

/**
 * Place a crane, a canopy or a cold store beside a station (section 10).
 *
 * These three stand on the goods yard rather than on the line, so they need
 * neither road nor track - only clear, dry ground close enough to an existing
 * station to join it. That is also what stops them being used as free stations:
 * a canopy on its own in a field would have nothing to join.
 */
export function buildStationModule(
  world: World,
  x: number,
  y: number,
  kind: ModuleKind,
): CommandOutcome {
  if (!isSupportModule(kind)) return reject(RejectReason.UnknownModule);
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);

  const map = world.map;
  const tile = map.tileIndex(x, y);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  if (
    map.terrain[tile] === Terrain.Water ||
    map.roadBits[tile] !== 0 ||
    map.trackBits[tile] !== 0 ||
    map.buildingKind[tile] !== 0 ||
    map.industryId[tile] !== -1
  ) {
    return reject(RejectReason.GroundNotClear);
  }
  if (joinTarget(world, x, y) === null) return reject(RejectReason.NeedsStation);

  const cost = SUPPORT_MODULE_COST_CT[kind]!;
  const chargeCt = world.costCt(cost);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  bookExpense(world.company, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += SUPPORT_MODULE_UPKEEP_CT[kind]!;
  world.company.fixedAssetsCt += cost;
  map.revision++;
  return ACCEPTED;
}

/** Price and upkeep of the three support modules, indexed by ModuleKind. */
const SUPPORT_MODULE_COST_CT: Readonly<Record<number, number>> = {
  [ModuleKind.FreightTerminal]: FREIGHT_TERMINAL_COST_CT,
  [ModuleKind.Canopy]: CANOPY_COST_CT,
  [ModuleKind.ColdStore]: COLD_STORE_COST_CT,
};

const SUPPORT_MODULE_UPKEEP_CT: Readonly<Record<number, number>> = {
  [ModuleKind.FreightTerminal]: FREIGHT_TERMINAL_UPKEEP_CT,
  [ModuleKind.Canopy]: CANOPY_UPKEEP_CT,
  [ModuleKind.ColdStore]: COLD_STORE_UPKEEP_CT,
};

/**
 * Assemble a train in a rail depot (section 11.2).
 *
 * The whole train is bought in one go rather than unit by unit: its mass, its
 * tractive effort and its top speed only mean anything as a composition, and a
 * half-built train standing in a depot would be a state with no rules.
 */
export function buyTrain(
  world: World,
  depotX: number,
  depotY: number,
  specIds: readonly number[],
): CommandOutcome {
  if (!world.map.contains(depotX, depotY)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(depotX, depotY);

  const station = stationAt(world, tile);
  const isDepot =
    station !== null &&
    station.modules.some((m) => m.tileIndex === tile && m.kind === ModuleKind.RailDepot);
  if (!isDepot) return reject(RejectReason.NeedsRailDepot);

  const problem = validateConsist(specIds, world.date.year);
  if (problem !== null) return reject(problem);

  const aggregate = aggregateConsist(specIds);
  const chargeCt = world.costCt(aggregate.priceCt);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(
    specIds[0]!,
    world.playerCompanyId,
    tile,
    world.tick,
    consistDefaultCargo(specIds),
    specIds,
  );
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  world.vehicles.reliability[id] = aggregate.reliability0;
  world.vehicles.state[id] = VehicleState.Stopped;

  bookExpense(world.company, chargeCt);
  world.company.vehicleUpkeepPerYearCt += aggregate.upkeepCtPerYear;
  world.company.fixedAssetsCt += aggregate.priceCt;
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
  const chargeCt = world.costCt(spec.priceCt);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

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

  bookExpense(world.company, chargeCt);
  world.company.vehicleUpkeepPerYearCt += spec.upkeepCtPerYear;
  world.company.fixedAssetsCt += spec.priceCt;
  return ACCEPTED;
}

/**
 * Convert a vehicle to another cargo (section 12).
 *
 * Without this an open wagon is coal for life and half the catalogue is
 * unreachable: `refitCargo` is written once, when the vehicle is bought, and
 * nothing else ever touched it.
 */
/**
 * Is this vehicle standing in a shed it could be converted in?
 *
 * Two states mean that, and only one of them is called InDepot: a vehicle that
 * has just been bought is Stopped on the depot tile it was built at, and has
 * never left it. Testing the state alone made a brand new vehicle impossible to
 * convert until it had been sent away and ordered back (DECISIONS.md D-076).
 */
function standsInDepot(world: World, vehicleId: number): boolean {
  const vehicles = world.vehicles;
  const state = vehicles.state[vehicleId]!;
  if (state === VehicleState.InDepot) return true;
  if (state !== VehicleState.Stopped) return false;

  const station = stationAt(world, vehicles.tileIndex[vehicleId]!);
  if (station === null) return false;
  const wanted =
    vehicles.kind[vehicleId] === VehicleKind.Train ? ModuleKind.RailDepot : ModuleKind.RoadDepot;
  for (const module of station.modules) {
    if (module.tileIndex === vehicles.tileIndex[vehicleId] && module.kind === wanted) return true;
  }
  return false;
}

export function refitVehicle(world: World, vehicleId: number, cargo: Cargo): CommandOutcome {
  const vehicles = world.vehicles;
  if (!vehicles.isAlive(vehicleId)) return reject(RejectReason.NoSuchVehicle);
  if (!standsInDepot(world, vehicleId)) return reject(RejectReason.NotInDepot);
  if (vehicles.cargo[vehicleId]!.length > 0) return reject(RejectReason.NotEmpty);

  const units = vehicles.consist[vehicleId]!;
  const capacity =
    units.length > 0
      ? consistCapacityFor(units, cargo)
      : capacityFor(vehicleSpec(vehicles.specId[vehicleId]!), cargo);
  if (capacity <= 0) return reject(RejectReason.CannotCarry);

  const cost = Math.round(refitCostCt(world, vehicleId));
  const chargeCt = world.costCt(cost);
  if (chargeCt > world.company.cashCt) return reject(RejectReason.InsufficientFunds);

  vehicles.refitCargo[vehicleId] = cargo;
  vehicles.refreshAggregate(vehicleId);
  bookExpense(world.company, chargeCt);
  return ACCEPTED;
}

/** A conversion costs a share of what the vehicle cost to buy. */
function refitCostCt(world: World, vehicleId: number): number {
  const units = world.vehicles.consist[vehicleId]!;
  const priceCt =
    units.length > 0
      ? aggregateConsist(units).priceCt
      : vehicleSpec(world.vehicles.specId[vehicleId]!).priceCt;
  return priceCt * REFIT_COST_SHARE;
}

export function sellVehicle(world: World, vehicleId: number): CommandOutcome {
  if (!world.vehicles.isAlive(vehicleId)) return reject(RejectReason.NoSuchVehicle);

  // A train is sold whole, so the price and the upkeep are those of the
  // composition, not of the locomotive at its head.
  const units = world.vehicles.consist[vehicleId]!;
  const spec = vehicleSpec(world.vehicles.specId[vehicleId]!);
  const priceCt = units.length > 0 ? aggregateConsist(units).priceCt : spec.priceCt;
  const upkeepCt =
    units.length > 0 ? aggregateConsist(units).upkeepCtPerYear : spec.upkeepCtPerYear;

  const ageYears = (world.tick - world.vehicles.builtTick[vehicleId]!) / TICKS_PER_YEAR;
  const wear = Math.min(1, ageYears / spec.lifetimeYears);
  const refund = Math.round(priceCt * (1 - wear) * RESALE_SHARE);

  world.company.cashCt += refund;
  world.company.vehicleUpkeepPerYearCt -= upkeepCt;
  world.company.fixedAssetsCt -= priceCt;
  // The store holds no reference to the world, so the track it claimed has to
  // be given back here rather than inside destroy().
  releaseAll(world, vehicleId);
  world.vehicles.destroy(vehicleId);
  return ACCEPTED;
}
