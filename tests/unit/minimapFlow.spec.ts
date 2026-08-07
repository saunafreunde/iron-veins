import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import {
  MINIMAP_MODE_COUNT,
  MINIMAP_MODE_KEYS,
  MinimapMode,
  paintMinimap,
  type MinimapFlows,
} from '../../src/render/Minimap';
import { TileMap } from '../../src/sim/map/TileMap';

/**
 * The minimap's Fluss mode of SPEC2 M14 (D-177): a new case of the ONE pure
 * painter of D-112 - which is exactly why the save thumbnail inherits it for
 * free and why these tests can hold it byte for byte, headless.
 */

const SIZE = 64;

function paint(mode: MinimapMode, flows?: MinimapFlows): Uint8ClampedArray {
  const map = new TileMap(SIZE);
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  paintMinimap(map, mode, out, { flows });
  return out;
}

/** One leg between two stations on the same row, easy to sample. */
const LEG: MinimapFlows = {
  fromTiles: [32 * SIZE + 10],
  toTiles: [32 * SIZE + 54],
  volumes: [120],
  owners: [1],
};

describe('the minimap Fluss mode', () => {
  it('is registered: mode, count, button key and both catalogues agree', () => {
    expect(MinimapMode.Flow).toBeLessThan(MINIMAP_MODE_COUNT);
    expect(MINIMAP_MODE_KEYS).toHaveLength(MINIMAP_MODE_COUNT);
    const key = MINIMAP_MODE_KEYS[MinimapMode.Flow]!;
    expect(key).toBe('ui.minimap.flow');
    // The N-key cycle walks 0..MINIMAP_MODE_COUNT-1, so being under the
    // count IS being in the cycle (the M10 wiring needs no new code).
    expect(key in de).toBe(true);
    expect(key in en).toBe(true);
  });

  it('is a pure function: the same inputs paint the same bytes', () => {
    const first = paint(MinimapMode.Flow, LEG);
    const second = paint(MinimapMode.Flow, LEG);
    expect(second).toEqual(first);
  });

  it('draws a leg as a line between its station pixels', () => {
    const withFlows = paint(MinimapMode.Flow, LEG);
    const without = paint(MinimapMode.Flow);

    // The midpoint of the leg lies on the painted line and differs from the
    // dimmed ground the empty paint shows there.
    const mid = (32 * SIZE + 32) * 4;
    const changed =
      withFlows[mid] !== without[mid] ||
      withFlows[mid + 1] !== without[mid + 1] ||
      withFlows[mid + 2] !== without[mid + 2];
    expect(changed).toBe(true);

    // A pixel far off the line is untouched by the flow pass.
    const off = (10 * SIZE + 10) * 4;
    expect(withFlows[off]).toBe(without[off]);
    expect(withFlows[off + 1]).toBe(without[off + 1]);
    expect(withFlows[off + 2]).toBe(without[off + 2]);

    // Both endpoints carry the bright station blot.
    for (const tile of [LEG.fromTiles[0]!, LEG.toTiles[0]!]) {
      const base = tile * 4;
      expect(withFlows[base]).toBe(240);
      expect(withFlows[base + 1]).toBe(244);
      expect(withFlows[base + 2]).toBe(248);
    }
  });

  it('scales brightness with volume against the biggest flow in the picture', () => {
    const thinLeg: MinimapFlows = {
      fromTiles: [10 * SIZE + 10, 50 * SIZE + 10],
      toTiles: [10 * SIZE + 54, 50 * SIZE + 54],
      volumes: [10, 1_000],
      owners: [1, 1],
    };
    const out = paint(MinimapMode.Flow, thinLeg);

    // Same owner, same palette colour - the thin leg is strictly darker.
    const thin = (10 * SIZE + 32) * 4;
    const thick = (50 * SIZE + 32) * 4;
    expect(out[thick]!).toBeGreaterThan(out[thin]!);
    expect(out[thick + 1]!).toBeGreaterThan(out[thin + 1]!);
  });

  it('keeps an estimate leg out of every company colour', () => {
    const estimate: MinimapFlows = {
      fromTiles: [32 * SIZE + 10],
      toTiles: [32 * SIZE + 54],
      volumes: [0],
      owners: [-1],
    };
    const out = paint(MinimapMode.Flow, estimate);
    // The estimate grey is achromatic-ish: no channel dominates the way a
    // palette hue would. Sample the midpoint of the line.
    const mid = (32 * SIZE + 32) * 4;
    const r = out[mid]!;
    const g = out[mid + 1]!;
    const b = out[mid + 2]!;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(20);
  });

  it('leaves the painter honest without flow data - the thumbnail path', () => {
    // The thumbnail calls paintMinimap without flows; the Flow case must be
    // exactly the dimmed ground then, not a crash and not stale lines.
    const empty = paint(MinimapMode.Flow);
    const terrain = paint(MinimapMode.Terrain);
    expect(empty.length).toBe(terrain.length);
    // Dimmed means darker than the terrain view on land pixels.
    const sample = (20 * SIZE + 20) * 4;
    expect(empty[sample]!).toBeLessThan(terrain[sample]!);
  });
});
