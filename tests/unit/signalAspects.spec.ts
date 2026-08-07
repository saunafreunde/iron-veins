import { describe, expect, it } from 'vitest';
import { SNAPSHOT_RESERVED_STRIDE, SnapshotReserved } from '../../src/shared/snapshot';
import { packSignal, SignalKind } from '../../src/sim/map/signals';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { trackBit, TrackDir, TRACK_DX, TRACK_DY } from '../../src/sim/map/track';
import { BlockIndex } from '../../src/sim/signals/blocks';
import {
  collectClaimedBlocks,
  SIGNAL_ASPECT_TINTS,
  SignalAspect,
  signalAspect,
} from '../../src/render/signalAspects';

/**
 * Signal aspects from sim truth (SPEC2 M13: "F3-Wissen wird Weltkunst").
 * The aspect is a pure derivation over the reserved-tile block and the
 * render-side BlockIndex - the SAME two inputs the F3 overlay draws - so
 * the world art and the debug overlay cannot disagree. The consistency
 * suite at the bottom holds exactly that sentence.
 */

const SIZE = 64;
const LINE_Y = 10;

/** A two-way east-west line from x0 to x1 on LINE_Y, both half-bits set. */
function lineMap(x0: number, x1: number): TileMap {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(4);
  map.terrain.fill(Terrain.Grass);
  for (let x = x0; x <= x1; x++) {
    const index = map.tileIndex(x, LINE_Y);
    let bits = 0;
    if (x > x0) bits |= trackBit(TrackDir.West);
    if (x < x1) bits |= trackBit(TrackDir.East);
    map.trackBits[index] = bits;
  }
  return map;
}

function tileAt(map: TileMap, x: number): number {
  return map.tileIndex(x, LINE_Y);
}

/** The reserved block exactly as the worker publishes it for F3. */
function reservedBlock(tiles: readonly number[]): { data: Int32Array; count: number } {
  const data = new Int32Array(Math.max(1, tiles.length) * SNAPSHOT_RESERVED_STRIDE);
  for (let i = 0; i < tiles.length; i++) {
    data[i * SNAPSHOT_RESERVED_STRIDE + SnapshotReserved.Tile] = tiles[i]!;
    data[i * SNAPSHOT_RESERVED_STRIDE + SnapshotReserved.VehicleId] = 7;
  }
  return { data, count: tiles.length };
}

/** Refresh index + claim set from a claim list, as MapView does per tick. */
function claimSet(map: TileMap, blocks: BlockIndex, tiles: readonly number[]): Set<number> {
  blocks.refresh(map);
  const reserved = reservedBlock(tiles);
  const out = new Set<number>();
  collectClaimedBlocks(blocks, reserved.data, reserved.count, out);
  return out;
}

describe('signal aspects from the claimed-block set', () => {
  /** Line 4..30 with two-way block signals at 10 and 20. */
  function twoSignalFixture(): { map: TileMap; blocks: BlockIndex } {
    const map = lineMap(4, 30);
    map.signal[tileAt(map, 10)] = packSignal(SignalKind.Block, TrackDir.East);
    map.signal[tileAt(map, 20)] = packSignal(SignalKind.Block, TrackDir.East);
    return { map, blocks: new BlockIndex(map.tileCount) };
  }

  it('an unclaimed railway is green everywhere', () => {
    const { map, blocks } = twoSignalFixture();
    const claimed = claimSet(map, blocks, []);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Green);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 20))).toBe(SignalAspect.Green);
  });

  it('a claim between two signals turns both red, and only those', () => {
    const { map, blocks } = twoSignalFixture();
    const claimed = claimSet(map, blocks, [tileAt(map, 15), tileAt(map, 16), tileAt(map, 17)]);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Red);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 20))).toBe(SignalAspect.Red);
  });

  it('a claim in a far section leaves the far signal green', () => {
    const { map, blocks } = twoSignalFixture();
    // Block A (west of signal 10) is claimed; the section between the
    // signals and everything east of 20 is free.
    const claimed = claimSet(map, blocks, [tileAt(map, 5), tileAt(map, 6)]);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Red);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 20))).toBe(SignalAspect.Green);
  });

  it("a claim on the signal's OWN tile is red - passage has been granted", () => {
    const { map, blocks } = twoSignalFixture();
    const claimed = claimSet(map, blocks, [tileAt(map, 10)]);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Red);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 20))).toBe(SignalAspect.Green);
  });

  it('a one-way signal ignores a claim behind its back', () => {
    const map = lineMap(4, 30);
    // Passable east: it guards the section east of itself, nothing else.
    map.signal[tileAt(map, 10)] = packSignal(SignalKind.BlockOneWay, TrackDir.East);
    const blocks = new BlockIndex(map.tileCount);

    const behind = claimSet(map, blocks, [tileAt(map, 6)]);
    expect(signalAspect(map, blocks, behind, tileAt(map, 10))).toBe(SignalAspect.Green);

    const ahead = claimSet(map, blocks, [tileAt(map, 14)]);
    expect(signalAspect(map, blocks, ahead, tileAt(map, 10))).toBe(SignalAspect.Red);
  });

  it('a path-entry signal guards like the one-way block signal', () => {
    const map = lineMap(4, 30);
    map.signal[tileAt(map, 10)] = packSignal(SignalKind.PathEntry, TrackDir.West);
    const blocks = new BlockIndex(map.tileCount);

    // Passable west: a claim east of it is behind its back.
    const behind = claimSet(map, blocks, [tileAt(map, 14)]);
    expect(signalAspect(map, blocks, behind, tileAt(map, 10))).toBe(SignalAspect.Green);

    const ahead = claimSet(map, blocks, [tileAt(map, 6)]);
    expect(signalAspect(map, blocks, ahead, tileAt(map, 10))).toBe(SignalAspect.Red);
  });

  it('a one-way signal whose direction leaves the track guards nothing', () => {
    const map = lineMap(4, 30);
    // North has no edge on an east-west line; the guarded entry is void.
    map.signal[tileAt(map, 10)] = packSignal(SignalKind.BlockOneWay, TrackDir.North);
    const blocks = new BlockIndex(map.tileCount);
    const claimed = claimSet(map, blocks, [tileAt(map, 14), tileAt(map, 6)]);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Green);
  });

  it('a rebuilt (renumbered) BlockIndex changes nothing when the set is rebuilt with it', () => {
    const { map, blocks } = twoSignalFixture();
    const claimedTiles = [tileAt(map, 17)];
    let claimed = claimSet(map, blocks, claimedTiles);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Red);

    // A new signal at 15 splits the section; the claim at 17 now lies in a
    // block that no longer touches the signal at 10. MapView re-collects
    // the set on every revision for exactly this renumbering.
    map.signal[tileAt(map, 15)] = packSignal(SignalKind.Block, TrackDir.East);
    map.revision++;
    claimed = claimSet(map, blocks, claimedTiles);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 10))).toBe(SignalAspect.Green);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 15))).toBe(SignalAspect.Red);
    expect(signalAspect(map, blocks, claimed, tileAt(map, 20))).toBe(SignalAspect.Red);
  });
});

