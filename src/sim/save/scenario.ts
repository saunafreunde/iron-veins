import type { CommandQueue } from '../commands/queue';
import type { World } from '../World';
import type { CheckpointRing } from './checkpoints';
import { SaveFormatError, type ReplayClaim } from './format';
import { verifyReplay, type ReplayVerification } from './replay';
import type { ScenarioMeta } from './scenarioMeta';
import { encodeSave, type LoadedGame } from './serialize';

/**
 * The two doors onto a `.ironscenario` (SPEC2 M17): writing one, and checking
 * the reference solution it may carry.
 *
 * There is no `decodeScenario` here and that is the point - a scenario decodes
 * through `decodeSave` like everything else, and `LoadedGame.scenario` is the
 * block it found. One serializer, one parser, one migration chain: SPEC2's
 * "Szenario-Kompatibilitaet IST Save-Kompatibilitaet" is a statement about the
 * CODE, not about the file layout.
 */

/**
 * Write a scenario: a world, the log that produced it, and the briefing.
 *
 * `encodeSave` is the whole of it. What this door adds is the ONE check that
 * cannot be made later: the captions have to match the goals the world carries,
 * and finding that out when a player opens the file - rather than when the
 * author saves it - would turn an authoring slip into an unloadable scenario in
 * somebody else's hands.
 *
 * A ring and a claim are optional and mean what they mean everywhere else. A
 * plain scenario is a starting world with neither; a scenario that ships a
 * reference solution is the same container carrying the recording of it, which
 * is what makes {@link verifyScenarioReference} possible at all.
 */
export function encodeScenario(
  world: World,
  queue: CommandQueue,
  gameVersion: string,
  meta: ScenarioMeta,
  ring: CheckpointRing | null = null,
  replay: ReplayClaim | null = null,
): Uint8Array {
  if (meta.goals.length !== world.goals.count) {
    throw new SaveFormatError(
      `save.scenario.goals: ${meta.goals.length} captions for ${world.goals.count} goals - a ` +
        'scenario briefs every goal it sets',
      'save.scenario.goals',
    );
  }
  return encodeSave(world, queue, gameVersion, ring, replay, meta);
}

/**
 * What checking a scenario's reference hash found.
 *
 * Four answers rather than a boolean, in the taxonomy D-191 argued for: the
 * three ways there is nothing to check are different findings from a check that
 * came back negative, and reporting "not verified" for all four would be the
 * same confident non-answer the single `firstDivergentTick` was.
 *
 *  - `noReference` - the file names no reference hash. Most scenarios do not:
 *    a starting world has no solution to point at.
 *  - `noRecording` - it names one but ships no recording, so the claim cannot
 *    be judged by anything. Deliberately not an error: the metadata block is
 *    unhashed, and refusing to LOAD a scenario over a field that decides
 *    nothing would let a briefing typo cost the player the file.
 *  - `claimMismatch` - the metadata's hash and the recording's own
 *    `ReplayClaim` name different ends. The two are then talking about
 *    different games, and no re-simulation is run: it could only confirm one of
 *    them, and which one is exactly what is in doubt.
 *  - `checked` - the recording was re-simulated with M16's verifier, and its
 *    verdict is attached whole.
 */
export type ScenarioReferenceVerdict =
  | { readonly kind: 'noReference' }
  | { readonly kind: 'noRecording'; readonly expected: string }
  | { readonly kind: 'claimMismatch'; readonly expected: string; readonly claimed: string }
  | { readonly kind: 'checked'; readonly verification: ReplayVerification };

/** The answer plus the sentence the interface prints for it. */
export interface ScenarioReferenceCheck {
  readonly verdict: ScenarioReferenceVerdict;
  /** True only when a re-simulation ran and reproduced every commitment. */
  readonly ok: boolean;
  /** Translation key of the sentence for this answer. */
  readonly reasonKey: string;
}

/**
 * Check a scenario's reference final hash with M16's replay machinery.
 *
 * The reference hash is UNHASHED metadata, and this is what that costs and what
 * it buys. It costs authority: nothing in the simulation may read it, so it can
 * never decide a medal, a goal or a route. It buys evidence: an author can say
 * "my reference playthrough of this scenario ends at `4dff3f3f216385e6`", ship
 * the recording that gets there, and anybody can re-simulate it and find out.
 *
 * The check is therefore two comparisons and never one. First the metadata's
 * claim against the recording's own `ReplayClaim` - a file whose two halves
 * disagree is answering the question before it is asked. Only then the actual
 * re-simulation, through {@link verifyReplay} unchanged: same version pinning
 * (E-11), same verdict taxonomy, same proofs. A scenario is not a special case
 * of a recording, it is a recording with a briefing.
 */
export function verifyScenarioReference(
  loaded: LoadedGame,
  currentGameVersion: string,
): ScenarioReferenceCheck {
  const meta = loaded.scenario;
  const expected = meta === null ? '' : meta.referenceFinalHash;
  if (expected === '') {
    return {
      verdict: { kind: 'noReference' },
      ok: false,
      reasonKey: 'ui.scenario.reference.none',
    };
  }

  const claim = loaded.replay;
  if (claim === null) {
    return {
      verdict: { kind: 'noRecording', expected },
      ok: false,
      reasonKey: 'ui.scenario.reference.noRecording',
    };
  }
  if (claim.finalHash !== expected) {
    return {
      verdict: { kind: 'claimMismatch', expected, claimed: claim.finalHash },
      ok: false,
      reasonKey: 'ui.scenario.reference.mismatch',
    };
  }

  const verification = verifyReplay(loaded, currentGameVersion);
  return {
    verdict: { kind: 'checked', verification },
    ok: verification.ok,
    reasonKey: verification.reasonKey,
  };
}
