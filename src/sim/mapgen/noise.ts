import type { Rng } from '../rng';

/**
 * Seeded 2D simplex noise.
 *
 * Own implementation because the map has to be reproducible from a seed on
 * every machine, and because the permutation table must come from the world's
 * own generator rather than from a library's global state. Uses only
 * + - * / and Math.sqrt/Math.floor, all of which are exactly specified.
 *
 * Reference: Gustavson, "Simplex noise demystified".
 */

/** The 12 gradient directions of the classic implementation, x/y pairs. */
const GRADIENTS = new Int8Array([
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1,
]);

const SKEW = 0.5 * (Math.sqrt(3) - 1);
const UNSKEW = (3 - Math.sqrt(3)) / 6;

/** Scales the raw output back to roughly [-1, 1]. */
const NORMALISATION = 70;

export class SimplexNoise2D {
  private readonly perm = new Uint8Array(512);
  private readonly permMod12 = new Uint8Array(512);

  constructor(rng: Rng) {
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i++) source[i] = i;

    // Fisher-Yates from the world RNG: same seed, same permutation, same map.
    for (let i = 255; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      const tmp = source[i]!;
      source[i] = source[j]!;
      source[j] = tmp;
    }

    for (let i = 0; i < 512; i++) {
      const value = source[i & 255]!;
      this.perm[i] = value;
      this.permMod12[i] = value % 12;
    }
  }

  /** Noise value in roughly [-1, 1]. */
  noise(x: number, y: number): number {
    const skew = (x + y) * SKEW;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);

    const unskew = (i + j) * UNSKEW;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);

    // Which of the two triangles of the skewed cell are we in?
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + UNSKEW;
    const y1 = y0 - j1 + UNSKEW;
    const x2 = x0 - 1 + 2 * UNSKEW;
    const y2 = y0 - 1 + 2 * UNSKEW;

    const ii = i & 255;
    const jj = j & 255;

    const g0 = this.permMod12[ii + this.perm[jj]!]! * 2;
    const g1 = this.permMod12[ii + i1 + this.perm[jj + j1]!]! * 2;
    const g2 = this.permMod12[ii + 1 + this.perm[jj + 1]!]! * 2;

    return (
      NORMALISATION *
      (corner(x0, y0, GRADIENTS[g0]!, GRADIENTS[g0 + 1]!) +
        corner(x1, y1, GRADIENTS[g1]!, GRADIENTS[g1 + 1]!) +
        corner(x2, y2, GRADIENTS[g2]!, GRADIENTS[g2 + 1]!))
    );
  }

  /**
   * Fractal Brownian motion: `octaves` layers of noise, each at
   * `lacunarity` times the frequency and `persistence` times the amplitude of
   * the one before. Result is normalised to [-1, 1].
   */
  fractal(x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let maxAmplitude = 0;

    for (let octave = 0; octave < octaves; octave++) {
      sum += this.noise(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return sum / maxAmplitude;
  }
}

/** Contribution of one simplex corner; zero outside its radius of influence. */
function corner(dx: number, dy: number, gx: number, gy: number): number {
  let t = 0.5 - dx * dx - dy * dy;
  if (t < 0) return 0;
  t *= t;
  return t * t * (gx * dx + gy * dy);
}
