import { describe, expect, it } from 'vitest';
import {
  HEIGHT_PX,
  pickTile,
  TILE_H,
  TILE_W,
  tileToWorld,
  worldToTileAtHeight,
} from '../../src/render/projection';
import { MAX_HEIGHT } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';

const SIZE = 32;

function flatMap(height: number): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(height);
  map.terrain.fill(Terrain.Grass);
  return map;
}

describe('isometric projection', () => {
  it('places the origin tile at the origin', () => {
    expect(tileToWorld(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves +x to the lower right and +y to the lower left', () => {
    expect(tileToWorld(1, 0, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(tileToWorld(0, 1, 0)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it('lifts higher ground towards the top of the screen', () => {
    expect(tileToWorld(4, 4, 3).y).toBe(tileToWorld(4, 4, 0).y - 3 * HEIGHT_PX);
  });

  it('inverts itself exactly at every height', () => {
    for (let height = 0; height <= MAX_HEIGHT; height += 3) {
      for (const [tx, ty] of [
        [0, 0],
        [1, 0],
        [7, 3],
        [12, 19],
      ]) {
        const world = tileToWorld(tx!, ty!, height);
        const back = worldToTileAtHeight(world.x, world.y, height);
        expect(back.x).toBeCloseTo(tx!, 9);
        expect(back.y).toBeCloseTo(ty!, 9);
      }
    }
  });
});

describe('mouse picking', () => {
  it('hits the tile the point sits on, on flat ground', () => {
    const map = flatMap(0);
    for (const [tx, ty] of [
      [0, 0],
      [5, 2],
      [17, 23],
      [31, 31],
    ]) {
      // A point just inside the diamond: half a tile below its north corner.
      const corner = tileToWorld(tx!, ty!, 0);
      const hit = pickTile(map, corner.x, corner.y + TILE_H / 2);
      expect(hit).toEqual({ x: tx, y: ty });
    }
  });

  it('accounts for height, so raised ground is picked where it is drawn', () => {
    const map = flatMap(6);
    const target = { x: 10, y: 10 };
    const corner = tileToWorld(target.x, target.y, 6);

    expect(pickTile(map, corner.x, corner.y + TILE_H / 2)).toEqual(target);
    // The naive flat inverse would land six levels of screen offset away.
    const naive = worldToTileAtHeight(corner.x, corner.y + TILE_H / 2, 0);
    expect(Math.floor(naive.x)).not.toBe(target.x);
  });

  it('prefers the tile in front when a hill overlaps lower ground', () => {
    const map = flatMap(0);
    // Raise the four corners of tile (10, 10) into a plateau three levels up.
    for (let level = 0; level < 3; level++) {
      for (const [cx, cy] of [
        [10, 10],
        [11, 10],
        [10, 11],
        [11, 11],
      ]) {
        map.cornerHeight[map.cornerIndex(cx!, cy!)] = level + 1;
      }
    }
    map.enforceSlopeInvariant();

    const raised = map.baseHeight(10, 10);
    expect(raised).toBeGreaterThan(0);

    const corner = tileToWorld(10, 10, raised);
    const hit = pickTile(map, corner.x, corner.y + TILE_H / 2);
    expect(hit).toEqual({ x: 10, y: 10 });
  });

  it('returns null outside the map', () => {
    const map = flatMap(0);
    expect(pickTile(map, -10_000, -10_000)).toBeNull();
  });
});
