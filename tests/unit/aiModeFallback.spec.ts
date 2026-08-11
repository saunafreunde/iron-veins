import { describe, expect, it } from 'vitest';
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
      `rail personalities over eight seeds: ${keptRail} rail lists, ${fellBack} fell back`,
    );

    // Both branches are live. A fallback that never fires is dead code, and a
    // fallback that always fires means the rail personalities have stopped
    // being rail personalities.
    expect(fellBack, 'the fallback never fires - it would be dead code').toBeGreaterThan(0);
    expect(keptRail, 'no rail personality anywhere still prefers a railway').toBeGreaterThan(0);
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
