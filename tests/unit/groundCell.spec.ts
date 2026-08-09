import { describe, expect, it } from 'vitest';
import { TERRAIN_COLORS, WATER_DEEP } from '../../src/shared/palette';
import { SLOPE_COUNT, Terrain, TERRAIN_COUNT } from '../../src/sim/map/terrain';
import {
  GROUND_BOX_HALF_H,
  GROUND_BOX_HALF_W,
  GROUND_HEIGHT_UNIT,
  GROUND_LIGHT,
  GROUND_SEAM_BLEED_PX,
  GROUND_VALUE_SPREAD,
  GroundTexture,
  groundSkirts,
  groundTextureFor,
  groundTopFaces,
  groundTopOutline,
  groundValueFactor,
  groundValueTint,
  SKIRT_SE_SHADE,
  SKIRT_SW_SHADE,
  slopeFaces,
  TOP_FLAT_SHADE,
  TOP_RAMP_AWAY_SHADE,
} from '../../src/render/ground';
import { ATLAS_SCALE, drawTerrainCell, RAIL_INK, ROAD_INK } from '../../src/render/TerrainAtlas';

/**
 * The ground, measured.
 *
 * The owner's verdict on the shipped build was that large areas read as flat
 * untextured polygons with visible tile seams. Three of those words are
 * measurable and this file measures them: the SEAM is a geometric property of
 * two neighbouring cells, FLAT is the number of distinct values a cell puts
 * down, and the LIGHT is whether the top face and the skirts under it agree
 * about where it comes from. What no test can say is whether the result looks
 * like ground - that is stated in the report and left to a human at the
 * running game.
 */

// ------------------------------------------------------------- the palette

describe('the terrain palette against SPEC.md 16.3', () => {
  it('carries the eight tones the specification fixes, exactly', () => {
    // "Terrain: Wiese #6f9b58 - Acker #b09a4e - Wald #3f6b3a - Fels #8a8578 -
    //  Schnee #e8eef2 - Wueste #d6bc86 - Wasser flach #4a86a8 -
    //  Wasser tief #2c5a78 - Moor #5a6b4a"
    expect(TERRAIN_COLORS[Terrain.Grass]).toBe('#6f9b58');
    expect(TERRAIN_COLORS[Terrain.Field]).toBe('#b09a4e');
    expect(TERRAIN_COLORS[Terrain.Forest]).toBe('#3f6b3a');
    expect(TERRAIN_COLORS[Terrain.Rock]).toBe('#8a8578');
    expect(TERRAIN_COLORS[Terrain.Snow]).toBe('#e8eef2');
    expect(TERRAIN_COLORS[Terrain.Desert]).toBe('#d6bc86');
    expect(TERRAIN_COLORS[Terrain.Water]).toBe('#4a86a8');
    expect(TERRAIN_COLORS[Terrain.Marsh]).toBe('#5a6b4a');
    expect(WATER_DEEP).toBe('#2c5a78');
  });

  it('names the two terrains 16.3 does NOT fix, so neither is mistaken for spec', () => {
    // The simulation has ten terrains and the palette lists eight. Coast and
    // town ground have no entry in 16.3's terrain row at all, so both are the
    // palette's own - which is precisely why town ground was free to move in
    // D-217 and the road's "Beton" verge was not.
    expect(TERRAIN_COLORS[Terrain.Coast]).toBe('#cbb682');
    expect(TERRAIN_COLORS[Terrain.TownGround]).toBe('#8a775e');
    expect(TERRAIN_COLORS).toHaveLength(TERRAIN_COUNT);
  });
});

// ------------------------------------------ terrain against infrastructure

/**
 * Every ink the game paints a built thing with, by the name it carries in
 * the source. A terrain colour that EQUALS one of these makes that piece of
 * infrastructure invisible on that terrain, which is not a matter of taste:
 * it is the object and the ground it stands on painted with one brush.
 *
 * That is exactly what happened to the road (D-217). `ROAD_INK.verge` is
 * 16.3's "Beton" and town ground had borrowed the same hex, so a street's
 * kerb and graded verge were painted in the colour of the plot beside them
 * and the only terrain town roads ever run over was the one terrain the
 * road's edge could not be seen on.
 */
