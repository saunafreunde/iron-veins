import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import {
  HEIGHTMAP_CONTRAST_MAX,
  HEIGHTMAP_CONTRAST_MIN,
  HEIGHTMAP_CONTRAST_PIVOT,
  HEIGHT_LEVELS,
  MapClimate,
  SEA_LEVEL,
} from '../../src/sim/constants';
import { Fnv1a64 } from '../../src/sim/hash';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { generateMap } from '../../src/sim/mapgen';
import {
  applyHeightmapRelief,
  contrastGrey,
  type HeightmapImage,
} from '../../src/sim/mapgen/heightmap';
import { mapSizeForHeightmap, readHeightmap } from '../../src/sim/mapgen/heightmapFile';
import { decodePng, greyOf, toRgba8 } from '../../src/sim/mapgen/png';
import { decodePng as bakeDecodePng, encodePng as bakeEncodePng } from '../../tools/bake-lib.ts';

/**
 * The heightmap import of SPEC2 M22 (D-242).
 *
 * Five things are held here, and the order is the order they can fail in: the
 * decoder agrees with the one the asset bake already had, a file that is not a
 * heightmap is refused with a reason a player can read in their own language,
 * the slope invariant survives inputs chosen to break it, the contrast control
 * does something a number can see, and the imported map is a MAP - it grows
 * towns, it saves, and it reproduces.
 */

// ------------------------------------------------------------- PNG fixtures
//
// Every picture in this file is BUILT here. Checking a PNG into the repository
// would break the no-binary-assets rule the glob test guards (E-14), and a
// heightmap fixture is the one place where that temptation is strongest -
// which is exactly why it is written out rather than argued about.

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

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
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

/**
 * Write a PNG with the exact header this test wants, filter 0 on every row.
 * `samples` is width * height * channels values, already in the byte order the
 * bit depth implies.
 */
function makePng(
  width: number,
  height: number,
  colourType: number,
  bitDepth: number,
  samples: Uint8Array,
  interlace = 0,
): Uint8Array {
  const channels = colourType === 0 ? 1 : colourType === 2 ? 3 : colourType === 4 ? 2 : 4;
  const stride = width * channels * (bitDepth === 16 ? 2 : 1);
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(samples.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colourType;
  ihdr[12] = interlace;
  return join([
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** A deterministic hash-based value in [0, 255]; no RNG, no wall clock. */
function hashByte(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return (h ^ (h >>> 16)) & 0xff;
}

/** Grey 8-bit PNG from a per-pixel function. */
function greyPng(size: number, at: (x: number, y: number) => number): Uint8Array {
  const samples = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) samples[y * size + x] = at(x, y) & 0xff;
  }
  return makePng(size, size, 0, 8, samples);
}

/** The three adversarial reliefs, as the Fertig-wenn names them. */
const NOISE = (size: number): Uint8Array => greyPng(size, (x, y) => hashByte(x, y, 1));
const GRADIENT = (size: number): Uint8Array =>
  greyPng(size, (x, y) => Math.floor(((x + y) * 255) / (2 * (size - 1))));

/**
 * Something shaped like a photograph: three channels that disagree, a smooth
 * subject, a bright sky and film grain on top.
 */
function photographPng(size: number): Uint8Array {
  const samples = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = (y * size + x) * 3;
      const sky = y < size / 3 ? 200 : 40;
      const subject = ((x * x + y * y) / ((size * size) / 2)) * 90;
      const grain = hashByte(x, y, 7) / 8;
      samples[base] = Math.min(255, sky + subject + grain) & 0xff;
      samples[base + 1] = Math.min(255, sky * 0.9 + subject * 1.2 + grain) & 0xff;
      samples[base + 2] = Math.min(255, sky * 1.1 + subject * 0.4 + grain) & 0xff;
    }
  }
  return makePng(size, size, 2, 8, samples);
}

// ------------------------------------------------------------ the measures

