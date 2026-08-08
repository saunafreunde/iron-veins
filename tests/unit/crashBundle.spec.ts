import { describe, expect, it } from 'vitest';
import {
  assembleCrashBundle,
  bugReportFileName,
  bugReportReplayFileName,
  bytesToBase64,
  COMMAND_LOG_BYTE_BUDGET,
  CommandLogTail,
  CRASH_BUNDLE_SCHEMA_VERSION,
  MAX_STORED_CRASH_BUNDLES,
  planCrashBundleScan,
  summariseCrashBundle,
  type CrashBundleInput,
} from '../../src/ui/crashBundle';

/**
 * The pure half of crash safety (SPEC2 M10, D-132): the rolling command-log
 * tail and the bundle assembly. Everything here is main-thread data with no
 * worker, no DOM and no disk, which is exactly why it can be pinned by a unit
 * test - the platform write behind it goes through src/platform/Storage and
 * is a different test's problem.
 */

describe('CommandLogTail', () => {
  it('keeps everything while under budget, in order', () => {
    const tail = new CommandLogTail(1000);
    tail.push('one');
    tail.push('two');
    tail.push('three');

    expect(tail.lines()).toEqual(['one', 'two', 'three']);
    expect(tail.byteSize).toBe('onetwothree'.length);
  });

  it('evicts oldest-first when the budget is exceeded', () => {
    // Budget for two 10-byte lines plus a little, never three.
    const tail = new CommandLogTail(25);
    tail.push('aaaaaaaaaa');
    tail.push('bbbbbbbbbb');
    tail.push('cccccccccc');

    expect(tail.lines()).toEqual(['bbbbbbbbbb', 'cccccccccc']);
    expect(tail.byteSize).toBe(20);
  });

  it('always keeps the newest line, truncated if it alone exceeds the budget', () => {
    const tail = new CommandLogTail(8);
    tail.push('short');
    tail.push('0123456789abcdef');

    const lines = tail.lines();
    expect(lines).toEqual(['01234567']);
    expect(tail.byteSize).toBe(8);
  });

  it('counts UTF-8 bytes, not UTF-16 units', () => {
    // Each 'ä' is one UTF-16 unit but two UTF-8 bytes, so ten of them must
    // burst a 16-byte budget even though .length says 10.
    const umlauts = 'ä'.repeat(10);
    const tail = new CommandLogTail(16);
    tail.push(umlauts);

    expect(tail.byteSize).toBeLessThanOrEqual(16);
    expect(tail.lines()[0]).toBe('ä'.repeat(8));
  });

  it('never splits an astral code point when truncating', () => {
    // Each '𝄞' is four UTF-8 bytes; a 10-byte budget fits two of them and
    // must not keep half of the third as a lone surrogate.
    const clefs = '𝄞𝄞𝄞';
    const tail = new CommandLogTail(10);
    tail.push(clefs);

    expect(tail.lines()[0]).toBe('𝄞𝄞');
    expect(tail.byteSize).toBe(8);
  });

  it('survives sustained pushing far beyond the budget without growing', () => {
    const tail = new CommandLogTail(1024);
    for (let index = 0; index < 5000; index++) {
      tail.push(`{"atTick":${index},"command":{"kind":3,"amountCt":100000}}`);
    }

    expect(tail.byteSize).toBeLessThanOrEqual(1024);
    const lines = tail.lines();
    // The newest line is always the last push, the window is contiguous.
    expect(lines[lines.length - 1]).toContain('"atTick":4999');
    expect(lines.length).toBeGreaterThan(10);
  });

  it('clears to empty', () => {
    const tail = new CommandLogTail(100);
    tail.push('line');
    tail.clear();

    expect(tail.lines()).toEqual([]);
    expect(tail.byteSize).toBe(0);
  });

  it('has the ~1 MB budget SPEC2 M10 names', () => {
    expect(COMMAND_LOG_BYTE_BUDGET).toBe(1_048_576);
  });
});

