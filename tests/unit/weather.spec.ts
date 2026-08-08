import { GCProfiler } from 'node:v8';
import { describe, expect, it } from 'vitest';
import {
  createSnapshotBuffer,
  SNAPSHOT_WEATHER_CELLS,
  SnapshotI32,
  SnapshotReader,
  SnapshotWriter,
} from '../../src/shared/snapshot';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  WEATHER_CELL_COUNT,
  WEATHER_GRID_SIZE,
  WEATHER_REGION_COUNT,
  WeatherCell,
  WeatherRule,
} from '../../src/sim/constants';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { weatherRegionOf } from '../../src/sim/weather/field';
import { writeWeatherBlock } from '../../src/sim/weather/snapshot';
import { updateWeather } from '../../src/sim/weather/update';
import { NewsCategory } from '../../src/sim/news/log';
import { ModuleKind } from '../../src/sim/station/types';
import { hashWorld, World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The weather world rule of SPEC2 M18 (E-01, DECISIONS.md D-200).
 *
 * Weather here is simulation reality, not render candy: a `NewGameParams` rule
 * and a 16x16 region field, both saved and both hashed. This file holds what
 * that has to mean.
 *
 * **Which assertions are evidence and which are read-back.** The share bands
 * in "a harsh climate produces weather rather than noise" are a READ-BACK: the
 * weight table in `constants.ts` was chosen by looking at exactly this
 * distribution, so a test that then bands it is checking the arithmetic of its
 * own calibration and nothing more. It is here because a distribution that
 * silently collapses to all-clear or all-storm has to turn the build red, not
 * because it proves the model. What is independent of the tuning:
 *
 *  - the FRONT test compares the field against an independent scatter of the
 *    field's OWN per-day distribution, so whatever the weights produce is
 *    divided out; the constant's doc records the measurement with the pull set
 *    to zero, where the comparison disappears;
 *  - the SEASON test plants an all-frost field in July and requires it to be
 *    gone in a day, which follows from a weight of zero beating the
 *    persistence bonus and from no number in the table;
 *  - the two-run identity, the stream separation and the save round trip are
 *    properties of the machinery, not of any tariff.
 */

const SEED = 424_242;
const MAP_SIZE = 128;

function makeWorld(weather: WeatherRule, seed = SEED): World {
  return World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Wetterdienst',
    companyColorIndex: 1,
    weather,
  });
}

function play(world: World, ticks: number, queue = new CommandQueue()): World {
  for (let i = 0; i < ticks; i++) world.step(queue, null);
  return world;
}

/** Cell counts of the current field. */
function census(world: World): number[] {
  const counts = new Array<number>(WEATHER_CELL_COUNT).fill(0);
  for (let at = 0; at < WEATHER_REGION_COUNT; at++) {
    const cell = world.weatherField.cells[at]!;
    counts[cell] = counts[cell]! + 1;
  }
  return counts;
}

// ------------------------------------------------------------------- the rule

describe('the weather rule is a world rule (Z2, E-01)', () => {
  it('is off unless the world was started with it, and off is all-clear', () => {
    const world = makeWorld(WeatherRule.Off);
    expect(world.weather).toBe(WeatherRule.Off);
    expect(
      World.create({
        seed: SEED,
        difficulty: Difficulty.Normal,
        climate: MapClimate.Temperate,
        mapSize: MAP_SIZE,
        companyName: 'Wetterdienst',
        companyColorIndex: 1,
      }).weather,
    ).toBe(WeatherRule.Off);

    play(world, TICKS_PER_YEAR);
    expect(census(world)[WeatherCell.Clear]).toBe(WEATHER_REGION_COUNT);
  });

  it('is hashed, so three rules on one seed are three worlds', () => {
    const off = hashWorld(makeWorld(WeatherRule.Off));
    const mild = hashWorld(makeWorld(WeatherRule.Mild));
    const harsh = hashWorld(makeWorld(WeatherRule.Harsh));
    expect(new Set([off, mild, harsh]).size).toBe(3);
  });

  it('hashes the field itself, not only the rule', () => {
    const world = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH);
    const before = hashWorld(world);
    // One region's sky bent by hand. Nothing else about the world moves.
    world.weatherField.cells[0] = world.weatherField.cells[0] === 0 ? 1 : 0;
    expect(hashWorld(world)).not.toBe(before);
  });
});

