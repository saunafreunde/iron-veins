import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_ID,
  CAMPAIGN_SCENARIOS,
  CAMPAIGN_STAGES,
  CAMPAIGN_TITLE,
  campaignPrerequisitesOf,
  campaignScenarioById,
  isCampaignStageUnlocked,
  unlockedCampaignStages,
} from '../../src/scenarios/campaign';
import { newGameOptionsOf, scenarioMetaOf, type ShippedScenario } from '../../src/scenarios/types';
import { scenarioYearOf } from '../../src/scenarios/years';
import { Cargo, isPassengerClass } from '../../src/sim/cargo/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import {
  CENTS_PER_EURO,
  Difficulty,
  MAP_SIZES,
  MapClimate,
  MapPreset,
  SCENARIO_TEXT_MAX_CHARS,
  START_CAPITAL_CT,
  START_YEAR_PRESETS,
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
import { numeralsIn, unrecognisedNumeralWords } from './briefingNumerals';
import { placeNamesIn } from './briefingPlaceNames';

/**
 * The campaign "Eisenadern" of SPEC2 M24 (D-254).
 *
 * The twelve stages are ordinary shipped scenarios, so this file holds them to
 * everything `shippedScenarios.spec.ts` holds the eight of M17 to - the world
 * claims of D-197, the briefing numerals of D-198, the place names of D-199 -
 * plus the two things a CAMPAIGN adds:
 *
 *  - **the chain**: an ordered list and a set of unlock edges, asserted to be a
 *    graph with one root, nothing unreachable and no cycle.
 *  - **the competitor probe**: what each stage's opponents actually own after
 *    six game years, pinned exactly. That guard exists because the AI is silent
 *    at start year 1850 and partly silent at 1880 (D-250), so a campaign
 *    spanning 1850-2050 could very easily ship a scenario whose stated
 *    difficulty rests on opponents that never move. Six stages therefore ship
 *    SOLO and the probe shows what would happen if they did not; six ship with
 *    competitors and the probe shows at least one of them running a line.
 */

const COMPANY = 'Eisenadern-Testbahn';
const GAME_VERSION = '0.1.0';

/** The two cuts every "cities" and "towns" count in this file is taken at. */
const CITY_POPULATION = 8_000;
const TOWN_POPULATION = 2_500;

/**
 * How long a competitor probe plays. [game years]
 *
 * Six, because that is the window D-250 measured the 1850 silence over, and a
 * campaign stage whose opponents have done nothing by their sixth year is a
 * stage the player meets alone whatever the briefing says.
 */
const PROBE_YEARS = 6;

/** Worlds are expensive; each stage's is generated once for the whole file. */
const worlds = new Map<string, World>();
function worldOf(scenario: ShippedScenario): World {
  const cached = worlds.get(scenario.id);
  if (cached !== undefined) return cached;
  const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, 1)));
  worlds.set(scenario.id, world);
  return world;
}

function byId(id: string): ShippedScenario {
  const scenario = campaignScenarioById(id);
  expect(scenario, `stage ${id}`).not.toBeNull();
  return scenario!;
}

// ------------------------------------------------------- the claims (D-197)

type CorridorEnd = { readonly town: number } | { readonly industry: number };
const atTown = (id: number): CorridorEnd => ({ town: id });
const atIndustry = (id: number): CorridorEnd => ({ industry: id });

interface CorridorClaim {
  readonly from: CorridorEnd;
  readonly to: CorridorEnd;
  /** Straight-line distance, one decimal. [tiles] */
  readonly distance: number;
  /** Height levels climbed AND fallen along it. [levels] */
  readonly climb: number;
  /** Water tiles crossed. [tiles] */
  readonly water: number;
  /** Highest minus lowest level on the line. [levels] */
  readonly levels: number;
  /** The lowest and the highest level, where a sentence names them. [levels] */
  readonly heights?: readonly [number, number];
  /**
   * Set where a briefing calls this pair the NEAREST one of its kind: no pair
   * of industries of these two types stands closer on this map.
   *
   * The distance alone is not that claim, and stage 11 is why the flag exists
   * (D-256): its corridor was pinned at 32.2 tiles and measured true, its
   * briefing said "from the nearest ore mine to the nearest steel mill", and
   * the nearest of the sixteen ore-to-steel pairs on that map is 28.3. A pinned
   * number can be a true measurement of the wrong pair - which is D-198's
   * Frachtrausch finding ("three of the four" was wrong by one) one claim type
   * along. Seven of the twelve stages make this claim and it now holds on all
   * seven; the one that did not is the one that was corrected.
   */
  readonly nearest?: true;
  /**
   * Set where a briefing calls this the SHORTEST CHAIN the map offers: no pair
   * of industries where one makes what the other takes stands closer, whatever
   * their types. Only stage 02 says it, and it is measured true.
   */
  readonly shortestChain?: true;
}

/**
 * What the competitors of a stage own after {@link PROBE_YEARS} game years.
 *
 * `added` is how many competitors the probe puts into the world ON TOP of the
 * scenario's own, which is zero for every contested stage and two for every
 * solo one: "the AI would do nothing here" is a claim about a world with an AI
 * in it, and it cannot be measured on a world that has none (the D-198 rule for
 * `passiveGrowth`, one subsystem along).
 */
interface CompetitorClaim {
  readonly added: number;
  /** Per competitor, in company-id order: [stations owned, vehicles alive]. */
  readonly own: readonly (readonly [number, number])[];
}

interface PassiveGrowthClaim {
  readonly townId: number;
  /** [whole game years played, population at that tick]. Ascending. */
  readonly samples: readonly (readonly [number, number])[];
}

interface WorldClaim {
  readonly townsTotal: number;
  readonly citiesAt8000: number;
  readonly townsAt2500: number;
  readonly industries: number;
  readonly inhabitedLandmasses: number;
  /** Towns a caption or briefing names: id, name, starting population. */
  readonly towns: readonly (readonly [number, string, number])[];
  /** The towns the BRIEFING names, in the order it names them (D-199). */
  readonly briefingTowns: readonly number[];
  readonly corridors?: readonly CorridorClaim[];
  readonly industriesOfType?: readonly (readonly [IndustryType, number])[];
  /** Tiles per INHABITED land mass, largest first. */
  readonly landmassTiles?: readonly number[];
  readonly passiveGrowth?: PassiveGrowthClaim;
  readonly competitors: CompetitorClaim;
}

