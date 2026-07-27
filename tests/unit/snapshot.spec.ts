import { describe, expect, it } from 'vitest';
import {
  createSnapshotBuffer,
  SNAPSHOT_BYTES,
  SNAPSHOT_LAYOUT_VERSION,
  SnapshotF64,
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

  it('refuses a buffer written by a different layout', () => {
    const buffer = createSnapshotBuffer();
    new SnapshotWriter(buffer);
    const header = new Int32Array(buffer, 0, 8);
    Atomics.store(header, SnapshotHeader.LayoutVersion, SNAPSHOT_LAYOUT_VERSION + 1);
    expect(() => new SnapshotReader(buffer)).toThrow(/layout mismatch/i);
  });
});
