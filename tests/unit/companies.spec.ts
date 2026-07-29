import { describe, expect, it } from 'vitest';
import { CommandKind } from '../../src/sim/commands/types';
import {
  MAX_AI_COMPANIES,
  TICKS_PER_MONTH,
  TILE_PUBLIC,
  START_CAPITAL_CT,
  Difficulty,
} from '../../src/sim/constants';
import { ModuleKind } from '../../src/sim/station/types';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld } from '../../src/sim/World';
import { apply, flatScenario, makeTown, tryApply, type Scenario } from '../balance/scenario';

/**
 * More than one company (section 15).
 *
 * The AI is not built yet; what is built is everything a second company needs
 * in order to exist at all - its own books, its own fleet, its own half of the
 * map - and this is where those separations are pinned. Every one of them was
 * a place where the single-company code silently meant "the player".
 */

const SIZE = 64;
const ROW = 20;

function twoCompanies(ai = 1): Scenario {
  const scenario = flatScenario(SIZE, [makeTown(0, 30, 40, 1_200, 'Doppelstadt')], [], 9, ai);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

describe('a game with competitors', () => {
  it('gives each one its own books, name and colour', () => {
    const world = twoCompanies(3).world;

    expect(world.companies.length).toBe(4);
    expect(world.playerCompany.id).toBe(0);
    for (let id = 0; id < world.companies.length; id++) {
      expect(world.companies[id]!.id).toBe(id);
    }
    // Distinct names and distinct colours, or the map is unreadable and the
    // company list says the same thing four times.
    const names = new Set(world.companies.map((c) => c.name));
    const colours = new Set(world.companies.map((c) => c.colorIndex));
    expect(names.size).toBe(4);
    expect(colours.size).toBe(4);
  });

  it('never creates more than the maximum, whatever it is asked for', () => {
    const world = flatScenario(SIZE, [], [], 9, MAX_AI_COMPANIES + 4).world;
    expect(world.companies.length).toBe(MAX_AI_COMPANIES + 1);
  });

  it('starts every company with the same capital - the AI is not a cheat', () => {
    const world = flatScenario(SIZE, [], [], 9, 2).world;
    for (const company of world.companies) {
      expect(company.cashCt).toBe(START_CAPITAL_CT[Difficulty.Normal]);
    }
  });

  it('draws the same opponents from the same seed', () => {
    const first = flatScenario(SIZE, [], [], 4, 3).world.companies.map((c) => c.name);
    const second = flatScenario(SIZE, [], [], 4, 3).world.companies.map((c) => c.name);
    expect(second).toEqual(first);
  });
});

describe('what a company owns', () => {
  it('charges the company that issued the command, not the player', () => {
    const scenario = twoCompanies();
    const world = scenario.world;
    const playerCash = world.playerCompany.cashCt;
    const rivalCash = world.companies[1]!.cashCt;

    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);

    expect(world.playerCompany.cashCt).toBe(playerCash);
    expect(world.companies[1]!.cashCt).toBeLessThan(rivalCash);
    // And the ground says who laid it.
    expect(world.map.owner[world.map.tileIndex(10, ROW)]).toBe(1);
  });

  it('will not let one company tear up another’s line', () => {
    const scenario = twoCompanies();
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);

    expect(tryApply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW }, 0)).toBe(
      'cmd.reject.notYours',
    );
    expect(tryApply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW }, 1)).toBeNull();
  });

  it('gives the ground back to nobody once the last of it is gone', () => {
    const scenario = twoCompanies();
    const map = scenario.world.map;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);
    expect(map.owner[map.tileIndex(10, ROW)]).toBe(1);

    apply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW }, 1);
    expect(map.owner[map.tileIndex(10, ROW)]).toBe(TILE_PUBLIC);
  });

  it('will not let one company sell another’s vehicle', () => {
    const scenario = twoCompanies();
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);
    apply(
      scenario,
      { kind: CommandKind.BuildRoadStop, x: 5, y: ROW, moduleKind: ModuleKind.RoadDepot },
      1,
    );
    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 5, y: ROW, specId: 200 }, 1);

    expect(scenario.world.vehicles.ownerId[0]).toBe(1);
    expect(tryApply(scenario, { kind: CommandKind.SellVehicle, vehicleId: 0 }, 0)).toBe(
      'cmd.reject.notYours',
    );
    expect(tryApply(scenario, { kind: CommandKind.SellVehicle, vehicleId: 0 }, 1)).toBeNull();
  });

  it('does not join a competitor’s station', () => {
    const scenario = twoCompanies();
    const world = scenario.world;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);
    apply(
      scenario,
      { kind: CommandKind.BuildRoadStop, x: 6, y: ROW, moduleKind: ModuleKind.BusStop },
      1,
    );
    // Two tiles away is well inside the join distance - but not for a rival.
    apply(
      scenario,
      { kind: CommandKind.BuildRoadStop, x: 8, y: ROW, moduleKind: ModuleKind.BusStop },
      0,
    );

    expect(world.stations.length).toBe(2);
    expect(world.stations[0]!.ownerId).toBe(1);
    expect(world.stations[1]!.ownerId).toBe(0);
  });
});

describe('the monthly books of several companies', () => {
  it('charges each company only its own upkeep', () => {
    const scenario = twoCompanies();
    const world = scenario.world;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 25, y2: ROW }, 1);

    const playerBefore = world.playerCompany.cashCt;
    for (let tick = 0; tick < TICKS_PER_MONTH * 2; tick++) world.step(scenario.queue, null);

    // The player built nothing, so nothing but interest can have moved their
    // cash; the rival is paying for twenty tiles of road.
    expect(world.playerCompany.infrastructureUpkeepPerYearCt).toBe(0);
    expect(world.companies[1]!.infrastructureUpkeepPerYearCt).toBeGreaterThan(0);
    expect(world.playerCompany.cashCt).toBe(playerBefore);
  });

  it('survives a save with every company intact', () => {
    const scenario = twoCompanies(2);
    const world = scenario.world;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 25, y2: ROW }, 1);
    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) world.step(scenario.queue, null);

    const reloaded = decodeSave(encodeSave(world, scenario.queue, '0.1.0')).world;

    expect(reloaded.companies).toEqual(world.companies);
    expect(reloaded.map.owner[world.map.tileIndex(10, ROW)]).toBe(1);
    expect(hashWorld(reloaded)).toBe(hashWorld(world));
  });

  it('rests on the player between commands, so nothing charges the wrong books', () => {
    const scenario = twoCompanies();
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);
    expect(scenario.world.actingCompanyId).toBe(0);
    expect(scenario.world.company).toBe(scenario.world.playerCompany);
  });
});
