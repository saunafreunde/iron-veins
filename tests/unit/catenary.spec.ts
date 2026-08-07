import { describe, expect, it } from 'vitest';
import { RailType, trackBit, TrackDir } from '../../src/sim/map/track';
import {
  CATENARY_RAIL_TYPE,
  catenaryMastOffset,
  MAST_VERGE_OFFSET,
} from '../../src/render/catenary';

/**
 * The catenary mast policy of M13 B5 (SPEC2: "Fahrleitungsmasten auf
 * elektrifizierter Strecke"): which tiles carry a mast and where it stands,
 * as a table of cases - the lampOffsetForRoadTile pattern.
 */

const EAST_WEST = trackBit(TrackDir.East) | trackBit(TrackDir.West);
const NORTH_SOUTH = trackBit(TrackDir.North) | trackBit(TrackDir.South);
const SE_NW = trackBit(TrackDir.SouthEast) | trackBit(TrackDir.NorthWest);
const NE_SW = trackBit(TrackDir.NorthEast) | trackBit(TrackDir.SouthWest);

describe('which rail type carries wire', () => {
  it('is exactly the electrified type the sim gates catenary traction on', () => {
    expect(CATENARY_RAIL_TYPE).toBe(RailType.Electrified);
  });
});

describe('mast spacing', () => {
  it('alternates along a straight east-west run', () => {
    const results = [10, 11, 12, 13, 14].map((x) => catenaryMastOffset(EAST_WEST, x, 5));
    expect(results.map((offset) => offset !== null)).toEqual([true, false, true, false, true]);
  });

  it('alternates along a straight north-south run', () => {
    // dx of the run is 0, so the alternating axis is y - an x parity would
    // put a mast on every tile of the run or on none.
    const results = [10, 11, 12, 13].map((y) => catenaryMastOffset(NORTH_SOUTH, 5, y));
    expect(results.map((offset) => offset !== null)).toEqual([true, false, true, false]);
  });

  it('alternates along both diagonals, where no single parity could', () => {
    // A south-east run steps (+1, +1): x + y keeps its parity for ever.
    const se = [0, 1, 2, 3].map((step) => catenaryMastOffset(SE_NW, 10 + step, 20 + step));
    expect(se.map((offset) => offset !== null)).toEqual([true, false, true, false]);
    // A north-east run steps (+1, -1): same trap, same answer.
    const ne = [0, 1, 2, 3].map((step) => catenaryMastOffset(NE_SW, 10 + step, 20 - step));
    expect(ne.map((offset) => offset !== null)).toEqual([true, false, true, false]);
  });

  it('skips junctions - a portal in a throat would stand over the crossing', () => {
    const junction = EAST_WEST | trackBit(TrackDir.North);
    expect(catenaryMastOffset(junction, 10, 10)).toBeNull();
  });

  it('serves a dead end - one connection still names a run', () => {
    expect(catenaryMastOffset(trackBit(TrackDir.East), 10, 6)).not.toBeNull();
  });

  it('answers null off the rails', () => {
    expect(catenaryMastOffset(0, 10, 10)).toBeNull();
  });
});

describe('where the mast stands', () => {
  it('is perpendicular to the run, one verge offset out', () => {
    for (const bits of [EAST_WEST, NORTH_SOUTH, SE_NW, NE_SW]) {
      // Pick a tile the parity accepts for this run.
      let offset: readonly [number, number] | null = null;
      for (let x = 10; x <= 11 && offset === null; x++) {
        for (let y = 10; y <= 11 && offset === null; y++) {
          offset = catenaryMastOffset(bits, x, y);
        }
      }
      expect(offset, `bits ${bits}`).not.toBeNull();
      const length = Math.sqrt(offset![0] * offset![0] + offset![1] * offset![1]);
      expect(length).toBeCloseTo(MAST_VERGE_OFFSET, 10);
    }
  });

  it('stands on the viewer side, so drawing it over a train is honest', () => {
    // Screen depth of a tile-space offset is u + v; the policy flips the
    // perpendicular so it is never negative (projection.ts, the Catenary
    // layer's argument).
    for (let direction = 0; direction < 8; direction++) {
      let offset: readonly [number, number] | null = null;
      for (let x = 10; x <= 11 && offset === null; x++) {
        for (let y = 10; y <= 11 && offset === null; y++) {
          offset = catenaryMastOffset(trackBit(direction as TrackDir), x, y);
        }
      }
      expect(offset, `direction ${direction}`).not.toBeNull();
      expect(offset![0] + offset![1], `direction ${direction}`).toBeGreaterThanOrEqual(0);
    }
  });
});
