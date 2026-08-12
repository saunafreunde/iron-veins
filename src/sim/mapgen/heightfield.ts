import {
  DEFAULT_MAP_GEN_KNOBS,
  EROSION_PASSES,
  EROSION_RATE,
  EROSION_TALUS,
  HEIGHT_LEVELS,
  HEIGHTMAP_CONTRAST_PIVOT,
  MAP_EDGE_FALLOFF,
  MAX_HEIGHT,
  TERRAIN_NOISE_BASE_WAVELENGTH,
  TERRAIN_NOISE_LACUNARITY,
  TERRAIN_NOISE_OCTAVES,
  TERRAIN_NOISE_PERSISTENCE,
  type MapGenKnobs,
} from '../constants';
import type { TileMap } from '../map/TileMap';
import type { Rng } from '../rng';
import { SimplexNoise2D } from './noise';
import { hillinessGainOf, presetShape, seaLevelShiftOf } from './presets';

/**
 * Step 1 and 2 of section 6: the raw height field, eroded and quantised into
 * the 16 playable height levels.
 */

/** Hermite smoothstep on [0, 1]. Only multiplication, so bit-exact everywhere. */
function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/**
 * Falls off towards the map border so the playable area is an island or a
 * coastline rather than terrain that runs off the edge. Without it there is no
 * ocean, and "ocean versus inland lake" - which decides where harbours and oil
 * rigs may go - has no meaning.
 */
function edgeFalloff(x: number, y: number, size: number): number {
  const margin = size * MAP_EDGE_FALLOFF;
  const distance = Math.min(Math.min(x, y), Math.min(size - x, size - y));
  if (distance >= margin) return 1;
  return smoothstep(distance / margin);
}

/**
 * Fill `field` with fractal noise shaped into [0, 1].
 *
 * Four seams the preset and the two relief controls of SPEC2 M23 reach, and
 * every one of them is BRANCHED on its identity rather than multiplied by it:
 * `pivot + (v - pivot) * 1` is not bit-identical to `v` in binary floating
 * point, so a neutral world that went through the arithmetic would be a
 * different world from every one this game recorded before M23. The branches
 * are what `mapgenPresets.spec.ts` asserts the identity of, and they cost one
 * predictable comparison per corner.
 */
function sampleNoise(field: Float32Array, size: number, rng: Rng, knobs: MapGenKnobs): void {
  const noise = new SimplexNoise2D(rng);
  const stride = size + 1;
  const shape = presetShape(knobs.preset);
  // One wavelength of the first octave spans this fraction of the map.
  const scale = 1 / (size * (TERRAIN_NOISE_BASE_WAVELENGTH * shape.wavelength));
  const ridge = shape.ridge;
  const gain = hillinessGainOf(knobs);
  // The lift the preset gives the ground, less the height the sea takes.
  const offset = shape.lift - seaLevelShiftOf(knobs);

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      let raw = noise.fractal(
        x * scale,
        y * scale,
        TERRAIN_NOISE_OCTAVES,
        TERRAIN_NOISE_PERSISTENCE,
        TERRAIN_NOISE_LACUNARITY,
      );
      // Ridges: the zero crossing - the commonest value in fbm - becomes the
      // summit, so the ranges are long and the ground between them is floor.
      if (ridge !== 0) {
        const folded = 1 - 2 * (raw < 0 ? -raw : raw);
        raw = raw + (folded - raw) * ridge;
      }
      // [-1,1] -> [0,1], then push towards the extremes so the map gets clear
      // plains and clear mountains instead of uniform lumpiness.
      let shaped = smoothstep((raw + 1) * 0.5);
      // Relief about the land pivot, never about mid-grey: the same operation
      // and the same pivot as the M22 import contrast (D-242), so the control
      // moves mountains and leaves the coastline where it was.
      if (gain !== 1) {
        shaped = HEIGHTMAP_CONTRAST_PIVOT + (shaped - HEIGHTMAP_CONTRAST_PIVOT) * gain;
      }
      // And the coastline is the OTHER control's, applied before the falloff
      // so that the ring of ocean which makes "coast" mean anything survives
      // every preset and every step.
      if (offset !== 0) shaped = shaped + offset;
      field[y * stride + x] = shaped * edgeFalloff(x, y, size);
    }
  }
}

