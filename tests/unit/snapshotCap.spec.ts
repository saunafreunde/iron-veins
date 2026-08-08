import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotVehicle,
} from '../../src/shared/snapshot';
import { Cargo } from '../../src/sim/cargo/types';
import { MAX_VEHICLES } from '../../src/sim/constants';
import { writeVehicleBlock } from '../../src/sim/vehicles/snapshot';
import { VehicleStore } from '../../src/sim/vehicles/VehicleStore';

/**
 * E-18: what happens to a fleet larger than the snapshot's vehicle block.
 *
 * The question was open since M10 and SPEC2 gave it a deadline of M15. The
 * answer is the cap raise (D-187), and this file is both halves of it: the
 * measurement of what the old cap DID - the block is filled in ascending id
 * and the rest of the fleet is simply not there - and the guarantee that the
 * cap can no longer be reached by any fleet this simulation can hold.
 *
 * The block writer lives in `src/sim/vehicles/snapshot.ts` rather than inside
 * `SimWorker` precisely so this test can reach it: the truncation used to be a
 * loop bound in a file no test can import (it reads worker globals).
 */

const SIZE = 64;
const BUS = 200;

/** A store with `count` alive, drawable vehicles on distinct tiles. */
function fleetOf(count: number): VehicleStore {
  const store = new VehicleStore(MAX_VEHICLES);
  for (let i = 0; i < count; i++) {
    const id = store.create(BUS, 0, i % (SIZE * SIZE), 0, Cargo.Passengers);
    expect(id).toBe(i);
  }
  return store;
}

/** Vehicle ids present in the written block, in the order they were written. */
function idsIn(block: Int32Array, written: number): number[] {
  const ids: number[] = [];
  for (let row = 0; row < written; row++) {
    ids.push(block[row * SNAPSHOT_VEHICLE_STRIDE + SnapshotVehicle.VehicleId]!);
  }
  return ids;
}

describe('the snapshot vehicle cap (E-18)', () => {
  it('is the store capacity, so no living fleet can outgrow the block', () => {
    // The coupling the shared channel cannot express as an import: it must not
    // depend on `src/sim`, so the equality is asserted here instead. A store
    // that grows past the block would silently reinstate the 37.5 % problem
    // this decision exists to end.
    expect(SNAPSHOT_MAX_VEHICLES).toBe(MAX_VEHICLES);
  });

  it('writes every living vehicle of a full store', () => {
    const store = fleetOf(MAX_VEHICLES);
    const block = new Int32Array(SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE);

    const written = writeVehicleBlock(store, SIZE, block);

    expect(written).toBe(MAX_VEHICLES);
    const ids = idsIn(block, written);
    expect(ids[0]).toBe(0);
    expect(ids[ids.length - 1]).toBe(MAX_VEHICLES - 1);
    expect(new Set(ids).size).toBe(MAX_VEHICLES);
  });

  it('compacts over the dead, so a row index is never a vehicle id', () => {
    const store = fleetOf(6);
    store.destroy(2);
    store.destroy(3);
    const block = new Int32Array(SNAPSHOT_MAX_VEHICLES * SNAPSHOT_VEHICLE_STRIDE);

    const written = writeVehicleBlock(store, SIZE, block);

    expect(written).toBe(4);
    expect(idsIn(block, written)).toEqual([0, 1, 4, 5]);
  });

  it('measures what the old cap did: the block fills by ascending id and stops', () => {
    // The old behaviour, reproduced against a block sized as it was before
    // M15 rather than described in prose. 1,500 of 4,000 is the 37.5 % E-18
    // names, and WHICH vehicles were drawn was decided by nothing more
    // meaningful than the order the store hands out slots: a player's newest
    // trains vanish, and no message anywhere says so.
    const oldCap = 1_500;
    const store = fleetOf(MAX_VEHICLES);
    const block = new Int32Array(oldCap * SNAPSHOT_VEHICLE_STRIDE);

    let written = 0;
    for (let id = 0; id < store.count && written < oldCap; id++) {
      if (store.alive[id] !== 1) continue;
      block[written * SNAPSHOT_VEHICLE_STRIDE + SnapshotVehicle.VehicleId] = id;
      written++;
    }

    expect(written).toBe(oldCap);
    expect(written / MAX_VEHICLES).toBeCloseTo(0.375, 6);
    // The vehicles that fell off are a contiguous tail of the id space - the
    // reason a priority writer was even a candidate, and the reason it was
    // rejected: it would have made the missing set depend on the camera, and
    // a row leaving and re-entering the block breaks the E-05 pairing that
    // makes a vehicle glide instead of jump (D-162).
    expect(idsIn(block, written)).toEqual(
      Array.from({ length: oldCap }, (_unused, index) => index),
    );
  });
});
