import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  AI_MAX_DISTANCE,
  AI_MIN_ARRIVAL_FACTOR,
  AI_MIN_DISTANCE,
  AI_RAIL_PROJECTED_TRACKS,
  AI_RAIL_PROJECTED_TRAINS,
  AI_TICKS_PER_TILE,
  Difficulty,
  MapClimate,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { Cargo } from '../../src/sim/cargo/types';
import { timeFactor } from '../../src/sim/cargo/payment';
import { industrySpec } from '../../src/sim/industry/types';
import { opportunities, projectLine, type Opportunity } from '../../src/sim/ai/evaluate';
import { pickTrain } from '../../src/sim/ai/build';
import { Personality } from '../../src/sim/ai/types';
import { World } from '../../src/sim/World';

/**
 * **A mode preference is not a vow of poverty** (D-222).
 *
 * Cause 4 of the AI diagnosis said three of five personalities see an empty
 * opportunity list on a generated map. Measured, the sentence is half right and
 * half wrong, and both halves are pinned here so the next pass starts from the
 * measurement:
 *
 *  - RIGHT: the industry offer on a generated 256 map is 4-9 (source, sink)
 *    pairs whose sink accepts what the source makes, over 9-15 industries, and
 *    a competitor locked to rail regularly sees none of them pay.
 *  - WRONG: the fresh half of the rot gate is not what empties the list. It
 *    drops ZERO industry pairs on all eight sweep seeds - everything it would
 *    refuse the profitability floor refuses anyway.
 *
 * The fix is one sentence: a personality whose PREFERRED mode offers nothing
 * that pays looks at the same pairs on the other one, and the projection is
 * quoted for the railway the builder actually lays.
 */

const SWEEP = [4711, 4713, 4712, 4714, 2718, 31415, 60613, 12345] as const;

function world(seed: number): World {
  return World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: 256,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
}

const RAIL_PERSONALITIES = [Personality.Rail, Personality.Expansive] as const;
const ROAD_PERSONALITIES = [
  Personality.Road,
  Personality.Conservative,
  Personality.TownNetwork,
] as const;

describe('a competitor that cannot pay for a railway still goes into business', () => {
  it('offers one mode at a time, never a mixture', () => {
    // The fallback replaces the list, it does not extend it. A list carrying
    // both modes would make the builder choose between a railway and a lorry
    // line by score alone, which is not what a personality is.
    for (const seed of SWEEP) {
      const w = world(seed);
      for (let personality = 0; personality < 5; personality++) {
        const list = opportunities(w, personality, 1);
        if (list.length === 0) continue;
        const modes = new Set(list.map((entry) => entry.rail));
        expect(modes.size, `seed ${seed} personality ${personality} mixes modes`).toBe(1);
      }
    }
  });

  it('never lets a road personality reach for rail', () => {
    // One-way, and measured: no town pair on any swept seed pays as a railway
    // (0 of 780 per seed), and the industry pairs that pay by rail are a
    // subset of the ones that pay by road, so the reverse fallback would find
    // nothing and would only blur the five personalities into one.
    for (const seed of SWEEP) {
      const w = world(seed);
      for (const personality of ROAD_PERSONALITIES) {
        for (const entry of opportunities(w, personality, 1)) {
          expect(entry.rail, `seed ${seed} personality ${personality} offered rail`).toBe(false);
        }
      }
    }
  });

  /**
   * **Both branches are still live, and since D-229 the rail branch is
   * measured in a PLAYED game rather than at world creation.**
   *
   * The assertion below used to read both counts off the 1950 list of eight
   * freshly created worlds, and D-229 raised `AI_MIN_PROFIT_MARGIN` from 1.25
   * to 2.00 on a fifteen-value sweep. That turned the 1950 half of it red, and
   * the numbers are here rather than in a widened bound:
   *
   *  - at 1.25, at world creation: **8 of 32** (sixteen seeds x two rail
   *    personalities) opened with a rail-first list, on seeds 2718, 60613,
   *    918273 and 860213.
   *  - at 2.00, at world creation: **0 of 32**. No generated 1950 map offers a
   *    railway that clears the floor - the 1950 industries are small and the
   *    1950 catalogue is dear.
   *  - at 2.00, over sixteen played quarter centuries: **650 of 5,700**
   *    rail-personality scans prefer a railway (11.4 %; at 1.25 it was 1,313 of
   *    5,508). The first rail-first list appears in **1956** on seed 4714,
   *    1962 on 4711, 1968 on 4713 and never on 4712.
   *
   * So the property this test wants - that a rail personality has not silently
   * become a road personality - is TRUE and the old instrument could not see
   * it: it sampled the world at the one instant a railway is least affordable.
   * A railway that becomes worth building as the industries grow and the
   * locomotives get better is the right shape for the game, and it is what the
   * game-scale instrument below asserts.
   */
  it('falls back to road exactly when no railway on the map pays, and does so somewhere', () => {
    let fellBack = 0;
    let keptRail = 0;
    for (const seed of SWEEP) {
      const w = world(seed);
      for (const personality of RAIL_PERSONALITIES) {
        const list = opportunities(w, personality, 1);
        if (list.length === 0) continue;
        if (list[0]!.rail) keptRail++;
        else fellBack++;
      }
    }
    console.log(
      `rail personalities over eight seeds at world creation: ` +
        `${keptRail} rail lists, ${fellBack} fell back`,
    );

    // The fallback branch, at world creation where it always fires.
    expect(fellBack, 'the fallback never fires - it would be dead code').toBeGreaterThan(0);
  });

  it('still prefers a railway once the map has grown one worth building', () => {
    // Seed 4714 is the cheapest of the four probed - its first rail-first list
    // is in 1956 - and the loop leaves the moment it finds one, so a healthy
    // run plays six game years and not twenty-five.
    const w = world(4_714);
    const queue = new CommandQueue();
    let found = 0;
    for (let year = 0; year <= 25 && found === 0; year++) {
      for (const personality of RAIL_PERSONALITIES) {
        const list = opportunities(w, personality, 1);
        if (list.length > 0 && list[0]!.rail) found = 1950 + year;
      }
      if (found !== 0) break;
      for (let tick = 0; tick < TICKS_PER_YEAR; tick++) w.step(queue, null);
    }
    console.log(`seed 4714: a rail personality prefers a railway again in ${found}`);
    expect(found, 'no rail personality ever prefers a railway in a played game').toBeGreaterThan(0);
  });
});

