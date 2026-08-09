import { describe, expect, it } from 'vitest';
import {
  ATLAS_SCALE,
  CELL_HEADROOM_STEPS,
  CELL_SKIRT_STEPS,
  drawRoadCell,
  ROAD_INK,
} from '../../src/render/TerrainAtlas';
import { TERRAIN_COLORS } from '../../src/shared/palette';
import { Terrain } from '../../src/sim/map/terrain';
import { RoadBit } from '../../src/sim/town/types';

/**
 * The road cell, measured on the bitmap it actually paints.
 *
 * Everything else about the atlas is tested as layout - where a frame sits,
 * how big the page is - because the drawing needs a canvas. A road is the one
 * cell where the LAYOUT is not the question: the defect the owner reported
 * ("Straßen sind nicht zusammenhängend") lived entirely inside the pixels of
 * a correctly placed frame. Two of the four arm vectors pointed along the
 * wrong tile axis and all four were a whole tile step instead of a half, so a
 * straight road came out as one slab per tile, each running ACROSS the road
 * and none of them touching the next.
 *
 * So this file rasterises the shipped `drawRoadCell` with a small exact
 * rasteriser - no anti-aliasing, pixel centres only, which is all the
 * assertions below need - and measures the properties that make a road a
 * ribbon rather than a row of slabs. They are properties of NEIGHBOURING
 * cells, which is why a single-cell eyeball never caught this.
 */

const TILE_W = 64 * ATLAS_SCALE;
const TILE_H = 32 * ATLAS_SCALE;
const STEP = 16 * ATLAS_SCALE;
const CELL_W = TILE_W;
const CELL_TOP = STEP * CELL_HEADROOM_STEPS;
const CELL_H = TILE_H + CELL_TOP + STEP * CELL_SKIRT_STEPS;

/** Designed carriageway width: `ROAD_ASPHALT_WIDTH_PX` times the page scale. */
const CARRIAGEWAY_PX = 8.4 * ATLAS_SCALE;
/** Designed marking period: half an arm, an arm being half a tile step. */
const ARM_LENGTH = Math.hypot(TILE_W / 4, TILE_H / 4);
const MARK_PERIOD = ARM_LENGTH / 2;

/**
 * Tile step per RoadBit BIT POSITION, in the order the simulation fixes.
 * The atlas has to agree with this table and nothing enforced it before.
 */
const BIT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** Screen offset from a tile centre to the midpoint of a shared edge. */
function edgeMidpoint(step: readonly [number, number]): readonly [number, number] {
  return [((step[0] - step[1]) * TILE_W) / 4, ((step[0] + step[1]) * TILE_H) / 4];
}

/** Screen offset from a tile centre to the NEIGHBOUR's tile centre. */
function centreStep(step: readonly [number, number]): readonly [number, number] {
  return [((step[0] - step[1]) * TILE_W) / 2, ((step[0] + step[1]) * TILE_H) / 2];
}

// ----------------------------------------------------------- the rasteriser

/**
 * The subset of a 2D context `drawRoadCell` uses, rasterised exactly: a
 * stroke is a butt-capped rectangle around its segment, a fill is the disc of
 * the last `arc`, and a pixel belongs to whichever pass painted it last. No
 * blending is needed - the cell never sets an alpha.
 */
