import { NET_TICK_DIGEST_RING_CAPACITY } from '../constants';
import { Fnv1a64 } from '../hash';
import { hashDynamicState, type World } from '../World';

/**
 * The per-tick desync digest of SPEC2 E-16 - groundwork, behind a debug flag.
 *
 * WHAT IT IS FOR. A lockstep session is two machines running the same
 * simulation from the same inputs, and the one failure it has is that they stop
 * doing so. The determinism suite catches a divergence between two runs of one
 * build; nothing in this game could catch one between two peers, because the
 * only digests it takes are `hashWorld` (nine megabytes of tile layer, once a
 * save) and `hashWorldLive` (once a game day, for the F3 overlay). Neither can
 * say WHICH TICK two histories parted on, and that tick is the whole diagnosis.
 *
 * WHAT IT IS. `hashDynamicState` without the company ledger arrays - E-16's own
 * prescription, taken literally and then measured. It is the SAME walk as the
 * live digest, one branch shorter, because a detector that fingerprints
 * different fields from the determinism suite disagrees with the authority it
 * exists to protect. What it drops is the six per-company arrays that only a
 * monthly or yearly hook can move; what it keeps is every vehicle, station,
 * town, line, goal, contract and the generator state - everything a tick can
 * touch.
 *
 * WHAT IT COSTS, AND THE SENTENCE IT CORRECTS. E-16 estimates "~0,1 ms nur bei
 * Flag". That estimate predates the 1,500-vehicle fixture Z6 exists to measure
 * against, and it is Fehlerkatalog 36 in the flesh - a budget promise without a
 * baseline. Measured, the honest figure is in D-261 and in ledger 6.1.1, and it
 * is a multiple of that estimate, because a vehicle's PATH is up to a few
 * hundred tiles and the walk hashes all of it. Two things follow and both are
 * stated rather than smoothed away: the tick-budget row is untouched because
 * the flag is OFF by default and the digest is taken in the scheduler, outside
 * `tick()`; and a session that turns it on pays roughly the cost of the
 * simulation itself, which is what a debug instrument is allowed to cost and
 * what a shipped one would not be.
 *
 * WHAT IT IS NOT. It is not saved, not hashed, not read by any simulation
 * decision, and no `src/sim` file outside this one may speak its vocabulary -
 * the D-186 posture for the derived throughput counters, asserted the same way
 * by `tests/unit/multiplayer.spec.ts`. A digest that steered anything would be an
 * unsaved input to a saved decision, i.e. Z4 broken in silence.
 */

/** The digest of one tick, as the 16-character hex the rest of the game uses. */
export function hashWorldTick(world: World): string {
  const h = new Fnv1a64();
  hashDynamicState(h, world, false);
  return h.digest();
}

/**
 * The last {@link NET_TICK_DIGEST_RING_CAPACITY} ticks' digests.
 *
 * A ring rather than a log because the interesting question is never "what did
 * tick 12 hash to" but "where did we last agree", and that answer is always
 * near the end. Fixed Int32Arrays so recording allocates nothing: it runs once
 * per tick when the flag is on, from the worker's scheduler, and law #7's
 * reason applies there even though its letter does not.
 *
 * The digest is stored as its two 32-bit halves rather than as a string,
 * because sixteen characters per tick at 20 Hz is a kilobyte a second of
 * garbage for a value nobody reads until something has already gone wrong.
 */
export class TickDigestRing {
  private readonly ticks = new Int32Array(NET_TICK_DIGEST_RING_CAPACITY);
  private readonly hi = new Int32Array(NET_TICK_DIGEST_RING_CAPACITY);
  private readonly lo = new Int32Array(NET_TICK_DIGEST_RING_CAPACITY);
  private cursor = 0;
  private written = 0;

  /** How many entries the ring currently holds, capped at its capacity. */
  get length(): number {
    return this.written < NET_TICK_DIGEST_RING_CAPACITY
      ? this.written
      : NET_TICK_DIGEST_RING_CAPACITY;
  }

  /**
   * Record the digest of `world` at its current tick.
   *
   * Takes the world rather than a string so the caller cannot record a digest
   * of one tick against the number of another - the mismatch that would make
   * the whole instrument lie about where two peers parted.
   */
  record(world: World): void {
    const digest = hashWorldTick(world);
    const at = this.cursor;
    this.ticks[at] = world.tick;
    this.hi[at] = Number.parseInt(digest.slice(0, 8), 16) | 0;
    this.lo[at] = Number.parseInt(digest.slice(8, 16), 16) | 0;
    this.cursor = (at + 1) % NET_TICK_DIGEST_RING_CAPACITY;
    this.written++;
  }

  /** Every entry it holds, oldest first, as `(tick, digest)` pairs. */
  entries(): { readonly tick: number; readonly digest: string }[] {
    const held = this.length;
    const out: { tick: number; digest: string }[] = [];
    const start =
      this.written <= NET_TICK_DIGEST_RING_CAPACITY
        ? 0
        : this.cursor % NET_TICK_DIGEST_RING_CAPACITY;
    for (let i = 0; i < held; i++) {
      const at = (start + i) % NET_TICK_DIGEST_RING_CAPACITY;
      out.push({
        tick: this.ticks[at]!,
        digest:
          (this.hi[at]! >>> 0).toString(16).padStart(8, '0') +
          (this.lo[at]! >>> 0).toString(16).padStart(8, '0'),
      });
    }
    return out;
  }

  /** Forget everything - a new world is a new history. */
  clear(): void {
    this.cursor = 0;
    this.written = 0;
  }
}

/**
 * The first tick at which two peers' rings disagree, or -1 when they agree
 * everywhere they overlap.
 *
 * This is the whole point of the ring and the reason it is a pair of arrays
 * rather than a single final hash: the answer a desync report needs is a TICK,
 * and a tick is only recoverable if both sides kept the sequence. Ticks that
 * only one side holds are not evidence of anything - a peer that started
 * recording later simply has less history - so the comparison runs over the
 * intersection and says so by returning -1 rather than by guessing.
 */
export function firstDisagreement(
  mine: readonly { readonly tick: number; readonly digest: string }[],
  theirs: readonly { readonly tick: number; readonly digest: string }[],
): number {
  const byTick = new Map<number, string>();
  for (const entry of theirs) byTick.set(entry.tick, entry.digest);
  let found = -1;
  for (const entry of mine) {
    const other = byTick.get(entry.tick);
    if (other === undefined || other === entry.digest) continue;
    if (found === -1 || entry.tick < found) found = entry.tick;
  }
  return found;
}
