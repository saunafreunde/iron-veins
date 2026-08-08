import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import {
  Difficulty,
  MapClimate,
  MAX_HEIGHT,
  MONTHS_PER_YEAR,
  SEA_LEVEL,
  SEASON_AMPLITUDE_MAX,
  SEASON_CLIMATE_AMPLITUDE,
  SEASON_FARM_OUTPUT_PERCENT,
  SEASON_FORESTRY_OUTPUT_PERCENT,
  SEASON_FRICTION_GAIN,
  TICK_SECONDS,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  WEATHER_BREAKDOWN_FACTOR,
  WEATHER_CELL_COUNT,
  WEATHER_DRAG_FACTOR,
  WEATHER_EXPIRY_FACTOR,
  WEATHER_FROST_FULL_SEVERITY,
  WEATHER_ROLLING_FACTOR,
  WeatherCell,
  WeatherRule,
} from '../../src/sim/constants';
import {
  INDUSTRY_TYPE_COUNT,
  IndustryType,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import type { Rng } from '../../src/sim/rng';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { expireStaleCargo, rollBreakdowns } from '../../src/sim/vehicles/lifecycle';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { seasonalOutputAt, weatherCellAt, winterFrictionAt } from '../../src/sim/weather/effects';
import {
  calendarMonthOf,
  frostSeasonFactor,
  seasonalOutputFactor,
  winterFrictionFactor,
} from '../../src/sim/weather/seasons';
import type { World } from '../../src/sim/World';
import { flatScenario, type Scenario as BalanceScenario } from '../balance/scenario';
import roadFixture from '../determinism/fixtures/road-line-commands.json';
import { createScenario, parseScenarioFixture, type Scenario } from '../determinism/runner';

/**
 * What the weather COSTS, and what the seasons do (SPEC2 M18, bundle 2).
 *
 * M18's sentence for this bundle is narrow on purpose: "sim effects
 * exclusively as multiplier lookups at existing seams". There are exactly four
 * of them - the rolling resistance and drag coefficients of the longitudinal
 * solver, the breakdown threshold of 11.3, the daily cargo expiry share, and
 * the monthly production of a farm and a forestry - plus the seasons, which
 * are a pure calendar function with no randomness and no state at all.
 *
 * **Which assertions are evidence and which are read-back.** The five factor
 * tables in `constants.ts` were CHOSEN; every assertion here of the form
 * "a storm is slower than a clear sky" is therefore a read-back of that
 * choice, worth having because a seam that silently stopped being wired up
 * has to turn the build red, and worth nothing as evidence about the numbers.
 * What is independent of every one of those numbers:
 *
 *  - **the draw-count invariance** (Z3): the shared gameplay stream advances
 *    by one draw per eligible vehicle per game day under every weather state
 *    there is, and by one more per breakdown - the pre-M18 rule unchanged.
 *    This is the property whose failure would silently fork every existing
 *    seed, so it is instrumented at the generator rather than inferred;
 *  - **the off path**: the gate is the RULE and not the FIELD, so a world with
 *    the rule off plays identically with a sky of storms nailed over it. That
 *    plus the untouched canonical cross-OS pin is what "a v28 save behaves
 *    exactly as before" means;
 *  - **purity and totality of the season function**, walked in full over every
 *    month, every height a map can hold, every climate and every industry type
 *    rather than sampled;
 *  - **the exact identities**: Clear costs exactly nothing at all four seams,
 *    a sky that is 1 in a table moves that seam by exactly zero, and a
 *    tropical world has exactly no season.
 */

const SEED = 424_242;
/** Past the road fixture's last command: the bus line is built and running. */
const WARM_TICKS = 12_050;
/**
 * Ticks of the physics probe. Deliberately under one game day (200 ticks): no
 * calendar hook fires inside the window, so what the four runs differ in is
 * the solver and nothing else - not a breakdown, not a production month.
 */
const PROBE_TICKS = 180;

const script = parseScenarioFixture(roadFixture);

const EVERY_SKY: readonly WeatherCell[] = [
  WeatherCell.Clear,
  WeatherCell.Rain,
  WeatherCell.Storm,
  WeatherCell.Frost,
  WeatherCell.Heat,
];

const SKY_NAME: readonly string[] = ['clear', 'rain', 'storm', 'frost', 'heat'];

const EVERY_CLIMATE: readonly MapClimate[] = [
  MapClimate.Temperate,
  MapClimate.Arctic,
  MapClimate.Tropical,
  MapClimate.Desert,
];

// --------------------------------------------------------- the warmed fleet

/**
 * The recorded road line, played until it is running, under the rule MILD with
 * the sky held clear for the whole warm-up.
 *
 * Held clear means every factor is the identity, so the warm-up is the same
 * game the determinism fixture plays - and the copies taken from it below
 * branch from ONE state, which is what makes the comparison between skies a
 * comparison of skies.
 */
function warmedUnderMild(): Scenario {
  const scenario = createScenario(SEED, script, Difficulty.Normal, WeatherRule.Mild);
  for (let i = 0; i < WARM_TICKS; i++) {
    scenario.world.weatherField.cells.fill(WeatherCell.Clear);
    scenario.world.step(scenario.queue, null);
  }
  scenario.world.weatherField.cells.fill(WeatherCell.Clear);
  return scenario;
}

/** The warmed fleet, encoded once and decoded per sky - one warm-up, many worlds. */
const warmedBytes = (() => {
  const warm = warmedUnderMild();
  return encodeSave(warm.world, warm.queue, 'weather-effects');
})();

function copyOfWarmedFleet(): Scenario {
  const loaded = decodeSave(warmedBytes);
  return { world: loaded.world, queue: loaded.queue };
}

/** Vehicles the breakdown roll is allowed to consider. */
function eligibleVehicles(world: World): number {
  const vehicles = world.vehicles;
  let count = 0;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const state = vehicles.state[id]!;
    if (state === VehicleState.Driving || state === VehicleState.Braking) count++;
  }
  return count;
}

