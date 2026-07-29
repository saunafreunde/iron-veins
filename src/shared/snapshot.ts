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

export const SNAPSHOT_LAYOUT_VERSION = 5;

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
  /** Bumped whenever the ground changed; the renderer rebuilds its tiles then. */
  MapRevision: 10,
  /** How many entries of the vehicle block are in use. */
  VehicleCount: 11,
  /** How many entries of the reservation block are in use. */
  ReservedCount: 12,
  /** Consecutive months closed in the red; 0 when solvent (section 14.2). */
  MonthsInDebt: 13,
} as const;

/**
 * Length of the integer block, rounded UP to an even count.
 *
 * The Float64 block starts immediately after it, and a Float64Array view has to
 * begin on an eight byte boundary - so an odd number of Int32 fields would make
 * the whole snapshot unconstructable. Adding a field here means checking this
 * number, not only the enum above.
 */
export const SNAPSHOT_I32_COUNT = 14;

/**
 * Float fields of one slot. Money is an exact integer number of cents; it lives
 * in a Float64 because cent amounts exceed the Int32 range and doubles
 * represent integers below 2^53 exactly.
 */
export const SnapshotF64 = {
  CashCt: 0,
  LoanCt: 1,
  LoanLimitCt: 2,
} as const;
export const SNAPSHOT_F64_COUNT = 3;

/**
 * Vehicles the renderer may draw in one tick.
 *
 * Everything about a vehicle that changes per tick is five Int32 values, so the
 * whole block is one typed array rather than five - fewer views to create, and
 * the layout stays trivially aligned.
 */
export const SNAPSHOT_MAX_VEHICLES = 1_500;

/** Fields per vehicle, in the order they appear in the block. */
export const SnapshotVehicle = {
  /** Tile the vehicle is on. */
  Tile: 0,
  /** Tile it is heading for; equal to Tile when standing still. */
  NextTile: 1,
  /** Progress between the two, in thousandths of that step. */
  ProgressMilli: 2,
  /** A value of VehicleState. */
  State: 3,
  /**
   * A value of VehicleKind. The renderer picks the sprite from it; without it
   * a train would be drawn as a bus, and it is the one static property that is
   * cheaper to send than to look up per frame.
   */
  Kind: 4,
  /**
   * The vehicle's id in the store.
   *
   * The block is COMPACTED - dead vehicles are skipped - so a row's position
   * says nothing about which vehicle it is. Without the id the renderer cannot
   * answer "which vehicle did the player just click on", which is what section
   * 17 has owed since M2, and a sound cannot be kept attached to the same
   * vehicle from one frame to the next.
   */
  VehicleId: 5,
  /** Company that owns it, so the map can colour it (section 15). */
  Owner: 6,
} as const;
export const SNAPSHOT_VEHICLE_STRIDE = 7;

/**
 * Track claims the F3 overlay may draw in one tick (section 9.3).
 *
 * The overlay is a learning tool and ships in the release build, so the tiles
 * trains hold have to reach the renderer somehow. A pair per claimed tile is
 * the cheapest honest way: sixteen kilobytes covers a network with several
 * hundred trains on it, and beyond that the overlay simply stops drawing rather
 * than the simulation slowing down.
 */
export const SNAPSHOT_MAX_RESERVED_TILES = 4_096;

/** Fields per claimed tile. */
export const SnapshotReserved = {
  Tile: 0,
  /** Vehicle holding it; the overlay colours by it. */
  VehicleId: 1,
} as const;
export const SNAPSHOT_RESERVED_STRIDE = 2;

const HEADER_BYTES = HEADER_I32_COUNT * 4;
const STATUS_I32_BYTES = SNAPSHOT_I32_COUNT * 4;
const STATUS_F64_BYTES = SNAPSHOT_F64_COUNT * 8;
const VEHICLE_BYTES = SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE * 4;
const RESERVED_BYTES = SNAPSHOT_MAX_RESERVED_TILES * SNAPSHOT_RESERVED_STRIDE * 4;
const SLOT_BYTES = STATUS_I32_BYTES + STATUS_F64_BYTES + VEHICLE_BYTES + RESERVED_BYTES;

export const SNAPSHOT_BYTES = HEADER_BYTES + 2 * SLOT_BYTES;

function slotByteOffset(slot: number): number {
  return HEADER_BYTES + slot * SLOT_BYTES;
}

function i32View(buffer: SharedArrayBuffer, slot: number): Int32Array {
  return new Int32Array(buffer, slotByteOffset(slot), SNAPSHOT_I32_COUNT);
}

function f64View(buffer: SharedArrayBuffer, slot: number): Float64Array {
  return new Float64Array(buffer, slotByteOffset(slot) + STATUS_I32_BYTES, SNAPSHOT_F64_COUNT);
}

function vehicleView(buffer: SharedArrayBuffer, slot: number): Int32Array {
  return new Int32Array(
    buffer,
    slotByteOffset(slot) + STATUS_I32_BYTES + STATUS_F64_BYTES,
    SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE,
  );
}

function reservedView(buffer: SharedArrayBuffer, slot: number): Int32Array {
  return new Int32Array(
    buffer,
    slotByteOffset(slot) + STATUS_I32_BYTES + STATUS_F64_BYTES + VEHICLE_BYTES,
    SNAPSHOT_MAX_RESERVED_TILES * SNAPSHOT_RESERVED_STRIDE,
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
  private readonly vehicleSlots: readonly [Int32Array, Int32Array];
  private readonly reservedSlots: readonly [Int32Array, Int32Array];
  private generation = 0;

  constructor(readonly buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];
    this.vehicleSlots = [vehicleView(buffer, 0), vehicleView(buffer, 1)];
    this.reservedSlots = [reservedView(buffer, 0), reservedView(buffer, 1)];
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

  /** Vehicle block of the slot currently being filled. */
  get draftVehicles(): Int32Array {
    return this.vehicleSlots[(this.generation + 1) & 1]!;
  }

  /** Claimed-tile block of the slot currently being filled. */
  get draftReserved(): Int32Array {
    return this.reservedSlots[(this.generation + 1) & 1]!;
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
  private readonly vehicleSlots: readonly [Int32Array, Int32Array];
  private readonly reservedSlots: readonly [Int32Array, Int32Array];
  /** 0 means "nothing published yet"; the writer starts publishing at 1. */
  private lastGeneration = 0;

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];
    this.vehicleSlots = [vehicleView(buffer, 0), vehicleView(buffer, 1)];
    this.reservedSlots = [reservedView(buffer, 0), reservedView(buffer, 1)];

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

  /**
   * Latest published generation, without advancing the read marker.
   * The renderer draws every frame, not only when a new tick arrived.
   */
  peekGeneration(): number {
    return Atomics.load(this.header, SnapshotHeader.Generation);
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

  get vehicles(): Int32Array {
    return this.vehicleSlots[this.lastGeneration & 1]!;
  }

  /** Views of the currently published generation, for a renderer that polls. */
  currentVehicles(): { readonly data: Int32Array; readonly count: number } {
    const generation = this.peekGeneration();
    const slot = generation & 1;
    return {
      data: this.vehicleSlots[slot]!,
      count: this.i32Slots[slot]![SnapshotI32.VehicleCount]!,
    };
  }

  /** Claimed tiles of the published tick, for the F3 overlay. */
  currentReserved(): { readonly data: Int32Array; readonly count: number } {
    const generation = this.peekGeneration();
    const slot = generation & 1;
    return {
      data: this.reservedSlots[slot]!,
      count: this.i32Slots[slot]![SnapshotI32.ReservedCount]!,
    };
  }
}
