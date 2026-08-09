import { decode, encode } from '@msgpack/msgpack';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { deliveryRevenueCt } from '../../src/sim/cargo/payment';
import { Cargo, CARGO_COUNT } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { STATION_CARGO_CAPACITY, TICKS_PER_DAY, TICKS_PER_YEAR } from '../../src/sim/constants';
import { SAVE_MAGIC, SAVE_VERSION } from '../../src/sim/save/format';
import { migrateSavePayload } from '../../src/sim/save/migrations';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import {
  historySlot,
  STATION_HISTORY_FIELD_COUNT,
  StationHistoryField,
} from '../../src/sim/station/history';
import { TOWN_OUTPUTS } from '../../src/sim/town/update';
import { BuildingKind } from '../../src/sim/town/types';
import { hashWorld, type World } from '../../src/sim/World';
import { apply, buildBusLine, twoTownScenario, type TwoTownScenario } from '../balance/scenario';

/**
 * The two passenger classes of SPEC2 M19 (E-08, D-207) - bundle 1: the ids,
 * the zone that produces each of them, the seats they share, the fare the
 * business class pays, and the v29 -> v30 remap that carries every older save
 * across.
 *
 * What is deliberately NOT here: gravity, return trips and the AI's own use of
 * the classes. Those are later bundles of the same milestone.
 */

const GAME_VERSION = 'test';
const BUS = 200;
const POPULATION = 1_200;

/** Repaint every building of `townId` as `kind` - the zoning under test. */
function rezone(world: World, townId: number, kind: BuildingKind): number {
  const map = world.map;
  let painted = 0;
  for (let index = 0; index < map.buildingKind.length; index++) {
    if (map.townId[index] !== townId) continue;
    if (map.buildingKind[index] === BuildingKind.None) continue;
    map.buildingKind[index] = kind;
    painted++;
  }
  return painted;
}

/** Units of one cargo waiting at a station. */
function waitingOf(world: World, stationId: number, cargo: Cargo): number {
  let units = 0;
  for (const stack of world.stations[stationId]!.waiting) {
    if (stack.cargo === cargo) units += stack.amount;
  }
  return units;
}

/** Everything waiting at a station, whatever it is. */
function waitingTotal(world: World, stationId: number): number {
  let units = 0;
  for (const stack of world.stations[stationId]!.waiting) units += stack.amount;
  return units;
}

function step(scenario: TwoTownScenario, ticks: number): void {
  for (let i = 0; i < ticks; i++) scenario.world.step(scenario.queue, null);
}

// ------------------------------------------------------------- the zone split

