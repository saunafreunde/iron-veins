import { describe, expect, it } from 'vitest';
import { SHIPPED_SCENARIOS, scenarioById, scenarioYearOf } from '../../src/scenarios/catalog';
import { newGameOptionsOf, scenarioMetaOf, type ShippedScenario } from '../../src/scenarios/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { Cargo } from '../../src/sim/cargo/types';
import {
  Difficulty,
  MAP_SIZES,
  MapClimate,
  SCENARIO_TEXT_MAX_CHARS,
  START_YEAR,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { GOAL_KIND_COUNT, GoalKind, GoalStatus } from '../../src/sim/goals/types';
import { TOWN_CARGO } from '../../src/sim/industry/catchment';
import { industrySpec, IndustryType } from '../../src/sim/industry/types';
import { worldParamsFor } from '../../src/sim/newGame';
import { encodeScenario } from '../../src/sim/save/scenario';
import { SCENARIO_LOCKABLE_RULES } from '../../src/sim/save/scenarioMeta';
import { decodeSave } from '../../src/sim/save/serialize';
import { World } from '../../src/sim/World';

/**
 * The eight shipped scenarios of SPEC2 M17.
 *
 * SPEC2 asks for eight scenarios that are TEXT fixtures and genuinely playable,
 * and "genuinely playable" is the half a test can actually hold: every world
 * this catalogue describes is generated here and asked whether it contains what
 * its briefing claims. A mountain scenario whose towns sit on a plain, an
 * island scenario whose two towns share a land mass, a freight scenario whose
 * cargo has nowhere to go - each of those is a red build rather than a
 * disappointment three hours into a game.
 *
 * The other half - whether a gold band is reachable - is calibrated against the
 * measurements recorded at the head of `src/scenarios/catalog.ts` and is not
 * claimed here. What IS claimed here, and tested, is the floor under it: no
 * goal in any of the eight decides itself in the first game year for a player
 * who does nothing.
 */

const GAME_VERSION = '0.1.0';
const COMPANY = 'Testbahn';

/** Worlds are expensive; each scenario's is generated once for the whole file. */
const worlds = new Map<string, World>();
function worldOf(scenario: ShippedScenario): World {
  const cached = worlds.get(scenario.id);
  if (cached !== undefined) return cached;
  const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, 1)));
  worlds.set(scenario.id, world);
  return world;
}

function byId(id: string): ShippedScenario {
  const scenario = scenarioById(id);
  expect(scenario, `scenario ${id}`).not.toBeNull();
  return scenario!;
}

