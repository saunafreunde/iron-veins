import { bindingLabel, isValidBinding } from '../shared/keybindings';
import type { Tool } from './store';

/**
 * The keyboard scheme of section 17.2, in one table - and since SPEC2 M25 the
 * table is `actionId -> binding` rather than a fixed list of keys (D-114's own
 * sentence, delivered).
 *
 * One table rather than a switch in `App.tsx`, because the options screen has
 * to be able to SHOW the bindings, and a list of keys typed out a second time
 * in a help panel is a list that goes out of date the first time a key moves.
 * Now that a player may MOVE one, the same argument is what makes the handler
 * read the table too: the screen and the handler agree because there is one
 * answer to "which key does this", not because somebody kept two lists level.
 *
 * What a rebinding may not do is leave the game with two actions on one key or
 * with an action on no key at all. Both are decided here, in pure functions,
 * so the refusal is a test rather than a screen somebody has to try
 * (`tests/unit/keybindings.spec.ts`).
 */

/** Every action a key can reach. The id is what the settings file stores. */
export type KeyActionId =
  | 'panUp'
  | 'panDown'
  | 'panLeft'
  | 'panRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'pause'
  | 'speed1'
  | 'speed2'
  | 'speed3'
  | 'speed4'
  | 'toolTrack'
  | 'toolRoad'
  | 'toolQuay'
  | 'toolAirport'
  | 'toolSignal'
  | 'toolPlatform'
  | 'toolRailDepot'
  | 'toolDemolish'
  | 'assistant'
  | 'minimapMode'
  | 'flowAtlas'
  | 'heatmap'
  | 'listVehicles'
  | 'listLines'
  | 'listStations'
  | 'listTowns'
  | 'listIndustries'
  | 'handbook'
  | 'replays'
  | 'debug'
  | 'quickSave'
  | 'quickLoad'
  | 'undo'
  | 'redo'
  | 'escape';

export interface KeyAction {
  readonly id: KeyActionId;
  /** The binding of section 17.2, used unless the player moved it. */
  readonly defaultBinding: string;
  readonly descriptionKey: string;
  /**
   * A binding the player may not move. Exactly one action is fixed, and it is
   * Escape: 17.2's escape ladder is what gets a player out of an armed tool,
   * an overlay and a menu, and an accessibility feature that let somebody bind
   * their only way out to a key they then forgot would be the opposite of one.
   */
  readonly fixed?: true;
}

/**
 * The scheme, in the order the options screen prints it.
 *
 * The order is also the tie-break of `resolveBindings`, so it is part of the
 * behaviour rather than a layout choice: an override that collides with an
 * earlier action's binding is the one that is dropped.
 */
