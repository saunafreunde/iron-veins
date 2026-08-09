import { HEIGHT_PX, TILE_H, TILE_W } from './projection';
import { tileVariantSeed } from './staticArt';

/**
 * The pure half of the ground: its light model, the shape of the sixteen slope
 * faces, and the per-tile value variance that stops a field reading as a
 * tiling of identical diamonds.
 *
 * The `seasonArt` / `water` / `emissive` split applied once more, and for the
 * same reason: no canvas, no Pixi, no map object, so every decision below is a
 * headless test while `TerrainAtlas` only draws what these functions decided
 * and `MapView` only tints what `groundValueTint` chose.
 *
 * **What was measured before this file existed** (default temperate 1024 map,
 * seed 4,711, the world D-209 measured its forest on):
 *
 * - `drawTerrainCell` put down THREE flat fills - two skirt quads and one
 *   whole-diamond top face - plus 22 identical 2x2 speckles. A cell is keyed
 *   by (terrain, slope) and by nothing else, so every one of the **630,421
 *   flat land tiles (85.5 % of the land)** drew the same pixels: grass alone
 *   is 25.7 % of the map, rock 18.6 %, forest 16.5 %, field 3.9 %.
 * - The top face carried ONE colour from a five-value table
 *   (`1 + tilt * 0.07`, tilt = W + N - E - S), so the two DIAGONAL slopes
 *   shaded exactly like flat ground, and the sign was **inverted against the
 *   cell's own skirts**: a face that descends towards the north-west - the
 *   direction the two skirt factors 0.62/0.76 place the light in - was drawn
 *   DARKEST at 0.86 and the face turned away from it brightest at 1.14.
 * - Neighbouring diamonds abutted with no overlap, so each covered about half
 *   of every boundary pixel and the two half-coverages composited to three
 *   quarters: up to **25 % of the background** showed through as a lattice at
 *   every tile edge. That is the same arithmetic ROAD_SEAM_OVERLAP_PX was
 *   written for one bundle earlier, one layer further down.
 */

// ------------------------------------------------------------------- light

/**
 * The two skirt shades and the flat-top shade the terrain cell has drawn
 * since M1. They are the artwork, not a proposal: this file DERIVES the light
 * from them rather than inventing a second one. [factor on the base colour]
 *
 * `SKIRT_SE` is the wall along the tile's east-south edge (screen lower
 * right), `SKIRT_SW` the one along south-west (screen lower left).
 */
export const SKIRT_SE_SHADE = 0.62;
export const SKIRT_SW_SHADE = 0.76;
export const TOP_FLAT_SHADE = 1;

/**
 * The one light vector, solved from the three shades above.
 *
 * A vertical wall facing screen-SE has the tile-space normal (1, 0, 0), one
 * facing screen-SW has (0, 1, 0) and flat ground has (0, 0, 1). With a
 * Lambert response `ambient + diffuse * (n . L)` those three shades are three
 * equations in three unknowns (ambient, diffuse and the light's tilt), and
 * they have exactly one solution:
 *
 *   ambient = SKIRT_SW_SHADE                       (the face L grazes)
 *   diffuse * -Lx = SKIRT_SE_SHADE - SKIRT_SW_SHADE
 *   diffuse *  Lz = TOP_FLAT_SHADE - SKIRT_SW_SHADE
 *
 * `Ly` comes out ZERO, which is the whole point: -x is up-left on screen in
 * the 16.1 projection, so the light the shipped artwork already implied is
 * fixed north-west, exactly as SPEC.md 16.3 and every solid in `shapes.ts`
 * assume. Nothing here is a new number.
 */
const LIGHT_DIFFUSE = Math.hypot(SKIRT_SW_SHADE - SKIRT_SE_SHADE, TOP_FLAT_SHADE - SKIRT_SW_SHADE);
export const GROUND_LIGHT: readonly [number, number, number] = [
  -(SKIRT_SW_SHADE - SKIRT_SE_SHADE) / LIGHT_DIFFUSE,
  0,
  (TOP_FLAT_SHADE - SKIRT_SW_SHADE) / LIGHT_DIFFUSE,
];

/**
 * One height level as a fraction of one tile edge, AS DRAWN. [tile edges]
 *
 * The shading has to agree with the picture rather than with the ground: a
 * height step is 16 px of lift against a tile edge that measures
 * hypot(TILE_W/2, TILE_H/2) = 35.78 px in the 16.1 projection, so a one-level
 * face is tilted by atan(0.447) = 24.1 degrees on screen whatever the 8 m over
 * 50 m of the simulation would make of it.
 */
