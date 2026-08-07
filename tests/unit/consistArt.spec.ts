import { describe, expect, it } from 'vitest';
import {
  BREADCRUMB_CAPACITY,
  BREADCRUMB_SPACING_TILES,
  BreadcrumbRing,
  consistFollowerDistances,
  consistKnown,
  MAX_CONSIST_FOLLOWERS,
  placeConsist,
  sameConsist,
  type ConsistPlacement,
} from '../../src/render/consistArt';
import { TELEPORT_TILES_SQ } from '../../src/render/interpolation';
import { facingFromDelta } from '../../src/render/vehicleArt';
import { MAX_CONSIST_UNITS, MAX_TRAIN_LENGTH_M, TILE_SIZE_M } from '../../src/sim/constants';
import { vehicleSpec } from '../../src/sim/vehicles/catalog';

/**
 * The pure half of M13's consist rendering (SPEC2, E-05): the breadcrumb
 * ring the renderer maintains from published head positions, and the
 * arc-length walk that places every trailing unit along it. MapView only
 * executes what these functions decide - no Pixi, no snapshot, no sim.
 */

function slots(count: number): ConsistPlacement[] {
  return Array.from({ length: count }, () => ({ fx: 0, fy: 0, h: 0, dirX: 0, dirY: 0 }));
}

/** A ring whose crumbs were pushed oldest-first along the given points. */
function ringOf(points: readonly (readonly [number, number, number])[]): BreadcrumbRing {
  const ring = new BreadcrumbRing();
  for (const [fx, fy, h] of points) ring.record(fx, fy, h);
  return ring;
}

describe('BreadcrumbRing', () => {
  it('drops samples below the spacing floor - a standing train records nothing', () => {
    const ring = new BreadcrumbRing();
    ring.record(10, 5, 0);
    // Residual lerp noise and honest standstill: same point, and a point
    // just inside the spacing floor.
    ring.record(10, 5, 0);
    ring.record(10 + BREADCRUMB_SPACING_TILES * 0.9, 5, 0);
    expect(ring.length).toBe(1);
    // Just past the floor is stored.
    ring.record(10 + BREADCRUMB_SPACING_TILES * 1.1, 5, 0);
    expect(ring.length).toBe(2);
  });

  it('reads newest first', () => {
    const ring = ringOf([
      [0, 0, 0],
      [0.5, 0, 1],
      [1, 0, 2],
    ]);
    expect(ring.length).toBe(3);
    expect(ring.fxAt(0)).toBeCloseTo(1);
    expect(ring.hAt(0)).toBeCloseTo(2);
    expect(ring.fxAt(2)).toBeCloseTo(0);
    expect(ring.hAt(2)).toBeCloseTo(0);
  });

  it('caps at its capacity and forgets the oldest crumb', () => {
    const ring = new BreadcrumbRing(4);
    for (let i = 0; i < 6; i++) ring.record(i, 0, i);
    expect(ring.length).toBe(4);
    expect(ring.fxAt(0)).toBeCloseTo(5);
    expect(ring.fxAt(3)).toBeCloseTo(2); // 0 and 1 fell off the end
  });

  it('resets on a teleport jump - the whole consist snaps (D-162)', () => {
    const ring = ringOf([
      [0, 0, 0],
      [0.5, 0, 0],
      [1, 0, 0],
    ]);
    const jump = Math.sqrt(TELEPORT_TILES_SQ) + 0.5;
    expect(ring.record(1 + jump, 0, 0)).toBe(true);
    expect(ring.length).toBe(1);
    expect(ring.fxAt(0)).toBeCloseTo(1 + jump);
  });

  it('covers the longest legal train at the stored spacing', () => {
    // The capacity promise: crumbs recorded at generation cadence are AT
    // LEAST the spacing apart, so a full ring spans at least this distance.
    const coveredM = (BREADCRUMB_CAPACITY - 1) * BREADCRUMB_SPACING_TILES * TILE_SIZE_M;
    expect(coveredM).toBeGreaterThanOrEqual(MAX_TRAIN_LENGTH_M);
  });
});