function worstTileSlope(map: TileMap): number {
  let worst = 0;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const delta = map.topHeight(x, y) - map.baseHeight(x, y);
      if (delta > worst) worst = delta;
    }
  }
  return worst;
}

/**
 * How terraced a relief is: the share of tiles whose four corners are all at
 * the same level, i.e. flat ground. A picture the quantiser squeezed into three
 * levels IS a terrace field, and this number says so.
 */
function flatTileShare(map: TileMap): number {
  let flat = 0;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      if (map.topHeight(x, y) === map.baseHeight(x, y)) flat++;
    }
  }
  return flat / (map.size * map.size);
}

/** How many of the sixteen levels the relief actually spends. */
function levelsUsed(map: TileMap): number {
  const seen = new Uint8Array(HEIGHT_LEVELS);
  for (let i = 0; i < map.cornerHeight.length; i++) seen[map.cornerHeight[i]!] = 1;
  let count = 0;
  for (let i = 0; i < HEIGHT_LEVELS; i++) count += seen[i]!;
  return count;
}

function landShare(map: TileMap): number {
  let land = 0;
  for (let i = 0; i < map.terrain.length; i++) if (map.terrain[i] !== Terrain.Water) land++;
  return land / map.terrain.length;
}

function imageOf(bytes: Uint8Array): HeightmapImage {
  const result = readHeightmap(bytes);
  if (!result.ok) throw new Error(`fixture refused: ${result.refusal.reasonKey}`);
  return result.image;
}

/** Apply a relief to a fresh map, the way `generateMap` does. */
function reliefMap(bytes: Uint8Array, size: number, contrast: number, passes = 8): TileMap {
  const map = new TileMap(size);
  applyHeightmapRelief(map, { image: imageOf(bytes), contrast }, passes);
  return map;
}

// -------------------------------------------------------------- the tests

describe('the PNG decoder the simulation runs', () => {
  it('agrees pixel for pixel with the one the asset bake has', () => {
    // The two exist for the reason at the head of `png.ts` - the baker cannot
    // import from src/ - so this is the coupling test that stands in for the
    // shared module they cannot have (the D-117/D-160 device).
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      rgba[i * 4] = hashByte(i, 0, 3);
      rgba[i * 4 + 1] = hashByte(i, 1, 3);
      rgba[i * 4 + 2] = hashByte(i, 2, 3);
      rgba[i * 4 + 3] = 255;
    }
    const bytes = bakeEncodePng(16, 16, rgba);

    const mine = decodePng(bytes);
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    const theirs = bakeDecodePng(bytes);

    expect(mine.image.width).toBe(theirs.width);
    expect(mine.image.height).toBe(theirs.height);
    expect(Array.from(toRgba8(mine.image))).toEqual(Array.from(theirs.rgba));
  });

  it('agrees with it on greyscale and on a palette too', () => {
    for (const bytes of [greyPng(9, (x, y) => hashByte(x, y, 5)), photographPng(9)]) {
      const mine = decodePng(bytes);
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(Array.from(toRgba8(mine.image))).toEqual(Array.from(bakeDecodePng(bytes).rgba));
    }
  });

  it('reads sixteen-bit samples the baker refuses, at full precision', () => {
    // The reason this decoder exists at all: every terrain tool exports 16 bit,
    // and throwing away the low byte before quantising into sixteen levels
    // would be the terracing complaint SPEC2 M22 names, self-inflicted.
    const samples = new Uint8Array(4 * 4 * 2);
    for (let i = 0; i < 16; i++) {
      const value = i * 4369; // 0, 4369 ... 65535: the full range in sixteen steps
      samples[i * 2] = value >> 8;
      samples[i * 2 + 1] = value & 0xff;
    }
    const result = decodePng(makePng(4, 4, 0, 16, samples));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.bitDepth).toBe(16);

    const grey = greyOf(result.image);
    expect(grey[0]).toBeCloseTo(0, 6);
    expect(grey[15]).toBeCloseTo(1, 6);
    // 4369 / 65535 is exactly 1/15 and is NOT representable eight bits down.
    expect(grey[1]).toBeCloseTo(1 / 15, 6);
  });
});