export const GROUND_HEIGHT_UNIT = HEIGHT_PX / Math.hypot(TILE_W / 2, TILE_H / 2);

/**
 * The darkest a one-level ramp turned away from the light may be drawn.
 * [factor on the base colour]
 *
 * Kept from the five-value table this file replaces - `1 + tilt * 0.07` at
 * tilt = -2 - so the CONTRAST of the artwork is unchanged and only its
 * direction and its resolution move. Anchoring on the shipped extreme is why
 * a hillside does not suddenly read louder than it did.
 */
export const TOP_RAMP_AWAY_SHADE = 0.86;

/** `n . L` for the normal (nx, ny, 1) before normalisation. */
function faceDot(nx: number, ny: number): number {
  const length = Math.sqrt(nx * nx + ny * ny + 1);
  return (nx * GROUND_LIGHT[0] + ny * GROUND_LIGHT[1] + GROUND_LIGHT[2]) / length;
}

/** Response of a top face: `TOP_AMBIENT + TOP_DIFFUSE * (n . L)`. */
const RAMP_AWAY_DOT = faceDot(GROUND_HEIGHT_UNIT, 0);
const TOP_DIFFUSE = (TOP_FLAT_SHADE - TOP_RAMP_AWAY_SHADE) / (GROUND_LIGHT[2] - RAMP_AWAY_DOT);
const TOP_AMBIENT = TOP_FLAT_SHADE - TOP_DIFFUSE * GROUND_LIGHT[2];

// ------------------------------------------------------- the sixteen slopes

/**
 * Corner bit order of `SlopeBit`, as tile-space positions: N (0,0), E (1,0),
 * S (1,1), W (0,1). The same N-E-S-W order the atlas draws its diamond in.
 */
const CORNER_U: readonly number[] = [0, 1, 1, 0];
const CORNER_V: readonly number[] = [0, 0, 1, 1];
const CORNER_BIT: readonly number[] = [1, 2, 4, 8];

/** How a slope's top face is split and how its two halves are lit. */
export interface SlopeFaces {
  /**
   * True when the fold runs north-south (triangles N-E-S and N-S-W), false
   * when it runs east-west (E-S-W and E-N-W).
   *
   * The fold is laid along the HIGHER diagonal, so the two raised corners of
   * a saddle read as a ridge rather than as a gully. A flat tile folds
   * north-south and both halves come out identical, which is why flat ground
   * is still one colour.
   */
  readonly foldNorthSouth: boolean;
  /** Shade of the first triangle (N-E-S, or E-S-W when the fold is E-W). */
  readonly first: number;
  /** Shade of the second triangle (N-S-W, or E-N-W when the fold is E-W). */
  readonly second: number;
}

function cornerLift(slope: number, corner: number): number {
  return (slope & CORNER_BIT[corner]!) !== 0 ? GROUND_HEIGHT_UNIT : 0;
}

/** Lambert shade of the triangle through three corner indices. */
function triangleShade(slope: number, a: number, b: number, c: number): number {
  const au = CORNER_U[a]!;
  const av = CORNER_V[a]!;
  const ah = cornerLift(slope, a);
  const bu = CORNER_U[b]! - au;
  const bv = CORNER_V[b]! - av;
  const bh = cornerLift(slope, b) - ah;
  const cu = CORNER_U[c]! - au;
  const cv = CORNER_V[c]! - av;
  const ch = cornerLift(slope, c) - ah;
  let nx = bv * ch - bh * cv;
  let ny = bh * cu - bu * ch;
  const nz = bu * cv - bv * cu;
  // Orient upwards; the winding of the two triangles differs by construction.
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
  }
  const shade = TOP_AMBIENT + TOP_DIFFUSE * faceDot(nx / Math.abs(nz), ny / Math.abs(nz));
  return shade;
}

/**
 * How the sixteen slope shapes are lit: two triangles, each by its OWN
 * normal under the one north-west light.
 *
 * The five-value table this replaces gave a whole tile one colour, so the two
 * diagonal slopes were drawn exactly like flat ground and a ramp's fold was
 * invisible. Splitting the quad is not decoration - a quad with three corners
 * at one level and one at another is not planar, and drawing it as one
 * polygon is drawing a surface that does not exist.
 */
export function slopeFaces(slope: number): SlopeFaces {
  const north = cornerLift(slope, 0);
  const east = cornerLift(slope, 1);
  const south = cornerLift(slope, 2);
  const west = cornerLift(slope, 3);
  const foldNorthSouth = north + south >= east + west;
  return foldNorthSouth
    ? {
        foldNorthSouth,
        first: triangleShade(slope, 0, 1, 2),
        second: triangleShade(slope, 0, 2, 3),
      }
    : {
        foldNorthSouth,
        first: triangleShade(slope, 1, 2, 3),
        second: triangleShade(slope, 1, 0, 3),
      };
}

