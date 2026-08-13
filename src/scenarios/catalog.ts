import { Cargo } from '../sim/cargo/types';
import {
  CENTS_PER_EURO,
  Difficulty,
  MapClimate,
  START_YEAR,
  WeatherRule,
} from '../sim/constants';
import { GoalKind } from '../sim/goals/types';
import type { ShippedScenario } from './types';
import { endOfYearIn } from './years';

/**
 * The eight scenarios that ship with the game (SPEC2 M17).
 *
 * Every one of them is TEXT: a seed, a set of world rules, a goal list and a
 * briefing in both languages. The world is generated when the player presses
 * start, which is why eight scenarios cost eight paragraphs rather than eight
 * megabytes, and why they double as determinism fixtures - the same seed and
 * the same rules are the same world on every machine (law #3).
 *
 * **The seeds were chosen by generating the world and looking at it**, never by
 * assertion. Each entry below records what its map actually holds, measured at
 * 256 tiles with the climate the entry names: a mountain scenario has a ridge
 * between the towns it names, an island scenario has a town on an island, a
 * freight scenario has mines AND somewhere for their output to go. Terrain and
 * town placement do not depend on the climate (relief and hydrology run before
 * the biomes), but INDUSTRY placement does - which is why the arctic entry
 * carries no freight goal: at that climate its map grows two coal mines and
 * nothing that burns coal, so a coal goal there would be unachievable by
 * construction.
 *
 * **The thresholds are calibrated against measurements, not against feeling.**
 * The figures the bands are built on, all four re-measured on this build in the
 * M17 acceptance pass (D-197) - the third of them was wrong by a game year:
 *
 *  - four 1950 buses between two towns of 8,000 at 28 tiles deliver
 *    **21,393 passengers in their first game year** (the M6 bus-line world,
 *    four buses instead of two; 64,893 cumulative over three years).
 *  - one 1950 coal train of eight wagons over 45 tiles delivers
 *    **1,400-2,000 units of coal a year** (the M6 coal world; 16,360
 *    cumulative over ten years, the yearly steps falling as the mine's
 *    platform queue settles).
 *  - a town of 8,000 that nobody serves FALLS to **7,520 after twenty game
 *    years, 7,400 after twenty-five, and 7,376 by the END of 1975** - in the
 *    desert as well as in a temperate climate, because SPEC.md 13.2's
 *    "-0,03 %/Monat ohne jede Versorgung" is a flat rate that carries neither
 *    the terrain factor nor the council's opinion with it (SPEC2 M20 bundle 2;
 *    until then an unserved town GREW, to 10,574 temperate and 9,248 desert).
 *    Both curves are played out and pinned in
 *    `tests/unit/shippedScenarios.spec.ts` (the desert one on the Ueberleben
 *    seed with its four competitors taken out - "unserved" is not a thing that
 *    can be measured in a world where somebody else is building). The samples
 *    are one game year apart and which one a threshold has to clear is decided
 *    by its band tick: `endOfYear(Y)` is the year Y running OUT, so it is the
 *    second figure of each pair.
 *    Full passenger service multiplies the growth rate by 1.55, goods and food
 *    by a further 0.45 each and building material by 0.35 (`TOWN_GROWTH_*` in
 *    constants.ts), so a population goal is now a goal about SERVICE twice
 *    over: what a town gains AND what it stops losing.
 *  - a competent network gains at most ~840,000 EUR of company value over a
 *    quarter century, and the strongest measured AI company reached 1.12
 *    million from a 500,000 start (D-158). Nothing here asks for more than
 *    that.
 *
 * What is NOT claimed: that every gold band has been played to. The bands are
 * anchored on those four measurements and on the structural checks in
 * `tests/unit/shippedScenarios.spec.ts` - every named town exists, every cargo
 * a goal counts has a producer and an acceptor on the map, and no goal is
 * decided in the first game year by a player who does nothing.
 *
 * **The player-facing TEXT of these eight entries is bound to their worlds,
 * and their doc comments are not.** That line is worth stating exactly, because
 * an earlier wording of this paragraph claimed "every load-bearing claim each
 * entry below makes about its own world is pinned" - which read as covering the
 * comments too, and does not (D-199):
 *
 *  - **Briefings and goal captions are read back.** Every NUMBER, in reading
 *    order, is either resolved out of `SCENARIO_WORLD_CLAIMS` (or out of this
 *    entry's own rules, goals and constants) or on a short allowlist with the
 *    reason no world property can justify it - `SCENARIO_BRIEFING_FIGURES`,
 *    D-198. Every PLACE NAME is likewise a town of that scenario's own world,
 *    matched by the map generator's own name grammar - D-199. Both languages
 *    are held to the same list, so a figure or a town that changes in one
 *    sentence and not in the other is a red build too.
 *  - **These doc comments are not scanned.** They are developer prose, and they
 *    mix measured world facts with the provenance of measurements taken in
 *    OTHER worlds, with cross-references, and with history that deliberately
 *    quotes figures now known to be WRONG. What holds them is that the figures
 *    worth pinning are IN the claims table - industry positions, each mine's
 *    nearest plant, the land mass under a named town, the passive growth
 *    curves, a corridor's height band - so a seed or mapgen change moves the
 *    table and the comment beside it is corrected by whoever fixes the table.
 *    A comment that drifts on its own is caught by a reader, not by a build.
 *    D-199 records why the scanner stops here and what it measured first.
 */

