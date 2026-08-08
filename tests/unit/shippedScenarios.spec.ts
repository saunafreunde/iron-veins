import { describe, expect, it } from 'vitest';
import { SHIPPED_SCENARIOS, scenarioById, scenarioYearOf } from '../../src/scenarios/catalog';
import { newGameOptionsOf, scenarioMetaOf, type ShippedScenario } from '../../src/scenarios/types';
import { CommandQueue } from '../../src/sim/commands/queue';
import { Cargo, isPassengerClass } from '../../src/sim/cargo/types';
import {
  BANKRUPTCY_MONTHS,
  BANKRUPTCY_WARNING_MONTHS,
  CENTS_PER_EURO,
  Difficulty,
  HEIGHT_STEP_M,
  MAP_SIZES,
  MapClimate,
  SCENARIO_TEXT_MAX_CHARS,
  START_CAPITAL_CT,
  START_YEAR,
  TICKS_PER_YEAR,
} from '../../src/sim/constants';
import { numeralsIn, unrecognisedNumeralWords } from './briefingNumerals';
import { placeNamesIn } from './briefingPlaceNames';
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
 * One end of a corridor: a town, or - since D-198 - an industry.
 *
 * Town ids alone could not express what Frachtrausch's doc comment says out
 * loud. "Each mine's nearest plant is 57, 59, 70 and 106 tiles away, and the
 * ground between them climbs and falls 16, 12, 12 and 25 levels" is four
 * corridors that begin and end at INDUSTRIES, and while the type could only
 * address towns those four sentences were unpinnable - which is how "three of
 * the four are nearest to the plant at 155,112" survived being wrong by one
 * (all four are).
 */
type CorridorEnd = { readonly town: number } | { readonly industry: number };
const atTown = (id: number): CorridorEnd => ({ town: id });
const atIndustry = (id: number): CorridorEnd => ({ industry: id });

interface CorridorClaim {
  /** The straight line a briefing quotes, between two towns or two industries. */
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
  /**
   * The lowest and the highest level on the line, where a sentence names them
   * (D-199). [levels]
   *
   * `levels` is the DIFFERENCE, and a difference is all Gebirgslogistik's
   * briefing quotes ("elf Hoehenstufen"). Its doc comment says more - "spans
   * heights 2 to 13" - and that sentence would still have read true over a
   * corridor running from 5 to 16. Where a comment names the band, the band is
   * pinned; where nothing names it, this stays absent rather than pinning a
   * figure no sentence rests on.
   */
  readonly heights?: readonly [number, number];
}

/**
 * What a town of 8,000 that nobody ever serves grows to, played out.
 *
 * The one family of claims about a world's FUTURE rather than its generation,
 * and the thresholds of three scenarios rest on it: a population goal under
 * the passive line is a medal the scenario gives away.
 */
interface PassiveGrowthClaim {
  readonly townId: number;
  /** [whole game years played, population at that tick]. Ascending. */
  readonly samples: readonly (readonly [number, number])[];
  /**
   * Whether the world has to be built WITHOUT the scenario's competitors.
   *
   * "Unserved" is not a property a world with four AI builders in it can be
   * asked about, so Ueberleben's desert curve is measured on its own seed and
   * rules with `aiCompanies` at zero, and the claim says so rather than
   * pretending the shipped world was played (D-198).
   */
  readonly withoutCompetitors: boolean;
}

interface WorldClaim {
  /** Towns on the map, at any size. Exact - the base of every "N of them". */
  readonly townsTotal: number;
  /** Towns at 8,000 or more, and at 2,500 or more. Exact counts. */
  readonly citiesAt8000: number;
  readonly townsAt2500: number;
  /** Industries on the map. Exact. */
  readonly industries: number;
  /** Land masses that carry at least one town. Exact. */
  readonly inhabitedLandmasses: number;
  /** Towns a caption or briefing names: id, name, starting population. */
  readonly towns: readonly (readonly [number, string, number])[];
  /**
   * The towns the BRIEFING names, in the order it names them (D-199).
   *
   * Required, and empty for the five briefings that name none, because an
   * absent optional field would read as "this briefing names nobody" for a
   * briefing nobody has looked at. Every id here has to appear in
   * {@link WorldClaim.towns} as well, which is what pins the NAME the audit
   * then looks for; both locales are held to this one sequence, so a town
   * renamed in German alone is red - which is exactly how the guard was
   * defeated.
   */
  readonly briefingTowns: readonly number[];
  /** Corridors a briefing quotes a distance or a gradient for. */
  readonly corridors?: readonly CorridorClaim[];
  /** Industry types a briefing counts. */
  readonly industriesOfType?: readonly (readonly [IndustryType, number])[];
  /** Tiles per INHABITED land mass, largest first - the archipelago claim. */
  readonly landmassTiles?: readonly number[];
  /**
   * Which named town stands on a land mass of how many tiles (D-198).
   *
   * `landmassTiles` pins the sizes and nothing else: it would still hold if
   * the two cities of Inselhuepfen swapped islands, and then "a 252-tile
   * island carries Sandenheim" would be false with every number in the table
   * still green. This is the binding that sentence actually makes.
   */
  readonly townLandmassTiles?: readonly (readonly [number, number])[];
  /** Industries a doc comment locates: id, type, x, y. */
  readonly industriesAt?: readonly (readonly [number, IndustryType, number, number])[];
  /** Each coal mine's nearest power station: mine id, plant id, tiles. */
  readonly nearestPlantOfMine?: readonly (readonly [number, number, number])[];
  /** A cargo the briefing says the map cannot burn. */
  readonly cargoWithoutAcceptor?: Cargo;
  /** What an unserved town grows to - played out, never asserted. */
  readonly passiveGrowth?: PassiveGrowthClaim;
}

