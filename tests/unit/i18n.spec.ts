import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';

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
