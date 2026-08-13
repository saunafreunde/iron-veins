import type { AiProject, AiState } from '../ai/types';
import type { Contract } from '../economy/contracts';
import type { SupplyContract } from '../economy/supply';
import type { Subsidy } from '../economy/subsidies';
import { CommandKind, type Command, type CommandEnvelope } from '../commands/types';
import type { CargoLinkSave } from '../cargo/linkGraph';
import { CARGO_COUNT } from '../cargo/types';
import { ACCOUNT_COUNT } from '../economy/ledger';
import { NEWS_CATEGORY_COUNT, type NewsEntry } from '../news/log';
import {
  CHECKPOINT_INTERVAL_TICKS,
  COMPANY_COLOR_COUNT,
  EARLIEST_START_YEAR,
  ECONOMY_CURVE_LENGTH,
  ECONOMY_FACTOR_MAX_PERMILLE,
  ECONOMY_FACTOR_MIN_PERMILLE,
  MAX_COMPANIES,
  Difficulty,
  LEDGER_HISTORY_MONTHS,
  LINK_SAMPLE_COUNT,
  MAP_PRESET_COUNT,
  MAPGEN_KNOB_STEPS,
  MapClimate,
  SCENARIO_TEXT_MAX_CHARS,
  START_YEAR,
  WEATHER_CELL_COUNT,
  WEATHER_REGION_COUNT,
  WEATHER_RULE_COUNT,
  type MapGenKnobs,
  type MapPreset,
  type WeatherRule,
} from '../constants';
import { INDUSTRY_EVENT_KIND_COUNT, type IndustryEvent } from '../industry/events';
import { INDUSTRY_TYPE_COUNT, type Industry } from '../industry/types';
import { isLegalMapSize, mapSizeRefusal } from '../map/size';
import { TownSize, type Town } from '../town/types';
import type { TileMapData, WorldStateData } from '../World';
import { decodeGoals, decodeLines, decodeStations, decodeVehicles } from './entities';
import {
  isLockableRule,
  type ScenarioMeta,
  type ScenarioRule,
  type ScenarioText,
} from './scenarioMeta';
import { REPLAY_EXTENSION, SAVE_EXTENSION, SAVE_VERSION, SCENARIO_EXTENSION } from './version';
import type { CompanyState, RngState } from '../types';

/** Four byte marker at the start of every save payload. */
export const SAVE_MAGIC = 'IRVN';

/**
 * The container's identity - version number and the two file extensions.
 *
 * Re-exported rather than declared here so that a caller which only NAMES a
 * file (a dialog, the crash report's metadata, the replay browser's version
 * hint) can import the three values without dragging the parser and the entity
 * codecs behind them into the main bundle. See `./version.ts` for the
 * measurement that made the split.
 */
export { SAVE_VERSION, SAVE_EXTENSION, REPLAY_EXTENSION, SCENARIO_EXTENSION };

/**
 * One entry of the checkpoint ring: the whole world at a year boundary.
 *
 * The payload is the same codec the save itself uses - zlib over MessagePack
 * of `World.toData()` - because a checkpoint IS a world state and a second
 * encoding of the same thing is a second thing to keep in step. It is kept
 * compressed rather than live: sixteen live states of a 1024 map are hundreds
 * of megabytes, sixteen compressed ones are single-digit megabytes.
 *
 * `worldDigest` is `hashWorld` of that state, and it is checked when the
 * checkpoint is RESTORED, not when the file is opened - decompressing the
 * whole history to load one save would make every open pay for a jump nobody
 * asked for.
 */
export interface Checkpoint {
  /** A multiple of `CHECKPOINT_INTERVAL_TICKS`; the state BEFORE this tick ran. */
  readonly tick: number;
  /** `hashWorld` of the encoded state. */
  readonly worldDigest: string;
  /** zlib(MessagePack(WorldStateData)). */
  readonly payload: Uint8Array;
  /**
   * Digest of the SCHEDULE - the `(tick, seq)` pairs - of the commands in the
   * year that ends here (`save/schedule.ts`, D-191).
   *
   * `worldDigest` says what the commands did; this says when they ran, which
   * is the assumption every attempt to name a divergent TICK makes and which
   * nothing checked before. Empty means "committed to nothing": a recording
   * written before this commitment existed, or a segment the retained log no
   * longer holds. An empty digest costs exactly the exactness claim.
   */
  readonly scheduleDigest: string;
}

/**
 * What a recording claims about its own end (SPEC2 M16).
 *
 * A save is at its final tick and can be asked; a replay holds the world at
 * its BASE tick, so where it ends and what it hashes to there is a statement
 * the file has to carry. Verification is exactly the comparison of this claim
 * against a re-simulation - and a claim that disagrees is what a divergence
 * report is made of.
 */
export interface ReplayClaim {
  readonly finalTick: number;
  readonly finalHash: string;
  /**
   * Schedule digest of the part-year tail between the last year boundary and
   * {@link finalTick} - the segment no checkpoint covers (D-191).
   *
   * Without it the tail would be the one bracket in every recording where a
   * command could be moved unseen, and the tail is where a tamper lands most
   * often: it is the part of the game that was played last.
   */
  readonly scheduleDigest: string;
}

/** Decoded, validated save payload. */
export interface SaveFile {
  readonly magic: string;
  readonly saveVersion: number;
  readonly gameVersion: string;
  readonly seed: number;
  readonly tick: number;
  /**
   * `hashWorld` of the state, taken at encode time and verified at decode
   * time. Lives in the CONTAINER, never in the hashed state itself - a digest
   * that contributed to the digest could not exist. The empty string means
   * "written before version 23"; the migration cannot invent a digest, so it
   * does not pretend to.
   */
  readonly worldDigest: string;
  readonly state: WorldStateData;
  /** Command log, complete from {@link logBaseTick} on; drives replays. */
  readonly commandLog: readonly CommandEnvelope[];
  /** How many entries of the log had already run when the save was taken. */
  readonly commandsExecuted: number;
  /**
   * The tick the retained log starts from. Zero - every log that was never
   * compacted - means "since the start of the game". Anything else is a log
   * trimmed at a checkpoint (SPEC2 M16), and the ring then has to carry that
   * checkpoint, or the recording would begin at a world nobody holds.
   */
  readonly logBaseTick: number;
  /** The checkpoint ring, oldest first. Empty in every pre-M16 recording. */
  readonly checkpoints: readonly Checkpoint[];
  /** Where the recording ends, for a `.ironreplay`; null for a plain save. */
  readonly replay: ReplayClaim | null;
  /**
   * The metadata block of a `.ironscenario`; null for a plain save (SPEC2 M17).
   *
   * The one section of this file that is deliberately NOT covered by the world
   * digest (Fehlerkatalog 35) - see `save/scenarioMeta.ts` for why, and
   * `tests/unit/scenarioCoupling.spec.ts` for the audit that keeps it that way.
   * It is validated here like every other section: unhashed is not unchecked.
   */
  readonly scenario: ScenarioMeta | null;
}

/**
 * A save that cannot be loaded, with the failing field spelled out.
 *
 * `path` is the machine-readable half of the message: `save.state.rng` rather
 * than a sentence, so the interface can say which SECTION died instead of
 * refusing the whole file with a shrug. Empty when the failure happened before
 * any field existed (undecodable bytes).
 */
export class SaveFormatError extends Error {
  readonly path: string;

  constructor(message: string, path = '') {
    super(message);
    this.name = 'SaveFormatError';
    this.path = path;
  }
}

/**
 * The bytes are not the bytes that were written: the container does not
 * decode, or the embedded world digest disagrees with the state. This is the
 * error that makes the loader offer the `.bak`, because a corrupt file has a
 * healthy predecessor and a merely-invalid one usually does not.
 */
export class SaveCorruptionError extends SaveFormatError {
  constructor(message: string, path = '') {
    super(message, path);
    this.name = 'SaveCorruptionError';
  }
}

// ---------------------------------------------------------------- primitives

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveFormatError(`${path}: expected an object`, path);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new SaveFormatError(`${path}: expected an array`, path);
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new SaveFormatError(`${path}: expected a string`, path);
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new SaveFormatError(`${path}: expected a boolean`, path);
  return value;
}

/**
 * A finite number, integral or not.
 *
 * Cargo amounts are fractional - a town of 1,200 makes 14.0 passengers a day -
 * so every counter fed by them has to be validated with this rather than with
 * `asInt`, or the first save taken after any of it moves refuses to load.
 */
function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaveFormatError(`${path}: expected a finite number`, path);
  }
  return value;
}

function asInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SaveFormatError(`${path}: expected an integer`, path);
  }
  return value;
}

/** An array of integers, each validated and each naming its own position. */
function asIntArray(value: unknown, path: string): number[] {
  return asArray(value, path).map((entry, i) => asInt(entry, `${path}[${i}]`));
}

function asUint32(value: unknown, path: string): number {
  const int = asInt(value, path);
  if (int < 0 || int > 0xffffffff) {
    throw new SaveFormatError(`${path}: ${int} is outside the unsigned 32 bit range`, path);
  }
  return int;
}

/**
 * A 64 bit world digest as `Fnv1a64.digest` prints it, or the empty string.
 *
 * Empty is legitimate: a save written before version 23 carried no digest, and
 * the migration cannot compute one from a raw payload - so the empty string is
 * the recorded fact "nothing to verify", never a validation failure.
 */
function asDigest(value: unknown, path: string): string {
  const text = asString(value, path);
  if (text !== '' && !/^[0-9a-f]{16}$/.test(text)) {
    throw new SaveFormatError(`${path}: "${text}" is not a 64 bit hex digest`, path);
  }
  return text;
}

/**
 * A digest a file may legitimately not carry at all.
 *
 * Exactly one kind of field uses this: the schedule commitments D-191 added to
 * the checkpoint ring and the replay claim, INSIDE version 27 rather than as a
 * version of their own (Z5 - v27 is M16's one bump and this is M16's own
 * correction). A recording written by an earlier build of this version has
 * none, and the honest reading of that is the one the empty string already
 * carries everywhere else in this file: nothing was committed, so nothing can
 * be checked - and verification withdraws the exactness claim rather than
 * inventing one (`save/replay.ts`).
 */
function asOptionalDigest(value: unknown, path: string): string {
  if (value === undefined || value === null) return '';
  return asDigest(value, path);
}

// -------------------------------------------------------------- sub-sections

function parseRngState(value: unknown, path: string): RngState {
  const words = asArray(value, path);
  if (words.length !== 4) {
    throw new SaveFormatError(`${path}: expected 4 state words, got ${words.length}`, path);
  }
  return [
    asUint32(words[0], `${path}[0]`),
    asUint32(words[1], `${path}[1]`),
    asUint32(words[2], `${path}[2]`),
    asUint32(words[3], `${path}[3]`),
  ];
}

/** The AI competitors of section 15 and what each remembers (E-06). */
function parseAi(value: unknown, path: string): AiState[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    const project = raw['project'];

    return {
      companyId: asInt(raw['companyId'], `${path}[${i}].companyId`),
      personality: asInt(raw['personality'], `${path}[${i}].personality`),
      nextDecisionTick: asInt(raw['nextDecisionTick'], `${path}[${i}].nextDecisionTick`),
      lastBuildTick: asInt(raw['lastBuildTick'], `${path}[${i}].lastBuildTick`),
      // The lines themselves are world entities in `state.lines` since M11;
      // what a competitor keeps is its review baseline per line (Z4).
      reviews: asArray(raw['reviews'], `${path}[${i}].reviews`).map((review, j) => {
        const row = asRecord(review, `${path}[${i}].reviews[${j}]`);
        return {
          lineId: asInt(row['lineId'], `${path}[${i}].reviews[${j}].lineId`),
          reviewTick: asInt(row['reviewTick'], `${path}[${i}].reviews[${j}].reviewTick`),
          earnedAtReviewCt: asInt(
            row['earnedAtReviewCt'],
            `${path}[${i}].reviews[${j}].earnedAtReviewCt`,
          ),
        };
      }),
      project:
        project === null || project === undefined
          ? null
          : parseAiProject(project, `${path}[${i}].project`),
    };
  });
}

function parseAiProject(value: unknown, path: string): AiProject {
  const raw = asRecord(value, path);
  return {
    stage: asInt(raw['stage'], `${path}.stage`),
    fromX: asInt(raw['fromX'], `${path}.fromX`),
    fromY: asInt(raw['fromY'], `${path}.fromY`),
    toX: asInt(raw['toX'], `${path}.toX`),
    toY: asInt(raw['toY'], `${path}.toY`),
    depotX: asInt(raw['depotX'], `${path}.depotX`),
    depotY: asInt(raw['depotY'], `${path}.depotY`),
    rail: asBoolean(raw['rail'], `${path}.rail`),
    cargo: asInt(raw['cargo'], `${path}.cargo`),
    specIds: parseNumbers(raw['specIds'], `${path}.specIds`),
    startedTick: asInt(raw['startedTick'], `${path}.startedTick`),
    // Absent in every save written before M11 stage C2, when the AI could
    // only lay single track - which is exactly what a default of ONE says
    // (the D-146 pattern: the old wire format keeps parsing).
    railTrains:
      raw['railTrains'] === undefined ? 1 : asInt(raw['railTrains'], `${path}.railTrains`),
    lineId: asInt(raw['lineId'], `${path}.lineId`),
  };
}

/** The tenders of section 14.4. */
function parseContracts(value: unknown, path: string): Contract[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    return {
      id: asInt(raw['id'], `${path}[${i}].id`),
      cargo: asInt(raw['cargo'], `${path}[${i}].cargo`),
      townId: asInt(raw['townId'], `${path}[${i}].townId`),
      amountUnits: asFinite(raw['amountUnits'], `${path}[${i}].amountUnits`),
      offeredTick: asInt(raw['offeredTick'], `${path}[${i}].offeredTick`),
      deadlineTick: asInt(raw['deadlineTick'], `${path}[${i}].deadlineTick`),
      bonusCt: asInt(raw['bonusCt'], `${path}[${i}].bonusCt`),
      acceptedBy: parseNumbers(raw['acceptedBy'], `${path}[${i}].acceptedBy`),
      progress: parseNumbers(raw['progress'], `${path}[${i}].progress`),
      completedBy: asInt(raw['completedBy'], `${path}[${i}].completedBy`),
    };
  });
}

/**
 * The standing supply orders of SPEC2 M21.
 *
 * Every field is required, exactly as the tender board's are: an order the
 * parser would silently default is an order two builds can disagree about, and
 * both the quota and the month counters decide money next month.
 */
function parseSupplyContracts(value: unknown, path: string): SupplyContract[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    return {
      id: asInt(raw['id'], `${path}[${i}].id`),
      industryId: asInt(raw['industryId'], `${path}[${i}].industryId`),
      cargo: asInt(raw['cargo'], `${path}[${i}].cargo`),
      quotaUnits: asFinite(raw['quotaUnits'], `${path}[${i}].quotaUnits`),
      offeredTick: asInt(raw['offeredTick'], `${path}[${i}].offeredTick`),
      endTick: asInt(raw['endTick'], `${path}[${i}].endTick`),
      bonusCt: asInt(raw['bonusCt'], `${path}[${i}].bonusCt`),
      acceptedBy: parseNumbers(raw['acceptedBy'], `${path}[${i}].acceptedBy`),
      deliveredThisMonth: parseNumbers(
        raw['deliveredThisMonth'],
        `${path}[${i}].deliveredThisMonth`,
      ),
      monthsMissed: asInt(raw['monthsMissed'], `${path}[${i}].monthsMissed`),
      monthsMet: asInt(raw['monthsMet'], `${path}[${i}].monthsMet`),
    };
  });
}

/** The subsidised relations of SPEC2 M21, on the same terms. */
function parseSubsidies(value: unknown, path: string): Subsidy[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    return {
      id: asInt(raw['id'], `${path}[${i}].id`),
      cargo: asInt(raw['cargo'], `${path}[${i}].cargo`),
      fromX: asInt(raw['fromX'], `${path}[${i}].fromX`),
      fromY: asInt(raw['fromY'], `${path}[${i}].fromY`),
      toX: asInt(raw['toX'], `${path}[${i}].toX`),
      toY: asInt(raw['toY'], `${path}[${i}].toY`),
      rateFactor: asFinite(raw['rateFactor'], `${path}[${i}].rateFactor`),
      offeredTick: asInt(raw['offeredTick'], `${path}[${i}].offeredTick`),
      expiresTick: asInt(raw['expiresTick'], `${path}[${i}].expiresTick`),
      claimedBy: asInt(raw['claimedBy'], `${path}[${i}].claimedBy`),
      deliveredUnits: asFinite(raw['deliveredUnits'], `${path}[${i}].deliveredUnits`),
    };
  });
}

/**
 * The industry events of SPEC2 M21 - and the kind is CHECKED, exactly as an
 * industry's type is a few functions down: a kind the simulation has never
 * heard of would read as neither a harvest nor a strike and would sit in the
 * world for ever, doing nothing and hashing.
 */