// ------------------------------------------------------------- the geometry

/**
 * How far a face is painted PAST its own edge, so two neighbouring tiles
 * overlap instead of abutting. [design px, i.e. screen px at zoom 1]
 *
 * Two abutting anti-aliased polygons each cover about half of the boundary
 * pixel; source-over composites the two half-coverages to three quarters and
 * leaves the last quarter showing the background - a lattice of hairlines at
 * every tile edge, which is exactly what "sichtbare Kachelnähte" was. A
 * boundary pixel needs ONE of the two neighbours to cover it whole, so half a
 * screen pixel is the floor; 0.75 keeps a margin and is still under a pixel
 * at every zoom the base page serves. `ROAD_SEAM_OVERLAP_PX` is the same
 * argument one layer up (D-212).
 */
export const GROUND_SEAM_BLEED_PX = 0.75;

/**
 * The box a terrain cell may paint in, as design px around the tile CENTRE.
 *
 * Both pages clamp to it, which is the point: the detail page clips every
 * cell to its frame and the base page does not, so a bleed that overran the
 * box would draw one picture at zoom 4 and another at zoom 1 - the defect
 * D-212 measured at 6,240 px. The height is one step above the north corner
 * and one below the south corner, which is exactly what the detail page's
 * SHORT terrain row reserves.
 */
export const GROUND_BOX_HALF_W = TILE_W / 2;
export const GROUND_BOX_HALF_H = TILE_H / 2 + HEIGHT_PX;

export type Point = readonly [number, number];

/** Screen position of one diamond corner, in design px around the centre. */
function cornerPoint(slope: number, corner: number): Point {
  const u = CORNER_U[corner]!;
  const v = CORNER_V[corner]!;
  const lift = (slope & CORNER_BIT[corner]!) !== 0 ? HEIGHT_PX : 0;
  return [(u - v) * (TILE_W / 2), (u + v - 1) * (TILE_H / 2) - lift];
}

/**
 * Move every edge of a convex polygon `bleed` px outwards and clamp the
 * result into {@link GROUND_BOX_HALF_W} x {@link GROUND_BOX_HALF_H}.
 *
 * Miter offsets, so the expansion is uniform ALONG each edge rather than
 * tapering from a corner - a radial scale would leave two thirds of every
 * edge under-covered. The clamp bevels the two sharp corners at the box
 * edge, which costs nothing: those corners are where four tiles meet, and
 * the other three bleed into the same pixels from their own sides.
 */
export function bleedPolygon(points: readonly Point[], bleed: number): Point[] {
  const count = points.length;
  const normalX = new Array<number>(count);
  const normalY = new Array<number>(count);
  let centroidX = 0;
  let centroidY = 0;
  for (const point of points) {
    centroidX += point[0] / count;
    centroidY += point[1] / count;
  }
  for (let i = 0; i < count; i++) {
    const from = points[i]!;
    const to = points[(i + 1) % count]!;
    let dx = to[0] - from[0];
    let dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    let nx = dy;
    let ny = -dx;
    const midX = (from[0] + to[0]) / 2 - centroidX;
    const midY = (from[1] + to[1]) / 2 - centroidY;
    if (nx * midX + ny * midY < 0) {
      nx = -nx;
      ny = -ny;
    }
    normalX[i] = nx;
    normalY[i] = ny;
  }
  const offset: Point[] = [];
  for (let i = 0; i < count; i++) {
    const previous = (i + count - 1) % count;
    const ax = normalX[previous]!;
    const ay = normalY[previous]!;
    const bx = normalX[i]!;
    const by = normalY[i]!;
    const denominator = 1 + (ax * bx + ay * by);
    const miter = denominator > 1e-6 ? (bleed * Math.hypot(ax + bx, ay + by)) / denominator : 1e9;
    if (miter <= MITER_LIMIT * bleed) {
      const scale = bleed / denominator;
      offset.push([points[i]![0] + (ax + bx) * scale, points[i]![1] + (ay + by) * scale]);
      continue;
    }
    // A sliver corner - the two triangles of a folded slope meet at 14
    // degrees - would need a miter twenty-five times the bleed. Bevel it:
    // one vertex per adjoining edge, each keeping its OWN full offset.
    // Collapsing the miter instead (the first draft did) leaves both edges
    // tapering to nothing over their whole length, which measured as half the
    // asked-for seal on the north-east edge of every east-raised slope.
    offset.push([points[i]![0] + ax * bleed, points[i]![1] + ay * bleed]);
    offset.push([points[i]![0] + bx * bleed, points[i]![1] + by * bleed]);
  }
  return clipToBox(offset);
}

