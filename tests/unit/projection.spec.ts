import { describe, expect, it } from 'vitest';
import {
  DrawLayer,
  drawOrder,
  HEIGHT_PX,
  pickTile,
  TILE_H,
  TILE_W,
  tileToWorld,
  vehicleDrawOrder,
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

describe('draw order (section 16.1)', () => {
  it('paints a nearer diagonal later, whatever the heights', () => {
    // The tallest tile of diagonal s still goes down before the lowest tile
    // of diagonal s + 1 - a hill in front covers whatever stands behind it.
    expect(drawOrder(5, 5, MAX_HEIGHT, DrawLayer.Vehicle)).toBeLessThan(
      drawOrder(6, 5, 0, DrawLayer.Ground),
    );
  });

  it('paints the lower tile of one diagonal first', () => {
    // Failure #17: drawn the other way round, a hill covers the slope in
    // front of it.
    expect(drawOrder(5, 5, 2, DrawLayer.Ground)).toBeLessThan(drawOrder(6, 4, 3, DrawLayer.Ground));
  });

  it('stacks the layers of one tile bottom to top', () => {
    const layers = [
      DrawLayer.Ground,
      DrawLayer.Road,
      DrawLayer.Track,
      DrawLayer.Signal,
      DrawLayer.Building,
      DrawLayer.Station,
      DrawLayer.Vehicle,
    ];
    for (let i = 1; i < layers.length; i++) {
      expect(drawOrder(7, 3, 4, layers[i - 1]!)).toBeLessThan(drawOrder(7, 3, 4, layers[i]!));
    }
  });

  it('sorts a train behind the hill one diagonal in front of it', () => {
    // The acceptance case of SPEC2 M10: a vehicle on low ground, a higher
    // hill on the next diagonal. The hill's ground key must be the larger
    // one, so its sprite is painted over the train.
    const train = vehicleDrawOrder(5, 5, 0, 6, 5, 0, 0.25);
    const hill = drawOrder(6, 5, 3, DrawLayer.Ground);
    expect(train).toBeLessThan(hill);
  });

  it('draws a vehicle above the track and platform of its own tile', () => {
    const vehicle = vehicleDrawOrder(5, 5, 1, 6, 5, 1, 0.1);
    expect(vehicle).toBeGreaterThan(drawOrder(5, 5, 1, DrawLayer.Track));
    expect(vehicle).toBeGreaterThan(drawOrder(5, 5, 1, DrawLayer.Station));
  });

  it('hands a vehicle over to the next tile at half progress', () => {
    const before = vehicleDrawOrder(5, 5, 0, 6, 5, 2, 0.49);
    const after = vehicleDrawOrder(5, 5, 0, 6, 5, 2, 0.5);
    expect(before).toBe(drawOrder(5, 5, 0, DrawLayer.Vehicle));
    expect(after).toBe(drawOrder(6, 5, 2, DrawLayer.Vehicle));
  });
});
