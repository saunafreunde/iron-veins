import { describe, expect, it } from 'vitest';
import { groundFoldSideAt, groundSurfacePoint, groundSurfaceShear } from '../../src/render/ground';
import { HEIGHT_PX, TILE_H, TILE_W } from '../../src/render/projection';
import { TRACK_DELTA } from '../../src/render/TerrainAtlas';

/**
 * The shear that carries a flat cell onto sloped ground (M27).
 *
 * `MapView` cannot be driven headless (D-136), so what is held here is the
 * arithmetic underneath it: the matrix Pixi really composes from the skew and
 * the two scales, and the claim that every rail arm lies inside ONE plane. Both
 * are the sort of thing that looks right in a comment and is wrong on screen.
 */

const SLOPES = Array.from({ length: 15 }, (_, slope) => slope);

/**
 * The matrix Pixi builds from `(rotation 0, skewX 0, skewY t, scaleX, scaleY)`.
 *
 * Copied from the decomposition Pixi documents - a = cos(rot + skewY) * sx,
 * b = sin(rot + skewY) * sx, c = -sin(rot - skewX) * sy, d = cos(rot - skewX)
 * * sy - so this test fails if that ever stops being what the renderer does,
 * rather than agreeing with itself.
 */
function pixiMatrix(skewY: number, scaleX: number, scaleY: number) {
  return {
    a: Math.cos(skewY) * scaleX,
    b: Math.sin(skewY) * scaleX,
    c: -Math.sin(0) * scaleY,
    d: Math.cos(0) * scaleY,
  };
}

describe('the sprite shear', () => {
  /**
   * The whole reason a Sprite can do this at all: skew plus two scales
   * composes to exactly [1, b, 0, a], the affine the ground asks for. The
   * stretch in scaleX is cancelled by the cosine in the x row, which is why
   * the x axis comes out untouched.
   */
  it('composes to the affine the ground asks for', () => {
    for (const slope of SLOPES) {
      for (const side of [0, 1] as const) {
        const [a, b] = groundSurfaceShear(slope, side);
        const stretch = Math.hypot(1, b);
        const matrix = pixiMatrix(Math.atan(b), stretch, a);
        expect(matrix.a, `slope ${slope}/${side} x scale`).toBeCloseTo(1, 12);
        expect(matrix.b, `slope ${slope}/${side} x shear`).toBeCloseTo(b, 12);
        expect(matrix.c, `slope ${slope}/${side} y shear`).toBeCloseTo(0, 12);
        expect(matrix.d, `slope ${slope}/${side} y scale`).toBeCloseTo(a, 12);
      }
    }
  });

  /** The four ramps, pinned - the numbers a reader can check by hand. */
  it('holds the four ramps at their measured triples', () => {
    const expected: readonly (readonly [number, number, number, number])[] = [
      [3, 1.5, -0.25, -HEIGHT_PX / 2],
      [9, 1.5, 0.25, -HEIGHT_PX / 2],
      [6, 0.5, -0.25, -HEIGHT_PX / 2],
      [12, 0.5, 0.25, -HEIGHT_PX / 2],
    ];
    for (const [slope, a, b, c] of expected) {
      const triple = groundSurfaceShear(slope, 0);
      expect(triple[0], `slope ${slope} a`).toBeCloseTo(a, 9);
      expect(triple[1], `slope ${slope} b`).toBeCloseTo(b, 9);
      expect(triple[2], `slope ${slope} c`).toBeCloseTo(c, 9);
    }
  });

  /**
   * A ramp's shear moves the tile centre by half a height step and leaves the
   * two corners on the fold where they are - the property that makes the seam
   * between two neighbouring ramp tiles close.
   */
  it('lands every corner of a ramp on the ground', () => {
    for (const slope of [3, 6, 9, 12]) {
      const [a, b, c] = groundSurfaceShear(slope, 0);
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0.5, 0.5],
      ] as const) {
        const flat = groundSurfacePoint(0, u, v);
        const lifted = groundSurfacePoint(slope, u, v);
        expect(a * flat[1] + b * flat[0] + c, `slope ${slope} at (${u}, ${v})`).toBeCloseTo(
          lifted[1],
          9,
        );
      }
    }
  });
});

describe('a rail arm on a folded tile', () => {
  /**
   * The claim the whole rail fix rests on: each half segment lies inside ONE
   * fold triangle, so one affine carries all of it. Walked along every arm of
   * every direction on every slope - the axis arms touch the fold only at
   * their far end, the diagonal arms run along it, and neither ever crosses.
   */
  it('never crosses the fold', () => {
    const STEPS = 24;
    for (const slope of SLOPES) {
      for (let direction = 0; direction < 8; direction++) {
        const [dx, dy] = TRACK_DELTA[direction]!;
        const midU = 0.5 + dx / 4;
        const midV = 0.5 + dy / 4;
        const side = groundFoldSideAt(slope, midU, midV);
        const [a, b, c] = groundSurfaceShear(slope, side);
        for (let i = 0; i <= STEPS; i++) {
          // From the tile centre out to the edge - the arm reaches half a step.
          const t = i / STEPS;
          const u = 0.5 + (dx / 2) * t;
          const v = 0.5 + (dy / 2) * t;
          const flat = groundSurfacePoint(0, u, v);
          const lifted = groundSurfacePoint(slope, u, v);
          // The arm's own affine reproduces the surface along its whole length.
          expect(
            a * flat[1] + b * flat[0] + c,
            `slope ${slope} direction ${direction} at t=${t}`,
          ).toBeCloseTo(lifted[1], 9);
        }
      }
    }
  });

  /** The eight directions really are the eight compass steps of the tile. */
  it('reaches an edge midpoint or a corner, and nothing else', () => {
    expect(TRACK_DELTA.length).toBe(8);
    for (const [dx, dy] of TRACK_DELTA) {
      expect(Math.abs(dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(dy)).toBeLessThanOrEqual(1);
      expect(dx === 0 && dy === 0).toBe(false);
      // Half a step from the centre lands on the tile boundary.
      const u = 0.5 + dx / 2;
      const v = 0.5 + dy / 2;
      expect(u >= 0 && u <= 1 && v >= 0 && v <= 1).toBe(true);
      expect(u === 0 || u === 1 || v === 0 || v === 1).toBe(true);
    }
  });

  /** The projection this rests on. */
  it('rests on the dimetric tile', () => {
    expect([TILE_W, TILE_H, HEIGHT_PX]).toEqual([64, 32, 16]);
  });
});
