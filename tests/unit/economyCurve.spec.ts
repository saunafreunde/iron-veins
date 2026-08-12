import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CARGO_COUNT, Cargo } from '../../src/sim/cargo/types';
import { deliveryRevenueCt, inflatedCostCt } from '../../src/sim/cargo/payment';
import {
  ECONOMY_CONTAINER_BOOM_FROM_YEAR,
  ECONOMY_COAL_DECLINE_FROM_YEAR,
  ECONOMY_CURVE_LENGTH,
  ECONOMY_CURVE_YEARS,
  ECONOMY_FACTOR_MAX_PERMILLE,
  ECONOMY_FACTOR_MIN_PERMILLE,
  ECONOMY_GROUP_COUNT,
  ECONOMY_GROUP_OF_CARGO,
  ECONOMY_ROW_COUNT,
  ECONOMY_ROW_CYCLE,
  ECONOMY_ROW_ENERGY,
  ECONOMY_STREAM_NAME,
  EconomyGroup,
  END_YEAR,
  START_YEAR,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import {
  economyCostCt,
  economyCostFactor,
  economyCycleFactor,
  economyEnergyFactor,
  economyOutputFactor,
  economyRateFactor,
  economyRowFactor,
  economySeries,
  economySeriesYear,
} from '../../src/sim/economy/curve';
import { IndustryType, industryBaseOutput, newIndustry } from '../../src/sim/industry/types';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { parseSaveFile, SAVE_MAGIC, SAVE_VERSION } from '../../src/sim/save/format';
import { migrateSavePayload } from '../../src/sim/save/migrations';
import { hashWorld, World } from '../../src/sim/World';
import { flatScenario } from '../balance/scenario';

/**
 * The century curve of SPEC2 M21 (E-09).
 *
 * Four claims, and they are the milestone's own acceptance sentence split into
 * things a machine can check:
 *
 *  1. The century is DRAWN ONCE, at genesis, from the named stream - and the
 *     monthly hooks never draw. Instrumented on `World.streamFor` rather than
 *     asserted about, because "no live draws" is exactly the kind of promise a
 *     later bundle breaks by accident (Fehlerkatalog 25).
 *  2. It is seed-deterministic and bit-identical across two runs, coal's
 *     decline after 2000 and the container boom from 1970 included.
 *  3. With the world rule OFF, every seam is the exact identity and the world
 *     digest is byte for byte what it was before M21 existed.
 *  4. With it ON, all four seams move, and the interface can read the same
 *     table the simulation is charging from.
 */

const SEED = 4711;

/** A controlled world with the century rule on, and one without it. */
function makeWorld(economy: boolean, seed = SEED, startYear?: number): World {
  return flatScenario(64, [], [], seed, 0, true, undefined, false, economy, startYear).world;
}

/** Mean of one row over a closed year range, inclusive. */
function meanOver(world: World, row: number, fromYear: number, toYear: number): number {
  let sum = 0;
  let count = 0;
  for (let year = fromYear; year <= toYear; year++) {
    sum += economyRowFactor(world.economyCurve, row, year);
    count++;
  }
  return sum / count;
}

// ------------------------------------------------------- 1. drawn once, at genesis

describe('the century is drawn once, at world genesis', () => {
  it('asks the named stream exactly once, and never again while the world runs', () => {
    const spy = vi.spyOn(World.prototype, 'streamFor');
    try {
      const scenario = flatScenario(64, [], [], SEED, 0, true, undefined, false, true);
      const economyCalls = (): number =>
        spy.mock.calls.filter((call) => call[0] === ECONOMY_STREAM_NAME).length;

      expect(economyCalls()).toBe(1);
      const atGenesis = Int16Array.from(scenario.world.economyCurve.rows);
      expect(atGenesis.length).toBe(ECONOMY_CURVE_LENGTH);

      // A game year and a month past it: every daily, monthly and yearly hook
      // has fired, several of them more than a dozen times.
      const until = TICKS_PER_YEAR + TICKS_PER_MONTH;
      while (scenario.world.tick < until) scenario.world.step(scenario.queue, null);

      expect(economyCalls()).toBe(1);
      expect([...scenario.world.economyCurve.rows]).toEqual([...atGenesis]);
    } finally {
      spy.mockRestore();
    }
  });

  it('draws nothing at all in a world whose rule is off', () => {
    const spy = vi.spyOn(World.prototype, 'streamFor');
    try {
      const scenario = flatScenario(64, [], [], SEED);
      const until = TICKS_PER_MONTH * 2;
      while (scenario.world.tick < until) scenario.world.step(scenario.queue, null);
      expect(spy.mock.calls.filter((call) => call[0] === ECONOMY_STREAM_NAME)).toEqual([]);
      expect(scenario.world.economyCurve.rows.length).toBe(0);
      expect(scenario.world.economyCurve.active).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('adopts the century a save carries rather than redrawing it', () => {
    const source = makeWorld(true);
    const bytes = encodeSave(source, new CommandQueue(), '0.1.0');

    const spy = vi.spyOn(World.prototype, 'streamFor');
    try {
      const loaded = decodeSave(bytes);
      expect(spy.mock.calls.filter((call) => call[0] === ECONOMY_STREAM_NAME)).toEqual([]);
      expect([...loaded.world.economyCurve.rows]).toEqual([...source.economyCurve.rows]);
      expect(hashWorld(loaded.world)).toBe(hashWorld(source));
    } finally {
      spy.mockRestore();
    }
  });
});

// --------------------------------------------- 2. seed-determinism and the two trends

describe('the century is a function of the seed alone', () => {
  it('is bit-identical across two runs of the same seed', () => {
    const a = makeWorld(true);
    const b = makeWorld(true);
    expect(a.economyCurve.rows.length).toBe(ECONOMY_CURVE_LENGTH);
    for (let at = 0; at < ECONOMY_CURVE_LENGTH; at++) {
      expect(a.economyCurve.rows[at], `entry ${at}`).toBe(b.economyCurve.rows[at]);
    }
  });

  it('is a different century for a different seed', () => {
    const a = makeWorld(true, 1);
    const b = makeWorld(true, 2);
    expect([...a.economyCurve.rows]).not.toEqual([...b.economyCurve.rows]);
  });

  it('stays inside the band the parser enforces, on every seed it is given', () => {
    for (const seed of [1, 7, 4711, 90_210]) {
      const world = makeWorld(true, seed);
      for (let at = 0; at < ECONOMY_CURVE_LENGTH; at++) {
        const value = world.economyCurve.rows[at]!;
        expect(value).toBeGreaterThanOrEqual(ECONOMY_FACTOR_MIN_PERMILLE);
        expect(value).toBeLessThanOrEqual(ECONOMY_FACTOR_MAX_PERMILLE);
      }
    }
  });

  it('lets coal decline after 2000, on every seed and bit-identically twice', () => {
    for (const seed of [1, 7, 4711, 90_210]) {
      const world = makeWorld(true, seed);
      const before = meanOver(world, EconomyGroup.Coal, START_YEAR, ECONOMY_COAL_DECLINE_FROM_YEAR);
      const after = meanOver(
        world,
        EconomyGroup.Coal,
        ECONOMY_COAL_DECLINE_FROM_YEAR + 1,
        END_YEAR,
      );
      expect(after, `seed ${seed}`).toBeLessThan(before * 0.85);
      // The last decade is what the levy of D-105 arrives into.
      expect(meanOver(world, EconomyGroup.Coal, END_YEAR - 9, END_YEAR)).toBeLessThan(0.6);

      const twin = makeWorld(true, seed);
      expect(economySeries(twin.economyCurve, EconomyGroup.Coal)).toEqual(
        economySeries(world.economyCurve, EconomyGroup.Coal),
      );
    }
  });

  it('lets containers boom from about 1970, on every seed', () => {
    for (const seed of [1, 7, 4711, 90_210]) {
      const world = makeWorld(true, seed);
      const before = meanOver(
        world,
        EconomyGroup.Containers,
        START_YEAR,
        ECONOMY_CONTAINER_BOOM_FROM_YEAR,
      );
      const after = meanOver(world, EconomyGroup.Containers, END_YEAR - 20, END_YEAR);
      expect(before, `seed ${seed}`).toBeLessThan(0.6);
      expect(after).toBeGreaterThan(before * 2);
    }
  });

  it('leaves the other three groups without a structural trend', () => {
    const world = makeWorld(true);
    for (const group of [EconomyGroup.Town, EconomyGroup.Raw, EconomyGroup.Manufactured]) {
      const before = meanOver(world, group, START_YEAR, START_YEAR + 24);
      const after = meanOver(world, group, END_YEAR - 24, END_YEAR);
      expect(Math.abs(after - before), `group ${group}`).toBeLessThan(0.35);
    }
  });
});

// ----------------------------------------------------- 3. the rule off is the identity

describe('a world with the rule off is a pre-M21 world', () => {
  it('returns the exact identity at every seam', () => {
    const world = makeWorld(false);
    const curve = world.economyCurve;
    for (const year of [START_YEAR, 1973, 2000, 2035, END_YEAR]) {
      expect(economyCycleFactor(curve, year)).toBe(1);
      expect(economyCostFactor(curve, year)).toBe(1);
      expect(economyOutputFactor(curve, year)).toBe(1);
      expect(economyEnergyFactor(curve, year)).toBe(1);
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        expect(economyRateFactor(curve, cargo, year)).toBe(1);
      }
    }
  });

  it('charges exactly what the pre-M21 cost formula charged', () => {
    const world = makeWorld(false);
    for (const base of [1, 37, 12_345, 9_999_991]) {
      // The price level is indexed by the world's AGE since M23 and the
      // century by its DATE (D-245); with no century the two collapse back
      // into the one pre-M21 formula, which is what this asserts.
      expect(world.costCt(base)).toBe(inflatedCostCt(base, world.epochYears, world.inflation));
      expect(economyCostCt(base, 2035, true, world.economyCurve)).toBe(
        inflatedCostCt(base, 2035 - world.economyCurve.startYear, true),
      );
    }
  });

  it('puts nothing at all into the world digest', () => {
    // The claim the whole "no pin re-recording" story rests on: with the rule
    // off, `hashWorld` does not read the table - so a world that somehow held
    // a full century with the rule off fingerprints exactly like one that holds
    // none, which is the same statement as "the digest of a rule-off world is
    // byte for byte its pre-M21 digest".
    const world = makeWorld(false);
    const before = hashWorld(world);
    world.economyCurve.rows = makeWorld(true).economyCurve.rows;
    expect(hashWorld(world)).toBe(before);
  });

  it('fingerprints differently the moment the rule is on', () => {
    expect(hashWorld(makeWorld(true))).not.toBe(hashWorld(makeWorld(false)));
  });
});

// ------------------------------------------------------------ 4. the four seams move

describe('the century reaches the four seams it is meant to', () => {
  it('multiplies the tariff by the cargo GROUP, not by the cargo', () => {
    const world = makeWorld(true);
    const curve = world.economyCurve;
    expect(economyRateFactor(curve, Cargo.CommuterPax, 2000)).toBe(
      economyRateFactor(curve, Cargo.Mail, 2000),
    );
    expect(economyRateFactor(curve, Cargo.Steel, 2000)).toBe(
      economyRateFactor(curve, Cargo.Goods, 2000),
    );
    expect(economyRateFactor(curve, Cargo.Coal, 2040)).not.toBe(
      economyRateFactor(curve, Cargo.IronOre, 2040),
    );
    expect(economyRateFactor(curve, Cargo.Coal, 2040)).toBeLessThan(
      economyRateFactor(curve, Cargo.Coal, 1960),
    );
  });

  it('leaves the payment formula bit-identical for a caller that names no factor', () => {
    // The seam is an OPTIONAL field, so every call site written before M21 -
    // and `tests/balance/tariff.spec.ts`, which builds no world at all - keeps
    // the cent it always earned. And a factor that IS named scales the whole
    // payment linearly, which is what makes the century a tariff rather than a
    // second formula.
    const base = {
      cargo: Cargo.Coal,
      amount: 40,
      distanceTiles: 100,
      ticksInTransit: 0,
      hasCooling: false,
      epochYears: 1970 - START_YEAR,
    };
    const plain = deliveryRevenueCt(base);
    expect(deliveryRevenueCt({ ...base, rateFactor: 1 })).toBe(plain);
    expect(deliveryRevenueCt({ ...base, rateFactor: 0.5 })).toBe(Math.round(plain * 0.5));
    expect(deliveryRevenueCt({ ...base, rateFactor: 2 })).toBe(plain * 2);
  });

  it('moves what building something costs, damped against the cycle', () => {
    const world = makeWorld(true);
    let moved = 0;
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const cost = economyCostFactor(world.economyCurve, year);
      const cycle = economyCycleFactor(world.economyCurve, year);
      // Half the swing, on the same side of 1 as the cycle.
      expect(cost).toBeCloseTo(1 + (cycle - 1) * 0.5, 10);
      if (cost !== 1) moved++;
    }
    expect(moved).toBeGreaterThan(ECONOMY_CURVE_YEARS - 5);
  });

  it('modulates the industry sine worldwide without adding a second one', () => {
    const industry = newIndustry(0, IndustryType.CoalMine, 10, 10, 0);
    const flat = industryBaseOutput(industry, 0);
    expect(industryBaseOutput(industry, 0, 1)).toBe(flat);
    expect(industryBaseOutput(industry, 0, 1.25)).toBeCloseTo(flat * 1.25, 10);
    expect(industryBaseOutput(industry, 0, 0.8)).toBeCloseTo(flat * 0.8, 10);
  });

  it('scales the energy price without touching the ratios between the sources', () => {
    const world = makeWorld(true);
    let cheapest = Number.POSITIVE_INFINITY;
    let dearest = 0;
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const factor = economyEnergyFactor(world.economyCurve, year);
      if (factor < cheapest) cheapest = factor;
      if (factor > dearest) dearest = factor;
    }
    // A century with at least one real shock in it, and none of them absurd.
    expect(dearest).toBeGreaterThan(cheapest * 1.2);
    expect(dearest).toBeLessThanOrEqual(ECONOMY_FACTOR_MAX_PERMILLE / 1000);
  });
});

// ---------------------------------------------------------------- the table itself

describe('the curve table', () => {
  it('gives every cargo a group', () => {
    expect(ECONOMY_GROUP_OF_CARGO.length).toBe(CARGO_COUNT);
    for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
      const group = ECONOMY_GROUP_OF_CARGO[cargo]!;
      expect(Number.isInteger(group), `cargo ${cargo}`).toBe(true);
      expect(group).toBeGreaterThanOrEqual(0);
      expect(group).toBeLessThan(ECONOMY_GROUP_COUNT);
    }
  });

  it('is the few hundred integers E-09 asks for, and no more', () => {
    expect(ECONOMY_CURVE_YEARS).toBe(END_YEAR - START_YEAR + 1);
    expect(ECONOMY_ROW_COUNT).toBe(ECONOMY_GROUP_COUNT + 2);
    expect(ECONOMY_CURVE_LENGTH).toBe(ECONOMY_ROW_COUNT * ECONOMY_CURVE_YEARS);
    expect(ECONOMY_CURVE_LENGTH).toBeLessThan(1_000);
  });

  it('clamps the years outside the playable span rather than reading past itself', () => {
    const world = makeWorld(true);
    const curve = world.economyCurve;
    expect(economyRowFactor(curve, ECONOMY_ROW_CYCLE, START_YEAR - 40)).toBe(
      economyRowFactor(curve, ECONOMY_ROW_CYCLE, START_YEAR),
    );
    expect(economyRowFactor(curve, ECONOMY_ROW_ENERGY, END_YEAR + 200)).toBe(
      economyRowFactor(curve, ECONOMY_ROW_ENERGY, END_YEAR),
    );
  });
});

