import { beforeAll, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/sim/constants';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import {
  buildMeasuredWorld,
  MEASURED_MAP_SIZE,
  MEASURED_VEHICLES,
  stateHistogram,
  workingCount,
  type MeasuredWorld,
} from './fixture1500';

/**
 * The hard budgets of section 21, measured against the world that section
 * actually names: 1,500 working vehicles, 1024^2 map, 120 towns, 300
 * industries.
 *
 * Until M10 this file measured 300 road vehicles and printed a linear
 * projection to 1,500 (D-120). SPEC2's Z6 ends that: every tick-millisecond
 * promise in the shared-resource ledger is priced against the MEASURED
 * 1,500-vehicle baseline, so the p99 here is asserted against the eight
 * milliseconds of section 21 and its measured value is the ledger's M10 row.
 * If it will not fit, the ledger's own escalation path applies - an edge-graph
 * milestone before M14 - and no constant gets quietly tuned to dodge that.
 *
 * The timing is done FROM THE TEST rather than from inside the simulation:
 * `performance` is banned in `src/sim` by architecture law #3 and the ban is
 * enforced by `tests/unit/lint-rules.spec.ts`.
 */

/** Section 21: at 1,500 vehicles on a 1024 map, p99 of a tick. [ms] */
const TICK_P99_BUDGET_MS = 8;

/** Section 19.1 / 21: a 1024 save with 1,500 vehicles, read back. [ms] */
const LOAD_BUDGET_MS = 3_000;

/**
 * Ticks sampled for the percentile. More than one game month, deliberately:
 * the daily collection gate fires 32 times and the monthly production,
 * town-growth and finance hooks at least once inside the window, so the p99
 * covers the simulation's expensive ticks rather than its cheap ones.
 */
const SAMPLE_TICKS = 6_500;

let fixture: MeasuredWorld;

beforeAll(() => {
  fixture = buildMeasuredWorld();
}, 600_000);

describe('performance budgets of section 21', () => {
  it('holds the tick budget with 1,500 working vehicles on a 1024 map', () => {
    const { world, queue } = fixture;

    // The claim "1,500 vehicles" is only worth what the fleet is doing, so
    // the fixture proves it before anything is timed: nobody parked, nobody
    // routeless, and at most a straggler or two still filing out of a shed.
    const histogram = [...stateHistogram(world).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([state, count]) => `${state}:${count}`)
      .join(' ');
    const working = workingCount(world);
    console.log(
      `perf fixture: ${world.vehicles.livingCount} vehicles (${working} working), ` +
        `${world.stations.length} stations, ${world.towns.length} towns, ` +
        `${world.industries.length} industries on ${MEASURED_MAP_SIZE}^2 - states ${histogram}`,
    );
    expect(world.vehicles.livingCount).toBe(MEASURED_VEHICLES);
    expect(stateHistogram(world).get(VehicleState.Stopped) ?? 0).toBe(0);
    expect(stateHistogram(world).get(VehicleState.NoRoute) ?? 0).toBe(0);
    expect(working).toBeGreaterThanOrEqual(MEASURED_VEHICLES - 10);

    // Warm the caches: the first ticks after a build rebuild the block index
    // and the land masses, and measuring that would measure the wrong thing.
    for (let i = 0; i < 200; i++) world.step(queue, null);

    const samples = new Float64Array(SAMPLE_TICKS);
    for (let i = 0; i < SAMPLE_TICKS; i++) {
      const started = performance.now();
      world.step(queue, null);
      samples[i] = performance.now() - started;
    }

    const sorted = Array.from(samples).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    const max = sorted[sorted.length - 1]!;

    // The ledger's baseline row. LOGGED as well as asserted: SPEC2 section
    // 6.1 prices fifteen milestones of tick deltas against these two
    // numbers, and a regression that stays under 8 ms still has to be seen.
    console.log(
      `tick with ${MEASURED_VEHICLES} working vehicles on ${MEASURED_MAP_SIZE}^2: ` +
        `p50 ${p50.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, max ${max.toFixed(3)} ms ` +
        `over ${SAMPLE_TICKS} ticks (budget p99 <= ${TICK_P99_BUDGET_MS} ms)`,
    );

    expect(p99).toBeLessThan(TICK_P99_BUDGET_MS);
  }, 300_000);

  it('reads a large save back inside three seconds', () => {
    const { world, queue } = fixture;
    const writeStarted = performance.now();
    const bytes = encodeSave(world, queue, '0.1.0');
    const writeMs = performance.now() - writeStarted;

    const started = performance.now();
    const loaded = decodeSave(bytes);
    const elapsed = performance.now() - started;

    console.log(
      `save of a ${MEASURED_MAP_SIZE}^2 world with ${MEASURED_VEHICLES} vehicles: ` +
        `${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB, written in ${writeMs.toFixed(0)} ms, ` +
        `read back in ${elapsed.toFixed(0)} ms (read budget ${LOAD_BUDGET_MS})`,
    );

    expect(loaded.world.map.size).toBe(MEASURED_MAP_SIZE);
    expect(loaded.world.vehicles.livingCount).toBe(MEASURED_VEHICLES);
    expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
  });

  it('keeps a day of simulation inside the budget the tick p99 implies', () => {
    // A game day is 200 ticks and takes ten seconds of real time at 1x. The
    // old 300-vehicle fixture held a day under 500 ms - a 20x speed promise -
    // but at 1,500 vehicles section 21 promises 8 ms per tick and nothing
    // faster, so the honest ceiling is 200 ticks at the tick budget. The log
    // still says what speed-up the full map actually sustains.
    const { world, queue } = fixture;
    const started = performance.now();
    for (let i = 0; i < TICKS_PER_DAY; i++) world.step(queue, null);
    const elapsed = performance.now() - started;

    const sustainedSpeed = (TICKS_PER_DAY * 1000) / 20 / elapsed;
    console.log(
      `one game day (${TICKS_PER_DAY} ticks) at ${MEASURED_VEHICLES} vehicles: ` +
        `${elapsed.toFixed(0)} ms - sustains about ${sustainedSpeed.toFixed(1)}x game speed`,
    );
    expect(elapsed).toBeLessThan(TICKS_PER_DAY * TICK_P99_BUDGET_MS);
  });
});
