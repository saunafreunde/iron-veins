import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CONTRACT_MAX_OPEN,
  CONTRACT_MIN_OPEN,
  CONTRACT_PENALTY_SHARE,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { creditDelivery, isOpen, type Contract } from '../../src/sim/economy/contracts';
import { councilRating } from '../../src/sim/town/council';
import type { World } from '../../src/sim/World';
import { apply, flatScenario, makeTown, tryApply, type Scenario } from '../balance/scenario';

/**
 * Contracts and tenders (section 14.4).
 *
 * The shape is an opt-in bet: free to take, pays over the tariff, and costs
 * money and standing if it is missed. Every one is a race - several companies
 * may take the same tender and the first to finish takes the money - which is
 * what makes it competition with an AI rather than a private task list.
 */

const SIZE = 64;

function scenario(ai = 1): Scenario {
  const s = flatScenario(SIZE, [makeTown(0, 30, 40, 2_000, 'Auftragheim')], [], 9, ai);
  for (const company of s.world.companies) company.cashCt = 500_000_000_00;
  return s;
}

/** Put one contract on the board with terms the test controls. */
function plant(world: World, months: number, amountUnits = 100): Contract {
  const contract: Contract = {
    id: world.nextContractId++,
    cargo: Cargo.Goods,
    townId: 0,
    amountUnits,
    offeredTick: world.tick,
    deadlineTick: world.tick + months * TICKS_PER_MONTH,
    bonusCt: 1_000_000_00,
    acceptedBy: [],
    progress: [],
    completedBy: -1,
  };
  world.contracts.push(contract);
  return contract;
}

function runMonths(s: Scenario, months: number): void {
  for (let tick = 0; tick < TICKS_PER_MONTH * months; tick++) s.world.step(s.queue, null);
}

describe('the tender board', () => {
  it('keeps between two and five offers standing', () => {
    const s = scenario(0);
    runMonths(s, 1);

    const open = s.world.contracts.filter((c) => isOpen(s.world, c));
    expect(open.length).toBeGreaterThanOrEqual(CONTRACT_MIN_OPEN);
    expect(open.length).toBeLessThanOrEqual(CONTRACT_MAX_OPEN);
  });

  it('offers the same tenders for the same seed', () => {
    const first = scenario(0);
    const second = scenario(0);
    runMonths(first, 3);
    runMonths(second, 3);

    expect(second.world.contracts.map((c) => `${c.cargo}:${c.amountUnits}:${c.deadlineTick}`)).toEqual(
      first.world.contracts.map((c) => `${c.cargo}:${c.amountUnits}:${c.deadlineTick}`),
    );
  });

  it('never lets the board grow without bound over a long game', () => {
    const s = scenario(0);
    runMonths(s, 60);
    // Five years of tenders, and the list is still short enough to be a panel.
    expect(s.world.contracts.length).toBeLessThan(30);
  });
});

describe('taking one on', () => {
  it('costs nothing and can only be done once', () => {
    const s = scenario();
    const contract = plant(s.world, 12);
    const cash = s.world.playerCompany.cashCt;

    expect(tryApply(s, { kind: CommandKind.AcceptContract, contractId: contract.id })).toBeNull();
    expect(s.world.playerCompany.cashCt).toBe(cash);
    expect(tryApply(s, { kind: CommandKind.AcceptContract, contractId: contract.id })).toBe(
      'cmd.reject.alreadyAccepted',
    );
  });

  it('refuses one that does not exist, and one that is over', () => {
    const s = scenario();
    expect(tryApply(s, { kind: CommandKind.AcceptContract, contractId: 9_999 })).toBe(
      'cmd.reject.noSuchContract',
    );

    const contract = plant(s.world, 12);
    contract.completedBy = 1;
    expect(tryApply(s, { kind: CommandKind.AcceptContract, contractId: contract.id })).toBe(
      'cmd.reject.contractClosed',
    );
  });
});

describe('delivering against one', () => {
  it('pays the bonus when the last unit arrives, and not before', () => {
    const s = scenario();
    const contract = plant(s.world, 12, 100);
    apply(s, { kind: CommandKind.AcceptContract, contractId: contract.id });

    const cash = s.world.playerCompany.cashCt;
    creditDelivery(s.world, 0, 0, Cargo.Goods, 60);
    expect(s.world.playerCompany.cashCt).toBe(cash);
    expect(contract.completedBy).toBe(-1);

    creditDelivery(s.world, 0, 0, Cargo.Goods, 40);
    expect(contract.completedBy).toBe(0);
    expect(s.world.playerCompany.cashCt).toBe(cash + contract.bonusCt);
  });

  it('counts nothing for a company that never accepted it', () => {
    const s = scenario();
    const contract = plant(s.world, 12, 100);

    creditDelivery(s.world, 0, 0, Cargo.Goods, 500);
    expect(contract.completedBy).toBe(-1);
    expect(contract.progress[0] ?? 0).toBe(0);
  });

  it('counts nothing for the wrong cargo or the wrong town', () => {
    const s = scenario();
    const contract = plant(s.world, 12, 100);
    apply(s, { kind: CommandKind.AcceptContract, contractId: contract.id });

    creditDelivery(s.world, 0, 0, Cargo.Coal, 500);
    creditDelivery(s.world, 0, 1, Cargo.Goods, 500);
    expect(contract.progress[0] ?? 0).toBe(0);
  });

  it('is a race: the first to finish takes it and the other gets nothing', () => {
    const s = scenario();
    const contract = plant(s.world, 12, 100);
    apply(s, { kind: CommandKind.AcceptContract, contractId: contract.id }, 0);
    apply(s, { kind: CommandKind.AcceptContract, contractId: contract.id }, 1);

    creditDelivery(s.world, 1, 0, Cargo.Goods, 100);
    expect(contract.completedBy).toBe(1);

    const cash = s.world.playerCompany.cashCt;
    creditDelivery(s.world, 0, 0, Cargo.Goods, 100);
    expect(s.world.playerCompany.cashCt).toBe(cash);
  });
});

describe('missing one', () => {
  it('charges the penalty and costs standing with the town', () => {
    const s = scenario(0);
    const contract = plant(s.world, 1, 100);
    apply(s, { kind: CommandKind.AcceptContract, contractId: contract.id });

    runMonths(s, 1);
    const ratingBefore = councilRating(s.world.towns[0]!, 0);
    const cash = s.world.playerCompany.cashCt;

    runMonths(s, 2);

    expect(cash - s.world.playerCompany.cashCt).toBeGreaterThanOrEqual(
      Math.round(contract.bonusCt * CONTRACT_PENALTY_SHARE),
    );
    expect(councilRating(s.world.towns[0]!, 0)).toBeLessThan(ratingBefore);
  });

  it('charges nobody who never took it on', () => {
    const s = scenario(0);
    plant(s.world, 1, 100);
    runMonths(s, 1);
    const cash = s.world.playerCompany.cashCt;
    runMonths(s, 2);

    // Only interest and upkeep, and this company has neither a fleet nor track.
    expect(s.world.playerCompany.cashCt).toBe(cash);
  });
});
