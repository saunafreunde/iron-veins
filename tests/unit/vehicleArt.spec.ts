import { describe, expect, it } from 'vitest';
import { FACING_DELTAS } from '../../tools/bake-lib.ts';
import type { BakedAtlasManifest, BakedCell, BakedPage } from '../../src/render/bakedAtlas';
import {
  bakedZoomFor,
  buildVehicleIndex,
  FACING_NONE,
  facingFromDelta,
  facingFromMovement,
  variantIndex,
  VEHICLE_FACING_COUNT,
  VEHICLE_FACING_DELTAS,
  vehicleVariantFor,
} from '../../src/render/vehicleArt';

/**
 * The pure half of the M13 vehicle-art bundle: facing quantisation from the
 * interpolated movement vector, the deterministic per-vehicle variant pick,
 * the manifest index and the per-entry fallback decision. MapView only
 * executes what these functions decide, so this file is where the policy is
 * held - no Pixi, no fetch, no canvas.
 */

function cell(target: string, facing: number, over: Partial<BakedCell> = {}): BakedCell {
  return {
    target,
    facing,
    x: facing * 40,
    y: 0,
    width: 32,
    height: 24,
    anchorX: 16,
    anchorY: 20,
    maskX: facing * 40 + 32,
    maskY: 0,
    ...over,
  };
}

function page(file: string, zoom: number, cells: readonly BakedCell[]): BakedPage {
  return { file, zoom, width: 4096, height: 4096, cells };
}

function manifest(pages: readonly BakedPage[]): BakedAtlasManifest {
  return { version: 1, zooms: [...new Set(pages.map((entry) => entry.zoom))], pages };
}

function allFacings(target: string): BakedCell[] {
  return Array.from({ length: VEHICLE_FACING_COUNT }, (_, facing) => cell(target, facing));
}

describe("the facing order is the bake's own (D-160 coupling)", () => {
  it('restates tools/bake-lib.ts FACING_DELTAS exactly', () => {
    // The game cannot import build tools, so the render side restates the
    // list - and this assertion is what keeps the two from drifting, the
    // assetsBake.spec.ts device applied one file further.
    expect(VEHICLE_FACING_DELTAS).toEqual(FACING_DELTAS);
    expect(VEHICLE_FACING_COUNT).toBe(FACING_DELTAS.length);
  });

  it('keeps FACING_NONE outside the facing range', () => {
    expect(FACING_NONE).toBeGreaterThanOrEqual(VEHICLE_FACING_COUNT);
  });
});

describe('facingFromDelta', () => {
  it('maps each of the eight exact deltas onto its own index', () => {
    for (let facing = 0; facing < VEHICLE_FACING_COUNT; facing++) {
      const [dx, dy] = VEHICLE_FACING_DELTAS[facing]!;
      expect(facingFromDelta(dx, dy), `delta (${dx}, ${dy})`).toBe(facing);
    }
  });

  it('is scale-invariant - a delta is a direction, not a distance', () => {
    expect(facingFromDelta(3, 0)).toBe(0);
    expect(facingFromDelta(0.25, 0.25)).toBe(1);
    expect(facingFromDelta(0, -0.001)).toBe(6);
  });

  it('quantises blended vectors to the nearest facing', () => {
    // 16.7 degrees off east stays east; 34 degrees rounds to the diagonal.
    expect(facingFromDelta(1, 0.3)).toBe(0);
    expect(facingFromDelta(1, 0.7)).toBe(1);
    expect(facingFromDelta(-1, -0.9)).toBe(5);
    expect(facingFromDelta(0.1, -1)).toBe(6);
    expect(facingFromDelta(1, -0.7)).toBe(7);
  });

  it('answers -1 for a zero vector instead of inventing a direction', () => {
    expect(facingFromDelta(0, 0)).toBe(-1);
  });
});

