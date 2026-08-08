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

export const SNAPSHOT_LAYOUT_VERSION = 8;

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
  /** How many entries of the flow-leg block are in use (M14 flow atlas). */
  FlowCount: 14,
} as const;

/**
 * Length of the integer block, rounded UP to an even count.
 *
 * The Float64 block starts immediately after it, and a Float64Array view has to
 * begin on an eight byte boundary - so an odd number of Int32 fields would make
 * the whole snapshot unconstructable. Adding a field here means checking this
 * number, not only the enum above. Fifteen fields round up to sixteen.
 */
export const SNAPSHOT_I32_COUNT = 16;

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
 * Everything about a vehicle that changes per tick is a handful of Int32
 * values, so the whole block is one typed array rather than one per field -
 * fewer views to create, and the layout stays trivially aligned.
 *
 * It is `MAX_VEHICLES`, the store's own capacity, and that is E-18's answer
 * (D-187). It stood at 1,500 - the reference fleet of SPEC.md section 21 -
 * while the store could hold 4,000, so a large fleet was drawn at 37.5 % and
 * the vehicles that fell off were chosen by nothing more meaningful than
 * their ids. The rule "everything alive is drawn" costs 160 KiB of shared
 * buffer and nothing at all per tick for any world at or below the old cap.
 * `tests/unit/snapshotCap.spec.ts` holds the equality against
 * `sim/constants.ts`, which is not imported here on purpose: the shared
 * channel does not depend on the simulation, so the coupling is a test
 * rather than an import.
 */
export const SNAPSHOT_MAX_VEHICLES = 4_000;

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
  /**
   * Line the vehicle is assigned to, or -1 (section 12.2, M11) - the ONE
   * snapshot-layout change of M11. Per tick because the panels highlight a
   * line's vehicles on the map, and a marker round-trip per hover would lag
   * a running fleet by a game day.
   */
  LineId: 7,
} as const;
export const SNAPSHOT_VEHICLE_STRIDE = 8;

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

/**
 * Station-pair flow legs the flow atlas may draw in one tick (SPEC2 M14).
 *
 * The measured connection graph of section 7.4 made renderer-visible: one row
 * per ACTIVE directed leg, written by the same publish pass as every other
 * block (Fehlerkatalog 2, Fehler 33 - never a second pass) and read by nobody
 * on the simulation side (D-176). A row is a station pair plus what the last
 * eight completed trips measured over it; the renderer joins the pair with the
 * station markers it already holds for positions and names.
 *
 * The cap follows the reserved-tile precedent: past it the atlas stops drawing
 * further legs rather than the simulation slowing down. 4,096 directed legs is
 * roughly two thousand simultaneously served station pairs - far past what the
 * 1,500-vehicle reference world produces (~420).
 */
export const SNAPSHOT_MAX_FLOW_LEGS = 4_096;

/** Fields per flow leg. */
export const SnapshotFlow = {
  /** Station the leg leaves from. */
  FromStation: 0,
  /** Station the leg arrives at. */
  ToStation: 1,
  /**
   * Units of cargo that moved over the leg in its recorded trips (the last
   * eight completed, the section 7.4 sample window), rounded. 0 while the leg
   * is still an estimate - the arrow exists, at minimum width.
   */
  VolumeUnits: 2,
  /**
   * Tick the OLDEST recorded trip arrived at, -1 while there is none. With the
   * frame's own tick this turns the volume into an honest rate: eight full
   * buses last week and eight full buses last year must not draw the same
   * arrow.
   */
  OldestTick: 3,
  /**
   * Mean travel time of the leg, arrival to arrival, rounded. [ticks] The
   * D-077 mean: the straight-line 54 km/h seed until the first real trip
   * replaces it - which is what the Measured field says.
   */
  MeanTicks: 4,
  /** 1 once at least one real trip measured the mean, 0 while it is a seed. */
  Measured: 5,
  /** Company whose vehicle completed the newest recorded trip, -1 before any. */
  OwnerId: 6,
  /** Line that trip's vehicle was assigned to, -1 when it ran free orders. */
  LineId: 7,
} as const;
export const SNAPSHOT_FLOW_STRIDE = 8;

/**
 * One read of the published vehicle block, tagged with the generation that
 * published it, its tick and the measured simulation rate - the bundle the
 * render-side interpolator of E-05 copies and times its alpha against
 * (D-162). A shared type because both sides of the channel name it: the
 * reader produces it, the renderer consumes it.
 */
