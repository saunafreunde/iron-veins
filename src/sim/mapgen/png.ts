import { unzlibSync } from 'fflate';

/**
 * A PNG decoder the SIMULATION can run (SPEC2 M22, heightmap import).
 *
 * The project already has one, in `tools/bake-lib.ts`, and it stays there: the
 * bake is a build step that runs under `node tools/assets-bake.ts` on type
 * stripping, which cannot resolve the extensionless imports of `src/`. That is
 * the same wall that made the baker restate the 16.1 camera constants, and the
 * same answer applies - the two decoders are held together by a COUPLING TEST
 * (`tests/unit/heightmapImport.spec.ts`) that decodes one set of bytes through
 * both and compares the pixels, so a divergence is a red build rather than an
 * art bug nobody can see (the D-117/D-160 device).
 *
 * What this one does that the baker's does not, because a heightmap needs it:
 * 16-bit samples (every terrain tool exports them, and throwing away half the
 * relief before quantising it into sixteen levels would be the terracing
 * complaint SPEC2 M22 names by hand), greyscale-with-alpha, and REFUSALS with
 * a translation key instead of thrown English sentences - an author who picked
 * the wrong file is owed a reason in their own language.
 *
 * Deterministic by construction: integer arithmetic and fflate's pure-JS
 * inflate, no host image decoder. A browser's `createImageBitmap` would apply
 * colour management, so the same picture could become two different maps on
 * two machines - and a map is world state.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Bytes of the fixed-size PNG chunk frame: length, type and CRC. */
const CHUNK_OVERHEAD = 12;

/**
 * A decoded PNG, unfiltered and with any palette already expanded.
 *
 * `data` is `width * height * channels` samples in reading order, big endian
 * when `bitDepth` is 16 - i.e. the scanlines exactly as PNG defines them, with
 * the row filters undone and the filter bytes removed.
 */
export interface PngImage {
  readonly width: number;
  readonly height: number;
  /** 1 (grey), 2 (grey + alpha), 3 (RGB) or 4 (RGBA). */
  readonly channels: number;
  /** 8 or 16. */
  readonly bitDepth: number;
  readonly data: Uint8Array;
}

/** Why a file is not a heightmap. Every key exists in both catalogues. */
export interface PngRefusal {
  readonly reasonKey: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export type PngResult =
  | { readonly ok: true; readonly image: PngImage }
  | { readonly ok: false; readonly refusal: PngRefusal };

function refuse(reasonKey: string, params: Readonly<Record<string, string | number>>): PngResult {
  return { ok: false, refusal: { reasonKey, params } };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = p >= a ? p - a : a - p;
  const pb = p >= b ? p - b : b - p;
  const pc = p >= c ? p - c : c - p;
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Channels carried by a PNG colour type, or -1 for one this decoder refuses. */
function channelsOf(colourType: number): number {
  if (colourType === 0) return 1;
  if (colourType === 2) return 3;
  if (colourType === 3) return 1;
  if (colourType === 4) return 2;
  if (colourType === 6) return 4;
  return -1;
}

/**
 * Decode a PNG, or say why not.
 *
 * Refuses rather than throws for everything a player can plausibly hand over:
 * a JPEG renamed, an interlaced export, a 4-bit bitmap, a truncated download.
 * The one thing that is not a refusal is a decoder bug, and there is none to
 * report - `unzlibSync` throwing IS the corrupt-data case and is caught.
 */
export function decodePng(bytes: Uint8Array): PngResult {
  if (bytes.length < 8 + CHUNK_OVERHEAD + 13) return refuse('ui.heightmap.notPng', {});
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return refuse('ui.heightmap.notPng', {});
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let seenHeader = false;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  while (offset + CHUNK_OVERHEAD <= bytes.length) {
    const length = view.getUint32(offset);
    // A length that runs past the end is a truncated or lying file, and
    // reading it would be reading whatever memory happens to follow.
    if (length > bytes.length - offset - CHUNK_OVERHEAD) {
      return refuse('ui.heightmap.broken', {});
    }
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      if (length !== 13) return refuse('ui.heightmap.broken', {});
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = data[8]!;
      colourType = data[9]!;
      if (data[12] !== 0) return refuse('ui.heightmap.interlaced', {});
      if (bitDepth !== 8 && bitDepth !== 16) {
        return refuse('ui.heightmap.unsupportedDepth', { depth: bitDepth });
      }
      if (channelsOf(colourType) < 0) {
        return refuse('ui.heightmap.unsupportedColour', { colour: colourType });
      }
      // Indexed colour carries eight-bit indices at most, and a palette entry
      // is three bytes whatever the depth says.
      if (colourType === 3 && bitDepth !== 8) {
        return refuse('ui.heightmap.unsupportedDepth', { depth: bitDepth });
      }
      if (width <= 0 || height <= 0) return refuse('ui.heightmap.broken', {});
      seenHeader = true;
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += CHUNK_OVERHEAD + length;
  }

  if (!seenHeader || idat.length === 0) return refuse('ui.heightmap.broken', {});
  if (colourType === 3 && palette === null) return refuse('ui.heightmap.broken', {});

  let compressedLength = 0;
  for (let i = 0; i < idat.length; i++) compressedLength += idat[i]!.length;
  const compressed = new Uint8Array(compressedLength);
  let at = 0;
  for (let i = 0; i < idat.length; i++) {
    compressed.set(idat[i]!, at);
    at += idat[i]!.length;
  }

  let raw: Uint8Array;
  try {
    raw = unzlibSync(compressed);
  } catch {
    return refuse('ui.heightmap.broken', {});
  }

  const sourceChannels = channelsOf(colourType);
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const stride = width * sourceChannels * bytesPerSample;
  if (raw.length !== (stride + 1) * height) return refuse('ui.heightmap.broken', {});

  // Undo the row filters. `step` is the distance to the pixel on the left in
  // BYTES, which is what the filter definition uses - not a channel count.
  const step = sourceChannels * bytesPerSample;
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) return refuse('ui.heightmap.broken', {});
    const inBase = y * (stride + 1) + 1;
    const rowBase = y * stride;
    const prevBase = rowBase - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= step ? lines[rowBase + x - step]! : 0;
      const up = y > 0 ? lines[prevBase + x]! : 0;
      const upLeft = y > 0 && x >= step ? lines[prevBase + x - step]! : 0;
      let value = raw[inBase + x]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      lines[rowBase + x] = value & 0xff;
    }
  }

  if (colourType !== 3) {
    return { ok: true, image: { width, height, channels: sourceChannels, bitDepth, data: lines } };
  }

  // Expand the palette so nothing downstream has to know about indices.
  const pixels = width * height;
  const rgb = new Uint8Array(pixels * 3);
  const table = palette!;
  for (let i = 0; i < pixels; i++) {
    const index = lines[i]! * 3;
    if (index + 2 >= table.length) return refuse('ui.heightmap.broken', {});
    rgb[i * 3] = table[index]!;
    rgb[i * 3 + 1] = table[index + 1]!;
    rgb[i * 3 + 2] = table[index + 2]!;
  }
  return { ok: true, image: { width, height, channels: 3, bitDepth: 8, data: rgb } };
}