/**
 * Every world property the twelve briefings rest on, measured by generating the
 * world and reading it - the D-197 bargain, for the campaign.
 *
 * Pinned exactly rather than banded, because the generator is deterministic: a
 * changed seed, a changed preset or a changed mapgen constant moves them, and
 * moving them silently is what must not happen. When one goes red the fix is
 * never the number alone - the number and the sentence that quotes it are one
 * claim.
 */
const CAMPAIGN_WORLD_CLAIMS: Readonly<Record<string, WorldClaim>> = {
  'eisenadern-01': {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 13,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [
      [3, 'West-Sandenwerder', 2_500],
      [26, 'Birkenbach', 2_500],
    ],
    briefingTowns: [3, 26],
    corridors: [{ from: atTown(3), to: atTown(26), distance: 25.3, climb: 8, water: 0, levels: 6 }],
    competitors: {
      added: 2,
      own: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  'eisenadern-02': {
    townsTotal: 40,
    citiesAt8000: 3,
    townsAt2500: 10,
    industries: 11,
    inhabitedLandmasses: 2,
    towns: [],
    briefingTowns: [],
    corridors: [
      {
        from: atIndustry(6),
        to: atIndustry(10),
        distance: 23,
        climb: 1,
        water: 0,
        levels: 1,
        nearest: true,
        shortestChain: true,
      },
    ],
    landmassTiles: [48_648, 305],
    competitors: {
      added: 2,
      own: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  'eisenadern-03': {
    townsTotal: 40,
    citiesAt8000: 3,
    townsAt2500: 13,
    industries: 8,
    inhabitedLandmasses: 1,
    towns: [
      [0, 'Keswick', 2_500],
      [35, 'Caldcombe', 2_500],
    ],
    briefingTowns: [0, 35],
    corridors: [{ from: atTown(0), to: atTown(35), distance: 30, climb: 10, water: 0, levels: 3 }],
    competitors: {
      added: 2,
      own: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  'eisenadern-04': {
    townsTotal: 40,
    citiesAt8000: 3,
    townsAt2500: 14,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [
      [36, 'Quillgate', 8_000],
      [5, 'East-Oakfield', 2_500],
    ],
    briefingTowns: [36, 5],
    corridors: [
      {
        from: atTown(36),
        to: atTown(5),
        distance: 37.9,
        climb: 1,
        water: 0,
        levels: 0,
        heights: [15, 15],
      },
    ],
    // D-250's "partly at 1880", in this campaign's own world: two competitors
    // added to a stage that ships with none build four and three stations in
    // six game years and crew NEITHER of them.
    competitors: {
      added: 2,
      own: [
        [4, 0],
        [3, 0],
      ],
    },
  },
  'eisenadern-05': {
    townsTotal: 40,
    citiesAt8000: 5,
    townsAt2500: 13,
    industries: 10,
    inhabitedLandmasses: 1,
    towns: [[6, 'Kupferfurt', 8_000]],
    briefingTowns: [6],
    corridors: [
      {
        from: atIndustry(3),
        to: atIndustry(6),
        distance: 24.7,
        climb: 1,
        water: 0,
        levels: 1,
        nearest: true,
      },
    ],
    industriesOfType: [[IndustryType.Farm, 4]],
    passiveGrowth: {
      townId: 6,
      samples: [
        [30, 7_280],
        [31, 7_256],
      ],
    },
    competitors: {
      added: 2,
      own: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  'eisenadern-06': {
    townsTotal: 40,
    citiesAt8000: 4,
    townsAt2500: 13,
    industries: 5,
    inhabitedLandmasses: 2,
    towns: [
      [33, 'Quillmouth', 8_000],
      [21, 'Yarrowbridge', 2_500],
    ],
    briefingTowns: [33, 21],
    corridors: [
      { from: atTown(33), to: atTown(21), distance: 28.2, climb: 15, water: 0, levels: 7 },
    ],
    industriesOfType: [[IndustryType.Forestry, 3]],
    competitors: {
      added: 2,
      own: [
        [0, 0],
        [0, 0],
      ],
    },
  },
  'eisenadern-07': {
    townsTotal: 40,
    citiesAt8000: 1,
    townsAt2500: 13,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [],
    briefingTowns: [],
    corridors: [
      {
        from: atIndustry(5),
        to: atIndustry(2),
        distance: 16.1,
        climb: 5,
        water: 0,
        levels: 1,
        nearest: true,
      },
      {
        from: atIndustry(10),
        to: atIndustry(2),
        distance: 8.1,
        climb: 1,
        water: 0,
        levels: 1,
        nearest: true,
      },
    ],
    industriesOfType: [
      [IndustryType.IronOreMine, 3],
      [IndustryType.SteelMill, 2],
    ],
    competitors: {
      added: 0,
      own: [
        [2, 6],
        [0, 0],
      ],
    },
  },
  'eisenadern-08': {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 11,
    industries: 13,
    inhabitedLandmasses: 1,
    towns: [
      [9, 'Brackcombe', 8_000],
      [11, 'Far-Bramwick', 2_500],
    ],
    briefingTowns: [9, 11],
    corridors: [
      {
        from: atIndustry(11),
        to: atIndustry(8),
        distance: 18.4,
        climb: 6,
        water: 1,
        levels: 6,
        nearest: true,
      },
      { from: atTown(9), to: atTown(11), distance: 40.8, climb: 13, water: 0, levels: 7 },
    ],
    industriesOfType: [[IndustryType.PowerPlant, 4]],
    competitors: {
      added: 0,
      own: [
        [4, 6],
        [0, 0],
      ],
    },
  },
  'eisenadern-09': {
    townsTotal: 40,
    citiesAt8000: 5,
    townsAt2500: 15,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [],
    briefingTowns: [],
    corridors: [
      {
        from: atIndustry(9),
        to: atIndustry(8),
        distance: 14,
        climb: 0,
        water: 0,
        levels: 0,
        nearest: true,
      },
    ],
    industriesOfType: [
      [IndustryType.PowerPlant, 4],
      [IndustryType.CoalMine, 3],
    ],
    competitors: {
      added: 0,
      own: [
        [9, 6],
        [0, 0],
      ],
    },
  },
  'eisenadern-10': {
    townsTotal: 40,
    citiesAt8000: 6,
    townsAt2500: 13,
    industries: 17,
    inhabitedLandmasses: 1,
    towns: [
      [4, 'Falkenau', 8_000],
      [24, 'Neu-Reichenhofen', 2_500],
    ],
    briefingTowns: [4, 24],
    corridors: [{ from: atTown(4), to: atTown(24), distance: 25, climb: 4, water: 0, levels: 2 }],
    competitors: {
      added: 0,
      own: [
        [3, 12],
        [0, 0],
      ],
    },
  },
  'eisenadern-11': {
    townsTotal: 40,
    citiesAt8000: 4,
    townsAt2500: 17,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [],
    briefingTowns: [],
    corridors: [
      {
        from: atIndustry(4),
        to: atIndustry(3),
        distance: 28.3,
        climb: 4,
        water: 0,
        levels: 2,
        nearest: true,
      },
    ],
    industriesOfType: [
      [IndustryType.IronOreMine, 4],
      [IndustryType.SteelMill, 4],
      [IndustryType.CoalMine, 2],
    ],
    competitors: {
      added: 0,
      own: [
        [3, 12],
        [0, 0],
      ],
    },
  },
  'eisenadern-12': {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 7,
    industries: 13,
    inhabitedLandmasses: 1,
    towns: [
      [9, 'Gorsebourne', 8_000],
      [24, 'Far-Gorsestead', 8_000],
    ],
    briefingTowns: [9, 24],
    corridors: [
      {
        from: atIndustry(10),
        to: atIndustry(2),
        distance: 28.1,
        climb: 7,
        water: 1,
        levels: 4,
        nearest: true,
      },
      { from: atTown(9), to: atTown(24), distance: 71.1, climb: 15, water: 0, levels: 5 },
    ],
    industriesOfType: [[IndustryType.Refinery, 3]],
    // Re-measured in D-257: this is the one stage of the twelve whose probe
    // moved when the Hard row of `DIFFICULTY_AI_TRAITS` stopped carrying a
    // chain look-ahead of two. It moved UPWARDS - 4/0, 2/6, 0/0 before - so
    // the stage's briefing quotes four stations and twelve vehicles now.
    competitors: {
      added: 0,
      own: [
        [4, 6],
        [4, 12],
        [2, 6],
      ],
    },
  },
};

// --------------------------------------------- the briefings, bound (D-198)

interface BriefingFigure {
  readonly what: string;
  readonly of?: (claim: WorldClaim, scenario: ShippedScenario) => number;
  readonly value?: number;
  readonly why?: string;
}

function pinned(
  what: string,
  of: (claim: WorldClaim, scenario: ShippedScenario) => number,
): BriefingFigure {
  return { what, of };
}

function allowed(what: string, value: number, why: string): BriefingFigure {
  return { what, value, why };
}

function figureValue(figure: BriefingFigure, claim: WorldClaim, scenario: ShippedScenario): number {
  return figure.of !== undefined ? figure.of(claim, scenario) : figure.value!;
}

/** The starting capital this stage's difficulty grants, in whole euro. */
function startCapitalEuro(scenario: ShippedScenario): number {
  return START_CAPITAL_CT[scenario.rules.difficulty]! / CENTS_PER_EURO;
}

/** The threshold of this stage's goal of `kind` - exactly one may exist. */
function goalOfKind(scenario: ShippedScenario, kind: GoalKind): ShippedScenario['goals'][number] {
  const found = scenario.goals.filter((goal) => goal.spec.kind === kind);
  expect(found, `${scenario.id}: goals of kind ${kind}`).toHaveLength(1);
  return found[0]!;
}

/** A corridor's distance as a briefing quotes it: whole tiles. */
function corridorTiles(claim: WorldClaim, at: number): number {
  return Math.round(claim.corridors![at]!.distance);
}

/** How many industries of `type` the claim pins. */
function industriesOfType(claim: WorldClaim, type: IndustryType): number {
  const found = (claim.industriesOfType ?? []).filter((entry) => entry[0] === type);
  expect(found, `claimed industries of type ${type}`).toHaveLength(1);
  return found[0]![1];
}

/**
 * The competitor a briefing means by "one of them": the one with the biggest
 * fleet, ties broken by company id.
 */
function bestCompetitor(claim: WorldClaim): readonly [number, number] {
  let best = claim.competitors.own[0]!;
  for (const row of claim.competitors.own) {
    if (row[1] > best[1]) best = row;
  }
  return best;
}

const CAMPAIGN_BRIEFING_FIGURES: Readonly<Record<string, readonly BriefingFigure[]>> = {
  'eisenadern-01': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('towns on the map', (claim) => claim.townsTotal),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('industries', (claim) => claim.industries),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned('height levels climbed between them', (claim) => claim.corridors![0]!.climb),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
  ],
  'eisenadern-02': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('industries', (claim) => claim.industries),
    pinned('inhabited land masses', (claim) => claim.inhabitedLandmasses),
    pinned('tiles of the smaller land mass', (claim) => claim.landmassTiles![1]!),
    pinned('tiles from the forestry to the sawmill', (claim) => corridorTiles(claim, 0)),
  ],
  'eisenadern-03': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned('height levels climbed between them', (claim) => claim.corridors![0]!.climb),
    pinned('the year the solvency goal runs to', (_claim, scenario) =>
      scenarioYearOf(
        goalOfKind(scenario, GoalKind.SurviveUntil).spec.threshold,
        scenario.rules.startYear,
      ),
    ),
  ],
  'eisenadern-04': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned('height levels climbed between them', (claim) => claim.corridors![0]!.climb),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('industries', (claim) => claim.industries),
  ],
  'eisenadern-05': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('cities of 8,000', (claim) => claim.citiesAt8000),
    pinned('the population a city starts at', () => CITY_POPULATION),
    pinned('industries', (claim) => claim.industries),
    pinned('farms among them', (claim) => industriesOfType(claim, IndustryType.Farm)),
    pinned('tiles from the farm to the food factory', (claim) => corridorTiles(claim, 0)),
    pinned(
      'inhabitants the population goal asks for',
      (_claim, scenario) => goalOfKind(scenario, GoalKind.TownPopulationReach).spec.threshold,
    ),
    pinned('the year that goal runs out', (_claim, scenario) =>
      scenarioYearOf(
        goalOfKind(scenario, GoalKind.TownPopulationReach).spec.bronzeTick,
        scenario.rules.startYear,
      ),
    ),
    pinned(
      'what an unserved Kupferfurt has fallen to by then',
      (claim) => claim.passiveGrowth!.samples[claim.passiveGrowth!.samples.length - 1]![1],
    ),
  ],
  'eisenadern-06': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('forestries among them', (claim) => industriesOfType(claim, IndustryType.Forestry)),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned('height levels climbed between them', (claim) => claim.corridors![0]!.climb),
    allowed(
      'the SPEC.md section the route costs come from',
      8.4,
      'a cross-reference into the specification, not a quantity - it is the ' +
        'name of the two rules the stage switches on',
    ),
  ],
  'eisenadern-07': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('iron ore mines', (claim) => industriesOfType(claim, IndustryType.IronOreMine)),
    pinned('steel mills', (claim) => industriesOfType(claim, IndustryType.SteelMill)),
    pinned('tiles from the coal mine to the steel mill', (claim) => corridorTiles(claim, 0)),
    pinned('tiles from the ore mine to the same works', (claim) => corridorTiles(claim, 1)),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
  ],
  'eisenadern-08': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('power stations among them', (claim) =>
      industriesOfType(claim, IndustryType.PowerPlant),
    ),
    pinned('tiles from the coal mine to the power station', (claim) => corridorTiles(claim, 0)),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 1)),
    pinned('height levels climbed between them', (claim) => claim.corridors![1]!.climb),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
  ],
  'eisenadern-09': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('power stations among them', (claim) =>
      industriesOfType(claim, IndustryType.PowerPlant),
    ),
    pinned('coal mines among them', (claim) => industriesOfType(claim, IndustryType.CoalMine)),
    pinned('tiles from the mine to the steel mill', (claim) => corridorTiles(claim, 0)),
    pinned('cities of 8,000', (claim) => claim.citiesAt8000),
    pinned('the population a city starts at', () => CITY_POPULATION),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
  ],
  'eisenadern-10': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('cities of 8,000', (claim) => claim.citiesAt8000),
    pinned('the population a city starts at', () => CITY_POPULATION),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
  ],
  'eisenadern-11': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    pinned('industries', (claim) => claim.industries),
    pinned('iron ore mines', (claim) => industriesOfType(claim, IndustryType.IronOreMine)),
    pinned('steel mills', (claim) => industriesOfType(claim, IndustryType.SteelMill)),
    pinned('coal mines', (claim) => industriesOfType(claim, IndustryType.CoalMine)),
    pinned('tiles from the ore mine to the steel mill', (claim) => corridorTiles(claim, 0)),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
  ],
  'eisenadern-12': [
    pinned('the year the stage begins in', (_claim, scenario) => scenario.rules.startYear),
    allowed(
      'the SPEC.md section the route costs come from',
      8.4,
      'a cross-reference into the specification, not a quantity',
    ),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('industries', (claim) => claim.industries),
    pinned('refineries among them', (claim) => industriesOfType(claim, IndustryType.Refinery)),
    pinned('tiles from the well to the refinery', (claim) => corridorTiles(claim, 0)),
    pinned('tiles between the two towns', (claim) => corridorTiles(claim, 1)),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('game years the competitor probe plays', () => PROBE_YEARS),
    pinned('stations the busiest competitor holds by then', (claim) => bestCompetitor(claim)[0]),
    pinned('vehicles it runs by then', (claim) => bestCompetitor(claim)[1]),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
  ],
};