describe('what a zone offers', () => {
  it('splits a town output by the zoning of each stop, and never changes the total', () => {
    const scenario = twoTownScenario(POPULATION, 25);
    const world = scenario.world;

    // Westheim stays what `placeTown` builds - houses. Ostheim becomes a
    // shopping street: same population, same buildings, different zone.
    expect(rezone(world, 1, BuildingKind.Commercial)).toBeGreaterThan(0);

    buildBusLine(scenario, BUS, 1);
    const [west, east] = [world.stations[0]!, world.stations[1]!];
    expect(west.commercialShare).toBe(0);
    expect(east.commercialShare).toBe(1);

    // One production slice, before anything can be collected: a bus cannot
    // have reached the far stop within a day of leaving its shed.
    step(scenario, TICKS_PER_DAY + 5);

    expect(waitingOf(world, west.id, Cargo.CommuterPax)).toBeGreaterThan(0);
    expect(waitingOf(world, west.id, Cargo.BusinessPax)).toBe(0);
    expect(waitingOf(world, east.id, Cargo.BusinessPax)).toBeGreaterThan(0);
    expect(waitingOf(world, east.id, Cargo.CommuterPax)).toBe(0);

    // The retired id is produced nowhere, and the two classes plus mail are
    // the WHOLE of what a town puts into a station.
    for (const station of world.stations) {
      for (const stack of station.waiting) {
        expect(TOWN_OUTPUTS.includes(stack.cargo), `cargo ${stack.cargo}`).toBe(true);
      }
    }

    // And the split conserves: what the town offered is what its stops hold.
    const townA = world.towns[0]!;
    const offeredWest = waitingOf(world, west.id, Cargo.CommuterPax);
    expect(offeredWest).toBeCloseTo(townA.producedThisMonth, 6);
  });

  it('mixes the two classes in the proportion the catchment is zoned in', () => {
    const scenario = twoTownScenario(POPULATION, 25);
    const world = scenario.world;
    const map = world.map;

    // Half of Ostheim's houses become shops. The share is counted over the
    // station's OWN catchment, so the assertion below reads the catchment
    // rather than the town.
    let painted = 0;
    for (let index = 0; index < map.buildingKind.length; index++) {
      if (map.townId[index] !== 1) continue;
      if (map.buildingKind[index] !== BuildingKind.Residential) continue;
      if (painted % 2 === 0) map.buildingKind[index] = BuildingKind.Commercial;
      painted++;
    }

    buildBusLine(scenario, BUS, 1);
    const east = world.stations[1]!;
    expect(east.commercialShare).toBeGreaterThan(0.2);
    expect(east.commercialShare).toBeLessThan(0.8);

    step(scenario, TICKS_PER_DAY + 5);
    const business = waitingOf(world, east.id, Cargo.BusinessPax);
    const commuters = waitingOf(world, east.id, Cargo.CommuterPax);
    expect(business / (business + commuters)).toBeCloseTo(east.commercialShare, 6);
  });

  it('recomputes the share on load rather than carrying it in the file', () => {
    // `commercialShare` is derived from the building layer, exactly like
    // `acceptedCargo` beside it (the landmass treatment). A save therefore
    // does not carry it - and the reloaded world must still know it.
    const scenario = twoTownScenario(POPULATION, 25);
    rezone(scenario.world, 1, BuildingKind.Commercial);
    buildBusLine(scenario, BUS, 1);
    step(scenario, TICKS_PER_DAY + 5);

    const loaded = decodeSave(encodeSave(scenario.world, scenario.queue, GAME_VERSION)).world;
    expect(loaded.stations[0]!.commercialShare).toBe(0);
    expect(loaded.stations[1]!.commercialShare).toBe(1);
    expect(hashWorld(loaded)).toBe(hashWorld(scenario.world));
  });
});

// ------------------------------------------------------------ the shared seats

describe('the seats the two classes share', () => {
  it('carries both classes on one bus, and no class silts the station up', () => {
    const scenario = twoTownScenario(POPULATION, 25);
    const world = scenario.world;
    // A mixed town at the far end: half its stop's catchment is shops, so a
    // bus refitted to commuters would leave half the traffic standing.
    const map = world.map;
    let painted = 0;
    for (let index = 0; index < map.buildingKind.length; index++) {
      if (map.townId[index] !== 1) continue;
      if (map.buildingKind[index] !== BuildingKind.Residential) continue;
      if (painted % 2 === 0) map.buildingKind[index] = BuildingKind.Commercial;
      painted++;
    }

    buildBusLine(scenario, BUS, 2);
    expect(world.vehicles.refitCargo[0]).toBe(Cargo.CommuterPax);

    step(scenario, 3 * TICKS_PER_YEAR);

    const company = world.company;
    expect(company.cargoDeliveredUnits[Cargo.CommuterPax]!).toBeGreaterThan(0);
    // The class the bus was NOT refitted to travelled all the same - which is
    // the whole of the shared-seat rule.
    expect(company.cargoDeliveredUnits[Cargo.BusinessPax]!).toBeGreaterThan(0);

    // Three game years in, neither stop is anywhere near its capacity: an
    // unserved class would have filled it and then strangled the served one,
    // because the deposit checks the sum over EVERY stack.
    for (const station of world.stations) {
      expect(waitingTotal(world, station.id)).toBeLessThan(STATION_CARGO_CAPACITY * 0.9);
    }
    expect(world.stations[1]!.overflowUnits).toBe(0);
  });

  it('counts both classes when an order asks how full the vehicle is', () => {
    const scenario = twoTownScenario(POPULATION, 25);
    rezone(scenario.world, 0, BuildingKind.Commercial);
    buildBusLine(scenario, BUS, 1);
    step(scenario, 20 * TICKS_PER_DAY);

    const vehicles = scenario.world.vehicles;
    let aboard = 0;
    for (const stack of vehicles.cargo[0]!) aboard += stack.amount;
    // The commuter-refitted bus is carrying business travellers from the
    // shopping street, and its capacity says so.
    expect(aboard).toBeGreaterThan(0);
    expect(aboard).toBeLessThanOrEqual(vehicles.capacityUnits[0]!);
  });
});