/** The two cuts every "cities" and "towns" count in this file is taken at. */
const CITY_POPULATION = 8_000;
const TOWN_POPULATION = 2_500;

/**
 * World properties the shipped scenarios rest on, pinned against the generated
 * world.
 *
 * This table is the answer to the M17 acceptance defect (D-197): the
 * Passagiernetz briefing promised "eight cities of 8,000" over a world that had
 * seven, and nothing anywhere was able to notice. Every figure below was taken
 * by generating the world and reading it. They are pinned exactly rather than
 * banded, because the generator is deterministic (law #3): a changed seed, a
 * changed mapgen constant or a changed climate table moves them, and moving
 * them silently is precisely what must not happen again.
 *
 * **What the entries here are, exactly** - the honest scope, because an earlier
 * wording said "every claim a briefing AND a doc comment makes" and that was
 * more than holds (D-199):
 *
 *  - every world property any BRIEFING or goal CAPTION quotes. Those are read
 *    back out of the prose as well, by `SCENARIO_BRIEFING_FIGURES` for the
 *    numbers (D-198) and by `placeNamesIn` for the town names (D-199), so
 *    neither end can move alone.
 *  - plus the figures a catalogue DOC COMMENT quotes that were worth pinning:
 *    industry positions, each mine's nearest plant, the land mass under a named
 *    town, the passive growth curves, a corridor's height band. Those are held
 *    against the WORLD, and nothing reads them back out of the comment - the
 *    prose of `src/scenarios/catalog.ts` is not scanned. A doc comment that
 *    drifts out of step with this table is caught by a reader, not by a build.
 *    That line is drawn in D-199 with the measurement behind it.
 *
 * When one of these goes red the fix is never the number alone. The number and
 * the sentence that quotes it are one claim, and both ends move together - or
 * the seed does.
 */