/** Height climbed and fallen along the straight line between two towns. */
function corridor(
  world: World,
  fromTown: number,
  toTown: number,
): { climb: number; minH: number; maxH: number; water: number; distance: number } {
  const map = world.map;
  const a = world.towns[fromTown]!;
  const b = world.towns[toTown]!;
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  let climb = 0;
  let minH = 99;
  let maxH = 0;
  let water = 0;
  let previous = map.baseHeight(a.x, a.y);
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
    const h = map.baseHeight(x, y);
    climb += Math.abs(h - previous);
    previous = h;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    if (map.landmassId[map.tileIndex(x, y)]! < 0) water++;
  }
  return { climb, minH, maxH, water, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

function landmassOfTown(world: World, townId: number): number {
  const town = world.towns[townId]!;
  return world.map.landmassId[world.map.tileIndex(town.x, town.y)]!;
}

function industryCount(world: World, type: IndustryType): number {
  let count = 0;
  for (const industry of world.industries) if (industry.type === type) count++;
  return count;
}

/** Whether anything on this map makes `cargo` - a town counts for its own. */
function hasProducer(world: World, cargo: Cargo): boolean {
  if (cargo === Cargo.Passengers || cargo === Cargo.Mail) return world.towns.length > 0;
  for (const industry of world.industries) {
    if (industrySpec(industry.type).outputs.includes(cargo)) return true;
  }
  return false;
}

/** Whether anything on this map TAKES `cargo` - the D-118 question, per world. */
function hasAcceptor(world: World, cargo: Cargo): boolean {
  if (cargo === Cargo.Passengers || cargo === Cargo.Mail) return world.towns.length > 0;
  if (TOWN_CARGO.includes(cargo)) return world.towns.length > 0;
  for (const industry of world.industries) {
    if (industrySpec(industry.type).inputs.includes(cargo)) return true;
  }
  return false;
}

// ------------------------------------------------------------ the catalogue

describe('the shipped scenario catalogue', () => {
  it('ships exactly the eight SPEC2 M17 names, each reachable by id', () => {
    expect(SHIPPED_SCENARIOS).toHaveLength(8);
    const ids = SHIPPED_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'frachtrausch',
      'gebirgslogistik',
      'inselhuepfen',
      'passagiernetz',
      'ratsdiplomatie',
      'speedrun',
      'ueberleben',
      'wiederaufbau',
    ]);
    for (const scenario of SHIPPED_SCENARIOS) expect(scenarioById(scenario.id)).toBe(scenario);
    expect(scenarioById('nothing-like-this')).toBeNull();
  });

  it('carries a briefing in BOTH languages, and two different ones', () => {
    // The briefing is content rather than chrome, so it does not go through
    // t() - which means nothing else in the suite would notice a missing half.
    for (const scenario of SHIPPED_SCENARIOS) {
      for (const text of [scenario.briefing, ...scenario.goals.map((goal) => goal.caption)]) {
        expect(text.de.length, scenario.id).toBeGreaterThan(0);
        expect(text.en.length, scenario.id).toBeGreaterThan(0);
        expect(text.de.length, scenario.id).toBeLessThanOrEqual(SCENARIO_TEXT_MAX_CHARS);
        expect(text.en.length, scenario.id).toBeLessThanOrEqual(SCENARIO_TEXT_MAX_CHARS);
        expect(text.de, scenario.id).not.toBe(text.en);
      }
      expect(scenario.title.length, scenario.id).toBeGreaterThan(0);
      expect(scenario.author.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it('states rules the new-game screen could have chosen', () => {
    for (const scenario of SHIPPED_SCENARIOS) {
      const rules = scenario.rules;
      expect(MAP_SIZES, scenario.id).toContain(rules.mapSize);
      expect(Object.values(Difficulty), scenario.id).toContain(rules.difficulty);
      expect(Object.values(MapClimate), scenario.id).toContain(rules.climate);
      expect(rules.aiCompanies, scenario.id).toBeGreaterThanOrEqual(0);
      expect(rules.seed, scenario.id).toBeGreaterThan(0);
    }
  });

  it('pins only real rules, in the one canonical order', () => {
    for (const scenario of SHIPPED_SCENARIOS) {
      let previous = -1;
      for (const rule of scenario.lockedRules) {
        const at = SCENARIO_LOCKABLE_RULES.indexOf(rule);
        expect(at, `${scenario.id}: ${rule}`).toBeGreaterThanOrEqual(0);
        expect(at, `${scenario.id}: ${rule} out of order`).toBeGreaterThan(previous);
        previous = at;
      }
      // Every one of them locks its own goals: a scenario whose goals could be
      // switched off on the start screen is not a scenario.
      expect(scenario.lockedRules, scenario.id).toContain('goals');
      expect(scenario.lockedRules, scenario.id).toContain('seed');
    }
  });

  it('orders every medal band and keeps it inside the scenario span', () => {
    for (const scenario of SHIPPED_SCENARIOS) {
      expect(scenario.toTick, scenario.id).toBeGreaterThan(scenario.fromTick);
      for (const goal of scenario.goals) {
        const spec = goal.spec;
        const where = `${scenario.id}/${spec.kind}`;
        expect(spec.goldTick, where).toBeLessThanOrEqual(spec.silverTick);
        expect(spec.silverTick, where).toBeLessThanOrEqual(spec.bronzeTick);
        expect(spec.goldTick, where).toBeGreaterThan(scenario.fromTick);
        expect(spec.bronzeTick, where).toBeLessThanOrEqual(scenario.toTick);
      }
    }
  });

  it('uses every one of the six descriptors somewhere', () => {
    // The eight are the goal machine's own showcase: a descriptor no scenario
    // ever sets is a descriptor no shipped fixture exercises.
    const used = new Set<number>();
    for (const scenario of SHIPPED_SCENARIOS) {
      for (const goal of scenario.goals) used.add(goal.spec.kind);
    }
    expect(used.size).toBe(GOAL_KIND_COUNT);
  });

  it('prints the calendar year a band tick falls in', () => {
    expect(scenarioYearOf(TICKS_PER_YEAR)).toBe(START_YEAR);
    expect(scenarioYearOf(TICKS_PER_YEAR * 26)).toBe(1975);
  });
});

// ------------------------------------------------- the file format (D-194)

describe('a shipped scenario as a .ironscenario', () => {
  it('writes and reads back through the ONE serializer, goals intact', () => {
    // The catalogue and the file format are two statements of the same thing,
    // and this is the seam: every shipped definition has to be a legal
    // `.ironscenario`, or "scenario compatibility IS save compatibility" would
    // hold for files nobody ships.
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      const bytes = encodeScenario(
        world,
        new CommandQueue(),
        GAME_VERSION,
        scenarioMetaOf(scenario),
      );
      const loaded = decodeSave(bytes);

      expect(loaded.scenario, scenario.id).toEqual(scenarioMetaOf(scenario));
      expect(loaded.world.goals.count, scenario.id).toBe(scenario.goals.length);
      for (let at = 0; at < scenario.goals.length; at++) {
        const spec = scenario.goals[at]!.spec;
        expect(loaded.world.goals.kind[at], scenario.id).toBe(spec.kind);
        expect(loaded.world.goals.threshold[at], scenario.id).toBe(spec.threshold);
        expect(loaded.world.goals.bronzeTick[at], scenario.id).toBe(spec.bronzeTick);
      }
    }
  });
});

// ----------------------------------------------------- the worlds themselves

describe('every scenario names things its own map has', () => {
  it('names towns that exist, and calls them by their real names', () => {
    // A goal addresses a TOWN because a scenario is authored before a station
    // exists (D-193), so the id in the descriptor and the name in the caption
    // are two halves of one claim. This is the half that can rot silently.
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        const named: number[] = [];
        if (goal.spec.kind === GoalKind.ConnectStations) {
          named.push(goal.spec.subjectA, goal.spec.subjectB);
        } else if (goal.spec.kind === GoalKind.TownPopulationReach && goal.spec.subjectA >= 0) {
          named.push(goal.spec.subjectA);
        }
        for (const townId of named) {
          const town = world.towns[townId];
          expect(town, `${scenario.id}: town ${townId}`).toBeDefined();
          expect(goal.caption.de, `${scenario.id}: ${town!.name}`).toContain(town!.name);
          expect(goal.caption.en, `${scenario.id}: ${town!.name}`).toContain(town!.name);
        }
      }
    }
  });

  it('counts a cargo that something makes and something takes', () => {
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        if (goal.spec.kind !== GoalKind.CargoDeliveredTotal) continue;
        const cargo = goal.spec.subjectA as Cargo;
        expect(hasProducer(world, cargo), `${scenario.id}: producer of ${cargo}`).toBe(true);
        expect(hasAcceptor(world, cargo), `${scenario.id}: acceptor of ${cargo}`).toBe(true);
      }
    }
  });

  it('asks a town for more inhabitants than it starts with', () => {
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        if (goal.spec.kind !== GoalKind.TownPopulationReach) continue;
        const town = world.towns[goal.spec.subjectA]!;
        expect(goal.spec.threshold, `${scenario.id}: ${town.name}`).toBeGreaterThan(
          town.population,
        );
      }
    }
  });

  it('gives the mountain scenario a mountain', () => {
    // The claim in the briefing, measured: 60 tiles of straight line between
    // Silberheim and Ulmenburg, eleven height levels and water in the way.
    const scenario = byId('gebirgslogistik');
    const world = worldOf(scenario);
    const line = corridor(world, 3, 18);
    expect(line.distance).toBeGreaterThan(50);
    expect(line.climb).toBeGreaterThanOrEqual(20);
    expect(line.maxH - line.minH).toBeGreaterThanOrEqual(8);
    expect(line.water).toBeGreaterThan(0);
    expect(landmassOfTown(world, 3)).toBe(landmassOfTown(world, 18));
  });

  it('gives the island scenario an island', () => {
    // Two towns of 8,000 on DIFFERENT land masses is the whole scenario: no
    // bridge spans open water, so the connection is a ship or it is nothing.
    const world = worldOf(byId('inselhuepfen'));
    const mainland = world.towns[23]!;
    const island = world.towns[8]!;
    expect(mainland.population).toBeGreaterThanOrEqual(8_000);
    expect(island.population).toBeGreaterThanOrEqual(8_000);
    expect(landmassOfTown(world, 23)).not.toBe(landmassOfTown(world, 8));
    expect(corridor(world, 23, 8).water).toBeGreaterThan(10);

    // ... and it really is an archipelago rather than one town cut off: at
    // least three land masses carry a town.
    const inhabited = new Set<number>();
    for (let id = 0; id < world.towns.length; id++) inhabited.add(landmassOfTown(world, id));
    expect(inhabited.size).toBeGreaterThanOrEqual(3);
  });

  it('gives the freight scenario mines and somewhere to burn what they dig', () => {
    const world = worldOf(byId('frachtrausch'));
    expect(industryCount(world, IndustryType.CoalMine)).toBeGreaterThanOrEqual(3);
    expect(industryCount(world, IndustryType.PowerPlant)).toBeGreaterThanOrEqual(1);
  });

  it('gives the two passenger scenarios their cities', () => {
    for (const id of ['passagiernetz', 'ratsdiplomatie']) {
      const world = worldOf(byId(id));
      const cities = world.towns.filter((town) => town.population >= 8_000);
      expect(cities.length, id).toBeGreaterThanOrEqual(6);
    }
  });

  it('gives the reconstruction scenario a food chain to restart', () => {
    const world = worldOf(byId('wiederaufbau'));
    expect(industryCount(world, IndustryType.Farm)).toBeGreaterThanOrEqual(2);
    expect(industryCount(world, IndustryType.FoodFactory)).toBeGreaterThanOrEqual(2);
  });

  it('gives the speedrun a flat pair of cities close together', () => {
    const world = worldOf(byId('speedrun'));
    const line = corridor(world, 5, 18);
    expect(line.distance).toBeLessThanOrEqual(32);
    expect(line.climb).toBeLessThanOrEqual(6);
    expect(line.water).toBe(0);
    expect(world.towns[5]!.population).toBeGreaterThanOrEqual(8_000);
    expect(world.towns[18]!.population).toBeGreaterThanOrEqual(8_000);
  });

  it('gives the survival scenario every rule and the thinnest offer', () => {
    const scenario = byId('ueberleben');
    expect(scenario.rules.difficulty).toBe(Difficulty.Hard);
    expect(scenario.rules.aiCompanies).toBe(4);
    for (const flag of [
      scenario.rules.inflation,
      scenario.rules.emissions,
      scenario.rules.occupancyPenalty,
      scenario.rules.signalPenalty,
      scenario.rules.roadCongestion,
    ]) {
      expect(flag).toBe(true);
    }
    const world = worldOf(scenario);
    expect(world.industries.length).toBeLessThanOrEqual(12);
    expect(world.companies).toHaveLength(5);
  });

  it('differs from every other scenario in more than its text', () => {
    const seeds = SHIPPED_SCENARIOS.map((scenario) => scenario.rules.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    const climates = new Set(SHIPPED_SCENARIOS.map((scenario) => scenario.rules.climate));
    expect(climates.size).toBe(4);
    const difficulties = new Set(SHIPPED_SCENARIOS.map((scenario) => scenario.rules.difficulty));
    expect(difficulties.size).toBe(3);
  });
});

// -------------------------------------------------------- no free medals

describe('no shipped goal decides itself', () => {
  it('leaves every goal open after a game year in which the player did nothing', () => {
    // The cheapest way to ship a broken scenario is a threshold below what the
    // world already is: company value under the starting capital, a population
    // the town passes on its own, a rating nobody has to earn. One year of the
    // world running by itself catches all three.
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      const queue = new CommandQueue();
      for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(queue, null);

      expect(world.tick, scenario.id).toBe(TICKS_PER_YEAR);
      for (let at = 0; at < world.goals.count; at++) {
        expect(world.goals.status[at], `${scenario.id}: goal ${at}`).toBe(GoalStatus.Open);
      }
    }
  });
});
