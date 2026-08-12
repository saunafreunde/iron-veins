import { SCENARIO_TEXT_MAX_CHARS } from '../../sim/constants';
import { SCENARIO_EXTENSION } from '../../sim/save/version';
import type { ScenarioMeta } from '../../sim/save/scenarioMeta';

/**
 * The workshop's export half (SPEC2 M22): what an author types, and what the
 * file is called.
 *
 * **Nothing here writes a byte of the container.** The scenario is written by
 * `encodeScenario` in the worker - which is `encodeSave` plus the metadata
 * block - because SPEC2's own sentence for this milestone is that scenario
 * compatibility IS save compatibility. A second writer on this side would be
 * the exact drift D-133 describes, and it would be invisible until somebody
 * else's build refused the file.
 *
 * What DOES live here is the authoring form's shape and its one refusal: a
 * scenario nobody can tell apart from another is not a scenario, so a title is
 * required and a briefing must exist in both catalogue languages. The check is
 * a pure function so the test drives it rather than a form.
 */

/** What the workshop's export form holds. */
export interface ScenarioDraft {
  readonly title: string;
  readonly author: string;
  readonly briefingDe: string;
  readonly briefingEn: string;
}

/** An empty form - what the panel opens with. */
export const EMPTY_SCENARIO_DRAFT: ScenarioDraft = {
  title: '',
  author: '',
  briefingDe: '',
  briefingEn: '',
};

/**
 * Why this draft cannot be exported yet, as a translation key, or null.
 *
 * **Every rule here is the CONTAINER's, read forwards instead of backwards.**
 * `parseSaveFile` refuses an empty title, an empty author, either half of an
 * empty briefing and any of the four over `SCENARIO_TEXT_MAX_CHARS` - and a
 * scenario is a save (D-194), so a file that failed those checks would encode
 * cleanly here and be unloadable in somebody else's hands. That is exactly the
 * failure `encodeScenario`'s own goal-count check exists to prevent, one field
 * class further out: find it while the author is still typing.
 *
 * Both languages are required and that is not pedantry either: the briefing
 * does NOT go through `t()` - it is the scenario's own words, carried in the
 * file so that a scenario somebody else wrote arrives in their language
 * (D-194) - so a missing half is a player reading an empty screen, and no
 * fallback exists to cover it.
 */
export function scenarioDraftRefusal(draft: ScenarioDraft): string | null {
  if (draft.title.trim().length === 0) return 'ui.editor.export.needTitle';
  if (draft.author.trim().length === 0) return 'ui.editor.export.needAuthor';
  if (draft.briefingDe.trim().length === 0 || draft.briefingEn.trim().length === 0) {
    return 'ui.editor.export.needBriefing';
  }
  if (
    draft.title.trim().length > SCENARIO_TEXT_MAX_CHARS ||
    draft.author.trim().length > SCENARIO_TEXT_MAX_CHARS ||
    draft.briefingDe.trim().length > SCENARIO_TEXT_MAX_CHARS ||
    draft.briefingEn.trim().length > SCENARIO_TEXT_MAX_CHARS
  ) {
    return 'ui.editor.export.tooLong';
  }
  return null;
}

/**
 * Turn a valid draft into the metadata block the serializer writes.
 *
 * `goals` is empty and the span is a point at the world's own tick, both for
 * the same reason: the workshop of this bundle shapes a MAP. Goals are hashed
 * descriptor state that a world is created with (D-193), and a caption list
 * has to match `state.goals` exactly or `encodeScenario` refuses the file -
 * so an empty list is the honest description of a world that sets none, not a
 * gap. `lockedRules` is empty for the same kind of reason: locking is an
 * authoring decision this bundle offers no screen for, and inventing a default
 * set would pin rules the author never chose.
 */
export function metaFromDraft(draft: ScenarioDraft, tick: number): ScenarioMeta {
  return {
    title: draft.title.trim(),
    author: draft.author.trim(),
    briefing: { de: draft.briefingDe.trim(), en: draft.briefingEn.trim() },
    goals: [],
    lockedRules: [],
    fromTick: tick,
    toTick: tick,
    referenceFinalHash: '',
  };
}

/**
 * File name for a scenario, from its title.
 *
 * Everything that is not a letter, a digit or a dash becomes a dash, because
 * this string reaches a file dialog on three operating systems and a title is
 * prose. A title that survives to nothing at all falls back to the word the
 * catalogue uses, so the dialog always opens on a usable name.
 */
export function scenarioFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug.length === 0 ? 'scenario' : slug}${SCENARIO_EXTENSION}`;
}