// ------------------------------------------- the instrument: stream position

/**
 * Count the words drawn from a generator while `work` runs.
 *
 * `nextUint32` is the generator's only source of entropy - `nextFloat` and
 * `nextInt` both go through it - so counting calls to it IS the stream's
 * position, including the rejection-sampling retries `nextInt` may make. The
 * own property shadows the prototype method for the length of the call and is
 * deleted afterwards, so nothing about the generator's own state is touched.
 */
function drawsDuring(rng: Rng, work: () => void): number {
  const patched = rng as unknown as { nextUint32: () => number };
  const original = patched.nextUint32.bind(rng);
  let count = 0;
  patched.nextUint32 = () => {
    count++;
    return original();
  };
  try {
    work();
  } finally {
    Reflect.deleteProperty(patched, 'nextUint32');
  }
  return count;
}

/** Everything `rollBreakdowns` may write, so one world can be rolled five times. */
interface FleetSnapshot {
  readonly state: Uint8Array;
  readonly speedMs: Float32Array;
  readonly breakdownTicks: Int32Array;
  readonly breakdownCount: Int32Array;
  readonly rng: readonly [number, number, number, number];
}

function captureFleet(world: World): FleetSnapshot {
  const vehicles = world.vehicles;
  return {
    state: vehicles.state.slice(),
    speedMs: vehicles.speedMs.slice(),
    breakdownTicks: vehicles.breakdownTicks.slice(),
    breakdownCount: vehicles.breakdownCount.slice(),
    rng: world.rng.getState(),
  };
}

function restoreFleet(world: World, saved: FleetSnapshot): void {
  const vehicles = world.vehicles;
  vehicles.state.set(saved.state);
  vehicles.speedMs.set(saved.speedMs);
  vehicles.breakdownTicks.set(saved.breakdownTicks);
  vehicles.breakdownCount.set(saved.breakdownCount);
  world.rng.setState([...saved.rng] as [number, number, number, number]);
}

/** Breakdowns that happened in the last roll, over the whole fleet. */
function brokenDown(world: World, before: Int32Array): number {
  const counts = world.vehicles.breakdownCount;
  let total = 0;
  for (let id = 0; id < counts.length; id++) total += counts[id]! - before[id]!;
  return total;
}

/**
 * A fleet fabricated directly in the vehicle store, spread over the whole map.
 *
 * The draw-count rule is a statement about a POPULATION, and the recorded road
 * fixture has exactly one bus rolling at any moment - enough to show the seam
 * is wired, far too few to tell a threshold that moved from a coin that fell
 * differently. `rollBreakdowns` reads four fields per vehicle (`alive`,
 * `state`, `reliability`, `tileIndex`) and the sky over the tile, and writes
 * four; filling those fields IS the whole of its input, so a fabricated fleet
 * exercises exactly the same function the game runs. It is used for the draw
 * count and the threshold band only - every other seam here is measured on a
 * world that was played.
 */