class Raster {
  readonly width: number;
  readonly height: number;
  /** One CSS hex per pixel, empty where the ground shows through. */
  private readonly ink: string[];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineDashOffset = 0;
  private dash: readonly number[] = [];
  private readonly segments: [number, number, number, number][] = [];
  private circle: [number, number, number] | null = null;
  private cursor: [number, number] | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ink = new Array<string>(width * height).fill('');
  }

  setLineDash(pattern: readonly number[]): void {
    this.dash = pattern;
  }

  beginPath(): void {
    this.segments.length = 0;
    this.circle = null;
    this.cursor = null;
  }

  moveTo(x: number, y: number): void {
    this.cursor = [x, y];
  }

  lineTo(x: number, y: number): void {
    if (this.cursor !== null) this.segments.push([this.cursor[0], this.cursor[1], x, y]);
    this.cursor = [x, y];
  }

  arc(x: number, y: number, radius: number): void {
    this.circle = [x, y, radius];
  }

  fill(): void {
    if (this.circle === null) return;
    const [cx, cy, r] = this.circle;
    for (let py = Math.floor(cy - r) - 1; py <= Math.ceil(cy + r) + 1; py++) {
      for (let px = Math.floor(cx - r) - 1; px <= Math.ceil(cx + r) + 1; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.paint(px, py, this.fillStyle);
      }
    }
  }

  stroke(): void {
    const period = this.dash.reduce((a, b) => a + b, 0);
    for (const [ax, ay, bx, by] of this.segments) {
      if (period <= 0) {
        this.band(ax, ay, bx, by);
        continue;
      }
      const total = Math.hypot(bx - ax, by - ay);
      // The dash pattern begins `lineDashOffset` into itself at distance zero.
      let phase = ((this.lineDashOffset % period) + period) % period;
      let index = 0;
      while (phase >= this.dash[index]!) {
        phase -= this.dash[index]!;
        index = (index + 1) % this.dash.length;
      }
      let on = index % 2 === 0;
      let remaining = this.dash[index]! - phase;
      let walked = 0;
      while (walked < total) {
        const step = Math.min(remaining, total - walked);
        if (on) {
          const t0 = walked / total;
          const t1 = (walked + step) / total;
          this.band(
            ax + (bx - ax) * t0,
            ay + (by - ay) * t0,
            ax + (bx - ax) * t1,
            ay + (by - ay) * t1,
          );
        }
        walked += step;
        remaining -= step;
        if (remaining <= 1e-9) {
          index = (index + 1) % this.dash.length;
          remaining = this.dash[index]!;
          on = !on;
        }
      }
    }
  }

  /** What painted this pixel, or '' for bare ground. */
  at(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return '';
    return this.ink[y * this.width + x]!;
  }

  /** How many painted pixels fall outside the given rectangle. */
  paintedOutside(left: number, top: number, width: number, height: number): number {
    let count = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.ink[y * this.width + x] === '') continue;
        if (x < left || y < top || x >= left + width || y >= top + height) count++;
      }
    }
    return count;
  }

  private band(ax: number, ay: number, bx: number, by: number): void {
    const half = this.lineWidth / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    for (
      let py = Math.floor(Math.min(ay, by) - half) - 1;
      py <= Math.ceil(Math.max(ay, by) + half) + 1;
      py++
    ) {
      for (
        let px = Math.floor(Math.min(ax, bx) - half) - 1;
        px <= Math.ceil(Math.max(ax, bx) + half) + 1;
        px++
      ) {
        const x = px + 0.5;
        const y = py + 0.5;
        const t = length2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / length2;
        if (t < 0 || t > 1) continue;
        const ox = x - (ax + dx * t);
        const oy = y - (ay + dy * t);
        if (ox * ox + oy * oy <= half * half) this.paint(px, py, this.strokeStyle);
      }
    }
  }

  private paint(x: number, y: number, colour: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.ink[y * this.width + x] = colour;
  }
}

const CARRIAGEWAY = new Set<string>([ROAD_INK.asphalt, ROAD_INK.crown, ROAD_INK.mark]);

/** Draw one cell into a raster with `margin` of clear space around it. */
function cell(roadBits: number, margin: number): Raster {
  const raster = new Raster(CELL_W + 2 * margin, CELL_H + 2 * margin);
  drawRoadCell(raster as unknown as CanvasRenderingContext2D, margin, margin, roadBits);
  return raster;
}

/** Centre of the tile diamond inside a cell placed at (margin, margin). */
function centreOf(margin: number): readonly [number, number] {
  return [margin + TILE_W / 2, margin + CELL_TOP + TILE_H / 2];
}

// ------------------------------------------------------------------- tests

describe('the road cell agrees with the simulation about which way is which', () => {
  it('pins the RoadBit order the arm table is indexed by', () => {
    expect([RoadBit.West, RoadBit.East, RoadBit.North, RoadBit.South]).toEqual([1, 2, 4, 8]);
    expect(BIT_STEPS[0]).toEqual([-1, 0]);
    expect(BIT_STEPS[3]).toEqual([0, 1]);
  });

  it('reaches the shared edge of every connected direction', () => {
    // THE regression guard. A carriageway that stops short of the shared edge
    // - or runs off along the other tile axis, which is what it used to do -
    // cannot meet its neighbour's, and the road reads as a slab per tile.
    const margin = 48;
    const [cx, cy] = centreOf(margin);
    for (let roadBits = 0; roadBits < 16; roadBits++) {
      const raster = cell(roadBits, margin);
      for (let bit = 0; bit < 4; bit++) {
        const [ex, ey] = edgeMidpoint(BIT_STEPS[bit]!);
        const ink = raster.at(Math.round(cx + ex), Math.round(cy + ey));
        if ((roadBits & (1 << bit)) !== 0) {
          expect(
            CARRIAGEWAY.has(ink),
            `bits ${roadBits}, bit ${bit}: ${ink || 'bare ground'}`,
          ).toBe(true);
        } else {
          // And nowhere else: an arm on an unconnected side is the transposed
          // table's own signature.
          expect(ink, `bits ${roadBits}, bit ${bit} is not connected`).toBe('');
        }
      }
    }
  });

  it('keeps every cell inside its own atlas cell', () => {
    // The base page draws the sixteen road cells side by side WITHOUT a clip,
    // so a cell that paints past its rectangle lands in the next roadBits
    // column of the page and travels to the screen as somebody else's road.
    const margin = 48;
    for (let roadBits = 0; roadBits < 16; roadBits++) {
      const raster = cell(roadBits, margin);
      expect(raster.paintedOutside(margin, margin, CELL_W, CELL_H), `bits ${roadBits}`).toBe(0);
    }
  });
});

