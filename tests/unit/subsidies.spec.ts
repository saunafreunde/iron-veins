import { describe, expect, it } from 'vitest';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  Difficulty,
  MapClimate,
  SUBSIDY_MAX_OPEN,
  SUBSIDY_MIN_OPEN,
  SUBSIDY_RATE_MAX,
  SUBSIDY_RATE_MIN,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { opportunities } from '../../src/sim/ai/evaluate';
import { Personality } from '../../src/sim/ai/types';
import {
  isSubsidyOpen,
  subsidyRateFor,
  subsidyRateForDelivery,
  type Subsidy,
} from '../../src/sim/economy/subsidies';
import {
  industrySpec,
  IndustryType,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import { World } from '../../src/sim/World';
import { flatScenario, type Scenario } from '../balance/scenario';

/**
 * The subsidy board (SPEC2 M21).
 *
 * Three things are measured here and they are the milestone's own sentences: a
 * subsidised relation goes to EXACTLY ONE company, by a race and never by a
 * command; the board is a property of the century world rule and of nothing
 * else; and a competitor that refuses unprofitable work (D-221, D-229) offers
 * the relation the moment the state pays for it - which is the lever the
 * milestone asked for.
 */

const MAP_SIZE = 256;

/** The controlled chain of the lever test below: a mine, a works, a haul. */
const MINE_X = 20;
const ROW = 20;
const HAUL = 60;
const YEARS = 3;

/**
 * The production level at which the coal haul is a business that does not quite
 * pay - found by sweeping the level against `AI_MIN_PROFIT_MARGIN`: at 15 the
 * competitor builds the line unaided, at 10 it refuses it, and at 10 with the
 * state paying twice the rate it builds it.
 */
const STARVED_LEVEL = 10;

function world(seed: number, economy = true, aiCompanies = 3): World {
  return World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies,
    economy,
  });
}

/** Put one offer on the board with terms the test controls. */
function plant(w: World, from: Industry, to: Industry, rateFactor = SUBSIDY_RATE_MAX): Subsidy {
  const subsidy: Subsidy = {
    id: w.nextSubsidyId++,
    cargo: industrySpec(from.type).outputs[0]!,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    rateFactor,
    offeredTick: w.tick,
    expiresTick: w.tick + 24 * TICKS_PER_MONTH,
    claimedBy: -1,
    deliveredUnits: 0,
  };
  w.subsidies.push(subsidy);
  return subsidy;
}

/** The first pair of works on this map where one makes what the other eats. */
function anyChainPair(w: World): { from: Industry; to: Industry } {
  for (const from of w.industries) {
    const outputs = industrySpec(from.type).outputs;
    if (!from.open || outputs.length === 0) continue;
    for (const to of w.industries) {
      if (to.id === from.id || !to.open) continue;
      if (industrySpec(to.type).inputs.includes(outputs[0]!)) return { from, to };
    }
  }
  throw new Error('no chain pair on this map');
}

describe('the board', () => {
  it('exists only in a century world', () => {
    const without = world(4711, false);
    const queue = new CommandQueue();
    for (let tick = 0; tick < TICKS_PER_MONTH * 2; tick++) without.step(queue, null);
    expect(without.subsidies).toHaveLength(0);
  });

  it('stocks itself, on unserved relations, at 1.5 to 2 times the rate', () => {
    // No competitors: the world has to still be untouched when the offers are
    // read back, and three AI companies build stations inside the first month.
    const w = world(4711, true, 0);
    const queue = new CommandQueue();
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) w.step(queue, null);

    const open = w.subsidies.filter((s) => isSubsidyOpen(w, s));
    expect(open.length).toBeGreaterThanOrEqual(SUBSIDY_MIN_OPEN);
    expect(open.length).toBeLessThanOrEqual(SUBSIDY_MAX_OPEN);
    for (const subsidy of open) {
      expect(subsidy.rateFactor).toBeGreaterThanOrEqual(SUBSIDY_RATE_MIN);
      expect(subsidy.rateFactor).toBeLessThanOrEqual(SUBSIDY_RATE_MAX);
      expect(subsidy.claimedBy).toBe(-1);
      // Unserved at the moment it was offered: no station within reach of
      // either end. Nothing has been built in this world at all.
      expect(w.stations).toHaveLength(0);
    }
  });
});

