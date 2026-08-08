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

/**
 * What each scenario's briefing and doc comment CLAIM about its own world.
 *
 * This table is the answer to the M17 acceptance defect (D-197): the
 * Passagiernetz briefing promised "eight cities of 8,000" over a world that had
 * seven, and nothing anywhere was able to notice. Every figure below was taken
 * by generating the world and reading it, and every one of them is a figure
 * some sentence a PLAYER reads depends on. They are pinned exactly rather than
 * banded, because the generator is deterministic (law #3): a changed seed, a
 * changed mapgen constant or a changed climate table moves them, and moving
 * them silently is precisely what must not happen again.
 *
 * When one of these goes red the fix is never the number alone. The number and
 * the sentence that quotes it are one claim, and both ends move together - or
 * the seed does.
 */
interface CorridorClaim {
  /** Town ids at each end - the straight line a briefing quotes. */
  readonly from: number;
  readonly to: number;
  /** Straight-line distance, one decimal. [tiles] */
  readonly distance: number;
  /** Height levels climbed AND fallen along it. [levels] */
  readonly climb: number;
  /** Water tiles crossed. [tiles] */
  readonly water: number;
  /** Highest minus lowest level on the line. [levels] */
  readonly levels: number;
}

interface WorldClaim {
  /** Towns at 8,000 or more, and at 2,500 or more. Exact counts. */
  readonly citiesAt8000: number;
  readonly townsAt2500: number;
  /** Industries on the map. Exact. */
  readonly industries: number;
  /** Land masses that carry at least one town. Exact. */
  readonly inhabitedLandmasses: number;
  /** Towns a caption or briefing names: id, name, starting population. */
  readonly towns: readonly (readonly [number, string, number])[];
  /** Corridors a briefing quotes a distance or a gradient for. */
  readonly corridors?: readonly CorridorClaim[];
  /** Industry types a briefing counts. */
  readonly industriesOfType?: readonly (readonly [IndustryType, number])[];
  /** Tiles per INHABITED land mass, largest first - the archipelago claim. */
  readonly landmassTiles?: readonly number[];
  /** Each coal mine's nearest power station, ascending. [tiles] */
  readonly nearestPlantTiles?: readonly number[];
  /** A cargo the briefing says the map cannot burn. */
  readonly cargoWithoutAcceptor?: Cargo;
}

