import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MapClimate } from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import { Terrain } from '../../src/sim/map/terrain';
import type { TileMap } from '../../src/sim/map/TileMap';
import { MODULE_KIND_COUNT, ModuleKind } from '../../src/sim/station/types';
import { BuildingKind } from '../../src/sim/town/types';
import type { BakedAtlasManifest, BakedCell, BakedPage } from '../../src/render/bakedAtlas';
import {
  bakedEmitterCount,
  bakedEmitterPoint,
  BAKED_STATIC_MAX_LIFT_PX,
  buildStaticIndex,
  buildingStageFor,
  buildingTargetFor,
  BUILDING_STAGE_TWO_LEVEL,
  BUILDING_VARIANT_SALT,
  FOREST_DENSITY_SALT,
  FOREST_STAND_TILES,
  FOREST_TREE_SCALE_JITTER,
  FOREST_TREE_SLOTS,
  forestDensityAt,
  forestTreeAt,
  industryTargetFor,
  isWoodedTile,
  moduleTargetFor,
  PROCEDURAL_ONLY_INDUSTRIES,
  PROCEDURAL_ONLY_MODULES,
  staticVariantFor,
  STATIC_FACING,
  tileVariantSeed,
  treeTargetFor,
  TREE_JITTER_SALT,
  TREE_VARIANT_SALT,
} from '../../src/render/staticArt';
import { CHUNK_ART_HEADROOM_PX, chunkAabb } from '../../src/render/chunks';
import { CELL_HEADROOM_STEPS, emissiveBuildingFrame } from '../../src/render/TerrainAtlas';
import { tallestTownCellLiftPx, TownEra } from '../../src/render/townEra';
import { HEIGHT_PX, TILE_H, TILE_W } from '../../src/render/projection';
import { HEIGHT_STEP_M } from '../../src/sim/constants';

/**
 * The pure half of M13's static-art bundle: the target grammar the manifest
 * and the game agree on, the manifest index, the deterministic per-TILE
 * variant pick and - the part that matters most - the per-entry fallback
 * decisions. MapView only executes what these functions decide, so this is
 * where the policy is held: no Pixi, no fetch, no canvas.
 *
 * SPEC2's M13 section ordered "Gebaeude-, Stadt- und Industrie-Sprites aus dem
 * Kenney-Bake", and its Fertig-wenn sentence tested only vehicles, consists,
 * night lighting, signal aspects, the industry level and the repo glob - so a
 * bake that rendered 2,430 cells and a renderer that consumed only the 760
 * vehicle ones passed acceptance. These assertions are what makes the other
 * three families load-bearing.
 */

const MANIFEST_PATH = new URL('../../tools/assets-manifest.json', import.meta.url);
const BAKED_MANIFEST_PATH = new URL(
  '../../public/assets-baked/baked-manifest.json',
  import.meta.url,
);

interface ManifestModel {
  readonly target: string;
}

const sourceManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  readonly models: readonly ManifestModel[];
};

/**
 * The tallest thing `TerrainAtlas.drawTownBuilding` puts on a tile, measured
 * from the tile centre in tile heights - the stage-1 commercial block, whose
 * roof diamond's far corner is 71.56 atlas px above the centre at
 * ATLAS_SCALE 2, i.e. 35.78 world px against TILE_H = 32.
 *
 * It is the REFERENCE the game was balanced and read against and it is still
 * the fallback, so a baked town that runs away from it is a town that changes
 * shape when a fetch completes (D-206). Analytic from `drawTownBuilding` plus
 * `shapes.ts`'s own `box` geometry; the six procedural cells measure 0.62,
 * 0.89 (residential), 0.72, 1.12 (commercial), 0.51 and 0.66 (industrial).
 * [tile heights]
 */
const PROCEDURAL_TOWN_MAX_LIFT_TILE_HEIGHTS = 35.78 / 32;

/**
 * The same reference, COMPUTED from the drawing rather than copied off it -
 * and only for the GABLE era (SPEC2 M23).
 *
 * The number above was read off `drawTownBuilding` by hand when the drawing
 * had one era in it. It has three since M23, so the comparison against the
 * BAKE has to name which one it means: the bake's town cells are the Kenney
 * city kits' one century, the era axis in the bake is not booked yet
 * (`townEra.ts`), and comparing the mid-century models against a 2049 curtain
 * wall would be comparing two different towns. `townCellLiftPx` is an upper
 * BOUND (it uses the full diamond half-width for the roof plant too), which is
 * why it comes out a few per cent over the hand measurement - the safe
 * direction for a guard.
 */
const GABLE_TOWN_MAX_LIFT_TILE_HEIGHTS = tallestTownCellLiftPx([TownEra.Gable]) / TILE_H;

/** The bake on disk, or null - it is a gitignored build artifact (E-14). */
function readBakedManifest(): BakedAtlasManifest | null {
  try {
    return JSON.parse(readFileSync(BAKED_MANIFEST_PATH, 'utf8')) as BakedAtlasManifest;
  } catch {
    return null;
  }
}

function cell(target: string, over: Partial<BakedCell> = {}): BakedCell {
  return {
    target,
    facing: STATIC_FACING,
    x: 0,
    y: 0,
    width: 32,
    height: 48,
    anchorX: 16,
    anchorY: 40,
    maskX: 32,
    maskY: 0,
    ...over,
  };
}

function page(file: string, zoom: number, cells: readonly BakedCell[]): BakedPage {
  return { file, zoom, width: 4096, height: 4096, cells };
}

