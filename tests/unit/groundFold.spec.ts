import { describe, expect, it } from 'vitest';
import { HEIGHT_PX, TILE_H, TILE_W } from '../../src/render/projection';
import {
  groundFoldLiftAt,
  groundFoldSideAt,
  groundLiftAt,
  groundSlopeIsPlanar,
  groundSurfacePoint,
  groundSurfaceShear,
  groundTopFaces,
} from '../../src/render/ground';

/**
 * One surface, and it is the one on screen (M27).
 *
 * A tile is drawn as two triangles folded along the higher diagonal, and until
 * now the only function that answered "how high is the ground here" answered
 * for a BILINEAR patch instead - a different surface, agreeing on the edges and
 * disagreeing in the middle. Everything that has to sit on the ground was
 * therefore placed against a surface the game does not draw.
 *
 * This file is the definition of what "one geometry" means here: the drawn
 * lift agrees with the bilinear one exactly where the two surfaces provably
 * must agree, differs exactly where they must differ, and every point of it
 * lies in the plane of one of the two triangles the renderer really fills.
 */

/**
 * The fifteen slopes that can occur. `TileMap.slopeAt` normalises the corner
 * bits against the tile's own minimum, so at least one corner is always down
 * and "all four raised" (15) is not expressible.
 */
const SLOPES = Array.from({ length: 15 }, (_, slope) => slope);

/** The four corners in tile space, north, east, south, west. */
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function cornerHeights(slope: number): [number, number, number, number] {
  return [
    (slope & 1) !== 0 ? HEIGHT_PX : 0,
    (slope & 2) !== 0 ? HEIGHT_PX : 0,
    (slope & 4) !== 0 ? HEIGHT_PX : 0,
    (slope & 8) !== 0 ? HEIGHT_PX : 0,
  ];
}

describe('the drawn ground surface', () => {
  it('meets the bilinear surface at every corner', () => {
    for (const slope of SLOPES) {
      const [north, east, south, west] = cornerHeights(slope);
      const wanted = [north, east, south, west];
      CORNERS.forEach(([u, v], index) => {
        expect(groundFoldLiftAt(slope, u, v), `slope ${slope} corner ${index}`).toBeCloseTo(
          wanted[index]!,
          12,
        );
      });
    }
  });

  /**
   * The two surfaces are identical along all four edges - which is why a road
   * arm, which ends at an edge MIDPOINT, could be carried by either. It is the
   * middle where they part, and the middle is where a crossing sits.
   */
  it('agrees with the bilinear surface along every edge', () => {
    const STEPS = 20;
    for (const slope of SLOPES) {
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        for (const [u, v] of [
          [t, 0],
          [t, 1],
          [0, t],
          [1, t],
        ] as const) {
          expect(
            Math.abs(groundFoldLiftAt(slope, u, v) - groundLiftAt(slope, u, v)),
            `slope ${slope} at (${u}, ${v})`,
          ).toBeLessThan(1e-9);
        }
      }
    }
  });

  /**
   * The middle is the ridge, so it is the HIGHER of the two diagonals' means -
   * never their average, which is what the bilinear patch answers and what put
   * a crossing half a height step under the ground it is drawn on.
   */
  it('puts the tile centre on the ridge, not in the hollow', () => {
    const differing: number[] = [];
    for (const slope of SLOPES) {
      const [north, east, south, west] = cornerHeights(slope);
      const ridge = Math.max(north + south, east + west) / 2;
      expect(groundFoldLiftAt(slope, 0.5, 0.5), `slope ${slope}`).toBeCloseTo(ridge, 12);
      expect(groundLiftAt(slope, 0.5, 0.5)).toBeCloseTo((north + east + south + west) / 4, 12);
      if (Math.abs(ridge - (north + east + south + west) / 4) > 1e-9) differing.push(slope);
    }
    // The two diagonal slopes are half a height step out; eight more are a
    // quarter. Pinned as a count so a change to the fold rule is visible here.
    expect(differing.length).toBe(10);
    for (const slope of [5, 10]) {
      const [north, east, south, west] = cornerHeights(slope);
      expect(
        groundFoldLiftAt(slope, 0.5, 0.5) - (north + east + south + west) / 4,
      ).toBeCloseTo(HEIGHT_PX / 2, 12);
    }
  });

  /**
   * The real test of "one geometry": every point of the drawn lift lies in the
   * PLANE of the triangle it was assigned to.
   *
   * Solved in tile space, where a fold triangle is never degenerate. Doing it
   * in screen space would not work for every slope, and the reason is the
   * finding below.
   */
  it('lies in the plane of the triangle it belongs to', () => {
    const STEPS = 12;
    for (const slope of SLOPES) {
      const [north, east, south, west] = cornerHeights(slope);
      const lift = [north, east, south, west];
      const corners = (side: 0 | 1): readonly number[] =>
        north + south >= east + west
          ? side === 0
            ? [0, 1, 2]
            : [0, 2, 3]
          : side === 0
            ? [1, 2, 3]
            : [1, 0, 3];

      for (let i = 0; i <= STEPS; i++) {
        for (let j = 0; j <= STEPS; j++) {
          const u = i / STEPS;
          const v = j / STEPS;
          const side = groundFoldSideAt(slope, u, v);
          const [ia, ib, ic] = corners(side) as [number, number, number];
          const [au, av] = CORNERS[ia]!;
          const [bu, bv] = CORNERS[ib]!;
          const [cu, cv] = CORNERS[ic]!;
          // Barycentric weights against the tile-space triangle, then the
          // plane's height at (u, v) is the same combination of its corners'.
          const det = (bu - au) * (cv - av) - (bv - av) * (cu - au);
          const w1 = ((u - au) * (cv - av) - (v - av) * (cu - au)) / det;
          const w2 = ((bu - au) * (v - av) - (bv - av) * (u - au)) / det;
          const planeLift = lift[ia]! + w1 * (lift[ib]! - lift[ia]!) + w2 * (lift[ic]! - lift[ia]!);
          expect(groundFoldLiftAt(slope, u, v), `slope ${slope} at (${u}, ${v})`).toBeCloseTo(
            planeLift,
            9,
          );
        }
      }
    }
  });

  /**
   * Two triangles in the whole game are seen exactly edge-on, and they are
   * worth knowing about rather than tripping over.
   *
   * Both are the valley triangle east-north-west of a slope whose east and
   * west corners are raised and whose north corner is not - slopes 10 (E|W) and
   * 14 (E|S|W). The two tile axes project to (+32, +16) and (-32, +16) design
   * px and a raised corner subtracts a full 16 from y, so on that face both
   * axes come out exactly horizontal: all three screen points share a y and the
   * triangle collapses to a LINE. The renderer fills a zero-area polygon there,
   * which is right - there is nothing of that face to see - but it means no
   * screen-space containment test can be written for it, and any code that
   * inverts the projection per triangle has to expect a singular one.
   */
  it('has exactly two screen triangles that project to a line', () => {
    const degenerate: string[] = [];
    for (const slope of SLOPES) {
      groundTopFaces(slope, 0).forEach((face, side) => {
        const [ax, ay] = face[0]!;
        const [bx, by] = face[1]!;
        const [cx, cy] = face[2]!;
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 1e-6) degenerate.push(`${slope}/${side}`);
      });
    }
    expect(degenerate).toEqual(['10/1', '14/1']);
  });
});

