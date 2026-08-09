import { describe, expect, it } from 'vitest';
import { Cargo, PASSENGER_CLASS_COUNT } from '../../src/sim/cargo/types';
import { CENTS_PER_EURO } from '../../src/sim/constants';
import { ReturnField, returnSlot } from '../../src/sim/station/returns';
import { stationRating } from '../../src/sim/station/types';
import { VEHICLE_STATE_KEYS } from '../../src/sim/vehicles/VehicleStore';
import { upkeepPerYearCt } from '../../src/sim/economy/ledger';
import type { World } from '../../src/sim/World';
import { hashTwin } from './determinism';
import { buildBusLine, runYears, twoTownScenario } from './scenario';

/**
 * Balancing scenario 1 of section 19.4.
 *
 * "First bus line, two towns of 1,200 inhabitants, 25 tiles apart, two buses:
 *  pays for itself in 2 to 4 game years."
 *
 * When this leaves its band the CONSTANTS get adjusted, never the test - the
 * numbers in the tables are starting values, this band is the requirement.
 *
 * **SPEC2 M19 re-measured this scenario and it is the only 19.4 world the
 * milestone could touch** - the other four hand-built worlds haul coal, planks
 * and furniture, and a passenger rule cannot reach a freight line. Two of the
 * three M19 bundles are provably inert here and the third is not, so the two
 * blocks at the end of this file pin which is which (D-215):
 *
 *  - the CLASS SPLIT (D-207) is inert: `placeTown` builds houses and nothing
 *    else, so every stop is 100 % residential, `commercialShare` is 0 and not
 *    one business traveller is ever produced. Measured byte-identical to the
 *    pre-M19 build, and the same for the gravitation of D-211 (a stop with one
 *    reachable destination normalises the mass away);
 *  - the RETURN JOURNEYS (D-213) are NOT inert, which is the one claim the
 *    re-measurement broke. `returns.ts` said both stations of this scenario
 *    generate nothing; they generate 36.68 and 45.30 units over six years.
 *    That is 0.113 % and 0.139 % of the arrivals and it is bounded here rather
 *    than denied.
 */

const POPULATION = 1_200;
const DISTANCE_TILES = 25;
const BUS_SPEC = 200; // the 1950 bus
const BUS_COUNT = 2;

const PAYBACK_MIN_YEARS = 2;
const PAYBACK_MAX_YEARS = 4;

/**
 * Ceiling on the share of a station's arrivals that may come back as return
 * journeys before this scenario stops being the passenger line M6 calibrated.
 *
 * **This is a tripwire, not a measurement**, and the distinction matters here
 * because the number it guards was read off the very run below: measured
 * 0.113 % and 0.139 % (D-215), guarded at 1 %, i.e. an order of magnitude of
 * headroom, on D-167's rule that a guard should catch a regression of
 * MULTIPLES rather than pin a digit. What the assertion is worth is that the
 * day a rule change turns this line's return traffic into a real share of its
 * business, the band below is re-derived deliberately instead of drifting.
 */
const RETURN_SHARE_CEILING = 0.01;

interface Measurement {
  readonly investmentCt: number;
  readonly balances: readonly number[];
  readonly paybackYear: number;
  /** Plain-language account of what the line actually did, for calibration. */
  readonly detail: string;
  /** The world the measurement was taken on - the desync guard's subject. */
  readonly world: World;
}

function measure(years: number): Measurement {
  const scenario = twoTownScenario(POPULATION, DISTANCE_TILES);
  const before = scenario.world.company.cashCt;

  buildBusLine(scenario, BUS_SPEC, BUS_COUNT);
  const investmentCt = before - scenario.world.company.cashCt;

  const balances = runYears(scenario, years);
  const detail = describeLine(scenario.world, years);
  let paybackYear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < balances.length; i++) {
    if (balances[i]! >= before) {
      paybackYear = i + 1;
      break;
    }
  }
  return { investmentCt, balances, paybackYear, detail, world: scenario.world };
}

/**
 * Why the line earns what it earns. A balancing test that only says "out of
 * band" sends you guessing; this says which of throughput, service quality or
 * cost is the binding constraint.
 */
function describeLine(world: World, years: number): string {
  const parts: string[] = [];

  for (const station of world.stations) {
    const waiting = station.waiting.reduce((sum, stack) => sum + stack.amount, 0);
    parts.push(
      `${station.name}: rating ${stationRating(station, world.tick)}, ` +
        `${waiting.toFixed(0)} waiting, ${station.visitTicks.length} visits per 20 days, ` +
        `covers ${station.buildingsCovered} buildings`,
    );
  }

  const vehicles = world.vehicles;
  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const carried = vehicles.cargo[id]!.reduce((sum, stack) => sum + stack.amount, 0);
    parts.push(
      `bus ${id}: ${VEHICLE_STATE_KEYS[vehicles.state[id]!]}, ` +
        `carrying ${carried.toFixed(0)}, ` +
        `earned ${(vehicles.earnedCt[id]! / CENTS_PER_EURO / years).toFixed(0)} EUR per year`,
    );
  }

  parts.push(`upkeep ${(upkeepPerYearCt(world.company) / CENTS_PER_EURO).toFixed(0)} EUR per year`);

  // The two M19 readings, printed with the rest so a re-band never has to
  // guess whether the passenger rules were part of what moved (D-215).
  for (const station of world.stations) {
    parts.push(
      `${station.name}: commercial share ${station.commercialShare.toFixed(3)}, ` +
        `arrivals ${creditedUnits(world, station.id).toFixed(2)}, ` +
        `return journeys ${generatedUnits(world, station.id).toFixed(2)} ` +
        `(${(returnShare(world, station.id) * 100).toFixed(3)} % of arrivals)`,
    );
  }
  return parts.join('\n  ');
}

