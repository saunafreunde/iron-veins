import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  SUPPLY_BREACH_MONTHS,
  SUPPLY_HUNGER_SHARE,
  SUPPLY_MAX_OPEN,
  SUPPLY_MIN_OPEN,
  SUPPLY_PENALTY_SHARE,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { Account, ACCOUNT_COUNT, ACCOUNT_NAME_KEYS } from '../../src/sim/economy/ledger';
import {
  creditSupply,
  isSupplyOpen,
  supplyBonusCtFor,
  type SupplyContract,
} from '../../src/sim/economy/supply';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import type { World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, tryApply, type Scenario } from '../balance/scenario';

/**
 * Supply contracts (SPEC2 M21): a consuming works orders a monthly quota, and
 * the acceptance sentence of the milestone is measured here - "a supply
 * contract for 200 t of coal a month books bonus AND penalty through
 * `Account.ContractPenalties`".
 *
 * The world is the SPEC2 example literally: a steel works whose recipe is coal
 * and iron ore, a quota of two hundred units of coal a month, and a company
 * that supplies it for one month and then stops.
 */

const SIZE = 64;
const MILL_X = 30;
const MILL_Y = 30;

/** The example world: one steel works, one town, and a century (SPEC2 M21). */
function scenario(economy = true): Scenario {
  const s = flatScenario(
    SIZE,
    [makeTown(0, 12, 12, 2_000, 'Huettenheim')],
    [newIndustry(0, IndustryType.SteelMill, MILL_X, MILL_Y, 0)],
    9,
    0,
    true,
    undefined,
    false,
    economy,
  );
  for (const company of s.world.companies) company.cashCt = 500_000_000_00;
  return s;
}

/** SPEC2's own worked example, planted so the test owns its terms. */
function plant(world: World, quotaUnits = 200, months = 12): SupplyContract {
  const contract: SupplyContract = {
    id: world.nextSupplyContractId++,
    industryId: 0,
    cargo: Cargo.Coal,
    quotaUnits,
    offeredTick: world.tick,
    endTick: world.tick + months * TICKS_PER_MONTH,
    bonusCt: supplyBonusCtFor(world, Cargo.Coal, quotaUnits),
    acceptedBy: [],
    deliveredThisMonth: [],
    monthsMissed: 0,
    monthsMet: 0,
  };
  world.supplyContracts.push(contract);
  return contract;
}

function runMonths(s: Scenario, months: number): void {
  for (let tick = 0; tick < TICKS_PER_MONTH * months; tick++) s.world.step(s.queue, null);
}

/** What is standing in one account of the month in progress. [cent] */
function account(s: Scenario, which: number): number {
  return s.world.playerCompany.accounts[which] ?? 0;
}

describe('the eleventh account', () => {
  it('exists, is named in both catalogues and is a cost', () => {
    expect(Account.ContractPenalties).toBe(ACCOUNT_COUNT - 1);
    expect(ACCOUNT_NAME_KEYS).toHaveLength(ACCOUNT_COUNT);
    expect(ACCOUNT_NAME_KEYS[Account.ContractPenalties]).toBe('account.contractPenalties');
  });
});

describe('the supply board', () => {
  it('exists only in a century world', () => {
    const without = scenario(false);
    runMonths(without, 2);
    expect(without.world.supplyContracts).toHaveLength(0);

    const with_ = scenario(true);
    runMonths(with_, 1);
    const open = with_.world.supplyContracts.filter((c) => isSupplyOpen(with_.world, c));
    expect(open.length).toBeGreaterThanOrEqual(SUPPLY_MIN_OPEN);
    expect(open.length).toBeLessThanOrEqual(SUPPLY_MAX_OPEN);
  });

  it('only ever orders a cargo the works actually consumes', () => {
    const s = scenario();
    runMonths(s, 24);
    expect(s.world.supplyContracts.length).toBeGreaterThan(0);
    for (const contract of s.world.supplyContracts) {
      expect(contract.industryId).toBe(0);
      expect([Cargo.Coal, Cargo.IronOre]).toContain(contract.cargo);
    }
  });

  it('offers the same board twice for the same seed, and never grows unbounded', () => {
    const first = scenario();
    const second = scenario();
    runMonths(first, 36);
    runMonths(second, 36);

    const shape = (s: Scenario): string[] =>
      s.world.supplyContracts.map((c) => `${c.cargo}:${c.quotaUnits}:${c.endTick}`);
    expect(shape(second)).toEqual(shape(first));
    expect(first.world.supplyContracts.length).toBeLessThan(30);
  });
});

describe('taking a standing order on', () => {
  it('costs nothing and can only be done once', () => {
    const s = scenario();
    const contract = plant(s.world);
    const cash = s.world.playerCompany.cashCt;

    expect(
      tryApply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id }),
    ).toBeNull();
    expect(s.world.playerCompany.cashCt).toBe(cash);
    expect(tryApply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id })).toBe(
      'cmd.reject.alreadyAccepted',
    );
  });

  it('refuses one that does not exist, and one that has run out', () => {
    const s = scenario();
    expect(tryApply(s, { kind: CommandKind.AcceptSupplyContract, contractId: 9_999 })).toBe(
      'cmd.reject.noSuchSupplyContract',
    );

    const contract = plant(s.world, 200, 12);
    s.world.tick = contract.endTick + 1;
    expect(tryApply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id })).toBe(
      'cmd.reject.supplyContractClosed',
    );
  });
});

