import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BAKE_HEIGHT_PX,
  BAKE_HEIGHT_STEP_M,
  BAKE_MANIFEST_VERSION,
  BAKE_TILE_H,
  BAKE_TILE_M,
  BAKE_TILE_W,
  BAKE_ZOOMS,
  EMISSIVE_LIT_RGB,
  FACING_DELTAS,
  SHADE_BASE,
  SHADE_UP,
  SHADE_X,
  SHADE_Y,
  SHADOW_ALPHA_MAX,
  applyRecolor,
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
import { BAKED_MANIFEST_VERSION } from '../../src/render/bakedAtlas';
import { EMISSIVE_WINDOW_HEX } from '../../src/render/emissive';
import { HEIGHT_PX, TILE_H, TILE_W } from '../../src/render/projection';
import { FACE_LEFT, FACE_RIGHT, FACE_TOP } from '../../src/render/shapes';
import { HEIGHT_STEP_M, MapClimate, TILE_SIZE_M } from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import { VEHICLE_SPECS } from '../../src/sim/vehicles/catalog';
import { VehicleKind } from '../../src/sim/vehicles/spec';

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

  it('stamps a soft contact shadow into the base cell, never over the model', () => {
    // M13: "Kontaktschatten (NW-Licht) je Zelle". The shadow is
    // semi-transparent black stamped only where the model left the cell
    // empty - so every fully opaque pixel is still a model pixel (the
    // shading assertions above depend on exactly that), and the mask cell
    // stays untouched for the tint pass.
    const sprite = renderSprite(cube, { scale: 10, facing: 0, zoom: 2 });
    let shadowPixels = 0;
    let below = 0;
    for (let i = 0; i < sprite.base.length; i += 4) {
      const alpha = sprite.base[i + 3]!;
      if (alpha === 0 || alpha === 255) continue;
      shadowPixels++;
      expect(sprite.base[i]).toBe(0);
      expect(sprite.base[i + 1]).toBe(0);
      expect(sprite.base[i + 2]).toBe(0);
      expect(alpha).toBeLessThanOrEqual(SHADOW_ALPHA_MAX);
      // The mask never darkens: it is multiplied by the company colour.
      expect(sprite.mask[i + 3]).toBe(0);
      if (Math.floor(i / 4 / sprite.width) > sprite.anchorY) below++;
    }
    expect(shadowPixels).toBeGreaterThan(0);
    // The patch hugs the ground line: a real share of it lies below the
    // anchor, where the ground plane is.
    expect(below).toBeGreaterThan(0);
  });

  it('keeps 180-degree facing pairs the same cell size, shadow and all', () => {
    // The shadow is clipped to the model's own cell (see SHADOW_ALPHA_MAX
    // in bake-lib), so the cell rectangle is still purely the geometry's -
    // this equality held before the shadow and must survive it.
    const sprite0 = renderSprite(cube, { scale: 10, facing: 0, zoom: 2 });
    const sprite4 = renderSprite(cube, { scale: 10, facing: 4, zoom: 2 });
    expect(sprite0.width).toBe(sprite4.width);
    expect(sprite0.height).toBe(sprite4.height);
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

describe('the reused-model variants of D-169: recolor and stretch', () => {
  it('applyRecolor rotates the hue wheel and scales saturation and value', () => {
    // Pure red shifted 120 degrees is pure green; 240 is pure blue.
    expect(applyRecolor(255, 0, 0, { hueShift: 120 })).toEqual([0, 255, 0]);
    expect(applyRecolor(255, 0, 0, { hueShift: 240 })).toEqual([0, 0, 255]);
    // Saturation zero collapses to grey at the colour's value.
    expect(applyRecolor(200, 40, 40, { saturation: 0 })).toEqual([200, 200, 200]);
    // Value scales brightness and clamps.
    expect(applyRecolor(100, 50, 50, { value: 2 })).toEqual([200, 100, 100]);
    expect(applyRecolor(200, 100, 100, { value: 2 })).toEqual([255, 128, 128]);
    // An empty spec is the identity.
    expect(applyRecolor(123, 45, 67, {})).toEqual([123, 45, 67]);
  });

  it('recolours only the non-tint faces at extract time', () => {
    // The cube is one untinted material (authored 200,0,0): fully recoloured.
    const cube = extractTriangles(parseGlb(syntheticCubeGlb()), {
      recolor: { hueShift: 120 },
    });
    for (const tri of cube) {
      expect([tri.r, tri.g, tri.b]).toEqual([0, 200, 0]);
    }
    // The wagon's livery zone keeps its authored colour - a company-colour
    // zone renders neutral grey in the base cell whatever the hull wears -
    // while the hull goes through exactly applyRecolor.
    const plain = extractTriangles(parseGlb(syntheticWagonGlb()), {
      tintMaterials: ['livery'],
    });
    const recoloured = extractTriangles(parseGlb(syntheticWagonGlb()), {
      tintMaterials: ['livery'],
      recolor: { hueShift: 120 },
    });
    expect(recoloured).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) {
      const before = plain[i]!;
      const after = recoloured[i]!;
      expect(after.tint).toBe(before.tint);
      const expected = before.tint
        ? [before.r, before.g, before.b]
        : applyRecolor(before.r, before.g, before.b, { hueShift: 120 });
      expect([after.r, after.g, after.b]).toEqual(expected);
    }
  });

  it('stretch lengthens the travel axis and moves the anchors with it', () => {
    const cube = extractTriangles(parseGlb(syntheticCubeGlb()));
    const plain = renderSprite(cube, {
      scale: 10,
      facing: 0,
      zoom: 2,
      anchors: { vent: [0, 1, 0] },
    });
    const long = renderSprite(cube, {
      scale: 10,
      facing: 0,
      zoom: 2,
      anchors: { vent: [0, 1, 0] },
      stretch: [1, 1, 2],
    });
    const tall = renderSprite(cube, {
      scale: 10,
      facing: 0,
      zoom: 2,
      anchors: { vent: [0, 1, 0] },
      stretch: [1, 2, 1],
    });
    expect(long.width).toBeGreaterThan(plain.width);
    expect(tall.height).toBeGreaterThan(plain.height);
    expect(tall.width).toBe(plain.width);
    // The vent sits on the cube's top centre: doubling the height doubles
    // its lift over the ground anchor.
    const plainLift = plain.anchorY - plain.points['vent']![1];
    const tallLift = tall.anchorY - tall.points['vent']![1];
    expect(tallLift).toBeCloseTo(2 * plainLift, 6);
  });
});

describe('the emissive pass of M13 (D-172)', () => {
  it('classifies glazing by material name, colour and hue band - and tint wins', () => {
    const byMaterial = extractTriangles(parseGlb(syntheticWagonGlb()), {
      emissiveMaterials: ['livery'],
    });
    expect(byMaterial.filter((tri) => tri.emissive)).toHaveLength(12);
    expect(byMaterial.filter((tri) => tri.tint)).toHaveLength(0);

    // The same faces claimed as company colour FIRST stay tint: paint does
    // not glow, and the blue-livery hulls of the water catalogue depend on
    // exactly this precedence.
    const tintWins = extractTriangles(parseGlb(syntheticWagonGlb()), {
      tintMaterials: ['livery'],
      emissiveMaterials: ['livery'],
    });
    expect(tintWins.filter((tri) => tri.tint)).toHaveLength(12);
    expect(tintWins.filter((tri) => tri.emissive)).toHaveLength(0);

    // Hue band on the colormap fixture (green texel, hue ~132).
    const byHue = extractTriangles(parseGlb(syntheticTexturedGlb()), {
      emissiveHues: [{ min: 120, max: 145, minSaturation: 0.3 }],
    });
    expect(byHue.every((tri) => tri.emissive)).toBe(true);
    const outside = extractTriangles(parseGlb(syntheticTexturedGlb()), {
      emissiveHues: [{ min: 200, max: 260, minSaturation: 0.3 }],
    });
    expect(outside.some((tri) => tri.emissive)).toBe(false);
  });

  it('renders glazing lit-only: EMISSIVE_LIT_RGB, unshaded, under the depth rule', () => {
    const triangles = extractTriangles(parseGlb(syntheticWagonGlb()), {
      emissiveMaterials: ['livery'],
    });
    const sprite = renderSprite(triangles, { scale: 10, facing: 0, zoom: 2 });
    expect(sprite.hasEmissive).toBe(true);
    let lit = 0;
    for (let i = 0; i < sprite.emissive.length; i += 4) {
      if (sprite.emissive[i + 3] === 0) continue;
      lit++;
      // UNSHADED: the exact lit colour on every glowing pixel, whatever
      // face factor the NW light gave the same pixel in the base cell.
      expect(sprite.emissive[i]).toBe(EMISSIVE_LIT_RGB[0]);
      expect(sprite.emissive[i + 1]).toBe(EMISSIVE_LIT_RGB[1]);
      expect(sprite.emissive[i + 2]).toBe(EMISSIVE_LIT_RGB[2]);
      // The depth rule: a glowing pixel is a pixel the MODEL owns - the
      // emissive twin can never glow outside the silhouette.
      expect(sprite.base[i + 3]).toBe(255);
    }
    expect(lit).toBeGreaterThan(0);
    // And strictly fewer lit pixels than model pixels: the hull is dark.
    let opaque = 0;
    for (let i = 3; i < sprite.base.length; i += 4) {
      if (sprite.base[i] === 255) opaque++;
    }
    expect(lit).toBeLessThan(opaque);
  });

  it('leaves the base and mask cells byte-identical to a bake without glazing', () => {
    const plain = renderSprite(extractTriangles(parseGlb(syntheticWagonGlb())), {
      scale: 10,
      facing: 2,
      zoom: 1,
    });
    const glazed = renderSprite(
      extractTriangles(parseGlb(syntheticWagonGlb()), { emissiveMaterials: ['livery'] }),
      { scale: 10, facing: 2, zoom: 1 },
    );
    expect(sha256(glazed.base)).toBe(sha256(plain.base));
    expect(sha256(glazed.mask)).toBe(sha256(plain.mask));
    expect(plain.hasEmissive).toBe(false);
    expect(glazed.hasEmissive).toBe(true);
  });

  it('packs emissive twins onto their own pages and stamps the trio on the cell', () => {
    const models = [
      {
        target: 'vehicle:9001',
        triangles: extractTriangles(parseGlb(syntheticWagonGlb()), {
          emissiveMaterials: ['livery'],
        }),
        scale: 10,
        facings: 8,
      },
      {
        target: 'vehicle:9002',
        triangles: extractTriangles(parseGlb(syntheticCubeGlb())),
        scale: 10,
        facings: 8,
      },
    ];
    const { manifest, files } = bakeAtlases(models, [1]);
    expect(manifest.version).toBe(BAKE_MANIFEST_VERSION);

    const emissivePages = manifest.pages.filter((page) => page.kind === 'emissive');
    expect(emissivePages).toHaveLength(1);
    expect(emissivePages[0]!.file).toBe('atlas-z1-e0.png');
    expect(emissivePages[0]!.cells).toHaveLength(0);
    const decoded = decodePng(files.get('atlas-z1-e0.png')!);
    expect(decoded.width).toBe(emissivePages[0]!.width);
    expect(decoded.height).toBe(emissivePages[0]!.height);

    const cells = manifest.pages.flatMap((page) => page.cells);
    const glazed = cells.filter((cell) => cell.target === 'vehicle:9001');
    const plain = cells.filter((cell) => cell.target === 'vehicle:9002');
    expect(glazed).toHaveLength(8);
    expect(plain).toHaveLength(8);
    for (const cell of glazed) {
      // All eight facings show glass (the livery box is visible all round),
      // and every twin rectangle lies inside its emissive page.
      expect(cell.emissivePage).toBe('atlas-z1-e0.png');
      expect(cell.emissiveX! + cell.width).toBeLessThanOrEqual(emissivePages[0]!.width);
      expect(cell.emissiveY! + cell.height).toBeLessThanOrEqual(emissivePages[0]!.height);
    }
    for (const cell of plain) {
      // No glazing, no trio - the absence IS the "this does not glow" flag.
      expect(cell.emissivePage).toBeUndefined();
      expect(cell.emissiveX).toBeUndefined();
      expect(cell.emissiveY).toBeUndefined();
    }
  });

  it('restates the game-side constants exactly (the D-160 coupling device)', () => {
    expect(BAKE_MANIFEST_VERSION).toBe(BAKED_MANIFEST_VERSION);
    const value = Number.parseInt(EMISSIVE_WINDOW_HEX.slice(1), 16);
    expect(EMISSIVE_LIT_RGB).toEqual([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
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

describe('base and mask cells are packed as one atomic pair', () => {
  it('keeps every pair on one page even when the catalogue spans pages', () => {
    // Enough large models to overflow a 4096 page at zoom 4 - the full M13
    // catalogue does exactly that, and a base/mask pair straddling a page
    // boundary used to be a hard bakeAtlases error.
    const triangles = extractTriangles(parseGlb(syntheticCubeGlb()));
    const models = Array.from({ length: 14 }, (_, i) => ({
      target: `vehicle:${9100 + i}`,
      triangles,
      scale: 95,
      facings: 2,
    }));
    const { manifest } = bakeAtlases(models, [4]);
    expect(manifest.pages.length).toBeGreaterThan(1);
    let cells = 0;
    for (const page of manifest.pages) {
      for (const cell of page.cells) {
        cells++;
        // Both rectangles of the pair lie inside THIS page's bitmap.
        expect(cell.x + cell.width).toBeLessThanOrEqual(page.width);
        expect(cell.maskX + cell.width).toBeLessThanOrEqual(page.width);
        expect(cell.y + cell.height).toBeLessThanOrEqual(page.height);
        expect(cell.maskY + cell.height).toBeLessThanOrEqual(page.height);
      }
    }
    expect(cells).toBe(14 * 2);
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
    models: Array<{
      target: string;
      pack: string;
      file: string;
      scale: number;
      facings: number;
      recolor?: { hueShift?: number; saturation?: number; value?: number };
      stretch?: [number, number, number];
    }>;
  };

  it('pins every pack with a kenney.nl URL and a SHA-256', () => {
    expect(manifest.packs).toHaveLength(12);
    for (const pack of manifest.packs) {
      expect(pack.url, pack.id).toMatch(/^https:\/\/kenney\.nl\/media\/pages\/assets\//);
      expect(pack.sha256, pack.id).toMatch(/^[0-9a-f]{64}$/);
      expect(pack.page, pack.id).toMatch(/^https:\/\/kenney\.nl\/assets\//);
    }
  });

  it('declares the kit-wide glazing convention of M13 (D-172)', () => {
    // One root-level hue band, because window glass is one sky-blue ramp
    // across every pinned kit (measured hue 212-216, HSL sat 0.62-0.83);
    // the band must bracket that measurement with honest margins.
    const emissive = (
      manifest as unknown as {
        emissive?: { hues?: Array<{ min: number; max: number; minSaturation: number }> };
      }
    ).emissive;
    expect(emissive?.hues).toHaveLength(1);
    const band = emissive!.hues![0]!;
    expect(band.min).toBeLessThanOrEqual(212);
    expect(band.min).toBeGreaterThan(180);
    expect(band.max).toBeGreaterThanOrEqual(216);
    expect(band.max).toBeLessThan(240);
    expect(band.minSaturation).toBeGreaterThan(0.4);
    expect(band.minSaturation).toBeLessThanOrEqual(0.62);
  });

  it('maps every model onto a listed pack with sane bake parameters', () => {
    const packIds = new Set(manifest.packs.map((pack) => pack.id));
    const targets = new Set<string>();
    for (const model of manifest.models) {
      expect(packIds.has(model.pack), model.target).toBe(true);
      expect(targets.has(model.target), `duplicate ${model.target}`).toBe(false);
      targets.add(model.target);
      expect(model.scale, model.target).toBeGreaterThan(0);
      // A vehicle drives (8 facings); everything else stands (1).
      expect(model.facings, model.target).toBe(model.target.startsWith('vehicle:') ? 8 : 1);
      expect(model.file, model.target).toMatch(/\.glb$/);
      if (model.stretch) {
        expect(model.stretch, model.target).toHaveLength(3);
        for (const axis of model.stretch) expect(axis, model.target).toBeGreaterThan(0);
      }
      if (model.recolor) {
        for (const key of Object.keys(model.recolor)) {
          expect(['hueShift', 'saturation', 'value'], model.target).toContain(key);
        }
      }
    }
  });

  // The M13 bundle-1 coupling test (D-169): the manifest and the catalogues
  // can drift in neither direction without turning this suite red - the
  // i18n.spec.ts device applied to art.
  describe('the full catalogue coverage of M13', () => {
    const vehicleTargets = new Map<number, string>();
    for (const model of manifest.models) {
      if (model.target.startsWith('vehicle:')) {
        vehicleTargets.set(Number(model.target.split(':')[1]), model.target);
      }
    }

    it('maps every rail, road and water catalogue entry exactly once', () => {
      for (const spec of VEHICLE_SPECS) {
        if (spec.kind === VehicleKind.Aircraft) continue;
        expect(vehicleTargets.has(spec.id), `vehicle:${spec.id} (${spec.nameKey})`).toBe(true);
      }
    });

    it('maps no aircraft - they stay procedural per E-14', () => {
      for (const spec of VEHICLE_SPECS) {
        if (spec.kind !== VehicleKind.Aircraft) continue;
        expect(vehicleTargets.has(spec.id), `vehicle:${spec.id} must stay procedural`).toBe(false);
      }
    });

    it('maps no vehicle id the catalogue does not know', () => {
      const known = new Set(VEHICLE_SPECS.map((spec) => spec.id));
      for (const id of vehicleTargets.keys()) {
        expect(known.has(id), `vehicle:${id} is not in any catalogue`).toBe(true);
      }
    });

    it('maps every industry except the procedural three (D-169)', () => {
      // CoalMine (headframe) and OilWell (derrick) per E-14; Farm because
      // no pinned kit carries a farmstead and a suburban house would be a
      // wrong silhouette. shapes.ts stays their source.
      const procedural = new Set(['CoalMine', 'OilWell', 'Farm']);
      const mapped = new Set(
        manifest.models
          .filter((model) => model.target.startsWith('industry:'))
          .map((model) => model.target.split(':')[1]!),
      );
      for (const name of Object.keys(IndustryType)) {
        if (procedural.has(name)) {
          expect(mapped.has(name), `industry:${name} must stay procedural`).toBe(false);
        } else {
          expect(mapped.has(name), `industry:${name}`).toBe(true);
        }
      }
      for (const name of mapped) {
        expect(Object.keys(IndustryType), `industry:${name} unknown`).toContain(name);
      }
    });

    it('covers all three town zones at both expansion stages', () => {
      const targets = new Set(
        manifest.models
          .filter((model) => model.target.startsWith('building:'))
          .map((model) => model.target),
      );
      for (const zone of ['residential', 'commercial', 'industrial']) {
        for (const stage of [0, 1]) {
          expect(targets.has(`building:${zone}:${stage}`), `building:${zone}:${stage}`).toBe(true);
        }
      }
      for (const target of targets) {
        const [, zone, stage] = target.split(':');
        expect(['residential', 'commercial', 'industrial'], target).toContain(zone);
        expect(['0', '1'], target).toContain(stage);
      }
    });

    it('covers every MapClimate with at least two tree variants', () => {
      const climates = Object.keys(MapClimate).map((name) => name.toLowerCase());
      const byClimate = new Map<string, number>();
      for (const model of manifest.models) {
        if (!model.target.startsWith('tree:')) continue;
        const climate = model.target.split(':')[1]!;
        expect(climates, model.target).toContain(climate);
        byClimate.set(climate, (byClimate.get(climate) ?? 0) + 1);
      }
      for (const climate of climates) {
        expect(byClimate.get(climate) ?? 0, `tree:${climate}`).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
