/**
 * Render snapshot transported through a SharedArrayBuffer (architecture law #10
 * and section 4.1).
 *
 * The worker writes into the slot that is currently *not* published and then
 * bumps the generation counter with Atomics.store. The reader picks the slot
 * belonging to the published generation, so it always sees a complete tick and
 * never a half written one. There is deliberately no postMessage per tick - at
 * 20 Hz with thousands of vehicles that would dominate the frame budget.
 *
 * Whoever adds a field here must bump SNAPSHOT_LAYOUT_VERSION; the reader
 * refuses to interpret a buffer written by a different layout.
 */

export const SNAPSHOT_LAYOUT_VERSION = 1;

/** Header fields, shared by both slots. */
export const SnapshotHeader = {
  /** Incremented once per published tick. Slot in use is `generation & 1`. */
  Generation: 0,
  LayoutVersion: 1,
} as const;

/** Header is padded to 32 bytes so both slots start 8-byte aligned for Float64. */
const HEADER_I32_COUNT = 8;

/** Integer fields of one slot. */
export const SnapshotI32 = {
  Tick: 0,
  Year: 1,
  /** 0..11 */
  Month: 2,
  /** 0..29 */
  Day: 3,
  CompanyColorIndex: 4,
  SpeedIndex: 5,
  CommandsExecuted: 6,
  /** Measured simulation rate in hundredths of a tick per second. */
  SimRateCentiHz: 7,
  /** High and low half of the 64 bit world state hash (F3 overlay). */
  StateHashHi: 8,
  StateHashLo: 9,
} as const;
export const SNAPSHOT_I32_COUNT = 10;

/**
 * Float fields of one slot. Money is an exact integer number of cents; it lives
 * in a Float64 because cent amounts legitimately exceed the Int32 range and
 * doubles represent integers below 2^53 exactly.
 */
export const SnapshotF64 = {
  CashCt: 0,
  LoanCt: 1,
  LoanLimitCt: 2,
} as const;
export const SNAPSHOT_F64_COUNT = 3;

const HEADER_BYTES = HEADER_I32_COUNT * 4;
const SLOT_BYTES = SNAPSHOT_I32_COUNT * 4 + SNAPSHOT_F64_COUNT * 8;
export const SNAPSHOT_BYTES = HEADER_BYTES + 2 * SLOT_BYTES;

function slotByteOffset(slot: number): number {
  return HEADER_BYTES + slot * SLOT_BYTES;
}

function i32View(buffer: SharedArrayBuffer, slot: number): Int32Array {
  return new Int32Array(buffer, slotByteOffset(slot), SNAPSHOT_I32_COUNT);
}

function f64View(buffer: SharedArrayBuffer, slot: number): Float64Array {
  return new Float64Array(
    buffer,
    slotByteOffset(slot) + SNAPSHOT_I32_COUNT * 4,
    SNAPSHOT_F64_COUNT,
  );
}

/** Allocate a correctly sized, cross-origin-isolated snapshot buffer. */
export function createSnapshotBuffer(): SharedArrayBuffer {
  return new SharedArrayBuffer(SNAPSHOT_BYTES);
}

/** Worker side of the channel. */
export class SnapshotWriter {
  private readonly header: Int32Array;
  private readonly i32Slots: readonly [Int32Array, Int32Array];
  private readonly f64Slots: readonly [Float64Array, Float64Array];
  private generation = 0;

  constructor(readonly buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];
    Atomics.store(this.header, SnapshotHeader.LayoutVersion, SNAPSHOT_LAYOUT_VERSION);
    Atomics.store(this.header, SnapshotHeader.Generation, 0);
  }

  /** Integer fields of the slot currently being filled. */
  get draftI32(): Int32Array {
    return this.i32Slots[(this.generation + 1) & 1]!;
  }

  /** Float fields of the slot currently being filled. */
  get draftF64(): Float64Array {
    return this.f64Slots[(this.generation + 1) & 1]!;
  }

  /** Make the drafted slot visible to the reader. */
  publish(): void {
    this.generation++;
    Atomics.store(this.header, SnapshotHeader.Generation, this.generation);
  }
}

/** Main-thread side of the channel. */
export class SnapshotReader {
  private readonly header: Int32Array;
  private readonly i32Slots: readonly [Int32Array, Int32Array];
  private readonly f64Slots: readonly [Float64Array, Float64Array];
  /** 0 means "nothing published yet"; the writer starts publishing at 1. */
  private lastGeneration = 0;

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];

    const layout = Atomics.load(this.header, SnapshotHeader.LayoutVersion);
    if (layout !== 0 && layout !== SNAPSHOT_LAYOUT_VERSION) {
      throw new Error(
        `Snapshot layout mismatch: buffer is version ${layout}, reader expects ` +
          `${SNAPSHOT_LAYOUT_VERSION}.`,
      );
    }
  }

  /** True when a tick newer than the last read one is available. */
  poll(): boolean {
    const generation = Atomics.load(this.header, SnapshotHeader.Generation);
    if (generation === this.lastGeneration) return false;
    this.lastGeneration = generation;
    return true;
  }

  get generation(): number {
    return this.lastGeneration;
  }

  get i32(): Int32Array {
    return this.i32Slots[this.lastGeneration & 1]!;
  }

  get f64(): Float64Array {
    return this.f64Slots[this.lastGeneration & 1]!;
  }
}
