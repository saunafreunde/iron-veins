import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  CO2_ELECTRIFICATION_GRANT_SHARE,
  CO2_GRANT_FROM_YEAR,
  CO2_KG_PER_MJ,
  CO2_LEVY_CT_PER_TONNE,
  CO2_LEVY_FROM_YEAR,
  CO2_LEVY_RISE_FROM_YEAR,
  START_YEAR,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { Account } from '../../src/sim/economy/ledger';
import { levyCtPerTonne } from '../../src/sim/economy/emissions';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { PowerCode } from '../../src/sim/vehicles/spec';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The environment rating and the carbon levy of section 14.3.
 *
 * The section is explicit that this is an economic incentive and not a moral
 * one: nothing is forbidden, nothing is capped, and it can be switched off. So
 * what is tested is that the money moves - a levy that appears in 2000, climbs
 * from 2005, and a grant that makes electrification cheaper while it applies.
 */

const SIZE = 64;
const ROW = 20;

function scenario(emissions = true): Scenario {
  const s = flatScenario(SIZE, [makeTown(0, 30, 40, 1_200, 'Kohlheim')], [], 9, 0, emissions);
  s.world.playerCompany.cashCt = 500_000_000_00;
  return s;
}

/**
 * The bus line the metering tests need, running end to end.
 *
 * The bus is chosen from the catalogue by the year, because a test that starts
 * in 2000 cannot buy a 1950 model - it was withdrawn thirty years earlier.
 */
function busLine(s: Scenario): void {
  const specId = s.world.date.year >= 1994 ? 203 : 200;
  apply(s, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 25, y2: ROW });
  apply(s, {
    kind: CommandKind.BuildRoadStop,
    x: 5,
    y: ROW,
    moduleKind: ModuleKind.RoadDepot,
  });
  apply(s, { kind: CommandKind.BuyRoadVehicle, x: 5, y: ROW, specId });
  apply(s, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      { target: 1, targetId: s.world.map.tileIndex(6, ROW), load: 0, unload: 0 },
      { target: 1, targetId: s.world.map.tileIndex(24, ROW), load: 0, unload: 0 },
    ],
  });
  apply(s, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
}

/**
 * Start a fresh world in a given year.
 *
 * The clock is set rather than run to it. Fifty game years is nine million
 * ticks, and a company with a fleet and no revenue does not survive them -
 * running the calendar would be measuring bankruptcy, not the levy. Nothing has
 * happened in the world yet, so the jump leaves nothing inconsistent behind it.
 */
function startInYear(year: number, emissions = true): Scenario {
  const s = scenario(emissions);
  s.world.tick = (year - START_YEAR) * TICKS_PER_YEAR;
  return s;
}

describe('the levy', () => {
  it('does not exist before the year it is introduced', () => {
    expect(levyCtPerTonne(CO2_LEVY_FROM_YEAR - 1)).toBe(0);
    expect(levyCtPerTonne(CO2_LEVY_FROM_YEAR)).toBe(CO2_LEVY_CT_PER_TONNE);
  });

  it('is flat for five years and climbs after that', () => {
    expect(levyCtPerTonne(CO2_LEVY_RISE_FROM_YEAR)).toBe(CO2_LEVY_CT_PER_TONNE);
    const first = levyCtPerTonne(CO2_LEVY_RISE_FROM_YEAR + 1);
    const second = levyCtPerTonne(CO2_LEVY_RISE_FROM_YEAR + 2);
    expect(first).toBeGreaterThan(CO2_LEVY_CT_PER_TONNE);
    // Linear, not exponential: a player has to be able to work out what
    // electrifying in a given year would save them.
    expect(second - first).toBe(first - CO2_LEVY_CT_PER_TONNE);
  });

  it('ranks the carriers the way the energy table does', () => {
    // Steam worst by a distance, electric best - and electric is not zero,
    // because the grid of 1950 burned coal too.
    expect(CO2_KG_PER_MJ[PowerCode.Steam]!).toBeGreaterThan(CO2_KG_PER_MJ[PowerCode.Diesel]!);
    expect(CO2_KG_PER_MJ[PowerCode.Diesel]!).toBeGreaterThan(CO2_KG_PER_MJ[PowerCode.Electric]!);
    expect(CO2_KG_PER_MJ[PowerCode.Electric]!).toBeGreaterThan(0);
  });
});

