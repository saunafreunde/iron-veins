/**
 * Every number a scenario briefing says out loud, in the order it says them
 * (D-198).
 *
 * `SCENARIO_WORLD_CLAIMS` (D-197) pinned what each scenario's WORLD contains
 * and nothing read the sentences that quote it, so the briefing could be
 * falsified on its own: an independent verifier changed the German Passagiernetz
 * briefing from "Acht Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab
 * 2.500" to "Neun Grossstaedte zu je 9.000 Einwohnern und vierzig Orte ab
 * 2.500", left the claims table alone, and the whole suite stayed green. The
 * only assertions on a briefing were non-empty, under the length cap, and
 * de !== en.
 *
 * This module is the missing half: it reads the numbers back OUT of the prose,
 * so `shippedScenarios.spec.ts` can require every one of them to be justified.
 * Note what it does NOT do - it does not generate the prose. A briefing is
 * authored in two languages by a human and has to read like it; what is
 * mechanical is the audit over it.
 *
 * **Two families are extracted.** Digits, including the thousands separators of
 * both languages ("8.000" and "8,000"), and spelled-out numerals in German and
 * English - because that is how the planted lie was written ("neun", "vierzig").
 *
 * **Three things are deliberately NOT numerals here**, and each exclusion is a
 * hole only in one direction: it can hide a number nobody was quoting, never a
 * changed one, because any edit that turns a recognised numeral into something
 * else drops it from the sequence and the comparison fails on length.
 *
 *  - **"ein/eine/einer/einem/einen/eins" and "one".** German's indefinite
 *    article IS its numeral ("ein Zug" is "a train", not "one train"), and
 *    English "one" is mostly a pronoun ("one good line", "the direct one").
 *    Extracting them would fill every figure list with meaningless ones.
 *  - **Ordinals** ("die vierte Buslinie", "the fourth bus line"). An ordinal
 *    ranks, it does not count, and no briefing claim rests on one.
 *  - **Digits glued to letters** ("CO2"). A chemical formula is not a quantity.
 *
 * A numeral WORD the table does not know is not silently ignored, though:
 * {@link unrecognisedNumeralWords} finds anything that looks like one and was
 * not extracted, so "einundvierzig" is a red build rather than an invisible
 * claim.
 */

/** One number as the briefing wrote it, with where it stood. */
export interface Numeral {
  /** The value, separators resolved. */
  readonly value: number;
  /** Exactly the characters that carried it. */
  readonly text: string;
  /** Index of the first character, so the audit can quote its surroundings. */
  readonly at: number;
}

/**
 * Spelled-out numerals, both languages in one table.
 *
 * German and English never share a briefing, so one table cannot confuse them;
 * and a shared table is what makes "the two locales quote the same figures in
 * the same order" a comparison of numbers rather than of words.
 */
const NUMERAL_WORDS: ReadonlyMap<string, number> = new Map([
  // German. "ein" and its inflections are deliberately absent - see above.
  ['null', 0],
  ['zwei', 2],
  ['drei', 3],
  ['vier', 4],
  ['fuenf', 5],
  ['fünf', 5],
  ['sechs', 6],
  ['sieben', 7],
  ['acht', 8],
  ['neun', 9],
  ['zehn', 10],
  ['elf', 11],
  ['zwoelf', 12],
  ['zwölf', 12],
  ['dreizehn', 13],
  ['vierzehn', 14],
  ['fuenfzehn', 15],
  ['fünfzehn', 15],
  ['sechzehn', 16],
  ['siebzehn', 17],
  ['achtzehn', 18],
  ['neunzehn', 19],
  ['zwanzig', 20],
  ['dreissig', 30],
  ['dreißig', 30],
  ['vierzig', 40],
  ['fuenfzig', 50],
  ['fünfzig', 50],
  ['sechzig', 60],
  ['siebzig', 70],
  ['achtzig', 80],
  ['neunzig', 90],
  ['hundert', 100],
  ['tausend', 1_000],
  // English. "one" is deliberately absent - see above.
  ['zero', 0],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
  ['hundred', 100],
  ['thousand', 1_000],
]);

/**
 * Digits: German thousands, English thousands, a decimal (which is how a
 * cross-reference like "8.4" reads), and a plain run.
 *
 * The order of the alternatives is the rule: "1.700" is seventeen hundred and
 * not one-point-seven, and "57, 59" is two numbers and not fifty-seven
 * thousand and fifty-nine - a separator only separates when three digits
 * follow it IMMEDIATELY. The lookbehind is what keeps the 2 out of "CO2".
 */
const DIGITS =
  /(?<![\p{L}\d.,])(?:\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d+[.,]\d{1,2}|\d+)(?!\d)/gu;

/** The word alternation, longest first so "achtzehn" wins over "acht". */
const WORDS = new RegExp(
  `(?<!\\p{L})(?:${[...NUMERAL_WORDS.keys()]
    .sort((a, b) => b.length - a.length)
    .join('|')})(?!\\p{L})`,
  'giu',
);

/**
 * Anything shaped like a numeral word, recognised or not.
 *
 * The tens and the -teen/-zehn/-hundert/-tausend families are the productive
 * parts of both languages, so a word built out of them is a numeral even when
 * the table has never seen it. Checked against the extracted spans, this is
 * what stops a compound nobody listed ("einundvierzig") from being a claim no
 * test can read.
 */
const NUMERAL_SHAPED =
  /(?<!\p{L})\p{L}*(?:zehn|zwanzig|dreissig|dreißig|vierzig|fuenfzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend|million|teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|thousand)\p{L}*(?!\p{L})/giu;

function valueOfDigits(text: string): number {
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''));
  if (/^\d{1,3}(?:,\d{3})+$/.test(text)) return Number(text.replace(/,/g, ''));
  return Number(text.replace(',', '.'));
}

/** Every number in `text`, in the order it is read. */
export function numeralsIn(text: string): readonly Numeral[] {
  const found: Numeral[] = [];
  for (const match of text.matchAll(DIGITS)) {
    found.push({ value: valueOfDigits(match[0]), text: match[0], at: match.index });
  }
  for (const match of text.matchAll(WORDS)) {
    const value = NUMERAL_WORDS.get(match[0].toLowerCase());
    if (value === undefined) continue;
    found.push({ value, text: match[0], at: match.index });
  }
  found.sort((a, b) => a.at - b.at);
  return found;
}

/**
 * Words that look like numerals and were not extracted - a red build's worth of
 * suspicion, not a translation service.
 */
export function unrecognisedNumeralWords(text: string): readonly string[] {
  const covered = numeralsIn(text);
  const unknown: string[] = [];
  for (const match of text.matchAll(NUMERAL_SHAPED)) {
    const from = match.index;
    const to = from + match[0].length;
    const seen = covered.some((one) => one.at <= from && one.at + one.text.length >= to);
    if (!seen) unknown.push(match[0]);
  }
  return unknown;
}
