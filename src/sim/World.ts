import { executeCommand } from './commands/execute';
import type { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  type Difficulty,
  type MapClimate,
} from './constants';
import {
  bookMonthlyInterest,
  bookMonthlyUpkeep,
  closeFinancialYear,
  closeMonth,
  createCompany,
} from './economy/company';
import { RailPathfinder } from './net/railPath';
import { ReservationTable } from './net/reservations';
import { RoadPathfinder } from './net/roadPath';
import {
  buildVehicleStore,
  encodeStations,
  encodeVehicles,
  type VehicleSave,
} from './save/entities';
import { SaveFormatError } from './save/format';
import type { Station } from './station/types';
import { growTowns, produceTownCargo } from './town/update';
import { ageVehicles, expireStaleCargo, rollBreakdowns } from './vehicles/lifecycle';
import { updateVehicles } from './vehicles/update';
import { VehicleStore } from './vehicles/VehicleStore';
import { Fnv1a64 } from './hash';
import type { Industry } from './industry/types';
import { TileMap } from './map/TileMap';
import { computeLandmasses, markOcean } from './mapgen/hydrology';
import { generateMap, type GeneratedWorld, type MapGenProgress } from './mapgen';
import { Rng } from './rng';
import type { Town } from './town/types';
import type { CompanyState, GameDate, NewGameParams, RngState } from './types';

/** Receives the result of every executed command, for UI feedback and logging. */
export type CommandOutcomeSink = (envelope: CommandEnvelope, outcome: CommandOutcome) => void;

/** Plain, serialisable image of the whole simulation state. */
export interface WorldStateData {
  tick: number;
  seed: number;
  difficulty: Difficulty;
  climate: MapClimate;
  mapSize: number;
  rng: RngState;
  company: CompanyState;
  map: TileMapData;
  towns: Town[];
  industries: Industry[];
  stations: Station[];
  vehicles: VehicleSave[];
}

/** The tile layers, as raw bytes. Derived layers are recomputed on load. */
export interface TileMapData {
  cornerHeight: Uint8Array;
  terrain: Uint8Array;
  roadBits: Uint8Array;
  trackBits: Uint8Array;
  railType: Uint8Array;
  signal: Uint8Array;
  structure: Uint8Array;
  structureHeight: Uint8Array;
  townId: Uint8Array;
  industryId: Uint8Array;
  buildingKind: Uint8Array;
  buildingLevel: Uint8Array;
}

/**
 * The gameplay RNG must not start on the same stream as the map generator, or
 * the first in-game random event would correlate with the terrain.
 */
function gameplaySeed(seed: number): number {
  return (seed + 0x9e3779b9) | 0;
}

