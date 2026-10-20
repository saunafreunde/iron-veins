import { describe, expect, it, vi } from 'vitest';
import {
  atlasSourceFor,
  BAKED_MANIFEST_VERSION,
  DEFERRED_BAKED_ZOOM_MIN,
  deferredPagesOf,
  loadBakedAtlas,
  loadBakedPages,
  OnDemandLoad,
  parseBakedManifest,
  type BakedAtlasManifest,
  type PageDecoder,
} from '../../src/render/bakedAtlas';

/**
 * The baked-atlas loader stub of M12 stage 0 (E-14/D-160). M13 wires the
 * cells into MapView; what M12 must already prove is the pure half: the
 * manifest parser rejects anything it does not fully understand, and the
 * fallback decision lands on procedural art whenever the bake is absent -
 * the game always starts.
 */

const validCell = {
  target: 'vehicle:1000',
  facing: 0,
  x: 0,
  y: 0,
  width: 32,
  height: 24,
  anchorX: 16,
  anchorY: 20,
  maskX: 32,
  maskY: 0,
};

const validManifest = {
  version: BAKED_MANIFEST_VERSION,
  zooms: [1, 2, 4],
  pages: [{ file: 'atlas-z1-p0.png', zoom: 1, width: 64, height: 24, cells: [validCell] }],
};

describe('parseBakedManifest', () => {
  it('accepts the shape tools/bake-lib.ts writes', () => {
    const manifest = parseBakedManifest(validManifest);
    expect(manifest).not.toBeNull();
    expect(manifest!.pages[0]!.cells[0]!.target).toBe('vehicle:1000');
  });

  it('accepts a cell with named anchor points', () => {
    const manifest = parseBakedManifest({
      ...validManifest,
      pages: [
        {
          ...validManifest.pages[0]!,
          cells: [{ ...validCell, points: { chimney: [12, 4] } }],
        },
      ],
    });
    expect(manifest).not.toBeNull();
  });

  it('accepts the emissive trio of M13 and an emissive page without cells', () => {
    const manifest = parseBakedManifest({
      ...validManifest,
      pages: [
        {
          ...validManifest.pages[0]!,
          cells: [{ ...validCell, emissivePage: 'atlas-z1-e0.png', emissiveX: 0, emissiveY: 0 }],
        },
        { file: 'atlas-z1-e0.png', zoom: 1, width: 32, height: 24, kind: 'emissive', cells: [] },
      ],
    });
    expect(manifest).not.toBeNull();
    expect(manifest!.pages[0]!.cells[0]!.emissivePage).toBe('atlas-z1-e0.png');
  });

  it('rejects a partial emissive trio - all three fields or none', () => {
    for (const partial of [
      { emissivePage: 'atlas-z1-e0.png' },
      { emissiveX: 0, emissiveY: 0 },
      { emissivePage: 'atlas-z1-e0.png', emissiveX: 4 },
      { emissivePage: 7, emissiveX: 0, emissiveY: 0 },
    ]) {
      expect(
        parseBakedManifest({
          ...validManifest,
          pages: [{ ...validManifest.pages[0]!, cells: [{ ...validCell, ...partial }] }],
        }),
        JSON.stringify(partial),
      ).toBeNull();
    }
  });

  it('rejects an unknown version outright - a stale version-1 bake included', () => {
    // A bake from before the M13 emissive pass says version 1; the loader
    // must refuse it whole so the game falls back to procedural art until
    // `npm run assets:bake` runs again - never half-read stale pages.
    expect(parseBakedManifest({ ...validManifest, version: 1 })).toBeNull();
    expect(
      parseBakedManifest({ ...validManifest, version: BAKED_MANIFEST_VERSION + 1 }),
    ).toBeNull();
  });

  it('rejects structural damage instead of half-loading', () => {
    expect(parseBakedManifest(null)).toBeNull();
    expect(parseBakedManifest('atlas')).toBeNull();
    expect(parseBakedManifest({ version: BAKED_MANIFEST_VERSION })).toBeNull();
    expect(parseBakedManifest({ ...validManifest, zooms: ['one'] })).toBeNull();
    expect(
      parseBakedManifest({
        ...validManifest,
        pages: [{ file: 'x.png', zoom: 1, width: 1, height: 1, cells: [{ target: 42 }] }],
      }),
    ).toBeNull();
    expect(
      parseBakedManifest({
        ...validManifest,
        pages: [
          {
            file: 'x.png',
            zoom: 1,
            width: 1,
            height: 1,
            cells: [{ ...validCell, anchorY: 'twenty' }],
          },
        ],
      }),
    ).toBeNull();
  });
});

