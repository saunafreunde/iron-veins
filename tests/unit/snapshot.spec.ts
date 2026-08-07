import { describe, expect, it } from 'vitest';
import {
  createSnapshotBuffer,
  SNAPSHOT_BYTES,
  SNAPSHOT_LAYOUT_VERSION,
  SnapshotF64,
  SnapshotFlow,
  SnapshotHeader,
  SnapshotI32,
  SnapshotReader,
  SnapshotWriter,
} from '../../src/shared/snapshot';

describe('snapshot double buffer', () => {
  it('allocates the documented size', () => {
    expect(createSnapshotBuffer().byteLength).toBe(SNAPSHOT_BYTES);
    // Both slots must start 8-byte aligned or the Float64 views cannot be created.
    expect(SNAPSHOT_BYTES % 8).toBe(0);
  });

  it('shows nothing before the first publish', () => {
    const buffer = createSnapshotBuffer();
    new SnapshotWriter(buffer);
    expect(new SnapshotReader(buffer).poll()).toBe(false);
  });

  it('transports integer and float fields', () => {
    const buffer = createSnapshotBuffer();
    const writer = new SnapshotWriter(buffer);
    const reader = new SnapshotReader(buffer);

    writer.draftI32[SnapshotI32.Tick] = 12_345;
    writer.draftI32[SnapshotI32.Year] = 1987;
    writer.draftF64[SnapshotF64.CashCt] = 9_007_199_254_740_991;
    writer.publish();

    expect(reader.poll()).toBe(true);
    expect(reader.i32[SnapshotI32.Tick]).toBe(12_345);
    expect(reader.i32[SnapshotI32.Year]).toBe(1987);
    expect(reader.f64[SnapshotF64.CashCt]).toBe(9_007_199_254_740_991);
    expect(reader.poll()).toBe(false);
  });

  it('alternates slots so a reader never sees a half written tick', () => {
    const buffer = createSnapshotBuffer();
    const writer = new SnapshotWriter(buffer);
    const reader = new SnapshotReader(buffer);

    writer.draftI32[SnapshotI32.Tick] = 1;
    writer.publish();
    reader.poll();
    const publishedSlot = reader.i32;

    // While the next tick is being drafted the published slot must not change.
    writer.draftI32[SnapshotI32.Tick] = 2;
    expect(publishedSlot[SnapshotI32.Tick]).toBe(1);
    expect(reader.i32[SnapshotI32.Tick]).toBe(1);

    writer.publish();
    expect(reader.poll()).toBe(true);
    expect(reader.i32[SnapshotI32.Tick]).toBe(2);
  });

  it('survives many alternating publishes', () => {
    const buffer = createSnapshotBuffer();
    const writer = new SnapshotWriter(buffer);
    const reader = new SnapshotReader(buffer);

    for (let tick = 1; tick <= 100; tick++) {
      writer.draftI32[SnapshotI32.Tick] = tick;
      writer.publish();
      expect(reader.poll()).toBe(true);
      expect(reader.i32[SnapshotI32.Tick]).toBe(tick);
      expect(reader.generation).toBe(tick);
    }
  });

  it('transports the flow-leg block, tagged with its own tick (M14, D-176)', () => {
    const buffer = createSnapshotBuffer();
    const writer = new SnapshotWriter(buffer);
    const reader = new SnapshotReader(buffer);

    writer.draftI32[SnapshotI32.Tick] = 777;
    writer.draftI32[SnapshotI32.FlowCount] = 1;
    const flow = writer.draftFlow;
    flow[SnapshotFlow.FromStation] = 3;
    flow[SnapshotFlow.ToStation] = 5;
    flow[SnapshotFlow.VolumeUnits] = 120;
    flow[SnapshotFlow.OldestTick] = 42;
    flow[SnapshotFlow.MeanTicks] = 900;
    flow[SnapshotFlow.Measured] = 1;
    flow[SnapshotFlow.OwnerId] = 0;
    flow[SnapshotFlow.LineId] = 2;
    writer.publish();

    const view = reader.currentFlow();
    expect(view.count).toBe(1);
    expect(view.tick).toBe(777);
    expect(view.data[SnapshotFlow.FromStation]).toBe(3);
    expect(view.data[SnapshotFlow.ToStation]).toBe(5);
    expect(view.data[SnapshotFlow.VolumeUnits]).toBe(120);
    expect(view.data[SnapshotFlow.OldestTick]).toBe(42);
    expect(view.data[SnapshotFlow.MeanTicks]).toBe(900);
    expect(view.data[SnapshotFlow.Measured]).toBe(1);
    expect(view.data[SnapshotFlow.OwnerId]).toBe(0);
    expect(view.data[SnapshotFlow.LineId]).toBe(2);

    // The next draft is the OTHER slot: the published block must not move
    // while it is being written (the double-buffer rule, law #10).
    writer.draftFlow[SnapshotFlow.ToStation] = 99;
    expect(reader.currentFlow().data[SnapshotFlow.ToStation]).toBe(5);
  });

  it('refuses a buffer written by a different layout', () => {
    const buffer = createSnapshotBuffer();
    new SnapshotWriter(buffer);
    const header = new Int32Array(buffer, 0, 8);
    Atomics.store(header, SnapshotHeader.LayoutVersion, SNAPSHOT_LAYOUT_VERSION + 1);
    expect(() => new SnapshotReader(buffer)).toThrow(/layout mismatch/i);
  });
});