describe('two neighbouring cells make one ribbon', () => {
  /**
   * Draw a tile and its neighbour in painter order (the diagonal further from
   * the camera first, as MapView does), at the world offset the projection
   * gives them, and sample the line between the two tile centres.
   */
  function pair(bit: number): {
    raster: Raster;
    from: readonly [number, number];
    to: readonly [number, number];
  } {
    const margin = 96;
    const step = centreStep(BIT_STEPS[bit]!);
    const raster = new Raster(CELL_W + 2 * margin, CELL_H + 2 * margin);
    const opposite = bit === 0 ? 1 : bit === 1 ? 0 : bit === 2 ? 3 : 2;
    const near: [number, number][] = [
      [margin, margin],
      [margin + step[0], margin + step[1]],
    ];
    // Both tiles are THROUGH roads on this axis, which is what a road between
    // two towns is - and what carries a centre line (a stub carries none).
    const through = (1 << bit) | (1 << opposite);
    const bits = [through, through];
    // Painter order: smaller (x + y) first. A negative step is the nearer tile.
    const order = step[1] < 0 ? [1, 0] : [0, 1];
    for (const which of order) {
      drawRoadCell(
        raster as unknown as CanvasRenderingContext2D,
        near[which]![0],
        near[which]![1],
        bits[which]!,
      );
    }
    const [cx, cy] = centreOf(margin);
    return { raster, from: [cx, cy], to: [cx + step[0], cy + step[1]] };
  }

  it('has carriageway at every point between the two tile centres', () => {
    for (let bit = 0; bit < 4; bit++) {
      const { raster, from, to } = pair(bit);
      const samples = 200;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const ink = raster.at(
          Math.round(from[0] + (to[0] - from[0]) * t),
          Math.round(from[1] + (to[1] - from[1]) * t),
        );
        expect(
          CARRIAGEWAY.has(ink),
          `bit ${bit} at ${(t * 100).toFixed(0)} %: ${ink || 'bare'}`,
        ).toBe(true);
      }
    }
  });

  it('keeps the carriageway one width wide across the boundary', () => {
    // Measured perpendicular to the road, at the shared edge and a quarter of
    // an arm either side of it. A bend that notched its outside corner or a
    // half-arm that stopped short would show up as a narrow reading here.
    for (let bit = 0; bit < 4; bit++) {
      const { raster, from, to } = pair(bit);
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      for (const along of [0.375, 0.5, 0.625]) {
        let width = 0;
        for (let offset = -20; offset <= 20; offset += 0.25) {
          const x = Math.round(from[0] + ux * length * along - uy * offset);
          const y = Math.round(from[1] + uy * length * along + ux * offset);
          if (CARRIAGEWAY.has(raster.at(x, y))) width += 0.25;
        }
        expect(width, `bit ${bit} at ${(along * 100).toFixed(0)} % of the step`).toBeGreaterThan(
          CARRIAGEWAY_PX - 1.5,
        );
        expect(width, `bit ${bit} at ${(along * 100).toFixed(0)} % of the step`).toBeLessThan(
          CARRIAGEWAY_PX + 1.5,
        );
      }
    }
  });

  it('runs the centre line THROUGH the boundary in one rhythm', () => {
    // Four marking periods fit between two tile centres, two on each side of
    // the shared edge, and the dashes have to be evenly spaced across it - a
    // marking that restarted at the tile edge is the classic tell that a road
    // is drawn tile by tile.
    for (let bit = 0; bit < 4; bit++) {
      const { raster, from, to } = pair(bit);
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      const starts: number[] = [];
      let previous = false;
      for (let s = 0; s <= length; s += 0.25) {
        // The marking is 1.8 atlas px wide and this rasteriser has no
        // anti-aliasing, so a sample exactly on the centre line steps off the
        // band at some angles. Ask whether a dash is HERE, across the width.
        let lit = false;
        for (let offset = -1.5; offset <= 1.5 && !lit; offset += 0.5) {
          lit =
            raster.at(
              Math.round(from[0] + ux * s - uy * offset),
              Math.round(from[1] + uy * s + ux * offset),
            ) === ROAD_INK.mark;
        }
        if (lit && !previous) starts.push(s);
        previous = lit;
      }
      expect(starts.length, `bit ${bit}: dashes between two tile centres`).toBe(4);
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i]! - starts[i - 1]!, `bit ${bit}: dash ${i} spacing`).toBeGreaterThan(
          MARK_PERIOD - 1,
        );
        expect(starts[i]! - starts[i - 1]!, `bit ${bit}: dash ${i} spacing`).toBeLessThan(
          MARK_PERIOD + 1,
        );
      }
    }
  });
});