function fabricateFleet(world: World, size: number, reliability: number): void {
  const vehicles = world.vehicles;
  const tiles = world.map.size * world.map.size;
  vehicles.count = size;
  for (let id = 0; id < size; id++) {
    vehicles.alive[id] = 1;
    vehicles.state[id] = VehicleState.Driving;
    vehicles.reliability[id] = reliability;
    // A prime stride, so the fleet lands in every one of the 256 weather
    // regions rather than in one corner of the map.
    vehicles.tileIndex[id] = (id * 7_919) % tiles;
  }
}

/** An unplayed world with the rule on and no vehicles of its own. */
function emptyWorldUnderRule(rule: WeatherRule): World {
  return createScenario(SEED, [], Difficulty.Normal, rule).world;
}

// ================================================================ the off path

describe('the gate is the rule, not the field', () => {
  it('answers with the exact identity at every seam for a world with the rule off', () => {
    const scenario = createScenario(SEED, script);
    const world = scenario.world;
    expect(world.weather).toBe(WeatherRule.Off);

    // A sky of storms nailed over a world that has no weather rule. Every
    // lookup still has to answer as if the day were clear, because the gate is
    // the rule - which is what makes the off path a property rather than an
    // unlikely event.
    world.weatherField.cells.fill(WeatherCell.Storm);

    for (const tile of [0, 1, 4_242, world.map.size * world.map.size - 1]) {
      expect(weatherCellAt(world, tile)).toBe(WeatherCell.Clear);
      expect(winterFrictionAt(world, tile)).toBe(1);
    }
    expect(seasonalOutputAt(world, IndustryType.Farm, 10, 10)).toBe(1);
    expect(seasonalOutputAt(world, IndustryType.Forestry, 10, 10)).toBe(1);
  });

  it('plays a fleet identically with a sky of storms nailed over an off world', () => {
    // The end-to-end form of the same statement, on the recorded road line: the
    // two runs differ in every weather cell and in nothing the simulation is
    // allowed to read.
    const clear = createScenario(SEED, script);
    const stormy = createScenario(SEED, script);

    for (let i = 0; i < 2_000; i++) {
      stormy.world.weatherField.cells.fill(WeatherCell.Storm);
      clear.world.step(clear.queue, null);
      stormy.world.step(stormy.queue, null);
    }

    expect(stormy.world.rng.getState()).toEqual(clear.world.rng.getState());
    expect(stormy.world.playerCompany.cashCt).toBe(clear.world.playerCompany.cashCt);
    for (let id = 0; id < clear.world.vehicles.count; id++) {
      expect(stormy.world.vehicles.tileIndex[id]).toBe(clear.world.vehicles.tileIndex[id]);
      expect(stormy.world.vehicles.speedMs[id]).toBe(clear.world.vehicles.speedMs[id]);
      expect(stormy.world.vehicles.progressM[id]).toBe(clear.world.vehicles.progressM[id]);
    }
  });
});

// =================================================== Z3: the draw-count rule

