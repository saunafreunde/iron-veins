import { Cargo } from '../sim/cargo/types';
import {
  CENTS_PER_EURO,
  Difficulty,
  MapClimate,
  START_YEAR,
  TICKS_PER_YEAR,
} from '../sim/constants';
import { GoalKind } from '../sim/goals/types';
import type { ShippedScenario } from './types';

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
 *  - a town of 8,000 that nobody serves reaches **9,925 after twenty game
 *    years, 10,465 after twenty-five, and 10,574 by the END of 1975** in a
 *    temperate climate; in the desert **9,200 after twenty-five years and
 *    9,248 by the end of 1975**. All six figures are played out and pinned in
 *    `tests/unit/shippedScenarios.spec.ts` (the desert pair on the Ueberleben
 *    seed with its four competitors taken out - "unserved" is not a thing that
 *    can be measured in a world where somebody else is building). The pairs are
 *    one game year apart and which one a threshold has to clear is decided by
 *    its band tick: `endOfYear(Y)` is the year Y running OUT, so it is the
 *    second figure of each pair.
 *    Full passenger service multiplies the growth rate by 1.55, goods and food
 *    by a further 0.35 each (`TOWN_GROWTH_*` in constants.ts), so a population
 *    goal above the passive line is a goal about SERVICE.
 *  - a competent network gains at most ~840,000 EUR of company value over a
 *    quarter century, and the strongest measured AI company reached 1.12
 *    million from a 500,000 start (D-158). Nothing here asks for more than
 *    that.
 *
 * What is NOT claimed: that every gold band has been played to. The bands are
 * anchored on those four measurements and on the structural checks in
 * `tests/unit/shippedScenarios.spec.ts` - every named town exists, every cargo
 * a goal counts has a producer and an acceptor on the map, no goal is decided
 * in the first game year by a player who does nothing, and every load-bearing
 * claim each entry below makes about its own world is pinned there against the
 * generated world (`SCENARIO_WORLD_CLAIMS`), so a seed or a mapgen change can
 * never silently make a briefing lie.
 *
 * **And since D-198 the briefings themselves are read.** Pinning the world was
 * only half of it: the sentences a PLAYER sees could still be falsified on
 * their own, and were - a verifier changed "Acht Grossstaedte zu je 8.000
 * Einwohnern und siebzehn Orte ab 2.500" into "Neun ... 9.000 ... vierzig" and
 * the suite stayed green. `SCENARIO_BRIEFING_FIGURES` now lists every number
 * each briefing says out loud, in order, each one either READ BACK from the
 * claims table (or from this entry's own rules, goals and constants) or named
 * on a short allowlist with the reason no world property can justify it. Both
 * languages are held to the same list, so a figure that changes in one
 * sentence and not in the other is a red build too.
 */

/** The last tick of `year` - "by the end of 1958" as the hook measures it. */
function endOfYear(year: number): number {
  return (year - START_YEAR + 1) * TICKS_PER_YEAR;
}

/** The calendar year a band tick falls in; the browser prints this. */
export function scenarioYearOf(tick: number): number {
  return START_YEAR + Math.ceil(tick / TICKS_PER_YEAR) - 1;
}

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
    aiCompanies: 1,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'seed'],
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
        de: '200.000 Fahrgaeste befoerdern',
        en: 'Carry 200,000 passengers',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Passengers,
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
    aiCompanies: 2,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'seed'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 148, arctic, 256 tiles. Measured: the straight line from Silberheim (3,
 * 8,000) to Ulmenburg (18, 2,500) is 60 tiles long, climbs and falls through
 * 27 height levels, spans heights 2 to 13 - eleven levels, 88 m - and crosses
 * eight tiles of water. The steepest long corridor between two real towns in
 * two hundred scanned seeds. At this climate the map grows two coal mines and
 * nothing that accepts coal, so the tonnage goal here is passengers.
 */
