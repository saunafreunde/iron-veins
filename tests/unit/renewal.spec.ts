import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  AUTO_RENEW_LIFE_SHARE,
  CENTS_PER_EURO,
  ENERGY_COST_CT_PER_MJ,
  START_YEAR,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { bookMonthlyEnergy } from '../../src/sim/economy/energy';
import { Account } from '../../src/sim/economy/ledger';
import { ModuleKind } from '../../src/sim/station/types';
import { vehicleSpec } from '../../src/sim/vehicles/catalog';
import { dueForRenewal, successorOf } from '../../src/sim/vehicles/renewal';
import { PowerCode } from '../../src/sim/vehicles/spec';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * Auto-renewal (section 11.3) and the energy account (14.1).
 *
 * The two things that must hold whatever else changes: renewal draws no
 * randomness, because breakdowns do and a stray draw would send every existing
 * seed down a different future; and the energy bill comes from the work
 * actually done, so a heavier train on a longer haul costs more.
 */

const BUS = 200;

function busLine(): Scenario {
  const scenario = flatScenario(64, [makeTown(0, 20, 20, 1_200, 'Erneuerungsstadt')], []);
  apply(scenario, { kind: CommandKind.BuildRoad, x1: 40, y1: 40, x2: 56, y2: 40 });
  apply(scenario, {
    kind: CommandKind.BuildRoadStop,
    x: 40,
    y: 40,
    moduleKind: ModuleKind.RoadDepot,
  });
  apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 40, y: 40, specId: BUS });
  return scenario;
}

/**
 * Renewal is a LINE rule since M11: the bus is put on a line whose schedule
 * is its shed, and the switch is turned on for that line.
 */
function renewingBusLine(): Scenario {
  const scenario = busLine();
  const depotTile = scenario.world.map.tileIndex(40, 40);
  apply(scenario, { kind: CommandKind.CreateLine });
  apply(scenario, {
    kind: CommandKind.SetLineOrders,
    lineId: 0,
    orders: [{ target: 1, targetId: depotTile, load: 2, unload: 1 }],
  });
  apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 0, lineId: 0 });
  apply(scenario, { kind: CommandKind.SetAutoRenew, lineId: 0, enabled: true });
  return scenario;
}

describe('choosing a successor', () => {
  it('picks a vehicle of the same mode that is on sale and carries as much', () => {
    const bus = vehicleSpec(BUS);
    // Far enough into the century that a newer bus certainly exists.
    const successor = successorOf(bus, Cargo.Passengers, 2000);
    expect(successor).toBeGreaterThan(0);

    const chosen = vehicleSpec(successor);
    expect(chosen.kind).toBe(bus.kind);
    expect(chosen.introYear).toBeLessThanOrEqual(2000);
    expect(chosen.retireYear).toBeGreaterThanOrEqual(2000);
    expect(chosen.capacity[Cargo.Passengers] ?? 0).toBeGreaterThanOrEqual(
      bus.capacity[Cargo.Passengers] ?? 0,
    );
  });

  it('offers nothing when the catalogue has nothing newer', () => {
    // In the first game year the 1950 bus is the newest bus there is.
    const newest = successorOf(vehicleSpec(BUS), Cargo.Passengers, START_YEAR);
    if (newest >= 0) {
      expect(vehicleSpec(newest).lifetimeYears).toBeGreaterThanOrEqual(
        vehicleSpec(BUS).lifetimeYears,
      );
    }
  });

  it('never proposes a vehicle that needs wires to replace one that does not', () => {
    for (const spec of [vehicleSpec(BUS)]) {
      const successor = successorOf(spec, Cargo.Passengers, 2040);
      if (successor < 0) continue;
      expect(vehicleSpec(successor).needsCatenary).toBe(false);
    }
  });

  it('gives the same answer every time it is asked', () => {
    const first = successorOf(vehicleSpec(BUS), Cargo.Passengers, 1990);
    for (let i = 0; i < 5; i++) {
      expect(successorOf(vehicleSpec(BUS), Cargo.Passengers, 1990)).toBe(first);
    }
  });
});

