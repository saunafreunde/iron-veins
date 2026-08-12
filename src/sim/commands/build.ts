import { affordable, chargeBuild, ownershipWaived, refundBuild } from './editorRule';
import {
  AUTO_SIGNAL_STATION_RADIUS,
  CANOPY_COST_CT,
  AIRPORT_COST_CT,
  AIRPORT_UPKEEP_CT,
  QUAY_COST_CT,
  QUAY_UPKEEP_CT,
  SHIP_DEPOT_COST_CT,
  SHIP_DEPOT_UPKEEP_CT,
  CANOPY_UPKEEP_CT,
  COLD_STORE_COST_CT,
  COLD_STORE_UPKEEP_CT,
  FREIGHT_TERMINAL_COST_CT,
  FREIGHT_TERMINAL_UPKEEP_CT,
} from '../constants';
import {
  DEMOLITION_REFUND,
  WAYPOINT_COST_CT,
  WAYPOINT_UPKEEP_CT_PER_YEAR,
  RAIL_DEPOT_COST_CT,
  RAIL_DEPOT_UPKEEP_CT,
  RAIL_PLATFORM_COST_CT,
  RAIL_PLATFORM_UPKEEP_CT,
  RESALE_SHARE,
  SIGNAL_COST_CT,
  SIGNAL_UPKEEP_CT_PER_YEAR,
  ROAD_COST_PER_TILE_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  BUILDING_DEMOLITION_COST_CT,
  TILE_PUBLIC,
  TICKS_PER_YEAR,
} from '../constants';
import {
  isOneWay,
  packSignal,
  signalKind,
  SignalKind,
  SIGNAL_KIND_COUNT,
  SIGNAL_TRACK_DEGREE,
} from '../map/signals';
import type { TileMap } from '../map/TileMap';
import { WaypointKind } from '../map/waypoints';
import { Structure, structureUpkeepCt } from '../map/structures';
import { Terrain } from '../map/terrain';
import {
  directionFromDelta,
  oppositeDir,
  trackDegree,
  RAIL_TYPE_COST_CT,
  RAIL_TYPE_UPKEEP_CT,
  trackBit,
  TRACK_DX,
  TRACK_DY,
  RailType,
  type TrackDir,
} from '../map/track';
import { planRoadStop, roadBuildableAt, RoadStopShape } from '../net/roadBuilder';
import { planTrack } from '../net/trackBuilder';
import {
  airportSize,
  inCatchment,
  isSupportModule,
  isWaterModule,
  joinTargetIdFor,
  ModuleKind,
  recomputeCentre,
  stationOnTile,
  type Station,
  type StationModule,
} from '../station/types';
import { refreshCommercialShare } from '../industry/catchment';
import { createMonthCounters, createStationHistory } from '../station/history';
import { createReturnState } from '../station/returns';
import { assignStationCatchment } from '../town/update';
import { RoadBit } from '../town/types';
import type { Cargo } from '../cargo/types';
import { defaultCargo, vehicleSpec, VehicleKind } from '../vehicles/catalog';
import { powerCode as vehiclePowerCode } from '../vehicles/spec';
import { aggregateConsist, consistDefaultCargo, validateConsist } from '../vehicles/consist';
import { refitCapacity, refitPriceCt } from '../vehicles/refit';
import { releaseAll } from '../vehicles/reservations';
import { VehicleState } from '../vehicles/VehicleStore';
import {
  cleanVehicleGrantShare,
  electrificationGrantShare,
  grantedPriceCt,
} from '../economy/emissions';
import { bookDemolition, councilRefusal } from '../town/council';
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

/**
 * May the acting company work on this tile?
 *
 * A tile nobody built is PUBLIC - open country, and the roads a town lays for
 * itself - and anyone may build on it. A tile becomes a company's only when
 * that company puts the first road or track on it, which is what keeps a town's
 * own streets public for ever: extending one does not buy it.
 */
