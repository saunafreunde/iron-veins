import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotVehicle,
  type VehicleFrame,
} from '../shared/snapshot';
import { MAX_VEHICLES, TICK_MS } from '../sim/constants';
import { HEIGHT_PX, TILE_H, TILE_W } from './projection';

/**
 * Snapshot interpolation (SPEC2 E-05, D-162): true 60 Hz motion over a 20 Hz
 * simulation, without touching the protocol.
 *
 * The renderer keeps reader-side COPIES of the two newest published
 * generations of the vehicle block and draws each frame one tick behind the
 * simulation: every vehicle glides from its previous published position
 * towards its current one, placed by a wall-clock alpha. The wall clock
 * decides only WHERE BETWEEN two published ticks a frame sits - it never
 * invents a position the simulation did not publish, the simulation never
 * sees any of it, and determinism is untouched (the render-side exemption
 * E-05 grants by name; the sim-side ban of Fehlerkatalog 39 stands).
 *
 * No third SharedArrayBuffer, no stride change: the copies live on the main
 * thread, are refreshed only when the generation counter moved (20 Hz, never
 * per frame) and are preallocated once (law #7 in spirit - this runs inside
 * the frame loop).
 */

/**
 * Ceiling on the lerp window. The measured rate legitimately stretches a
 * tick past 50 ms when the simulation is loaded, and gliding over the TRUE
 * cadence is exactly right - but past a quarter second the sim is stalling,
 * and a sprite trailing its own truth by that much reads as lag, not as
 * smoothness. [ms; render-side judgment, D-162]
 */
const INTERVAL_MAX_MS = 250;

/**
 * Squared tile distance between two generations' `Tile` fields beyond which
 * a vehicle SNAPS to its new position instead of gliding - E-05's clamp at
 * discontinuities. A vehicle advances at most one tile per tick (a tile is
 * TILE_SIZE_M = 50 m and no catalogue speed approaches 1000 m/s), so even a
 * doubled generation gap under fast-forward stays within two tiles; three
 * or more is a relocation - depot recall, path reset, a loaded world -
 * which must cut, not glide. Exported because the consist breadcrumb ring
 * (M13, consistArt.ts) resets on exactly the same rule: when the head
 * snaps, the whole consist snaps with it - one threshold, one truth.
 * [tiles squared]
 */
export const TELEPORT_TILES_SQ = 9;

/**
 * VehicleState values whose arrival or departure snaps the sprite: Loading
 * (3), BrokenDown (5) and InDepot (6). These transitions relocate or halt a
 * vehicle in ways a glide would misdraw - a lorry sliding INTO the bay it
 * is already loading at, a breakdown drifting to its standstill, a shed
 * swallowing a sprite mid-slide. Values duplicated as numbers to keep
 * render free of sim enums (the MapView pattern);
 * `tests/unit/interpolation.spec.ts` pins them against `VehicleState`.
 */
const SNAP_STATE_MASK = (1 << 3) | (1 << 5) | (1 << 6);

/**
 * The lerp window for a measured simulation rate, in milliseconds.
 *
 * `SimRateCentiHz` is hundredths of a tick per second, so the published
 * cadence is 100 000 / rate ms per tick; an unmeasured rate (0, before the
 * first second of a fresh worker) falls back to the fixed step, and a
 * stalling sim is capped at {@link INTERVAL_MAX_MS}.
 */
export function tickIntervalMsFor(simRateCentiHz: number): number {
  if (simRateCentiHz <= 0) return TICK_MS;
  const measured = 100_000 / simRateCentiHz;
  return measured > INTERVAL_MAX_MS ? INTERVAL_MAX_MS : measured;
}

/**
 * Where a frame sits between the previous and the current generation, in
 * [0, 1] - 0 at the instant the current generation arrived, 1 one tick
 * interval later. Clamped at both ends: clock skew before the arrival stamp
 * shows the previous positions, a pause or stall parks every vehicle at its
 * current published position and nothing extrapolates past the truth.
 */
export function interpolationAlpha(nowMs: number, arrivedMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 1;
  const alpha = (nowMs - arrivedMs) / intervalMs;
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  return alpha;
}

/**
 * Should this vehicle snap to its current position instead of gliding?
 *
 * `dxTiles`/`dyTiles` is the tile-space delta between the two generations'
 * `Tile` fields; a jump past {@link TELEPORT_TILES_SQ} is a teleport. A
 * state transition into or out of {@link SNAP_STATE_MASK} snaps too - the
 * places where a glide draws a motion the simulation never made.
 */
export function shouldSnap(
  dxTiles: number,
  dyTiles: number,
  prevState: number,
  currState: number,
): boolean {
  if (dxTiles * dxTiles + dyTiles * dyTiles > TELEPORT_TILES_SQ) return true;
  if (prevState === currState) return false;
  return ((SNAP_STATE_MASK >> prevState) & 1) === 1 || ((SNAP_STATE_MASK >> currState) & 1) === 1;
}

/**
 * World-pixel X of one vehicle sample: the within-tile lerp `MapView` always
 * drew, as an allocation-free pure function so the generation lerp can run
 * it twice per vehicle without `tileToWorld`'s object return. Exactly the
 * 16.1 projection - asserted equal to `tileToWorld` in the unit test.
 */
export function sampleWorldX(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number,
): number {
  const from = (fromX - fromY) * (TILE_W / 2);
  const to = (toX - toY) * (TILE_W / 2);
  return from + (to - from) * progress;
}

/** World-pixel Y of one vehicle sample; see {@link sampleWorldX}. */
export function sampleWorldY(
  fromX: number,
  fromY: number,
  fromHeight: number,
  toX: number,
  toY: number,
  toHeight: number,
  progress: number,
): number {
  const from = (fromX + fromY) * (TILE_H / 2) - fromHeight * HEIGHT_PX;
  const to = (toX + toY) * (TILE_H / 2) - toHeight * HEIGHT_PX;
  return from + (to - from) * progress;
}

