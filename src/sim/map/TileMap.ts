import { MAX_HEIGHT, SEA_LEVEL, TILE_PUBLIC } from '../constants';
import { SlopeBit, Terrain } from './terrain';

/**
 * All per-tile data of the world, kept as parallel typed arrays.
 *
 * Architecture law #7: never a million JavaScript objects. At 1024 x 1024 every
 * byte-per-tile layer costs exactly 1 MB, which is why layers are added
 * deliberately and derived data (landmass ids, ocean mask) is recomputed after
 * loading instead of being stored.
 */
export class TileMap {
  /** Edge length in tiles. */
  readonly size: number;

  /** Corner heights on a (size+1)^2 grid, 0..15. */
  readonly cornerHeight: Uint8Array;

  /** Terrain type per tile, see {@link Terrain}. */
  readonly terrain: Uint8Array;

  /** Road direction bits per tile. */
  readonly roadBits: Uint8Array;

  /** Track direction bits per tile, one per {@link TrackDir}. */
  readonly trackBits: Uint8Array;

  /** Rail type per tile, see RailType. 0 where there is no track. */
  readonly railType: Uint8Array;

  /**
   * Signal on this tile, see {@link SignalKind}. A signal is a property of the
   * tile rather than of a direction: it faces both ways, which is what a
   * passing loop needs and what keeps the build tool a single click.
   */
  readonly signal: Uint8Array;

  /**
   * Bridge or tunnel on this tile, see {@link Structure}. Only the tiles
   * BETWEEN the two ends carry it; the ends themselves are ordinary track.
   */
  readonly structure: Uint8Array;

  /**
   * Height level the deck or the bore sits at, where {@link structure} is set.
   *
   * A bridge tile's ground can be at sea level while its deck is eight levels
   * up. Everything that asks how high the track is - the gradient window, the
   * longitudinal solver, the renderer - has to ask {@link railHeight}, never
   * `baseHeight`, or a bridge reads as a cliff.
   */
  readonly structureHeight: Uint8Array;

  /** Town that owns this tile, -1 for open country. */
  readonly townId: Int16Array;

  /** Industry that occupies this tile, -1 for none. */
  readonly industryId: Int16Array;

  /** Building zone on this tile: 0 none, 1 residential, 2 commercial, 3 industrial. */
  readonly buildingKind: Uint8Array;

  /** Building expansion stage, 0 when there is no building. */
  readonly buildingLevel: Uint8Array;

  /**
   * Which company built what stands on this tile, or TILE_PUBLIC.
   *
   * Needed twice over from M8 on: a company may not tear up a competitor's
   * line, and the town council of section 13.3 rates each company on the track
   * IT laid inside the town - both of which are questions about a tile that
   * only a per-tile owner can answer. Town roads stay public for ever, so a
   * company can extend them and nobody can demolish them.
   */
  readonly owner: Uint8Array;

  /**
   * Waypoint marker on this tile, see {@link WaypointKind} in waypoints.ts.
   *
   * A layer rather than an entity list: orders address a waypoint by TILE
   * index, exactly as depot orders address their shed, and every guard that
   * protects built things - terraforming, the demolish tools - already reads
   * the map layers (M11, section 12.1).
   */
  readonly waypoint: Uint8Array;

  /**
   * Road traffic that has passed over this tile recently, in the units of
   * `net/congestion.ts` - the congestion term of SPEC.md 8.4 (SPEC2 M15).
   *
   * SAVED and HASHED, never derived. The term is historical by definition
   * ("vehicles per tile in the last 200 ticks"), and a historical input to a
   * simulation decision is save state (SPEC2 Z4): a layer rebuilt empty on
   * load would price the same roads differently after loading than before
   * saving, which is different routes from the same state (D-129, E-02).
   *
   * The tiles that currently carry a value are tracked by `RoadCongestion`,
   * which is derived and rebuilt from this layer on load.
   */
  readonly congestion: Uint8Array;

  /**
   * Train passes over this tile in the game month now running - the per-block
   * throughput counter of SPEC2 M15, in the units of `net/throughput.ts`.
   *
   * DERIVED, and the exact opposite of the layer above it: it is never saved,
   * never hashed and no simulation decision may read it (`throughput.spec.ts`
   * walks src/sim and fails the day one does). That is what lets it be
   * derived at all - Z4 allows a historical quantity to stay derived only
   * while it is a purely reading overlay, the ReservationTable pattern of
   * D-054. It lives in the shared buffer beside `oceanMask` for the same
   * reason `congestion` does: the heat map reads it in place and the snapshot
   * pays nothing for it (D-186).
   */
  readonly throughput: Uint8Array;

