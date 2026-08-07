import { describe, expect, it } from 'vitest';
import {
  ATLAS_BUILD_BUDGET_MS,
  ATLAS_SCALE,
  atlasPageForZoom,
  baseAtlasSize,
  CELL_HEADROOM_STEPS,
  CELL_SKIRT_STEPS,
  DETAIL_ATLAS_SCALE,
  emissiveBuildingFrame,
  emissiveIndustryFrame,
  foamAtlasFrame,
  MAX_ATLAS_PX,
  planDetailAtlas,
  waterAtlasFrame,
} from '../../src/render/TerrainAtlas';
import { INDUSTRY_EMISSIVE_TYPES } from '../../src/render/industryArt';
import { FOAM_VARIANT_COUNT, WATER_FRAME_COUNT } from '../../src/render/water';
import { HEIGHT_PX, TILE_H } from '../../src/render/projection';
import { INDUSTRY_TYPE_COUNT, IndustryType } from '../../src/sim/industry/types';
import { SLOPE_COUNT, TERRAIN_COUNT } from '../../src/sim/map/terrain';

/**
 * The pure half of the per-zoom atlas pages (SPEC.md 16.2, SPEC2 M12): which
 * page a zoom reads, and the layout guards of both pages. The drawing itself
 * needs a canvas and stays untested here, exactly as the sprite pool always
 * was - but the guard that used to be a runtime throw on somebody else's
 * machine (a texture over 4096 px fails as a blank map, not an error) is held
 * against the real layout maths, headless.
 */

/** The zoom steps of SPEC.md 16.1, restated: MapView exports them, but
 * importing MapView would pull Pixi into the unit run (the D-136 rule). */
const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4] as const;

describe('atlas page selection', () => {
  it('serves the top zoom from the detail page, every other from the base', () => {
    expect(atlasPageForZoom(0.25)).toBe('base');
    expect(atlasPageForZoom(0.5)).toBe('base');
    expect(atlasPageForZoom(1)).toBe('base');
    expect(atlasPageForZoom(2)).toBe('base');
    expect(atlasPageForZoom(4)).toBe('detail');
  });

  it('switches exactly where the base page would start upscaling', () => {
    for (const zoom of ZOOM_LEVELS) {
      expect(atlasPageForZoom(zoom)).toBe(zoom > ATLAS_SCALE ? 'detail' : 'base');
    }
    // The detail page is drawn AT the top zoom - nothing above it exists.
    expect(DETAIL_ATLAS_SCALE).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });
});

describe('the base page layout guard', () => {
  it('stays inside the 4096 px GPU guarantee', () => {
    const size = baseAtlasSize();
    expect(size.width).toBeLessThanOrEqual(MAX_ATLAS_PX);
    expect(size.height).toBeLessThanOrEqual(MAX_ATLAS_PX);
  });

  it('matches the ledger booking of SPEC2 6.2 (2176x3648)', () => {
    // Growing the page is fine - but it is a BOOKING, made consciously in
    // SPEC2 6.2 and re-pinned here, never an accident (Fehlerkatalog 40).
    // 3648 is the original 2688 plus M12's four booked water rows (three
    // animation rows and the coastline foam row, D-164) plus M13's one
    // booked emissive row (window-only twins, D-172).
    expect(baseAtlasSize()).toEqual({ width: 2176, height: 3648 });
  });
});

