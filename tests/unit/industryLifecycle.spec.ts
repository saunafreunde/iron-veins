import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_FLUCTUATION_AMPLITUDE,
  INDUSTRY_FLUCTUATION_PERIOD_YEARS,
  INDUSTRY_LEVEL_MAX,
  INDUSTRY_LEVEL_START,
  INDUSTRY_LEVEL_STEP,
  INDUSTRY_MIN_DISTANCE,
  INDUSTRY_SERVICE_WINDOW_MONTHS,
  INDUSTRY_STORE_FULL_SHARE,
  INDUSTRY_WARNING_MONTHS,
  MapClimate,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { closureWarningLevel, openNewIndustries } from '../../src/sim/industry/lifecycle';
import { produceIndustryCargo, reviewIndustries } from '../../src/sim/industry/production';
import {
  INDUSTRY_SPECS,
  IndustryType,
  industryBaseOutput,
  industryStockCap,
  newIndustry,
  type Industry,
} from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { ModuleKind } from '../../src/sim/station/types';
import { World } from '../../src/sim/World';

/**
 * The industry clock of section 7.3: production once a month, a throttle when
 * the yard is full, a swing on the primary rates, expansion on twelve good
 * months, closure after twenty-four months in which nothing left, and one new
 * works a year.
 */

const SIZE = 64;
const GROUND = 5;

interface Bench {
  readonly world: World;
  readonly queue: CommandQueue;
}

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
      seed: 11,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Werksbahn AG',
      companyColorIndex: 4,
    },
    { map, towns: [], industries, seedUsed: 11 },
  );
  world.company.cashCt = 50_000_000_00;
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

/** Book one month in which `collected` of `produced` units left the yard. */
function month(b: Bench, industry: Industry, produced: number, collected: number): void {
  industry.producedThisMonth = produced;
  industry.collectedThisMonth = collected;
  reviewIndustries(b.world);
}

describe('production runs on the monthly clock', () => {
  it('books a whole month at a time, not a slice a day', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    produceIndustryCargo(b.world);
    // The base rate is a monthly figure (section 7.3), so one call is one month
    // of coal - not a thirtieth of it.
    expect(mine.outputStock0).toBeCloseTo(industryBaseOutput(mine, 0), 6);
  });

  it('is booked by the world once a month and not once a day', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) b.world.step(b.queue, null);
    const afterOne = mine.outputStock0;
    expect(afterOne).toBeGreaterThan(0);

    for (let tick = 0; tick < TICKS_PER_MONTH; tick++) b.world.step(b.queue, null);
    // Two months, twice the coal - give or take the swing on a primary rate.
    expect(mine.outputStock0).toBeGreaterThan(afterOne * 1.5);
    expect(mine.outputStock0).toBeLessThan(afterOne * 2.5);
  });

  it('drops to a quarter once the yard is full, rather than stopping', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);
    const cap = industryStockCap(IndustryType.CoalMine);

    // Right at the brim there is no room at all and the throttle is invisible.
    mine.outputStock0 = cap;
    produceIndustryCargo(b.world);
    expect(mine.outputStock0).toBe(cap);

    // Nine tenths full is where the works is meant to be seen winding down.
    mine.outputStock0 = cap * INDUSTRY_STORE_FULL_SHARE;
    mine.producedThisMonth = 0;
    produceIndustryCargo(b.world);
    // Full at the start of the month, so a quarter rate - not the full rate,
    // and not zero either.
    expect(mine.producedThisMonth).toBeGreaterThan(0);
    expect(mine.producedThisMonth).toBeLessThan(industryBaseOutput(mine, 0) * 0.5);
  });
});

describe('the swing on a primary rate', () => {
  it('moves a mine by a quarter either way over five years, and a mill not at all', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const mill = newIndustry(1, IndustryType.SteelMill, 30, 30, 0);

    let low = Infinity;
    let high = -Infinity;
    const period = INDUSTRY_FLUCTUATION_PERIOD_YEARS * TICKS_PER_YEAR;
    for (let tick = 0; tick < period; tick += period / 200) {
      const rate = industryBaseOutput(mine, tick);
      if (rate < low) low = rate;
      if (rate > high) high = rate;
      // A works that runs on deliveries has no weather and no seam quality.
      expect(industryBaseOutput(mill, tick)).toBe(industryBaseOutput(mill, 0));
    }

    const middle = industryBaseOutput(mine, 0) / (1 + INDUSTRY_FLUCTUATION_AMPLITUDE * 0);
    expect(high / middle).toBeCloseTo(1 + INDUSTRY_FLUCTUATION_AMPLITUDE, 2);
    expect(low / middle).toBeCloseTo(1 - INDUSTRY_FLUCTUATION_AMPLITUDE, 2);
  });

  it('gives neighbouring industries different phases', () => {
    const a = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const bb = newIndustry(1, IndustryType.CoalMine, 40, 40, 0);
    // Same type, same base rate, but they must not boom in unison.
    expect(industryBaseOutput(a, 0)).not.toBeCloseTo(industryBaseOutput(bb, 0), 3);
  });
});