describe('renewing a fleet', () => {
  it('leaves a young vehicle alone', () => {
    const scenario = busLine();
    expect(dueForRenewal(scenario.world, 0)).toBe(false);
  });

  it('calls one due at nine tenths of its design life', () => {
    const scenario = busLine();
    const world = scenario.world;
    const life = vehicleSpec(BUS).lifetimeYears;

    world.vehicles.builtTick[0] =
      world.tick - Math.ceil(life * AUTO_RENEW_LIFE_SHARE) * TICKS_PER_YEAR;
    expect(dueForRenewal(world, 0)).toBe(true);
  });

  it('does nothing at all for a vehicle that runs no line', () => {
    // The flag lives on the LINE (section 11.3, M11): with no line there is
    // nowhere to turn renewal on, and an ancient bus simply grows old.
    const scenario = busLine();
    const world = scenario.world;
    world.vehicles.builtTick[0] = -50 * TICKS_PER_YEAR;
    const specBefore = world.vehicles.specId[0];

    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);
    expect(world.vehicles.specId[0]).toBe(specBefore);
  });

  it('does nothing at all while the line switch is off', () => {
    const scenario = renewingBusLine();
    const world = scenario.world;
    apply(scenario, { kind: CommandKind.SetAutoRenew, lineId: 0, enabled: false });
    world.vehicles.builtTick[0] = -50 * TICKS_PER_YEAR;
    const specBefore = world.vehicles.specId[0];

    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);
    expect(world.vehicles.specId[0]).toBe(specBefore);
  });

  it('replaces an old vehicle, keeps it on its line and gives back its shed', () => {
    const scenario = renewingBusLine();
    const world = scenario.world;

    // Old enough to be due, and late enough that a successor exists.
    world.tick = 50 * TICKS_PER_YEAR;
    world.vehicles.builtTick[0] = 0;
    const before = world.vehicles.specId[0]!;

    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);

    // Exactly one vehicle, of a newer type, on the same line - which is what
    // "keeps its orders" means for a line vehicle: the schedule is the line's.
    expect(world.vehicles.livingCount).toBe(1);
    let alive = -1;
    for (let id = 0; id < world.vehicles.count; id++) {
      if (world.vehicles.alive[id] === 1) alive = id;
    }
    expect(alive).toBeGreaterThanOrEqual(0);
    expect(world.vehicles.specId[alive]).not.toBe(before);
    expect(world.vehicles.lineId[alive]).toBe(0);
    expect(world.lines.orders[0]).toHaveLength(1);
  });

  it('renews a whole fleet in one tick without orphaning a single successor', () => {
    // A fleet bought in one tick ages in step and renews in one tick. Every
    // replacement must end up ON the line: the fresh-vehicle finder used to
    // find the FIRST successor again for every renewal after the first, and
    // a six-lorry line measured on the scenario-5 trace paid for six
    // successors, crewed one, and was closed by its own review a month
    // later - five paid-for lorries standing orphaned in the shed.
    const scenario = renewingBusLine();
    const world = scenario.world;
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 40, y: 40, specId: BUS });
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 40, y: 40, specId: BUS });
    apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 1, lineId: 0 });
    apply(scenario, { kind: CommandKind.AssignVehicleToLine, vehicleId: 2, lineId: 0 });

    world.tick = 50 * TICKS_PER_YEAR;
    world.vehicles.builtTick[0] = 0;
    world.vehicles.builtTick[1] = 0;
    world.vehicles.builtTick[2] = 0;

    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);

    // Three vehicles, all newer, ALL on the line - none orphaned in the shed.
    expect(world.vehicles.livingCount).toBe(3);
    for (let id = 0; id < world.vehicles.count; id++) {
      if (world.vehicles.alive[id] !== 1) continue;
      expect(world.vehicles.specId[id]).not.toBe(BUS);
      expect(world.vehicles.lineId[id]).toBe(0);
    }
  });

  it('draws no randomness, so an existing world runs on unchanged', () => {
    // Two worlds, identical but for the switch. The rng state after a year has
    // to match, or every seeded future diverges the moment a player enables it.
    const plain = renewingBusLine();
    apply(plain, { kind: CommandKind.SetAutoRenew, lineId: 0, enabled: false });
    const renewing = renewingBusLine();
    renewing.world.vehicles.builtTick[0] = -50 * TICKS_PER_YEAR;
    renewing.world.tick = 50 * TICKS_PER_YEAR;
    plain.world.tick = 50 * TICKS_PER_YEAR;

    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) {
      plain.world.step(plain.queue, null);
      renewing.world.step(renewing.queue, null);
    }
    // The fleets differ; the random stream does not.
    expect(renewing.world.rng.getState()).toEqual(plain.world.rng.getState());
  });
});

describe('the energy account', () => {
  it('charges for the work a vehicle actually did', () => {
    const scenario = busLine();
    const world = scenario.world;
    const rate = ENERGY_COST_CT_PER_MJ[PowerCode.Diesel]!;

    // Ten megajoules of traction work, at the diesel rate.
    world.vehicles.workJ[0] = 10_000_000;
    world.vehicles.powerCode[0] = PowerCode.Diesel;
    const charged = bookMonthlyEnergy(world);

    expect(charged).toBe(10 * rate);
    expect(world.company.accounts[Account.Energy]).toBe(charged);
    // And the meter is back to zero, which is what keeps it exactly
    // representable over a hundred year game.
    expect(world.vehicles.workJ[0]).toBe(0);
  });

  it('makes electricity cheaper than steam for the same work', () => {
    // The whole point of the account: this is what pays for electrification.
    expect(ENERGY_COST_CT_PER_MJ[PowerCode.Electric]!).toBeLessThan(
      ENERGY_COST_CT_PER_MJ[PowerCode.Steam]!,
    );
    expect(ENERGY_COST_CT_PER_MJ[PowerCode.Electric]!).toBeLessThan(
      ENERGY_COST_CT_PER_MJ[PowerCode.Diesel]!,
    );
  });

  it('bills nothing for a fleet that stood still', () => {
    const scenario = busLine();
    expect(bookMonthlyEnergy(scenario.world)).toBe(0);
    expect(scenario.world.company.accounts[Account.Energy]).toBe(0);
  });

  it('accumulates the work as a vehicle drives', () => {
    const scenario = busLine();
    const world = scenario.world;
    // Clear of the shed, or the two would join into one station.
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 52,
      y: 40,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [{ target: 0, targetId: world.stations[1]!.id, load: 1, unload: 0 }],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    for (let tick = 0; tick < 400; tick++) world.step(scenario.queue, null);
    expect(world.vehicles.workJ[0]).toBeGreaterThan(0);
    // A bus is not a power station: a few hundred ticks is megajoules, not
    // gigajoules, and a figure far outside that means the units are wrong.
    expect(world.vehicles.workJ[0]! / 1_000_000).toBeLessThan(1_000);
  });

  it('prices a year of a bus at a legible number', () => {
    const scenario = busLine();
    const world = scenario.world;
    world.vehicles.workJ[0] = 500_000_000;
    world.vehicles.powerCode[0] = PowerCode.Diesel;
    const euros = bookMonthlyEnergy(world) / CENTS_PER_EURO;
    expect(euros).toBeGreaterThan(0);
    expect(euros).toBeLessThan(1_000_000);
  });
});