// ------------------------------------------------------------------ helpers

function placeOf(world: World, end: CorridorEnd): { x: number; y: number } {
  if ('town' in end) {
    const town = world.towns[end.town];
    expect(town, `town ${end.town}`).toBeDefined();
    return town!;
  }
  const industry = world.industries[end.industry];
  expect(industry, `industry ${end.industry}`).toBeDefined();
  return industry!;
}

function endName(end: CorridorEnd): string {
  return 'town' in end ? `town ${end.town}` : `industry ${end.industry}`;
}

/** Height climbed and fallen along the straight line between two places. */
function corridor(
  world: World,
  from: CorridorEnd,
  to: CorridorEnd,
): { climb: number; minH: number; maxH: number; water: number; distance: number } {
  const map = world.map;
  const a = placeOf(world, from);
  const b = placeOf(world, to);
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

/**
 * The shortest straight line between an industry of `from`'s type and one of
 * `to`'s type - the measurement behind {@link CorridorClaim.nearest}.
 *
 * It asks the map, not the claim: "the nearest ore mine to the nearest steel
 * mill" is a statement about every pair on the map, and a pinned distance
 * between two named industries cannot say it (D-256).
 */
function nearestOfTypes(world: World, from: CorridorEnd, to: CorridorEnd): number {
  expect('industry' in from && 'industry' in to, 'a nearest claim addresses industries').toBe(true);
  const fromType = world.industries[(from as { industry: number }).industry]!.type;
  const toType = world.industries[(to as { industry: number }).industry]!.type;
  let best = Infinity;
  for (const a of world.industries) {
    if (a.type !== fromType) continue;
    for (const b of world.industries) {
      if (b.type !== toType || a === b) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < best) best = distance;
    }
  }
  return best;
}

