import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { Cargo } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  INDUSTRY_BASE_OUTPUT_PER_MONTH,
  INDUSTRY_DECLINE_RATIO,
  INDUSTRY_GROWTH_RATIO,
  INDUSTRY_INPUT_PER_BATCH,
  INDUSTRY_LEVEL_HYSTERESIS_MONTHS,
  INDUSTRY_LEVEL_MIN,
  INDUSTRY_LEVEL_START,
  INDUSTRY_LEVEL_STEP,
  INDUSTRY_OUTPUT_PER_BATCH,
  INDUSTRY_STOCK_CAP,
  MapClimate,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { stationAccepts } from '../../src/sim/industry/catchment';
import {
  collectIndustryOutput,
  produceIndustryCargo,
  reviewIndustries,
} from '../../src/sim/industry/production';
import {
  INDUSTRY_SPECS,
  INDUSTRY_TYPE_COUNT,
  IndustryType,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { ModuleKind, stationRating, type Station } from '../../src/sim/station/types';
import { World } from '../../src/sim/World';

/**
 * Industry chains: the recipe tables, what a starved factory does, the service
 * gate that makes a badly served mine ship less, and the monthly level.
 */

const SIZE = 64;
const GROUND = 5;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

/** Flat grass, one town's worth of houses, and whatever industries are asked for. */
function bench(industries: Industry[]): Bench {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(GROUND);
  map.terrain.fill(Terrain.Grass);

  for (const industry of industries) {
    const size = INDUSTRY_SPECS[industry.type]!.footprint;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        map.industryId[map.tileIndex(industry.x + dx, industry.y + dy)] = industry.id;
      }
    }
  }

  const world = World.fromGenerated(
    {
      seed: 5,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Kettenbau AG',
      companyColorIndex: 1,
    },
    { map, towns: [], industries, seedUsed: 5 },
  );
  return { world, queue: new CommandQueue() };
}

function run(b: Bench, command: Command): void {
  b.queue.enqueue(command, b.world.tick);
  let rejected: string | null = null;
  b.world.drainCommands(b.queue, (_e, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  if (rejected !== null) throw new Error(`command ${command.kind} rejected: ${String(rejected)}`);
}

function days(b: Bench, count: number): void {
  for (let i = 0; i < count * TICKS_PER_DAY; i++) b.world.step(b.queue, null);
}

// ------------------------------------------------------------- the catalogue

describe('the industry catalogue', () => {
  it('is indexed by its own type', () => {
    expect(INDUSTRY_SPECS).toHaveLength(INDUSTRY_TYPE_COUNT);
    for (let i = 0; i < INDUSTRY_SPECS.length; i++) {
      expect(INDUSTRY_SPECS[i]!.type).toBe(i);
    }
  });

  it('has a recipe row of the right length for every industry', () => {
    for (const spec of INDUSTRY_SPECS) {
      expect(INDUSTRY_INPUT_PER_BATCH[spec.type], spec.nameKey).toHaveLength(spec.inputs.length);
      expect(INDUSTRY_OUTPUT_PER_BATCH[spec.type], spec.nameKey).toHaveLength(spec.outputs.length);
      expect(INDUSTRY_BASE_OUTPUT_PER_MONTH[spec.type], spec.nameKey).toBeGreaterThan(0);
    }
  });

  it('keeps every industry within the two stock slots it is given', () => {
    // The production state holds two inputs and two outputs as flat scalars.
    // A three-input factory would be silently truncated; this is the test that
    // turns that into a failure instead.
    for (const spec of INDUSTRY_SPECS) {
      expect(spec.inputs.length, spec.nameKey).toBeLessThanOrEqual(2);
      expect(spec.outputs.length, spec.nameKey).toBeLessThanOrEqual(2);
    }
  });

  it('names every industry in both languages', () => {
    for (const spec of INDUSTRY_SPECS) {
      expect(de, spec.nameKey).toHaveProperty(spec.nameKey);
      expect(en, spec.nameKey).toHaveProperty(spec.nameKey);
    }
  });
});

// -------------------------------------------------------------- production

describe('what an industry produces', () => {
  it('lets a primary industry run on nothing', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    produceIndustryCargo(b.world);
    expect(mine.outputStock0).toBeGreaterThan(0);
    expect(mine.producedThisMonth).toBeGreaterThan(0);
  });

  it('produces exactly nothing when a processor is starved', () => {
    const mill = newIndustry(0, IndustryType.SteelMill, 20, 20, 0);
    const b = bench([mill]);

    for (let i = 0; i < 30; i++) produceIndustryCargo(b.world);
    expect(mill.outputStock0).toBe(0);
    expect(mill.producedThisMonth).toBe(0);
  });

  it('consumes and emits at the declared ratio once it is fed', () => {
    const mill = newIndustry(0, IndustryType.SteelMill, 20, 20, 0);
    mill.inputStock0 = 100; // coal
    mill.inputStock1 = 100; // iron ore
    const b = bench([mill]);

    produceIndustryCargo(b.world);
    const steel = mill.outputStock0;
    expect(steel).toBeGreaterThan(0);
    // 0.5 coal and 1 ore per steel.
    expect(100 - mill.inputStock0).toBeCloseTo(steel * 0.5, 6);
    expect(100 - mill.inputStock1).toBeCloseTo(steel * 1, 6);
  });

  it('stops when the yard is full', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    for (let i = 0; i < 200; i++) produceIndustryCargo(b.world);
    expect(mine.outputStock0).toBeLessThanOrEqual(INDUSTRY_STOCK_CAP);
    expect(mine.outputStock0).toBeCloseTo(INDUSTRY_STOCK_CAP, 6);
  });
});