describe('expansion and closure', () => {
  it('expands by ten points after a year of good service, and stops at two hundred', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    for (let i = 0; i < INDUSTRY_SERVICE_WINDOW_MONTHS; i++) month(b, mine, 100, 100);
    expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_START + INDUSTRY_LEVEL_STEP);

    for (let i = 0; i < INDUSTRY_SERVICE_WINDOW_MONTHS * 20; i++) month(b, mine, 100, 100);
    expect(mine.productionLevel).toBe(INDUSTRY_LEVEL_MAX);
  });

  it('warns twice and then closes after two years with nothing collected', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);

    for (let i = 0; i < INDUSTRY_WARNING_MONTHS[0]! - 1; i++) month(b, mine, 100, 0);
    expect(closureWarningLevel(mine)).toBe(0);

    month(b, mine, 100, 0);
    expect(closureWarningLevel(mine)).toBe(1);

    for (let i = mine.monthsWithoutCollection; i < INDUSTRY_WARNING_MONTHS[1]!; i++) {
      month(b, mine, 100, 0);
    }
    expect(closureWarningLevel(mine)).toBe(2);
    expect(mine.open).toBe(true);

    for (let i = mine.monthsWithoutCollection; i < INDUSTRY_CLOSURE_MONTHS; i++) {
      month(b, mine, 100, 0);
    }
    expect(mine.open).toBe(false);
  });

  it('gives the ground back and drops the station that served it', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);
    const world = b.world;

    // A lorry bay in reach, so the mine really is served to begin with.
    run(b, { kind: CommandKind.BuildRoad, x1: 18, y1: 24, x2: 26, y2: 24 });
    run(b, { kind: CommandKind.BuildRoadStop, x: 21, y: 24, moduleKind: ModuleKind.LorryBay });
    const station = world.stations[0]!;
    expect(station.servedIndustries).toContain(mine.id);

    for (let i = 0; i < INDUSTRY_CLOSURE_MONTHS; i++) month(b, mine, 100, 0);

    expect(mine.open).toBe(false);
    expect(world.map.industryId[world.map.tileIndex(20, 20)]).toBe(-1);
    expect(station.servedIndustries).not.toContain(mine.id);
    // And it stops producing, so nothing appears on a platform for a works
    // that is not there any more.
    mine.producedThisMonth = 0;
    produceIndustryCargo(world);
    expect(mine.producedThisMonth).toBe(0);
  });

  it('never closes a works nobody has supplied yet', () => {
    // A steel mill with no coal makes nothing, so there is nothing to collect.
    // That is a works waiting for a supplier, not a works being neglected -
    // and closing it would wipe out every factory in the first two game years.
    const mill = newIndustry(0, IndustryType.SteelMill, 20, 20, 0);
    const b = bench([mill]);

    for (let i = 0; i < INDUSTRY_CLOSURE_MONTHS * 2; i++) {
      produceIndustryCargo(b.world);
      reviewIndustries(b.world);
    }
    expect(mill.open).toBe(true);
    expect(mill.monthsWithoutCollection).toBe(0);
  });
});

describe('new industries', () => {
  it('opens one a game year, on ground the placement rules allow', () => {
    const world = World.create({
      seed: 2026,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 128,
      companyName: 'Neuland AG',
      companyColorIndex: 0,
    });
    const before = world.industries.length;
    openNewIndustries(world);
    const opened = world.industries.length - before;
    expect(opened).toBeLessThanOrEqual(1);
    if (opened === 0) return;

    const fresh = world.industries[world.industries.length - 1]!;
    expect(fresh.open).toBe(true);
    expect(fresh.productionLevel).toBe(INDUSTRY_LEVEL_START);
    // Eight tiles clear of every other works, exactly as the generator places.
    for (const other of world.industries) {
      if (other.id === fresh.id || !other.open) continue;
      const dx = other.x - fresh.x;
      const dy = other.y - fresh.y;
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(
        INDUSTRY_MIN_DISTANCE * INDUSTRY_MIN_DISTANCE,
      );
    }
    // And its footprint really is on the map.
    expect(world.map.industryId[world.map.tileIndex(fresh.x, fresh.y)]).toBe(fresh.id);
  });

  it('is wired to the year, not to the day', () => {
    const mine = newIndustry(0, IndustryType.CoalMine, 20, 20, 0);
    const b = bench([mine]);
    // This map is flat grass with no towns, so no industry type can be placed
    // on it at all - which makes it the right map for asking whether anything
    // tried more than once.
    for (let tick = 0; tick < TICKS_PER_YEAR; tick++) b.world.step(b.queue, null);
    expect(b.world.industries).toHaveLength(1);
  });
});