/**
 * The shortest straight line between any industry and one that takes what it
 * makes - the measurement behind {@link CorridorClaim.shortestChain}.
 */
function shortestChainTiles(world: World): number {
  let best = Infinity;
  for (const a of world.industries) {
    const outputs = industrySpec(a.type).outputs;
    for (const b of world.industries) {
      if (a === b) continue;
      const inputs = industrySpec(b.type).inputs;
      if (!outputs.some((cargo) => inputs.includes(cargo))) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < best) best = distance;
    }
  }
  return best;
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

function hasProducer(world: World, cargo: Cargo): boolean {
  if (isPassengerClass(cargo) || cargo === Cargo.Mail) return world.towns.length > 0;
  for (const industry of world.industries) {
    if (industrySpec(industry.type).outputs.includes(cargo)) return true;
  }
  return false;
}

function hasAcceptor(world: World, cargo: Cargo): boolean {
  if (isPassengerClass(cargo) || cargo === Cargo.Mail) return world.towns.length > 0;
  if (TOWN_CARGO.includes(cargo)) return world.towns.length > 0;
  for (const industry of world.industries) {
    if (industrySpec(industry.type).inputs.includes(cargo)) return true;
  }
  return false;
}

/** A total string order - `sort()` without one is engine dependent (law #3). */
const sorted = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** What every competitor of a played world owns: [stations, vehicles] per id. */
function competitorHoldings(world: World): readonly (readonly [number, number])[] {
  const rows: (readonly [number, number])[] = [];
  for (let id = 1; id < world.companies.length; id++) {
    let stations = 0;
    for (const station of world.stations) {
      if (station !== null && station.ownerId === id) stations++;
    }
    let vehicles = 0;
    for (let v = 0; v < world.vehicles.count; v++) {
      if (world.vehicles.alive[v] === 1 && world.vehicles.ownerId[v] === id) vehicles++;
    }
    rows.push([stations, vehicles]);
  }
  return rows;
}

