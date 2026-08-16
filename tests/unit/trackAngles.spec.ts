import { describe, expect, it } from 'vitest';
import {
  connected,
  oppositeDir,
  TRACK_DIR_COUNT,
  TRACK_PARTNERS,
  trackDegree,
  trackMaskLegal,
  turnSteps,
  type TrackDir,
} from '../../src/sim/map/track';

/**
 * The angle rule (M28), as a predicate over a tile's own bits.
 *
 * The owner's report was that the game lets you build track shapes no railway
 * has - "you cannot make switchbacks, like in TTD". Measured before anything
 * was written: all 64 ordered direction pairs are buildable, the pathfinder
 * drives 40 of them, and the 24 in between are track a player paid for that no
 * train will ever use. A 135 degree kink answers "no route", the same answer as
 * a gap in the rails.
 *
 * This file holds the rule alone, with no caller: what a tile may carry, and
 * why. The two places that enforce it come next, and both read `connected`.
 */

const DIRECTIONS = Array.from({ length: TRACK_DIR_COUNT }, (_, d) => d as TrackDir);

describe('what a train may drive through', () => {
  /** The rule in its own terms: at most one 45 degree step inside a tile. */
  it('joins two bits exactly when the turn is 0 or 45 degrees', () => {
    for (const a of DIRECTIONS) {
      for (const b of DIRECTIONS) {
        // Entering over bit a means travelling towards a + 4.
        const turn = Math.abs(turnSteps(oppositeDir(a), b));
        expect(connected(a, b), `${a} -> ${b} turns ${turn * 45} degrees`).toBe(turn <= 1);
      }
    }
  });

  it('is symmetric - a line can be driven either way', () => {
    for (const a of DIRECTIONS) {
      for (const b of DIRECTIONS) {
        expect(connected(a, b)).toBe(connected(b, a));
      }
    }
  });

  it('gives every direction exactly three partners', () => {
    for (const a of DIRECTIONS) {
      expect(trackDegree(TRACK_PARTNERS[a]!), `direction ${a}`).toBe(3);
    }
  });

  /** 24 of the 64 ordered pairs, against 40 the pathfinder used to allow. */
  it('leaves twenty-four of the sixty-four pairs drivable', () => {
    let drivable = 0;
    for (const a of DIRECTIONS) for (const b of DIRECTIONS) if (connected(a, b)) drivable++;
    expect(drivable).toBe(24);
  });
});

describe('what a tile may carry', () => {
  /**
   * The whole space, enumerated. A rule about 256 masks is worth stating as a
   * count: if a later edit widens or narrows it by one figure, this moves.
   */
  it('accepts 176 of the 256 masks', () => {
    let legal = 0;
    const byDegree = new Array<number>(9).fill(0);
    for (let bits = 0; bits < 256; bits++) {
      if (!trackMaskLegal(bits)) continue;
      legal++;
      byDegree[trackDegree(bits)]!++;
    }
    expect(legal).toBe(176);
    expect(byDegree).toEqual([1, 8, 12, 24, 46, 48, 28, 8, 1]);
  });

  /** A stub is how every line starts, so it can never be refused. */
  it('accepts an empty tile and every single stub', () => {
    expect(trackMaskLegal(0)).toBe(true);
    for (const direction of DIRECTIONS) {
      expect(trackMaskLegal(1 << direction), `stub ${direction}`).toBe(true);
    }
  });

  /**
   * The figures a railway is made of, one by one - each named, so the table
   * says what it is protecting rather than only how many.
   */
  it('accepts the shapes a railway is built from', () => {
    const accepted: readonly (readonly [number, string])[] = [
      [0b00010001, 'a straight, east to west'],
      [0b00100010, 'a diagonal'],
      [0b00010010, 'a 45 degree curve'],
      // Written down because the first draft of this table called it a kink:
      // east and south-west join at 45 degrees, not 135 - a train entering the
      // east end travels west, and south-west is one step off west.
      [0b00001001, 'a 45 degree curve, east to south-west'],
      [0b00110001, 'a trailing point - a straight with a diagonal joining it'],
      [0b01010101, 'a level crossing of two straights'],
      [0b10101010, 'a crossing of two diagonals'],
      [0b10111011, 'a full TTD junction'],
      [0xff, 'every direction at once'],
    ];
    for (const [bits, what] of accepted) {
      expect(trackMaskLegal(bits), `${what} (0b${bits.toString(2).padStart(8, '0')})`).toBe(true);
    }
  });

  /**
   * And the ones it exists to refuse. Each of these is buildable today and
   * carries at least one bit no train can enter or leave by.
   */
  it('refuses the shapes no train can drive', () => {
    const refused: readonly (readonly [number, string])[] = [
      [0b00110000, 'a 135 degree kink'],
      [0b00000101, 'a right angle between two straights'],
      [0b00010101, 'a T junction of three straights'],
      [0b00000110, 'a 135 degree kink between a diagonal and a straight'],
    ];
    for (const [bits, what] of refused) {
      expect(trackMaskLegal(bits), `${what} (0b${bits.toString(2).padStart(8, '0')})`).toBe(false);
    }
  });

  /**
   * The crossing is the one place this rule is looser than TTD, and it is a
   * decision rather than an oversight: a crossing is two lines sharing a tile
   * and NOT a junction, which one node per tile cannot express. What the rule
   * still guarantees is the half that matters - every drivable connection on
   * such a tile is one TTD would allow.
   */
  it('lets a crossing exist without letting a train turn on it', () => {
    const crossing = 0b01010101;
    expect(trackMaskLegal(crossing)).toBe(true);
    // East to west: straight through, fine. East to north: a right angle.
    expect(connected(0 as TrackDir, 4 as TrackDir)).toBe(true);
    expect(connected(0 as TrackDir, 2 as TrackDir)).toBe(false);
  });

  /**
   * The mask a single tile really reaches today: eight build commands from one
   * centre leave 0xFF. Under the rule that stays legal - every bit has a
   * partner - which is the honest consequence of the loose reading and is
   * pinned here rather than left to be discovered.
   */
  it('still accepts the eight-armed tile a player can build today', () => {
    expect(trackMaskLegal(0xff)).toBe(true);
    expect(trackDegree(0xff)).toBe(8);
  });
});
