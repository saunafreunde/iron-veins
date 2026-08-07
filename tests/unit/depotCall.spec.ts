import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import { vehicleCargoRows } from '../../src/sim/markers';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import {
  fleetUpkeepCtPerYear,
  rollBreakdowns,
  vehicleUpkeepCtPerYear,
} from '../../src/sim/vehicles/lifecycle';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld, type World } from '../../src/sim/World';
import roadFixture from '../determinism/fixtures/road-line-commands.json';
import {
  advance,
  createScenario,
  parseScenarioFixture,
  type Scenario,
} from '../determinism/runner';

/**
 * The "send to depot" command of the M14 vehicle detail (SPEC2 M14), proven
 * on the recorded road line: a running bus is called in, arrives at the shed
 * it was bought in, is serviced and parks - with its schedule untouched -
 * and the flag survives a save taken mid-diversion (Z4). Plus the two other
 * sim-side pieces of the bundle: the lifetime breakdown tally and the
 * per-vehicle upkeep the detail view displays.
 */

const SEED = 424_242;
/**
 * Past the last scripted command (tick 12,000): the line is long since built
 * and earning, and the queue accepts new commands monotonically after it.
 */
const WARMED_UP_TICKS = 12_050;
/** Longest a diversion on the 128 map may reasonably take. [ticks] */
const DIVERSION_CAP_TICKS = 6_000;

const script = parseScenarioFixture(roadFixture);

function warmedUp(): Scenario {
  const scenario = createScenario(SEED, script);
  advance(scenario, WARMED_UP_TICKS, []);
  return scenario;
}

function stepUntil(scenario: Scenario, cap: number, done: (world: World) => boolean): boolean {
  for (let i = 0; i < cap; i++) {
    if (done(scenario.world)) return true;
    scenario.world.step(scenario.queue, null);
  }
  return done(scenario.world);
}

describe('SendVehicleToDepot', () => {
  it('parks the bus serviced in its home shed with the schedule untouched', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    const depot = world.vehicles.homeDepotTile[0]!;
    const ordersBefore = world.vehicles.orders[0]!.length;
    expect(ordersBefore).toBeGreaterThan(0);

    scenario.queue.enqueue({ kind: CommandKind.SendVehicleToDepot, vehicleId: 0 }, world.tick);
    const arrived = stepUntil(
      scenario,
      DIVERSION_CAP_TICKS,
      (w) => w.vehicles.state[0] === VehicleState.Stopped && w.vehicles.tileIndex[0] === depot,
    );

    expect(arrived).toBe(true);
    expect(world.vehicles.depotCall[0]).toBe(0);
    // The schedule was never edited - a restart resumes it (D-076-adjacent:
    // Stopped on the depot tile is also exactly the refit-ready state).
    expect(world.vehicles.orders[0]!.length).toBe(ordersBefore);

    // And the vehicle is not stranded: started again, it runs its orders.
    scenario.queue.enqueue(
      { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true },
      world.tick,
    );
    const runningAgain = stepUntil(
      scenario,
      DIVERSION_CAP_TICKS,
      (w) => w.vehicles.state[0] === VehicleState.Loading,
    );
    expect(runningAgain).toBe(true);
  });

  it('keeps an outstanding call across save and load, hash-identically (Z4)', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    scenario.queue.enqueue({ kind: CommandKind.SendVehicleToDepot, vehicleId: 0 }, world.tick);
    // A few ticks in: the diversion is armed and the bus is on its way.
    advance(scenario, world.tick + 20, []);
    expect(world.vehicles.depotCall[0]).toBe(1);

    const loaded = decodeSave(encodeSave(world, scenario.queue, 'test'));
    expect(loaded.world.vehicles.depotCall[0]).toBe(1);
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });

  it('is cancelled by stopping the vehicle - the documented way out', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    scenario.queue.enqueue({ kind: CommandKind.SendVehicleToDepot, vehicleId: 0 }, world.tick);
    advance(scenario, world.tick + 10, []);
    expect(world.vehicles.depotCall[0]).toBe(1);

    scenario.queue.enqueue(
      { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: false },
      world.tick,
    );
    advance(scenario, world.tick + 5, []);
    expect(world.vehicles.depotCall[0]).toBe(0);
    expect(world.vehicles.state[0]).toBe(VehicleState.Stopped);
  });

  it('refuses a vehicle that does not exist, by name', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    scenario.queue.enqueue({ kind: CommandKind.SendVehicleToDepot, vehicleId: 77 }, world.tick);

    const outcomes: { ok: boolean; reasonKey?: string }[] = [];
    world.step(scenario.queue, (_envelope, outcome) => {
      outcomes.push(outcome.ok ? { ok: true } : { ok: false, reasonKey: outcome.reasonKey });
    });
    expect(outcomes).toEqual([{ ok: false, reasonKey: 'cmd.reject.noSuchVehicle' }]);
  });

  it('a v24 save without the two fields migrates to zeroed ones', () => {
    const scenario = warmedUp();
    const bytes = encodeSave(scenario.world, scenario.queue, 'test');
    const payload = decode(unzlibSync(bytes)) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    const vehicles = state['vehicles'] as Record<string, unknown>[];
    expect(vehicles.length).toBeGreaterThan(0);
    for (const vehicle of vehicles) {
      delete vehicle['breakdownCount'];
      delete vehicle['depotCall'];
    }
    // An older container is never judged by its digest (D-131).
    payload['saveVersion'] = 24;
    payload['worldDigest'] = '';

    const loaded = decodeSave(zlibSync(encode(payload)));
    expect(loaded.world.vehicles.breakdownCount[0]).toBe(0);
    expect(loaded.world.vehicles.depotCall[0]).toBe(0);
  });
});

