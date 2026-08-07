import {
  BANKRUPTCY_WARNING_MONTHS,
  COMPANY_COLOR_COUNT,
  COMPANY_VALUE_YEARS,
  LOAN_INTEREST_RATE_PER_YEAR,
  LOAN_LIMIT_ASSET_FACTOR,
  LOAN_LIMIT_PROFIT_FACTOR,
  LOAN_MAX_LIMIT_CT,
  LOAN_MIN_LIMIT_CT,
  LOAN_STEP_CT,
  MONTHS_PER_YEAR,
  START_CAPITAL_CT,
  type Difficulty,
} from '../constants';
import { Cargo } from '../cargo/types';
import type { CompanyState } from '../types';
import {
  Account,
  archiveMonth,
  archiveYear,
  book,
  companyValueCt,
  emptyAccounts,
  emptyHistory,
  monthlyShareCt,
} from './ledger';

/** Build the initial company state for a new game. */
export function createCompany(
  id: number,
  name: string,
  colorIndex: number,
  difficulty: Difficulty,
): CompanyState {
  return {
    id,
    name,
    colorIndex: colorIndex % COMPANY_COLOR_COUNT,
    cashCt: START_CAPITAL_CT[difficulty]!,
    loanCt: 0,
    profitThisYearCt: 0,
    lastYearProfitCt: 0,
    fixedAssetsCt: 0,
    revenueThisMonthCt: 0,
    expensesThisMonthCt: 0,
    vehicleUpkeepPerYearCt: 0,
    infrastructureUpkeepPerYearCt: 0,
    accounts: emptyAccounts(),
    yearAccounts: emptyAccounts(),
    lastYearAccounts: emptyAccounts(),
    monthHistory: emptyHistory(),
    historyCursor: 0,
    valueHistory: [],
    accumulatedDepreciationCt: 0,
    monthsInDebt: 0,
    bankrupt: false,
    co2ThisYearKg: 0,
    co2LastYearKg: 0,
  };
}

/**
 * Count a month closed in the red, and say what it means (section 14.2).
 *
 * Returns the number of consecutive months the company has now been overdrawn,
 * so the caller can decide between a warning and a winding-up. Nothing is
 * decided here: this function knows about money and not about fleets.
 */
export function reviewSolvency(company: CompanyState): number {
  if (company.cashCt >= 0) {
    company.monthsInDebt = 0;
    return 0;
  }
  company.monthsInDebt++;
  return company.monthsInDebt;
}

/** True once the company has been overdrawn long enough to be warned. */
export function isInTrouble(company: CompanyState): boolean {
  return company.monthsInDebt >= BANKRUPTCY_WARNING_MONTHS;
}

/** Book a one-off expense against cash and the running annual profit. */
export function bookExpense(
  company: CompanyState,
  amountCt: number,
  account: Account = Account.Construction,
): void {
  company.cashCt -= amountCt;
  company.profitThisYearCt -= amountCt;
  company.expensesThisMonthCt += amountCt;
  book(company, account, amountCt);
}

/**
 * Book revenue, split by what was carried (section 14.1).
 *
 * The cargo is in scope where the payment is made and was being thrown away;
 * three accounts out of one branch is the whole of the split the spec asks for.
 */
export function bookRevenue(company: CompanyState, amountCt: number, cargo: Cargo): void {
  company.cashCt += amountCt;
  company.profitThisYearCt += amountCt;
  company.revenueThisMonthCt += amountCt;

  const account =
    cargo === Cargo.Passengers
      ? Account.RevenuePassengers
      : cargo === Cargo.Mail
        ? Account.RevenueMail
        : Account.RevenueFreight;
  book(company, account, amountCt);
}

/**
 * Charge a twelfth of the yearly upkeep. Called at every month boundary, which
 * is what makes doing nothing with a full bank account still lose the game
 * (balancing scenario 4 of section 19.4).
 */
export function bookMonthlyUpkeep(company: CompanyState, priceFactor = 1): number {
  const fleet = monthlyShareCt(company.vehicleUpkeepPerYearCt * priceFactor);
  const infrastructure = monthlyShareCt(company.infrastructureUpkeepPerYearCt * priceFactor);

  if (fleet !== 0) bookExpense(company, fleet, Account.VehicleUpkeep);
  if (infrastructure !== 0) {
    bookExpense(company, infrastructure, Account.InfrastructureUpkeep);
  }
  return fleet + infrastructure;
}