function mayBuildOn(world: World, tile: number): boolean {
  // The ONE ownership question in the build layer, and therefore the one place
  // the workshop rule of SPEC2 M22 answers it: inside an editor world every
  // tile is the author's, because a workshop that refused to move a
  // competitor's ground would be refusing to edit the world it exists to edit.
  if (ownershipWaived(world)) return true;
  const owner = world.map.owner[tile]!;
  return owner === TILE_PUBLIC || owner === world.company.id;
}

/**
 * Record who laid a piece of ROAD, if the tile was bare. Call BEFORE writing
 * the bits - afterwards there is no way to tell whether anything was there.
 *
 * A town street that a company merely extends stays the town's, which is what
 * stops a company owning a whole town's road network by paving one tile of it.
 */
function claimIfBare(world: World, tile: number): void {
  const map = world.map;
  if (map.roadBits[tile] === 0 && map.trackBits[tile] === 0) map.owner[tile] = world.company.id;
}

/**
 * Record who laid a piece of TRACK.
 *
 * Track is never a town's, so laying it across a public street takes the tile -
 * the level crossing is the company's to maintain, to answer to the council for
 * as noise, and to pull up again.
 */
function claimForTrack(world: World, tile: number): void {
  if (world.map.owner[tile] === TILE_PUBLIC) world.map.owner[tile] = world.company.id;
}

/** Hand a tile back once nothing built is left on it. */
function releaseIfBare(world: World, tile: number): void {
  const map = world.map;
  if (map.roadBits[tile] === 0 && map.trackBits[tile] === 0) map.owner[tile] = TILE_PUBLIC;
}

/**
 * Everything the acting company has to be allowed to do before it builds here:
 * the ground must not be someone else's, and the council must be willing
 * (section 13.3).
 *
 * One helper rather than two checks at twenty call sites, and it returns the
 * reason rather than a boolean so the refusal says which of the three it was.
 */
function buildPermission(world: World, tile: number): string | null {
  if (!mayBuildOn(world, tile)) return RejectReason.NotYours;
  return councilRefusal(world, tile);
}

/**
 * The ground test, one call on. It lives in `net/roadBuilder.ts` since D-210
 * so the build preview refuses exactly what the build refuses - the same
 * reason `planTrack` lives beside the track command rather than inside it.
 */
function roadBuildable(world: World, x: number, y: number): string | null {
  return roadBuildableAt(world.map, x, y);
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

/**
 * The bit a road tile carries towards an orthogonally adjacent neighbour, or 0
 * when the two are not neighbours. One table for the write and for the question
 * "is this pair already joined?" - two copies of this arithmetic is how the two
 * drift apart.
 */
function joinBit(size: number, fromTile: number, toTile: number): number {
  const dx = (toTile % size) - (fromTile % size);
  const dy = ((toTile / size) | 0) - ((fromTile / size) | 0);
  if (dx === 1 && dy === 0) return RoadBit.East;
  if (dx === -1 && dy === 0) return RoadBit.West;
  if (dy === 1 && dx === 0) return RoadBit.South;
  if (dy === -1 && dx === 0) return RoadBit.North;
  return 0;
}

/** Is this pair of adjacent tiles already joined, in both directions? */
function joined(world: World, fromTile: number, toTile: number): boolean {
  const size = world.map.size;
  const forward = joinBit(size, fromTile, toTile);
  if (forward === 0) return true;
  const bits = world.map.roadBits;
  return (
    (bits[fromTile]! & forward) !== 0 && (bits[toTile]! & joinBit(size, toTile, fromTile)) !== 0
  );
}

/** Connect two orthogonally adjacent tiles in both directions. */
function connect(world: World, fromTile: number, toTile: number): void {
  const size = world.map.size;
  const forward = joinBit(size, fromTile, toTile);
  if (forward === 0) return;
  const bits = world.map.roadBits;
  bits[fromTile] = bits[fromTile]! | forward;
  bits[toTile] = bits[toTile]! | joinBit(size, toTile, fromTile);
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
  let missingJoins = 0;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    const blocker = roadBuildable(world, tile % size, (tile / size) | 0);
    if (blocker !== null) return reject(blocker);
    const permission = buildPermission(world, tile);
    if (permission !== null) return reject(permission);
    if (world.map.roadBits[tile] === 0) newTiles++;
    if (i > 0 && !joined(world, tiles[i - 1]!, tile)) missingJoins++;
  }

  const cost = newTiles * ROAD_COST_PER_TILE_CT;
  const chargeCt = world.costCt(cost);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);
  // A run that lays no NEW tile may still be work: two roads that meet without
  // being joined are two roads, and joining them is what the drag NAMES. The
  // guard used to ask only about tiles and stood in front of the connect loop
  // below, so the last hop of a corridor - the one that reaches an existing
  // street - was refused before the junction it was there to write (a D-076
  // validator mismatch: the command refused what its own body was for). The
  // price stays per TILE: a join has never been charged for, here or in a run
  // that also lays tiles.
  if (newTiles === 0 && missingJoins === 0) return reject(RejectReason.NothingToDo);

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    claimIfBare(world, tile);
    if (world.map.terrain[tile] !== Terrain.TownGround) {
      world.map.terrain[tile] = Terrain.TownGround;
    }
    if (i > 0) connect(world, tiles[i - 1]!, tile);
  }

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += newTiles * ROAD_UPKEEP_PER_TILE_CT;
  world.company.fixedAssetsCt += cost;
  world.map.noteChange();
  return ACCEPTED;
}

