import { describe, expect, it } from 'vitest';
import {
  CENTS_PER_EURO,
  Difficulty,
  LOAN_INTEREST_RATE_PER_YEAR,
  LOAN_MAX_LIMIT_CT,
  LOAN_MIN_LIMIT_CT,
  LOAN_STEP_CT,
  MONTHS_PER_YEAR,
  START_CAPITAL_CT,
} from '../../src/sim/constants';
import {
  availableCreditCt,
  bookMonthlyInterest,
  closeFinancialYear,
  createCompany,
  loanLimitCt,
  repayLoan,
  takeLoan,
} from '../../src/sim/economy/company';

describe('company creation', () => {
  it('hands out the starting capital of the chosen difficulty', () => {
    expect(createCompany(0, 'A', 0, Difficulty.Easy).cashCt).toBe(800_000 * CENTS_PER_EURO);
    expect(createCompany(0, 'A', 0, Difficulty.Normal).cashCt).toBe(500_000 * CENTS_PER_EURO);
    expect(createCompany(0, 'A', 0, Difficulty.Hard).cashCt).toBe(250_000 * CENTS_PER_EURO);
    expect(START_CAPITAL_CT[Difficulty.Normal]).toBe(500_000 * CENTS_PER_EURO);
  });

  it('starts debt free', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    expect(company.loanCt).toBe(0);
    expect(company.profitThisYearCt).toBe(0);
    expect(company.lastYearProfitCt).toBe(0);
  });
});

describe('credit line', () => {
  it('falls back to the floor for a company without profit or assets', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    expect(loanLimitCt(company)).toBe(LOAN_MIN_LIMIT_CT);
  });

  it('grows with profit and assets', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    company.lastYearProfitCt = 1_000_000 * CENTS_PER_EURO;
    company.fixedAssetsCt = 2_000_000 * CENTS_PER_EURO;
    // 2.5 * 1M + 0.3 * 2M = 3.1M EUR
    expect(loanLimitCt(company)).toBe(3_100_000 * CENTS_PER_EURO);
  });

  it('never exceeds the absolute ceiling', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    company.lastYearProfitCt = 500_000_000 * CENTS_PER_EURO;
    expect(loanLimitCt(company)).toBe(LOAN_MAX_LIMIT_CT);
  });

  it('ignores a loss when the floor is higher', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    company.lastYearProfitCt = -50_000_000 * CENTS_PER_EURO;
    expect(loanLimitCt(company)).toBe(LOAN_MIN_LIMIT_CT);
  });
});

describe('borrowing and repaying', () => {
  it('credits the loan to the account', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    const before = company.cashCt;
    expect(takeLoan(company, 50_000 * CENTS_PER_EURO)).toBe(50_000 * CENTS_PER_EURO);
    expect(company.cashCt).toBe(before + 50_000 * CENTS_PER_EURO);
    expect(company.loanCt).toBe(50_000 * CENTS_PER_EURO);
  });

  it('rounds the requested amount down to a whole step', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    expect(takeLoan(company, LOAN_STEP_CT + 1)).toBe(LOAN_STEP_CT);
    expect(takeLoan(company, LOAN_STEP_CT - 1)).toBe(0);
  });

  it('stops at the credit line', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    expect(takeLoan(company, LOAN_MIN_LIMIT_CT * 4)).toBe(LOAN_MIN_LIMIT_CT);
    expect(availableCreditCt(company)).toBe(0);
    expect(takeLoan(company, LOAN_STEP_CT)).toBe(0);
  });

  it('repays at most the principal and only from available cash', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    takeLoan(company, 100_000 * CENTS_PER_EURO);
    expect(repayLoan(company, 1_000_000 * CENTS_PER_EURO)).toBe(100_000 * CENTS_PER_EURO);
    expect(company.loanCt).toBe(0);

    takeLoan(company, 100_000 * CENTS_PER_EURO);
    company.cashCt = LOAN_STEP_CT - 1;
    expect(repayLoan(company, 100_000 * CENTS_PER_EURO)).toBe(0);
  });
});

describe('interest and the financial year', () => {
  it('books a twelfth of the annual rate per month', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    takeLoan(company, LOAN_MIN_LIMIT_CT);
    const cashBefore = company.cashCt;

    const interest = bookMonthlyInterest(company, Difficulty.Normal);
    const expected = Math.round(
      (LOAN_MIN_LIMIT_CT * LOAN_INTEREST_RATE_PER_YEAR[Difficulty.Normal]!) / MONTHS_PER_YEAR,
    );
    expect(interest).toBe(expected);
    expect(interest).toBe(1_000 * CENTS_PER_EURO); // 300k EUR at 4 % -> 1000 EUR/month
    expect(company.cashCt).toBe(cashBefore - expected);
    expect(company.profitThisYearCt).toBe(-expected);
  });

  it('charges the hard difficulty more', () => {
    const easy = createCompany(0, 'A', 0, Difficulty.Normal);
    const hard = createCompany(0, 'A', 0, Difficulty.Hard);
    takeLoan(easy, LOAN_MIN_LIMIT_CT);
    takeLoan(hard, LOAN_MIN_LIMIT_CT);
    expect(bookMonthlyInterest(hard, Difficulty.Hard)).toBeGreaterThan(
      bookMonthlyInterest(easy, Difficulty.Normal),
    );
  });

  it('books nothing without debt', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    expect(bookMonthlyInterest(company, Difficulty.Normal)).toBe(0);
    expect(company.cashCt).toBe(START_CAPITAL_CT[Difficulty.Normal]);
  });

  it('rolls the running profit into last year on year end', () => {
    const company = createCompany(0, 'A', 0, Difficulty.Normal);
    company.profitThisYearCt = -12_345;
    closeFinancialYear(company);
    expect(company.lastYearProfitCt).toBe(-12_345);
    expect(company.profitThisYearCt).toBe(0);
  });
});
