import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import {
  bindingFromEvent,
  bindingLabel,
  isValidBinding,
  normaliseBindingOverrides,
} from '../../src/shared/keybindings';
import { normaliseSettings } from '../../src/shared/settings';
import {
  bindingIndex,
  defaultBindings,
  displayBinding,
  keyAction,
  rebindAction,
  resolveBindings,
  KEY_ACTIONS,
  TOOL_OF_ACTION,
  type KeyActionId,
} from '../../src/ui/keymap';

/**
 * Key rebinding (SPEC2 M25): D-114's table becomes `actionId -> binding` with
 * a conflict check.
 *
 * The property that matters is not that a key can be moved - it is that the
 * table can never end up with two actions on one key or with an action a
 * player believes is bound and is not. Both are decided by pure functions, so
 * both are asserted here rather than in a screen somebody has to try.
 */

const NO_OVERRIDES: Record<string, string> = {};

describe('the binding vocabulary', () => {
  it('turns a key event into a canonical binding', () => {
    expect(bindingFromEvent({ key: 'r', ctrlKey: false, altKey: false })).toBe('r');
    // A capital letter is the same physical key: Shift is not part of a
    // binding, which is exactly what the pre-M25 handler did by lower-casing.
    expect(bindingFromEvent({ key: 'R', ctrlKey: false, altKey: false })).toBe('r');
    expect(bindingFromEvent({ key: ' ', ctrlKey: false, altKey: false })).toBe('Space');
    expect(bindingFromEvent({ key: 'z', ctrlKey: true, altKey: false })).toBe('Ctrl+z');
    expect(bindingFromEvent({ key: 'F5', ctrlKey: false, altKey: false })).toBe('F5');
    expect(bindingFromEvent({ key: 'ArrowUp', ctrlKey: false, altKey: true })).toBe('Alt+ArrowUp');
  });

  it('is not fooled by a bare modifier or a key it cannot name', () => {
    expect(bindingFromEvent({ key: 'Control', ctrlKey: true, altKey: false })).toBeNull();
    expect(bindingFromEvent({ key: 'Shift', ctrlKey: false, altKey: false })).toBeNull();
    expect(bindingFromEvent({ key: 'F13', ctrlKey: false, altKey: false })).toBeNull();
  });

  it('prints a binding the way a keycap is labelled', () => {
    expect(bindingLabel('r')).toBe('R');
    expect(bindingLabel('Ctrl+z')).toBe('Ctrl+Z');
    expect(bindingLabel('Space')).toBe('Space');
    expect(displayBinding(undefined)).toBe('—');
  });

  it('refuses anything that is not a binding at all', () => {
    expect(isValidBinding('')).toBe(false);
    expect(isValidBinding('Meta+q')).toBe(false);
    expect(isValidBinding('R')).toBe(false); // canonical form is lower case
    expect(isValidBinding(42)).toBe(false);
    expect(isValidBinding('Ctrl+Alt+f')).toBe(true);
  });
});

