import type { TileMap } from '../map/TileMap';
import { signalKind, SignalKind } from '../map/signals';
import { hasEdge, TRACK_DIR_COUNT, TRACK_DX, TRACK_DY, type TrackDir } from '../map/track';

/**
 * Block segmentation (section 9.2).
 *
 * A block is a maximal set of track tiles connected to each other without
 * passing through a signal. **A signal tile is a block of its own.** That
 * convention is what makes the partition symmetric: a two-way signal separates
 * its two neighbours into different blocks without either of them having a
 * better claim to the signal's own tile.
 *
 * The index is DERIVED - a pure function of the track bits and the signal
 * layer - so it is never serialised and never hashed. It is rebuilt when the
 * map revision moves, which is a player action, never a tick that only moves
 * vehicles. Anything that has to survive a rebuild is therefore keyed by TILE
 * and not by block id (DECISIONS.md D-054): a rebuild renumbers.
 *
 * The flood fill is iterative with an explicit queue (architecture law #8). A
 * connected rail network reaches a hundred thousand tiles and recursion would
 * overflow the stack long before that.
 */
export class BlockIndex {
  /** Block id per map tile, -1 where there is no track. */
  private readonly blockOf: Int32Array;
  /** Reusable BFS queue, sized to the map so it never grows during a fill. */
  private readonly queue: Int32Array;
  private builtRevision = -1;
  private blocks = 0;

  constructor(tileCount: number) {
    this.blockOf = new Int32Array(tileCount).fill(-1);
    this.queue = new Int32Array(tileCount);
  }

  /** Block containing a tile, or -1 when the tile carries no track. */
  blockAt(tile: number): number {
    return this.blockOf[tile]!;
  }

  get blockCount(): number {
    return this.blocks;
  }

  /** Rebuild if the map has changed since the last time. Cheap when it has not. */
  refresh(map: TileMap): void {
    if (this.builtRevision === map.revision) return;
    this.builtRevision = map.revision;
    this.rebuild(map);
  }

  private rebuild(map: TileMap): void {
    const blockOf = this.blockOf;
    const queue = this.queue;
    const trackBits = map.trackBits;
    const size = map.size;
    blockOf.fill(-1);

    let next = 0;

    // Ascending tile order, so the numbering is a pure function of the map and
    // two runs of the same world always agree.
    for (let seed = 0; seed < trackBits.length; seed++) {
      if (trackBits[seed] === 0 || blockOf[seed] !== -1) continue;

      const id = next++;
      const seedIsSignal = signalKind(map.signal[seed]!) !== SignalKind.None;
      blockOf[seed] = id;

      // A signal tile is a block on its own and never spreads.
      if (seedIsSignal) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = seed;

      while (head < tail) {
        const tile = queue[head++]!;
        const x = tile % size;
        const y = (tile / size) | 0;

        for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
          if (!hasEdge(trackBits, size, tile, direction as TrackDir)) continue;
          const neighbour = (y + TRACK_DY[direction]!) * size + (x + TRACK_DX[direction]!);
          if (blockOf[neighbour] !== -1) continue;
          // The fill stops AT a signal: that tile is its own block.
          if (signalKind(map.signal[neighbour]!) !== SignalKind.None) continue;

          blockOf[neighbour] = id;
          queue[tail++] = neighbour;
        }
      }
    }
    this.blocks = next;
  }

  /**
   * Every tile of the block a train would enter, written into `out`.
   * Returns how many were written, or -1 when they would not fit.
   *
   * This is what a BLOCK signal claims, as opposed to a path signal which
   * claims only the tiles its own route uses.
   */
  collectBlock(map: TileMap, tile: number, out: Int32Array): number {
    const id = this.blockOf[tile]!;
    if (id < 0) return 0;

    const trackBits = map.trackBits;
    const size = map.size;
    let written = 0;
    let head = 0;
    let tail = 0;
    const queue = this.queue;
    const seen = out;

    queue[tail++] = tile;
    if (out.length < 1) return -1;
    seen[written++] = tile;

    while (head < tail) {
      const current = queue[head++]!;
      const x = current % size;
      const y = (current / size) | 0;

      for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
        if (!hasEdge(trackBits, size, current, direction as TrackDir)) continue;
        const neighbour = (y + TRACK_DY[direction]!) * size + (x + TRACK_DX[direction]!);
        if (this.blockOf[neighbour] !== id) continue;

        let already = false;
        for (let i = 0; i < written; i++) {
          if (seen[i] === neighbour) {
            already = true;
            break;
          }
        }
        if (already) continue;
        if (written >= out.length) return -1;

        seen[written++] = neighbour;
        queue[tail++] = neighbour;
      }
    }
    return written;
  }
}
