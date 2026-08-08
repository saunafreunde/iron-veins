import type { AiProject, AiState } from '../ai/types';
import type { Contract } from '../economy/contracts';
import { CommandKind, type Command, type CommandEnvelope } from '../commands/types';
import type { CargoLinkSave } from '../cargo/linkGraph';
import { ACCOUNT_COUNT } from '../economy/ledger';
import { NEWS_CATEGORY_COUNT, type NewsEntry } from '../news/log';
import {
  COMPANY_COLOR_COUNT,
  MAX_COMPANIES,
  Difficulty,
  LEDGER_HISTORY_MONTHS,
  LINK_SAMPLE_COUNT,
  MapClimate,
} from '../constants';
import { INDUSTRY_TYPE_COUNT, type Industry } from '../industry/types';
import { TownSize, type Town } from '../town/types';
import type { TileMapData, WorldStateData } from '../World';
import { decodeLines, decodeStations, decodeVehicles } from './entities';
import type { CompanyState, RngState } from '../types';

/** Four byte marker at the start of every save payload. */
export const SAVE_MAGIC = 'IRVN';

/**
 * Current save format version.
 *
 * Rule (section 19.1, failure #11): every change to the shape of the simulation
 * state bumps this number AND adds a migration under ./migrations. Skipping the
 * migration once makes every older save unloadable forever.
 *
 * Version 2 (M1) added the map, the towns and the industries. No migration from
 * version 1 is registered: a version 1 world had no map at all, so a migration
 * could only invent one, and handing the player a world that is not the one
 * they saved is worse than refusing to load it. Version 1 existed for a single
 * milestone and was never distributed.
 *
 * From version 2 on every step has a real migration: 3 added stations and
 * vehicles, 4 the two rail tile layers, 5 the train composition and the running
 * distance-to-go, 6 the bridge and tunnel layers, 7 signals and the two
 * reservation indices a train carries, 8 industry production and the town
 * delivery counters, 9 the block claim and the deadlock clock, 10 the cargo
 * destinations and the measured connection table of section 7.4, 11 industry
 * closure and the three support modules of section 10, 12 the bankruptcy
 * countdown of section 14.2, 13 the accounts of section 14.1, 14 the traction
 * work each vehicle has done since its last energy bill, 15 the inflation
 * setting of section 14.2 and the auto-renewal switch of 11.3, 16 the runway
 * occupancy of section 8.4, 17 the news log of section 17.1, 18 the several
 * companies of section 15 with the tile ownership and the command authorship
 * that come with them, 19 the town councils of section 13.3, 20 the carbon
 * account of section 14.3, 21 the tenders of section 14.4, 22 the AI
 * competitors of section 15, 23 the world digest of M10 - a container-only
 * change: the hashed state itself is untouched, which the migration test
 * proves by hash identity - 24 the M11 line backbone: the full order
 * grammar of section 12.1 (waypoints, refit, dwell, conditional jumps), the
 * waypoint tile layer, and - Stage B of the same bump - the line entities of
 * section 12.2 with the per-vehicle assignment, the per-line auto-renewal
 * that replaces the company-wide flag, and the AI's line adoption (E-06);
 * M11's ONE bump (SPEC2 Z5): the later stages of the milestone extend the
 * same v24 migration rather than adding numbers. 25 is M14's one bump: the
 * per-station cargo-history ring of the station x-ray (twelve months of
 * collected/delivered/expired per cargo, plus the month in progress). A
 * pre-M14 world recorded no history, so the migration hands every station a
 * zeroed ring - which is exactly what that world knew. 26 is M15's one bump:
 * the two route-cost world rules of SPEC.md 8.4 - `occupancyPenalty` and
 * `signalPenalty` - which decide what `railPath` charges for an occupied
 * section and for a signal. A world that predates them was driven without
 * them, so the migration enters both as OFF, which is exactly what those
 * worlds did.
 */
export const SAVE_VERSION = 26;

