import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_FLOW_STRIDE,
  SNAPSHOT_MAX_FLOW_LEGS,
  SnapshotFlow,
} from '../../src/shared/snapshot';
import { LINK_SAMPLE_MAX_TICKS, TICKS_PER_MONTH } from '../../src/sim/constants';
import { writeFlowLegs } from '../../src/sim/flow';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, type World } from '../../src/sim/World';
import { buildTransferNetwork, runTicks } from '../helpers/transferNetwork';

/**
 * The FlowMarker export of SPEC2 M14 (D-176): the section 7.4 connection
 * graph made renderer-visible. The tests hold the three promises the bundle
 * makes - the block matches the graph's own measurement on the acceptance
 * network, the measurement is display-only (never saved, never hashed, read
 * back by no simulation decision), and the v24 save shape of the link graph
 * is untouched.
 */

/** Total string order, because comparator-less sort() is banned repo-wide. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface FlowRow {
  readonly from: number;
  readonly to: number;
  readonly volume: number;
  readonly oldestTick: number;
  readonly meanTicks: number;
  readonly measured: number;
  readonly ownerId: number;
  readonly lineId: number;
}

/** Run the export and index its rows by directed station pair. */
function exportedRows(world: World): Map<string, FlowRow> {
  const block = new Int32Array(SNAPSHOT_MAX_FLOW_LEGS * SNAPSHOT_FLOW_STRIDE);
  const count = writeFlowLegs(world, block);
  const rows = new Map<string, FlowRow>();
  for (let i = 0; i < count; i++) {
    const base = i * SNAPSHOT_FLOW_STRIDE;
    const row: FlowRow = {
      from: block[base + SnapshotFlow.FromStation]!,
      to: block[base + SnapshotFlow.ToStation]!,
      volume: block[base + SnapshotFlow.VolumeUnits]!,
      oldestTick: block[base + SnapshotFlow.OldestTick]!,
      meanTicks: block[base + SnapshotFlow.MeanTicks]!,
      measured: block[base + SnapshotFlow.Measured]!,
      ownerId: block[base + SnapshotFlow.OwnerId]!,
      lineId: block[base + SnapshotFlow.LineId]!,
    };
    rows.set(`${row.from}>${row.to}`, row);
  }
  expect(rows.size).toBe(count);
  return rows;
}

/** The six directed legs the three lines of the acceptance network run. */
const NETWORK_LEGS = ['0>1', '1>0', '1>2', '2>1', '1>3', '3>1'] as const;

/** Which line serves each directed leg of the network. */
const LEG_LINE: Record<(typeof NETWORK_LEGS)[number], number> = {
  '0>1': 0,
  '1>0': 0,
  '1>2': 1,
  '2>1': 1,
  '1>3': 2,
  '3>1': 2,
};