const INFRASTRUCTURE_INKS: ReadonlyArray<readonly [string, string]> = [
  ['ROAD_INK.verge', ROAD_INK.verge],
  ['ROAD_INK.asphalt', ROAD_INK.asphalt],
  ['ROAD_INK.crown', ROAD_INK.crown],
  ['ROAD_INK.mark', ROAD_INK.mark],
  ['RAIL_INK.ballast', RAIL_INK.ballast],
  ['RAIL_INK.sleeper', RAIL_INK.sleeper],
  ['RAIL_INK.rail', RAIL_INK.rail],
];

/** Relative luminance of a CSS hex, WCAG 2.1 definition. */
function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const s = ((value >> shift) & 0xff) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** WCAG contrast ratio, 1 for two identical colours. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('no terrain is painted in an infrastructure ink', () => {
  it('has no exact collision anywhere in the two tables', () => {
    // The pin. One equality here and one piece of the built world disappears
    // on one terrain, silently, in every zoom and every save thumbnail.
    const collisions: string[] = [];
    for (const [terrainName, terrain] of Object.entries(Terrain)) {
      for (const [inkName, ink] of INFRASTRUCTURE_INKS) {
        if (TERRAIN_COLORS[terrain] === ink) {
          collisions.push(`${terrainName} == ${inkName} (${ink})`);
        }
      }
    }
    expect(collisions, 'a terrain colour equals an infrastructure ink').toEqual([]);
    // The deep-water tone is a terrain colour in everything but the array.
    for (const [name, ink] of INFRASTRUCTURE_INKS) expect(WATER_DEEP, name).not.toBe(ink);
  });

  it('separates the street from the plot it runs through by VALUE', () => {
    // Hue alone would fail the colour-blind mode of 17.4, which does not
    // repaint terrain at all: the only channel every deficiency keeps is
    // lightness, so the boundary a town street draws has to be a value step.
    // Measured 2.082 against the 1.000 of the collision this floor replaces.
    const town = TERRAIN_COLORS[Terrain.TownGround]!;
    expect(contrastRatio(town, ROAD_INK.verge)).toBeGreaterThan(1.6);
    expect(contrastRatio(town, ROAD_INK.asphalt)).toBeGreaterThan(1.6);
    // And the kerb is the BRIGHT term of the sandwich, between the dark
    // carriageway and the mid-value plot - which is how a kerb reads.
    expect(relativeLuminance(ROAD_INK.verge)).toBeGreaterThan(relativeLuminance(town));
    expect(relativeLuminance(town)).toBeGreaterThan(relativeLuminance(ROAD_INK.asphalt));
  });
});

// --------------------------------------------------------------- the light

describe('the one north-west light', () => {
  it('is a unit vector with no north-south component', () => {
    const length = Math.hypot(GROUND_LIGHT[0], GROUND_LIGHT[1], GROUND_LIGHT[2]);
    expect(length).toBeCloseTo(1, 12);
    // -x is up-left on screen in the 16.1 projection, so a light with a
    // negative x, a zero y and a positive z is fixed north-west and nothing
    // else. A non-zero y would tip it towards one of the two lower faces.
    expect(GROUND_LIGHT[0]).toBeLessThan(0);
    expect(GROUND_LIGHT[1]).toBe(0);
    expect(GROUND_LIGHT[2]).toBeGreaterThan(0);
  });

  it('reproduces the three shades the cell has drawn since M1', () => {
    // The light is SOLVED from these, so the equations have to come back out.
    const ambient = SKIRT_SW_SHADE;
    const diffuse = Math.hypot(SKIRT_SW_SHADE - SKIRT_SE_SHADE, TOP_FLAT_SHADE - SKIRT_SW_SHADE);
    expect(ambient + diffuse * GROUND_LIGHT[0]).toBeCloseTo(SKIRT_SE_SHADE, 12);
    expect(ambient + diffuse * GROUND_LIGHT[1]).toBeCloseTo(SKIRT_SW_SHADE, 12);
    expect(ambient + diffuse * GROUND_LIGHT[2]).toBeCloseTo(TOP_FLAT_SHADE, 12);
  });

  it('measures a height step against the tile as the projection draws it', () => {
    // 16 px of lift over a tile edge of hypot(32, 16) = 35.78 px.
    expect(GROUND_HEIGHT_UNIT).toBeCloseTo(0.4472, 4);
  });
});

// -------------------------------------------------------------- the slopes

/** The five-value table this bundle replaced: `1 + tilt * 0.07`. */
function legacyTopShade(slope: number): number {
  const lift = (bit: number): number => ((slope & bit) !== 0 ? 1 : 0);
  return 1 + (lift(8) + lift(1) - lift(2) - lift(4)) * 0.07;
}

