import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BAKE_HEIGHT_PX,
  BAKE_HEIGHT_STEP_M,
  BAKE_TILE_H,
  BAKE_TILE_M,
  BAKE_TILE_W,
  BAKE_ZOOMS,
  FACING_DELTAS,
  SHADE_BASE,
  SHADE_UP,
  SHADE_X,
  SHADE_Y,
  bakeAtlases,
  decodePng,
  encodePng,
  extractTriangles,
  hueSaturation,
  layoutCells,
  parseGlb,
  renderSprite,
  syntheticCubeGlb,
  syntheticTexturedGlb,
  syntheticWagonGlb,
} from '../../tools/bake-lib.ts';
import { HEIGHT_PX, TILE_H, TILE_W } from '../../src/render/projection';
import { FACE_LEFT, FACE_RIGHT, FACE_TOP } from '../../src/render/shapes';
import { HEIGHT_STEP_M, TILE_SIZE_M } from '../../src/sim/constants';

/**
 * The Kenney bake pipeline (SPEC2 M12 stage 0, E-14/D-160), proven on
 * synthetic geometry: a one-material cube, a two-material wagon with a
 * company-colour zone and a colormap-textured cube - the three material
 * conventions the real kits use. The pipeline must hold whether or not
 * assets-cache/ is filled, so nothing here touches the network or the cache.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('the bake camera and light are the renderer\'s own', () => {
  it('restates the exact projection constants of src/render/projection.ts', () => {
    // Node cannot resolve src imports at bake time (extensionless ESM), so
    // bake-lib restates them - THIS coupling test is what makes "exact the
    // 16.1 camera" a checked promise instead of a comment.
    expect(BAKE_TILE_W).toBe(TILE_W);
    expect(BAKE_TILE_H).toBe(TILE_H);
    expect(BAKE_HEIGHT_PX).toBe(HEIGHT_PX);
    expect(BAKE_TILE_M).toBe(TILE_SIZE_M);
    expect(BAKE_HEIGHT_STEP_M).toBe(HEIGHT_STEP_M);
  });

  it('solves the flat shading against the three box-face factors of shapes.ts', () => {
    expect(SHADE_BASE + SHADE_UP).toBeCloseTo(FACE_TOP, 12);
    expect(SHADE_BASE + SHADE_Y).toBeCloseTo(FACE_LEFT, 12);
    expect(SHADE_BASE + SHADE_X).toBeCloseTo(FACE_RIGHT, 12);
  });

  it('bakes the three per-zoom atlases of SPEC.md 16.2', () => {
    expect(BAKE_ZOOMS).toEqual([1, 2, 4]);
    expect(FACING_DELTAS).toHaveLength(8);
  });
});

describe('GLB parsing and colour resolution', () => {
  it('reads the synthetic cube: 12 triangles, baseColorFactor red, no tint', () => {
    const triangles = extractTriangles(parseGlb(syntheticCubeGlb()));
    expect(triangles).toHaveLength(12);
    for (const tri of triangles) {
      expect([tri.r, tri.g, tri.b]).toEqual([200, 0, 0]);
      expect(tri.tint).toBe(false);
    }
  });

  it('marks the wagon livery material as a tint zone by name', () => {
    const triangles = extractTriangles(parseGlb(syntheticWagonGlb()), {
      tintMaterials: ['livery'],
    });
    expect(triangles).toHaveLength(24);
    expect(triangles.filter((tri) => tri.tint)).toHaveLength(12);
  });

  it('samples an embedded colormap texture at the face UV centroid', () => {
    const triangles = extractTriangles(parseGlb(syntheticTexturedGlb()));
    expect(triangles).toHaveLength(12);
    for (const tri of triangles) {
      expect([tri.r, tri.g, tri.b]).toEqual([30, 180, 60]);
    }
  });

  it('marks colormap faces as tint zones by hue band', () => {
    // The green texel (30,180,60) sits around hue 132 with high saturation.
    const { hue, saturation } = hueSaturation(30, 180, 60);
    expect(hue).toBeGreaterThan(120);
    expect(hue).toBeLessThan(145);
    expect(saturation).toBeGreaterThan(0.5);
    const triangles = extractTriangles(parseGlb(syntheticTexturedGlb()), {
      tintHues: [{ min: 120, max: 145, minSaturation: 0.3 }],
    });
    expect(triangles.every((tri) => tri.tint)).toBe(true);
    const outside = extractTriangles(parseGlb(syntheticTexturedGlb()), {
      tintHues: [{ min: 200, max: 260, minSaturation: 0.3 }],
    });
    expect(outside.every((tri) => tri.tint)).toBe(false);
  });
});

describe('the dimetric rasteriser', () => {
  const cube = extractTriangles(parseGlb(syntheticCubeGlb()));

  it('shades the three visible cube faces with the NW-light factors', () => {
    const sprite = renderSprite(cube, { scale: 10, facing: 0, zoom: 2 });
    const reds = new Set<number>();
    for (let i = 0; i < sprite.base.length; i += 4) {
      if (sprite.base[i + 3] === 255) {
        reds.add(sprite.base[i]!);
        expect(sprite.base[i + 1]).toBe(0);
        expect(sprite.base[i + 2]).toBe(0);
      }
    }
    // 200 * 1.06 / 0.74 / 0.52 - the exact factors a procedural box gets.
    expect([...reds].sort((a, b) => a - b)).toEqual([104, 148, 212]);
  });

  it('keeps the pivot anchor inside the cell and projects named anchors', () => {
    const sprite = renderSprite(cube, {
      scale: 10,
      facing: 0,
      zoom: 2,
      anchors: { vent: [0, 1, 0] },
    });
    expect(sprite.anchorX).toBeGreaterThanOrEqual(0);
    expect(sprite.anchorX).toBeLessThanOrEqual(sprite.width);
    expect(sprite.anchorY).toBeGreaterThanOrEqual(0);
    expect(sprite.anchorY).toBeLessThanOrEqual(sprite.height);
    const vent = sprite.points['vent']!;
    // The vent sits on the cube's top centre: same x as the pivot, higher up.
    expect(vent[0]).toBeCloseTo(sprite.anchorX, 9);
    expect(vent[1]).toBeLessThan(sprite.anchorY);
  });

  it('renders eight distinguishable facings of an asymmetric model', () => {
    const wagon = extractTriangles(parseGlb(syntheticWagonGlb()), { tintMaterials: ['livery'] });
    const facing0 = renderSprite(wagon, { scale: 10, facing: 0, zoom: 1 });
    const facing4 = renderSprite(wagon, { scale: 10, facing: 4, zoom: 1 });
    expect(facing0.width).toBe(facing4.width);
    expect(sha256(facing0.base)).not.toBe(sha256(facing4.base));
    const diagonal = renderSprite(wagon, { scale: 10, facing: 1, zoom: 1 });
    expect(diagonal.width).toBeGreaterThan(0);
    expect(diagonal.height).toBeGreaterThan(0);
  });

  it('renders tint zones neutral in the base and shaded grey in the mask', () => {
    const wagon = extractTriangles(parseGlb(syntheticWagonGlb()), { tintMaterials: ['livery'] });
    const sprite = renderSprite(wagon, { scale: 10, facing: 0, zoom: 2 });
    let maskPixels = 0;
    const maskGreys = new Set<number>();
    for (let i = 0; i < sprite.mask.length; i += 4) {
      if (sprite.mask[i + 3] === 255) {
        maskPixels++;
        maskGreys.add(sprite.mask[i]!);
        // Mask pixels are grey (r = g = b) and the base below is neutral.
        expect(sprite.mask[i + 1]).toBe(sprite.mask[i]);
        expect(sprite.mask[i + 2]).toBe(sprite.mask[i]);
        expect(sprite.base[i + 1]).toBe(sprite.base[i]);
        expect(sprite.base[i + 2]).toBe(sprite.base[i]);
      }
    }
    expect(maskPixels).toBeGreaterThan(0);
    // The livery box shows three faces; 255 * factor, top clamped to 255.
    for (const grey of maskGreys) {
      expect([255, 189, 133]).toContain(grey);
    }
  });
});

describe('PNG codec', () => {
  it('round-trips RGBA pixels bit-exactly', () => {
    const pixels = Uint8Array.from(
      { length: 3 * 2 * 4 },
      (_, i) => (i * 37 + ((i * i) % 11)) % 256,
    );
    const decoded = decodePng(encodePng(3, 2, pixels));
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect([...decoded.rgba]).toEqual([...pixels]);
  });
});

describe('atlas layout', () => {
  it('packs cells without overlap and never past 4096', () => {
    const sizes = Array.from({ length: 40 }, (_, i) => ({
      width: 300 + (i % 7) * 100,
      height: 200 + (i % 5) * 80,
    }));
    const { placements, pages } = layoutCells(sizes);
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(4096);
      expect(page.height).toBeLessThanOrEqual(4096);
    }
    for (let a = 0; a < placements.length; a++) {
      for (let b = a + 1; b < placements.length; b++) {
        if (placements[a]!.page !== placements[b]!.page) continue;
        const overlap =
          placements[a]!.x < placements[b]!.x + sizes[b]!.width &&
          placements[b]!.x < placements[a]!.x + sizes[a]!.width &&
          placements[a]!.y < placements[b]!.y + sizes[b]!.height &&
          placements[b]!.y < placements[a]!.y + sizes[a]!.height;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('the bake is reproducible', () => {
  it('bakes twice into bit-identical files', () => {
    const models = () => [
      {
        target: 'vehicle:9001',
        triangles: extractTriangles(parseGlb(syntheticCubeGlb())),
        scale: 10,
        facings: 8,
        anchors: { chimney: [0, 1, 0] as const },
      },
      {
        target: 'vehicle:9002',
        triangles: extractTriangles(parseGlb(syntheticWagonGlb()), {
          tintMaterials: ['livery'],
        }),
        scale: 10,
        facings: 8,
      },
      {
        target: 'tree:9000',
        triangles: extractTriangles(parseGlb(syntheticTexturedGlb())),
        scale: 8,
        facings: 1,
      },
    ];
    const first = bakeAtlases(models());
    const second = bakeAtlases(models());
    expect([...first.files.keys()]).toEqual([...second.files.keys()]);
    for (const [name, bytes] of first.files) {
      expect(sha256(second.files.get(name)!), name).toBe(sha256(bytes));
    }
    // One page set per zoom, all three zooms of 16.2 present.
    const zooms = new Set(first.manifest.pages.map((page) => page.zoom));
    expect([...zooms].sort((a, b) => a - b)).toEqual([1, 2, 4]);
    // 8 + 8 + 1 sprites per zoom, and the cube's anchor came through.
    const cells = first.manifest.pages.flatMap((page) => page.cells);
    expect(cells).toHaveLength(3 * 17);
    const anchored = cells.filter((cell) => cell.target === 'vehicle:9001');
    for (const cell of anchored) {
      expect(cell.points?.['chimney']).toBeDefined();
    }
    // Every page decodes and matches its manifest dimensions.
    for (const page of first.manifest.pages) {
      const decoded = decodePng(first.files.get(page.file)!);
      expect(decoded.width).toBe(page.width);
      expect(decoded.height).toBe(page.height);
    }
  });
});

describe('tools/assets-manifest.json', () => {
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tools', 'assets-manifest.json'), 'utf8'),
  ) as {
    packs: Array<{ id: string; url: string; sha256: string; page: string }>;
    models: Array<{ target: string; pack: string; file: string; scale: number; facings: number }>;
  };

  it('pins every pack with a kenney.nl URL and a SHA-256', () => {
    expect(manifest.packs).toHaveLength(12);
    for (const pack of manifest.packs) {
      expect(pack.url, pack.id).toMatch(/^https:\/\/kenney\.nl\/media\/pages\/assets\//);
      expect(pack.sha256, pack.id).toMatch(/^[0-9a-f]{64}$/);
      expect(pack.page, pack.id).toMatch(/^https:\/\/kenney\.nl\/assets\//);
    }
  });

  it('maps every model onto a listed pack with sane bake parameters', () => {
    const packIds = new Set(manifest.packs.map((pack) => pack.id));
    const targets = new Set<string>();
    for (const model of manifest.models) {
      expect(packIds.has(model.pack), model.target).toBe(true);
      expect(targets.has(model.target), `duplicate ${model.target}`).toBe(false);
      targets.add(model.target);
      expect(model.scale, model.target).toBeGreaterThan(0);
      expect([1, 8], model.target).toContain(model.facings);
      expect(model.file, model.target).toMatch(/\.glb$/);
    }
  });

  it('covers the representative M12 subset (M13 completes the catalogue)', () => {
    const count = (predicate: (target: string) => boolean): number =>
      manifest.models.filter((model) => predicate(model.target)).length;
    const catalogId = (target: string): number => Number(target.split(':')[1]);
    expect(
      count((t) => t.startsWith('vehicle:') && catalogId(t) >= 1000 && catalogId(t) < 2000),
      'rail vehicles',
    ).toBeGreaterThanOrEqual(10);
    expect(
      count((t) => t.startsWith('vehicle:') && catalogId(t) < 1000),
      'road vehicles',
    ).toBeGreaterThanOrEqual(8);
    expect(
      count((t) => t.startsWith('vehicle:') && catalogId(t) >= 2000 && catalogId(t) < 3000),
      'ships',
    ).toBeGreaterThanOrEqual(4);
    expect(count((t) => t.startsWith('building:')), 'town buildings').toBeGreaterThanOrEqual(10);
    expect(count((t) => t.startsWith('industry:')), 'industry structures').toBeGreaterThanOrEqual(5);
    expect(count((t) => t.startsWith('tree:')), 'trees').toBeGreaterThanOrEqual(4);
  });
});
