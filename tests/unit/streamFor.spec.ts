import { describe, expect, it } from 'vitest';
import { Fnv1a64 } from '../../src/sim/hash';
import { Rng } from '../../src/sim/rng';
import type { World } from '../../src/sim/World';
import { flatScenario } from '../balance/scenario';

/**
 * `world.streamFor(salt)` - the stream discipline of DECISIONS.md D-106,
 * formalised as an API (SPEC2 M10, Z3; D-128). Independence is what the API
 * buys: however many numbers a derived stream draws, the shared gameplay
 * stream and every other derived stream see exactly the draws they always saw.
 */

/**
 * The smallest world the save format will take (`MAP_SIZE_MIN`, D-197).
 *
 * It was 16 tiles until the two ends of the map-size rule were made to agree:
 * a 16-tile world could be built here and could never have been saved, which
 * is exactly the disagreement that fix removed. Nothing in this file depends
 * on the size - it asks the world for RNG streams.
 */
function makeWorld(seed: number): World {
  return flatScenario(64, [], [], seed).world;
}

function digest(rng: Rng, count: number): string {
  const hasher = new Fnv1a64();
  for (let i = 0; i < count; i++) hasher.u32(rng.nextUint32());
  return hasher.digest();
}

describe('world.streamFor', () => {
  it('yields the same sequence for the same seed and salt', () => {
    const a = makeWorld(4711);
    const b = makeWorld(4711);
    for (const salt of [0, 12_000, 'weather'] as const) {
      const left = a.streamFor(salt);
      const right = b.streamFor(salt);
      for (let i = 0; i < 256; i++) expect(left.nextUint32()).toBe(right.nextUint32());
    }
  });

  it('yields independent sequences for different salts', () => {
    const world = makeWorld(4711);
    const digests = new Set<string>();
    const salts: (number | string)[] = [0, 1, 6_000, 'weather', 'economy', 'contracts'];
    for (const salt of salts) digests.add(digest(world.streamFor(salt), 64));
    expect(digests.size).toBe(salts.length);
  });

  it('yields different sequences for different world seeds', () => {
    expect(digest(makeWorld(1).streamFor('weather'), 64)).not.toBe(
      digest(makeWorld(2).streamFor('weather'), 64),
    );
  });

  it('reproduces the D-106 tender stream bit for bit', () => {
    // The tender review used to build its stream by hand as
    // Rng.fromSeed((seed + tick) | 0), and every save and replay recorded
    // before streamFor existed depends on that exact construction. A numeric
    // salt therefore folds in exactly the same way - this test is the proof
    // that migrating contracts.ts onto the API changed no draw sequence.
    const world = makeWorld(9);
    for (const tick of [0, 6_000, 123_456, 21_000_000]) {
      const derived = world.streamFor(tick);
      const original = Rng.fromSeed((world.seed + tick) | 0);
      for (let i = 0; i < 128; i++) expect(derived.nextUint32()).toBe(original.nextUint32());
    }
  });

  it('never disturbs the shared gameplay stream', () => {
    const world = makeWorld(77);
    const before = world.rng.getState();
    const stream = world.streamFor('probe');
    for (let i = 0; i < 100; i++) stream.nextUint32();
    expect(world.rng.getState()).toEqual(before);
  });

  it('is frozen against accidental derivation changes', () => {
    // Golden values captured from this implementation, in the spirit of
    // rng.spec.ts: if either digest ever changes, every derived stream a
    // future save relies on silently stops reproducing - that is a
    // deliberate, reviewed decision, never an accident. The string case
    // freezes streamSalt as well.
    const world = makeWorld(424242);
    expect(digest(world.streamFor(6_000), 1_000)).toBe('10d7a6d8746dd074');
    expect(digest(world.streamFor('weather'), 1_000)).toBe('64c8bd42abeae6a0');
  });
});