/** File extension used for manual and automatic saves. */
export const SAVE_EXTENSION = '.ironsave';

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
  /** Full command log since the start of the game; drives replays. */
  readonly commandLog: readonly CommandEnvelope[];
  /** How many entries of the log had already run when the save was taken. */
  readonly commandsExecuted: number;
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
    railTrains: raw['railTrains'] === undefined ? 1 : asInt(raw['railTrains'], `${path}.railTrains`),
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
  };
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
      transportedByCompany: parseNumbers(
        raw['transportedByCompany'],
        `${path}[${i}].transportedByCompany`,
      ),
      councilRating: parseNumbers(raw['councilRating'], `${path}[${i}].councilRating`),
      councilGoodwill: parseNumbers(raw['councilGoodwill'], `${path}[${i}].councilGoodwill`),
      exclusiveCompanyId: asInt(raw['exclusiveCompanyId'], `${path}[${i}].exclusiveCompanyId`),
      exclusiveUntilTick: asInt(raw['exclusiveUntilTick'], `${path}[${i}].exclusiveUntilTick`),
      measureReadyTick: parseNumbers(raw['measureReadyTick'], `${path}[${i}].measureReadyTick`),
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
    log.push({
      tick: asInt(raw['tick'], `${path}[${i}].tick`),
      seq: asInt(raw['seq'], `${path}[${i}].seq`),
      companyId,
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
    throw new SaveFormatError(`save.magic: expected "${SAVE_MAGIC}", got "${magic}"`, 'save.magic');
  }
  return { magic, saveVersion: asInt(raw['saveVersion'], 'save.saveVersion') };
}

/** Strictly validate a payload that has already been migrated to SAVE_VERSION. */
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

export function parseSaveFile(value: unknown): SaveFile {
  const raw = asRecord(value, 'save');
  const header = readSaveHeader(raw);
  if (header.saveVersion !== SAVE_VERSION) {
    throw new SaveFormatError(
      `save.saveVersion: expected ${SAVE_VERSION} after migration, got ${header.saveVersion}`,
      'save.saveVersion',
    );
  }

  const stateRaw = asRecord(raw['state'], 'save.state');
  // The validator guards against corrupt data, not against menu choices: it
  // accepts any square power-of-two map, which keeps small test worlds loadable
  // while still rejecting a size that would make the layer lengths nonsense.
  const mapSize = asInt(stateRaw['mapSize'], 'save.state.mapSize');
  if (mapSize < 64 || mapSize > 2048 || (mapSize & (mapSize - 1)) !== 0) {
    throw new SaveFormatError(
      `save.state.mapSize: ${mapSize} is not a power of two between 64 and 2048`,
      'save.state.mapSize',
    );
  }

  const state: WorldStateData = {
    tick: asInt(stateRaw['tick'], 'save.state.tick'),
    seed: asInt(stateRaw['seed'], 'save.state.seed'),
    difficulty: parseDifficulty(stateRaw['difficulty'], 'save.state.difficulty'),
    climate: parseClimate(stateRaw['climate'], 'save.state.climate'),
    inflation: asBoolean(stateRaw['inflation'], 'save.state.inflation'),
    emissions: asBoolean(stateRaw['emissions'], 'save.state.emissions'),
    // The two 8.4 rules of M15. Required, like every other world rule: a save
    // that has lost one is a save whose trains would drive somewhere else.
    occupancyPenalty: asBoolean(stateRaw['occupancyPenalty'], 'save.state.occupancyPenalty'),
    signalPenalty: asBoolean(stateRaw['signalPenalty'], 'save.state.signalPenalty'),
    mapSize,
    rng: parseRngState(stateRaw['rng'], 'save.state.rng'),
    companies: parseCompanies(stateRaw['companies'], 'save.state.companies'),
    map: parseTileMap(stateRaw['map'], 'save.state.map', mapSize),
    towns: parseTowns(stateRaw['towns'], 'save.state.towns'),
    industries: parseIndustries(stateRaw['industries'], 'save.state.industries'),
    stations: decodeStations(stateRaw['stations'], 'save.state.stations'),
    vehicles: decodeVehicles(stateRaw['vehicles'], 'save.state.vehicles'),
    lines: decodeLines(stateRaw['lines'], 'save.state.lines'),
    cargoLinks: parseCargoLinks(stateRaw['cargoLinks'], 'save.state.cargoLinks'),
    news: parseNews(stateRaw['news'], 'save.state.news'),
    contracts: parseContracts(stateRaw['contracts'], 'save.state.contracts'),
    nextContractId: asInt(stateRaw['nextContractId'], 'save.state.nextContractId'),
    ai: parseAi(stateRaw['ai'], 'save.state.ai'),
  };

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
  };
}
