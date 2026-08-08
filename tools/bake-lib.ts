/**
 * The Kenney asset bake library (SPEC2 M12 stage 0, E-14/D-140/D-160).
 *
 * A small software rasteriser that turns glTF-binary (GLB) models into
 * dimetric sprite atlases through EXACTLY the 64x32 camera of SPEC.md 16.1.
 * Everything in this file is a pure function of its inputs - no file system,
 * no wall clock, no randomness - which is what makes "bake twice, get
 * bit-identical atlases" a testable promise rather than a hope.
 *
 * The only dependency is fflate, which the game already ships for saves: its
 * pure-JS zlib makes the PNG bytes reproducible across machines, where a
 * native zlib could legitimately differ between library versions.
 *
 * Node cannot resolve the extensionless imports of src/ modules at run time
 * (`node tools/assets-bake.ts` runs on type stripping), so the projection and
 * lighting constants are restated here and a coupling test in
 * tests/unit/assetsBake.spec.ts asserts they equal the renderer's own -
 * the same device that keeps TerrainAtlas and MapView in step (D-117).
 */

import { unzlibSync, zlibSync } from 'fflate';

// ------------------------------------------------------------ camera constants

/** Width of one tile diamond at zoom 1, from src/render/projection.ts. [px] */
export const BAKE_TILE_W = 64;

/** Height of one tile diamond at zoom 1, from src/render/projection.ts. [px] */
export const BAKE_TILE_H = 32;

/** Vertical pixels per height level at zoom 1, from src/render/projection.ts. [px] */
export const BAKE_HEIGHT_PX = 16;

/** Edge length of one tile, from src/sim/constants.ts TILE_SIZE_M. [m] */
export const BAKE_TILE_M = 50;

/** Metres per height level, from src/sim/constants.ts HEIGHT_STEP_M. [m] */
export const BAKE_HEIGHT_STEP_M = 8;

/**
 * The static-art proportion rule, restated from src/render/staticArt.ts
 * `BAKED_STATIC_MAX_LIFT_PX`. [px at zoom 1, measured above the tile centre]
 *
 * = CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2 = 3 * 16 + 16 = 64, i.e.
 * 2.00 tile heights, 4 height levels, 32 m: the drawable headroom of a
 * procedural atlas cell, which is what the D-117 world was drawn against and
 * what a fallback silhouette is physically clipped at. The coupling test in
 * tests/unit/assetsBake.spec.ts asserts the two constants equal, the same
 * device that keeps the camera and the light in step (D-160).
 *
 * {@link bakeAtlases} REFUSES a static cell above it rather than warning:
 * an out-of-proportion model is a failed bake, never a grey needle four and
 * a half tile heights tall standing over a 1950 town (D-206).
 */
export const BAKE_STATIC_MAX_LIFT_PX = 64;

/**
 * Targets the proportion rule applies to: the things that stand on ONE tile.
 * Vehicles are exempt - a train is drawn along its own path and is bounded by
 * the catalogue, not by a tile's headroom.
 *
 * `module:` joined the list with D-208: a station module occupies exactly one
 * tile (`StationModule` is {kind, tile, x, y}), so it is bounded by the same
 * headroom as a town building and by the same chunk-texture reserve, and a
 * terminal that broke the rule would be guillotined at a 0.5x chunk seam
 * exactly like D-206's skyscraper was.
 */
const STATIC_TARGET = /^(building|industry|module|tree):/;

/**
 * Flat-shading solved against the renderer's three box-face factors
 * (src/render/shapes.ts FACE_TOP/FACE_LEFT/FACE_RIGHT): factor(n) =
 * SHADE_BASE + n.x * SHADE_X + n.y * SHADE_Y + n.up * SHADE_UP reproduces
 * 1.06 for a roof, 0.74 for the face looking screen-left (+y, the NW-lit
 * side) and 0.52 for the face looking screen-right (+x), so a baked cell
 * sits in the same light as every procedural cell around it.
 */
export const SHADE_BASE = 0.44;
export const SHADE_X = 0.08;
export const SHADE_Y = 0.3;
export const SHADE_UP = 0.62;

/**
 * Grey level a company-colour zone gets in the BASE cell, before shading.
 * Neutral instead of the source paint, so an untinted draw (no owner known)
 * reads as an unliveried vehicle rather than as somebody's colours. [0-255]
 */
export const TINT_NEUTRAL_GREY = 190;

/**
 * The lit-window colour of the emissive pass (M13, SPEC2: "Fenster-/Lampen-
 * Materialien" render lit-only variants): every emissive face bakes to this
 * warm interior light, UNSHADED - lit is lit, whatever the NW light thinks.
 * A fixed colour rather than the authored glass tone, because the kits'
 * daylight glass is a sky-blue reflection and a window that glows sky-blue
 * at night reads as a monitor wall. Restates src/render/emissive.ts
 * EMISSIVE_WINDOW_HEX (#ffd98c) because Node cannot resolve src imports at
 * bake time; the coupling test in tests/unit/assetsBake.spec.ts asserts the
 * two equal (the D-160 device). [RGB 0-255]
 */
export const EMISSIVE_LIT_RGB: readonly [number, number, number] = [255, 217, 140];

/**
 * The baked contact shadow (SPEC2 M13: "Kontaktschatten (NW-Licht) je
 * Zelle"): every cell carries a soft dark patch at its ground line, so a
 * baked object sits ON the terrain instead of floating over it. Baked
 * rather than drawn live because it costs the runtime nothing per sprite,
 * and stamped only where the model left the base cell transparent - the
 * geometry always wins.
 *
 * The falloff runs from the FOOTPRINT outward, not from a centre: full
 * strength anywhere over the ground rectangle (that is what darkens the
 * gaps under a chassis, between bogies and wheels), fading quadratically
 * over SHADOW_MARGIN_M beyond the silhouette. A centre-based ellipse was
 * built first and produced nothing: over the body the geometry covers it,
 * so only its outer rim ever shows, and a rim is exactly where a radial
 * falloff is already zero.
 *
 * Two deliberate limits keep it honest against the ledger and the tests:
 * the patch follows the footprint symmetrically (the NW light of
 * SHADE_X/SHADE_Y/SHADE_UP would skew it screen-SE, but that skew is
 * 0.25 m = under one pixel at every baked zoom, while an asymmetric patch
 * breaks the exact width equality of 180-degree facing pairs the facing
 * test pins), and it is CLIPPED to the model's own cell rectangle:
 * extending every cell to the footprint's projected ground diamond was
 * measured to push zoom 2 from one page to two and zoom 4 from four pages
 * to six - a SPEC2 6.2 booking overrun (Fehlerkatalog 40) for pixels the
 * edge fade below renders invisible anyway.
 */
/** Peak opacity of the contact shadow over the footprint. [0-255 alpha] */
export const SHADOW_ALPHA_MAX = 88;

/** Reach of the contact shadow beyond the model's ground footprint. [m] */
export const SHADOW_MARGIN_M = 0.5;

/**
 * Fade band along the cell border, in zoom-1 pixels (scaled by zoom): the
 * shadow's alpha ramps to zero over this distance so the cell clip never
 * shows as a hard edge. [px at zoom 1]
 */
