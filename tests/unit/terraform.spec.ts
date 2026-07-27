import { describe, expect, it } from 'vitest';
import {
  MAX_HEIGHT,
  MAX_TERRAFORM_CORNERS,
  SEA_LEVEL,
  TERRAFORM_COST_PER_STEP_CT,
} from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import {
  applyTerraform,
  estimateTerraform,
  levelTile,
  TerraformDirection,
} from '../../src/sim/map/terraform';
import { RoadBit } from '../../src/sim/town/types';

const SIZE = 32;
const PLATEAU = 8;
const UNLIMITED = Number.MAX_SAFE_INTEGER;

/** A flat grass plateau, the cleanest possible ground to reason about. */
function flatMap(height = PLATEAU): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(height);
  map.terrain.fill(Terrain.Grass);
  return map;
}

function maxTileSlopeDelta(map: TileMap): number {
  let worst = 0;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const delta = map.topHeight(x, y) - map.baseHeight(x, y);
      if (delta > worst) worst = delta;
    }
  }
  return worst;
}

describe('raising and lowering', () => {
  it('moves a single corner on flat ground', () => {
    const map = flatMap();
    const result = applyTerraform(map, 10, 10, TerraformDirection.Raise);

    expect(result.ok).toBe(true);
    expect(result.changedCorners).toBe(1);
    expect(result.costCt).toBe(TERRAFORM_COST_PER_STEP_CT);
    expect(map.cornerHeight[map.cornerIndex(10, 10)]).toBe(PLATEAU + 1);
  });

  it('never leaves a tile with corners more than one level apart', () => {
    const map = flatMap();
    // Build a small hill by raising the same corner repeatedly; each step has
    // to drag more and more neighbours along.
    for (let step = 0; step < 4; step++) {
      applyTerraform(map, 16, 16, TerraformDirection.Raise);
      expect(maxTileSlopeDelta(map)).toBeLessThanOrEqual(1);
    }
    expect(map.cornerHeight[map.cornerIndex(16, 16)]).toBe(PLATEAU + 4);
  });

  it('charges for every corner it had to drag along', () => {
    const map = flatMap();
    applyTerraform(map, 16, 16, TerraformDirection.Raise);

    const second = applyTerraform(map, 16, 16, TerraformDirection.Raise);
    expect(second.changedCorners).toBeGreaterThan(1);
    expect(second.costCt).toBe(second.changedCorners * TERRAFORM_COST_PER_STEP_CT);
  });

  it('refuses to drag more earth than one action may move', () => {
    const map = flatMap();
    // Each level of the cone needs the next ring of corners: 1, 9, 25, 49, 81.
    // The fifth one is over the cap and has to be refused - otherwise a single
    // click could relandscape a whole valley.
    for (let level = 0; level < 4; level++) {
      expect(applyTerraform(map, 16, 16, TerraformDirection.Raise).ok).toBe(true);
    }
    expect(map.cornerHeight[map.cornerIndex(16, 16)]).toBe(PLATEAU + 4);

    const fifth = estimateTerraform(map, 16, 16, TerraformDirection.Raise);
    expect(fifth.ok).toBe(false);
    expect(fifth.reasonKey).toBe('terraform.reject.tooMuchEarth');
    expect(MAX_TERRAFORM_CORNERS).toBeLessThan(81);
    expect(MAX_TERRAFORM_CORNERS).toBeGreaterThanOrEqual(49);
  });

  it('blames occupied ground rather than the height limit', () => {
    const map = flatMap();
    // A step down next to a road: raising drags the lower corner, which is
    // blocked by the road tile.
    map.cornerHeight[map.cornerIndex(20, 20)] = PLATEAU - 1;
    map.roadBits[map.tileIndex(19, 19)] = RoadBit.East;

    const result = estimateTerraform(map, 21, 21, TerraformDirection.Raise);
    if (!result.ok) expect(result.reasonKey).not.toBe('terraform.reject.atLimit');
  });

  it('refuses to go above the height limit', () => {
    const map = flatMap(MAX_HEIGHT);
    const result = applyTerraform(map, 5, 5, TerraformDirection.Raise);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.atLimit');
  });

  it('refuses to go below level zero', () => {
    const map = flatMap(0);
    expect(applyTerraform(map, 5, 5, TerraformDirection.Lower).ok).toBe(false);
  });

  it('refuses ground that carries a road or a building', () => {
    const map = flatMap();
    map.roadBits[map.tileIndex(10, 10)] = RoadBit.East;

    // All four corners of that tile are blocked.
    for (const [x, y] of [
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
    ]) {
      const result = estimateTerraform(map, x!, y!, TerraformDirection.Raise);
      expect(result.ok).toBe(false);
      expect(result.reasonKey).toBe('terraform.reject.occupied');
    }
    // A corner two tiles away is still free.
    expect(estimateTerraform(map, 14, 14, TerraformDirection.Raise).ok).toBe(true);
  });

  it('estimates exactly what it later charges', () => {
    const map = flatMap();
    applyTerraform(map, 20, 20, TerraformDirection.Raise);

    const estimate = estimateTerraform(map, 20, 20, TerraformDirection.Raise);
    const applied = applyTerraform(map, 20, 20, TerraformDirection.Raise);
    expect(applied.costCt).toBe(estimate.costCt);
    expect(applied.changedCorners).toBe(estimate.changedCorners);
  });
});