const SCENARIO_WORLD_CLAIMS: Readonly<Record<string, WorldClaim>> = {
  // "Zwei Staedte zu 8.000 Einwohnern, 29 Tiles auseinander, drei Hoehenstufen
  // dazwischen - flacher wird es nicht."
  speedrun: {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 12,
    industries: 12,
    inhabitedLandmasses: 1,
    towns: [
      [5, 'Nieder-Kaisershofen', 8_000],
      [18, 'Haselstadt', 8_000],
    ],
    // Both towns are named in the CAPTION, which the goal's own descriptor
    // binds; the briefing calls them "zwei Staedte" and names neither.
    briefingTowns: [],
    corridors: [{ from: atTown(5), to: atTown(18), distance: 29.4, climb: 3, water: 0, levels: 3 }],
  },
  // "Vierzig Orte stehen auf der Karte, siebzehn davon haben 2.500 Einwohner
  // oder mehr, und acht von diesen siebzehn sind Grossstaedte zu je 8.000 -
  // keine der acht Karten traegt mehr Orte ab 2.500. ... Nieder-Weidengrund
  // und Kaiserskirchen trennen 33 Tiles, Rosenburg liegt weitere 37 dahinter,
  // Ahorngrund noch einmal 30."
  passagiernetz: {
    townsTotal: 40,
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
    // The chain, in the order both briefings walk it. This is the sequence the
    // verifier broke: he renamed the third and the fourth in German only
    // (D-199).
    briefingTowns: [17, 16, 18, 5],
    corridors: [
      { from: atTown(17), to: atTown(16), distance: 33.4, climb: 9, water: 0, levels: 4 },
      { from: atTown(16), to: atTown(18), distance: 36.9, climb: 7, water: 0, levels: 3 },
      { from: atTown(18), to: atTown(5), distance: 30.0, climb: 7, water: 0, levels: 2 },
    ],
  },
  // "Vier Kohlegruben, zwei Kraftwerke ... 57, 59, 70 und 106 Tiles", plus the
  // doc comment's four gradients and the plant all four mines are nearest to.
  frachtrausch: {
    townsTotal: 40,
    citiesAt8000: 3,
    townsAt2500: 11,
    industries: 12,
    inhabitedLandmasses: 1,
    towns: [],
    briefingTowns: [],
    industriesOfType: [
      [IndustryType.CoalMine, 4],
      [IndustryType.PowerPlant, 2],
    ],
    industriesAt: [
      [0, IndustryType.PowerPlant, 148, 83],
      [5, IndustryType.PowerPlant, 155, 112],
      // The mine the doc comment names by position, "the mine at 101,129"
      // (D-199). Without this row the sentence that settled "all four, not
      // three" named a place nothing held.
      [1, IndustryType.CoalMine, 101, 129],
    ],
    nearestPlantOfMine: [
      [1, 5, 57],
      [7, 5, 59],
      [10, 5, 70],
      [9, 5, 106],
    ],
    corridors: [
      { from: atIndustry(1), to: atIndustry(5), distance: 56.6, climb: 16, water: 0, levels: 10 },
      { from: atIndustry(7), to: atIndustry(5), distance: 59.2, climb: 12, water: 0, levels: 8 },
      { from: atIndustry(10), to: atIndustry(5), distance: 70.4, climb: 12, water: 1, levels: 7 },
      { from: atIndustry(9), to: atIndustry(5), distance: 106.4, climb: 25, water: 0, levels: 6 },
      // The comparison itself: "57 tiles from 155,112 against 66 from 148,83".
      // `nearestPlantOfMine` pins the 57 and that plant 5 wins - it does not
      // pin the 66 the sentence measures the win by (D-199).
      { from: atIndustry(1), to: atIndustry(0), distance: 65.8, climb: 20, water: 5, levels: 11 },
    ],
  },
  // "Zwischen Silberheim und Ulmenburg liegen 60 Tiles Luftlinie - und elf
  // Hoehenstufen ..., also 88 Meter, dazu acht Tiles Wasser." Plus the reason
  // the tonnage goal here counts passengers: nothing on this map burns coal.
  gebirgslogistik: {
    townsTotal: 40,
    citiesAt8000: 3,
    townsAt2500: 16,
    industries: 2,
    inhabitedLandmasses: 2,
    towns: [
      [3, 'Silberheim', 8_000],
      [18, 'Ulmenburg', 2_500],
    ],
    briefingTowns: [3, 18],
    corridors: [
      {
        from: atTown(3),
        to: atTown(18),
        distance: 59.5,
        climb: 27,
        water: 8,
        levels: 11,
        // "spans heights 2 to 13" - the doc comment's own band (D-199).
        heights: [2, 13],
      },
    ],
    industriesOfType: [[IndustryType.CoalMine, 2]],
    cargoWithoutAcceptor: Cargo.Coal,
  },
  // "Sandenheim ... liegt auf einer Insel. Neu-Lindenried ... liegt 52 Tiles
  // entfernt auf dem Festland. Dazwischen ist offenes Meer."
  inselhuepfen: {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 12,
    industries: 7,
    inhabitedLandmasses: 3,
    towns: [
      [23, 'Neu-Lindenried', 8_000],
      [8, 'Sandenheim', 8_000],
    ],
    // The island first in both languages, the mainland second.
    briefingTowns: [8, 23],
    corridors: [
      { from: atTown(23), to: atTown(8), distance: 51.6, climb: 13, water: 21, levels: 5 },
    ],
    landmassTiles: [45_084, 252, 27],
    townLandmassTiles: [
      [23, 45_084],
      [8, 252],
    ],
  },
  // "Sieben Grossstaedte, drei Bauernhoefe, drei Lebensmittelwerke ...
  // Erlenbach kaeme unbedient bis Ende 1975 auf 10.574 Einwohner."
  wiederaufbau: {
    townsTotal: 40,
    citiesAt8000: 7,
    townsAt2500: 15,
    industries: 13,
    inhabitedLandmasses: 1,
    towns: [[32, 'Erlenbach', 8_000]],
    briefingTowns: [32],
    industriesOfType: [
      [IndustryType.Farm, 3],
      [IndustryType.FoodFactory, 3],
    ],
    // The temperate curve the catalogue header quotes, and the four figures it
    // quotes it with: twenty years, the end of 1970, twenty-five years, the end
    // of 1975. The pairs are one game year apart, which is the trap D-197 found
    // - `endOfYear(Y)` is the year Y running OUT.
    passiveGrowth: {
      townId: 32,
      samples: [
        [20, 9_925],
        [21, 10_033],
        [25, 10_465],
        [26, 10_574],
      ],
      withoutCompetitors: false,
    },
  },
  // "Neun Staedte zu 8.000 Einwohnern, elf Industrien, drei Konkurrenten."
  ratsdiplomatie: {
    townsTotal: 40,
    citiesAt8000: 9,
    townsAt2500: 15,
    industries: 11,
    inhabitedLandmasses: 1,
    towns: [[16, 'Falkenheim', 8_000]],
    // Falkenheim is named in the CAPTION only; the briefing says "neun
    // Staedte" and names none of them.
    briefingTowns: [],
  },
  // "Wueste, zehn Industrien, zwei Grossstaedte", and the desert growth curve
  // the doc comment contrasts with the temperate one.
  ueberleben: {
    townsTotal: 40,
    citiesAt8000: 2,
    townsAt2500: 15,
    industries: 10,
    inhabitedLandmasses: 1,
    towns: [
      [8, 'Sandenwerder', 8_000],
      [13, 'Hinter-Falkenrode', 8_000],
    ],
    // Neither is named anywhere in the scenario's text; both are pinned
    // because the doc comment counts them.
    briefingTowns: [],
    passiveGrowth: {
      townId: 8,
      samples: [
        [25, 9_200],
        [26, 9_248],
      ],
      withoutCompetitors: true,
    },
  },
};

// -------------------------------------------- the briefings, bound (D-198)

/**
 * One number a briefing says out loud, and where it is allowed to come from.
 *
 * The gap this closes: the claims table above pinned the WORLD and nothing read
 * the sentences that quote it, so an independent verifier falsified the German
 * Passagiernetz briefing on its own - "Acht Grossstaedte zu je 8.000 Einwohnern
 * und siebzehn Orte ab 2.500" became "Neun ... 9.000 ... vierzig", the claims
 * table was left untouched, and the whole suite stayed green. Nothing in the
 * repository read a briefing's CONTENT; the assertions were non-empty, under the
 * length cap, and de !== en.
 *
 * So every numeral in every briefing is listed here, in the order it is read,
 * and is one of exactly two things:
 *
 *  - {@link pinned} - read back out of the claims table, the scenario's own
 *    rules and goals, or a constant of the simulation. Nobody can move it
 *    without moving the thing it is read from, and the claims table is in turn
 *    held against the generated world. That is the chain the falsification
 *    walked around.
 *  - {@link allowed} - a number no world property can justify (a SPEC section
 *    number, a calibration measurement, the fleet a measurement was taken
 *    with), listed with its value AND the reason. Eight of the ninety-odd
 *    figures are of this kind, and each says where it comes from.
 *
 * The alternative design - placeholders in the briefing filled from the claims
 * table at load time - was rejected for two reasons. It would have to generate
 * German and English prose from bare numbers (agreement, spelled-out numerals,
 * "zwei Kraftwerke" against "ein Kraftwerk"), and it would still need this
 * scanner underneath it to prove that no literal numeral had been typed in
 * beside a placeholder. Given that, the scanner alone is the smaller mechanism
 * and the stronger one: it also covers the numbers no placeholder could ever
 * fill, and it is what makes the two locales one claim rather than two.
 */