export const SHADOW_EDGE_FADE_PX = 3;

/**
 * The eight travel directions a facing index encodes, as (dx, dy) tile
 * deltas in the map's axes (+x lower-right on screen, +y lower-left).
 * M13 derives the index from the (NextTile - Tile) delta; the bake and the
 * game must agree on this order, so it is data here and in the manifest.
 */
export const FACING_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

// ---------------------------------------------------------------- PNG codec

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA pixels as a PNG. Deterministic: fixed filter, fflate level 9. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error('encodePng: pixel buffer size mismatch');
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const idat = zlibSync(raw, { level: 9 });
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bit per channel. */
  readonly rgba: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG into RGBA. Supports what Kenney's colormaps and our own
 * encoder actually produce: 8-bit depth, colour types 0 (grey), 2 (RGB),
 * 3 (indexed + optional tRNS), 6 (RGBA), no interlacing.
 */
export function decodePng(bytes: Uint8Array): DecodedImage {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('decodePng: not a PNG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let palette: Uint8Array | null = null;
  let paletteAlpha: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = data[8]!;
      colourType = data[9]!;
      if (data[12] !== 0) throw new Error('decodePng: interlaced PNGs are not supported');
      if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      paletteAlpha = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  let compressedLength = 0;
  for (const part of idat) compressedLength += part.length;
  const compressed = new Uint8Array(compressedLength);
  let at = 0;
  for (const part of idat) {
    compressed.set(part, at);
    at += part.length;
  }
  const channels =
    colourType === 6 ? 4 : colourType === 2 ? 3 : colourType === 0 || colourType === 3 ? 1 : -1;
  if (channels < 0) throw new Error(`decodePng: unsupported colour type ${colourType}`);
  const stride = width * channels;
  const raw = unzlibSync(compressed);
  if (raw.length !== (stride + 1) * height) throw new Error('decodePng: bad scanline data');

  // Undo the per-row filters in place.
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const rowIn = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels]! : 0;
      const up = prev ? prev[x]! : 0;
      const upLeft = prev && x >= channels ? prev[x - channels]! : 0;
      let value = rowIn[x]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`decodePng: unknown filter ${filter}`);
      row[x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (colourType === 6) {
      rgba[i * 4] = lines[i * 4]!;
      rgba[i * 4 + 1] = lines[i * 4 + 1]!;
      rgba[i * 4 + 2] = lines[i * 4 + 2]!;
      rgba[i * 4 + 3] = lines[i * 4 + 3]!;
    } else if (colourType === 2) {
      rgba[i * 4] = lines[i * 3]!;
      rgba[i * 4 + 1] = lines[i * 3 + 1]!;
      rgba[i * 4 + 2] = lines[i * 3 + 2]!;
      rgba[i * 4 + 3] = 255;
    } else if (colourType === 3) {
      const index = lines[i]!;
      if (!palette) throw new Error('decodePng: indexed PNG without PLTE');
      rgba[i * 4] = palette[index * 3]!;
      rgba[i * 4 + 1] = palette[index * 3 + 1]!;
      rgba[i * 4 + 2] = palette[index * 3 + 2]!;
      rgba[i * 4 + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index]! : 255;
    } else {
      rgba[i * 4] = lines[i]!;
      rgba[i * 4 + 1] = lines[i]!;
      rgba[i * 4 + 2] = lines[i]!;
      rgba[i * 4 + 3] = 255;
    }
  }
  return { width, height, rgba };
}

// ----------------------------------------------------------------- GLB parsing

/** The subset of glTF 2.0 the Kenney kits actually use. */
interface GltfJson {
  readonly scenes?: ReadonlyArray<{ readonly nodes?: readonly number[] }>;
  readonly scene?: number;
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: ReadonlyArray<{ readonly primitives: readonly GltfPrimitive[] }>;
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly materials?: readonly GltfMaterial[];
  readonly textures?: ReadonlyArray<{ readonly source?: number }>;
  readonly images?: ReadonlyArray<{ readonly uri?: string; readonly bufferView?: number }>;
}

interface GltfNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}

interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly mode?: number;
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly normalized?: boolean;
}

interface GltfBufferView {
  readonly buffer: number;
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

interface GltfMaterial {
  readonly name?: string;
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly number[];
    readonly baseColorTexture?: { readonly index: number };
  };
}

export interface GlbModel {
  readonly json: GltfJson;
  readonly bin: Uint8Array;
}

const GLB_MAGIC = 0x46546c67;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_CHUNK_BIN = 0x004e4942;

/** Parse a GLB container into its JSON tree and binary buffer. */
export function parseGlb(bytes: Uint8Array): GlbModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('parseGlb: not a GLB container');
  }
  if (view.getUint32(4, true) !== 2) throw new Error('parseGlb: only glTF 2.0 is supported');
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    } else if (type === GLB_CHUNK_BIN) {
      bin = chunk;
    }
    offset += 8 + length + (length % 4 === 0 ? 0 : 4 - (length % 4));
  }
  if (!json) throw new Error('parseGlb: missing JSON chunk');
  return { json, bin };
}

// ------------------------------------------------------------- triangle soup

/** One flat-shaded triangle in model space, colour already resolved. */
export interface BakeTriangle {
  /** Vertex positions, x0 y0 z0 x1 y1 z1 x2 y2 z2, glTF axes (+Y up, +Z forward). */
  readonly positions: Float64Array;
  /** Resolved face colour, 8 bit per channel. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** True when this face belongs to a company-colour zone. */
  readonly tint: boolean;
  /** True when this face is window/lamp glazing - the M13 emissive pass. */
  readonly emissive: boolean;
}

const COMPONENT_SIZE: Readonly<Record<number, number>> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

function readAccessor(model: GlbModel, index: number): Float64Array {
  const accessor = model.json.accessors?.[index];
  if (!accessor) throw new Error(`accessor ${index} missing`);
  const components = TYPE_COMPONENTS[accessor.type];
  const size = COMPONENT_SIZE[accessor.componentType];
  if (!components || !size) throw new Error(`accessor ${index}: unsupported layout`);
  const bufferView =
    accessor.bufferView != null ? model.json.bufferViews?.[accessor.bufferView] : undefined;
  if (!bufferView) throw new Error(`accessor ${index}: missing bufferView`);
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? components * size;
  const view = new DataView(model.bin.buffer, model.bin.byteOffset, model.bin.byteLength);
  const out = new Float64Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = start + i * stride + c * size;
      let value: number;
      switch (accessor.componentType) {
        case 5126:
          value = view.getFloat32(at, true);
          break;
        case 5125:
          value = view.getUint32(at, true);
          break;
        case 5123:
          value = view.getUint16(at, true);
          break;
        case 5122:
          value = view.getInt16(at, true);
          break;
        case 5121:
          value = view.getUint8(at);
          break;
        default:
          value = view.getInt8(at);
          break;
      }
      if (accessor.normalized === true) {
        const max = accessor.componentType === 5121 ? 255 : 65535;
        value /= max;
      }
      out[i * components + c] = value;
    }
  }
  return out;
}

type Matrix = Float64Array; // 4x4, column major like glTF