describe('the water rows of the base page (D-164)', () => {
  const size = baseAtlasSize();
  const cellH = TILE_H * ATLAS_SCALE + 16 * ATLAS_SCALE * (CELL_HEADROOM_STEPS + CELL_SKIRT_STEPS);
  /** First M12 row; everything above is Bestand, the M13 emissive row below. */
  const bookedTop = size.height - 5 * cellH;
  const bookedBottom = size.height - cellH;

  it('spends exactly the four booked rows, inside the page', () => {
    for (let frame = 0; frame < WATER_FRAME_COUNT; frame++) {
      for (let slope = 0; slope < SLOPE_COUNT; slope++) {
        const cell = waterAtlasFrame(frame, slope);
        expect(cell.y, `w${frame}:${slope}`).toBeGreaterThanOrEqual(bookedTop);
        expect(cell.y + cell.height, `w${frame}:${slope}`).toBeLessThanOrEqual(bookedBottom);
        expect(cell.x + cell.width, `w${frame}:${slope}`).toBeLessThanOrEqual(size.width);
      }
    }
    for (let variant = 0; variant < FOAM_VARIANT_COUNT; variant++) {
      const cell = foamAtlasFrame(variant);
      expect(cell.y, `f${variant}`).toBeGreaterThanOrEqual(bookedTop);
      expect(cell.y + cell.height, `f${variant}`).toBeLessThanOrEqual(bookedBottom);
      expect(cell.x + cell.width, `f${variant}`).toBeLessThanOrEqual(size.width);
    }
    expect(WATER_FRAME_COUNT + 1).toBe(4);
  });

  it('never lets two water cells overlap', () => {
    const seen = new Set<string>();
    for (let frame = 0; frame < WATER_FRAME_COUNT; frame++) {
      for (let slope = 0; slope < SLOPE_COUNT; slope++) {
        const cell = waterAtlasFrame(frame, slope);
        seen.add(`${cell.x}:${cell.y}`);
      }
    }
    for (let variant = 0; variant < FOAM_VARIANT_COUNT; variant++) {
      const cell = foamAtlasFrame(variant);
      seen.add(`${cell.x}:${cell.y}`);
    }
    // Every cell sits on its own grid slot; a duplicate would collapse here.
    expect(seen.size).toBe(WATER_FRAME_COUNT * SLOPE_COUNT + FOAM_VARIANT_COUNT);
  });

  it('gives every frame the base cell geometry, so a swap moves nothing', () => {
    const reference = waterAtlasFrame(0, 0);
    expect(reference.anchorY).toBe(16 * ATLAS_SCALE * CELL_HEADROOM_STEPS);
    for (let frame = 0; frame < WATER_FRAME_COUNT; frame++) {
      for (let slope = 0; slope < SLOPE_COUNT; slope++) {
        const cell = waterAtlasFrame(frame, slope);
        expect(cell.width).toBe(reference.width);
        expect(cell.height).toBe(reference.height);
        expect(cell.anchorY).toBe(reference.anchorY);
        // The same slope reads the same column in every animation row, which
        // is what makes the swap a texture change and nothing else.
        expect(cell.x).toBe(waterAtlasFrame(0, slope).x);
      }
    }
    expect(foamAtlasFrame(0).anchorY).toBe(reference.anchorY);
  });
});

describe('the emissive row of the base page (M13, D-172)', () => {
  const size = baseAtlasSize();
  const cellH = TILE_H * ATLAS_SCALE + 16 * ATLAS_SCALE * (CELL_HEADROOM_STEPS + CELL_SKIRT_STEPS);
  /** The one booked M13 row: the last row of the page. */
  const bookedTop = size.height - cellH;

  it('spends exactly the one booked row, inside the page, without overlap', () => {
    const seen = new Set<string>();
    for (const kind of [1, 2, 3]) {
      for (const level of [1, 2]) {
        const cell = emissiveBuildingFrame(kind, level);
        expect(cell.y, `eb${kind}:${level}`).toBeGreaterThanOrEqual(bookedTop);
        expect(cell.y + cell.height, `eb${kind}:${level}`).toBeLessThanOrEqual(size.height);
        expect(cell.x + cell.width, `eb${kind}:${level}`).toBeLessThanOrEqual(size.width);
        seen.add(`${cell.x}:${cell.y}`);
      }
    }
    for (const type of INDUSTRY_EMISSIVE_TYPES) {
      const cell = emissiveIndustryFrame(type)!;
      expect(cell, `ei${type}`).not.toBeNull();
      expect(cell.y, `ei${type}`).toBeGreaterThanOrEqual(bookedTop);
      expect(cell.x + cell.width, `ei${type}`).toBeLessThanOrEqual(size.width);
      seen.add(`${cell.x}:${cell.y}`);
    }
    // Six building twins plus one cell per glazed industry, each on its own
    // grid slot - a duplicate would collapse here.
    expect(seen.size).toBe(6 + INDUSTRY_EMISSIVE_TYPES.length);
  });

  it('gives every twin the geometry of the cell it glows over', () => {
    // The twin composites ADDITIVELY over its base cell at the same world
    // position, so width, height and anchor must be the base cell's own -
    // any drift would slide the lit windows off the dark ones.
    const reference = waterAtlasFrame(0, 0); // the shared base cell geometry
    for (const kind of [1, 2, 3]) {
      for (const level of [1, 3]) {
        const cell = emissiveBuildingFrame(kind, level);
        expect(cell.width).toBe(reference.width);
        expect(cell.height).toBe(reference.height);
        expect(cell.anchorY).toBe(reference.anchorY);
      }
    }
    for (const type of INDUSTRY_EMISSIVE_TYPES) {
      const cell = emissiveIndustryFrame(type)!;
      expect(cell.width).toBe(reference.width);
      expect(cell.anchorY).toBe(reference.anchorY);
    }
  });

  it('mirrors the building-frame column formula, level threshold included', () => {
    for (const kind of [1, 2, 3]) {
      // Levels 1 and 2 split exactly where buildingFrame splits (>= 2).
      expect(emissiveBuildingFrame(kind, 1).x).not.toBe(emissiveBuildingFrame(kind, 2).x);
      expect(emissiveBuildingFrame(kind, 2).x).toBe(emissiveBuildingFrame(kind, 3).x);
    }
  });

  it('answers null for the unglazed industries - no glow is the honest cell', () => {
    expect(emissiveIndustryFrame(IndustryType.CoalMine)).toBeNull();
    expect(INDUSTRY_EMISSIVE_TYPES).toContain(IndustryType.FurnitureFactory);
    expect(INDUSTRY_EMISSIVE_TYPES).toContain(IndustryType.ElectronicsFactory);
    expect(INDUSTRY_EMISSIVE_TYPES).toContain(IndustryType.FoodFactory);
    for (const type of INDUSTRY_EMISSIVE_TYPES) {
      expect(type).toBeGreaterThanOrEqual(0);
      expect(type).toBeLessThan(INDUSTRY_TYPE_COUNT);
    }
  });
});

