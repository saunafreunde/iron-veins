/**
 * Hatching for the colour-blind mode (SPEC2 M25, section 17.4).
 *
 * The colour-blind switch has swapped the company and cargo palettes since M9,
 * which is enough where the question is "whose is that" - the Okabe-Ito set is
 * deficiency-safe by construction. It is NOT enough for the one overlay in the
 * game whose whole meaning is a green-amber-red ramp: the utilisation heat map
 * of SPEC2 M15. Under deuteranopia its three bands are three shades of the same
 * mud, and no palette swap fixes that, because the ramp is a QUANTITY and the
 * player has to read where on it a piece of track sits.
 *
 * So the second channel is a pattern: each band gets its own hatch direction
 * and its own line spacing, and both are readable in a still greyscale
 * screenshot. Sparse diagonal, closer counter-diagonal, dense vertical - the
 * density itself carries the order, so a player does not have to remember which
 * angle means what.
 *
 * Everything here is pure geometry over plain numbers, so the pattern, the
 * banding and the clipping are unit-tested headless while the tile walk stays
 * in `MapView` - the `water.ts` / `flowAtlas.ts` / `heatmap.ts` pattern.
 */

/** One band's hatch: a direction in the tile's own unit space and a spacing. */
export interface HatchPattern {
  /** Degrees, measured in the tile's unit space (0 = towards +x). */
  readonly angleDeg: number;
  /** Distance between two lines, in unit-space widths (the tile is 2 wide). */
  readonly spacing: number;
}

/**
 * One pattern per heat band. Three, because `HEAT_STOPS` has three stops and
 * a hatch that did not line up with the colours would be a second, disagreeing
 * scale.
 */
export const HATCH_PATTERNS: readonly HatchPattern[] = [
  { angleDeg: 45, spacing: 0.62 },
  { angleDeg: 135, spacing: 0.46 },
  { angleDeg: 90, spacing: 0.34 },
];

/** Ink of every hatch line: the interface's darkest surface tone. [RGB] */
export const HATCH_INK = 0x14161a;

/** Opacity of a hatch line. Dark enough to read over the amber and the red,
 *  light enough that the track under the overlay stays visible. [0-1] */
export const HATCH_ALPHA = 0.6;

/** Line width, before the zoom divide the caller applies. [screen px] */
export const HATCH_WIDTH_PX = 1.25;

/** Four numbers per segment: x1, y1, x2, y2. */
export const HATCH_SEGMENT_STRIDE = 4;

/**
 * How many segments one tile can ever need, so the caller can preallocate.
 * The densest pattern is 0.34 apart over a unit-space width of 2, plus the
 * phase offset - seven lines with room to spare.
 */
export const HATCH_MAX_SEGMENTS = 12;

/**
 * Which band a utilisation of 0..1 falls in: 0, 1 or 2, in thirds.
 *
 * The bands are the colour ramp's own thirds rather than its stops, because a
 * stop is a point and a band is what a tile can be IN. Values outside the
 * range clamp, exactly as the colour does.
 */
export function hatchBandOf(fraction: number): number {
  const t = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const band = Math.floor(t * HATCH_PATTERNS.length);
  return band >= HATCH_PATTERNS.length ? HATCH_PATTERNS.length - 1 : band;
}

/**
 * The hatch lines of one tile, clipped to the tile's own diamond.
 *
 * Written into `out` as x1, y1, x2, y2 per segment; the return value is how
 * many segments were written. Nothing is allocated, because this runs per
 * visible track tile whenever the overlay is rebuilt.
 *
 * The clipping is exact rather than approximate, and it has to be: a hatch
 * that ran over the diamond's edge would paint into the next tile and read as
 * that tile's band. The lines are laid out in the tile's UNIT space (where the
 * diamond is |u| + |v| <= 1) and mapped back afterwards, so one clipper covers
 * every zoom and both atlas pages; the angles are therefore the isometric
 * tile's own angles, which is what makes 45 degrees run along a tile edge and
 * 90 degrees cross both of them.
 */
export function hatchSegments(
  centreX: number,
  centreY: number,
  halfWidth: number,
  halfHeight: number,
  band: number,
  out: Float64Array,
): number {
  const pattern = HATCH_PATTERNS[band] ?? HATCH_PATTERNS[0]!;
  const radians = (pattern.angleDeg * Math.PI) / 180;
  const dirU = Math.cos(radians);
  const dirV = Math.sin(radians);
  // The perpendicular the lines are stepped along.
  const normalU = -dirV;
  const normalV = dirU;

  const capacity = Math.floor(out.length / HATCH_SEGMENT_STRIDE);
  const steps = Math.ceil(1 / pattern.spacing);
  let written = 0;

  for (let k = -steps; k <= steps && written < capacity; k++) {
    // Half a spacing of phase, so no line runs exactly through the tile
    // centre - a line on the centre reads as a crack rather than as a hatch.
    const offset = (k + 0.5) * pattern.spacing;
    const originU = normalU * offset;
    const originV = normalV * offset;

    let tMin = -2;
    let tMax = 2;
    let empty = false;
    // The diamond is the intersection of four half planes su*u + sv*v <= 1.
    for (let corner = 0; corner < 4 && !empty; corner++) {
      const su = corner < 2 ? 1 : -1;
      const sv = corner % 2 === 0 ? 1 : -1;
      const denominator = su * dirU + sv * dirV;
      const numerator = 1 - (su * originU + sv * originV);
      if (denominator > 0) {
        const bound = numerator / denominator;
        if (bound < tMax) tMax = bound;
      } else if (denominator < 0) {
        const bound = numerator / denominator;
        if (bound > tMin) tMin = bound;
      } else if (numerator < 0) {
        empty = true;
      }
    }
    // A line that only grazes a corner is not drawn: a one-pixel dash in the
    // tip of a diamond is noise, not information.
    if (empty || tMax - tMin < 0.05) continue;

    const base = written * HATCH_SEGMENT_STRIDE;
    out[base] = centreX + (originU + dirU * tMin) * halfWidth;
    out[base + 1] = centreY + (originV + dirV * tMin) * halfHeight;
    out[base + 2] = centreX + (originU + dirU * tMax) * halfWidth;
    out[base + 3] = centreY + (originV + dirV * tMax) * halfHeight;
    written++;
  }

  return written;
}
