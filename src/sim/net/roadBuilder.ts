import {
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_DEPOT_UPKEEP_CT,
  ROAD_STOP_COST_CT,
  ROAD_STOP_UPKEEP_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  TILE_PUBLIC,
  TOWN_ROAD_MAX_SLOPE,
} from '../constants';
import { RejectReason } from '../commands/types';
import type { TileMap } from '../map/TileMap';
import { slopeRise, Terrain } from '../map/terrain';
import { ModuleKind } from '../station/types';
import { RoadBit } from '../town/types';

/**
 * The road side of the build planner (D-210), the twin of `trackBuilder.ts`.
 *
 * It answers ONE question - what would happen if a road stop were built at
 * (x, y), and what would it cost - from the map alone, so that the command in
 * `commands/build.ts` and the hover preview in `ui/MapCanvas.tsx` cannot
 * disagree about either. That is D-119's rule applied a second time: the
 * connect tool plans with the very `planTrack` the command runs, and a road
 * stop now plans with the very `planRoadStop` the command runs.
 *
 * Nothing here reads the `World`: ownership is a tile layer, the price tables
 * are constants, and the two things a planner may NOT know - whether the
 * council is willing (13.3) and whether the company can pay - stay in the
 * command, where they belong. The preview therefore fails wherever the ground
 * fails and nowhere else.
 */

/**
 * Can a road tile exist at (x, y) at all? The ground test of the road command,
 * lifted out of it so the preview refuses exactly what the build refuses.
 *
 * Returns the concrete obstacle (SPEC.md 17.3) or null.
 */
export function roadBuildableAt(map: TileMap, x: number, y: number): string | null {
  if (!map.contains(x, y)) return RejectReason.OutsideMap;
  const index = map.tileIndex(x, y);
  if (map.terrain[index] === Terrain.Water) return RejectReason.OnWater;
  if (map.industryId[index] !== -1) return RejectReason.Occupied;
  if (map.buildingKind[index] !== 0) return RejectReason.Occupied;
  if (slopeRise(map.slopeAt(x, y)) > TOWN_ROAD_MAX_SLOPE) return RejectReason.TooSteep;
  return null;
}

/**
 * The two shapes a road stop can take (D-210).
 *
 * `Through` is the pre-D-210 stop: the module stands ON the carriageway, which
 * is what a `Bushaltestelle` is. `Bay` is the module standing BESIDE the road
 * on ground of its own, with one tile of road laid to reach it - SPEC.md 10's
 * `Lkw-Ladebucht` taken at its word.
 */
export const RoadStopShape = {
  Through: 0,
  Bay: 1,
} as const;

export interface RoadStopPlan {
  /** Concrete obstacle, or null when the ground allows the build. */
  readonly reasonKey: string | null;
  /** `RoadStopShape.Through` or `RoadStopShape.Bay`. */
  readonly shape: number;
  /** Neighbouring road tile the spur attaches to, or -1 for a through stop. */
  readonly spurTile: number;
  /** Tiles of road this build lays and pays for: 0 or 1. */
  readonly roadTiles: number;
  /** Full price BEFORE inflation, module plus spur. [cent] */
  readonly costCt: number;
  /** Yearly upkeep this build adds, module plus spur. [cent] */
  readonly upkeepCtPerYear: number;
}

/** Deltas of the four orthogonal neighbours. Order is not logic - see below. */
const NEIGHBOUR_DX = [-1, 1, 0, 0];
const NEIGHBOUR_DY = [0, 0, -1, 1];

/** How many of the four connection bits a road tile carries: 0..4. */
function roadDegree(bits: number): number {
  let degree = 0;
  if ((bits & RoadBit.West) !== 0) degree++;
  if ((bits & RoadBit.East) !== 0) degree++;
  if ((bits & RoadBit.North) !== 0) degree++;
  if ((bits & RoadBit.South) !== 0) degree++;
  return degree;
}

/** What a module of this kind costs before the spur. [cent] */
function moduleCostCt(kind: number): number {
  return kind === ModuleKind.RoadDepot ? ROAD_DEPOT_COST_CT : ROAD_STOP_COST_CT;
}