// ------------------------------------------------------- the stream (Z3, D-106)

describe('weather draws from its own stream', () => {
  it('leaves the gameplay stream exactly where it was', () => {
    // The Z3 property, and the one that survives the bundles which give
    // weather its economic effects: those modulate an existing roll by moving
    // a THRESHOLD at an identical draw count, so the shared stream's position
    // must be the same in a stormy world as in one with no weather at all.
    const off = play(makeWorld(WeatherRule.Off), TICKS_PER_MONTH);
    const harsh = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH);
    expect(harsh.rng.getState()).toEqual(off.rng.getState());
  });

  it('is a function of the seed, the rule and the day - not of the game played', () => {
    // Two worlds on one seed, one of which is being played. If the weather
    // came off the shared stream, or off anything the commands touch, the two
    // skies would part company on the first loan.
    const quiet = makeWorld(WeatherRule.Harsh);
    const busy = makeWorld(WeatherRule.Harsh);
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 4 }, 10);
    queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Sturmbahn AG' }, 400);

    play(quiet, TICKS_PER_MONTH);
    play(busy, TICKS_PER_MONTH, queue);

    expect(busy.playerCompany.loanCt).toBeGreaterThan(0);
    expect([...busy.weatherField.cells]).toEqual([...quiet.weatherField.cells]);
  });
});

// ------------------------------------------------------------ the daily field