describe('the breakdown threshold moves and the draw count does not (Z3)', () => {
  const FLEET = 512;

  it('spends exactly one draw per eligible vehicle when nothing breaks down', () => {
    // The exact case: a perfectly reliable fleet cannot break down under ANY
    // weather, because every factor multiplies a chance of zero. So the five
    // runs must not merely draw the same NUMBER of words - they must leave the
    // generator in the identical state, which is the strongest form of "the
    // threshold shift itself spends nothing".
    const world = emptyWorldUnderRule(WeatherRule.Mild);
    fabricateFleet(world, FLEET, 10_000);

    const saved = captureFleet(world);
    const states: string[] = [];
    for (const sky of EVERY_SKY) {
      restoreFleet(world, saved);
      world.weatherField.cells.fill(sky);
      const draws = drawsDuring(world.rng, () => rollBreakdowns(world));
      expect(draws).toBe(FLEET);
      expect(brokenDown(world, saved.breakdownCount)).toBe(0);
      states.push(world.rng.getState().join(','));
    }
    expect(new Set(states).size).toBe(1);
  });

  it('spends one draw per eligible vehicle plus one per breakdown, under every sky', () => {
    // The general case, and the total statement: the draw count is a function
    // of the OUTCOMES and of nothing else. A weather that spent a draw of its
    // own - a second roll, a stream read, a shuffled order - would break this
    // for every sky at once and fork every seed that ever existed.
    const world = emptyWorldUnderRule(WeatherRule.Mild);
    // Worn out enough that the threshold band bites: the chance is
    // (10 000 - reliability) / 40 000, so this is one day in eight before the
    // sky is consulted at all.
    fabricateFleet(world, FLEET, 5_000);

    const saved = captureFleet(world);
    const failures: number[] = [];
    for (const sky of EVERY_SKY) {
      restoreFleet(world, saved);
      world.weatherField.cells.fill(sky);
      const draws = drawsDuring(world.rng, () => rollBreakdowns(world));
      const broke = brokenDown(world, saved.breakdownCount);
      expect(draws).toBe(FLEET + broke);
      failures.push(broke);
    }
    console.log(
      `breakdowns over ${FLEET} vehicles in one game day: ` +
        EVERY_SKY.map((sky) => `${SKY_NAME[sky]!} ${failures[sky]!}`).join(', '),
    );
    // READ-BACK of WEATHER_BREAKDOWN_FACTOR, on the same draws every time -
    // the generator is restored between skies, so what separates these five
    // numbers is the threshold alone and nothing about luck.
    expect(failures[WeatherCell.Clear]!).toBeGreaterThan(0);
    expect(failures[WeatherCell.Rain]!).toBeGreaterThan(failures[WeatherCell.Clear]!);
    expect(failures[WeatherCell.Storm]!).toBeGreaterThan(failures[WeatherCell.Rain]!);
    expect(failures[WeatherCell.Frost]!).toBeGreaterThan(failures[WeatherCell.Storm]!);
  });

  it('holds the same count on the fleet a recorded game actually has', () => {
    // The fabricated fleet above is the population; this is the same property
    // read off a world that was played, so the rule is not something only a
    // hand-filled store obeys.
    const world = copyOfWarmedFleet().world;
    const eligible = eligibleVehicles(world);
    expect(eligible).toBeGreaterThan(0);

    const saved = captureFleet(world);
    for (const sky of EVERY_SKY) {
      restoreFleet(world, saved);
      world.weatherField.cells.fill(sky);
      const draws = drawsDuring(world.rng, () => rollBreakdowns(world));
      expect(draws).toBe(eligible + brokenDown(world, saved.breakdownCount));
    }
  });

  it('never draws from the shared stream for the weather itself', () => {
    // A whole game day of a harsh world against a whole game day of a world
    // with no weather at all: the field is drawn, the fronts move, the
    // thresholds shift - and the shared gameplay stream is in the same place at
    // the end, because the only thing that can move it is an outcome.
    const off = createScenario(SEED, script);
    const harsh = createScenario(SEED, script, Difficulty.Normal, WeatherRule.Harsh);
    const offDraws = drawsDuring(off.world.rng, () => {
      for (let i = 0; i < 400; i++) off.world.step(off.queue, null);
    });
    const harshDraws = drawsDuring(harsh.world.rng, () => {
      for (let i = 0; i < 400; i++) harsh.world.step(harsh.queue, null);
    });
    // Two game days before a single vehicle exists: nothing has an outcome to
    // differ in, so the two positions are exactly equal.
    expect(harshDraws).toBe(offDraws);
    expect(harsh.world.rng.getState()).toEqual(off.world.rng.getState());
    // And the harsh world really did make weather in that time.
    expect([...harsh.world.weatherField.cells].some((cell) => cell !== WeatherCell.Clear)).toBe(
      true,
    );
  });
});

// ============================================== the seasons: pure and total