// -------------------------------------------------------------- what it pays

/**
 * Two worlds identical but for the zoning of both towns, so the SAME route,
 * the SAME fleet and the SAME timetable carry one class each.
 *
 * That is what makes the comparison controlled: a single world would compare
 * two classes over different queues, different waiting times and different
 * loads. Here the only difference in the whole simulation is which of the two
 * fares the parcels carry.
 */
function farePerUnit(
  zone: BuildingKind,
  distanceTiles: number,
  buses: number,
  years: number,
  population = POPULATION,
): number {
  const scenario = twoTownScenario(population, distanceTiles);
  rezone(scenario.world, 0, zone);
  rezone(scenario.world, 1, zone);
  buildBusLine(scenario, BUS, buses);
  step(scenario, years * TICKS_PER_YEAR);

  const world = scenario.world;
  let earnedCt = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] === 1) earnedCt += world.vehicles.earnedCt[id]!;
  }
  let units = 0;
  for (const cargo of [Cargo.CommuterPax, Cargo.BusinessPax]) {
    units += world.company.cargoDeliveredUnits[cargo]!;
  }
  expect(units).toBeGreaterThan(0);
  return earnedCt / units;
}

/** Two villages, four buses. The only thing the two runs below vary is the road. */
const FARE_POPULATION = 400;
const FARE_BUSES = 4;
const SHORT_TILES = 12;
const LONG_TILES = 30;

describe('what the business traveller pays', () => {
  it('is worth 1.6 commuters at the counter, before a day has passed', () => {
    // The table, not a run: the same amount, the same distance, the same day
    // and no time in transit at all. This is the number the two runs below
    // start from and then spend.
    const input = {
      amount: 100,
      distanceTiles: 40,
      ticksInTransit: 0,
      hasCooling: false,
      year: 1950,
    };
    const commuter = deliveryRevenueCt({ ...input, cargo: Cargo.CommuterPax });
    const business = deliveryRevenueCt({ ...input, cargo: Cargo.BusinessPax });
    expect(business / commuter).toBeCloseTo(1.6, 10);
  });

  it('pays measurably more per unit than a commuter on the same short route', () => {
    const commuter = farePerUnit(
      BuildingKind.Residential,
      SHORT_TILES,
      FARE_BUSES,
      2,
      FARE_POPULATION,
    );
    const business = farePerUnit(
      BuildingKind.Commercial,
      SHORT_TILES,
      FARE_BUSES,
      2,
      FARE_POPULATION,
    );
    const ratio = business / commuter;

    console.log(
      `fare per unit over ${SHORT_TILES} tiles: commuter ${commuter.toFixed(2)} ct, ` +
        `business ${business.toFixed(2)} ct, ratio ${ratio.toFixed(3)}`,
    );
    // Measured 1.291 - the premium is 1.6 at the counter and this is what is
    // left of it after the queue and the drive, which is exactly the point:
    // even a modest bus line turns the business class into more money per
    // seat than the commuter beside it.
    expect(ratio).toBeGreaterThan(1.15);
  });

  it('is worth LESS than a commuter once the line is slow, and that is the mechanism', () => {
    // The same two villages and the same four buses, thirty tiles apart
    // instead of twelve. Nothing else in the two worlds differs - not the
    // fleet, not the population, not the orders. Business decays twice as
    // fast, so the premium is a SPEED premium: the ratio crosses 1 somewhere
    // between these two roads and the class stops being worth carrying.
    // "Geschwindigkeit wird bei Passagieren endlich Geld", measured on runs
    // rather than read off the table above.
    const commuter = farePerUnit(
      BuildingKind.Residential,
      LONG_TILES,
      FARE_BUSES,
      2,
      FARE_POPULATION,
    );
    const business = farePerUnit(
      BuildingKind.Commercial,
      LONG_TILES,
      FARE_BUSES,
      2,
      FARE_POPULATION,
    );
    const ratio = business / commuter;

    console.log(
      `fare per unit over ${LONG_TILES} tiles: commuter ${commuter.toFixed(2)} ct, ` +
        `business ${business.toFixed(2)} ct, ratio ${ratio.toFixed(3)}`,
    );
    // Measured 0.664. Deliberately not banded tighter: what is being asserted
    // is the SIGN of the effect, and the exact figure moves with every
    // decision the payment formula makes.
    expect(ratio).toBeLessThan(0.9);
  });
});

