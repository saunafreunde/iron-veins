import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  COUNCIL_EXCLUSIVE_MIN_RATING,
  COUNCIL_EXCLUSIVE_MONTHS,
  COUNCIL_RATING_NEUTRAL,
  COUNCIL_REFUSAL_RATING,
  TICKS_PER_MONTH,
  TILE_PUBLIC,
  TOWN_MEASURE_COST_CT,
} from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { Terrain } from '../../src/sim/map/terrain';
import { ModuleKind } from '../../src/sim/station/types';
import { councilRating, TownMeasure } from '../../src/sim/town/council';
import { apply, flatScenario, makeTown, tryApply, type Scenario } from '../balance/scenario';

/**
 * The town council of section 13.3.
 *
 * Four inputs, two of them nuisance; two thresholds that change what a company
 * may do; five measures that cost money and wear off. What is worth pinning is
 * that the rating MOVES for the right reasons and that the two thresholds
 * actually bite - a rating nothing reads is decoration.
 */

const SIZE = 64;
const TOWN_X = 30;
const TOWN_Y = 40;

function townScenario(ai = 1): Scenario {
  const scenario = flatScenario(
    SIZE,
    [makeTown(0, TOWN_X, TOWN_Y, 2_000, 'Ratsheim')],
    [],
    9,
    ai,
  );
  for (const company of scenario.world.companies) company.cashCt = 500_000_000_00;
  return scenario;
}

/** Run to the next month boundary, which is when councils make up their minds. */
function passMonths(scenario: Scenario, months: number): void {
  for (let tick = 0; tick < TICKS_PER_MONTH * months; tick++) {
    scenario.world.step(scenario.queue, null);
  }
}

describe('what a council thinks of a company', () => {
  it('is neutral about one it has never heard of', () => {
    const scenario = townScenario(0);
    passMonths(scenario, 1);
    expect(councilRating(scenario.world.towns[0]!, 0)).toBe(COUNCIL_RATING_NEUTRAL);
  });

  it('rises when the company serves the town', () => {
    const scenario = townScenario(0);
    passMonths(scenario, 1);
    const before = councilRating(scenario.world.towns[0]!, 0);

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    });
    passMonths(scenario, 1);

    expect(councilRating(scenario.world.towns[0]!, 0)).toBeGreaterThan(before);
  });

  it('falls for track laid through the streets', () => {
    const scenario = townScenario(0);
    passMonths(scenario, 1);
    const before = councilRating(scenario.world.towns[0]!, 0);

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
    passMonths(scenario, 1);

    expect(councilRating(scenario.world.towns[0]!, 0)).toBeLessThan(before);
  });

  it('falls further for every house knocked down, and forgives it slowly', () => {
    const scenario = townScenario(0);
    const world = scenario.world;
    const map = world.map;
    // Put a house where the company wants to build.
    const tile = map.tileIndex(TOWN_X + 2, TOWN_Y + 1);
    map.buildingKind[tile] = 1;
    map.buildingLevel[tile] = 1;

    passMonths(scenario, 1);
    const before = councilRating(world.towns[0]!, 0);

    apply(scenario, { kind: CommandKind.DemolishBuilding, x: TOWN_X + 2, y: TOWN_Y + 1 });
    expect(map.buildingKind[tile]).toBe(0);
    passMonths(scenario, 1);

    const after = councilRating(world.towns[0]!, 0);
    expect(after).toBeLessThan(before);

    // A grudge that never faded would cost a company the town for ever.
    passMonths(scenario, 24);
    expect(councilRating(world.towns[0]!, 0)).toBeGreaterThan(after);
  });
});