function manifest(pages: readonly BakedPage[]): BakedAtlasManifest {
  return { version: 2, zooms: [...new Set(pages.map((entry) => entry.zoom))], pages };
}

function indexOf(cells: readonly BakedCell[], zoom = 1) {
  const built = buildStaticIndex(manifest([page('p0.png', zoom, cells)]));
  return built.find((entry) => entry.zoom === zoom) ?? null;
}

describe('the target grammar is the manifest`s own (D-169)', () => {
  it('keys a town building by zone and expansion stage', () => {
    expect(buildingTargetFor(BuildingKind.Residential, 1)).toBe('building:residential:0');
    expect(buildingTargetFor(BuildingKind.Residential, 2)).toBe('building:residential:1');
    expect(buildingTargetFor(BuildingKind.Commercial, 0)).toBe('building:commercial:0');
    expect(buildingTargetFor(BuildingKind.Industrial, 3)).toBe('building:industrial:1');
  });

  it('answers null for an empty tile and for a kind the enum does not know', () => {
    expect(buildingTargetFor(BuildingKind.None, 2)).toBeNull();
    expect(buildingTargetFor(9, 1)).toBeNull();
    expect(buildingTargetFor(-1, 1)).toBeNull();
  });

  it('splits the two expansion stages exactly where the procedural atlas does', () => {
    // The baked stage and the procedural cell must never disagree about what
    // a grown building is: a tile that draws the tall Kenney block while its
    // fallback would have drawn the small procedural one is a silhouette that
    // changes when the bake finishes loading.
    for (const kind of [
      BuildingKind.Residential,
      BuildingKind.Commercial,
      BuildingKind.Industrial,
    ]) {
      const stage0X = emissiveBuildingFrame(kind, 0).x;
      const stage1X = emissiveBuildingFrame(kind, BUILDING_STAGE_TWO_LEVEL).x;
      expect(stage0X).not.toBe(stage1X);
      for (let level = 0; level <= 5; level++) {
        expect(emissiveBuildingFrame(kind, level).x).toBe(
          buildingStageFor(level) === 0 ? stage0X : stage1X,
        );
      }
    }
  });

  it('keys an industry by its type NAME, which is what the manifest wrote', () => {
    expect(industryTargetFor(IndustryType.PowerPlant)).toBe('industry:PowerPlant');
    expect(industryTargetFor(IndustryType.BuildersMerchant)).toBe('industry:BuildersMerchant');
    expect(industryTargetFor(999)).toBeNull();
  });

  it('keys a station module by its ModuleKind NAME, the industry device one enum along (D-208)', () => {
    expect(moduleTargetFor(ModuleKind.BusStop)).toBe('module:BusStop');
    expect(moduleTargetFor(ModuleKind.RailPlatform)).toBe('module:RailPlatform');
    expect(moduleTargetFor(ModuleKind.InternationalAirport)).toBe('module:InternationalAirport');
    expect(moduleTargetFor(MODULE_KIND_COUNT)).toBeNull();
    expect(moduleTargetFor(-1)).toBeNull();
  });

  it('keys a tree family by climate, and is total for an unknown one', () => {
    expect(treeTargetFor(MapClimate.Temperate)).toBe('tree:temperate');
    expect(treeTargetFor(MapClimate.Arctic)).toBe('tree:arctic');
    expect(treeTargetFor(MapClimate.Tropical)).toBe('tree:tropical');
    expect(treeTargetFor(MapClimate.Desert)).toBe('tree:desert');
    // A bald forest would be a worse lie than the wrong species.
    expect(treeTargetFor(42)).toBe('tree:temperate');
  });
});

describe('the three procedural-only industries (E-14, D-169)', () => {
  it('names exactly the coal mine, the oil well and the farm', () => {
    expect([...PROCEDURAL_ONLY_INDUSTRIES].sort((a, b) => a - b)).toEqual(
      [IndustryType.CoalMine, IndustryType.OilWell, IndustryType.Farm].sort((a, b) => a - b),
    );
  });

  it('refuses a baked cell for them even when the manifest offers one', () => {
    // The refusal lives in `industryTargetFor`, one level BEFORE the index -
    // so a model mapped onto `industry:Farm` tomorrow still draws the D-117
    // farmstead, and the headframe and the derrick keep their silhouettes.
    const planted = indexOf([
      cell('industry:Farm'),
      cell('industry:CoalMine'),
      cell('industry:OilWell'),
      cell('industry:Sawmill'),
    ]);
    for (const type of PROCEDURAL_ONLY_INDUSTRIES) {
      expect(industryTargetFor(type), `industry ${type}`).toBeNull();
      expect(staticVariantFor(planted, industryTargetFor(type), 0)).toBeNull();
    }
    expect(staticVariantFor(planted, industryTargetFor(IndustryType.Sawmill), 0)).not.toBeNull();
  });

  it('agrees with the manifest in both directions (the D-160 coupling device)', () => {
    const mapped = new Set(
      sourceManifest.models
        .filter((model) => model.target.startsWith('industry:'))
        .map((model) => model.target.split(':')[1]!),
    );
    for (const [name, type] of Object.entries(IndustryType)) {
      const procedural = PROCEDURAL_ONLY_INDUSTRIES.has(type);
      expect(mapped.has(name), `industry:${name} mapped`).toBe(!procedural);
      expect(industryTargetFor(type) === null, `industry:${name} refused`).toBe(procedural);
    }
  });
});