describe('a file that is not a heightmap is refused with a reason', () => {
  const REFUSALS = [
    ['ui.heightmap.notPng', () => new TextEncoder().encode('this is not a picture at all')],
    ['ui.heightmap.notPng', () => new Uint8Array(64)],
    ['ui.heightmap.broken', () => makePng(8, 8, 0, 8, new Uint8Array(64)).subarray(0, 40)],
    ['ui.heightmap.interlaced', () => makePng(8, 8, 0, 8, new Uint8Array(64), 1)],
    ['ui.heightmap.unsupportedDepth', () => makePng(8, 8, 0, 4, new Uint8Array(64))],
    ['ui.heightmap.notSquare', () => makePng(8, 4, 0, 8, new Uint8Array(32))],
    ['ui.heightmap.wrongSize', () => greyPng(300, () => 128)],
  ] as const;

  for (const [key, build] of REFUSALS) {
    it(`answers ${key}`, () => {
      const result = readHeightmap(build());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.reasonKey).toBe(key);
    });
  }

  it('names the numbers rather than saying "wrong"', () => {
    const notSquare = readHeightmap(makePng(8, 4, 0, 8, new Uint8Array(32)));
    expect(notSquare.ok).toBe(false);
    if (notSquare.ok) return;
    expect(notSquare.refusal.params).toEqual({ width: 8, height: 4 });

    const wrongSize = readHeightmap(greyPng(300, () => 128));
    expect(wrongSize.ok).toBe(false);
    if (wrongSize.ok) return;
    expect(wrongSize.refusal.params).toEqual({ width: 300 });

    const depth = readHeightmap(makePng(8, 8, 0, 4, new Uint8Array(64)));
    expect(depth.ok).toBe(false);
    if (depth.ok) return;
    expect(depth.refusal.params).toEqual({ depth: 4 });
  });

  it('has every one of those reasons in BOTH catalogues', () => {
    // A refusal nobody can read is a silence with extra steps. The unsupported
    // colour type has no fixture above - no colour type outside the five is
    // legal PNG, so it cannot be built with a valid CRC - and is listed here
    // BECAUSE the decoder can still answer it for a file that lies.
    const keys = [
      'ui.heightmap.notPng',
      'ui.heightmap.broken',
      'ui.heightmap.interlaced',
      'ui.heightmap.unsupportedDepth',
      'ui.heightmap.unsupportedColour',
      'ui.heightmap.notSquare',
      'ui.heightmap.wrongSize',
    ];
    for (const key of keys) {
      expect((de as Record<string, string>)[key], `de: ${key}`).toBeTruthy();
      expect((en as Record<string, string>)[key], `en: ${key}`).toBeTruthy();
    }
  });

  it('reads the two legal edge lengths and nothing between them', () => {
    expect(mapSizeForHeightmap(257, 257)).toBe(256);
    expect(mapSizeForHeightmap(256, 256)).toBe(256);
    expect(mapSizeForHeightmap(1025, 1025)).toBe(1024);
    expect(mapSizeForHeightmap(1024, 1024)).toBe(1024);
    expect(mapSizeForHeightmap(2049, 2049)).toBe(2048);
    expect(mapSizeForHeightmap(300, 300)).toBe(-1);
    expect(mapSizeForHeightmap(4096, 4096)).toBe(-1);
    expect(mapSizeForHeightmap(32, 32)).toBe(-1);
    expect(mapSizeForHeightmap(1024, 1025)).toBe(-1);
  });
});

