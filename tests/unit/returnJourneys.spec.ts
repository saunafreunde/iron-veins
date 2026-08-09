import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GCProfiler } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { Cargo, PASSENGER_CLASS_COUNT, passengerClassIndex } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { SAVE_MAGIC } from '../../src/sim/save/format';
import { migrateSavePayload } from '../../src/sim/save/migrations';
import {
  RETURN_MEAN_MONTHS,
  RETURN_TRIP_SHARE,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
} from '../../src/sim/constants';
import {
  historySlot,
  STATION_HISTORY_FIELD_COUNT,
  StationHistoryField,
} from '../../src/sim/station/history';
import {
  createReturnState,
  generateReturnJourneys,
  ReturnField,
  returnPoolUnits,
  returnSlot,
  RETURN_STATE_SIZE,
  rollStationReturns,
} from '../../src/sim/station/returns';
import { ModuleKind, type Station } from '../../src/sim/station/types';
import type { World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, SCENARIO_SIZE, type Scenario } from '../balance/scenario';

/**
 * Return journeys (SPEC2 M19 bundle 3).
 *
 * A traveller who arrives somewhere goes home again. The simulation says so at
 * the DESTINATION, out of a twelve-month running mean of the imbalance between
 * what arrives there and what the place sends out of its own accord - never by
 * following a parcel back the way it came.
 *
 * The deliverable of this bundle is CONSERVATION: over any run, at every
 * station, the return journeys generated may not exceed the passengers
 * actually carried there. Demand must never appear from nothing. Three things
 * below are arranged so that claim cannot be satisfied by accident:
 *
 *  - the starvation case is measured explicitly. A running mean ALONE fails it
 *    by a factor this file computes rather than asserts vaguely: the mean of a
 *    dead flow decays over twelve months and the sum of that decay is twelve
 *    times the mean. The test states what the unclamped emission WOULD have
 *    been beside what the ledger allowed.
 *  - the long run asserts the inequality on every station of a played world,
 *    and only after asserting that a large number of returns were generated.
 *    "Nothing ever happened" passes conservation trivially and fails here.
 *  - the identity is triangulated against instruments this bundle does not
 *    own. At a terminus with no town of its own, every passenger that leaves
 *    is a return journey, so the ledger's `Generated` must equal what the M14
 *    history ring saw leave, lose and hold - three counters written by three
 *    other modules from three different events.
 */

const ROW = SCENARIO_SIZE >> 1;
/** Far enough that the far stop cannot reach a single house of the town. */
const REACH = 14;
/** Small enough that the fleet below is never the binding constraint. */
const POPULATION = 400;
/** The bus of balancing scenario 1. */
const BUS = 200;

interface Shuttle extends Scenario {
  /** The town end: a town of POPULATION with a stop. */
  readonly town: Station;
  /** The far end: a stop in open country, with no town and no industry. */
  readonly outpost: Station;
}

/** The station that owns a tile. Ids depend on build order; this does not. */
function stationOn(world: World, x: number, y: number): Station {
  const tile = world.map.tileIndex(x, y);
  for (const station of world.stations) {
    for (const module of station.modules) {
      if (module.tileIndex === tile) return station;
    }
  }
  throw new Error(`no station on ${x},${y}`);
}

/**
 * ONE town and ONE stop in open country, joined by a road and `buses` buses.
 *
 * The asymmetry this measures is total by construction: the outpost has no
 * town, so `produceTownCargo` never offers it a single traveller and every
 * passenger that ever leaves it is a return journey. Before this bundle the
 * bus came back empty on every single run of its life.
 */
