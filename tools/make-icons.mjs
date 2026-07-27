/**
 * Generates the application icons from a vector description.
 *
 * Same reasoning as the sprite bake step in section 16.2: no binary art is
 * checked in or downloaded, every image is reproducible from code. Run with
 * `npm run icons` after changing the artwork below.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');

const COLORS = {
  background: [0x1c, 0x21, 0x28],
  panel: [0x26, 0x2c, 0x34],
  border: [0x39, 0x41, 0x4c],
  rail: [0xf0, 0x80, 0x20],
  sleeper: [0xb6, 0xbc, 0xc4],
};

// ---------------------------------------------------------------- geometry

/** Signed distance to a rounded rectangle centred on (0.5, 0.5). */
function sdRoundRect(x, y, halfW, halfH, radius) {
  const dx = Math.abs(x - 0.5) - (halfW - radius);
  const dy = Math.abs(y - 0.5) - (halfH - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to a thick line segment (a capsule). */
function sdSegment(x, y, ax, ay, bx, by, halfWidth) {
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

// Two rails converging towards the top - a junction seen in perspective.
const RAIL_LEFT = { ax: 0.16, ay: 0.9, bx: 0.44, by: 0.12 };
const RAIL_RIGHT = { ax: 0.84, ay: 0.9, bx: 0.56, by: 0.12 };
const RAIL_HALF_WIDTH = 0.042;
const SLEEPER_ROWS = [0.34, 0.52, 0.7, 0.86];
const SLEEPER_HALF_HEIGHT = 0.022;

/** Horizontal position of a rail centre line at height `y`. */
function railXAt(rail, y) {
  const s = (y - rail.ay) / (rail.by - rail.ay);
  return rail.ax + (rail.bx - rail.ax) * s;
}

/**
 * Colour of the artwork at a point in the unit square.
 * Returns [r, g, b, a] with a in 0..1.
 */
function sample(x, y) {
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

/** Render RGBA pixels at `size`, supersampled 3x3 for clean edges. */
function render(size) {
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
          const c = sample(x, y);
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

// -------------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
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

// -------------------------------------------------------------------- ICO

/** 32bpp bottom-up DIB plus an empty AND mask, the classic ICO payload. */
function encodeDib(size, pixels) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR and AND mask stacked
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = (y * size + x) * 4;
      xor[d] = pixels[s + 2];
      xor[d + 1] = pixels[s + 1];
      xor[d + 2] = pixels[s];
      xor[d + 3] = pixels[s + 3];
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskStride * size);
  return Buffer.concat([header, xor, and]);
}

function encodeIco(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);

  const table = Buffer.alloc(16 * entries.length);
  let offset = dir.length + table.length;
  entries.forEach((entry, index) => {
    const base = index * 16;
    table[base] = entry.size >= 256 ? 0 : entry.size;
    table[base + 1] = entry.size >= 256 ? 0 : entry.size;
    table[base + 2] = 0;
    table[base + 3] = 0;
    table.writeUInt16LE(1, base + 4);
    table.writeUInt16LE(32, base + 6);
    table.writeUInt32LE(entry.data.length, base + 8);
    table.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([dir, table, ...entries.map((entry) => entry.data)]);
}

// ------------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });

const pngSizes = [
  [32, '32x32.png'],
  [128, '128x128.png'],
  [256, '128x128@2x.png'],
  [512, 'icon.png'],
];

for (const [size, name] of pngSizes) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, render(size)));
  console.log(`icons: ${name} (${size}x${size})`);
}

// Windows resource icon: DIB entries for the small sizes, PNG for 256.
const icoEntries = [16, 32, 48, 64, 128].map((size) => ({
  size,
  data: encodeDib(size, render(size)),
}));
icoEntries.push({ size: 256, data: encodePng(256, render(256)) });
writeFileSync(join(OUT_DIR, 'icon.ico'), encodeIco(icoEntries));
console.log('icons: icon.ico (16, 32, 48, 64, 128, 256)');