/** Remove a single road tile and its connections. */
export function demolishRoad(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (world.map.roadBits[tile] === 0) return reject(RejectReason.NothingToDo);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

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
  // A roadside sign cannot outlive its road.
  if (world.map.waypoint[tile] === WaypointKind.Road) clearWaypoint(world, tile);
  releaseIfBare(world, tile);

  refundBuild(world, Math.round(ROAD_COST_PER_TILE_CT * DEMOLITION_REFUND));
  world.company.infrastructureUpkeepPerYearCt -= ROAD_UPKEEP_PER_TILE_CT;
  world.map.noteChange();
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
  for (const tile of route.tiles) {
    const permission = buildPermission(world, tile);
    if (permission !== null) return reject(permission);
  }
  // The electrification grant of section 14.3. It applies to the whole bill of
  // a route laid or converted as electrified, because the two are the same
  // decision: a company choosing wires over diesel is what the grant is for,
  // and paying it only for conversions would reward putting the wrong thing
  // down first.
  const grantShare = railType === RailType.Electrified ? electrificationGrantShare(world) : 0;
  const chargeCt = Math.round(world.costCt(route.costCt) * (1 - grantShare));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

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

    claimForTrack(world, from);
    claimForTrack(world, to);
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

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeepDelta;
  world.company.fixedAssetsCt += route.costCt;
  map.noteChange();

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
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

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
  // A marker post cannot outlive the track it stands beside.
  if (map.waypoint[tile] === WaypointKind.Rail) clearWaypoint(world, tile);
  releaseIfBare(world, tile);

  // Taking out one tile of a bridge takes out the bridge: half a viaduct is not
  // a thing, and leaving the deck standing with a hole in it would be worse.
  const structure = map.structure[tile]! as Structure;
  if (structure !== Structure.None) {
    world.company.infrastructureUpkeepPerYearCt -= structureUpkeepCt(structure);
    map.structure[tile] = Structure.None;
    map.structureHeight[tile] = 0;
  }

  refundBuild(world, Math.round(RAIL_TYPE_COST_CT[railType]! * DEMOLITION_REFUND));
  world.company.infrastructureUpkeepPerYearCt -= RAIL_TYPE_UPKEEP_CT[railType]!;
  map.noteChange();
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
  if (map.waypoint[tile] !== WaypointKind.None) return reject(RejectReason.WaypointInWay);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);
  if (signalKind(map.signal[tile]!) !== SignalKind.None) return reject(RejectReason.SignalExists);
  const chargeCt = world.costCt(SIGNAL_COST_CT);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  map.signal[tile] = packSignal(kind, direction);
  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += SIGNAL_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt += SIGNAL_COST_CT;
  map.noteChange();
  return ACCEPTED;
}

export function demolishSignal(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (signalKind(world.map.signal[tile]!) === SignalKind.None) {
    return reject(RejectReason.NoSignalHere);
  }

  clearSignal(world, tile);
  world.map.noteChange();
  return ACCEPTED;
}