interface BriefingFigure {
  /** What the figure IS, quoted in the failure message. */
  readonly what: string;
  /** Where it is read back from. Absent exactly for an allowlisted figure. */
  readonly of?: (claim: WorldClaim, scenario: ShippedScenario) => number;
  /** The value, for an allowlisted figure. */
  readonly value?: number;
  /** Why no world property can justify it. Required for an allowlisted one. */
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

/** The starting capital this scenario's difficulty grants, in whole euro. */
function startCapitalEuro(scenario: ShippedScenario): number {
  return START_CAPITAL_CT[scenario.rules.difficulty]! / CENTS_PER_EURO;
}

/** The threshold of this scenario's goal of `kind` - exactly one may exist. */
function goalThreshold(scenario: ShippedScenario, kind: GoalKind): number {
  const found = scenario.goals.filter((goal) => goal.spec.kind === kind);
  expect(found, `${scenario.id}: goals of kind ${kind}`).toHaveLength(1);
  return found[0]!.spec.threshold;
}

/** The pinned starting population of a town the briefing names. */
function namedTownPopulation(claim: WorldClaim, townId: number): number {
  const found = claim.towns.filter((town) => town[0] === townId);
  expect(found, `claimed town ${townId}`).toHaveLength(1);
  return found[0]![2];
}

/** A corridor's distance as a briefing quotes it: whole tiles. */
function corridorTiles(claim: WorldClaim, at: number): number {
  return Math.round(claim.corridors![at]!.distance);
}

/** The tiles between each mine and its nearest plant, as the briefing lists them. */
function nearestPlantTiles(claim: WorldClaim, at: number): number {
  return [...claim.nearestPlantOfMine!].sort((a, b) => a[2] - b[2])[at]![2];
}

const SCENARIO_BRIEFING_FIGURES: Readonly<Record<string, readonly BriefingFigure[]>> = {
  speedrun: [
    pinned('towns of 8,000 on the map', (claim) => claim.citiesAt8000),
    pinned('the population a city starts at', () => CITY_POPULATION),
    pinned('tiles between the pair', (claim) => corridorTiles(claim, 0)),
    pinned('height levels climbed between them', (claim) => claim.corridors![0]!.climb),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
    allowed(
      'the buses the passenger measurement was taken with',
      4,
      'a fleet the player is asked to buy, not a property of the map - the ' +
        'measurement at the head of catalog.ts is four 1950 buses',
    ),
    allowed(
      'passengers a year those four buses carry',
      21_400,
      'a measurement of the M6 bus world (21,393 in the first game year), ' +
        'rounded to the nearest hundred - no generated world states it',
    ),
  ],
  passagiernetz: [
    pinned('towns on the map', (claim) => claim.townsTotal),
    pinned('towns of 2,500 or more', (claim) => claim.townsAt2500),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('cities among them', (claim) => claim.citiesAt8000),
    pinned('towns of 2,500 or more, named again', (claim) => claim.townsAt2500),
    pinned('the population a city starts at', () => CITY_POPULATION),
    pinned('the scenarios that ship with the game', () => SHIPPED_SCENARIOS.length),
    pinned('the cut those towns are counted at', () => TOWN_POPULATION),
    pinned('cities in the chain the briefing names', (claim) => claim.towns.length),
    pinned('tiles from Nieder-Weidengrund to Kaiserskirchen', (claim) => corridorTiles(claim, 0)),
    pinned('tiles on to Rosenburg', (claim) => corridorTiles(claim, 1)),
    pinned('tiles on to Ahorngrund', (claim) => corridorTiles(claim, 2)),
    allowed(
      'the buses the passenger measurement was taken with',
      4,
      'a fleet the player is asked to buy, not a property of the map',
    ),
    allowed(
      'passengers a year four buses carry on one pair',
      21_000,
      'the same measured 21,393, rounded DOWN to the thousand because this ' +
        "scenario's pair is 33 tiles where the measurement drove 28",
    ),
    pinned('passengers the goal asks for', (_claim, scenario) =>
      goalThreshold(scenario, GoalKind.CargoDeliveredTotal),
    ),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
  ],
  frachtrausch: [
    pinned('coal mines', (claim) => claim.industriesOfType![0]![1]),
    pinned('power stations', (claim) => claim.industriesOfType![1]![1]),
    pinned('tiles, nearest mine to its plant', (claim) => nearestPlantTiles(claim, 0)),
    pinned('tiles, second mine to its plant', (claim) => nearestPlantTiles(claim, 1)),
    pinned('tiles, third mine to its plant', (claim) => nearestPlantTiles(claim, 2)),
    pinned('tiles, furthest mine to its plant', (claim) => nearestPlantTiles(claim, 3)),
    allowed(
      'wagons on the train the coal measurement was taken with',
      8,
      'a train the player is asked to build, not a property of the map',
    ),
    allowed(
      'units of coal a year that train carries',
      1_700,
      'the middle of the measured band 1,400-2,000 units a year (the M6 coal ' +
        'world), quoted as "rund" - no generated world states it',
    ),
  ],
  gebirgslogistik: [
    pinned('tiles of straight line between the two towns', (claim) => corridorTiles(claim, 0)),
    pinned(
      'height levels between its lowest and highest point',
      (claim) => claim.corridors![0]!.levels,
    ),
    pinned('those levels in metres', (claim) => claim.corridors![0]!.levels * HEIGHT_STEP_M),
    pinned('water tiles the line crosses', (claim) => claim.corridors![0]!.water),
    allowed(
      'the SPEC.md section the route costs come from',
      8.4,
      'a cross-reference into the specification, not a quantity - it is the ' +
        'name of the rule the scenario switches on',
    ),
  ],
  inselhuepfen: [
    pinned('what Sandenheim starts at', (claim) => namedTownPopulation(claim, 8)),
    pinned('tiles of open water between the two', (claim) => corridorTiles(claim, 0)),
  ],
  wiederaufbau: [
    pinned('cities of 8,000', (claim) => claim.citiesAt8000),
    pinned('farms', (claim) => claim.industriesOfType![0]![1]),
    pinned('food factories', (claim) => claim.industriesOfType![1]![1]),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
    pinned('the year the scenario runs to', (_claim, scenario) => scenarioYearOf(scenario.toTick)),
    pinned(
      'what an unserved Erlenbach reaches by then',
      (claim) => claim.passiveGrowth!.samples[3]![1],
    ),
    pinned('inhabitants the goal asks for', (_claim, scenario) =>
      goalThreshold(scenario, GoalKind.TownPopulationReach),
    ),
  ],
  ratsdiplomatie: [
    pinned('towns of 8,000', (claim) => claim.citiesAt8000),
    pinned('what each of them starts at', (claim) => namedTownPopulation(claim, 16)),
    pinned('industries', (claim) => claim.industries),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('the rating the goal asks a station to hold', (_claim, scenario) =>
      goalThreshold(scenario, GoalKind.StationRatingHold),
    ),
  ],
  ueberleben: [
    pinned('industries', (claim) => claim.industries),
    pinned('cities', (claim) => claim.citiesAt8000),
    pinned('competitors', (_claim, scenario) => scenario.rules.aiCompanies),
    pinned('starting capital in EUR', (_claim, scenario) => startCapitalEuro(scenario)),
    allowed(
      'the SPEC.md section the route costs come from',
      8.4,
      'a cross-reference into the specification, not a quantity',
    ),
    pinned('months in the red that are a warning', () => BANKRUPTCY_WARNING_MONTHS),
    pinned('months in the red that end the game', () => BANKRUPTCY_MONTHS),
    pinned('the year the scenario runs to', (_claim, scenario) => scenarioYearOf(scenario.toTick)),
  ],
};

/** Where a corridor end stands, whichever kind of thing it addresses. */
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

/** How a corridor end reads in a failure message. */
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
  if (isPassengerClass(cargo) || cargo === Cargo.Mail) return world.towns.length > 0;
  for (const industry of world.industries) {
    if (industrySpec(industry.type).outputs.includes(cargo)) return true;
  }
  return false;
}

