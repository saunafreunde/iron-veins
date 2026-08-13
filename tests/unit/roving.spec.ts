import { describe, expect, it } from 'vitest';
import { clampRovingIndex, nextRovingIndex, ROVING_KEYS } from '../../src/ui/roving';

/**
 * Roving focus in the lists of section 17.1 (SPEC2 M25).
 *
 * The arithmetic is what makes the list ONE tab stop instead of four hundred,
 * so it is asserted rather than tried: a cursor that could leave the list would
 * focus nothing, and the next arrow press would look like a broken key.
 */
describe('the roving cursor', () => {
  it('moves one row per arrow press', () => {
    expect(nextRovingIndex(0, 'ArrowDown', 5)).toBe(1);
    expect(nextRovingIndex(3, 'ArrowUp', 5)).toBe(2);
  });

  it('clamps at both ends rather than wrapping', () => {
    // Deliberate: a list that jumps from its last row back to the first loses
    // a keyboard user who is holding the key down.
    expect(nextRovingIndex(4, 'ArrowDown', 5)).toBe(4);
    expect(nextRovingIndex(0, 'ArrowUp', 5)).toBe(0);
  });

  it('goes to the ends with Home and End', () => {
    expect(nextRovingIndex(3, 'Home', 5)).toBe(0);
    expect(nextRovingIndex(1, 'End', 5)).toBe(4);
  });

  it('leaves every other key to the browser', () => {
    for (const key of ['Enter', ' ', 'a', 'Tab', 'PageDown']) {
      expect(nextRovingIndex(0, key, 5), key).toBeNull();
    }
    expect(ROVING_KEYS.every((key) => nextRovingIndex(0, key, 5) !== null)).toBe(true);
  });

  it('answers nothing at all for an empty list', () => {
    // Consuming the press would swallow the browser's own scrolling on a list
    // whose filter matched nothing.
    for (const key of ROVING_KEYS) {
      expect(nextRovingIndex(0, key, 0), key).toBeNull();
    }
  });

  it('survives a cursor that is out of range', () => {
    // A filter that shortens the list leaves the cursor past the end until the
    // next render; both functions have to answer sensibly in that frame.
    expect(nextRovingIndex(99, 'ArrowUp', 5)).toBe(3);
    expect(nextRovingIndex(-3, 'ArrowDown', 5)).toBe(1);
    expect(clampRovingIndex(99, 5)).toBe(4);
    expect(clampRovingIndex(-1, 5)).toBe(0);
    expect(clampRovingIndex(3, 0)).toBe(0);
  });
});
