import {
  COMPANY_COLOR_COUNT,
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
import type { CompanyState } from '../types';

/** Build the initial company state for a new game. */
export function createCompany(
  name: string,
  colorIndex: number,
  difficulty: Difficulty,
): CompanyState {
  return {
    name,
    colorIndex: colorIndex % COMPANY_COLOR_COUNT,
    cashCt: START_CAPITAL_CT[difficulty]!,
    loanCt: 0,
    profitThisYearCt: 0,
    lastYearProfitCt: 0,
    fixedAssetsCt: 0,
    revenueThisMonthCt: 0,
    expensesThisMonthCt: 0,
    upkeepPerYearCt: 0,
  };
}

/** Book a one-off expense against cash and the running annual profit. */
export function bookExpense(company: CompanyState, amountCt: number): void {
  company.cashCt -= amountCt;
  company.profitThisYearCt -= amountCt;
  company.expensesThisMonthCt += amountCt;
}

/**
 * Charge a twelfth of the yearly upkeep. Called at every month boundary, which
 * is what makes doing nothing with a full bank account still lose the game
 * (balancing scenario 4 of section 19.4).
 */
export function bookMonthlyUpkeep(company: CompanyState): number {
  const amount = Math.round(company.upkeepPerYearCt / MONTHS_PER_YEAR);
  if (amount === 0) return 0;
  bookExpense(company, amount);
  return amount;
}

/** Start a new month's revenue and expense counters. */
export function closeMonth(company: CompanyState): void {
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
  company.cashCt -= interestCt;
  company.profitThisYearCt -= interestCt;
  return interestCt;
}

/** Close the game year: this year's running profit becomes last year's figure. */
export function closeFinancialYear(company: CompanyState): void {
  company.lastYearProfitCt = company.profitThisYearCt;
  company.profitThisYearCt = 0;
}
