/**
 * Roving focus for the lists of section 17.1 (SPEC2 M25).
 *
 * A list of four hundred vehicles with a tab stop on every row is a list a
 * keyboard cannot get past: Tab has to be pressed four hundred times to reach
 * the panel below it. The pattern every accessibility guide names for that is
 * ROVING focus - the list is ONE tab stop, and the arrow keys move a cursor
 * inside it - and that is what this file decides.
 *
 * Pure on purpose: which row the arrow keys reach is arithmetic, so it is
 * tested headless and the component keeps only the state (`ListPanel` holds
 * the index and puts `tabIndex` 0 on exactly one row).
 */

/** Keys the list consumes. Everything else is left for the browser. */
export const ROVING_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * Where the cursor goes, or null when the key is not one of ours.
 *
 * Clamped rather than wrapped, and that is a decision: a list that jumps from
 * its last row back to the first loses a keyboard user who is holding the
 * arrow key down, because nothing tells them they arrived at the end. Home and
 * End are the way to the ends, as they are in every list widget.
 *
 * An empty list answers null for every key - there is nothing to move to, and
 * consuming the press would swallow the browser's own scrolling.
 */
export function nextRovingIndex(current: number, key: string, length: number): number | null {
  if (length <= 0) return null;
  const clamped = current < 0 ? 0 : current >= length ? length - 1 : current;
  switch (key) {
    case 'ArrowDown':
      return Math.min(length - 1, clamped + 1);
    case 'ArrowUp':
      return Math.max(0, clamped - 1);
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

/**
 * The index the list should hold after its rows changed.
 *
 * A filter that shortens the list must not leave the cursor past the end -
 * the row it points at no longer exists, so nothing would be focusable and
 * the next arrow press would appear to do nothing.
 */
export function clampRovingIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return current < 0 ? 0 : current >= length ? length - 1 : current;
}
