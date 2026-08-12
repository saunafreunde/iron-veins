import {
  EROSION_PASSES,
  HEIGHTMAP_CONTRAST_MAX,
  HEIGHTMAP_CONTRAST_MIN,
  HEIGHTMAP_CONTRAST_PIVOT,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import { erode, quantise } from './heightfield';

/**
 * Heightmap import: a picture as a mapgen INPUT (SPEC2 M22).
 *
 * This is the second sanctioned path into a world's relief and there are
 * exactly two - `generateMap` and this one. Both are the same kind of thing:
 * neither is a command, because neither is something a COMPANY does. A world
 * is not built by its owner, it is the ground the game is played on, and the
 * command log begins the moment that ground exists (D-240 is the other half of
 * the sentence - everything an author does AFTERWARDS is a command).
 *
 * What is imported is therefore not kept. The PNG is read once, turned into a
 * Float32 corner field, sent through the generator's own
 * `erode`/`quantise`/`enforceSlopeInvariant` chain, and dropped; what is saved
 * is the corner grid, exactly as for a generated map. There is no second file
 * format, no asset in the save, and no way for a world to depend on a picture
 * somebody has since deleted.
 *
 * The one control the author gets is CONTRAST, and it is not decoration.
 * Sixteen height levels is not many: a picture that uses a third of its range
 * lands on five of them and reads as a plain with steps in it. The slider says
 * how much of the sixteen the relief is allowed to spend, turning around the
 * grey value at which the sea ends (`HEIGHTMAP_CONTRAST_PIVOT`), so it moves
 * mountains without moving the coastline.
 *
 * READING A FILE IS NOT HERE, and the split is a bundle fact rather than a
 * taste: `mapgen/index.ts` imports this module statically, and `App.tsx`
 * imports `MAPGEN_PHASE_COUNT` out of that same barrel, so anything in this
 * file is in the entry chunk whatever a panel does. The decoder therefore
 * lives in `heightmapFile.ts`, which nothing in `src/sim` imports at all -
 * measured: keeping it here cost the main chunk 11 kB it will never run
 * (D-191/D-192).
 */

/** A picture an author picked, decoded and reduced to one number per pixel. */
export interface HeightmapImage {
  readonly width: number;
  readonly height: number;
  /** Luminance in [0, 1], row major, `width * height` entries. */
  readonly grey: Float32Array;
}

/** A heightmap plus the slider position it is to be read at. */
export interface ReliefImport {
  readonly image: HeightmapImage;
  /** 1 is the picture as it is; see `HEIGHTMAP_CONTRAST_*`. */
  readonly contrast: number;
}

/**
 * The contrast curve: a straight line through the pivot, clamped to the range
 * the quantiser can express.
 *
 * Multiplication and addition only, so it is bit-exact on every engine
 * (architecture law #4) and an imported map hashes the same everywhere.
 */
export function contrastGrey(value: number, contrast: number): number {
  const shifted = HEIGHTMAP_CONTRAST_PIVOT + (value - HEIGHTMAP_CONTRAST_PIVOT) * contrast;
  return shifted < 0 ? 0 : shifted > 1 ? 1 : shifted;
}

/** Clamp a slider position into the range the constants define. */
export function clampContrast(contrast: number): number {
  if (!Number.isFinite(contrast)) return 1;
  if (contrast < HEIGHTMAP_CONTRAST_MIN) return HEIGHTMAP_CONTRAST_MIN;
  if (contrast > HEIGHTMAP_CONTRAST_MAX) return HEIGHTMAP_CONTRAST_MAX;
  return contrast;
}

/**
 * Sample the picture onto the `(size + 1)^2` corner grid, contrast applied.
 *
 * The read is a CLAMP and never an interpolation: at the corner-grid reading
 * every corner has its own pixel, and at the tile reading the last row and
 * column repeat the edge. Interpolating would invent relief the author did not
 * draw and would make the result depend on a rounding rule nobody can see.
 */
export function reliefFieldFor(
  image: HeightmapImage,
  size: number,
  contrast: number,
): Float32Array {
  const stride = size + 1;
  const field = new Float32Array(stride * stride);
  const lastX = image.width - 1;
  const lastY = image.height - 1;
  const clamped = clampContrast(contrast);

  for (let y = 0; y <= size; y++) {
    const sourceRow = (y > lastY ? lastY : y) * image.width;
    const target = y * stride;
    for (let x = 0; x <= size; x++) {
      const sourceX = x > lastX ? lastX : x;
      field[target + x] = contrastGrey(image.grey[sourceRow + sourceX]!, clamped);
    }
  }
  return field;
}

/**
 * Put an imported relief onto `map` through the generator's own chain.
 *
 * Erosion is not a smoothing filter bolted on here - it is step 2 of section 6
 * and the reason an imported picture is PLAYABLE at all: it limits slopes to
 * the talus angle, which is what leaves the slope invariant something it can
 * hold without flattening whole hillsides. The sweep afterwards is the proof,
 * not the repair (D-240's argument, one milestone on), and the number of
 * corners it moved is returned so a test can say which of the two it was.
 */
export function applyHeightmapRelief(
  map: TileMap,
  relief: ReliefImport,
  erosionPasses = EROSION_PASSES,
): number {
  const field = reliefFieldFor(relief.image, map.size, relief.contrast);
  erode(field, map.size, erosionPasses);
  quantise(field, map);
  return map.enforceSlopeInvariant();
}
