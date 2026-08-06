import type { RngState } from './types';

/**
 * xoshiro128** - 32 bit state, 2^128-1 period, passes BigCrush.
 *
 * Chosen over anything host provided because architecture law #3 requires the
 * whole simulation to be reproducible from a seed: same seed plus same command
 * sequence must yield a bit-identical world. Every operation below works on
 * 32 bit integer bit patterns only, so the result is identical on every engine.
 *
 * Reference: Blackman/Vigna, "Scrambled Linear Pseudorandom Number Generators".
 */

/** Rotate a 32 bit word left by `k` bits. */
function rotl32(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * splitmix32 - used exclusively to expand a single 32 bit seed into the four
 * state words. A weak seeding routine is the classic way to make a good PRNG
 * produce correlated streams for neighbouring seeds.
 */
function splitmix32(state: number): number {
  let z = (state + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) | 0;
}

/**
 * Fold a stream name into a 32 bit salt for `World.streamFor`.
 *
 * FNV-1a (32 bit) over the string's UTF-16 code units. Everything here is
 * integer arithmetic ECMA-262 defines exactly - `charCodeAt`, xor, `imul` -
 * so the same name yields the same salt on every engine, which is the
 * property every derived stream inherits its determinism from. The constants
 * are the FNV-1a offset basis and prime, algorithm-defining bit patterns in
 * the same sense as the splitmix32 multipliers above.
 */
export function streamSalt(name: string): number {
  let hash = 0x811c9dc5 | 0;
  for (let i = 0; i < name.length; i++) {
    hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
  }
  return hash | 0;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(s0: number, s1: number, s2: number, s3: number) {
    this.s0 = s0 | 0;
    this.s1 = s1 | 0;
    this.s2 = s2 | 0;
    this.s3 = s3 | 0;
  }

  /** Derive a generator from a 32 bit seed. */
  static fromSeed(seed: number): Rng {
    let x = seed | 0;
    const words: number[] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      x = splitmix32(x);
      words[i] = x;
    }
    // The all-zero state is the single fixed point of xoshiro and would make
    // the generator emit zeros forever. splitmix32 practically never produces
    // it, but a one-off comparison is cheaper than the bug it prevents.
    if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
      words[3] = 1;
    }
    return new Rng(words[0]!, words[1]!, words[2]!, words[3]!);
  }

  /** Restore a generator from a previously captured state (save game, replay). */
  static fromState(state: RngState): Rng {
    return new Rng(state[0], state[1], state[2], state[3]);
  }

  /** Capture the state as four unsigned 32 bit words. */
  getState(): RngState {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  /** Overwrite the state in place - used when loading a save. */
  setState(state: RngState): void {
    this.s0 = state[0] | 0;
    this.s1 = state[1] | 0;
    this.s2 = state[2] | 0;
    this.s3 = state[3] | 0;
  }

  /** Next raw 32 bit value, as an unsigned integer in [0, 2^32). */
  nextUint32(): number {
    const result = Math.imul(rotl32(Math.imul(this.s1, 5), 7), 9);
    const t = this.s1 << 9;

    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl32(this.s3, 11);

    return result >>> 0;
  }

  /**
   * Uniform float in [0, 1). Division by 2^32 is exact in IEEE-754, so this
   * stays deterministic across engines.
   */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Uniform integer in [0, boundExclusive). Uses rejection sampling instead of
   * a plain modulo so the distribution stays unbiased; the loop is bounded in
   * expectation by fewer than two iterations for every bound.
   */
  nextInt(boundExclusive: number): number {
    if (boundExclusive <= 1) return 0;
    const bound = boundExclusive | 0;
    const limit = 4294967296 - (4294967296 % bound);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return value % bound;
  }

  /** Uniform integer in [min, max], both inclusive. */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** Independent copy positioned at the current state. */
  clone(): Rng {
    return new Rng(this.s0, this.s1, this.s2, this.s3);
  }
}
