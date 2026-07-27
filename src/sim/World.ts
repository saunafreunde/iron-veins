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
import { bookMonthlyInterest, closeFinancialYear, createCompany } from './economy/company';
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
}

/** The tile layers, as raw bytes. Derived layers are recomputed on load. */
export interface TileMapData {
  cornerHeight: Uint8Array;
  terrain: Uint8Array;
  roadBits: Uint8Array;
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

  private constructor(params: NewGameParams, generated: GeneratedWorld) {
    this.seed = params.seed | 0;
    this.difficulty = params.difficulty;
    this.climate = params.climate;
    this.rng = Rng.fromSeed(gameplaySeed(this.seed));
    this.company = createCompany(params.companyName, params.companyColorIndex, params.difficulty);
    this.map = generated.map;
    this.towns = generated.towns;
    this.industries = generated.industries;
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
    this.tick++;

    if (this.tick % TICKS_PER_MONTH === 0) {
      bookMonthlyInterest(this.company, this.difficulty);
    }
    if (this.tick % TICKS_PER_YEAR === 0) {
      closeFinancialYear(this.company);
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
        townId: bytesOf(this.map.townId),
        industryId: bytesOf(this.map.industryId),
        buildingKind: this.map.buildingKind,
        buildingLevel: this.map.buildingLevel,
      },
      towns: this.towns.map((town) => ({ ...town })),
      industries: this.industries.map((industry) => ({ ...industry })),
    };
  }

  /** Rebuild a world from a captured state, without regenerating the map. */
  static fromData(data: WorldStateData): World {
    const map = new TileMap(data.mapSize);
    map.cornerHeight.set(data.map.cornerHeight);
    map.terrain.set(data.map.terrain);
    map.roadBits.set(data.map.roadBits);
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
    world.company.cashCt = data.company.cashCt;
    world.company.loanCt = data.company.loanCt;
    world.company.profitThisYearCt = data.company.profitThisYearCt;
    world.company.lastYearProfitCt = data.company.lastYearProfitCt;
    world.company.fixedAssetsCt = data.company.fixedAssetsCt;
    return world;
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
