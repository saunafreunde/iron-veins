import { describe, expect, it } from 'vitest';
import { LATERAL_ACCEL_PASSENGER, TILE_SIZE_M } from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import {
  curveRadiusM,
  curveSpeedMs,
  gradePermille,
  measureRoute,
  oppositeDir,
  RailType,
  RAIL_TYPE_MAX_GRADE,
  stepLengthM,
  TrackDir,
  turnSteps,
} from '../../src/sim/map/track';
import { planTrack } from '../../src/sim/net/trackBuilder';

const SIZE = 64;

function flatMap(height = 6): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(height);
  map.terrain.fill(Terrain.Grass);
  return map;
}

describe('track geometry', () => {
  it('has an opposite for every direction', () => {
    for (let d = 0; d < 8; d++) {
      expect(oppositeDir(oppositeDir(d as TrackDir))).toBe(d);
      expect(oppositeDir(d as TrackDir)).not.toBe(d);
    }
  });

  it('measures diagonal steps as longer than orthogonal ones', () => {
    expect(stepLengthM(TrackDir.East)).toBe(TILE_SIZE_M);
    expect(stepLengthM(TrackDir.SouthEast)).toBeCloseTo(TILE_SIZE_M * Math.SQRT2, 6);
  });

  it('measures turns as signed 45 degree steps within +-4', () => {
    expect(turnSteps(TrackDir.East, TrackDir.East)).toBe(0);
    expect(turnSteps(TrackDir.East, TrackDir.SouthEast)).toBe(1);
    expect(turnSteps(TrackDir.East, TrackDir.NorthEast)).toBe(-1);
    expect(turnSteps(TrackDir.East, TrackDir.South)).toBe(2);
    // Wrapping the long way round must not report a big turn.
    expect(Math.abs(turnSteps(TrackDir.NorthEast, TrackDir.East))).toBe(1);
  });

  it('reproduces the radius table of section 8.1', () => {
    // Straight through.
    expect(curveRadiusM(TrackDir.East, TrackDir.East, 0, 0)).toBe(Infinity);
    // One 45 degree turn with straight track either side.
    expect(curveRadiusM(TrackDir.East, TrackDir.SouthEast, 0, 0)).toBe(300);
    // Two 45 degree turns the same way: a 90 degree bend over two tiles.
    expect(curveRadiusM(TrackDir.East, TrackDir.SouthEast, 1, 0)).toBe(90);
    expect(curveRadiusM(TrackDir.East, TrackDir.SouthEast, 0, 1)).toBe(90);
    // An S curve is tight but not as tight.
    expect(curveRadiusM(TrackDir.East, TrackDir.SouthEast, 0, -1)).toBe(150);
    // 90 degrees inside a single tile is the minimum.
    expect(curveRadiusM(TrackDir.East, TrackDir.South, 0, 0)).toBe(45);
  });

  it('derives the curve speed from the radius', () => {
    expect(curveSpeedMs(Infinity, LATERAL_ACCEL_PASSENGER)).toBe(Infinity);
    // 300 m at 0.65 m/s^2 is about 50 m/s, i.e. 181 km/h.
    expect(curveSpeedMs(300, LATERAL_ACCEL_PASSENGER)).toBeCloseTo(13.96, 1);
    // Tighter curves are strictly slower.
    expect(curveSpeedMs(45, LATERAL_ACCEL_PASSENGER)).toBeLessThan(
      curveSpeedMs(90, LATERAL_ACCEL_PASSENGER),
    );
  });

  it('reports gradients per mille and signed', () => {
    expect(gradePermille(4, 5, TrackDir.East)).toBeCloseTo(160, 6);
    expect(gradePermille(5, 4, TrackDir.East)).toBeCloseTo(-160, 6);
    // The same rise over a longer diagonal step is a gentler gradient.
    expect(Math.abs(gradePermille(4, 5, TrackDir.SouthEast))).toBeLessThan(
      Math.abs(gradePermille(4, 5, TrackDir.East)),
    );
  });
});

