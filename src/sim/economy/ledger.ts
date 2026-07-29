import { LEDGER_HISTORY_MONTHS, MONTHS_PER_YEAR } from '../constants';
import type { CompanyState } from '../types';

/**
 * The accounts of section 14.1.
 *
 * A fixed list indexed by number rather than a map of names: it is written to
 * on every delivery and every build, it is hashed, and it is saved - all three
 * of which want a dense array and none of which wants string keys. The order is
 * part of the save format, so accounts are APPENDED and never renumbered.
 *
 * Revenue accounts hold positive figures and cost accounts hold positive
 * figures too; the sign lives in {@link isRevenue} rather than in the data, so
 * a profit-and-loss view can show both columns without every reader having to
 * remember which way round a particular account runs.
 */
export const Account = {
  RevenuePassengers: 0,
  RevenueFreight: 1,
  RevenueMail: 2,
  /** Keeping the fleet on the road, doubled for anything past its life. */
  VehicleUpkeep: 3,
  /** Fuel and electricity, from the traction work actually done. */
  Energy: 4,
  /** Track, road, stations and their modules. */
  InfrastructureUpkeep: 5,
  /** Straight line over the design life. Non-cash: it never touches the bank. */
  Depreciation: 6,
  Interest: 7,
  /** Building, buying and converting - everything paid for once. */
  Construction: 8,
  /** The carbon levy of section 14.3, and nothing else. */
  Emissions: 9,
} as const;
export type Account = (typeof Account)[keyof typeof Account];

export const ACCOUNT_COUNT = 10;

/** Translation keys, indexed by account. */
export const ACCOUNT_NAME_KEYS: readonly string[] = [
  'account.revenuePassengers',
  'account.revenueFreight',
  'account.revenueMail',
  'account.vehicleUpkeep',
  'account.energy',
  'account.infrastructureUpkeep',
  'account.depreciation',
  'account.interest',
  'account.construction',
  'account.emissions',
];

/** True for the three accounts that bring money in. */
export function isRevenue(account: number): boolean {
  return account <= Account.RevenueMail;
}

/**
 * True for the accounts that never move the bank balance.
 *
 * Depreciation is the whole of that list. It belongs in the profit and loss
 * because it is what an asset costs to use, and it must NOT be subtracted from
 * cash a second time - the money left when the vehicle was bought.
 */
export function isNonCash(account: number): boolean {
  return account === Account.Depreciation;
}

/** A fresh set of accounts, all zero. */
export function emptyAccounts(): number[] {
  return new Array<number>(ACCOUNT_COUNT).fill(0);
}

/** A fresh 24 month history, flat, twenty-four rows of ACCOUNT_COUNT. */
export function emptyHistory(): number[] {
  return new Array<number>(LEDGER_HISTORY_MONTHS * ACCOUNT_COUNT).fill(0);
}

/** Book an amount to one account of the current month. [cent] */
export function book(company: CompanyState, account: Account, amountCt: number): void {
  company.accounts[account] = (company.accounts[account] ?? 0) + amountCt;
}

/** Everything that came in this month. [cent] */
export function monthRevenueCt(accounts: readonly number[]): number {
  let total = 0;
  for (let account = 0; account < ACCOUNT_COUNT; account++) {
    if (isRevenue(account)) total += accounts[account] ?? 0;
  }
  return total;
}

/** Everything that went out this month, depreciation included. [cent] */
export function monthExpenseCt(accounts: readonly number[]): number {
  let total = 0;
  for (let account = 0; account < ACCOUNT_COUNT; account++) {
    if (!isRevenue(account)) total += accounts[account] ?? 0;
  }
  return total;
}

/** Revenue less every cost, the non-cash ones included. [cent] */
export function profitCt(accounts: readonly number[]): number {
  return monthRevenueCt(accounts) - monthExpenseCt(accounts);
}

/**
 * File the month that has just ended and start a new one.
 *
 * The month is added into the running year AND written into the twenty-four
 * month ring the cash-flow chart reads. Nothing is destroyed: `closeMonth` used
 * to zero the counters and keep nothing at all, which is why there was no
 * history to show.
 */
export function archiveMonth(company: CompanyState): void {
  const base = company.historyCursor * ACCOUNT_COUNT;
  for (let account = 0; account < ACCOUNT_COUNT; account++) {
    const amount = company.accounts[account] ?? 0;
    company.monthHistory[base + account] = amount;
    company.yearAccounts[account] = (company.yearAccounts[account] ?? 0) + amount;
    company.accounts[account] = 0;
  }
  company.historyCursor = (company.historyCursor + 1) % LEDGER_HISTORY_MONTHS;
}

/** File the year that has just ended. */
export function archiveYear(company: CompanyState): void {
  for (let account = 0; account < ACCOUNT_COUNT; account++) {
    company.lastYearAccounts[account] = company.yearAccounts[account] ?? 0;
    company.yearAccounts[account] = 0;
  }
}

/**
 * The months of the ring in the order they happened, oldest first.
 *
 * The ring is written to in place, so its raw order means nothing to a reader;
 * this is what a chart wants. Months that have not happened yet are zeroes,
 * which draws as a flat start rather than as a gap.
 */
export function monthsInOrder(company: CompanyState): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < LEDGER_HISTORY_MONTHS; i++) {
    const slot = (company.historyCursor + i) % LEDGER_HISTORY_MONTHS;
    const row: number[] = [];
    for (let account = 0; account < ACCOUNT_COUNT; account++) {
      row.push(company.monthHistory[slot * ACCOUNT_COUNT + account] ?? 0);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * What the company is worth (section 14.1).
 *
 * Cash, plus what its assets are still worth in the books, less what it owes.
 * The asset figure is the gross purchase cost less the depreciation charged so
 * far - the same number the balance sheet shows, so the two can never disagree.
 */
export function companyValueCt(company: CompanyState): number {
  return company.cashCt + bookValueCt(company) - company.loanCt;
}

/** Written-down value of everything the company owns. [cent] */
export function bookValueCt(company: CompanyState): number {
  const value = company.fixedAssetsCt - company.accumulatedDepreciationCt;
  return value > 0 ? value : 0;
}

/** Total yearly upkeep, both halves. [cent] */
export function upkeepPerYearCt(company: CompanyState): number {
  return company.vehicleUpkeepPerYearCt + company.infrastructureUpkeepPerYearCt;
}

/** A twelfth of a yearly figure, in whole cents. */
export function monthlyShareCt(yearlyCt: number): number {
  return Math.round(yearlyCt / MONTHS_PER_YEAR);
}
