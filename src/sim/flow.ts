import { SNAPSHOT_FLOW_STRIDE, SNAPSHOT_MAX_FLOW_LEGS, SnapshotFlow } from '../shared/snapshot';
import { LINK_SAMPLE_COUNT } from './constants';
import type { World } from './World';

/**
 * The FlowMarker export of SPEC2 M14 (D-176): the measured connection graph of
 * section 7.4, written into the snapshot's flow-leg block for the flow atlas.
 *
 * Extracted from SimWorker the way the marker assembly was (D-174), so the
 * perf suite can price it against the 1,500-vehicle fixture and a unit test
 * can hold its rows against the graph. SimWorker remains the only caller, and
 * it calls from the ONE publish pass every other block is written in
 * (Fehlerkatalog 2, Fehler 33) - never from the tick.
 *
 * Strictly one-way: this function READS the link graph's flow measurement and
 * WRITES the block. No simulation decision reads either back - the coupling
 * test in tests/unit/flowExport.spec.ts walks src/sim and fails the build on
 * the first file that does.
 *
 * Allocation-free by construction (the publish pass runs every 50 ms):
 * indexed loops over preallocated state into a preallocated block.
 */

/**
 * Write one row per ACTIVE directed leg whose two stations still exist, in
 * link-creation order, and return how many were written.
 *
 * Past SNAPSHOT_MAX_FLOW_LEGS the atlas stops drawing further legs - the
 * reserved-tile cap rule; the simulation never slows down for an overlay.
 */
export function writeFlowLegs(world: World, block: Int32Array): number {
  const graph = world.cargoLinks;
  const links = graph.links;
  const stations = world.stations;
  let written = 0;

  for (let at = 0; at < links.length && written < SNAPSHOT_MAX_FLOW_LEGS; at++) {
    if (!graph.activeAt(at)) continue;
    const link = links[at]!;
    if (stations[link.fromStationId] === undefined) continue;
    if (stations[link.toStationId] === undefined) continue;

    // Volume over the recorded trips. Eight adds at most - cheaper per publish
    // than keeping a running total honest across ring overwrites.
    let volume = 0;
    const units = link.flowUnits;
    for (let i = 0; i < units.length; i++) volume += units[i]!;

    // The oldest recorded trip: index 0 while the ring is still filling,
    // the overwrite cursor once it is full.
    const oldest =
      units.length === 0
        ? -1
        : units.length < LINK_SAMPLE_COUNT
          ? link.flowTicks[0]!
          : link.flowTicks[link.flowCursor]!;

    const base = written * SNAPSHOT_FLOW_STRIDE;
    block[base + SnapshotFlow.FromStation] = link.fromStationId;
    block[base + SnapshotFlow.ToStation] = link.toStationId;
    block[base + SnapshotFlow.VolumeUnits] = Math.round(volume);
    block[base + SnapshotFlow.OldestTick] = oldest;
    block[base + SnapshotFlow.MeanTicks] = Math.round(link.meanTicks);
    block[base + SnapshotFlow.Measured] = link.samples.length > 0 ? 1 : 0;
    block[base + SnapshotFlow.OwnerId] = link.flowOwnerId;
    block[base + SnapshotFlow.LineId] = link.flowLineId;
    written++;
  }
  return written;
}