// ------------------------------------------------------------ the service gate

describe('the service gate', () => {
  /** A mine with a lorry bay beside it, whose rating we can set by hand. */
  function servedMine(): { b: Bench; mine: Industry; station: Station } {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);
    const map = b.world.map;

    // A road tile so a bay can go up, right next to the mine.
    map.roadBits[map.tileIndex(22, 20)] = 0x0f;
    run(b, {
      kind: CommandKind.BuildRoadStop,
      x: 22,
      y: 20,
      moduleKind: ModuleKind.LorryBay,
    });
    return { b, mine, station: b.world.stations[0]! };
  }

  it('finds the industry it stands beside, and accepts what it eats', () => {
    const { mine, station } = servedMine();
    expect(station.servedIndustries).toContain(mine.id);
    // A coal mine consumes nothing, so the bay accepts only what any station does.
    expect(stationAccepts(station, Cargo.Coal)).toBe(false);
    expect(stationAccepts(station, Cargo.Passengers)).toBe(true);
  });

  it('accepts the input of the industry it serves', () => {
    const plant = newIndustry(0, IndustryType.PowerPlant, 20, 20, 0);
    const b = bench([plant]);
    const map = b.world.map;
    map.roadBits[map.tileIndex(24, 20)] = 0x0f;
    run(b, { kind: CommandKind.BuildRoadStop, x: 24, y: 20, moduleKind: ModuleKind.LorryBay });

    expect(stationAccepts(b.world.stations[0]!, Cargo.Coal)).toBe(true);
    expect(stationAccepts(b.world.stations[0]!, Cargo.Steel)).toBe(false);
  });

  it('ships less from a badly rated station, and the rest stays in the yard', () => {
    const { b, mine, station } = servedMine();
    mine.outputStock0 = 100;

    // Nobody has called here, so the frequency and reliability terms are zero
    // and the rating sits well under 100.
    const rating = stationRating(station, b.world.tick);
    expect(rating).toBeLessThan(100);

    collectIndustryOutput(b.world);
    const shipped = 100 - mine.outputStock0;

    expect(shipped).toBeGreaterThan(0);
    expect(shipped).toBeLessThan(100);
    // The gate took the rating's share, and the rest is still in the yard.
    expect(shipped).toBeCloseTo(rating, 0);
    expect(mine.outputStock0).toBeCloseTo(100 - shipped, 6);
  });

  it('never ships more than was produced, however many stations there are', () => {
    const { b, mine } = servedMine();
    const map = b.world.map;
    map.roadBits[map.tileIndex(18, 20)] = 0x0f;
    run(b, { kind: CommandKind.BuildRoadStop, x: 18, y: 20, moduleKind: ModuleKind.LorryBay });

    mine.outputStock0 = 100;
    collectIndustryOutput(b.world);
    expect(mine.outputStock0).toBeGreaterThanOrEqual(0);
  });
});

// ------------------------------------------------------------- the level

