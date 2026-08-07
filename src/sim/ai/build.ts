import type { Cargo } from '../cargo/types';
import { CommandKind, type Command } from '../commands/types';
import type { CommandQueue } from '../commands/queue';
import {
  AI_PLATFORM_TILES,
  AI_RAIL_CORRIDOR_SKEW_MAX,
  AI_RAIL_MAX_TRAINS,
  AI_RAIL_LOOP_MARGIN,
  AI_RAIL_MIN_TILES,
  AI_RAIL_OVAL_GAP,
  AI_RAIL_WAGONS,
  AI_ROAD_DETOUR_MARGIN,
  AI_SIGNAL_SPACING,
  SEA_LEVEL,
  TILE_PUBLIC,
  TOWN_ROAD_MAX_SLOPE,
} from '../constants';
import { planTrack } from '../net/trackBuilder';
import { RailType } from '../map/track';
import { Structure } from '../map/structures';
import { slopeRise, Terrain } from '../map/terrain';
import { ModuleKind } from '../station/types';
import {
  availableRailVehicles,
  availableVehicles,
  capacityFor,
  RailRole,
  VehicleKind,
} from '../vehicles/catalog';
import type { World } from '../World';

/**
 * Turning a chosen opportunity into commands (step 2 of section 15).
 *
 * Everything an AI builds goes through the ordinary command queue, stamped with
 * its own company id and scheduled for the NEXT tick - the current one is
 * already draining. That is what makes the AI's building indistinguishable from
 * the player's: the same route assistant, the same prices, the same refusals,
 * and the whole of it in the replay log.
 */

/**
 * Where the pieces of a line actually ended up.
 *
 * The caller asked for a line between two points; what it gets back is where
 * the PLATFORMS and the SHED went, which for a railway is not the same thing.
 * The next stage of the project looks the stations up by tile, so a project
 * that remembered the points it asked for would find nothing there and throw
 * the half-built railway away.
 */
export interface BuiltLine {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly shed: { x: number; y: number };
  /**
   * Most trains the railway that was actually laid can carry: the oval takes
   * AI_RAIL_MAX_TRAINS, the single-track fallback exactly ONE - a second
   * train on single track meets the first nose to nose and deadlocks
   * (D-059). Roads ignore it.
   */
  readonly railTrains: number;
}

/** A tile a stop can stand on: bare, flat, dry, and nobody else's. */
export function clearStopTile(world: World, x: number, y: number): boolean {
  const map = world.map;
  if (!map.contains(x, y)) return false;
  const tile = map.tileIndex(x, y);
  if (map.terrain[tile] === Terrain.Water) return false;
  if (map.baseHeight(x, y) <= SEA_LEVEL) return false;
  if (map.buildingKind[tile] !== 0 || map.industryId[tile] !== -1) return false;
  if (map.trackBits[tile] !== 0) return false;
  return map.slopeAt(x, y) === 0;
}

/**
 * A tile beside a source or a sink to put the stop on.
 *
 * Scanned outward in a fixed order rather than searched for the best one: the
 * catchment is a radius, so any tile that touches the works will do, and a
 * deterministic scan is one fewer thing that can differ between two runs of the
 * same seed.
 */