function shuttle(buses: number, population = POPULATION): Shuttle {
  const towns = [makeTown(0, ROW - REACH, ROW, population, 'Westheim')];
  const scenario = flatScenario(SCENARIO_SIZE, towns, [], 1);

  apply(scenario, {
    kind: CommandKind.BuildRoad,
    x1: ROW - REACH,
    y1: ROW,
    x2: ROW + REACH,
    y2: ROW,
  });

  const townX = ROW - REACH + 1;
  const outpostX = ROW + REACH;
  for (const x of [townX, outpostX]) {
    apply(scenario, { kind: CommandKind.BuildRoadStop, x, y: ROW, moduleKind: ModuleKind.BusStop });
  }
  const depotX = townX + 1;
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: depotX,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });

  const world = scenario.world;
  const town = stationOn(world, townX, ROW);
  const outpost = stationOn(world, outpostX, ROW);
  expect(outpost.townId, 'the far stop must reach no town at all').toBe(-1);
  expect(town.buildingsCovered).toBeGreaterThan(0);

  for (let i = 0; i < buses; i++) {
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: depotX, y: ROW, specId: BUS });
    const vehicleId = world.vehicles.count - 1;
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId,
      orders: [
        { target: 0, targetId: town.id, load: 1, unload: 0 },
        { target: 0, targetId: outpost.id, load: 1, unload: 0 },
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
  }

  return { ...scenario, town, outpost };
}

function step(scenario: Scenario, ticks: number): void {
  for (let i = 0; i < ticks; i++) scenario.world.step(scenario.queue, null);
}

/** Both passenger classes of one ledger figure. */
function ledger(station: Station, field: ReturnField): number {
  let total = 0;
  for (let c = 0; c < PASSENGER_CLASS_COUNT; c++)
    total += station.returnState[returnSlot(c, field)]!;
  return total;
}

/**
 * What the M14 ring saw, summed over the whole ring AND the month in progress,
 * for both passenger classes. Complete over a run no longer than the ring.
 */
function ringTotal(station: Station, field: StationHistoryField): number {
  let total = 0;
  for (const cargo of [Cargo.CommuterPax, Cargo.BusinessPax]) {
    for (let month = 0; month < RETURN_MEAN_MONTHS; month++) {
      total += station.history[historySlot(station, month, cargo, field)]!;
    }
    total += station.monthCounters[cargo * STATION_HISTORY_FIELD_COUNT + field]!;
  }
  return total;
}

/** Passengers of both classes waiting here, whatever they are waiting for. */
function waitingPassengers(station: Station): number {
  let units = 0;
  for (const stack of station.waiting) {
    if (passengerClassIndex(stack.cargo) >= 0) units += stack.amount;
  }
  return units;
}

// ------------------------------------------------------------- the running mean

describe('the twelve-month mean, kept as one number (D-079)', () => {
  /** A ledger on its own, driven by hand: the mean without a world around it. */
  function bench(): Station {
    return { returnState: createReturnState(), returnMonths: 0 } as unknown as Station;
  }

  /** Close one month with `net` booked on the commuter class. */
  function closeMonth(station: Station, net: number): void {
    station.returnState[returnSlot(0, ReturnField.MonthNet)] = net;
    rollStationReturns({ stations: [station] } as unknown as World);
  }

  it('is a TRUE mean while the window fills, not a rolling one from zero', () => {
    const station = bench();
    // Twelve perfect months. Rolled from zero the mean would read 0.65 of the
    // flow after a full game year - D-079's whole point, one system further.
    for (let month = 0; month < RETURN_MEAN_MONTHS; month++) closeMonth(station, 100);

    expect(station.returnState[returnSlot(0, ReturnField.Mean)]).toBeCloseTo(100, 9);
    expect(station.returnMonths).toBe(RETURN_MEAN_MONTHS);
  });

  it('reads the first month exactly, and never divides by zero', () => {
    const station = bench();
    closeMonth(station, 60);
    expect(station.returnState[returnSlot(0, ReturnField.Mean)]).toBe(60);
    expect(station.returnMonths).toBe(1);
  });

  it('rolls with a twelfth of the window once it is full', () => {
    const station = bench();
    for (let month = 0; month < RETURN_MEAN_MONTHS; month++) closeMonth(station, 100);
    closeMonth(station, 0);
    // 100 + (0 - 100)/12
    expect(station.returnState[returnSlot(0, ReturnField.Mean)]).toBeCloseTo(100 - 100 / 12, 9);
  });

  it('is one number per class and not a ring of twelve', () => {
    // The shape is the claim: four figures a class, and the milestone's
    // save/hash cost is those eight numbers per station and nothing more.
    expect(RETURN_STATE_SIZE).toBe(4 * PASSENGER_CLASS_COUNT);
  });

  it('keeps the two classes apart', () => {
    const station = bench();
    station.returnState[returnSlot(1, ReturnField.MonthNet)] = 40;
    closeMonth(station, 100);
    expect(station.returnState[returnSlot(0, ReturnField.Mean)]).toBe(100);
    expect(station.returnState[returnSlot(1, ReturnField.Mean)]).toBe(40);
  });
});