describe('the measures of a council', () => {
  it('plants real trees and buys real goodwill', () => {
    const scenario = townScenario(0);
    const world = scenario.world;
    passMonths(scenario, 1);
    const before = councilRating(world.towns[0]!, 0);

    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.PlantTrees,
    });
    passMonths(scenario, 1);

    let forest = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (world.map.terrain[world.map.tileIndex(TOWN_X + dx, TOWN_Y + dy)] === Terrain.Forest) {
          forest++;
        }
      }
    }
    expect(forest).toBeGreaterThan(0);
    expect(councilRating(world.towns[0]!, 0)).toBeGreaterThan(before);
  });

  it('lays streets that stay the town’s, not the payer’s', () => {
    const scenario = townScenario(0);
    const world = scenario.world;
    const roadsBefore = countRoad(world.map.roadBits);

    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.FundRoads,
    });

    expect(countRoad(world.map.roadBits)).toBeGreaterThan(roadsBefore);
    // Every new tile is public: a company that could own a town's streets by
    // funding them could lock everyone out without going near the council.
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const tile = world.map.tileIndex(TOWN_X + dx, TOWN_Y + dy);
        if (world.map.roadBits[tile] === 0) continue;
        expect(world.map.owner[tile]).toBe(TILE_PUBLIC);
      }
    }
  });

  it('refuses the same measure twice in a row', () => {
    const scenario = townScenario(0);
    const command = {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.AdvertiseLarge,
    } as const;

    expect(tryApply(scenario, command)).toBeNull();
    expect(tryApply(scenario, command)).toBe('cmd.reject.measureNotReady');
    // A different measure is a different cooldown.
    expect(
      tryApply(scenario, { ...command, measure: TownMeasure.AdvertiseSmall }),
    ).toBeNull();
  });

  it('charges what the table says', () => {
    const scenario = townScenario(0);
    const cash = scenario.world.playerCompany.cashCt;

    apply(scenario, {
      kind: CommandKind.ApplyTownMeasure,
      townId: 0,
      measure: TownMeasure.AdvertiseMedium,
    });

    expect(cash - scenario.world.playerCompany.cashCt).toBe(
      TOWN_MEASURE_COST_CT[TownMeasure.AdvertiseMedium],
    );
  });
});

describe('the two thresholds', () => {
  it('refuses building permits to a company below the floor', () => {
    const scenario = townScenario(0);
    const world = scenario.world;
    // Straight to the bottom, the way a council gets there: nuisance.
    world.towns[0]!.councilRating[0] = COUNCIL_REFUSAL_RATING - 1;

    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: TOWN_X - 2,
        y: TOWN_Y,
        moduleKind: ModuleKind.BusStop,
      }),
    ).toBe('cmd.reject.councilRefuses');

    // And outside the town it has no say at all.
    expect(
      tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: 5, x2: 12, y2: 5 }),
    ).toBeNull();
  });

  it('sells exclusive rights only to a company the council likes', () => {
    const scenario = townScenario(1);
    const world = scenario.world;

    expect(tryApply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 })).toBe(
      'cmd.reject.ratingTooLow',
    );

    world.towns[0]!.councilRating[0] = COUNCIL_EXCLUSIVE_MIN_RATING;
    expect(tryApply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 })).toBeNull();
    expect(world.towns[0]!.exclusiveCompanyId).toBe(0);
  });

  it('locks every competitor out for twelve months, and then lets them back in', () => {
    const scenario = townScenario(1);
    const world = scenario.world;
    world.towns[0]!.councilRating[0] = COUNCIL_EXCLUSIVE_MIN_RATING;
    apply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 });

    const stop = {
      kind: CommandKind.BuildRoadStop,
      x: TOWN_X - 2,
      y: TOWN_Y,
      moduleKind: ModuleKind.BusStop,
    } as const;
    expect(tryApply(scenario, stop, 1)).toBe('cmd.reject.exclusiveRights');
    // The holder builds as normal.
    expect(tryApply(scenario, stop, 0)).toBeNull();

    passMonths(scenario, COUNCIL_EXCLUSIVE_MONTHS + 1);
    expect(world.towns[0]!.exclusiveCompanyId).toBe(-1);
    expect(
      tryApply(scenario, { ...stop, x: TOWN_X + 2 }, 1),
    ).toBeNull();
  });

  it('will not sell rights that somebody already holds', () => {
    const scenario = townScenario(1);
    const world = scenario.world;
    world.towns[0]!.councilRating[0] = COUNCIL_EXCLUSIVE_MIN_RATING;
    world.towns[0]!.councilRating[1] = COUNCIL_EXCLUSIVE_MIN_RATING;

    apply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 });
    expect(tryApply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 }, 1)).toBe(
      'cmd.reject.rightsTaken',
    );
    // Not even to the holder: rights do not stack, and charging twice for the
    // same twelve months would be a trap.
    expect(tryApply(scenario, { kind: CommandKind.BuyExclusiveRights, townId: 0 }, 0)).toBe(
      'cmd.reject.rightsTaken',
    );
  });
});

function countRoad(bits: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i] !== 0) count++;
  return count;
}