describe('the fallback decision', () => {
  it('uses baked art only for a validated, non-empty manifest', () => {
    expect(atlasSourceFor(parseBakedManifest(validManifest))).toBe('baked');
  });

  it('falls back to procedural art when the bake is absent or empty', () => {
    expect(atlasSourceFor(null)).toBe('procedural');
    expect(
      atlasSourceFor({
        version: BAKED_MANIFEST_VERSION,
        zooms: [],
        pages: [],
      } as BakedAtlasManifest),
    ).toBe('procedural');
  });
});

describe('loadBakedAtlas', () => {
  it('resolves null when the baked dir does not exist (HTTP 404)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(await loadBakedAtlas(fetchFn)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('resolves null when fetch itself fails (offline file:// contexts)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await loadBakedAtlas(fetchFn)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('resolves null when the manifest fails validation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: 99 }),
    })) as unknown as typeof fetch;
    expect(await loadBakedAtlas(fetchFn)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

// ------------------------------------------------- the page load (D-276)

/*
 * The page half of the loader, after the review measured ~397 MiB of decoded
 * atlas against a phone's 3-4 GB: the pages arrive in parallel, the 4x pages
 * wait for the first zoom that needs them, and a failure closes what it
 * decoded instead of leaving it to the collector.
 */

function page(file: string, zoom: number): BakedAtlasManifest['pages'][number] {
  return { file, zoom, width: 64, height: 24, cells: [validCell] };
}

const tenPages: BakedAtlasManifest = {
  version: BAKED_MANIFEST_VERSION,
  zooms: [1, 2, 4],
  pages: [
    page('atlas-z1-p0.png', 1),
    page('atlas-z1-e0.png', 1),
    page('atlas-z2-p0.png', 2),
    page('atlas-z2-e0.png', 2),
    page('atlas-z4-p0.png', 4),
    page('atlas-z4-p1.png', 4),
    page('atlas-z4-p2.png', 4),
    page('atlas-z4-p3.png', 4),
    page('atlas-z4-e0.png', 4),
    page('atlas-z4-e1.png', 4),
  ],
};

/** A decoded page that records whether it was let go. */
interface FakeBitmap {
  readonly file: string;
  closed: boolean;
  close(): void;
}

function fakeDecoder(): { decode: PageDecoder; made: FakeBitmap[] } {
  const made: FakeBitmap[] = [];
  const decode = (async (blob: Blob) => {
    const bitmap: FakeBitmap = {
      file: await blob.text(),
      closed: false,
      close() {
        this.closed = true;
      },
    };
    made.push(bitmap);
    return bitmap;
  }) as unknown as PageDecoder;
  return { decode, made };
}

/**
 * A host serving the manifest and every page, answering no page until
 * `release()` - so a test can see how many requests were in flight at once.
 */
function gatedHost(
  manifest: BakedAtlasManifest,
  failing: readonly string[] = [],
): { fetchFn: typeof fetch; requested: string[]; release: () => void } {
  const requested: string[] = [];
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const fetchFn = (async (url: string) => {
    const file = url.slice(url.lastIndexOf('/') + 1);
    if (file === 'baked-manifest.json') {
      return { ok: true, status: 200, json: async () => manifest };
    }
    requested.push(file);
    await gate;
    if (failing.includes(file)) return { ok: false, status: 503 };
    return { ok: true, status: 200, blob: async () => new Blob([file]) };
  }) as unknown as typeof fetch;
  return { fetchFn, requested, release: () => open() };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('which pages wait (D-276)', () => {
  it('defers every page of the 4x zoom and nothing else', () => {
    expect(DEFERRED_BAKED_ZOOM_MIN).toBe(4);
    expect(deferredPagesOf(tenPages).map((entry) => entry.file)).toEqual([
      'atlas-z4-p0.png',
      'atlas-z4-p1.png',
      'atlas-z4-p2.png',
      'atlas-z4-p3.png',
      'atlas-z4-e0.png',
      'atlas-z4-e1.png',
    ]);
  });

  it('defers nothing when that would be every page', () => {
    // A bake with nothing to show at start-up would download its art and
    // then not draw it.
    const onlyFour = { ...tenPages, zooms: [4], pages: [page('atlas-z4-p0.png', 4)] };
    expect(deferredPagesOf(onlyFour)).toEqual([]);
  });
});

describe('loadBakedAtlas with a full bake (D-276)', () => {
  it('requests every start-up page before any of them has answered', async () => {
    const host = gatedHost(tenPages);
    const pending = loadBakedAtlas(host.fetchFn, 'assets-baked', fakeDecoder().decode);
    await settle();
    expect(host.requested).toEqual([
      'atlas-z1-p0.png',
      'atlas-z1-e0.png',
      'atlas-z2-p0.png',
      'atlas-z2-e0.png',
    ]);
    host.release();
    const atlas = await pending;
    expect(atlas).not.toBeNull();
    // Manifest order, whatever order the answers came in.
    expect([...atlas!.pages.keys()]).toEqual(host.requested);
    expect(atlas!.deferred).toEqual(deferredPagesOf(tenPages));
  });

  it('never fetches a 4x page at start-up', async () => {
    const host = gatedHost(tenPages);
    host.release();
    await loadBakedAtlas(host.fetchFn, 'assets-baked', fakeDecoder().decode);
    expect(host.requested.some((file) => file.startsWith('atlas-z4'))).toBe(false);
  });

  it('goes procedural whole when a start-up page fails, and closes what it decoded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = gatedHost(tenPages, ['atlas-z2-p0.png']);
    host.release();
    const { decode, made } = fakeDecoder();
    expect(await loadBakedAtlas(host.fetchFn, 'assets-baked', decode)).toBeNull();
    expect(made).toHaveLength(3);
    expect(made.every((bitmap) => bitmap.closed)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain('atlas-z2-p0.png');
    warn.mockRestore();
  });
});

describe('loadBakedPages - the deferred pages (D-276)', () => {
  it('loads exactly the pages it is given, all requested at once', async () => {
    const host = gatedHost(tenPages);
    const deferred = deferredPagesOf(tenPages);
    const pending = loadBakedPages(deferred, host.fetchFn, 'assets-baked', fakeDecoder().decode);
    await settle();
    expect(host.requested).toEqual(deferred.map((entry) => entry.file));
    host.release();
    const load = await pending;
    expect(load.ok && [...load.pages.keys()]).toEqual(deferred.map((entry) => entry.file));
  });

  it('names the first page that failed and closes every bitmap it decoded', async () => {
    const host = gatedHost(tenPages, ['atlas-z4-p2.png', 'atlas-z4-e1.png']);
    host.release();
    const { decode, made } = fakeDecoder();
    const load = await loadBakedPages(deferredPagesOf(tenPages), host.fetchFn, 'b', decode);
    expect(load).toEqual({ ok: false, file: 'atlas-z4-p2.png', reason: 'Error: HTTP 503' });
    expect(made).toHaveLength(4);
    expect(made.every((bitmap) => bitmap.closed)).toBe(true);
  });
});

describe('OnDemandLoad - the first zoom to 400 % (D-276)', () => {
  it('runs one load however often it is asked while that load runs', async () => {
    let calls = 0;
    let finish: (ok: boolean) => void = () => undefined;
    const load = new OnDemandLoad(() => {
      calls++;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    });
    const first = load.request();
    expect(first).not.toBeNull();
    expect(load.request()).toBeNull();
    expect(load.request()).toBeNull();
    expect(load.status).toBe('loading');
    finish(true);
    await first;
    expect(calls).toBe(1);
    expect(load.status).toBe('done');
  });

  it('never loads again after it succeeded', async () => {
    let calls = 0;
    const load = new OnDemandLoad(async () => {
      calls++;
      return true;
    });
    await load.request();
    expect(load.request()).toBeNull();
    expect(calls).toBe(1);
  });

  it('may be asked again after a failure - the next zoom-in retries', async () => {
    let calls = 0;
    const load = new OnDemandLoad(async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return calls !== 2;
    });
    await load.request();
    expect(load.status).toBe('idle');
    await load.request();
    expect(load.status).toBe('idle');
    await load.request();
    expect(load.status).toBe('done');
    expect(calls).toBe(3);
  });
});
