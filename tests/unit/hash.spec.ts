import { describe, expect, it } from 'vitest';
import { Fnv1a64, hashBytes, hashString } from '../../src/sim/hash';

/**
 * Independent BigInt implementation of FNV-1a 64. Exact by construction and
 * far too slow for production use, which is exactly why the shipping version
 * does the 64 bit multiply on two 32 bit halves - and why it needs this
 * reference to check itself against.
 */
function referenceFnv1a64(bytes: Uint8Array): string {
  const mask = (1n << 64n) - 1n;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash = (hash ^ BigInt(byte)) & mask;
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('Fnv1a64', () => {
  it('starts at the FNV offset basis', () => {
    expect(new Fnv1a64().digest()).toBe('cbf29ce484222325');
  });

  it('reproduces the canonical FNV-1a 64 test vectors', () => {
    expect(hashString('')).toBe('cbf29ce484222325');
    expect(hashString('a')).toBe('af63dc4c8601ec8c');
    expect(hashString('foobar')).toBe('85944171f73967e8');
  });

  it('agrees with an independent BigInt implementation', () => {
    const samples = [
      '',
      'a',
      'Iron Veins',
      'Umlaute: äöüß',
      'Emoji: \u{1F682}\u{1F683}',
      'x'.repeat(1000),
    ];
    for (const sample of samples) {
      expect(hashString(sample)).toBe(referenceFnv1a64(utf8(sample)));
    }
  });

  it('hashes raw byte ranges identically to the reference', () => {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff;
    expect(hashBytes(bytes)).toBe(referenceFnv1a64(bytes));
  });

  it('encodes 32 bit integers little endian', () => {
    const direct = new Fnv1a64().u32(0x12345678).digest();
    const manual = new Fnv1a64().byte(0x78).byte(0x56).byte(0x34).byte(0x12).digest();
    expect(direct).toBe(manual);
  });

  it('handles integers beyond 32 bits, including negatives', () => {
    const big = 9_007_199_254_740_991; // 2^53 - 1
    expect(new Fnv1a64().int(big).digest()).not.toBe(new Fnv1a64().int(big - 1).digest());
    expect(new Fnv1a64().int(-1).digest()).not.toBe(new Fnv1a64().int(1).digest());
    expect(new Fnv1a64().int(-250_000_00).digest()).toBe(new Fnv1a64().int(-250_000_00).digest());
  });

  it('separates float bit patterns, including the two zeroes', () => {
    expect(new Fnv1a64().f64(0).digest()).not.toBe(new Fnv1a64().f64(-0).digest());
    expect(new Fnv1a64().f64(1.5).digest()).toBe(new Fnv1a64().f64(1.5).digest());
  });

  it('is reusable after reset', () => {
    const hasher = new Fnv1a64();
    const first = hasher.str('Iron Veins').digest();
    expect(hasher.reset().str('Iron Veins').digest()).toBe(first);
  });

  it('hashes typed arrays element wise', () => {
    const array = Int32Array.from([1, -2, 3]);
    const manual = new Fnv1a64().u32(3).u32(1).u32(-2).u32(3).digest();
    expect(new Fnv1a64().intArray(array).digest()).toBe(manual);
  });
});