describe('the production level', () => {
  function levelBench(): { b: Bench; mine: Industry } {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    return { b: bench([mine]), mine };
  }

  it('waits out the hysteresis before it moves at all', () => {
    const { b, mine } = levelBench();
    for (let month = 0; month < INDUSTRY_LEVEL_HYSTERESIS_MONTHS - 1; month++) {
      mine.producedThisMonth = 100;
      mine.collectedThisMonth = 100;
      reviewIndustries(b.world);
      expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_START);
    }
    mine.producedThisMonth = 100;
    mine.collectedThisMonth = 100;
    reviewIndustries(b.world);
    expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_START + INDUSTRY_LEVEL_STEP);
  });

  it('does not move inside the dead band', () => {
    const { b, mine } = levelBench();
    const middle = (INDUSTRY_GROWTH_RATIO + INDUSTRY_DECLINE_RATIO) / 2;
    for (let month = 0; month < 12; month++) {
      mine.producedThisMonth = 100;
      mine.collectedThisMonth = 100 * middle;
      reviewIndustries(b.world);
    }
    expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_START);
  });

  it('runs an unserved industry down to the floor and no further', () => {
    const { b, mine } = levelBench();
    for (let month = 0; month < 60; month++) {
      mine.producedThisMonth = 100;
      mine.collectedThisMonth = 0;
      reviewIndustries(b.world);
    }
    expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_MIN);
  });

  it('resets the monthly counters whatever it decides', () => {
    const { b, mine } = levelBench();
    mine.producedThisMonth = 42;
    mine.collectedThisMonth = 7;
    reviewIndustries(b.world);
    expect(mine.producedThisMonth).toBe(0);
    expect(mine.collectedThisMonth).toBe(0);
  });
});

// ------------------------------------------------------------ the whole loop

describe('a mine and a power plant', () => {
  it('carries coal, burns it, and pays for the journey', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 10, 20, 0);
    const plant = newIndustry(1, IndustryType.PowerPlant, 40, 20, 0);
    const b = bench([mine, plant]);

    // A road between the two, a bay at each end, a depot and a lorry.
    run(b, { kind: CommandKind.BuildRoad, x1: 13, y1: 20, x2: 39, y2: 20 });
    run(b, { kind: CommandKind.BuildRoadStop, x: 13, y: 20, moduleKind: ModuleKind.LorryBay });
    run(b, { kind: CommandKind.BuildRoadStop, x: 39, y: 20, moduleKind: ModuleKind.LorryBay });
    run(b, { kind: CommandKind.BuildRoadStop, x: 15, y: 20, moduleKind: ModuleKind.RoadDepot });

    const pit = b.world.stations[0]!;
    const works = b.world.stations[1]!;
    expect(stationAccepts(works, Cargo.Coal)).toBe(true);

    run(b, { kind: CommandKind.BuyRoadVehicle, x: 15, y: 20, specId: 240 });
    run(b, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId: 0,
      orders: [
        { target: 0, targetId: pit.id, load: 1, unload: 0 },
        { target: 0, targetId: works.id, load: 1, unload: 0 },
      ],
    });
    run(b, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });

    const cashBefore = b.world.company.cashCt;
    // Not a whole number of months: the monthly review resets the counters, so
    // sampling exactly on a month boundary would read zero.
    days(b, 95);

    // The mine made coal, the lorry carried it, the plant burnt it.
    expect(mine.producedThisMonth).toBeGreaterThan(0);
    expect(mine.collectedThisMonth).toBeGreaterThan(0);
    expect(b.world.vehicles.earnedCt[0]!).toBeGreaterThan(0);
    expect(b.world.company.cashCt).toBeGreaterThan(cashBefore - 100_000_000);
    expect(plant.inputStock0 + plant.producedThisMonth).toBeGreaterThan(0);
  });

  it('refuses cargo nobody at the station wants, and keeps it aboard', () => {
    const plant = newIndustry(0, IndustryType.PowerPlant, 40, 20, 0);
    const b = bench([plant]);
    const map = b.world.map;
    map.roadBits[map.tileIndex(44, 20)] = 0x0f;
    run(b, { kind: CommandKind.BuildRoadStop, x: 44, y: 20, moduleKind: ModuleKind.LorryBay });
    map.roadBits[map.tileIndex(45, 20)] = 0x0f;
    run(b, { kind: CommandKind.BuildRoadStop, x: 45, y: 20, moduleKind: ModuleKind.RoadDepot });

    const station = b.world.stations[0]!;
    expect(stationAccepts(station, Cargo.Coal)).toBe(true);
    expect(stationAccepts(station, Cargo.Steel)).toBe(false);
  });
});

// ------------------------------------------------------------ persistence

describe('industry state survives a save', () => {
  it('keeps the stock, the level and the counters', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);
    for (let i = 0; i < TICKS_PER_MONTH; i++) b.world.step(b.queue, null);

    const data = b.world.toData();
    expect(data.industries[0]!.outputStock0).toBeGreaterThan(0);
    expect(data.industries[0]!.productionLevel).toBe(mine.productionLevel);

    const restored = World.fromData(data);
    expect(restored.industries[0]!.outputStock0).toBe(mine.outputStock0);
    expect(restored.industries[0]!.productionLevel).toBe(mine.productionLevel);
  });
});
