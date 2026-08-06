/**
 * Record a determinism fixture from a played game (SPEC2 M10).
 *
 *   npm run record:fixture -- <save.ironsave> <out.json>
 *
 * Reads an `.ironsave` written by the game (a manual save, an autosave or one
 * produced by a test) and dumps its command log as a JSON fixture for
 * `tests/determinism`. The fixture format is what `parseScenarioFixture`
 * expects: an array of `{ tick, command }`, replayed by the suite against the
 * same seed and verified by cross-run hash equality.
 *
 * Only the PLAYER'S commands (companyId 0) are recorded. AI competitors
 * re-derive their own commands from the seed when the world is re-simulated,
 * so recording theirs would execute every AI command twice on replay. For the
 * same reason a fixture should be recorded from a game started WITHOUT
 * competitors: the determinism scenarios run on an AI-less world, and a player
 * command that only succeeded because of something an AI built would be
 * rejected there.
 *
 * The tool validates nothing beyond the container - the determinism runner
 * parses every command through `parseCommand` from `src/sim/save/format.ts`,
 * and a fixture it cannot parse fails the suite loudly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decode } from '@msgpack/msgpack';
import { unzlibSync } from 'fflate';

const SAVE_MAGIC = 'IRVN';

function fail(message) {
  console.error(`record-fixture: ${message}`);
  process.exit(1);
}

const [savePath, outPath] = process.argv.slice(2);
if (savePath === undefined || outPath === undefined) {
  fail('usage: npm run record:fixture -- <save.ironsave> <out.json>');
}

let payload;
try {
  payload = decode(unzlibSync(readFileSync(savePath)));
} catch (error) {
  fail(`${savePath} could not be decoded: ${error instanceof Error ? error.message : error}`);
}

if (typeof payload !== 'object' || payload === null || payload.magic !== SAVE_MAGIC) {
  fail(`${savePath} is not an .ironsave container`);
}
if (!Array.isArray(payload.commandLog)) {
  fail(`${savePath} carries no command log`);
}

const entries = payload.commandLog
  .filter((envelope) => envelope.companyId === 0)
  .map((envelope) => ({ tick: envelope.tick, command: envelope.command }));

writeFileSync(outPath, `${JSON.stringify(entries, null, 2)}\n`);
console.log(
  `record-fixture: wrote ${entries.length} player commands ` +
    `(of ${payload.commandLog.length} logged) from ${savePath} to ${outPath}`,
);