describe('bytesToBase64', () => {
  it('matches the reference encoder for every padding case', () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255, 254]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array(Array.from({ length: 256 }, (_, index) => index)),
    ];
    for (const bytes of cases) {
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

function inputWith(overrides: Partial<CrashBundleInput>): CrashBundleInput {
  return {
    appVersion: '0.1.0',
    saveVersion: 23,
    writtenAt: '2026-08-06T12:00:00.000Z',
    error: { message: 'boom', stack: 'Error: boom\n    at tick', tick: 4321 },
    context: {
      seed: 7,
      mapSize: 256,
      tick: 4300,
      stateHash: 'deadbeefdeadbeef',
      isDesktop: true,
    },
    commandLog: ['{"atTick":1}', '{"atTick":2}'],
    autosave: { name: 'autosave-1.ironsave', bytes: new Uint8Array([73, 82, 86, 78, 0, 255]) },
    replay: {
      name: 'bug-report-2026-08-06T12-00-00-000Z.ironreplay',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      finalTick: 4000,
      baseTick: 0,
      commandCount: 12,
      checkpointTicks: [0, 72_000],
      verifiable: true,
    },
    replayError: null,
    ...overrides,
  };
}

interface DecodedBundle {
  kind: string;
  schemaVersion: number;
  appVersion: string;
  saveVersion: number;
  writtenAt: string;
  error: { message: string; stack: string; tick: number } | null;
  context: { seed: number; mapSize: number; tick: number; stateHash: string; isDesktop: boolean };
  commandLog: string[];
  autosave: { name: string; base64: string } | null;
  replay: {
    name: string;
    base64: string;
    finalTick: number;
    baseTick: number;
    commandCount: number;
    checkpointTicks: number[];
    verifiable: boolean;
  } | null;
  replayError: string | null;
}

function decode(bytes: Uint8Array): DecodedBundle {
  return JSON.parse(new TextDecoder().decode(bytes)) as DecodedBundle;
}

describe('assembleCrashBundle', () => {
  it('carries the version triple: app, save format, bundle schema', () => {
    const bundle = decode(assembleCrashBundle(inputWith({})));

    expect(bundle.kind).toBe('iron-veins-bug-report');
    expect(bundle.appVersion).toBe('0.1.0');
    expect(bundle.saveVersion).toBe(23);
    expect(bundle.schemaVersion).toBe(CRASH_BUNDLE_SCHEMA_VERSION);
  });

  it('round-trips the autosave bytes through base64', () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, index) => (index * 7) % 256));
    const bundle = decode(
      assembleCrashBundle(inputWith({ autosave: { name: 'quicksave.ironsave', bytes } })),
    );

    expect(bundle.autosave?.name).toBe('quicksave.ironsave');
    expect(new Uint8Array(Buffer.from(bundle.autosave?.base64 ?? '', 'base64'))).toEqual(bytes);
  });

  it('is honest about a missing autosave instead of inventing one', () => {
    const bundle = decode(assembleCrashBundle(inputWith({ autosave: null })));
    expect(bundle.autosave).toBeNull();
  });

  it('keeps the command log verbatim and in order', () => {
    const log = ['{"marker":"newGame"}', '{"atTick":5}', '{"atTick":9}'];
    const bundle = decode(assembleCrashBundle(inputWith({ commandLog: log })));
    expect(bundle.commandLog).toEqual(log);
  });

  it('carries error null for a report exported from a healthy game', () => {
    const bundle = decode(assembleCrashBundle(inputWith({ error: null })));
    expect(bundle.error).toBeNull();
  });

  it('carries the session recording, bytes and claim alike', () => {
    // SPEC2 M16: a bug report is a repro. The recording travels whole, and
    // with the facts that let a reader see WHERE it ends before decoding it.
    const bytes = new Uint8Array(Array.from({ length: 200 }, (_, index) => (index * 3) % 256));
    const bundle = decode(
      assembleCrashBundle(
        inputWith({
          replay: {
            name: 'bug-report-x.ironreplay',
            bytes,
            finalTick: 144_000,
            baseTick: 72_000,
            commandCount: 31,
            checkpointTicks: [72_000, 144_000],
            verifiable: true,
          },
        }),
      ),
    );

    expect(bundle.replay?.name).toBe('bug-report-x.ironreplay');
    expect(new Uint8Array(Buffer.from(bundle.replay?.base64 ?? '', 'base64'))).toEqual(bytes);
    expect(bundle.replay?.finalTick).toBe(144_000);
    expect(bundle.replay?.baseTick).toBe(72_000);
    expect(bundle.replay?.commandCount).toBe(31);
    expect(bundle.replay?.checkpointTicks).toEqual([72_000, 144_000]);
    expect(bundle.replay?.verifiable).toBe(true);
    expect(bundle.replayError).toBeNull();
  });

  it('says WHY there is no recording instead of being silently short of one', () => {
    const bundle = decode(
      assembleCrashBundle(inputWith({ replay: null, replayError: 'no save had been written' })),
    );

    expect(bundle.replay).toBeNull();
    expect(bundle.replayError).toBe('no save had been written');
  });

  it('names the schema version the recording arrived with', () => {
    // Bumped from 1 to 2 by the recording; tooling that reads bundles has to
    // be able to tell the shapes apart (D-132).
    expect(CRASH_BUNDLE_SCHEMA_VERSION).toBe(2);
  });

  it('carries the error text and tick when there was a crash', () => {
    const bundle = decode(assembleCrashBundle(inputWith({})));
    expect(bundle.error).toEqual({ message: 'boom', stack: 'Error: boom\n    at tick', tick: 4321 });
    expect(bundle.context.stateHash).toBe('deadbeefdeadbeef');
  });
});

