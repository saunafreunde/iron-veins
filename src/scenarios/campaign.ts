import { Cargo } from '../sim/cargo/types';
import {
  CENTS_PER_EURO,
  DEFAULT_MAP_GEN_KNOBS,
  Difficulty,
  MapClimate,
  MapPreset,
  WeatherRule,
  type MapGenKnobs,
} from '../sim/constants';
import { GoalKind } from '../sim/goals/types';
import type { ShippedScenario } from './types';
import { endOfYearIn } from './years';

/**
 * The campaign "Eisenadern" (SPEC2 M24): twelve scenarios from 1850 to 2050,
 * across all four climates, as an ordered list plus unlock edges - TEXT, like
 * everything else in this directory.
 *
 * A campaign stage is an ordinary {@link ShippedScenario}. Nothing here is a
 * second kind of scenario: the twelve go through `newGameOptionsOf` and
 * `worldParamsFor` like the eight of SPEC2 M17, they are determinism fixtures
 * for the same reason, and a completion is decided by the goal machine of D-193
 * and reported by the end screen of D-196. What the campaign ADDS is one graph -
 * {@link CAMPAIGN_STAGES} - and nothing else reaches the simulation.
 *
 * ---------------------------------------------------------------------------
 * THE RESIDUAL THIS CAMPAIGN HAD TO ANSWER, AND HOW (D-250, D-254)
 * ---------------------------------------------------------------------------
 *
 * The competitors of SPEC2 M8 are SILENT at start year 1850 and partly silent
 * at 1880: D-250 measured zero commands over six game years on sixteen seeds at
 * 1850, and named the era economics as open work rather than lowering the
 * profitability floor to make a number green. A campaign that spans 1850 to
 * 2050 therefore cannot put "and competitors are pressing you" in an 1850
 * briefing, because there would be nobody there.
 *
 * So the campaign says who is on the map, and it is MEASURED rather than
 * believed. Every stage carries a competitor probe in
 * `tests/unit/campaign.spec.ts`: the stage's own world, its own rules, six game
 * years, and what each competitor owns at the end of them, pinned exactly.
 *
 *  - **Stages 1 to 6 (1850 and 1880) ship with no competitor at all**, and both
 *    briefings say so in words - which stage 06 did NOT until D-256, where the
 *    text was corrected and the claim bound to a test that reads every solo
 *    briefing for the sentence and every contested one for its absence. The
 *    probe builds each of those worlds with TWO competitors added and pins what
 *    they reach: on the five 1850/1880 worlds of stages 1, 2, 3, 5 and 6 they
 *    build NOTHING in six years, and on stage 4 -
 *    an 1880 world - they build four and three stations respectively and crew
 *    NEITHER of them. That is D-250's "partly at 1880" reproduced in this
 *    campaign's own worlds, and it is why those six stages are solo: a scenario
 *    whose difficulty rested on those competitors would be a scenario whose
 *    difficulty was a sentence.
 *  - **Stages 7 to 12 (1920 and 1950) ship with competitors, and every one of
 *    those six seeds was CHOSEN by playing it**: on each of them at least one
 *    competitor finishes the six years with a station AND a fleet. The briefing
 *    quotes that measurement by number ("after six years one of them holds 2
 *    stations and 6 vehicles"), so the figure is bound by
 *    `CAMPAIGN_BRIEFING_FIGURES` to the probe the test runs. A seed change moves
 *    both ends or neither.
 *
 * What is deliberately NOT claimed: that a competitor is a rival worth fearing.
 * D-226's twelve-seed bar and D-228's answer - the first railway costs more than
 * a starting company's whole capital plus its credit line - still stand, and the
 * campaign does not pretend otherwise. What it guarantees is that no stage is
 * balanced against opponents that never move.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE A BRIEFING WAS WRITTEN
 * ---------------------------------------------------------------------------
 *
 * Every one of the twelve worlds was generated and read before its text was
 * written, exactly as the eight of D-195 were, and every load-bearing figure is
 * in `CAMPAIGN_WORLD_CLAIMS` with the D-197/D-198/D-199 guards over it: the
 * numerals of both briefings are read back in reading order, and every place
 * name is a town of that stage's own world.
 *
 * The seed scan behind the twelve is worth knowing before a thirteenth is
 * added (all of it measured at 256 tiles, six game years, two competitors):
 *
 *  - the generator PRESET decides whether a competitor ever crews a line at
 *    all. Ten seeds of `MapPreset.Valley` at 1950 temperate produced not one
 *    competitor station; `Continent` and `RiverPlain` produce a crewed
 *    competitor on roughly one seed in four.
 *  - at 1920 the competitors build and mostly do not crew: over twenty-eight
 *    temperate seeds (`Continent`, `RiverPlain` and `Highland`) not ONE
 *    competitor ever bought a vehicle, which is why no 1920 stage of this
 *    campaign is temperate.
 *  - the world rules move the answer. Stage 8's first seed crewed a competitor
 *    with the rules off and stopped crewing when its own three rules were
 *    switched on, so the probe is run with the stage's SHIPPED rules and the
 *    seed was re-picked underneath them.
 *
 * The thresholds rest on the same four measurements the eight rest on (the head
 * of `catalog.ts`), plus the two era twins of D-245 - an 1878 omnibus over
 * twelve tiles with four buses pays back in game year five, an 1878 coal
 * railway on scenario 2's own track in year twelve. What is NOT claimed is that
 * any gold band has been played to; what IS tested is the floor under them, the
 * same one D-195 states: no goal of any stage is decided in its first game year
 * by a player who does nothing.
 */

/** The last tick of `year` in a stage that begins in `startYear`. [ticks] */
const endOf = endOfYearIn;

