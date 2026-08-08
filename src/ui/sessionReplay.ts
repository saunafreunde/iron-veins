import { bugReportReplayFileName, type CrashReplayInput } from './crashBundle';

/**
 * The `.ironreplay` a crash bundle carries (SPEC2 M16, on top of M10/D-132).
 *
 * A bug report has always carried a copy of the last save and a rolling tail
 * of the command log. What it lacked was the thing that makes the project's
 * determinism worth anything to a bug report: a RECORDING - a file the game
 * itself can play back and judge. This module builds one out of the very bytes
 * the bundle already copies, so a report is a repro rather than a description
 * of one.
 *
 * **It is built by the MAIN thread, and it has to be** (D-132). When the
 * simulation worker dies it cannot be asked to encode anything; the survivor
 * has the save bytes on disk and the sim's own conversion is a pure function
 * over them, so the conversion happens here and produces exactly the file the
 * shelf's "export replay from save" button produces (`replayFromSaveBytes`,
 * the ONE conversion).
 *
 * **The sim enters the main thread lazily and only for the length of one bug
 * report.** `decodeSave` pulls in the whole simulation, which belongs to the
 * worker; a static import would put a second copy of it in the main bundle for
 * a code path that runs once in the life of a session, if ever. The dynamic
 * import is also the honest failure boundary: if it cannot load, or the save
 * cannot be converted, the bundle records the reason and still carries the
 * save and the log. The recording is the repro ON TOP of the contract, never
 * the contract itself.
 *
 * **The price is about a second of main-thread work, paid once.** Decoding a
 * 1024 world and encoding a replay of it are each a few hundred milliseconds
 * (`tests/perf`), and they are synchronous. Both awaits above happen first, so
 * the crash dialog is already on screen when the blocking part starts - and a
 * player who has just watched the simulation die is about to click "restart"
 * anyway.
 */

export interface SessionReplayResult {
  /** The recording, or null when none could be built. */
  readonly replay: CrashReplayInput | null;
  /** Why there is none, in plain text for the report's reader; null on success. */
  readonly error: string | null;
}

/** Nothing to convert - said once, so both callers say it the same way. */
export const NO_SAVE_YET = 'no save had been written when the report was assembled';

/**
 * Turn the bytes of a save into the session's recording.
 *
 * The three cases are the sim's, not this module's: a file that already is a
 * recording and a save from an older format are handed back unchanged (and are
 * then honestly `verifiable: false`), a save of the current format is
 * converted and carries the claim `{finalTick, finalHash}` the crashing build
 * committed to.
 */
export async function sessionReplayFrom(
  saveBytes: Uint8Array | null,
  writtenAt: string,
  gameVersion: string,
): Promise<SessionReplayResult> {
  if (saveBytes === null) return { replay: null, error: NO_SAVE_YET };
  try {
    const [{ replayFromSaveBytes }, { replayMeta }] = await Promise.all([
      import('../sim/save/replay'),
      import('../sim/save/replaySession'),
    ]);
    const converted = replayFromSaveBytes(saveBytes);
    const meta = replayMeta(converted.loaded, gameVersion);
    return {
      replay: {
        name: bugReportReplayFileName(writtenAt),
        bytes: converted.bytes,
        finalTick: meta.finalTick,
        baseTick: meta.baseTick,
        commandCount: meta.commandCount,
        checkpointTicks: meta.checkpointTicks,
        verifiable: meta.verifiable,
      },
      error: null,
    };
  } catch (error) {
    return { replay: null, error: error instanceof Error ? error.message : String(error) };
  }
}