function bytesOf(view: Int16Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Container of all simulation state.
 *
 * `step()` is the single entry point that advances time. It runs at a fixed
 * 20 Hz and never looks at wall-clock time - the scheduler in SimWorker decides
 * how often it is called, and that decision must not influence the outcome.
 */
export class World {
  tick = 0;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly climate: MapClimate;
  readonly rng: Rng;
  readonly company: CompanyState;
  readonly map: TileMap;
  readonly towns: Town[];
  readonly industries: Industry[];
  readonly stations: Station[] = [];
  /** Replaced wholesale when a save is loaded, hence not readonly. */
  vehicles = new VehicleStore();
  readonly roadPathfinder: RoadPathfinder;
  readonly railPathfinder: RailPathfinder;
  /**
   * Which train holds which piece of track. Derived from the per-vehicle
   * reservation indices plus each train's saved route, so it is never
   * serialised and never hashed - it is rebuilt on load, exactly as the land
   * masses and the ocean mask are.
   */
  readonly reservations: ReservationTable;

  /** The company the local player controls. AI companies get 1..n in M8. */
  readonly playerCompanyId = 0;

  private constructor(params: NewGameParams, generated: GeneratedWorld) {
    this.seed = params.seed | 0;
    this.difficulty = params.difficulty;
    this.climate = params.climate;
    this.rng = Rng.fromSeed(gameplaySeed(this.seed));
    this.company = createCompany(params.companyName, params.companyColorIndex, params.difficulty);
    this.map = generated.map;
    this.towns = generated.towns;
    this.industries = generated.industries;
    this.roadPathfinder = new RoadPathfinder(generated.map.tileCount);
    this.railPathfinder = new RailPathfinder(generated.map.tileCount);
    this.reservations = new ReservationTable(generated.map.tileCount);
  }

  /**
   * Name for a new station: the town it stands in, numbered when that town
   * already has one. Stations in open country are numbered on their own.
   */
  nextStationName(x: number, y: number): string {
    const townId = this.map.townId[this.map.tileIndex(x, y)]!;
    const town = townId >= 0 ? this.towns[townId] : undefined;
    const base = town?.name ?? 'Landstation';

    let count = 0;
    for (const station of this.stations) {
      if (station.name === base || station.name.startsWith(`${base} `)) count++;
    }
    return count === 0 ? base : `${base} ${count + 1}`;
  }

  /**
   * Build a world around a map that already exists.
   *
   * Used by the balancing scenarios and, from M9, by the tutorial and by
   * hand-authored scenarios - all of which need a controlled map rather than a
   * generated one.
   */
  static fromGenerated(params: NewGameParams, generated: GeneratedWorld): World {
    return new World(params, generated);
  }

  /** Start a new game: generates the map, then builds the world around it. */
  static create(params: NewGameParams, report: MapGenProgress | null = null): World {
    const generated = generateMap(
      { size: params.mapSize, seed: params.seed, climate: params.climate },
      report,
    );
    return new World(params, generated);
  }

  /**
   * Advance the world by exactly one tick.
   *
   * Order matters and is part of the deterministic contract:
   *   1. every command scheduled for the current tick is executed,
   *   2. the tick counter advances,
   *   3. calendar hooks fire for the boundaries the new tick has crossed.
   * Booking the month before closing the year makes the December interest land
   * in the year that is being closed.
   */
  step(queue: CommandQueue, sink: CommandOutcomeSink | null): void {
    this.drainCommands(queue, sink);
    updateVehicles(this);
    this.tick++;

    if (this.tick % TICKS_PER_DAY === 0) {
      produceTownCargo(this);
      rollBreakdowns(this);
      expireStaleCargo(this);
    }
    if (this.tick % TICKS_PER_MONTH === 0) {
      bookMonthlyInterest(this.company, this.difficulty);
      bookMonthlyUpkeep(this.company);
      growTowns(this);
      closeMonth(this.company);
    }
    if (this.tick % TICKS_PER_YEAR === 0) {
      closeFinancialYear(this.company);
      ageVehicles(this);
    }
  }

  /**
   * Execute every command scheduled for the current tick without advancing
   * time. Called by `step()`, and separately by the scheduler while the game is
   * paused so that renaming the company or taking a loan works in pause - the
   * command is still stamped and logged for the current tick, so a replay
   * produces exactly the same world.
   */
  drainCommands(queue: CommandQueue, sink: CommandOutcomeSink | null): void {
    let due = queue.shiftDue(this.tick);
    while (due !== null) {
      const outcome = executeCommand(this, due.command);
      if (sink !== null) sink(due, outcome);
      due = queue.shiftDue(this.tick);
    }
  }

  /** Current calendar position. */
  get date(): GameDate {
    return calendarFromTick(this.tick);
  }

  /** Capture the state for serialisation. */
  toData(): WorldStateData {
    return {
      tick: this.tick,
      seed: this.seed,
      difficulty: this.difficulty,
      climate: this.climate,
      mapSize: this.map.size,
      rng: this.rng.getState(),
      company: { ...this.company },
      map: {
        cornerHeight: this.map.cornerHeight,
        terrain: this.map.terrain,
        roadBits: this.map.roadBits,
        trackBits: this.map.trackBits,
        railType: this.map.railType,
        signal: this.map.signal,
        structure: this.map.structure,
        structureHeight: this.map.structureHeight,
        townId: bytesOf(this.map.townId),
        industryId: bytesOf(this.map.industryId),
        buildingKind: this.map.buildingKind,
        buildingLevel: this.map.buildingLevel,
      },
      towns: this.towns.map((town) => ({ ...town })),
      industries: this.industries.map((industry) => ({ ...industry })),
      stations: encodeStations(this.stations),
      vehicles: encodeVehicles(this.vehicles),
    };
  }

  /** Rebuild a world from a captured state, without regenerating the map. */
  static fromData(data: WorldStateData): World {
    const map = new TileMap(data.mapSize);
    map.cornerHeight.set(data.map.cornerHeight);
    map.terrain.set(data.map.terrain);
    map.roadBits.set(data.map.roadBits);
    map.trackBits.set(data.map.trackBits);
    map.railType.set(data.map.railType);
    map.signal.set(data.map.signal);
    map.structure.set(data.map.structure);
    map.structureHeight.set(data.map.structureHeight);
    map.buildingKind.set(data.map.buildingKind);
    map.buildingLevel.set(data.map.buildingLevel);
    map.townId.set(new Int16Array(data.map.townId.slice().buffer));
    map.industryId.set(new Int16Array(data.map.industryId.slice().buffer));

    // Derived layers are cheaper to recompute than to store and cannot go stale
    // this way.
    markOcean(map);
    computeLandmasses(map);

    const world = new World(
      {
        seed: data.seed,
        difficulty: data.difficulty,
        climate: data.climate,
        mapSize: data.mapSize,
        companyName: data.company.name,
        companyColorIndex: data.company.colorIndex,
      },
      { map, towns: data.towns, industries: data.industries, seedUsed: data.seed },
    );

    world.tick = data.tick;
    world.rng.setState(data.rng);
    world.stations.push(...data.stations);
    world.vehicles = buildVehicleStore(data.vehicles);
    rebuildReservations(world);
    world.company.cashCt = data.company.cashCt;
    world.company.loanCt = data.company.loanCt;
    world.company.profitThisYearCt = data.company.profitThisYearCt;
    world.company.lastYearProfitCt = data.company.lastYearProfitCt;
    world.company.fixedAssetsCt = data.company.fixedAssetsCt;
    world.company.revenueThisMonthCt = data.company.revenueThisMonthCt;
    world.company.expensesThisMonthCt = data.company.expensesThisMonthCt;
    world.company.upkeepPerYearCt = data.company.upkeepPerYearCt;
    return world;
  }
}

/**
 * Rebuild the reservation table from what the trains say they hold.
 *
 * The table is a pure function of the two saved indices and the saved route, so
 * it is recomputed on load rather than stored - the treatment `landmassId` and
 * `oceanMask` already get. Two trains claiming one tile is not a state the
 * simulation can produce, so meeting it here means the file is corrupt and
 * saying so is better than starting a world with an invisible deadlock in it.
 */
function rebuildReservations(world: World): void {
  world.reservations.reset();
  const vehicles = world.vehicles;

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1) continue;
    const to = vehicles.reservedToIndex[id]!;
    if (to < 0) continue;

    const path = vehicles.paths[id]!;
    for (let index = vehicles.reservedFromIndex[id]!; index <= to; index++) {
      const tile = path[index]!;
      const owner = world.reservations.ownerOf(tile);
      if (owner !== -1 && owner !== id) {
        throw new SaveFormatError(
          `save.state.vehicles: tile ${tile} is claimed by both vehicle ${owner} and ${id}`,
        );
      }
      world.reservations.set(tile, id);
    }
  }
}

