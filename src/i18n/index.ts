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
 */
export function t(key: string, params?: Readonly<Record<string, string | number>>): string {
  const text = CATALOGS[currentLocale][key] ?? CATALOGS.en[key] ?? key;
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