/**
 * Thermal erosion: material above the talus angle slides downhill. Deltas are
 * collected for a whole pass and applied afterwards, so the result does not
 * depend on the order in which corners are visited.
 */
export function erode(field: Float32Array, size: number, passes: number): void {
  const stride = size + 1;
  const delta = new Float32Array(field.length);

  for (let pass = 0; pass < passes; pass++) {
    delta.fill(0);

    for (let y = 0; y <= size; y++) {
      const rowStart = y * stride;
      for (let x = 0; x <= size; x++) {
        const index = rowStart + x;
        const height = field[index]!;

        let totalDrop = 0;
        let maxDrop = 0;
        let dropW = 0;
        let dropE = 0;
        let dropN = 0;
        let dropS = 0;

        if (x > 0) {
          const d = height - field[index - 1]!;
          if (d > EROSION_TALUS) {
            dropW = d;
            totalDrop += d;
            if (d > maxDrop) maxDrop = d;
          }
        }
        if (x < size) {
          const d = height - field[index + 1]!;
          if (d > EROSION_TALUS) {
            dropE = d;
            totalDrop += d;
            if (d > maxDrop) maxDrop = d;
          }
        }
        if (y > 0) {
          const d = height - field[index - stride]!;
          if (d > EROSION_TALUS) {
            dropN = d;
            totalDrop += d;
            if (d > maxDrop) maxDrop = d;
          }
        }
        if (y < size) {
          const d = height - field[index + stride]!;
          if (d > EROSION_TALUS) {
            dropS = d;
            totalDrop += d;
            if (d > maxDrop) maxDrop = d;
          }
        }

        if (totalDrop === 0) continue;

        const moved = EROSION_RATE * (maxDrop - EROSION_TALUS);
        const share = moved / totalDrop;
        if (dropW > 0) delta[index - 1] = delta[index - 1]! + dropW * share;
        if (dropE > 0) delta[index + 1] = delta[index + 1]! + dropE * share;
        if (dropN > 0) delta[index - stride] = delta[index - stride]! + dropN * share;
        if (dropS > 0) delta[index + stride] = delta[index + stride]! + dropS * share;
        delta[index] = delta[index]! - moved;
      }
    }

    for (let i = 0; i < field.length; i++) field[i] = field[i]! + delta[i]!;
  }
}

/**
 * Quantise the continuous field into the 16 height levels of the game.
 *
 * Exported since SPEC2 M22 so the heightmap import runs THIS chain rather than
 * a second copy of it: `erode` and `quantise` are what decide what a relief
 * looks like once it is a map, and an imported picture that went through a
 * private twin would drift away from generated terrain the first time either
 * was touched.
 */
export function quantise(field: Float32Array, map: TileMap): void {
  const heights = map.cornerHeight;
  for (let i = 0; i < heights.length; i++) {
    const level = Math.floor(field[i]! * HEIGHT_LEVELS);
    heights[i] = level < 0 ? 0 : level > MAX_HEIGHT ? MAX_HEIGHT : level;
  }
}

/**
 * Generate the terrain relief of `map` in place.
 * `erosionPasses` is a parameter so tests can run a cheap version.
 *
 * `knobs` is where the preset and the two RELIEF controls of SPEC2 M23 land,
 * and it is the only place they land: an imported heightmap (M22) replaces
 * this function whole, so a picture keeps its own coastline and its own
 * mountains and the contrast slider stays the one control over them. The
 * other three controls - rivers, towns, resources - are not relief and do
 * apply to an imported map.
 */
export function generateRelief(
  map: TileMap,
  rng: Rng,
  erosionPasses = EROSION_PASSES,
  knobs: MapGenKnobs = DEFAULT_MAP_GEN_KNOBS,
): void {
  const field = new Float32Array((map.size + 1) * (map.size + 1));
  sampleNoise(field, map.size, rng, knobs);
  erode(field, map.size, erosionPasses);
  quantise(field, map);
  map.enforceSlopeInvariant();
}