describe('the shoreline follows the ground', () => {
  it('leaves a tile dry while a single corner still stands above the sea', () => {
    const map = flatMap(SEA_LEVEL + 1);
    const result = applyTerraform(map, 8, 8, TerraformDirection.Lower);

    expect(result.ok).toBe(true);
    expect(result.changedShoreline).toBe(false);
    expect(map.terrain[map.tileIndex(7, 7)]).not.toBe(Terrain.Water);
  });

  it('floods a tile once all four of its corners are under water', () => {
    const map = flatMap(SEA_LEVEL + 1);
    for (const [x, y] of [
      [7, 7],
      [8, 7],
      [7, 8],
      [8, 8],
    ]) {
      applyTerraform(map, x!, y!, TerraformDirection.Lower);
    }

    expect(map.terrain[map.tileIndex(7, 7)]).toBe(Terrain.Water);
    expect(map.landmassId[map.tileIndex(7, 7)]).toBe(-1);
  });

  it('reclaims land when the sea floor is raised', () => {
    const map = flatMap(SEA_LEVEL);
    map.terrain.fill(Terrain.Water);

    const result = applyTerraform(map, 8, 8, TerraformDirection.Raise);
    expect(result.changedShoreline).toBe(true);
    expect(map.terrain[map.tileIndex(7, 7)]).not.toBe(Terrain.Water);
    expect(map.landmassId[map.tileIndex(7, 7)]).toBeGreaterThanOrEqual(0);
  });
});

describe('levelling', () => {
  it('flattens a tile down to its lowest corner', () => {
    const map = flatMap();
    applyTerraform(map, 12, 12, TerraformDirection.Raise);
    expect(map.topHeight(12, 12)).toBe(PLATEAU + 1);

    const result = levelTile(map, 12, 12, UNLIMITED);
    expect(result.ok).toBe(true);
    expect(map.topHeight(12, 12)).toBe(map.baseHeight(12, 12));
    expect(result.costCt).toBeGreaterThan(0);
  });

  it('does nothing and costs nothing on ground that is already flat', () => {
    const map = flatMap();
    const result = levelTile(map, 12, 12, UNLIMITED);
    expect(result.ok).toBe(true);
    expect(result.costCt).toBe(0);
    expect(result.changedCorners).toBe(0);
  });

  it('stops before the first step it cannot pay for', () => {
    const map = flatMap();
    applyTerraform(map, 12, 12, TerraformDirection.Raise);
    const before = map.cornerHeight[map.cornerIndex(12, 12)];

    const result = levelTile(map, 12, 12, TERRAFORM_COST_PER_STEP_CT - 1);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.tooExpensive');
    expect(result.costCt).toBe(0);
    expect(map.cornerHeight[map.cornerIndex(12, 12)]).toBe(before);
  });
});
