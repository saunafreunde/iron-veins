import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { TICKS_PER_DAY } from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { TownMeasure } from '../../src/sim/town/council';
import { flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * `TileMap.trackRevision` (D-232).
 *
 * The rail pathfinder's dense index and the block index are the only two
 * whole-map derivations the simulation caches, and both depend on `trackBits`
 * and `signal` and on nothing else. They keyed on `TileMap.revision`, which
 * moves for every house, kerbstone and tree - so ONE map edit cost a full
 * 1024^2 scan twice on the very next tick, whatever had been edited. That has
 * been the price of every road tile a player lays since M4; what made it
 * visible was SPEC2 M20 bundle 2, whose towns change the map every day.
 *
 * Measured on the 1,500-vehicle acceptance fixture, one town building a day:
 * tick p99 **6.0 ms without the daily map change, 8.3 ms with it, and 5.0 ms
 * with the change kept but the revision bump alone taken out** - so the whole
 * of it was the invalidation and none of it the town's own work.
 *
 * Two halves are held here, and they are the two halves that make the split
 * safe rather than merely fast:
 *
 *  - **the counters move apart exactly where they are supposed to.** Every
 *    command goes through `TileMap.noteChange` and moves both; the three passes
 *    the town runs for itself move `revision` alone.
 *  - **nothing outside `commands/build.ts` writes a track layer.** That is what
 *    makes "every writer went through `noteChange`" a property of the source
 *    rather than a promise - the D-176/D-186 device, a source walk that fails
 *    the day somebody else writes the vocabulary.
 */

const SIZE = 64;

/**
 * One town with more houses than its population asks for, so the daily growth
 * pass has something to do on every one of its turns - which is the state that
 * made the cost visible on the acceptance fixture in the first place.
 */
function bareTown(): Scenario {
  const town = makeTown(0, 32, 32, 800, 'Gleisheim');
  return flatScenario(SIZE, [town], []);
}

function run(scenario: Scenario, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
}

describe('the two revisions', () => {
  it('both move when a command lays track', () => {
    const scenario = bareTown();
    const map = scenario.world.map;
    const revision = map.revision;
    const trackRevision = map.trackRevision;

    scenario.queue.enqueue(
      {
        kind: CommandKind.BuildTrack,
        x1: 5,
        y1: 5,
        x2: 12,
        y2: 5,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: 0,
      },
      scenario.world.tick,
    );
    scenario.world.drainCommands(scenario.queue, null);

    expect(map.revision).toBeGreaterThan(revision);
    expect(map.trackRevision).toBeGreaterThan(trackRevision);
  });

  it('only the map revision moves when a town builds or shrinks', () => {
    const scenario = bareTown();
    const map = scenario.world.map;
    // Nothing serves this town, so it takes a house down on every turn until
    // its stock matches its population (SPEC.md 13.2).
    run(scenario, 5 * TICKS_PER_DAY);
    const revision = map.revision;
    const trackRevision = map.trackRevision;
    run(scenario, 10 * TICKS_PER_DAY);

    expect(map.revision, 'the town changed nothing at all').toBeGreaterThan(revision);
    expect(map.trackRevision, 'a house is not a change to the track').toBe(trackRevision);
  });

  it('only the map revision moves when the council plants trees or funds streets', () => {
    const scenario = bareTown();
    const world = scenario.world;
    const map = world.map;
    world.company.cashCt = 10_000_000_00;
    const trackRevision = map.trackRevision;
    const revision = map.revision;

    for (const measure of [TownMeasure.PlantTrees, TownMeasure.FundRoads]) {
      scenario.queue.enqueue(
        { kind: CommandKind.ApplyTownMeasure, townId: 0, measure },
        world.tick,
      );
      world.drainCommands(scenario.queue, null);
    }
    expect(map.revision).toBeGreaterThan(revision);
    expect(map.trackRevision).toBe(trackRevision);
  });

  it('still sees track laid after a town has been building for months', () => {
    const scenario = bareTown();
    const world = scenario.world;
    const tile = world.map.tileIndex(9, 5);
    // Warm the block index on an empty map, then let the town move the map
    // many times without touching a rail.
    world.blocks.refresh(world.map);
    run(scenario, 60 * TICKS_PER_DAY);
    expect(world.blocks.blockAt(tile), 'there is no track here yet').toBe(-1);

    scenario.queue.enqueue(
      {
        kind: CommandKind.BuildTrack,
        x1: 5,
        y1: 5,
        x2: 15,
        y2: 5,
        railType: RailType.Plain,
        assistant: false,
        signalSpacing: 0,
      },
      world.tick,
    );
    world.drainCommands(scenario.queue, null);
    world.blocks.refresh(world.map);
    // The invalidation still fires for the change that matters - a stale index
    // here would put a train into a section the signals cannot see.
    expect(world.blocks.blockAt(tile), 'the fresh track is invisible').toBeGreaterThanOrEqual(0);
  });
});

// ------------------------------------------------- who may write a track layer

const SIM_DIR = fileURLToPath(new URL('../../src/sim/', import.meta.url));
/** The one file that may write `trackBits` or `signal`. */
const TRACK_WRITER = 'commands/build.ts';
/** An indexed WRITE to one of the two layers - `x.trackBits[i] = ...`. */
const TRACK_WRITE = /\.(trackBits|signal)\[[^\]]*\]\s*=[^=]/;

function sourceFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const entry of entries) {
    const full = dir + entry;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full + '/', `${prefix}${entry}/`));
    else if (entry.endsWith('.ts')) out.push(`${prefix}${entry}`);
  }
  return out;
}

describe('the track layers', () => {
  it('are written in exactly one file, so `noteChange` covers every writer', () => {
    const writers: string[] = [];
    for (const file of sourceFiles(SIM_DIR)) {
      const text = readFileSync(SIM_DIR + file, 'utf8');
      for (const line of text.split('\n')) {
        if (TRACK_WRITE.test(line)) {
          writers.push(file);
          break;
        }
      }
    }
    expect(
      writers,
      'a new writer of trackBits/signal must go through TileMap.noteChange, or the rail ' +
        'index and the block index will serve a stale map (law #3) - see D-232',
    ).toEqual([TRACK_WRITER]);
  });

  it('has its own detector proved on the shapes that occur', () => {
    expect(TRACK_WRITE.test('map.trackBits[tile] = 0;')).toBe(true);
    expect(TRACK_WRITE.test('  world.map.signal[tile] = SignalKind.None;')).toBe(true);
    // Reads, comparisons and the bulk load path are not writes of a tile.
    expect(TRACK_WRITE.test('const packed = map.signal[toTile]!;')).toBe(false);
    expect(TRACK_WRITE.test('if (map.trackBits[tile] === 0) return;')).toBe(false);
    expect(TRACK_WRITE.test('map.trackBits.set(new Uint8Array(data));')).toBe(false);
  });
});
