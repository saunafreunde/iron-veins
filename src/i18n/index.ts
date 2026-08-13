import de from './de.json';
import en from './en.json';

/**
 * Minimal translation layer. No display string is allowed to be hard-coded in
 * a component (failure #16 - retrofitting i18n late costs days), so every user
 * visible text goes through `t()`.
 */

export type Locale = 'de' | 'en';

export const LOCALES: readonly Locale[] = ['de', 'en'];

const CATALOGS: Record<Locale, Record<string, string>> = { de, en };

/** BCP 47 tags used for number and currency formatting. */
const INTL_TAGS: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

let currentLocale: Locale = 'de';

/**
 * One `Intl.PluralRules` per locale, built on first use.
 *
 * CLDR rather than a hand-written `count === 1`, and the reason is the same
 * one that made `t()` a function instead of a template literal: German and
 * English happen to share the one/other split, so a hand-written rule would
 * look right until the third language arrives and then be wrong in a way
 * nobody can see from the catalogue. The categories a locale never uses cost
 * nothing - a catalogue only carries the rows its own languages select.
 */
const PLURAL_RULES: Partial<Record<Locale, Intl.PluralRules>> = {};

function pluralRulesFor(locale: Locale): Intl.PluralRules {
  const existing = PLURAL_RULES[locale];
  if (existing !== undefined) return existing;
  const rules = new Intl.PluralRules(INTL_TAGS[locale]);
  PLURAL_RULES[locale] = rules;
  return rules;
}

/**
 * The CLDR plural category a count selects in a locale - 'one', 'other', and
 * whatever else the language uses. Exported so the catalogue guard can walk
 * the rows a locale can actually reach rather than a list somebody typed.
 */
export function pluralCategory(count: number, locale: Locale = currentLocale): string {
  return pluralRulesFor(locale).select(count);
}

/**
 * Pull a string out of ONE catalogue, applying the plural rule.
 *
 * The order is deliberate and total: an exact key wins, then the category the
 * `count` parameter selects, then `other`. So a key that is not pluralised
 * behaves exactly as it did before this rule existed (the D-201 device: the
 * old path is the new path's identity branch), a pluralised key always
 * resolves even when the caller passed no count or passed a formatted string
 * instead of a number, and a key can never be half-translated into silence.
 *
 * A key carrying BOTH a bare row and plural rows would make the plural rows
 * dead; `i18n.spec.ts` fails the build on one rather than leaving it to be
 * discovered by a player reading "1 wagons".
 */
function fromCatalog(
  catalog: Record<string, string>,
  key: string,
  locale: Locale,
  count: number | undefined,
): string | undefined {
  const direct = catalog[key];
  if (direct !== undefined) return direct;

  const category = count === undefined ? 'other' : pluralCategory(count, locale);
  return catalog[`${key}.${category}`] ?? catalog[`${key}.other`];
}

/** The `count` parameter as a number, or undefined when there is none to use. */
function countOf(
  params: Readonly<Record<string, string | number>> | undefined,
): number | undefined {
  const raw = params?.['count'];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Whether a key has a string at all, plural rows included.
 *
 * For the tests that walk a table of keys and demand words behind each one: a
 * pluralised key has no bare row, so `key in de` is the wrong question the
 * moment a sentence learns to count.
 */
export function hasTranslation(key: string, locale: Locale = currentLocale): boolean {
  return fromCatalog(CATALOGS[locale], key, locale, undefined) !== undefined;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function intlTag(locale: Locale = currentLocale): string {
  return INTL_TAGS[locale];
}

/**
 * Look up `key` in the active catalogue and substitute `{placeholders}`.
 * Falls back to English and finally to the key itself, so a missing string is
 * visible during development instead of rendering as an empty box.
 *
 * A `count` parameter also selects the plural row (SPEC2 M25): `t('x', {count:
 * 1})` reads `x.one` where the catalogue has one. The selector is `count` and
 * nothing else - a rule that guessed which of several numbers a sentence
 * counts would be right in German and wrong in English on the same day - so a
 * sentence that wants a plural names its number `count`.
 */
export function t(key: string, params?: Readonly<Record<string, string | number>>): string {
  const count = countOf(params);
  const text =
    fromCatalog(CATALOGS[currentLocale], key, currentLocale, count) ??
    fromCatalog(CATALOGS.en, key, 'en', count) ??
    key;
  if (params === undefined) return text;

  let result = text;
  for (const name of Object.keys(params)) {
    result = result.split(`{${name}}`).join(String(params[name]));
  }
  return result;
}

/** Month name for a zero based month index. */
export function monthName(monthIndex: number): string {
  return t(`ui.month.${monthIndex + 1}`);
}

/** Format an integer cent amount as currency in the active locale. */
export function formatMoney(cents: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(intlTag(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

/**
 * Format a cent amount compactly ("1,2 Mio. €") for chart axis labels, where
 * a full grouped figure would not fit beside the plot (SPEC2 M14).
 */
export function formatMoneyCompact(cents: number): string {
  return new Intl.NumberFormat(intlTag(), {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** Format a plain integer with locale aware grouping. */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat(intlTag()).format(value);
}

/** Format a game date, honouring the locale specific field order. */
export function formatGameDate(year: number, month: number, day: number): string {
  return t('ui.date.format', { day: day + 1, month: monthName(month), year });
}

/**
 * Format a wall-clock instant (ISO text or epoch milliseconds) in the active
 * locale. Wall-clock, not game time: this is for things that happened to the
 * PLAYER - a crash report's date - never for anything inside the world.
 */
export function formatWallClock(value: string | number): string {
  return new Intl.DateTimeFormat(intlTag(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