describe('the sixteen slope shapes', () => {
  it('keeps flat ground at exactly the shipped shade', () => {
    const flat = slopeFaces(0);
    expect(flat.first).toBe(TOP_FLAT_SHADE);
    expect(flat.second).toBe(TOP_FLAT_SHADE);
  });

  it('lights the ramps the way the skirts under them are lit', () => {
    // A uniform one-level ramp descending towards the north-west (raised east
    // AND south corners) faces the light and must be the brightest ground on
    // the map; the opposite ramp (raised north and west) must be the darkest.
    // The old table had these two EXACTLY the wrong way round - it drew the
    // lit ramp at 0.86 and the shaded one at 1.14 - which is why a hillside
    // contradicted the very skirt drawn under it.
    const towardsLight = slopeFaces(2 | 4);
    const awayFromLight = slopeFaces(1 | 8);
    expect(towardsLight.first).toBeGreaterThan(TOP_FLAT_SHADE);
    expect(awayFromLight.first).toBeCloseTo(TOP_RAMP_AWAY_SHADE, 12);
    expect(legacyTopShade(2 | 4)).toBeLessThan(legacyTopShade(1 | 8));
    expect(towardsLight.first).toBeGreaterThan(awayFromLight.first);
  });

  it('keeps the contrast of the artwork it replaces', () => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      const faces = slopeFaces(slope);
      min = Math.min(min, faces.first, faces.second);
      max = Math.max(max, faces.first, faces.second);
    }
    // Measured 0.8385 .. 1.0650 against the old table's 0.86 .. 1.14. The
    // darkest is anchored on the old extreme; the bright end compresses
    // because a Lambert response saturates where a linear tilt count did not.
    expect(min).toBeCloseTo(0.8385, 4);
    expect(max).toBeCloseTo(1.065, 4);
  });

  it('tells the sixteen shapes apart where one flat fill could not', () => {
    const signatures = new Set<string>();
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      const faces = slopeFaces(slope);
      signatures.add(
        `${faces.foldNorthSouth ? 'NS' : 'EW'}:${faces.first.toFixed(4)}:${faces.second.toFixed(4)}`,
      );
    }
    // Fourteen distinct (fold, shade, shade) signatures against the five
    // values the whole table used to hold. The two that still coincide differ
    // in SHAPE - which corner is low - and shape is the information (D-117).
    expect(signatures.size).toBe(14);
  });

  it('gives the two diagonal slopes a fold they did not have', () => {
    // North+south raised and east+west raised both counted tilt = 0, so they
    // were drawn in exactly the colour of flat ground. They are saddles: two
    // faces, and now two shades.
    for (const slope of [1 | 4, 2 | 8]) {
      expect(legacyTopShade(slope)).toBe(1);
      const faces = slopeFaces(slope);
      expect(Math.abs(faces.first - faces.second)).toBeGreaterThan(0.15);
    }
  });

  it('lays the fold along the higher diagonal, so a saddle is a ridge', () => {
    expect(slopeFaces(1 | 4).foldNorthSouth).toBe(true);
    expect(slopeFaces(2 | 8).foldNorthSouth).toBe(false);
    // A flat tile folds north-south and both halves come out identical, which
    // is what lets the atlas draw it as one polygon with no fold at all.
    expect(slopeFaces(0).foldNorthSouth).toBe(true);
  });
});

// ------------------------------------------------------------- the seams

type Point = readonly [number, number];

function insideConvex(points: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const side = cross > 0 ? 1 : -1;
    if (sign === 0) sign = side;
    else if (sign !== side) return false;
  }
  return true;
}

/** The polygons one terrain cell paints, for a slope. */
function cellPolygons(slope: number): Point[][] {
  const faces = slopeFaces(slope);
  const tops = faces.first === faces.second ? [groundTopOutline(slope)] : groundTopFaces(slope);
  return [...tops, ...groundSkirts(slope)];
}