// ------------------------------------------------------------------ what the UI reads

describe('the interface can show the century', () => {
  it('hands out one series per row, and the series IS what is charged', () => {
    const world = makeWorld(true);
    for (let row = 0; row < ECONOMY_ROW_COUNT; row++) {
      const series = economySeries(world.economyCurve, row);
      expect(series.length).toBe(ECONOMY_CURVE_YEARS);
      for (let index = 0; index < series.length; index++) {
        expect(series[index]).toBe(
          economyRowFactor(world.economyCurve, row, economySeriesYear(world.economyCurve, index)),
        );
      }
    }
  });

  it('shows nothing at all for a world with no century', () => {
    const world = makeWorld(false);
    for (let row = 0; row < ECONOMY_ROW_COUNT; row++) {
      expect(economySeries(world.economyCurve, row)).toEqual([]);
    }
  });

  it('names the first and the last playable year', () => {
    const world = makeWorld(true);
    expect(economySeriesYear(world.economyCurve, 0)).toBe(START_YEAR);
    expect(economySeriesYear(world.economyCurve, ECONOMY_CURVE_YEARS - 1)).toBe(END_YEAR);
    // And the anchor is the WORLD's own first year since M23 (D-245), not the
    // constant: an 1880 world's century is the 1880s to the 1980s.
    const early = makeWorld(true, SEED, 1880);
    expect(early.economyCurve.startYear).toBe(1880);
    expect(economySeriesYear(early.economyCurve, 0)).toBe(1880);
    expect(economySeriesYear(early.economyCurve, ECONOMY_CURVE_YEARS - 1)).toBe(1980);
  });
});

