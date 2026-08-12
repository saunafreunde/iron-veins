import { isLegalMapSize } from '../map/size';
import type { HeightmapImage } from './heightmap';
import { decodePng, greyOf, type PngRefusal } from './png';

/**
 * The FILE half of the heightmap import (SPEC2 M22): bytes an author picked,
 * turned into a picture the relief chain can use, or a reason why not.
 *
 * It is a separate module from `heightmap.ts` for one measured reason.
 * `mapgen/index.ts` imports the relief chain statically and `App.tsx` imports
 * `MAPGEN_PHASE_COUNT` out of that same barrel, so everything in `heightmap.ts`
 * is in the entry chunk however carefully a panel dynamically imports it - Vite
 * says so out loud ("dynamic import will not move module into another chunk").
 * Nothing under `src/sim` imports THIS file, so the decoder, its inflate and
 * the greyscale pass form a chunk of their own that only an author who presses
 * the button ever downloads. Measured: 11 kB of the main chunk (D-191/D-192).
 */

export type HeightmapResult =
  | { readonly ok: true; readonly image: HeightmapImage; readonly mapSize: number }
  | { readonly ok: false; readonly refusal: PngRefusal };

/**
 * The map a picture of this size makes, or -1 when it makes none.
 *
 * A map of `n` tiles has an `(n + 1)^2` CORNER grid, so the exact reading of a
 * picture is "one pixel per corner" and a `1025` square is a 1024 map with
 * nothing left over. A `1024` square is accepted too and is the reading almost
 * every terrain tool exports: one pixel per TILE, with the far edge of corners
 * taking the last column and row again. Both readings are lossless in the
 * direction that matters - no pixel is ever interpolated - and the corner-grid
 * reading wins where a size satisfies both, which no legal size does (a power
 * of two and its successor are never both powers of two).
 */
export function mapSizeForHeightmap(width: number, height: number): number {
  if (width !== height) return -1;
  if (isLegalMapSize(width - 1)) return width - 1;
  if (isLegalMapSize(width)) return width;
  return -1;
}

/**
 * Turn the bytes of a file into a heightmap, or say why they are not one.
 *
 * Two refusals of its own on top of the decoder's: a picture that is not
 * square, and a square one whose edge is no map. Both name the numbers, because
 * "wrong size" without them is a sentence an author cannot act on.
 */
export function readHeightmap(bytes: Uint8Array): HeightmapResult {
  const decoded = decodePng(bytes);
  if (!decoded.ok) return decoded;

  const { width, height } = decoded.image;
  if (width !== height) {
    return {
      ok: false,
      refusal: { reasonKey: 'ui.heightmap.notSquare', params: { width, height } },
    };
  }
  const mapSize = mapSizeForHeightmap(width, height);
  if (mapSize < 0) {
    return { ok: false, refusal: { reasonKey: 'ui.heightmap.wrongSize', params: { width } } };
  }
  return { ok: true, image: { width, height, grey: greyOf(decoded.image) }, mapSize };
}