describe('the detail view figures', () => {
  it('counts a breakdown when the roll fails the vehicle', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    // The played line has usually broken down before; the tally must move by
    // exactly one when the state flips, whatever it already stands at.
    const before = world.vehicles.breakdownCount[0]!;

    // Worst reliability makes the daily roll fail within a handful of tries
    // (chance (RELIABILITY_MAX - 0) / BREAKDOWN_DIVISOR per roll); the count
    // must move exactly when the state does.
    world.vehicles.reliability[0] = 0;
    let broke = false;
    for (let i = 0; i < 500 && !broke; i++) {
      // Snapshot the state for the guard: narrowing the element access
      // itself would blind TypeScript to rollBreakdowns mutating it.
      const state: number = world.vehicles.state[0]!;
      if (state !== VehicleState.Driving) {
        world.step(scenario.queue, null);
        continue;
      }
      rollBreakdowns(world);
      broke = world.vehicles.state[0] === VehicleState.BrokenDown;
    }
    expect(broke).toBe(true);
    expect(world.vehicles.breakdownCount[0]).toBe(before + 1);
  });

  it('prices one vehicle exactly as the fleet total does', () => {
    const world = warmedUp().world;
    let sum = 0;
    for (let id = 0; id < world.vehicles.count; id++) {
      if (world.vehicles.alive[id] !== 1) continue;
      if (world.vehicles.ownerId[id] !== 0) continue;
      sum += vehicleUpkeepCtPerYear(world, id);
    }
    expect(sum).toBe(fleetUpkeepCtPerYear(world, 0));
  });

  it('reports the manifest rows the vehicle actually carries', () => {
    const scenario = warmedUp();
    const world = scenario.world;
    // Catch the bus mid-leg with passengers aboard; the recorded line loads
    // full, so a moment with cargo exists within one round.
    stepUntil(
      scenario,
      DIVERSION_CAP_TICKS,
      (w) => w.vehicles.cargo[0]!.length > 0 && w.vehicles.state[0] === VehicleState.Driving,
    );

    const stacks = world.vehicles.cargo[0]!;
    const rows = vehicleCargoRows(world, 0);
    expect(rows.length).toBe(stacks.length);
    let total = 0;
    for (const stack of stacks) total += stack.amount;
    let rowTotal = 0;
    for (const row of rows) {
      expect(row.openTiles).toBeGreaterThanOrEqual(0);
      expect(row.ageDays).toBeGreaterThanOrEqual(0);
      rowTotal += row.units;
    }
    // Per-row rounding, so the totals agree to within a unit per row.
    expect(Math.abs(rowTotal - total)).toBeLessThanOrEqual(rows.length);
    // Largest first is the sim-side ordering promise the panel relies on.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.units).toBeLessThanOrEqual(rows[i - 1]!.units);
    }
  });
});