// -------------------------------------------------------------- the chain

describe('the campaign chain', () => {
  it('is twelve stages under one id, in one order', () => {
    expect(CAMPAIGN_ID).toBe('eisenadern');
    expect(CAMPAIGN_TITLE.length).toBeGreaterThan(0);
    expect(CAMPAIGN_SCENARIOS).toHaveLength(12);
    expect(CAMPAIGN_STAGES).toHaveLength(12);
    expect(CAMPAIGN_STAGES.map((stage) => stage.id)).toEqual(
      CAMPAIGN_SCENARIOS.map((scenario) => scenario.id),
    );
    const ids = CAMPAIGN_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of CAMPAIGN_SCENARIOS) {
      expect(campaignScenarioById(scenario.id)).toBe(scenario);
    }
    expect(campaignScenarioById('nothing-like-this')).toBeNull();
  });

  it('points every edge at a stage that exists, and never at itself', () => {
    const ids = new Set(CAMPAIGN_STAGES.map((stage) => stage.id));
    for (const stage of CAMPAIGN_STAGES) {
      expect(new Set(stage.unlocks).size, `${stage.id}: duplicate edge`).toBe(stage.unlocks.length);
      for (const target of stage.unlocks) {
        expect(ids.has(target), `${stage.id} -> ${target}`).toBe(true);
        expect(target, `${stage.id} unlocks itself`).not.toBe(stage.id);
      }
    }
  });

  it('has exactly one root, nothing unreachable and no cycle', () => {
    // The three properties SPEC2 M24's chain has to have, and they are three
    // different failures: a second root is a campaign with two beginnings, an
    // unreachable stage is content nobody can play, and a cycle is a stage that
    // unlocks itself through others.
    const roots = CAMPAIGN_STAGES.filter(
      (stage) => campaignPrerequisitesOf(stage.id).length === 0,
    ).map((stage) => stage.id);
    expect(roots).toEqual(['eisenadern-01']);

    // Reachability: walk forward from the root, iteratively (law #8).
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const target of CAMPAIGN_STAGES.find((stage) => stage.id === id)!.unlocks) {
        if (seen.has(target)) continue;
        seen.add(target);
        queue.push(target);
      }
    }
    expect(sorted([...seen])).toEqual(sorted(CAMPAIGN_STAGES.map((stage) => stage.id)));

    // Acyclicity, proved by a topological sort rather than by inspection: pull
    // stages whose prerequisites are all already pulled, and fail if the pass
    // ever stalls with stages left.
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const stage of CAMPAIGN_STAGES) {
        if (done.has(stage.id)) continue;
        if (!campaignPrerequisitesOf(stage.id).every((one) => done.has(one))) continue;
        done.add(stage.id);
        progress = true;
      }
    }
    expect(sorted([...done])).toEqual(sorted(CAMPAIGN_STAGES.map((stage) => stage.id)));

    // And the reading order IS a topological order, so the screen can list the
    // stages in the order they are meant to be played.
    const rank = new Map(CAMPAIGN_STAGES.map((stage, at) => [stage.id, at]));
    for (const stage of CAMPAIGN_STAGES) {
      for (const target of stage.unlocks) {
        expect(rank.get(target)!, `${stage.id} -> ${target} runs backwards`).toBeGreaterThan(
          rank.get(stage.id)!,
        );
      }
    }
  });

  it('opens exactly the first stage on an empty profile', () => {
    expect(unlockedCampaignStages(new Set())).toEqual(['eisenadern-01']);
    expect(isCampaignStageUnlocked('eisenadern-01', new Set())).toBe(true);
    expect(isCampaignStageUnlocked('eisenadern-02', new Set())).toBe(false);
  });

  it('needs ALL of a joining stage prerequisites, not any of them', () => {
    // Stage 4 joins the two 1850 branches, and "any one of them" would turn a
    // pair of stages into a choice between them.
    expect(campaignPrerequisitesOf('eisenadern-04')).toEqual(['eisenadern-02', 'eisenadern-03']);
    const one = new Set(['eisenadern-01', 'eisenadern-02']);
    expect(isCampaignStageUnlocked('eisenadern-04', one)).toBe(false);
    one.add('eisenadern-03');
    expect(isCampaignStageUnlocked('eisenadern-04', one)).toBe(true);
    expect(unlockedCampaignStages(one)).toEqual([
      'eisenadern-01',
      'eisenadern-02',
      'eisenadern-03',
      'eisenadern-04',
    ]);
  });

  it('opens every stage once every stage is done', () => {
    const all = new Set(CAMPAIGN_STAGES.map((stage) => stage.id));
    expect(unlockedCampaignStages(all)).toEqual(CAMPAIGN_STAGES.map((stage) => stage.id));
  });
});

// --------------------------------------------------------- the definitions

