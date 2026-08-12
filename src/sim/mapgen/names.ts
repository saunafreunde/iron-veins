import { MapClimate } from '../constants';
import type { Rng } from '../rng';

/**
 * Place names, assembled from syllables rather than read from a list.
 *
 * A fixed list of a few hundred names repeats visibly on a map with 140 towns
 * and would have to be maintained per language. The tables below produce well
 * over fifty thousand plausible names per set from about ninety entries each.
 *
 * Names are part of the world state, so they are generated once from the world
 * seed and are the same in every UI language - a town cannot be called
 * Eichenfeld in German and something else in English.
 *
 * **Two sets since SPEC2 M23, and which one a world uses is its CLIMATE**
 * (D-246). SPEC.md 6.5 asks for "einen deutschen bzw. englischen Namen aus
 * generierten Silben", and until this bundle only the German half existed -
 * the English syllable set below is what closes that sentence. The temperate
 * world is the Central European heartland and keeps the German set,
 * unchanged to the syllable; the arctic, the tropical and the desert worlds
 * are named in English. The selection is a `const` table under balance
 * authority like every other climate table of this milestone (E-17).
 *
 * **The tables are exported because a test reads them as a grammar** (D-199):
 * a shipped scenario's briefing may only name places its own world contains,
 * and "what a place name looks like" is not a heuristic anybody should write
 * twice - it is exactly `Root + Suffix`, optionally behind `Prefix-`, which is
 * what {@link PlaceNameGenerator.compose} produces in either language. The
 * audit builds its pattern from {@link PLACE_NAME_SETS}, so a new syllable -
 * and a new SET - widens the guard on the day it widens the generator.
 */

/** Optional leading syllable, always followed by a hyphen ("Nieder-"). */
export const PLACE_NAME_PREFIXES = [
  'Alt',
  'Neu',
  'Ober',
  'Unter',
  'Hohen',
  'Nieder',
  'Gross',
  'Klein',
  'Nord',
  'Sued',
  'Ost',
  'West',
  'Mittel',
  'Vor',
  'Hinter',
  'Bad',
];

/** The stem every name carries, capitalised. */
export const PLACE_NAME_ROOTS = [
  'Adler',
  'Birken',
  'Buchen',
  'Eichen',
  'Erlen',
  'Falken',
  'Fichten',
  'Hasel',
  'Hirsch',
  'Kaisers',
  'Koenigs',
  'Linden',
  'Marien',
  'Rehe',
  'Reichen',
  'Rosen',
  'Sanden',
  'Schwarzen',
  'Steinen',
  'Tannen',
  'Ulmen',
  'Weiden',
  'Wolfs',
  'Ziegen',
  'Ahorn',
  'Distel',
  'Eisen',
  'Feuer',
  'Hammer',
  'Kupfer',
  'Silber',
  'Sonnen',
];

/** The ending, always lower case - this is what makes a name look German. */
export const PLACE_NAME_SUFFIXES = [
  'berg',
  'bach',
  'brueck',
  'burg',
  'dorf',
  'feld',
  'furt',
  'hausen',
  'heim',
  'hofen',
  'kirchen',
  'moor',
  'ried',
  'rode',
  'see',
  'stadt',
  'stein',
  'tal',
  'wald',
  'werder',
  'au',
  'grund',
];

/**
 * The English set (SPEC2 M23) - the same grammar, the other language.
 *
 * Deliberately the same SHAPE as the German one: sixteen prefixes,
 * thirty-two roots, twenty-two suffixes, one hyphen after a prefix. Two
 * reasons, and neither is symmetry for its own sake. The generator draws the
 * same three or four words per name whichever set it holds, so a world does
 * not spend a different number of random draws because of its climate; and
 * the D-199 grammar stays exactly "root plus suffix, optionally behind a
 * prefix", so the briefing audit reads one rule in two vocabularies rather
 * than two rules.
 *
 * The syllables are chosen to be place-name material and nothing else. No root
 * begins a word this game's prose uses - "Freight", "Harbour", "Northern",
 * "Station" and their German counterparts were checked against the pattern -
 * because the audit reads any legal composition in a briefing as a PLACE, and
 * an English briefing that mentions driftwood must not be read as naming a
 * town (`tests/unit/climateEconomies.spec.ts` walks all sixteen shipped
 * briefing texts and asserts the extraction is unchanged by this set).
 */
export const PLACE_NAME_PREFIXES_EN = [
  'Upper',
  'Lower',
  'Great',
  'Little',
  'Old',
  'New',
  'North',
  'South',
  'East',
  'West',
  'Mid',
  'Far',
  'Long',
  'High',
  'Deep',
  'Nether',
];

