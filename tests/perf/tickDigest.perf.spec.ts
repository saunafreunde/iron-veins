import { describe, expect, it } from 'vitest';
import { hashWorldTick } from '../../src/sim/multiplayer/tickDigest';
import { hashWorld, hashWorldLive } from '../../src/sim/World';
import { buildMeasuredWorld } from './fixture1500';

/**
 * What the per-tick desync digest of SPEC2 E-16 really costs, on the fixture
 * Z6 prescribes.
 *
 * E-16 promises "~0,1 ms nur bei Flag". That figure was written before the
 * 1,500-vehicle fixture existed and is Fehlerkatalog 36 in the flesh - a
 * budget promise without a baseline. This file is the baseline. It asserts
 * nothing about the estimate and everything about the ORDERING that makes the
 * design defensible:
 *
 *  - the tick digest is cheaper than the full `hashWorld`, which is what makes
 *    it usable per tick at all rather than per save;
 *  - and it is no dearer than the live digest it is a shortened walk of, which
 *    is what proves the ledger branch really drops work instead of merely
 *    being written as if it did.
 *
 * The measured numbers are printed, and the ones that were recorded on the
 * reference machine live in ledger 6.1.1 beside every other figure this
 * project promises (D-261). Deliberately not a threshold: the flag ships OFF,
 * so no budget row depends on this and a gate here would be a CI failure about
 * a machine's load rather than about the code (D-167's argument).
 */
describe('the per-tick digest (SPEC2 E-16)', () => {
  it('costs less than the full world hash and no more than the live one', () => {
    const { world } = buildMeasuredWorld();

    // One of each first: the first call pays for whatever the engine has not
    // yet warmed, and the comparison is about the walks and not about that.
    hashWorld(world);
    hashWorldLive(world);
    hashWorldTick(world);

    const runs = 12;
    const measure = (fn: () => string): number => {
      const samples: number[] = [];
      for (let i = 0; i < runs; i++) {
        const started = performance.now();
        fn();
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      return samples[runs >> 1]!;
    };

    const full = measure(() => hashWorld(world));
    const live = measure(() => hashWorldLive(world));
    const tick = measure(() => hashWorldTick(world));

    console.log(
      `digest medians on the 1500-vehicle fixture: full ${full.toFixed(3)} ms, ` +
        `live ${live.toFixed(3)} ms, tick ${tick.toFixed(3)} ms ` +
        `(E-16 estimated ~0.1 ms for the tick digest)`,
    );

    expect(tick).toBeLessThan(full);
    // The ledger branch can only remove work, so the shortened walk must never
    // measure dearer than the walk it is a subset of. A tolerance, because two
    // medians a few hundredths of a millisecond apart are one measurement.
    expect(tick).toBeLessThanOrEqual(live + 0.5);
  });

  it('is a different digest from the live one, and both are stable', () => {
    // The cheap digest has to be a real fingerprint, not a constant: the two
    // walks differ by the ledger arrays, so on a world whose companies have
    // booked anything at all the two answers differ - and each is stable.
    const { world } = buildMeasuredWorld();
    expect(hashWorldTick(world)).toBe(hashWorldTick(world));
    expect(hashWorldLive(world)).toBe(hashWorldLive(world));
    expect(hashWorldTick(world)).not.toBe(hashWorldLive(world));
  });
});
