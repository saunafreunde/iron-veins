/**
 * Loader for the baked Kenney atlases (SPEC2 M12 stage 0, E-14/D-160).
 *
 * `npm run assets:bake` writes PNG pages plus a JSON manifest into
 * public/assets-baked/ - a gitignored build artifact. This module can find,
 * parse and load that output at startup; when the directory is absent (any
 * dev build without a filled asset cache) the answer is simply `null` and
 * the renderer stays on the procedural TerrainAtlas path. That fallback is
 * a hard E-14 rule: the game must always start, art or no art.
 *
 * M12 delivers the pipeline and this loader; nothing CONSUMES the baked
 * cells yet - MapView switches over in M13. The parsing and the fallback
 * decision are pure functions under unit test, so the M13 wiring starts on
 * proven ground rather than on a fetch that has never run.
 */

/** One sprite cell inside a baked page, mirroring tools/bake-lib.ts. */
export interface BakedCell {
  readonly target: string;
  readonly facing: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly maskX: number;
  readonly maskY: number;
  readonly points?: Readonly<Record<string, readonly [number, number]>>;
}

export interface BakedPage {
  readonly file: string;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly BakedCell[];
}

export interface BakedAtlasManifest {
  readonly version: number;
  readonly zooms: readonly number[];
  readonly pages: readonly BakedPage[];
}

/** The manifest version this loader understands. */
export const BAKED_MANIFEST_VERSION = 1;

/** Where the bake step publishes, relative to the served root. */
export const BAKED_ATLAS_BASE = 'assets-baked';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseCell(value: unknown): BakedCell | null {
  if (typeof value !== 'object' || value === null) return null;
  const cell = value as Record<string, unknown>;
  if (typeof cell.target !== 'string') return null;
  for (const key of ['facing', 'x', 'y', 'width', 'height', 'anchorX', 'anchorY', 'maskX', 'maskY']) {
    if (!isFiniteNumber(cell[key])) return null;
  }
  return cell as unknown as BakedCell;
}

function parsePage(value: unknown): BakedPage | null {
  if (typeof value !== 'object' || value === null) return null;
  const page = value as Record<string, unknown>;
  if (typeof page.file !== 'string') return null;
  if (!isFiniteNumber(page.zoom) || !isFiniteNumber(page.width) || !isFiniteNumber(page.height)) {
    return null;
  }
  if (!Array.isArray(page.cells)) return null;
  for (const cell of page.cells) {
    if (parseCell(cell) === null) return null;
  }
  return page as unknown as BakedPage;
}

/**
 * Validate a parsed baked-manifest JSON tree. Returns null for anything the
 * loader does not fully understand - an unknown version or a malformed page
 * means procedural fallback, never a half-loaded atlas.
 */
export function parseBakedManifest(json: unknown): BakedAtlasManifest | null {
  if (typeof json !== 'object' || json === null) return null;
  const manifest = json as Record<string, unknown>;
  if (manifest.version !== BAKED_MANIFEST_VERSION) return null;
  if (!Array.isArray(manifest.zooms) || !manifest.zooms.every(isFiniteNumber)) return null;
  if (!Array.isArray(manifest.pages)) return null;
  for (const page of manifest.pages) {
    if (parsePage(page) === null) return null;
  }
  return manifest as unknown as BakedAtlasManifest;
}

export type AtlasSource = 'baked' | 'procedural';

/**
 * The fallback decision, stated as a function so a test can hold it: only a
 * manifest that parsed AND brought at least one page earns the baked path.
 */
export function atlasSourceFor(manifest: BakedAtlasManifest | null): AtlasSource {
  if (manifest === null || manifest.pages.length === 0) return 'procedural';
  return 'baked';
}

/** A loaded baked atlas: the manifest plus one decoded bitmap per page. */
export interface BakedAtlas {
  readonly manifest: BakedAtlasManifest;
  readonly pages: ReadonlyMap<string, ImageBitmap>;
}

/**
 * Fetch and parse the baked atlas output. Resolves to null - the procedural
 * fallback - whenever the directory is absent, a file is unreadable or the
 * manifest fails validation; the one console warning names the reason so a
 * dev build without a cache is a known state, not a mystery.
 */
export async function loadBakedAtlas(
  fetchFn: typeof fetch = fetch,
  base: string = BAKED_ATLAS_BASE,
): Promise<BakedAtlas | null> {
  let manifest: BakedAtlasManifest | null = null;
  try {
    const response = await fetchFn(`${base}/baked-manifest.json`);
    if (!response.ok) {
      console.warn(`bakedAtlas: no baked art (HTTP ${response.status}); using procedural art`);
      return null;
    }
    manifest = parseBakedManifest(await response.json());
  } catch {
    console.warn('bakedAtlas: no baked art (fetch failed); using procedural art');
    return null;
  }
  if (atlasSourceFor(manifest) !== 'baked' || manifest === null) {
    console.warn('bakedAtlas: manifest did not validate; using procedural art');
    return null;
  }
  const pages = new Map<string, ImageBitmap>();
  for (const page of manifest.pages) {
    try {
      const response = await fetchFn(`${base}/${page.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      pages.set(page.file, await createImageBitmap(await response.blob()));
    } catch (error) {
      console.warn(`bakedAtlas: page ${page.file} failed (${String(error)}); using procedural art`);
      return null;
    }
  }
  return { manifest, pages };
}