/**
 * Re-exported so the campaign screen needs ONE dynamic import.
 *
 * The screen prints a medal band as a calendar year and must do it in the
 * stage's own era, so it needs this conversion beside the definitions; taking
 * it from `./years` directly would put a second `src/sim` import chain in the
 * entry chunk (D-191).
 */
export { scenarioYearOf } from './years';

/** Money thresholds are cents like every other figure in the simulation. */
function euro(amount: number): number {
  return amount * CENTS_PER_EURO;
}

/** A preset at every neutral control step - the only knob the campaign turns. */
function preset(one: MapPreset): MapGenKnobs {
  return { ...DEFAULT_MAP_GEN_KNOBS, preset: one };
}

const AUTHOR = 'Iron Veins';

/** Stable id of the campaign itself - what a profile will key its progress on. */
export const CAMPAIGN_ID = 'eisenadern';

/** The campaign's own title, shown as it stands - untranslated by design. */
export const CAMPAIGN_TITLE = 'Eisenadern';

// ---------------------------------------------------------------------------
// 1850 - the three worlds nobody else is building on
// ---------------------------------------------------------------------------

/**
 * Seed 101, temperate, continent preset, 256 tiles, 1850. Measured: forty
 * towns, two of them at 8,000, thirteen at 2,500 or more, eleven industries on
 * one land mass. West-Sandenwerder (#3) and Birkenbach (#26) are 25.3 tiles
 * apart over ground that climbs and falls eight levels - the shortest link
 * between two towns of 2,500 on this map.
 *
 * The opening stage, and it is a road stage on purpose: the 1850 catalogue has
 * horse omnibuses and nothing that would make a railway pay (D-245's era twin
 * measures an 1878 omnibus over twelve tiles paying back in year five).
 */
