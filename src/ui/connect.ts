import type { StationMarker } from '../shared/protocol';
import { inflatedCostCt } from '../sim/cargo/payment';
import { AI_PLATFORM_TILES, RAIL_PLATFORM_COST_CT } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { RailType } from '../sim/map/track';
import { planTrack } from '../sim/net/trackBuilder';
import { ModuleKind } from '../sim/station/types';

/**
 * A whole railway between two stations, planned and priced before a single
 * command is sent.
 *
 * The point is the CONFIRMATION. Laying a line by hand is two clicks and an
 * immediate bill; this shows what will be built, what it will cost and what
 * the trains will manage on it, and then waits. Nothing is charged until the
 * player says yes.
 *
 * It plans with the very same `planTrack` the command will run, with the same
 * arguments - so the preview and the bill cannot disagree, which is the whole
 * of section 17.3. That is also why the platforms are placed exactly where the
 * AI places them: one tile IN from each end and two tiles long. A platform on
 * the last tile of the track leaves a train longer than one tile nowhere to
 * finish arriving, and a one-tile platform works only the share of the train
 * that fits, minus forty percent.
 */

export interface ConnectPlan {
  readonly fromStationId: number;
  readonly toStationId: number;
  readonly fromName: string;
  readonly toName: string;
  /** The two ends of the track, as the BuildTrack command will take them. */
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** Platform tiles to build; empty at an end that already has one. */
  readonly platforms: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Every tile of the route, for the map overlay. */
  readonly tiles: readonly number[];

  readonly lengthM: number;
  readonly maxGradePermille: number;
  readonly minRadiusM: number;
  readonly maxSpeedMs: number;
  readonly bridges: number;
  readonly tunnels: number;

  readonly trackCostCt: number;
  readonly platformCostCt: number;
  readonly totalCostCt: number;
}

export type ConnectResult =
  | { readonly ok: true; readonly plan: ConnectPlan }
  | { readonly ok: false; readonly reasonKey: string };

/** Structure values, mirrored from the tile layer. */
const STRUCTURE_BRIDGE = 1;
const STRUCTURE_TUNNEL = 2;

function railModules(station: StationMarker): ReadonlyArray<{ x: number; y: number }> {
  return station.modules
    .filter((module) => module.kind === ModuleKind.RailPlatform)
    .map((module) => ({ x: module.x, y: module.y }));
}

/**
 * Which tile of a station the line should run to.
 *
 * An existing rail platform if there is one - then no new platform is needed
 * at that end. Otherwise the module nearest the other station, which is where
 * a platform will go. NOT the station centre: that is a recomputed average and
 * on a mixed station it can sit on no buildable ground at all.
 */
function anchorFor(
  station: StationMarker,
  towardsX: number,
  towardsY: number,
): { x: number; y: number; hasPlatform: boolean } | null {
  const platforms = railModules(station);
  const pool = platforms.length > 0 ? platforms : station.modules.map((m) => ({ x: m.x, y: m.y }));
  if (pool.length === 0) return null;

  let best = pool[0]!;
  let bestDistance = Infinity;
  for (const candidate of pool) {
    const dx = candidate.x - towardsX;
    const dy = candidate.y - towardsY;
    const d = dx * dx + dy * dy;
    // A total order: distance, then position, so the same world plans the same
    // line every time it is asked.
    if (d < bestDistance || (d === bestDistance && (candidate.x < best.x || (candidate.x === best.x && candidate.y < best.y)))) {
      bestDistance = d;
      best = candidate;
    }
  }
  return { x: best.x, y: best.y, hasPlatform: platforms.length > 0 };
}

/** Plan and price the connection, or say why it cannot be built. */
export function planConnection(
  map: TileMap,
  from: StationMarker,
  to: StationMarker,
  year: number,
): ConnectResult {
  if (from.id === to.id) return { ok: false, reasonKey: 'ui.connect.sameStation' };

  const a = anchorFor(from, to.x, to.y);
  const b = anchorFor(to, from.x, from.y);
  if (a === null || b === null) return { ok: false, reasonKey: 'ui.connect.noAnchor' };

  const planned = planTrack(map, a.x, a.y, b.x, b.y, RailType.Plain, true);
  if (!planned.ok) return { ok: false, reasonKey: planned.reasonKey };

  const route = planned.route;
  const last = route.tiles.length - 1;
  if (route.tiles.length < AI_PLATFORM_TILES * 2 + 2) {
    return { ok: false, reasonKey: 'ui.connect.tooShort' };
  }

  const platforms: Array<{ x: number; y: number }> = [];
  const addPlatform = (index: number): void => {
    const tile = route.tiles[index];
    if (tile === undefined) return;
    platforms.push({ x: tile % map.size, y: (tile / map.size) | 0 });
  };
  if (!a.hasPlatform) for (let i = 0; i < AI_PLATFORM_TILES; i++) addPlatform(1 + i);
  if (!b.hasPlatform) for (let i = 0; i < AI_PLATFORM_TILES; i++) addPlatform(last - 1 - i);

  let bridges = 0;
  let tunnels = 0;
  for (const structure of route.structures) {
    if (structure === STRUCTURE_BRIDGE) bridges++;
    else if (structure === STRUCTURE_TUNNEL) tunnels++;
  }

  // Every figure goes through the same inflation the simulation charges at, or
  // the preview and the bill part company from game year two.
  const trackCostCt = inflatedCostCt(route.costCt, year, true);
  const platformCostCt = inflatedCostCt(RAIL_PLATFORM_COST_CT * platforms.length, year, true);

  return {
    ok: true,
    plan: {
      fromStationId: from.id,
      toStationId: to.id,
      fromName: from.name,
      toName: to.name,
      fromX: a.x,
      fromY: a.y,
      toX: b.x,
      toY: b.y,
      platforms,
      tiles: route.tiles,
      lengthM: route.geometry.lengthM,
      maxGradePermille: route.geometry.maxGradePermille,
      minRadiusM: route.geometry.minRadiusM,
      maxSpeedMs: route.geometry.maxSpeedMs,
      bridges,
      tunnels,
      trackCostCt,
      platformCostCt,
      totalCostCt: trackCostCt + platformCostCt,
    },
  };
}