/** Calendar position for a tick count. Months and days are zero based. */
export function calendarFromTick(tick: number): GameDate {
  const totalDays = (tick / TICKS_PER_DAY) | 0;
  const dayOfYear = totalDays % DAYS_PER_YEAR;
  return {
    year: START_YEAR + ((totalDays / DAYS_PER_YEAR) | 0),
    month: (dayOfYear / DAYS_PER_MONTH) | 0,
    day: dayOfYear % DAYS_PER_MONTH,
  };
}

/** Fields that change every tick, hashed by both the full and the live digest. */
function hashDynamicState(h: Fnv1a64, world: World): void {
  h.u32(world.tick);
  h.u32(world.seed);
  h.u32(world.difficulty);
  h.u32(world.climate);

  const rng = world.rng.getState();
  h.u32(rng[0]).u32(rng[1]).u32(rng[2]).u32(rng[3]);

  const c = world.company;
  h.u32(c.name.length).str(c.name);
  h.u32(c.colorIndex);
  h.int(c.cashCt);
  h.int(c.loanCt);
  h.int(c.profitThisYearCt);
  h.int(c.lastYearProfitCt);
  h.int(c.fixedAssetsCt);

  h.u32(world.towns.length);
  for (let i = 0; i < world.towns.length; i++) {
    const town = world.towns[i]!;
    h.u32(town.x).u32(town.y).u32(town.sizeClass).int(town.population).u32(town.radius);
    h.u32(town.name.length).str(town.name);
  }

  h.u32(world.industries.length);
  for (let i = 0; i < world.industries.length; i++) {
    const industry = world.industries[i]!;
    h.u32(industry.type).u32(industry.x).u32(industry.y).u32(industry.landmassId);
  }

  h.u32(world.stations.length);
  for (let i = 0; i < world.stations.length; i++) {
    const station = world.stations[i]!;
    h.u32(station.x).u32(station.y).u32(station.townId).u32(station.buildingsCovered);
    h.u32(station.servedReliability).f64(station.overflowUnits);
    h.u32(station.modules.length);
    for (const module of station.modules) h.u32(module.kind).u32(module.tileIndex);
    h.u32(station.waiting.length);
    for (const stack of station.waiting) {
      h.u32(stack.cargo).f64(stack.amount).f64(stack.createdTick);
      h.f64(stack.paidFromX).f64(stack.paidFromY);
    }
    h.u32(station.visitTicks.length);
    for (const tick of station.visitTicks) h.u32(tick);
  }

  const vehicles = world.vehicles;
  h.u32(vehicles.count);
  for (let id = 0; id < vehicles.count; id++) {
    h.u32(vehicles.alive[id]!);
    if (vehicles.alive[id] !== 1) continue;
    h.u32(vehicles.specId[id]!).u32(vehicles.state[id]!).u32(vehicles.tileIndex[id]!);
    h.f64(vehicles.progressM[id]!).f64(vehicles.speedMs[id]!);
    h.f64(vehicles.routeRemainingM[id]!);
    h.int(vehicles.reservedFromIndex[id]!).int(vehicles.reservedToIndex[id]!);
    h.u32(vehicles.consist[id]!.length);
    for (const unit of vehicles.consist[id]!) h.u32(unit);
    h.u32(vehicles.pathIndex[id]!).u32(vehicles.pathLength[id]!);
    h.u32(vehicles.orderIndex[id]!).u32(vehicles.reliability[id]!);
    h.u32(vehicles.breakdownTicks[id]!).f64(vehicles.loadTicks[id]!);
    h.f64(vehicles.earnedCt[id]!);
    for (const stack of vehicles.cargo[id]!) {
      h.u32(stack.cargo).f64(stack.amount).f64(stack.createdTick);
      h.f64(stack.paidFromX).f64(stack.paidFromY);
    }
  }
}

/**
 * 64 bit fingerprint of the complete simulation state, tile layers included.
 *
 * This is the digest the determinism suite compares. Adding state means adding
 * it here, otherwise the test silently stops covering it.
 */
export function hashWorld(world: World): string {
  const h = new Fnv1a64();
  hashDynamicState(h, world);

  const map = world.map;
  h.u32(map.size);
  h.intArray(map.cornerHeight);
  h.intArray(map.terrain);
  h.intArray(map.roadBits);
  h.intArray(map.trackBits);
  h.intArray(map.railType);
  h.intArray(map.signal);
  h.intArray(map.structure);
  h.intArray(map.structureHeight);
  h.intArray(map.townId);
  h.intArray(map.industryId);
  h.intArray(map.buildingKind);
  h.intArray(map.buildingLevel);

  return h.digest();
}

/**
 * Cheap digest for the F3 overlay: everything except the tile layers.
 *
 * Hashing nine megabytes of map every game day would cost more than the whole
 * simulation. The full digest above stays the authority; this one only has to
 * change when something the player can see changes.
 */
export function hashWorldLive(world: World): string {
  const h = new Fnv1a64();
  hashDynamicState(h, world);
  return h.digest();
}