describe('two hundred tonnes of coal a month', () => {
  it('books the bonus for a month it was supplied and the penalty for one it was not', () => {
    const s = scenario();
    const contract = plant(s.world, 200, 24);
    apply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id });
    expect(contract.bonusCt).toBeGreaterThan(0);

    // Month one: the whole quota arrives at the works.
    creditSupply(s.world, 0, 0, Cargo.Coal, 200);
    expect(contract.deliveredThisMonth[0]).toBe(200);

    const cashBefore = s.world.playerCompany.cashCt;
    runMonths(s, 1);
    expect(s.world.playerCompany.cashCt - cashBefore).toBe(contract.bonusCt);
    // A bonus is freight revenue, not a negative cost: the penalty account is
    // still untouched after a month that was served.
    expect(account(s, Account.RevenueFreight)).toBe(contract.bonusCt);
    expect(account(s, Account.ContractPenalties)).toBe(0);
    expect(contract.monthsMet).toBe(1);
    expect(contract.deliveredThisMonth[0]).toBe(0);

    // Month two: nothing arrives at all.
    const cashAfterBonus = s.world.playerCompany.cashCt;
    runMonths(s, 1);
    const penaltyCt = Math.round(contract.bonusCt * SUPPLY_PENALTY_SHARE);
    expect(account(s, Account.ContractPenalties)).toBe(penaltyCt);
    expect(cashAfterBonus - s.world.playerCompany.cashCt).toBe(penaltyCt);
    expect(contract.monthsMissed).toBe(1);
  });

  it('scales the penalty by the shortfall rather than charging it whole', () => {
    const s = scenario();
    const contract = plant(s.world, 200, 24);
    apply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id });

    // Nine tenths delivered: a tenth of the penalty, and not a flat charge.
    creditSupply(s.world, 0, 0, Cargo.Coal, 180);
    runMonths(s, 1);
    const expected = Math.round(contract.bonusCt * SUPPLY_PENALTY_SHARE * 0.1);
    expect(account(s, Account.ContractPenalties)).toBe(expected);
    expect(expected).toBeLessThan(Math.round(contract.bonusCt * SUPPLY_PENALTY_SHARE));
  });

  it('measures what the WORKS took, not what a full shed refused', () => {
    const s = scenario();
    const contract = plant(s.world, 200, 24);
    apply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id });

    // `creditSupply` is fed the accepted amount by `deliverCargo`; nothing that
    // was never accepted can reach it, and a zero credits nothing.
    creditSupply(s.world, 0, 0, Cargo.Coal, 0);
    expect(contract.deliveredThisMonth[0]).toBe(0);
    // And a cargo the order is not about is not fulfilment of it.
    creditSupply(s.world, 0, 0, Cargo.IronOre, 500);
    expect(contract.deliveredThisMonth[0]).toBe(0);
    // Nor is a delivery by a company that never took the order on.
    creditSupply(s.world, 1, 0, Cargo.Coal, 500);
    expect(contract.deliveredThisMonth[1] ?? 0).toBe(0);
  });
});

describe('persistent breach', () => {
  it('starves the input it is short of, and touches nothing else', () => {
    const s = scenario();
    const contract = plant(s.world, 200, 36);
    apply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id });

    const works = s.world.industries[0]!;
    works.inputStock0 = 400;
    works.inputStock1 = 400;

    // The control is the SAME world with the quota met every month, because a
    // steel works EATS its coal to make steel (7.3) - a stock that fell is not
    // evidence of hunger, a stock that fell FURTHER is. Both worlds are
    // identical until the starving month itself, which is the last one.
    const control = scenario();
    const twin = plant(control.world, 200, 36);
    apply(control, { kind: CommandKind.AcceptSupplyContract, contractId: twin.id });
    const controlWorks = control.world.industries[0]!;
    controlWorks.inputStock0 = 400;
    controlWorks.inputStock1 = 400;

    for (let month = 0; month < SUPPLY_BREACH_MONTHS; month++) {
      creditSupply(control.world, 0, 0, Cargo.Coal, 200);
      runMonths(control, 1);
    }
    expect(twin.monthsMissed).toBe(0);

    runMonths(s, SUPPLY_BREACH_MONTHS - 1);
    expect(contract.monthsMissed).toBe(SUPPLY_BREACH_MONTHS - 1);
    runMonths(s, 1);

    // The coal shed - slot 0 of the steel recipe - and nothing else.
    expect(controlWorks.inputStock0).toBeGreaterThan(0);
    expect(works.inputStock0).toBeCloseTo(controlWorks.inputStock0 * (1 - SUPPLY_HUNGER_SHARE), 6);
    expect(works.inputStock1).toBe(controlWorks.inputStock1);
    // Nothing shrinks an industry (D-086): the level and the closure clock read
    // exactly what the fed twin reads. Both worlds run the ordinary 7.3 clocks -
    // nobody collects the steel in either - so the CONTROL is what says the
    // hunger touched neither.
    expect(works.productionLevel).toBe(controlWorks.productionLevel);
    expect(works.monthsWithoutCollection).toBe(controlWorks.monthsWithoutCollection);
    // And the counter re-arms rather than starving the works every month after.
    expect(contract.monthsMissed).toBe(0);
  });

  it('resets the moment the quota is met again', () => {
    const s = scenario();
    const contract = plant(s.world, 200, 36);
    apply(s, { kind: CommandKind.AcceptSupplyContract, contractId: contract.id });

    runMonths(s, 1);
    expect(contract.monthsMissed).toBe(1);
    creditSupply(s.world, 0, 0, Cargo.Coal, 200);
    runMonths(s, 1);
    expect(contract.monthsMissed).toBe(0);
    expect(contract.monthsMet).toBe(1);
  });
});