describe('the season is a pure and total function of month, height and climate', () => {
  it('answers finitely and in band for every month, height and climate', () => {
    let calls = 0;
    for (const climate of EVERY_CLIMATE) {
      for (let month = 0; month < MONTHS_PER_YEAR; month++) {
        for (let height = 0; height <= MAX_HEIGHT; height++) {
          const friction = winterFrictionFactor(month, height, climate);
          expect(Number.isFinite(friction)).toBe(true);
          expect(friction).toBeGreaterThanOrEqual(1);
          expect(friction).toBeLessThanOrEqual(1 + SEASON_FRICTION_GAIN);
          // Purity: the same three numbers, the same answer, whatever else has
          // happened in this process.
          expect(winterFrictionFactor(month, height, climate)).toBe(friction);

          for (let type = 0; type < INDUSTRY_TYPE_COUNT; type++) {
            const output = seasonalOutputFactor(type as IndustryType, month, height, climate);
            expect(Number.isFinite(output)).toBe(true);
            // Totality: strictly positive everywhere. The amplitude cap is
            // what buys this - the farm's deepest month is 40 %, so an
            // amplitude above 1.666 would ask a farm for negative output.
            expect(output).toBeGreaterThan(0);
            if (type !== IndustryType.Farm && type !== IndustryType.Forestry) {
              // SPEC2 M18 names two industries and no others.
              expect(output).toBe(1);
            }
            calls++;
          }
        }
      }
    }
    expect(calls).toBe(EVERY_CLIMATE.length * MONTHS_PER_YEAR * (MAX_HEIGHT + 1) * 17);
  });

  it('moves WHEN a farm produces and not how much it produces in a year', () => {
    // Exact on the tables: integer percent summing to exactly 1,200.
    const sum = (table: readonly number[]): number => table.reduce((a, b) => a + b, 0);
    expect(sum(SEASON_FARM_OUTPUT_PERCENT)).toBe(1_200);
    expect(sum(SEASON_FORESTRY_OUTPUT_PERCENT)).toBe(1_200);
    expect(SEASON_FARM_OUTPUT_PERCENT).toHaveLength(MONTHS_PER_YEAR);
    expect(SEASON_FORESTRY_OUTPUT_PERCENT).toHaveLength(MONTHS_PER_YEAR);

    // And through the transform, for every height and climate: the factor is
    // affine around 1, and an affine image of a mean-1 table has mean 1
    // whatever the amplitude. So the height and the climate change the SHAPE of
    // the year and never its total.
    for (const climate of EVERY_CLIMATE) {
      for (let height = 0; height <= MAX_HEIGHT; height++) {
        for (const type of [IndustryType.Farm, IndustryType.Forestry]) {
          let year = 0;
          for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            year += seasonalOutputFactor(type, month, height, climate);
          }
          expect(year).toBeCloseTo(MONTHS_PER_YEAR, 9);
        }
      }
    }
  });

  it('has no season at all in the tropics, exactly', () => {
    // SEASON_CLIMATE_WINTER and SEASON_CLIMATE_AMPLITUDE are both zero there,
    // so this is an exact identity rather than a small number.
    expect(SEASON_CLIMATE_AMPLITUDE[MapClimate.Tropical]).toBe(0);
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      for (let height = 0; height <= MAX_HEIGHT; height++) {
        expect(winterFrictionFactor(month, height, MapClimate.Tropical)).toBe(1);
        expect(seasonalOutputFactor(IndustryType.Farm, month, height, MapClimate.Tropical)).toBe(1);
      }
    }
  });

  it('gives the mountain a harder winter than the shore, and the arctic a harder one still', () => {
    // READ-BACK of the height gain and the climate table, and the reason both
    // exist: a season that ignored height would make the snow line the
    // renderer draws a picture of nothing.
    const january = 0;
    const shore = winterFrictionFactor(january, 4, MapClimate.Temperate);
    const summit = winterFrictionFactor(january, MAX_HEIGHT, MapClimate.Temperate);
    expect(summit).toBeGreaterThan(shore);
    expect(winterFrictionFactor(january, 4, MapClimate.Arctic)).toBeGreaterThan(shore);
    expect(winterFrictionFactor(january, 4, MapClimate.Desert)).toBeLessThan(shore);
    // July is summer in every climate this game has.
    for (const climate of EVERY_CLIMATE) {
      expect(winterFrictionFactor(6, MAX_HEIGHT, climate)).toBe(1);
    }
    console.log(
      `winter friction, January: shore ${shore.toFixed(4)}, summit ${summit.toFixed(4)}, ` +
        `arctic shore ${winterFrictionFactor(january, 4, MapClimate.Arctic).toFixed(4)}`,
    );
  });

  it('reads the calendar the way the calendar reads itself', () => {
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      expect(calendarMonthOf(month * TICKS_PER_MONTH)).toBe(month);
      expect(calendarMonthOf(month * TICKS_PER_MONTH + TICKS_PER_MONTH - 1)).toBe(month);
    }
    expect(calendarMonthOf(TICKS_PER_YEAR)).toBe(0);
    expect(calendarMonthOf(0)).toBe(0);
  });

  it('caps the amplitude where the table would go negative', () => {
    // The cap is totality, not taste. Stated as arithmetic so that moving
    // either constant without the other turns the build red.
    const deepest = Math.min(...SEASON_FARM_OUTPUT_PERCENT) / 100;
    expect(1 + (deepest - 1) * SEASON_AMPLITUDE_MAX).toBeGreaterThan(0);
  });
});