function parseIndustryEvents(value: unknown, path: string): IndustryEvent[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    const kind = asInt(raw['kind'], `${path}[${i}].kind`);
    if (kind < 0 || kind >= INDUSTRY_EVENT_KIND_COUNT) {
      throw new SaveFormatError(
        `${path}[${i}].kind: ${kind} is not a known industry event`,
        `${path}[${i}].kind`,
      );
    }
    return {
      industryId: asInt(raw['industryId'], `${path}[${i}].industryId`),
      kind,
      startTick: asInt(raw['startTick'], `${path}[${i}].startTick`),
      endTick: asInt(raw['endTick'], `${path}[${i}].endTick`),
    };
  });
}

/** A list of finite numbers of any length - the per-company council rows. */
function parseNumbers(value: unknown, path: string): number[] {
  return asArray(value, path).map((entry, i) => asFinite(entry, `${path}[${i}]`));
}

/** A row of accounts of exactly the expected length, all whole cents. */
function parseAccounts(value: unknown, path: string, length: number): number[] {
  const entries = asArray(value, path);
  if (entries.length !== length) {
    throw new SaveFormatError(`${path}: expected ${length} entries, got ${entries.length}`, path);
  }
  return entries.map((entry, i) => asInt(entry, `${path}[${i}]`));
}

/**
 * The companies of a save, player first.
 *
 * The ids are checked against the positions rather than trusted: everything
 * that owns anything - a vehicle, a station, a tile - refers to a company by
 * index, and a file whose third company calls itself number five would hand
 * those assets to the wrong books without any of it looking wrong.
 */
function parseCompanies(value: unknown, path: string): CompanyState[] {
  const entries = asArray(value, path);
  if (entries.length < 1 || entries.length > MAX_COMPANIES) {
    throw new SaveFormatError(`${path}: expected 1 to ${MAX_COMPANIES} companies`, path);
  }
  return entries.map((entry, index) => {
    const company = parseCompany(entry, `${path}[${index}]`);
    if (company.id !== index) {
      throw new SaveFormatError(
        `${path}[${index}].id: expected ${index}, got ${company.id}`,
        `${path}[${index}].id`,
      );
    }
    return company;
  });
}

function parseCompany(value: unknown, path: string): CompanyState {
  const raw = asRecord(value, path);
  const colorIndex = asInt(raw['colorIndex'], `${path}.colorIndex`);
  if (colorIndex < 0 || colorIndex >= COMPANY_COLOR_COUNT) {
    throw new SaveFormatError(
      `${path}.colorIndex: ${colorIndex} is not a known company colour`,
      `${path}.colorIndex`,
    );
  }
  return {
    id: asInt(raw['id'], `${path}.id`),
    name: asString(raw['name'], `${path}.name`),
    colorIndex,
    cashCt: asInt(raw['cashCt'], `${path}.cashCt`),
    loanCt: asInt(raw['loanCt'], `${path}.loanCt`),
    profitThisYearCt: asInt(raw['profitThisYearCt'], `${path}.profitThisYearCt`),
    lastYearProfitCt: asInt(raw['lastYearProfitCt'], `${path}.lastYearProfitCt`),
    fixedAssetsCt: asInt(raw['fixedAssetsCt'], `${path}.fixedAssetsCt`),
    revenueThisMonthCt: asInt(raw['revenueThisMonthCt'], `${path}.revenueThisMonthCt`),
    expensesThisMonthCt: asInt(raw['expensesThisMonthCt'], `${path}.expensesThisMonthCt`),
    monthsInDebt: asInt(raw['monthsInDebt'], `${path}.monthsInDebt`),
    co2ThisYearKg: asFinite(raw['co2ThisYearKg'], `${path}.co2ThisYearKg`),
    co2LastYearKg: asFinite(raw['co2LastYearKg'], `${path}.co2LastYearKg`),
    bankrupt: asBoolean(raw['bankrupt'], `${path}.bankrupt`),
    vehicleUpkeepPerYearCt: asInt(raw['vehicleUpkeepPerYearCt'], `${path}.vehicleUpkeepPerYearCt`),
    infrastructureUpkeepPerYearCt: asInt(
      raw['infrastructureUpkeepPerYearCt'],
      `${path}.infrastructureUpkeepPerYearCt`,
    ),
    accounts: parseAccounts(raw['accounts'], `${path}.accounts`, ACCOUNT_COUNT),
    yearAccounts: parseAccounts(raw['yearAccounts'], `${path}.yearAccounts`, ACCOUNT_COUNT),
    lastYearAccounts: parseAccounts(
      raw['lastYearAccounts'],
      `${path}.lastYearAccounts`,
      ACCOUNT_COUNT,
    ),
    monthHistory: parseAccounts(
      raw['monthHistory'],
      `${path}.monthHistory`,
      LEDGER_HISTORY_MONTHS * ACCOUNT_COUNT,
    ),
    historyCursor: asInt(raw['historyCursor'], `${path}.historyCursor`),
    valueHistory: asArray(raw['valueHistory'], `${path}.valueHistory`).map((value, i) =>
      asInt(value, `${path}.valueHistory[${i}]`),
    ),
    accumulatedDepreciationCt: asInt(
      raw['accumulatedDepreciationCt'],
      `${path}.accumulatedDepreciationCt`,
    ),
    // Fractional units, so it is a row of finite numbers rather than of whole
    // cents - the one place a company row is not money (SPEC2 M17).
    cargoDeliveredUnits: parseUnits(
      raw['cargoDeliveredUnits'],
      `${path}.cargoDeliveredUnits`,
      CARGO_COUNT,
    ),
  };
}

/** A row of cargo figures of exactly the expected length. */
function parseUnits(value: unknown, path: string, length: number): number[] {
  const entries = asArray(value, path);
  if (entries.length !== length) {
    throw new SaveFormatError(`${path}: expected ${length} entries, got ${entries.length}`, path);
  }
  return entries.map((entry, i) => asFinite(entry, `${path}[${i}]`));
}

function parseDifficulty(value: unknown, path: string): Difficulty {
  const int = asInt(value, path);
  if (int !== Difficulty.Easy && int !== Difficulty.Normal && int !== Difficulty.Hard) {
    throw new SaveFormatError(`${path}: ${int} is not a known difficulty`, path);
  }
  return int;
}

function parseClimate(value: unknown, path: string): MapClimate {
  const int = asInt(value, path);
  if (
    int !== MapClimate.Temperate &&
    int !== MapClimate.Arctic &&
    int !== MapClimate.Tropical &&
    int !== MapClimate.Desert
  ) {
    throw new SaveFormatError(`${path}: ${int} is not a known climate`, path);
  }
  return int;
}

function parseWeatherRule(value: unknown, path: string): WeatherRule {
  const int = asInt(value, path);
  if (int < 0 || int >= WEATHER_RULE_COUNT) {
    throw new SaveFormatError(`${path}: ${int} is not a known weather rule`, path);
  }
  return int as WeatherRule;
}

/**
 * The 16x16 weather field (SPEC2 M18).
 *
 * Every cell is validated, not only the length: a byte outside the five known
 * skies would reach a multiplier lookup and read past its table, and "unhashed
 * is not unchecked" applies with more force to something that IS hashed.
 */
function parseWeatherField(value: unknown, path: string): Uint8Array {
  const bytes = asBytes(value, path, WEATHER_REGION_COUNT);
  for (let at = 0; at < bytes.length; at++) {
    if (bytes[at]! >= WEATHER_CELL_COUNT) {
      throw new SaveFormatError(
        `${path}[${at}]: ${bytes[at]!} is not a known weather cell`,
        `${path}[${at}]`,
      );
    }
  }
  return bytes;
}

/**
 * The century curve of SPEC2 M21 (E-09).
 *
 * Every entry is validated and so is the LENGTH, and the length is checked
 * against the world rule rather than against a constant: a world without the
 * economy rule must carry an EMPTY table and a world with it must carry a full
 * one. That pairing is what makes the rule's off state an absence rather than a
 * flag - the two cannot be held apart, so there is no such thing as a save that
 * says it has no century and smuggles one, or one that claims a century it does
 * not carry and would silently multiply every tariff by zero.
 *
 * The band is the generator's own clamp. An entry outside it would reach the
 * tariff, the build bill and the energy meter as a multiplier nothing checks,
 * and "unhashed is not unchecked" applies with more force to something that IS
 * hashed.
 */
