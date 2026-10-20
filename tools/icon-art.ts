/**
 * The application icon as code (section 16.2: no binary art is checked in or
 * downloaded, every image is reproducible).
 *
 * Shared by two writers: `tools/make-icons.mjs` writes the desktop icons the
 * Tauri bundler reads from disk (committed, on the E-14 allowlist), and the
 * web build emits the three web-app icons of the manifest from the same
 * function at build time (D-278) - so the browser, the installed Android app
 * and the desktop shell show one picture, and none of the web ones is a file
 * in the repository.
 */

import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];

const COLORS: Readonly<Record<'background' | 'panel' | 'border' | 'rail' | 'sleeper', Rgb>> = {
  background: [0x1c, 0x21, 0x28],
  panel: [0x26, 0x2c, 0x34],
  border: [0x39, 0x41, 0x4c],
  rail: [0xf0, 0x80, 0x20],
  sleeper: [0xb6, 0xbc, 0xc4],
};

// ---------------------------------------------------------------- geometry

/** Signed distance to a rounded rectangle centred on (0.5, 0.5). */
function sdRoundRect(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const dx = Math.abs(x - 0.5) - (halfW - radius);
  const dy = Math.abs(y - 0.5) - (halfH - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to a thick line segment (a capsule). */
function sdSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfWidth: number,
): number {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay;
  let h = denom === 0 ? 0 : (pax * bax + pay * bay) / denom;
  h = Math.min(1, Math.max(0, h));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy) - halfWidth;
}

interface Rail {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

// Two rails converging towards the top - a junction seen in perspective.
const RAIL_LEFT: Rail = { ax: 0.16, ay: 0.9, bx: 0.44, by: 0.12 };
const RAIL_RIGHT: Rail = { ax: 0.84, ay: 0.9, bx: 0.56, by: 0.12 };
const RAIL_HALF_WIDTH = 0.042;
const SLEEPER_ROWS = [0.34, 0.52, 0.7, 0.86];
const SLEEPER_HALF_HEIGHT = 0.022;

/** Horizontal position of a rail centre line at height `y`. */
function railXAt(rail: Rail, y: number): number {
  const s = (y - rail.ay) / (rail.by - rail.ay);
  return rail.ax + (rail.bx - rail.ax) * s;
}

/**
 * Colour of the artwork at a point in the unit square.
 * Returns [r, g, b, a] with a in 0..1.
 */
function sample(x: number, y: number): readonly [number, number, number, number] {
  const outside = sdRoundRect(x, y, 0.5, 0.5, 0.16);
  if (outside > 0) return [0, 0, 0, 0];

  let color = outside > -0.02 ? COLORS.border : COLORS.background;

  if (sdRoundRect(x, y, 0.44, 0.44, 0.12) < 0) color = COLORS.panel;

  for (const row of SLEEPER_ROWS) {
    const left = railXAt(RAIL_LEFT, row) - 0.05;
    const right = railXAt(RAIL_RIGHT, row) + 0.05;
    if (Math.abs(y - row) < SLEEPER_HALF_HEIGHT && x > left && x < right) {
      color = COLORS.sleeper;
    }
  }

  if (
    sdSegment(x, y, RAIL_LEFT.ax, RAIL_LEFT.ay, RAIL_LEFT.bx, RAIL_LEFT.by, RAIL_HALF_WIDTH) < 0 ||
    sdSegment(x, y, RAIL_RIGHT.ax, RAIL_RIGHT.ay, RAIL_RIGHT.bx, RAIL_RIGHT.by, RAIL_HALF_WIDTH) < 0
  ) {
    color = COLORS.rail;
  }

  return [color[0], color[1], color[2], 1];
}

/**
 * How much of a maskable icon's edge the artwork keeps clear. [fraction]
 *
 * A launcher may cut a maskable icon to any shape that contains the central
 * circle of radius 0.4 (the W3C "safe zone"). The rounded square's corner at
 * this scale reaches 0.38 from the centre, so no launcher shape clips it.
 */
const MASKABLE_ART_SCALE = 0.6;

/**
 * The maskable variant: full bleed in the background colour, the artwork
 * shrunk into the safe zone. Sampled through the same `sample`, so it is the
 * same picture and not a second drawing of it.
 */
function sampleMaskable(x: number, y: number): readonly [number, number, number, number] {
  const u = (x - 0.5) / MASKABLE_ART_SCALE + 0.5;
  const v = (y - 0.5) / MASKABLE_ART_SCALE + 0.5;
  const art = sample(u, v);
  const bg = COLORS.background;
  const a = art[3];
  return [
    art[0] * a + bg[0] * (1 - a),
    art[1] * a + bg[1] * (1 - a),
    art[2] * a + bg[2] * (1 - a),
    1,
  ];
}

/** Render RGBA pixels at `size`, supersampled 3x3 for clean edges. */
function renderWith(
  size: number,
  at: (x: number, y: number) => readonly [number, number, number, number],
): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const samples = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          const c = at(x, y);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const total = samples * samples;
      const alpha = a / total;
      const offset = (py * size + px) * 4;
      // Un-premultiply so the colour stays correct on partially covered edges.
      const scale = a > 0 ? 1 / a : 0;
      pixels[offset] = Math.round(r * scale);
      pixels[offset + 1] = Math.round(g * scale);
      pixels[offset + 2] = Math.round(b * scale);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

/** The icon, RGBA, `size` x `size`, transparent outside the rounded square. */
export function renderIcon(size: number): Uint8Array {
  return renderWith(size, sample);
}

/** The maskable icon of the web manifest: opaque, art inside the safe zone. */
export function renderMaskableIcon(size: number): Uint8Array {
  return renderWith(size, sampleMaskable);
}

// -------------------------------------------------------------------- PNG

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** A square RGBA image as a PNG file. */
export function encodePng(size: number, pixels: Uint8Array): Buffer {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
