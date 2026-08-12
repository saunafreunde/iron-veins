import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  COUNCIL_NOISE_BARRIER_FACTOR,
  COUNCIL_RATING_NEUTRAL,
  COUNCIL_PROFILE_GREEN_FACTOR,
  COUNCIL_PROFILE_NOISE_FACTOR,
  DAYS_PER_YEAR,
  ELECTION_STREAM_NAME,
  ELECTION_TERM_YEARS,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  TOWN_MEASURE_BARRIER_MONTHS,
  TOWN_MEASURE_SPONSOR_PER_STATION,
  TOWN_MILESTONE_POPULATIONS,
} from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { NewsCategory } from '../../src/sim/news/log';
import { reportTownMilestone } from '../../src/sim/news/report';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import {
  COUNCIL_PROFILE_COUNT,
  CouncilProfile,
  councilRating,
  noiseBarrierStanding,
  ratingFor,
  TownMeasure,
} from '../../src/sim/town/council';
import { electionsHeldBy, ticksToNextElection } from '../../src/sim/town/elections';
import { streamSalt } from '../../src/sim/rng';
import { hashWorld } from '../../src/sim/World';
import { apply, flatScenario, makeTown, tryApply, type Scenario } from '../balance/scenario';

/**
 * Council elections (SPEC2 M20's politics half, SPEC.md 13.3 completed).
 *
 * The milestone's Fertig-wenn names one of these directly - "ein Wahlergebnis
 * die Ratsgewichte nachweislich verschiebt" - and the other half of this file
 * is the property that silently breaks every existing seed if it is got wrong:
 * the ballot draws from its OWN stream, so the shared gameplay generator is
 * left exactly where it was and no breakdown roll anywhere in the game moves.
 *
 * **Which assertions are evidence and which are read-back.** The three profile
 * weights of `COUNCIL_PROFILE_WEIGHT` were chosen for the distribution they
 * state, so counting outcomes back would check the table's own arithmetic. What
 * is independent of any number here:
 *
 *  - the rating SHIFT, which is measured against the same world, the same
 *    company and the same map with only the profile changed;
 *  - the stream separation, measured on the generator's own state;
 *  - the inertness of a world with the rule off, which follows from the guard
 *    on the first line of `runElections` and from no weight in the table.
 */

const SIZE = 64;
const TOWN_X = 30;
const TOWN_Y = 40;
const SEED = 424_242;

function townScenario(elections: boolean, seed = SEED): Scenario {
  const scenario = flatScenario(
    SIZE,
    [makeTown(0, TOWN_X, TOWN_Y, 2_000, 'Ratsheim')],
    [],
    seed,
    0,
    // No emissions: with no fleet the clean-fleet bonus is absent either way,
    // and the arithmetic below is then the NOISE term alone.
    false,
    undefined,
    elections,
  );
  for (const company of scenario.world.companies) company.cashCt = 500_000_000_00;
  return scenario;
}

function play(scenario: Scenario, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
}

