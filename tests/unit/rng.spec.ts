import { describe, expect, it } from 'vitest';
import { Fnv1a64 } from '../../src/sim/hash';
import { Rng } from '../../src/sim/rng';

function streamDigest(seed: number, count: number): string {
  const rng = Rng.fromSeed(seed);
  const hasher = new Fnv1a64();
  for (let i = 0; i < count; i++) hasher.u32(rng.nextUint32());
  return hasher.digest();
}

describe('Rng (xoshiro128**)', () => {
  it('produces the same stream for the same seed', () => {
    const a = Rng.fromSeed(424242);
    const b = Rng.fromSeed(424242);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it('produces different streams for neighbouring seeds', () => {
    expect(streamDigest(1, 64)).not.toBe(streamDigest(2, 64));
    expect(streamDigest(0, 64)).not.toBe(streamDigest(1, 64));
  });

  it('is frozen against accidental algorithm changes', () => {
    // Golden values captured from this implementation. If they ever change,
    // every existing save game and replay silently stops reproducing - that is
    // a deliberate, reviewed decision, never an accident.
    expect(streamDigest(424242, 10_000)).toBe('eeeb83b2ac8c6189');
    expect(streamDigest(0, 10_000)).toBe('fddede32735d6e98');
  });

  it('resumes exactly from a captured state', () => {
    const rng = Rng.fromSeed(987654321);
    for (let i = 0; i < 50; i++) rng.nextUint32();

    const state = rng.getState();
    const expected: number[] = [];
    for (let i = 0; i < 20; i++) expected.push(rng.nextUint32());

    const restored = Rng.fromState(state);
    for (let i = 0; i < 20; i++) expect(restored.nextUint32()).toBe(expected[i]);
  });

  it('clones without sharing state', () => {
    const rng = Rng.fromSeed(7);
    const clone = rng.clone();
    rng.nextUint32();
    expect(clone.getState()).toEqual(Rng.fromSeed(7).getState());
  });

  it('never returns values outside the unsigned 32 bit range', () => {
    const rng = Rng.fromSeed(31337);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('keeps nextFloat in [0, 1)', () => {
    const rng = Rng.fromSeed(5);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws bounded integers without bias', () => {
    const rng = Rng.fromSeed(2024);
    const bound = 7;
    const buckets = new Array<number>(bound).fill(0);
    const draws = 70_000;
    for (let i = 0; i < draws; i++) {
      const value = rng.nextInt(bound);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(bound);
      buckets[value] = (buckets[value] ?? 0) + 1;
    }
    const expectedPerBucket = draws / bound;
    for (const count of buckets) {
      expect(Math.abs(count - expectedPerBucket)).toBeLessThan(expectedPerBucket * 0.06);
    }
  });

  it('treats degenerate bounds as a constant', () => {
    const rng = Rng.fromSeed(11);
    expect(rng.nextInt(1)).toBe(0);
    expect(rng.nextInt(0)).toBe(0);
  });

  it('covers inclusive ranges', () => {
    const rng = Rng.fromSeed(99);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 5000; i++) {
      const value = rng.nextRange(-3, 3);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      if (value === -3) sawMin = true;
      if (value === 3) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });
});