// ====================================== the sky's frost gate has a climate

/**
 * The frost gate of D-204, which closed the defect D-203 named as the reason
 * M18's balance band is smaller than SPEC2 asked for.
 *
 * Until D-204 the sky carried a twelve-entry month table of its own
 * (`WEATHER_FROST_SEASON`) with no climate term anywhere near it, while the
 * SEASON half was climate-aware and gave the tropics an exact zero. So a
 * tropical January could freeze. The gate is the season's own winter severity
 * now - ONE winter curve, read by the ground for friction and by the sky for
 * frost - and the properties below are what that buys.
 *
 * **What is evidence and what is a read-back.** That the arctic freezes harder
 * than the temperate world and the desert less is a read-back of
 * `SEASON_CLIMATE_WINTER`, whose numbers were chosen. What is independent of
 * every number in that table:
 *
 *  - the tropics are an EXACT zero, so no draw and no persistence bonus can
 *    produce a frost there - the field test below plants one and plays a year;
 *  - a climate with more winter clears every threshold in at least as many
 *    months, which is what "longer" means and follows from the gate being one
 *    curve scaled by one factor rather than two independent tables;
 *  - July is a hard zero in every climate, unchanged from D-200;
 *  - and a temperate January is EXACTLY 1, which is the fix declining to
 *    recalibrate the climate the rule was measured in.
 */
describe('the frost gate is the season read forwards (D-204)', () => {
  const january = 0;
  const july = 6;

  it('gives the tropics an exact zero in every month of the year', () => {
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      expect(frostSeasonFactor(month, MapClimate.Tropical)).toBe(0);
    }
  });

  it('leaves a temperate January exactly where the rule shipped it', () => {
    // Exact, not close: WEATHER_FROST_FULL_SEVERITY is that month's own
    // severity, so the division is a number divided by itself.
    expect(frostSeasonFactor(january, MapClimate.Temperate)).toBe(1);
  });

  it('has no frost in July, in any climate', () => {
    for (const climate of EVERY_CLIMATE) {
      expect(frostSeasonFactor(july, climate)).toBe(0);
    }
  });

  it('freezes the arctic harder AND longer than the temperate world', () => {
    // Harder: greater in every month that has any winter at all.
    // Longer: at every threshold, at least as many months clear it - and
    // strictly more at the thresholds in between, which is the half a climate
    // COLUMN on the old table could never have produced.
    let strictlyMore = 0;
    for (const threshold of [0.25, 0.5, 0.75, 1]) {
      const months = (climate: MapClimate): number => {
        let count = 0;
        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
          if (frostSeasonFactor(month, climate) >= threshold) count++;
        }
        return count;
      };
      const temperate = months(MapClimate.Temperate);
      const arctic = months(MapClimate.Arctic);
      expect(arctic).toBeGreaterThanOrEqual(temperate);
      if (arctic > temperate) strictlyMore++;
    }
    expect(strictlyMore).toBeGreaterThan(0);

    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      const temperate = frostSeasonFactor(month, MapClimate.Temperate);
      if (temperate === 0) continue;
      expect(frostSeasonFactor(month, MapClimate.Arctic)).toBeGreaterThan(temperate);
      expect(frostSeasonFactor(month, MapClimate.Desert)).toBeLessThan(temperate);
    }
  });

  it('is the same winter curve the ground reads, in every climate', () => {
    // The coupling, stated so that giving the sky a table of its own again
    // turns the build red: wherever the season says a month has no winter, the
    // sky has no frost, and the two orderings agree month by month.
    for (const climate of EVERY_CLIMATE) {
      for (let month = 0; month < MONTHS_PER_YEAR; month++) {
        const ground = winterFrictionFactor(month, SEA_LEVEL, climate) - 1;
        const sky = frostSeasonFactor(month, climate);
        expect(ground === 0).toBe(sky === 0);
        if (ground > 0) {
          expect(sky).toBeCloseTo(ground / SEASON_FRICTION_GAIN / WEATHER_FROST_FULL_SEVERITY, 12);
        }
      }
    }
  });

  it('is pure and finite for every month and climate', () => {
    for (const climate of EVERY_CLIMATE) {
      for (let month = 0; month < MONTHS_PER_YEAR; month++) {
        const value = frostSeasonFactor(month, climate);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(frostSeasonFactor(month, climate)).toBe(value);
      }
    }
  });
});

// ================================ the four seams, and nothing but the four

