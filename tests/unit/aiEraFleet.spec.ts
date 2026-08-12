import { describe, expect, it } from 'vitest';
import { Cargo, CARGO_COUNT } from '../../src/sim/cargo/types';
import {
  AI_DRAIN_MARGIN,
  AI_LIFT_REAL_SHARE,
  AI_MAX_VEHICLES_PER_LINE,
  AI_MAX_VEHICLES_PER_LINE_ERA,
  AI_TILES_PER_MONTH,
  AI_TOWN_OUTPUT_SHARE,
  END_YEAR,
  START_YEAR,
} from '../../src/sim/constants';
import { roadFleetCap } from '../../src/sim/ai/evaluate';
import { capacityFor, VEHICLE_SPECS } from '../../src/sim/vehicles/catalog';
import { VehicleKind } from '../../src/sim/vehicles/spec';

/**
 * The competitors' fleet cap, read as a LIFT rather than as a count (D-250).
 *
 * `AI_MAX_VEHICLES_PER_LINE` is six and every AI band in the project was
 * measured with it. Six vehicles is a lift only while the vehicle is the one it
 * was measured on: the 1950 omnibus carries 150 and the 1850 omnibus 45, and
 * the drain gate and the profitability floor are both quoted against the lift.
 * Measured on seed 987,654 at 1850, the effect of reading it as a count was
 * that every town pair worth serving failed the drain gate BEFORE its margin
 * was ever computed.
 *
 * Two claims here, and the first is the one that keeps every 1950 band where it
 * is.
 */

const ROAD_SPECS = VEHICLE_SPECS.filter((spec) => spec.kind === VehicleKind.Road);

/** The 1850 horse omnibus - the only road vehicle an 1850 world can buy. */
const OMNIBUS_1850 = 300;
/** The 1950 omnibus the cap was measured on. */
const OMNIBUS_1950 = 200;

describe('the era fleet cap', () => {
  it('is exactly the measured constant for every vehicle a 1950 world can buy', () => {
    // Structural, not incidental: the era catalogue closes in 1949 (D-245), so
    // no spec available from START_YEAR on can enter the era branch at all.
    // This is the property that makes the change cost the modern era nothing.
    for (const spec of ROAD_SPECS) {
      if (spec.introYear < START_YEAR) continue;
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        if (capacityFor(spec, cargo as Cargo) <= 0) continue;
        expect(roadFleetCap(cargo, [spec.id]), spec.nameKey).toBe(AI_MAX_VEHICLES_PER_LINE);
      }
    }
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (const spec of ROAD_SPECS) {
        if (year < spec.introYear || year > spec.retireYear) continue;
        expect(spec.introYear, `${spec.nameKey} on sale in ${year}`).toBeGreaterThanOrEqual(
          START_YEAR,
        );
      }
    }
  });

  it('gives an era vehicle the fleet that lifts what six of the 1950 one lift', () => {
    const eraLift = capacityFor(
      VEHICLE_SPECS.find((spec) => spec.id === OMNIBUS_1850)!,
      Cargo.CommuterPax,
    );
    const modernLift = capacityFor(
      VEHICLE_SPECS.find((spec) => spec.id === OMNIBUS_1950)!,
      Cargo.CommuterPax,
    );
    expect(eraLift).toBe(45);
    expect(modernLift).toBe(150);

    const cap = roadFleetCap(Cargo.CommuterPax, [OMNIBUS_1850]);
    expect(cap).toBe(20);
    // The whole of the rule, asserted as arithmetic rather than as the number:
    // the era fleet lifts what the measured fleet of the 1950 catalogue lifts.
    expect(cap * eraLift).toBe(AI_MAX_VEHICLES_PER_LINE * modernLift);
  });

  it('never falls below the measured cap and never passes the road ceiling', () => {
    for (const spec of ROAD_SPECS) {
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        if (capacityFor(spec, cargo as Cargo) <= 0) continue;
        const cap = roadFleetCap(cargo, [spec.id]);
        expect(cap, spec.nameKey).toBeGreaterThanOrEqual(AI_MAX_VEHICLES_PER_LINE);
        expect(cap, spec.nameKey).toBeLessThanOrEqual(AI_MAX_VEHICLES_PER_LINE_ERA);
      }
    }
  });

  it('is what decides whether an era line can drain a town at all', () => {
    // The gate the count-shaped cap failed, in its own arithmetic, on the pair
    // seed 987,654 really offers: 24 tiles between two towns that deposit 520
    // units a month between them (`AI_TOWN_OUTPUT_SHARE` of about 2,900
    // people). The drain gate asks the largest allowed fleet to out-lift that
    // by AI_DRAIN_MARGIN, and the pair is the one the SAME world builds at
    // 1950 and refuses at 1850.
    const distance = 24;
    const offered = 2_889 * AI_TOWN_OUTPUT_SHARE;
    const roundsPerMonth = AI_TILES_PER_MONTH / (2 * distance);
    const liftOf = (fleet: number, units: number): number =>
      fleet * units * roundsPerMonth * AI_LIFT_REAL_SHARE;

    // Six 1950 buses drain it; six era omnibuses do not, and the era cap does.
    expect(liftOf(AI_MAX_VEHICLES_PER_LINE, 150)).toBeGreaterThan(offered * AI_DRAIN_MARGIN);
    expect(liftOf(AI_MAX_VEHICLES_PER_LINE, 45)).toBeLessThan(offered * AI_DRAIN_MARGIN);
    expect(liftOf(roadFleetCap(Cargo.CommuterPax, [OMNIBUS_1850]), 45)).toBeGreaterThan(
      offered * AI_DRAIN_MARGIN,
    );
  });
});
