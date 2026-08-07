import { describe, expect, it } from 'vitest';
import {
  interpolationAlpha,
  sampleWorldX,
  sampleWorldY,
  shouldSnap,
  SnapshotInterpolator,
  tickIntervalMsFor,
} from '../../src/render/interpolation';
import { tileToWorld } from '../../src/render/projection';
import {
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotVehicle,
  type VehicleFrame,
} from '../../src/shared/snapshot';
import { MAX_VEHICLES, TICK_MS } from '../../src/sim/constants';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';

/**
 * The snapshot interpolation of SPEC2 E-05 (D-162): reader-side copies of
 * the two newest published generations, a wall-clock alpha between them, and
 * a clamp at every discontinuity. This suite is the M12 acceptance evidence
 * ("Interpolations-Alpha per Test belegt"): the alpha is proven to stay in
 * [0, 1], a vehicle between two generations lands on the expected
 * interpolated position, and the snap cases cut instead of gliding.
 *
 * Everything here is pure - the wall clock enters as a plain parameter, so
 * the tests hand in the times instead of reading any.
 */

/** The map edge used by the tile arithmetic in these fixtures. [tiles] */
const SIZE = 64;

/** 20 ticks per second in the snapshot's hundredths-of-Hz encoding. */
const RATE_20_HZ = 2_000;

interface Row {
  readonly id: number;
  readonly tile: number;
  readonly next: number;
  readonly progressMilli: number;
  readonly state?: number;
}

function frame(
  generation: number,
  tick: number,
  rows: readonly Row[],
  simRateCentiHz = RATE_20_HZ,
): VehicleFrame {
  const data = new Int32Array(rows.length * SNAPSHOT_VEHICLE_STRIDE);
  rows.forEach((row, index) => {
    const base = index * SNAPSHOT_VEHICLE_STRIDE;
    data[base + SnapshotVehicle.Tile] = row.tile;
    data[base + SnapshotVehicle.NextTile] = row.next;
    data[base + SnapshotVehicle.ProgressMilli] = row.progressMilli;
    data[base + SnapshotVehicle.State] = row.state ?? VehicleState.Driving;
    data[base + SnapshotVehicle.Kind] = 1;
    data[base + SnapshotVehicle.VehicleId] = row.id;
    data[base + SnapshotVehicle.Owner] = 0;
  });
  return { data, count: rows.length, generation, tick, simRateCentiHz };
}

/** Tile index of (x, y) on the fixture map. */
function at(x: number, y: number): number {
  return y * SIZE + x;
}

