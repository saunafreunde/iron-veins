import { describe, expect, it } from 'vitest';
import { deliveryRevenueCt, epochFactor, timeFactor } from '../../src/sim/cargo/payment';
import { Cargo, cargoSpec } from '../../src/sim/cargo/types';
import { START_YEAR, TICKS_PER_DAY } from '../../src/sim/constants';

describe('the payment formula of section 7.5', () => {
  it('matches the specified reference case exactly', () => {
    // 200 passengers, base rate 950, 60 tiles, 3.5 days in transit,
    // grace 4 days, decay 0.05/day, no cooling needed, year 1950.
    //   3.5 > 4 * 0.5 = 2   -> no fast delivery bonus
    //   3.5 < 4             -> no decay either, so the time factor is 1.00
    //   200 * 950 * 0.60 * 1.00 * 1.00 * 1.00 = 114_000 cent = 1_140.00 EUR
    const revenue = deliveryRevenueCt({
      cargo: Cargo.Passengers,
      amount: 200,
      distanceTiles: 60,
      ticksInTransit: 3.5 * TICKS_PER_DAY,
      hasCooling: false,
      year: START_YEAR,
    });
    expect(revenue).toBe(114_000);
  });

  it('pays the premium for a fast delivery', () => {
    const grace = cargoSpec(Cargo.Passengers).graceDays;
    expect(timeFactor(Cargo.Passengers, grace * 0.5)).toBe(1.3);
    expect(timeFactor(Cargo.Passengers, grace * 0.5 + 0.01)).toBe(1);
  });

  it('pays full price inside the grace period and decays after it', () => {
    const spec = cargoSpec(Cargo.Coal);
    expect(timeFactor(Cargo.Coal, spec.graceDays)).toBe(1);
    expect(timeFactor(Cargo.Coal, spec.graceDays + 10)).toBeCloseTo(1 - 10 * spec.decayPerDay, 10);
  });

  it('never pays less than a tenth, however late the cargo is', () => {
    expect(timeFactor(Cargo.Food, 10_000)).toBe(0.1);
  });

  it('cuts refrigerated cargo carried without cooling', () => {
    const base = {
      cargo: Cargo.Food,
      amount: 50,
      distanceTiles: 40,
      ticksInTransit: cargoSpec(Cargo.Food).graceDays * TICKS_PER_DAY,
      year: START_YEAR,
    };
    const cooled = deliveryRevenueCt({ ...base, hasCooling: true });
    const warm = deliveryRevenueCt({ ...base, hasCooling: false });
    expect(warm).toBe(Math.round(cooled * 0.55));
  });

  it('leaves cargo that needs no cooling unaffected by it', () => {
    const base = {
      cargo: Cargo.Coal,
      amount: 50,
      distanceTiles: 40,
      ticksInTransit: TICKS_PER_DAY,
      year: START_YEAR,
    };
    expect(deliveryRevenueCt({ ...base, hasCooling: true })).toBe(
      deliveryRevenueCt({ ...base, hasCooling: false }),
    );
  });

  it('scales linearly with amount and distance', () => {
    const base = {
      cargo: Cargo.Passengers,
      amount: 100,
      distanceTiles: 50,
      ticksInTransit: 3 * TICKS_PER_DAY,
      hasCooling: false,
      year: START_YEAR,
    };
    const single = deliveryRevenueCt(base);
    expect(deliveryRevenueCt({ ...base, amount: 200 })).toBe(single * 2);
    expect(deliveryRevenueCt({ ...base, distanceTiles: 100 })).toBe(single * 2);
  });

  it('splits a journey into legs without paying twice', () => {
    const leg = (distance: number) =>
      deliveryRevenueCt({
        cargo: Cargo.Passengers,
        amount: 80,
        distanceTiles: distance,
        ticksInTransit: TICKS_PER_DAY,
        hasCooling: false,
        year: START_YEAR,
      });
    // Two legs of 30 tiles earn the same as one direct run of 60.
    expect(leg(30) + leg(30)).toBe(leg(60));
  });

  it('applies inflation to later years', () => {
    expect(epochFactor(START_YEAR)).toBe(1);
    expect(epochFactor(START_YEAR + 1)).toBeCloseTo(1.018, 10);
    expect(epochFactor(START_YEAR + 100)).toBeGreaterThan(5);
    // Clamped rather than extrapolated beyond the playable span.
    expect(epochFactor(START_YEAR + 500)).toBe(epochFactor(START_YEAR + 100));
  });

  it('returns whole cents', () => {
    for (let distance = 1; distance < 40; distance++) {
      const revenue = deliveryRevenueCt({
        cargo: Cargo.Electronics,
        amount: 7,
        distanceTiles: distance,
        ticksInTransit: 2.5 * TICKS_PER_DAY,
        hasCooling: false,
        year: 1994,
      });
      expect(Number.isInteger(revenue)).toBe(true);
    }
  });
});
