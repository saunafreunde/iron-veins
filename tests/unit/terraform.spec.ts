import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  MAX_HEIGHT,
  MAX_TERRAFORM_CORNERS,
  SEA_LEVEL,
  TERRAFORM_COST_PER_STEP_CT,
} from '../../src/sim/constants';
import { SignalKind, packSignal } from '../../src/sim/map/signals';
import { Structure } from '../../src/sim/map/structures';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import {
  applyTerraform,
  estimateTerraform,
  levelTile,
  TerraformDirection,
} from '../../src/sim/map/terraform';
import { RailType, TrackDir, trackBit } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { RoadBit } from '../../src/sim/town/types';
import { apply, flatScenario, tryApply } from '../balance/scenario';

const SIZE = 32;
const PLATEAU = 8;
const UNLIMITED = Number.MAX_SAFE_INTEGER;
/** The company doing the digging in the map-level tests. */
const COMPANY = 0;
/** A competitor whose infrastructure the digger must not touch. */
const RIVAL = 1;

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
    const result = applyTerraform(map, 10, 10, TerraformDirection.Raise, COMPANY);

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
      applyTerraform(map, 16, 16, TerraformDirection.Raise, COMPANY);
      expect(maxTileSlopeDelta(map)).toBeLessThanOrEqual(1);
    }
    expect(map.cornerHeight[map.cornerIndex(16, 16)]).toBe(PLATEAU + 4);
  });

  it('charges for every corner it had to drag along', () => {
    const map = flatMap();
    applyTerraform(map, 16, 16, TerraformDirection.Raise, COMPANY);

    const second = applyTerraform(map, 16, 16, TerraformDirection.Raise, COMPANY);
    expect(second.changedCorners).toBeGreaterThan(1);
    expect(second.costCt).toBe(second.changedCorners * TERRAFORM_COST_PER_STEP_CT);
  });

  it('refuses to drag more earth than one action may move', () => {
    const map = flatMap();
    // Each level of the cone needs the next ring of corners: 1, 9, 25, 49, 81.
    // The fifth one is over the cap and has to be refused - otherwise a single
    // click could relandscape a whole valley.
    for (let level = 0; level < 4; level++) {
      expect(applyTerraform(map, 16, 16, TerraformDirection.Raise, COMPANY).ok).toBe(true);
    }
    expect(map.cornerHeight[map.cornerIndex(16, 16)]).toBe(PLATEAU + 4);

    const fifth = estimateTerraform(map, 16, 16, TerraformDirection.Raise, COMPANY);
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

    const result = estimateTerraform(map, 21, 21, TerraformDirection.Raise, COMPANY);
    if (!result.ok) expect(result.reasonKey).not.toBe('terraform.reject.atLimit');
  });

  it('refuses to go above the height limit', () => {
    const map = flatMap(MAX_HEIGHT);
    const result = applyTerraform(map, 5, 5, TerraformDirection.Raise, COMPANY);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.atLimit');
  });

  it('refuses to go below level zero', () => {
    const map = flatMap(0);
    expect(applyTerraform(map, 5, 5, TerraformDirection.Lower, COMPANY).ok).toBe(false);
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
      const result = estimateTerraform(map, x!, y!, TerraformDirection.Raise, COMPANY);
      expect(result.ok).toBe(false);
      expect(result.reasonKey).toBe('terraform.reject.occupied');
    }
    // A corner two tiles away is still free.
    expect(estimateTerraform(map, 14, 14, TerraformDirection.Raise, COMPANY).ok).toBe(true);
  });

  it('estimates exactly what it later charges', () => {
    const map = flatMap();
    applyTerraform(map, 20, 20, TerraformDirection.Raise, COMPANY);

    const estimate = estimateTerraform(map, 20, 20, TerraformDirection.Raise, COMPANY);
    const applied = applyTerraform(map, 20, 20, TerraformDirection.Raise, COMPANY);
    expect(applied.costCt).toBe(estimate.costCt);
    expect(applied.changedCorners).toBe(estimate.changedCorners);
  });
});