describe('the campaign catalogue', () => {
  it('spans 1850 to 2050 over all four climates', () => {
    // SPEC2 M24's own sentence, as counts: three stages per start year, three
    // per climate, and every one of the five generator presets used at least
    // once - the twelve are meant to be twelve different worlds.
    const years = CAMPAIGN_SCENARIOS.map((one) => one.rules.startYear);
    for (const year of START_YEAR_PRESETS) {
      expect(
        years.filter((one) => one === year),
        `stages starting in ${year}`,
      ).toHaveLength(3);
    }
    expect(Math.min(...years)).toBe(1850);
    const last = CAMPAIGN_SCENARIOS[CAMPAIGN_SCENARIOS.length - 1]!;
    expect(scenarioYearOf(last.toTick, last.rules.startYear)).toBeLessThanOrEqual(2050);

    const climates = CAMPAIGN_SCENARIOS.map((one) => one.rules.climate);
    for (const climate of Object.values(MapClimate)) {
      expect(
        climates.filter((one) => one === climate),
        `stages in climate ${climate}`,
      ).toHaveLength(3);
    }

    const presets = new Set(CAMPAIGN_SCENARIOS.map((one) => one.rules.mapgen!.preset));
    expect(presets.size).toBe(Object.values(MapPreset).length);
  });

  it('states rules the new-game screen could have chosen, and pins them', () => {
    const seeds = new Set<number>();
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const rules = scenario.rules;
      expect(MAP_SIZES, scenario.id).toContain(rules.mapSize);
      expect(Object.values(Difficulty), scenario.id).toContain(rules.difficulty);
      expect(Object.values(MapClimate), scenario.id).toContain(rules.climate);
      expect(START_YEAR_PRESETS, scenario.id).toContain(rules.startYear);
      expect(rules.aiCompanies, scenario.id).toBeGreaterThanOrEqual(0);
      expect(rules.seed, scenario.id).toBeGreaterThan(0);
      seeds.add(rules.seed);

      let previous = -1;
      for (const rule of scenario.lockedRules) {
        const at = SCENARIO_LOCKABLE_RULES.indexOf(rule);
        expect(at, `${scenario.id}: ${rule}`).toBeGreaterThanOrEqual(0);
        expect(at, `${scenario.id}: ${rule} out of order`).toBeGreaterThan(previous);
        previous = at;
      }
      // A campaign stage pins its own era and its own ground: a chain whose
      // stages could be started in another year or on another preset would be
      // twelve briefings over twelve worlds nobody promised.
      for (const rule of ['goals', 'seed', 'startYear', 'mapgen', 'climate'] as const) {
        expect(scenario.lockedRules, `${scenario.id}: ${rule}`).toContain(rule);
      }
    }
    expect(seeds.size, 'every stage its own seed').toBe(CAMPAIGN_SCENARIOS.length);
  });

  it('carries a briefing in BOTH languages, and two different ones', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
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
    const titles = CAMPAIGN_SCENARIOS.map((one) => one.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('orders every medal band and keeps it inside the stage span', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
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
    const used = new Set<number>();
    for (const scenario of CAMPAIGN_SCENARIOS) {
      for (const goal of scenario.goals) used.add(goal.spec.kind);
    }
    expect(used.size).toBe(GOAL_KIND_COUNT);
  });

  it('writes and reads back through the ONE serializer, goals intact', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
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
        expect(loaded.world.goals.kind[at], scenario.id).toBe(scenario.goals[at]!.spec.kind);
        expect(loaded.world.goals.threshold[at], scenario.id).toBe(
          scenario.goals[at]!.spec.threshold,
        );
      }
    }
  });
});

// ------------------------------------------------------- the worlds (D-197)

describe('every load-bearing claim a campaign briefing makes is true of its world', () => {
  it('covers all twelve, so a thirteenth stage cannot slip in unclaimed', () => {
    const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    expect(Object.keys(CAMPAIGN_WORLD_CLAIMS).sort(byName)).toEqual(
      CAMPAIGN_SCENARIOS.map((scenario) => scenario.id).sort(byName),
    );
    expect(Object.keys(CAMPAIGN_BRIEFING_FIGURES).sort(byName)).toEqual(
      CAMPAIGN_SCENARIOS.map((scenario) => scenario.id).sort(byName),
    );
  });

  for (const scenario of CAMPAIGN_SCENARIOS) {
    it(`${scenario.id} holds every figure its briefing quotes`, () => {
      const claim = CAMPAIGN_WORLD_CLAIMS[scenario.id]!;
      const world = worldOf(scenario);
      const at = (what: string): string => `${scenario.id}: ${what}`;

      expect(world.towns.length, at('towns in total')).toBe(claim.townsTotal);
      expect(
        world.towns.filter((town) => town.population >= CITY_POPULATION).length,
        at('cities'),
      ).toBe(claim.citiesAt8000);
      expect(
        world.towns.filter((town) => town.population >= TOWN_POPULATION).length,
        at('towns'),
      ).toBe(claim.townsAt2500);
      expect(claim.citiesAt8000, at('cities among the towns')).toBeLessThanOrEqual(
        claim.townsAt2500,
      );
      expect(claim.townsAt2500, at('towns among all towns')).toBeLessThanOrEqual(claim.townsTotal);
      expect(world.industries.length, at('industries')).toBe(claim.industries);

      const inhabited = new Set<number>();
      for (let id = 0; id < world.towns.length; id++) inhabited.add(landmassOfTown(world, id));
      expect(inhabited.size, at('inhabited land masses')).toBe(claim.inhabitedLandmasses);

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
        const where = at(`corridor ${endName(line.from)}->${endName(line.to)}`);
        expect(Math.round(measured.distance * 10) / 10, `${where} distance`).toBe(line.distance);
        expect(measured.climb, `${where} climb`).toBe(line.climb);
        expect(measured.water, `${where} water`).toBe(line.water);
        expect(measured.maxH - measured.minH, `${where} levels`).toBe(line.levels);
        if (line.heights !== undefined) {
          expect([measured.minH, measured.maxH], `${where} heights`).toEqual([...line.heights]);
          expect(line.heights[1] - line.heights[0], `${where} heights vs levels`).toBe(line.levels);
        }
        if (line.nearest === true) {
          expect(
            Math.round(nearestOfTypes(world, line.from, line.to) * 10) / 10,
            `${where} is the nearest pair of its two industry types`,
          ).toBe(line.distance);
        }
        if (line.shortestChain === true) {
          expect(
            Math.round(shortestChainTiles(world) * 10) / 10,
            `${where} is the shortest producer-to-acceptor pair on the map`,
          ).toBe(line.distance);
        }
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
          at('land mass sizes'),
        ).toEqual([...claim.landmassTiles]);
      }
    });
  }

  it('holds the three superlatives the briefings claim about the CAMPAIGN', () => {
    // Three sentences talk about the campaign rather than about their own map -
    // "no other stage carries more industries", "fewer works", "more towns" -
    // and each one has to be true AND unique, or the stage beside it could say
    // the same thing (the D-198 rule that closed Passagiernetz's own claim).
    const industries = CAMPAIGN_SCENARIOS.map((one) => CAMPAIGN_WORLD_CLAIMS[one.id]!.industries);
    const towns = CAMPAIGN_SCENARIOS.map((one) => CAMPAIGN_WORLD_CLAIMS[one.id]!.townsAt2500);

    expect(Math.max(...industries)).toBe(CAMPAIGN_WORLD_CLAIMS['eisenadern-10']!.industries);
    expect(industries.filter((n) => n === Math.max(...industries))).toHaveLength(1);
    expect(Math.min(...industries)).toBe(CAMPAIGN_WORLD_CLAIMS['eisenadern-06']!.industries);
    expect(industries.filter((n) => n === Math.min(...industries))).toHaveLength(1);
    expect(Math.max(...towns)).toBe(CAMPAIGN_WORLD_CLAIMS['eisenadern-11']!.townsAt2500);
    expect(towns.filter((n) => n === Math.max(...towns))).toHaveLength(1);
    expect(Math.min(...towns)).toBe(CAMPAIGN_WORLD_CLAIMS['eisenadern-12']!.townsAt2500);
    expect(towns.filter((n) => n === Math.min(...towns))).toHaveLength(1);
  });

  it('names towns that exist, and calls them by their real names', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
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
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        if (goal.spec.kind !== GoalKind.CargoDeliveredTotal) continue;
        const cargo = goal.spec.subjectA as Cargo;
        expect(hasProducer(world, cargo), `${scenario.id}: producer of ${cargo}`).toBe(true);
        expect(hasAcceptor(world, cargo), `${scenario.id}: acceptor of ${cargo}`).toBe(true);
      }
    }
  });

  it('keeps the two towns of every connection goal on ONE land mass', () => {
    // A ConnectStations goal over open water is a goal that needs a harbour and
    // a ship before the first bus, which is not what any of these briefings
    // describes.
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        if (goal.spec.kind !== GoalKind.ConnectStations) continue;
        expect(
          landmassOfTown(world, goal.spec.subjectA),
          `${scenario.id}: the two towns of the connection goal`,
        ).toBe(landmassOfTown(world, goal.spec.subjectB));
      }
    }
  });
});