/**
 * The start year of SPEC2 E-15 (M23).
 *
 * Banded rather than held to `START_YEAR_PRESETS`, because the presets are
 * what the SCREEN offers and a scenario author may legitimately want 1903 -
 * but a year outside `EARLIEST_START_YEAR..START_YEAR` is a world the
 * catalogue cannot crew and the price-level table was never drawn for, so it
 * is refused rather than clamped (the `mapSize` precedent, D-197).
 */
function parseStartYear(value: unknown, path: string): number {
  const year = asInt(value, path);
  if (year < EARLIEST_START_YEAR || year > START_YEAR) {
    throw new SaveFormatError(
      `${path}: ${year} is outside the ${EARLIEST_START_YEAR}..${START_YEAR} band a world may begin in`,
      path,
    );
  }
  return year;
}

/**
 * The generator rule of SPEC2 M23 bundle 3: a preset and five control steps.
 *
 * Every field is REQUIRED and range-checked. Required because a world that
 * lost its preset is a world that cannot say what its own map is - the same
 * argument the two era rules above it carry - and range-checked because the
 * steps are table indices: an out-of-band step would reach past the end of a
 * factor table, and a `NaN` multiplier does not throw, it silently generates a
 * map of nothing.
 */
function parseMapGenKnobs(value: unknown, path: string): MapGenKnobs {
  const raw = asRecord(value, path);
  const step = (name: string, ceiling: number): number => {
    const at = asInt(raw[name], `${path}.${name}`);
    if (at < 0 || at >= ceiling) {
      throw new SaveFormatError(
        `${path}.${name}: ${at} is outside the 0..${ceiling - 1} band`,
        `${path}.${name}`,
      );
    }
    return at;
  };
  return {
    preset: step('preset', MAP_PRESET_COUNT) as MapPreset,
    seaLevel: step('seaLevel', MAPGEN_KNOB_STEPS),
    hilliness: step('hilliness', MAPGEN_KNOB_STEPS),
    rivers: step('rivers', MAPGEN_KNOB_STEPS),
    townDensity: step('townDensity', MAPGEN_KNOB_STEPS),
    resources: step('resources', MAPGEN_KNOB_STEPS),
  };
}

function parseEconomyCurve(value: unknown, path: string, economy: boolean): number[] {
  const entries = asArray(value, path);
  const expected = economy ? ECONOMY_CURVE_LENGTH : 0;
  if (entries.length !== expected) {
    throw new SaveFormatError(
      `${path}: expected ${expected} entries for a world whose economy rule is ` +
        `${economy ? 'on' : 'off'}, got ${entries.length}`,
      path,
    );
  }
  return entries.map((entry, at) => {
    const permille = asInt(entry, `${path}[${at}]`);
    if (permille < ECONOMY_FACTOR_MIN_PERMILLE || permille > ECONOMY_FACTOR_MAX_PERMILLE) {
      throw new SaveFormatError(
        `${path}[${at}]: ${permille} is outside the ` +
          `${ECONOMY_FACTOR_MIN_PERMILLE}..${ECONOMY_FACTOR_MAX_PERMILLE} per-mille band`,
        `${path}[${at}]`,
      );
    }
    return permille;
  });
}

function asBytes(value: unknown, path: string, expectedLength: number): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new SaveFormatError(`${path}: expected a byte array`, path);
  }
  if (value.length !== expectedLength) {
    throw new SaveFormatError(
      `${path}: expected ${expectedLength} bytes for this map size, got ${value.length}`,
      path,
    );
  }
  return value;
}

function parseTileMap(value: unknown, path: string, mapSize: number): TileMapData {
  const raw = asRecord(value, path);
  const tiles = mapSize * mapSize;
  const corners = (mapSize + 1) * (mapSize + 1);

  return {
    cornerHeight: asBytes(raw['cornerHeight'], `${path}.cornerHeight`, corners),
    terrain: asBytes(raw['terrain'], `${path}.terrain`, tiles),
    roadBits: asBytes(raw['roadBits'], `${path}.roadBits`, tiles),
    trackBits: asBytes(raw['trackBits'], `${path}.trackBits`, tiles),
    railType: asBytes(raw['railType'], `${path}.railType`, tiles),
    signal: asBytes(raw['signal'], `${path}.signal`, tiles),
    structure: asBytes(raw['structure'], `${path}.structure`, tiles),
    structureHeight: asBytes(raw['structureHeight'], `${path}.structureHeight`, tiles),
    townId: asBytes(raw['townId'], `${path}.townId`, tiles * 2),
    industryId: asBytes(raw['industryId'], `${path}.industryId`, tiles * 2),
    buildingKind: asBytes(raw['buildingKind'], `${path}.buildingKind`, tiles),
    buildingLevel: asBytes(raw['buildingLevel'], `${path}.buildingLevel`, tiles),
    owner: asBytes(raw['owner'], `${path}.owner`, tiles),
    waypoint: asBytes(raw['waypoint'], `${path}.waypoint`, tiles),
    congestion: asBytes(raw['congestion'], `${path}.congestion`, tiles),
  };
}

function parseTowns(value: unknown, path: string): Town[] {
  const entries = asArray(value, path);
  const towns: Town[] = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = asRecord(entries[i], `${path}[${i}]`);
    const sizeClass = asInt(raw['sizeClass'], `${path}[${i}].sizeClass`);
    if (
      sizeClass !== TownSize.City &&
      sizeClass !== TownSize.Town &&
      sizeClass !== TownSize.Village
    ) {
      throw new SaveFormatError(
        `${path}[${i}].sizeClass: ${sizeClass} is not a known town size`,
        `${path}[${i}].sizeClass`,
      );
    }
    towns.push({
      id: asInt(raw['id'], `${path}[${i}].id`),
      name: asString(raw['name'], `${path}[${i}].name`),
      x: asInt(raw['x'], `${path}[${i}].x`),
      y: asInt(raw['y'], `${path}[${i}].y`),
      sizeClass,
      population: asInt(raw['population'], `${path}[${i}].population`),
      radius: asInt(raw['radius'], `${path}[${i}].radius`),
      producedThisMonth: asFinite(raw['producedThisMonth'], `${path}[${i}].producedThisMonth`),
      transportedThisMonth: asFinite(
        raw['transportedThisMonth'],
        `${path}[${i}].transportedThisMonth`,
      ),
      goodsDeliveredThisMonth: asFinite(
        raw['goodsDeliveredThisMonth'],
        `${path}[${i}].goodsDeliveredThisMonth`,
      ),
      foodDeliveredThisMonth: asFinite(
        raw['foodDeliveredThisMonth'],
        `${path}[${i}].foodDeliveredThisMonth`,
      ),
      electronicsDeliveredThisMonth: asFinite(
        raw['electronicsDeliveredThisMonth'],
        `${path}[${i}].electronicsDeliveredThisMonth`,
      ),
      buildingMaterialThisMonth: asFinite(
        raw['buildingMaterialThisMonth'],
        `${path}[${i}].buildingMaterialThisMonth`,
      ),
      supplyProducedMean: asFinite(raw['supplyProducedMean'], `${path}[${i}].supplyProducedMean`),
      supplyTransportedMean: asFinite(
        raw['supplyTransportedMean'],
        `${path}[${i}].supplyTransportedMean`,
      ),
      supplyMonths: asInt(raw['supplyMonths'], `${path}[${i}].supplyMonths`),
      roadTilesThisMonth: asInt(raw['roadTilesThisMonth'], `${path}[${i}].roadTilesThisMonth`),
      transportedByCompany: parseNumbers(
        raw['transportedByCompany'],
        `${path}[${i}].transportedByCompany`,
      ),
      councilRating: parseNumbers(raw['councilRating'], `${path}[${i}].councilRating`),
      councilGoodwill: parseNumbers(raw['councilGoodwill'], `${path}[${i}].councilGoodwill`),
      exclusiveCompanyId: asInt(raw['exclusiveCompanyId'], `${path}[${i}].exclusiveCompanyId`),
      exclusiveUntilTick: asInt(raw['exclusiveUntilTick'], `${path}[${i}].exclusiveUntilTick`),
      measureReadyTick: parseNumbers(raw['measureReadyTick'], `${path}[${i}].measureReadyTick`),
      councilProfile: asInt(raw['councilProfile'], `${path}[${i}].councilProfile`),
      noiseBarrierUntilTick: parseNumbers(
        raw['noiseBarrierUntilTick'],
        `${path}[${i}].noiseBarrierUntilTick`,
      ),
    });
  }
  return towns;
}