describe('the station modules the player builds (D-208)', () => {
  /** Module kind names as the manifest wrote them, from the enum itself. */
  const moduleNames = new Map<number, string>(
    Object.entries(ModuleKind).map(([name, value]) => [value, name]),
  );

  it('covers every ModuleKind - the enum is complete and the count agrees', () => {
    expect(moduleNames.size).toBe(MODULE_KIND_COUNT);
    for (let kind = 0; kind < MODULE_KIND_COUNT; kind++) {
      expect(moduleNames.has(kind), `ModuleKind ${kind}`).toBe(true);
    }
  });

  it('names no procedural-only kind today, and that is what makes an unmapped kind red', () => {
    // The set is the extension point, not a hole: every kind is mapped, so
    // it is EMPTY - and the both-directions audit below turns a kind that
    // loses its model into a failing build rather than into the orange box
    // that shipped from M12 to D-208.
    expect([...PROCEDURAL_ONLY_MODULES]).toEqual([]);
  });

  it('agrees with the manifest in BOTH directions (the D-160/D-169 coupling device)', () => {
    const mapped = new Set(
      sourceManifest.models
        .filter((model) => model.target.startsWith('module:'))
        .map((model) => model.target.split(':')[1]!),
    );
    // Direction 1: every kind the simulation can build has art, or is on the
    // documented procedural list.
    for (const [kind, name] of moduleNames) {
      const procedural = PROCEDURAL_ONLY_MODULES.has(kind);
      expect(mapped.has(name), `module:${name} mapped`).toBe(!procedural);
      expect(moduleTargetFor(kind) === null, `module:${name} refused`).toBe(procedural);
    }
    // Direction 2: the manifest names no module the simulation does not have.
    for (const name of mapped) {
      expect([...moduleNames.values()], `module:${name} unknown`).toContain(name);
    }
  });

  it('resolves every kind to its own cell, and never to another kind`s', () => {
    const planted = indexOf([...moduleNames.values()].map((name) => cell(`module:${name}`)));
    const seen = new Set<string>();
    for (const [kind, name] of moduleNames) {
      const variant = staticVariantFor(planted, moduleTargetFor(kind), 0);
      expect(variant, `module:${name}`).not.toBeNull();
      expect(variant!.cell.target).toBe(`module:${name}`);
      seen.add(variant!.cell.target);
    }
    expect(seen.size).toBe(MODULE_KIND_COUNT);
  });

  it('falls back per entry: no bake, no index, an unmapped kind - all the box', () => {
    // The three floors of E-14, one level down (D-205's shape): no manifest
    // at all, a manifest without this family, and a kind the manifest never
    // named. Each answers null, which is MapView's instruction to draw
    // `moduleFrame`'s procedural cell.
    expect(staticVariantFor(null, moduleTargetFor(ModuleKind.Quay), 0)).toBeNull();
    const withoutModules = indexOf([cell('building:residential:0'), cell('industry:Sawmill')]);
    expect(staticVariantFor(withoutModules, moduleTargetFor(ModuleKind.Quay), 0)).toBeNull();
    const partial = indexOf([cell('module:Quay')]);
    expect(staticVariantFor(partial, moduleTargetFor(ModuleKind.Quay), 0)).not.toBeNull();
    expect(staticVariantFor(partial, moduleTargetFor(ModuleKind.Airport), 0)).toBeNull();
  });

  it('keeps `module:` out of the other three grammars and them out of it', () => {
    // `module:Airport` and `industry:PowerPlant` have the same SHAPE, so the
    // index has to key them apart or a station would draw a works.
    const mixed = indexOf([
      cell('module:Airport', { x: 0 }),
      cell('industry:PowerPlant', { x: 40 }),
      cell('building:commercial:1', { x: 80 }),
      cell('tree:temperate:0', { x: 120 }),
    ]);
    expect(staticVariantFor(mixed, 'module:Airport', 0)!.cell.x).toBe(0);
    expect(staticVariantFor(mixed, 'industry:PowerPlant', 0)!.cell.x).toBe(40);
    expect(staticVariantFor(mixed, 'module:PowerPlant', 0)).toBeNull();
    expect(staticVariantFor(mixed, 'industry:Airport', 0)).toBeNull();
  });

  it('holds the proportion table of the real bake, when one is on disk', () => {
    // Developer-machine check (the bake is a gitignored build artifact,
    // E-14); the rule itself is enforced in tools/bake-lib.ts and proved on
    // synthetic geometry in assetsBake.spec.ts. What this adds is the shape
    // of the FAMILY: a station module stands on ONE tile, so it may be no
    // taller than the headroom and no wider than its tile.
    const baked = readBakedManifest();
    if (baked === null) return;
    const lifts = new Map<string, number>();
    const widths = new Map<string, number>();
    for (const bakedPage of baked.pages) {
      if (bakedPage.kind === 'emissive') continue;
      for (const bakedCell of bakedPage.cells) {
        if (!bakedCell.target.startsWith('module:')) continue;
        expect(bakedCell.facing, bakedCell.target).toBe(STATIC_FACING);
        const lift = bakedCell.anchorY / bakedPage.zoom;
        const width = bakedCell.width / bakedPage.zoom;
        expect(lift, `${bakedCell.target} at zoom ${bakedPage.zoom}`).toBeLessThanOrEqual(
          BAKED_STATIC_MAX_LIFT_PX,
        );
        lifts.set(bakedCell.target, Math.max(lifts.get(bakedCell.target) ?? 0, lift));
        widths.set(bakedCell.target, Math.max(widths.get(bakedCell.target) ?? 0, width));
      }
    }
    if (lifts.size === 0) return;
    expect(lifts.size).toBe(MODULE_KIND_COUNT - PROCEDURAL_ONLY_MODULES.size);
    for (const [target, width] of widths) {
      // A module covers its tile at most: the contact shadow adds a margin,
      // so the bound is the tile plus one margin rather than the tile.
      expect(width / TILE_W, `${target} width`).toBeLessThanOrEqual(1);
      // ... and is not a speck either. The smallest is the bus shelter.
      expect(width / TILE_W, `${target} width`).toBeGreaterThan(0.25);
    }
    // The freight crane is the landmark of the family and the bus stop its
    // smallest mark: the ladder is deliberate and is what tells thirteen
    // modules apart in a still image (D-117 applied to what the PLAYER builds).
    const tallest = [...lifts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const shortest = [...lifts.entries()].sort((a, b) => a[1] - b[1])[0]!;
    expect(tallest[0]).toBe('module:FreightTerminal');
    expect(shortest[0]).toBe('module:BusStop');
    expect(tallest[1] / shortest[1]).toBeGreaterThan(2);
    // An international airport is bigger than an airport, which is bigger
    // than an airstrip - the size ladder the player pays for, in pixels.
    expect(lifts.get('module:InternationalAirport')!).toBeGreaterThan(lifts.get('module:Airport')!);
    expect(widths.get('module:InternationalAirport')!).toBeGreaterThan(
      widths.get('module:Airport')!,
    );
    expect(widths.get('module:Airport')!).toBeGreaterThan(widths.get('module:Airstrip')!);
  });
});

describe('the manifest index', () => {
  it('groups the declared variants of one base target in suffix order', () => {
    const index = indexOf([
      cell('building:residential:0:2', { x: 20 }),
      cell('building:residential:0', { x: 0 }),
      cell('building:residential:0:1', { x: 10 }),
    ]);
    const variants = index!.byTarget.get('building:residential:0')!;
    expect(variants).toHaveLength(3);
    expect(variants.map((entry) => entry.cell.x)).toEqual([0, 10, 20]);
  });

  it('reads a tree`s mandatory index as the variant, not as a stage', () => {
    const index = indexOf([cell('tree:temperate:0'), cell('tree:temperate:1')]);
    expect(index!.byTarget.get('tree:temperate')).toHaveLength(2);
    expect(index!.byTarget.has('tree:temperate:0')).toBe(false);
  });

  it('skips a cell that is not static art', () => {
    const index = indexOf([
      cell('vehicle:1000'),
      cell('building:residential:0'),
      cell('nonsense'),
      cell('building:residential:0:x'),
    ]);
    expect([...index!.byTarget.keys()]).toEqual(['building:residential:0']);
  });

  it('skips a static cell claiming a driving facing', () => {
    // `facings: 1` is the manifest contract for everything that stands still;
    // a cell with facing 3 is a vehicle cell whose target was mistyped, and
    // drawing a building from it would be a wrong silhouette.
    // Nothing static in the manifest means no index for that zoom at all -
    // the whole-atlas fallback of E-14, reached without a special case.
    expect(indexOf([cell('building:commercial:1', { facing: 3 })])).toBeNull();
    const mixed = indexOf([
      cell('building:commercial:1', { facing: 3 }),
      cell('building:residential:0'),
    ]);
    expect([...mixed!.byTarget.keys()]).toEqual(['building:residential:0']);
  });

  it('keeps the zooms apart and sorts them ascending', () => {
    const built = buildStaticIndex(
      manifest([
        page('p2.png', 2, [cell('tree:arctic:0')]),
        page('p1.png', 1, [cell('tree:arctic:0'), cell('tree:arctic:1')]),
      ]),
    );
    expect(built.map((entry) => entry.zoom)).toEqual([1, 2]);
    expect(built[0]!.byTarget.get('tree:arctic')).toHaveLength(2);
    expect(built[1]!.byTarget.get('tree:arctic')).toHaveLength(1);
  });
});

describe('the per-entry fallback (E-14`s floor one level down)', () => {
  it('answers null without a bake at all', () => {
    expect(staticVariantFor(null, 'building:residential:0', 7)).toBeNull();
  });

  it('answers null for a null target', () => {
    const index = indexOf([cell('building:residential:0')]);
    expect(staticVariantFor(index, null, 7)).toBeNull();
  });

  it('answers null for a base target the manifest never mapped', () => {
    const index = indexOf([cell('building:residential:0')]);
    expect(staticVariantFor(index, 'building:commercial:1', 7)).toBeNull();
    expect(staticVariantFor(index, 'tree:desert', 7)).toBeNull();
  });

  it('picks a declared variant and picks the SAME one every time', () => {
    const index = indexOf([
      cell('building:commercial:0', { x: 0 }),
      cell('building:commercial:0:1', { x: 10 }),
      cell('building:commercial:0:2', { x: 20 }),
    ]);
    for (const seed of [0, 1, 4711, 999_983, -3]) {
      const first = staticVariantFor(index, 'building:commercial:0', seed);
      const second = staticVariantFor(index, 'building:commercial:0', seed);
      expect(first).not.toBeNull();
      expect(first!.cell.x).toBe(second!.cell.x);
    }
  });

  it('spreads a street over the declared variants', () => {
    const index = indexOf([
      cell('building:residential:0', { x: 0 }),
      cell('building:residential:0:1', { x: 10 }),
      cell('building:residential:0:2', { x: 20 }),
      cell('building:residential:0:3', { x: 30 }),
    ]);
    const seen = new Set<number>();
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        const pick = staticVariantFor(
          index,
          'building:residential:0',
          tileVariantSeed(x, y, BUILDING_VARIANT_SALT),
        );
        seen.add(pick!.cell.x);
      }
    }
    expect(seen.size).toBe(4);
  });
});