/** Take a signal away and unwind what it cost, wherever that happens. */
function clearSignal(world: World, tile: number): void {
  if (signalKind(world.map.signal[tile]!) === SignalKind.None) return;
  world.map.signal[tile] = SignalKind.None;
  refundBuild(world, Math.round(SIGNAL_COST_CT * DEMOLITION_REFUND));
  world.company.infrastructureUpkeepPerYearCt -= SIGNAL_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt -= SIGNAL_COST_CT;
}

/**
 * Place a waypoint marker (section 12.1).
 *
 * What it becomes is what the tile carries - track wins over road, because a
 * level crossing is the railway's tile (D-101): a marker post on rail, a buoy
 * on water, a roadside sign on a road. The marker forces routes through its
 * tile and decides nothing else, which is why it may stand in a junction where
 * a signal may not (D-055 is about where a train STOPS; nothing stops here).
 */
export function buildWaypoint(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const map = world.map;
  const tile = map.tileIndex(x, y);

  if (map.waypoint[tile] !== WaypointKind.None) return reject(RejectReason.WaypointExists);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  if (signalKind(map.signal[tile]!) !== SignalKind.None) return reject(RejectReason.SignalExists);
  // A marker on a bridge deck or in a bore would need its own drawing rules
  // and its own terraform story; the tiles either side serve the same purpose.
  if (map.structure[tile] !== Structure.None) return reject(RejectReason.SignalOnStructure);

  const kind =
    map.trackBits[tile] !== 0
      ? WaypointKind.Rail
      : map.terrain[tile] === Terrain.Water
        ? WaypointKind.Buoy
        : map.roadBits[tile] !== 0
          ? WaypointKind.Road
          : WaypointKind.None;
  if (kind === WaypointKind.None) return reject(RejectReason.NeedsWaypointGround);

  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

  const chargeCt = world.costCt(WAYPOINT_COST_CT);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  // A buoy takes its open-water tile, exactly as a station module takes its
  // ground - that claim is what the terraform guard and competing builders
  // read. Track and road tiles already carry their builder's claim.
  if (map.owner[tile] === TILE_PUBLIC) map.owner[tile] = world.company.id;
  map.waypoint[tile] = kind;

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += WAYPOINT_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt += WAYPOINT_COST_CT;
  map.noteChange();
  return ACCEPTED;
}

export function demolishWaypoint(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  if (world.map.waypoint[tile] === WaypointKind.None) {
    return reject(RejectReason.NoWaypointHere);
  }
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

  clearWaypoint(world, tile);
  world.map.noteChange();
  return ACCEPTED;
}

/**
 * Take a waypoint away and unwind what it cost - the demolish command, the
 * track under a rail marker coming up, the road under a sign coming out.
 */
function clearWaypoint(world: World, tile: number): void {
  const map = world.map;
  if (map.waypoint[tile] === WaypointKind.None) return;
  map.waypoint[tile] = WaypointKind.None;
  releaseIfBare(world, tile);
  refundBuild(world, Math.round(WAYPOINT_COST_CT * DEMOLITION_REFUND));
  world.company.infrastructureUpkeepPerYearCt -= WAYPOINT_UPKEEP_CT_PER_YEAR;
  world.company.fixedAssetsCt -= WAYPOINT_COST_CT;
}

/** Station that owns a tile, or null - the shared rule, asked of this world. */
function stationAt(world: World, tile: number): Station | null {
  return stationOnTile(world.stations, tile);
}

/**
 * Nearest station of the same company within the join distance, so adjacent
 * modules form one station with a shared cargo pool (section 10).
 *
 * The rule itself lives in station/types.ts (`joinTargetIdFor`) since M14,
 * because the catchment preview has to answer the same question BEFORE the
 * click - one rule, two callers, no drift.
 */
function joinTarget(world: World, x: number, y: number): Station | null {
  const id = joinTargetIdFor(world.stations, world.company.id, x, y);
  if (id < 0) return null;
  for (const station of world.stations) {
    if (station.id === id) return station;
  }
  return null;
}