function parseIndustries(value: unknown, path: string): Industry[] {
  const entries = asArray(value, path);
  const industries: Industry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = asRecord(entries[i], `${path}[${i}]`);
    const type = asInt(raw['type'], `${path}[${i}].type`);
    if (type < 0 || type >= INDUSTRY_TYPE_COUNT) {
      throw new SaveFormatError(
        `${path}[${i}].type: ${type} is not a known industry`,
        `${path}[${i}].type`,
      );
    }
    industries.push({
      id: asInt(raw['id'], `${path}[${i}].id`),
      type: type as Industry['type'],
      x: asInt(raw['x'], `${path}[${i}].x`),
      y: asInt(raw['y'], `${path}[${i}].y`),
      landmassId: asInt(raw['landmassId'], `${path}[${i}].landmassId`),
      inputStock0: asFinite(raw['inputStock0'], `${path}[${i}].inputStock0`),
      inputStock1: asFinite(raw['inputStock1'], `${path}[${i}].inputStock1`),
      outputStock0: asFinite(raw['outputStock0'], `${path}[${i}].outputStock0`),
      outputStock1: asFinite(raw['outputStock1'], `${path}[${i}].outputStock1`),
      productionLevel: asInt(raw['productionLevel'], `${path}[${i}].productionLevel`),
      producedThisMonth: asFinite(raw['producedThisMonth'], `${path}[${i}].producedThisMonth`),
      collectedThisMonth: asFinite(raw['collectedThisMonth'], `${path}[${i}].collectedThisMonth`),
      monthsSinceLevelChange: asInt(
        raw['monthsSinceLevelChange'],
        `${path}[${i}].monthsSinceLevelChange`,
      ),
      serviceAverage: asFinite(raw['serviceAverage'], `${path}[${i}].serviceAverage`),
      serviceMonths: asInt(raw['serviceMonths'], `${path}[${i}].serviceMonths`),
      monthsWithoutCollection: asInt(
        raw['monthsWithoutCollection'],
        `${path}[${i}].monthsWithoutCollection`,
      ),
      open: asBoolean(raw['open'], `${path}[${i}].open`),
      openedTick: asInt(raw['openedTick'], `${path}[${i}].openedTick`),
    });
  }
  return industries;
}

/**
 * The wire form of one order list of the 12.1 grammar - shared by the
 * per-vehicle and the per-line schedule commands, so the two cannot drift.
 *
 * The fields beyond the M5 four are optional on the wire, so every log
 * recorded before M11 parses unchanged; absent means the documented default,
 * and the parser emits the canonical full form.
 */
function parseOrderSpecs(
  value: unknown,
  path: string,
): {
  target: number;
  targetId: number;
  load: number;
  unload: number;
  refitTo: number;
  waitTicks: number;
  condKind: number;
  condComparator: number;
  condValue: number;
  condJumpTo: number;
}[] {
  return asArray(value, path).map((order, i) => {
    const entry = asRecord(order, `${path}[${i}]`);
    return {
      target: asInt(entry['target'], `${path}[${i}].target`),
      targetId: asInt(entry['targetId'], `${path}[${i}].targetId`),
      load: asInt(entry['load'], `${path}[${i}].load`),
      unload: asInt(entry['unload'], `${path}[${i}].unload`),
      refitTo:
        entry['refitTo'] === undefined ? -1 : asInt(entry['refitTo'], `${path}[${i}].refitTo`),
      waitTicks:
        entry['waitTicks'] === undefined ? 0 : asInt(entry['waitTicks'], `${path}[${i}].waitTicks`),
      condKind:
        entry['condKind'] === undefined ? -1 : asInt(entry['condKind'], `${path}[${i}].condKind`),
      condComparator:
        entry['condComparator'] === undefined
          ? 0
          : asInt(entry['condComparator'], `${path}[${i}].condComparator`),
      condValue:
        entry['condValue'] === undefined
          ? 0
          : asFinite(entry['condValue'], `${path}[${i}].condValue`),
      condJumpTo:
        entry['condJumpTo'] === undefined
          ? 0
          : asInt(entry['condJumpTo'], `${path}[${i}].condJumpTo`),
    };
  });
}

/**
 * The one command parser there is.
 *
 * The save log and the determinism fixtures go through this same function on
 * purpose (SPEC2 M10): a second hand-written parser in the test runner is a
 * parser that silently falls behind the command set, and the fixtures then
 * exercise whatever subset it still knows. The coupling test in
 * `tests/unit/commandCoupling.spec.ts` walks the real `CommandKind` table and
 * proves every kind round-trips through here.
 */