// ---------------------------------------------------------------- the remap

/**
 * The v29 encoder, reconstructed for this test alone.
 *
 * The corpus reconstructed the v22 container exactly once and for the same
 * reason (see tests/corpus/saveCorpus.spec.ts): a build cannot ask an older
 * build to write a file for it. The reconstruction is only legitimate where
 * it is TOTAL, so the caller asserts first that the world it is applied to
 * contains no business passengers at all - a v29 world could not have had
 * any, and a lossy inverse would prove nothing about the forward map.
 */
function toV29State(state: Record<string, unknown>): Record<string, unknown> {
  const cargoBack = (value: unknown): unknown => {
    if (typeof value !== 'number') return value;
    expect(value).not.toBe(Cargo.BusinessPax);
    return value === Cargo.CommuterPax ? 0 : value;
  };
  const shrinkRow = (row: number[], stride: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < row.length; i += CARGO_COUNT * stride) {
      const block = new Array<number>(18 * stride).fill(0);
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        for (let field = 0; field < stride; field++) {
          const value = row[i + cargo * stride + field]!;
          if (cargo === Cargo.BusinessPax) {
            expect(value).toBe(0);
            continue;
          }
          const target = cargo === Cargo.CommuterPax ? 0 : cargo;
          block[target * stride + field] = value;
        }
      }
      out.push(...block);
    }
    return out;
  };

  const clone = structuredClone(state);
  for (const station of (clone['stations'] ?? []) as Record<string, unknown>[]) {
    for (const stack of station['waiting'] as Record<string, unknown>[]) {
      stack['cargo'] = cargoBack(stack['cargo']);
    }
    station['history'] = shrinkRow(station['history'] as number[], STATION_HISTORY_FIELD_COUNT);
    station['monthCounters'] = shrinkRow(
      station['monthCounters'] as number[],
      STATION_HISTORY_FIELD_COUNT,
    );
    // A v29 build had no return-journey ledger to write (SPEC2 M19 bundle 3),
    // so the reconstruction writes none. See `clearReturnLedger` below.
    Reflect.deleteProperty(station, 'returnState');
    Reflect.deleteProperty(station, 'returnMonths');
  }
  for (const vehicle of (clone['vehicles'] ?? []) as Record<string, unknown>[]) {
    for (const stack of vehicle['cargo'] as Record<string, unknown>[]) {
      stack['cargo'] = cargoBack(stack['cargo']);
    }
    vehicle['refitCargo'] = cargoBack(vehicle['refitCargo']);
    for (const order of vehicle['orders'] as Record<string, unknown>[]) {
      if ((order['refitTo'] as number) >= 0) order['refitTo'] = cargoBack(order['refitTo']);
    }
  }
  for (const line of (clone['lines'] ?? []) as Record<string, unknown>[]) {
    for (const order of line['orders'] as Record<string, unknown>[]) {
      if ((order['refitTo'] as number) >= 0) order['refitTo'] = cargoBack(order['refitTo']);
    }
  }
  for (const company of (clone['companies'] ?? []) as Record<string, unknown>[]) {
    company['cargoDeliveredUnits'] = shrinkRow(company['cargoDeliveredUnits'] as number[], 1);
  }
  return clone;
}

/**
 * Clear the one thing a version 29 container cannot carry.
 *
 * SPEC2 M19's third bundle gave every station a return-journey ledger, which
 * is v30 state with no v29 counterpart at all - not a renamed field and not a
 * grown row, but a measurement that did not exist while those worlds were
 * being played. The migration therefore enters it EMPTY, which is what a v29
 * world knew about itself (it generated no return journeys and banked no
 * credit for any), and the two claims below are stated against that: the
 * inverse is total for everything a v29 encoder wrote, and the ledger is
 * excluded explicitly rather than quietly. The caller asserts the ledger is
 * NON-empty first, so the exclusion can never become vacuous.
 */
