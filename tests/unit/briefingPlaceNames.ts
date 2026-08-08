import {
  PLACE_NAME_PREFIXES,
  PLACE_NAME_ROOTS,
  PLACE_NAME_SUFFIXES,
} from '../../src/sim/mapgen/names';

/**
 * Every place a piece of scenario text names, in the order it names them
 * (D-199).
 *
 * The sibling of `briefingNumerals.ts`, and it closes the same class of hole one
 * surface further along. D-198 bound every NUMBER a briefing quotes to the world
 * it describes; the names beside those numbers stayed bound to nothing. An
 * independent verifier renamed Passagiernetz's "Rosenburg" to "Rosenheim" and
 * "Ahorngrund" to "Ahornthal" in the German briefing alone - two towns that do
 * not exist on that map, with the English briefing left saying the real names -
 * and the build stayed GREEN. `SCENARIO_WORLD_CLAIMS` pinned the real names
 * against the world all along; nothing read them back out of the prose.
 *
 * **The grammar is the generator's own, not a heuristic.** A place name is
 * exactly what `PlaceNameGenerator.compose` can produce - one of 32 roots
 * followed by one of 22 suffixes, optionally behind one of 16 prefixes and a
 * hyphen - and this module builds its pattern out of those three exported
 * tables. A syllable added to the generator widens the audit the same day. That
 * is deliberately the same shape as `INDUSTRY_SMOKE_ANCHORS` (D-174) and the
 * tool registry (D-183): the enumeration lives in one place and the audit
 * consumes it rather than restating it.
 *
 * **What this finds, and what the caller does with it.** The two halves catch
 * different edits and both are needed:
 *
 *  - a name that was REPLACED or dropped is caught by the caller's comparison
 *    against the ids the claims table declares - "Ahornthal" is not a legal
 *    composition at all (the generator has no `thal`), so it simply is not a
 *    place name here, and the declared "Ahorngrund" has vanished from the
 *    sequence;
 *  - a name that was INSERTED is caught by this extractor - "Rosenheim" IS a
 *    legal composition (`Rosen` + `heim`), so it is read as a place, and it is
 *    then not one the claims table declared.
 *
 * The comparison is a SEQUENCE, so two declared names swapped for each other -
 * both real towns of that very map - fail on order rather than on membership.
 *
 * **The cost of the exact grammar, stated.** Any German compound a player could
 * mistake for a town is read as one: "Eichenwald" would be extracted from a
 * sentence about oak woods. That is a RED BUILD and a rephrase, never a silent
 * hole, and no shipped briefing hits it - the eight were read for it. The
 * asymmetry is deliberate, and it is the opposite one from the numeral
 * scanner's: there the exclusions can hide a number nobody quoted, here the
 * inclusions can only cost a rewording.
 *
 * A name the generator disambiguated with a counter ("Rosenburg 2", the
 * collision path in `PlaceNameGenerator.next`) is read as "Rosenburg" and would
 * fail the caller's comparison against the town's real name. No shipped
 * scenario names such a town; if one ever does, it fails loudly.
 */

/** One place name as the text wrote it, with where it stood. */
export interface PlaceName {
  /** Exactly the characters that carried it. */
  readonly text: string;
  /** Index of the first character, so a failure can quote its surroundings. */
  readonly at: number;
}

/**
 * The generator's grammar as a pattern: `(Prefix-)? Root Suffix`.
 *
 * Case-sensitive on purpose - the generator capitalises prefix and root and
 * never the suffix, so a lower-case German compound ("silberbergwerk") is not a
 * candidate at all. The lookbehind refuses a preceding letter OR hyphen, which
 * is what keeps "Weidengrund" from being read a second time out of the middle
 * of "Nieder-Weidengrund".
 */
const PLACE = new RegExp(
  `(?<![\\p{L}-])(?:(?:${PLACE_NAME_PREFIXES.join('|')})-)?` +
    `(?:${PLACE_NAME_ROOTS.join('|')})(?:${PLACE_NAME_SUFFIXES.join('|')})(?![\\p{L}])`,
  'gu',
);

/** Every place name in `text`, in the order it is read. */
export function placeNamesIn(text: string): readonly PlaceName[] {
  const found: PlaceName[] = [];
  for (const match of text.matchAll(PLACE)) {
    found.push({ text: match[0], at: match.index });
  }
  return found;
}
