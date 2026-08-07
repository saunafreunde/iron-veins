import { SNAPSHOT_RESERVED_STRIDE, SnapshotReserved } from '../shared/snapshot';
import { isOneWay, signalDirection, signalKind } from '../sim/map/signals';
import type { TileMap } from '../sim/map/TileMap';
import { hasEdge, TRACK_DIR_COUNT, TRACK_DX, TRACK_DY, type TrackDir } from '../sim/map/track';
import type { BlockIndex } from '../sim/signals/blocks';

/**
 * Signal aspects from sim truth, without F3 (SPEC2 M13: "F3-Wissen wird
 * Weltkunst"). The reserved-tile block already travels the snapshot for the
 * section-9.3 overlay, and the render side already rebuilds the same
 * BlockIndex the simulation segments with (D-125) - so the aspect is a pure
 * derivation over exactly the two inputs the F3 overlay draws, and the world
 * art can never disagree with the debug truth. That agreement is a test
 * (tests/unit/signalAspects.spec.ts), not a hope.
 *
 * The reading: a signal admits a train into the section at its own tile, so
 * it shows RED while that admission is spoken for - when its own tile (a
 * block of its own, blocks.ts) is claimed, or when the block behind any
 * entry it guards holds a claim. A two-way signal guards the entry on both
 * of its plain-line sides; a one-way signal guards only the side it is
 * passable towards - a claim behind its back changes nothing it promises.
 * Everything else is GREEN: the honest render-side read of "may the next
 * train ask to pass here", derived per frame from the same claims the
 * overlay fills coloured diamonds with.
 *
 * Everything here is a pure function of the map layers, the shared
 * BlockIndex and the published reserved block - no Pixi, no state - the
 * water.ts/emissive.ts pattern, so the policy is headless-tested while the
 * sprite work stays in MapView.
 */

export const SignalAspect = {
  Green: 0,
  Red: 1,
} as const;
export type SignalAspect = (typeof SignalAspect)[keyof typeof SignalAspect];

export const SIGNAL_ASPECT_COUNT = 2;

/**
 * Lamp-glow tint per aspect, indexed by {@link SignalAspect}: bluish green
 * and vermilion from the same colour-blind safe palette the company colours
 * and the F3 block colours use (section 17.4). The colour is deliberately
 * REDUNDANT: the lit lamp also sits at a different height on the post (red
 * above, green below, the real-signal convention), so the aspect survives
 * any colour vision. [0xRRGGBB]
 */
export const SIGNAL_ASPECT_TINTS: readonly number[] = [0x009e73, 0xd55e00];

/**
 * Rewrite `out` to the set of block ids that contain at least one claimed
 * tile, from the published reserved-tile block - the SAME data the F3
 * overlay fills its occupancy diamonds from, bucketed by the SAME
 * BlockIndex. O(reservedCount); the caller reuses one Set and runs this on
 * the publish edge (claims move with ticks, never between them).
 */
export function collectClaimedBlocks(
  blocks: BlockIndex,
  reserved: Int32Array,
  count: number,
  out: Set<number>,
): void {
  out.clear();
  for (let i = 0; i < count; i++) {
    const tile = reserved[i * SNAPSHOT_RESERVED_STRIDE + SnapshotReserved.Tile]!;
    const block = blocks.blockAt(tile);
    if (block >= 0) out.add(block);
  }
}

/**
 * Aspect of the signal standing on `tile`: RED when the signal's own tile or
 * the block behind a guarded entry is claimed, GREEN otherwise. The caller
 * guarantees a signal stands here; a stray call on a signal-free tile just
 * reads the neighbouring blocks and stays honest.
 */
export function signalAspect(
  map: TileMap,
  blocks: BlockIndex,
  claimed: ReadonlySet<number>,
  tile: number,
): SignalAspect {
  // The signal tile is a block of its own (blocks.ts): a train that claimed
  // passage THROUGH the signal holds this tile, and the lamp must already
  // show red while the train is still approaching it.
  const own = blocks.blockAt(tile);
  if (own >= 0 && claimed.has(own)) return SignalAspect.Red;

  const packed = map.signal[tile]!;
  const size = map.size;
  const x = tile % size;
  const y = (tile / size) | 0;

  if (isOneWay(signalKind(packed))) {
    // A one-way signal guards exactly one entry: the section it is passable
    // towards. A claim in the block behind its back is somebody leaving,
    // which this signal never promised anything about.
    const direction = signalDirection(packed);
    return guardedEntryClaimed(map, blocks, claimed, tile, x, y, direction)
      ? SignalAspect.Red
      : SignalAspect.Green;
  }

  // A two-way signal guards the entry on every connected side (plain line
  // has exactly two, D-055; a dead end has one).
  for (let direction = 0; direction < TRACK_DIR_COUNT; direction++) {
    if (guardedEntryClaimed(map, blocks, claimed, tile, x, y, direction as TrackDir)) {
      return SignalAspect.Red;
    }
  }
  return SignalAspect.Green;
}

/** Is the block behind the entry in `direction` claimed? False off-track. */
function guardedEntryClaimed(
  map: TileMap,
  blocks: BlockIndex,
  claimed: ReadonlySet<number>,
  tile: number,
  x: number,
  y: number,
  direction: TrackDir,
): boolean {
  if (!hasEdge(map.trackBits, map.size, tile, direction)) return false;
  const neighbour = (y + TRACK_DY[direction]!) * map.size + (x + TRACK_DX[direction]!);
  const block = blocks.blockAt(neighbour);
  return block >= 0 && claimed.has(block);
}