export function parseCommand(value: unknown, path: string): Command {
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
    case CommandKind.RaiseLand:
      return {
        kind: CommandKind.RaiseLand,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.LowerLand:
      return {
        kind: CommandKind.LowerLand,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.LevelLand:
      return {
        kind: CommandKind.LevelLand,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.BuildRoad:
      return {
        kind: CommandKind.BuildRoad,
        x1: asInt(raw['x1'], `${path}.x1`),
        y1: asInt(raw['y1'], `${path}.y1`),
        x2: asInt(raw['x2'], `${path}.x2`),
        y2: asInt(raw['y2'], `${path}.y2`),
      };
    case CommandKind.DemolishRoad:
      return {
        kind: CommandKind.DemolishRoad,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.BuildTrack:
      return {
        kind: CommandKind.BuildTrack,
        x1: asInt(raw['x1'], `${path}.x1`),
        y1: asInt(raw['y1'], `${path}.y1`),
        x2: asInt(raw['x2'], `${path}.x2`),
        y2: asInt(raw['y2'], `${path}.y2`),
        railType: asInt(raw['railType'], `${path}.railType`),
        assistant: asBoolean(raw['assistant'], `${path}.assistant`),
        signalSpacing: asInt(raw['signalSpacing'], `${path}.signalSpacing`),
      };
    case CommandKind.DemolishTrack:
      return {
        kind: CommandKind.DemolishTrack,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.BuildRoadStop:
      return {
        kind: CommandKind.BuildRoadStop,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        moduleKind: asInt(raw['moduleKind'], `${path}.moduleKind`),
      };
    case CommandKind.BuildRailStop:
      return {
        kind: CommandKind.BuildRailStop,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        moduleKind: asInt(raw['moduleKind'], `${path}.moduleKind`),
      };
    case CommandKind.BuyRoadVehicle:
      return {
        kind: CommandKind.BuyRoadVehicle,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        specId: asInt(raw['specId'], `${path}.specId`),
      };
    case CommandKind.BuyTrain:
      return {
        kind: CommandKind.BuyTrain,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        specIds: asArray(raw['specIds'], `${path}.specIds`).map((id, i) =>
          asInt(id, `${path}.specIds[${i}]`),
        ),
      };
    case CommandKind.AcceptContract:
      return {
        kind: CommandKind.AcceptContract,
        contractId: asInt(raw['contractId'], `${path}.contractId`),
      };

    case CommandKind.AcceptSupplyContract:
      return {
        kind: CommandKind.AcceptSupplyContract,
        contractId: asInt(raw['contractId'], `${path}.contractId`),
      };

    // The five commands of the scenario workshop (SPEC2 M22). They go through
    // this one parser like everything else, which is what makes an editor
    // session a replayable log rather than a picture of a map.
    case CommandKind.TerraformBrushRegion:
      return {
        kind: CommandKind.TerraformBrushRegion,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        radius: asInt(raw['radius'], `${path}.radius`),
        direction: asInt(raw['direction'], `${path}.direction`),
      };

    case CommandKind.PlaceTownSeed:
      return {
        kind: CommandKind.PlaceTownSeed,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        sizeClass: asInt(raw['sizeClass'], `${path}.sizeClass`),
      };

    case CommandKind.PlaceIndustryAt:
      return {
        kind: CommandKind.PlaceIndustryAt,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        industryType: asInt(raw['industryType'], `${path}.industryType`),
      };

    case CommandKind.PaintForest:
      return {
        kind: CommandKind.PaintForest,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        radius: asInt(raw['radius'], `${path}.radius`),
      };

    case CommandKind.PaintRiver:
      return {
        kind: CommandKind.PaintRiver,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        radius: asInt(raw['radius'], `${path}.radius`),
      };

    // Undo and redo (SPEC2 M25). The patch travels IN the command, so it
    // travels through the one parser like every other payload - which is what
    // makes an undone build replayable from a checkpoint that never saw the
    // session ring that produced it (commands/undo.ts).
    case CommandKind.ApplyPatch:
      return {
        kind: CommandKind.ApplyPatch,
        direction: asInt(raw['direction'], `${path}.direction`),
        sourceKind: asInt(raw['sourceKind'], `${path}.sourceKind`),
        monthIndex: asInt(raw['monthIndex'], `${path}.monthIndex`),
        layers: asIntArray(raw['layers'], `${path}.layers`),
        indices: asIntArray(raw['indices'], `${path}.indices`),
        before: asIntArray(raw['before'], `${path}.before`),
        after: asIntArray(raw['after'], `${path}.after`),
        guardLayers: asIntArray(raw['guardLayers'], `${path}.guardLayers`),
        guardIndices: asIntArray(raw['guardIndices'], `${path}.guardIndices`),
        guardValues: asIntArray(raw['guardValues'], `${path}.guardValues`),
        money: asIntArray(raw['money'], `${path}.money`),
        shoreline: asBoolean(raw['shoreline'], `${path}.shoreline`),
      };

    case CommandKind.BuyExclusiveRights:
      return {
        kind: CommandKind.BuyExclusiveRights,
        townId: asInt(raw['townId'], `${path}.townId`),
      };

    case CommandKind.ApplyTownMeasure:
      return {
        kind: CommandKind.ApplyTownMeasure,
        townId: asInt(raw['townId'], `${path}.townId`),
        measure: asInt(raw['measure'], `${path}.measure`),
      };

    case CommandKind.DemolishBuilding:
      return {
        kind: CommandKind.DemolishBuilding,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };

    case CommandKind.BuildAirport:
      return {
        kind: CommandKind.BuildAirport,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        moduleKind: asInt(raw['moduleKind'], `${path}.moduleKind`),
      };

    case CommandKind.BuyAircraft:
      return {
        kind: CommandKind.BuyAircraft,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        specId: asInt(raw['specId'], `${path}.specId`),
      };

    case CommandKind.BuildWaterStop:
      return {
        kind: CommandKind.BuildWaterStop,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        moduleKind: asInt(raw['moduleKind'], `${path}.moduleKind`),
      };

    case CommandKind.BuyShip:
      return {
        kind: CommandKind.BuyShip,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        specId: asInt(raw['specId'], `${path}.specId`),
      };

    case CommandKind.SetAutoRenew:
      return {
        kind: CommandKind.SetAutoRenew,
        // Absent on the wire in every pre-M11 log, where the switch was
        // company-wide; -1 keeps that meaning as "every line I own".
        lineId: raw['lineId'] === undefined ? -1 : asInt(raw['lineId'], `${path}.lineId`),
        enabled: asBoolean(raw['enabled'], `${path}.enabled`),
      };

    case CommandKind.CreateLine:
      return { kind: CommandKind.CreateLine };

    case CommandKind.DeleteLine:
      return { kind: CommandKind.DeleteLine, lineId: asInt(raw['lineId'], `${path}.lineId`) };

    case CommandKind.SetLineOrders:
      return {
        kind: CommandKind.SetLineOrders,
        lineId: asInt(raw['lineId'], `${path}.lineId`),
        orders: parseOrderSpecs(raw['orders'], `${path}.orders`),
      };

    case CommandKind.AssignVehicleToLine:
      return {
        kind: CommandKind.AssignVehicleToLine,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
        lineId: asInt(raw['lineId'], `${path}.lineId`),
      };

    case CommandKind.ReleaseVehicleFromLine:
      return {
        kind: CommandKind.ReleaseVehicleFromLine,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
      };

    case CommandKind.SetLineTakt:
      return {
        kind: CommandKind.SetLineTakt,
        lineId: asInt(raw['lineId'], `${path}.lineId`),
        taktTicks: asInt(raw['taktTicks'], `${path}.taktTicks`),
        offsetTicks: asInt(raw['offsetTicks'], `${path}.offsetTicks`),
      };

    case CommandKind.SetTransferNode:
      return {
        kind: CommandKind.SetTransferNode,
        stationId: asInt(raw['stationId'], `${path}.stationId`),
        transferNode: asBoolean(raw['transferNode'], `${path}.transferNode`),
      };

    case CommandKind.BuildStationModule:
      return {
        kind: CommandKind.BuildStationModule,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        moduleKind: asInt(raw['moduleKind'], `${path}.moduleKind`),
      };

    case CommandKind.BuildSignal:
      return {
        kind: CommandKind.BuildSignal,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
        signalKind: asInt(raw['signalKind'], `${path}.signalKind`),
        direction: asInt(raw['direction'], `${path}.direction`),
      };
    case CommandKind.DemolishSignal:
      return {
        kind: CommandKind.DemolishSignal,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.BuildWaypoint:
      return {
        kind: CommandKind.BuildWaypoint,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.DemolishWaypoint:
      return {
        kind: CommandKind.DemolishWaypoint,
        x: asInt(raw['x'], `${path}.x`),
        y: asInt(raw['y'], `${path}.y`),
      };
    case CommandKind.RefitVehicle:
      return {
        kind: CommandKind.RefitVehicle,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
        cargo: asInt(raw['cargo'], `${path}.cargo`),
      };
    case CommandKind.SellVehicle:
      return {
        kind: CommandKind.SellVehicle,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
      };
    case CommandKind.SetVehicleOrders:
      return {
        kind: CommandKind.SetVehicleOrders,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
        orders: parseOrderSpecs(raw['orders'], `${path}.orders`),
      };
    case CommandKind.SetVehicleRunning:
      return {
        kind: CommandKind.SetVehicleRunning,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
        running: asBoolean(raw['running'], `${path}.running`),
      };
    case CommandKind.SendVehicleToDepot:
      return {
        kind: CommandKind.SendVehicleToDepot,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
      };
    default:
      throw new SaveFormatError(`${path}.kind: ${kind} is not a known command`, `${path}.kind`);
  }
}

function parseCommandLog(value: unknown, path: string): CommandEnvelope[] {
  const entries = asArray(value, path);
  const log: CommandEnvelope[] = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = asRecord(entries[i], `${path}[${i}]`);
    const companyId = asInt(raw['companyId'], `${path}[${i}].companyId`);
    if (companyId < 0 || companyId >= MAX_COMPANIES) {
      throw new SaveFormatError(
        `${path}[${i}].companyId: ${companyId} is not a company`,
        `${path}[${i}].companyId`,
      );
    }
    // The two RESERVED integrity fields of E-16 are carried THROUGH rather
    // than dropped. Nothing in this build writes one (see `CommandEnvelope`),
    // so no file this build produces has them and no byte of any existing save
    // moves; but a log that arrives with them - from a peer, from a later
    // build - must come out of the parser the way it went in, or a recording
    // would stop being evidence about the envelopes it really contained. They
    // are validated as integers when present and absent otherwise, which is
    // the same posture the container takes towards every optional section.
    const checksum = raw['checksum'];
    const sessionId = raw['sessionId'];
    log.push({
      tick: asInt(raw['tick'], `${path}[${i}].tick`),
      seq: asInt(raw['seq'], `${path}[${i}].seq`),
      companyId,
      command: parseCommand(raw['command'], `${path}[${i}].command`),
      ...(checksum === undefined
        ? {}
        : { checksum: asInt(checksum, `${path}[${i}].checksum`) }),
      ...(sessionId === undefined
        ? {}
        : { sessionId: asInt(sessionId, `${path}[${i}].sessionId`) }),
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
    throw new SaveFormatError(`save.magic: expected "${SAVE_MAGIC}", got "${magic}"`, 'save.magic');
  }
  return { magic, saveVersion: asInt(raw['saveVersion'], 'save.saveVersion') };
}

/** The measured connection table (section 7.4). */
function parseCargoLinks(value: unknown, path: string): CargoLinkSave[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    const samples = asArray(raw['samples'], `${path}[${i}].samples`);
    if (samples.length > LINK_SAMPLE_COUNT) {
      throw new SaveFormatError(
        `${path}[${i}].samples: ${samples.length} is more than the ${LINK_SAMPLE_COUNT} kept`,
        `${path}[${i}].samples`,
      );
    }
    return {
      fromStationId: asInt(raw['fromStationId'], `${path}[${i}].fromStationId`),
      toStationId: asInt(raw['toStationId'], `${path}[${i}].toStationId`),
      samples: samples.map((sample, k) => asFinite(sample, `${path}[${i}].samples[${k}]`)),
      cursor: asInt(raw['cursor'], `${path}[${i}].cursor`),
      meanTicks: asFinite(raw['meanTicks'], `${path}[${i}].meanTicks`),
    };
  });
}

/** The news log (section 17.1). */
function parseNews(value: unknown, path: string): NewsEntry[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    const category = asInt(raw['category'], `${path}[${i}].category`);
    if (category < 0 || category >= NEWS_CATEGORY_COUNT) {
      throw new SaveFormatError(
        `${path}[${i}].category: ${category} is not a known category`,
        `${path}[${i}].category`,
      );
    }
    // Parameters are whatever the message needed; only numbers and strings can
    // have got in, and only those are let back out.
    const params: Record<string, number | string> = {};
    const rawParams = asRecord(raw['params'], `${path}[${i}].params`);
    // Sorted with an explicit total comparator: object keys are unique, so
    // this is a total order, and the default sort is engine dependent (law #14).
    const keys = Object.keys(rawParams).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const key of keys) {
      const value = rawParams[key];
      if (typeof value === 'number' || typeof value === 'string') params[key] = value;
    }

    return {
      tick: asInt(raw['tick'], `${path}[${i}].tick`),
      category: category as NewsEntry['category'],
      severity: asInt(raw['severity'], `${path}[${i}].severity`) as NewsEntry['severity'],
      messageKey: asString(raw['messageKey'], `${path}[${i}].messageKey`),
      params,
      tileIndex: asInt(raw['tileIndex'], `${path}[${i}].tileIndex`),
    };
  });
}

/**
 * The checkpoint ring of a recording (SPEC2 M16).
 *
 * What is checked here is the ring's SHAPE - the ticks are year boundaries,
 * they rise, they stay inside the recording - and never the payloads: a
 * checkpoint verifies itself against its own digest when it is restored, and
 * decompressing sixteen world states to open one save would charge every load
 * for a jump nobody asked for.
 */
function parseCheckpoints(value: unknown, path: string, lastTick: number): Checkpoint[] {
  const entries = asArray(value, path);
  const ring: Checkpoint[] = [];
  let previousTick = -1;
  for (let i = 0; i < entries.length; i++) {
    const raw = asRecord(entries[i], `${path}[${i}]`);
    const tick = asInt(raw['tick'], `${path}[${i}].tick`);
    if (tick < 0 || tick % CHECKPOINT_INTERVAL_TICKS !== 0) {
      throw new SaveFormatError(
        `${path}[${i}].tick: ${tick} is not a multiple of ${CHECKPOINT_INTERVAL_TICKS}`,
        `${path}[${i}].tick`,
      );
    }
    if (tick <= previousTick) {
      throw new SaveFormatError(
        `${path}[${i}].tick: ${tick} does not follow ${previousTick}; the ring is ordered`,
        `${path}[${i}].tick`,
      );
    }
    if (tick > lastTick) {
      throw new SaveFormatError(
        `${path}[${i}].tick: ${tick} is past the end of the recording (${lastTick})`,
        `${path}[${i}].tick`,
      );
    }
    previousTick = tick;

    const digest = asDigest(raw['worldDigest'], `${path}[${i}].worldDigest`);
    if (digest === '') {
      throw new SaveFormatError(
        `${path}[${i}].worldDigest: a checkpoint without a digest cannot be verified`,
        `${path}[${i}].worldDigest`,
      );
    }
    const payload = raw['payload'];
    if (!(payload instanceof Uint8Array) || payload.length === 0) {
      throw new SaveFormatError(
        `${path}[${i}].payload: expected a non-empty byte array`,
        `${path}[${i}].payload`,
      );
    }
    ring.push({
      tick,
      worldDigest: digest,
      payload,
      scheduleDigest: asOptionalDigest(raw['scheduleDigest'], `${path}[${i}].scheduleDigest`),
    });
  }
  return ring;
}

/** What a `.ironreplay` claims about its own end; null for a plain save. */
function parseReplayClaim(value: unknown, path: string, baseTick: number): ReplayClaim | null {
  if (value === null || value === undefined) return null;
  const raw = asRecord(value, path);
  const finalTick = asInt(raw['finalTick'], `${path}.finalTick`);
  if (finalTick < baseTick) {
    throw new SaveFormatError(
      `${path}.finalTick: ${finalTick} is before the state it starts from (${baseTick})`,
      `${path}.finalTick`,
    );
  }
  const finalHash = asDigest(raw['finalHash'], `${path}.finalHash`);
  if (finalHash === '') {
    throw new SaveFormatError(
      `${path}.finalHash: a recording that claims an end must name its hash`,
      `${path}.finalHash`,
    );
  }
  return {
    finalTick,
    finalHash,
    scheduleDigest: asOptionalDigest(raw['scheduleDigest'], `${path}.scheduleDigest`),
  };
}

/**
 * One metadata string: present, non-empty and bounded.
 *
 * Unhashed is not unchecked. The block cannot corrupt a world - that is what
 * keeping it out of the digest buys - but it can still be a file that says
 * nothing, or a briefing of a megabyte, and neither is something the loader has
 * any reason to accept from a file the player was handed.
 */
function asMetaText(value: unknown, path: string): string {
  const text = asString(value, path);
  if (text.length === 0) throw new SaveFormatError(`${path}: expected a non-empty string`, path);
  if (text.length > SCENARIO_TEXT_MAX_CHARS) {
    throw new SaveFormatError(
      `${path}: ${text.length} characters is more than the ${SCENARIO_TEXT_MAX_CHARS} allowed`,
      path,
    );
  }
  return text;
}

/** A bilingual metadata field; both halves are required (de/en parity). */
function parseScenarioText(value: unknown, path: string): ScenarioText {
  const raw = asRecord(value, path);
  return {
    de: asMetaText(raw['de'], `${path}.de`),
    en: asMetaText(raw['en'], `${path}.en`),
  };
}

/**
 * The `.ironscenario` metadata block (SPEC2 M17); null for a plain save.
 *
 * Three things are checked that the type alone cannot say:
 *
 *  - the goal captions match the goals the WORLD carries, one for one. A
 *    scenario that briefs three goals and sets four would show the player a
 *    scoreboard with a nameless row, and the count is the only coupling between
 *    the unhashed block and the hashed state there can be - a caption may
 *    describe a goal, never define one (D-193).
 *  - every locked rule is a rule this build knows, and the list is strictly
 *    ascending. Ascending gives the lock set ONE wire form, so re-encoding a
 *    scenario cannot change its bytes, and it rules out duplicates in the same
 *    comparison.
 *  - the span is a span. It decides nothing (the deadline that does is a goal's
 *    `bronzeTick`, in hashed state), but a card that prints 1975-1950 is a file
 *    contradicting itself and is refused like any other.
 */
function parseScenario(value: unknown, path: string, goalCount: number): ScenarioMeta | null {
  if (value === null || value === undefined) return null;
  const raw = asRecord(value, path);

  const goals = asArray(raw['goals'], `${path}.goals`).map((entry, i) =>
    parseScenarioText(entry, `${path}.goals[${i}]`),
  );
  if (goals.length !== goalCount) {
    throw new SaveFormatError(
      `${path}.goals: ${goals.length} captions for ${goalCount} goals - a scenario briefs ` +
        'every goal it sets',
      `${path}.goals`,
    );
  }

  const rules = asArray(raw['lockedRules'], `${path}.lockedRules`);
  const lockedRules: ScenarioRule[] = [];
  let previous = '';
  for (let i = 0; i < rules.length; i++) {
    const name = asString(rules[i], `${path}.lockedRules[${i}]`);
    if (!isLockableRule(name)) {
      throw new SaveFormatError(
        `${path}.lockedRules[${i}]: "${name}" is not a world rule a scenario may pin`,
        `${path}.lockedRules[${i}]`,
      );
    }
    if (name <= previous) {
      throw new SaveFormatError(
        `${path}.lockedRules[${i}]: "${name}" does not follow "${previous}"; the list is ` +
          'ascending and carries no duplicates',
        `${path}.lockedRules[${i}]`,
      );
    }
    previous = name;
    lockedRules.push(name);
  }

  const fromTick = asInt(raw['fromTick'], `${path}.fromTick`);
  const toTick = asInt(raw['toTick'], `${path}.toTick`);
  if (fromTick < 0 || toTick < fromTick) {
    throw new SaveFormatError(
      `${path}: the span ${fromTick}..${toTick} does not run forwards`,
      `${path}.toTick`,
    );
  }

  return {
    title: asMetaText(raw['title'], `${path}.title`),
    author: asMetaText(raw['author'], `${path}.author`),
    briefing: parseScenarioText(raw['briefing'], `${path}.briefing`),
    goals,
    lockedRules,
    fromTick,
    toTick,
    referenceFinalHash: asDigest(raw['referenceFinalHash'], `${path}.referenceFinalHash`),
  };
}

/**
 * Strictly validate one world state.
 *
 * Split out of {@link parseSaveFile} for the checkpoint ring: a checkpoint
 * payload is a world state in the same codec, and validating it through a
 * second hand-written reader is exactly the drift D-133 removed from the
 * command parser.
 */
export function parseWorldState(value: unknown, path: string): WorldStateData {
  const stateRaw = asRecord(value, path);
  // The validator guards against corrupt data, not against menu choices: it
  // accepts any square power-of-two map, which keeps small test worlds loadable
  // while still rejecting a size that would make the layer lengths nonsense.
  const mapSize = asInt(stateRaw['mapSize'], `${path}.mapSize`);
  if (!isLegalMapSize(mapSize)) {
    throw new SaveFormatError(`${path}.mapSize: ${mapSizeRefusal(mapSize)}`, `${path}.mapSize`);
  }

  const economy = asBoolean(stateRaw['economy'], `${path}.economy`);

  return {
    tick: asInt(stateRaw['tick'], `${path}.tick`),
    seed: asInt(stateRaw['seed'], `${path}.seed`),
    difficulty: parseDifficulty(stateRaw['difficulty'], `${path}.difficulty`),
    climate: parseClimate(stateRaw['climate'], `${path}.climate`),
    // The two era rules of M23 (E-15), required on the same terms as every
    // rule below them: a save that has lost its start year is a save whose
    // every date, tariff and purchase list would be a different one after
    // loading, and a save that has lost `endless` is one that either stops in
    // a year it should not or refuses to.
    startYear: parseStartYear(stateRaw['startYear'], `${path}.startYear`),
    endless: asBoolean(stateRaw['endless'], `${path}.endless`),
    // The generator rule of the same milestone, required on the same terms:
    // the map is the world, so a save that has lost the preset and the five
    // control steps is a save that cannot say which world it holds.
    mapgen: parseMapGenKnobs(stateRaw['mapgen'], `${path}.mapgen`),
    inflation: asBoolean(stateRaw['inflation'], `${path}.inflation`),
    emissions: asBoolean(stateRaw['emissions'], `${path}.emissions`),
    // The two 8.4 rules of M15. Required, like every other world rule: a save
    // that has lost one is a save whose trains would drive somewhere else.
    occupancyPenalty: asBoolean(stateRaw['occupancyPenalty'], `${path}.occupancyPenalty`),
    signalPenalty: asBoolean(stateRaw['signalPenalty'], `${path}.signalPenalty`),
    roadCongestion: asBoolean(stateRaw['roadCongestion'], `${path}.roadCongestion`),
    // The weather rule of M18 and the field it drives. Both required, like
    // every other world rule: a save that has lost either is a save whose sky
    // - and with it whose costs, breakdowns and cargo decay - would be a
    // different one after loading than before saving.
    weather: parseWeatherRule(stateRaw['weather'], `${path}.weather`),
    weatherField: parseWeatherField(stateRaw['weatherField'], `${path}.weatherField`),
    // The election rule of M20, required on the same terms: a save that has
    // lost it is a save whose councils would rate the same company differently
    // after loading than before saving.
    elections: asBoolean(stateRaw['elections'], `${path}.elections`),
    // The century rule of M21 and the curve it decides, required on the same
    // terms and validated as ONE thing: the rule says whether there is a
    // century, the table is it, and the parser refuses any save that holds a
    // different opinion in each.
    economy,
    economyCurve: parseEconomyCurve(stateRaw['economyCurve'], `${path}.economyCurve`, economy),
    // The workshop rule of M22, required on the same terms as every rule above
    // it: a save that has lost it is a save whose next build is charged
    // differently after loading than before saving.
    editorMode: asBoolean(stateRaw['editorMode'], `${path}.editorMode`),
    mapSize,
    rng: parseRngState(stateRaw['rng'], `${path}.rng`),
    companies: parseCompanies(stateRaw['companies'], `${path}.companies`),
    map: parseTileMap(stateRaw['map'], `${path}.map`, mapSize),
    towns: parseTowns(stateRaw['towns'], `${path}.towns`),
    industries: parseIndustries(stateRaw['industries'], `${path}.industries`),
    stations: decodeStations(stateRaw['stations'], `${path}.stations`),
    vehicles: decodeVehicles(stateRaw['vehicles'], `${path}.vehicles`),
    lines: decodeLines(stateRaw['lines'], `${path}.lines`),
    goals: decodeGoals(stateRaw['goals'], `${path}.goals`),
    cargoLinks: parseCargoLinks(stateRaw['cargoLinks'], `${path}.cargoLinks`),
    news: parseNews(stateRaw['news'], `${path}.news`),
    contracts: parseContracts(stateRaw['contracts'], `${path}.contracts`),
    nextContractId: asInt(stateRaw['nextContractId'], `${path}.nextContractId`),
    supplyContracts: parseSupplyContracts(stateRaw['supplyContracts'], `${path}.supplyContracts`),
    nextSupplyContractId: asInt(stateRaw['nextSupplyContractId'], `${path}.nextSupplyContractId`),
    subsidies: parseSubsidies(stateRaw['subsidies'], `${path}.subsidies`),
    nextSubsidyId: asInt(stateRaw['nextSubsidyId'], `${path}.nextSubsidyId`),
    industryEvents: parseIndustryEvents(stateRaw['industryEvents'], `${path}.industryEvents`),
    ai: parseAi(stateRaw['ai'], `${path}.ai`),
  };
}

/** Strictly validate a payload that has already been migrated to SAVE_VERSION. */
export function parseSaveFile(value: unknown): SaveFile {
  const raw = asRecord(value, 'save');
  const header = readSaveHeader(raw);
  if (header.saveVersion !== SAVE_VERSION) {
    throw new SaveFormatError(
      `save.saveVersion: expected ${SAVE_VERSION} after migration, got ${header.saveVersion}`,
      'save.saveVersion',
    );
  }

  const state = parseWorldState(raw['state'], 'save.state');

  const tick = asInt(raw['tick'], 'save.tick');
  const seed = asInt(raw['seed'], 'save.seed');
  if (tick !== state.tick) {
    throw new SaveFormatError(
      `save.tick (${tick}) disagrees with save.state.tick (${state.tick})`,
      'save.tick',
    );
  }
  if (seed !== state.seed) {
    throw new SaveFormatError(
      `save.seed (${seed}) disagrees with save.state.seed (${state.seed})`,
      'save.seed',
    );
  }

  const commandLog = parseCommandLog(raw['commandLog'], 'save.commandLog');
  const commandsExecuted = asInt(raw['commandsExecuted'], 'save.commandsExecuted');
  if (commandsExecuted < 0 || commandsExecuted > commandLog.length) {
    throw new SaveFormatError(
      `save.commandsExecuted: ${commandsExecuted} is outside 0..${commandLog.length}`,
      'save.commandsExecuted',
    );
  }

  const replay = parseReplayClaim(raw['replay'], 'save.replay', tick);
  // A replay holds the world at its BASE tick and the log that runs FORWARD
  // from there, so the ring may reach past `state.tick` - up to the end the
  // recording claims, and never past it.
  const checkpoints = parseCheckpoints(
    raw['checkpoints'],
    'save.checkpoints',
    replay === null ? tick : replay.finalTick,
  );

  const logBaseTick = asInt(raw['logBaseTick'], 'save.logBaseTick');
  if (logBaseTick < 0 || logBaseTick > tick) {
    throw new SaveFormatError(
      `save.logBaseTick: ${logBaseTick} is outside 0..${tick}`,
      'save.logBaseTick',
    );
  }
  // A trimmed log begins at a world the file has to hold, or the recording
  // starts from nothing (SPEC2 M16). Zero needs no checkpoint: the genesis of
  // a game is reconstructible from the parameters the state carries.
  if (logBaseTick > 0 && !checkpoints.some((entry) => entry.tick === logBaseTick)) {
    throw new SaveFormatError(
      `save.logBaseTick: the log starts at ${logBaseTick} but no checkpoint stands there`,
      'save.logBaseTick',
    );
  }
  for (let i = 0; i < commandLog.length; i++) {
    if (commandLog[i]!.tick < logBaseTick) {
      throw new SaveFormatError(
        `save.commandLog[${i}].tick: ${commandLog[i]!.tick} is older than the log base ` +
          `${logBaseTick}`,
        `save.commandLog[${i}].tick`,
      );
    }
  }

  return {
    magic: header.magic,
    saveVersion: header.saveVersion,
    gameVersion: asString(raw['gameVersion'], 'save.gameVersion'),
    seed,
    tick,
    worldDigest: asDigest(raw['worldDigest'], 'save.worldDigest'),
    state,
    commandLog,
    commandsExecuted,
    logBaseTick,
    checkpoints,
    replay,
    scenario: parseScenario(raw['scenario'], 'save.scenario', state.goals.length),
  };
}