describe('the field evolves', () => {
  it('reaches the same hash twice over five game years with the rule harsh', () => {
    // The milestone's own acceptance sentence: a five year game with harsh
    // weather is bit-identical across two runs.
    const first = play(makeWorld(WeatherRule.Harsh), 5 * TICKS_PER_YEAR);
    const second = play(makeWorld(WeatherRule.Harsh), 5 * TICKS_PER_YEAR);

    expect(first.tick).toBe(5 * TICKS_PER_YEAR);
    expect(hashWorld(second)).toBe(hashWorld(first));
    expect([...second.weatherField.cells]).toEqual([...first.weatherField.cells]);
    // And it is a real sky at the end, not a field that quietly went flat.
    expect(census(first).filter((count) => count > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('produces weather rather than noise, over five harsh game years', () => {
    // READ-BACK, not evidence: these bands restate the weight table that was
    // chosen by looking at this very run (see the file header). What they are
    // worth is that a collapse - all clear, all storm, a sky that never
    // appears - is a red build.
    const world = makeWorld(WeatherRule.Harsh);
    const queue = new CommandQueue();
    const totals = new Array<number>(WEATHER_CELL_COUNT).fill(0);
    let days = 0;
    let uniformDays = 0;

    for (let i = 0; i < 5 * TICKS_PER_YEAR; i++) {
      world.step(queue, null);
      if (world.tick % TICKS_PER_DAY !== 0) continue;
      days++;
      const counts = census(world);
      for (let cell = 0; cell < WEATHER_CELL_COUNT; cell++) totals[cell]! += counts[cell]!;
      if (counts.filter((count) => count > 0).length === 1) uniformDays++;
    }

    const sampled = days * WEATHER_REGION_COUNT;
    const share = totals.map((count) => count / sampled);
    expect(days).toBe(5 * 360);
    // Clear is a majority and nothing like the whole map.
    expect(share[WeatherCell.Clear]!).toBeGreaterThan(0.4);
    expect(share[WeatherCell.Clear]!).toBeLessThan(0.65);
    expect(share[WeatherCell.Rain]!).toBeGreaterThan(0.2);
    expect(share[WeatherCell.Storm]!).toBeGreaterThan(0.04);
    // The two seasonal skies exist without dominating anything.
    expect(share[WeatherCell.Frost]!).toBeGreaterThan(0.01);
    expect(share[WeatherCell.Heat]!).toBeGreaterThan(0.01);
    // Not one of the 1,800 days is a single sky over the whole map.
    expect(uniformDays).toBe(0);
  });

  it('draws fronts rather than static: neighbours agree more than chance', () => {
    // INDEPENDENT of the weight table. The baseline is computed from the
    // field's OWN per-day distribution, so whatever shares the weights produce
    // divide out; what is left is the neighbour pull. With the pull set to
    // zero the two numbers were measured equal (see WEATHER_NEIGHBOUR_PULL).
    const world = makeWorld(WeatherRule.Harsh);
    const queue = new CommandQueue();
    let agreeing = 0;
    let pairs = 0;
    let expected = 0;

    for (let i = 0; i < TICKS_PER_YEAR; i++) {
      world.step(queue, null);
      if (world.tick % TICKS_PER_DAY !== 0) continue;
      const cells = world.weatherField.cells;
      const counts = census(world);
      let byChance = 0;
      for (const count of counts) {
        const p = count / WEATHER_REGION_COUNT;
        byChance += p * p;
      }
      for (let row = 0; row < WEATHER_GRID_SIZE; row++) {
        for (let column = 0; column < WEATHER_GRID_SIZE; column++) {
          const at = row * WEATHER_GRID_SIZE + column;
          if (column < WEATHER_GRID_SIZE - 1) {
            pairs++;
            expected += byChance;
            if (cells[at] === cells[at + 1]) agreeing++;
          }
          if (row < WEATHER_GRID_SIZE - 1) {
            pairs++;
            expected += byChance;
            if (cells[at] === cells[at + WEATHER_GRID_SIZE]) agreeing++;
          }
        }
      }
    }

    expect(pairs).toBeGreaterThan(100_000);
    expect(agreeing / pairs).toBeGreaterThan((expected / pairs) * 1.03);
  });

  it('has no frost in July and no heat in January, whatever was standing', () => {
    // INDEPENDENT of the weights: the season gate multiplies BEFORE the
    // persistence bonus, so a zero gate takes a standing sky's weight to zero
    // as well. Planting a full map of frost in high summer is the falsifiable
    // form of that - a gate applied after persistence would leave most of it
    // where it was.
    const world = makeWorld(WeatherRule.Harsh);
    const queue = new CommandQueue();
    // Into July (month 6), then plant the impossible sky and play one day.
    play(world, 6 * 30 * TICKS_PER_DAY, queue);
    world.weatherField.cells.fill(WeatherCell.Frost);
    play(world, TICKS_PER_DAY, queue);
    expect(census(world)[WeatherCell.Frost]).toBe(0);

    // And the mirror, half a year on.
    play(world, 6 * 30 * TICKS_PER_DAY, queue);
    world.weatherField.cells.fill(WeatherCell.Heat);
    play(world, TICKS_PER_DAY, queue);
    expect(census(world)[WeatherCell.Heat]).toBe(0);
  });
});

// ------------------------------------------------------ law 7: the allocation

/**
 * Bytes allocated over `iterations` calls, MEASURED - the instrument M17's
 * goal hook brought in (D-193), used here for the same reason: a bare
 * `heapUsed` delta falls whenever a collection happens to run, so the growth
 * plus everything the collector took away inside the window is what is honest.
 */
function allocatedBytes(work: () => void, iterations: number): number {
  for (let i = 0; i < 2_000; i++) work();

  const profiler = new GCProfiler();
  profiler.start();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) work();
  const after = process.memoryUsage().heapUsed;
  const result = profiler.stop();

  let reclaimed = 0;
  for (const event of result.statistics) {
    reclaimed +=
      event.beforeGC.heapStatistics.usedHeapSize - event.afterGC.heapStatistics.usedHeapSize;
  }
  return after - before + reclaimed;
}

describe('the daily pass and law 7', () => {
  const ITERATIONS = 50_000;

  it('allocates nothing at all with the rule off', () => {
    const off = play(makeWorld(WeatherRule.Off), TICKS_PER_DAY * 3);
    const measured = allocatedBytes(() => updateWeather(off), ITERATIONS);
    console.log(`weather hook, rule off: ${(measured / ITERATIONS).toFixed(2)} B per game day`);
    // The hook returns on its first line. Anything above the harness floor
    // would mean it does not.
    expect(measured / ITERATIONS).toBeLessThan(1);
  });

  it('allocates a constant handful of bytes a game day, never one per region', () => {
    // D-128 permits a hook to allocate its stream and forbids it on the
    // per-tick path; what must not be here is per-REGION allocation, which is
    // 256 times as much and is what a pass written with `map`/closures would
    // cost. Measured on this machine: 136 B a game day - the day's generator
    // plus the four-word array `Rng.fromSeed` expands the seed through - against
    // a per-region control of 17.5 kB, so the instrument can plainly see one.
    const harsh = play(makeWorld(WeatherRule.Harsh), TICKS_PER_DAY * 3);
    const measured = allocatedBytes(() => updateWeather(harsh), ITERATIONS);
    const control = allocatedBytes(() => {
      const rows: { at: number; cell: number }[] = [];
      for (let at = 0; at < WEATHER_REGION_COUNT; at++) {
        rows.push({ at, cell: harsh.weatherField.cells[at]! });
      }
      sink = rows;
    }, ITERATIONS);
    console.log(
      `weather hook, rule harsh: ${(measured / ITERATIONS).toFixed(2)} B per game day; ` +
        `a per-region control ${(control / ITERATIONS).toFixed(2)} B`,
    );

    expect(control / ITERATIONS).toBeGreaterThan(1_000);
    expect(measured / ITERATIONS).toBeLessThan(control / ITERATIONS / 20);
    // Read the sink, so the control loop cannot be optimised away entirely.
    expect(sink).not.toBeNull();
  });
});

/** Sink for the control loop, so nothing it does can be optimised away. */
let sink: unknown = null;

// ------------------------------------------------------------- save and load

describe('the field is saved state, never derived', () => {
  it('survives a save round trip byte for byte and by digest', () => {
    // The D-185 property, one system over: a field rebuilt from the rule on
    // load would give the loaded world a different sky from the saved one, and
    // with it different costs - law #3 broken in silence.
    const world = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH + 137);
    const queue = new CommandQueue();
    const before = hashWorld(world);
    expect(census(world)[WeatherCell.Clear]).toBeLessThan(WEATHER_REGION_COUNT);

    const loaded = decodeSave(encodeSave(world, queue, 'weather-test'));

    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.weather).toBe(WeatherRule.Harsh);
    expect([...loaded.world.weatherField.cells]).toEqual([...world.weatherField.cells]);
  });

  it('carries on from the sky it was saved under', () => {
    const world = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH);
    const loaded = decodeSave(encodeSave(world, new CommandQueue(), 'weather-test'));

    play(world, TICKS_PER_DAY * 30);
    play(loaded.world, TICKS_PER_DAY * 30, loaded.queue);

    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });
});