/** Where a miter join turns into a bevel. [multiples of the bleed] */
const MITER_LIMIT = 3;

/**
 * Sutherland-Hodgman against the cell box.
 *
 * Clipping is not the same as clamping the corner vertices, and the
 * difference is the whole seal: a clamped miter tip drags the two edges that
 * meet in it inwards with it, so two thirds of every edge lose their offset
 * and the hairline comes back. Cutting the polygon at the box leaves each
 * offset edge exactly where it was and only removes what would have left the
 * cell.
 */
function clipToBox(points: readonly Point[]): Point[] {
  let current: Point[] = [...points];
  const planes: readonly (readonly [number, number, number])[] = [
    [1, 0, GROUND_BOX_HALF_W],
    [-1, 0, GROUND_BOX_HALF_W],
    [0, 1, GROUND_BOX_HALF_H],
    [0, -1, GROUND_BOX_HALF_H],
  ];
  for (const [nx, ny, limit] of planes) {
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const from = current[i]!;
      const to = current[(i + 1) % current.length]!;
      const fromIn = nx * from[0] + ny * from[1] <= limit;
      const toIn = nx * to[0] + ny * to[1] <= limit;
      if (fromIn) next.push(from);
      if (fromIn === toIn) continue;
      const a = nx * from[0] + ny * from[1];
      const b = nx * to[0] + ny * to[1];
      const t = (limit - a) / (b - a);
      next.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    }
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

/**
 * The two top-face triangles of one slope, in design px around the tile
 * centre, already bled by `bleed`. Index 0 is `SlopeFaces.first`.
 */
export function groundTopFaces(slope: number, bleed = GROUND_SEAM_BLEED_PX): Point[][] {
  const corner = (index: number): Point => cornerPoint(slope, index);
  const faces = slopeFaces(slope);
  const triangles = faces.foldNorthSouth
    ? [
        [corner(0), corner(1), corner(2)],
        [corner(0), corner(2), corner(3)],
      ]
    : [
        [corner(1), corner(2), corner(3)],
        [corner(1), corner(0), corner(3)],
      ];
  return triangles.map((triangle) => bleedPolygon(triangle, bleed));
}

/**
 * The whole diamond as ONE bled outline, for the five slopes whose two halves
 * are lit identically (flat ground and the four uniform one-level ramps).
 *
 * Drawing those as one polygon is not only cheaper - it is the only way the
 * cell has no fold at all where the surface has none, and a fold drawn as a
 * hairline of overlap would be a seam of exactly the kind this bundle exists
 * to remove.
 */
export function groundTopOutline(slope: number, bleed = GROUND_SEAM_BLEED_PX): Point[] {
  return bleedPolygon(
    [cornerPoint(slope, 0), cornerPoint(slope, 1), cornerPoint(slope, 2), cornerPoint(slope, 3)],
    bleed,
  );
}

/**
 * Height of the bilinear ground surface at (u, v) in tile space, in design px
 * of LIFT above the tile's own base plane - what a grain mark has to follow
 * so a furrow runs up a hillside instead of floating across it.
 */
export function groundLiftAt(slope: number, u: number, v: number): number {
  const north = (slope & CORNER_BIT[0]!) !== 0 ? HEIGHT_PX : 0;
  const east = (slope & CORNER_BIT[1]!) !== 0 ? HEIGHT_PX : 0;
  const south = (slope & CORNER_BIT[2]!) !== 0 ? HEIGHT_PX : 0;
  const west = (slope & CORNER_BIT[3]!) !== 0 ? HEIGHT_PX : 0;
  return north * (1 - u) * (1 - v) + east * u * (1 - v) + south * u * v + west * (1 - u) * v;
}

/** Screen position of a point of the tile surface, in design px around the centre. */
export function groundSurfacePoint(slope: number, u: number, v: number): Point {
  return [(u - v) * (TILE_W / 2), (u + v - 1) * (TILE_H / 2) - groundLiftAt(slope, u, v)];
}

/**
 * The two skirt quads of one slope - the walls under the east-south and
 * south-west edges - in design px around the tile centre, bled by `bleed`.
 *
 * They are bled like the top faces and clamped by the same box, which is what
 * seals the vertical hairline where two neighbouring tiles' skirts meet at a
 * shared corner. The bottom edge needs no bleed of its own: the tile in FRONT
 * is drawn later along the (x + y) diagonal and its own top face bleeds
 * upwards over the joint.
 */
export function groundSkirts(slope: number, bleed = GROUND_SEAM_BLEED_PX): Point[][] {
  const quads: Point[][] = [];
  for (const [a, b] of [
    [1, 2],
    [2, 3],
  ] as const) {
    const from = cornerPoint(slope, a);
    const to = cornerPoint(slope, b);
    quads.push(
      bleedPolygon([from, to, [to[0], to[1] + HEIGHT_PX], [from[0], from[1] + HEIGHT_PX]], bleed),
    );
  }
  return quads;
}

// -------------------------------------------------------- per-tile variance

/**
 * Salt of the ground's value variance, so it draws independently of the
 * building body, the tree body and the tree jitter that share the one
 * `tileVariantSeed` avalanche.
 */
export const GROUND_VALUE_SALT = 0x47524e44;

/**
 * How far a tile's ground may be lightened or darkened. [share of value]
 *
 * VALUE only, never hue: SPEC.md 16.3 fixes the ten terrain tones and a
 * variance that moved the hue would be inventing an eleventh. Four per cent
 * is the band where a 1024-tile field stops reading as one painted surface
 * and starts reading as ground, while a single tile still cannot be told from
 * its neighbour on purpose - it is texture, not a checkerboard.
 */
export const GROUND_VALUE_SPREAD = 0.04;

/**
 * The value factor for one tile, deterministic from its coordinates.
 *
 * Bounded to `1 +- GROUND_VALUE_SPREAD` by construction, and drawn from the
 * same avalanche as every other render-side per-tile choice (D-205/D-209), so
 * it costs no new hashing and touches no RNG stream (Z3 untouched, and
 * `Math.random` is nowhere near the renderer).
 */
export function groundValueFactor(x: number, y: number): number {
  const seed = tileVariantSeed(x, y, GROUND_VALUE_SALT);
  return 1 + GROUND_VALUE_SPREAD * ((seed / 4294967296) * 2 - 1);
}

/**
 * The same factor as a Pixi sprite tint - a neutral grey that multiplies the
 * cell's own colours and therefore preserves the 16.3 hue exactly.
 *
 * This is a TINT rather than another atlas cell on purpose: the page has one
 * cell per (terrain, slope) and 256 px of the 4,096 px guarantee left, so a
 * variant dimension would cost a new page and a SPEC2 6.2 booking, while a
 * tint is a batcher uniform the terrain sprites were already paying for.
 */
export function groundValueTint(x: number, y: number): number {
  const level = Math.max(0, Math.min(255, Math.round(255 * groundValueFactor(x, y))));
  return (level << 16) | (level << 8) | level;
}

// ------------------------------------------------------------- the textures

/**
 * The grain a terrain wears, so a surface reads as a surface.
 *
 * One kind per terrain rather than one per cell: the kind says WHAT the
 * ground is made of and the atlas draws it, which keeps "what does farmland
 * look like" a single answer that the seasonal repaint inherits for free.
 */
export const GroundTexture = {
  /** Sparse dots only - what every terrain wore before this bundle. */
  Speckle: 0,
  /** Short blades leaning against the light: grass, marsh. */
  Tuft: 1,
  /** Parallel ploughed lines along the tile's +x axis: farmland. */
  Furrow: 2,
  /** Angular chips in two sizes: rock, coast shingle. */
  Scree: 3,
  /** Coarse mottling, bigger and fewer than a tuft: woodland floor. */
  Mottle: 4,
  /** Long shallow ripples across the tile: desert, snow drift. */
  Ripple: 5,
  /** Faint rectilinear joints: the made ground of a town. */
  Paving: 6,
} as const;
export type GroundTexture = (typeof GroundTexture)[keyof typeof GroundTexture];

/**
 * Which grain each terrain wears, indexed by `Terrain`. Water is deliberately
 * `Speckle`: its living cells are drawn by `drawWaterCell` from the greyscale
 * animation rows and D-164 owns them.
 */
const TEXTURE_BY_TERRAIN: readonly GroundTexture[] = [
  GroundTexture.Speckle, // water - D-164 draws the real thing
  GroundTexture.Scree, // coast shingle
  GroundTexture.Tuft, // grass
  GroundTexture.Furrow, // field
  GroundTexture.Mottle, // forest
  GroundTexture.Scree, // rock
  GroundTexture.Ripple, // snow
  GroundTexture.Ripple, // desert
  GroundTexture.Tuft, // marsh
  GroundTexture.Paving, // town ground
];

export function groundTextureFor(terrain: number): GroundTexture {
  return TEXTURE_BY_TERRAIN[terrain] ?? GroundTexture.Speckle;
}
