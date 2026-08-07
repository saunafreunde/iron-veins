import { describe, expect, it } from 'vitest';
import {
  FLOW_ARROWHEAD_MIN_ZOOM,
  FLOW_BOW_MAX_PX,
  FLOW_BOW_MIN_PX,
  FLOW_ESTIMATE_COLOR,
  FLOW_HEAD_PX,
  FLOW_TOP_N,
  FLOW_WIDTH_MAX_PX,
  FLOW_WIDTH_MIN_PX,
  flowArcControl,
  flowArrowWidth,
  flowHash,
  flowHead,
  flowStrokeColor,
  selectTopFlows,
} from '../../src/render/flowAtlas';
import {
  SNAPSHOT_FLOW_STRIDE,
  SNAPSHOT_MAX_FLOW_LEGS,
  SnapshotFlow,
} from '../../src/shared/snapshot';
import { TICKS_PER_MONTH } from '../../src/sim/constants';
import { writeFlowLegs } from '../../src/sim/flow';
import { buildTransferNetwork, runTicks } from '../helpers/transferNetwork';

/**
 * The pure geometry and policy layer of the M14 flow atlas (D-177): arc
 * control points, the width law, the deterministic bow, the top-N cut and
 * the colour rules - everything MapView draws from, held without a renderer
 * in the room.
 */

/** Build a flow block with the given volumes, one row per entry. */
function blockWithVolumes(volumes: readonly number[]): Int32Array {
  const block = new Int32Array(volumes.length * SNAPSHOT_FLOW_STRIDE);
  for (let i = 0; i < volumes.length; i++) {
    const base = i * SNAPSHOT_FLOW_STRIDE;
    block[base + SnapshotFlow.FromStation] = i;
    block[base + SnapshotFlow.ToStation] = i + 1;
    block[base + SnapshotFlow.VolumeUnits] = volumes[i]!;
    block[base + SnapshotFlow.Measured] = 1;
  }
  return block;
}

describe('the quadratic arc of a flow arrow', () => {
  it('bows the two directions of a pair to opposite sides, by construction', () => {
    const ab = flowArcControl(0, 0, 100, 0);
    const ba = flowArcControl(100, 0, 0, 0);

    // The chord is the x axis, so "side" is the sign of the control's y.
    expect(ab.cy).not.toBe(0);
    expect(Math.sign(ab.cy)).toBe(-Math.sign(ba.cy));
    // Same chord, same bow height - the arcs are mirror images.
    expect(Math.abs(ab.cy)).toBeCloseTo(Math.abs(ba.cy), 10);
    expect(ab.cx).toBeCloseTo(ba.cx, 10);
  });

  it('is deterministic and sits perpendicular over the midpoint', () => {
    const first = flowArcControl(3, 7, 203, 107);
    const second = flowArcControl(3, 7, 203, 107);
    expect(second).toEqual(first);

    // The control minus the midpoint is perpendicular to the chord.
    const midX = (3 + 203) / 2;
    const midY = (7 + 107) / 2;
    const chordX = 200;
    const chordY = 100;
    const dot = (first.cx - midX) * chordX + (first.cy - midY) * chordY;
    expect(dot).toBeCloseTo(0, 8);
  });

  it('clamps the bow between its floor and its ceiling', () => {
    // A short chord: the bow is the floor, not ratio * length.
    const short = flowArcControl(0, 0, 10, 0);
    expect(Math.abs(short.cy)).toBeCloseTo(FLOW_BOW_MIN_PX, 10);

    // A cross-map chord: the bow stops at the ceiling.
    const long = flowArcControl(0, 0, 10_000, 0);
    expect(Math.abs(long.cy)).toBeCloseTo(FLOW_BOW_MAX_PX, 10);

    // Degenerate zero-length chord: the midpoint, no NaN.
    const point = flowArcControl(5, 5, 5, 5);
    expect(point.cx).toBe(5);
    expect(point.cy).toBe(5);
  });
});

