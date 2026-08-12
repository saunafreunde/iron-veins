import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../../src/sim/save/format';

/**
 * The soak fixture's recorded save version, asserted where it CANNOT hide
 * (D-251).
 *
 * `tests/soak/longRun.spec.ts` already refuses a fixture recorded under
 * another `SAVE_VERSION` - and it refuses it in the `soak` job, which is not
 * the job a bundle is signed off with. Two M23 commits shipped with the
 * fixture still saying 33 while `SAVE_VERSION` was 34 (`ac42a57` and
 * `a2436e6`): every gate the bundles ran was green, because the one gate that
 * reads the file is the one that takes two minutes and was not run.
 *
 * So the coupling is asserted HERE, in the default suite, as a file read and a
 * comparison - no simulation, no seconds. It is the same shape as the
 * project's other coupling audits (D-133, D-183): two artefacts that must
 * agree, held together by something that reads both.
 *
 * **It does not replace the soak run and cannot.** A fixture with the right
 * version number and the wrong hashes is exactly as stale, and only replaying
 * the quarter century can say so. What this test buys is that the CHEAP half
 * of "the fixture is current" is checked on every push, so a save bump can no
 * longer ship with a fixture that was never re-recorded.
 */

const PIN_PATH = fileURLToPath(
  new URL('../soak/fixtures/soak-ai-quarter-century.json', import.meta.url),
);

describe('the soak fixture belongs to this save version', () => {
  it('records exactly SAVE_VERSION', () => {
    const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as { saveVersion: number };
    expect(
      pin.saveVersion,
      `the soak fixture was recorded under save version ${pin.saveVersion} and SAVE_VERSION is ` +
        `${SAVE_VERSION}. A save bump re-records the fixture IN THE SAME COMMIT: delete ` +
        `${PIN_PATH}, run npm run test:soak, commit the file it writes.`,
    ).toBe(SAVE_VERSION);
  });

  it('reads a fixture that is still the manifest it is meant to be', () => {
    // The shape, so a truncated or half-written file fails here rather than
    // two minutes into the soak job.
    const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as {
      seed: number;
      mapSize: number;
      years: number;
      aiCompanies: number;
      finalHash: string;
      checkpoints: readonly { tick: number; hash: string }[];
    };
    expect(pin.seed).toBe(4_711);
    expect(pin.mapSize).toBe(256);
    expect(pin.years).toBe(25);
    expect(pin.aiCompanies).toBe(3);
    expect(pin.finalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(pin.checkpoints.length).toBeGreaterThan(0);
    for (const checkpoint of pin.checkpoints) {
      expect(checkpoint.hash, `checkpoint ${checkpoint.tick}`).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});