describe('consistFollowerDistances', () => {
  it('derives ascending centre distances from the aggregate catalogue lengths', () => {
    // steam1 (18 m) pulling two pax1 coaches (24 m each): follower k sits
    // half the lead, every unit between, and half itself behind the head.
    const out = new Float64Array(MAX_CONSIST_FOLLOWERS);
    const count = consistFollowerDistances([1000, 1500, 1500], out);
    expect(count).toBe(2);
    expect(out[0]).toBeCloseTo((18 / 2 + 24 / 2) / TILE_SIZE_M, 10);
    expect(out[1]).toBeCloseTo((18 / 2 + 24 + 24 / 2) / TILE_SIZE_M, 10);
    expect(out[1]).toBeGreaterThan(out[0]!);
  });

  it('answers zero followers for a single unit', () => {
    const out = new Float64Array(MAX_CONSIST_FOLLOWERS);
    expect(consistFollowerDistances([1000], out)).toBe(0);
  });

  it('caps at the output size', () => {
    const out = new Float64Array(2);
    const consist = [1000, 1500, 1500, 1500, 1500];
    expect(consistFollowerDistances(consist, out)).toBe(2);
  });

  it('sizes its scratch cap from the sim consist cap', () => {
    expect(MAX_CONSIST_FOLLOWERS).toBe(MAX_CONSIST_UNITS - 1);
  });
});

describe('consist identity helpers', () => {
  it('sameConsist compares id for id', () => {
    expect(sameConsist([1000, 1500], [1000, 1500])).toBe(true);
    expect(sameConsist([1000, 1500], [1000, 1501])).toBe(false);
    expect(sameConsist([1000, 1500], [1000, 1500, 1500])).toBe(false);
    expect(sameConsist([], [])).toBe(true);
  });

  it('consistKnown answers whether the whole composition is in the catalogue', () => {
    expect(consistKnown([1000, 1500])).toBe(true);
    expect(consistKnown([1000, 999_999])).toBe(false);
    // Sanity of the test's own ids.
    expect(vehicleSpec(1000).lengthM).toBe(18);
    expect(vehicleSpec(1500).lengthM).toBe(24);
  });
});