describe('the FlowMarker export on the three-line transfer network', () => {
  it('exports exactly the active legs, honestly flagged as estimates before anybody drove', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    expect(world.stations.length).toBe(4);

    const rows = exportedRows(world);
    expect([...rows.keys()].sort(byText)).toEqual([...NETWORK_LEGS].sort(byText));

    for (const key of NETWORK_LEGS) {
      const row = rows.get(key)!;
      // The straight-line 54 km/h seed, presented as the estimate it is
      // (D-077): time from the graph, measured flag down, no volume, no trip.
      expect(row.meanTicks).toBe(Math.round(world.cargoLinks.legTicks(row.from, row.to)));
      expect(row.meanTicks).toBeGreaterThan(0);
      expect(row.measured).toBe(0);
      expect(row.volume).toBe(0);
      expect(row.oldestTick).toBe(-1);
      expect(row.ownerId).toBe(-1);
      expect(row.lineId).toBe(-1);
    }
  });

  it('measures volumes, times, owner and line over two months of real traffic', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    runTicks(network, 2 * TICKS_PER_MONTH);

    const rows = exportedRows(world);
    expect([...rows.keys()].sort(byText)).toEqual([...NETWORK_LEGS].sort(byText));

    for (const key of NETWORK_LEGS) {
      const row = rows.get(key)!;
      // Every leg has been driven: the mean is now a measurement and matches
      // the graph's own figure - the block never invents a second truth.
      expect(row.measured).toBe(1);
      expect(world.cargoLinks.legMeasured(row.from, row.to)).toBe(true);
      expect(row.meanTicks).toBe(Math.round(world.cargoLinks.legTicks(row.from, row.to)));
      // Whose trip it was: the player's buses, on the line that runs the leg.
      expect(row.ownerId).toBe(0);
      expect(row.lineId).toBe(LEG_LINE[key]);
      expect(row.oldestTick).toBeGreaterThan(0);
      expect(row.oldestTick).toBeLessThanOrEqual(world.tick);
    }

    // The outbound legs carried passengers - including, at B, the ones that
    // transferred off line 0 towards C and D (the D-078 feeder behaviour).
    expect(rows.get('0>1')!.volume).toBeGreaterThan(0);
    expect(rows.get('1>2')!.volume).toBeGreaterThan(0);
    expect(rows.get('1>3')!.volume).toBeGreaterThan(0);
    // And the transfer route exists in the table the parcels routed by.
    expect(Number.isFinite(world.cargoLinks.expectedTicks(0, 2))).toBe(true);
  });

  it('rides the sample-window discipline: eight trips, oldest first out, one filter', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    const graph = world.cargoLinks;

    // One trip: rounded volume, its arrival tick, its owner and line.
    graph.observe(0, 1, 900, 10.4, 0, 0, 100);
    let row = exportedRows(world).get('0>1')!;
    expect(row.volume).toBe(10);
    expect(row.oldestTick).toBe(100);
    expect(row.measured).toBe(1);
    expect(row.meanTicks).toBe(900);
    expect(row.ownerId).toBe(0);
    expect(row.lineId).toBe(0);

    // Nine more trips: the ring keeps the newest eight, so the first two
    // trips fall out - volume is the sum over trips 3..10, the oldest tick is
    // trip 3's, and owner/line follow the newest trip.
    for (let k = 1; k <= 9; k++) graph.observe(0, 1, 900 + k, k, 0, 2, 1_000 + k);
    row = exportedRows(world).get('0>1')!;
    expect(row.volume).toBe(2 + 3 + 4 + 5 + 6 + 7 + 8 + 9);
    expect(row.oldestTick).toBe(1_002);
    expect(row.lineId).toBe(2);

    // The D-077 filter applies to the WHOLE trip: a rejected time records no
    // flow either, and a pair no vehicle runs records nothing at all.
    graph.observe(0, 1, 0, 99, 0, 0, 5_000);
    graph.observe(0, 1, LINK_SAMPLE_MAX_TICKS + 1, 99, 0, 0, 5_000);
    graph.observe(0, 2, 500, 99, 0, 0, 5_000);
    const rows = exportedRows(world);
    expect(rows.get('0>1')!.volume).toBe(44);
    expect(rows.get('0>1')!.oldestTick).toBe(1_002);
    expect(rows.has('0>2')).toBe(false);
  });

  it('keeps the flow measurement out of the save and the hash, and re-measures after a load', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    graphTraffic(network);

    // The serialised link shape is the v24 one, field for field - the bundle
    // must not touch it (the M14 save bump belongs to the cargo-history ring).
    const saved = world.cargoLinks.toData()[0]!;
    expect(Object.keys(saved).sort(byText)).toEqual([
      'cursor',
      'fromStationId',
      'meanTicks',
      'samples',
      'toStationId',
    ]);

    // The digest cannot see the rings: bending one changes nothing.
    const digest = hashWorld(world);
    const link = world.cargoLinks.links[0]!;
    link.flowUnits.push(123);
    link.flowTicks.push(1);
    expect(hashWorld(world)).toBe(digest);
    link.flowUnits.pop();
    link.flowTicks.pop();

    // Across a save the time means survive and keep routing; the display-only
    // volumes honestly start over, trip by trip.
    const loaded = decodeSave(encodeSave(world, network.queue, '0.1.0')).world;
    expect(hashWorld(loaded)).toBe(digest);
    const before = exportedRows(world);
    const after = exportedRows(loaded);
    expect([...after.keys()].sort(byText)).toEqual([...before.keys()].sort(byText));
    for (const key of NETWORK_LEGS) {
      expect(after.get(key)!.meanTicks).toBe(before.get(key)!.meanTicks);
      expect(after.get(key)!.measured).toBe(before.get(key)!.measured);
      expect(after.get(key)!.volume).toBe(0);
      expect(after.get(key)!.oldestTick).toBe(-1);
      expect(after.get(key)!.ownerId).toBe(-1);
    }
  });
});

/** A handful of synthetic trips so every leg carries flow state. */
function graphTraffic(network: ReturnType<typeof buildTransferNetwork>): void {
  const graph = network.world.cargoLinks;
  for (const key of NETWORK_LEGS) {
    const [from, to] = key.split('>').map(Number) as [number, number];
    graph.observe(from, to, 1_200, 25, 0, LEG_LINE[key], 300);
  }
}

// --------------------------------------------------------- read-back guard
//
// "Strictly read-only export" as a build property rather than a promise: the
// flow measurement exists for the renderer, and the day a pathfinder or a
// rating starts reading it back, the display layer has become a world rule
// without a save field (Fehlerkatalog 2, Fehler 23/24). The walk enumerates
// every simulation file and allows the flow vocabulary in exactly three
// places: the graph that records it, the exporter that writes the block, and
// the worker shell that calls the exporter in the publish pass.

const SIM_DIR = fileURLToPath(new URL('../../src/sim', import.meta.url));

/**
 * The flow vocabulary: measurement fields, exporter, snapshot block names.
 * Word-bounded, so a station's `overflowUnits` does not read as `flowUnits`.
 */
const FLOW_PATTERN =
  /\b(flowUnits|flowTicks|flowCursor|flowOwnerId|flowLineId|writeFlowLegs|SnapshotFlow|draftFlow|FlowCount|activeAt)\b/;

/** The only files below src/sim that may speak it, with their roles. */
const FLOW_ALLOWED = ['cargo/linkGraph.ts', 'flow.ts', 'SimWorker.ts'];

describe('no simulation decision reads the flow measurement back (D-176)', () => {
  it('finds the flow vocabulary only in the recorder, the exporter and the worker shell', () => {
    const files = readdirSync(SIM_DIR, { recursive: true, encoding: 'utf-8' })
      .filter((name) => name.endsWith('.ts'))
      .map((name) => name.replaceAll('\\', '/'));
    expect(files.length).toBeGreaterThan(10);

    const speaking = files.filter((name) =>
      FLOW_PATTERN.test(readFileSync(join(SIM_DIR, name), 'utf-8')),
    );
    // Both directions, so a stale allowlist fails too (the D-134 rule).
    expect(speaking.sort(byText)).toEqual([...FLOW_ALLOWED].sort(byText));
  });
});
