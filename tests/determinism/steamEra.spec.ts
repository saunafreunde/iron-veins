import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  Difficulty,
  MapClimate,
  MAX_TICK,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { GameEnd } from '../../src/sim/goals/types';
import { gameEndOf } from '../../src/sim/goals/score';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { availableVehicles } from '../../src/sim/vehicles/catalog';
import { VehicleKind } from '../../src/sim/vehicles/spec';
import { hashWorld, World } from '../../src/sim/World';
import { runYears } from '../balance/scenario';
import {
  buildCoalLine,
  COAL_LINE_1850_LOCO,
  COAL_LINE_1850_WAGON,
  COAL_LINE_1850_YEAR,
} from '../balance/coalLine';

/**
 * SPEC2 M23's own Fertig-wenn, the two halves of it this bundle owns (D-245):
 *
 *  - "eine 1850 gestartete Partie mit Dampf-Katalog laeuft im
 *    Determinismus-Test bit-identisch durch";
 *  - "der Endlosmodus haelt im Jahr 2051 weder an noch verliert er den
 *    Hash-Takt".
 *
 * The first is a real played game: the reference coal line of `coalLine.ts`,
 * crewed out of the 1870s catalogue and started in 1850, run for nine game
 * years and hashed three times plus once more through a save round trip - the
 * same shape `determinism.spec.ts` has used since M0. It is that fixture and
 * not a new one because a second hand-built railway would drift from the one
 * the balance suite pins.
 *
 * The second cannot be a played game: 2051 is 7.3 million ticks away and the
 * suite has a two-minute budget. So the clock is moved to the eve of the stop
 * and STEPPED across it - which is the boundary the rule is about, and the
 * only part of the century a bounded world and an endless one disagree on.
 */

const ERA_SPAN_YEARS = 9;

/** An 1850 world, its own catalogue, and a railway built out of it. */
function steamGame(): ReturnType<typeof buildCoalLine> {
  return buildCoalLine(
    undefined,
    undefined,
    COAL_LINE_1850_YEAR,
    COAL_LINE_1850_LOCO,
    COAL_LINE_1850_WAGON,
  );
}

describe('an 1850 game with the steam catalogue', () => {
  it('opens in 1850 with steam traction on offer and nothing from 1950', () => {
    const scenario = steamGame();
    expect(scenario.world.startYear).toBe(1850);
    expect(scenario.world.date.year).toBe(1850);

    const trains = availableVehicles(VehicleKind.Train, 1850);
    expect(trains.length).toBeGreaterThan(0);
    for (const spec of trains) {
      expect(spec.introYear, spec.nameKey).toBeLessThanOrEqual(1850);
      expect(spec.retireYear, spec.nameKey).toBeGreaterThanOrEqual(1850);
    }
    // The gate is DATA, not a branch: the same function, the same fields, a
    // different year (D-245). A 1950 world's first locomotive is not on offer.
    expect(trains.some((spec) => spec.id === 1000)).toBe(false);
  });

  it('runs bit-identically three times over nine game years', () => {
    const first = play();
    const second = play();
    const third = play();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    // A run that hashed identically because nothing happened would prove
    // nothing, so the game has to have been a game.
    expect(first.deliveredUnits).toBeGreaterThan(0);
    expect(first.year).toBe(1850 + ERA_SPAN_YEARS);
  });

  it('survives a save, load and continue in the middle of the era', () => {
    const reference = play();

    const live = steamGame();
    runYears(live, 4);
    const midHash = hashWorld(live.world);

    const bytes = encodeSave(live.world, live.queue, 'steam-era-test');
    const loaded = decodeSave(bytes);
    expect(loaded.world.startYear).toBe(1850);
    expect(loaded.world.endless).toBe(false);
    expect(hashWorld(loaded.world)).toBe(midHash);

    runYears({ world: loaded.world, queue: loaded.queue }, ERA_SPAN_YEARS - 4);
    expect(hashWorld(loaded.world)).toBe(reference.hash);
  });

  it('is a different world from the same railway started in 1950', () => {
    // The start year is hashed (Z2), so this is what says so - and it is the
    // assertion that would fail if `startYear` were ever quietly dropped from
    // the digest, which is the exact hole Fehlerkatalog 24 names.
    const era = steamGame();
    const modern = buildCoalLine();
    expect(hashWorld(era.world)).not.toBe(hashWorld(modern.world));
    expect(modern.world.date.year).toBe(START_YEAR);
  });
});

