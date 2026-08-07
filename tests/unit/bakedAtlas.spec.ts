import { describe, expect, it, vi } from 'vitest';
import {
  atlasSourceFor,
  loadBakedAtlas,
  parseBakedManifest,
  type BakedAtlasManifest,
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
  version: 1,
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

  it('rejects an unknown version outright', () => {
    expect(parseBakedManifest({ ...validManifest, version: 2 })).toBeNull();
  });

  it('rejects structural damage instead of half-loading', () => {
    expect(parseBakedManifest(null)).toBeNull();
    expect(parseBakedManifest('atlas')).toBeNull();
    expect(parseBakedManifest({ version: 1 })).toBeNull();
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
    expect(atlasSourceFor({ version: 1, zooms: [], pages: [] } as BakedAtlasManifest)).toBe(
      'procedural',
    );
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
