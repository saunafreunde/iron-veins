import {
  BRIDGE_COST_PER_TILE_CT,
  BRIDGE_UPKEEP_PER_TILE_CT,
  MAX_BRIDGE_SPAN_TILES,
  MAX_TUNNEL_SPAN_TILES,
  TUNNEL_COST_PER_TILE_CT,
  TUNNEL_UPKEEP_PER_TILE_CT,
} from '../constants';
import type { TileMap } from './TileMap';
import { Terrain } from './terrain';
import { TRACK_DX, TRACK_DY, type TrackDir } from './track';

/**
 * Bridges and tunnels (section 8.3).
 *
 * Both are the same idea seen from two sides: a stretch of line that keeps its
 * height while the ground does not. A bridge holds the height up over water or
 * a valley; a tunnel holds it down through a hill. Only the tiles BETWEEN the
 * two ends carry the structure - the ends are ordinary track, which is what
 * lets a train path over one without the pathfinder knowing they exist.
 *
 * Neither can bend: a structure runs in one direction from end to end. Curved
 * viaducts and horseshoe tunnels are a modelling problem out of all proportion
 * to what they add, and every route the assistant proposes stays explicable
 * without them.
 */

export const Structure = {
  None: 0,
  Bridge: 1,
  Tunnel: 2,
} as const;
export type Structure = (typeof Structure)[keyof typeof Structure];

export const STRUCTURE_COUNT = 3;

/**
 * Price of a structure, which rises faster than its length.
 *
 * A twelve tile bridge costs twice as much per tile as a one tile one. Long
 * spans are what the term is there to discourage: the assistant should reach
 * for a short crossing at the narrows rather than a viaduct across the whole
 * bay, and a linear price would leave it indifferent.
 */
export function structureCostCt(kind: Structure, spanTiles: number): number {
  if (kind === Structure.Bridge) {
    const scale = 1 + spanTiles / MAX_BRIDGE_SPAN_TILES;
    return Math.round(spanTiles * BRIDGE_COST_PER_TILE_CT * scale);
  }
  const scale = 1 + spanTiles / MAX_TUNNEL_SPAN_TILES;
  return Math.round(spanTiles * TUNNEL_COST_PER_TILE_CT * scale);
}

/** Yearly upkeep of one tile of structure. [cent] */
export function structureUpkeepCt(kind: Structure): number {
  return kind === Structure.Bridge ? BRIDGE_UPKEEP_PER_TILE_CT : TUNNEL_UPKEEP_PER_TILE_CT;
}

/** Longest span each kind may have. [tiles between the two ends] */
export function maxSpanTiles(kind: Structure): number {
  return kind === Structure.Bridge ? MAX_BRIDGE_SPAN_TILES : MAX_TUNNEL_SPAN_TILES;
}

/** Can a tile be spanned by a bridge whose deck is at `deckHeight`? */
function bridgeableTile(map: TileMap, x: number, y: number, deckHeight: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.structure[index] !== Structure.None) return false;
  if (map.trackBits[index] !== 0) return false;
  if (map.buildingKind[index] !== 0) return false;
  if (map.industryId[index] !== -1) return false;

  // Water is always bridgeable, whatever the height grid says. A watercourse is
  // below its banks by definition, but the grid samples height in whole 8 m
  // levels and a river does not carve (DECISIONS.md D-019), so a river tile
  // reads as exactly level with the bank beside it. Requiring clearance here
  // would make every river in the game uncrossable.
  if (map.terrain[index] === Terrain.Water) return true;

  // Dry ground does need headroom: level with the deck would be a cutting.
  return map.topHeight(x, y) < deckHeight;
}

/** Can a tile be bored through by a tunnel whose roof is at `boreHeight`? */
function tunnellableTile(map: TileMap, x: number, y: number, boreHeight: number): boolean {
  if (!map.contains(x, y)) return false;
  const index = map.tileIndex(x, y);
  if (map.structure[index] !== Structure.None) return false;
  if (map.trackBits[index] !== 0) return false;
  if (map.terrain[index] === Terrain.Water) return false;
  // Nothing may stand on the ground above a bore. Strictly a house on a hill
  // and a tunnel beneath it can coexist, but drawing that convincingly is a
  // problem for the milestone that has a reason to.
  if (map.buildingKind[index] !== 0) return false;
  if (map.industryId[index] !== -1) return false;
  return map.baseHeight(x, y) > boreHeight;
}

/**
 * Shortest legal structure of `kind` leaving (x, y) in `direction`, or 0 when
 * there is none.
 *
 * Returns the span in tiles - the distance from one end to the other, so the
 * number of tiles that actually carry the structure is one less.
 */
export function shortestSpan(
  map: TileMap,
  x: number,
  y: number,
  direction: TrackDir,
  kind: Structure,
): number {
  const height = map.railHeight(x, y);
  const dx = TRACK_DX[direction]!;
  const dy = TRACK_DY[direction]!;
  const limit = maxSpanTiles(kind);

  for (let span = 2; span <= limit; span++) {
    const midX = x + dx * (span - 1);
    const midY = y + dy * (span - 1);
    const passable =
      kind === Structure.Bridge
        ? bridgeableTile(map, midX, midY, height)
        : tunnellableTile(map, midX, midY, height);
    // The tile before the far end has to be spannable; the moment it is not,
    // no longer span can be either.
    if (!passable) return 0;

    const endX = x + dx * span;
    const endY = y + dy * span;
    if (!map.contains(endX, endY)) return 0;

    const endIndex = map.tileIndex(endX, endY);
    if (map.structure[endIndex] !== Structure.None) continue;
    if (map.terrain[endIndex] === Terrain.Water) continue;
    if (map.buildingKind[endIndex] !== 0) continue;
    if (map.industryId[endIndex] !== -1) continue;
    // Both ends level: a structure has no gradient of its own.
    if (map.baseHeight(endX, endY) === height) return span;
  }
  return 0;
}