/**
 * Add a module to the nearest station of the company, or open a new one.
 * Shared by every mode, so a bus stop and a platform four tiles apart really do
 * become one station with one cargo pool (section 10).
 */
function attachModule(world: World, module: StationModule): Station {
  let station = joinTarget(world, module.x, module.y);
  // A module takes its tile. A platform standing on a public town street is
  // still the company's platform, and a competitor laying track through it
  // would be building inside somebody else's station.
  if (world.map.owner[module.tileIndex] === TILE_PUBLIC) {
    world.map.owner[module.tileIndex] = world.company.id;
  }

  if (station === null) {
    station = {
      id: world.stations.length,
      name: world.nextStationName(module.x, module.y),
      ownerId: world.company.id,
      modules: [module],
      x: module.x,
      y: module.y,
      waiting: [],
      visitTicks: [],
      servedReliability: 0,
      overflowUnits: 0,
      townId: -1,
      buildingsCovered: 0,
      // Derived from the map by `assignStationCatchment` below, like
      // `acceptedCargo`; zero is what "nothing scanned yet" is.
      commercialShare: 0,
      transferNode: false,
      acceptedCargo: 0,
      servedIndustries: [],
      runwayFreeTick: [],
      history: createStationHistory(),
      historyCursor: 0,
      monthCounters: createMonthCounters(),
      // The return-journey ledger of SPEC2 M19: a station that has never been
      // reached owes nobody a way home, so an empty ledger is the truth about
      // a stop that was built one tick ago.
      returnState: createReturnState(),
      returnMonths: 0,
    };
    world.stations.push(station);
  } else {
    station.modules.push(module);
  }

  recomputeCentre(station);
  assignStationCatchment(world, station);
  return station;
}

/**
 * Place a bus stop, a lorry bay or a road depot - on the carriageway or
 * BESIDE it (D-210).
 *
 * The shape is decided by the tile the click lands on and both are legal:
 * a tile that already carries road gets a drive-through stop exactly as it
 * did before D-210, and a bare tile beside a road gets a BAY - the module on
 * ground of its own, with one tile of road laid to reach it and charged for
 * at road's own price. `planRoadStop` decides which, and the build preview
 * calls the same function on the same map, so the picture before the click
 * and the bill after it are one answer (D-119).
 *
 * The two things the planner may not know stay here: whether the council is
 * willing (13.3) and whether the company can pay.
 */
export function buildRoadStop(
  world: World,
  x: number,
  y: number,
  kind: ModuleKind,
): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(x, y);
  const plan = planRoadStop(world.map, world.company.id, x, y, kind);
  if (plan.reasonKey !== null) return reject(plan.reasonKey);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  if (world.map.waypoint[tile] !== WaypointKind.None) return reject(RejectReason.WaypointInWay);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

  const chargeCt = world.costCt(plan.costCt);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  if (plan.shape === RoadStopShape.Bay) {
    // The spur is ROAD, laid by the road command's own two writes, so
    // everything that already knows a road bit - the pathfinder, the
    // congestion layer, the throughput meter, the demolition path and the
    // renderer - knows the bay for free. One connection only: a dead end
    // cannot be an interior node of a route, so no traffic cuts through the
    // station tile.
    claimIfBare(world, tile);
    if (world.map.terrain[tile] !== Terrain.TownGround) {
      world.map.terrain[tile] = Terrain.TownGround;
    }
    connect(world, tile, plan.spurTile);
  }

  attachModule(world, { kind, tileIndex: tile, x, y });

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += plan.upkeepCtPerYear;
  world.company.fixedAssetsCt += plan.costCt;
  world.map.noteChange();
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
  if (world.map.waypoint[tile] !== WaypointKind.None) return reject(RejectReason.WaypointInWay);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);

  const cost = kind === ModuleKind.RailDepot ? RAIL_DEPOT_COST_CT : RAIL_PLATFORM_COST_CT;
  const upkeep = kind === ModuleKind.RailDepot ? RAIL_DEPOT_UPKEEP_CT : RAIL_PLATFORM_UPKEEP_CT;
  const chargeCt = world.costCt(cost);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeep;
  world.company.fixedAssetsCt += cost;
  world.map.noteChange();
  return ACCEPTED;
}