// ---------------------------------------------------------- the render seam

describe('the weather block of the snapshot', () => {
  it('is the field the simulation holds, and the same 256 the sim counts', () => {
    // The coupling the shared channel cannot express as an import (D-187's
    // precedent): it must not depend on `src/sim`, so the equality lives here.
    expect(SNAPSHOT_WEATHER_CELLS).toBe(WEATHER_REGION_COUNT);
  });

  it('writes nothing for a world with the rule off', () => {
    const world = play(makeWorld(WeatherRule.Off), TICKS_PER_DAY * 10);
    const block = new Int32Array(SNAPSHOT_WEATHER_CELLS).fill(-1);

    expect(writeWeatherBlock(world.weather, world.weatherField, block)).toBe(0);
    // Untouched: a count of zero is what says "this world has no weather",
    // and the renderer must not read a block nobody wrote.
    expect(block[0]).toBe(-1);
  });

  it('copies every region for a world that has weather', () => {
    const world = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH);
    const block = new Int32Array(SNAPSHOT_WEATHER_CELLS);

    expect(writeWeatherBlock(world.weather, world.weatherField, block)).toBe(WEATHER_REGION_COUNT);
    for (let at = 0; at < WEATHER_REGION_COUNT; at++) {
      expect(block[at]).toBe(world.weatherField.cells[at]);
    }
  });

  it('travels through the double buffer with its own count', () => {
    const buffer = createSnapshotBuffer();
    const writer = new SnapshotWriter(buffer);
    const reader = new SnapshotReader(buffer);
    const world = play(makeWorld(WeatherRule.Harsh), TICKS_PER_MONTH);

    writer.draftI32[SnapshotI32.WeatherCount] = writeWeatherBlock(
      world.weather,
      world.weatherField,
      writer.draftWeather,
    );
    writer.publish();

    const published = reader.currentWeather();
    expect(published.count).toBe(WEATHER_REGION_COUNT);
    for (let at = 0; at < WEATHER_REGION_COUNT; at++) {
      expect(published.data[at]).toBe(world.weatherField.cells[at]);
    }
  });
});