describe('facingFromMovement', () => {
  it('reads the glide direction, not the tile step', () => {
    // A vehicle rounding a corner: the previous sample sits late in an
    // eastbound step, the current one early in a southbound step. The
    // MOVEMENT between the samples is the diagonal - exactly what the
    // sprite does on screen, and why it must not snap a quarter turn.
    const prevFx = 10 + 0.8; // from (10,10) -> (11,10), progress 0.8
    const prevFy = 10;
    const currFx = 11; // from (11,10) -> (11,11), progress 0.3
    const currFy = 10 + 0.3;
    expect(facingFromMovement(prevFx, prevFy, currFx, currFy)).toBe(1);
  });

  it('keeps a straight run on its cardinal facing across the boundary', () => {
    expect(facingFromMovement(10.9, 10, 11.4, 10)).toBe(0);
    expect(facingFromMovement(10, 10.9, 10, 11.4)).toBe(2);
  });

  it('answers -1 for a standing vehicle, so the caller keeps the cache', () => {
    expect(facingFromMovement(10.5, 10, 10.5, 10)).toBe(-1);
    // Sub-epsilon float residue is standing too, not a spin.
    expect(facingFromMovement(10.5, 10, 10.5 + 1e-9, 10)).toBe(-1);
  });

  it("still reads a slow vehicle's true direction", () => {
    // One tick of the slowest catalogue vehicle is ~1e-3 tiles - two orders
    // of magnitude above the standing floor.
    expect(facingFromMovement(10.5, 10, 10.501, 10)).toBe(0);
  });
});

describe('variantIndex - hash(vehicleId), the M13 variance', () => {
  it('is deterministic and in range', () => {
    for (let id = 0; id < 64; id++) {
      const first = variantIndex(id, 3);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(3);
      expect(variantIndex(id, 3)).toBe(first);
    }
  });

  it('answers 0 for a single variant without hashing', () => {
    expect(variantIndex(123, 1)).toBe(0);
    expect(variantIndex(123, 0)).toBe(0);
  });

  it('spreads neighbouring ids over the variants', () => {
    // Sequential ids are the common case (the store hands them out in
    // order); a hash that maps a whole depot batch onto one body would
    // defeat the point of variance.
    const seen = new Set<number>();
    for (let id = 0; id < 200; id++) seen.add(variantIndex(id, 3));
    expect(seen.size).toBe(3);
  });
});

describe('buildVehicleIndex', () => {
  it('indexes vehicle cells per zoom and catalogue id', () => {
    const index = buildVehicleIndex(
      manifest([
        page('z1-p0.png', 1, allFacings('vehicle:1000')),
        page('z2-p0.png', 2, allFacings('vehicle:1000')),
      ]),
    );
    expect(index.map((entry) => entry.zoom)).toEqual([1, 2]);
    const variants = index[0]!.bySpec.get(1000)!;
    expect(variants).toHaveLength(1);
    expect(variants[0]!.cells).toHaveLength(VEHICLE_FACING_COUNT);
    expect(variants[0]!.cells[3]!.page).toBe('z1-p0.png');
    expect(variants[0]!.cells[3]!.cell.facing).toBe(3);
  });

  it('collects the facings of one model across page boundaries', () => {
    // The z4 catalogue spans four pages (D-169), so a model's eight facings
    // CAN straddle a page break - each facing carries its own page file.
    const facings = allFacings('vehicle:2000');
    const index = buildVehicleIndex(
      manifest([page('z4-p0.png', 4, facings.slice(0, 5)), page('z4-p1.png', 4, facings.slice(5))]),
    );
    const variant = index[0]!.bySpec.get(2000)![0]!;
    expect(variant.cells[0]!.page).toBe('z4-p0.png');
    expect(variant.cells[7]!.page).toBe('z4-p1.png');
  });

  it('orders manifest-declared variants by their suffix', () => {
    const index = buildVehicleIndex(
      manifest([
        page('z1-p0.png', 1, [
          ...allFacings('vehicle:1000:1'),
          ...allFacings('vehicle:1000'),
          ...allFacings('vehicle:1000:2'),
        ]),
      ]),
    );
    const variants = index[0]!.bySpec.get(1000)!;
    expect(variants).toHaveLength(3);
    // Suffix order, not page order: hash(vehicleId) must land on the same
    // body whatever order the packer emitted the cells.
    expect(variants[0]!.cells[0]!.cell.target).toBe('vehicle:1000');
    expect(variants[1]!.cells[0]!.cell.target).toBe('vehicle:1000:1');
    expect(variants[2]!.cells[0]!.cell.target).toBe('vehicle:1000:2');
  });

  it('drops a variant that is missing a facing, whole', () => {
    // Seven baked facings plus one procedural would be the wrong-silhouette
    // flicker D-117 forbids - the variant is dropped, and with no complete
    // variant left the id falls back per entry (E-14).
    const incomplete = allFacings('vehicle:3000').slice(0, 7);
    const index = buildVehicleIndex(manifest([page('z1-p0.png', 1, incomplete)]));
    expect(index[0]!.bySpec.has(3000)).toBe(false);
  });

  it('ignores everything that is not vehicle art', () => {
    const index = buildVehicleIndex(
      manifest([
        page('z1-p0.png', 1, [
          cell('building:residential:0', 0),
          cell('industry:Sawmill', 0),
          cell('tree:temperate:0', 0),
          ...allFacings('vehicle:1000'),
        ]),
      ]),
    );
    expect([...index[0]!.bySpec.keys()]).toEqual([1000]);
  });
});

