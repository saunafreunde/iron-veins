import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { heatAlpha, heatColor, HEAT_ALPHA_MAX, HEAT_ALPHA_MIN } from '../../src/render/heatmap';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  MAX_METERED_TILES,
  THROUGHPUT_FULL_SCALE_PASSES,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { Terrain } from '../../src/sim/map/terrain';
import { RailType } from '../../src/sim/map/track';
import { TileMap } from '../../src/sim/map/TileMap';
import { ThroughputMeter, utilisationOf } from '../../src/sim/net/throughput';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The per-block throughput counters of SPEC2 M15 and the utilisation heat map
 * they draw (D-186).
 *
 * The counters are the milestone's one DERIVED instrument, and the tests hold
 * exactly that: they count what ran, the calendar empties them, the save
 * never sees them, the digest never sees them - and no simulation decision
 * reads them, which is a walk over `src/sim` rather than a promise (the
 * D-176 read-back guard, applied a second time).
 */

const SIZE = 64;
const GROUND = 5;
const RAILBUS = 1061;
const LINE_Y = 20;
const WEST_X = 8;
const EAST_X = 40;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

function run(bench: Bench, command: Command): void {
  bench.queue.enqueue(command, bench.world.tick);
  let rejected: string | null = null;
  bench.world.drainCommands(bench.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

/** One train shuttling between two platforms on a straight single line. */
function shuttle(): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed: 99,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Pendel AG',
      companyColorIndex: 4,
    },
    { map, towns: [], industries: [], seedUsed: 99 },
  );
  world.company.cashCt = 100_000_000_00;
  const bench: Bench = { world, queue: new CommandQueue() };

  run(bench, {
    kind: CommandKind.BuildTrack,
    x1: WEST_X,
    y1: LINE_Y,
    x2: EAST_X,
    y2: LINE_Y,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: WEST_X,
    y: LINE_Y,
    moduleKind: ModuleKind.RailDepot,
  });
  run(bench, {
    kind: CommandKind.BuildRailStop,
    x: EAST_X,
    y: LINE_Y,
    moduleKind: ModuleKind.RailPlatform,
  });
  run(bench, { kind: CommandKind.BuyTrain, x: WEST_X, y: LINE_Y, specIds: [RAILBUS] });
  run(bench, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [{ target: 0, targetId: world.stations[1]!.id, load: 1, unload: 0 }],
  });
  run(bench, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  return bench;
}

describe('the throughput meter', () => {
  it('counts what a train drove over, keeps a dirty list and saturates at 255', () => {
    const layer = new Uint8Array(16);
    const meter = new ThroughputMeter();
    expect(meter.count).toBe(0);

    meter.note(layer, 3);
    meter.note(layer, 3);
    meter.note(layer, 7);
    expect(layer[3]).toBe(2);
    expect(layer[7]).toBe(1);
    // The list holds the tiles that carry something - one entry per tile,
    // pushed on the rise out of zero and never twice.
    expect(meter.count).toBe(2);

    for (let i = 0; i < 400; i++) meter.note(layer, 3);
    expect(layer[3]).toBe(255);
    expect(meter.count).toBe(2);

    // The clear walks the list, not the map: two tiles for a 16-tile layer.
    expect(meter.clearMonth(layer)).toBe(2);
    expect(meter.count).toBe(0);
    expect([...layer]).toEqual(new Array<number>(16).fill(0));
  });

  it('refuses past the cap rather than evicting a tile it could never clear', () => {
    const layer = new Uint8Array(MAX_METERED_TILES + 8);
    const meter = new ThroughputMeter();
    for (let tile = 0; tile < MAX_METERED_TILES; tile++) meter.note(layer, tile);
    expect(meter.count).toBe(MAX_METERED_TILES);

    meter.note(layer, MAX_METERED_TILES + 1);
    expect(layer[MAX_METERED_TILES + 1]).toBe(0);
    expect(meter.count).toBe(MAX_METERED_TILES);
    // A tile that is already listed keeps counting - the cap bounds the LIST.
    meter.note(layer, 0);
    expect(layer[0]).toBe(2);
  });

  it('fills up along the line a train runs and is emptied by the month', () => {
    const bench = shuttle();
    const world = bench.world;
    // Most of a month, so the train has run but the monthly hook has not.
    for (let tick = 0; tick < TICKS_PER_MONTH - 1; tick++) world.step(bench.queue, null);

    const middle = world.map.tileIndex((WEST_X + EAST_X) >> 1, LINE_Y);
    expect(world.map.throughput[middle]).toBeGreaterThan(0);
    expect(world.throughput.count).toBeGreaterThan(0);
    // A tile no train touched stays at zero - the map is not painted flat.
    expect(world.map.throughput[world.map.tileIndex(2, 2)]).toBe(0);

    // The month boundary empties it, exactly as the energy meter of D-091 is
    // emptied by the bill that reads it.
    world.step(bench.queue, null);
    expect(world.tick % TICKS_PER_MONTH).toBe(0);
    expect(world.map.throughput[middle]).toBe(0);
    expect(world.throughput.count).toBe(0);
  });
});

