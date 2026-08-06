import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../../src/sim/save/format';
import roadFixture from './fixtures/road-line-commands.json';
import { advance, createScenario, parseScenarioFixture } from './runner';

/**
 * Cross-OS determinism (SPEC2 6.3, from M10): the same seed and the same
 * command log must reach the same world hash on every operating system the
 * game ships on.
 *
 * Two machines cannot compare hashes in one process, so the comparison medium
 * is a PINNED hash, committed to the repository: CI runs this file on
 * ubuntu-latest AND windows-latest, and both assert against the same pin. If
 * either OS computes something else, the divergence names itself here - which
 * is the first hard evidence for architecture law #3's claim that the float
 * discipline of law #4 is bit-exact across platforms, not just across runs.
 *
 * D-010 rejected frozen hashes for the determinism suite because every
 * milestone legitimately moves them. That reasoning stands - and this pin is
 * not a golden signal of correctness but a transport medium, maintained under
 * the same protocol as the save corpus manifest (tests/corpus): when the
 * simulation legitimately changes, the failure names this file, and deleting
 * the pin and re-running records the new hash as a conscious act. The pin is
 * self-priming, so CI - where everything is committed - only ever reads.
 *
 * Locally: `npm run test:determinism:cross` runs exactly this comparison.
 */

const PIN_PATH = fileURLToPath(new URL('./fixtures/canonical-hash.json', import.meta.url));

/** The determinism suite's own seed, replaying the recorded road line. */
const CANONICAL_SEED = 424_242;

/**
 * Long enough that the line is built, crewed and earning (the road fixture's
 * own suite proves that by tick 10,000), short enough to stay a cheap job on
 * two CI runners.
 */
const CANONICAL_TICKS = 10_000;

interface CanonicalPin {
  readonly saveVersion: number;
  readonly seed: number;
  readonly ticks: number;
  readonly hash: string;
  /** Provenance only - which box recorded the pin. Never compared. */
  readonly recordedOn: { readonly platform: string; readonly arch: string };
}

const script = parseScenarioFixture(roadFixture);

describe('cross-OS determinism', () => {
  it('reaches the pinned canonical hash for the reference seed', () => {
    const hashes = advance(createScenario(CANONICAL_SEED, script), CANONICAL_TICKS, [
      CANONICAL_TICKS,
    ]);
    const hash = hashes[CANONICAL_TICKS]!;

    if (!existsSync(PIN_PATH)) {
      const pin: CanonicalPin = {
        saveVersion: SAVE_VERSION,
        seed: CANONICAL_SEED,
        ticks: CANONICAL_TICKS,
        hash,
        recordedOn: { platform: process.platform, arch: process.arch },
      };
      writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`);
      console.log(`canonical hash pinned: ${hash} (commit ${PIN_PATH})`);
    }

    const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as CanonicalPin;
    if (pin.seed !== CANONICAL_SEED || pin.ticks !== CANONICAL_TICKS) {
      throw new Error(
        `canonical pin was recorded for seed ${pin.seed} at tick ${pin.ticks}, ` +
          `but this suite runs seed ${CANONICAL_SEED} to tick ${CANONICAL_TICKS} - ` +
          `delete ${PIN_PATH}, re-run, and commit the new pin`,
      );
    }
    if (pin.saveVersion !== SAVE_VERSION) {
      throw new Error(
        `canonical pin was recorded under save version ${pin.saveVersion}, ` +
          `current is ${SAVE_VERSION}. If the simulation legitimately changed, ` +
          `delete ${PIN_PATH}, re-run, and commit the new pin`,
      );
    }
    if (hash !== pin.hash) {
      throw new Error(
        `world hash diverged from the canonical pin.\n` +
          `  pinned:   ${pin.hash} (recorded on ${pin.recordedOn.platform}/${pin.recordedOn.arch})\n` +
          `  computed: ${hash} (this run: ${process.platform}/${process.arch})\n` +
          `If this run is on another OS than the pin, that is a cross-platform ` +
          `determinism break - law #3 - and must be debugged, never re-pinned. ` +
          `If the simulation itself changed, re-record on the reference platform: ` +
          `delete ${PIN_PATH}, run npm run test:determinism:cross, commit the pin.`,
      );
    }
    expect(hash).toBe(pin.hash);
  });
});