describe('bakedZoomFor', () => {
  const zooms = [1, 2, 4];

  it('serves each detail zoom its own page set (the D-163 rule)', () => {
    expect(bakedZoomFor(1, zooms)).toBe(1);
    expect(bakedZoomFor(2, zooms)).toBe(2);
    expect(bakedZoomFor(4, zooms)).toBe(4);
  });

  it('never upscales: a zoom between pages takes the smaller one', () => {
    expect(bakedZoomFor(3, zooms)).toBe(2);
  });

  it('serves the chunked zooms a downscale of the smallest page', () => {
    // At 0.5x vehicles are the one thing still drawn as live sprites
    // (D-161); 0.25x never asks - vehicles are dots there.
    expect(bakedZoomFor(0.5, zooms)).toBe(1);
    expect(bakedZoomFor(0.25, zooms)).toBe(1);
  });

  it('stays total on an empty list', () => {
    expect(bakedZoomFor(1, [])).toBe(1);
  });
});

describe('vehicleVariantFor - the per-entry fallback decision (E-14)', () => {
  const index = buildVehicleIndex(
    manifest([
      page('z1-p0.png', 1, [
        ...allFacings('vehicle:1000'),
        ...allFacings('vehicle:1000:1'),
        ...allFacings('vehicle:1200'),
      ]),
    ]),
  )[0]!;

  it('answers null without an index - the whole-atlas fallback', () => {
    expect(vehicleVariantFor(null, 1000, 7)).toBeNull();
  });

  it('answers null for an unmapped id and for an unnamed vehicle (-1)', () => {
    // Aircraft ids are never in the manifest (E-14); -1 is a vehicle the
    // fleet markers have not named yet. Both draw the white box.
    expect(vehicleVariantFor(index, 4000, 7)).toBeNull();
    expect(vehicleVariantFor(index, -1, 7)).toBeNull();
  });

  it('picks the hash-chosen variant for a mapped id', () => {
    const variant = vehicleVariantFor(index, 1000, 7)!;
    const expected = variantIndex(7, 2);
    const target = expected === 0 ? 'vehicle:1000' : 'vehicle:1000:1';
    expect(variant.cells[0]!.cell.target).toBe(target);
    // Single-variant ids always wear their one body.
    expect(vehicleVariantFor(index, 1200, 999)!.cells[0]!.cell.target).toBe('vehicle:1200');
  });

  it('is stable per vehicle across calls', () => {
    for (const id of [0, 1, 2, 3, 500]) {
      expect(vehicleVariantFor(index, 1000, id)).toBe(vehicleVariantFor(index, 1000, id));
    }
  });
});