const STAGE_01: ShippedScenario = {
  id: 'eisenadern-01',
  title: 'Erste Spur',
  author: AUTHOR,
  briefing: {
    de:
      '1850. Vierzig Orte stehen auf der Karte, dreizehn davon mit 2.500 Einwohnern ' +
      'oder mehr, und elf Industrien - aber keine Strasse zwischen ihnen. ' +
      'West-Sandenwerder und Birkenbach trennen 25 Tiles und acht Hoehenstufen Auf ' +
      'und Ab. Kein Konkurrent baut in diesen Jahren: die Kampagne beginnt allein. ' +
      '800.000 EUR Startkapital.',
    en:
      '1850. Forty towns stand on the map, thirteen of them at 2,500 inhabitants or ' +
      'more, and eleven industries - and not a road between them. West-Sandenwerder ' +
      'and Birkenbach are 25 tiles and eight height levels of climb apart. No ' +
      'competitor builds in these years: the campaign opens alone. 800,000 EUR of ' +
      'starting capital.',
  },
  goals: [
    {
      caption: {
        de: 'West-Sandenwerder mit Birkenbach verbinden',
        en: 'Connect West-Sandenwerder to Birkenbach',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 3,
        subjectB: 26,
        threshold: 1,
        goldTick: endOf(1850, 1855),
        silverTick: endOf(1850, 1862),
        bronzeTick: endOf(1850, 1875),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 1.000.000 EUR erreichen',
        en: 'Reach a company value of EUR 1,000,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(1_000_000),
        goldTick: endOf(1850, 1865),
        silverTick: endOf(1850, 1875),
        bronzeTick: endOf(1850, 1890),
      },
    },
  ],
  rules: {
    seed: 101,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Easy,
    startYear: 1850,
    mapgen: preset(MapPreset.Continent),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOf(1850, 1890),
};

/**
 * Seed 202, tropical, river-plain preset, 256 tiles, 1850. Measured: forty
 * towns, ten of them at 2,500 or more, eleven industries and TWO inhabited land
 * masses - 48,648 tiles and 305. The forestry (#6) and the sawmill (#10) stand
 * 23.0 tiles apart on ground that moves one level over the whole line: the
 * cheapest freight chain of the three 1850 stages.
 */
const STAGE_02: ShippedScenario = {
  id: 'eisenadern-02',
  title: 'Holz am Fluss',
  author: AUTHOR,
  briefing: {
    de:
      '1850, Tropen. Zehn Orte ab 2.500 Einwohnern, elf Industrien und zwei bewohnte ' +
      'Landmassen - die kleinere misst 305 Tiles. Vom Forstbetrieb bis zum Saegewerk ' +
      'sind es 23 Tiles ueber flaches Land, und das ist die kuerzeste Kette, die diese ' +
      'Karte anbietet. Auch hier baut kein Konkurrent.',
    en:
      '1850, the tropics. Ten towns at 2,500 inhabitants or more, eleven industries and ' +
      'two inhabited land masses - the smaller measures 305 tiles. From the forestry to ' +
      'the sawmill is 23 tiles over flat ground, and that is the shortest chain this map ' +
      'offers. No competitor builds here either.',
  },
  goals: [
    {
      caption: {
        de: '6.000 Einheiten Holz ausliefern',
        en: 'Deliver 6,000 units of wood',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Wood,
        subjectB: -1,
        threshold: 6_000,
        goldTick: endOf(1850, 1865),
        silverTick: endOf(1850, 1875),
        bronzeTick: endOf(1850, 1890),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 1.000.000 EUR erreichen',
        en: 'Reach a company value of EUR 1,000,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(1_000_000),
        goldTick: endOf(1850, 1875),
        silverTick: endOf(1850, 1885),
        bronzeTick: endOf(1850, 1900),
      },
    },
  ],
  rules: {
    seed: 202,
    mapSize: 256,
    climate: MapClimate.Tropical,
    difficulty: Difficulty.Easy,
    startYear: 1850,
    mapgen: preset(MapPreset.RiverPlain),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOf(1850, 1900),
};

/**
 * Seed 303, desert, valley preset, 256 tiles, 1850. Measured: forty towns,
 * thirteen at 2,500 or more, EIGHT industries, one land mass. Keswick (#0) and
 * Caldcombe (#35) are 30.0 tiles apart over ten levels of climb.
 *
 * The freight here is a trap and the scenario says so by asking for something
 * else: the desert climate grows the mineral arm (D-246), the gravel pit stands
 * 126 tiles from the cement works, and the builders' merchant is at the far
 * corner. Passengers and solvency are the whole task.
 */
const STAGE_03: ShippedScenario = {
  id: 'eisenadern-03',
  title: 'Trockenzeit',
  author: AUTHOR,
  briefing: {
    de:
      '1850, Wueste. Acht Industrien auf der ganzen Karte, dreizehn Orte ab 2.500 ' +
      'Einwohnern, und zwischen Keswick und Caldcombe liegen 30 Tiles und zehn ' +
      'Hoehenstufen. Die Werke stehen zu weit auseinander, um sie zu verbinden - was ' +
      'hier faehrt, faehrt fuer die Orte. Kein Konkurrent baut hier. Bleiben Sie bis ' +
      '1880 zahlungsfaehig.',
    en:
      '1850, desert. Eight industries on the whole map, thirteen towns at 2,500 ' +
      'inhabitants or more, and between Keswick and Caldcombe lie 30 tiles and ten ' +
      'height levels. The works stand too far apart to be linked - what runs here runs ' +
      'for the towns. No competitor builds here. Stay solvent until 1880.',
  },
  goals: [
    {
      caption: {
        de: 'Bis 1880 zahlungsfaehig bleiben',
        en: 'Stay solvent until 1880',
      },
      spec: {
        kind: GoalKind.SurviveUntil,
        subjectA: -1,
        subjectB: -1,
        threshold: endOf(1850, 1880),
        goldTick: endOf(1850, 1880),
        silverTick: endOf(1850, 1880),
        bronzeTick: endOf(1850, 1880),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 1.000.000 EUR erreichen',
        en: 'Reach a company value of EUR 1,000,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(1_000_000),
        goldTick: endOf(1850, 1885),
        silverTick: endOf(1850, 1895),
        bronzeTick: endOf(1850, 1905),
      },
    },
  ],
  rules: {
    seed: 303,
    mapSize: 256,
    climate: MapClimate.Desert,
    difficulty: Difficulty.Easy,
    startYear: 1850,
    mapgen: preset(MapPreset.Valley),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOf(1850, 1905),
};

// ---------------------------------------------------------------------------
// 1880 - still alone, and the world rules start arriving
// ---------------------------------------------------------------------------

/**
 * Seed 404, arctic, highland preset, 256 tiles, 1880. Measured: forty towns,
 * three at 8,000, fourteen at 2,500 or more, eleven industries. Quillgate (#36)
 * and East-Oakfield (#5) are 37.9 tiles apart and the straight line between
 * them climbs and falls ONE level in total - it runs at height 15 from end to
 * end.
 *
 * The stage that shows the weather rule, and the one whose competitor probe is
 * the campaign's own copy of D-250's "partly at 1880": with two competitors
 * added they build four and three stations in six game years and crew neither.
 */
const STAGE_04: ShippedScenario = {
  id: 'eisenadern-04',
  title: 'Die flache Meile',
  author: AUTHOR,
  briefing: {
    de:
      '1880, Arktis. Zwischen Quillgate und East-Oakfield liegen 38 Tiles, und auf der ' +
      'ganzen Geraden steigt und faellt das Gelaende um zusammen 1 Hoehenstufe. ' +
      'Vierzehn Orte ab 2.500 Einwohnern, elf Industrien. Das Wetter ist eingeschaltet, ' +
      'milde Stufe: Frost bremst die Raeder und treibt die Pannenquote. Konkurrenten ' +
      'bauen hier noch keine.',
    en:
      '1880, the arctic. Between Quillgate and East-Oakfield lie 38 tiles, and along the ' +
      'whole straight line the ground rises and falls by 1 height level in total. ' +
      'Fourteen towns at 2,500 inhabitants or more, eleven industries. Weather is on at ' +
      'its mild setting: frost slows the wheels and drives the breakdown rate. No ' +
      'competitor builds here yet.',
  },
  goals: [
    {
      caption: {
        de: 'Quillgate mit East-Oakfield verbinden',
        en: 'Connect Quillgate to East-Oakfield',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 36,
        subjectB: 5,
        threshold: 1,
        goldTick: endOf(1880, 1890),
        silverTick: endOf(1880, 1898),
        bronzeTick: endOf(1880, 1910),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 750.000 EUR erreichen',
        en: 'Reach a company value of EUR 750,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(750_000),
        goldTick: endOf(1880, 1900),
        silverTick: endOf(1880, 1910),
        bronzeTick: endOf(1880, 1920),
      },
    },
  ],
  rules: {
    seed: 404,
    mapSize: 256,
    climate: MapClimate.Arctic,
    difficulty: Difficulty.Normal,
    startYear: 1880,
    mapgen: preset(MapPreset.Highland),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Mild,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'goals',
    'mapSize',
    'mapgen',
    'seed',
    'startYear',
    'weather',
  ],
  fromTick: 0,
  toTick: endOf(1880, 1920),
};

/**
 * Seed 501, temperate, river-plain preset, 256 tiles, 1880. Measured: forty
 * towns, FIVE of them at 8,000, thirteen at 2,500 or more, ten industries of
 * which four are farms. The farm at 220,106 stands 24.7 tiles from the food
 * factory at 226,130.
 *
 * The population goal is the campaign's only one, and it is the one that needs
 * a played measurement rather than a table: unserved, Kupferfurt (#6) FALLS -
 * 7,280 after thirty game years and 7,256 after thirty-one, which is the
 * shrinkage branch of SPEC.md 13.2 (D-232). The goal asks for 9,000.
 */
const STAGE_05: ShippedScenario = {
  id: 'eisenadern-05',
  title: 'Korn und Kessel',
  author: AUTHOR,
  briefing: {
    de:
      '1880. Fuenf Grossstaedte zu je 8.000 Einwohnern, zehn Industrien, darunter vier ' +
      'Bauernhoefe. Vom naechsten Hof bis zum Lebensmittelwerk sind es 25 Tiles. Der ' +
      'Strassenstau ist eingeschaltet: die vierte Buslinie verdient weniger als die ' +
      'erste. Kein Konkurrent. Kupferfurt soll auf 9.000 Einwohner wachsen - unbedient ' +
      'faellt es bis Ende 1910 auf 7.256.',
    en:
      '1880. Five cities of 8,000 inhabitants each, ten industries, four of them farms. ' +
      'From the nearest farm to the food factory is 25 tiles. Road congestion is on: the ' +
      'fourth bus line earns less than the first. No competitor. Kupferfurt is to grow to ' +
      '9,000 inhabitants - unserved it falls by the end of 1910 to 7,256.',
  },
  goals: [
    {
      caption: {
        de: 'Kupferfurt auf 9.000 Einwohner bringen',
        en: 'Grow Kupferfurt to 9,000 inhabitants',
      },
      spec: {
        kind: GoalKind.TownPopulationReach,
        subjectA: 6,
        subjectB: -1,
        threshold: 9_000,
        goldTick: endOf(1880, 1900),
        silverTick: endOf(1880, 1905),
        bronzeTick: endOf(1880, 1910),
      },
    },
    {
      caption: {
        de: '8.000 Einheiten Getreide ausliefern',
        en: 'Deliver 8,000 units of grain',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Grain,
        subjectB: -1,
        threshold: 8_000,
        goldTick: endOf(1880, 1900),
        silverTick: endOf(1880, 1910),
        bronzeTick: endOf(1880, 1920),
      },
    },
  ],
  rules: {
    seed: 501,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Normal,
    startYear: 1880,
    mapgen: preset(MapPreset.RiverPlain),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: true,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'goals',
    'mapSize',
    'mapgen',
    'roadCongestion',
    'seed',
    'startYear',
  ],
  fromTick: 0,
  toTick: endOf(1880, 1920),
};

/**
 * Seed 603, tropical, archipelago preset, 256 tiles, 1880. Measured: forty
 * towns, four at 8,000, thirteen at 2,500 or more, and FIVE industries - three
 * forestries, a sawmill and an iron ore mine. No other stage of this campaign
 * carries fewer works.
 *
 * Quillmouth (#33) and Yarrowbridge (#21) are 28.2 tiles apart over fifteen
 * levels of climb. Both 8.4 route costs are on, so the alignment is priced.
 */
const STAGE_06: ShippedScenario = {
  id: 'eisenadern-06',
  title: 'Fuenf Werke',
  author: AUTHOR,
  briefing: {
    de:
      '1880, Tropen. Fuenf Industrien auf der ganzen Karte - so wenige traegt keine ' +
      'andere Etappe dieser Kampagne -, davon drei Forstbetriebe. Wer hier Geld ' +
      'verdienen will, faehrt Menschen. Zwischen Quillmouth und Yarrowbridge liegen 28 ' +
      'Tiles und 15 Hoehenstufen Auf und Ab. Beide Streckenkosten aus 8.4 sind ' +
      'eingeschaltet. Kein Konkurrent baut hier mit.',
    en:
      '1880, the tropics. Five industries on the whole map - no other stage of this ' +
      'campaign carries fewer - three of them forestries. Anyone earning money here ' +
      'carries people. Between Quillmouth and Yarrowbridge lie 28 tiles and 15 height ' +
      'levels of climb. Both route costs of 8.4 are on. No competitor builds alongside ' +
      'you here.',
  },
  goals: [
    {
      caption: {
        de: 'Quillmouth mit Yarrowbridge verbinden',
        en: 'Connect Quillmouth to Yarrowbridge',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 33,
        subjectB: 21,
        threshold: 1,
        goldTick: endOf(1880, 1888),
        silverTick: endOf(1880, 1895),
        bronzeTick: endOf(1880, 1905),
      },
    },
    {
      caption: {
        de: 'Eine Station 180 Tage lang auf Bewertung 65 halten',
        en: 'Hold a station at a rating of 65 for 180 days',
      },
      spec: {
        kind: GoalKind.StationRatingHold,
        subjectA: -1,
        subjectB: 180,
        threshold: 65,
        goldTick: endOf(1880, 1895),
        silverTick: endOf(1880, 1905),
        bronzeTick: endOf(1880, 1915),
      },
    },
  ],
  rules: {
    seed: 603,
    mapSize: 256,
    climate: MapClimate.Tropical,
    difficulty: Difficulty.Normal,
    startYear: 1880,
    mapgen: preset(MapPreset.Archipelago),
    aiCompanies: 0,
    inflation: true,
    emissions: false,
    occupancyPenalty: true,
    signalPenalty: true,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'goals',
    'mapSize',
    'mapgen',
    'occupancyPenalty',
    'seed',
    'signalPenalty',
    'startYear',
  ],
  fromTick: 0,
  toTick: endOf(1880, 1915),
};

// ---------------------------------------------------------------------------
// 1920 - the competitors arrive, and every seed was picked by playing it
// ---------------------------------------------------------------------------

/**
 * Seed 707, desert, continent preset, 256 tiles, 1920, two competitors.
 * Measured: forty towns, one at 8,000, thirteen at 2,500 or more, eleven
 * industries - three iron ore mines and two steel mills among them. The coal
 * mine at 171,60 is 16.1 tiles from the steel mill at 173,76, and the ore mine
 * at 174,68 is 8.1 tiles from the same works.
 *
 * The competitor probe: after six game years company 1 holds two stations and
 * six vehicles, company 2 nothing.
 */
const STAGE_07: ShippedScenario = {
  id: 'eisenadern-07',
  title: 'Erz und Stahl',
  author: AUTHOR,
  briefing: {
    de:
      '1920, Wueste. Elf Industrien, darunter drei Eisenerzgruben und zwei Stahlwerke. ' +
      'Von der naechsten Kohlegrube bis zum Stahlwerk sind es 16 Tiles, von der ' +
      'naechsten Erzgrube 8. Die CO2-Abgabe ist eingeschaltet. Und zum ersten Mal in ' +
      'dieser Kampagne bauen Konkurrenten mit: zwei, und sie fahren wirklich - nach ' +
      'sechs Jahren haelt einer von ihnen 2 Stationen und 6 Fahrzeuge.',
    en:
      '1920, desert. Eleven industries, three of them iron ore mines and two of them ' +
      'steel mills. From the nearest coal mine to the steel mill is 16 tiles, from the ' +
      'nearest ore mine 8. The carbon levy is on. And for the first time in this ' +
      'campaign competitors build too: two of them, and they really run - after six ' +
      'years one of them holds 2 stations and 6 vehicles.',
  },
  goals: [
    {
      caption: {
        de: '15.000 Einheiten Kohle ausliefern',
        en: 'Deliver 15,000 units of coal',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Coal,
        subjectB: -1,
        threshold: 15_000,
        goldTick: endOf(1920, 1935),
        silverTick: endOf(1920, 1945),
        bronzeTick: endOf(1920, 1955),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 900.000 EUR erreichen',
        en: 'Reach a company value of EUR 900,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(900_000),
        goldTick: endOf(1920, 1940),
        silverTick: endOf(1920, 1950),
        bronzeTick: endOf(1920, 1960),
      },
    },
  ],
  rules: {
    seed: 707,
    mapSize: 256,
    climate: MapClimate.Desert,
    difficulty: Difficulty.Normal,
    startYear: 1920,
    mapgen: preset(MapPreset.Continent),
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'emissions',
    'goals',
    'mapSize',
    'mapgen',
    'seed',
    'startYear',
  ],
  fromTick: 0,
  toTick: endOf(1920, 1960),
};

/**
 * Seed 31, arctic, continent preset, 256 tiles, 1920, two competitors.
 * Measured: forty towns, two at 8,000, eleven at 2,500 or more, thirteen
 * industries of which four are power stations. The coal mine at 138,142 is 18.4
 * tiles from the power station at 124,154; Brackcombe (#9) and Far-Bramwick
 * (#11) are 40.8 tiles and thirteen levels of climb apart.
 *
 * The seed was picked TWICE. The first candidate crewed a competitor with the
 * world rules off and stopped crewing when this stage's own three rules were
 * switched on, which is why the probe is run under the shipped rules and not
 * under a bare world.
 */
const STAGE_08: ShippedScenario = {
  id: 'eisenadern-08',
  title: 'Kohle im Eis',
  author: AUTHOR,
  briefing: {
    de:
      '1920, Arktis. Dreizehn Industrien, darunter vier Kraftwerke; von der Kohlegrube ' +
      'bis zum naechsten Kraftwerk sind es 18 Tiles. Zwischen Brackcombe und ' +
      'Far-Bramwick liegen 41 Tiles und 13 Hoehenstufen. Wetter mild, Strassenstau an, ' +
      'CO2-Abgabe an. Zwei Konkurrenten: nach sechs Jahren haelt einer 4 Stationen und ' +
      '6 Fahrzeuge, der andere nichts.',
    en:
      '1920, the arctic. Thirteen industries, four of them power stations; from the coal ' +
      'mine to the nearest power station is 18 tiles. Between Brackcombe and ' +
      'Far-Bramwick lie 41 tiles and 13 height levels. Weather mild, road congestion on, ' +
      'carbon levy on. Two competitors: after six years one holds 4 stations and 6 ' +
      'vehicles, the other nothing.',
  },
  goals: [
    {
      caption: {
        de: 'Brackcombe mit Far-Bramwick verbinden',
        en: 'Connect Brackcombe to Far-Bramwick',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 9,
        subjectB: 11,
        threshold: 1,
        goldTick: endOf(1920, 1932),
        silverTick: endOf(1920, 1940),
        bronzeTick: endOf(1920, 1950),
      },
    },
    {
      caption: {
        de: '12.000 Einheiten Kohle ausliefern',
        en: 'Deliver 12,000 units of coal',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Coal,
        subjectB: -1,
        threshold: 12_000,
        goldTick: endOf(1920, 1940),
        silverTick: endOf(1920, 1950),
        bronzeTick: endOf(1920, 1960),
      },
    },
  ],
  rules: {
    seed: 31,
    mapSize: 256,
    climate: MapClimate.Arctic,
    difficulty: Difficulty.Normal,
    startYear: 1920,
    mapgen: preset(MapPreset.Continent),
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: true,
    weather: WeatherRule.Mild,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'emissions',
    'goals',
    'mapSize',
    'mapgen',
    'roadCongestion',
    'seed',
    'startYear',
    'weather',
  ],
  fromTick: 0,
  toTick: endOf(1920, 1960),
};

/**
 * Seed 17, tropical, river-plain preset, 256 tiles, 1920, two competitors.
 * Measured: forty towns, five at 8,000, fifteen at 2,500 or more, eleven
 * industries - four power stations and three coal mines among them. The coal
 * mine at 86,29 is 14.0 tiles from the steel mill at 72,28, and the line
 * between them does not change height once.
 *
 * The elections rule is on here, which is the one world rule that reaches the
 * town council's rating and through it the growth formula (D-233).
 */
const STAGE_09: ShippedScenario = {
  id: 'eisenadern-09',
  title: 'Der Rat faehrt mit',
  author: AUTHOR,
  briefing: {
    de:
      '1920, Tropen. Elf Industrien, darunter vier Kraftwerke und drei Kohlegruben; von ' +
      'der naechsten Grube bis zum Stahlwerk sind es 14 Tiles. Fuenf Grossstaedte zu je ' +
      '8.000 Einwohnern. Die Ratswahlen sind eingeschaltet - ein gruener Rat wiegt Ihren ' +
      'Laerm doppelt, ein wirtschaftsfreundlicher halb. Zwei Konkurrenten: nach sechs ' +
      'Jahren haelt einer 9 Stationen und 6 Fahrzeuge.',
    en:
      '1920, the tropics. Eleven industries, four of them power stations and three of ' +
      'them coal mines; from the nearest mine to the steel mill is 14 tiles. Five cities ' +
      'of 8,000 inhabitants each. Council elections are on - a green council weighs your ' +
      'noise double, a business-friendly one halves it. Two competitors: after six years ' +
      'one holds 9 stations and 6 vehicles.',
  },
  goals: [
    {
      caption: {
        de: 'Eine Station 360 Tage lang auf Bewertung 70 halten',
        en: 'Hold a station at a rating of 70 for 360 days',
      },
      spec: {
        kind: GoalKind.StationRatingHold,
        subjectA: -1,
        subjectB: 360,
        threshold: 70,
        goldTick: endOf(1920, 1935),
        silverTick: endOf(1920, 1945),
        bronzeTick: endOf(1920, 1958),
      },
    },
    {
      caption: {
        de: '20.000 Einheiten Kohle ausliefern',
        en: 'Deliver 20,000 units of coal',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Coal,
        subjectB: -1,
        threshold: 20_000,
        goldTick: endOf(1920, 1945),
        silverTick: endOf(1920, 1955),
        bronzeTick: endOf(1920, 1965),
      },
    },
  ],
  rules: {
    seed: 17,
    mapSize: 256,
    climate: MapClimate.Tropical,
    difficulty: Difficulty.Normal,
    startYear: 1920,
    mapgen: preset(MapPreset.RiverPlain),
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: true,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'elections',
    'emissions',
    'goals',
    'mapSize',
    'mapgen',
    'seed',
    'startYear',
  ],
  fromTick: 0,
  toTick: endOf(1920, 1965),
};

// ---------------------------------------------------------------------------
// 1950 - the century, the hard purse, and the end
// ---------------------------------------------------------------------------

/**
 * Seed 19, temperate, river-plain preset, 256 tiles, 1950, two competitors,
 * Hard. Measured: forty towns, six at 8,000, thirteen at 2,500 or more, and
 * SEVENTEEN industries - more than any other stage of this campaign. Falkenau
 * (#4) and Neu-Reichenhofen (#24) are 25.0 tiles apart.
 *
 * The century rule of SPEC2 M21 is on from here to the end: the curve is drawn
 * at genesis, saved and hashed, and the monthly hooks only read it (D-236).
 */
const STAGE_10: ShippedScenario = {
  id: 'eisenadern-10',
  title: 'Konjunktur',
  author: AUTHOR,
  briefing: {
    de:
      '1950. Siebzehn Industrien - mehr traegt keine andere Etappe dieser Kampagne -, ' +
      'sechs Grossstaedte zu je 8.000 Einwohnern, und Falkenau und Neu-Reichenhofen ' +
      'trennen 25 Tiles. Die Konjunktur ist eingeschaltet: die Kurve steht bei der ' +
      'Weltgenese fest und entscheidet, was Ihre Fracht ueber die ganze Partie ' +
      'einbringt. Schwer, also 250.000 EUR Startkapital. Zwei Konkurrenten: nach sechs ' +
      'Jahren haelt einer 3 Stationen und 12 Fahrzeuge.',
    en:
      '1950. Seventeen industries - no other stage of this campaign carries more - six ' +
      'cities of 8,000 inhabitants each, and 25 tiles between Falkenau and ' +
      'Neu-Reichenhofen. The century is on: the curve is drawn at world genesis and ' +
      'decides what your freight earns over the whole game. Hard, so 250,000 EUR of ' +
      'starting capital. Two competitors: after six years one holds 3 stations and 12 ' +
      'vehicles.',
  },
  goals: [
    {
      caption: {
        de: 'Bis 1975 zahlungsfaehig bleiben',
        en: 'Stay solvent until 1975',
      },
      spec: {
        kind: GoalKind.SurviveUntil,
        subjectA: -1,
        subjectB: -1,
        threshold: endOf(1950, 1975),
        goldTick: endOf(1950, 1975),
        silverTick: endOf(1950, 1975),
        bronzeTick: endOf(1950, 1975),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 600.000 EUR erreichen',
        en: 'Reach a company value of EUR 600,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(600_000),
        goldTick: endOf(1950, 1965),
        silverTick: endOf(1950, 1975),
        bronzeTick: endOf(1950, 1985),
      },
    },
  ],
  rules: {
    seed: 19,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Hard,
    startYear: 1950,
    mapgen: preset(MapPreset.RiverPlain),
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: true,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'economy',
    'emissions',
    'goals',
    'mapSize',
    'mapgen',
    'seed',
    'startYear',
  ],
  fromTick: 0,
  toTick: endOf(1950, 1985),
};

/**
 * Seed 1102, desert, highland preset, 256 tiles, 1950, two competitors, Hard.
 * Measured: forty towns, four at 8,000, SEVENTEEN at 2,500 or more - more than
 * any other stage - and eleven industries: four iron ore mines, four steel
 * mills, two coal mines and a power station. The ore mine at 196,69 is 28.3
 * tiles from the steel mill at 168,65, and that is the CLOSEST of the sixteen
 * ore-to-steel pairs this map offers - which is what the briefing's "nearest"
 * says and what `CorridorClaim.nearest` now holds it to (D-256; the sentence
 * quoted 32 tiles, which is the pair 139,51 -> 168,65, the third shortest).
 *
 * Harsh weather, which the balance suite measures at 4.36 % of a freight year
 * on the reference coal line (D-204), and the century on top of it.
 */
const STAGE_11: ShippedScenario = {
  id: 'eisenadern-11',
  title: 'Harter Winter',
  author: AUTHOR,
  briefing: {
    de:
      '1950, Wueste. Elf Industrien: vier Eisenerzgruben, vier Stahlwerke, zwei ' +
      'Kohlegruben. Von der naechsten Erzgrube bis zum naechsten Stahlwerk sind es 28 ' +
      'Tiles. Siebzehn Orte ab 2.500 Einwohnern - mehr traegt keine andere Etappe. Das ' +
      'Wetter steht auf rau, die Konjunktur laeuft, 250.000 EUR Startkapital. Zwei ' +
      'Konkurrenten: nach sechs Jahren haelt einer 3 Stationen und 12 Fahrzeuge.',
    en:
      '1950, desert. Eleven industries: four iron ore mines, four steel mills, two coal ' +
      'mines. From the nearest ore mine to the nearest steel mill is 28 tiles. Seventeen ' +
      'towns at 2,500 inhabitants or more - no other stage carries more. Weather is set ' +
      'to harsh, the century runs, 250,000 EUR of starting capital. Two competitors: ' +
      'after six years one holds 3 stations and 12 vehicles.',
  },
  goals: [
    {
      caption: {
        de: '20.000 Einheiten Eisenerz ausliefern',
        en: 'Deliver 20,000 units of iron ore',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.IronOre,
        subjectB: -1,
        threshold: 20_000,
        goldTick: endOf(1950, 1970),
        silverTick: endOf(1950, 1980),
        bronzeTick: endOf(1950, 1990),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 750.000 EUR erreichen',
        en: 'Reach a company value of EUR 750,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(750_000),
        goldTick: endOf(1950, 1975),
        silverTick: endOf(1950, 1985),
        bronzeTick: endOf(1950, 1995),
      },
    },
  ],
  rules: {
    seed: 1102,
    mapSize: 256,
    climate: MapClimate.Desert,
    difficulty: Difficulty.Hard,
    startYear: 1950,
    mapgen: preset(MapPreset.Highland),
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Harsh,
    elections: false,
    economy: true,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'economy',
    'emissions',
    'goals',
    'mapSize',
    'mapgen',
    'seed',
    'startYear',
    'weather',
  ],
  fromTick: 0,
  toTick: endOf(1950, 1995),
};

/**
 * Seed 1202, arctic, continent preset, 256 tiles, 1950, THREE competitors,
 * Hard, and every world rule the game has. Measured: forty towns, two at 8,000
 * and only SEVEN at 2,500 or more - fewer than any other stage - and thirteen
 * industries, three of them refineries. The oil well at 125,158 is 28.1 tiles
 * from the refinery at 153,156; Gorsebourne (#9) and Far-Gorsestead (#24) are
 * 71.1 tiles apart.
 *
 * The competitor probe finds all three competitors on the field after six
 * years: company 2 with four stations and twelve vehicles, company 1 with four
 * stations and six, company 3 with two stations and six - re-measured in D-257,
 * where the Hard row of `DIFFICULTY_AI_TRAITS` stopped paying for a chain
 * look-ahead of two and this map's opponents built more (it read 4/0, 2/6 and
 * 0/0 before). Still the AI this project measured and not a better one (D-226).
 */
const STAGE_12: ShippedScenario = {
  id: 'eisenadern-12',
  title: 'Eisenadern',
  author: AUTHOR,
  briefing: {
    de:
      '1950, Arktis - und alles ist eingeschaltet: Konjunktur, Ratswahlen, raues ' +
      'Wetter, beide Streckenkosten aus 8.4, Strassenstau und die CO2-Abgabe. Sieben ' +
      'Orte ab 2.500 Einwohnern - weniger traegt keine andere Etappe -, dreizehn ' +
      'Industrien, davon drei Raffinerien. Von der naechsten Bohrstelle bis zur ' +
      'naechsten Raffinerie sind es 28 Tiles; zwischen Gorsebourne und Far-Gorsestead ' +
      'liegen 71 Tiles. Drei Konkurrenten: nach sechs Jahren haelt einer 4 Stationen ' +
      'und 12 Fahrzeuge. 250.000 EUR Startkapital.',
    en:
      '1950, the arctic - and everything is on: the century, council elections, harsh ' +
      'weather, both route costs of 8.4, road congestion and the carbon levy. Seven ' +
      'towns at 2,500 inhabitants or more - no other stage carries fewer - thirteen ' +
      'industries, three of them refineries. From the nearest well to the nearest ' +
      'refinery is 28 tiles; between Gorsebourne and Far-Gorsestead lie 71 tiles. Three ' +
      'competitors: after six years one holds 4 stations and 12 vehicles. 250,000 EUR ' +
      'of starting capital.',
  },
  goals: [
    {
      caption: {
        de: 'Gorsebourne mit Far-Gorsestead verbinden',
        en: 'Connect Gorsebourne to Far-Gorsestead',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 9,
        subjectB: 24,
        threshold: 1,
        goldTick: endOf(1950, 1962),
        silverTick: endOf(1950, 1970),
        bronzeTick: endOf(1950, 1985),
      },
    },
    {
      caption: {
        de: '25.000 Einheiten Oel ausliefern',
        en: 'Deliver 25,000 units of oil',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Oil,
        subjectB: -1,
        threshold: 25_000,
        goldTick: endOf(1950, 1975),
        silverTick: endOf(1950, 1985),
        bronzeTick: endOf(1950, 1995),
      },
    },
    {
      caption: {
        de: 'Bis 1990 zahlungsfaehig bleiben',
        en: 'Stay solvent until 1990',
      },
      spec: {
        kind: GoalKind.SurviveUntil,
        subjectA: -1,
        subjectB: -1,
        threshold: endOf(1950, 1990),
        goldTick: endOf(1950, 1990),
        silverTick: endOf(1950, 1990),
        bronzeTick: endOf(1950, 1990),
      },
    },
  ],
  rules: {
    seed: 1202,
    mapSize: 256,
    climate: MapClimate.Arctic,
    difficulty: Difficulty.Hard,
    startYear: 1950,
    mapgen: preset(MapPreset.Continent),
    aiCompanies: 3,
    inflation: true,
    emissions: true,
    occupancyPenalty: true,
    signalPenalty: true,
    roadCongestion: true,
    weather: WeatherRule.Harsh,
    elections: true,
    economy: true,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'economy',
    'elections',
    'emissions',
    'goals',
    'inflation',
    'mapSize',
    'mapgen',
    'occupancyPenalty',
    'roadCongestion',
    'seed',
    'signalPenalty',
    'startYear',
    'weather',
  ],
  fromTick: 0,
  toTick: endOf(1950, 1995),
};

/**
 * The twelve stages, in the order the campaign screen lists them.
 *
 * The order is the READING order and a topological order of {@link
 * CAMPAIGN_STAGES}; it is deliberately not the same statement as the unlock
 * graph, and `tests/unit/campaign.spec.ts` holds the two against each other.
 */
export const CAMPAIGN_SCENARIOS: readonly ShippedScenario[] = [
  STAGE_01,
  STAGE_02,
  STAGE_03,
  STAGE_04,
  STAGE_05,
  STAGE_06,
  STAGE_07,
  STAGE_08,
  STAGE_09,
  STAGE_10,
  STAGE_11,
  STAGE_12,
];

/**
 * One stage of the chain: the scenario it plays and what completing it opens.
 *
 * The edges point FORWARDS, which is what makes the graph a chain rather than a
 * list of prerequisites nobody can read: an author writes "finishing this opens
 * that", and {@link campaignPrerequisitesOf} reads the same table backwards for
 * the screen. A stage with incoming edges needs ALL of them - the graph joins as
 * well as branches, and "any one of them" would make a branch a choice between
 * two stages rather than two stages to play.
 */
export interface CampaignStage {
  readonly id: string;
  readonly unlocks: readonly string[];
}

/**
 * The chain. Twelve stages, one root, two branches that both rejoin.
 *
 * 01 -> {02, 03} -> 04 -> {05, 06} -> {07, 08} -> 09 -> {10, 11} -> 12.
 *
 * The shape is the campaign's own argument: the two 1850 side worlds are a pair
 * because they teach different things (a road business and a freight chain),
 * stage 4 needs both because it is the first stage with a world rule on it, and
 * the last join is what stops a player reaching the finale having played the
 * century rule OR harsh weather but never both.
 */
export const CAMPAIGN_STAGES: readonly CampaignStage[] = [
  { id: 'eisenadern-01', unlocks: ['eisenadern-02', 'eisenadern-03'] },
  { id: 'eisenadern-02', unlocks: ['eisenadern-04'] },
  { id: 'eisenadern-03', unlocks: ['eisenadern-04'] },
  { id: 'eisenadern-04', unlocks: ['eisenadern-05', 'eisenadern-06'] },
  { id: 'eisenadern-05', unlocks: ['eisenadern-07'] },
  { id: 'eisenadern-06', unlocks: ['eisenadern-08'] },
  { id: 'eisenadern-07', unlocks: ['eisenadern-09'] },
  { id: 'eisenadern-08', unlocks: ['eisenadern-09'] },
  { id: 'eisenadern-09', unlocks: ['eisenadern-10', 'eisenadern-11'] },
  { id: 'eisenadern-10', unlocks: ['eisenadern-12'] },
  { id: 'eisenadern-11', unlocks: ['eisenadern-12'] },
  { id: 'eisenadern-12', unlocks: [] },
];

/** The stage with this id, or null - the list is the enumeration. */
export function campaignScenarioById(id: string): ShippedScenario | null {
  for (const scenario of CAMPAIGN_SCENARIOS) {
    if (scenario.id === id) return scenario;
  }
  return null;
}

/** The stages that must be completed before `id` opens. Ascending by order. */
export function campaignPrerequisitesOf(id: string): readonly string[] {
  const needed: string[] = [];
  for (const stage of CAMPAIGN_STAGES) {
    if (stage.unlocks.includes(id)) needed.push(stage.id);
  }
  return needed;
}

/**
 * Whether `id` may be started, given the ids already completed.
 *
 * A pure function of the graph and a set, which is what lets the campaign
 * screen, the end screen and the test all ask the same question. It never
 * consults a profile: WHERE the completed set is kept is the next bundle's
 * business (`profile.json`, SPEC2 M24), and nothing about the graph changes
 * when it arrives.
 */
export function isCampaignStageUnlocked(id: string, completed: ReadonlySet<string>): boolean {
  const needed = campaignPrerequisitesOf(id);
  for (const one of needed) {
    if (!completed.has(one)) return false;
  }
  return true;
}

/** Every stage that may be started right now, in campaign order. */
export function unlockedCampaignStages(completed: ReadonlySet<string>): readonly string[] {
  const open: string[] = [];
  for (const stage of CAMPAIGN_STAGES) {
    if (isCampaignStageUnlocked(stage.id, completed)) open.push(stage.id);
  }
  return open;
}
