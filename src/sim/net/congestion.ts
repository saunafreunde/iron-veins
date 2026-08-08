import {
  MAX_CONGESTED_TILES,
  ROAD_CONGESTION_DECAY_DIVISOR,
  ROAD_CONGESTION_MIN_SPEED_FACTOR,
  ROAD_CONGESTION_SPEED_LOSS_PER_UNIT,
  ROAD_CONGESTION_UNITS_PER_ENTRY,
} from '../constants';

/**
 * The road congestion layer of SPEC.md 8.4 (SPEC2 M15, E-02).
 *
 * 8.4 prices a road step by "vehicles per tile over the last 200 ticks". That
 * is a HISTORICAL quantity, and Z4 makes every historical input to a
 * simulation decision saved state: a layer rebuilt empty on load would give
 * different A* costs after loading than before saving, which is different
 * routes from the same state - architecture law #3 broken in silence. So the
 * counts themselves live in a Uint8 tile layer of `TileMap`, saved and hashed
 * beside the terrain (D-129 recorded the shape of this fix; two of the five
 * expansion drafts wrote "derived" here and two judges vetoed it by name).
 *
 * THE UNITS. One tile ENTRY adds {@link ROAD_CONGESTION_UNITS_PER_ENTRY}, and
 * every {@link ROAD_CONGESTION_EPOCH_TICKS} the value loses
 * `ceil(value / ROAD_CONGESTION_DECAY_DIVISOR)`. That is an exponential window
 * whose time constant is 210 ticks, so a stored value divided by the units per
 * entry IS 8.4's "vehicles per tile in the last 200 ticks" - the specified
 * quantity, in a byte, with no second definition anywhere.
 *
 * WHY A DIRTY LIST AND NOT A MAP SCAN. Decaying every tile every epoch is a
 * million array writes fifty times a game second, for a layer on which a
 * thousand tiles are non-zero. The class therefore keeps the tiles that
 * currently carry congestion, and the sweep walks that list. The list is
 * DERIVED - it is exactly "the tiles whose value is above zero" - so it is
 * neither saved nor hashed and is rebuilt from the layer on load, the
 * treatment the reservation table and the land masses already get (D-054).
 *
 * The invariant that keeps the list free of duplicates without a second
 * per-tile array: a tile is pushed exactly when its value rises FROM zero, and
 * dropped exactly when the sweep finds it back at zero. Values only ever rise
 * by an entry and fall by a sweep, so "listed" and "value > 0" cannot come
 * apart.
 *
 * THE CAP IS A REFUSAL, not an eviction (the M13 particle-pool precedent). A
 * full list refuses the entry rather than recording a tile it can never decay
 * again - a phantom jam that would sit in the A* costs for the rest of the
 * game. See {@link MAX_CONGESTED_TILES} for why the cap is above what
 * MAX_VEHICLES can physically keep alive.
 */
export class RoadCongestion {
  /** Tiles whose congestion value is above zero. Derived, never saved. */
  private readonly tiles = new Int32Array(MAX_CONGESTED_TILES);
  private listed = 0;

  /** How many tiles currently carry congestion. */
  get count(): number {
    return this.listed;
  }

  /**
   * Record that a road vehicle has just entered `tile`.
   *
   * O(1) and allocation free (law #7): one clamped add, and a push only on the
   * transition out of zero.
   */
  note(layer: Uint8Array, tile: number): void {
    const before = layer[tile]!;
    if (before === 0) {
      // Refuse rather than record what the sweep would never reach again.
      if (this.listed >= MAX_CONGESTED_TILES) return;
      this.tiles[this.listed++] = tile;
    }
    const raised = before + ROAD_CONGESTION_UNITS_PER_ENTRY;
    layer[tile] = raised > 255 ? 255 : raised;
  }

  /**
   * One decay epoch. Returns how many tiles were visited, which is what the
   * epoch-laziness test measures: the work is the length of the dirty list,
   * never the size of the map.
   *
   * The compaction is stable and in place, so the list keeps ascending tile
   * order after a rebuild and insertion order during play - and neither can
   * influence a value, because the decay of one tile reads nothing but that
   * tile.
   */
  decay(layer: Uint8Array): number {
    const tiles = this.tiles;
    const visited = this.listed;
    let kept = 0;

    for (let index = 0; index < visited; index++) {
      const tile = tiles[index]!;
      const value = layer[tile]!;
      // Integer arithmetic only, and the rounded-up loss is what guarantees a
      // value reaches zero instead of asymptotically approaching it.
      const loss =
        ((value + ROAD_CONGESTION_DECAY_DIVISOR - 1) / ROAD_CONGESTION_DECAY_DIVISOR) | 0;
      const next = value - loss;
      layer[tile] = next > 0 ? next : 0;
      if (next > 0) tiles[kept++] = tile;
    }

    this.listed = kept;
    return visited;
  }

  /**
   * Rebuild the dirty list from a layer that came out of a save.
   *
   * A full scan, once, on load - beside `markOcean` and the reservation
   * rebuild, and for the same reason: the list is a pure function of the layer
   * and storing it would only give it a way to go stale.
   */
  rebuild(layer: Uint8Array): void {
    this.listed = 0;
    for (let tile = 0; tile < layer.length; tile++) {
      if (layer[tile] === 0) continue;
      if (this.listed >= MAX_CONGESTED_TILES) break;
      this.tiles[this.listed++] = tile;
    }
  }
}

/**
 * What a road vehicle standing on a tile of this congestion may still drive,
 * as a fraction of its own top speed - E-03's speed capping.
 *
 * The vehicle's OWN entry is subtracted first, which is what makes this a
 * LEADER rule rather than a self-inflicted tax: a lone lorry on an empty road
 * put one entry's worth of units on the tile a moment ago and must not be
 * slowed by its own trail. What is left is the traffic that went through ahead
 * of it, and that is what it queues behind.
 *
 * Deliberately NOT car-following (SPEC2 E-03 vetoes it): no neighbour search,
 * no per-vehicle following distance, no overtaking. The layer already holds
 * how many vehicles came through here, aggregated, so the leader information
 * costs one array read instead of O(vehicles x neighbours) in the hot path.
 */
export function roadSpeedFactor(congestion: number): number {
  const ahead = congestion - ROAD_CONGESTION_UNITS_PER_ENTRY;
  if (ahead <= 0) return 1;
  const factor = 1 - ahead * ROAD_CONGESTION_SPEED_LOSS_PER_UNIT;
  return factor > ROAD_CONGESTION_MIN_SPEED_FACTOR ? factor : ROAD_CONGESTION_MIN_SPEED_FACTOR;
}