/** The English stem, capitalised. */
export const PLACE_NAME_ROOTS_EN = [
  'Alder',
  'Ash',
  'Bracken',
  'Bram',
  'Brack',
  'Cald',
  'Cinder',
  'Copper',
  'Dun',
  'Elm',
  'Ember',
  'Falcon',
  'Fern',
  'Glen',
  'Gorse',
  'Haw',
  'Heather',
  'Kes',
  'Larch',
  'Marl',
  'Nettle',
  'Oak',
  'Osier',
  'Quill',
  'Raven',
  'Rowan',
  'Sedge',
  'Thistle',
  'Thorn',
  'Willow',
  'Wren',
  'Yarrow',
];

/** The English ending, always lower case. */
export const PLACE_NAME_SUFFIXES_EN = [
  'ford',
  'bridge',
  'ton',
  'wick',
  'mouth',
  'shaw',
  'dale',
  'hollow',
  'moor',
  'field',
  'bury',
  'combe',
  'haven',
  'ridge',
  'marsh',
  'stead',
  'crest',
  'bourne',
  'gate',
  'reach',
  'hurst',
  'mere',
];

/** One vocabulary the generator can compose from. */
export interface PlaceNameSet {
  /** A short tag for a failure message: `de` or `en`. */
  readonly language: string;
  readonly prefixes: readonly string[];
  readonly roots: readonly string[];
  readonly suffixes: readonly string[];
}

export const PLACE_NAMES_DE: PlaceNameSet = {
  language: 'de',
  prefixes: PLACE_NAME_PREFIXES,
  roots: PLACE_NAME_ROOTS,
  suffixes: PLACE_NAME_SUFFIXES,
};

export const PLACE_NAMES_EN: PlaceNameSet = {
  language: 'en',
  prefixes: PLACE_NAME_PREFIXES_EN,
  roots: PLACE_NAME_ROOTS_EN,
  suffixes: PLACE_NAME_SUFFIXES_EN,
};

/** Every set the generator can hold - what the D-199 audit reads. */
export const PLACE_NAME_SETS: readonly PlaceNameSet[] = [PLACE_NAMES_DE, PLACE_NAMES_EN];

/**
 * Which vocabulary a world of this climate names its towns in, indexed by
 * {@link MapClimate}.
 *
 * The temperate world is the German one and every other world is English.
 * That is a content decision and it is recorded as one (D-246): it is what
 * makes SPEC.md 6.5's "deutschen bzw. englischen Namen" true of the shipped
 * game, and it leaves the temperate generator - which carries every band of
 * section 19.4 and five of the eight shipped scenarios - drawing exactly the
 * words it drew before.
 */
export const CLIMATE_PLACE_NAMES: readonly PlaceNameSet[] = [
  PLACE_NAMES_DE, // Temperate
  PLACE_NAMES_EN, // Arctic
  PLACE_NAMES_EN, // Tropical
  PLACE_NAMES_EN, // Desert
];

/** The vocabulary this climate names its places in. */
export function placeNameSetFor(climate: MapClimate): PlaceNameSet {
  return CLIMATE_PLACE_NAMES[climate] ?? PLACE_NAMES_DE;
}

/** Chance that a name carries a prefix such as "Ober" or "Upper". [0..1] */
const PREFIX_PROBABILITY = 0.32;

/**
 * Hands out unique place names for one map. Keeping the used set here rather
 * than in the caller means the uniqueness rule cannot be forgotten.
 */
export class PlaceNameGenerator {
  private readonly used = new Set<string>();
  private readonly set: PlaceNameSet;

  constructor(
    private readonly rng: Rng,
    climate: MapClimate = MapClimate.Temperate,
  ) {
    this.set = placeNameSetFor(climate);
  }

  next(): string {
    // Bounded: after this many collisions a numeric suffix guarantees progress.
    for (let attempt = 0; attempt < 64; attempt++) {
      const name = this.compose();
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    let counter = 2;
    let name = `${this.compose()} ${counter}`;
    while (this.used.has(name)) {
      counter++;
      name = `${this.compose()} ${counter}`;
    }
    this.used.add(name);
    return name;
  }

  private compose(): string {
    const set = this.set;
    const root = set.roots[this.rng.nextInt(set.roots.length)]!;
    const suffix = set.suffixes[this.rng.nextInt(set.suffixes.length)]!;
    const wantsPrefix = this.rng.nextFloat() < PREFIX_PROBABILITY;
    if (!wantsPrefix) return root + suffix;
    const prefix = set.prefixes[this.rng.nextInt(set.prefixes.length)]!;
    return `${prefix}-${root}${suffix}`;
  }
}