describe('the shoreline follows the ground', () => {
  it('leaves a tile dry while a single corner still stands above the sea', () => {
    const map = flatMap(SEA_LEVEL + 1);
    const result = applyTerraform(map, 8, 8, TerraformDirection.Lower, COMPANY);

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
      applyTerraform(map, x!, y!, TerraformDirection.Lower, COMPANY);
    }

    expect(map.terrain[map.tileIndex(7, 7)]).toBe(Terrain.Water);
    expect(map.landmassId[map.tileIndex(7, 7)]).toBe(-1);
  });

  it('reclaims land when the sea floor is raised', () => {
    const map = flatMap(SEA_LEVEL);
    map.terrain.fill(Terrain.Water);

    const result = applyTerraform(map, 8, 8, TerraformDirection.Raise, COMPANY);
    expect(result.changedShoreline).toBe(true);
    expect(map.terrain[map.tileIndex(7, 7)]).not.toBe(Terrain.Water);
    expect(map.landmassId[map.tileIndex(7, 7)]).toBeGreaterThanOrEqual(0);
  });
});

describe('levelling', () => {
  it('flattens a tile down to its lowest corner', () => {
    const map = flatMap();
    applyTerraform(map, 12, 12, TerraformDirection.Raise, COMPANY);
    expect(map.topHeight(12, 12)).toBe(PLATEAU + 1);

    const result = levelTile(map, 12, 12, UNLIMITED, COMPANY);
    expect(result.ok).toBe(true);
    expect(map.topHeight(12, 12)).toBe(map.baseHeight(12, 12));
    expect(result.costCt).toBeGreaterThan(0);
  });

  it('does nothing and costs nothing on ground that is already flat', () => {
    const map = flatMap();
    const result = levelTile(map, 12, 12, UNLIMITED, COMPANY);
    expect(result.ok).toBe(true);
    expect(result.costCt).toBe(0);
    expect(result.changedCorners).toBe(0);
  });

  it('stops before the first step it cannot pay for', () => {
    const map = flatMap();
    applyTerraform(map, 12, 12, TerraformDirection.Raise, COMPANY);
    const before = map.cornerHeight[map.cornerIndex(12, 12)];

    const result = levelTile(map, 12, 12, TERRAFORM_COST_PER_STEP_CT - 1, COMPANY);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.tooExpensive');
    expect(result.costCt).toBe(0);
    expect(map.cornerHeight[map.cornerIndex(12, 12)]).toBe(before);
  });
});