describe('the counters are derived, and provably so', () => {
  it('never reaches the save, the digest or a loaded world', () => {
    const bench = shuttle();
    const world = bench.world;
    for (let tick = 0; tick < 2_000; tick++) world.step(bench.queue, null);

    const middle = world.map.tileIndex((WEST_X + EAST_X) >> 1, LINE_Y);
    expect(world.map.throughput[middle]).toBeGreaterThan(0);

    // Bending the layer changes nothing the determinism suite watches -
    // which is the property that lets it stay out of the save (Z4's
    // exception for purely reading overlays).
    const digest = hashWorld(world);
    world.map.throughput[middle] = 200;
    world.map.throughput[0] = 7;
    expect(hashWorld(world)).toBe(digest);
    world.map.throughput[0] = 0;

    // And the file does not carry it: a reloaded world hashes identically and
    // starts its heat map empty, the honest price the flow volumes pay too.
    const state = world.toData();
    expect(Object.keys(state.map)).not.toContain('throughput');
    const loaded = decodeSave(encodeSave(world, bench.queue, '0.1.0')).world;
    expect(hashWorld(loaded)).toBe(digest);
    expect(loaded.map.throughput[middle]).toBe(0);
    expect(loaded.throughput.count).toBe(0);
  });
});

describe('the utilisation scale and its colours', () => {
  it('reads zero for untouched track and saturates at the full scale', () => {
    expect(utilisationOf(0)).toBe(0);
    expect(utilisationOf(-3)).toBe(0);
    expect(utilisationOf(THROUGHPUT_FULL_SCALE_PASSES)).toBe(1);
    expect(utilisationOf(THROUGHPUT_FULL_SCALE_PASSES * 4)).toBe(1);
    expect(utilisationOf(THROUGHPUT_FULL_SCALE_PASSES / 2)).toBeCloseTo(0.5, 12);
  });

  it('ramps colour and opacity monotonically between the palette stops', () => {
    expect(heatAlpha(0)).toBe(HEAT_ALPHA_MIN);
    expect(heatAlpha(1)).toBe(HEAT_ALPHA_MAX);
    expect(heatAlpha(2)).toBe(HEAT_ALPHA_MAX);
    expect(heatAlpha(-1)).toBe(HEAT_ALPHA_MIN);
    let previous = -1;
    for (let step = 0; step <= 10; step++) {
      const alpha = heatAlpha(step / 10);
      expect(alpha).toBeGreaterThan(previous);
      previous = alpha;
    }

    // The three stops are the interface's own success/warning/danger, and
    // the red end really is redder than the green one.
    expect(heatColor(0)).toBe(0x4caf7d);
    expect(heatColor(0.5)).toBe(0xe0b040);
    expect(heatColor(1)).toBe(0xd9534f);
    expect((heatColor(1) >> 16) & 0xff).toBeGreaterThan((heatColor(0) >> 16) & 0xff);
    // Nothing outside the ramp: a saturated counter is simply "full".
    expect(heatColor(9)).toBe(heatColor(1));
  });
});

// --------------------------------------------------------- read-back guard
//
// The whole licence for keeping this layer derived is that nothing in the
// simulation reads it (Z4: derived is legitimate ONLY for purely reading
// overlays, the D-054 ReservationTable pattern). The day a pathfinder, a
// rating or a news message reads a throughput count, the same argument that
// makes the road congestion layer saved state applies here - and this walk is
// what turns that from a promise into a build property. It is the D-176 flow
// guard, applied to the second derived instrument of the expansion.

const SIM_DIR = fileURLToPath(new URL('../../src/sim', import.meta.url));

/**
 * The throughput vocabulary as it is READ - `map.throughput`,
 * `world.throughput`, the meter and the scale - rather than the English word,
 * which prose about signalling and about the AI's line estimates uses freely
 * and rightly. What must not spread is the ACCESS.
 */
const THROUGHPUT_PATTERN = /(\.throughput\b|\bThroughputMeter\b|\butilisationOf\b|\bclearMonth\b)/;

/** The only files below src/sim that may speak it, with their roles. */
const THROUGHPUT_ALLOWED = [
  // The meter and the scale themselves.
  'net/throughput.ts',
  // The layer's declaration, beside the ocean mask it is as derived as.
  'map/TileMap.ts',
  // Holds the meter and lets the calendar empty it.
  'World.ts',
  // The one write: a train crossing a tile boundary.
  'vehicles/update.ts',
];

describe('no simulation decision reads the throughput counters (D-186)', () => {
  it('finds the vocabulary only in the meter, the layer, the world and the one write', () => {
    const files = readdirSync(SIM_DIR, { recursive: true, encoding: 'utf-8' })
      .filter((name) => name.endsWith('.ts'))
      .map((name) => name.replaceAll('\\', '/'));
    expect(files.length).toBeGreaterThan(10);

    const speaking = files.filter((name) =>
      THROUGHPUT_PATTERN.test(readFileSync(join(SIM_DIR, name), 'utf-8')),
    );
    // Both directions, so a stale allowlist fails too (the D-134 rule).
    expect(speaking.sort(byText)).toEqual([...THROUGHPUT_ALLOWED].sort(byText));
  });
});
