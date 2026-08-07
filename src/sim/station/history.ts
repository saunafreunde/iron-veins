import { CARGO_COUNT, type Cargo } from '../cargo/types';
import { STATION_HISTORY_MONTHS } from '../constants';
import type { Station } from './types';
import type { World } from '../World';

/**
 * The per-station cargo-history ring of SPEC2 M14 (v25 save state).
 *
 * Three counters per cargo answer what the station panel's bar history asks:
 * how much left aboard vehicles (Collected - the number 10.1's death spiral
 * is about), how much arrived here as its destination (Delivered), and how
 * much was lost here (Expired - decay at the platform, the thirty-day
 * write-off, and cargo turned away at the door; the same losses 10.1's
 * overflow malus punishes).
 *
 * Write path, and why there are two blocks per station:
 *
 *  - Events add onto `monthCounters` (Float64 - cargo amounts are fractional
 *    shares, and rounding per event would systematically lose the small ones).
 *    The adds run inside the tick (loading, delivery, the daily sweeps), so
 *    they are plain indexed writes into a preallocated block (law #7).
 *  - The MONTHLY hook rounds the finished month into the Int32 ring at
 *    `historyCursor` and zeroes the accumulators (rollStationHistories).
 *
 * Ring layout: slot (month, cargo, counter) =
 * (month * CARGO_COUNT + cargo) * STATION_HISTORY_FIELD_COUNT + counter.
 * `historyCursor` is the slot the NEXT completed month will be written to,
 * so reading cursor, cursor+1, ... cursor-1 yields oldest to newest.
 *
 * Both blocks are saved and covered by the FULL world digest; no simulation
 * decision reads them back - they exist for the panel, and feeding a world
 * rule from them would need its own decision entry first (Fehler 23).
 */

/** The three counters of one (month, cargo) cell, in ring order. */
export const StationHistoryField = {
  /** Units loaded onto vehicles here - what actually left. */
  Collected: 0,
  /** Units delivered here as their destination. */
  Delivered: 1,
  /** Units lost here: platform decay, the 30-day write-off, overflow refusals. */
  Expired: 2,
} as const;
export type StationHistoryField = (typeof StationHistoryField)[keyof typeof StationHistoryField];

export const STATION_HISTORY_FIELD_COUNT = 3;

/** Int32 slots one station's ring holds. */
export const STATION_HISTORY_SIZE =
  STATION_HISTORY_MONTHS * CARGO_COUNT * STATION_HISTORY_FIELD_COUNT;

/** Float64 slots one station's month-in-progress accumulator holds. */
export const STATION_MONTH_COUNTER_SIZE = CARGO_COUNT * STATION_HISTORY_FIELD_COUNT;

/** A zeroed ring, for new stations and the v24 -> v25 migration. */
export function createStationHistory(): Int32Array {
  return new Int32Array(STATION_HISTORY_SIZE);
}

/** A zeroed month-in-progress block. */
export function createMonthCounters(): Float64Array {
  return new Float64Array(STATION_MONTH_COUNTER_SIZE);
}

/**
 * Book `units` of `cargo` onto the running month. Called from the tick's own
 * paths (loading, delivering, the daily sweeps): one indexed add, nothing
 * allocated, nothing read back.
 */
export function recordStationCargo(
  station: Station,
  field: StationHistoryField,
  cargo: Cargo,
  units: number,
): void {
  station.monthCounters[cargo * STATION_HISTORY_FIELD_COUNT + field]! += units;
}

/**
 * Ring slot index of (monthAgo = 0 for the NEWEST completed month) - a read
 * helper for the marker assembly and the tests, not for the simulation. Only
 * the cursor is needed, so only the cursor is asked for.
 */
export function historySlot(
  station: { readonly historyCursor: number },
  monthsAgo: number,
  cargo: number,
  field: StationHistoryField,
): number {
  const month =
    (station.historyCursor - 1 - monthsAgo + 2 * STATION_HISTORY_MONTHS) % STATION_HISTORY_MONTHS;
  return (month * CARGO_COUNT + cargo) * STATION_HISTORY_FIELD_COUNT + field;
}

/**
 * Close the month that has just ended on every station: round the running
 * counters into the ring slot at the cursor, advance it, zero the
 * accumulators. Runs on the monthly hook of World.step and nowhere else.
 */
export function rollStationHistories(world: World): void {
  for (const station of world.stations) {
    const base = station.historyCursor * STATION_MONTH_COUNTER_SIZE;
    for (let i = 0; i < STATION_MONTH_COUNTER_SIZE; i++) {
      station.history[base + i] = Math.round(station.monthCounters[i]!);
      station.monthCounters[i] = 0;
    }
    station.historyCursor = (station.historyCursor + 1) % STATION_HISTORY_MONTHS;
  }
}
