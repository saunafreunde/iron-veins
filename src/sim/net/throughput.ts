import { MAX_METERED_TILES, THROUGHPUT_FULL_SCALE_PASSES } from '../constants';

/**
 * The per-block throughput counters of SPEC2 M15: how much traffic actually
 * went through a piece of track, so the player can SEE where the network is
 * working hard before deciding where to double it.
 *
 * WHY THIS ONE IS DERIVED AND THE CONGESTION LAYER IS NOT. Both count
 * vehicles over time and only one of them is save state, which looks
 * inconsistent until you ask who reads it. The road congestion layer of
 * D-185 is read by the road A*, so it is a historical INPUT TO A SIMULATION
 * DECISION and Z4 makes it saved and hashed. Nothing in `src/sim` reads this
 * one - it exists for a picture - so it stays derived under the same law, on
 * the exception Z4 spells out for purely reading overlays (the
 * ReservationTable pattern, D-054). `tests/unit/throughput.spec.ts` walks
 * every simulation file and fails the day that stops being true; the day it
 * does, this becomes a saved layer, not an argument.
 *
 * WHY IT IS KEYED BY TILE THOUGH THE COUNTER IS "PER BLOCK". Block ids are
 * renumbered every time `BlockIndex` rebuilds, which is every time a player
 * lays a single piece of track - a counter keyed by block id would silently
 * retarget itself (D-054's argument, verbatim). A tile index survives that.
 * And the two readings agree where it matters: a train traversing a block
 * enters every tile of its own path through it exactly once, so on plain
 * line the per-tile count IS the block's throughput, and at a junction block
 * the busiest tile is the throat - which is the more useful of the two
 * numbers anyway.
 *
 * WHY IT IS CLEARED MONTHLY. SPEC2 M15 names D-091's energy meter as the
 * pattern: a counter that is emptied by the calendar rather than decayed by
 * a window. The window form would be a second congestion layer - and a
 * DECAYING window really is unreconstructible history, so a derived one
 * would read differently after a load than before a save. A monthly counter
 * is honest about being a monthly counter: it starts the month empty, and
 * after loading a save it starts empty too, which is the price the flow
 * volumes of D-176 pay for the same reason.
 */
export class ThroughputMeter {
  /** Tiles whose count is above zero. Derived from the layer, never saved. */
  private readonly tiles = new Int32Array(MAX_METERED_TILES);
  private listed = 0;

  /** How many tiles currently carry a count. */
  get count(): number {
    return this.listed;
  }

  /**
   * Record that a train has just entered `tile`.
   *
   * O(1) and allocation free (law #7): one clamped add, and a push only on
   * the transition out of zero - the invariant that keeps the list free of
   * duplicates without a second per-tile array, exactly as `RoadCongestion`
   * keeps it. The count saturates at 255, which is twenty times the full
   * scale of the heat map: past it the reading is "as busy as it gets", and
   * that is all a heat map can say anyway.
   */
  note(layer: Uint8Array, tile: number): void {
    const before = layer[tile]!;
    if (before === 0) {
      // Refuse rather than record a tile the monthly clear could never reach.
      if (this.listed >= MAX_METERED_TILES) return;
      this.tiles[this.listed++] = tile;
    } else if (before === 255) {
      return;
    }
    layer[tile] = before + 1;
  }

  /**
   * Empty the meter for a new month. Returns how many tiles were cleared,
   * which is what the laziness test measures: the work is the length of the
   * list, never the size of the map.
   */
  clearMonth(layer: Uint8Array): number {
    const cleared = this.listed;
    for (let index = 0; index < cleared; index++) layer[this.tiles[index]!] = 0;
    this.listed = 0;
    return cleared;
  }
}

/**
 * What the heat map draws for a tile carrying `passes` train passes this
 * month: 0 for untouched, 1 for fully used, clamped.
 *
 * The one definition of "utilisation" in the game, so the overlay's colours
 * and any figure ever printed beside them cannot drift apart. See
 * {@link THROUGHPUT_FULL_SCALE_PASSES} for where the full scale comes from.
 */
export function utilisationOf(passes: number): number {
  if (passes <= 0) return 0;
  const fraction = passes / THROUGHPUT_FULL_SCALE_PASSES;
  return fraction > 1 ? 1 : fraction;
}