/** The last tick of `year` - "by the end of 1958" as the hook measures it. */
function endOfYear(year: number): number {
  return endOfYearIn(START_YEAR, year);
}

export { scenarioYearOf } from './years';

/** Money thresholds are cents like every other figure in the simulation. */
function euro(amount: number): number {
  return amount * CENTS_PER_EURO;
}

const AUTHOR = 'Iron Veins';

// ---------------------------------------------------------------------------

/**
 * Seed 88, temperate, 256 tiles. Measured: four coal mines and TWO power
 * plants, at 148,83 and 155,112. Each mine's NEAREST plant is 57, 59, 70 and
 * 106 tiles away, and it is the SAME plant for all four - the one at 155,112;
 * no mine is nearer to the other plant, which is what makes this one freight
 * map rather than two. (The M17 acceptance pass said "three of the four" here and
 * that was wrong by one: measured, the mine at 101,129 is 57 tiles from
 * 155,112 against 66 from 148,83, and the other three are further from the
 * second plant still - D-198.) The ground between them is gentle: the two
 * short corridors climb and fall 16 and 12 levels, the 70-tile one 12, the
 * long 106-tile one 25. A freight map.
 *
 * Both halves of the comparison in brackets are pinned since D-199: the mine's
 * own position joined `industriesAt`, and the 66 is the fifth corridor in
 * `SCENARIO_WORLD_CLAIMS` - before that the sentence rested on a coordinate and
 * a distance nothing measured.
 */