// ------------------------------------------------------------- conservation

describe('conservation: demand never appears from nothing', () => {
  it('refuses to send home more travellers than ever arrived - the starvation case', () => {
    // The case a running mean ALONE gets wrong, and the reason the ledger
    // exists. One year of a strong flow, then the line is cut: the mean keeps
    // decaying for twelve months, and the sum of that decay is twelve times
    // the mean - a whole extra year of travellers nobody ever carried here.
    const scenario = shuttle(4);
    const outpost = scenario.outpost;

    step(scenario, TICKS_PER_YEAR);
    const arrived = ledger(outpost, ReturnField.Credited);
    expect(arrived, 'the fixture has to carry real traffic').toBeGreaterThan(500);
    expect(ledger(outpost, ReturnField.Generated)).toBeGreaterThan(0);

    // Cut the line: every bus is stopped, so nothing more ever arrives here.
    for (let id = 0; id < scenario.world.vehicles.count; id++) {
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: false });
    }
    // What an unclamped emission would have paid out over the next two years,
    // computed from the mean the station holds RIGHT NOW.
    let mean = 0;
    for (let c = 0; c < PASSENGER_CLASS_COUNT; c++) {
      mean += outpost.returnState[returnSlot(c, ReturnField.Mean)]!;
    }
    let unclamped = 0;
    let decaying = mean;
    for (let month = 0; month < 2 * RETURN_MEAN_MONTHS; month++) {
      unclamped += decaying * RETURN_TRIP_SHARE;
      decaying -= decaying / RETURN_MEAN_MONTHS;
    }

    const before = ledger(outpost, ReturnField.Generated);
    step(scenario, 2 * TICKS_PER_YEAR);
    const after = ledger(outpost, ReturnField.Generated);

    // Nothing arrived in those two years, so the ledger is where it was.
    expect(ledger(outpost, ReturnField.Credited)).toBeCloseTo(arrived, 6);
    // THE assertion: everything ever generated here was carried here first.
    expect(after).toBeLessThanOrEqual(arrived + 1e-9);
    expect(returnPoolUnits(outpost, 0)).toBeGreaterThanOrEqual(0);
    expect(returnPoolUnits(outpost, 1)).toBeGreaterThanOrEqual(0);

    // And the trap was a real one: the mean on its own would have invented
    // hundreds of journeys after the last bus stopped.
    console.log(
      `starvation: ${arrived.toFixed(0)} arrived, ${after.toFixed(0)} generated in total, ` +
        `${(after - before).toFixed(0)} of them after the line was cut; an unclamped mean ` +
        `would have paid out ${unclamped.toFixed(0)} more`,
    );
    expect(unclamped).toBeGreaterThan(100);
  });

  it('holds on every station of a long run, with the returns worth counting', () => {
    const scenario = shuttle(4);
    step(scenario, 10 * TICKS_PER_YEAR);

    let generated = 0;
    let credited = 0;
    for (const station of scenario.world.stations) {
      for (let c = 0; c < PASSENGER_CLASS_COUNT; c++) {
        const pool = returnPoolUnits(station, c);
        expect(
          pool,
          `station ${station.id} class ${c} owes nobody a journey it never carried`,
        ).toBeGreaterThanOrEqual(-1e-9);
      }
      generated += ledger(station, ReturnField.Generated);
      credited += ledger(station, ReturnField.Credited);
    }

    // Not vacuous: over ten game years this is thousands of journeys, and a
    // build that generated none would pass the inequality and fail here.
    console.log(
      `ten years: ${credited.toFixed(0)} passengers arrived, ${generated.toFixed(0)} return ` +
        `journeys generated (${((100 * generated) / credited).toFixed(1)} % of arrivals)`,
    );
    expect(generated).toBeGreaterThan(2_000);
    expect(generated).toBeLessThanOrEqual(credited);
  });

  it('agrees with the M14 ring about what it made - three counters, one number', () => {
    // The triangulation. At a terminus with no town, nothing but this bundle
    // can put a passenger into the pile, so what it says it generated must
    // equal what the history ring saw leave aboard a vehicle, plus what the
    // ring saw lost there, plus what is still standing on the platform. The
    // ring is written by station/history.ts from the loading, the delivery and
    // the decay paths - none of them this module - and the run is kept inside
    // the twelve months the ring remembers so its record is complete.
    const scenario = shuttle(4);
    step(scenario, RETURN_MEAN_MONTHS * TICKS_PER_MONTH - TICKS_PER_DAY);
    const outpost = scenario.outpost;

    const generated = ledger(outpost, ReturnField.Generated);
    const collected = ringTotal(outpost, StationHistoryField.Collected);
    const expired = ringTotal(outpost, StationHistoryField.Expired);
    const waiting = waitingPassengers(outpost);
    const carried = generated - collected - expired - waiting;

    console.log(
      `outpost ledger: generated ${generated.toFixed(1)} = collected ${collected.toFixed(1)} + ` +
        `expired ${expired.toFixed(1)} + waiting ${waiting.toFixed(1)} (residue ` +
        `${carried.toFixed(2)}, aboard or ring rounding)`,
    );
    expect(generated).toBeGreaterThan(200);
    // The ring rounds each month into an Int32, so up to half a unit a month
    // and counter is lost; anything larger is a real leak.
    expect(Math.abs(carried)).toBeLessThan(RETURN_MEAN_MONTHS);
  });

  it('generates nothing at a station nothing ever reached', () => {
    const scenario = shuttle(0);
    step(scenario, 2 * TICKS_PER_YEAR);
    for (const station of scenario.world.stations) {
      expect(ledger(station, ReturnField.Credited)).toBe(0);
      expect(ledger(station, ReturnField.Generated)).toBe(0);
    }
  });
});