/** Lay track through the town, which is the whole of the noise term. */
function layTrackThroughTown(scenario: Scenario): void {
  apply(scenario, {
    kind: CommandKind.BuildTrack,
    x1: TOWN_X - 4,
    y1: TOWN_Y,
    x2: TOWN_X + 4,
    y2: TOWN_Y,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
}

// ------------------------------------------------ the Fertig-wenn: the shift

describe('an election shifts the weights of the rating', () => {
  it('makes the same track cost more under a green council and less under a business one', () => {
    const scenario = townScenario(true);
    const world = scenario.world;
    layTrackThroughTown(scenario);
    const town = world.towns[0]!;

    // The same company, the same map, the same month - only the council is
    // different. That is the shift the milestone asks to see.
    town.councilProfile = CouncilProfile.Balanced;
    const balanced = ratingFor(world, town, 0, 0);
    town.councilProfile = CouncilProfile.Green;
    const green = ratingFor(world, town, 0, 0);
    town.councilProfile = CouncilProfile.Business;
    const business = ratingFor(world, town, 0, 0);

    expect(green).toBeLessThan(balanced);
    expect(business).toBeGreaterThan(balanced);
    // And the sizes are the table's: the noise term is what moved, by exactly
    // the factor each profile states.
    expect(COUNCIL_PROFILE_NOISE_FACTOR[CouncilProfile.Green]).toBe(2);
    expect(COUNCIL_PROFILE_NOISE_FACTOR[CouncilProfile.Business]).toBe(0.5);
    expect(COUNCIL_PROFILE_GREEN_FACTOR[CouncilProfile.Green]).toBe(2);
    // What each council charges for the same track, against the neutral 50 it
    // would have given a company that laid none. Within one point, because a
    // rating is an integer and the noise term is 0.6 a tile.
    const charged = (rating: number): number => COUNCIL_RATING_NEUTRAL - rating;
    expect(Math.abs(charged(green) - 2 * charged(balanced))).toBeLessThanOrEqual(1);
    expect(Math.abs(charged(business) - 0.5 * charged(balanced))).toBeLessThanOrEqual(1);
  });

  it('is a no-op for a company that made no noise and runs no fleet', () => {
    // The other side of the same statement, and the reason a green council is
    // not simply "everybody loses points": what a profile reweights is what a
    // company DID. A company with no track and no vehicles has neither term.
    const scenario = townScenario(true);
    const town = scenario.world.towns[0]!;
    const balanced = ratingFor(scenario.world, town, 0, 0);
    town.councilProfile = CouncilProfile.Green;
    expect(ratingFor(scenario.world, town, 0, 0)).toBe(balanced);
  });

  it('changes what a played world thinks of a company, month over month', () => {
    // The shift through the real machinery rather than through one function:
    // a company with track in the town, the profile flipped, and the monthly
    // review reading it.
    const scenario = townScenario(true);
    const world = scenario.world;
    layTrackThroughTown(scenario);
    play(scenario, TICKS_PER_MONTH);
    const before = councilRating(world.towns[0]!, 0);

    world.towns[0]!.councilProfile = CouncilProfile.Green;
    play(scenario, TICKS_PER_MONTH);
    expect(councilRating(world.towns[0]!, 0)).toBeLessThan(before);
  });
});

// ------------------------------------------------- the stream (Z3, D-106)

describe('the ballot draws from its own stream', () => {
  it('leaves the gameplay stream exactly where it was', () => {
    // The property that silently breaks every existing seed if it is got
    // wrong. A draw taken from `world.rng` here would move every later
    // breakdown roll of section 11.3, so the shared generator has to be in the
    // identical state after a decade of elections as after a decade without.
    const off = townScenario(false);
    const on = townScenario(true);
    const years = ELECTION_TERM_YEARS * 3;
    play(off, TICKS_PER_YEAR * years);
    play(on, TICKS_PER_YEAR * years);

    expect(on.world.rng.getState()).toEqual(off.world.rng.getState());
  });

  it('and the comparison is not vacuous: elections were held and mattered', () => {
    // A stream test passes trivially if nothing was drawn at all. Three terms
    // of a world with several towns must actually have elected somebody other
    // than the balanced council it started with, and the two worlds must have
    // different hashes because of it.
    const towns = [
      makeTown(0, 12, 12, 900, 'Erstadt'),
      makeTown(1, 30, 14, 900, 'Zweitheim'),
      makeTown(2, 16, 34, 900, 'Drittdorf'),
      makeTown(3, 40, 40, 900, 'Viertbach'),
    ];
    const on = flatScenario(SIZE, towns, [], SEED, 0, false, undefined, true);
    const off = flatScenario(
      SIZE,
      [
        makeTown(0, 12, 12, 900, 'Erstadt'),
        makeTown(1, 30, 14, 900, 'Zweitheim'),
        makeTown(2, 16, 34, 900, 'Drittdorf'),
        makeTown(3, 40, 40, 900, 'Viertbach'),
      ],
      [],
      SEED,
      0,
      false,
      undefined,
      false,
    );
    play(on, TICKS_PER_YEAR * ELECTION_TERM_YEARS * 3);
    play(off, TICKS_PER_YEAR * ELECTION_TERM_YEARS * 3);

    const elected = on.world.towns.filter((t) => t.councilProfile !== CouncilProfile.Balanced);
    expect(elected.length).toBeGreaterThan(0);
    expect(off.world.towns.every((t) => t.councilProfile === CouncilProfile.Balanced)).toBe(true);
    expect(hashWorld(on.world)).not.toBe(hashWorld(off.world));
    // Still the same gameplay stream, with elections that changed something.
    expect(on.world.rng.getState()).toEqual(off.world.rng.getState());
  });

  it('draws one word per town per election and no more', () => {
    // The Z3 clause spelled out: a pass whose draw COUNT depended on what it
    // drew would make the stream's position a function of the state it is
    // generating. Counted on the generator the election actually builds, which
    // `streamFor` hands out fresh - so what is measured is this ballot alone.
    const scenario = townScenario(true);
    const world = scenario.world;
    const election = electionsHeldBy(TICKS_PER_YEAR * ELECTION_TERM_YEARS);
    let draws = 0;
    // Only the ELECTION's own generator is counted: `streamFor` is shared -
    // the tender review of D-107 draws from it every month - so a counter that
    // wrapped every stream would be measuring the whole world's randomness.
    const electionSalt = (streamSalt(ELECTION_STREAM_NAME) + election) | 0;
    const original = world.streamFor.bind(world);
    (world as unknown as { streamFor: (salt: number | string) => unknown }).streamFor = (salt) => {
      const rng = original(salt) as { nextUint32: () => number };
      if (salt !== electionSalt) return rng;
      const inner = rng.nextUint32.bind(rng);
      rng.nextUint32 = () => {
        draws++;
        return inner();
      };
      return rng;
    };
    play(scenario, TICKS_PER_YEAR * ELECTION_TERM_YEARS);
    expect(election).toBe(1);
    // `nextFloat` is one word, and there is one town in this world.
    expect(draws).toBe(world.towns.length);
  });
});

// --------------------------------------------------------- the rule is a rule

describe('a world without the rule never holds an election', () => {
  it('keeps every council balanced for a whole century', () => {
    const scenario = townScenario(false);
    play(scenario, TICKS_PER_YEAR * ELECTION_TERM_YEARS * 4);
    for (const town of scenario.world.towns) {
      expect(town.councilProfile).toBe(CouncilProfile.Balanced);
    }
  });

  it('answers the panel with no ballot rather than with a date', () => {
    // The interface half: `monthsToElection` is -1 in a world that holds none,
    // and the arithmetic behind it is a pure function of the tick.
    const term = ELECTION_TERM_YEARS * TICKS_PER_YEAR;
    expect(ticksToNextElection(0)).toBe(term);
    expect(ticksToNextElection(term - 1)).toBe(1);
    expect(ticksToNextElection(term)).toBe(term);
    expect(electionsHeldBy(0)).toBe(0);
    expect(electionsHeldBy(term)).toBe(1);
    expect(electionsHeldBy(term * 2 + 5)).toBe(2);
  });

  it('carries the elected council through a save and into the hash', () => {
    const scenario = townScenario(true);
    play(scenario, TICKS_PER_YEAR * ELECTION_TERM_YEARS);
    const world = scenario.world;
    world.towns[0]!.councilProfile = CouncilProfile.Business;

    const before = hashWorld(world);
    const loaded = decodeSave(encodeSave(world, scenario.queue, 'test')).world;
    expect(loaded.towns[0]!.councilProfile).toBe(CouncilProfile.Business);
    expect(hashWorld(loaded)).toBe(before);

    // And the digest can tell two councils apart, which is what makes saving
    // it worth anything.
    loaded.towns[0]!.councilProfile = CouncilProfile.Green;
    expect(hashWorld(loaded)).not.toBe(before);
    expect(COUNCIL_PROFILE_COUNT).toBe(3);
  });
});

// ------------------------------------------------------------ the measures

describe('the two measures SPEC2 M20 adds', () => {
  it('refuses sponsorship to a company with no station here, and pays per station', () => {
    const scenario = townScenario(false);
    const world = scenario.world;
    const town = world.towns[0]!;

    expect(
      tryApply(scenario, {
        kind: CommandKind.ApplyTownMeasure,
        townId: 0,
        measure: TownMeasure.SponsorStations,
      }),
    ).toBe('cmd.reject.nothingToDo');

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    });
    const before = town.councilGoodwill[0] ?? 0;
    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.SponsorStations,
    });
    expect((town.councilGoodwill[0] ?? 0) - before).toBeGreaterThanOrEqual(
      TOWN_MEASURE_SPONSOR_PER_STATION,
    );
  });

  it('refuses a barrier where the company laid no track, and halves the noise where it did', () => {
    const scenario = townScenario(false);
    const world = scenario.world;
    const town = world.towns[0]!;

    expect(
      tryApply(scenario, {
        kind: CommandKind.ApplyTownMeasure,
        townId: 0,
        measure: TownMeasure.NoiseBarrier,
      }),
    ).toBe('cmd.reject.nothingToDo');

    layTrackThroughTown(scenario);
    const noisy = ratingFor(world, town, 0, 0);
    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.NoiseBarrier,
    });
    expect(noiseBarrierStanding(world, town, 0)).toBe(true);
    const walled = ratingFor(world, town, 0, 0);
    expect(walled).toBeGreaterThan(noisy);
    // Half and not nothing: a wall is not the line going away.
    expect(COUNCIL_NOISE_BARRIER_FACTOR).toBe(0.5);
    const neutral = ratingFor(world, town, 0, 0) - walled;
    expect(neutral).toBe(0);

    // It comes down again, and the noise comes back with it.
    world.tick += TOWN_MEASURE_BARRIER_MONTHS * TICKS_PER_MONTH;
    expect(noiseBarrierStanding(world, town, 0)).toBe(false);
    expect(ratingFor(world, town, 0, 0)).toBeLessThan(walled);
  });

  it('puts a green council and a barrier back where a balanced council was', () => {
    // The pairing the two mechanisms were written as, and it is arithmetic
    // rather than coincidence: x2 for the profile and x0.5 for the wall.
    const scenario = townScenario(true);
    const world = scenario.world;
    const town = world.towns[0]!;
    layTrackThroughTown(scenario);

    const balanced = ratingFor(world, town, 0, 0);
    town.councilProfile = CouncilProfile.Green;
    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.NoiseBarrier,
    });
    // The measure also buys no goodwill, so nothing but the noise moved.
    expect(ratingFor(world, town, 0, 0)).toBe(balanced);
  });
});

