import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import {
  CENTS_PER_EURO,
  Difficulty,
  LEDGER_HISTORY_MONTHS,
  MONTHS_PER_YEAR,
  OBSOLETE_DECAY_FACTOR,
  OBSOLETE_UPKEEP_FACTOR,
  RELIABILITY_DECAY_PER_YEAR,
  RELIABILITY_SERVICE_GAIN,
  START_CAPITAL_CT,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import {
  bookExpense,
  bookMonthlyDepreciation,
  bookMonthlyInterest,
  bookRevenue,
  closeFinancialYear,
  closeMonth,
  createCompany,
} from '../../src/sim/economy/company';
import {
  Account,
  ACCOUNT_COUNT,
  bookValueCt,
  companyValueCt,
  monthsInOrder,
  profitCt,
} from '../../src/sim/economy/ledger';
import { CommandKind } from '../../src/sim/commands/types';
import { ModuleKind } from '../../src/sim/station/types';
import { isObsolete, serviceVehicle, vehicleAgeYears } from '../../src/sim/vehicles/lifecycle';
import { vehicleSpec } from '../../src/sim/vehicles/catalog';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The accounts of section 14.1 and the ageing of section 11.3.
 *
 * What these hold in place is that every euro lands in exactly one account, and
 * that the two non-obvious rules stay non-obvious for a reason: depreciation
 * never touches cash, and a vehicle past its design life costs twice as much
 * while falling apart twice as fast.
 */

const BUS = 200;

function company() {
  return createCompany(0, 'Buchhaltung AG', 0, START_CAPITAL_CT[Difficulty.Normal]!);
}

describe('the accounts', () => {
  it('splits revenue three ways by what was carried', () => {
    const c = company();
    bookRevenue(c, 100, Cargo.CommuterPax);
    bookRevenue(c, 200, Cargo.Mail);
    bookRevenue(c, 400, Cargo.Coal);
    bookRevenue(c, 800, Cargo.Goods);

    expect(c.accounts[Account.RevenuePassengers]).toBe(100);
    expect(c.accounts[Account.RevenueMail]).toBe(200);
    // Everything that is neither a person nor a letter is freight.
    expect(c.accounts[Account.RevenueFreight]).toBe(1_200);
    expect(c.cashCt - createCompany(0, 'x', 0, START_CAPITAL_CT[Difficulty.Normal]!).cashCt).toBe(
      1_500,
    );
  });

  it('keeps depreciation out of the bank', () => {
    const c = company();
    c.fixedAssetsCt = 120_000;
    const cashBefore = c.cashCt;

    const charged = bookMonthlyDepreciation(c, 12_000);
    expect(charged).toBe(1_000);
    expect(c.accounts[Account.Depreciation]).toBe(1_000);
    // The money left when the asset was bought. It must not leave twice.
    expect(c.cashCt).toBe(cashBefore);
    expect(c.profitThisYearCt).toBe(-1_000);
    expect(bookValueCt(c)).toBe(119_000);
  });

  it('stops depreciating an asset that is fully written down', () => {
    const c = company();
    c.fixedAssetsCt = 1_000;
    expect(bookMonthlyDepreciation(c, 12_000)).toBe(1_000);
    expect(bookMonthlyDepreciation(c, 12_000)).toBe(0);
    expect(bookValueCt(c)).toBe(0);
  });

  it('books interest to its own account and to the month', () => {
    const c = company();
    c.loanCt = 120_000;
    const charged = bookMonthlyInterest(c, Difficulty.Normal);

    expect(charged).toBeGreaterThan(0);
    expect(c.accounts[Account.Interest]).toBe(charged);
    // It used to touch cash directly and never reached the monthly expenses.
    expect(c.expensesThisMonthCt).toBe(charged);
  });

  it('files each month into the ring and into the year', () => {
    const c = company();
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      bookRevenue(c, 1_000, Cargo.CommuterPax);
      bookExpense(c, 400, Account.Construction);
      closeMonth(c);
    }

    expect(c.accounts[Account.RevenuePassengers]).toBe(0);
    expect(c.yearAccounts[Account.RevenuePassengers]).toBe(12_000);
    expect(c.yearAccounts[Account.Construction]).toBe(4_800);

    const rows = monthsInOrder(c);
    expect(rows).toHaveLength(LEDGER_HISTORY_MONTHS);
    expect(rows[0]).toHaveLength(ACCOUNT_COUNT);
    // The most recent month is the last row, whatever the cursor is doing.
    expect(rows[LEDGER_HISTORY_MONTHS - 1]![Account.RevenuePassengers]).toBe(1_000);
    expect(profitCt(rows[LEDGER_HISTORY_MONTHS - 1]!)).toBe(600);
  });

  it('rolls the year and remembers what the company was worth', () => {
    const c = company();
    bookRevenue(c, 5_000, Cargo.Coal);
    closeMonth(c);
    closeFinancialYear(c);

    expect(c.lastYearAccounts[Account.RevenueFreight]).toBe(5_000);
    expect(c.yearAccounts[Account.RevenueFreight]).toBe(0);
    expect(c.valueHistory).toHaveLength(1);
    expect(c.valueHistory[0]).toBe(companyValueCt(c));
  });

  it('values the company at cash plus book value less debt', () => {
    const c = company();
    c.cashCt = 100_000;
    c.loanCt = 30_000;
    c.fixedAssetsCt = 50_000;
    c.accumulatedDepreciationCt = 20_000;
    expect(companyValueCt(c)).toBe(100_000 + 30_000 - 30_000);
  });
});