describe('what a running company is charged', () => {
  it('meters the carbon a working fleet emits', () => {
    const s = scenario();
    busLine(s);

    for (let tick = 0; tick < TICKS_PER_MONTH * 2; tick++) s.world.step(s.queue, null);
    expect(s.world.playerCompany.co2ThisYearKg).toBeGreaterThan(0);
  });

  it('charges nothing for it before the levy year, and something after', () => {
    const before = scenario();
    busLine(before);

    for (let tick = 0; tick < TICKS_PER_MONTH * 3; tick++) before.world.step(before.queue, null);
    expect(before.world.playerCompany.co2ThisYearKg).toBeGreaterThan(0);
    expect(before.world.playerCompany.yearAccounts[Account.Emissions]).toBe(0);

    const after = startInYear(CO2_LEVY_FROM_YEAR);
    busLine(after);
    for (let tick = 0; tick < TICKS_PER_MONTH * 3; tick++) after.world.step(after.queue, null);
    expect(after.world.playerCompany.yearAccounts[Account.Emissions]!).toBeGreaterThan(0);
  });

  it('starts the carbon year fresh every game year', () => {
    const s = scenario();
    s.world.playerCompany.co2ThisYearKg = 4_321;
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) s.world.step(s.queue, null);

    expect(s.world.playerCompany.co2LastYearKg).toBeGreaterThanOrEqual(4_321);
    expect(s.world.playerCompany.co2ThisYearKg).toBeLessThan(4_321);
  });
});

describe('the electrification grant', () => {
  const track = {
    kind: CommandKind.BuildTrack,
    x1: 5,
    y1: ROW,
    x2: 20,
    y2: ROW,
    railType: RailType.Electrified,
    assistant: false,
    signalSpacing: 0,
  } as const;

  it('pays nothing before the year it starts', () => {
    const s = scenario();
    const before = s.world.playerCompany.cashCt;
    apply(s, track);
    const paidEarly = before - s.world.playerCompany.cashCt;

    const later = startInYear(CO2_GRANT_FROM_YEAR);
    const cash = later.world.playerCompany.cashCt;
    apply(later, track);
    const paidLate = cash - later.world.playerCompany.cashCt;

    // Inflation makes the later bill LARGER in cash terms, so the grant is
    // measured against that year's price rather than against the earlier one.
    expect(paidEarly).toBeGreaterThan(0);
    expect(paidLate).toBeGreaterThan(0);
    expect(paidLate / (1 - CO2_ELECTRIFICATION_GRANT_SHARE)).toBeGreaterThan(paidEarly);
  });

  it('is not paid for track that is not electrified', () => {
    const s = startInYear(CO2_GRANT_FROM_YEAR);

    const cashA = s.world.playerCompany.cashCt;
    apply(s, { ...track, railType: RailType.Plain, y1: ROW + 4, y2: ROW + 4 });
    const plain = cashA - s.world.playerCompany.cashCt;

    const cashB = s.world.playerCompany.cashCt;
    apply(s, { ...track, y1: ROW + 8, y2: ROW + 8 });
    const electric = cashB - s.world.playerCompany.cashCt;

    // Electrified track costs more than plain and still comes out cheaper
    // after the grant - which is the entire point of paying it.
    expect(electric).toBeLessThan(plain);
  });
});

describe('the switch', () => {
  it('turns the whole thing off - levy and grant together', () => {
    const off = startInYear(CO2_LEVY_FROM_YEAR, false);
    busLine(off);
    for (let tick = 0; tick < TICKS_PER_MONTH * 3; tick++) off.world.step(off.queue, null);

    // Nothing metered, nothing charged.
    expect(off.world.playerCompany.co2ThisYearKg).toBe(0);
    expect(off.world.playerCompany.yearAccounts[Account.Emissions]).toBe(0);

    // And the grant is gone with it, so electrified track costs its full price.
    const cash = off.world.playerCompany.cashCt;
    apply(off, {
      kind: CommandKind.BuildTrack,
      x1: 5,
      y1: ROW + 6,
      x2: 20,
      y2: ROW + 6,
      railType: RailType.Electrified,
      assistant: false,
      signalSpacing: 0,
    });
    const paidWithout = cash - off.world.playerCompany.cashCt;

    const on = startInYear(CO2_LEVY_FROM_YEAR);
    const cashOn = on.world.playerCompany.cashCt;
    apply(on, {
      kind: CommandKind.BuildTrack,
      x1: 5,
      y1: ROW + 6,
      x2: 20,
      y2: ROW + 6,
      railType: RailType.Electrified,
      assistant: false,
      signalSpacing: 0,
    });
    expect(cashOn - on.world.playerCompany.cashCt).toBeLessThan(paidWithout);
  });
});