// ---------------------------------------- the competitor probe (D-250/D-254)

describe('no stage rests on opponents that never move', () => {
  for (const scenario of CAMPAIGN_SCENARIOS) {
    it(`${scenario.id} finds its competitors exactly where it says they are`, () => {
      const claim = CAMPAIGN_WORLD_CLAIMS[scenario.id]!;
      const shipped = scenario.rules.aiCompanies;
      const options = newGameOptionsOf(scenario, COMPANY, 1);
      const world = World.create(
        worldParamsFor({ ...options, aiCompanies: shipped + claim.competitors.added }),
      );
      expect(world.companies, `${scenario.id}: companies`).toHaveLength(
        shipped + claim.competitors.added + 1,
      );

      const queue = new CommandQueue();
      for (let tick = 0; tick < PROBE_YEARS * TICKS_PER_YEAR; tick++) world.step(queue, null);

      const measured = competitorHoldings(world).map((row) => [...row]);
      expect(measured, `${scenario.id}: what the competitors own after six years`).toEqual(
        claim.competitors.own.map((row) => [...row]),
      );

      if (shipped > 0) {
        // A stage that ships competitors has to ship competitors that RUN
        // something: stations without a fleet is the D-158 husk, and a
        // briefing that promised a rival would be describing one.
        expect(claim.competitors.added, `${scenario.id}: probe adds nobody`).toBe(0);
        expect(
          measured.some((row) => row[0]! > 0 && row[1]! > 0),
          `${scenario.id}: no competitor runs a line`,
        ).toBe(true);
      } else {
        // A solo stage, and the probe is what says WHY: with competitors added
        // they reach no fleet at all in six game years - D-250's silence at
        // 1850 and its partial silence at 1880, in this campaign's own worlds.
        expect(claim.competitors.added, `${scenario.id}: solo stage with no probe`).toBeGreaterThan(
          0,
        );
        for (const row of measured) {
          expect(row[1], `${scenario.id}: an added competitor bought a vehicle`).toBe(0);
        }
      }
    });
  }

  it('says in BOTH briefings that a solo stage is solo, and never says it elsewhere', () => {
    // **D-254 claimed this in three places and stage 06 did not do it** (D-256):
    // the campaign header, the decision entry and the CLAUDE.md digest all said
    // "stages 1-6 ship solo and say so in both briefings", and "Fuenf Werke"
    // said nothing about competitors at all. A player reading it had no way to
    // know whether the map was empty or whether the briefing had simply not
    // mentioned the two companies building on it.
    //
    // The guard is a phrase table rather than a substring, because German says
    // it two ways ("Kein Konkurrent ..." and "Konkurrenten bauen hier noch
    // keine"), and it runs in BOTH directions: a contested stage that claimed
    // to be alone would be the same defect with the sign flipped.
    const SOLO_PHRASES: Readonly<Record<'de' | 'en', readonly RegExp[]>> = {
      de: [/kein konkurrent/i, /konkurrenten bauen hier noch keine/i],
      en: [/no competitor/i],
    };
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const solo = scenario.rules.aiCompanies === 0;
      for (const locale of ['de', 'en'] as const) {
        const text = scenario.briefing[locale];
        const says = SOLO_PHRASES[locale].some((phrase) => phrase.test(text));
        expect(says, `${scenario.id}/${locale}: solo=${solo} but the briefing says ${says}`).toBe(
          solo,
        );
      }
    }
  });

  it('ships competitors exactly where the era supports them', () => {
    // The rule the campaign was built to, stated as a test rather than as a
    // paragraph: the 1850 and 1880 stages ship solo, the 1920 and 1950 stages
    // ship contested. D-250 measured the silence; this is the shape it forced.
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const early = scenario.rules.startYear < 1920;
      expect(scenario.rules.aiCompanies === 0, `${scenario.id}: competitors vs era`).toBe(early);
    }
  });
});

// ---------------------------------------- the sentences that quote them (D-198)

