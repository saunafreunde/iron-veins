import type { Rng } from '../rng';

/**
 * Place names, assembled from syllables rather than read from a list.
 *
 * A fixed list of a few hundred names repeats visibly on a map with 140 towns
 * and would have to be maintained per language. The tables below produce well
 * over fifty thousand plausible German style names from about ninety entries.
 *
 * Names are part of the world state, so they are generated once from the world
 * seed and are the same in every UI language - a town cannot be called
 * Eichenfeld in German and something else in English.
 *
 * **The three tables are exported because a test reads them as a grammar**
 * (D-199): a shipped scenario's briefing may only name places its own world
 * contains, and "what a place name looks like" is not a heuristic anybody
 * should write twice - it is exactly `Root + Suffix`, optionally behind
 * `Prefix-`, which is what {@link PlaceNameGenerator.compose} produces. The
 * audit builds its pattern from these arrays, so a new syllable widens the
 * guard on the day it widens the generator.
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

/** Chance that a name carries a prefix such as "Ober" or "Neu". [0..1] */
const PREFIX_PROBABILITY = 0.32;

/**
 * Hands out unique place names for one map. Keeping the used set here rather
 * than in the caller means the uniqueness rule cannot be forgotten.
 */
export class PlaceNameGenerator {
  private readonly used = new Set<string>();

  constructor(private readonly rng: Rng) {}

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
    const root = PLACE_NAME_ROOTS[this.rng.nextInt(PLACE_NAME_ROOTS.length)]!;
    const suffix = PLACE_NAME_SUFFIXES[this.rng.nextInt(PLACE_NAME_SUFFIXES.length)]!;
    const wantsPrefix = this.rng.nextFloat() < PREFIX_PROBABILITY;
    if (!wantsPrefix) return root + suffix;
    const prefix = PLACE_NAME_PREFIXES[this.rng.nextInt(PLACE_NAME_PREFIXES.length)]!;
    return `${prefix}-${root}${suffix}`;
  }
}
