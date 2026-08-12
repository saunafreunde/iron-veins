import {
  DEFAULT_MAP_GEN_KNOBS,
  MAP_PRESET_DEFAULT_KNOBS,
  MAP_PRESET_SHAPES,
  MAPGEN_HILLINESS_GAIN,
  MAPGEN_KNOB_NEUTRAL,
  MAPGEN_RESOURCE_RICHNESS,
  MAPGEN_RIVER_SCALE,
  MAPGEN_SEA_LEVEL_SHIFT,
  MAPGEN_TOWN_DENSITY,
  type MapGenKnobs,
  type MapPreset,
  type MapPresetShape,
} from '../constants';

/**
 * The generator's controls, read (SPEC2 M23).
 *
 * One module between the saved steps and the four passes that consume them, so
 * "step 3 of the hilliness control" is looked up in exactly one place. The
 * step is what the world SAVES; the factor is what the generator multiplies
 * by, and nothing outside this file knows the second exists.
 *
 * Every lookup is total: an out-of-range step falls back to the neutral one
 * rather than returning `undefined`. The parser refuses such a step long
 * before a world is built (`save/format.ts`), so this is the belt to that
 * brace - and law #3's reason for it is that a `NaN` multiplier would not
 * throw, it would quietly produce a map of nothing.
 */

/** The step is inside the table, or the neutral one. */
function stepOf(table: readonly number[], step: number): number {
  const value = table[step];
  return value === undefined ? table[MAPGEN_KNOB_NEUTRAL]! : value;
}

/** The ground shape a preset draws. Falls back to the identity. */
export function presetShape(preset: MapPreset): MapPresetShape {
  return MAP_PRESET_SHAPES[preset] ?? MAP_PRESET_SHAPES[0]!;
}

/**
 * The knobs a preset opens on - what the new-game screen fills in, and what
 * the tests generate a preset's own map with.
 *
 * The preset is carried through so that "the ground this preset draws" and
 * "the settings it suggests" are one record, which is what makes a saved world
 * able to say which preset drew it after the player has moved a control.
 */
export function knobsForPreset(preset: MapPreset): MapGenKnobs {
  const row = MAP_PRESET_DEFAULT_KNOBS[preset];
  if (row === undefined) return DEFAULT_MAP_GEN_KNOBS;
  return {
    preset,
    seaLevel: row[0]!,
    hilliness: row[1]!,
    rivers: row[2]!,
    townDensity: row[3]!,
    resources: row[4]!,
  };
}

/** How much height the sea takes at this step. [fraction of full height] */
export function seaLevelShiftOf(knobs: MapGenKnobs): number {
  return stepOf(MAPGEN_SEA_LEVEL_SHIFT, knobs.seaLevel);
}

/** Relief gain about the land pivot at this step. [1] */
export function hillinessGainOf(knobs: MapGenKnobs): number {
  return stepOf(MAPGEN_HILLINESS_GAIN, knobs.hilliness);
}

/** Factor on the drawn river-source count at this step. [1] */
export function riverScaleOf(knobs: MapGenKnobs): number {
  return stepOf(MAPGEN_RIVER_SCALE, knobs.rivers);
}

/** Factor on the area rule for towns at this step. [1] */
export function townDensityOf(knobs: MapGenKnobs): number {
  return stepOf(MAPGEN_TOWN_DENSITY, knobs.townDensity);
}

/** Factor on the area rule for industries at this step. [1] */
export function resourceRichnessOf(knobs: MapGenKnobs): number {
  return stepOf(MAPGEN_RESOURCE_RICHNESS, knobs.resources);
}