describe('the world art agrees with the F3 overlay (one BlockIndex feeds both)', () => {
  /**
   * The F3 overlay fills a diamond per RESERVED TILE; the aspect reads the
   * SAME reserved block bucketed by the SAME BlockIndex. The independent
   * expectation here walks the raw tiles instead of the set: a signal must
   * be red exactly when some F3-drawn tile lies in its own block or behind
   * one of its guarded entries. If the derivation and the overlay ever read
   * different truths, these two computations part ways.
   */
  function expectAgreement(
    map: TileMap,
    blocks: BlockIndex,
    claimedTiles: readonly number[],
  ): void {
    blocks.refresh(map);
    const claimed = claimSet(map, blocks, claimedTiles);

    // collectClaimedBlocks marks exactly the blocks of the drawn tiles.
    for (const tile of claimedTiles) {
      expect(claimed.has(blocks.blockAt(tile))).toBe(true);
    }

    for (let tile = 0; tile < map.tileCount; tile++) {
      if (map.signal[tile] === 0) continue;
      const size = map.size;
      const x = tile % size;
      const y = (tile / size) | 0;

      // The guarded blocks, derived tile-by-tile like the overlay draws.
      const guarded = new Set<number>([blocks.blockAt(tile)]);
      for (let direction = 0; direction < 8; direction++) {
        if ((map.trackBits[tile]! & trackBit(direction as TrackDir)) === 0) continue;
        const nx = x + TRACK_DX[direction]!;
        const ny = y + TRACK_DY[direction]!;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        guarded.add(blocks.blockAt(ny * size + nx));
      }

      const expectRed = claimedTiles.some((claimedTile) =>
        guarded.has(blocks.blockAt(claimedTile)),
      );
      expect(signalAspect(map, blocks, claimed, tile), `signal at (${x}, ${y})`).toBe(
        expectRed ? SignalAspect.Red : SignalAspect.Green,
      );
    }
  }

  it('holds over empty, partial and full claim tables (two-way signals)', () => {
    const map = lineMap(4, 30);
    map.signal[tileAt(map, 10)] = packSignal(SignalKind.Block, TrackDir.East);
    map.signal[tileAt(map, 16)] = packSignal(SignalKind.Path, TrackDir.East);
    map.signal[tileAt(map, 24)] = packSignal(SignalKind.Block, TrackDir.East);
    const blocks = new BlockIndex(map.tileCount);

    expectAgreement(map, blocks, []);
    expectAgreement(map, blocks, [tileAt(map, 12)]);
    expectAgreement(map, blocks, [tileAt(map, 5), tileAt(map, 28)]);
    const everything: number[] = [];
    for (let x = 4; x <= 30; x++) everything.push(tileAt(map, x));
    expectAgreement(map, blocks, everything);
  });

  it('holds when the line ends at a dead end', () => {
    const map = lineMap(4, 12);
    map.signal[tileAt(map, 8)] = packSignal(SignalKind.Block, TrackDir.East);
    const blocks = new BlockIndex(map.tileCount);
    expectAgreement(map, blocks, [tileAt(map, 12)]);
    expectAgreement(map, blocks, [tileAt(map, 4)]);
  });
});

describe('the aspect palette', () => {
  it('is the colour-blind safe pair of the shared palette, green then red', () => {
    // Bluish green and vermilion (section 17.4) - and the colour is
    // redundant anyway: the lit lamp also sits at a different height.
    expect(SIGNAL_ASPECT_TINTS[SignalAspect.Green]).toBe(0x009e73);
    expect(SIGNAL_ASPECT_TINTS[SignalAspect.Red]).toBe(0xd55e00);
  });
});
