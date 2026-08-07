/**
 * `npm run assets:bake` - rasterise the fetched Kenney models into dimetric
 * PNG atlases + a JSON manifest (SPEC2 M12 stage 0, E-14/D-140/D-160).
 *
 * Reads tools/assets-manifest.json and assets-cache/packs/ (from
 * `npm run assets:fetch`), writes public/assets-baked/ - both gitignored,
 * both build artifacts. Without a filled cache this script WARNS and exits
 * cleanly (exit 0): the game always starts, on procedural art if it must
 * (E-14), so a missing download can never break a build.
 *
 * Reproducibility is a tested promise: the pipeline in tools/bake-lib.ts is
 * pure and the PNG encoder is fixed-parameter fflate, so baking twice
 * produces bit-identical files (tests/unit/assetsBake.spec.ts hashes it).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakeAtlases,
  decodePng,
  extractTriangles,
  parseGlb,
  type BakeModelInput,
  type DecodedImage,
  type RecolorSpec,
  type TintHueRange,
} from './bake-lib.ts';

interface ManifestModel {
  readonly target: string;
  readonly pack: string;
  readonly file: string;
  readonly scale: number;
  readonly facings: number;
  readonly tint?: {
    readonly materials?: readonly string[];
    readonly colors?: readonly string[];
    readonly hues?: readonly TintHueRange[];
  };
  /** Deterministic hull recolour for reused-model variants (D-169). */
  readonly recolor?: RecolorSpec;
  /** Per-axis model-space multipliers [x, y, z] for reused-model variants. */
  readonly stretch?: readonly [number, number, number];
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
}

interface Manifest {
  readonly version: number;
  readonly packs: ReadonlyArray<{ readonly id: string }>;
  /**
   * The kit-wide glazing convention (M13 emissive pass): window glass in
   * every pinned Kenney kit is one sky-blue colormap ramp, so ONE hue band
   * at manifest level classifies windows across all 145 models - measured,
   * not guessed (hue 212-216, HSL saturation 0.62-0.83 on every kit; the
   * only saturated-blue non-windows are two livery hulls, and tint wins
   * over glazing by rule).
   */
  readonly emissive?: {
    readonly materials?: readonly string[];
    readonly colors?: readonly string[];
    readonly hues?: readonly TintHueRange[];
  };
  readonly models: readonly ManifestModel[];
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'assets-manifest.json');
const PACKS_DIR = join(REPO_ROOT, 'assets-cache', 'packs');
const OUT_DIR = join(REPO_ROOT, 'public', 'assets-baked');

function loadModel(entry: ManifestModel, emissive: Manifest['emissive']): BakeModelInput | null {
  const modelPath = join(PACKS_DIR, entry.pack, entry.file);
  if (!existsSync(modelPath)) {
    console.warn(`assets:bake ${entry.target}: missing ${entry.pack}/${entry.file}, skipped`);
    return null;
  }
  const model = parseGlb(readFileSync(modelPath));
  const images = new Map<string, DecodedImage>();
  for (const image of model.json.images ?? []) {
    if (image.uri != null) {
      const texturePath = join(dirname(modelPath), decodeURIComponent(image.uri));
      if (!existsSync(texturePath)) {
        console.warn(`assets:bake ${entry.target}: missing texture ${image.uri}, skipped`);
        return null;
      }
      images.set(image.uri, decodePng(readFileSync(texturePath)));
    }
  }
  const triangles = extractTriangles(model, {
    images,
    tintMaterials: entry.tint?.materials,
    tintColors: entry.tint?.colors,
    tintHues: entry.tint?.hues,
    emissiveMaterials: emissive?.materials,
    emissiveColors: emissive?.colors,
    emissiveHues: emissive?.hues,
    recolor: entry.recolor,
  });
  return {
    target: entry.target,
    triangles,
    scale: entry.scale,
    facings: entry.facings,
    anchors: entry.anchors,
    stretch: entry.stretch,
  };
}

function main(): void {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

  if (!existsSync(PACKS_DIR)) {
    console.warn(
      'assets:bake: assets-cache/packs is missing - run `npm run assets:fetch` first.\n' +
        'The game keeps starting on procedural art without the bake (E-14); nothing failed.',
    );
    return;
  }

  const models: BakeModelInput[] = [];
  for (const entry of manifest.models) {
    const model = loadModel(entry, manifest.emissive);
    if (model) models.push(model);
  }
  if (models.length === 0) {
    console.warn(
      'assets:bake: no bakeable models found in the cache; the game stays on procedural art.',
    );
    return;
  }

  const result = bakeAtlases(models);

  // A clean slate per bake: stale pages from a previous mapping must not
  // survive next to a manifest that no longer references them.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  let bytes = 0;
  for (const [name, data] of result.files) {
    writeFileSync(join(OUT_DIR, name), data);
    bytes += data.length;
  }
  const cells = result.manifest.pages.reduce((sum, page) => sum + page.cells.length, 0);
  console.log(
    `assets:bake: ${models.length} models -> ${result.files.size - 1} pages, ` +
      `${cells} cells, ${(bytes / 1024).toFixed(0)} KiB -> public/assets-baked/`,
  );
}

main();