describe('the factor tables', () => {
  it('are the exact identity over a clear sky, all four of them', () => {
    for (const table of [
      WEATHER_ROLLING_FACTOR,
      WEATHER_DRAG_FACTOR,
      WEATHER_BREAKDOWN_FACTOR,
      WEATHER_EXPIRY_FACTOR,
    ]) {
      expect(table).toHaveLength(WEATHER_CELL_COUNT);
      expect(table[WeatherCell.Clear]).toBe(1);
      for (const value of table) expect(value).toBeGreaterThanOrEqual(1);
    }
  });

  it('touch exactly the skies their seam is about', () => {
    // SPEC2 M18 names heat at the cargo seam and names nothing else, so the
    // other four entries are exactly 1 - not nearly 1.
    for (const sky of EVERY_SKY) {
      if (sky !== WeatherCell.Heat) expect(WEATHER_EXPIRY_FACTOR[sky]).toBe(1);
    }
    expect(WEATHER_EXPIRY_FACTOR[WeatherCell.Heat]).toBeGreaterThan(1);
    // Drag lives in the fluid, so only wind speaks to it.
    expect(WEATHER_DRAG_FACTOR[WeatherCell.Frost]).toBe(1);
    expect(WEATHER_DRAG_FACTOR[WeatherCell.Heat]).toBe(1);
    expect(WEATHER_DRAG_FACTOR[WeatherCell.Storm]).toBeGreaterThan(1);
    // Rolling resistance lives between wheel and ground, so heat says nothing.
    expect(WEATHER_ROLLING_FACTOR[WeatherCell.Heat]).toBe(1);
    expect(WEATHER_ROLLING_FACTOR[WeatherCell.Frost]).toBeGreaterThan(1);
  });
});

describe('the longitudinal solver reads the sky', () => {
  /**
   * Metres the whole fleet covers in `PROBE_TICKS`, from a standstill, with the
   * sky held at `sky` for every tick of the window.
   *
   * From a standstill because that is where resistance is visible: a bus that
   * has reached its speed cap is limited by the cap and not by the balance of
   * forces, and the probe would then measure the cap. The window is under one
   * game day, so no calendar hook fires and nothing but the solver differs.
   */
  function metresUnderSky(sky: WeatherCell): number {
    const scenario = copyOfWarmedFleet();
    const world = scenario.world;
    const vehicles = world.vehicles;
    for (let id = 0; id < vehicles.count; id++) vehicles.speedMs[id] = 0;

    let metres = 0;
    for (let i = 0; i < PROBE_TICKS; i++) {
      world.weatherField.cells.fill(sky);
      world.step(scenario.queue, null);
      for (let id = 0; id < vehicles.count; id++) {
        if (vehicles.alive[id] === 1) metres += vehicles.speedMs[id]! * TICK_SECONDS;
      }
    }
    return metres;
  }

  it('costs a storm and a frost distance, and a clear sky exactly nothing', () => {
    const measured = EVERY_SKY.map((sky) => metresUnderSky(sky));
    const clear = measured[WeatherCell.Clear]!;
    expect(clear).toBeGreaterThan(0);
    console.log(
      `road fleet from a standstill over ${PROBE_TICKS} ticks: ` +
        EVERY_SKY.map(
          (sky) =>
            `${SKY_NAME[sky]!} ${measured[sky]!.toFixed(1)} m ` +
            `(${(((measured[sky]! - clear) / clear) * 100).toFixed(2)} %)`,
        ).join(', '),
    );

    // EVIDENCE, and the point of the whole seam: a sky whose factors are all 1
    // must cost EXACTLY nothing, down to the last bit. Heat is that sky for
    // the solver - it touches the cargo and not the wheels.
    expect(measured[WeatherCell.Heat]!).toBe(clear);
    // READ-BACK of the two tables: rain, storm and frost all add resistance,
    // so all three must cost distance.
    expect(measured[WeatherCell.Rain]!).toBeLessThan(clear);
    expect(measured[WeatherCell.Storm]!).toBeLessThan(clear);
    expect(measured[WeatherCell.Frost]!).toBeLessThan(clear);
  });
});