  /**
   * Connected land component per tile, -1 for water. Derived - recomputed on
   * load rather than serialised.
   */
  readonly landmassId: Int32Array;

  /** 1 for water connected to the map border, 0 for inland lakes. Derived. */
  readonly oceanMask: Uint8Array;

  /**
   * All layers live in one SharedArrayBuffer so the renderer can read the map
   * directly instead of receiving a copy per change. The worker owns the write
   * side; the main thread only ever reads.
   */
  readonly buffer: SharedArrayBuffer;

  /**
   * Bumped whenever the ground changes. The renderer rebuilds its tile sprites
   * when this differs from what it last drew, which is far cheaper than
   * comparing megabytes of terrain.
   */
  revision = 0;

  /**
   * Bumped whenever the TRACK layers change - `trackBits` or `signal`.
   *
   * The rail pathfinder's dense index and the block index are the only two
   * things in the simulation that cache a whole-map derivation, and both of
   * them depend on those two layers and on nothing else. They used to key on
   * {@link revision}, which moves for every house, every kerbstone and every
   * tree - so ONE map edit cost a full 1024^2 scan twice on the very next tick,
   * whatever it had edited. Measured on the 1,500-vehicle fixture with one town
   * building a day: tick p99 **6.0 -> 8.3 ms** with the bump, back to **5.0**
   * with the bump alone removed and everything else left in (SPEC2 M20 bundle
   * 2, D-232). It has been the price of every road tile a player lays since M4;
   * nothing exercised it, because the acceptance fixture never edited the map
   * while it was being timed.
   *
   * {@link noteChange} moves both counters and is what every COMMAND calls. The
   * three passes the town runs for itself - the growth of D-231, and the trees
   * and streets of the 13.3 measures - move {@link revision} alone, and they
   * are allowed to because each of them refuses a tile carrying track before it
   * writes anything. `tests/unit/trackRevision.spec.ts` holds both halves: that
   * the town moves one counter and not the other, and that nothing outside
   * `commands/build.ts` writes either track layer.
   */
  trackRevision = 0;

  /**
   * Record a map change that MAY have touched the track layers.
   *
   * The safe direction by construction: over-invalidating the two indexes is
   * always correct and costs one rebuild, while under-invalidating them is a
   * stale route (law #3). Every command therefore calls this and nothing has to
   * work out what it touched.
   */
  noteChange(): void {
    this.revision++;
    this.trackRevision++;
  }

  constructor(size: number, buffer?: SharedArrayBuffer) {
    this.size = size;
    const tiles = size * size;
    const corners = (size + 1) * (size + 1);
    const fresh = buffer === undefined;

    this.buffer = buffer ?? new SharedArrayBuffer(TileMap.bufferBytes(size));

    // Wider elements come first so every view starts on its natural alignment.
    let offset = 0;
    this.landmassId = new Int32Array(this.buffer, offset, tiles);
    offset += tiles * 4;
    this.townId = new Int16Array(this.buffer, offset, tiles);
    offset += tiles * 2;
    this.industryId = new Int16Array(this.buffer, offset, tiles);
    offset += tiles * 2;
    this.cornerHeight = new Uint8Array(this.buffer, offset, corners);
    offset += corners;
    this.terrain = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.roadBits = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.trackBits = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.railType = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.signal = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.structure = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.structureHeight = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.buildingKind = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.buildingLevel = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.owner = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.waypoint = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    // In the shared buffer like every other tile layer, so the heat map of
    // M15 reads it in place and the snapshot needs not one byte for it.
    this.congestion = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    // Derived like the ocean mask below it, and in the buffer for the same
    // reason the congestion layer is: the M15 heat map reads it in place.
    this.throughput = new Uint8Array(this.buffer, offset, tiles);
    offset += tiles;
    this.oceanMask = new Uint8Array(this.buffer, offset, tiles);

    if (fresh) {
      // Terrain.Water is 0, so a zero-filled array would be an all-sea world
      // and every later step that skips water would skip everything. A fresh
      // map is flat grassland until the hydrology step floods it.
      this.terrain.fill(Terrain.Grass);
      this.townId.fill(-1);
      this.industryId.fill(-1);
      this.landmassId.fill(-1);
      this.owner.fill(TILE_PUBLIC);
    }
  }