export interface VehicleFrame {
  readonly data: Int32Array;
  readonly count: number;
  readonly generation: number;
  readonly tick: number;
  /** Measured simulation rate in hundredths of a tick per second. */
  readonly simRateCentiHz: number;
}

const HEADER_BYTES = HEADER_I32_COUNT * 4;
const STATUS_I32_BYTES = SNAPSHOT_I32_COUNT * 4;
const STATUS_F64_BYTES = SNAPSHOT_F64_COUNT * 8;
const VEHICLE_BYTES = SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE * 4;
const RESERVED_BYTES = SNAPSHOT_MAX_RESERVED_TILES * SNAPSHOT_RESERVED_STRIDE * 4;
const FLOW_BYTES = SNAPSHOT_MAX_FLOW_LEGS * SNAPSHOT_FLOW_STRIDE * 4;
const SLOT_BYTES =
  STATUS_I32_BYTES + STATUS_F64_BYTES + VEHICLE_BYTES + RESERVED_BYTES + FLOW_BYTES;

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

function flowView(buffer: SharedArrayBuffer, slot: number): Int32Array {
  return new Int32Array(
    buffer,
    slotByteOffset(slot) + STATUS_I32_BYTES + STATUS_F64_BYTES + VEHICLE_BYTES + RESERVED_BYTES,
    SNAPSHOT_MAX_FLOW_LEGS * SNAPSHOT_FLOW_STRIDE,
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
  private readonly flowSlots: readonly [Int32Array, Int32Array];
  private generation = 0;

  constructor(readonly buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];
    this.vehicleSlots = [vehicleView(buffer, 0), vehicleView(buffer, 1)];
    this.reservedSlots = [reservedView(buffer, 0), reservedView(buffer, 1)];
    this.flowSlots = [flowView(buffer, 0), flowView(buffer, 1)];
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

  /** Flow-leg block of the slot currently being filled (M14 flow atlas). */
  get draftFlow(): Int32Array {
    return this.flowSlots[(this.generation + 1) & 1]!;
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
  private readonly flowSlots: readonly [Int32Array, Int32Array];
  /** 0 means "nothing published yet"; the writer starts publishing at 1. */
  private lastGeneration = 0;

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
    this.i32Slots = [i32View(buffer, 0), i32View(buffer, 1)];
    this.f64Slots = [f64View(buffer, 0), f64View(buffer, 1)];
    this.vehicleSlots = [vehicleView(buffer, 0), vehicleView(buffer, 1)];
    this.reservedSlots = [reservedView(buffer, 0), reservedView(buffer, 1)];
    this.flowSlots = [flowView(buffer, 0), flowView(buffer, 1)];

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

  /**
   * Vehicle block of the published generation, tagged with that generation,
   * its tick and the measured sim rate (E-05, D-162). The generation is read
   * ONCE and every view derived from it, so a publish landing between two
   * separate reads cannot tag a fresh block with a stale number.
   */
  currentVehicleFrame(): VehicleFrame {
    const generation = this.peekGeneration();
    const slot = generation & 1;
    const i32 = this.i32Slots[slot]!;
    return {
      data: this.vehicleSlots[slot]!,
      count: i32[SnapshotI32.VehicleCount]!,
      generation,
      tick: i32[SnapshotI32.Tick]!,
      simRateCentiHz: i32[SnapshotI32.SimRateCentiHz]!,
    };
  }

  /**
   * Tick of the published generation, without advancing the read marker.
   * The day/night modulation reads it every frame (section 16.3).
   */
  currentTick(): number {
    return this.i32Slots[this.peekGeneration() & 1]![SnapshotI32.Tick]!;
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

  /**
   * Flow legs of the published tick, for the M14 flow atlas.
   *
   * Tagged with that tick, read from the SAME generation as the block: the
   * renderer turns VolumeUnits and OldestTick into a rate, and pairing the
   * block with a tick read separately could straddle a publish (the
   * currentVehicleFrame rule).
   */
  currentFlow(): { readonly data: Int32Array; readonly count: number; readonly tick: number } {
    const generation = this.peekGeneration();
    const slot = generation & 1;
    const i32 = this.i32Slots[slot]!;
    return {
      data: this.flowSlots[slot]!,
      count: i32[SnapshotI32.FlowCount]!,
      tick: i32[SnapshotI32.Tick]!,
    };
  }
}