describe('the width law', () => {
  it('is proportional to the volume between floor and ceiling', () => {
    expect(flowArrowWidth(0)).toBe(FLOW_WIDTH_MIN_PX);
    // Strictly increasing while under the cap ...
    expect(flowArrowWidth(100)).toBeGreaterThan(flowArrowWidth(50));
    // ... with a linear slope: equal steps grow the width equally.
    const step1 = flowArrowWidth(100) - flowArrowWidth(50);
    const step2 = flowArrowWidth(150) - flowArrowWidth(100);
    expect(step1).toBeCloseTo(step2, 10);
    // A negative volume cannot shrink below the floor.
    expect(flowArrowWidth(-5)).toBe(FLOW_WIDTH_MIN_PX);
  });

  it('caps at the ceiling so a heavy flow stays an arrow', () => {
    expect(flowArrowWidth(1_000_000)).toBe(FLOW_WIDTH_MAX_PX);
  });
});

describe('the arrowhead', () => {
  it('lays the base perpendicular behind the tip', () => {
    // Arrival direction straight +x: the base corners share x = tip - size
    // and sit half a size above and below the axis.
    const head = flowHead(0, 0, 100, 0, FLOW_HEAD_PX);
    expect(head.leftX).toBeCloseTo(100 - FLOW_HEAD_PX, 10);
    expect(head.rightX).toBeCloseTo(100 - FLOW_HEAD_PX, 10);
    expect(head.leftY).toBeCloseTo(-head.rightY, 10);
    expect(Math.abs(head.leftY)).toBeCloseTo(FLOW_HEAD_PX / 2, 10);
  });

  it('degenerates safely when control and tip coincide', () => {
    const head = flowHead(4, 4, 4, 4, FLOW_HEAD_PX);
    expect(head.leftX).toBe(4);
    expect(head.rightY).toBe(4);
  });

  it('is gated below the chunked zoom', () => {
    // 0.25x has no heads, 0.5x and above do - the D-165 argument.
    expect(FLOW_ARROWHEAD_MIN_ZOOM).toBeGreaterThan(0.25);
    expect(FLOW_ARROWHEAD_MIN_ZOOM).toBeLessThanOrEqual(0.5);
  });
});

describe('the top-N cut', () => {
  it('selects the highest volumes and states the omission honestly', () => {
    const block = blockWithVolumes([5, 90, 40, 90, 1, 300]);
    const out = new Int32Array(4);
    const selection = selectTopFlows(block, 6, 4, out);

    expect(selection.drawn).toBe(4);
    expect(selection.omitted).toBe(2);
    // Volume descending; the 90-tie resolves by row index - a total order,
    // so the same block always selects the same arrows in the same order.
    expect([...out]).toEqual([5, 1, 3, 2]);
  });

  it('draws everything when the world is smaller than the cap', () => {
    const block = blockWithVolumes([7, 3]);
    const out = new Int32Array(FLOW_TOP_N);
    const selection = selectTopFlows(block, 2, FLOW_TOP_N, out);
    expect(selection.drawn).toBe(2);
    expect(selection.omitted).toBe(0);
  });

  it('never reads past the count or the block', () => {
    const block = blockWithVolumes([1, 2, 3, 4]);
    const out = new Int32Array(8);
    // Count says two rows: rows 2 and 3 do not exist for the selection.
    const selection = selectTopFlows(block, 2, 8, out);
    expect(selection.drawn).toBe(2);
    expect([...out].slice(0, 2)).toEqual([1, 0]);
  });
});

describe('the colour policy', () => {
  it('gives an estimate leg the neutral grey, never a company colour', () => {
    expect(flowStrokeColor(-1, -1)).toBe(FLOW_ESTIMATE_COLOR);
    expect(flowStrokeColor(-1, 3)).toBe(FLOW_ESTIMATE_COLOR);
  });

  it('keeps the company hue dominant and shades lines apart deterministically', () => {
    const free = flowStrokeColor(1, -1);
    const line0 = flowStrokeColor(1, 0);
    const line1 = flowStrokeColor(1, 1);
    const line2 = flowStrokeColor(1, 2);

    // Line 0 and free-order traffic wear the pure company colour.
    expect(line0).toBe(free);
    // Further lines of the same company are tellable apart.
    expect(new Set([line0, line1, line2]).size).toBe(3);
    // Deterministic: the same ids always give the same colour.
    expect(flowStrokeColor(1, 1)).toBe(line1);
    // Different companies differ.
    expect(flowStrokeColor(2, 0)).not.toBe(line0);
  });
});