// The audited live defect SPEC2 E-11 closes: terraforming was unguarded under
// rails, signals and structures, and knew nothing about who owns a tile.
describe('terraforming under infrastructure', () => {
  it("refuses ground that carries track - the company's own included", () => {
    const map = flatMap();
    const tile = map.tileIndex(10, 10);
    map.trackBits[tile] = trackBit(TrackDir.East);
    map.railType[tile] = RailType.Plain;
    map.owner[tile] = COMPANY;

    // All four corners of the tracked tile are blocked, for the owner too:
    // the track has to be pulled up before the ground under it may move.
    for (const [x, y] of [
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
    ]) {
      const result = estimateTerraform(map, x!, y!, TerraformDirection.Raise, COMPANY);
      expect(result.ok).toBe(false);
      expect(result.reasonKey).toBe('terraform.reject.occupied');
    }
    expect(estimateTerraform(map, 14, 14, TerraformDirection.Raise, COMPANY).ok).toBe(true);
  });

  it('refuses ground that carries a signal', () => {
    const map = flatMap();
    // Only the signal byte is set so the test proves the signal guard on its
    // own - in a real world the tile would carry track as well.
    map.signal[map.tileIndex(10, 10)] = packSignal(SignalKind.Block, TrackDir.East);

    const result = estimateTerraform(map, 10, 10, TerraformDirection.Raise, COMPANY);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.occupied');
  });

  it('refuses the ground under a bridge and above a tunnel', () => {
    const map = flatMap();
    map.structure[map.tileIndex(10, 10)] = Structure.Bridge;
    map.structure[map.tileIndex(20, 20)] = Structure.Tunnel;

    const bridge = estimateTerraform(map, 10, 10, TerraformDirection.Lower, COMPANY);
    expect(bridge.ok).toBe(false);
    expect(bridge.reasonKey).toBe('terraform.reject.occupied');

    const tunnel = estimateTerraform(map, 20, 20, TerraformDirection.Raise, COMPANY);
    expect(tunnel.ok).toBe(false);
    expect(tunnel.reasonKey).toBe('terraform.reject.occupied');
  });

  it('names foreign infrastructure rather than calling it occupied', () => {
    const map = flatMap();
    const tile = map.tileIndex(10, 10);
    map.trackBits[tile] = trackBit(TrackDir.East);
    map.owner[tile] = RIVAL;

    // Occupied would send the digger to a demolish tool that refuses too
    // (D-101); the honest answer is whose ground it is.
    const foreign = estimateTerraform(map, 10, 10, TerraformDirection.Raise, COMPANY);
    expect(foreign.ok).toBe(false);
    expect(foreign.reasonKey).toBe('terraform.reject.foreignOwner');

    const own = estimateTerraform(map, 10, 10, TerraformDirection.Raise, RIVAL);
    expect(own.ok).toBe(false);
    expect(own.reasonKey).toBe('terraform.reject.occupied');
  });

  it('blocks a tile a station module claimed even though no map layer marks it', () => {
    const map = flatMap();
    // An airport, a quay or a canopy lives in entity state; the owner byte is
    // the only mark it leaves on the map (attachModule claims the tile).
    map.owner[map.tileIndex(10, 10)] = RIVAL;

    const foreign = estimateTerraform(map, 10, 10, TerraformDirection.Raise, COMPANY);
    expect(foreign.reasonKey).toBe('terraform.reject.foreignOwner');
    const own = estimateTerraform(map, 10, 10, TerraformDirection.Raise, RIVAL);
    expect(own.reasonKey).toBe('terraform.reject.occupied');
  });

  it('refuses the whole operation when the cascade would drag a corner under track', () => {
    const map = flatMap();
    // A step down beside a tracked tile: raising (21,21) has to drag (20,20)
    // up with it, and (20,20) touches the track - so nothing at all may move.
    map.cornerHeight[map.cornerIndex(20, 20)] = PLATEAU - 1;
    const tile = map.tileIndex(19, 19);
    map.trackBits[tile] = trackBit(TrackDir.East);
    map.owner[tile] = COMPANY;
    const before = Array.from(map.cornerHeight);

    const result = applyTerraform(map, 21, 21, TerraformDirection.Raise, COMPANY);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.occupied');
    expect(Array.from(map.cornerHeight)).toEqual(before);
  });

  it('levelling refuses rather than pulling the ground from under a rail', () => {
    const map = flatMap();
    // A sloped tile with track on it: its raised corner may not come down.
    map.cornerHeight[map.cornerIndex(13, 13)] = PLATEAU + 1;
    const tile = map.tileIndex(12, 12);
    map.trackBits[tile] = trackBit(TrackDir.East);
    map.owner[tile] = COMPANY;

    const result = levelTile(map, 12, 12, UNLIMITED, COMPANY);
    expect(result.ok).toBe(false);
    expect(result.reasonKey).toBe('terraform.reject.occupied');
    expect(map.cornerHeight[map.cornerIndex(13, 13)]).toBe(PLATEAU + 1);
  });
});