describe('the per-tile variance is a hash, never a draw', () => {
  it('is a pure function of tile and salt', () => {
    expect(tileVariantSeed(12, 34, BUILDING_VARIANT_SALT)).toBe(
      tileVariantSeed(12, 34, BUILDING_VARIANT_SALT),
    );
    expect(tileVariantSeed(12, 34, BUILDING_VARIANT_SALT)).not.toBe(
      tileVariantSeed(34, 12, BUILDING_VARIANT_SALT),
    );
    expect(tileVariantSeed(12, 34, BUILDING_VARIANT_SALT)).not.toBe(
      tileVariantSeed(12, 34, TREE_VARIANT_SALT),
    );
  });

  it('stays an unsigned 32-bit integer for every tile of the biggest map', () => {
    for (const [x, y] of [
      [0, 0],
      [2047, 2047],
      [0, 2047],
      [1024, 7],
    ] as const) {
      const seed = tileVariantSeed(x, y, TREE_JITTER_SALT);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('the trees on a forest tile', () => {
  const out = [0, 0, 0];

  it('places its slots back to front, so insertion order IS the painter order', () => {
    // The trees of one tile share one drawOrder key - the key is per tile and
    // per layer - so what orders them is Pixi's stable sort over insertion
    // order. Every slot is checked whether or not it grows anything: a
    // skipped slot leaves the order of the rest intact BY CONSTRUCTION, which
    // is the whole reason the density of D-209 needed no reordering.
    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 24; y++) {
        let previous = -Infinity;
        for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
          forestTreeAt(x, y, slot, 1, out);
          const depth = out[0]! + out[1]!;
          expect(depth, `tile ${x},${y} slot ${slot}`).toBeGreaterThan(previous);
          previous = depth;
        }
      }
    }
  });

  it('keeps every tree inside its own tile', () => {
    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 24; y++) {
        for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
          forestTreeAt(x, y, slot, 1, out);
          expect(Math.abs(out[0]!)).toBeLessThan(0.5);
          expect(Math.abs(out[1]!)).toBeLessThan(0.5);
        }
      }
    }
  });

  it('has no net lateral bias, so a wood is not drawn off-centre everywhere', () => {
    // The M13/D-206 slot table averaged (+0.08, -0.08): every wooded tile in
    // the game drew its trees 5.1 world px right of the tile centre. A
    // constant offset repeated across a continent is a lattice signature of
    // its own, and it is a property of the TABLE, so it is checked at density
    // 1 where every slot grows.
    let sumU = 0;
    let sumV = 0;
    let count = 0;
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
          forestTreeAt(x, y, slot, 1, out);
          sumU += out[0]!;
          sumV += out[1]!;
          count++;
        }
      }
    }
    expect(sumU / count).toBeCloseTo(0, 2);
    expect(sumV / count).toBeCloseTo(0, 2);
  });

  it('jitters deterministically and differently per tile', () => {
    forestTreeAt(5, 9, 0, 1, out);
    const first = [out[0]!, out[1]!, out[2]!] as const;
    forestTreeAt(5, 9, 0, 1, out);
    expect([out[0], out[1], out[2]]).toEqual([first[0], first[1], first[2]]);
    forestTreeAt(6, 9, 0, 1, out);
    expect([out[0], out[1], out[2]]).not.toEqual([first[0], first[1], first[2]]);
  });

  it('scatters far more ACROSS the depth axis than along it (D-206)', () => {
    // The depth key reads (u + v) and nothing else, so a displacement of +l
    // on u and -l on v is invisible to the painter order - which is what lets
    // the LATERAL scatter be much wider than the depth one without touching
    // the disjoint-band proof above.
    let lateralSpan = 0;
    let depthSpan = 0;
    for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
      let lateralMin = Infinity;
      let lateralMax = -Infinity;
      let depthMin = Infinity;
      let depthMax = -Infinity;
      for (let x = 0; x < 48; x++) {
        for (let y = 0; y < 48; y++) {
          forestTreeAt(x, y, slot, 1, out);
          const lateral = out[0]! - out[1]!;
          const depth = out[0]! + out[1]!;
          if (lateral < lateralMin) lateralMin = lateral;
          if (lateral > lateralMax) lateralMax = lateral;
          if (depth < depthMin) depthMin = depth;
          if (depth > depthMax) depthMax = depth;
        }
      }
      lateralSpan = Math.max(lateralSpan, lateralMax - lateralMin);
      depthSpan = Math.max(depthSpan, depthMax - depthMin);
    }
    // 2 * 2 * 0.17 across against 2 * 2 * 0.06 along, both in tile units.
    expect(lateralSpan).toBeGreaterThan(0.6);
    expect(lateralSpan).toBeCloseTo(4 * 0.17, 2);
    expect(depthSpan).toBeCloseTo(4 * 0.06, 2);
    // The narrowest gap between two slot bands is 0.34, so the depth span
    // may not reach it or two trees of one tile could swap places.
    expect(depthSpan).toBeLessThan(0.34);
  });

  it('sizes every instance off its cell, over a range that spans the jitter', () => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
          forestTreeAt(x, y, slot, 1, out);
          const size = out[2]!;
          if (size < min) min = size;
          if (size > max) max = size;
          sum += size;
          count++;
        }
      }
    }
    expect(min).toBeGreaterThanOrEqual(1 - FOREST_TREE_SCALE_JITTER);
    expect(max).toBeLessThanOrEqual(1 + FOREST_TREE_SCALE_JITTER);
    // The whole point is that the range is USED - a jitter that never leaves
    // the middle would be four rubber stamps again.
    expect(max - min).toBeGreaterThan(2 * FOREST_TREE_SCALE_JITTER * 0.95);
    expect(sum / count).toBeCloseTo(1, 2);
  });
});