  /** Byte size of the shared buffer for a map of this edge length. */
  static bufferBytes(size: number): number {
    const tiles = size * size;
    const corners = (size + 1) * (size + 1);
    // 4-byte landmass, two 2-byte id layers, the corner heights, and fourteen
    // single-byte layers: terrain, road, track, rail type, signal, structure,
    // structure height, building kind, building level, owner, waypoint,
    // congestion, throughput, ocean mask.
    return tiles * 8 + corners + tiles * 14;
  }

  /** Read-side view on a map the worker owns. */
  static fromBuffer(size: number, buffer: SharedArrayBuffer): TileMap {
    return new TileMap(size, buffer);
  }

  get tileCount(): number {
    return this.size * this.size;
  }

  /** Index into the tile layers. Caller guarantees the coordinates are valid. */
  tileIndex(x: number, y: number): number {
    return y * this.size + x;
  }

  /** Index into {@link cornerHeight}. Valid for 0..size inclusive. */
  cornerIndex(x: number, y: number): number {
    return y * (this.size + 1) + x;
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  /** Height of the tile's north corner. */
  heightAt(x: number, y: number): number {
    return this.cornerHeight[this.cornerIndex(x, y)]!;
  }

  /** Lowest of the four corners - the height the tile "stands" at. */
  baseHeight(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    return Math.min(Math.min(n, e), Math.min(w, s));
  }

  /** Highest of the four corners. */
  topHeight(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    return Math.max(Math.max(n, e), Math.max(w, s));
  }

  /**
   * Slope bits of a tile, relative to its base height. Relies on the invariant
   * that no corner is more than one level above the base.
   */
  slopeAt(x: number, y: number): number {
    const stride = this.size + 1;
    const i = y * stride + x;
    const n = this.cornerHeight[i]!;
    const e = this.cornerHeight[i + 1]!;
    const w = this.cornerHeight[i + stride]!;
    const s = this.cornerHeight[i + stride + 1]!;
    const base = Math.min(Math.min(n, e), Math.min(w, s));

    let slope = 0;
    if (n > base) slope |= SlopeBit.North;
    if (e > base) slope |= SlopeBit.East;
    if (s > base) slope |= SlopeBit.South;
    if (w > base) slope |= SlopeBit.West;
    return slope;
  }

  /**
   * Height the track on this tile runs at: the deck of a bridge, the roof of a
   * bore, or the ground where there is neither.
   */
  railHeight(x: number, y: number): number {
    const index = y * this.size + x;
    return this.structure[index] !== 0 ? this.structureHeight[index]! : this.baseHeight(x, y);
  }

  /** A tile is water when even its highest corner is at or below the sea. */
  isSubmerged(x: number, y: number): boolean {
    return this.topHeight(x, y) <= SEA_LEVEL;
  }

  isWater(x: number, y: number): boolean {
    return this.terrain[this.tileIndex(x, y)] === Terrain.Water;
  }

  isLand(x: number, y: number): boolean {
    return this.terrain[this.tileIndex(x, y)] !== Terrain.Water;
  }

  /**
   * Restore the invariant that neighbouring corners - including diagonal ones -
   * never differ by more than one level. Any two corners of a tile lie within
   * each other's eight-neighbourhood, so this also guarantees that every tile
   * has one of the 16 representable slopes.
   *
   * Returns the number of corners that had to be lowered. A caller that has to
   * follow the sweep - asking the shoreline question of the ground it moved -
   * passes `pulled` and gets the corner indices themselves, in the order they
   * were lowered; the same corner may appear more than once, because a later
   * pass may lower it again. Without the list the only honest follow-up is a
   * whole-map sweep, and a whole-map sweep relabels ground nobody touched.
   */
  enforceSlopeInvariant(pulled: number[] | null = null): number {
    const stride = this.size + 1;
    const heights = this.cornerHeight;
    let totalChanged = 0;
    let changed = true;

    // Each pass can only lower corners, and heights are bounded by MAX_HEIGHT,
    // so the loop terminates after at most MAX_HEIGHT rounds.
    while (changed) {
      changed = false;
      for (let y = 0; y <= this.size; y++) {
        for (let x = 0; x <= this.size; x++) {
          const i = y * stride + x;
          const h = heights[i]!;
          if (h === 0) continue;

          let lowest = MAX_HEIGHT;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny > this.size) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx > this.size || (dx === 0 && dy === 0)) continue;
              const nh = heights[ny * stride + nx]!;
              if (nh < lowest) lowest = nh;
            }
          }

          if (h > lowest + 1) {
            heights[i] = lowest + 1;
            totalChanged++;
            changed = true;
            if (pulled !== null) pulled.push(i);
          }
        }
      }
    }
    return totalChanged;
  }
}