describe('the interpolation alpha (E-05)', () => {
  it('is proven to stay inside [0, 1] wherever the wall clock stands', () => {
    expect(interpolationAlpha(1_000, 1_000, 50)).toBe(0);
    expect(interpolationAlpha(1_025, 1_000, 50)).toBeCloseTo(0.5, 12);
    expect(interpolationAlpha(1_050, 1_000, 50)).toBe(1);
    // Clock skew before the arrival stamp and a long stall both clamp: the
    // renderer never extrapolates past a published position in either
    // direction.
    expect(interpolationAlpha(990, 1_000, 50)).toBe(0);
    expect(interpolationAlpha(99_999, 1_000, 50)).toBe(1);
    for (let offset = -100; offset <= 400; offset += 7) {
      const alpha = interpolationAlpha(1_000 + offset, 1_000, 50);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it('derives the lerp window from the measured rate, capped and with a fallback', () => {
    expect(tickIntervalMsFor(RATE_20_HZ)).toBeCloseTo(TICK_MS, 12); // the fixed step
    expect(tickIntervalMsFor(40_000)).toBeCloseTo(2.5, 12); // 20x fast-forward
    expect(tickIntervalMsFor(0)).toBe(TICK_MS); // nothing measured yet
    expect(tickIntervalMsFor(-5)).toBe(TICK_MS); // defensive
    expect(tickIntervalMsFor(100)).toBe(250); // a stalling sim is capped
  });
});

describe('the vehicle sample projection', () => {
  it('projects exactly as tileToWorld lerped along the step', () => {
    const from = tileToWorld(3, 5, 2);
    const to = tileToWorld(4, 5, 3);
    const progress = 0.3;
    expect(sampleWorldX(3, 5, 4, 5, progress)).toBeCloseTo(from.x + (to.x - from.x) * progress, 12);
    expect(sampleWorldY(3, 5, 2, 4, 5, 3, progress)).toBeCloseTo(
      from.y + (to.y - from.y) * progress,
      12,
    );
  });
});

describe('two generations through the interpolator', () => {
  it('lerps a vehicle to the expected interpolated position', () => {
    const interp = new SnapshotInterpolator();
    // Generation 1: vehicle 7 crossing (10,10) -> (11,10) at 40 %.
    interp.observe(
      frame(1, 100, [{ id: 7, tile: at(10, 10), next: at(11, 10), progressMilli: 400 }]),
      1_000,
    );
    // Generation 2, one tick later: the same step at 90 %.
    interp.observe(
      frame(2, 101, [{ id: 7, tile: at(10, 10), next: at(11, 10), progressMilli: 900 }]),
      1_050,
    );

    expect(interp.hasFrame).toBe(true);
    expect(interp.prevRowOf(7)).toBe(0);
    expect(interp.data[SnapshotVehicle.ProgressMilli]).toBe(900);
    expect(interp.prevData[SnapshotVehicle.ProgressMilli]).toBe(400);

    // Half a tick interval after the arrival: alpha exactly one half.
    const alpha = interp.alpha(1_075);
    expect(alpha).toBeCloseTo(0.5, 12);

    // The expected position: halfway between the two published samples,
    // which on this step is progress 65 % - MapView computes it as
    // prev + (curr - prev) * alpha from the same pure pieces.
    const prevX = sampleWorldX(10, 10, 11, 10, 0.4);
    const currX = sampleWorldX(10, 10, 11, 10, 0.9);
    const prevY = sampleWorldY(10, 10, 0, 11, 10, 0, 0.4);
    const currY = sampleWorldY(10, 10, 0, 11, 10, 0, 0.9);
    expect(prevX + (currX - prevX) * alpha).toBeCloseTo(sampleWorldX(10, 10, 11, 10, 0.65), 12);
    expect(prevY + (currY - prevY) * alpha).toBeCloseTo(
      sampleWorldY(10, 10, 0, 11, 10, 0, 0.65),
      12,
    );
  });

  it('pairs rows by vehicle id across compaction, not by position', () => {
    const interp = new SnapshotInterpolator();
    interp.observe(
      frame(1, 100, [
        { id: 5, tile: at(1, 1), next: at(2, 1), progressMilli: 0 },
        { id: 7, tile: at(4, 4), next: at(5, 4), progressMilli: 500 },
      ]),
      0,
    );
    // Vehicle 5 died; 7 moved up a row; 12 is a fresh spawn.
    interp.observe(
      frame(2, 101, [
        { id: 7, tile: at(4, 4), next: at(5, 4), progressMilli: 900 },
        { id: 12, tile: at(9, 9), next: at(9, 9), progressMilli: 0 },
      ]),
      50,
    );

    expect(interp.prevRowOf(7)).toBe(1);
    expect(interp.prevRowOf(5)).toBe(0);
    expect(interp.prevRowOf(12)).toBe(-1); // fresh spawn: nothing to glide from
    expect(interp.prevRowOf(-1)).toBe(-1);
    expect(interp.prevRowOf(MAX_VEHICLES)).toBe(-1);
  });

  it('copies the block reader-side, so the writer overwriting the slot moves nothing', () => {
    const interp = new SnapshotInterpolator();
    const published = frame(1, 100, [
      { id: 1, tile: at(10, 10), next: at(11, 10), progressMilli: 100 },
    ]);
    interp.observe(published, 0);
    // The worker drafting the next tick into the same memory.
    published.data[SnapshotVehicle.ProgressMilli] = 999;
    expect(interp.data[SnapshotVehicle.ProgressMilli]).toBe(100);
  });

  it('ignores an unpublished channel and does not restamp a re-observed generation', () => {
    const interp = new SnapshotInterpolator();
    interp.observe(
      { data: new Int32Array(0), count: 0, generation: 0, tick: 0, simRateCentiHz: 0 },
      0,
    );
    expect(interp.hasFrame).toBe(false);
    expect(interp.alpha(1_000)).toBe(1); // no frames: draw whatever is current

    const row: Row = { id: 3, tile: at(6, 6), next: at(7, 6), progressMilli: 250 };
    interp.observe(frame(1, 100, [row]), 100);
    expect(interp.alpha(130)).toBe(1); // one generation: nothing to glide from

    interp.observe(frame(2, 101, [row]), 150);
    // Re-observing generation 2 later must NOT move its arrival stamp -
    // 60 Hz polls the same 20 Hz slot three times.
    interp.observe(frame(2, 101, [row]), 166);
    expect(interp.alpha(175)).toBeCloseTo(0.5, 12);
  });

  it('reports the 20 Hz edge and the previous count for the consist recorder (M13)', () => {
    const interp = new SnapshotInterpolator();
    const rows: Row[] = [
      { id: 1, tile: at(3, 3), next: at(4, 3), progressMilli: 0 },
      { id: 2, tile: at(5, 5), next: at(6, 5), progressMilli: 0 },
    ];
    expect(
      interp.observe(
        { data: new Int32Array(0), count: 0, generation: 0, tick: 0, simRateCentiHz: 0 },
        0,
      ),
    ).toBe(false);
    expect(interp.prevCount).toBe(0);
    expect(interp.observe(frame(1, 100, rows), 0)).toBe(true);
    // One generation: nothing has become "previous" yet, so the breadcrumb
    // recorder has nothing to walk.
    expect(interp.prevCount).toBe(0);
    expect(interp.observe(frame(1, 100, rows), 16)).toBe(false); // re-poll of the same slot
    expect(interp.observe(frame(2, 101, rows), 50)).toBe(true);
    expect(interp.prevCount).toBe(2);
  });
});

describe('the clamp at discontinuities (E-05)', () => {
  it('snaps a teleport instead of gliding it across the map', () => {
    const driving = VehicleState.Driving;
    expect(shouldSnap(0, 0, driving, driving)).toBe(false);
    expect(shouldSnap(1, -1, driving, driving)).toBe(false);
    // A doubled generation gap under fast-forward: two tiles, still a glide.
    expect(shouldSnap(2, 2, driving, driving)).toBe(false);
    // A relocation - depot recall, path reset, loaded world - cuts.
    expect(shouldSnap(4, 0, driving, driving)).toBe(true);
    expect(shouldSnap(0, -4, driving, driving)).toBe(true);
    expect(shouldSnap(20, 20, driving, driving)).toBe(true);
  });

  it('snaps the state changes where a glide would misdraw, pinned to VehicleState', () => {
    // This is the coupling pin for the duplicated SNAP_STATE_MASK values:
    // it reads the sim's own enum, so a renumbering turns this red.
    expect(shouldSnap(0, 0, VehicleState.Driving, VehicleState.Loading)).toBe(true);
    expect(shouldSnap(0, 0, VehicleState.Loading, VehicleState.Driving)).toBe(true);
    expect(shouldSnap(1, 0, VehicleState.Driving, VehicleState.BrokenDown)).toBe(true);
    expect(shouldSnap(0, 0, VehicleState.InDepot, VehicleState.Driving)).toBe(true);
    // An unchanged state never snaps - both samples describe the same stand.
    expect(shouldSnap(0, 0, VehicleState.Loading, VehicleState.Loading)).toBe(false);
    // Transitions the physics itself smooths keep gliding.
    expect(shouldSnap(0, 0, VehicleState.Driving, VehicleState.Braking)).toBe(false);
    expect(shouldSnap(0, 0, VehicleState.Braking, VehicleState.WaitingForPath)).toBe(false);
    expect(shouldSnap(0, 0, VehicleState.WaitingForSlot, VehicleState.Driving)).toBe(false);
  });
});

describe('the interpolated day/night phase (D-127 smoothed)', () => {
  it('moves between the two published ticks by the same alpha as the vehicles', () => {
    const interp = new SnapshotInterpolator();
    const row: Row = { id: 1, tile: at(3, 3), next: at(4, 3), progressMilli: 0 };
    interp.observe(frame(1, 100, [row]), 0);
    interp.observe(frame(2, 101, [row]), 50);

    expect(interp.phase(0)).toBe(100);
    expect(interp.phase(0.5)).toBeCloseTo(100.5, 12);
    expect(interp.phase(1)).toBe(101);
    // Bounded: the wall clock chooses where BETWEEN two published counters
    // the frame sits; it never invents a counter value (Fehlerkatalog 39
    // stays honoured on the sim side).
    for (let alpha = 0; alpha <= 1; alpha += 0.125) {
      const phase = interp.phase(alpha);
      expect(phase).toBeGreaterThanOrEqual(100);
      expect(phase).toBeLessThanOrEqual(101);
    }
  });

  it('holds the phase at the published tick while only one generation exists', () => {
    const interp = new SnapshotInterpolator();
    interp.observe(frame(1, 42, [{ id: 1, tile: at(3, 3), next: at(3, 3), progressMilli: 0 }]), 0);
    expect(interp.phase(0)).toBe(42);
    expect(interp.phase(1)).toBe(42);
  });
});