// The same guard exercised through the command layer, the way a player or the
// AI reaches it.
describe('terraform commands meet the railway', () => {
  const WORLD = 64;
  /** Light diesel railbus, 1950 - the cheapest thing that runs on rails. */
  const RAILBUS = 1061;

  it('refuses to terraform under a moving train', () => {
    const scenario = flatScenario(WORLD, [], []);
    apply(scenario, {
      kind: CommandKind.BuildTrack,
      x1: 10,
      y1: 10,
      x2: 40,
      y2: 10,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    apply(scenario, { kind: CommandKind.BuildRailStop, x: 10, y: 10, moduleKind: ModuleKind.RailDepot });
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: 40,
      y: 10,
      moduleKind: ModuleKind.RailPlatform,
    });
    apply(scenario, { kind: CommandKind.BuyTrain, x: 10, y: 10, specIds: [RAILBUS] });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: 1, load: 1, unload: 0 }],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    // 900 ticks put the railbus at speed somewhere mid-line, well short of the
    // platform 30 tiles out.
    for (let i = 0; i < 900; i++) scenario.world.step(scenario.queue, null);

    const vehicles = scenario.world.vehicles;
    expect(vehicles.speedMs[0]!).toBeGreaterThan(0);
    const tile = vehicles.tileIndex[0]!;
    expect(tile).not.toBe(scenario.world.map.tileIndex(10, 10));
    const x = tile % WORLD;
    const y = (tile / WORLD) | 0;

    expect(tryApply(scenario, { kind: CommandKind.RaiseLand, x, y })).toBe(
      'terraform.reject.occupied',
    );
    expect(tryApply(scenario, { kind: CommandKind.LowerLand, x, y })).toBe(
      'terraform.reject.occupied',
    );
  });

  it('refuses to terraform the river bed under a bridge', () => {
    const scenario = flatScenario(WORLD, [], []);
    const map = scenario.world.map;
    // A river three tiles wide; rivers do not carve (D-019), so painting the
    // terrain is the whole of it.
    for (let y = 0; y < WORLD; y++) {
      for (let x = 30; x < 33; x++) map.terrain[map.tileIndex(x, y)] = Terrain.Water;
    }
    scenario.world.companies[0]!.cashCt = 50_000_000_00;
    apply(scenario, {
      kind: CommandKind.BuildTrack,
      x1: 20,
      y1: 10,
      x2: 40,
      y2: 10,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: 0,
    });
    expect(map.structure[map.tileIndex(31, 10)]).toBe(Structure.Bridge);

    // Raising the bed would lift the water into the deck; lowering an abutment
    // corner would drop the end of the span.
    expect(tryApply(scenario, { kind: CommandKind.RaiseLand, x: 31, y: 10 })).toBe(
      'terraform.reject.occupied',
    );
    expect(tryApply(scenario, { kind: CommandKind.LowerLand, x: 30, y: 10 })).toBe(
      'terraform.reject.occupied',
    );
  });

  it('gives foreign track its own refusal and frees the ground once it is gone', () => {
    const scenario = flatScenario(WORLD, [], [], 9, 1);
    for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
    apply(
      scenario,
      {
        kind: CommandKind.BuildTrack,
        x1: 5,
        y1: 20,
        x2: 15,
        y2: 20,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: 0,
      },
      RIVAL,
    );

    // The rival's line is not this company's to dig under - and not the
    // rival's either while the rails are down.
    expect(tryApply(scenario, { kind: CommandKind.RaiseLand, x: 10, y: 20 }, COMPANY)).toBe(
      'terraform.reject.foreignOwner',
    );
    expect(tryApply(scenario, { kind: CommandKind.RaiseLand, x: 10, y: 20 }, RIVAL)).toBe(
      'terraform.reject.occupied',
    );

    // Once the rival pulls its rails up, the ground is public again and moves.
    apply(scenario, { kind: CommandKind.DemolishTrack, x: 9, y: 20 }, RIVAL);
    apply(scenario, { kind: CommandKind.DemolishTrack, x: 10, y: 20 }, RIVAL);
    expect(tryApply(scenario, { kind: CommandKind.RaiseLand, x: 10, y: 20 }, RIVAL)).toBeNull();
  });
});