describe('the region a tile lies in', () => {
  it('cuts every map into the same 16x16 grid', () => {
    for (const size of [64, 128, 512, 2048]) {
      expect(weatherRegionOf(0, 0, size)).toBe(0);
      expect(weatherRegionOf(size - 1, 0, size)).toBe(WEATHER_GRID_SIZE - 1);
      expect(weatherRegionOf(0, size - 1, size)).toBe(WEATHER_GRID_SIZE * (WEATHER_GRID_SIZE - 1));
      expect(weatherRegionOf(size - 1, size - 1, size)).toBe(WEATHER_REGION_COUNT - 1);
    }
  });

  it('maps every tile of a map into the field, and every region is reachable', () => {
    const size = 64;
    const seen = new Set<number>();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const region = weatherRegionOf(x, y, size);
        expect(region).toBeGreaterThanOrEqual(0);
        expect(region).toBeLessThan(WEATHER_REGION_COUNT);
        seen.add(region);
      }
    }
    expect(seen.size).toBe(WEATHER_REGION_COUNT);
  });
});

/**
 * The storm warnings of SPEC2 M18's third bundle (D-202).
 *
 * The sky already costs money (D-201); this is the half that tells the player
 * it is about to. Three properties, and none of them is about the weather
 * model: a warning is written when a storm ARRIVES over a region the player
 * has a station in, it is written once rather than daily while the front
 * stands, and a world with the rule off never writes one - the field's arrival
 * buffer is never even touched there.
 */
describe('the storm warning (SPEC2 M18)', () => {
  const STORM_SIZE = 64;
  const STORM_DAYS = 120;

  function stormWorld(weather: WeatherRule, withStation: boolean, seed = 7): Scenario {
    const town = makeTown(0, 30, 30, 1_200, 'Sturmstadt');
    const scenario = flatScenario(STORM_SIZE, [town], [], seed, 0, true, weather);
    if (withStation) {
      apply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: town.x,
        y: town.y,
        moduleKind: ModuleKind.BusStop,
      });
    }
    for (let i = 0; i < STORM_DAYS * TICKS_PER_DAY; i++) {
      scenario.world.step(scenario.queue, null);
    }
    return scenario;
  }

  function warnings(world: World): readonly { tileIndex: number }[] {
    return world.news.all.filter((entry) => entry.messageKey === 'news.stormWarning');
  }

  it('warns about the region the player has a station in', () => {
    const scenario = stormWorld(WeatherRule.Harsh, true);
    const world = scenario.world;
    const station = world.stations[0]!;
    const posted = warnings(world);

    expect(posted.length).toBeGreaterThan(0);
    for (const entry of posted) {
      expect(entry.tileIndex).toBe(world.map.tileIndex(station.x, station.y));
    }
    // It names the station, in the log's own convention: a parameter the
    // interface prints, never a sentence the simulation composed.
    const first = world.news.all.find((entry) => entry.messageKey === 'news.stormWarning')!;
    expect(first.params['station']).toBe(station.name);
    expect(first.category).toBe(NewsCategory.Weather);
  });

  it('is silent about a storm over land the player has nothing on', () => {
    // The identical world, identical seed, identical weather - only the
    // station is missing. Every storm of those four months still happened.
    const withStation = stormWorld(WeatherRule.Harsh, true);
    const without = stormWorld(WeatherRule.Harsh, false);
    expect(warnings(withStation.world).length).toBeGreaterThan(0);
    expect(warnings(without.world)).toHaveLength(0);
  });

  it('writes once per front, not once per day it stands', () => {
    const world = stormWorld(WeatherRule.Harsh, true).world;
    const entries = world.news.all;
    // The arrival edge is what bounds this: a standing storm produces no
    // second entry, so consecutive storm warnings about the same tile cannot
    // appear even when another warning came between them.
    let consecutive = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i]!.messageKey !== 'news.stormWarning') continue;
      if (entries[i - 1]!.messageKey === 'news.stormWarning') consecutive++;
    }
    expect(consecutive).toBe(0);
    // And there are far fewer warnings than there were days: a front lasts
    // about a week, so four months of harsh weather is a handful of them.
    expect(warnings(world).length).toBeLessThan(STORM_DAYS / 4);
  });

  it('never writes one in a world with the rule off', () => {
    const world = stormWorld(WeatherRule.Off, true).world;
    expect(warnings(world)).toHaveLength(0);
    // Provably inert rather than merely quiet: the arrival buffer the report
    // reads was never written, because `updateWeather` returns before it.
    expect(world.weatherField.arrivalCount).toBe(0);
  });
});