/** Passengers of every class ever delivered to this station. [units] */
function creditedUnits(world: World, stationId: number): number {
  const state = world.stations[stationId]!.returnState;
  let units = 0;
  for (let c = 0; c < PASSENGER_CLASS_COUNT; c++)
    units += state[returnSlot(c, ReturnField.Credited)]!;
  return units;
}

/** Return journeys of every class ever created at this station. [units] */
function generatedUnits(world: World, stationId: number): number {
  const state = world.stations[stationId]!.returnState;
  let units = 0;
  for (let c = 0; c < PASSENGER_CLASS_COUNT; c++)
    units += state[returnSlot(c, ReturnField.Generated)]!;
  return units;
}

/** Return journeys as a share of the arrivals that paid for them. */
function returnShare(world: World, stationId: number): number {
  const credited = creditedUnits(world, stationId);
  return credited > 0 ? generatedUnits(world, stationId) / credited : 0;
}

/** Units of `cargo` still on this station's platform. [units] */
function waitingOf(world: World, stationId: number, cargo: Cargo): number {
  let units = 0;
  for (const stack of world.stations[stationId]!.waiting) {
    if (stack.cargo === cargo) units += stack.amount;
  }
  return units;
}

describe('scenario 1: the first bus line', () => {
  const result = measure(PAYBACK_MAX_YEARS + 2);

  it('reports what it measured', () => {
    const euros = (cents: number) => (cents / CENTS_PER_EURO).toFixed(0);
    console.log(
      `bus line: investment ${euros(result.investmentCt)} EUR, ` +
        `balance by year ${result.balances.map((b) => euros(b)).join(' / ')} EUR, ` +
        `payback in year ${result.paybackYear}\n  ${result.detail}`,
    );
    expect(result.investmentCt).toBeGreaterThan(0);
  });

  it('earns money at all', () => {
    // Year six must be better than year one, or the line is simply a loss.
    expect(result.balances[result.balances.length - 1]!).toBeGreaterThan(result.balances[0]!);
  });

  it('pays for itself within two to four game years', () => {
    expect(result.paybackYear).toBeGreaterThanOrEqual(PAYBACK_MIN_YEARS);
    expect(result.paybackYear).toBeLessThanOrEqual(PAYBACK_MAX_YEARS);
  });

  hashTwin(
    'busline',
    () => [result.world],
    () => [measure(PAYBACK_MAX_YEARS + 2).world],
  );

  // ------------------------------------------- what M19 did and did not touch

  it('carries commuters and nothing else - the M19 class split is inert here', () => {
    // D-207's "untouched by construction" for the class half, made checkable:
    // `placeTown` writes `BuildingKind.Residential` and nothing else, so the
    // derived share is zero, the town deposits commuters only, and the fare
    // this band calibrates is the one the retired passenger id always had.
    // A future scenario fixture that zones a shop is then a red build here
    // rather than a silent re-band of M6's oldest number.
    for (const station of result.world.stations) {
      expect(station.commercialShare, `${station.name} commercial share`).toBe(0);
      expect(waitingOf(result.world, station.id, Cargo.BusinessPax), station.name).toBe(0);
    }
    expect(result.world.company.cargoDeliveredUnits[Cargo.BusinessPax]).toBe(0);
    expect(result.world.company.cargoDeliveredUnits[Cargo.Passengers]).toBe(0);
    // And the commuter trade is real, so the two assertions above can never go
    // vacuous by the line simply carrying nobody (D-213's own discipline).
    expect(result.world.company.cargoDeliveredUnits[Cargo.CommuterPax]!).toBeGreaterThan(0);
  });

  it('sends a measurable but negligible number of travellers home again', () => {
    // The claim D-215 corrected. `returns.ts` asserted that both stations of
    // this scenario generate NOTHING because the towns are matched; they are
    // matched in POPULATION but their two stops are not matched in catchment
    // (16 buildings against 22), and a month in which the fleet clears a
    // backlog delivers more than the town offered that month, which D-213
    // itself names as the reason a balanced route is not an exact zero.
    //
    // So the property is bounded rather than denied, and it is asserted from
    // BOTH sides: strictly positive, so nobody may re-derive "inert" from a
    // green build, and under the tripwire, so a rule change that makes return
    // journeys a real share of this line's business is a red one.
    let anyGenerated = false;
    for (const station of result.world.stations) {
      const share = returnShare(result.world, station.id);
      expect(creditedUnits(result.world, station.id), station.name).toBeGreaterThan(0);
      expect(share, `${station.name} return share`).toBeLessThan(RETURN_SHARE_CEILING);
      if (generatedUnits(result.world, station.id) > 0) anyGenerated = true;
    }
    expect(anyGenerated, 'no station generated a single return journey').toBe(true);
  });
});