describe('the stand density that gives a wood clearings and edges (D-209)', () => {
  const out = [0, 0, 0];

  /** Trees actually placed on one tile, which is what the renderer draws. */
  function treesOn(x: number, y: number): number {
    const density = forestDensityAt(x, y);
    let count = 0;
    for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
      if (forestTreeAt(x, y, slot, density, out)) count++;
    }
    return count;
  }

  it('stays inside its declared band and is a pure function of the tile', () => {
    for (let x = 0; x < 200; x += 7) {
      for (let y = 0; y < 200; y += 3) {
        const density = forestDensityAt(x, y);
        expect(density).toBeGreaterThanOrEqual(0);
        expect(density).toBeLessThanOrEqual(1);
        expect(forestDensityAt(x, y)).toBe(density);
      }
    }
  });

  it('is SMOOTH - neighbours are alike and distant tiles are not', () => {
    // This is the difference between woodland and salt-and-pepper: a density
    // that jumped per tile would scatter single empty tiles through the wood
    // instead of opening clearings in it.
    let nearSum = 0;
    let farSum = 0;
    let samples = 0;
    for (let x = 1; x < 128; x++) {
      for (let y = 1; y < 128; y++) {
        const here = forestDensityAt(x, y);
        nearSum += Math.abs(here - forestDensityAt(x + 1, y));
        farSum += Math.abs(here - forestDensityAt(x + FOREST_STAND_TILES * 2, y));
        samples++;
      }
    }
    const near = nearSum / samples;
    const far = farSum / samples;
    expect(near).toBeLessThan(far / 4);
  });

  it('opens clearings and closes stands, over a scale a viewport can see', () => {
    // A stand is FOREST_STAND_TILES across, so a 33-tile viewport at zoom 2
    // holds about four of them: the wood in front of the player must contain
    // both a thin patch and a thick one, or the carpet is back.
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < 33; x++) {
      for (let y = 0; y < 33; y++) {
        const density = forestDensityAt(x, y);
        if (density < min) min = density;
        if (density > max) max = density;
      }
    }
    expect(max - min).toBeGreaterThan(0.4);
  });

  it('draws FEWER trees than M13 did, and never the same number everywhere', () => {
    // The measured mean is what makes this bundle cheaper than the constant
    // three it replaces, and the histogram is what makes a wood a wood. Both
    // are pinned: a future tweak that quietly doubles the placement count is
    // a red test, not a slow frame nobody traced.
    const histogram = new Array<number>(FOREST_TREE_SLOTS + 1).fill(0);
    let total = 0;
    let tiles = 0;
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 256; y++) {
        const count = treesOn(x, y);
        histogram[count]!++;
        total += count;
        tiles++;
      }
    }
    const mean = total / tiles;
    expect(mean).toBeGreaterThan(2.0);
    expect(mean).toBeLessThan(2.6);
    // Strictly fewer placements than the three M13 put on every wooded tile.
    expect(mean).toBeLessThan(3);
    // Every count occurs, including the empty tile - a wood with no gaps in
    // it is the wallpaper the owner reported.
    for (let count = 0; count <= FOREST_TREE_SLOTS; count++) {
      expect(histogram[count], `tiles carrying ${count} trees`).toBeGreaterThan(0);
    }
    // ... and no single count owns the map the way 3 owned it before.
    for (let count = 0; count <= FOREST_TREE_SLOTS; count++) {
      expect(histogram[count]! / tiles, `share carrying ${count}`).toBeLessThan(0.5);
    }
  });

  it('makes a thin patch measurably thinner than a thick one', () => {
    // The property that matters is CORRELATION: the tiles around a
    // low-density lattice cell must be emptier than the tiles around a high
    // one, or the variance is just noise with extra steps.
    let thinnest = { x: 0, y: 0, density: Infinity };
    let thickest = { x: 0, y: 0, density: -Infinity };
    for (let x = 0; x < 256; x += FOREST_STAND_TILES) {
      for (let y = 0; y < 256; y += FOREST_STAND_TILES) {
        const density = forestDensityAt(x, y);
        if (density < thinnest.density) thinnest = { x, y, density };
        if (density > thickest.density) thickest = { x, y, density };
      }
    }
    function patchMean(cx: number, cy: number): number {
      let sum = 0;
      let n = 0;
      for (let x = cx - 2; x <= cx + 2; x++) {
        for (let y = cy - 2; y <= cy + 2; y++) {
          if (x < 0 || y < 0) continue;
          sum += treesOn(x, y);
          n++;
        }
      }
      return sum / n;
    }
    expect(patchMean(thickest.x, thickest.y)).toBeGreaterThan(
      patchMean(thinnest.x, thinnest.y) * 2,
    );
  });

  it('gives one tile a hundred thousand possible woods, where M13 gave it one', () => {
    // The wallpaper was that every wooded tile drew the SAME three slot
    // centres. What a tile draws now is a subset of four slots, each with its
    // own body, size and place - so two neighbouring tiles agreeing is an
    // event rather than the rule. Counted here on the two facts a screenshot
    // shows at a glance: how many trees, and which slots they stand in.
    const arrangements = new Set<number>();
    for (let x = 0; x < 128; x++) {
      for (let y = 0; y < 128; y++) {
        const density = forestDensityAt(x, y);
        let mask = 0;
        for (let slot = 0; slot < FOREST_TREE_SLOTS; slot++) {
          if (forestTreeAt(x, y, slot, density, out)) mask |= 1 << slot;
        }
        arrangements.add(mask);
      }
    }
    expect(arrangements.size).toBe(1 << FOREST_TREE_SLOTS);
  });

  it('salts the field apart from the body and the jitter', () => {
    // Three independent facts about a tile: which bodies, where they stand,
    // and how many. Sharing a salt would tie them together and the eye finds
    // that too.
    expect(FOREST_DENSITY_SALT).not.toBe(TREE_VARIANT_SALT);
    expect(FOREST_DENSITY_SALT).not.toBe(TREE_JITTER_SALT);
    expect(FOREST_DENSITY_SALT).not.toBe(BUILDING_VARIANT_SALT);
  });
});