const FRACHTRAUSCH: ShippedScenario = {
  id: 'frachtrausch',
  title: 'Frachtrausch',
  author: AUTHOR,
  briefing: {
    de:
      'Vier Kohlegruben, zwei Kraftwerke, flaches Land dazwischen - und niemand, ' +
      'der die Kohle bewegt. Von jeder Grube bis zum naechsten Kraftwerk sind es ' +
      '57, 59, 70 und 106 Tiles. Ein Zug mit acht Wagen schafft rund 1.700 Einheiten ' +
      'im Jahr; fuer Gold brauchen Sie mehrere Zuege und einen frueheren Anfang, als ' +
      'Ihnen lieb ist.',
    en:
      'Four coal mines, two power stations, easy ground in between - and nobody ' +
      'moving the coal. From each mine to its nearest power station is 57, 59, 70 ' +
      'and 106 tiles. One train of eight wagons carries some 1,700 units a year; ' +
      'gold needs several trains and an earlier start than is comfortable.',
  },
  goals: [
    {
      caption: {
        de: '25.000 Einheiten Kohle ausliefern',
        en: 'Deliver 25,000 units of coal',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Coal,
        subjectB: -1,
        threshold: 25_000,
        goldTick: endOfYear(1958),
        silverTick: endOfYear(1963),
        bronzeTick: endOfYear(1970),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 1,2 Mio. EUR erreichen',
        en: 'Reach a company value of EUR 1.2m',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(1_200_000),
        goldTick: endOfYear(1962),
        silverTick: endOfYear(1968),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 88,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Normal,
    startYear: START_YEAR,
    aiCompanies: 1,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 360, temperate, 256 tiles. Measured: forty towns, SEVENTEEN of them at
 * 2,500 inhabitants or more, and EIGHT OF THOSE SEVENTEEN at 8,000 - the eight
 * are inside the seventeen, not beside them. No other of the eight scenarios
 * carries more towns of 2,500 or more. Four of the eight cities stand in a
 * chain across the middle of the map: Nieder-Weidengrund (17) to
 * Kaiserskirchen (16) is 33 tiles, Rosenburg (18) another 37 beyond,
 * Ahorngrund (5) another 30, and all three corridors are dry land climbing and
 * falling nine levels at worst.
 *
 * **The seed changed in the M17 acceptance pass (D-197).** The previous one
 * (10) carries SEVEN cities of 8,000 while both this comment and the
 * player-facing briefing promised eight - a briefing that lied about its own
 * world. Four hundred seeds were generated at 256 tiles and temperate climate
 * and exactly three of them carry eight cities: 28 (which is
 * Rats-Diplomatie's), 53 and 360. 360 was taken because it also has the
 * seventeen towns of 2,500 the old comment claimed.
 *
 * **The sentence changed in the acceptance pass after that one (D-198).** "Acht
 * Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab 2.500" was true of
 * this world and still read as eight plus seventeen - twenty-five settlements
 * where the map has forty, seventeen of which clear the 2,500 the sentence
 * names. Two true numbers joined by "und" state a partition; these two are a
 * set and a subset, and both languages say so now. The other seven briefings
 * were read for the same defect and none of them nests a set inside another.
 *
 * **And the four names in the pass after that one (D-199).** The same verifier
 * renamed Rosenburg to Rosenheim and Ahorngrund to Ahornthal in the GERMAN
 * briefing alone - two towns this map does not carry, with the English briefing
 * left saying the real ones - and the build stayed green: the numbers were
 * bound, the names beside them were not. The chain is a declared sequence now
 * (`briefingTowns`), read back out of both briefings against the world.
 */
const PASSAGIERNETZ: ShippedScenario = {
  id: 'passagiernetz',
  title: 'Passagiernetz',
  author: AUTHOR,
  briefing: {
    de:
      'Vierzig Orte stehen auf der Karte, siebzehn davon haben 2.500 Einwohner oder ' +
      'mehr, und acht von diesen siebzehn sind Grossstaedte zu je 8.000 - keine der ' +
      'acht Karten traegt mehr Orte ab 2.500. Vier der Grossstaedte stehen als Kette ' +
      'quer ueber die Mitte: Nieder-Weidengrund und Kaiserskirchen trennen 33 Tiles, ' +
      'Rosenburg liegt weitere 37 dahinter, Ahorngrund noch einmal 30. Hier zaehlt ' +
      'nicht die eine gute Linie, sondern das Netz: vier Busse auf einem Staedtepaar ' +
      'bringen rund 21.000 Fahrgaeste im Jahr, und 200.000 sind mit einem Paar allein ' +
      'nicht zu holen. Zwei Konkurrenten fahren mit.',
    en:
      'Forty towns stand on the map, seventeen of them have 2,500 inhabitants or ' +
      'more, and eight of those seventeen are cities of 8,000 - no other of the eight ' +
      'maps carries more towns of 2,500. Four of the cities stand in a chain across ' +
      'the middle: 33 tiles between Nieder-Weidengrund and Kaiserskirchen, another 37 ' +
      'out to Rosenburg, another 30 to Ahorngrund. This is not about one good line ' +
      'but about a network: four buses on one pair of towns carry some 21,000 ' +
      'passengers a year, and 200,000 will not come from one pair. Two competitors ' +
      'are running as well.',
  },
  goals: [
    {
      caption: {
        de: 'Nieder-Weidengrund und Kaiserskirchen verbinden',
        en: 'Connect Nieder-Weidengrund and Kaiserskirchen',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 17,
        subjectB: 16,
        threshold: 1,
        goldTick: endOfYear(1953),
        silverTick: endOfYear(1956),
        bronzeTick: endOfYear(1960),
      },
    },
    {
      caption: {
        de: '200.000 Pendler befoerdern',
        en: 'Carry 200,000 commuters',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.CommuterPax,
        subjectB: -1,
        threshold: 200_000,
        goldTick: endOfYear(1960),
        silverTick: endOfYear(1965),
        bronzeTick: endOfYear(1972),
      },
    },
    {
      caption: {
        de: 'Eine Station 180 Tage lang auf Bewertung 70 halten',
        en: 'Hold a station at a rating of 70 for 180 days',
      },
      spec: {
        kind: GoalKind.StationRatingHold,
        subjectA: -1,
        subjectB: 180,
        threshold: 70,
        goldTick: endOfYear(1962),
        silverTick: endOfYear(1968),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 360,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Normal,
    startYear: START_YEAR,
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
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 148, arctic, 256 tiles. Measured: the straight line from Wrenmoor (3,
 * 8,000) to Nettlewick (18, 2,500) is 60 tiles long, climbs and falls through
 * 27 height levels, spans heights 2 to 13 - eleven levels, 88 m - and crosses
 * eight tiles of water. The steepest long corridor between two real towns in
 * two hundred scanned seeds. The tonnage goal here is passengers, because a
 * mountain scenario is about the corridor.
 *
 * **That sentence used to give a different reason and the reason was a defect
 * (D-249).** It read "at this climate the map grows three coal mines, two iron
 * ore mines and nothing that accepts either", and it was true: an arctic map
 * is snow from shore to summit, and until D-249 only the two MINES stood on a
 * placement rule that named snow. This world grows ELEVEN works now - one coal
 * mine, five iron ore mines, two oil wells, a power station, a steel mill and a
 * machine works - and the corridor, the towns and every figure the briefing
 * quotes are exactly what they were, because the climate table decides what may
 * stand somewhere and never where a town goes.
 *
 * The two towns are named in English since SPEC2 M23 (D-246): an arctic world
 * names its places from the English syllable set that closes SPEC.md 6.5. The
 * GROUND did not move - the corridor is the same sixty tiles through the same
 * twenty-seven levels, which is why every figure the briefing quotes is
 * unchanged and only the two names in it are not.
 *
 * The BAND 2 to 13 is pinned since D-199 (`CorridorClaim.heights`); the claims
 * table held only the difference before, and "spans 2 to 13" would have read
 * true over a corridor running from 5 to 16.
 */
const GEBIRGSLOGISTIK: ShippedScenario = {
  id: 'gebirgslogistik',
  title: 'Gebirgslogistik',
  author: AUTHOR,
  briefing: {
    de:
      'Zwischen Wrenmoor und Nettlewick liegen 60 Tiles Luftlinie - und elf ' +
      'Hoehenstufen zwischen dem tiefsten und dem hoechsten Punkt der Geraden, also ' +
      '88 Meter, dazu acht Tiles Wasser. Die gerade Linie ist die teuerste; die ' +
      'Steigungsregel misst ueber ein Fenster, nicht von Tile zu Tile, also gewinnt ' +
      'hier, wer den Umweg am Hang findet. Die Streckenkosten aus 8.4 sind ' +
      'eingeschaltet: belegte Abschnitte und Signale kosten den Zug etwas.',
    en:
      'Sixty tiles of straight line lie between Wrenmoor and Nettlewick - and ' +
      'eleven height levels between its lowest and its highest point, which is 88 ' +
      'metres, plus eight tiles of water. The direct route is the expensive one; the ' +
      'gradient rule measures over a window rather than tile to tile, so the win goes ' +
      'to whoever finds the detour along the slope. The 8.4 route costs are on: a ' +
      'claimed section and a signal both cost a train.',
  },
  goals: [
    {
      caption: {
        de: 'Wrenmoor und Nettlewick verbinden',
        en: 'Connect Wrenmoor and Nettlewick',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 3,
        subjectB: 18,
        threshold: 1,
        goldTick: endOfYear(1955),
        silverTick: endOfYear(1960),
        bronzeTick: endOfYear(1968),
      },
    },
    {
      caption: {
        de: '60.000 Pendler ueber die Berge bringen',
        en: 'Carry 60,000 commuters over the mountains',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.CommuterPax,
        subjectB: -1,
        threshold: 60_000,
        goldTick: endOfYear(1963),
        silverTick: endOfYear(1969),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 148,
    mapSize: 256,
    climate: MapClimate.Arctic,
    difficulty: Difficulty.Normal,
    startYear: START_YEAR,
    aiCompanies: 1,
    inflation: true,
    emissions: true,
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
  toTick: endOfYear(1975),
};

/**
 * Seed 67, tropical, 256 tiles. Measured: three inhabited land masses. The
 * 45,084-tile mainland carries Lower-Falconhaven (23, 8,000); a 252-tile
 * island off the south-east corner carries Heathermoor (8, 8,000) 52 tiles
 * away across open water; a third islet of 27 tiles carries a village. Which town stands
 * on which land mass is pinned as a PAIR since D-198 - the sorted sizes alone
 * would still hold if the two cities swapped islands, and then the scenario
 * would be a different one. Two cities of 8,000 with sea between them is what
 * "island hopping" means here - no bridge can span it, so the connection is a
 * ship or it is nothing.
 *
 * Both towns are named in English since SPEC2 M23 (D-246), and the map grows
 * the tropical industry set: twelve works, among them the forestry, the sawmill
 * and the FURNITURE FACTORY that are the timber arm no other climate but the
 * temperate one has. Nine works until D-249, and the three that were missing
 * are the point of that entry - a `NEAR_TOWN` rule reaches 5.8 % of a
 * rainforest map, so the arm this climate is recognised by had no terminal
 * works on it. The islands, the distances and the populations are the same
 * world.
 */
const INSELHUEPFEN: ShippedScenario = {
  id: 'inselhuepfen',
  title: 'Inselhuepfen',
  author: AUTHOR,
  briefing: {
    de:
      'Heathermoor hat 8.000 Einwohner und liegt auf einer Insel. Lower-Falconhaven ' +
      'hat ebenso viele und liegt 52 Tiles entfernt auf dem Festland. Dazwischen ist ' +
      'offenes Meer - keine Bruecke, keine Strasse, kein Gleis. Ein Kai bewegt ' +
      'uebrigens nie den Stationsmittelpunkt: die Reichweite wird vom Zentrum aus ' +
      'gemessen, nicht von der Mole.',
    en:
      'Heathermoor has 8,000 inhabitants and sits on an island. Lower-Falconhaven has ' +
      'as many and sits 52 tiles away on the mainland. Between them is open sea - ' +
      'no bridge, no road, no track. A quay never moves the station centre, by the ' +
      'way: catchment is measured from the centre, not from the berth.',
  },
  goals: [
    {
      caption: {
        de: 'Lower-Falconhaven und Heathermoor verbinden',
        en: 'Connect Lower-Falconhaven and Heathermoor',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 23,
        subjectB: 8,
        threshold: 1,
        goldTick: endOfYear(1956),
        silverTick: endOfYear(1962),
        bronzeTick: endOfYear(1970),
      },
    },
    {
      caption: {
        de: '40.000 Pendler ueber das Wasser bringen',
        en: 'Carry 40,000 commuters across the water',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.CommuterPax,
        subjectB: -1,
        threshold: 40_000,
        goldTick: endOfYear(1962),
        silverTick: endOfYear(1968),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 67,
    mapSize: 256,
    climate: MapClimate.Tropical,
    difficulty: Difficulty.Normal,
    startYear: START_YEAR,
    aiCompanies: 1,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 12, temperate, 256 tiles, HARD (250,000 to start with). Measured: seven
 * towns of 8,000, three farms and three food factories - the full food chain
 * standing idle. Erlenbach (32) is one of the big towns; unserved it FALLS to
 * 7,496 by the end of 1970 and 7,376 by the end of 1975, so the 11,000 asked
 * for below cannot be waited out - and since SPEC2 M20 bundle 2 it cannot be
 * approached by waiting either, because a town nobody serves shrinks. This
 * world has no competitors at all, which is what makes it the one the passive
 * growth curve is played out on (`shippedScenarios.spec.ts`): both figures
 * above are pinned there, and so are the 7,520 and 7,400 the catalogue header
 * quotes at twenty and twenty-five game years.
 */
const WIEDERAUFBAU: ShippedScenario = {
  id: 'wiederaufbau',
  title: 'Wiederaufbau',
  author: AUTHOR,
  briefing: {
    de:
      'Sieben Grossstaedte, drei Bauernhoefe, drei Lebensmittelwerke - und 250.000 ' +
      'EUR Startkapital. Die Kette steht still, und eine Stadt ohne Anschluss ' +
      'waechst nicht, sie schrumpft: Erlenbach faellt unbedient bis Ende 1975 auf ' +
      '7.376 Einwohner. Die 11.000 muessen Sie herbeifahren. Wer nur zusieht, ist ' +
      'vorher zahlungsunfaehig.',
    en:
      'Seven cities, three farms, three food factories - and 250,000 EUR to start ' +
      'with. The chain is idle, and a town nobody serves does not grow, it shrinks: ' +
      'by the end of 1975 an unserved Erlenbach would be down to 7,376 inhabitants. ' +
      'The 11,000 asked for has to be carried in. Anybody who only watches is ' +
      'insolvent before then.',
  },
  goals: [
    {
      caption: {
        de: '4.000 Einheiten Lebensmittel ausliefern',
        en: 'Deliver 4,000 units of food',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Food,
        subjectB: -1,
        threshold: 4_000,
        goldTick: endOfYear(1960),
        silverTick: endOfYear(1966),
        bronzeTick: endOfYear(1974),
      },
    },
    {
      caption: {
        de: 'Erlenbach auf 11.000 Einwohner bringen',
        en: 'Grow Erlenbach to 11,000 inhabitants',
      },
      spec: {
        kind: GoalKind.TownPopulationReach,
        subjectA: 32,
        subjectB: -1,
        threshold: 11_000,
        goldTick: endOfYear(1968),
        silverTick: endOfYear(1972),
        bronzeTick: endOfYear(1975),
      },
    },
    {
      caption: {
        de: 'Bis 1975 zahlungsfaehig bleiben',
        en: 'Stay solvent until 1975',
      },
      spec: {
        kind: GoalKind.SurviveUntil,
        subjectA: -1,
        subjectB: -1,
        threshold: endOfYear(1975),
        goldTick: endOfYear(1975),
        silverTick: endOfYear(1975),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 12,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Hard,
    startYear: START_YEAR,
    aiCompanies: 0,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'inflation', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 28, temperate, 256 tiles. Measured: NINE towns of 8,000 and only eleven
 * industries - the map where the councils of 13.3 matter more than any chain.
 * Falkenheim (16) is one of the nine, and it starts at the same 8,000 in the
 * same climate as Wiederaufbau's Erlenbach, whose passive curve IS played out
 * and pinned: 7,496 by the end of 1970, 7,376 by the end of 1975 - it falls,
 * since SPEC2 M20 bundle 2. That is where the 11,000 asked for below comes
 * from, and it was already above the line when the line still rose. Falkenheim itself is not played
 * out, and could not be honestly: this world has three competitors in it, and
 * one of them serving the town is exactly what the goal is asking the player
 * to do first (D-198 - the earlier comment quoted the figures as if they had
 * been measured HERE). Road congestion is on, so a fourth bus on a full street
 * buys less than the first one did.
 */
const RATSDIPLOMATIE: ShippedScenario = {
  id: 'ratsdiplomatie',
  title: 'Rats-Diplomatie',
  author: AUTHOR,
  briefing: {
    de:
      'Neun Staedte zu 8.000 Einwohnern, elf Industrien, drei Konkurrenten - hier ' +
      'entscheidet nicht die Fracht, sondern der Stadtrat. Er bewertet, was eine ' +
      'Firma TUT, und was er sieht, verfaellt langsam wieder. Ein ganzes Jahr lang ' +
      'Bewertung 75 an einer Station zu halten heisst: Takt halten, wenn es teuer ' +
      'wird. Der Strassenverkehr staut sich; die vierte Buslinie bringt weniger als ' +
      'die erste.',
    en:
      'Nine towns of 8,000, eleven industries, three competitors - here it is the ' +
      'council that decides rather than the freight. It rates what a company DOES, ' +
      'and what it saw decays again. Holding a station at 75 for a whole year means ' +
      'keeping the interval when it gets expensive. Road traffic jams: the fourth ' +
      'bus line earns less than the first.',
  },
  goals: [
    {
      caption: {
        de: 'Eine Station 360 Tage lang auf Bewertung 75 halten',
        en: 'Hold a station at a rating of 75 for 360 days',
      },
      spec: {
        kind: GoalKind.StationRatingHold,
        subjectA: -1,
        subjectB: 360,
        threshold: 75,
        goldTick: endOfYear(1958),
        silverTick: endOfYear(1964),
        bronzeTick: endOfYear(1972),
      },
    },
    {
      caption: {
        de: 'Falkenheim auf 11.000 Einwohner bringen',
        en: 'Grow Falkenheim to 11,000 inhabitants',
      },
      spec: {
        kind: GoalKind.TownPopulationReach,
        subjectA: 16,
        subjectB: -1,
        threshold: 11_000,
        goldTick: endOfYear(1970),
        silverTick: endOfYear(1973),
        bronzeTick: endOfYear(1975),
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
        goldTick: endOfYear(1962),
        silverTick: endOfYear(1968),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 28,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Normal,
    startYear: START_YEAR,
    aiCompanies: 3,
    inflation: false,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: true,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'mapgen', 'roadCongestion', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 27, temperate, 256 tiles, EASY (800,000 to start with), nobody else on
 * the map. Measured: Nieder-Kaisershofen (5) and Haselstadt (18) are both
 * 8,000 strong, 29 tiles apart, and the ground between them climbs three
 * levels in total - the flattest big-town pair in two hundred scanned seeds.
 * Four buses on a pair like that deliver 21,400 passengers a year, so the
 * 20,000 below is roughly one year of a line that is already running: the
 * whole scenario is how fast you can get it running.
 */
const SPEEDRUN: ShippedScenario = {
  id: 'speedrun',
  title: 'Speedrun',
  author: AUTHOR,
  briefing: {
    de:
      'Zwei Staedte zu 8.000 Einwohnern, 29 Tiles auseinander, drei Hoehenstufen ' +
      'dazwischen - flacher wird es nicht. 800.000 EUR liegen bereit, niemand macht ' +
      'Ihnen Konkurrenz. Vier Busse bringen auf so einem Paar 21.400 Fahrgaeste im ' +
      'Jahr. Die Frage ist nur, wie schnell sie fahren.',
    en:
      'Two towns of 8,000, 29 tiles apart, three height levels between them - it ' +
      'gets no flatter. 800,000 EUR are waiting and nobody is competing with you. ' +
      'Four buses on a pair like that carry 21,400 passengers a year. The only ' +
      'question is how quickly they start running.',
  },
  goals: [
    {
      caption: {
        de: 'Nieder-Kaisershofen und Haselstadt verbinden',
        en: 'Connect Nieder-Kaisershofen and Haselstadt',
      },
      spec: {
        kind: GoalKind.ConnectStations,
        subjectA: 5,
        subjectB: 18,
        threshold: 1,
        goldTick: endOfYear(1950),
        silverTick: endOfYear(1951),
        bronzeTick: endOfYear(1953),
      },
    },
    {
      caption: {
        de: '20.000 Pendler befoerdern',
        en: 'Carry 20,000 commuters',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.CommuterPax,
        subjectB: -1,
        threshold: 20_000,
        goldTick: endOfYear(1952),
        silverTick: endOfYear(1954),
        bronzeTick: endOfYear(1957),
      },
    },
  ],
  rules: {
    seed: 27,
    mapSize: 256,
    climate: MapClimate.Temperate,
    difficulty: Difficulty.Easy,
    startYear: START_YEAR,
    aiCompanies: 0,
    inflation: false,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'inflation', 'mapSize', 'mapgen', 'seed', 'startYear'],
  fromTick: 0,
  toTick: endOfYear(1957),
};

/**
 * Seed 69, desert, 256 tiles, HARD, four competitors, every world rule the
 * game has switched ON. Measured: eleven industries and only two towns of
 * 8,000,
 * the rest at 2,500 or below - a thin offer for five companies, and one that
 * does not grow at all: a desert town of 8,000 that nobody serves is down to
 * 7,376 by the end of 1975, which is exactly what a temperate one reaches,
 * because SPEC.md 13.2's shrinkage is a flat rate with no climate and no
 * terrain in it (SPEC2 M20 bundle 2; before it the two curves parted at 9,248
 * and 10,574). That desert figure is played out and pinned on THIS seed with
 * the four competitors taken out (`shippedScenarios.spec.ts`, D-198):
 * "unserved" is not a property a world with four builders in it can be asked
 * about. Surviving a quarter
 * century here is the goal, and it is not a formality: the measured
 * quarter-century AI games wind up two companies in three (D-109).
 */
const UEBERLEBEN: ShippedScenario = {
  id: 'ueberleben',
  title: 'Ueberleben',
  author: AUTHOR,
  briefing: {
    de:
      'Wueste, elf Industrien, zwei Grossstaedte - und vier Konkurrenten auf ' +
      '250.000 EUR Startkapital. Jede Weltregel ist eingeschaltet: Inflation, ' +
      'CO2-Abgabe, beide Streckenkosten aus 8.4 und der Strassenstau. Drei Monate ' +
      'in den roten Zahlen sind eine Warnung, zwoelf das Ende. Bis 1975 zu ' +
      'ueberleben ist hier keine Formsache.',
    en:
      'Desert, eleven industries, two cities - and four competitors, on 250,000 EUR of ' +
      'starting capital. Every world rule is on: inflation, the carbon levy, both ' +
      '8.4 route costs and road congestion. Three months in the red are a warning, ' +
      'twelve are the end. Surviving to 1975 here is not a formality.',
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
        threshold: endOfYear(1975),
        goldTick: endOfYear(1975),
        silverTick: endOfYear(1975),
        bronzeTick: endOfYear(1975),
      },
    },
    {
      caption: {
        de: 'Firmenwert von 400.000 EUR erreichen',
        en: 'Reach a company value of EUR 400,000',
      },
      spec: {
        kind: GoalKind.CompanyValueBy,
        subjectA: -1,
        subjectB: -1,
        threshold: euro(400_000),
        goldTick: endOfYear(1960),
        silverTick: endOfYear(1967),
        bronzeTick: endOfYear(1975),
      },
    },
  ],
  rules: {
    seed: 69,
    mapSize: 256,
    climate: MapClimate.Desert,
    difficulty: Difficulty.Hard,
    startYear: START_YEAR,
    aiCompanies: 4,
    inflation: true,
    emissions: true,
    occupancyPenalty: true,
    signalPenalty: true,
    roadCongestion: true,
    weather: WeatherRule.Off,
    elections: false,
    economy: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
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
  ],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * The eight, in the order the browser lists them: the two that teach the game
 * first, the three that are about a landscape, then the three that are about a
 * constraint.
 */
export const SHIPPED_SCENARIOS: readonly ShippedScenario[] = [
  SPEEDRUN,
  PASSAGIERNETZ,
  FRACHTRAUSCH,
  GEBIRGSLOGISTIK,
  INSELHUEPFEN,
  WIEDERAUFBAU,
  RATSDIPLOMATIE,
  UEBERLEBEN,
];

/** The scenario with this id, or null. */
export function scenarioById(id: string): ShippedScenario | null {
  for (let i = 0; i < SHIPPED_SCENARIOS.length; i++) {
    const scenario = SHIPPED_SCENARIOS[i]!;
    if (scenario.id === id) return scenario;
  }
  return null;
}