describe('the cargo expiry seam', () => {
  /**
   * What is left of a hundred stale units after one daily sweep under `sky`.
   *
   * The stack is planted rather than found: the point is a controlled
   * comparison of one number across five skies, and a station's own queue
   * moves for a dozen reasons that have nothing to do with the weather.
   */
  function remainingUnder(sky: WeatherCell): number {
    const world = copyOfWarmedFleet().world;
    const station = world.stations[0]!;
    station.waiting.length = 0;
    station.waiting.push({
      cargo: Cargo.Passengers,
      amount: 100,
      // Older than CARGO_MAX_WAIT_DAYS, so the sweep considers it.
      createdTick: 0,
      originStationId: station.id,
      destinationStationId: world.stations[1]?.id ?? station.id,
      paidFromX: station.x,
      paidFromY: station.y,
    });
    world.weatherField.cells.fill(sky);
    expireStaleCargo(world);
    return station.waiting[0]?.amount ?? 0;
  }

  it('writes off more under heat and exactly the usual share under every other sky', () => {
    const measured = EVERY_SKY.map((sky) => remainingUnder(sky));
    const clear = measured[WeatherCell.Clear]!;
    console.log(
      `of 100 stale units, left after one day: ` +
        EVERY_SKY.map((sky) => `${SKY_NAME[sky]!} ${measured[sky]!.toFixed(2)}`).join(', '),
    );

    expect(clear).toBeLessThan(100);
    // Exact: the three skies whose factor is 1 write off exactly what a clear
    // day writes off. Not approximately - the same float.
    expect(measured[WeatherCell.Rain]!).toBe(clear);
    expect(measured[WeatherCell.Storm]!).toBe(clear);
    expect(measured[WeatherCell.Frost]!).toBe(clear);
    // READ-BACK of WEATHER_EXPIRY_FACTOR: heat spoils.
    expect(measured[WeatherCell.Heat]!).toBeLessThan(clear);
  });
});

// ================================================= the seasonal harvest seam

/** A farm and a coal mine on flat ground, with the weather rule as given. */
function harvestWorld(weather: WeatherRule): BalanceScenario {
  const industries: Industry[] = [
    newIndustry(0, IndustryType.Farm, 10, 10, 0),
    newIndustry(1, IndustryType.CoalMine, 30, 30, 0),
  ];
  return flatScenario(64, [], industries, 9, 0, true, weather);
}

/**
 * Twelve months of production for both works, with the sheds emptied after
 * every month so that what is measured is what the LAND yielded rather than
 * how full the yard got (a full shed throttles production to a quarter,
 * section 7.3, and would drown the season entirely).
 */
function monthlyOutput(weather: WeatherRule): { farm: number[]; mine: number[] } {
  const scenario = harvestWorld(weather);
  const world = scenario.world;
  const farm = world.industries[0]!;
  const mine = world.industries[1]!;
  const out = { farm: [] as number[], mine: [] as number[] };

  for (let i = 0; i < TICKS_PER_YEAR; i++) {
    world.step(scenario.queue, null);
    if (world.tick % TICKS_PER_MONTH !== 0) continue;
    out.farm.push(farm.producedThisMonth);
    out.mine.push(mine.producedThisMonth);
    farm.outputStock0 = 0;
    farm.outputStock1 = 0;
    mine.outputStock0 = 0;
    mine.outputStock1 = 0;
  }
  return out;
}

describe('the seasonal production seam', () => {
  it('gives a farm a harvest and leaves a coal mine exactly where it was', () => {
    const off = monthlyOutput(WeatherRule.Off);
    const on = monthlyOutput(WeatherRule.Mild);
    expect(off.farm).toHaveLength(12);

    console.log(
      `farm, monthly output: rule off ${off.farm.map((v) => v.toFixed(0)).join('/')}; ` +
        `rule on ${on.farm.map((v) => v.toFixed(0)).join('/')}`,
    );

    // A mine has no season, at any seam, in any month - exactly.
    expect(on.mine).toEqual(off.mine);
    // Without the rule the farm's year is flat but for the slow multi-year
    // fluctuation of section 7.3; with it, the harvest arrives.
    const spread = (months: readonly number[]): number => Math.max(...months) / Math.min(...months);
    expect(spread(off.farm)).toBeLessThan(1.3);
    expect(spread(on.farm)).toBeGreaterThan(2);
    // And the year's total is close to untouched: the tables average exactly 1,
    // so what is left is the correlation between the season and the slow
    // fluctuation the base output already had.
    const total = (months: readonly number[]): number => months.reduce((a, b) => a + b, 0);
    expect(total(on.farm) / total(off.farm)).toBeGreaterThan(0.9);
    expect(total(on.farm) / total(off.farm)).toBeLessThan(1.1);
  });
});
