import type { Tool } from './store';

/**
 * The keyboard scheme of section 17.2, in one table.
 *
 * One table rather than a switch in `App.tsx`, because the options screen has
 * to be able to SHOW the bindings, and a list of keys typed out a second time
 * in a help panel is a list that goes out of date the first time a key moves.
 */

export interface KeyBinding {
  /** What the options screen prints. */
  readonly display: string;
  readonly descriptionKey: string;
}

/**
 * Which tool a letter selects. Section 17.2 assigns R/S/W/F to the four modes,
 * G to signals, B to stations and D to depots; the tool that is reached depends
 * on the mode that is active, which is why this is a table of tables.
 */
export const TOOL_KEYS: Readonly<Record<string, Tool>> = {
  r: 'track',
  s: 'road',
  w: 'quay',
  f: 'airport',
  g: 'signal',
  b: 'platform',
  d: 'raildepot',
  x: 'demolish',
};

/** The whole scheme, for the options screen and the handbook. */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { display: 'Space', descriptionKey: 'ui.key.pause' },
  { display: '1 – 4', descriptionKey: 'ui.key.speed' },
  { display: 'R', descriptionKey: 'ui.key.rail' },
  { display: 'S', descriptionKey: 'ui.key.road' },
  { display: 'W', descriptionKey: 'ui.key.water' },
  { display: 'F', descriptionKey: 'ui.key.air' },
  { display: 'G', descriptionKey: 'ui.key.signal' },
  { display: 'B', descriptionKey: 'ui.key.station' },
  { display: 'D', descriptionKey: 'ui.key.depot' },
  { display: 'X', descriptionKey: 'ui.key.demolish' },
  { display: 'M', descriptionKey: 'ui.key.manual' },
  { display: 'V', descriptionKey: 'ui.key.vehicles' },
  // L belongs to the LINE list, as section 17.2 always said - D-114 lent it
  // to the station list only while lines did not exist. The station list
  // moved to H (for "Haltestellen"), the nearest free letter with a mnemonic.
  { display: 'L', descriptionKey: 'ui.key.lines' },
  { display: 'H', descriptionKey: 'ui.key.stations' },
  { display: 'T', descriptionKey: 'ui.key.towns' },
  { display: 'I', descriptionKey: 'ui.key.industries' },
  { display: 'N', descriptionKey: 'ui.key.minimapMode' },
  // The flow atlas of SPEC2 M14: A as in "Atlas", free in both languages.
  { display: 'A', descriptionKey: 'ui.key.flowAtlas' },
  { display: 'F1', descriptionKey: 'ui.key.handbook' },
  { display: 'F3', descriptionKey: 'ui.key.debug' },
  { display: 'F5', descriptionKey: 'ui.key.quickSave' },
  { display: 'F9', descriptionKey: 'ui.key.quickLoad' },
  { display: 'Esc', descriptionKey: 'ui.key.escape' },
];