describe('measuring a route', () => {
  const map = flatMap();
  const heightAt = (x: number, y: number): number => map.baseHeight(x, y);

  it('adds up straight length', () => {
    const tiles = [10, 11, 12, 13].map((x) => map.tileIndex(x, 10));
    const geometry = measureRoute(tiles, SIZE, heightAt, RailType.Plain, () => true);

    expect(geometry.lengthM).toBe(3 * TILE_SIZE_M);
    expect(geometry.minRadiusM).toBe(Infinity);
    expect(geometry.maxGradePermille).toBe(0);
    expect(geometry.newTiles).toBe(4);
  });

  it('caps the speed of a route that turns sharply', () => {
    const straight = [10, 11, 12].map((x) => map.tileIndex(x, 10));
    const corner = [map.tileIndex(10, 10), map.tileIndex(11, 10), map.tileIndex(11, 11)];

    const fast = measureRoute(straight, SIZE, heightAt, RailType.Plain, () => true);
    const slow = measureRoute(corner, SIZE, heightAt, RailType.Plain, () => true);

    expect(slow.minRadiusM).toBe(45);
    expect(slow.maxSpeedMs).toBeLessThan(fast.maxSpeedMs);
  });

  it('never exceeds the line speed of the rail type', () => {
    const tiles = [10, 11, 12, 13].map((x) => map.tileIndex(x, 10));
    const narrow = measureRoute(tiles, SIZE, heightAt, RailType.Narrow, () => true);
    const highSpeed = measureRoute(tiles, SIZE, heightAt, RailType.HighSpeed, () => true);
    expect(narrow.maxSpeedMs).toBeLessThan(highSpeed.maxSpeedMs);
  });
});

describe('the route assistant', () => {
  it('lays a straight line across flat ground', () => {
    const map = flatMap();
    const planned = planTrack(map, 10, 10, 20, 10, RailType.Plain, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    expect(planned.route.tiles).toHaveLength(11);
    expect(planned.route.geometry.minRadiusM).toBe(Infinity);
    expect(planned.route.costCt).toBeGreaterThan(0);
  });

  it('prefers two gentle turns over one sharp corner', () => {
    const map = flatMap();
    const planned = planTrack(map, 10, 10, 20, 14, RailType.Plain, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    // A 45 degree diagonal run beats a right-angled dogleg, so the route must
    // never contain a 90 degree turn inside one tile.
    expect(planned.route.geometry.minRadiusM).toBeGreaterThan(45);
  });

  it('routes around ground that is too steep instead of refusing', () => {
    const map = flatMap(4);
    // A wall of high ground straight across the direct line.
    for (let y = 0; y < SIZE; y++) {
      for (let x = 14; x <= 16; x++) {
        if (y >= 8 && y <= 12) continue; // leave a gap to the north
        map.cornerHeight[map.cornerIndex(x, y)] = 12;
      }
    }
    map.enforceSlopeInvariant();

    const planned = planTrack(map, 10, 20, 22, 20, RailType.Plain, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.route.geometry.maxGradePermille).toBeLessThanOrEqual(
      RAIL_TYPE_MAX_GRADE[RailType.Plain]!,
    );
  });

  it('refuses to cross water', () => {
    const map = flatMap();
    for (let y = 0; y < SIZE; y++) map.terrain[map.tileIndex(15, y)] = Terrain.Water;

    const planned = planTrack(map, 10, 10, 20, 10, RailType.Plain, true);
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reasonKey).toBe('track.reject.noRoute');
  });

  it('names water as the obstacle when the target itself is wet', () => {
    const map = flatMap();
    map.terrain[map.tileIndex(20, 10)] = Terrain.Water;
    const planned = planTrack(map, 10, 10, 20, 10, RailType.Plain, true);
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reasonKey).toBe('track.reject.onWater');
  });

  it('lays exactly the drawn line in manual mode', () => {
    const map = flatMap();
    const planned = planTrack(map, 10, 10, 16, 16, RailType.Plain, false);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    // A pure diagonal: seven tiles, no detour.
    expect(planned.route.tiles).toHaveLength(7);
  });

  it('charges only for tiles that are new', () => {
    const map = flatMap();
    const first = planTrack(map, 10, 10, 20, 10, RailType.Plain, true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    for (const tile of first.route.tiles) {
      map.trackBits[tile] = 1;
      map.railType[tile] = RailType.Plain;
    }

    const again = planTrack(map, 10, 10, 20, 10, RailType.Plain, true);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.route.costCt).toBe(0);
    expect(again.route.geometry.newTiles).toBe(0);
    expect(again.route.upgradedTiles).toBe(0);
  });
});