describe('the tile seam', () => {
  it('paints nothing outside the box both atlas pages reserve', () => {
    // The detail page clips every cell to its frame and the base page does
    // not, so a cell that overran would draw one picture at zoom 4 and
    // another at zoom 1 - the defect D-212 measured at 6,240 px on the road
    // cell. Measured here: 0 px, on all sixteen slopes.
    let worst = 0;
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      for (const polygon of cellPolygons(slope)) {
        for (const [x, y] of polygon) {
          worst = Math.max(worst, Math.abs(x) - GROUND_BOX_HALF_W, Math.abs(y) - GROUND_BOX_HALF_H);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it('covers every point of every face edge to the full bleed', () => {
    // Two abutting anti-aliased polygons composite to three quarters of a
    // boundary pixel and let a quarter of the background through; the cure is
    // that ONE of the two covers it whole. Sampled every 2 % along all four
    // edges of all sixteen slopes, in eight steps out to the full bleed, and
    // the union of the faces has to hold every sample that is still inside
    // the cell box.
    const steps = 8;
    let checked = 0;
    for (let slope = 0; slope < SLOPE_COUNT; slope++) {
      const outline = groundTopOutline(slope, 0);
      const faces = slopeFaces(slope);
      const parts =
        faces.first === faces.second ? [groundTopOutline(slope)] : groundTopFaces(slope);
      for (let edge = 0; edge < 4; edge++) {
        const a = outline[edge]!;
        const b = outline[(edge + 1) % 4]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length < 1e-9) continue;
        let nx = dy / length;
        let ny = -dx / length;
        if (nx * (a[0] + b[0]) + ny * (a[1] + b[1]) < 0) {
          nx = -nx;
          ny = -ny;
        }
        for (let t = 0.02; t < 1; t += 0.02) {
          for (let step = 1; step <= steps; step++) {
            const reach = (GROUND_SEAM_BLEED_PX * step) / steps;
            const x = a[0] + dx * t + nx * reach;
            const y = a[1] + dy * t + ny * reach;
            if (Math.abs(x) > GROUND_BOX_HALF_W || Math.abs(y) > GROUND_BOX_HALF_H) break;
            checked++;
            expect(parts.some((part) => insideConvex(part, x, y))).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('bleeds by three quarters of a screen pixel at zoom 1', () => {
    // Design px are screen px at the zoom each atlas page is drawn for, and a
    // boundary pixel needs half of one to be covered whole. 0.75 keeps the
    // margin and is still under a pixel at every zoom the base page serves.
    expect(GROUND_SEAM_BLEED_PX).toBeGreaterThanOrEqual(0.5);
    expect(GROUND_SEAM_BLEED_PX).toBeLessThan(1);
  });
});

// ----------------------------------------------------------- the variance

describe('the per-tile value variance', () => {
  it('is deterministic, bounded and centred', () => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let sum = 0;
    const samples = 200;
    for (let x = 0; x < samples; x++) {
      for (let y = 0; y < samples; y++) {
        const factor = groundValueFactor(x, y);
        expect(groundValueFactor(x, y)).toBe(factor);
        min = Math.min(min, factor);
        max = Math.max(max, factor);
        sum += factor;
      }
    }
    expect(min).toBeGreaterThanOrEqual(1 - GROUND_VALUE_SPREAD);
    expect(max).toBeLessThanOrEqual(1 + GROUND_VALUE_SPREAD);
    // Measured 0.9600 .. 1.0400 with a mean of 0.99995 over 40,000 tiles: the
    // variance darkens and lightens in equal measure, so a plain does not
    // drift off the 16.3 tone as a whole.
    expect(sum / (samples * samples)).toBeCloseTo(1, 3);
  });

  it('gives neighbouring tiles different values and is not a lattice', () => {
    expect(groundValueFactor(12, 34)).not.toBe(groundValueFactor(13, 34));
    expect(groundValueFactor(12, 34)).not.toBe(groundValueFactor(12, 35));
    expect(groundValueFactor(12, 34)).not.toBe(groundValueFactor(34, 12));
  });

  it('is a pure grey, so the 16.3 hue survives the tint exactly', () => {
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        const tint = groundValueTint(x, y);
        const r = (tint >> 16) & 0xff;
        const g = (tint >> 8) & 0xff;
        const b = tint & 0xff;
        expect(g).toBe(r);
        expect(b).toBe(r);
        expect(r).toBeGreaterThanOrEqual(Math.floor(255 * (1 - GROUND_VALUE_SPREAD)));
        expect(r).toBeLessThanOrEqual(255);
      }
    }
  });
});

// ------------------------------------------------------------ the textures

describe('the surface grain', () => {
  it('gives the four terrains that cover a temperate map four different grains', () => {
    // Measured on the default temperate 1024 map (seed 4,711): grass 25.7 %,
    // rock 18.6 %, forest 16.5 %, field 3.9 % of all tiles. Four grains, so
    // no two of them read as the same painted surface.
    const kinds = [Terrain.Grass, Terrain.Rock, Terrain.Forest, Terrain.Field].map((terrain) =>
      groundTextureFor(terrain),
    );
    expect(new Set(kinds).size).toBe(4);
    expect(groundTextureFor(Terrain.Field)).toBe(GroundTexture.Furrow);
    expect(groundTextureFor(Terrain.Rock)).toBe(GroundTexture.Scree);
  });

  it('leaves the living water of D-164 alone', () => {
    expect(groundTextureFor(Terrain.Water)).toBe(GroundTexture.Speckle);
  });

  it('has a grain for every terrain the simulation can make', () => {
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      expect(groundTextureFor(terrain)).toBeGreaterThanOrEqual(0);
    }
  });
});

// -------------------------------------------------------------- the budget

/**
 * A 2D context that paints nothing and counts what it was asked to paint.
 *
 * The atlas is built once at startup against `ATLAS_BUILD_BUDGET_MS`, and
 * that budget can only be timed in a browser (README's own procedure for the
 * two frame-rate budgets). What CAN be held headless is the work: a cell that
 * quietly grew from twenty-five paint operations to two hundred would be a
 * regression of multiples, which is exactly what the D-136 tripwires catch.
 */
class CountingContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = '';
  lineDashOffset = 0;
  globalAlpha = 1;
  paints = 0;
  clips = 0;
  segments = 0;

  beginPath(): void {}
  moveTo(): void {
    this.segments++;
  }
  lineTo(): void {
    this.segments++;
  }
  closePath(): void {}
  save(): void {}
  restore(): void {}
  clip(): void {
    this.clips++;
  }
  fill(): void {
    this.paints++;
  }
  stroke(): void {
    this.paints++;
  }
  fillRect(): void {
    this.paints++;
  }
  ellipse(): void {
    this.segments++;
  }
  arc(): void {
    this.segments++;
  }
  rect(): void {
    this.segments++;
  }
  setLineDash(): void {}
}

describe('the atlas build budget', () => {
  it('draws every terrain cell inside its booked paint count', () => {
    // Booked, not discovered: the ceiling is what the grain tables in
    // TerrainAtlas can produce, and a texture that doubled would fail here
    // rather than on somebody's startup. Measured worst case is a folded
    // slope, which draws its grain once per half.
    let worst = 0;
    let worstCell = '';
    let total = 0;
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      for (let slope = 0; slope < SLOPE_COUNT; slope++) {
        const ctx = new CountingContext();
        drawTerrainCell(ctx as unknown as CanvasRenderingContext2D, 0, 0, terrain, slope);
        total += ctx.paints;
        if (ctx.paints > worst) {
          worst = ctx.paints;
          worstCell = `terrain ${terrain} slope ${slope}`;
        }
        expect(ctx.clips).toBeLessThanOrEqual(2);
      }
    }
    expect(worst, worstCell).toBeLessThanOrEqual(CELL_PAINT_CEILING);
    expect(total).toBeLessThanOrEqual(CELL_PAINT_CEILING * TERRAIN_COUNT * SLOPE_COUNT);
  });

  it('costs the same per cell on both pages', () => {
    // The detail page runs the SAME function under a context scale, so its
    // per-cell work is identical and its cost is the rasterised area alone.
    const base = new CountingContext();
    drawTerrainCell(base as unknown as CanvasRenderingContext2D, 0, 0, Terrain.Grass, 0);
    const again = new CountingContext();
    drawTerrainCell(again as unknown as CanvasRenderingContext2D, 128, 384, Terrain.Grass, 0);
    expect(again.paints).toBe(base.paints);
    expect(ATLAS_SCALE).toBe(2);
  });
});

/**
 * Paint operations one terrain cell may cost. [count]
 *
 * The cell drew **25** before this bundle - three flat polygon fills and 22
 * separate `fillRect` speckles - with no texture, no fold and no seam bleed.
 * It draws **4 to 10** now, because every grain is batched into ONE path per
 * ink: a whole page of terrain went 4,000 -> 1,100 operations while the
 * artwork grew. 16 is the headroom a grain table may still take, a tripwire
 * in the D-136 sense rather than a target.
 */
const CELL_PAINT_CEILING = 16;