describe('the race', () => {
  it('goes to exactly ONE company - the first to deliver, and nobody after', () => {
    const w = world(4711);
    const { from, to } = anyChainPair(w);
    const subsidy = plant(w, from, to);
    const cargo = subsidy.cargo;

    // Company 2 delivers first, so company 2 wins it.
    const winner = subsidyRateFor(w, 2, from.x, from.y, to.x, to.y, cargo, true);
    expect(winner).toBe(subsidy.rateFactor);
    expect(subsidy.claimedBy).toBe(2);

    // Everybody else is paid the ordinary rate on the same relation, for ever.
    for (const companyId of [0, 1, 3]) {
      expect(subsidyRateFor(w, companyId, from.x, from.y, to.x, to.y, cargo, true)).toBe(1);
    }
    // And the winner keeps it: a claim is not spent by being used.
    expect(subsidyRateFor(w, 2, from.x, from.y, to.x, to.y, cargo, true)).toBe(subsidy.rateFactor);
    expect(subsidy.claimedBy).toBe(2);
  });

  it('cannot be won by looking at it', () => {
    const w = world(4711);
    const { from, to } = anyChainPair(w);
    const subsidy = plant(w, from, to);

    // Every estimate in the game asks with `claim: false` - the AI's ranking,
    // its profitability floor, the panel. None of them may win a race.
    for (let i = 0; i < 5; i++) {
      expect(subsidyRateFor(w, 1, from.x, from.y, to.x, to.y, subsidy.cargo, false)).toBe(
        subsidy.rateFactor,
      );
    }
    expect(subsidy.claimedBy).toBe(-1);
  });

  it('pays nothing for the wrong cargo, the wrong end or an expired offer', () => {
    const w = world(4711);
    const { from, to } = anyChainPair(w);
    const subsidy = plant(w, from, to);
    const cargo = subsidy.cargo;

    const wrongCargo = cargo === Cargo.Coal ? Cargo.Food : Cargo.Coal;
    expect(subsidyRateFor(w, 0, from.x, from.y, to.x, to.y, wrongCargo, true)).toBe(1);
    // Backwards is a different relation: the offer names a source and a sink.
    expect(subsidyRateFor(w, 0, to.x, to.y, from.x, from.y, cargo, true)).toBe(1);
    // Far from either end.
    expect(subsidyRateFor(w, 0, 1, 1, to.x, to.y, cargo, true)).toBe(1);
    expect(subsidy.claimedBy).toBe(-1);

    w.tick = subsidy.expiresTick + 1;
    expect(subsidyRateFor(w, 0, from.x, from.y, to.x, to.y, cargo, true)).toBe(1);
    expect(subsidy.claimedBy).toBe(-1);
  });

  it('is inert on the delivery path of a world with no century', () => {
    const w = world(4711, false);
    const { from, to } = anyChainPair(w);
    // Even with an offer planted by hand, a world without the rule pays the
    // tariff: the century is the gate, not the list.
    plant(w, from, to);
    expect(subsidyRateFor(w, 0, from.x, from.y, to.x, to.y, Cargo.Coal, true)).toBe(1);
    expect(subsidyRateForDelivery(w, 0, 0, to.x, to.y, Cargo.Coal)).toBe(1);
  });
});

