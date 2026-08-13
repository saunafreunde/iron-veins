import { describe, expect, it } from 'vitest';
import {
  hatchBandOf,
  hatchSegments,
  HATCH_MAX_SEGMENTS,
  HATCH_PATTERNS,
  HATCH_SEGMENT_STRIDE,
} from '../../src/render/hatching';
import { heatColor } from '../../src/render/heatmap';
import { flowStrokeColor } from '../../src/render/flowAtlas';
import { COMPANY_COLORS, COMPANY_COLORS_CVD } from '../../src/shared/palette';
import { TILE_H, TILE_W } from '../../src/render/projection';

/**
 * The hatching of the colour-blind mode (SPEC2 M25, 17.4).
 *
 * What has to be true: every band is a different pattern, no line leaves the
 * tile it belongs to, and the scratch buffer the renderer preallocates is big
 * enough for the densest one. The first is the accessibility claim; the second
 * would otherwise paint a tile's band over its neighbour, which is a WRONG
 * reading rather than an ugly one; the third is the difference between a
 * dropped line and a crash in a hot path.
 */

const OUT = new Float64Array(HATCH_MAX_SEGMENTS * HATCH_SEGMENT_STRIDE);

/** Whether a point is inside the tile diamond, with a hair of tolerance. */
function insideDiamond(x: number, y: number, cx: number, cy: number): boolean {
  const u = Math.abs(x - cx) / (TILE_W / 2);
  const v = Math.abs(y - cy) / (TILE_H / 2);
  return u + v <= 1 + 1e-9;
}

describe('the heat map hatch', () => {
  it('gives each band its own direction and density', () => {
    const angles = HATCH_PATTERNS.map((pattern) => pattern.angleDeg);
    const spacings = HATCH_PATTERNS.map((pattern) => pattern.spacing);
    expect(new Set(angles).size).toBe(HATCH_PATTERNS.length);
    expect(new Set(spacings).size).toBe(HATCH_PATTERNS.length);
    // Density carries the ORDER, so a player does not have to remember which
    // angle means what: the busier the track, the closer the lines.
    for (let band = 1; band < spacings.length; band++) {
      expect(spacings[band]!).toBeLessThan(spacings[band - 1]!);
    }
  });

  it('bands the ramp the colour uses, in thirds', () => {
    expect(hatchBandOf(0)).toBe(0);
    expect(hatchBandOf(0.2)).toBe(0);
    expect(hatchBandOf(0.5)).toBe(1);
    expect(hatchBandOf(0.9)).toBe(2);
    // Out of range clamps, exactly as the colour does.
    expect(hatchBandOf(-1)).toBe(0);
    expect(hatchBandOf(2)).toBe(HATCH_PATTERNS.length - 1);
    expect(heatColor(0)).not.toBe(heatColor(1));
  });

  it('draws every line inside its own tile', () => {
    const cx = 640;
    const cy = 320;
    for (let band = 0; band < HATCH_PATTERNS.length; band++) {
      const written = hatchSegments(cx, cy, TILE_W / 2, TILE_H / 2, band, OUT);
      expect(written, `band ${band}`).toBeGreaterThan(1);
      for (let segment = 0; segment < written; segment++) {
        const at = segment * HATCH_SEGMENT_STRIDE;
        expect(insideDiamond(OUT[at]!, OUT[at + 1]!, cx, cy), `band ${band} start`).toBe(true);
        expect(insideDiamond(OUT[at + 2]!, OUT[at + 3]!, cx, cy), `band ${band} end`).toBe(true);
        // A segment of zero length would be a dot in a corner - the clipper
        // drops those rather than drawing noise.
        const dx = OUT[at + 2]! - OUT[at]!;
        const dy = OUT[at + 3]! - OUT[at + 1]!;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(0);
      }
    }
  });

  it('never writes more segments than the renderer preallocated', () => {
    for (let band = 0; band < HATCH_PATTERNS.length; band++) {
      expect(hatchSegments(0, 0, TILE_W / 2, TILE_H / 2, band, OUT)).toBeLessThanOrEqual(
        HATCH_MAX_SEGMENTS,
      );
    }
    // The densest pattern is the one that could overflow; asked with a buffer
    // of exactly one segment it writes one and stops.
    const tiny = new Float64Array(HATCH_SEGMENT_STRIDE);
    expect(hatchSegments(0, 0, TILE_W / 2, TILE_H / 2, HATCH_PATTERNS.length - 1, tiny)).toBe(1);
  });

  it('moves with the tile it is drawn on', () => {
    const first = hatchSegments(0, 0, TILE_W / 2, TILE_H / 2, 1, OUT);
    const a = OUT.slice(0, first * HATCH_SEGMENT_STRIDE);
    const second = hatchSegments(100, 40, TILE_W / 2, TILE_H / 2, 1, OUT);
    expect(second).toBe(first);
    for (let i = 0; i < a.length; i += HATCH_SEGMENT_STRIDE) {
      expect(OUT[i]! - a[i]!).toBeCloseTo(100, 9);
      expect(OUT[i + 1]! - a[i + 1]!).toBeCloseTo(40, 9);
    }
  });
});

describe('the flow atlas under the colour-blind setting', () => {
  it('draws its arrows in the deficiency-safe palette', () => {
    // The minimap has swapped since M9 and the arrows had not, so the one
    // overlay that draws several companies over each other was the one place
    // the setting did not reach.
    for (let owner = 0; owner < COMPANY_COLORS.length; owner++) {
      const plain = flowStrokeColor(owner, -1, false);
      const safe = flowStrokeColor(owner, -1, true);
      expect(plain).toBe(Number.parseInt(COMPANY_COLORS[owner]!.slice(1), 16));
      expect(safe).toBe(Number.parseInt(COMPANY_COLORS_CVD[owner]!.slice(1), 16));
    }
  });

  it('leaves an unmeasured leg grey in both palettes', () => {
    expect(flowStrokeColor(-1, -1, true)).toBe(flowStrokeColor(-1, -1, false));
  });
});