export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'escape', defaultBinding: 'Escape', descriptionKey: 'ui.key.escape', fixed: true },
  // The camera comes first in the table because it is the first thing a player
  // does, and because it was the one thing section 17.2 never gave a key: the
  // map could be moved with the right mouse button and the minimap and by
  // nothing else, which reads as a map that cannot be moved.
  { id: 'panUp', defaultBinding: 'ArrowUp', descriptionKey: 'ui.key.panUp' },
  { id: 'panDown', defaultBinding: 'ArrowDown', descriptionKey: 'ui.key.panDown' },
  { id: 'panLeft', defaultBinding: 'ArrowLeft', descriptionKey: 'ui.key.panLeft' },
  { id: 'panRight', defaultBinding: 'ArrowRight', descriptionKey: 'ui.key.panRight' },
  // Plus and minus, which are one unshifted key each on a German keyboard and
  // reachable through Shift on the layouts where they are not - Shift is not
  // part of a binding, so both arrive as the same character (keybindings.ts).
  { id: 'zoomIn', defaultBinding: '+', descriptionKey: 'ui.key.zoomIn' },
  { id: 'zoomOut', defaultBinding: '-', descriptionKey: 'ui.key.zoomOut' },
  { id: 'pause', defaultBinding: 'Space', descriptionKey: 'ui.key.pause' },
  // The four speeds of 17.2 are four actions rather than one row reading
  // "1 - 4": a row that stands for four keys is a row a rebinding screen
  // cannot offer, and the conflict check would have nothing to compare.
  { id: 'speed1', defaultBinding: '1', descriptionKey: 'ui.key.speed1' },
  { id: 'speed2', defaultBinding: '2', descriptionKey: 'ui.key.speed2' },
  { id: 'speed3', defaultBinding: '3', descriptionKey: 'ui.key.speed3' },
  { id: 'speed4', defaultBinding: '4', descriptionKey: 'ui.key.speed4' },
  { id: 'toolTrack', defaultBinding: 'r', descriptionKey: 'ui.key.rail' },
  { id: 'toolRoad', defaultBinding: 's', descriptionKey: 'ui.key.road' },
  { id: 'toolQuay', defaultBinding: 'w', descriptionKey: 'ui.key.water' },
  { id: 'toolAirport', defaultBinding: 'f', descriptionKey: 'ui.key.air' },
  { id: 'toolSignal', defaultBinding: 'g', descriptionKey: 'ui.key.signal' },
  { id: 'toolPlatform', defaultBinding: 'b', descriptionKey: 'ui.key.station' },
  { id: 'toolRailDepot', defaultBinding: 'd', descriptionKey: 'ui.key.depot' },
  { id: 'toolDemolish', defaultBinding: 'x', descriptionKey: 'ui.key.demolish' },
  { id: 'assistant', defaultBinding: 'm', descriptionKey: 'ui.key.manual' },
  { id: 'listVehicles', defaultBinding: 'v', descriptionKey: 'ui.key.vehicles' },
  // L belongs to the LINE list, as section 17.2 always said - D-114 lent it
  // to the station list only while lines did not exist. The station list
  // moved to H (for "Haltestellen"), the nearest free letter with a mnemonic.
  { id: 'listLines', defaultBinding: 'l', descriptionKey: 'ui.key.lines' },
  { id: 'listStations', defaultBinding: 'h', descriptionKey: 'ui.key.stations' },
  { id: 'listTowns', defaultBinding: 't', descriptionKey: 'ui.key.towns' },
  { id: 'listIndustries', defaultBinding: 'i', descriptionKey: 'ui.key.industries' },
  { id: 'minimapMode', defaultBinding: 'n', descriptionKey: 'ui.key.minimapMode' },
  // The flow atlas of SPEC2 M14: A as in "Atlas", free in both languages.
  { id: 'flowAtlas', defaultBinding: 'a', descriptionKey: 'ui.key.flowAtlas' },
  // The utilisation heat map of SPEC2 M15: U for "Utilisation", and the
  // reading letter of "Auslastung" - free in both languages.
  { id: 'heatmap', defaultBinding: 'u', descriptionKey: 'ui.key.heatmap' },
  { id: 'handbook', defaultBinding: 'F1', descriptionKey: 'ui.key.handbook' },
  // The replay theatre of SPEC2 M16 sits on the F row rather than on a letter:
  // every letter with a mnemonic in either language is already a build tool or
  // a list (R, S, W, A and U all went that way), and the full-screen overlays
  // are what the F row is for.
  { id: 'replays', defaultBinding: 'F2', descriptionKey: 'ui.key.replays' },
  { id: 'debug', defaultBinding: 'F3', descriptionKey: 'ui.key.debug' },
  { id: 'quickSave', defaultBinding: 'F5', descriptionKey: 'ui.key.quickSave' },
  { id: 'quickLoad', defaultBinding: 'F9', descriptionKey: 'ui.key.quickLoad' },
  // Undo and redo (SPEC2 M25, E-12). D-114 left these two lines out of the
  // table on purpose - "the keys are unbound and this is written down rather
  // than left as a key that does nothing" - because a partial undo would be
  // worse than none. The inverse-patch ring is what makes them whole, so they
  // joined the table in M25's first bundle, on the two combinations every
  // desktop application gives them.
  { id: 'undo', defaultBinding: 'Ctrl+z', descriptionKey: 'ui.key.undo' },
  { id: 'redo', defaultBinding: 'Ctrl+y', descriptionKey: 'ui.key.redo' },
];