const SCENARIO_WORLD_CLAIMS: Readonly<Record<string, WorldClaim>> = {
  // "Zwei Staedte zu 8.000 Einwohnern, 29 Tiles auseinander, drei Hoehenstufen
  // dazwischen - flacher wird es nicht."
  speedrun: {
    citiesAt8000: 2,
    townsAt2500: 12,
    industries: 12,
    inhabitedLandmasses: 1,
    towns: [
      [5, 'Nieder-Kaisershofen', 8_000],
      [18, 'Haselstadt', 8_000],
    ],
    corridors: [{ from: 5, to: 18, distance: 29.4, climb: 3, water: 0, levels: 3 }],
  },
  // "Acht Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab 2.500 ...
  // Nieder-Weidengrund und Kaiserskirchen trennen 33 Tiles, Rosenburg liegt
  // weitere 37 dahinter, Ahorngrund noch einmal 30."
  passagiernetz: {
    citiesAt8000: 8,
    townsAt2500: 17,
    industries: 10,
    inhabitedLandmasses: 1,
    towns: [
      [17, 'Nieder-Weidengrund', 8_000],
      [16, 'Kaiserskirchen', 8_000],
      [18, 'Rosenburg', 8_000],
      [5, 'Ahorngrund', 8_000],
    ],
    corridors: [
      { from: 17, to: 16, distance: 33.4, climb: 9, water: 0, levels: 4 },
      { from: 16, to: 18, distance: 36.9, climb: 7, water: 0, levels: 3 },
      { from: 18, to: 5, distance: 30.0, climb: 7, water: 0, levels: 2 },
    ],
  },
  // "Vier Kohlegruben, zwei Kraftwerke ... 57, 59, 70 und 106 Tiles."
  frachtrausch: {
    citiesAt8000: 3,
    townsAt2500: 11,
    industries: 12,
    inhabitedLandmasses: 1,
    towns: [],
    industriesOfType: [
      [IndustryType.CoalMine, 4],
      [IndustryType.PowerPlant, 2],
    ],
    nearestPlantTiles: [57, 59, 70, 106],
  },
  // "Zwischen Silberheim und Ulmenburg liegen 60 Tiles Luftlinie - und elf
  // Hoehenstufen, 88 Meter, dazu acht Tiles Wasser." Plus the reason the
  // tonnage goal here counts passengers: nothing on this map burns coal.
  gebirgslogistik: {
    citiesAt8000: 3,
    townsAt2500: 16,
    industries: 2,
    inhabitedLandmasses: 2,
    towns: [
      [3, 'Silberheim', 8_000],
      [18, 'Ulmenburg', 2_500],
    ],
    corridors: [{ from: 3, to: 18, distance: 59.5, climb: 27, water: 8, levels: 11 }],
    industriesOfType: [[IndustryType.CoalMine, 2]],
    cargoWithoutAcceptor: Cargo.Coal,
  },
  // "Sandenheim ... liegt auf einer Insel. Neu-Lindenried ... liegt 52 Tiles
  // entfernt auf dem Festland. Dazwischen ist offenes Meer."
  inselhuepfen: {
    citiesAt8000: 2,
    townsAt2500: 12,
    industries: 7,
    inhabitedLandmasses: 3,
    towns: [
      [23, 'Neu-Lindenried', 8_000],
      [8, 'Sandenheim', 8_000],
    ],
    corridors: [{ from: 23, to: 8, distance: 51.6, climb: 13, water: 21, levels: 5 }],
    landmassTiles: [45_084, 252, 27],
  },
  // "Sieben Grossstaedte, drei Bauernhoefe, drei Lebensmittelwerke."
  wiederaufbau: {
    citiesAt8000: 7,
    townsAt2500: 15,
    industries: 13,
    inhabitedLandmasses: 1,
    towns: [[32, 'Erlenbach', 8_000]],
    industriesOfType: [
      [IndustryType.Farm, 3],
      [IndustryType.FoodFactory, 3],
    ],
  },
  // "Neun Staedte zu 8.000 Einwohnern, elf Industrien, drei Konkurrenten."
  ratsdiplomatie: {
    citiesAt8000: 9,
    townsAt2500: 15,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [[16, 'Falkenheim', 8_000]],
  },
  // "Wueste, zehn Industrien, zwei Grossstaedte."
  ueberleben: {
    citiesAt8000: 2,
    townsAt2500: 15,
    industries: 10,
    inhabitedLandmasses: 1,
    towns: [
      [8, 'Sandenwerder', 8_000],
      [13, 'Hinter-Falkenrode', 8_000],
    ],
  },
};

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

  it('gives the survival scenario every rule the game has', () => {
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
    expect(worldOf(scenario).companies).toHaveLength(5);
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

// -------------------------------------------- the claims, pinned (D-197)

describe('every load-bearing claim a briefing makes is true of its world', () => {
  it('covers all eight, so a ninth scenario cannot slip in unclaimed', () => {
    const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    expect(Object.keys(SCENARIO_WORLD_CLAIMS).sort(byName)).toEqual(
      SHIPPED_SCENARIOS.map((scenario) => scenario.id).sort(byName),
    );
  });

  for (const scenario of SHIPPED_SCENARIOS) {
    it(`${scenario.id} holds every figure its briefing quotes`, () => {
      const claim = SCENARIO_WORLD_CLAIMS[scenario.id]!;
      const world = worldOf(scenario);
      const at = (what: string): string => `${scenario.id}: ${what}`;

      expect(world.towns.filter((town) => town.population >= 8_000).length, at('cities')).toBe(
        claim.citiesAt8000,
      );
      expect(world.towns.filter((town) => town.population >= 2_500).length, at('towns')).toBe(
        claim.townsAt2500,
      );
      expect(world.industries.length, at('industries')).toBe(claim.industries);

      const inhabited = new Set<number>();
      for (let id = 0; id < world.towns.length; id++) inhabited.add(landmassOfTown(world, id));
      expect(inhabited.size, at('inhabited land masses')).toBe(claim.inhabitedLandmasses);

      // A named town is a town a CAPTION or a briefing calls by name; the id
      // is what the descriptor addresses, so the pair has to hold together.
      for (const [id, name, population] of claim.towns) {
        const town = world.towns[id];
        expect(town, at(`town ${id}`)).toBeDefined();
        expect(town!.name, at(`town ${id} name`)).toBe(name);
        expect(town!.population, at(`${name} population`)).toBe(population);
      }

      for (const [type, count] of claim.industriesOfType ?? []) {
        expect(industryCount(world, type), at(`industries of type ${type}`)).toBe(count);
      }

      for (const line of claim.corridors ?? []) {
        const measured = corridor(world, line.from, line.to);
        const where = at(`corridor ${line.from}->${line.to}`);
        expect(Math.round(measured.distance * 10) / 10, `${where} distance`).toBe(line.distance);
        expect(measured.climb, `${where} climb`).toBe(line.climb);
        expect(measured.water, `${where} water`).toBe(line.water);
        expect(measured.maxH - measured.minH, `${where} levels`).toBe(line.levels);
      }

      if (claim.landmassTiles !== undefined) {
        const sizes = new Map<number, number>();
        const map = world.map;
        for (let i = 0; i < map.landmassId.length; i++) {
          const id = map.landmassId[i]!;
          if (id < 0 || !inhabited.has(id)) continue;
          sizes.set(id, (sizes.get(id) ?? 0) + 1);
        }
        expect(
          [...sizes.values()].sort((a, b) => b - a),
          at('inhabited land mass sizes'),
        ).toEqual([...claim.landmassTiles]);
      }

      if (claim.nearestPlantTiles !== undefined) {
        const mines = world.industries.filter((one) => one.type === IndustryType.CoalMine);
        const plants = world.industries.filter((one) => one.type === IndustryType.PowerPlant);
        const nearest = mines
          .map((mine) =>
            Math.round(
              Math.min(...plants.map((plant) => Math.hypot(mine.x - plant.x, mine.y - plant.y))),
            ),
          )
          .sort((a, b) => a - b);
        expect(nearest, at('nearest plant per mine')).toEqual([...claim.nearestPlantTiles]);
      }

      if (claim.cargoWithoutAcceptor !== undefined) {
        // Gebirgslogistik counts passengers rather than coal, and the reason is
        // a property of its world: at that climate the map grows coal mines and
        // nothing that burns their output. A map that grew an acceptor would
        // make the doc comment's explanation false.
        expect(
          hasAcceptor(world, claim.cargoWithoutAcceptor),
          at(`acceptor of cargo ${claim.cargoWithoutAcceptor}`),
        ).toBe(false);
      }
    });
  }

  it('leaves the two islands unreachable by land, which is the whole scenario', () => {
    const world = worldOf(byId('inselhuepfen'));
    expect(landmassOfTown(world, 23)).not.toBe(landmassOfTown(world, 8));
  });

  it('keeps the mountain pair on ONE land mass, so the goal is a railway', () => {
    const world = worldOf(byId('gebirgslogistik'));
    expect(landmassOfTown(world, 3)).toBe(landmassOfTown(world, 18));
  });

  it('cannot have its population goal waited out', () => {
    // The one claim in the catalogue that is about the world's FUTURE rather
    // than about the world as generated: "unserved, Erlenbach would reach
    // 10,574 by the end of 1975 - the 11,000 has to be carried in." Played
    // here to that exact deadline with no player and no competitor, because a
    // threshold under the passive line is a medal the scenario gives away.
    //
    // Wiederaufbau carries the cheapest such world (no AI companies at all),
    // and the temperate passive growth curve is ONE curve: Rats-Diplomatie's
    // Falkenheim is the same 8,000 in the same climate and reaches the same
    // figure - measured, and recorded in the catalogue rather than replayed
    // here, because its three competitors cost fifty times the wall clock.
    const scenario = byId('wiederaufbau');
    const goal = scenario.goals.find((one) => one.spec.kind === GoalKind.TownPopulationReach)!;
    const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, 1)));
    const queue = new CommandQueue();
    while (world.tick < goal.spec.bronzeTick) world.step(queue, null);

    expect(world.tick).toBe(26 * TICKS_PER_YEAR);
    expect(world.towns[32]!.population).toBe(10_574);
    expect(goal.spec.threshold).toBeGreaterThan(world.towns[32]!.population);
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