describe('a junction is a junction', () => {
  const margin = 48;

  it('fills the centre of a three-way and a four-way', () => {
    // The round join at the tile centre: without it the arms are separate
    // rectangles and the inside of every corner is a notch of bare ground.
    const [cx, cy] = centreOf(margin);
    for (const roadBits of [7, 11, 13, 14, 15]) {
      const raster = cell(roadBits, margin);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const ink = raster.at(Math.round(cx + dx), Math.round(cy + dy));
          expect(CARRIAGEWAY.has(ink), `bits ${roadBits} at (${dx}, ${dy})`).toBe(true);
        }
      }
    }
  });

  it('carries no centre line where the road does not run through', () => {
    for (const roadBits of [0, 1, 2, 4, 8, 7, 11, 13, 14, 15]) {
      const raster = cell(roadBits, margin);
      let marks = 0;
      for (let y = 0; y < raster.height; y++) {
        for (let x = 0; x < raster.width; x++) if (raster.at(x, y) === ROAD_INK.mark) marks++;
      }
      expect(marks, `bits ${roadBits}`).toBe(0);
    }
    // A through road and a bend both get one.
    for (const roadBits of [3, 12, 5, 9]) {
      const raster = cell(roadBits, margin);
      let marks = 0;
      for (let y = 0; y < raster.height; y++) {
        for (let x = 0; x < raster.width; x++) if (raster.at(x, y) === ROAD_INK.mark) marks++;
      }
      expect(marks, `bits ${roadBits}`).toBeGreaterThan(0);
    }
  });

  it('gives an isolated road tile a patch of surface to stand on', () => {
    // A road stop on a bare tile (D-210) would otherwise stand on grass.
    const raster = cell(0, margin);
    const [cx, cy] = centreOf(margin);
    expect(CARRIAGEWAY.has(raster.at(Math.round(cx), Math.round(cy)))).toBe(true);
    expect(raster.at(Math.round(cx + TILE_W / 4), Math.round(cy + TILE_H / 4))).toBe('');
  });
});

describe('the street is bounded against the plot beside it', () => {
  const margin = 48;

  /** Pixels of each of the four inks in one cell. */
  function inkCounts(roadBits: number): { verge: number; carriageway: number } {
    const raster = cell(roadBits, margin);
    let verge = 0;
    let carriageway = 0;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        const ink = raster.at(x, y);
        if (ink === ROAD_INK.verge) verge++;
        else if (CARRIAGEWAY.has(ink)) carriageway++;
      }
    }
    return { verge, carriageway };
  }

  it('leaves a kerb band showing on every shape a town street takes', () => {
    // The verge goes down widest and the carriageway is painted over most of
    // it, so what survives is the kerb: 1.3 design px each side. This is the
    // band D-217 is about - it exists in the pixels and always did, and until
    // D-217 it was painted in the town ground's own colour.
    for (const roadBits of [0b0011, 0b1010, 0b1111, 0b0010]) {
      const { verge, carriageway } = inkCounts(roadBits);
      expect(verge, `bits ${roadBits}: kerb`).toBeGreaterThan(250);
      expect(carriageway, `bits ${roadBits}: carriageway`).toBeGreaterThan(700);
      // A kerb is an edge, not a surface: it is a fraction of the road.
      expect(verge, `bits ${roadBits}: kerb share`).toBeLessThan(carriageway / 2);
    }
  });

  it('paints that kerb in something the town ground is not', () => {
    // The regression guard for the defect itself. A road only ever runs over
    // town ground inside a town, so this is the one pair whose collision is
    // invisible everywhere the player looks at streets and houses together.
    expect(ROAD_INK.verge).not.toBe(TERRAIN_COLORS[Terrain.TownGround]);
    // And it is not any of the OTHER terrains a road crosses either.
    for (const terrain of [
      Terrain.Grass,
      Terrain.Field,
      Terrain.Rock,
      Terrain.Snow,
      Terrain.Desert,
      Terrain.Marsh,
      Terrain.Coast,
      Terrain.Forest,
    ]) {
      const ground = TERRAIN_COLORS[terrain]!;
      expect(ROAD_INK.verge, `verge on terrain ${terrain}`).not.toBe(ground);
      expect(ROAD_INK.asphalt, `asphalt on terrain ${terrain}`).not.toBe(ground);
    }
  });
});