/**
 * The luminance of every pixel in [0, 1], row major.
 *
 * Rec. 601 weights in integer thousandths, because a heightmap exported as a
 * colour PNG - which every screenshot and every photograph is - still has to
 * become one number per pixel, and "the red channel" would read a blue sky as
 * flat ground. A greyscale source is untouched by construction: with r = g = b
 * the weights sum back to exactly one.
 */
export function greyOf(image: PngImage): Float32Array {
  const { width, height, channels, bitDepth, data } = image;
  const pixels = width * height;
  const out = new Float32Array(pixels);
  const wide = bitDepth === 16;
  const max = wide ? 65535 : 255;
  const stride = channels * (wide ? 2 : 1);

  for (let i = 0; i < pixels; i++) {
    const base = i * stride;
    if (channels <= 2) {
      const value = wide ? (data[base]! << 8) | data[base + 1]! : data[base]!;
      out[i] = value / max;
      continue;
    }
    const r = wide ? (data[base]! << 8) | data[base + 1]! : data[base]!;
    const g = wide ? (data[base + 2]! << 8) | data[base + 3]! : data[base + 1]!;
    const b = wide ? (data[base + 4]! << 8) | data[base + 5]! : data[base + 2]!;
    out[i] = (r * 299 + g * 587 + b * 114) / (1000 * max);
  }
  return out;
}

/**
 * The image as eight-bit RGBA - the shape `tools/bake-lib.ts` answers in, and
 * the only reason it exists here is the coupling test that compares the two
 * decoders pixel for pixel.
 */
export function toRgba8(image: PngImage): Uint8Array {
  const { width, height, channels, bitDepth, data } = image;
  const pixels = width * height;
  const out = new Uint8Array(pixels * 4);
  const wide = bitDepth === 16;
  const stride = channels * (wide ? 2 : 1);
  const sample = wide ? 2 : 1;

  for (let i = 0; i < pixels; i++) {
    const base = i * stride;
    const grey = data[base]!;
    if (channels === 1) {
      out[i * 4] = grey;
      out[i * 4 + 1] = grey;
      out[i * 4 + 2] = grey;
      out[i * 4 + 3] = 255;
    } else if (channels === 2) {
      out[i * 4] = grey;
      out[i * 4 + 1] = grey;
      out[i * 4 + 2] = grey;
      out[i * 4 + 3] = data[base + sample]!;
    } else {
      out[i * 4] = data[base]!;
      out[i * 4 + 1] = data[base + sample]!;
      out[i * 4 + 2] = data[base + sample * 2]!;
      out[i * 4 + 3] = channels === 4 ? data[base + sample * 3]! : 255;
    }
  }
  return out;
}