interface Played {
  readonly hash: string;
  readonly year: number;
  readonly deliveredUnits: number;
  readonly balances: readonly number[];
}

function play(): Played {
  const scenario = steamGame();
  const balances = runYears(scenario, ERA_SPAN_YEARS);
  let delivered = 0;
  for (const units of scenario.world.company.cargoDeliveredUnits) delivered += units;
  return {
    hash: hashWorld(scenario.world),
    year: scenario.world.date.year,
    deliveredUnits: delivered,
    balances,
  };
}

// ------------------------------------------------------------------- endless

/** A world at a chosen tick, with nothing in it but the clock. */
function worldAt(tick: number, endless: boolean): World {
  const world = World.create({
    seed: 4_711,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: 64,
    companyName: 'Endlos AG',
    companyColorIndex: 1,
    endless,
  });
  world.tick = tick;
  return world;
}

describe('the endless rule (SPEC2 E-15)', () => {
  it('reaches 2051 and keeps going, where a bounded world stops', () => {
    // One day short of the stop, so the boundary is CROSSED by stepping rather
    // than jumped over by assignment.
    const eve = MAX_TICK - TICKS_PER_DAY;
    const bounded = worldAt(eve, false);
    const endless = worldAt(eve, true);

    expect(bounded.endTick).toBe(MAX_TICK);
    expect(endless.endTick).toBe(Number.POSITIVE_INFINITY);

    const queue = new CommandQueue();
    for (let i = 0; i < TICKS_PER_DAY * 2; i++) {
      bounded.step(queue, null);
      endless.step(queue, null);
    }

    // Both CAN be stepped - the stop is the scheduler's, not the world's - but
    // only one of them is over. `gameEndOf` and `world.endTick` are the one
    // reading of the rule that the worker's clock also uses.
    expect(bounded.tick).toBeGreaterThan(MAX_TICK);
    expect(gameEndOf(bounded)).toBe(GameEnd.Century);
    expect(gameEndOf(endless)).toBe(GameEnd.Running);

    expect(endless.date.year).toBe(2051);
    expect(endless.date.month).toBe(0);
  });

  it('keeps the hash cadence across the boundary and into 2051', () => {
    // "Hash-Takt" made checkable: the daily digest of `STATE_HASH_INTERVAL_TICKS`
    // is only worth taking if the world is still MOVING, so what is asserted is
    // that a hash taken every game day past the stop keeps changing - a frozen
    // world would hash the same value for ever and the F3 overlay would be
    // reporting a still picture as a running simulation.
    const world = worldAt(MAX_TICK - TICKS_PER_DAY, true);
    const queue = new CommandQueue();
    const digests: string[] = [];
    for (let day = 0; day < 30; day++) {
      for (let i = 0; i < TICKS_PER_DAY; i++) world.step(queue, null);
      digests.push(hashWorld(world));
    }
    expect(world.date.year).toBe(2051);
    expect(new Set(digests).size).toBe(digests.length);
  });

  it('carries the rule through a save round trip', () => {
    const world = worldAt(MAX_TICK - TICKS_PER_YEAR, true);
    const bytes = encodeSave(world, new CommandQueue(), 'endless-test');
    const loaded = decodeSave(bytes);
    expect(loaded.world.endless).toBe(true);
    expect(loaded.world.endTick).toBe(Number.POSITIVE_INFINITY);
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));

    // And an endless world does not fingerprint like a bounded one, which is
    // why the flag is hashed unconditionally (Z2).
    const bounded = worldAt(MAX_TICK - TICKS_PER_YEAR, false);
    expect(hashWorld(bounded)).not.toBe(hashWorld(world));
  });
});