// ------------------------------------------------------------- the migration

describe('what a version 29 world brings to the ledger', () => {
  it('arrives with an empty ledger of exactly the current size', () => {
    // The pinned-shape guard. `v29_to_v30` writes the size version THIRTY
    // means, spelled out in the migration file rather than read from the live
    // constant (D-207's lesson: a migration writes the shape of ITS target).
    // This is the other end of that rule: the day a milestone adds a class or
    // a figure, the two numbers part company and this test names the file that
    // has to grow the ledger instead of letting the old migration write a
    // short row into every save on disk.
    const migrated = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 29,
        state: { mapSize: 64, stations: [{ id: 0, waiting: [] }] },
      },
      29,
      30,
    );
    const station = (
      (migrated['state'] as Record<string, unknown>)['stations'] as Record<string, unknown>[]
    )[0]!;

    expect(station['returnState']).toEqual(new Array<number>(RETURN_STATE_SIZE).fill(0));
    expect(station['returnMonths']).toBe(0);
  });

  it('keeps a ledger that is already current, so the corpus trick cannot wipe one', () => {
    const ledgerIn = new Array<number>(RETURN_STATE_SIZE).fill(0);
    ledgerIn[returnSlot(0, ReturnField.Credited)] = 250;
    const migrated = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 29,
        state: {
          mapSize: 64,
          stations: [{ id: 0, waiting: [], returnState: ledgerIn, returnMonths: 7 }],
        },
      },
      29,
      30,
    );
    const station = (
      (migrated['state'] as Record<string, unknown>)['stations'] as Record<string, unknown>[]
    )[0]!;

    expect(station['returnState']).toEqual(ledgerIn);
    expect(station['returnMonths']).toBe(7);
  });
});

// ------------------------------------------------------------ flow asymmetry