/**
 * Which tool a tool action arms. Section 17.2 assigns R/S/W/F to the four
 * modes, G to signals, B to stations and D to depots; the tool that is reached
 * depends on the mode that is active, which is why the store, not this table,
 * decides what "road" means once it is armed.
 */
/**
 * Which way a pan action pushes the camera, as a unit vector in SCREEN space.
 *
 * A table rather than a switch, for the reason every other table in this file
 * is one: the handler has to know which actions are HELD - a pan key is the
 * only kind whose release means something - and asking this map is the same
 * question the key-up handler needs to ask.
 */
export const PAN_OF_ACTION: Readonly<Partial<Record<KeyActionId, readonly [number, number]>>> = {
  panUp: [0, -1],
  panDown: [0, 1],
  panLeft: [-1, 0],
  panRight: [1, 0],
};

/**
 * The actions that still work while a full-screen overlay is open.
 *
 * The first cut of this rule was "everything except Escape", and it took four
 * things away that a player needs precisely while a menu is up: the clock -
 * whose hint under the menu SAYS the game keeps running - and the two keys
 * that CLOSE the overlay they opened, F1 and F2, whose handlers are toggles
 * and became unreachable the moment the overlay was open.
 *
 * The line is what the action ACTS ON. Nothing here touches the map: the four
 * speeds and pause are control traffic (D-004), the two overlay keys move the
 * interface, and Escape is the way out. Everything else - tools, the camera,
 * the lists, undo, the shelf - would act on a world the player cannot see,
 * under a panel that covers it.
 */
export const OVERLAY_SAFE_ACTIONS: ReadonlySet<KeyActionId> = new Set<KeyActionId>([
  'escape',
  'pause',
  'speed1',
  'speed2',
  'speed3',
  'speed4',
  'handbook',
  'replays',
]);

/**
 * Where the camera should be heading, given the pan keys that are DOWN.
 *
 * Normalised, or a diagonal would cross the map 1.41 times as fast as an edge -
 * the classic bug of eight-way movement. Two opposite keys cancel to a standing
 * camera rather than to whichever was pressed last, which is what a player who
 * is holding both expects.
 *
 * A pure function so the arithmetic is a test rather than something somebody
 * has to feel out with four fingers on a keyboard.
 */
export function panVector(held: Iterable<KeyActionId>): readonly [number, number] {
  let x = 0;
  let y = 0;
  for (const action of held) {
    const direction = PAN_OF_ACTION[action];
    if (direction === undefined) continue;
    x += direction[0];
    y += direction[1];
  }
  const length = Math.hypot(x, y);
  return length === 0 ? [0, 0] : [x / length, y / length];
}

export const TOOL_OF_ACTION: Readonly<Partial<Record<KeyActionId, Tool>>> = {
  toolTrack: 'track',
  toolRoad: 'road',
  toolQuay: 'quay',
  toolAirport: 'airport',
  toolSignal: 'signal',
  toolPlatform: 'platform',
  toolRailDepot: 'raildepot',
  toolDemolish: 'demolish',
};

/**
 * What every action is bound to, in force. An action may be MISSING from it,
 * which is the honest answer when a player gave its default key to something
 * else: the options screen prints a dash and the handler reaches nothing.
 */
export type ResolvedBindings = Readonly<Partial<Record<KeyActionId, string>>>;

/** Every action, by id. */
const ACTION_BY_ID = new Map<string, KeyAction>(KEY_ACTIONS.map((action) => [action.id, action]));

/** The action of that id, or undefined - the door for a stored override. */
export function keyAction(id: string): KeyAction | undefined {
  return ACTION_BY_ID.get(id);
}

/**
 * The bindings in force: the table's defaults with the player's overrides laid
 * over them, and every override that cannot be honoured dropped.
 *
 * Three things are dropped, each for its own reason. An id this build has
 * never heard of, because a file written by a later build must not be able to
 * bind a key to nothing. An override on a fixed action, because Escape is not
 * the player's to move. And an override that collides with a binding an
 * EARLIER row already holds, because the alternative is two actions on one key
 * - which is the state a hand-edited file can produce and the screen cannot.
 * Table order decides who wins, so the outcome is a total order rather than an
 * object's key order.
 */