describe('placeConsist - arc-length spacing along the breadcrumb ring', () => {
  it('places wagons at exact distances along a straight path', () => {
    // Crumbs pushed west to east; head slightly past the newest crumb.
    const ring = ringOf([
      [8, 5, 0],
      [8.5, 5, 0],
      [9, 5, 0],
      [9.5, 5, 0],
    ]);
    const out = slots(2);
    placeConsist(ring, 9.75, 5, 0, 1, 0, [0.5, 1.5], 2, out);
    expect(out[0]!.fx).toBeCloseTo(9.25);
    expect(out[0]!.fy).toBeCloseTo(5);
    expect(out[1]!.fx).toBeCloseTo(8.25);
    expect(out[1]!.fy).toBeCloseTo(5);
    // Forward is the travel direction: east.
    expect(facingFromDelta(out[0]!.dirX, out[0]!.dirY)).toBe(0);
    expect(facingFromDelta(out[1]!.dirX, out[1]!.dirY)).toBe(0);
  });

  it('walks a corner in one pass, and each wagon faces its own segment', () => {
    // The head drove east along y=0, then turned onto +y at x=1: pushed
    // oldest first, so the ring holds the corner the tail still stands in.
    const ring = ringOf([
      [0, 0, 0],
      [0.5, 0, 0],
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
    ]);
    const out = slots(2);
    placeConsist(ring, 1, 1.25, 0, 0, 1, [0.5, 1.75], 2, out);
    // 0.5 behind the head: 0.25 to the newest crumb, 0.25 into the next
    // segment - still on the +y leg.
    expect(out[0]!.fx).toBeCloseTo(1);
    expect(out[0]!.fy).toBeCloseTo(0.75);
    expect(facingFromDelta(out[0]!.dirX, out[0]!.dirY)).toBe(2); // travelling +y
    // 1.75 behind: 0.25 + 0.5 + 0.5 consumes the +y leg, 0.5 into the +x
    // leg - around the corner, facing east like the track it stands on.
    expect(out[1]!.fx).toBeCloseTo(0.5);
    expect(out[1]!.fy).toBeCloseTo(0);
    expect(facingFromDelta(out[1]!.dirX, out[1]!.dirY)).toBe(0);
  });

  it('interpolates the height along its segment', () => {
    const ring = ringOf([
      [8, 5, 2],
      [9, 5, 4],
    ]);
    const out = slots(1);
    placeConsist(ring, 9, 5, 4, 1, 0, [0.5], 1, out);
    // Half way down the 9->8 segment: half way between the heights.
    expect(out[0]!.fx).toBeCloseTo(8.5);
    expect(out[0]!.h).toBeCloseTo(3);
  });

  it('extends straight behind the head on an empty ring - the fresh-spawn floor', () => {
    const ring = new BreadcrumbRing();
    const out = slots(2);
    // Head faces north-east (facing delta [1, -1] normalised inside).
    placeConsist(ring, 5, 5, 1, 1, -1, [Math.SQRT2, 2 * Math.SQRT2], 2, out);
    expect(out[0]!.fx).toBeCloseTo(4);
    expect(out[0]!.fy).toBeCloseTo(6);
    expect(out[1]!.fx).toBeCloseTo(3);
    expect(out[1]!.fy).toBeCloseTo(7);
    // Height held; facing inherited from the fallback direction.
    expect(out[0]!.h).toBeCloseTo(1);
    expect(facingFromDelta(out[0]!.dirX, out[0]!.dirY)).toBe(7);
  });

  it('falls back to east when no direction exists at all', () => {
    const ring = new BreadcrumbRing();
    const out = slots(1);
    placeConsist(ring, 5, 5, 0, 0, 0, [1], 1, out);
    expect(out[0]!.fx).toBeCloseTo(4);
    expect(out[0]!.fy).toBeCloseTo(5);
  });

  it('extends a short history along its last segment', () => {
    // One crumb 0.3 tiles behind: the first wagon lands on the real
    // segment, the second runs out of history and continues straight.
    const ring = ringOf([[1.7, 2, 0]]);
    const out = slots(2);
    placeConsist(ring, 2, 2, 0, 0, 1, [0.2, 1], 2, out);
    expect(out[0]!.fx).toBeCloseTo(1.8);
    expect(out[0]!.fy).toBeCloseTo(2);
    expect(out[1]!.fx).toBeCloseTo(1);
    expect(out[1]!.fy).toBeCloseTo(2);
    // Both face the segment's travel direction, not the fallback.
    expect(facingFromDelta(out[1]!.dirX, out[1]!.dirY)).toBe(0);
  });

  it('skips a degenerate segment when the head sits exactly on the newest crumb', () => {
    const ring = ringOf([
      [8, 5, 0],
      [9, 5, 0],
    ]);
    const out = slots(1);
    // Head exactly on crumb 0: the zero-length head segment must be
    // skipped, not divided by.
    placeConsist(ring, 9, 5, 0, 1, 0, [0.5], 1, out);
    expect(out[0]!.fx).toBeCloseTo(8.5);
    expect(out[0]!.fy).toBeCloseTo(5);
  });

  it('places correctly across a wrapped ring', () => {
    // Capacity 4, six pushes along a line: the ring wrapped twice and the
    // accessors must still walk newest to oldest without a seam.
    const ring = new BreadcrumbRing(4);
    for (let i = 0; i <= 5; i++) ring.record(i * 0.5, 0, 0);
    // Ring now holds 2.5, 2.0, 1.5, 1.0 (newest first).
    const out = slots(1);
    placeConsist(ring, 2.75, 0, 0, 1, 0, [1.25], 1, out);
    expect(out[0]!.fx).toBeCloseTo(1.5);
    expect(out[0]!.fy).toBeCloseTo(0);
  });

  it('after a teleport reset the tail snaps to a straight line at the new place', () => {
    const ring = ringOf([
      [0, 0, 0],
      [0.5, 0, 0],
      [1, 0, 0],
    ]);
    // The relocation: far past the D-162 distance, ring resets to one crumb.
    ring.record(50, 50, 0);
    const out = slots(1);
    placeConsist(ring, 50.1, 50, 0, 1, 0, [1], 1, out);
    // Nothing of the old path remains: the wagon extends behind the new
    // position, not along the abandoned line at y=0.
    expect(out[0]!.fx).toBeCloseTo(49.1);
    expect(out[0]!.fy).toBeCloseTo(50);
  });
});
