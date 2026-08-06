import { describe, expect, it } from 'vitest';
import { packSignal, SignalKind } from '../../src/sim/map/signals';
import { trackBit, TrackDir } from '../../src/sim/map/track';
import { nextSignalStep } from '../../src/ui/signalCycle';

/**
 * The signal tool's click cycle (D-126). What has to hold: every step the
 * cycle proposes is one the simulation would accept on plain line - the
 * one-way directions come from the track bits, never from a hardcoded
 * constant, which was exactly the defect (MapCanvas sent TrackDir.East for
 * every signal it ever placed).
 */

/** A straight east-west line: the two directions a signal there can face. */
const STRAIGHT = trackBit(TrackDir.East) | trackBit(TrackDir.West);

describe('the signal click cycle', () => {
  it('starts with the two-way kind of the armed family', () => {
    expect(nextSignalStep(0, STRAIGHT, 'signal')).toEqual({
      kind: SignalKind.Block,
      direction: TrackDir.East,
    });
    expect(nextSignalStep(0, STRAIGHT, 'pathsignal')).toEqual({
      kind: SignalKind.Path,
      direction: TrackDir.East,
    });
  });

  it('cycles two-way, one way per track direction, back to two-way', () => {
    const twoWay = packSignal(SignalKind.Block, TrackDir.East);
    const oneWayEast = nextSignalStep(twoWay, STRAIGHT, 'signal');
    expect(oneWayEast).toEqual({ kind: SignalKind.BlockOneWay, direction: TrackDir.East });

    const oneWayWest = nextSignalStep(
      packSignal(SignalKind.BlockOneWay, TrackDir.East),
      STRAIGHT,
      'signal',
    );
    expect(oneWayWest).toEqual({ kind: SignalKind.BlockOneWay, direction: TrackDir.West });

    const backToTwoWay = nextSignalStep(
      packSignal(SignalKind.BlockOneWay, TrackDir.West),
      STRAIGHT,
      'signal',
    );
    expect(backToTwoWay).toEqual({ kind: SignalKind.Block, direction: TrackDir.East });
  });

  it('cycles the path family through the entry signal the same way', () => {
    const step = nextSignalStep(packSignal(SignalKind.Path, 0), STRAIGHT, 'pathsignal');
    expect(step).toEqual({ kind: SignalKind.PathEntry, direction: TrackDir.East });

    const last = nextSignalStep(
      packSignal(SignalKind.PathEntry, TrackDir.West),
      STRAIGHT,
      'pathsignal',
    );
    expect(last).toEqual({ kind: SignalKind.Path, direction: TrackDir.East });
  });

  it('offers only directions the track actually has', () => {
    // A diagonal line: south-west and north-east.
    const diagonal = trackBit(TrackDir.SouthWest) | trackBit(TrackDir.NorthEast);
    const first = nextSignalStep(packSignal(SignalKind.Block, 0), diagonal, 'signal');
    expect(first).toEqual({ kind: SignalKind.BlockOneWay, direction: TrackDir.SouthWest });

    const second = nextSignalStep(
      packSignal(SignalKind.BlockOneWay, TrackDir.SouthWest),
      diagonal,
      'signal',
    );
    expect(second).toEqual({ kind: SignalKind.BlockOneWay, direction: TrackDir.NorthEast });
  });

  it('restarts at two-way when the standing signal is the other family', () => {
    const step = nextSignalStep(packSignal(SignalKind.Path, TrackDir.East), STRAIGHT, 'signal');
    expect(step).toEqual({ kind: SignalKind.Block, direction: TrackDir.East });
  });

  it('closes: three clicks on a straight line come back to the start', () => {
    let packed = 0;
    const seen: number[] = [];
    for (let click = 0; click < 4; click++) {
      const step = nextSignalStep(packed, STRAIGHT, 'signal');
      seen.push(step.kind);
      packed = packSignal(step.kind as SignalKind, step.direction as TrackDir);
    }
    // Place, cycle twice, and the fourth click is the first again.
    expect(seen[0]).toBe(SignalKind.Block);
    expect(seen[3]).toBe(seen[0]);
  });
});