/**
 * The reader-side generation store of E-05.
 *
 * `observe` is called once per frame with the published frame; only when the
 * generation counter actually moved does it copy - the newest copy becomes
 * the previous one, the published block is copied over the older buffer, and
 * the previous copy is indexed by vehicle id, because the block is COMPACTED
 * and a row's position says nothing about which vehicle it holds. Everything
 * is preallocated; the per-frame path allocates nothing.
 */
export class SnapshotInterpolator {
  private readonly blocks: readonly [Int32Array, Int32Array] = [
    new Int32Array(SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE),
    new Int32Array(SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE),
  ];
  private readonly counts: [number, number] = [0, 0];
  private readonly ticks: [number, number] = [0, 0];
  /** Which of the two buffers holds the newest generation. */
  private currentSlot = 0;
  /** Generation last copied; -1 before the first real publish. */
  private observedGeneration = -1;
  /** True once TWO generations have been seen - the lerp needs both ends. */
  private prevValid = false;
  /** Wall-clock stamp of the newest generation's arrival. [ms] */
  private arrivedMs = 0;
  /** Lerp window derived from the measured sim rate at arrival. [ms] */
  private intervalMs = TICK_MS;
  /** Row of each vehicle id in the PREVIOUS copy; -1 when absent. */
  private readonly prevRowById = new Int32Array(MAX_VEHICLES).fill(-1);

  /**
   * Take note of the published frame. Copies only when the generation moved;
   * re-observing the same generation is free and does not move the arrival
   * stamp. A frame from a channel that has never published (generation 0)
   * is ignored entirely. Returns true when a new generation was copied -
   * the 20 Hz edge the consist breadcrumb recorder (M13) keys on, so ring
   * maintenance runs per published tick, never per rendered frame.
   */
  observe(frame: VehicleFrame, nowMs: number): boolean {
    if (frame.generation <= 0 || frame.generation === this.observedGeneration) return false;

    if (this.observedGeneration > 0) {
      // The newest copy becomes the previous one; index it by vehicle id.
      this.prevValid = true;
      const previous = this.blocks[this.currentSlot]!;
      const previousCount = this.counts[this.currentSlot]!;
      this.prevRowById.fill(-1);
      for (let row = 0; row < previousCount; row++) {
        const id = previous[row * SNAPSHOT_VEHICLE_STRIDE + SnapshotVehicle.VehicleId]!;
        if (id >= 0 && id < MAX_VEHICLES) this.prevRowById[id] = row;
      }
      this.currentSlot ^= 1;
    }

    const target = this.blocks[this.currentSlot]!;
    // Whole-block copy into the preallocated buffer - rows past `count` are
    // dead weight nobody reads. The oversize guard only fires in tests that
    // hand-build blocks; the real channel is exactly SNAPSHOT_MAX_VEHICLES.
    target.set(
      frame.data.length > target.length ? frame.data.subarray(0, target.length) : frame.data,
    );
    this.counts[this.currentSlot] = Math.min(frame.count, SNAPSHOT_MAX_VEHICLES);
    this.ticks[this.currentSlot] = frame.tick;
    this.observedGeneration = frame.generation;
    this.arrivedMs = nowMs;
    this.intervalMs = tickIntervalMsFor(frame.simRateCentiHz);
    return true;
  }

  /** True once a real generation has been copied and can be drawn. */
  get hasFrame(): boolean {
    return this.observedGeneration > 0;
  }

  /** The newest generation's vehicle block (reader-side copy). */
  get data(): Int32Array {
    return this.blocks[this.currentSlot]!;
  }

  /** Rows in use in {@link data}. */
  get count(): number {
    return this.counts[this.currentSlot]!;
  }

  /** The previous generation's vehicle block (reader-side copy). */
  get prevData(): Int32Array {
    return this.blocks[this.currentSlot ^ 1]!;
  }

  /**
   * Rows in use in {@link prevData}, or 0 until two generations exist. The
   * consist breadcrumb recorder (M13) walks the PREVIOUS block after every
   * swap: those are the positions the interpolated head has provably
   * passed, so the ring never holds a point ahead of the drawn sprite.
   */
  get prevCount(): number {
    return this.prevValid ? this.counts[this.currentSlot ^ 1]! : 0;
  }

  /**
   * Row of a vehicle in {@link prevData}, or -1 when the vehicle did not
   * exist in the previous generation (a fresh spawn draws at its current
   * position - there is nothing to glide from).
   */
  prevRowOf(vehicleId: number): number {
    if (!this.prevValid || vehicleId < 0 || vehicleId >= MAX_VEHICLES) return -1;
    return this.prevRowById[vehicleId]!;
  }

  /** This frame's alpha; 1 until two generations exist. */
  alpha(nowMs: number): number {
    if (!this.prevValid) return 1;
    return interpolationAlpha(nowMs, this.arrivedMs, this.intervalMs);
  }

  /**
   * Fractional tick for the day/night curve (D-127): the same alpha that
   * places the vehicles places the light, so dawn glides instead of stepping
   * once per tick. Bounded by the two published ticks - the wall clock
   * chooses where BETWEEN two published counters the frame sits; it never
   * invents a counter value the simulation did not publish.
   */
  phase(alpha: number): number {
    const currentTick = this.ticks[this.currentSlot]!;
    if (!this.prevValid) return currentTick;
    const previousTick = this.ticks[this.currentSlot ^ 1]!;
    return previousTick + (currentTick - previousTick) * alpha;
  }
}