describe('which tiles grow trees', () => {
  function fakeMap(over: Partial<Record<'roadBits' | 'trackBits' | 'buildingKind', number>>) {
    return {
      roadBits: Uint8Array.of(over.roadBits ?? 0),
      trackBits: Uint8Array.of(over.trackBits ?? 0),
      buildingKind: Uint8Array.of(over.buildingKind ?? 0),
    } as unknown as TileMap;
  }

  it('takes untouched forest and nothing else', () => {
    expect(isWoodedTile(fakeMap({}), 0, Terrain.Forest)).toBe(true);
    expect(isWoodedTile(fakeMap({}), 0, Terrain.Grass)).toBe(false);
    expect(isWoodedTile(fakeMap({ roadBits: 3 }), 0, Terrain.Forest)).toBe(false);
    expect(isWoodedTile(fakeMap({ trackBits: 1 }), 0, Terrain.Forest)).toBe(false);
    expect(
      isWoodedTile(fakeMap({ buildingKind: BuildingKind.Residential }), 0, Terrain.Forest),
    ).toBe(false);
  });
});

describe('the emitter points a baked cell carries (D-169, D-174)', () => {
  it('reads the chimney anchors in a fixed order and stops where the model does', () => {
    const twoStacks = cell('industry:Refinery', {
      points: { chimney: [17.9, 5.2], chimney2: [9.5, 1.0] },
    });
    expect(bakedEmitterCount(twoStacks)).toBe(2);
    expect(bakedEmitterPoint(twoStacks, 0)).toEqual([17.9, 5.2]);
    expect(bakedEmitterPoint(twoStacks, 1)).toEqual([9.5, 1.0]);
    expect(bakedEmitterPoint(twoStacks, 2)).toBeNull();
  });

  it('answers none for a model with no stack, so a baked works never smokes from thin air', () => {
    const plain = cell('industry:FurnitureFactory');
    expect(bakedEmitterCount(plain)).toBe(0);
    expect(bakedEmitterPoint(plain, 0)).toBeNull();
  });
});

