import {
  SNAPSHOT_MAX_VEHICLES,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotVehicle,
} from '../../shared/snapshot';
import { TILE_DIAGONAL_M, TILE_SIZE_M } from '../constants';
import type { VehicleStore } from './VehicleStore';

/**
 * The vehicle block of the render snapshot, written from the store.
 *
 * It lives beside its subject rather than in `SimWorker`, which is the shape
 * `flow.ts` already gave the flow block: SimWorker schedules and publishes,
 * the block writers belong to the state they read. SPEC2 M15 is what forced
 * the move - E-18 asked what happens to a fleet larger than the block, and
 * "what happens" was a loop bound nothing outside the worker could see and no
 * test could reach (`tests/unit/snapshotCap.spec.ts` is that test now).
 */

/**
 * Copy the drawable state of every vehicle into the snapshot block, returning
 * how many rows were written.
 *
 * Only what changes per tick travels: which tile, which tile next, how far
 * between them, and what the vehicle is doing. Everything static about it -
 * its type, its name, its orders - the renderer already knows or does not
 * need.
 *
 * The block holds `SNAPSHOT_MAX_VEHICLES` rows, which since M15 is the whole
 * capacity of the store: the truncation below can no longer be reached by any
 * fleet this simulation can hold, and it stays as the guard that makes that
 * true rather than as a silent policy (E-18, D-187).
 */
export function writeVehicleBlock(
  vehicles: VehicleStore,
  mapSize: number,
  block: Int32Array,
): number {
  let written = 0;

  for (let id = 0; id < vehicles.count && written < SNAPSHOT_MAX_VEHICLES; id++) {
    if (vehicles.alive[id] !== 1) continue;

    const tile = vehicles.tileIndex[id]!;
    const index = vehicles.pathIndex[id]!;
    const hasNext = index + 1 < vehicles.pathLength[id]!;
    const next = hasNext ? vehicles.paths[id]![index + 1]! : tile;

    // Progress is a fraction of THIS step, which on a diagonal piece of track
    // is 70.7 m rather than 50 m - dividing by the tile size would make every
    // train jump forward as it entered a diagonal.
    const diagonal =
      hasNext &&
      next % mapSize !== tile % mapSize &&
      ((next / mapSize) | 0) !== ((tile / mapSize) | 0);
    const stepM = diagonal ? TILE_DIAGONAL_M : TILE_SIZE_M;

    const base = written * SNAPSHOT_VEHICLE_STRIDE;
    block[base + SnapshotVehicle.Tile] = tile;
    block[base + SnapshotVehicle.NextTile] = next;
    block[base + SnapshotVehicle.ProgressMilli] = Math.round(
      (vehicles.progressM[id]! / stepM) * 1000,
    );
    block[base + SnapshotVehicle.State] = vehicles.state[id]!;
    block[base + SnapshotVehicle.Kind] = vehicles.kind[id]!;
    // The block is compacted, so the row index says nothing about which
    // vehicle this is. The id is what lets the map answer a click and what
    // keeps a sound attached to the same vehicle between frames.
    block[base + SnapshotVehicle.VehicleId] = id;
    block[base + SnapshotVehicle.Owner] = vehicles.ownerId[id]!;
    block[base + SnapshotVehicle.LineId] = vehicles.lineId[id]!;
    written++;
  }
  return written;
}