export function resolveBindings(overrides: Readonly<Record<string, string>>): ResolvedBindings {
  const resolved: Record<string, string> = {};
  const taken = new Map<string, KeyActionId>();

  // Pass zero: the fixed actions, which hold their binding against everything
  // below - including a file that tried to give Escape to something else.
  for (const action of KEY_ACTIONS) {
    if (action.fixed !== true) continue;
    resolved[action.id] = action.defaultBinding;
    taken.set(action.defaultBinding, action.id);
  }

  // Pass one: everything that is being MOVED, in table order.
  for (const action of KEY_ACTIONS) {
    if (action.fixed === true) continue;
    const wanted = overrides[action.id];
    if (wanted === undefined || !isValidBinding(wanted)) continue;
    if (taken.has(wanted)) continue;
    resolved[action.id] = wanted;
    taken.set(wanted, action.id);
  }

  // Pass two: the defaults, for everything that was not moved - including an
  // action whose override was just dropped, which therefore falls back to its
  // own key rather than to nothing. What is NOT recovered is a default another
  // action has taken: that action has no key at all, the options screen prints
  // a dash for it, and the player can repair it. Still better than one key
  // doing two things, which is the state this pass exists to make impossible.
  for (const action of KEY_ACTIONS) {
    if (resolved[action.id] !== undefined) continue;
    const fallback = action.defaultBinding;
    if (taken.has(fallback)) continue;
    resolved[action.id] = fallback;
    taken.set(fallback, action.id);
  }

  return resolved;
}

/**
 * The action a binding reaches, or null. Built once per resolve rather than
 * searched per key press: a keydown handler runs on every character a player
 * types anywhere in the interface.
 */
export function bindingIndex(resolved: ResolvedBindings): ReadonlyMap<string, KeyActionId> {
  const index = new Map<string, KeyActionId>();
  for (const action of KEY_ACTIONS) {
    const binding = resolved[action.id];
    if (binding !== undefined && !index.has(binding)) index.set(binding, action.id);
  }
  return index;
}

/** What a rebinding attempt answered. */
export type RebindResult =
  | { readonly ok: true; readonly overrides: Record<string, string> }
  | { readonly ok: false; readonly reason: 'conflict'; readonly conflictWith: KeyActionId }
  | { readonly ok: false; readonly reason: 'fixed' | 'invalid'; readonly conflictWith?: undefined };

/**
 * Move an action onto a binding, or refuse and say why.
 *
 * Refused rather than resolved: a rebinding screen that silently unbound the
 * action already sitting on that key would be the "partial undo" mistake in
 * another currency (Fehlerkatalog 30) - the player would leave the screen
 * believing both keys worked. The conflicting action is named so the message
 * can say which one it is.
 *
 * Binding an action back onto its own default REMOVES the override rather than
 * storing it, so a settings file only ever carries what actually differs.
 */
export function rebindAction(
  overrides: Readonly<Record<string, string>>,
  id: KeyActionId,
  binding: string,
): RebindResult {
  const action = keyAction(id);
  if (action === undefined || !isValidBinding(binding)) return { ok: false, reason: 'invalid' };
  if (action.fixed === true) return { ok: false, reason: 'fixed' };

  const resolved = resolveBindings(overrides);
  for (const other of KEY_ACTIONS) {
    if (other.id === id) continue;
    if (resolved[other.id] === binding) {
      return { ok: false, reason: 'conflict', conflictWith: other.id };
    }
  }

  const next: Record<string, string> = { ...overrides };
  if (binding === action.defaultBinding) delete next[id];
  else next[id] = binding;
  return { ok: true, overrides: next };
}

/** Forget every override - the "restore the scheme" button. */
export function defaultBindings(): Record<string, string> {
  return {};
}

/** What the options screen and the handbook print for an action. */
export function displayBinding(binding: string | undefined): string {
  return binding === undefined ? '—' : bindingLabel(binding);
}
