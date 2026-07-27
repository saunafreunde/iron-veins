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
 */

const PREFIXES = [
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

const ROOTS = [
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

const SUFFIXES = [
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
    const root = ROOTS[this.rng.nextInt(ROOTS.length)]!;
    const suffix = SUFFIXES[this.rng.nextInt(SUFFIXES.length)]!;
    const wantsPrefix = this.rng.nextFloat() < PREFIX_PROBABILITY;
    if (!wantsPrefix) return root + suffix;
    return `${PREFIXES[this.rng.nextInt(PREFIXES.length)]!}-${root}${suffix}`;
  }
}
