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
  /**
   * The lit-only emissive twin of this cell (M13), when the model has
   * glazing: same width/height/anchor, on its own emissive page. All three
   * fields exist together or not at all - parseCell enforces the trio.
   */
  readonly emissivePage?: string;
  readonly emissiveX?: number;
  readonly emissiveY?: number;
  readonly points?: Readonly<Record<string, readonly [number, number]>>;
}

export interface BakedPage {
  readonly file: string;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  /** 'emissive' for the lit-twin pages of M13; absent for sprite pages. */
  readonly kind?: 'emissive';
  readonly cells: readonly BakedCell[];
}

export interface BakedAtlasManifest {
  readonly version: number;
  readonly zooms: readonly number[];
  readonly pages: readonly BakedPage[];
}

/**
 * The manifest version this loader understands. 2 since M13's emissive pass
 * (tools/bake-lib.ts BAKE_MANIFEST_VERSION, asserted equal by the coupling
 * test): a version-1 bake predates the emissive fields and is refused whole
 * - stale output means procedural art plus a warning until `npm run
 * assets:bake` runs again, never a half-understood atlas (D-160).
 */
export const BAKED_MANIFEST_VERSION = 2;

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
  // The emissive trio (M13) is all-or-none: a cell naming a page without
  // coordinates - or the reverse - is a damaged manifest, and damage means
  // procedural fallback, never a guess.
  const emissiveFields = [cell.emissivePage, cell.emissiveX, cell.emissiveY];
  const present = emissiveFields.filter((field) => field !== undefined).length;
  if (present !== 0) {
    if (present !== 3) return null;
    if (typeof cell.emissivePage !== 'string') return null;
    if (!isFiniteNumber(cell.emissiveX) || !isFiniteNumber(cell.emissiveY)) return null;
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

/**
 * The smallest baked zoom whose pages are NOT loaded at start-up (D-276).
 * [baked zoom factor]
 *
 * The 4x pages are six of the ten and ~290 of the ~397 MiB the atlas decodes
 * to, and they serve exactly one of the five display zooms. Loaded at start
 * they cost every player that memory whether or not they ever zoom to 400 %,
 * which on a phone with 3-4 GB is the difference between a game and a tab the
 * system kills. They are fetched the first time the camera reaches that zoom.
 */
export const DEFERRED_BAKED_ZOOM_MIN = 4;

/** Turns a downloaded page into pixels; `createImageBitmap` in a browser. */
export type PageDecoder = (blob: Blob) => Promise<ImageBitmap>;

const decodeWithBrowser: PageDecoder = (blob) => createImageBitmap(blob);

/** A loaded baked atlas: the manifest plus one decoded bitmap per page. */
export interface BakedAtlas {
  readonly manifest: BakedAtlasManifest;
  /** The pages loaded at start-up, keyed by file. */
  readonly pages: ReadonlyMap<string, ImageBitmap>;
  /**
   * The pages left for later (D-276), in manifest order - empty when nothing
   * was deferred. {@link loadBakedPages} fetches them.
   */
  readonly deferred: readonly BakedPage[];
}

/**
 * Which pages wait until they are needed: every page at or above
 * {@link DEFERRED_BAKED_ZOOM_MIN} - unless that would be ALL of them, because
 * a bake with nothing to show at start-up would be a procedural game that
 * downloads its art and then does not draw it.
 */
export function deferredPagesOf(manifest: BakedAtlasManifest): readonly BakedPage[] {
  const deferred = manifest.pages.filter((page) => page.zoom >= DEFERRED_BAKED_ZOOM_MIN);
  return deferred.length === manifest.pages.length ? [] : deferred;
}

/** What {@link loadBakedPages} answers: every page, or the first that failed. */
export type PageLoad =
  | { readonly ok: true; readonly pages: Map<string, ImageBitmap> }
  | { readonly ok: false; readonly file: string; readonly reason: string };

/**
 * Fetch and decode a set of pages, all at once and all or nothing.
 *
 * At once because ten round trips one after the other is what a phone on a
 * mobile network feels as the start-up wait (review finding 11); the map is
 * still filled in the order given, so nothing that iterates it sees another
 * sequence. All or nothing because a half-loaded zoom is a zoom whose cells
 * point at pages that are not there: one failure closes every bitmap that did
 * decode and names the first page that failed, for the caller's warning.
 */
export async function loadBakedPages(
  pages: readonly BakedPage[],
  fetchFn: typeof fetch = fetch,
  base: string = BAKED_ATLAS_BASE,
  decode: PageDecoder = decodeWithBrowser,
): Promise<PageLoad> {
  const settled = await Promise.allSettled(
    pages.map(async (page) => {
      const response = await fetchFn(`${base}/${page.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await decode(await response.blob());
    }),
  );
  const loaded = new Map<string, ImageBitmap>();
  let failed = -1;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!;
    if (outcome.status === 'fulfilled') loaded.set(pages[i]!.file, outcome.value);
    else if (failed < 0) failed = i;
  }
  if (failed < 0) return { ok: true, pages: loaded };
  for (const bitmap of loaded.values()) bitmap.close();
  const reason = (settled[failed] as PromiseRejectedResult).reason as unknown;
  return { ok: false, file: pages[failed]!.file, reason: String(reason) };
}

/**
 * Fetch and parse the baked atlas output. Resolves to null - the procedural
 * fallback - whenever the directory is absent, a file is unreadable or the
 * manifest fails validation; the one console warning names the reason so a
 * dev build without a cache is a known state, not a mystery.
 *
 * Only the start-up pages are fetched (D-276); the rest are named in
 * `deferred` for {@link loadBakedPages}. A failure among the start-up pages
 * is the whole atlas, as it always was: procedural art, never a partial one.
 */
export async function loadBakedAtlas(
  fetchFn: typeof fetch = fetch,
  base: string = BAKED_ATLAS_BASE,
  decode: PageDecoder = decodeWithBrowser,
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
  const deferred = deferredPagesOf(manifest);
  const eager = manifest.pages.filter((page) => !deferred.includes(page));
  const load = await loadBakedPages(eager, fetchFn, base, decode);
  if (!load.ok) {
    console.warn(`bakedAtlas: page ${load.file} failed (${load.reason}); using procedural art`);
    return null;
  }
  return { manifest, pages: load.pages, deferred };
}

/**
 * A load that may be asked for many times and runs at most once at a time,
 * and never again once it has succeeded (D-276).
 *
 * What asks is the camera reaching 400 %, which a player does repeatedly; what
 * must not happen is a second download of 290 MiB of pages while the first is
 * still decoding, or any download after the pages are in. A load that FAILED
 * may be asked for again - the next zoom-in retries, a human-paced cadence, so
 * a dead network is not hammered.
 */
export class OnDemandLoad {
  private state: 'idle' | 'loading' | 'done' = 'idle';

  constructor(private readonly load: () => Promise<boolean>) {}

  get status(): 'idle' | 'loading' | 'done' {
    return this.state;
  }

  /** Start the load unless one is running or one already succeeded. */
  request(): Promise<void> | null {
    if (this.state !== 'idle') return null;
    this.state = 'loading';
    return this.load().then(
      (ok) => {
        this.state = ok ? 'done' : 'idle';
      },
      () => {
        this.state = 'idle';
      },
    );
  }
}