/** What a module of this kind costs to keep, before the spur. [cent/year] */
function moduleUpkeepCt(kind: number): number {
  return kind === ModuleKind.RoadDepot ? ROAD_DEPOT_UPKEEP_CT : ROAD_STOP_UPKEEP_CT;
}

function refusal(reasonKey: string): RoadStopPlan {
  return {
    reasonKey,
    shape: RoadStopShape.Through,
    spurTile: -1,
    roadTiles: 0,
    costCt: 0,
    upkeepCtPerYear: 0,
  };
}

/**
 * What building a road stop of `kind` at (x, y) would do and cost (D-210).
 *
 * Two shapes, decided by the tile the click lands on:
 *
 *  - the tile already carries road: a DRIVE-THROUGH stop. No spur, no road
 *    charge - the carriageway was paid for when it was laid.
 *  - the tile carries none: a BAY. The tile itself has to be able to carry
 *    road, and one orthogonal neighbour has to carry road that `companyId`
 *    may work on. The build then lays one tile of road on the module tile and
 *    connects it to that neighbour, priced exactly like any other road tile.
 *
 * **Which neighbour, when several qualify.** The winner is the minimum of the
 * key `(-roadDegree, tileIndex)`:
 *
 *  - the degree first, so a through carriageway beats another dead-end stub -
 *    a bay hung off a stub is reachable only by driving down the stub, which
 *    is a second bay rather than a connection;
 *  - the tile index second (`y * size + x`), which is a total order over tiles
 *    that no two candidates can tie on, so the answer cannot depend on the
 *    order this loop happens to run in (architecture law #3). It resolves
 *    North, then West, then East, then South.
 *
 * The loop below may be walked in any order without changing the answer; the
 * COMPARISON is the rule, not the iteration.
 */
export function planRoadStop(
  map: TileMap,
  companyId: number,
  x: number,
  y: number,
  kind: number,
): RoadStopPlan {
  if (!map.contains(x, y)) return refusal(RejectReason.OutsideMap);
  const tile = map.tileIndex(x, y);
  const baseCost = moduleCostCt(kind);
  const baseUpkeep = moduleUpkeepCt(kind);

  if (map.roadBits[tile] !== 0) {
    return {
      reasonKey: null,
      shape: RoadStopShape.Through,
      spurTile: -1,
      roadTiles: 0,
      costCt: baseCost,
      upkeepCtPerYear: baseUpkeep,
    };
  }

  const blocker = roadBuildableAt(map, x, y);
  if (blocker !== null) return refusal(blocker);

  let bestTile = -1;
  let bestDegree = -1;
  let sawForeignRoad = false;

  for (let direction = 0; direction < 4; direction++) {
    const nx = x + NEIGHBOUR_DX[direction]!;
    const ny = y + NEIGHBOUR_DY[direction]!;
    if (!map.contains(nx, ny)) continue;
    const neighbour = map.tileIndex(nx, ny);
    const bits = map.roadBits[neighbour]!;
    if (bits === 0) continue;
    // The spur writes one bit onto the neighbour, so the neighbour has to be
    // a tile this company may work on - a public town street or its own.
    const owner = map.owner[neighbour]!;
    if (owner !== TILE_PUBLIC && owner !== companyId) {
      sawForeignRoad = true;
      continue;
    }
    const degree = roadDegree(bits);
    if (degree > bestDegree || (degree === bestDegree && neighbour < bestTile)) {
      bestTile = neighbour;
      bestDegree = degree;
    }
  }

  if (bestTile < 0) {
    return refusal(sawForeignRoad ? RejectReason.RoadNotYours : RejectReason.NeedsRoad);
  }

  return {
    reasonKey: null,
    shape: RoadStopShape.Bay,
    spurTile: bestTile,
    roadTiles: 1,
    costCt: baseCost + ROAD_COST_PER_TILE_CT,
    upkeepCtPerYear: baseUpkeep + ROAD_UPKEEP_PER_TILE_CT,
  };
}