describe('the projection is quoted for the railway the builder lays', () => {
  it('charges one track, not the oval two', () => {
    expect(AI_RAIL_PROJECTED_TRAINS).toBe(1);
    expect(AI_RAIL_PROJECTED_TRACKS).toBe(1);

    const w = world(4713);
    const train = pickTrain(w, Cargo.Coal);
    expect(train.length).toBeGreaterThan(0);
    const at = (distance: number): Opportunity => ({
      fromX: 10,
      fromY: 10,
      toX: 10 + distance,
      toY: 10,
      cargo: Cargo.Coal,
      distance,
      revenueCtPerMonth: 0,
      buildCostCt: 0,
      score: 0,
      rail: true,
      monthlyOutput: 300,
      offeredPerMonth: 300,
    });

    // The way is the only term that scales with distance, so the slope of the
    // upkeep over distance IS the number of tracks being charged. Doubling the
    // haul must add ONE track's worth of upkeep, not two.
    const a = projectLine(w, at(40), train, 1).upkeepCtPerMonth;
    const b = projectLine(w, at(80), train, 1).upkeepCtPerMonth;
    const c = projectLine(w, at(120), train, 1).upkeepCtPerMonth;
    expect(b - a).toBe(c - b);
    const perTile = (b - a) / 40;
    expect(perTile).toBeGreaterThan(0);
    // Two tracks would cost exactly twice this, which is what it used to be.
    console.log(`rail way charged: ${perTile.toFixed(2)} cent/month/tile of haul`);
  });
});

describe('the fresh rot gate is not what empties the industry offer', () => {
  it('drops no industry pair on any swept seed', () => {
    // REFUTED, pinned. `arrivesAlive` stays as a cheap early-out in front of an
    // expensive projection and as the gate D-122 needs in front of the ranking,
    // but it is not the filter that is wrong: on all eight seeds it refuses not
    // one (source, sink) pair, and every pair it would refuse the profitability
    // floor refuses anyway.
    let considered = 0;
    let dropped = 0;
    for (const seed of SWEEP) {
      const w = world(seed);
      const open = w.industries.filter((industry) => industry.open);
      for (const source of open) {
        const outputs = industrySpec(source.type).outputs;
        if (outputs.length === 0) continue;
        const cargo = outputs[0]!;
        for (const sink of open) {
          if (sink.id === source.id || sink.landmassId !== source.landmassId) continue;
          if (!industrySpec(sink.type).inputs.includes(cargo)) continue;
          const dx = source.x - sink.x;
          const dy = source.y - sink.y;
          const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
          if (distance < AI_MIN_DISTANCE || distance > AI_MAX_DISTANCE) continue;
          considered++;
          const days = (distance * AI_TICKS_PER_TILE) / TICKS_PER_DAY;
          if (timeFactor(cargo, days) < AI_MIN_ARRIVAL_FACTOR) dropped++;
        }
      }
    }
    console.log(`fresh rot gate over eight seeds: ${dropped} of ${considered} industry pairs`);
    expect(considered).toBeGreaterThan(10);
    expect(dropped, 'the fresh gate has started refusing industry pairs - re-measure D-222').toBe(
      0,
    );
  });
});