describe('the planar slopes', () => {
  it('is exactly the flat tile and the four ramps', () => {
    const planar = SLOPES.filter((slope) => groundSlopeIsPlanar(slope));
    expect(planar).toEqual([0, 3, 6, 9, 12]);
  });

  /** On a planar slope the fold is a fiction, so both sides answer the same. */
  it('answers one affine for both sides', () => {
    for (const slope of [0, 3, 6, 9, 12]) {
      const first = groundSurfaceShear(slope, 0);
      const second = groundSurfaceShear(slope, 1);
      first.forEach((value, index) => expect(value).toBeCloseTo(second[index]!, 9));
    }
  });

  /**
   * The four ramps' triples, pinned. Measured from the projection: a ramp
   * lifts the tile centre by exactly half a height step, which is the shared
   * constant term.
   */
  it('carries the flat drawing onto the ramp exactly', () => {
    const expected: Readonly<Record<number, readonly [number, number, number]>> = {
      3: [1.5, -0.25, -HEIGHT_PX / 2],
      9: [1.5, 0.25, -HEIGHT_PX / 2],
      6: [0.5, -0.25, -HEIGHT_PX / 2],
      12: [0.5, 0.25, -HEIGHT_PX / 2],
    };
    for (const [slope, triple] of Object.entries(expected)) {
      const [a, b, c] = groundSurfaceShear(Number(slope), 0);
      expect(a, `slope ${slope} a`).toBeCloseTo(triple[0], 9);
      expect(b, `slope ${slope} b`).toBeCloseTo(triple[1], 9);
      expect(c, `slope ${slope} c`).toBeCloseTo(triple[2], 9);
    }
    // Flat ground is the identity, which is what makes the branch that skips
    // it an optimisation rather than a different drawing.
    const [a, b, c] = groundSurfaceShear(0, 0);
    expect(a).toBeCloseTo(1, 12);
    expect(b).toBeCloseTo(0, 12);
    expect(c).toBeCloseTo(0, 12);
  });

  /**
   * The affine really carries the flat point onto the surface - checked at
   * points the solve did not use, which is what makes it a test rather than a
   * restatement.
   */
  it('agrees with the surface at points it was not solved from', () => {
    for (const slope of SLOPES) {
      for (const side of [0, 1] as const) {
        const [a, b, c] = groundSurfaceShear(slope, side);
        for (let i = 1; i < 10; i++) {
          for (let j = 1; j < 10; j++) {
            const u = i / 10;
            const v = j / 10;
            if (groundFoldSideAt(slope, u, v) !== side) continue;
            const flat = groundSurfacePoint(0, u, v);
            const lifted = groundSurfacePoint(slope, u, v);
            expect(a * flat[1] + b * flat[0] + c, `slope ${slope} side ${side}`).toBeCloseTo(
              lifted[1],
              9,
            );
            expect(flat[0]).toBeCloseTo(lifted[0], 12);
          }
        }
      }
    }
  });

  /** The projection this all rests on, so a change to it is caught here too. */
  it('rests on the dimetric tile this game uses', () => {
    expect(TILE_W).toBe(64);
    expect(TILE_H).toBe(32);
    expect(HEIGHT_PX).toBe(16);
  });
});