function identity(): Matrix {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function nodeMatrix(node: GltfNode): Matrix {
  if (node.matrix) return Float64Array.from(node.matrix);
  const m = identity();
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  // Rotation matrix from the quaternion, then scale per column, then translate.
  const xx = qx! * qx!;
  const yy = qy! * qy!;
  const zz = qz! * qz!;
  const xy = qx! * qy!;
  const xz = qx! * qz!;
  const yz = qy! * qz!;
  const wx = qw! * qx!;
  const wy = qw! * qy!;
  const wz = qw! * qz!;
  m[0] = (1 - 2 * (yy + zz)) * sx!;
  m[1] = 2 * (xy + wz) * sx!;
  m[2] = 2 * (xz - wy) * sx!;
  m[4] = 2 * (xy - wz) * sy!;
  m[5] = (1 - 2 * (xx + zz)) * sy!;
  m[6] = 2 * (yz + wx) * sy!;
  m[8] = 2 * (xz + wy) * sz!;
  m[9] = 2 * (yz - wx) * sz!;
  m[10] = (1 - 2 * (xx + yy)) * sz!;
  m[12] = tx!;
  m[13] = ty!;
  m[14] = tz!;
  return m;
}

function applyMatrix(m: Matrix, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/** One hue band of a company-colour zone, degrees on the HSL wheel. */
export interface TintHueRange {
  /** Start hue, 0-360. A range may wrap (min 350, max 10). [deg] */
  readonly min: number;
  /** End hue, 0-360. [deg] */
  readonly max: number;
  /** Faces below this HSL saturation stay unpainted hull. [0-1] */
  readonly minSaturation: number;
}

/**
 * A deterministic recolour of every NON-tint face, for manifest-driven
 * generation variants of a reused model (M13, D-169): the kits carry fewer
 * distinguishable bodies than the catalogue has entries, and where a reuse
 * is honest (successive generations of one family) the recolour is what
 * keeps the entries tellable apart. Company-colour zones are untouched -
 * they render neutral grey in the base cell whatever the hull wears.
 */
export interface RecolorSpec {
  /** Degrees added on the HSV hue wheel, wrapped into [0, 360). [deg] */
  readonly hueShift?: number;
  /** Multiplier on HSV saturation, clamped to [0, 1]. */
  readonly saturation?: number;
  /** Multiplier on HSV value (brightness), clamped to [0, 1]. */
  readonly value?: number;
}

export interface ExtractOptions {
  /** External images by exact uri as referenced from the glTF, pre-decoded. */
  readonly images?: ReadonlyMap<string, DecodedImage>;
  /** Material names whose faces are company-colour zones (older kits). */
  readonly tintMaterials?: readonly string[];
  /**
   * Palette colours (lower-case "#rrggbb") whose faces are company-colour
   * zones - exact matches, for hand-picked single patches.
   */
  readonly tintColors?: readonly string[];
  /**
   * Hue bands whose faces are company-colour zones - the working convention
   * for the colormap kits: one material carries every colour of the model
   * in one texture, and a paint job is a RAMP of shades around one hue, so
   * a band catches the whole livery where an exact list would fray.
   */
  readonly tintHues?: readonly TintHueRange[];
  /**
   * Material names whose faces are window/lamp glazing (M13 emissive pass).
   * A face already claimed as a company-colour zone stays tint: a livery is
   * paint, and paint does not glow.
   */
  readonly emissiveMaterials?: readonly string[];
  /** Exact palette colours (lower-case "#rrggbb") that are glazing. */
  readonly emissiveColors?: readonly string[];
  /**
   * Hue bands that are glazing - the working convention for the colormap
   * kits, where window glass is one sky-blue ramp shared across packs
   * (measured hue 212-216 at HSL saturation 0.62-0.83 on every mapped kit).
   */
  readonly emissiveHues?: readonly TintHueRange[];
  /** Deterministic recolour of the non-tint faces (generation variants). */
  readonly recolor?: RecolorSpec;
}

function hexOf(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Apply a RecolorSpec to one 8-bit colour: RGB -> HSV, shift/scale, -> RGB.
 * Pure float maths on fixed inputs - the same bytes in give the same bytes
 * out on every machine, which is all "bake twice, bit-identical" needs.
 */
export function applyRecolor(
  r: number,
  g: number,
  b: number,
  recolor: RecolorSpec,
): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  if (hue < 0) hue += 360;
  let saturation = max === 0 ? 0 : delta / max;
  let value = max;
  hue = (((hue + (recolor.hueShift ?? 0)) % 360) + 360) % 360;
  saturation = Math.max(0, Math.min(1, saturation * (recolor.saturation ?? 1)));
  value = Math.max(0, Math.min(1, value * (recolor.value ?? 1)));
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (hue < 60) [rr, gg, bb] = [c, x, 0];
  else if (hue < 120) [rr, gg, bb] = [x, c, 0];
  else if (hue < 180) [rr, gg, bb] = [0, c, x];
  else if (hue < 240) [rr, gg, bb] = [0, x, c];
  else if (hue < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  return [
    Math.max(0, Math.min(255, Math.round((rr + m) * 255))),
    Math.max(0, Math.min(255, Math.round((gg + m) * 255))),
    Math.max(0, Math.min(255, Math.round((bb + m) * 255))),
  ];
}

/** Hue in degrees and HSL saturation of an 8-bit colour. */
export function hueSaturation(r: number, g: number, b: number): { hue: number; saturation: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation };
}

function inHueRanges(r: number, g: number, b: number, ranges: readonly TintHueRange[]): boolean {
  if (ranges.length === 0) return false;
  const { hue, saturation } = hueSaturation(r, g, b);
  for (const range of ranges) {
    if (saturation < range.minSaturation) continue;
    if (range.min <= range.max) {
      if (hue >= range.min && hue <= range.max) return true;
    } else if (hue >= range.min || hue <= range.max) {
      return true;
    }
  }
  return false;
}

function resolveImage(model: GlbModel, options: ExtractOptions, source: number): DecodedImage {
  const image = model.json.images?.[source];
  if (!image) throw new Error(`image ${source} missing`);
  if (image.uri != null) {
    const provided = options.images?.get(image.uri);
    if (!provided) throw new Error(`external image "${image.uri}" was not provided`);
    return provided;
  }
  if (image.bufferView != null) {
    const bufferView = model.json.bufferViews?.[image.bufferView];
    if (!bufferView) throw new Error(`image ${source}: missing bufferView`);
    const start = bufferView.byteOffset ?? 0;
    return decodePng(model.bin.subarray(start, start + bufferView.byteLength));
  }
  throw new Error(`image ${source}: neither uri nor bufferView`);
}

/**
 * Flatten a model into flat-shaded triangles with resolved face colours.
 *
 * The colour of a face is the material's baseColorFactor times, when a
 * baseColorTexture exists, the texel under the face's UV centroid - the
 * palette-texture convention every recent Kenney kit uses maps each face
 * entirely into one flat colour patch, so one nearest-neighbour sample IS
 * the face colour. Faces more transparent than one half are dropped
 * (window glass); alpha blending is deliberately out of scope for 64 px art.
 */
export function extractTriangles(model: GlbModel, options: ExtractOptions = {}): BakeTriangle[] {
  const triangles: BakeTriangle[] = [];
  const sceneIndex = model.json.scene ?? 0;
  const roots = model.json.scenes?.[sceneIndex]?.nodes ?? [];
  const imageCache = new Map<number, DecodedImage>();
  const tintMaterials = new Set(options.tintMaterials ?? []);
  const tintColors = new Set((options.tintColors ?? []).map((c) => c.toLowerCase()));
  const emissiveMaterials = new Set(options.emissiveMaterials ?? []);
  const emissiveColors = new Set((options.emissiveColors ?? []).map((c) => c.toLowerCase()));

  const visit = (nodeIndex: number, parent: Matrix): void => {
    const node = model.json.nodes?.[nodeIndex];
    if (!node) return;
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh != null) {
      const mesh = model.json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        if ((primitive.mode ?? 4) !== 4) continue; // triangles only
        emitPrimitive(primitive, world);
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const emitPrimitive = (primitive: GltfPrimitive, world: Matrix): void => {
    const positionIndex = primitive.attributes['POSITION'];
    if (positionIndex == null) return;
    const positions = readAccessor(model, positionIndex);
    const vertexCount = positions.length / 3;
    let indices: Float64Array;
    if (primitive.indices != null) {
      indices = readAccessor(model, primitive.indices);
    } else {
      indices = new Float64Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) indices[i] = i;
    }

    const material =
      primitive.material != null ? model.json.materials?.[primitive.material] : undefined;
    const pbr = material?.pbrMetallicRoughness;
    const factor = pbr?.baseColorFactor ?? [1, 1, 1, 1];
    let texture: DecodedImage | null = null;
    let uv: Float64Array | null = null;
    if (pbr?.baseColorTexture) {
      const source = model.json.textures?.[pbr.baseColorTexture.index]?.source;
      if (source != null) {
        let decoded = imageCache.get(source);
        if (!decoded) {
          decoded = resolveImage(model, options, source);
          imageCache.set(source, decoded);
        }
        texture = decoded;
        const uvIndex = primitive.attributes['TEXCOORD_0'];
        if (uvIndex != null) uv = readAccessor(model, uvIndex);
      }
    }
    const materialTinted = material?.name != null && tintMaterials.has(material.name);
    const materialEmissive = material?.name != null && emissiveMaterials.has(material.name);

    for (let t = 0; t + 2 < indices.length; t += 3) {
      const out = new Float64Array(9);
      let alpha = factor[3] ?? 1;
      let r = 255 * (factor[0] ?? 1);
      let g = 255 * (factor[1] ?? 1);
      let b = 255 * (factor[2] ?? 1);
      if (texture && uv) {
        let cu = 0;
        let cv = 0;
        for (let v = 0; v < 3; v++) {
          const index = indices[t + v]!;
          cu += uv[index * 2]! / 3;
          cv += uv[index * 2 + 1]! / 3;
        }
        // REPEAT wrap, nearest-neighbour sample at the centroid.
        cu -= Math.floor(cu);
        cv -= Math.floor(cv);
        const px = Math.min(texture.width - 1, Math.floor(cu * texture.width));
        const py = Math.min(texture.height - 1, Math.floor(cv * texture.height));
        const at = (py * texture.width + px) * 4;
        r = (r / 255) * texture.rgba[at]!;
        g = (g / 255) * texture.rgba[at + 1]!;
        b = (b / 255) * texture.rgba[at + 2]!;
        alpha *= texture.rgba[at + 3]! / 255;
      }
      if (alpha < 0.5) continue;
      for (let v = 0; v < 3; v++) {
        const index = indices[t + v]!;
        const [x, y, z] = applyMatrix(
          world,
          positions[index * 3]!,
          positions[index * 3 + 1]!,
          positions[index * 3 + 2]!,
        );
        out[v * 3] = x;
        out[v * 3 + 1] = y;
        out[v * 3 + 2] = z;
      }
      let r8 = Math.max(0, Math.min(255, Math.round(r)));
      let g8 = Math.max(0, Math.min(255, Math.round(g)));
      let b8 = Math.max(0, Math.min(255, Math.round(b)));
      // Tint classification reads the AUTHORED colour; the recolour applies
      // only to the hull afterwards, so a hue variant of a reused model
      // keeps exactly the company-colour zones of the original.
      const tint =
        materialTinted ||
        tintColors.has(hexOf(r8, g8, b8)) ||
        inHueRanges(r8, g8, b8, options.tintHues ?? []);
      // Glazing too reads the AUTHORED colour, and tint wins: a livery in a
      // glass-blue paint is somebody's colours, not a window (the two blue
      // hulls of the water catalogue are exactly this case).
      const emissive =
        !tint &&
        (materialEmissive ||
          emissiveColors.has(hexOf(r8, g8, b8)) ||
          inHueRanges(r8, g8, b8, options.emissiveHues ?? []));
      if (!tint && options.recolor) {
        [r8, g8, b8] = applyRecolor(r8, g8, b8, options.recolor);
      }
      triangles.push({ positions: out, r: r8, g: g8, b: b8, tint, emissive });
    }
  };

  for (const root of roots) visit(root, identity());
  return triangles;
}

// ----------------------------------------------------------------- rasteriser

export interface SpriteRender {
  readonly width: number;
  readonly height: number;
  /** Cell pixel the model's ground-centre pivot projects to. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Base pass: full colours, company zones in neutral grey. */
  readonly base: Uint8Array;
  /** Mask pass: company zones only, shading in the grey value (D-160). */
  readonly mask: Uint8Array;
  /**
   * Emissive pass (M13): glazing only, in EMISSIVE_LIT_RGB, UNSHADED -
   * transparent everywhere else. Same cell rectangle as the base pass, so
   * the lit twin lands on its cell with the same anchor. All-transparent
   * when the model has no glazing; the packer skips it then.
   */
  readonly emissive: Uint8Array;
  /** True when at least one emissive pixel survived the depth pass. */
  readonly hasEmissive: boolean;
  /** Named anchor points (chimneys, emitters) projected into cell pixels. */
  readonly points: Readonly<Record<string, readonly [number, number]>>;
}

export interface RenderOptions {
  /** Model units to metres. */
  readonly scale: number;
  /** Facing index 0-7 into FACING_DELTAS. */
  readonly facing: number;
  /** Zoom factor: 1, 2 or 4. */
  readonly zoom: number;
  /** Named model-space points to project along with the geometry (E-14 anchors). */
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
  /**
   * Per-axis multipliers [x, y, z] in MODEL space, around the ground-centre
   * pivot (M13, D-169). +z is the travel axis, so [1, 1, 1.8] lengthens a
   * van into a bus body and [1, 1.7, 1.6] raises it into a double-decker -
   * the manifest-driven silhouette variation for reused models. Anchors
   * stretch with the geometry.
   */
  readonly stretch?: readonly [number, number, number];
}

/**
 * Render a triangle soup through the dimetric camera with a z-buffer.
 *
 * The view axis is the projection's null direction (1, 1, 0.32) in metres -
 * the exact vector the 16.1 constants leave invisible - so depth ordering
 * here agrees with the drawOrder() painter ordering of the live renderer.
 */
export function renderSprite(triangles: readonly BakeTriangle[], options: RenderOptions): SpriteRender {
  const delta = FACING_DELTAS[options.facing];
  if (!delta) throw new Error(`renderSprite: facing ${options.facing} out of range`);
  const deltaLength = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
  const fx = delta[0] / deltaLength;
  const fy = delta[1] / deltaLength;

  // Model-space bounding box; rotation pivots on the ground centre, which is
  // also the sprite anchor - Kenney models are authored origin-at-centre, but
  // measuring makes the bake robust against the ones that are not.
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const tri of triangles) {
    for (let v = 0; v < 3; v++) {
      const x = tri.positions[v * 3]!;
      const y = tri.positions[v * 3 + 1]!;
      const z = tri.positions[v * 3 + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) throw new Error('renderSprite: no triangles');
  const pivotX = (minX + maxX) / 2;
  const pivotZ = (minZ + maxZ) / 2;
  const pivotY = minY;
  // The stretch is linear around the pivot, so the pivot measured on the
  // unstretched box IS the pivot of the stretched model and the ground line
  // stays the ground line.
  const stretchX = options.stretch?.[0] ?? 1;
  const stretchY = options.stretch?.[1] ?? 1;
  const stretchZ = options.stretch?.[2] ?? 1;

  const pxPerMeterX = ((BAKE_TILE_W / 2) * options.zoom) / BAKE_TILE_M;
  const pxPerMeterY = ((BAKE_TILE_H / 2) * options.zoom) / BAKE_TILE_M;
  const pxPerMeterUp = (BAKE_HEIGHT_PX * options.zoom) / BAKE_HEIGHT_STEP_M;
  /** Up component of the view axis: solves the projection's null direction. */
  const depthUp = (2 * pxPerMeterY) / pxPerMeterUp;

  // Project every vertex once: model -> ground metres -> screen px + depth.
  const projected: Float64Array[] = [];
  const grounds: Float64Array[] = [];
  let screenMinX = Infinity;
  let screenMinY = Infinity;
  let screenMaxX = -Infinity;
  let screenMaxY = -Infinity;
  // Ground-plane footprint of the whole model, for the contact shadow.
  let groundMinX = Infinity;
  let groundMinY = Infinity;
  let groundMaxX = -Infinity;
  let groundMaxY = -Infinity;
  for (const tri of triangles) {
    const screen = new Float64Array(9); // sx, sy, depth per vertex
    const ground = new Float64Array(9); // gx, gy, up per vertex
    for (let v = 0; v < 3; v++) {
      const mx = (tri.positions[v * 3]! - pivotX) * options.scale * stretchX;
      const up = (tri.positions[v * 3 + 1]! - pivotY) * options.scale * stretchY;
      const mz = (tri.positions[v * 3 + 2]! - pivotZ) * options.scale * stretchZ;
      // Forward (+Z) points along the travel delta; +X is rotated with it.
      const gx = mz * fx - mx * fy;
      const gy = mz * fy + mx * fx;
      ground[v * 3] = gx;
      ground[v * 3 + 1] = gy;
      ground[v * 3 + 2] = up;
      if (gx < groundMinX) groundMinX = gx;
      if (gx > groundMaxX) groundMaxX = gx;
      if (gy < groundMinY) groundMinY = gy;
      if (gy > groundMaxY) groundMaxY = gy;
      const sx = (gx - gy) * pxPerMeterX;
      const sy = (gx + gy) * pxPerMeterY - up * pxPerMeterUp;
      screen[v * 3] = sx;
      screen[v * 3 + 1] = sy;
      screen[v * 3 + 2] = gx + gy + up * depthUp;
      if (sx < screenMinX) screenMinX = sx;
      if (sx > screenMaxX) screenMaxX = sx;
      if (sy < screenMinY) screenMinY = sy;
      if (sy > screenMaxY) screenMaxY = sy;
    }
    projected.push(screen);
    grounds.push(ground);
  }

  // Contact shadow on the ground plane: full strength over the footprint
  // rectangle, fading over SHADOW_MARGIN_M beyond it, clipped to the
  // model's own cell (see SHADOW_ALPHA_MAX for all three) - the cell
  // rectangle stays exactly the model's, so the atlas booking of SPEC2
  // 6.2 does not move.
  const shadowCx = (groundMinX + groundMaxX) / 2;
  const shadowCy = (groundMinY + groundMaxY) / 2;
  const shadowHalfW = (groundMaxX - groundMinX) / 2;
  const shadowHalfH = (groundMaxY - groundMinY) / 2;

  const pad = 1;
  const originX = Math.floor(screenMinX) - pad;
  const originY = Math.floor(screenMinY) - pad;
  const width = Math.ceil(screenMaxX) - originX + pad;
  const height = Math.ceil(screenMaxY) - originY + pad;
  const base = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height * 4);
  const emissive = new Uint8Array(width * height * 4);
  const depthBuffer = new Float64Array(width * height).fill(-Infinity);

  for (let t = 0; t < projected.length; t++) {
    const tri = triangles[t]!;
    const screen = projected[t]!;
    const ground = grounds[t]!;

    // Face normal in ground space for the NW-light flat shading.
    const ax = ground[3]! - ground[0]!;
    const ay = ground[4]! - ground[1]!;
    const az = ground[5]! - ground[2]!;
    const bx = ground[6]! - ground[0]!;
    const by = ground[7]! - ground[1]!;
    const bz = ground[8]! - ground[2]!;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (normalLength === 0) continue;
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;
    // Shade the side that faces the camera, whatever the winding order.
    if (nx + ny + nz * depthUp < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const factor = Math.max(0, SHADE_BASE + nx * SHADE_X + ny * SHADE_Y + nz * SHADE_UP);
    const shadeChannel = (value: number): number =>
      Math.max(0, Math.min(255, Math.round(value * factor)));
    const baseR = tri.tint ? shadeChannel(TINT_NEUTRAL_GREY) : shadeChannel(tri.r);
    const baseG = tri.tint ? shadeChannel(TINT_NEUTRAL_GREY) : shadeChannel(tri.g);
    const baseB = tri.tint ? shadeChannel(TINT_NEUTRAL_GREY) : shadeChannel(tri.b);
    const maskGrey = shadeChannel(255);

    const x0 = screen[0]! - originX;
    const y0 = screen[1]! - originY;
    const d0 = screen[2]!;
    const x1 = screen[3]! - originX;
    const y1 = screen[4]! - originY;
    const d1 = screen[5]!;
    const x2 = screen[6]! - originX;
    const y2 = screen[7]! - originY;
    const d2 = screen[8]!;
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (area === 0) continue;

    const left = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const right = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const top = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = top; py <= bottom; py++) {
      for (let px = left; px <= right; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const w0 = ((x1 - cx) * (y2 - cy) - (y1 - cy) * (x2 - cx)) / area;
        const w1 = ((x2 - cx) * (y0 - cy) - (y2 - cy) * (x0 - cx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * d0 + w1 * d1 + w2 * d2;
        const cell = py * width + px;
        if (depth <= depthBuffer[cell]!) continue;
        depthBuffer[cell] = depth;
        const at = cell * 4;
        base[at] = baseR;
        base[at + 1] = baseG;
        base[at + 2] = baseB;
        base[at + 3] = 255;
        if (tri.tint) {
          mask[at] = maskGrey;
          mask[at + 1] = maskGrey;
          mask[at + 2] = maskGrey;
          mask[at + 3] = 255;
        } else {
          mask[at] = 0;
          mask[at + 1] = 0;
          mask[at + 2] = 0;
          mask[at + 3] = 0;
        }
        // The emissive pass mirrors the mask pass: the depth WINNER decides,
        // so a window behind a wall stays dark and a wall in front of a
        // window overwrites a glow an earlier triangle left there.
        if (tri.emissive) {
          emissive[at] = EMISSIVE_LIT_RGB[0];
          emissive[at + 1] = EMISSIVE_LIT_RGB[1];
          emissive[at + 2] = EMISSIVE_LIT_RGB[2];
          emissive[at + 3] = 255;
        } else {
          emissive[at] = 0;
          emissive[at + 1] = 0;
          emissive[at + 2] = 0;
          emissive[at + 3] = 0;
        }
      }
    }
  }

  // Stamp the contact shadow into the BASE cell only, where the model left
  // it transparent - geometry always wins, the mask never darkens. The
  // quadratic falloff keeps the patch soft, the border fade hides the cell
  // clip, and the alpha never reaches 255, so "opaque pixel" keeps meaning
  // "model pixel" for every downstream test.
  const fadePx = SHADOW_EDGE_FADE_PX * options.zoom;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const at = (py * width + px) * 4;
      if (base[at + 3] !== 0) continue;
      const sx = px + 0.5 + originX;
      const sy = py + 0.5 + originY;
      // Back-projection at up = 0: the inverse of the vertex projection.
      const gx = (sx / pxPerMeterX + sy / pxPerMeterY) / 2;
      const gy = (sy / pxPerMeterY - sx / pxPerMeterX) / 2;
      // Distance OUTSIDE the footprint rectangle; zero underneath it.
      const ox = Math.max(0, Math.abs(gx - shadowCx) - shadowHalfW);
      const oy = Math.max(0, Math.abs(gy - shadowCy) - shadowHalfH);
      const outside = Math.sqrt(ox * ox + oy * oy);
      if (outside >= SHADOW_MARGIN_M) continue;
      const t = 1 - outside / SHADOW_MARGIN_M;
      const edge = Math.min(px, width - 1 - px, py, height - 1 - py) + 0.5;
      const fade = edge >= fadePx ? 1 : edge / fadePx;
      const alpha = Math.round(SHADOW_ALPHA_MAX * t * t * fade);
      if (alpha <= 0) continue;
      base[at] = 0;
      base[at + 1] = 0;
      base[at + 2] = 0;
      base[at + 3] = alpha;
    }
  }

  const points: Record<string, readonly [number, number]> = {};
  for (const [name, point] of Object.entries(options.anchors ?? {})) {
    const mx = (point[0] - pivotX) * options.scale * stretchX;
    const up = (point[1] - pivotY) * options.scale * stretchY;
    const mz = (point[2] - pivotZ) * options.scale * stretchZ;
    const gx = mz * fx - mx * fy;
    const gy = mz * fy + mx * fx;
    points[name] = [
      (gx - gy) * pxPerMeterX - originX,
      (gx + gy) * pxPerMeterY - up * pxPerMeterUp - originY,
    ];
  }

  // Whether any glazing survived occlusion is decided per FACING on the
  // pixels, not per model on the triangle list: a window the depth pass
  // never let through must not book an empty atlas cell.
  let hasEmissive = false;
  for (let i = 3; i < emissive.length; i += 4) {
    if (emissive[i] !== 0) {
      hasEmissive = true;
      break;
    }
  }

  return { width, height, anchorX: -originX, anchorY: -originY, base, mask, emissive, hasEmissive, points };
}

// -------------------------------------------------------------- atlas layout

export interface CellPlacement {
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Deterministic shelf packing in input order: rows fill left to right, a
 * page closes when a row no longer fits below 4096 px. No sorting - input
 * order IS the layout, which is what keeps two bakes bit-identical.
 */
export function layoutCells(
  sizes: ReadonlyArray<{ readonly width: number; readonly height: number }>,
  maxSize = 4096,
): { placements: CellPlacement[]; pages: Array<{ width: number; height: number }> } {
  const placements: CellPlacement[] = [];
  const pages: Array<{ width: number; height: number }> = [];
  let page = -1;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const openPage = (): void => {
    page += 1;
    pages.push({ width: 0, height: 0 });
    cursorX = 0;
    cursorY = 0;
    rowHeight = 0;
  };
  openPage();
  for (const size of sizes) {
    if (size.width > maxSize || size.height > maxSize) {
      throw new Error(`layoutCells: a ${size.width}x${size.height} cell exceeds ${maxSize} px`);
    }
    if (cursorX + size.width > maxSize) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
    if (cursorY + size.height > maxSize) openPage();
    placements.push({ page, x: cursorX, y: cursorY });
    const current = pages[page]!;
    if (cursorX + size.width > current.width) current.width = cursorX + size.width;
    if (cursorY + size.height > current.height) current.height = cursorY + size.height;
    cursorX += size.width;
    if (size.height > rowHeight) rowHeight = size.height;
  }
  return { placements, pages };
}

// ------------------------------------------------------------------ full bake

export interface BakeModelInput {
  /** Stable identifier, e.g. "vehicle:1000" - becomes the cell key. */
  readonly target: string;
  readonly triangles: readonly BakeTriangle[];
  /** Model units to metres. */
  readonly scale: number;
  /** 8 for things that drive, 1 for things that stand. */
  readonly facings: number;
  /**
   * Facing index the FIRST cell is rendered at, 0-7 (D-208). [index]
   *
   * A vehicle bakes all eight and leaves this at 0, so its cell `facing` and
   * the direction it is drawn at are the same number - the whole of D-170's
   * lookup rests on that. A STATIC bakes one cell, and which way its model
   * happens to point is an art fact the kit decided: a depot whose vehicle
   * door faces away from the camera is a cottage, which is a wrong silhouette
   * in exactly the D-117 sense. The cell still records `facing` 0, because
   * that is what identifies it as static art (`staticArt.STATIC_FACING`) -
   * only the CAMERA moved.
   */
  readonly baseFacing?: number;
  /** Named model-space anchor points (chimneys, emitters), E-14 metadata. */
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
  /** Per-axis model-space multipliers for reused-model variants (D-169). */
  readonly stretch?: readonly [number, number, number];
}

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
   * The emissive twin of this cell (M13), when the model has glazing: the
   * lit-only rectangle on its own emissive page (SPEC2 6.2 page 2), same
   * width/height/anchor as the base cell. Either all three fields exist or
   * none - the loader validates the trio.
   */
  readonly emissivePage?: string;
  readonly emissiveX?: number;
  readonly emissiveY?: number;
  /** Named anchor points in cell pixels, present when the model declares any. */
  readonly points?: Readonly<Record<string, readonly [number, number]>>;
}

export interface BakedPageManifest {
  readonly file: string;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  /** 'emissive' for the lit-twin pages of M13; absent for sprite pages. */
  readonly kind?: 'emissive';
  readonly cells: readonly BakedCell[];
}

export interface BakeResult {
  /** File name to bytes; includes the JSON manifest itself. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly manifest: {
    readonly version: number;
    readonly tint: string;
    readonly facingDeltas: ReadonlyArray<readonly [number, number]>;
    readonly zooms: readonly number[];
    readonly pages: readonly BakedPageManifest[];
  };
}

export const BAKED_MANIFEST_NAME = 'baked-manifest.json';

/**
 * Version of the baked-manifest format this library writes. Bumped to 2 by
 * M13 (emissive fields + emissive pages); src/render/bakedAtlas.ts restates
 * it as BAKED_MANIFEST_VERSION and refuses anything else, so a stale bake
 * from before the bump falls back to procedural art with a warning instead
 * of being half-read (D-160's unknown-version rule). The coupling test in
 * tests/unit/assetsBake.spec.ts asserts the two constants equal.
 */
export const BAKE_MANIFEST_VERSION = 2;

/** The zoom levels baked per model (SPEC.md 16.2: atlases per zoom level). */
export const BAKE_ZOOMS: readonly number[] = [1, 2, 4];

/**
 * Bake every model at every zoom into shelf-packed atlas pages plus a JSON
 * manifest. Pure and allocation-honest: same inputs, same bytes, always -
 * the reproducibility test hashes exactly this output twice.
 *
 * The base cell and its mask cell are packed as two neighbouring cells of
 * the same page; a cell entry carries both rectangles.
 */
export function bakeAtlases(models: readonly BakeModelInput[], zooms = BAKE_ZOOMS): BakeResult {
  const files = new Map<string, Uint8Array>();
  const pageManifests: BakedPageManifest[] = [];
  for (const zoom of zooms) {
    const renders: SpriteRender[] = [];
    const owners: Array<{ target: string; facing: number }> = [];
    for (const model of models) {
      for (let facing = 0; facing < model.facings; facing++) {
        const render = renderSprite(model.triangles, {
          scale: model.scale,
          // The camera index, which is the cell index turned by the entry's
          // own `baseFacing` (D-208) - zero for every vehicle, so a driving
          // sprite's cell facing IS its direction.
          facing: (facing + (model.baseFacing ?? 0)) & 7,
          zoom,
          anchors: model.anchors,
          stretch: model.stretch,
        });
        // The proportion rule (D-206), enforced where it can be: a static
        // cell that lifts more than a procedural atlas cell can draw is a
        // building the fallback cannot express and a cell the 0.5x chunk
        // texture would guillotine. Refused, with the numbers in the message.
        const lift = render.anchorY / zoom;
        if (STATIC_TARGET.test(model.target) && lift > BAKE_STATIC_MAX_LIFT_PX) {
          throw new Error(
            `${model.target}: lifts ${lift.toFixed(1)} px at zoom 1 ` +
              `(${(lift / BAKE_TILE_H).toFixed(2)} tile heights, ` +
              `${(lift / BAKE_HEIGHT_PX).toFixed(2)} height levels), ` +
              `over the ${BAKE_STATIC_MAX_LIFT_PX} px static-art rule - ` +
              `lower the model, or scale/stretch it into proportion`,
          );
        }
        renders.push(render);
        owners.push({ target: model.target, facing });
      }
    }
    // A base cell and its mask cell are packed as ONE double-width rect and
    // split afterwards - the full M13 catalogue spans several pages per
    // zoom, and an atomic pair is what guarantees both halves always share
    // a page (a straddling pair used to be a hard error here).
    const sizes: Array<{ width: number; height: number }> = renders.map((render) => ({
      width: render.width * 2,
      height: render.height,
    }));
    // The emissive twins (M13) pack as their OWN page set per zoom - the
    // SPEC2 6.2 page-2 booking - in render order, single-width cells: only
    // renders whose depth pass actually let glazing through take a cell.
    const emissiveIndices: number[] = [];
    for (let i = 0; i < renders.length; i++) {
      if (renders[i]!.hasEmissive) emissiveIndices.push(i);
    }
    const emissiveLayout = layoutCells(
      emissiveIndices.map((i) => ({ width: renders[i]!.width, height: renders[i]!.height })),
    );
    const emissivePlaceByRender = new Map<number, CellPlacement>();
    for (let e = 0; e < emissiveIndices.length; e++) {
      emissivePlaceByRender.set(emissiveIndices[e]!, emissiveLayout.placements[e]!);
    }
    const emissivePageName = (p: number): string => `atlas-z${zoom}-e${p}.png`;

    const { placements, pages } = layoutCells(sizes);
    const pixelPages = pages.map((page) => new Uint8Array(page.width * page.height * 4));
    const emissivePixelPages = emissiveLayout.pages.map(
      (page) => new Uint8Array(page.width * page.height * 4),
    );
    const cellsPerPage: BakedCell[][] = pages.map(() => []);
    for (let i = 0; i < renders.length; i++) {
      const render = renders[i]!;
      const pairPlace = placements[i]!;
      const basePlace = { page: pairPlace.page, x: pairPlace.x, y: pairPlace.y };
      const maskPlace = { page: pairPlace.page, x: pairPlace.x + render.width, y: pairPlace.y };
      blit(pixelPages[basePlace.page]!, pages[basePlace.page]!.width, render.base, render, basePlace);
      blit(pixelPages[maskPlace.page]!, pages[maskPlace.page]!.width, render.mask, render, maskPlace);
      const emissivePlace = emissivePlaceByRender.get(i);
      if (emissivePlace !== undefined) {
        blit(
          emissivePixelPages[emissivePlace.page]!,
          emissiveLayout.pages[emissivePlace.page]!.width,
          render.emissive,
          render,
          emissivePlace,
        );
      }
      const cell: BakedCell = {
        target: owners[i]!.target,
        facing: owners[i]!.facing,
        x: basePlace.x,
        y: basePlace.y,
        width: render.width,
        height: render.height,
        anchorX: render.anchorX,
        anchorY: render.anchorY,
        maskX: maskPlace.x,
        maskY: maskPlace.y,
        ...(emissivePlace !== undefined
          ? {
              emissivePage: emissivePageName(emissivePlace.page),
              emissiveX: emissivePlace.x,
              emissiveY: emissivePlace.y,
            }
          : {}),
        ...(Object.keys(render.points).length > 0 ? { points: render.points } : {}),
      };
      cellsPerPage[basePlace.page]!.push(cell);
    }
    for (let p = 0; p < pages.length; p++) {
      const name = `atlas-z${zoom}-p${p}.png`;
      files.set(name, encodePng(pages[p]!.width, pages[p]!.height, pixelPages[p]!));
      pageManifests.push({
        file: name,
        zoom,
        width: pages[p]!.width,
        height: pages[p]!.height,
        cells: cellsPerPage[p]!,
      });
    }
    for (let p = 0; p < emissiveLayout.pages.length; p++) {
      const name = emissivePageName(p);
      files.set(
        name,
        encodePng(emissiveLayout.pages[p]!.width, emissiveLayout.pages[p]!.height, emissivePixelPages[p]!),
      );
      // Emissive pages carry no cells of their own: the base cell's
      // emissive trio points into them, so a page here is texture plus
      // dimensions and nothing else.
      pageManifests.push({
        file: name,
        zoom,
        width: emissiveLayout.pages[p]!.width,
        height: emissiveLayout.pages[p]!.height,
        kind: 'emissive',
        cells: [],
      });
    }
  }
  const manifest = {
    version: BAKE_MANIFEST_VERSION,
    tint: 'two-pass: base holds company zones in neutral grey; the mask cell holds those pixels with the NW shading in its grey value, so tinting the mask with a company colour multiplies to a shaded livery',
    facingDeltas: FACING_DELTAS,
    zooms: [...zooms],
    pages: pageManifests,
  };
  files.set(BAKED_MANIFEST_NAME, new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`));
  return { files, manifest };
}

function blit(
  page: Uint8Array,
  pageWidth: number,
  source: Uint8Array,
  size: { readonly width: number; readonly height: number },
  place: CellPlacement,
): void {
  for (let y = 0; y < size.height; y++) {
    const from = y * size.width * 4;
    const to = ((place.y + y) * pageWidth + place.x) * 4;
    page.set(source.subarray(from, from + size.width * 4), to);
  }
}

// -------------------------------------------------------- synthetic fixtures

/** Assemble a GLB container from a glTF JSON tree and a binary buffer. */
export function buildGlb(json: object, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20);
  jsonPadded.set(jsonBytes);
  const binPadded = new Uint8Array(Math.ceil(bin.length / 4) * 4);
  binPadded.set(bin);
  const total = 12 + 8 + jsonPadded.length + (bin.length > 0 ? 8 + binPadded.length : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded.length, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  out.set(jsonPadded, 20);
  if (bin.length > 0) {
    const at = 20 + jsonPadded.length;
    view.setUint32(at, binPadded.length, true);
    view.setUint32(at + 4, GLB_CHUNK_BIN, true);
    out.set(binPadded, at + 8);
  }
  return out;
}

/** Box geometry: 8 vertices, 12 triangles, as flat little-endian buffers. */
function boxGeometry(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
): { positions: Float32Array; indices: Uint16Array } {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy;
  const y1 = cy + sy;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // back
    4, 6, 5, 4, 7, 6, // front
    0, 3, 7, 0, 7, 4, // left
    1, 5, 6, 1, 6, 2, // right
    3, 2, 6, 3, 6, 7, // top
    0, 4, 5, 0, 5, 1, // bottom
  ]);
  return { positions, indices };
}

function appendBox(
  build: { bin: Uint8Array[]; binLength: number },
  geometry: { positions: Float32Array; indices: Uint16Array },
  accessors: object[],
  bufferViews: object[],
  material: number,
): object {
  const positionBytes = new Uint8Array(geometry.positions.buffer.slice(0));
  const indexBytes = new Uint8Array(geometry.indices.buffer.slice(0));
  const positionView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: build.binLength, byteLength: positionBytes.length });
  build.bin.push(positionBytes);
  build.binLength += positionBytes.length;
  const indexView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: build.binLength, byteLength: indexBytes.length });
  build.bin.push(indexBytes);
  build.binLength += indexBytes.length;
  const positionAccessor = accessors.length;
  accessors.push({
    bufferView: positionView,
    componentType: 5126,
    count: geometry.positions.length / 3,
    type: 'VEC3',
  });
  const indexAccessor = accessors.length;
  accessors.push({
    bufferView: indexView,
    componentType: 5123,
    count: geometry.indices.length,
    type: 'SCALAR',
  });
  return { attributes: { POSITION: positionAccessor }, indices: indexAccessor, material };
}

/** A red unit cube standing on the ground plane - the simplest fixture. */
export function syntheticCubeGlb(): Uint8Array {
  const accessors: object[] = [];
  const bufferViews: object[] = [];
  const build = { bin: [] as Uint8Array[], binLength: 0 };
  const primitive = appendBox(build, boxGeometry(1, 1, 1, 0, 0, 0), accessors, bufferViews, 0);
  const bin = concat(build.bin);
  return buildGlb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [primitive] }],
      materials: [
        { name: 'paint', pbrMetallicRoughness: { baseColorFactor: [200 / 255, 0, 0, 1] } },
      ],
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    },
    bin,
  );
}

/**
 * A two-material wagon: a long grey hull with a red "livery" roof box. The
 * livery material is the fixture's company-colour zone, and the wagon is
 * deliberately asymmetric along +Z so facing rotations are distinguishable.
 */
export function syntheticWagonGlb(): Uint8Array {
  const accessors: object[] = [];
  const bufferViews: object[] = [];
  const build = { bin: [] as Uint8Array[], binLength: 0 };
  const hull = appendBox(build, boxGeometry(1, 0.6, 2.4, 0, 0, 0), accessors, bufferViews, 0);
  // Roof box sits towards the front (+Z), so the sprite is asymmetric.
  const livery = appendBox(build, boxGeometry(0.8, 0.5, 1, 0, 0.6, 0.5), accessors, bufferViews, 1);
  const bin = concat(build.bin);
  return buildGlb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [hull, livery] }],
      materials: [
        { name: 'hull', pbrMetallicRoughness: { baseColorFactor: [0.4, 0.42, 0.45, 1] } },
        { name: 'livery', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.1, 0.1, 1] } },
      ],
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    },
    bin,
  );
}

/**
 * A textured cube in the colormap style of the recent Kenney kits: one
 * material, an embedded 2x2 palette PNG, every face's UVs inside one texel.
 */
export function syntheticTexturedGlb(): Uint8Array {
  const geometry = boxGeometry(1, 1, 1, 0, 0, 0);
  const positionBytes = new Uint8Array(geometry.positions.buffer.slice(0));
  const indexBytes = new Uint8Array(geometry.indices.buffer.slice(0));
  // All 8 vertices sample the top-left texel (a solid green patch).
  const uvs = new Float32Array(16);
  for (let i = 0; i < 8; i++) {
    uvs[i * 2] = 0.25;
    uvs[i * 2 + 1] = 0.25;
  }
  const uvBytes = new Uint8Array(uvs.buffer.slice(0));
  const texture = encodePng(
    2,
    2,
    Uint8Array.from([
      30, 180, 60, 255, 200, 200, 200, 255,
      40, 40, 40, 255, 255, 255, 0, 255,
    ]),
  );
  const parts = [positionBytes, indexBytes, uvBytes, texture];
  const offsets: number[] = [];
  let total = 0;
  for (const part of parts) {
    offsets.push(total);
    total += part.length;
    total = Math.ceil(total / 4) * 4;
  }
  const bin = new Uint8Array(total);
  parts.forEach((part, i) => bin.set(part, offsets[i]!));
  return buildGlb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 },
          ],
        },
      ],
      materials: [{ name: 'colormap', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ bufferView: 3, mimeType: 'image/png' }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
        { bufferView: 2, componentType: 5126, count: 8, type: 'VEC2' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: positionBytes.length },
        { buffer: 0, byteOffset: offsets[1], byteLength: indexBytes.length },
        { buffer: 0, byteOffset: offsets[2], byteLength: uvBytes.length },
        { buffer: 0, byteOffset: offsets[3], byteLength: texture.length },
      ],
      buffers: [{ byteLength: bin.length }],
    },
    bin,
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
