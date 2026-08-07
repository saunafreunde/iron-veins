import { describe, expect, it } from 'vitest';
import { minimapViewQuad, type CameraView } from '../../src/render/Minimap';
import { TILE_H, TILE_W, tileToWorld, worldToTileAtHeight } from '../../src/render/projection';

/**
 * The minimap's viewport quad (SPEC2 M12, D-166): the camera's screen
 * rectangle back-projected into tile space, where the minimap lives. The
 * panel strokes exactly these four corners; `paintMinimap` never sees them
 * (D-112 - the painter stays pure, the save thumbnail stays clean).
 */

function camera(overrides: Partial<CameraView> = {}): CameraView {
  return { centreX: 0, centreY: 0, zoom: 1, screenW: 640, screenH: 360, ...overrides };
}

describe('minimapViewQuad', () => {
  it('projects the camera centre onto the tile the camera looks at', () => {
    const world = tileToWorld(40, 25, 0);
    const quad = minimapViewQuad(camera({ centreX: world.x, centreY: world.y }));
    const cx = (quad[0]!.x + quad[1]!.x + quad[2]!.x + quad[3]!.x) / 4;
    const cy = (quad[0]!.y + quad[1]!.y + quad[2]!.y + quad[3]!.y) / 4;
    // tileToWorld addresses the tile's NORTH corner; the quad centre must
    // land back on exactly that point of the grid.
    expect(cx).toBeCloseTo(40, 6);
    expect(cy).toBeCloseTo(25, 6);
  });

  it('agrees corner for corner with the back projection at height zero', () => {
    const view = camera({ centreX: 512, centreY: 300, zoom: 2 });
    const halfW = view.screenW / 2 / view.zoom;
    const halfH = view.screenH / 2 / view.zoom;
    const quad = minimapViewQuad(view);
    const expected = [
      worldToTileAtHeight(view.centreX - halfW, view.centreY - halfH, 0),
      worldToTileAtHeight(view.centreX + halfW, view.centreY - halfH, 0),
      worldToTileAtHeight(view.centreX + halfW, view.centreY + halfH, 0),
      worldToTileAtHeight(view.centreX - halfW, view.centreY + halfH, 0),
    ];
    for (let i = 0; i < 4; i++) {
      expect(quad[i]!.x).toBeCloseTo(expected[i]!.x, 9);
      expect(quad[i]!.y).toBeCloseTo(expected[i]!.y, 9);
    }
  });

  it('halves the footprint when the zoom doubles', () => {
    const wide = minimapViewQuad(camera({ zoom: 1 }));
    const tight = minimapViewQuad(camera({ zoom: 2 }));
    const span = (quad: ReturnType<typeof minimapViewQuad>): number =>
      Math.max(quad[0]!.x, quad[1]!.x, quad[2]!.x, quad[3]!.x) -
      Math.min(quad[0]!.x, quad[1]!.x, quad[2]!.x, quad[3]!.x);
    expect(span(tight)).toBeCloseTo(span(wide) / 2, 9);
  });

  it('is a parallelogram, not an axis-aligned box', () => {
    const quad = minimapViewQuad(camera({ centreX: 123, centreY: 456 }));
    // Opposite corners of a parallelogram share their midpoint.
    expect(quad[0]!.x + quad[2]!.x).toBeCloseTo(quad[1]!.x + quad[3]!.x, 9);
    expect(quad[0]!.y + quad[2]!.y).toBeCloseTo(quad[1]!.y + quad[3]!.y, 9);
    // And the top edge runs along the dimetric x-axis: one screen-x step is
    // +x/-y in tiles in equal measure, so the quad is genuinely rotated.
    const dx = quad[1]!.x - quad[0]!.x;
    const dy = quad[1]!.y - quad[0]!.y;
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeCloseTo(-dx, 9);
  });

  it('spans the tile counts the screen actually shows', () => {
    const view = camera({ zoom: 1 });
    const quad = minimapViewQuad(view);
    // A screen step of TILE_W px crosses one (+x,-y) tile diagonal, a step
    // of TILE_H px one (+x,+y) diagonal - the 16.1 projection read
    // backwards - and a tile diagonal is sqrt(2) long in tile units. The
    // quad's edges must measure exactly that.
    const topEdge = Math.hypot(quad[1]!.x - quad[0]!.x, quad[1]!.y - quad[0]!.y);
    const leftEdge = Math.hypot(quad[3]!.x - quad[0]!.x, quad[3]!.y - quad[0]!.y);
    expect(topEdge).toBeCloseTo((Math.SQRT2 * view.screenW) / TILE_W, 6);
    expect(leftEdge).toBeCloseTo((Math.SQRT2 * view.screenH) / TILE_H, 6);
  });
});