/**
 * Place a quay or a ship shed on the water (section 10).
 *
 * The tile must be water and must TOUCH the shore. Both halves matter: a berth
 * in the middle of a lake serves nothing, and the shoreline test is also what
 * stops a player quietly building a port on the far side of an ocean nothing
 * can reach - a quay is where land meets water, which is what a port is.
 *
 * Unlike every other module this one stands on a tile the catchment deliberately
 * does not measure from (D-095).
 */
export function buildWaterStop(
  world: World,
  x: number,
  y: number,
  kind: ModuleKind,
): CommandOutcome {
  if (!isWaterModule(kind)) return reject(RejectReason.UnknownModule);
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);

  const map = world.map;
  const tile = map.tileIndex(x, y);
  if (map.terrain[tile] !== Terrain.Water) return reject(RejectReason.NeedsWater);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  if (map.waypoint[tile] !== WaypointKind.None) return reject(RejectReason.WaypointInWay);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);
  if (!touchesShore(map, x, y)) return reject(RejectReason.NeedsShore);

  const cost = kind === ModuleKind.ShipDepot ? SHIP_DEPOT_COST_CT : QUAY_COST_CT;
  const upkeep = kind === ModuleKind.ShipDepot ? SHIP_DEPOT_UPKEEP_CT : QUAY_UPKEEP_CT;
  const chargeCt = world.costCt(cost);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += upkeep;
  world.company.fixedAssetsCt += chargeCt;
  map.noteChange();
  return ACCEPTED;
}

/** Does this water tile have land on one of its eight sides? */
function touchesShore(map: TileMap, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!map.contains(nx, ny)) continue;
      if (map.terrain[map.tileIndex(nx, ny)] !== Terrain.Water) return true;
    }
  }
  return false;
}

/**
 * Build an airport (section 10), in one of the three sizes of M7.
 *
 * The three sizes are three module KINDS rather than one kind with a size
 * field: `StationModule` is {kind, tile, x, y} and nothing else, and giving it
 * per-module data for one field would change the saved shape of every module in
 * the game (DECISIONS.md D-099). It occupies ONE tile for the same reason -
 * `stationAt`, `recomputeCentre` and `platformLength` all index a module by a
 * single tile, and a multi-tile footprint would have to teach all three.
 *
 * An aircraft is bought here too: an airport is its own shed.
 */
export function buildAirport(world: World, x: number, y: number, kind: ModuleKind): CommandOutcome {
  const size = airportSize(kind);
  if (size < 0) return reject(RejectReason.UnknownModule);
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);

  const map = world.map;
  const tile = map.tileIndex(x, y);
  if (stationAt(world, tile) !== null) return reject(RejectReason.Occupied);
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);
  if (
    map.terrain[tile] === Terrain.Water ||
    map.roadBits[tile] !== 0 ||
    map.trackBits[tile] !== 0 ||
    map.buildingKind[tile] !== 0 ||
    map.industryId[tile] !== -1
  ) {
    return reject(RejectReason.GroundNotClear);
  }
  // A runway needs flat ground. This is the one build in the game that refuses
  // a slope outright rather than working around it.
  if (map.slopeAt(x, y) !== 0) return reject(RejectReason.TooSteep);

  const chargeCt = world.costCt(AIRPORT_COST_CT[size]!);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += AIRPORT_UPKEEP_CT[size]!;
  world.company.fixedAssetsCt += chargeCt;
  map.noteChange();
  return ACCEPTED;
}