describe('every number a campaign briefing says out loud is justified', () => {
  for (const scenario of CAMPAIGN_SCENARIOS) {
    it(`${scenario.id} says only numbers something else pins`, () => {
      const claim = CAMPAIGN_WORLD_CLAIMS[scenario.id]!;
      const figures = CAMPAIGN_BRIEFING_FIGURES[scenario.id]!;
      const expected = figures.map((figure) => figureValue(figure, claim, scenario));

      for (const locale of ['de', 'en'] as const) {
        const text = scenario.briefing[locale];
        expect(unrecognisedNumeralWords(text), `${scenario.id}/${locale}: unknown numeral`).toEqual(
          [],
        );
        const read = numeralsIn(text);
        const where = read.map(
          (one, at) => `${at}: "${one.text}" (${figures[at]?.what ?? 'nothing declares it'})`,
        );
        expect(
          read.map((one) => one.value),
          `${scenario.id}/${locale} quotes ${read.length} figures - ${where.join(', ')}`,
        ).toEqual(expected);
      }
    });
  }

  it('gives every allowlisted figure a reason, and keeps the list short', () => {
    let allowlisted = 0;
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const figures = CAMPAIGN_BRIEFING_FIGURES[scenario.id]!;
      const free = figures.filter((figure) => figure.of === undefined);
      for (const figure of free) {
        expect(figure.value, `${scenario.id}: ${figure.what}`).toBeTypeOf('number');
        expect(figure.why ?? '', `${scenario.id}: ${figure.what} reason`).not.toBe('');
      }
      expect(free.length, `${scenario.id}: allowlisted figures`).toBeLessThanOrEqual(
        figures.length - free.length,
      );
      allowlisted += free.length;
    }
    expect(allowlisted).toBe(2);
  });

  it('turns red when a competitor figure is moved on its own', () => {
    // The falsification this campaign is most exposed to, planted and watched:
    // the competitor counts are the one family of figures a reader cannot check
    // against the map, so they are the ones somebody would be tempted to write
    // rather than measure.
    const scenario = byId('eisenadern-07');
    const claim = CAMPAIGN_WORLD_CLAIMS['eisenadern-07']!;
    const figures = CAMPAIGN_BRIEFING_FIGURES['eisenadern-07']!;
    const honest = figures.map((figure) => figureValue(figure, claim, scenario));
    expect(numeralsIn(scenario.briefing.de).map((one) => one.value)).toEqual(honest);

    const tampered = scenario.briefing.de.replace(
      '2 Stationen und 6 Fahrzeuge',
      '9 Stationen und 30 Fahrzeuge',
    );
    expect(tampered).not.toBe(scenario.briefing.de);
    expect(numeralsIn(tampered).map((one) => one.value)).not.toEqual(honest);
  });
});

// ------------------------------------ the places those sentences name (D-199)

describe('every place a campaign stage names is a town of its own world', () => {
  for (const scenario of CAMPAIGN_SCENARIOS) {
    it(`${scenario.id} names in its briefing exactly the towns it declares`, () => {
      const claim = CAMPAIGN_WORLD_CLAIMS[scenario.id]!;
      const world = worldOf(scenario);
      const expected = claim.briefingTowns.map((id) => {
        expect(
          claim.towns.filter((town) => town[0] === id),
          `${scenario.id}: briefing town ${id} is not in the claims table`,
        ).toHaveLength(1);
        const town = world.towns[id];
        expect(town, `${scenario.id}: town ${id}`).toBeDefined();
        return town!.name;
      });

      for (const locale of ['de', 'en'] as const) {
        expect(
          placeNamesIn(scenario.briefing[locale]).map((one) => one.text),
          `${scenario.id}/${locale}: the places the briefing names`,
        ).toEqual(expected);
      }
    });
  }

  it('lets a caption name only the towns its own descriptor addresses', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        const ids =
          goal.spec.kind === GoalKind.ConnectStations
            ? [goal.spec.subjectA, goal.spec.subjectB]
            : goal.spec.kind === GoalKind.TownPopulationReach && goal.spec.subjectA >= 0
              ? [goal.spec.subjectA]
              : [];
        const allowedNames = ids.map((id) => world.towns[id]!.name);
        for (const locale of ['de', 'en'] as const) {
          expect(
            sorted(placeNamesIn(goal.caption[locale]).map((one) => one.text)),
            `${scenario.id}/${locale}: caption of goal ${goal.spec.kind}`,
          ).toEqual(sorted(allowedNames));
        }
      }
    }
  });
});

// -------------------------------------------------------- no free medals

describe('no campaign goal decides itself', () => {
  it('leaves every goal open after a game year in which the player did nothing', () => {
    for (const scenario of CAMPAIGN_SCENARIOS) {
      const world = worldOf(scenario);
      const queue = new CommandQueue();
      for (let tick = 0; tick < TICKS_PER_YEAR; tick++) world.step(queue, null);

      expect(world.tick, scenario.id).toBe(TICKS_PER_YEAR);
      for (let at = 0; at < world.goals.count; at++) {
        expect(world.goals.status[at], `${scenario.id}: goal ${at}`).toBe(GoalStatus.Open);
      }
    }
  });

  for (const scenario of CAMPAIGN_SCENARIOS) {
    const growth = CAMPAIGN_WORLD_CLAIMS[scenario.id]!.passiveGrowth;
    if (growth === undefined) continue;
    it(`${scenario.id} moves its unserved town exactly as far as it claims`, () => {
      // The one population goal of the campaign, and the same rule the eight
      // are held to: a threshold under the passive line is a medal given away.
      // This stage ships SOLO, so the shipped world IS the unserved world -
      // no competitor has to be taken out of it (the D-198 qualification).
      const world = World.create(worldParamsFor(newGameOptionsOf(scenario, COMPANY, 1)));
      expect(world.companies, `${scenario.id}: companies`).toHaveLength(1);
      const queue = new CommandQueue();
      for (const [years, population] of growth.samples) {
        while (world.tick < years * TICKS_PER_YEAR) world.step(queue, null);
        expect(world.tick, `${scenario.id}: ${years} years`).toBe(years * TICKS_PER_YEAR);
        expect(world.towns[growth.townId]!.population, `${scenario.id}: after ${years} years`).toBe(
          population,
        );
      }

      const goal = goalOfKind(scenario, GoalKind.TownPopulationReach);
      const last = growth.samples[growth.samples.length - 1]!;
      expect(goal.spec.subjectA, `${scenario.id}: goal town`).toBe(growth.townId);
      expect(goal.spec.bronzeTick, `${scenario.id}: deadline`).toBe(last[0] * TICKS_PER_YEAR);
      expect(goal.spec.threshold, `${scenario.id}: threshold`).toBeGreaterThan(last[1]);
    });
  }
});