// ------------------------------------------------------ postOnce and the news

describe('the log is written once, not once a day', () => {
  it('reports a growth milestone on the month it is crossed and never again', () => {
    // The shape that wrote the same sentence seven hundred times a game year
    // before `postOnce` existed: a clock that runs every day over a condition
    // that stays true. Both guards are exercised here - the EDGE (a call whose
    // two population figures straddle no threshold writes nothing) and
    // `postOnce` behind it (a caller that reported the same crossing again
    // cannot repeat the entry).
    const scenario = townScenario(false);
    const world = scenario.world;
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    });
    const town = world.towns[0]!;
    const milestone = TOWN_MILESTONE_POPULATIONS[1]!;

    town.population = milestone + 5;
    reportTownMilestone(world, town, milestone - 1);
    const entries = (): readonly { messageKey: string }[] =>
      world.news.all.filter((entry) => entry.messageKey === 'news.townMilestone');
    expect(entries().length).toBe(1);

    // A game year of days over a town that is simply still above the line.
    for (let day = 0; day < DAYS_PER_YEAR; day++) {
      reportTownMilestone(world, town, town.population);
      town.population += 1;
    }
    expect(entries().length).toBe(1);

    // And a caller that reports the identical crossing again is refused by
    // `postOnce`, which is the guard behind the edge rather than in front of it.
    town.population = milestone + 5;
    for (let day = 0; day < DAYS_PER_YEAR; day++) reportTownMilestone(world, town, milestone - 1);
    expect(entries().length).toBe(1);

    const posted = world.news.all.find((entry) => entry.messageKey === 'news.townMilestone')!;
    expect(posted.category).toBe(NewsCategory.Town);
    expect(posted.params['population']).toBe(milestone);
  });

  it('collapses two milestones for one town with nothing in between, and says so', () => {
    // The stated floor of using `postOnce` at all: its key is the message AND
    // the place, so a town that crosses two thresholds with no other entry in
    // between writes one line. It is the price of the guard the milestone asks
    // for by name, and it is priced in months - a town needs years to cross
    // 2,500 and then 5,000, and a game year without one other piece of news is
    // not a game anybody is playing. Pinned rather than hidden.
    const scenario = townScenario(false);
    const world = scenario.world;
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    });
    const town = world.towns[0]!;
    const first = TOWN_MILESTONE_POPULATIONS[1]!;
    const second = TOWN_MILESTONE_POPULATIONS[2]!;
    const third = TOWN_MILESTONE_POPULATIONS[3]!;
    const posted = (): readonly { params: Record<string, string | number> }[] =>
      world.news.all.filter((entry) => entry.messageKey === 'news.townMilestone');

    town.population = first + 1;
    reportTownMilestone(world, town, first - 1);
    town.population = second + 1;
    reportTownMilestone(world, town, second - 1);
    expect(posted().length).toBe(1);

    // With anything at all in between - which is what a played game has - the
    // next milestone is written.
    world.news.post({
      tick: world.tick,
      category: NewsCategory.Town,
      severity: 0,
      messageKey: 'news.somethingElse',
      params: {},
      tileIndex: -1,
    });
    town.population = third + 1;
    reportTownMilestone(world, town, third - 1);
    expect(posted().length).toBe(2);
    expect(posted()[1]!.params['population']).toBe(third);
  });

  it('says nothing about a town the player does not serve', () => {
    const scenario = townScenario(false);
    const world = scenario.world;
    const town = world.towns[0]!;
    const milestone = TOWN_MILESTONE_POPULATIONS[1]!;
    town.population = milestone + 5;
    reportTownMilestone(world, town, milestone - 1);
    expect(world.news.all.filter((entry) => entry.messageKey === 'news.townMilestone').length).toBe(
      0,
    );
  });

  it('says nothing about a town that is shrinking past a milestone', () => {
    // Upwards only: the 10.1 death spiral has the M14 instruments, and a
    // headline for every thousand a town loses on the way down would bury them.
    const scenario = townScenario(false);
    const world = scenario.world;
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    });
    const town = world.towns[0]!;
    const milestone = TOWN_MILESTONE_POPULATIONS[1]!;
    town.population = milestone - 1;
    reportTownMilestone(world, town, milestone + 5);
    expect(world.news.all.filter((entry) => entry.messageKey === 'news.townMilestone').length).toBe(
      0,
    );
  });
});