/** Whether anything on this map TAKES `cargo` - the D-118 question, per world. */
function hasAcceptor(world: World, cargo: Cargo): boolean {
  if (isPassengerClass(cargo) || cargo === Cargo.Mail) return world.towns.length > 0;
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

      expect(world.towns.length, at('towns in total')).toBe(claim.townsTotal);
      expect(
        world.towns.filter((town) => town.population >= CITY_POPULATION).length,
        at('cities'),
      ).toBe(claim.citiesAt8000);
      expect(
        world.towns.filter((town) => town.population >= TOWN_POPULATION).length,
        at('towns'),
      ).toBe(claim.townsAt2500);
      // The eight are INSIDE the seventeen, and every briefing that quotes both
      // counts has to read that way (D-198). The cut is a floor, so the
      // relation is a property of the table itself.
      expect(claim.citiesAt8000, at('cities among the towns')).toBeLessThanOrEqual(
        claim.townsAt2500,
      );
      expect(claim.townsAt2500, at('towns among all towns')).toBeLessThanOrEqual(claim.townsTotal);
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

      for (const [id, type, x, y] of claim.industriesAt ?? []) {
        const industry = world.industries[id];
        expect(industry, at(`industry ${id}`)).toBeDefined();
        expect(industry!.type, at(`industry ${id} type`)).toBe(type);
        expect([industry!.x, industry!.y], at(`industry ${id} position`)).toEqual([x, y]);
      }

      for (const line of claim.corridors ?? []) {
        const measured = corridor(world, line.from, line.to);
        const where = at(`corridor ${endName(line.from)}->${endName(line.to)}`);
        expect(Math.round(measured.distance * 10) / 10, `${where} distance`).toBe(line.distance);
        expect(measured.climb, `${where} climb`).toBe(line.climb);
        expect(measured.water, `${where} water`).toBe(line.water);
        expect(measured.maxH - measured.minH, `${where} levels`).toBe(line.levels);
        if (line.heights !== undefined) {
          // The absolute band, where a sentence names it. `levels` alone would
          // hold over a corridor that ran from 5 to 16 (D-199), so the two are
          // asserted against the world AND against each other.
          expect([measured.minH, measured.maxH], `${where} heights`).toEqual([...line.heights]);
          expect(line.heights[1] - line.heights[0], `${where} heights vs levels`).toBe(line.levels);
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
          at('inhabited land mass sizes'),
        ).toEqual([...claim.landmassTiles]);
      }

      for (const [townId, tiles] of claim.townLandmassTiles ?? []) {
        // WHICH town stands on WHICH island, not just how big the islands are:
        // the sorted sizes would survive the two cities swapping places, and
        // "a 252-tile island carries Sandenheim" would then be false with the
        // whole table still green (D-198).
        const landmass = landmassOfTown(world, townId);
        let tileCount = 0;
        for (let i = 0; i < world.map.landmassId.length; i++) {
          if (world.map.landmassId[i] === landmass) tileCount++;
        }
        expect(tileCount, at(`land mass under town ${townId}`)).toBe(tiles);
      }

      if (claim.nearestPlantOfMine !== undefined) {
        // Each mine's nearest plant BY ID, not just how far away it is: the
        // distances alone left "three of the four are nearest to the plant at
        // 155,112" unpinned, and it was wrong - all four are (D-198).
        const plants = world.industries
          .map((one, id) => ({ one, id }))
          .filter((entry) => entry.one.type === IndustryType.PowerPlant);
        const measured = world.industries
          .map((one, id) => ({ one, id }))
          .filter((entry) => entry.one.type === IndustryType.CoalMine)
          .map((mine) => {
            let best = plants[0]!;
            let bestTiles = Infinity;
            for (const plant of plants) {
              const tiles = Math.hypot(mine.one.x - plant.one.x, mine.one.y - plant.one.y);
              if (tiles < bestTiles) {
                bestTiles = tiles;
                best = plant;
              }
            }
            return [mine.id, best.id, Math.round(bestTiles)];
          })
          .sort((a, b) => a[2]! - b[2]!);
        expect(measured, at('nearest plant per mine')).toEqual(
          [...claim.nearestPlantOfMine].map((one) => [...one]).sort((a, b) => a[2]! - b[2]!),
        );
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

  it('is the densest of the eight by the measure its briefing names', () => {
    // "Keine der acht Karten traegt mehr Orte ab 2.500." That was the one claim
    // in the Passagiernetz briefing about the CATALOGUE rather than about its
    // own map, and nothing held it. It also used to read "dichter ist keine der
    // acht Karten besiedelt", which is false by the other obvious measure:
    // Rats-Diplomatie has 97,000 inhabitants on it against this map's 95,700.
    // The sentence says what is true and this is where it is checked (D-198).
    const towns = SHIPPED_SCENARIOS.map((one) => SCENARIO_WORLD_CLAIMS[one.id]!.townsAt2500);
    const mine = SCENARIO_WORLD_CLAIMS['passagiernetz']!.townsAt2500;
    expect(Math.max(...towns)).toBe(mine);
    expect(towns.filter((count) => count === mine)).toHaveLength(1);
  });

  for (const scenario of SHIPPED_SCENARIOS) {
    const growth = SCENARIO_WORLD_CLAIMS[scenario.id]!.passiveGrowth;
    if (growth === undefined) continue;
    it(`${scenario.id} grows its unserved town exactly as far as it claims`, () => {
      // The claims about the world's FUTURE rather than about the world as
      // generated, and three thresholds rest on them: "unserved, Erlenbach
      // would reach 10,574 by the end of 1975 - the 11,000 has to be carried
      // in", plus the four temperate and two desert figures the catalogue
      // header quotes. Played to each sample with no player at all, because a
      // threshold under the passive line is a medal the scenario gives away.
      //
      // The desert world is this seed and these rules with `aiCompanies` at
      // zero, and the claim says so: "unserved" is not a property a world with
      // four AI builders in it can be asked about (D-198). Rats-Diplomatie's
      // Falkenheim is the same 8,000 in the same climate as Erlenbach and is
      // deliberately NOT replayed - it has three competitors, and one of them
      // serving the town is what its goal asks the player to do first.
      const options = newGameOptionsOf(scenario, COMPANY, 1);
      const world = World.create(
        worldParamsFor(growth.withoutCompetitors ? { ...options, aiCompanies: 0 } : options),
      );
      expect(world.companies, `${scenario.id}: companies`).toHaveLength(
        growth.withoutCompetitors ? 1 : scenario.rules.aiCompanies + 1,
      );
      const queue = new CommandQueue();
      for (const [years, population] of growth.samples) {
        while (world.tick < years * TICKS_PER_YEAR) world.step(queue, null);
        expect(world.tick, `${scenario.id}: ${years} years`).toBe(years * TICKS_PER_YEAR);
        expect(world.towns[growth.townId]!.population, `${scenario.id}: after ${years} years`).toBe(
          population,
        );
      }
    });
  }

  it('cannot have its population goal waited out', () => {
    // The other half of the same measurement: what the goal ASKS for has to be
    // above what the world reaches on its own, at the goal's own deadline.
    for (const scenario of SHIPPED_SCENARIOS) {
      const growth = SCENARIO_WORLD_CLAIMS[scenario.id]!.passiveGrowth;
      const goal = scenario.goals.find((one) => one.spec.kind === GoalKind.TownPopulationReach);
      if (growth === undefined || goal === undefined) continue;
      expect(goal.spec.subjectA, `${scenario.id}: goal town`).toBe(growth.townId);
      const last = growth.samples[growth.samples.length - 1]!;
      expect(goal.spec.bronzeTick, `${scenario.id}: deadline`).toBe(last[0] * TICKS_PER_YEAR);
      expect(goal.spec.threshold, `${scenario.id}: threshold`).toBeGreaterThan(last[1]);
    }
  });
});