describe('resolving the table', () => {
  it('is section 17.2 with nothing overridden', () => {
    const resolved = resolveBindings(NO_OVERRIDES);
    for (const action of KEY_ACTIONS) {
      expect(resolved[action.id], action.id).toBe(action.defaultBinding);
    }
    // Every default is distinct, or the shipped scheme would already have two
    // actions on one key.
    const bindings = KEY_ACTIONS.map((action) => action.defaultBinding);
    expect(new Set(bindings).size).toBe(bindings.length);
  });

  it('leaves no action of the table unnamed and untranslated', () => {
    for (const action of KEY_ACTIONS) {
      expect(action.descriptionKey in de, action.descriptionKey).toBe(true);
      expect(action.descriptionKey in en, action.descriptionKey).toBe(true);
    }
    // Every tool action arms a tool, and nothing else claims to.
    for (const id of Object.keys(TOOL_OF_ACTION)) {
      expect(keyAction(id), id).toBeDefined();
    }
  });

  it('gives a moved action its new key and leaves the rest alone', () => {
    const resolved = resolveBindings({ toolTrack: 'k' });
    expect(resolved.toolTrack).toBe('k');
    expect(resolved.toolRoad).toBe('s');
    // The key it left is now free - the index knows nothing about 'r'.
    expect(bindingIndex(resolved).get('r')).toBeUndefined();
    expect(bindingIndex(resolved).get('k')).toBe('toolTrack');
  });

  it('drops an override a hand-edited file put on two actions', () => {
    // The screen refuses this (below); a file can still carry it, and the
    // resolve is what makes it impossible for a key to do two things. Table
    // order decides the winner, so the outcome is a total order rather than an
    // object's key order.
    const resolved = resolveBindings({ toolTrack: 'q', toolRoad: 'q' });
    const holders = KEY_ACTIONS.filter((action) => resolved[action.id] === 'q');
    expect(holders.map((action) => action.id)).toEqual(['toolTrack']);
    // The loser keeps its own default rather than somebody else's key: nothing
    // has taken 's', so there is a working answer to fall back on.
    expect(resolved.toolRoad).toBe('s');
  });

  it('leaves an action unbound when another one is sitting on its key', () => {
    // The one case where a table really has an action with no key: the player
    // moved the ROAD tool onto the track tool's letter, so nothing can fall
    // back to 'r'. The options screen prints a dash and the player repairs it -
    // which is still better than 'r' arming two tools.
    const resolved = resolveBindings({ toolRoad: 'r' });
    expect(resolved.toolRoad).toBe('r');
    expect(resolved.toolTrack).toBeUndefined();
    expect(displayBinding(resolved.toolTrack)).toBe('—');
    expect(bindingIndex(resolved).get('r')).toBe('toolRoad');
  });

  it('never lets an override take the one fixed binding', () => {
    const resolved = resolveBindings({ toolTrack: 'Escape' });
    expect(resolved.escape).toBe('Escape');
    expect(resolved.toolTrack).toBe('r');
    expect(bindingIndex(resolved).get('Escape')).toBe('escape');
  });

  it('ignores an id this build has never heard of', () => {
    const resolved = resolveBindings({ 'a.later.build.s.action': 'q' });
    expect(bindingIndex(resolved).get('q')).toBeUndefined();
    expect(resolved.pause).toBe('Space');
  });

  it('binds every action of the table to something, by default', () => {
    const index = bindingIndex(resolveBindings(NO_OVERRIDES));
    const reached = new Set<KeyActionId>(index.values());
    expect(reached.size).toBe(KEY_ACTIONS.length);
  });
});

describe('rebinding refuses a conflict', () => {
  it('names the action already sitting on the key and changes nothing', () => {
    const result = rebindAction(NO_OVERRIDES, 'toolTrack', 's');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('conflict');
    expect(result.conflictWith).toBe('toolRoad');
  });

  it('refuses the fixed binding from both sides', () => {
    // Onto Escape: a conflict with the action that owns it.
    const onto = rebindAction(NO_OVERRIDES, 'toolTrack', 'Escape');
    expect(onto.ok).toBe(false);
    if (!onto.ok) expect(onto.conflictWith).toBe('escape');

    // And Escape itself may not be moved.
    const away = rebindAction(NO_OVERRIDES, 'escape', 'q');
    expect(away.ok).toBe(false);
    if (!away.ok) expect(away.reason).toBe('fixed');
  });

  it('accepts a free key and stores only the difference', () => {
    const result = rebindAction(NO_OVERRIDES, 'toolTrack', 'k');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.overrides).toEqual({ toolTrack: 'k' });

    // Back onto its own default is a REMOVAL, so a settings file only ever
    // carries what really differs from the scheme.
    const back = rebindAction(result.overrides, 'toolTrack', 'r');
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error('unreachable');
    expect(back.overrides).toEqual({});
  });

  it('lets the key an action just left be taken by another', () => {
    const moved = rebindAction(NO_OVERRIDES, 'toolTrack', 'k');
    if (!moved.ok) throw new Error('unreachable');
    const second = rebindAction(moved.overrides, 'toolRoad', 'r');
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('unreachable');
    expect(resolveBindings(second.overrides).toolRoad).toBe('r');
    expect(resolveBindings(second.overrides).toolTrack).toBe('k');
  });

  it('refuses a binding that is not one, and rebinds nothing', () => {
    const result = rebindAction(NO_OVERRIDES, 'toolTrack', 'Meta+q');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('restores the scheme whole', () => {
    expect(resolveBindings(defaultBindings())).toEqual(resolveBindings(NO_OVERRIDES));
  });
});

describe('the overrides in the settings file', () => {
  it('keeps what is a binding and drops what is not', () => {
    expect(
      normaliseBindingOverrides({ toolTrack: 'k', toolRoad: 42, toolQuay: 'Meta+q', '': 'x' }),
    ).toEqual({ toolTrack: 'k' });
  });

  it('reads nonsense as no overrides at all', () => {
    expect(normaliseBindingOverrides(null)).toEqual({});
    expect(normaliseBindingOverrides(['k'])).toEqual({});
    expect(normaliseBindingOverrides('k')).toEqual({});
  });

  it('travels through the settings reader intact', () => {
    const settings = normaliseSettings({ keyBindings: { toolTrack: 'k', nonsense: 5 } });
    expect(settings.keyBindings).toEqual({ toolTrack: 'k' });
    expect(resolveBindings(settings.keyBindings).toolTrack).toBe('k');
  });
});
