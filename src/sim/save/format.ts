import { CommandKind, type Command, type CommandEnvelope } from '../commands/types';
import { COMPANY_COLOR_COUNT, Difficulty } from '../constants';
import type { WorldStateData } from '../World';
import type { CompanyState, RngState } from '../types';

/** Four byte marker at the start of every save payload. */
export const SAVE_MAGIC = 'IRVN';

/**
 * Current save format version.
 *
 * Rule (section 19.1, failure #11): every change to the shape of the simulation
 * state bumps this number AND adds a migration under ./migrations. Skipping the
 * migration once makes every older save unloadable forever.
 */
export const SAVE_VERSION = 1;

/** File extension used for manual and automatic saves. */
export const SAVE_EXTENSION = '.ironsave';

/** Decoded, validated save payload. */
export interface SaveFile {
  readonly magic: string;
  readonly saveVersion: number;
  readonly gameVersion: string;
  readonly seed: number;
  readonly tick: number;
  readonly state: WorldStateData;
  /** Full command log since the start of the game; drives replays. */
  readonly commandLog: readonly CommandEnvelope[];
  /** How many entries of the log had already run when the save was taken. */
  readonly commandsExecuted: number;
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

// ---------------------------------------------------------------- primitives

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveFormatError(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new SaveFormatError(`${path}: expected an array`);
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new SaveFormatError(`${path}: expected a string`);
  return value;
}

function asInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SaveFormatError(`${path}: expected an integer`);
  }
  return value;
}

function asUint32(value: unknown, path: string): number {
  const int = asInt(value, path);
  if (int < 0 || int > 0xffffffff) {
    throw new SaveFormatError(`${path}: ${int} is outside the unsigned 32 bit range`);
  }
  return int;
}

// -------------------------------------------------------------- sub-sections

function parseRngState(value: unknown, path: string): RngState {
  const words = asArray(value, path);
  if (words.length !== 4) {
    throw new SaveFormatError(`${path}: expected 4 state words, got ${words.length}`);
  }
  return [
    asUint32(words[0], `${path}[0]`),
    asUint32(words[1], `${path}[1]`),
    asUint32(words[2], `${path}[2]`),
    asUint32(words[3], `${path}[3]`),
  ];
}

function parseCompany(value: unknown, path: string): CompanyState {
  const raw = asRecord(value, path);
  const colorIndex = asInt(raw['colorIndex'], `${path}.colorIndex`);
  if (colorIndex < 0 || colorIndex >= COMPANY_COLOR_COUNT) {
    throw new SaveFormatError(`${path}.colorIndex: ${colorIndex} is not a known company colour`);
  }
  return {
    name: asString(raw['name'], `${path}.name`),
    colorIndex,
    cashCt: asInt(raw['cashCt'], `${path}.cashCt`),
    loanCt: asInt(raw['loanCt'], `${path}.loanCt`),
    profitThisYearCt: asInt(raw['profitThisYearCt'], `${path}.profitThisYearCt`),
    lastYearProfitCt: asInt(raw['lastYearProfitCt'], `${path}.lastYearProfitCt`),
    fixedAssetsCt: asInt(raw['fixedAssetsCt'], `${path}.fixedAssetsCt`),
  };
}

function parseDifficulty(value: unknown, path: string): Difficulty {
  const int = asInt(value, path);
  if (int !== Difficulty.Easy && int !== Difficulty.Normal && int !== Difficulty.Hard) {
    throw new SaveFormatError(`${path}: ${int} is not a known difficulty`);
  }
  return int;
}

function parseCommand(value: unknown, path: string): Command {
  const raw = asRecord(value, path);
  const kind = asInt(raw['kind'], `${path}.kind`);
  switch (kind) {
    case CommandKind.SetCompanyName:
      return { kind: CommandKind.SetCompanyName, name: asString(raw['name'], `${path}.name`) };
    case CommandKind.SetCompanyColor:
      return {
        kind: CommandKind.SetCompanyColor,
        colorIndex: asInt(raw['colorIndex'], `${path}.colorIndex`),
      };
    case CommandKind.TakeLoan:
      return { kind: CommandKind.TakeLoan, amountCt: asInt(raw['amountCt'], `${path}.amountCt`) };
    case CommandKind.RepayLoan:
      return { kind: CommandKind.RepayLoan, amountCt: asInt(raw['amountCt'], `${path}.amountCt`) };
    default:
      throw new SaveFormatError(`${path}.kind: ${kind} is not a known command`);
  }
}

function parseCommandLog(value: unknown, path: string): CommandEnvelope[] {
  const entries = asArray(value, path);
  const log: CommandEnvelope[] = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = asRecord(entries[i], `${path}[${i}]`);
    log.push({
      tick: asInt(raw['tick'], `${path}[${i}].tick`),
      seq: asInt(raw['seq'], `${path}[${i}].seq`),
      command: parseCommand(raw['command'], `${path}[${i}].command`),
    });
  }
  return log;
}

// ------------------------------------------------------------------ top level

/**
 * Read magic and version from an already decoded payload, without validating
 * the rest. Migrations run between this step and {@link parseSaveFile}.
 */
export function readSaveHeader(value: unknown): { magic: string; saveVersion: number } {
  const raw = asRecord(value, 'save');
  const magic = asString(raw['magic'], 'save.magic');
  if (magic !== SAVE_MAGIC) {
    throw new SaveFormatError(`save.magic: expected "${SAVE_MAGIC}", got "${magic}"`);
  }
  return { magic, saveVersion: asInt(raw['saveVersion'], 'save.saveVersion') };
}

/** Strictly validate a payload that has already been migrated to SAVE_VERSION. */
export function parseSaveFile(value: unknown): SaveFile {
  const raw = asRecord(value, 'save');
  const header = readSaveHeader(raw);
  if (header.saveVersion !== SAVE_VERSION) {
    throw new SaveFormatError(
      `save.saveVersion: expected ${SAVE_VERSION} after migration, got ${header.saveVersion}`,
    );
  }

  const stateRaw = asRecord(raw['state'], 'save.state');
  const state: WorldStateData = {
    tick: asInt(stateRaw['tick'], 'save.state.tick'),
    seed: asInt(stateRaw['seed'], 'save.state.seed'),
    difficulty: parseDifficulty(stateRaw['difficulty'], 'save.state.difficulty'),
    rng: parseRngState(stateRaw['rng'], 'save.state.rng'),
    company: parseCompany(stateRaw['company'], 'save.state.company'),
  };

  const tick = asInt(raw['tick'], 'save.tick');
  const seed = asInt(raw['seed'], 'save.seed');
  if (tick !== state.tick) {
    throw new SaveFormatError(`save.tick (${tick}) disagrees with save.state.tick (${state.tick})`);
  }
  if (seed !== state.seed) {
    throw new SaveFormatError(`save.seed (${seed}) disagrees with save.state.seed (${state.seed})`);
  }

  const commandLog = parseCommandLog(raw['commandLog'], 'save.commandLog');
  const commandsExecuted = asInt(raw['commandsExecuted'], 'save.commandsExecuted');
  if (commandsExecuted < 0 || commandsExecuted > commandLog.length) {
    throw new SaveFormatError(
      `save.commandsExecuted: ${commandsExecuted} is outside 0..${commandLog.length}`,
    );
  }

  return {
    magic: header.magic,
    saveVersion: header.saveVersion,
    gameVersion: asString(raw['gameVersion'], 'save.gameVersion'),
    seed,
    tick,
    state,
    commandLog,
    commandsExecuted,
  };
}