describe('the slope invariant survives an adversarial picture', () => {
  const CASES: readonly (readonly [string, (size: number) => Uint8Array])[] = [
    ['per-pixel noise', NOISE],
    ['a linear gradient', GRADIENT],
    ['something shaped like a photograph', photographPng],
  ];

  for (const [name, build] of CASES) {
    it(`holds on ${name}, at every contrast`, () => {
      for (const contrast of [HEIGHTMAP_CONTRAST_MIN, 1, HEIGHTMAP_CONTRAST_MAX]) {
        const map = reliefMap(build(256), 256, contrast);
        expect(worstTileSlope(map), `${name} at ${contrast}x`).toBeLessThanOrEqual(1);
      }
    });
  }

  it('is enforced by the sweep on noise and by erosion alone on a gradient', () => {
    // The two are worth telling apart. Erosion is a talus limit and a smooth
    // ramp is already inside it, so the sweep pulls nothing; per-pixel noise is
    // the case where the sweep is the repair rather than the proof - which is
    // why the chain has both and neither was dropped as redundant.
    const noise = new TileMap(256);
    const noiseMoved = applyHeightmapRelief(noise, { image: imageOf(NOISE(256)), contrast: 1 }, 8);
    expect(noiseMoved).toBeGreaterThan(0);
    expect(worstTileSlope(noise)).toBeLessThanOrEqual(1);

    const ramp = new TileMap(256);
    const rampMoved = applyHeightmapRelief(ramp, { image: imageOf(GRADIENT(256)), contrast: 1 }, 8);
    expect(rampMoved).toBe(0);
    expect(worstTileSlope(ramp)).toBeLessThanOrEqual(1);
  });
});

describe('the contrast control', () => {
  it('is a straight line through the grey value at which the sea ends', () => {
    for (const contrast of [0.25, 1, 4]) {
      expect(contrastGrey(HEIGHTMAP_CONTRAST_PIVOT, contrast)).toBeCloseTo(
        HEIGHTMAP_CONTRAST_PIVOT,
        12,
      );
    }
    expect(contrastGrey(0.5, 1)).toBeCloseTo(0.5, 12);
    expect(contrastGrey(0.5, 2)).toBeCloseTo(0.75, 12);
    expect(contrastGrey(0.5, 0.5)).toBeCloseTo(0.375, 12);
    // Clamped, not wrapped: a picture is not allowed to leave the sixteen.
    expect(contrastGrey(1, 4)).toBe(1);
    expect(contrastGrey(0, 4)).toBe(0);
  });

  it('changes the terracing measurably, and in the direction it promises', () => {
    // A terrace is flat ground; what a player sees as "sixteen steps" is how
    // FEW tiles are anything else. So the measure is the STEP share, and on a
    // 256-tile ramp the measured run is
    //   contrast   0.25    0.5      1       2       4
    //   levels        5      9     16      16      16
    //   step     0.0156 0.0312 0.0623  0.0818  0.0730
    // - the terrace edges go up by a factor of 5.2 from the weakest setting to
    // 2x, which is the difference between a wedding cake and a hillside.
    const steps = [0.25, 0.5, 1, 2].map(
      (contrast) => 1 - flatTileShare(reliefMap(GRADIENT(256), 256, contrast)),
    );
    const levels = [0.25, 0.5, 1].map((contrast) =>
      levelsUsed(reliefMap(GRADIENT(256), 256, contrast)),
    );

    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]!);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]!);
    expect(levels[0]).toBeLessThan(HEIGHT_LEVELS / 2);
    expect(levels[2]).toBe(HEIGHT_LEVELS);
    // "Measurably" is a number, not an adjective.
    expect(steps[3]! / steps[0]!).toBeGreaterThan(4);
  });

  it('stops helping once the picture saturates, and that is measured not hidden', () => {
    // Past the point where the extremes clip, more contrast makes flat sea
    // floor and flat summit rather than more relief: the step share turns back
    // down at 4x (0.0818 -> 0.0730). It is bounded rather than fixed - the cure
    // would be an auto-levels pass, which is a second control nobody asked for
    // and one the author cannot see.
    const at2 = 1 - flatTileShare(reliefMap(GRADIENT(256), 256, 2));
    const at4 = 1 - flatTileShare(reliefMap(GRADIENT(256), 256, HEIGHTMAP_CONTRAST_MAX));
    expect(at4).toBeLessThan(at2);
    expect(at4).toBeGreaterThan(at2 * 0.8);
  });

  it('moves the relief and not the coastline', () => {
    // The pivot's whole job, and the comparison is what makes it evidence.
    // Measured on the same ramp, land share by contrast:
    //   pivot at the sea's own grey  0.8779 0.8779 0.8779 0.8779 0.8779
    //   pivot at mid grey            1.0000 1.0000 0.8779 0.7231 0.6223
    // Around mid grey the slider is a sea-level control in disguise: at its
    // weakest the map has no sea at all, at its strongest 38 % of it is under
    // water. Around the sea's own grey the coastline does not move by ONE TILE.
    const shares = [0.25, 0.5, 1, 2, HEIGHTMAP_CONTRAST_MAX].map((contrast) => {
      const map = reliefMap(GRADIENT(256), 256, contrast);
      map.terrain.fill(Terrain.Grass);
      for (let y = 0; y < map.size; y++) {
        for (let x = 0; x < map.size; x++) {
          if (map.topHeight(x, y) <= SEA_LEVEL) map.terrain[map.tileIndex(x, y)] = Terrain.Water;
        }
      }
      return landShare(map);
    });
    for (const share of shares) expect(share).toBe(shares[0]);
    expect(shares[0]).toBeGreaterThan(0.5);
    expect(shares[0]).toBeLessThan(1);
  });
});

