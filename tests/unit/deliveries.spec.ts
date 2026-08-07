import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import type { IndustryMarker, StationMarker, TownMarker } from '../../src/shared/protocol';
import { Cargo } from '../../src/sim/cargo/types';
import { TOWN_CARGO } from '../../src/sim/industry/catchment';
import { IndustryType, INDUSTRY_SPECS } from '../../src/sim/industry/types';
import { deliveryRoutes, supplyRoutes } from '../../src/ui/deliveries';

/**
 * "Where can this works send what it makes" - the question a player asks the
 * moment they click an industry, and the one the interface used to leave to
 * the handbook.
 *
 * It is worked out on the main thread from the industry list and the spec
 * table, so it is testable without a world: what has to hold is that the
 * chains it names are the chains the SIMULATION actually runs on, and that it
 * never sends anybody to a works that has closed.
 */

function industry(id: number, type: number, x: number, y: number, open = true): IndustryMarker {
  return { id, type, x, y, level: 100, stock: 0, service: 60, neglectedMonths: 0, open };
}

function town(id: number, name: string, x: number, y: number): TownMarker {
  return {
    id,
    name,
    x,
    y,
    sizeClass: 1,
    population: 1_200,
    councilRating: 50,
    exclusiveCompanyId: -1,
    exclusiveMonthsLeft: 0,
    exclusiveCostCt: 0,
    measureReady: [],
  };
}

function station(id: number, x: number, y: number): StationMarker {
  return {
    id,
    name: `S${id}`,
    ownerId: 0,
    x,
    y,
    rating: 60,
    waiting: 0,
    transferNode: false,
    modules: [{ kind: 0, x, y }],
    terms: { wait: 0, frequency: 0, equipment: 0, reliability: 0, overflow: 0 },
    waitingByCargo: [],
    history: [],
  };
}

describe('where the output of a works can go', () => {
  it('names the industries that take that cargo, nearest first', () => {
    const mine = industry(0, IndustryType.CoalMine, 10, 10);
    const world = [
      mine,
      industry(1, IndustryType.PowerPlant, 60, 10),
      industry(2, IndustryType.PowerPlant, 20, 10),
      industry(3, IndustryType.SteelMill, 30, 10),
      industry(4, IndustryType.Sawmill, 12, 10),
    ];

    const routes = deliveryRoutes(mine, world, [], []);
    expect(routes.length).toBe(1);
    expect(routes[0]!.cargo).toBe(Cargo.Coal);

    const names = routes[0]!.targets.map((target) => target.name);
    // Both power plants and the steel mill burn coal; the sawmill does not.
    expect(names).toContain(INDUSTRY_SPECS[IndustryType.PowerPlant]!.nameKey);
    expect(names).toContain(INDUSTRY_SPECS[IndustryType.SteelMill]!.nameKey);
    expect(names).not.toContain(INDUSTRY_SPECS[IndustryType.Sawmill]!.nameKey);

    // Nearest first: the power plant ten tiles away before the one at fifty.
    expect(routes[0]!.targets[0]!.distanceTiles).toBe(10);
  });

  it('never points at a works that has closed', () => {
    const mine = industry(0, IndustryType.CoalMine, 10, 10);
    const world = [mine, industry(1, IndustryType.PowerPlant, 20, 10, false)];

    expect(deliveryRoutes(mine, world, [], [])[0]!.targets).toEqual([]);
  });

  it('offers towns for goods and food, and for nothing else', () => {
    const towns = [town(0, 'Nordheim', 40, 10)];

    const furniture = industry(0, IndustryType.FurnitureFactory, 10, 10);
    const goods = deliveryRoutes(furniture, [furniture], towns, []);
    expect(goods[0]!.cargo).toBe(Cargo.Goods);
    expect(goods[0]!.targets.some((target) => target.kind === 'town')).toBe(true);

    const mine = industry(1, IndustryType.CoalMine, 10, 10);
    const coal = deliveryRoutes(mine, [mine], towns, []);
    expect(coal[0]!.targets.some((target) => target.kind === 'town')).toBe(false);
  });

  it('says so when a works hands nothing on', () => {
    const plant = industry(0, IndustryType.PowerPlant, 10, 10);
    // A sink has no outputs at all, which is a different thing from having
    // outputs nobody takes - and the panel says so differently.
    expect(deliveryRoutes(plant, [plant], [], [])).toEqual([]);
  });

  it('marks a target a station of ours already reaches', () => {
    const mine = industry(0, IndustryType.CoalMine, 10, 10);
    const plant = industry(1, IndustryType.PowerPlant, 40, 10);
    const served = deliveryRoutes(mine, [mine, plant], [], [station(0, 42, 11)]);
    const unserved = deliveryRoutes(mine, [mine, plant], [], [station(0, 80, 80)]);

    expect(served[0]!.targets[0]!.served).toBe(true);
    expect(unserved[0]!.targets[0]!.served).toBe(false);
  });
});

describe('where the supply of a works could come from', () => {
  it('names the industries that make what it needs', () => {
    const mill = industry(0, IndustryType.Sawmill, 10, 10);
    const world = [mill, industry(1, IndustryType.Forestry, 25, 10), industry(2, IndustryType.Farm, 15, 10)];

    const routes = supplyRoutes(mill, world, []);
    expect(routes.length).toBe(1);
    expect(routes[0]!.cargo).toBe(Cargo.Wood);
    expect(routes[0]!.targets.map((target) => target.name)).toEqual([
      INDUSTRY_SPECS[IndustryType.Forestry]!.nameKey,
    ]);
  });

  it('has nothing to say about a primary industry', () => {
    const mine = industry(0, IndustryType.CoalMine, 10, 10);
    expect(supplyRoutes(mine, [mine], [])).toEqual([]);
  });
});

describe('the chains it names are the chains the simulation runs', () => {
  it('finds a taker in the spec table for every cargo any works produces', () => {
    const catalogue = de as Record<string, string>;

    for (const spec of INDUSTRY_SPECS) {
      expect(spec.nameKey in catalogue, spec.nameKey).toBe(true);

      for (const cargo of spec.outputs) {
        const takenByIndustry = INDUSTRY_SPECS.some((other) => other.inputs.includes(cargo));
        const takenByTown = TOWN_CARGO.includes(cargo);
        // A cargo nothing anywhere accepts is a dead end in the economy, not a
        // display problem - and this is the cheapest place to notice one.
        expect(takenByIndustry || takenByTown, `nobody takes cargo ${cargo}`).toBe(true);
      }
    }
  });
});