// ------------------------------------------------------------------- the save chain

describe('the century in the save container', () => {
  function payloadOf(world: World): Record<string, unknown> {
    const state = world.toData() as unknown as Record<string, unknown>;
    return {
      magic: SAVE_MAGIC,
      saveVersion: SAVE_VERSION,
      gameVersion: '0.1.0',
      state,
      commandLog: [],
      commandsExecuted: 0,
      checkpoints: [],
    };
  }

  it('survives a round trip unchanged', () => {
    const world = makeWorld(true);
    const loaded = decodeSave(encodeSave(world, new CommandQueue(), '0.1.0'));
    expect([...loaded.world.economyCurve.rows]).toEqual([...world.economyCurve.rows]);
    expect(loaded.world.economy).toBe(true);
  });

  it('refuses a save whose rule and table disagree', () => {
    const on = payloadOf(makeWorld(true));
    (on['state'] as Record<string, unknown>)['economyCurve'] = [];
    expect(() => parseSaveFile(on)).toThrow(/economyCurve/);

    const off = payloadOf(makeWorld(false));
    (off['state'] as Record<string, unknown>)['economyCurve'] = [1000];
    expect(() => parseSaveFile(off)).toThrow(/economyCurve/);
  });

  it('refuses a multiplier outside the band', () => {
    const payload = payloadOf(makeWorld(true));
    const rows = (payload['state'] as Record<string, unknown>)['economyCurve'] as number[];
    rows[17] = ECONOMY_FACTOR_MAX_PERMILLE + 1;
    expect(() => parseSaveFile(payload)).toThrow(/per-mille band/);
  });

  it('refuses a save that has lost the rule', () => {
    const payload = payloadOf(makeWorld(true));
    Reflect.deleteProperty(payload['state'] as object, 'economy');
    expect(() => parseSaveFile(payload)).toThrow(/economy/);
  });

  it('migrates a version 31 world into one with no century at all', () => {
    const world = makeWorld(false);
    const state = world.toData() as unknown as Record<string, unknown>;
    Reflect.deleteProperty(state, 'economy');
    Reflect.deleteProperty(state, 'economyCurve');
    const migrated = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 31, gameVersion: '0.1.0', state },
      31,
      SAVE_VERSION,
    );
    const inner = migrated['state'] as Record<string, unknown>;
    expect(inner['economy']).toBe(false);
    expect(inner['economyCurve']).toEqual([]);
  });
});