describe('the lever on a competitor that refuses unprofitable work', () => {
  /**
   * The controlled world the lever is measured on: a coal mine, the steel works
   * sixty tiles away that eats its coal, and a machine factory beyond it so the
   * chain has the onward leg `onwardLegExists` requires.
   *
   * The mine is pinned at production level 10 - a tenth of a healthy pit - and
   * that is the whole of the setup. At that level the haul is a real business
   * that does not quite pay: `AI_MIN_PROFIT_MARGIN` is 2.00 since D-229 and the
   * line projects under it, so a competitor refuses to build it. It is pinned
   * every tick rather than set once, because a works that is finally served
   * GROWS (7.3) and a growing mine would make the line pay on its own after a
   * few years - which would prove the century, not the subsidy.
   */
  function chainWorld(): Scenario {
    const mine = newIndustry(0, IndustryType.CoalMine, MINE_X, ROW, 0);
    const mill = newIndustry(1, IndustryType.SteelMill, MINE_X + HAUL, ROW, 0);
    const works = newIndustry(2, IndustryType.MachineFactory, MINE_X + HAUL, ROW + 30, 0);
    const s = flatScenario(MAP_SIZE, [], [mine, mill, works], 9, 1, true, undefined, false, true);
    s.world.industries[0]!.productionLevel = STARVED_LEVEL;
    return s;
  }

  it('offers a relation it refuses at the tariff', () => {
    const s = chainWorld();
    expect(opportunities(s.world, Personality.Road, 1)).toHaveLength(0);

    plant(s.world, s.world.industries[0]!, s.world.industries[1]!);
    const offered = opportunities(s.world, Personality.Road, 1);
    expect(offered).toHaveLength(1);
    expect(offered[0]!.cargo).toBe(Cargo.Coal);
    expect(offered[0]!.fromX).toBe(MINE_X);
    expect(offered[0]!.toX).toBe(MINE_X + HAUL);
    expect(offered[0]!.subsidyFactor).toBe(SUBSIDY_RATE_MAX);
  });

  it('builds the line, runs it and wins the race - and builds nothing without it', () => {
    // Both arms play the SAME world with the board under the test's control:
    // `world.subsidies` is set at the head of every tick, so the treatment arm
    // has exactly one standing offer and the control arm has none. Without that
    // the monthly review would stock the control's board too and the two arms
    // would differ in more than the one thing being measured.
    function play(withSubsidy: boolean): {
      readonly stations: string[];
      readonly vehicles: number;
      readonly claimedBy: number;
      readonly units: number;
    } {
      const s = chainWorld();
      const w = s.world;
      const offer: Subsidy = {
        id: 0,
        cargo: Cargo.Coal,
        fromX: MINE_X,
        fromY: ROW,
        toX: MINE_X + HAUL,
        toY: ROW,
        rateFactor: SUBSIDY_RATE_MAX,
        offeredTick: 0,
        expiresTick: YEARS * TICKS_PER_YEAR + 1,
        claimedBy: -1,
        deliveredUnits: 0,
      };
      for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) {
        w.subsidies.length = 0;
        if (withSubsidy) w.subsidies.push(offer);
        w.step(s.queue, null);
        w.industries[0]!.productionLevel = STARVED_LEVEL;
      }
      let vehicles = 0;
      for (let id = 0; id < w.vehicles.count; id++) {
        if (w.vehicles.alive[id] === 1 && w.vehicles.ownerId[id] === 1) vehicles++;
      }
      return {
        stations: w.stations.filter((st) => st.ownerId === 1).map((st) => `${st.x},${st.y}`),
        vehicles,
        claimedBy: offer.claimedBy,
        units: offer.deliveredUnits,
      };
    }

    const without = play(false);
    expect(without.stations).toEqual([]);
    expect(without.vehicles).toBe(0);

    const with_ = play(true);
    // Two stops - one at each end of the relation the state paid for - and a
    // fleet on them.
    expect(with_.stations).toHaveLength(2);
    expect(with_.vehicles).toBeGreaterThan(0);
    // And it is not merely built: coal really arrived, so the competitor won
    // the race by delivering, which is the only way there is to win it.
    expect(with_.claimedBy).toBe(1);
    expect(with_.units).toBeGreaterThan(0);
  });

  it('leaves every other candidate quoted at exactly the tariff', () => {
    const w = world(4711);
    for (const candidate of opportunities(w, Personality.Road, 1)) {
      expect(candidate.subsidyFactor).toBe(1);
    }
  });
});
