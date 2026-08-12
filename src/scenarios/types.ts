import type { NewGameOptions } from '../shared/protocol';
import type { Difficulty, MapClimate, WeatherRule } from '../sim/constants';
import type { GoalSpec } from '../sim/goals/types';
import type { ScenarioMeta, ScenarioRule, ScenarioText } from '../sim/save/scenarioMeta';

/**
 * What a SHIPPED scenario is (SPEC2 M17: "8 mitgelieferte Szenarien als
 * Text-Fixtures (Seed + Regeln + Ziel-JSON)").
 *
 * A shipped scenario is not a file. It is a seed, a set of world rules and a
 * list of goal descriptors - text in the repository, from which the world is
 * GENERATED when the player presses start. That is what keeps E-14's rule
 * ("no binary asset in git") intact for content as well as for art, and it is
 * what makes the same eight entries determinism fixtures: `newGameOptionsOf`
 * plus `worldParamsFor` is the very path the browser starts them through, so a
 * fixture cannot drift from the game.
 *
 * The relationship to the `.ironscenario` FILE of D-194 is one function:
 * {@link scenarioMetaOf} turns a definition into the metadata block, so a
 * shipped scenario can be written out as a file with the one serializer and
 * read back by anybody. The file format is how a scenario TRAVELS; this is how
 * the eight that ship with the game are stated.
 *
 * **The briefing does not go through `t()`, and that is deliberate.** The
 * interface chrome around a scenario - the buttons, the column headings, the
 * word "Gold" - is UI and belongs in `src/i18n`, where a missing key is a
 * missing translation. A briefing is CONTENT: it belongs to the scenario the
 * way a goal threshold does, it is authored with the seed it describes, and it
 * travels in the metadata block of the file (D-194's `ScenarioText`, both
 * languages required). Putting it in the catalogue would mean a scenario
 * somebody else writes could not carry its own text, which is exactly the
 * property the unhashed metadata block exists to give it.
 */

/** One goal: what the simulation decides, and what the briefing calls it. */
export interface ShippedGoal {
  /**
   * The sentence the browser prints for this goal, in both languages.
   *
   * A caption may DESCRIBE a goal and never defines one: the descriptor beside
   * it is what the daily hook measures and what the world hash covers (D-193).
   */
  readonly caption: ScenarioText;
  readonly spec: GoalSpec;
}

/** The world rules a shipped scenario fixes - `NewGameOptions` minus identity. */
export interface ScenarioRules {
  readonly seed: number;
  readonly mapSize: number;
  readonly climate: MapClimate;
  readonly difficulty: Difficulty;
  readonly aiCompanies: number;
  readonly inflation: boolean;
  readonly emissions: boolean;
  readonly occupancyPenalty: boolean;
  readonly signalPenalty: boolean;
  readonly roadCongestion: boolean;
  /**
   * The weather rule of SPEC2 M18 (E-01).
   *
   * Stated by every scenario rather than defaulted, because a rule a shipped
   * scenario does not state is a rule its thresholds were not calibrated
   * against. All eight ship with it OFF: their goal thresholds were measured
   * by a game without weather (D-195), and re-banding them belongs to the
   * bundle that gives weather its economic effects, not to the one that
   * introduces the field (Fehlerkatalog 34).
   */
  readonly weather: WeatherRule;
  /**
   * The council-election rule of SPEC2 M20 (13.3).
   *
   * Stated by every scenario for the reason above it, one milestone on: all
   * eight ship with it OFF, because their goal thresholds were measured by a
   * game whose councils never changed hands, and a population goal is decided
   * by the growth formula the council rating is a factor of.
   */
  readonly elections: boolean;
  /**
   * The century rule of SPEC2 M21 (E-09).
   *
   * Stated by every scenario for the reason above it, one milestone on: all
   * eight ship with it OFF, because their goal thresholds were measured on a
   * flat century, and a tonnage or a cash goal is decided by exactly the
   * tariff, cost and output seams the curve multiplies.
   */
  readonly economy: boolean;
}

export interface ShippedScenario {
  /** Stable key: the browser's list key and the fixtures' name. Never shown. */
  readonly id: string;
  /** The author's own title, shown as it stands - untranslated by design. */
  readonly title: string;
  readonly author: string;
  readonly briefing: ScenarioText;
  readonly goals: readonly ShippedGoal[];
  readonly rules: ScenarioRules;
  /** Rules the start screen must show as fixed; ascending, no duplicates. */
  readonly lockedRules: readonly ScenarioRule[];
  /** The span the briefing describes; descriptive, never a rule (D-194). */
  readonly fromTick: number;
  readonly toTick: number;
}

/**
 * The `.ironscenario` metadata block for a shipped scenario.
 *
 * The captions are split from the descriptors here and only here: the file
 * format carries one caption per goal in slot order and the goals themselves
 * in hashed world state, and this is the seam between the two. Keeping them
 * side by side in the definition is what stops a caption from describing the
 * goal in the next slot.
 */
export function scenarioMetaOf(scenario: ShippedScenario): ScenarioMeta {
  return {
    title: scenario.title,
    author: scenario.author,
    briefing: scenario.briefing,
    goals: scenario.goals.map((goal) => goal.caption),
    lockedRules: scenario.lockedRules,
    fromTick: scenario.fromTick,
    toTick: scenario.toTick,
    referenceFinalHash: '',
  };
}

/**
 * What the browser sends the worker to start this scenario.
 *
 * The company name and colour are the PLAYER's - a scenario states the world,
 * not who is playing it - so they come from the caller. Everything else is the
 * scenario's, and the goals ride along in the same message: that is the whole
 * of "starting a scenario", and it is why the shipped eight need no file on
 * disk to be playable.
 */
export function newGameOptionsOf(
  scenario: ShippedScenario,
  companyName: string,
  companyColorIndex: number,
): NewGameOptions {
  const rules = scenario.rules;
  return {
    seed: rules.seed,
    difficulty: rules.difficulty,
    climate: rules.climate,
    mapSize: rules.mapSize,
    companyName,
    companyColorIndex,
    inflation: rules.inflation,
    emissions: rules.emissions,
    occupancyPenalty: rules.occupancyPenalty,
    signalPenalty: rules.signalPenalty,
    roadCongestion: rules.roadCongestion,
    elections: rules.elections,
    economy: rules.economy,
    weather: rules.weather,
    aiCompanies: rules.aiCompanies,
    goals: scenario.goals.map((goal) => goal.spec),
  };
}