describe('the redraw hash', () => {
  it('moves when a used row moves and ignores rows past the count', () => {
    const block = blockWithVolumes([10, 20, 30]);
    const before = flowHash(block, 2);
    expect(flowHash(block, 2)).toBe(before);

    // Row 2 is outside the count: bending it changes nothing.
    block[2 * SNAPSHOT_FLOW_STRIDE + SnapshotFlow.VolumeUnits] = 999;
    expect(flowHash(block, 2)).toBe(before);

    // A used row's volume moved: the hash moves, the overlay redraws.
    block[1 * SNAPSHOT_FLOW_STRIDE + SnapshotFlow.VolumeUnits] = 21;
    expect(flowHash(block, 2)).not.toBe(before);

    // The count itself is part of the identity: a leg appearing redraws too.
    expect(flowHash(block, 3)).not.toBe(flowHash(block, 2));
  });
});

describe('the flow atlas over the three-line transfer network (Fertig-wenn)', () => {
  it('turns every measured leg into an arrow whose width follows its volume', () => {
    const network = buildTransferNetwork();
    runTicks(network, 2 * TICKS_PER_MONTH);

    const block = new Int32Array(SNAPSHOT_MAX_FLOW_LEGS * SNAPSHOT_FLOW_STRIDE);
    const count = writeFlowLegs(network.world, block);
    expect(count).toBe(6);

    const out = new Int32Array(FLOW_TOP_N);
    const selection = selectTopFlows(block, count, FLOW_TOP_N, out);
    // Six legs, far under the cap: every measured leg IS drawn, none cut.
    expect(selection.drawn).toBe(6);
    expect(selection.omitted).toBe(0);

    const stations = network.world.stations;
    let previousVolume = Number.POSITIVE_INFINITY;
    for (let i = 0; i < selection.drawn; i++) {
      const base = out[i]! * SNAPSHOT_FLOW_STRIDE;
      expect(block[base + SnapshotFlow.Measured]).toBe(1);

      // Both endpoints resolve to real stations with distinct positions.
      const from = stations[block[base + SnapshotFlow.FromStation]!]!;
      const to = stations[block[base + SnapshotFlow.ToStation]!]!;
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      expect(from.x === to.x && from.y === to.y).toBe(false);

      // Width proportional to volume: the selection is volume-descending,
      // so the widths must descend with it - and stay inside the law.
      const volume = block[base + SnapshotFlow.VolumeUnits]!;
      expect(volume).toBeLessThanOrEqual(previousVolume);
      const width = flowArrowWidth(volume);
      expect(width).toBeGreaterThanOrEqual(FLOW_WIDTH_MIN_PX);
      expect(width).toBeLessThanOrEqual(FLOW_WIDTH_MAX_PX);
      expect(width).toBeLessThanOrEqual(flowArrowWidth(previousVolume));
      previousVolume = volume;

      // The measured owner colours the arrow - the player's company.
      expect(
        flowStrokeColor(block[base + SnapshotFlow.OwnerId]!, block[base + SnapshotFlow.LineId]!),
      ).not.toBe(FLOW_ESTIMATE_COLOR);
    }

    // The paired legs of the A-B arm bow to opposite sides of one chord.
    const a = stations[0]!;
    const b = stations[1]!;
    const abControl = flowArcControl(a.x, a.y, b.x, b.y);
    const baControl = flowArcControl(b.x, b.y, a.x, a.y);
    expect(abControl.cx === baControl.cx && abControl.cy === baControl.cy).toBe(false);
  }, 120_000);
});