describe('flow asymmetry on a commuter route', () => {
  it('is under 30 % where it used to be total', () => {
    const scenario = shuttle(4);
    // Three years: long enough that the twelve-month mean is full and the
    // measured window is a steady state rather than the ramp.
    step(scenario, 3 * TICKS_PER_YEAR);

    const out = ringTotal(scenario.town, StationHistoryField.Collected);
    const back = ringTotal(scenario.outpost, StationHistoryField.Collected);
    const asymmetry = (out - back) / out;

    // The route must not be capacity bound, or the two directions would even
    // out because the buses are full both ways and the number would mean
    // nothing about return journeys at all.
    expect(waitingPassengers(scenario.town), 'the fleet must not be the constraint').toBeLessThan(
      400,
    );
    expect(waitingPassengers(scenario.outpost)).toBeLessThan(400);

    console.log(
      `commuter route: ${out.toFixed(0)} passengers out, ${back.toFixed(0)} back, asymmetry ` +
        `${(100 * asymmetry).toFixed(1)} % (the ideal steady state is ` +
        `${(100 * (1 - RETURN_TRIP_SHARE)).toFixed(0)} %)`,
    );

    expect(back).toBeGreaterThan(0);
    expect(asymmetry).toBeLessThan(0.3);
    // And the baseline is not a guess: the far stop has no town, so before
    // this bundle every one of those journeys home was zero.
    expect(scenario.outpost.townId).toBe(-1);
  });

  it('leaves a route that was already balanced very nearly alone', () => {
    // Two towns of the same size are the shape balancing scenario 1 has, and
    // the rule is all but a no-op on it by CONSTRUCTION rather than by luck:
    // each end offers about as many travellers as reach it, so the imbalance
    // the mean averages sits at zero and the emission with it. "About" and not
    // "exactly", and the test says which: a month in which the fleet clears a
    // backlog delivers more than the town offered that month, and the mean
    // carries a trace of it for the next twelve. Measured over three game
    // years that trace is a fraction of a percent of the traffic, which is why
    // the bands of section 19.4 do not move - and the balance suite, not this
    // test, is the authority on that.
    const towns = [
      makeTown(0, ROW - REACH, ROW, POPULATION, 'Westheim'),
      makeTown(1, ROW + REACH, ROW, POPULATION, 'Ostheim'),
    ];
    const scenario = flatScenario(SCENARIO_SIZE, towns, [], 1);
    apply(scenario, {
      kind: CommandKind.BuildRoad,
      x1: ROW - REACH,
      y1: ROW,
      x2: ROW + REACH,
      y2: ROW,
    });
    for (const x of [ROW - REACH + 1, ROW + REACH - 1]) {
      apply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x,
        y: ROW,
        moduleKind: ModuleKind.BusStop,
      });
    }
    const depotX = ROW - REACH + 2;
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: depotX,
      y: ROW,
      moduleKind: ModuleKind.RoadDepot,
    });
    const world = scenario.world;
    for (let i = 0; i < 4; i++) {
      apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: depotX, y: ROW, specId: BUS });
      const vehicleId = world.vehicles.count - 1;
      apply(scenario, {
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          { target: 0, targetId: 0, load: 1, unload: 0 },
          { target: 0, targetId: 1, load: 1, unload: 0 },
        ],
      });
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });
    }

    step(scenario, 3 * TICKS_PER_YEAR);
    for (const station of world.stations) {
      const credited = ledger(station, ReturnField.Credited);
      const generated = ledger(station, ReturnField.Generated);
      expect(credited).toBeGreaterThan(0);
      console.log(
        `balanced route, station ${station.id}: ${credited.toFixed(0)} arrived, ` +
          `${generated.toFixed(2)} sent home (${((100 * generated) / credited).toFixed(3)} %)`,
      );
      expect(generated / credited, `station ${station.id}`).toBeLessThan(0.01);
    }
  });
});

// ------------------------------------------------------------------ cadence