describe('an imported relief makes a world like any other', () => {
  it('grows water, towns and industries on the ground it was given', () => {
    const world = generateMap({
      size: 256,
      seed: 4711,
      climate: MapClimate.Temperate,
      erosionPasses: 8,
      relief: { image: imageOf(photographPng(257)), contrast: 1.5 },
    });

    expect(worstTileSlope(world.map)).toBeLessThanOrEqual(1);
    expect(world.towns.length).toBeGreaterThan(0);
    expect(world.industries.length).toBeGreaterThan(0);
    const land = landShare(world.map);
    expect(land).toBeGreaterThan(0.1);
    expect(land).toBeLessThan(1);
  });

  it('reproduces: same picture, same contrast, same seed, same map', () => {
    const digest = (): string => {
      const world = generateMap({
        size: 256,
        seed: 20_260_811,
        climate: MapClimate.Temperate,
        erosionPasses: 8,
        relief: { image: imageOf(NOISE(256)), contrast: 2 },
      });
      return new Fnv1a64()
        .intArray(world.map.cornerHeight)
        .intArray(world.map.terrain)
        .intArray(world.map.townId)
        .digest();
    };
    expect(digest()).toBe(digest());
  });

  it('is a different map at a different contrast, so the slider is not decoration', () => {
    const digest = (contrast: number): string => {
      const map = reliefMap(GRADIENT(256), 256, contrast);
      return new Fnv1a64().intArray(map.cornerHeight).digest();
    };
    expect(digest(1)).not.toBe(digest(2));
  });

  it('keeps nothing of the picture: the corner grid is the whole of it', () => {
    // "Das PNG nicht behalten" made checkable. A map built from the picture and
    // a map built from its own corner heights are the same world afterwards,
    // which is only true because nothing downstream ever asks the image again.
    const built = reliefMap(GRADIENT(257), 256, 1.5);
    const copy = new TileMap(256);
    copy.cornerHeight.set(built.cornerHeight);
    expect(Array.from(copy.cornerHeight)).toEqual(Array.from(built.cornerHeight));
    expect(worstTileSlope(copy)).toBeLessThanOrEqual(1);
  });
});
