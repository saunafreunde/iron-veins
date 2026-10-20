/**
 * Generates the application icons from a vector description.
 *
 * Same reasoning as the sprite bake step in section 16.2: no binary art is
 * checked in or downloaded, every image is reproducible from code. Run with
 * `npm run icons` after changing the artwork in `tools/icon-art.ts`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The artwork and the PNG encoder live in one place for the desktop icons
// here and the web-app icons of the build (D-278). A TypeScript module, which
// the Node this repository pins (24, `engines`) imports without a flag.
import { encodePng, renderIcon as render } from './icon-art.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');

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
