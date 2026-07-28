import { CommandKind, type Command, type CommandEnvelope } from '../commands/types';
import type { CargoLinkSave } from '../cargo/linkGraph';
import { ACCOUNT_COUNT } from '../economy/ledger';
import {
  COMPANY_COLOR_COUNT,
  Difficulty,
  LEDGER_HISTORY_MONTHS,
  LINK_SAMPLE_COUNT,
  MapClimate,
} from '../constants';
import { INDUSTRY_TYPE_COUNT, type Industry } from '../industry/types';
import { TownSize, type Town } from '../town/types';
import type { TileMapData, WorldStateData } from '../World';
import { decodeStations, decodeVehicles } from './entities';
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
 * setting of section 14.2 and the auto-renewal switch of 11.3.
 */
export const SAVE_VERSION = 15;

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

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new SaveFormatError(`${path}: expected a boolean`);
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
    throw new SaveFormatError(`${path}: expected a finite number`);
  }
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

/** A row of accounts of exactly the expected length, all whole cents. */
function parseAccounts(value: unknown, path: string, length: number): number[] {
  const entries = asArray(value, path);
  if (entries.length !== length) {
    throw new SaveFormatError(`${path}: expected ${length} entries, got ${entries.length}`);
  }
  return entries.map((entry, i) => asInt(entry, `${path}[${i}]`));
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
    revenueThisMonthCt: asInt(raw['revenueThisMonthCt'], `${path}.revenueThisMonthCt`),
    expensesThisMonthCt: asInt(raw['expensesThisMonthCt'], `${path}.expensesThisMonthCt`),
    monthsInDebt: asInt(raw['monthsInDebt'], `${path}.monthsInDebt`),
    bankrupt: asBoolean(raw['bankrupt'], `${path}.bankrupt`),
    autoRenew: asBoolean(raw['autoRenew'], `${path}.autoRenew`),
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
    throw new SaveFormatError(`${path}: ${int} is not a known difficulty`);
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
    throw new SaveFormatError(`${path}: ${int} is not a known climate`);
  }
  return int;
}

function asBytes(value: unknown, path: string, expectedLength: number): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new SaveFormatError(`${path}: expected a byte array`);
  }
  if (value.length !== expectedLength) {
    throw new SaveFormatError(
      `${path}: expected ${expectedLength} bytes for this map size, got ${value.length}`,
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
      throw new SaveFormatError(`${path}[${i}].sizeClass: ${sizeClass} is not a known town size`);
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
      throw new SaveFormatError(`${path}[${i}].type: ${type} is not a known industry`);
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
    case CommandKind.SetAutoRenew:
      return {
        kind: CommandKind.SetAutoRenew,
        enabled: asBoolean(raw['enabled'], `${path}.enabled`),
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
        orders: asArray(raw['orders'], `${path}.orders`).map((order, i) => {
          const entry = asRecord(order, `${path}.orders[${i}]`);
          return {
            target: asInt(entry['target'], `${path}.orders[${i}].target`),
            targetId: asInt(entry['targetId'], `${path}.orders[${i}].targetId`),
            load: asInt(entry['load'], `${path}.orders[${i}].load`),
            unload: asInt(entry['unload'], `${path}.orders[${i}].unload`),
          };
        }),
      };
    case CommandKind.SetVehicleRunning:
      return {
        kind: CommandKind.SetVehicleRunning,
        vehicleId: asInt(raw['vehicleId'], `${path}.vehicleId`),
        running: asBoolean(raw['running'], `${path}.running`),
      };
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
/** The measured connection table (section 7.4). */
function parseCargoLinks(value: unknown, path: string): CargoLinkSave[] {
  return asArray(value, path).map((entry, i) => {
    const raw = asRecord(entry, `${path}[${i}]`);
    const samples = asArray(raw['samples'], `${path}[${i}].samples`);
    if (samples.length > LINK_SAMPLE_COUNT) {
      throw new SaveFormatError(
        `${path}[${i}].samples: ${samples.length} is more than the ${LINK_SAMPLE_COUNT} kept`,
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

export function parseSaveFile(value: unknown): SaveFile {
  const raw = asRecord(value, 'save');
  const header = readSaveHeader(raw);
  if (header.saveVersion !== SAVE_VERSION) {
    throw new SaveFormatError(
      `save.saveVersion: expected ${SAVE_VERSION} after migration, got ${header.saveVersion}`,
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
    );
  }

  const state: WorldStateData = {
    tick: asInt(stateRaw['tick'], 'save.state.tick'),
    seed: asInt(stateRaw['seed'], 'save.state.seed'),
    difficulty: parseDifficulty(stateRaw['difficulty'], 'save.state.difficulty'),
    climate: parseClimate(stateRaw['climate'], 'save.state.climate'),
    inflation: asBoolean(stateRaw['inflation'], 'save.state.inflation'),
    mapSize,
    rng: parseRngState(stateRaw['rng'], 'save.state.rng'),
    company: parseCompany(stateRaw['company'], 'save.state.company'),
    map: parseTileMap(stateRaw['map'], 'save.state.map', mapSize),
    towns: parseTowns(stateRaw['towns'], 'save.state.towns'),
    industries: parseIndustries(stateRaw['industries'], 'save.state.industries'),
    stations: decodeStations(stateRaw['stations'], 'save.state.stations'),
    vehicles: decodeVehicles(stateRaw['vehicles'], 'save.state.vehicles'),
    cargoLinks: parseCargoLinks(stateRaw['cargoLinks'], 'save.state.cargoLinks'),
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