/** Buy an aircraft at an airport. */
export function buyAircraft(
  world: World,
  airportX: number,
  airportY: number,
  specId: number,
): CommandOutcome {
  if (!world.map.contains(airportX, airportY)) return reject(RejectReason.OutsideMap);
  const tile = world.map.tileIndex(airportX, airportY);

  const station = stationAt(world, tile);
  const here = station?.modules.find((m) => m.tileIndex === tile);
  if (here === undefined || airportSize(here.kind) < 0) return reject(RejectReason.NeedsDepot);

  const spec = vehicleSpec(specId);
  if (spec.kind !== VehicleKind.Aircraft) return reject(RejectReason.WrongVehicleKind);

  const year = world.date.year;
  if (year < spec.introYear || year > spec.retireYear) return reject(RejectReason.NotAvailableYet);
  // The low-emission purchase grant of section 14.3 (SPEC2 M21): what the
  // company really pays, through the ONE function all four buy commands share.
  // Exactly the inflated list price in a world without the levy and before its
  // own year, so nothing before 2000 moves by a cent.
  const chargeCt = grantedPriceCt(world, spec.priceCt, vehiclePowerCode(spec.power));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(specId, world.company.id, tile, world.tick, defaultCargo(spec));
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  chargeBuild(world, chargeCt);
  world.company.vehicleUpkeepPerYearCt += spec.upkeepCtPerYear;
  world.company.fixedAssetsCt += chargeCt;
  return ACCEPTED;
}

/**
 * Buy a ship at a shed (section 11.5).
 *
 * The same shape as `buyRoadVehicle` - the depot check, the mode check, the
 * calendar and the money - which is the point: a ship is a vehicle and nothing
 * downstream of here needs to know it floats.
 */
export function buyShip(
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
    station.modules.some((m) => m.tileIndex === tile && m.kind === ModuleKind.ShipDepot);
  if (!isDepot) return reject(RejectReason.NeedsDepot);

  const spec = vehicleSpec(specId);
  if (spec.kind !== VehicleKind.Ship) return reject(RejectReason.WrongVehicleKind);

  const year = world.date.year;
  if (year < spec.introYear || year > spec.retireYear) return reject(RejectReason.NotAvailableYet);
  // The low-emission purchase grant of section 14.3 (SPEC2 M21): what the
  // company really pays, through the ONE function all four buy commands share.
  // Exactly the inflated list price in a world without the levy and before its
  // own year, so nothing before 2000 moves by a cent.
  const chargeCt = grantedPriceCt(world, spec.priceCt, vehiclePowerCode(spec.power));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(specId, world.company.id, tile, world.tick, defaultCargo(spec));
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  chargeBuild(world, chargeCt);
  world.company.vehicleUpkeepPerYearCt += spec.upkeepCtPerYear;
  world.company.fixedAssetsCt += chargeCt;
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
  const permission = buildPermission(world, tile);
  if (permission !== null) return reject(permission);
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
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  attachModule(world, { kind, tileIndex: tile, x, y });

  chargeBuild(world, chargeCt);
  world.company.infrastructureUpkeepPerYearCt += SUPPORT_MODULE_UPKEEP_CT[kind]!;
  world.company.fixedAssetsCt += cost;
  map.noteChange();
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
  // The low-emission purchase grant of section 14.3 (SPEC2 M21): what the
  // company really pays, through the ONE function all four buy commands share.
  // The traction unit decides it, which is the same spec the vehicle store
  // caches its power code from. Exactly the inflated list price in a world
  // without the levy and before its own year.
  const power = vehiclePowerCode(vehicleSpec(specIds[0]!).power);
  const chargeCt = grantedPriceCt(world, aggregate.priceCt, power);
  // The book value is the LIST price less the same grant - never the inflated
  // charge, which is what this line has always booked (an asset is carried at
  // what it cost in the money of its own year, and moving that here would
  // re-band every game this milestone did not touch).
  const assetCt = Math.round(aggregate.priceCt * (1 - cleanVehicleGrantShare(world, power)));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(
    specIds[0]!,
    world.company.id,
    tile,
    world.tick,
    consistDefaultCargo(specIds),
    specIds,
  );
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  world.vehicles.reliability[id] = aggregate.reliability0;
  world.vehicles.state[id] = VehicleState.Stopped;

  chargeBuild(world, chargeCt);
  world.company.vehicleUpkeepPerYearCt += aggregate.upkeepCtPerYear;
  world.company.fixedAssetsCt += assetCt;
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
  // The low-emission purchase grant of section 14.3 (SPEC2 M21): what the
  // company really pays, through the ONE function all four buy commands share.
  // Exactly the inflated list price in a world without the levy and before its
  // own year, so nothing before 2000 moves by a cent.
  const chargeCt = grantedPriceCt(world, spec.priceCt, vehiclePowerCode(spec.power));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  const id = world.vehicles.create(specId, world.company.id, tile, world.tick, defaultCargo(spec));
  if (id === -1) return reject(RejectReason.TooManyVehicles);

  world.vehicles.reliability[id] = spec.reliability0;
  world.vehicles.state[id] = VehicleState.Stopped;

  chargeBuild(world, chargeCt);
  world.company.vehicleUpkeepPerYearCt += spec.upkeepCtPerYear;
  // The list price less the same grant, for the reason `buyTrain` gives.
  world.company.fixedAssetsCt += Math.round(
    spec.priceCt * (1 - cleanVehicleGrantShare(world, vehiclePowerCode(spec.power))),
  );
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
  const kind = vehicles.kind[vehicleId];
  const wanted =
    kind === VehicleKind.Train
      ? ModuleKind.RailDepot
      : kind === VehicleKind.Ship
        ? ModuleKind.ShipDepot
        : ModuleKind.RoadDepot;
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

  // The same capacity and price the per-order refit of section 12.1 uses -
  // one validator, two doors (vehicles/refit.ts).
  if (refitCapacity(vehicles, vehicleId, cargo) <= 0) return reject(RejectReason.CannotCarry);

  const chargeCt = world.costCt(refitPriceCt(vehicles, vehicleId));
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  vehicles.refitCargo[vehicleId] = cargo;
  vehicles.refreshAggregate(vehicleId);
  chargeBuild(world, chargeCt);
  return ACCEPTED;
}