describe('the static-art proportion rule (D-206)', () => {
  it("IS the procedural atlas cell's own drawable headroom, not a taste", () => {
    // The rule's whole authority is that it is a number the game already
    // had: a procedural cell reserves CELL_HEADROOM_STEPS height steps above
    // its tile diamond, and a baked cell's anchorY is measured from the tile
    // CENTRE, half a diamond further down. Restating it here rather than
    // importing TerrainAtlas into staticArt keeps the pure module pure - and
    // this assertion is what stops the two from drifting (the D-160 device).
    expect(BAKED_STATIC_MAX_LIFT_PX).toBe(CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2);
    // Read back in the three units a human can check against a screenshot.
    expect(BAKED_STATIC_MAX_LIFT_PX / TILE_H).toBe(2);
    expect(BAKED_STATIC_MAX_LIFT_PX / HEIGHT_PX).toBe(4);
    expect((BAKED_STATIC_MAX_LIFT_PX / HEIGHT_PX) * HEIGHT_STEP_M).toBe(32);
  });

  it('leaves the D-117 procedural town INSIDE it, or the fallback would be clipped', () => {
    // Every procedural building is drawn into a cell whose top is exactly
    // this far above the tile centre, so a fallback silhouette physically
    // cannot exceed the rule. Measured from `drawTownBuilding`: the tallest,
    // a stage-1 commercial block, lifts 1.12 tile heights.
    expect(PROCEDURAL_TOWN_MAX_LIFT_TILE_HEIGHTS).toBeLessThan(BAKED_STATIC_MAX_LIFT_PX / TILE_H);
    // And the hand measurement and the computed bound agree about the same
    // era, which is what stops the literal above from rotting (SPEC2 M23).
    expect(GABLE_TOWN_MAX_LIFT_TILE_HEIGHTS).toBeGreaterThanOrEqual(
      PROCEDURAL_TOWN_MAX_LIFT_TILE_HEIGHTS,
    );
    expect(GABLE_TOWN_MAX_LIFT_TILE_HEIGHTS).toBeLessThan(
      PROCEDURAL_TOWN_MAX_LIFT_TILE_HEIGHTS * 1.15,
    );
  });

  it('holds every baked static cell to it, and holds the stage ladder, when a bake is on disk', () => {
    // The bake output is a gitignored build artifact (E-14: no binary asset
    // in the repository), so this can only be a DEVELOPER-machine check and
    // says so. The rule itself is enforced where it cannot be skipped:
    // tools/bake-lib.ts refuses to PRODUCE a cell above it, and
    // tests/unit/assetsBake.spec.ts proves that refusal on synthetic
    // geometry, with no cache and no bake in sight.
    const baked = readBakedManifest();
    if (baked === null) return;

    const liftsByTarget = new Map<string, number>();
    for (const bakedPage of baked.pages) {
      if (bakedPage.kind === 'emissive') continue;
      for (const bakedCell of bakedPage.cells) {
        if (!/^(building|industry|module|tree):/.test(bakedCell.target)) continue;
        const lift = bakedCell.anchorY / bakedPage.zoom;
        expect(lift, `${bakedCell.target} at zoom ${bakedPage.zoom}`).toBeLessThanOrEqual(
          BAKED_STATIC_MAX_LIFT_PX,
        );
        const previous = liftsByTarget.get(bakedCell.target) ?? 0;
        if (lift > previous) liftsByTarget.set(bakedCell.target, lift);
      }
    }
    if (liftsByTarget.size === 0) return;

    // A grown building is a bigger building: every stage-1 cell of a zone
    // must stand above every stage-0 cell of the same zone. Before D-206
    // `building:industrial:1` lifted LESS than `building:industrial:0:2`,
    // so the town shrank as it grew and nothing said so.
    for (const zone of ['residential', 'commercial', 'industrial']) {
      let ungrownMax = 0;
      let grownMin = Infinity;
      for (const [target, lift] of liftsByTarget) {
        if (!target.startsWith(`building:${zone}:`)) continue;
        if (target.startsWith(`building:${zone}:0`)) ungrownMax = Math.max(ungrownMax, lift);
        else grownMin = Math.min(grownMin, lift);
      }
      expect(ungrownMax, `${zone} stage 0`).toBeGreaterThan(0);
      expect(grownMin, `${zone} stage 1 over stage 0`).toBeGreaterThan(ungrownMax);
    }

    // And a town building is a town building: the tallest one may not run
    // away from the procedural cell it falls back to. 1.5x is the honest
    // margin for a modelled roof over a drawn box; the M13 bake was at 3.9x.
    let tallestTown = 0;
    for (const [target, lift] of liftsByTarget) {
      if (target.startsWith('building:')) tallestTown = Math.max(tallestTown, lift);
    }
    expect(tallestTown / TILE_H).toBeLessThanOrEqual(GABLE_TOWN_MAX_LIFT_TILE_HEIGHTS * 1.5);

    // The trees are the one family the RENDERER resizes (D-209), so the rule
    // has to survive the largest multiplier the size jitter can produce - the
    // baker only ever sees the cell at 1.0. Measured on this bake: the
    // tallest tree lifts 28.0 px, so the tallest one drawn is 32.2 of 64.
    let tallestTree = 0;
    for (const [target, lift] of liftsByTarget) {
      if (target.startsWith('tree:')) tallestTree = Math.max(tallestTree, lift);
    }
    expect(tallestTree).toBeGreaterThan(0);
    expect(tallestTree * (1 + FOREST_TREE_SCALE_JITTER)).toBeLessThanOrEqual(
      BAKED_STATIC_MAX_LIFT_PX,
    );

    // Every climate must own enough bodies for the four slots to differ: a
    // tile drawing the same model four times is the wallpaper one tile down.
    const familySizes = new Map<string, number>();
    for (const target of liftsByTarget.keys()) {
      const family = /^tree:([a-z]+):\d+$/.exec(target);
      if (family === null) continue;
      familySizes.set(family[1]!, (familySizes.get(family[1]!) ?? 0) + 1);
    }
    expect(familySizes.size).toBeGreaterThanOrEqual(4);
    for (const [climate, bodies] of familySizes) {
      expect(bodies, `bodies in tree:${climate}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the chunk headroom covers the tallest baked cell', () => {
  it('reserves at least the stated lift above the highest tile', () => {
    expect(CHUNK_ART_HEADROOM_PX).toBeGreaterThanOrEqual(BAKED_STATIC_MAX_LIFT_PX);
    // A tile at the very top of a chunk, at the highest ground the map model
    // allows, must still fit its tallest building inside the texture: a
    // skyscraper guillotined at a chunk seam at 0.5x while drawing whole at
    // 1x is exactly the disagreement the hybrid renderer may not have.
    const aabb = chunkAabb(3, 5);
    const topTileGround = (3 * 32 + 5 * 32) * 16; // (x + y) * TILE_H / 2 at height 0
    expect(topTileGround - aabb.minY).toBeGreaterThanOrEqual(BAKED_STATIC_MAX_LIFT_PX);
  });

  it('is exactly the rule, so a chunk reserves what the baker guarantees', () => {
    // Since D-206 the two are one number: the baker refuses a static cell
    // above the rule, so reserving more than the rule would only make every
    // chunk texture bigger for nothing. The reserve is still conservative by
    // TILE_H / 2, the datum difference between the two measurements.
    expect(CHUNK_ART_HEADROOM_PX).toBe(BAKED_STATIC_MAX_LIFT_PX);
  });
});