describe('the 4x detail page layout', () => {
  const plan = planDetailAtlas();
  const frames = [...plan.frames.entries()];

  /** Terrain, road and track cells - a digit follows the class letter, which
   * is what tells `t3:7` from `train` and `r5` from `railDepot`. */
  const isShortKey = (key: string): boolean => /^[trk]\d/.test(key);

  it('stays inside the 4096 px GPU guarantee', () => {
    expect(plan.width).toBeLessThanOrEqual(MAX_ATLAS_PX);
    expect(plan.height).toBeLessThanOrEqual(MAX_ATLAS_PX);
  });

  it('matches its ledger booking in SPEC2 6.2 (4096x3840)', () => {
    expect(plan.width).toBe(4096);
    expect(plan.height).toBe(3840);
  });

  it('holds every frame the base page serves', () => {
    const expected: string[] = [];
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      for (let slope = 0; slope < SLOPE_COUNT; slope++) expected.push(`t${terrain}:${slope}`);
    }
    for (let bits = 0; bits < 16; bits++) expected.push(`r${bits}`);
    for (let direction = 0; direction < 8; direction++) expected.push(`k${direction}`);
    for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) expected.push(`i${type}`);
    for (let variant = 0; variant < 6; variant++) expected.push(`b${variant}`);
    expected.push(
      'station',
      'depot',
      'vehicle',
      'platform',
      'railDepot',
      'train',
      'bridge',
      'signal',
    );

    for (const key of expected) {
      expect(plan.frames.has(key), key).toBe(true);
    }
    expect(plan.frames.size).toBe(expected.length);
  });

  it('packs every frame inside the page, without overlap', () => {
    for (const [key, frame] of frames) {
      expect(frame.x, key).toBeGreaterThanOrEqual(0);
      expect(frame.y, key).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width, key).toBeLessThanOrEqual(plan.width);
      expect(frame.y + frame.height, key).toBeLessThanOrEqual(plan.height);
      // The anchor is a point INSIDE the frame, at least one height step from
      // the top - a raised terrain corner needs the room.
      expect(frame.anchorY, key).toBeGreaterThanOrEqual(16 * DETAIL_ATLAS_SCALE);
      expect(frame.anchorY, key).toBeLessThan(frame.height);
    }
    for (let a = 0; a < frames.length; a++) {
      for (let b = a + 1; b < frames.length; b++) {
        const [keyA, fa] = frames[a]!;
        const [keyB, fb] = frames[b]!;
        const overlap =
          fa.x < fb.x + fb.width &&
          fb.x < fa.x + fa.width &&
          fa.y < fb.y + fb.height &&
          fb.y < fa.y + fa.height;
        expect(overlap, `${keyA} overlaps ${keyB}`).toBe(false);
      }
    }
  });

  it('keeps the tall cells world-identical to the base page', () => {
    // MapView's vehicle path places its sprite with a FIXED world offset that
    // was calibrated against the base page's cell geometry; this equality is
    // what lets it not know which page it draws from.
    const worldTallHeight = TILE_H + HEIGHT_PX * (CELL_HEADROOM_STEPS + CELL_SKIRT_STEPS);
    const worldTallAnchor = HEIGHT_PX * CELL_HEADROOM_STEPS;
    const tallKeys = frames.filter(([key]) => !isShortKey(key)).map(([key]) => key);
    expect(tallKeys.length).toBe(INDUSTRY_TYPE_COUNT + 6 + 8);

    for (const key of tallKeys) {
      const frame = plan.frames.get(key)!;
      expect(frame.height / DETAIL_ATLAS_SCALE, key).toBe(worldTallHeight);
      expect(frame.anchorY / DETAIL_ATLAS_SCALE, key).toBe(worldTallAnchor);
    }
  });

  it('gives the short rows one step of headroom and one of skirt', () => {
    for (const [key, frame] of frames) {
      if (!isShortKey(key)) continue;
      expect(frame.anchorY, key).toBe(16 * DETAIL_ATLAS_SCALE);
      expect(frame.height, key).toBe((TILE_H + 2 * 16) * DETAIL_ATLAS_SCALE);
    }
  });
});

describe('the startup budget slice', () => {
  it('is a small slice of the 3 s cold start of SPEC.md section 21', () => {
    expect(ATLAS_BUILD_BUDGET_MS).toBeGreaterThan(0);
    expect(ATLAS_BUILD_BUDGET_MS).toBeLessThanOrEqual(300);
  });
});