export function stopTileNear(world: World, x: number, y: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (clearStopTile(world, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

/** A tile next to the stop for the depot, on the side away from the far end. */
export function depotTileNear(
  world: World,
  stop: { x: number; y: number },
  awayFrom: { x: number; y: number },
): { x: number; y: number } | null {
  const stepX = Math.sign(stop.x - awayFrom.x);
  const stepY = Math.sign(stop.y - awayFrom.y);

  // Orthogonal neighbours FIRST. A depot reached by a single diagonal piece of
  // track is a depot whose train cannot find its way out - measured on
  // balancing scenario 5, where six months of a locomotive standing in its
  // shed with no route was the whole of the company's first year.
  const candidates = [
    { x: stop.x + stepX, y: stop.y },
    { x: stop.x, y: stop.y + stepY },
    { x: stop.x - stepX, y: stop.y },
    { x: stop.x, y: stop.y - stepY },
    { x: stop.x + stepX, y: stop.y + stepY },
  ];
  for (const candidate of candidates) {
    if (candidate.x === stop.x && candidate.y === stop.y) continue;
    if (clearStopTile(world, candidate.x, candidate.y)) return candidate;
  }
  return null;
}

/**
 * The vehicle an AI would buy for this cargo.
 *
 * Biggest capacity that is on the market and can carry the load, which is the
 * choice a player makes nine times in ten. Ties break on the lower id so the
 * pick is stable.
 */
export function pickRoadVehicle(world: World, cargo: number): number {
  let best = -1;
  let bestCapacity = 0;

  for (const spec of availableVehicles(VehicleKind.Road, world.date.year)) {
    const capacity = capacityFor(spec, cargo as Cargo);
    if (capacity <= 0) continue;
    if (capacity > bestCapacity || (capacity === bestCapacity && spec.id < best)) {
      best = spec.id;
      bestCapacity = capacity;
    }
  }
  return best;
}

/** A locomotive and a rake of wagons for this cargo, or an empty list. */
export function pickTrain(world: World, cargo: number): number[] {
  const year = world.date.year;

  let locomotive = -1;
  let bestPower = 0;
  for (const spec of availableRailVehicles(RailRole.Traction, year)) {
    // Never electric: the AI lays plain track, and a wire-only locomotive on it
    // is a vehicle that will not move.
    if (spec.power === 'electric') continue;
    if (spec.powerW > bestPower || (spec.powerW === bestPower && spec.id < locomotive)) {
      locomotive = spec.id;
      bestPower = spec.powerW;
    }
  }
  if (locomotive < 0) return [];

  let wagon = -1;
  let bestCapacity = 0;
  for (const spec of availableRailVehicles(RailRole.Wagon, year)) {
    const capacity = capacityFor(spec, cargo as Cargo);
    if (capacity <= 0) continue;
    if (capacity > bestCapacity || (capacity === bestCapacity && spec.id < wagon)) {
      wagon = spec.id;
      bestCapacity = capacity;
    }
  }
  if (wagon < 0) return [];

  const consist = [locomotive];
  for (let i = 0; i < AI_RAIL_WAGONS; i++) consist.push(wagon);
  return consist;
}

/**
 * A tile the AI's road may run over: an existing road that is public or its
 * own - riding a town street is free and legal - or ground bare enough that
 * `BuildRoad` will accept it (the same water, industry, building, slope and
 * ownership questions `roadBuildable` and `buildPermission` ask, answered
 * from the same layers).
 */
function roadTilePassable(world: World, companyId: number, x: number, y: number): boolean {
  const map = world.map;
  if (!map.contains(x, y)) return false;
  const tile = map.tileIndex(x, y);
  const owner = map.owner[tile]!;
  if (owner !== TILE_PUBLIC && owner !== companyId) return false;
  if (map.roadBits[tile] !== 0) return true;
  if (map.terrain[tile] === Terrain.Water) return false;
  if (map.industryId[tile] !== -1) return false;
  if (map.buildingKind[tile] !== 0) return false;
  return slopeRise(map.slopeAt(x, y)) <= TOWN_ROAD_MAX_SLOPE;
}

/** One straight stretch of road, the shape one BuildRoad command lays. */
export interface RoadRun {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The road between two points, found rather than assumed.
 *
 * `BuildRoad` lays an L between its endpoints and rejects the WHOLE command
 * on the first blocked tile. The player sees the lake before dragging; the
 * AI used to drag blind - measured on the scenario-5 trace, every one of six
 * town-to-town roads was refused, the buses were bought anyway, and each of
 * those lines spent its whole review period in KEIN_WEG (the road-branch
 * twin of the rail branch's planTrack validation, which never had this
 * hole).
 *
 * A breadth-first search over passable tiles - iterative, fixed neighbour
 * order, FIFO, so the result is a pure function of the map (laws #3 and #8)
 * - bounded to the corridor box inflated by AI_ROAD_DETOUR_MARGIN. The path
 * comes back as maximal straight RUNS, each of which one BuildRoad command
 * lays exactly. A run that lies entirely on existing streets is enqueued
 * like the rest; the command refuses it as NothingToDo, which costs nothing.
 * No path inside the box means the candidate is skipped rather than
 * half-built.
 */
export function planRoadRuns(
  world: World,
  companyId: number,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): RoadRun[] | null {
  const map = world.map;
  const size = map.size;
  if (from.x === to.x && from.y === to.y) return [];

  const minX = Math.max(0, Math.min(from.x, to.x) - AI_ROAD_DETOUR_MARGIN);
  const maxX = Math.min(size - 1, Math.max(from.x, to.x) + AI_ROAD_DETOUR_MARGIN);
  const minY = Math.max(0, Math.min(from.y, to.y) - AI_ROAD_DETOUR_MARGIN);
  const maxY = Math.min(size - 1, Math.max(from.y, to.y) + AI_ROAD_DETOUR_MARGIN);

  const start = map.tileIndex(from.x, from.y);
  const goal = map.tileIndex(to.x, to.y);
  const cameFrom = new Map<number, number>();
  cameFrom.set(start, start);
  const queue: number[] = [start];
  let head = 0;

  // East, south, west, north - a fixed order, so the tree is the same tree
  // in every run of the same world.
  const stepX = [1, 0, -1, 0];
  const stepY = [0, 1, 0, -1];

  while (head < queue.length) {
    const tile = queue[head]!;
    head++;
    if (tile === goal) break;
    const x = tile % size;
    const y = (tile / size) | 0;
    for (let n = 0; n < 4; n++) {
      const nx = x + stepX[n]!;
      const ny = y + stepY[n]!;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const next = ny * size + nx;
      if (cameFrom.has(next)) continue;
      if (!roadTilePassable(world, companyId, nx, ny)) continue;
      cameFrom.set(next, tile);
      queue.push(next);
    }
  }
  if (!cameFrom.has(goal)) return null;

  // Walk the tree back to the start, then forwards into straight runs.
  const path: number[] = [];
  for (let tile = goal; ; tile = cameFrom.get(tile)!) {
    path.push(tile);
    if (tile === start) break;
  }
  path.reverse();

  const runs: RoadRun[] = [];
  let runStart = path[0]!;
  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1]!;
    const tile = path[i]!;
    const nextDx = (tile % size) - (previous % size);
    const nextDy = ((tile / size) | 0) - ((previous / size) | 0);
    const continues =
      i + 1 < path.length &&
      (path[i + 1]! % size) - (tile % size) === nextDx &&
      ((path[i + 1]! / size) | 0) - ((tile / size) | 0) === nextDy;
    if (!continues) {
      runs.push({
        x1: runStart % size,
        y1: (runStart / size) | 0,
        x2: tile % size,
        y2: (tile / size) | 0,
      });
      runStart = tile;
    }
  }
  return runs;
}

/** A tile the return track of the oval may claim: bare of rail, ours to take. */
function clearRailTile(world: World, companyId: number, x: number, y: number): boolean {
  const map = world.map;
  if (!map.contains(x, y)) return false;
  const tile = map.tileIndex(x, y);
  if (map.terrain[tile] === Terrain.Water) return false;
  if (map.structure[tile] !== Structure.None) return false;
  if (map.buildingKind[tile] !== 0 || map.industryId[tile] !== -1) return false;
  if (map.trackBits[tile] !== 0) return false;
  const owner = map.owner[tile]!;
  return owner === TILE_PUBLIC || owner === companyId;
}

/** The geometry of an AI railway, found whole before anything is ordered. */
export interface OvalPlan {
  /** The two long one-way rows, drawn in the direction of travel. */
  readonly rows: readonly RoadRun[];
  /** End connectors and the shed stub - plain track, no signals. */
  readonly plain: readonly RoadRun[];
  /** Platform tiles, on the outbound row, A's first. */
  readonly platforms: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly shed: { readonly x: number; readonly y: number };
}

/**
 * The oval of the takt fixture, planned onto real terrain: two straight
 * parallel one-way rows joined at both ends, both platforms on the outbound
 * row, the shed on a stub off the return row that MERGES (D-082). Trains
 * circulate, follow, and never meet head on - the shape that lets stage C2
 * put a second train on a line at all (two trains on the old out-and-back
 * single track met nose to nose, the stated limitation of D-059).
 *
 * The corridor must be STRAIGHT: candidate rows are tried across the span
 * (nearest the midline first, both sides of the corridor), and a pair no
 * straight row can serve is skipped rather than bent around. A free-form
 * offset copy of an assistant-planned route was tried first and refused
 * every candidate on real terrain - the offset of a curve lands on hills,
 * water and its own outbound track. Every run is validated with the very
 * planner the build command runs (section 17.3's rule applied to the AI).
 */
export function planRailOval(
  world: World,
  companyId: number,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): OvalPlan | null {
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const aU = horizontal ? a.x : a.y;
  const aV = horizontal ? a.y : a.x;
  const bU = horizontal ? b.x : b.y;
  const bV = horizontal ? b.y : b.x;
  if (Math.abs(hiOf(aU, bU) - loOf(aU, bU)) < AI_RAIL_MIN_TILES) return null;

  const mid = Math.round((aV + bV) / 2);
  for (const wobble of [0, 1, -1, 2, -2, 3, -3]) {
    const v = mid + wobble;
    if (Math.abs(v - aV) > AI_RAIL_CORRIDOR_SKEW_MAX) continue;
    if (Math.abs(v - bV) > AI_RAIL_CORRIDOR_SKEW_MAX) continue;
    for (const side of [AI_RAIL_OVAL_GAP, -AI_RAIL_OVAL_GAP]) {
      const plan = tryOval(world, companyId, horizontal, v, v + side, aU, bU);
      if (plan !== null) return plan;
    }
  }
  return null;
}

function loOf(aU: number, bU: number): number {
  return Math.min(aU, bU) - AI_RAIL_LOOP_MARGIN;
}

function hiOf(aU: number, bU: number): number {
  return Math.max(aU, bU) + AI_RAIL_LOOP_MARGIN;
}

function tryOval(
  world: World,
  companyId: number,
  horizontal: boolean,
  v: number,
  v2: number,
  aU: number,
  bU: number,
): OvalPlan | null {
  const at = (u: number, w: number): { x: number; y: number } =>
    horizontal ? { x: u, y: w } : { x: w, y: u };
  const lo = loOf(aU, bU);
  const hi = hiOf(aU, bU);

  // Every tile of both rows and both end connectors, bare and ours to take.
  for (let u = lo; u <= hi; u++) {
    const p = at(u, v);
    const q = at(u, v2);
    if (!clearRailTile(world, companyId, p.x, p.y)) return null;
    if (!clearRailTile(world, companyId, q.x, q.y)) return null;
  }
  const step = v2 > v ? 1 : -1;
  for (let w = v + step; w !== v2; w += step) {
    const p = at(lo, w);
    const q = at(hi, w);
    if (!clearRailTile(world, companyId, p.x, p.y)) return null;
    if (!clearRailTile(world, companyId, q.x, q.y)) return null;
  }

  // The shed stub: mid-corridor, off the return row, pointing away from the
  // oval, merging rather than crossing (D-082).
  let stubU = -1;
  let shed: { x: number; y: number } | null = null;
  const um = (lo + hi) >> 1;
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const u = um + offset;
    if (u <= lo + 1 || u >= hi - 1) continue;
    const s1 = at(u, v2 + step);
    const s2 = at(u, v2 + 2 * step);
    if (!clearRailTile(world, companyId, s1.x, s1.y)) continue;
    if (!clearRailTile(world, companyId, s2.x, s2.y)) continue;
    stubU = u;
    shed = s2;
    break;
  }
  if (shed === null) return null;

  // Drawn in the direction of travel, so the one-way signals the build lays
  // face the way the trains run: outbound A towards B, return B towards A.
  const dirU = bU >= aU ? 1 : -1;
  const outFrom = at(dirU > 0 ? lo : hi, v);
  const outTo = at(dirU > 0 ? hi : lo, v);
  const backFrom = at(dirU > 0 ? hi : lo, v2);
  const backTo = at(dirU > 0 ? lo : hi, v2);
  const rows: RoadRun[] = [
    { x1: outFrom.x, y1: outFrom.y, x2: outTo.x, y2: outTo.y },
    { x1: backFrom.x, y1: backFrom.y, x2: backTo.x, y2: backTo.y },
  ];
  const stubTop = at(stubU, v2);
  const plain: RoadRun[] = [
    { x1: at(lo, v).x, y1: at(lo, v).y, x2: at(lo, v2).x, y2: at(lo, v2).y },
    { x1: at(hi, v).x, y1: at(hi, v).y, x2: at(hi, v2).x, y2: at(hi, v2).y },
    { x1: stubTop.x, y1: stubTop.y, x2: shed.x, y2: shed.y },
  ];
  for (const run of [...rows, ...plain]) {
    if (!planTrack(world.map, run.x1, run.y1, run.x2, run.y2, RailType.Plain, false).ok) {
      return null;
    }
  }

  // Platforms on the outbound row, each running from its anchor towards the
  // middle of the line so neither reaches a connector junction.
  const platforms: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < AI_PLATFORM_TILES; i++) platforms.push(at(aU + i * dirU, v));
  for (let i = 0; i < AI_PLATFORM_TILES; i++) platforms.push(at(bU - i * dirU, v));

  return { rows, plain, platforms, from: at(aU, v), to: at(bU, v), shed };
}

/**
 * The infrastructure half of a line: the way between the two ends, a stop at
 * each end, and a depot beside one of them.
 *
 * Enqueued in one go and then FORGOTTEN. The next decision cycle looks at what
 * actually exists rather than at what was ordered, so a route the assistant
 * refused or a stop the council blocked ends the project instead of leaving the
 * AI convinced it owns a railway it never built.
 *
 * A RAILWAY is a one-way OVAL where the terrain allows one - the exact shape
 * the takt fixture proved over five game years with two trains (see
 * `planRailOval`) - and the assistant-planned SINGLE line with one train
 * everywhere else. The oval-only version was measured on the scenario-5
 * trace and refused every candidate the rail personality ever saw: a rigid
 * straight corridor dies on real terrain three separate ways (the anchor
 * rows cross the industry footprints themselves, the gradient window of
 * D-042 rejects a dead-straight row on almost any generated relief, and the
 * mid-corridor is water for every third pair) - so a competitor with no
 * fallback builds NOTHING, which is strictly worse than the D-115 shape it
 * replaced. One train on assistant-planned track is slow; zero railways is
 * a company that never existed.
 */
export function enqueueInfrastructure(
  queue: CommandQueue,
  world: World,
  companyId: number,
  plan: {
    readonly from: { x: number; y: number };
    readonly to: { x: number; y: number };
    readonly depot: { x: number; y: number };
    readonly rail: boolean;
  },
): BuiltLine | null {
  const tick = world.tick + 1;
  const push = (command: Command): void => {
    queue.enqueue(command, tick, companyId);
  };

  if (plan.rail) {
    // The whole oval is planned before anything is ordered; a pair no
    // straight corridor can serve falls back to the single line below.
    const oval = planRailOval(world, companyId, plan.from, plan.to);
    if (oval === null) return enqueueSingleTrack(push, world, plan.from, plan.to);

    // The two one-way rows, signalled by the auto-signalling of 9.4 along
    // the drawn direction - which is the direction of travel, because
    // planRailOval drew them that way.
    for (const run of oval.rows) {
      push({
        kind: CommandKind.BuildTrack,
        x1: run.x1,
        y1: run.y1,
        x2: run.x2,
        y2: run.y2,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: AI_SIGNAL_SPACING,
      });
    }
    // End connectors and the shed stub: plain track, no signals - a signal
    // belongs on plain line, and these are junction throats (D-055).
    for (const run of oval.plain) {
      push({
        kind: CommandKind.BuildTrack,
        x1: run.x1,
        y1: run.y1,
        x2: run.x2,
        y2: run.y2,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: 0,
      });
    }
    push({
      kind: CommandKind.BuildRailStop,
      x: oval.shed.x,
      y: oval.shed.y,
      moduleKind: ModuleKind.RailDepot,
    });
    /*
     * Platforms sit ON the outbound row, AI_PLATFORM_TILES long - the shape
     * balancing scenario 2 proved: a one-tile platform under a six-unit
     * train works only the share that fits, minus forty percent (section
     * 10), and a platform on the last tile of the track leaves a train
     * nowhere to finish arriving.
     */
    for (const platform of oval.platforms) {
      push({
        kind: CommandKind.BuildRailStop,
        x: platform.x,
        y: platform.y,
        moduleKind: ModuleKind.RailPlatform,
      });
    }

    // Where everything REALLY went - for a railway none of the three is the
    // point the caller asked for.
    return { from: oval.from, to: oval.to, shed: oval.shed, railTrains: AI_RAIL_MAX_TRAINS };
  }

  // The road is FOUND before anything is ordered - the road-branch twin of
  // the rail branch's planTrack call above. A pair the search cannot join
  // inside its corridor is skipped whole, instead of leaving two stops, a
  // depot and a fleet with no road between them.
  const trunk = planRoadRuns(world, companyId, plan.from, plan.to);
  if (trunk === null) return null;
  const spur = planRoadRuns(world, companyId, plan.from, plan.depot);
  if (spur === null) return null;

  for (const run of trunk) {
    push({ kind: CommandKind.BuildRoad, x1: run.x1, y1: run.y1, x2: run.x2, y2: run.y2 });
  }
  for (const run of spur) {
    push({ kind: CommandKind.BuildRoad, x1: run.x1, y1: run.y1, x2: run.x2, y2: run.y2 });
  }
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.from.x,
    y: plan.from.y,
    moduleKind: ModuleKind.LorryBay,
  });
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.to.x,
    y: plan.to.y,
    moduleKind: ModuleKind.LorryBay,
  });
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.depot.x,
    y: plan.depot.y,
    moduleKind: ModuleKind.RoadDepot,
  });
  return { from: plan.from, to: plan.to, shed: plan.depot, railTrains: 1 };
}

