import { MAX_HEIGHT } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';

/**
 * Isometric projection, exactly as specified in section 16.1.
 *
 *   screenX = (tileX - tileY) * TILE_W / 2
 *   screenY = (tileX + tileY) * TILE_H / 2 - height * HEIGHT_PX
 *
 * All functions here work in unzoomed world pixels; the camera applies zoom and
 * panning on top. They are pure and therefore testable without a canvas, which
 * matters because the back projection is the single most bug-prone piece of an
 * isometric renderer.
 */

/** Width of one tile diamond at zoom 1. [px] */
export const TILE_W = 64;

/** Height of one tile diamond at zoom 1. [px] */
export const TILE_H = 32;

/** Vertical offset of one height level at zoom 1. [px] */
export const HEIGHT_PX = 16;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

/** Screen position of a tile's north corner at a given height level. */
export function tileToWorld(tileX: number, tileY: number, height: number): ScreenPoint {
  return {
    x: (tileX - tileY) * (TILE_W / 2),
    y: (tileX + tileY) * (TILE_H / 2) - height * HEIGHT_PX,
  };
}

/**
 * Inverse projection for one assumed height level. Returns fractional tile
 * coordinates; floor them to get the tile.
 */
export function worldToTileAtHeight(x: number, y: number, height: number): TilePoint {
  const adjustedY = y + height * HEIGHT_PX;
  const sum = (2 * adjustedY) / TILE_H;
  const difference = (2 * x) / TILE_W;
  return { x: (sum + difference) / 2, y: (sum - difference) / 2 };
}

/**
 * Which tile does a world pixel point sit on?
 *
 * A tall tile in the foreground hides lower ground behind it, so the search has
 * to run from the highest level downwards and take the first hit - the naive
 * flat inverse projection picks the wrong tile on every slope, which is the
 * classic reason mountain clicks land somewhere unexpected.
 *
 * A tile is a hit when the point falls inside it and the tile actually reaches
 * the assumed level, i.e. the level lies between its base and its top corner.
 */
export function pickTile(map: TileMap, x: number, y: number): TilePoint | null {
  for (let height = MAX_HEIGHT; height >= 0; height--) {
    const candidate = worldToTileAtHeight(x, y, height);
    const tileX = Math.floor(candidate.x);
    const tileY = Math.floor(candidate.y);
    if (!map.contains(tileX, tileY)) continue;

    if (map.baseHeight(tileX, tileY) <= height && map.topHeight(tileX, tileY) >= height) {
      return { x: tileX, y: tileY };
    }
  }
  return null;
}

/**
 * Draw order key. Tiles are painted back to front by (x + y); within one
 * diagonal the lower one goes first so a hill never covers the slope in front
 * of it (failure #17). Vehicles are sorted into the same sequence rather than
 * drawn as a layer on top, otherwise trains run through mountains.
 */
export function drawOrder(tileX: number, tileY: number, height: number, layer: number): number {
  return ((tileX + tileY) * (MAX_HEIGHT + 1) + height) * 8 + layer;
}

/** Bounding box in world pixels that a whole map occupies. */
export function mapWorldBounds(size: number): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  return {
    minX: -size * (TILE_W / 2),
    minY: -(MAX_HEIGHT + 1) * HEIGHT_PX,
    maxX: size * (TILE_W / 2),
    maxY: 2 * size * (TILE_H / 2),
  };
}
