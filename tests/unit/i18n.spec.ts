import { afterEach, describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { getLocale, hasTranslation, pluralCategory, setLocale, t } from '../../src/i18n';

/**
 * The two catalogues have to carry the same keys.
 *
 * `t()` falls back to English and then to the key itself, so a missing German
 * string is not a crash - it is a screen that quietly shows `cmd.reject.foo` to
 * a German player. Nothing else in the suite would notice.
 */
describe('the translation catalogues', () => {
  it('carry identical key sets', () => {
    const german = Object.keys(de).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const english = Object.keys(en).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    expect(german.filter((key) => !(key in en))).toEqual([]);
    expect(english.filter((key) => !(key in de))).toEqual([]);
    expect(german).toEqual(english);
  });

  it('leave no string empty', () => {
    for (const [key, value] of Object.entries({ ...de, ...en })) {
      expect(value.length, key).toBeGreaterThan(0);
    }
  });
});

/**
 * The plural rules of SPEC2 M25.
 *
 * The defect they close was visible in the shipped game and nothing could see
 * it: `+ {count} wagons` rendered "+ 1 wagons" for a two-vehicle train, and
 * the fleet news said "1 vehicle(s) renewed automatically" - a parenthesis is
 * what a program writes when it cannot count.
 *
 * What is asserted here is the RULE in both locales, not one sentence: the
 * category comes from `Intl.PluralRules` (CLDR), so German and English are two
 * real answers and not one hand-written `count === 1` seen twice.
 */
describe('plural rules in t()', () => {
  const catalogues: Record<string, Record<string, string>> = { de, en };

  afterEach(() => {
    setLocale('de');
  });

  it('selects the singular row for exactly one, in both locales', () => {
    setLocale('en');
    expect(t('ui.fleet.plusWagons', { count: 1 })).toBe('+ 1 wagon');
    expect(t('ui.fleet.plusWagons', { count: 2 })).toBe('+ 2 wagons');
    expect(t('news.vehicleRenewed', { count: 1 })).toBe('1 vehicle renewed automatically.');
    expect(t('news.vehicleRenewed', { count: 7 })).toBe('7 vehicles renewed automatically.');

    setLocale('de');
    expect(t('ui.order.waitDays', { count: 1 })).toBe('1 Tag');
    expect(t('ui.order.waitDays', { count: 3 })).toBe('3 Tage');
    expect(t('news.vehicleRenewed', { count: 1 })).toBe('1 Fahrzeug automatisch erneuert.');
    expect(t('news.vehicleRenewed', { count: 7 })).toBe('7 Fahrzeuge automatisch erneuert.');
  });

  it('reads zero and large counts as the plural, in both locales', () => {
    // German and English agree here and other languages do not, which is why
    // the categories come from CLDR rather than from a comparison written out
    // in this file.
    for (const locale of ['de', 'en'] as const) {
      setLocale(locale);
      expect(pluralCategory(0), locale).toBe('other');
      expect(pluralCategory(1), locale).toBe('one');
      expect(pluralCategory(11), locale).toBe('other');
      expect(t('ui.flow.more', { count: 0 }), locale).toContain('0');
    }
  });

  it('falls back to the plural row when there is no usable count', () => {
    setLocale('en');
    // A caller that passes no count at all, or a formatted string instead of a
    // number, must still get a sentence - never the bare key.
    expect(t('ui.flow.more')).toBe('+{count} more flows');
    expect(t('ui.flow.more', { count: '12' as unknown as number })).toBe('+12 more flows');
  });

  it('leaves a key with no plural rows exactly as it was', () => {
    // The identity branch: everything the game said before this rule existed
    // it still says, count parameter or not (the D-201 device).
    setLocale('de');
    expect(t('ui.close')).toBe(de['ui.close']);
    expect(t('ui.train.draft', { count: 1 })).toBe(de['ui.train.draft']!.replace('{count}', '1'));
  });

  it('answers about a pluralised key when asked whether it has words', () => {
    expect(hasTranslation('news.vehicleRenewed')).toBe(true);
    expect(hasTranslation('news.thereIsNoSuchEntry')).toBe(false);
    expect(getLocale()).toBe('de');
  });

  it('gives every plural key an "other" row and no bare row, in both catalogues', () => {
    // Two failures this catches, and both are silent otherwise: a `.one`
    // without its `.other` renders the key for every count but one, and a bare
    // row beside plural rows makes the plural rows dead code, because the
    // exact key wins the lookup.
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      const stems = new Set<string>();
      for (const key of Object.keys(catalogue)) {
        const cut = key.lastIndexOf('.');
        const suffix = key.slice(cut + 1);
        if (suffix === 'one' || suffix === 'other') stems.add(key.slice(0, cut));
      }
      expect(stems.size, locale).toBeGreaterThan(0);
      for (const stem of stems) {
        expect(`${stem}.other` in catalogue, `${locale}: ${stem}.other`).toBe(true);
        expect(stem in catalogue, `${locale}: bare ${stem} beside plural rows`).toBe(false);
      }
    }
  });

  it('keeps a plural sentence naming the count it counts', () => {
    // A pluralised row whose placeholder is not `count` would select on a
    // number the sentence does not print - right by accident until the day the
    // two differ.
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const [key, text] of Object.entries(catalogue)) {
        if (!key.endsWith('.one') && !key.endsWith('.other')) continue;
        if (!/\{[a-z]/i.test(text)) continue;
        expect(text.includes('{count}'), `${locale}: ${key}`).toBe(true);
      }
    }
  });
});