const GEBIRGSLOGISTIK: ShippedScenario = {
  id: 'gebirgslogistik',
  title: 'Gebirgslogistik',
  author: AUTHOR,
  briefing: {
    de:
      'Zwischen Silberheim und Ulmenburg liegen 60 Tiles Luftlinie - und elf ' +
      'Hoehenstufen zwischen dem tiefsten und dem hoechsten Punkt der Geraden, also ' +
      '88 Meter, dazu acht Tiles Wasser. Die gerade Linie ist die teuerste; die ' +
      'Steigungsregel misst ueber ein Fenster, nicht von Tile zu Tile, also gewinnt ' +
      'hier, wer den Umweg am Hang findet. Die Streckenkosten aus 8.4 sind ' +
      'eingeschaltet: belegte Abschnitte und Signale kosten den Zug etwas.',
    en:
      'Sixty tiles of straight line lie between Silberheim and Ulmenburg - and ' +
      'eleven height levels between its lowest and its highest point, which is 88 ' +
      'metres, plus eight tiles of water. The direct route is the expensive one; the ' +
      'gradient rule measures over a window rather than tile to tile, so the win goes ' +
      'to whoever finds the detour along the slope. The 8.4 route costs are on: a ' +
      'claimed section and a signal both cost a train.',
  },
  goals: [
    {
      caption: {
        de: 'Silberheim und Ulmenburg verbinden',
        en: 'Connect Silberheim and Ulmenburg',
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
        de: '60.000 Fahrgaeste ueber die Berge bringen',
        en: 'Carry 60,000 passengers over the mountains',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Passengers,
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
    aiCompanies: 1,
    inflation: true,
    emissions: true,
    occupancyPenalty: true,
    signalPenalty: true,
    roadCongestion: false,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'goals',
    'mapSize',
    'occupancyPenalty',
    'seed',
    'signalPenalty',
  ],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 67, tropical, 256 tiles. Measured: three inhabited land masses. The
 * 45,084-tile mainland carries Neu-Lindenried (23, 8,000); a 252-tile island
 * off the south-east corner carries Sandenheim (8, 8,000) 52 tiles away across
 * open water; a third islet of 27 tiles carries a village. Which town stands
 * on which land mass is pinned as a PAIR since D-198 - the sorted sizes alone
 * would still hold if the two cities swapped islands, and then the scenario
 * would be a different one. Two cities of 8,000 with sea between them is what
 * "island hopping" means here - no bridge can span it, so the connection is a
 * ship or it is nothing.
 */
const INSELHUEPFEN: ShippedScenario = {
  id: 'inselhuepfen',
  title: 'Inselhuepfen',
  author: AUTHOR,
  briefing: {
    de:
      'Sandenheim hat 8.000 Einwohner und liegt auf einer Insel. Neu-Lindenried hat ' +
      'ebenso viele und liegt 52 Tiles entfernt auf dem Festland. Dazwischen ist ' +
      'offenes Meer - keine Bruecke, keine Strasse, kein Gleis. Ein Kai bewegt ' +
      'uebrigens nie den Stationsmittelpunkt: die Reichweite wird vom Zentrum aus ' +
      'gemessen, nicht von der Mole.',
    en:
      'Sandenheim has 8,000 inhabitants and sits on an island. Neu-Lindenried has ' +
      'as many and sits 52 tiles away on the mainland. Between them is open sea - ' +
      'no bridge, no road, no track. A quay never moves the station centre, by the ' +
      'way: catchment is measured from the centre, not from the berth.',
  },
  goals: [
    {
      caption: {
        de: 'Neu-Lindenried und Sandenheim verbinden',
        en: 'Connect Neu-Lindenried and Sandenheim',
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
        de: '40.000 Fahrgaeste ueber das Wasser bringen',
        en: 'Carry 40,000 passengers across the water',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Passengers,
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
    aiCompanies: 1,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'seed'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 12, temperate, 256 tiles, HARD (250,000 to start with). Measured: seven
 * towns of 8,000, three farms and three food factories - the full food chain
 * standing idle. Erlenbach (32) is one of the big towns; unserved it reaches
 * 10,033 by the end of 1970 and 10,574 by the end of 1975, so the 11,000 asked
 * for below cannot be waited out. This world has no competitors at all, which
 * is what makes it the one the passive temperate growth curve is played out on
 * (`shippedScenarios.spec.ts`): both figures above are pinned there, and so are
 * the 9,925 and 10,465 the catalogue header quotes at twenty and twenty-five
 * game years.
 */
const WIEDERAUFBAU: ShippedScenario = {
  id: 'wiederaufbau',
  title: 'Wiederaufbau',
  author: AUTHOR,
  briefing: {
    de:
      'Sieben Grossstaedte, drei Bauernhoefe, drei Lebensmittelwerke - und 250.000 ' +
      'EUR Startkapital. Die Kette steht still, und eine Stadt waechst von allein ' +
      'nur langsam: Erlenbach kaeme unbedient bis Ende 1975 auf 10.574 Einwohner. ' +
      'Die 11.000 muessen Sie herbeifahren. Wer nur zusieht, ist vorher ' +
      'zahlungsunfaehig.',
    en:
      'Seven cities, three farms, three food factories - and 250,000 EUR to start ' +
      'with. The chain is idle, and a town grows slowly on its own: by the end of ' +
      '1975 an unserved Erlenbach would have reached 10,574 inhabitants. The 11,000 ' +
      'asked for has to be carried in. Anybody who only watches is insolvent ' +
      'before then.',
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
    aiCompanies: 0,
    inflation: true,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'inflation', 'mapSize', 'seed'],
  fromTick: 0,
  toTick: endOfYear(1975),
};

/**
 * Seed 28, temperate, 256 tiles. Measured: NINE towns of 8,000 and only eleven
 * industries - the map where the councils of 13.3 matter more than any chain.
 * Falkenheim (16) is one of the nine, and it starts at the same 8,000 in the
 * same climate as Wiederaufbau's Erlenbach, whose passive curve IS played out
 * and pinned: 10,033 by the end of 1970, 10,574 by the end of 1975. That is
 * where the 11,000 asked for below comes from. Falkenheim itself is not played
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
    aiCompanies: 3,
    inflation: false,
    emissions: true,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: true,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'mapSize', 'roadCongestion', 'seed'],
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
        de: '20.000 Fahrgaeste befoerdern',
        en: 'Carry 20,000 passengers',
      },
      spec: {
        kind: GoalKind.CargoDeliveredTotal,
        subjectA: Cargo.Passengers,
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
    aiCompanies: 0,
    inflation: false,
    emissions: false,
    occupancyPenalty: false,
    signalPenalty: false,
    roadCongestion: false,
  },
  lockedRules: ['climate', 'difficulty', 'goals', 'inflation', 'mapSize', 'seed'],
  fromTick: 0,
  toTick: endOfYear(1957),
};

/**
 * Seed 69, desert, 256 tiles, HARD, four competitors, every world rule the
 * game has switched ON. Measured: ten industries and only two towns of 8,000,
 * the rest at 2,500 or below - a thin offer for five companies, and one that
 * grows slowly, because a desert town of 8,000 that nobody serves reaches
 * 9,248 by the end of 1975 where a temperate one reaches 10,574. That desert
 * figure is played out and pinned on THIS seed with the four competitors taken
 * out (`shippedScenarios.spec.ts`, D-198): "unserved" is not a property a
 * world with four builders in it can be asked about. Surviving a quarter
 * century here is the goal, and it is not a formality: the measured
 * quarter-century AI games wind up two companies in three (D-109).
 */
const UEBERLEBEN: ShippedScenario = {
  id: 'ueberleben',
  title: 'Ueberleben',
  author: AUTHOR,
  briefing: {
    de:
      'Wueste, zehn Industrien, zwei Grossstaedte - und vier Konkurrenten auf ' +
      '250.000 EUR Startkapital. Jede Weltregel ist eingeschaltet: Inflation, ' +
      'CO2-Abgabe, beide Streckenkosten aus 8.4 und der Strassenstau. Drei Monate ' +
      'in den roten Zahlen sind eine Warnung, zwoelf das Ende. Bis 1975 zu ' +
      'ueberleben ist hier keine Formsache.',
    en:
      'Desert, ten industries, two cities - and four competitors, on 250,000 EUR of ' +
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
    aiCompanies: 4,
    inflation: true,
    emissions: true,
    occupancyPenalty: true,
    signalPenalty: true,
    roadCongestion: true,
  },
  lockedRules: [
    'climate',
    'difficulty',
    'emissions',
    'goals',
    'inflation',
    'mapSize',
    'occupancyPenalty',
    'roadCongestion',
    'seed',
    'signalPenalty',
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