// ------------------------------------ the sentences that quote them (D-198)

describe('every number a briefing says out loud is justified', () => {
  it('covers all eight, so a ninth briefing cannot slip in unread', () => {
    const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    expect(Object.keys(SCENARIO_BRIEFING_FIGURES).sort(byName)).toEqual(
      SHIPPED_SCENARIOS.map((scenario) => scenario.id).sort(byName),
    );
  });

  it('reads digits and spelled-out numerals in both languages', () => {
    // The extractor itself, on the shapes that actually occur - including the
    // two that a naive reading gets wrong: "57, 59" is two numbers where
    // "1,700" is one, and the 2 in "CO2" is not a number at all.
    expect(numeralsIn('Acht Orte ab 2.500').map((one) => one.value)).toEqual([8, 2_500]);
    expect(numeralsIn('Eight towns of 2,500').map((one) => one.value)).toEqual([8, 2_500]);
    expect(numeralsIn('57, 59, 70 und 106 Tiles').map((one) => one.value)).toEqual([
      57, 59, 70, 106,
    ]);
    expect(numeralsIn('1,700 units and 1.700 Einheiten').map((one) => one.value)).toEqual([
      1_700, 1_700,
    ]);
    expect(numeralsIn('CO2-Abgabe').map((one) => one.value)).toEqual([]);
    expect(numeralsIn('aus 8.4 sind an').map((one) => one.value)).toEqual([8.4]);
    // The deliberate exclusions, stated as tests so they cannot drift into
    // being accidents: the German article, the English pronoun, the ordinal.
    expect(numeralsIn('Ein Zug mit acht Wagen').map((one) => one.value)).toEqual([8]);
    expect(numeralsIn('One train of eight wagons').map((one) => one.value)).toEqual([8]);
    expect(numeralsIn('die vierte Buslinie').map((one) => one.value)).toEqual([]);
    // And the guard under the word table: a numeral it has never seen is a red
    // build rather than an invisible claim.
    expect(unrecognisedNumeralWords('siebzehn Orte')).toEqual([]);
    expect(unrecognisedNumeralWords('einundvierzig Orte')).toEqual(['einundvierzig']);
  });

  it('refuses a quantity word, which is the only claim that could be inserted', () => {
    // The hole D-198 documented and D-199 closed. A REPLACED numeral was always
    // caught - the list is positional and compared whole - but a quantity word
    // the table had never seen carried a claim past the scanner entirely.
    // Those four are suspicious now and have no value: a briefing that wants a
    // quantity writes the figure, and the figure is then justified like every
    // other.
    expect(unrecognisedNumeralWords('Ein Dutzend Busse')).toEqual(['Dutzend']);
    expect(unrecognisedNumeralWords('A dozen buses')).toEqual(['dozen']);
    expect(unrecognisedNumeralWords('Eine Handvoll Orte')).toEqual(['Handvoll']);
    expect(unrecognisedNumeralWords('a handful of towns')).toEqual(['handful']);
    // And the three that were refused, because each fires on prose that is
    // already shipped or already ambiguous - "Staedtepaar" is in the
    // Passagiernetz briefing as it stands.
    expect(unrecognisedNumeralWords('vier Busse auf einem Staedtepaar')).toEqual([]);
    expect(unrecognisedNumeralWords('a couple of towns and the score')).toEqual([]);
  });

  for (const scenario of SHIPPED_SCENARIOS) {
    it(`${scenario.id} says only numbers something else pins`, () => {
      const claim = SCENARIO_WORLD_CLAIMS[scenario.id]!;
      const figures = SCENARIO_BRIEFING_FIGURES[scenario.id]!;
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
    // An allowlist without reasons is a way of switching the audit off one
    // number at a time. Eight figures in eight briefings are on it, and the
    // world-bound ones outnumber them everywhere.
    let allowlisted = 0;
    for (const scenario of SHIPPED_SCENARIOS) {
      const figures = SCENARIO_BRIEFING_FIGURES[scenario.id]!;
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
    expect(allowlisted).toBe(8);
  });

  it('turns red on the exact falsification that defeated the claims table', () => {
    // The meta-test, fed the planted lie itself (D-198). An independent
    // verifier changed the German Passagiernetz briefing from "Acht
    // Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab 2.500" to "Neun
    // Grossstaedte zu je 9.000 Einwohnern und vierzig Orte ab 2.500", left
    // SCENARIO_WORLD_CLAIMS untouched, and the suite stayed green. The
    // sentence has been rewritten since - the eight are inside the seventeen
    // now - so the falsification is applied to the sentence as it stands: the
    // same three lies, one word each.
    const scenario = byId('passagiernetz');
    const claim = SCENARIO_WORLD_CLAIMS['passagiernetz']!;
    const figures = SCENARIO_BRIEFING_FIGURES['passagiernetz']!;
    const honest = figures.map((figure) => figureValue(figure, claim, scenario));

    const tampered = scenario.briefing.de
      .replace('siebzehn davon', 'vierzig davon')
      .replace('acht von diesen', 'neun von diesen')
      .replace('8.000', '9.000');
    expect(tampered).not.toBe(scenario.briefing.de);
    expect(numeralsIn(tampered).map((one) => one.value)).not.toEqual(honest);

    // And the converse, because a guard that rejects everything is no guard:
    // the untouched sentence passes the same comparison.
    expect(numeralsIn(scenario.briefing.de).map((one) => one.value)).toEqual(honest);
  });
});

// ---------------------------------- the places those sentences name (D-199)

/** The towns a goal DESCRIPTOR addresses - the authority for a caption. */
function goalTownIds(spec: ShippedScenario['goals'][number]['spec']): readonly number[] {
  if (spec.kind === GoalKind.ConnectStations) return [spec.subjectA, spec.subjectB];
  if (spec.kind === GoalKind.TownPopulationReach && spec.subjectA >= 0) return [spec.subjectA];
  return [];
}

const sorted = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe('every place a scenario names is a town of its own world', () => {
  it('reads the generator grammar, and only that', () => {
    // The extractor on the shapes that occur, including the three a naive
    // reading gets wrong. "Nieder-Weidengrund" is ONE name and not two;
    // "Startkapital" ends in the suffix `tal` and is not a place, because
    // `Startkapi` is not a root; "Rosenheim" IS a place the generator could
    // have made, which is what lets an INSERTED name be caught at all.
    expect(placeNamesIn('Nieder-Weidengrund und Kaiserskirchen').map((one) => one.text)).toEqual([
      'Nieder-Weidengrund',
      'Kaiserskirchen',
    ]);
    expect(placeNamesIn('250.000 EUR Startkapital').map((one) => one.text)).toEqual([]);
    expect(placeNamesIn('Der Strassenstau kostet').map((one) => one.text)).toEqual([]);
    expect(placeNamesIn('Rosenheim liegt weiter').map((one) => one.text)).toEqual(['Rosenheim']);
    // And the half the extractor deliberately cannot do: `thal` is not a
    // suffix the generator has, so "Ahornthal" is not a place name here. That
    // edit is caught by the DECLARED name having vanished, never by this list.
    expect(placeNamesIn('Ahornthal noch einmal 30').map((one) => one.text)).toEqual([]);
  });

  for (const scenario of SHIPPED_SCENARIOS) {
    it(`${scenario.id} names in its briefing exactly the towns it declares`, () => {
      const claim = SCENARIO_WORLD_CLAIMS[scenario.id]!;
      const world = worldOf(scenario);
      const expected = claim.briefingTowns.map((id) => {
        // Reading the name out of the WORLD rather than out of the table is
        // what makes this a binding: `claim.towns` pins the same name and is
        // itself asserted against the world above, so the two agree or both
        // tests are red.
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
    // A caption is compared as a SET rather than as a sequence: which towns a
    // goal is about comes from the descriptor, and the order they are read in
    // is the translator's ("Verbinde A mit B" against "Connect B to A" is not
    // a defect). The briefing has no descriptor to appeal to, which is why it
    // is the sequence that is pinned there.
    for (const scenario of SHIPPED_SCENARIOS) {
      const world = worldOf(scenario);
      for (const goal of scenario.goals) {
        const allowed = goalTownIds(goal.spec).map((id) => world.towns[id]!.name);
        for (const locale of ['de', 'en'] as const) {
          expect(
            sorted(placeNamesIn(goal.caption[locale]).map((one) => one.text)),
            `${scenario.id}/${locale}: caption of goal ${goal.spec.kind}`,
          ).toEqual(sorted(allowed));
        }
      }
    }
  });

  it('turns red on the two falsifications that defeated the numeral guard', () => {
    // The verifier's own edit, kept as the meta-test (D-199). He renamed two of
    // Passagiernetz's four cities in the GERMAN briefing only - to towns that
    // do not exist on that map - left the claims table alone, and the build
    // stayed green. Both halves of the mechanism are exercised here because
    // they catch different edits.
    const scenario = byId('passagiernetz');
    const world = worldOf(scenario);
    const claim = SCENARIO_WORLD_CLAIMS['passagiernetz']!;
    const honest = claim.briefingTowns.map((id) => world.towns[id]!.name);
    expect(placeNamesIn(scenario.briefing.de).map((one) => one.text)).toEqual(honest);

    // Neither invented name is a town of this world - the sentence about the
    // falsification is checked rather than asserted.
    for (const invented of ['Rosenheim', 'Ahornthal']) {
      expect(
        world.towns.filter((town) => town.name === invented),
        `${invented} is not on this map`,
      ).toHaveLength(0);
    }

    // 1. A name the generator COULD have made, swapped in: extracted, and not
    //    the declared one.
    const renamed = scenario.briefing.de.replace('Rosenburg', 'Rosenheim');
    expect(renamed).not.toBe(scenario.briefing.de);
    expect(placeNamesIn(renamed).map((one) => one.text)).not.toEqual(honest);

    // 2. A name the generator could NOT have made: not extracted at all, and
    //    the declared name has gone - the sequence is one short.
    const invented = scenario.briefing.de.replace('Ahorngrund', 'Ahornthal');
    expect(invented).not.toBe(scenario.briefing.de);
    expect(placeNamesIn(invented).map((one) => one.text)).toEqual(honest.slice(0, 3));

    // 3. A real town of this very map, in the place of another: the sequence
    //    is what refuses it, not membership.
    const swapped = scenario.briefing.de.replace('Rosenburg', 'Kaiserskirchen');
    expect(placeNamesIn(swapped).map((one) => one.text)).not.toEqual(honest);

    // 4. And an addition that removes nothing at all.
    const added = `${scenario.briefing.de} Rosenheim liegt weiter suedlich.`;
    expect(placeNamesIn(added).map((one) => one.text)).not.toEqual(honest);
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