describe('bugReportFileName', () => {
  it('derives a Windows-safe name from the ISO stamp', () => {
    const name = bugReportFileName('2026-08-06T12:34:56.789Z');
    expect(name).toBe('bug-report-2026-08-06T12-34-56-789Z.json');
  });

  it('contains no characters a filesystem refuses', () => {
    const name = bugReportFileName(new Date(0).toISOString());
    expect(/[:<>"/\\|?*]/.test(name)).toBe(false);
  });

  it('names the recording inside a bundle after the same stamp', () => {
    // Same moment, same stamp, different extension: a reader taking the report
    // apart gets two files that obviously belong together. It is a LABEL - no
    // file of this name is ever written, so the crash-directory scan of D-139
    // keeps seeing exactly the bundles it knows.
    const stamp = '2026-08-06T12:34:56.789Z';
    expect(bugReportReplayFileName(stamp)).toBe('bug-report-2026-08-06T12-34-56-789Z.ironreplay');
    expect(bugReportFileName(stamp)).toBe('bug-report-2026-08-06T12-34-56-789Z.json');
  });
});

/** A bundle name whose stamp puts it on the given day of August 2026. */
function bundleOfDay(day: number): string {
  return bugReportFileName(`2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`);
}

describe('planCrashBundleScan', () => {
  it('plans nothing over an empty directory', () => {
    expect(planCrashBundleScan([])).toEqual({ keep: [], prune: [] });
  });

  it('puts the newest bundle at the head, whatever order the directory listed', () => {
    const names = [bundleOfDay(2), bundleOfDay(5), bundleOfDay(1), bundleOfDay(4)];
    const plan = planCrashBundleScan(names);

    expect(plan.keep[0]).toBe(bundleOfDay(5));
    expect(plan.keep).toEqual([bundleOfDay(5), bundleOfDay(4), bundleOfDay(2), bundleOfDay(1)]);
    expect(plan.prune).toEqual([]);
  });

  it('keeps at most five bundles and prunes exactly the oldest beyond them', () => {
    const names = Array.from({ length: 8 }, (_, index) => bundleOfDay(index + 1));
    const plan = planCrashBundleScan(names);

    expect(plan.keep).toHaveLength(MAX_STORED_CRASH_BUNDLES);
    expect(plan.keep[0]).toBe(bundleOfDay(8));
    expect(plan.prune).toEqual([bundleOfDay(3), bundleOfDay(2), bundleOfDay(1)]);
  });

  it('neither keeps nor prunes files that are not crash bundles', () => {
    const plan = planCrashBundleScan(['notes.txt', bundleOfDay(3), 'bug-report-.json', '.DS_Store']);

    // Foreign files are not ours to delete; a name with an empty stamp is not
    // one of ours either.
    expect(plan.keep).toEqual([bundleOfDay(3)]);
    expect(plan.prune).toEqual([]);
  });

  it('has the cap of five the pruning promise names', () => {
    expect(MAX_STORED_CRASH_BUNDLES).toBe(5);
  });

  it('never offers a dismissed bundle again, because dismissal deletes the file', () => {
    // Dismiss semantics (D-139): the offer is always the head of the plan,
    // and dismissing deletes that file - so a rescan of what remains offers
    // the NEXT crash, and the dismissed one is structurally unrepeatable.
    const names = [bundleOfDay(1), bundleOfDay(2), bundleOfDay(3)];
    const offered = planCrashBundleScan(names).keep[0];
    expect(offered).toBe(bundleOfDay(3));

    const afterDismiss = planCrashBundleScan(names.filter((name) => name !== offered));
    expect(afterDismiss.keep).not.toContain(offered);
    expect(afterDismiss.keep[0]).toBe(bundleOfDay(2));
  });
});

describe('summariseCrashBundle', () => {
  it('reads the date and the version triple out of a real bundle', () => {
    const summary = summariseCrashBundle(assembleCrashBundle(inputWith({})));

    expect(summary).toEqual({
      writtenAt: '2026-08-06T12:00:00.000Z',
      appVersion: '0.1.0',
      saveVersion: 23,
      schemaVersion: CRASH_BUNDLE_SCHEMA_VERSION,
    });
  });

  it('returns null for bytes that are not JSON at all', () => {
    expect(summariseCrashBundle(new Uint8Array([0, 1, 2, 255]))).toBeNull();
  });

  it('returns null for JSON that is not a bundle', () => {
    const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

    expect(summariseCrashBundle(encode({ kind: 'something-else' }))).toBeNull();
    expect(summariseCrashBundle(encode(['not', 'an', 'object']))).toBeNull();
    // The right kind but a missing or mistyped header field is not loadable.
    expect(
      summariseCrashBundle(encode({ kind: 'iron-veins-bug-report', appVersion: '0.1.0' })),
    ).toBeNull();
    expect(
      summariseCrashBundle(
        encode({
          kind: 'iron-veins-bug-report',
          writtenAt: '2026-08-06T12:00:00.000Z',
          appVersion: '0.1.0',
          saveVersion: '23',
          schemaVersion: 1,
        }),
      ),
    ).toBeNull();
  });
});