/**
 * Charge a month of straight-line depreciation on the fleet (section 14.1).
 *
 * Deliberately NOT through `bookExpense`: depreciation is what an asset costs
 * to USE, and the money left the bank when it was bought. Charging it against
 * cash a second time would make every company insolvent twice as fast.
 *
 * The charge stops once an asset is fully written down, which is what the cap
 * against `fixedAssetsCt` does - otherwise a company that keeps a vehicle for
 * forty years would end up with a negative book value.
 */
export function bookMonthlyDepreciation(company: CompanyState, yearlyCt: number): number {
  const room = company.fixedAssetsCt - company.accumulatedDepreciationCt;
  if (room <= 0) return 0;

  const wanted = monthlyShareCt(yearlyCt);
  const amount = wanted > room ? room : wanted;
  if (amount <= 0) return 0;

  company.accumulatedDepreciationCt += amount;
  company.profitThisYearCt -= amount;
  book(company, Account.Depreciation, amount);
  return amount;
}

/**
 * File the month and start a new one.
 *
 * The archive happens FIRST. This function used to zero the counters and keep
 * nothing at all, which is why there was no history for a chart to show.
 */
export function closeMonth(company: CompanyState): void {
  archiveMonth(company);
  company.revenueThisMonthCt = 0;
  company.expensesThisMonthCt = 0;
}

/**
 * Credit line per section 14.2:
 *   max(300_000 EUR, 2.5 * annual profit + 0.3 * fixed assets), capped at 30 M EUR.
 * The result is floored to a whole loan step so the granted amount and the
 * limit shown in the UI can never disagree by a few cents.
 */
export function loanLimitCt(company: CompanyState): number {
  const derived =
    LOAN_LIMIT_PROFIT_FACTOR * company.lastYearProfitCt +
    LOAN_LIMIT_ASSET_FACTOR * company.fixedAssetsCt;
  const limit = Math.min(Math.max(LOAN_MIN_LIMIT_CT, Math.round(derived)), LOAN_MAX_LIMIT_CT);
  return Math.floor(limit / LOAN_STEP_CT) * LOAN_STEP_CT;
}

/** How much more the company may still borrow right now. [cent] */
export function availableCreditCt(company: CompanyState): number {
  const available = loanLimitCt(company) - company.loanCt;
  return available > 0 ? available : 0;
}

/**
 * Borrow up to `amountCt`, rounded down to a whole loan step and clipped to the
 * remaining credit line. Returns the amount actually granted, 0 if nothing was.
 */
export function takeLoan(company: CompanyState, amountCt: number): number {
  const wanted = Math.floor(amountCt / LOAN_STEP_CT) * LOAN_STEP_CT;
  const granted = Math.min(wanted, availableCreditCt(company));
  if (granted <= 0) return 0;
  company.loanCt += granted;
  company.cashCt += granted;
  return granted;
}

/**
 * Repay up to `amountCt`, limited by the outstanding principal and by the cash
 * on hand. Returns the amount actually repaid.
 */
export function repayLoan(company: CompanyState, amountCt: number): number {
  const wanted = Math.floor(amountCt / LOAN_STEP_CT) * LOAN_STEP_CT;
  const affordable = Math.floor(company.cashCt / LOAN_STEP_CT) * LOAN_STEP_CT;
  const repaid = Math.min(wanted, company.loanCt, affordable);
  if (repaid <= 0) return 0;
  company.loanCt -= repaid;
  company.cashCt -= repaid;
  return repaid;
}

/**
 * Book one month of loan interest. The nominal rate is annual, so a twelfth of
 * it is charged per game month; the result is rounded to whole cents because
 * money is never fractional (law #5).
 */
export function bookMonthlyInterest(company: CompanyState, difficulty: Difficulty): number {
  const rate = LOAN_INTEREST_RATE_PER_YEAR[difficulty]!;
  const interestCt = Math.round((company.loanCt * rate) / MONTHS_PER_YEAR);
  if (interestCt === 0) return 0;
  // Through bookExpense like everything else, so it reaches the month's
  // expenses and its own account. It used to touch cash directly and was the
  // one cost the monthly figure did not include.
  bookExpense(company, interestCt, Account.Interest);
  return interestCt;
}

/**
 * Close the game year: this year's figures become last year's, and what the
 * company was worth at the end of it is added to the history.
 */
export function closeFinancialYear(company: CompanyState): void {
  company.lastYearProfitCt = company.profitThisYearCt;
  company.profitThisYearCt = 0;
  archiveYear(company);

  company.valueHistory.push(companyValueCt(company));
  if (company.valueHistory.length > COMPANY_VALUE_YEARS) company.valueHistory.shift();
}
