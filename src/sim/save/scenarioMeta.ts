import { SCENARIO_TEXT_MAX_CHARS } from '../constants';

/**
 * The `.ironscenario` metadata block (SPEC2 M17).
 *
 * A scenario is NOT a second file format. It is the save container with one
 * extra section - this one - and the whole design follows from SPEC2's own
 * sentence: "Ein Serializer: Szenario-Kompatibilitaet IST Save-Kompatibilitaet."
 * A scenario therefore migrates, validates and loads through exactly the code a
 * save does, and a second parser cannot fall behind the first one the way D-133
 * describes.
 *
 * **This block is UNHASHED, and that is the whole point** (SPEC2 Fehlerkatalog
 * 35). A briefing typo must never become a desync: two players holding the same
 * scenario with one word different in the German text have the same WORLD, and
 * their recordings verify against each other. So the block travels in the
 * container beside `gameVersion`, `commandLog` and the checkpoint ring - the
 * family of things a save carries ABOUT itself rather than IN itself - and
 * `hashWorld` never sees it.
 *
 * Keeping it out of the digest is not a promise, it is a proof: this module is
 * import-free apart from one constant, nothing under `src/sim` outside
 * `src/sim/save/` may name it (`tests/unit/scenarioCoupling.spec.ts` walks the
 * sources and fails the day one does), and the same test perturbs every leaf of
 * a real encoded scenario and asserts the world hash does not move - with a
 * meta-test that plants the briefing INTO the hash and proves the audit fires.
 *
 * What is deliberately NOT here:
 *
 *  - **the medal bands.** SPEC2 lists them among the metadata and D-193 refused
 *    that: a medal decided from unhashed bytes is a medal a typo can change.
 *    The three band ticks are fields of the GOAL DESCRIPTOR in hashed world
 *    state; a briefing may DESCRIBE them in prose, and the prose is what lives
 *    here.
 *  - **the goals themselves.** Same argument, same place: `state.goals` is what
 *    the simulation decides against. What this block carries is one CAPTION per
 *    goal, in slot order, so the browser can name what the player is being
 *    asked for in their own language. The parser cross-checks the count, so a
 *    scenario cannot brief three goals and set four.
 */

/** A metadata string in both catalogue languages. Neither half may be empty. */
export interface ScenarioText {
  readonly de: string;
  readonly en: string;
}

/**
 * The world rules a scenario may pin.
 *
 * Every name here is a `NewGameParams` field that is ALSO a top-level field of
 * the saved, hashed world state - which is exactly D-110's definition of a game
 * rule as opposed to a setting, and Z2's requirement that a rule be saved,
 * hashed and migrated. `tests/unit/scenarioCoupling.spec.ts` holds both
 * directions against the real `NewGameParams` (a new field there is a compile
 * error until somebody decides whether it is lockable) and against the real
 * `AppSettings` (a name that is a setting is a red build).
 *
 * The list is in ascending order because the wire form must be, which makes a
 * scenario's lock set canonical rather than however the author's editor
 * happened to emit it.
 */
export const SCENARIO_LOCKABLE_RULES = [
  'climate',
  'difficulty',
  'economy',
  'elections',
  'emissions',
  'endless',
  'goals',
  'inflation',
  'mapSize',
  'occupancyPenalty',
  'roadCongestion',
  'seed',
  'signalPenalty',
  'startYear',
  'weather',
] as const;

export type ScenarioRule = (typeof SCENARIO_LOCKABLE_RULES)[number];

/**
 * What a scenario says about itself.
 *
 * `fromTick`/`toTick` are the date span the browser card prints, and they are
 * DESCRIPTIVE on purpose: a span that ended the game would be a world rule and
 * would have to be hashed (Z2, Fehlerkatalog 24). The deadline that actually
 * decides anything is a goal's `bronzeTick`, which is hashed descriptor state.
 */
export interface ScenarioMeta {
  /** Author's own title, shown in the browser. Untranslated by design. */
  readonly title: string;
  readonly author: string;
  /** The briefing, in both languages. */
  readonly briefing: ScenarioText;
  /** One caption per goal of `state.goals`, in slot order. */
  readonly goals: readonly ScenarioText[];
  /** Rules the start screen must not offer; ascending, no duplicates. */
  readonly lockedRules: readonly ScenarioRule[];
  /** First tick of the span the briefing describes. [ticks] */
  readonly fromTick: number;
  /** Last tick of that span; never before {@link fromTick}. [ticks] */
  readonly toTick: number;
  /**
   * `hashWorld` at the end of a reference playthrough, or the empty string.
   *
   * A CLAIM, never an input: nothing in the simulation reads it, and what it
   * is checked against is the container's own `ReplayClaim` - so a scenario
   * that ships a reference solution can be verified with M16's machinery
   * (`save/scenario.ts`), and one that names a hash it does not ship a
   * recording for is honestly reported as unverifiable rather than trusted.
   */
  readonly referenceFinalHash: string;
}

/** Whether a name is one of the rules a scenario may pin. */
export function isLockableRule(name: string): name is ScenarioRule {
  for (let i = 0; i < SCENARIO_LOCKABLE_RULES.length; i++) {
    if (SCENARIO_LOCKABLE_RULES[i] === name) return true;
  }
  return false;
}

/**
 * Whether the scenario pins `rule`, so the start screen must show it as fixed.
 *
 * The lock is honoured by the screen that OFFERS the choices and nowhere else.
 * It cannot be enforced sim-side without letting unhashed metadata into a
 * simulation decision, which is the thing Fehler 35 forbids - and it does not
 * need to be: the values that apply are the ones in the shipped world state,
 * which are hashed. A player who worked around the lock would not be playing
 * the scenario differently, they would be playing a different world.
 */
export function isRuleLocked(meta: ScenarioMeta, rule: ScenarioRule): boolean {
  const locked = meta.lockedRules;
  for (let i = 0; i < locked.length; i++) {
    if (locked[i] === rule) return true;
  }
  return false;
}

/** True when both halves of a bilingual field are present and within bounds. */
export function isValidScenarioText(text: ScenarioText): boolean {
  return (
    text.de.length > 0 &&
    text.de.length <= SCENARIO_TEXT_MAX_CHARS &&
    text.en.length > 0 &&
    text.en.length <= SCENARIO_TEXT_MAX_CHARS
  );
}