describe('a vehicle past its design life', () => {
  function busInDepot(): Scenario {
    // Clear of the town, whose own streets are already laid.
    const scenario = flatScenario(64, [makeTown(0, 20, 20, 1_200, 'Altstadt')], []);
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 40, y1: 40, x2: 48, y2: 40 });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 40,
      y: 40,
      moduleKind: ModuleKind.RoadDepot,
    });
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 40, y: 40, specId: BUS });
    return scenario;
  }

  it('starts at the reliability its catalogue entry says', () => {
    const scenario = busInDepot();
    // This was zero for every vehicle in the game until D-089.
    expect(scenario.world.vehicles.reliability[0]).toBe(vehicleSpec(BUS).reliability0);
  });

  it('loses reliability twice as fast once it is obsolete', () => {
    const scenario = busInDepot();
    const world = scenario.world;
    const life = vehicleSpec(BUS).lifetimeYears;

    world.vehicles.reliability[0] = 9_000;
    for (let year = 0; year < 2; year++) {
      for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);
    }
    const young = 9_000 - world.vehicles.reliability[0]!;
    expect(young).toBe(2 * RELIABILITY_DECAY_PER_YEAR);

    // Push it past its life and give it another two years.
    world.vehicles.builtTick[0] = world.tick - Math.ceil(life + 1) * TICKS_PER_YEAR;
    expect(isObsolete(world, 0)).toBe(true);
    expect(vehicleAgeYears(world, 0)).toBeGreaterThan(life);

    const before = world.vehicles.reliability[0]!;
    for (let year = 0; year < 2; year++) {
      for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);
    }
    expect(before - world.vehicles.reliability[0]!).toBe(
      2 * RELIABILITY_DECAY_PER_YEAR * OBSOLETE_DECAY_FACTOR,
    );
  });

  it('costs twice as much to keep', () => {
    const scenario = busInDepot();
    const world = scenario.world;
    const fresh = vehicleSpec(BUS).upkeepCtPerYear;
    expect(world.company.vehicleUpkeepPerYearCt).toBe(fresh);

    world.vehicles.builtTick[0] = -Math.ceil(vehicleSpec(BUS).lifetimeYears + 1) * TICKS_PER_YEAR;
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(scenario.queue, null);

    expect(world.company.vehicleUpkeepPerYearCt).toBe(fresh * OBSOLETE_UPKEEP_FACTOR);
  });

  it('gets some reliability back from a depot visit, but never more than new', () => {
    const scenario = busInDepot();
    const world = scenario.world;
    const ceiling = vehicleSpec(BUS).reliability0;

    world.vehicles.reliability[0] = ceiling - RELIABILITY_SERVICE_GAIN * 2;
    serviceVehicle(world, 0);
    expect(world.vehicles.reliability[0]).toBe(ceiling - RELIABILITY_SERVICE_GAIN);

    serviceVehicle(world, 0);
    serviceVehicle(world, 0);
    expect(world.vehicles.reliability[0]).toBe(ceiling);
  });

  it('charges the fleet against the accounts month by month', () => {
    const scenario = busInDepot();
    const world = scenario.world;
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) world.step(scenario.queue, null);

    const rows = monthsInOrder(world.company);
    const first = rows[LEDGER_HISTORY_MONTHS - 1]!;
    expect(first[Account.VehicleUpkeep]).toBeGreaterThan(0);
    expect(first[Account.InfrastructureUpkeep]).toBeGreaterThan(0);
    expect(first[Account.Depreciation]).toBeGreaterThan(0);
    expect(first[Account.Construction]).toBeGreaterThan(0);
    // And the bank only moved by the cash ones.
    expect(first[Account.Depreciation]! / CENTS_PER_EURO).toBeLessThan(1_000_000);
  });
});
