import { TERRAIN_COLORS, WATER_DEEP } from '../shared/palette';
import { SEA_LEVEL } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { SlopeBit, Terrain } from '../sim/map/terrain';

/**
 * The pure half of the living water of SPEC2 M12 (D-164): which of the two
 * 16.3 tones a water tile shows, which atlas row the animation reads for a
 * given frame counter, and where the coastline foam goes. Everything here is
 * a function of the tile layers and plain numbers - no Pixi, no canvas, no
 * state - so the selection logic is unit-tested headless while the texture
 * work stays in MapView (the chunks.ts pattern).
 *
 * The animation is keyed off MapView's blink counter - the deterministic
 * frame counter the deadlock marker already blinks on, the counter SPEC2 M12
 * names - never the wall clock (Fehlerkatalog 39). Z1 holds: everything
 * below is a pure function of snapshot-side layers plus a render-local
 * counter, and the simulation knows none of it.
 */

/**
 * Water animation frames, baked as atlas rows on the BASE page. [rows]
 * Origin: SPEC2 M12 orders 2-4 frame-swapped rows; three animation rows plus
 * the foam row spend exactly the four-row M12 booking of the SPEC2 6.2
 * ledger ("+4 Wasser-Zeilen", Seite 0).
 */
export const WATER_FRAME_COUNT = 3;

/**
 * Render frames between two animation phases. [frames] Origin: roughly half
 * a second at 60 fps - the blink counter advances once per rendered frame,
 * and a slow cadence is what keeps the shimmer a shimmer rather than a
 * strobe (SPEC2 M12: "subtle").
 */
export const WATER_PHASE_FRAMES = 30;

/**
 * Phase order: a ping-pong over the three rows. Consecutive phases always
 * differ by exactly one row - including across the loop point - so no swap
 * ever jumps two frames at once.
 */
export const WATER_PHASE_SEQUENCE: readonly number[] = [0, 1, 2, 1];

/**
 * How far below the sea surface a tile's HIGHEST corner must lie to read as
 * deep water. [height levels] Origin: SPEC.md 16.3 gives two tones and no
 * boundary; with the one-level slope invariant, two levels leave a one-to-two
 * tile shallow ring along every shore instead of a hard line at the beach.
 */
export const WATER_DEEP_MIN_DEPTH = 2;

function parseTint(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * The shallow tone of 16.3 (#4a86a8), as a Pixi tint. The atlas water cells
 * are drawn in greyscale, so a multiplied tint reproduces the 16.3 hex
 * EXACTLY on the flat top face rather than approximately (D-164).
 */
export const WATER_SHALLOW_TINT = parseTint(TERRAIN_COLORS[Terrain.Water]!);

/** The deep tone of 16.3 (#2c5a78), as a Pixi tint. */
export const WATER_DEEP_TINT = parseTint(WATER_DEEP);

/**
 * Which animation row a frame counter shows. Integer division keeps the row
 * stable for WATER_PHASE_FRAMES consecutive frames; the sequence ping-pongs
 * so the motion reverses instead of snapping back to the first row.
 */
export function waterRowForCounter(counter: number): number {
  const phase = ((counter / WATER_PHASE_FRAMES) | 0) % WATER_PHASE_SEQUENCE.length;
  return WATER_PHASE_SEQUENCE[phase]!;
}

/**
 * Deep or shallow, derived from the two layers the simulation already keeps:
 * `oceanMask` (derived, recomputed on load and after shoreline terraform)
 * and the corner heights. Inland water - lakes, painted rivers above sea
 * level (D-019) - is always shallow; the open sea turns deep once even the
 * highest corner of the floor lies WATER_DEEP_MIN_DEPTH below the surface.
 * A terraform that changes either input bumps the map revision, so every
 * cached view of the tone is invalidated through the existing channel - the
 * chunk checksums fold `oceanMask` in for exactly this reason (a canal dug
 * far away can flip a lake's mask without moving one local corner).
 */
export function isDeepWater(map: TileMap, x: number, y: number): boolean {
  return (
    map.oceanMask[map.tileIndex(x, y)] === 1 &&
    SEA_LEVEL - map.topHeight(x, y) >= WATER_DEEP_MIN_DEPTH
  );
}

/** Foam edges of a water tile, in screen order NE, SE, SW, NW. */
export const FOAM_EDGE_COUNT = 4;

/**
 * Foam atlas cells: one per (edge, corner-lift pair). The sixteen slope
 * shapes reduce, per edge, to the lift of that edge's two corners - nothing
 * else moves the edge geometry - so 4 edges x 4 lift combinations is the
 * WHOLE foam row, where a cell per (slope, edge) pair would need 4 x 16.
 */
export const FOAM_VARIANT_COUNT = FOAM_EDGE_COUNT * 4;

/** Tile offset of the neighbour across each foam edge, indexed by edge. */
const EDGE_DX = [0, 1, 0, -1] as const;
const EDGE_DY = [-1, 0, 1, 0] as const;

/**
 * Which edges of a water tile border land, as a 4-bit mask in edge order.
 * The map border is open sea, not a shore - an off-map neighbour never
 * raises foam. Callers only ask about water tiles; the function does not
 * re-check that.
 */
export function coastEdgeMask(map: TileMap, x: number, y: number): number {
  let mask = 0;
  for (let edge = 0; edge < FOAM_EDGE_COUNT; edge++) {
    const nx = x + EDGE_DX[edge]!;
    const ny = y + EDGE_DY[edge]!;
    if (!map.contains(nx, ny)) continue;
    if (map.terrain[map.tileIndex(nx, ny)] !== Terrain.Water) mask |= 1 << edge;
  }
  return mask;
}

/**
 * The two slope corner bits either end of each edge, in the same N-E-S-W
 * corner order the atlas draws its diamond in: edge 0 runs N-E, 1 E-S,
 * 2 S-W, 3 W-N. Matches EDGE_DX/EDGE_DY: the neighbour at (0,-1) shares the
 * North and East corners, and so on around the diamond.
 */
const EDGE_CORNER_BITS: readonly (readonly [number, number])[] = [
  [SlopeBit.North, SlopeBit.East],
  [SlopeBit.East, SlopeBit.South],
  [SlopeBit.South, SlopeBit.West],
  [SlopeBit.West, SlopeBit.North],
];

/**
 * Which of the sixteen foam cells an edge of a sloped water tile needs:
 * `edge * 4 + liftA + 2 * liftB`, where A and B are the edge's two corners
 * in EDGE_CORNER_BITS order.
 */
export function foamVariant(edge: number, slope: number): number {
  const [a, b] = EDGE_CORNER_BITS[edge]!;
  return edge * 4 + ((slope & a) !== 0 ? 1 : 0) + ((slope & b) !== 0 ? 2 : 0);
}