/**
 * The single-track fallback: the D-115 railway, laid where no oval fits.
 *
 * The route comes from the same assistant the connect tool runs (section
 * 17.3's rule), so hills and water are routed around rather than refused.
 * The shape is the one balancing scenario 2 proved: platforms one tile in
 * from each end, AI_PLATFORM_TILES long, the shed IN LINE on the very first
 * tile - a spur would make a junction, and a junction with no signal is the
 * one shape section 9 asks for signals. NO signals anywhere: the 9.4
 * auto-signalling lays one-way signals facing the drawn direction, which on
 * a line worked out and back refuses the whole return trip (D-115) - and an
 * unsignalled single line carries exactly the one train this build reports.
 */
function enqueueSingleTrack(
  push: (command: Command) => void,
  world: World,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): BuiltLine | null {
  const planned = planTrack(world.map, from.x, from.y, to.x, to.y, RailType.Plain, true);
  if (!planned.ok) return null;
  const tiles = planned.route.tiles;
  if (tiles.length < AI_RAIL_MIN_TILES) return null;

  push({
    kind: CommandKind.BuildTrack,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    railType: RailType.Plain,
    assistant: true,
    signalSpacing: 0,
  });

  const map = world.map;
  const platformAt = (index: number): { x: number; y: number } | null => {
    const tile = tiles[index];
    if (tile === undefined) return null;
    const at = { x: tile % map.size, y: (tile / map.size) | 0 };
    push({
      kind: CommandKind.BuildRailStop,
      x: at.x,
      y: at.y,
      moduleKind: ModuleKind.RailPlatform,
    });
    return at;
  };

  const last = tiles.length - 1;
  const nearEnd = platformAt(1);
  for (let i = 1; i < AI_PLATFORM_TILES; i++) platformAt(1 + i);
  const farEnd = platformAt(last - 1);
  for (let i = 1; i < AI_PLATFORM_TILES; i++) platformAt(last - 1 - i);
  if (nearEnd === null || farEnd === null) return null;

  const depotTile = tiles[0]!;
  push({
    kind: CommandKind.BuildRailStop,
    x: depotTile % map.size,
    y: (depotTile / map.size) | 0,
    moduleKind: ModuleKind.RailDepot,
  });
  return {
    from: nearEnd,
    to: farEnd,
    shed: { x: depotTile % map.size, y: (depotTile / map.size) | 0 },
    railTrains: 1,
  };
}
