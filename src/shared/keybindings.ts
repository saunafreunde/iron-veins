/**
 * What a key binding IS, with no opinion about which actions exist.
 *
 * The vocabulary lives here rather than beside the action table (SPEC2 M25,
 * D-114's table becoming `actionId -> binding`) for one reason: the settings
 * file is read by `src/platform/Storage.ts`, and a settings reader that had to
 * import the interface's action table would drag half the interface into the
 * layer below it. So this file answers "is that a binding at all" - shape,
 * canonical form, how it is printed - and `src/ui/keymap.ts` answers "does
 * this build have an action of that name" when it resolves the overrides.
 *
 * A binding is a string, and the canonical form is exact: an optional `Ctrl+`,
 * then an optional `Alt+`, then one key name. Two bindings are the same
 * binding when their strings are equal, which is what makes conflict detection
 * a set lookup rather than a comparison rule somebody has to keep right.
 *
 * **Shift is deliberately not part of a binding.** Section 17.2's scheme is
 * bare letters and Ctrl combinations, a capital letter is the same physical
 * key as the small one, and a binding that needed Shift would be one that
 * cannot be typed the same way on every keyboard layout. `bindingFromEvent`
 * therefore lower-cases a character key and ignores `shiftKey`, which is
 * exactly what the pre-M25 handler did by calling `toLowerCase()`.
 */

/** Named keys a binding may use besides a single character. */
export const NAMED_KEYS: readonly string[] = [
  'Space',
  'Escape',
  'Enter',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

/** A keyboard event as this module needs to see one. */
export interface BindableEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

function isKeyName(key: string): boolean {
  if (key.length === 1) return key !== ' ';
  if (/^F([1-9]|1[0-2])$/.test(key)) return true;
  return NAMED_KEYS.includes(key);
}

/**
 * The canonical binding a key event stands for, or null when the event is not
 * one - a bare modifier press, an unnamed key, a dead key.
 */
export function bindingFromEvent(event: BindableEvent): string | null {
  const raw =
    event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!isKeyName(raw)) return null;

  let binding = '';
  if (event.ctrlKey) binding += 'Ctrl+';
  if (event.altKey) binding += 'Alt+';
  return binding + raw;
}

/** Whether a string is a binding this build would ever produce or match. */
export function isValidBinding(text: unknown): text is string {
  if (typeof text !== 'string' || text.length === 0) return false;
  let rest = text;
  if (rest.startsWith('Ctrl+')) rest = rest.slice(5);
  if (rest.startsWith('Alt+')) rest = rest.slice(4);
  if (rest.length === 1) return rest === rest.toLowerCase() && rest !== ' ';
  return isKeyName(rest);
}

/**
 * How a binding is printed - `Ctrl+Z`, `Space`, `R`.
 *
 * A single letter is shown capitalised because that is how a keycap is
 * labelled and how section 17.2 writes the scheme; it is still the same
 * binding, because the canonical form is what is stored and compared.
 */
export function bindingLabel(binding: string): string {
  const cut = binding.lastIndexOf('+');
  const modifiers = cut < 0 ? '' : binding.slice(0, cut + 1);
  const key = cut < 0 ? binding : binding.slice(cut + 1);
  return modifiers + (key.length === 1 ? key.toUpperCase() : key);
}

/**
 * The overrides out of a settings file: action id to binding, with everything
 * that is not a pair of strings in the right shape dropped.
 *
 * Which action ids EXIST is not decided here - a file written by a later build
 * may name an action this one has never heard of, and dropping it here would
 * silently delete the player's choice the first time they ran an older build.
 * `resolveBindings` in the action table is what ignores an unknown id.
 */
export function normaliseBindingOverrides(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  // Sorted by a TOTAL comparator, so a settings file that is written back is
  // byte-stable and two players who bound the same two keys in a different
  // order get one file (law #3's own rule, applied to a preferences file).
  const ids = Object.keys(raw as Record<string, unknown>).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const id of ids) {
    if (id.length === 0) continue;
    const value = (raw as Record<string, unknown>)[id];
    if (isValidBinding(value)) out[id] = value;
  }
  return out;
}