function clearReturnLedger(state: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(state);
  for (const station of (clone['stations'] ?? []) as Record<string, unknown>[]) {
    station['returnState'] = (station['returnState'] as number[]).map(() => 0);
    station['returnMonths'] = 0;
  }
  return clone;
}

/** Units of return-journey ledger a played world is carrying, over all of it. */
function ledgerTotal(state: Record<string, unknown>): number {
  let total = 0;
  for (const station of (state['stations'] ?? []) as Record<string, unknown>[]) {
    for (const figure of station['returnState'] as number[]) total += Math.abs(figure);
    total += station['returnMonths'] as number;
  }
  return total;
}

/** A played world with real parcels, refits, rings and a lifetime tally. */
function playedPassengerWorld(): TwoTownScenario {
  const scenario = twoTownScenario(POPULATION, 25);
  buildBusLine(scenario, BUS, 2);
  // A second vehicle with a per-order refit, so the order grammar's own cargo
  // field is represented in the payload the remap is measured on.
  apply(scenario, {
    kind: CommandKind.BuyRoadVehicle,
    x: scenario.townA.x + 2,
    y: scenario.townA.y,
    specId: 220,
  });
  const mailVan = scenario.world.vehicles.count - 1;
  apply(scenario, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: mailVan,
    orders: [
      { target: 0, targetId: 0, load: 1, unload: 0, refitTo: Cargo.CommuterPax },
      { target: 0, targetId: 1, load: 1, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: mailVan, running: true });
  step(scenario, 2 * 6_000 + 400);
  return scenario;
}

describe('the v29 -> v30 remap', () => {
  it('is lossless on a played world: down to v29 and back is the same world', () => {
    const scenario = playedPassengerWorld();
    const world = scenario.world;

    // The fixture has to be worth measuring: parcels waiting, parcels aboard,
    // a refitted vehicle, a filled ring and a lifetime tally.
    expect(waitingOf(world, 0, Cargo.CommuterPax)).toBeGreaterThan(0);
    expect(world.company.cargoDeliveredUnits[Cargo.CommuterPax]!).toBeGreaterThan(0);
    expect(world.vehicles.refitCargo[2]).toBe(Cargo.CommuterPax);
    const ringSlot = historySlot(
      world.stations[0]!,
      0,
      Cargo.CommuterPax,
      StationHistoryField.Collected,
    );
    expect(
      world.stations[0]!.history[ringSlot]! + world.stations[0]!.monthCounters[0]!,
    ).toBeTruthy();

    const current = world.toData() as unknown as Record<string, unknown>;
    const migrated = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 29, state: toV29State(current) },
      29,
      30,
    );

    // Everything a v29 encoder could write comes back field for field. The one
    // exclusion is the M19 return-journey ledger, and it is a real exclusion
    // rather than an empty one: this world HAS been sending travellers home.
    expect(ledgerTotal(current)).toBeGreaterThan(0);
    expect(migrated['state']).toEqual(clearReturnLedger(current));
    expect(migrated['saveVersion']).toBe(30);
  });

  it('loads a v29 container into the identical world the v30 encoder writes', () => {
    const scenario = playedPassengerWorld();
    // Identical but for the one thing v29 could not carry: the reference is
    // taken with the M19 ledger emptied, which is the value the migration
    // enters and the value that world's stations genuinely held. It is emptied
    // on the LIVE world after the assertion that it was full, so the rest of
    // the state - parcels, refits, rings, tallies - is untouched.
    expect(
      ledgerTotal(scenario.world.toData() as unknown as Record<string, unknown>),
    ).toBeGreaterThan(0);
    for (const station of scenario.world.stations) {
      station.returnState.fill(0);
      station.returnMonths = 0;
    }
    const reference = hashWorld(scenario.world);

    const v29 = {
      magic: SAVE_MAGIC,
      saveVersion: 29,
      gameVersion: GAME_VERSION,
      seed: scenario.world.seed,
      tick: scenario.world.tick,
      // A v29 build wrote a digest of ITS own hash function; a migrated save
      // never verifies one (D-131's version pinning), and the empty string is
      // what every fixture older than the current format carries.
      worldDigest: '',
      state: toV29State(scenario.world.toData() as unknown as Record<string, unknown>),
      commandLog: scenario.queue.log,
      commandsExecuted: scenario.queue.executedCount,
      logBaseTick: 0,
      checkpoints: [],
      replay: null,
      scenario: null,
    };

    const loaded = decodeSave(zlibSync(encode(v29), { level: 6 }));
    expect(hashWorld(loaded.world)).toBe(reference);
  });

  it('carries a genuine older save on disk across, tally by tally', () => {
    // The corpus fixture written by the M18 build, untouched since. Its world
    // is station-less and vehicle-less by construction (the recorded game
    // takes a loan and renames the company), so what it can prove is the half
    // it HAS: the CARGO_COUNT-sized company row grows without moving a figure.
    // The parcel half is the round trip above; the whole-world half is the
    // corpus manifest, which decodes all nine fixtures into one world.
    const path = fileURLToPath(new URL('../corpus/fixtures/v29-played.ironsave', import.meta.url));
    const payload = decode(unzlibSync(readFileSync(path))) as Record<string, unknown>;
    expect(payload['saveVersion']).toBe(29);

    const before = (payload['state'] as Record<string, unknown>)['companies'] as Record<
      string,
      unknown
    >[];
    const beforeRows = before.map((company) => [...(company['cargoDeliveredUnits'] as number[])]);
    for (const row of beforeRows) expect(row.length).toBe(18);

    const migrated = migrateSavePayload(payload, 29, 30);
    const after = (migrated['state'] as Record<string, unknown>)['companies'] as Record<
      string,
      unknown
    >[];
    expect(after.length).toBe(before.length);

    for (let i = 0; i < after.length; i++) {
      const row = after[i]!['cargoDeliveredUnits'] as number[];
      expect(row.length).toBe(CARGO_COUNT);
      expect(row[Cargo.CommuterPax]).toBe(beforeRows[i]![0]!);
      expect(row[Cargo.BusinessPax]).toBe(0);
      expect(row[Cargo.Passengers]).toBe(0);
      for (let cargo = 1; cargo < 18; cargo++) expect(row[cargo]).toBe(beforeRows[i]![cargo]!);
      // Nothing was invented and nothing was lost.
      const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
      expect(sum(row)).toBe(sum(beforeRows[i]!));
    }
  });

  it('leaves a state that is already current exactly as it is', () => {
    // The corpus trick - a CURRENT state wrapped in an old version header -
    // must not shift a real table sideways a second time.
    const scenario = playedPassengerWorld();
    const current = scenario.world.toData() as unknown as Record<string, unknown>;
    const migrated = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 29, state: structuredClone(current) },
      29,
      30,
    );
    expect(migrated['state']).toEqual(current);
  });

  it('never re-aims a goal that does not name a cargo', () => {
    // Only CargoDeliveredTotal reads `subjectA` as a cargo. Town 0 is a town
    // id in every other kind, and remapping it would silently point the goal
    // at another town.
    const migrated = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 29,
        state: {
          mapSize: 64,
          goals: [
            { kind: 1, subjectA: 0 },
            { kind: 2, subjectA: 0 },
          ],
        },
      },
      29,
      30,
    );
    const goals = (migrated['state'] as Record<string, unknown>)['goals'] as Record<
      string,
      unknown
    >[];
    expect(goals[0]!['subjectA']).toBe(Cargo.CommuterPax);
    expect(goals[1]!['subjectA']).toBe(0);
  });

  it('leaves the recorded command log alone', () => {
    // A log is history, not state (D-131), and it is judged only by a build of
    // its own version - cross-version replay verification is refused rather
    // than guessed (E-11, D-191). Rewriting a recorded refit would invent a
    // command the player never gave.
    const log = [{ tick: 5, seq: 0, companyId: 0, command: { kind: 13, refitTo: 0 } }];
    const migrated = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 29, state: { mapSize: 64 }, commandLog: log },
      29,
      30,
    );
    expect(migrated['commandLog']).toEqual(log);
  });
});

describe('the save version', () => {
  it('is the one M19 bump', () => {
    expect(SAVE_VERSION).toBe(30);
  });
});