/**
 * Clear a town building (section 13.3).
 *
 * The one build in the game that costs a company standing rather than only
 * money. It exists so that a house is an obstacle a player can pay to remove
 * rather than a permanent wall, and so that "buildings demolished" is a real
 * input to the council rating instead of one that is structurally always zero.
 */
export function demolishBuilding(world: World, x: number, y: number): CommandOutcome {
  if (!world.map.contains(x, y)) return reject(RejectReason.OutsideMap);
  const map = world.map;
  const tile = map.tileIndex(x, y);

  if (map.buildingKind[tile] === 0) return reject(RejectReason.NoBuilding);
  const refusal = councilRefusal(world, tile);
  if (refusal !== null) return reject(refusal);

  const chargeCt = world.costCt(BUILDING_DEMOLITION_COST_CT);
  if (!affordable(world, chargeCt)) return reject(RejectReason.InsufficientFunds);

  map.buildingKind[tile] = 0;
  map.buildingLevel[tile] = 0;
  // The zone mix every covering stop sells tickets by is DERIVED and is
  // recomputed for every station on load, so a demolition that left it stale
  // made the same world split its passengers differently after a load than
  // before the save - law #3, silently, since M19 gave the share a meaning.
  // Found while SPEC2 M20 gave the growth the same duty (D-231).
  for (let index = 0; index < world.stations.length; index++) {
    const station = world.stations[index]!;
    if (!inCatchment(station, x, y)) continue;
    refreshCommercialShare(map, station);
  }
  chargeBuild(world, chargeCt);
  bookDemolition(world, tile);
  map.noteChange();
  return ACCEPTED;
}

export function sellVehicle(world: World, vehicleId: number): CommandOutcome {
  if (!world.vehicles.isAlive(vehicleId)) return reject(RejectReason.NoSuchVehicle);
  // Nobody sells a competitor's lorry. The check is what makes the winding-up
  // of section 14.2 safe to run for any company: it acts as that company, and
  // anything it does not own it cannot touch.
  if (world.vehicles.ownerId[vehicleId] !== world.company.id) {
    return reject(RejectReason.NotYours);
  }

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

  refundBuild(world, refund);
  world.company.vehicleUpkeepPerYearCt -= upkeepCt;
  world.company.fixedAssetsCt -= priceCt;
  // The store holds no reference to the world, so the track it claimed has to
  // be given back here rather than inside destroy().
  releaseAll(world, vehicleId);
  world.vehicles.destroy(vehicleId);
  return ACCEPTED;
}