describe('the cadence of the return hooks', () => {
  it('emits once a game day and never inside a tick', () => {
    const scenario = shuttle(4);
    step(scenario, 2 * TICKS_PER_YEAR);
    // Park the fleet, so the only thing that can move the outpost's pile is
    // the daily emission - nothing is loaded and nothing is delivered.
    for (let id = 0; id < scenario.world.vehicles.count; id++) {
      apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: id, running: false });
    }
    step(scenario, TICKS_PER_DAY);

    const days = 4;
    const movedOn: number[] = [];
    let previous = ledger(scenario.outpost, ReturnField.Generated);
    for (let i = 0; i < days * TICKS_PER_DAY; i++) {
      step(scenario, 1);
      const now = ledger(scenario.outpost, ReturnField.Generated);
      if (now !== previous) movedOn.push(scenario.world.tick);
      previous = now;
    }

    expect(movedOn.length, 'one emission per game day and not one more').toBe(days);
    for (const tick of movedOn) expect(tick % TICKS_PER_DAY).toBe(0);
  });

  it('sits in the daily and the monthly block of World.step, once each', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/sim/World.ts', import.meta.url)),
      'utf8',
    );
    const daily = source.indexOf('if (this.tick % TICKS_PER_DAY === 0) {');
    const monthly = source.indexOf('if (this.tick % TICKS_PER_MONTH === 0) {', daily);
    const year = source.indexOf('if (this.tick % TICKS_PER_YEAR === 0) {', monthly);
    expect(daily).toBeGreaterThan(0);
    expect(monthly).toBeGreaterThan(daily);
    expect(year).toBeGreaterThan(monthly);

    expect(source.split('generateReturnJourneys(this)').length - 1).toBe(1);
    expect(source.slice(daily, monthly).includes('generateReturnJourneys(this)')).toBe(true);
    expect(source.split('rollStationReturns(this)').length - 1).toBe(1);
    expect(source.slice(monthly, year).includes('rollStationReturns(this)')).toBe(true);
  });

  it('spreads a month of return demand over the month, not over one day', () => {
    // The rate is the mean over the same thirty slices the town's own output
    // is booked in. A busload arriving on Tuesday must not become a busload
    // going home on Tuesday - that is what the mean is FOR.
    const scenario = shuttle(4);
    step(scenario, 2 * TICKS_PER_YEAR);
    const outpost = scenario.outpost;

    let mean = 0;
    for (let c = 0; c < PASSENGER_CLASS_COUNT; c++) {
      mean += outpost.returnState[returnSlot(c, ReturnField.Mean)]!;
    }
    const before = ledger(outpost, ReturnField.Generated);
    step(scenario, TICKS_PER_DAY);
    const day = ledger(outpost, ReturnField.Generated) - before;

    expect(mean).toBeGreaterThan(0);
    expect(day).toBeCloseTo((mean * RETURN_TRIP_SHARE) / TOWN_PRODUCTION_SLICES_PER_MONTH, 6);
  });
});

// -------------------------------------------------- law 7: no allocation

/** Sink for the control loop, so nothing it does can be optimised away. */
let scratch: unknown = null;

/**
 * Bytes allocated over `iterations` calls, MEASURED - the M17 instrument
 * (tests/unit/goals.spec.ts), verbatim, including its reason for existing: a
 * bare `heapUsed` delta falls whenever a collection happens to run, so an
 * allocating loop can measure lower than a clean one.
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

describe('the running mean allocates nothing (law 7)', () => {
  const ITERATIONS = 50_000;

  it('rolls a played world of stations without allocating, with a control', () => {
    const scenario = shuttle(4);
    step(scenario, 2 * TICKS_PER_YEAR);
    const world = scenario.world;
    expect(world.stations.length).toBeGreaterThanOrEqual(2);

    const measured = allocatedBytes(() => rollStationReturns(world), ITERATIONS);
    const control = allocatedBytes(() => {
      for (const station of world.stations)
        scratch = { id: station.id, months: station.returnMonths };
    }, ITERATIONS);

    console.log(
      `return mean roll: ${(measured / ITERATIONS).toFixed(3)} B per game month over ` +
        `${ITERATIONS} months; the allocating control ${(control / ITERATIONS).toFixed(2)} B`,
    );
    expect(scratch).not.toBeNull();
    expect(control / ITERATIONS).toBeGreaterThan(30);
    expect(measured / ITERATIONS).toBeLessThan(2);
  });

  it('emits nothing and allocates nothing where no journey is owed', () => {
    // The daily hook's own machinery: the walk, the ledger reads and the
    // clamp, with no deposit underneath it. A station that owes nobody a
    // journey home is the common case on any map - most stations are freight.
    const scenario = shuttle(0);
    step(scenario, TICKS_PER_MONTH);
    const world = scenario.world;

    const measured = allocatedBytes(() => generateReturnJourneys(world), ITERATIONS);
    console.log(
      `return emission (nothing owed): ${(measured / ITERATIONS).toFixed(3)} B per game day`,
    );
    expect(measured / ITERATIONS).toBeLessThan(2);
  });
});
