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
 * Layer slot of a sprite within its tile, bottom to top. {@link drawOrder}
 * packs the layer into the low three bits, so the whole range must stay
 * below 8.
 *
 * A vehicle sits above the track, the platform and the canopy of its OWN tile
 * - a train standing at a station has to be visible - and below the ground of
 * any nearer diagonal, which is what makes it vanish behind a hill.
 */
export const DrawLayer = {
  Ground: 0,
  Road: 1,
  Track: 2,
  Signal: 3,
  Building: 4,
  Station: 5,
  Vehicle: 6,
} as const;
export type DrawLayer = (typeof DrawLayer)[keyof typeof DrawLayer];

/**
 * Draw order key. Tiles are painted back to front by (x + y); within one
 * diagonal the lower one goes first so a hill never covers the slope in front
 * of it (failure #17). Vehicles are sorted into the same sequence rather than
 * drawn as a layer on top, otherwise trains run through mountains.
 */
export function drawOrder(tileX: number, tileY: number, height: number, layer: number): number {
  return ((tileX + tileY) * (MAX_HEIGHT + 1) + height) * 8 + layer;
}

/**
 * Progress at which a vehicle's draw order hands over from the tile it is
 * leaving to the tile it is entering: half way, when the sprite crosses the
 * shared edge. [fraction of a tile]
 */
const VEHICLE_HANDOVER_PROGRESS = 0.5;

/**
 * Draw order of a moving vehicle (section 16.1): the key of the tile it
 * mostly covers, at the vehicle layer. A vehicle is between two tiles most of
 * the time, and a key interpolated between the two would order it against
 * nothing - the tile keys are discrete - so it snaps at the tile edge.
 */
export function vehicleDrawOrder(
  fromX: number,
  fromY: number,
  fromHeight: number,
  toX: number,
  toY: number,
  toHeight: number,
  progress: number,
): number {
  if (progress < VEHICLE_HANDOVER_PROGRESS) {
    return drawOrder(fromX, fromY, fromHeight, DrawLayer.Vehicle);
  }
  return drawOrder(toX, toY, toHeight, DrawLayer.Vehicle);
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
