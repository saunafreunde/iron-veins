import { executeCommand } from './commands/execute';
import type { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  CO2_LEVY_FROM_YEAR,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  MAX_COMPANIES,
  ROAD_CONGESTION_EPOCH_TICKS,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  WeatherRule,
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
import { createAiCompanies } from './company/roster';
import { LinkGraph, type CargoLinkSave } from './cargo/linkGraph';
import { refreshCargoRouting } from './cargo/routing';
import { NewsCategory, NewsLog, NewsSeverity, type NewsEntry } from './news/log';
import { reportNews } from './news/report';
import { reviewBankruptcy } from './economy/bankruptcy';
import { bookDepreciation } from './economy/depreciation';
import { bookMonthlyEmissions, closeEmissionsYear } from './economy/emissions';
import { bookMonthlyEnergy } from './economy/energy';
import { costFactor, inflatedCostCt } from './cargo/payment';
import { RailPathfinder } from './net/railPath';
import { WaterPathfinder } from './net/waterPath';
import { ReservationTable } from './net/reservations';
import { RoadCongestion } from './net/congestion';
import { ThroughputMeter } from './net/throughput';
import { BlockIndex } from './signals/blocks';
import { RoadPathfinder } from './net/roadPath';
import {
  buildLineStore,
  buildStation,
  buildVehicleStore,
  encodeLines,
  encodeStations,
  encodeVehicles,
  type LineSave,
  type StationSave,
  type VehicleSave,
} from './save/entities';
import { LineStore } from './lines/LineStore';
import { buildGoalStore, GoalStore } from './goals/GoalStore';
import { updateGoals } from './goals/evaluate';
import type { GoalSave } from './goals/types';
import { assignStationIndustries } from './industry/catchment';
import { openNewIndustries } from './industry/lifecycle';
import { SaveFormatError } from './save/format';
import { rollStationHistories } from './station/history';
import { generateReturnJourneys, rollStationReturns } from './station/returns';
import type { Station } from './station/types';
import {
  collectIndustryOutput,
  produceIndustryCargo,
  reviewIndustries,
} from './industry/production';
import { updateAi } from './ai/ai';
import { createAiStates } from './ai/roster';
import type { AiState } from './ai/types';
import { reviewContracts, type Contract } from './economy/contracts';
import { reviewCouncils } from './town/council';
import { growTownFabric } from './town/growth';
import { growTowns, produceTownCargo } from './town/update';
import {
  ageVehicles,
  expireStaleCargo,
  fleetUpkeepCtPerYear,
  rollBreakdowns,
} from './vehicles/lifecycle';
import { renewFleet } from './vehicles/renewal';
import { updateVehicles } from './vehicles/update';
import { VehicleStore } from './vehicles/VehicleStore';
import { Fnv1a64 } from './hash';
import type { Industry } from './industry/types';
import { TileMap } from './map/TileMap';
import { isLegalMapSize, mapSizeRefusal } from './map/size';
import { computeLandmasses, markOcean } from './mapgen/hydrology';
import { generateMap, type GeneratedWorld, type MapGenProgress } from './mapgen';
import { Rng, streamSalt } from './rng';
import { WeatherField } from './weather/field';
import { updateWeather } from './weather/update';
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
  inflation: boolean;
  emissions: boolean;
  /** The two 8.4 route-cost rules of M15. Saved and hashed like inflation. */
  occupancyPenalty: boolean;
  signalPenalty: boolean;
  /** The 8.4 road traffic rules of M15 (congestion, speed cap, crossings). */
  roadCongestion: boolean;
  /** The weather world rule of SPEC2 M18 (E-01): off, mild or harsh. */
  weather: WeatherRule;
  /** The 16x16 weather field, one WeatherCell per region (SPEC2 M18). */
  weatherField: Uint8Array;
  mapSize: number;
  rng: RngState;
  /** Every company, player first. */
  companies: CompanyState[];
  map: TileMapData;
  towns: Town[];
  industries: Industry[];
  /** Save shape, not the live one: the M14 ring travels as plain numbers. */
  stations: StationSave[];
  vehicles: VehicleSave[];
  /** The lines of section 12.2 (M11): shared order lists, saved and hashed. */
  lines: LineSave[];
  /** The goals of SPEC2 M17, descriptors and verdicts alike. */
  goals: GoalSave[];
  /** Measured travel times between stations; the connection table of 7.4. */
  cargoLinks: CargoLinkSave[];
  /** The news log, oldest first. */
  news: NewsEntry[];
  /** Tenders, open and recently settled (section 14.4). */
  contracts: Contract[];
  nextContractId: number;
  /** The AI competitors and what they have built (section 15). */
  ai: AiState[];
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
  /** Which company built what stands on each tile, or TILE_PUBLIC. */
  owner: Uint8Array;
  /** Waypoint marker per tile, see map/waypoints.ts (M11, section 12.1). */
  waypoint: Uint8Array;
  /**
   * Road traffic per tile, the congestion layer of SPEC.md 8.4 (M15).
   *
   * The one tile layer here that is NOT a description of what was built: it is
   * history, and it is saved for exactly that reason (SPEC2 Z4, E-02). See
   * TileMap.congestion.
   */
  congestion: Uint8Array;
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
  /** Whether costs and fares drift upward over the century (section 14.2). */
  readonly inflation: boolean;
  /** Whether the carbon levy and its grants of section 14.3 apply. */
  readonly emissions: boolean;
  /**
   * Whether `railPath` charges for a section another train has claimed - the
   * occupancy term of SPEC.md 8.4 (SPEC2 M15). Off unless the world was
   * started with it, which is what keeps every pre-M15 seed on the route it
   * always drove.
   */
  readonly occupancyPenalty: boolean;
  /** Whether `railPath` charges a small penalty for passing a signal. */
  readonly signalPenalty: boolean;
  /**
   * Whether road traffic is recorded and priced: the congestion layer of
   * SPEC.md 8.4 with the road A* term, the speed cap and the level crossings
   * E-03 packages with it (SPEC2 M15). Off unless the world was started with
   * it - a world with it off records nothing at all, so the layer stays zero
   * and the roads behave exactly as they did before M15.
   */
  readonly roadCongestion: boolean;
  /**
   * Whether this world has weather at all, and how hard (SPEC2 E-01, M18).
   *
   * A world rule in the full Z2 sense - saved, hashed, migrated, fixed at
   * genesis - because weather reaches money and physics: it is looked up as a
   * multiplier at the existing seams of the longitudinal solver, the breakdown
   * threshold and cargo decay. Off unless the world was started with it, which
   * is what keeps every band measured before M18 exactly where it was
   * (Fehlerkatalog 34), and with it off `updateWeather` returns on its first
   * line so the field stays all-clear for ever.
   */
  readonly weather: WeatherRule;
  /**
   * What the sky is doing over each of the 16x16 regions (SPEC2 M18).
   *
   * Saved and hashed like any other simulation state, preallocated at world
   * creation (law #7), and advanced once per game day from the named weather
   * stream (Z3). The renderer sees it only through the snapshot block.
   */
  readonly weatherField = new WeatherField();
  readonly rng: Rng;
  /**
   * Every company in the game, index = id. Zero is the player, 1..n are the
   * AI competitors of section 15.
   */
  readonly companies: CompanyState[] = [];
  /**
   * Whose command is being executed, or whose hook is running.
   *
   * Every build command charges `world.company`, and with more than one company
   * that has to mean the one ISSUING the command rather than the player. The
   * alternative - an extra parameter on all twenty-odd build functions - says
   * the same thing at every call site instead of once here (DECISIONS.md
   * D-100). Set from the command envelope for the length of one command, and
   * by the monthly hooks around anything they do on a company's behalf.
   */
  actingCompanyId = 0;
  /**
   * One number per company, for passes that meter every company at once.
   * Preallocated because the monthly hooks must not allocate either.
   */
  readonly companyScratch = new Float64Array(MAX_COMPANIES);
  readonly map: TileMap;
  readonly towns: Town[];
  readonly industries: Industry[];
  readonly stations: Station[] = [];
  /** Replaced wholesale when a save is loaded, hence not readonly. */
  vehicles = new VehicleStore();
  /**
   * The lines of section 12.2 (M11) - the ONE line entity of the game
   * (SPEC2 E-06): the player's and every competitor's lines live here alike.
   * Replaced wholesale when a save is loaded, exactly like the vehicles.
   */
  lines = new LineStore();
  /**
   * What this world asks of the player, and what the simulation has decided
   * about it (SPEC2 M17).
   *
   * Descriptors AND verdicts are saved and hashed, which is what makes a medal
   * reproducible from a seed and a command log - the departure from D-113's
   * watch-only tutorial that the milestone exists to make (D-193). Replaced
   * wholesale on load, like the vehicles and the lines.
   */
  goals = new GoalStore();
  readonly roadPathfinder: RoadPathfinder;
  readonly railPathfinder: RailPathfinder;
  /**
   * A* over water for ships. Plain A* rather than the flow field of 8.4 - see
   * DECISIONS.md D-094 for why the optimisation is not worth its correctness
   * cost until ship counts demand it.
   */
  readonly waterPathfinder: WaterPathfinder;
  /**
   * Which train holds which piece of track. Derived from the per-vehicle
   * reservation indices plus each train's saved route, so it is never
   * serialised and never hashed - it is rebuilt on load, exactly as the land
   * masses and the ocean mask are.
   */
  readonly reservations: ReservationTable;
  /**
   * Which tiles form which signal block. Derived from the track and signal
   * layers, rebuilt whenever the map revision moves, never serialised.
   */
  readonly blocks: BlockIndex;
  /**
   * Which road tiles currently carry traffic, so the decay of SPEC.md 8.4's
   * congestion window is a walk over those tiles rather than over the map
   * (SPEC2 E-02). The COUNTS live in the saved tile layer; this list is a pure
   * function of it and is rebuilt on load, like the reservation table.
   */
  readonly congestion = new RoadCongestion();
  /**
   * Which track tiles have carried how many trains this game month - the
   * per-block throughput counters of SPEC2 M15, feeding the utilisation heat
   * map and NOTHING ELSE.
   *
   * Derived in the full sense: the counts live in a tile layer that is never
   * saved and never hashed, the meter starts empty in a loaded world, and no
   * simulation decision reads either (`tests/unit/throughput.spec.ts` walks
   * `src/sim` and fails the day one does). That is what keeps it out of Z4's
   * save requirement - the exception for purely reading overlays (D-054's
   * ReservationTable pattern, D-186).
   */
  readonly throughput = new ThroughputMeter();
  /**
   * How long cargo takes to get from any station to any other, measured from
   * the trips the fleet actually made (section 7.4).
   *
   * The measurements are real state and are saved and hashed; which legs are
   * currently served, and the all-pairs table built from them, are derived.
   */
  readonly cargoLinks = new LinkGraph();
  /**
   * What the game has told the player (section 17.1).
   *
   * Every warning clock in the simulation - the deadlock timer of 9.3, the
   * industry closure count of 7.3, the solvency months of 14.2 - has existed
   * since its own milestone and surfaced nowhere. This is where they all end
   * up, and it is why they were worth recording.
   */
  readonly news = new NewsLog();

  /**
   * The open tenders of section 14.4, plus the ones settled recently enough
   * that the panel still has something to say about them.
   */
  contracts: Contract[] = [];
  /**
   * One entry per AI competitor (section 15). Empty in a single company game,
   * which is what makes the whole subsystem cost nothing when it is not used.
   */
  ai: AiState[] = [];
  /**
   * Next contract id. Monotonic and never reused: the id is what a command
   * refers to, and reusing one would let a stale click accept a contract the
   * player never saw.
   */
  nextContractId = 0;

  /** The company the local player controls. */
  readonly playerCompanyId = 0;

  /**
   * The company currently acting. Inside a command that is whoever issued it;
   * everywhere else it is the player, because that is who `actingCompanyId`
   * rests at.
   */
  get company(): CompanyState {
    return this.companies[this.actingCompanyId] ?? this.companies[0]!;
  }

  /** The local player's books, whoever happens to be acting. */
  get playerCompany(): CompanyState {
    return this.companies[this.playerCompanyId]!;
  }

  /** One company by id, falling back to the player for an unknown id. */
  companyOf(id: number): CompanyState {
    return this.companies[id] ?? this.companies[0]!;
  }

  /**
   * An independent RNG stream derived from the world seed and `salt`
   * (DECISIONS.md D-106, formalised as an API per SPEC2 Z3 / D-128).
   *
   * Every stochastic system OUTSIDE the pre-existing gameplay draws takes its
   * randomness from here. A derived stream needs no saved state - the seed is
   * saved and the salt is the caller's to reproduce - and however many numbers
   * it draws, the shared gameplay stream `world.rng` sees exactly the sequence
   * it saw before the system existed. That is the whole point: sharing one
   * stream makes every balancing figure a hostage to the next feature.
   *
   * A periodic hook passes something that varies per invocation - the tender
   * review passes the tick; a system seeded once passes its name. A NUMERIC
   * salt is folded in exactly as D-106 folded the tick, which keeps the
   * contract stream's draw sequences bit-identical to every save and replay
   * recorded before this method existed. A STRING salt goes through
   * `streamSalt` first.
   *
   * Allocates a generator, so it is for hooks and commands, never for the
   * per-tick hot path (law #7). Takt and renewal arithmetic draw NO
   * randomness at all, not even a named stream (D-093 precedent).
   */
  streamFor(salt: number | string): Rng {
    const folded = typeof salt === 'number' ? salt | 0 : streamSalt(salt);
    return Rng.fromSeed((this.seed + folded) | 0);
  }

  /**
   * The one refusal, in the one sentence, wherever a size arrives (D-197,
   * D-198).
   *
   * It is applied twice on purpose. The constructor is the single door every
   * World passes through, so it is what makes the rule unavoidable; but by
   * then `create` has already GENERATED a map, and mapgen fails on its own
   * terms first - `World.create({ mapSize: 32 })` used to die with "No
   * playable map found for seed 7 after 20 attempts", which is a true sentence
   * about the wrong subject. So `create` asks the same question about the size
   * it was handed before it spends anything on it.
   */
  private static refuseIllegalMapSize(size: number): void {
    if (!isLegalMapSize(size)) {
      throw new Error(`World: mapSize ${mapSizeRefusal(size)}`);
    }
  }

  private constructor(params: NewGameParams, generated: GeneratedWorld) {
    // The ONE door into a World, so the ONE place the map-size rule is applied
    // at creation - and it is the parser's own rule, imported rather than
    // copied (D-197). A world the save format cannot read is a world that can
    // be played for an hour and then never saved, checkpointed or replayed,
    // and the failure would arrive at the save with nothing to say about where
    // it came from.
    World.refuseIllegalMapSize(generated.map.size);
    this.seed = params.seed | 0;
    this.difficulty = params.difficulty;
    this.climate = params.climate;
    this.inflation = params.inflation ?? true;
    this.emissions = params.emissions ?? true;
    // Absent means OFF for both 8.4 rules - see NewGameParams for why the
    // asymmetry with inflation and emissions is deliberate.
    this.occupancyPenalty = params.occupancyPenalty ?? false;
    this.signalPenalty = params.signalPenalty ?? false;
    this.roadCongestion = params.roadCongestion ?? false;
    // Absent means OFF here too, and for the same reason (SPEC2 M18, E-01):
    // every world recorded before M18 was played without weather.
    this.weather = params.weather ?? WeatherRule.Off;
    this.rng = Rng.fromSeed(gameplaySeed(this.seed));
    this.companies.push(
      createCompany(0, params.companyName, params.companyColorIndex, params.difficulty),
    );
    this.companies.push(
      ...createAiCompanies(
        params.aiCompanies ?? 0,
        params.companyColorIndex,
        params.difficulty,
        this.rng,
      ),
    );
    this.ai = createAiStates(this.companies.length, this.rng);
    // Goals are a world rule like inflation (Z2): fixed when the world is
    // created, saved, hashed, and never editable afterwards. Absent means
    // none, which is every game started before M17.
    const goals = params.goals;
    if (goals !== undefined) {
      for (let i = 0; i < goals.length; i++) this.goals.add(goals[i]!);
    }
    this.map = generated.map;
    this.towns = generated.towns;
    this.industries = generated.industries;
    this.roadPathfinder = new RoadPathfinder(generated.map.tileCount);
    this.railPathfinder = new RailPathfinder(generated.map.tileCount);
    this.waterPathfinder = new WaterPathfinder(generated.map.tileCount);
    this.reservations = new ReservationTable(generated.map.tileCount);
    this.blocks = new BlockIndex(generated.map.tileCount);
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
    // Before mapgen, not after it: an illegal size must be refused BY the size
    // rule rather than by whatever mapgen happens to fail at first (D-198).
    World.refuseIllegalMapSize(params.mapSize);
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
    // Before the vehicles move, so the traffic a route is priced against is
    // the window that ended with the last tick rather than a half-decayed
    // one. Only on the epoch boundary, and only over the tiles that carry
    // something - never a scan of the map (SPEC2 E-02).
    if (this.roadCongestion && this.tick % ROAD_CONGESTION_EPOCH_TICKS === 0) {
      this.congestion.decay(this.map.congestion);
    }
    updateVehicles(this);
    // After the commands of this tick have run and before the clock moves, so
    // what a competitor sees is the world as it stands and what it orders runs
    // at the very next tick.
    this.runAi(queue);
    this.tick++;

    if (this.tick % TICKS_PER_DAY === 0) {
      // First of the daily pass: everything below may look the weather up as a
      // multiplier, and what it must find is the sky of the day it is playing
      // rather than yesterday's. A world with the rule off returns from this
      // on its first line and pays nothing (SPEC2 M18, E-01).
      updateWeather(this);
      // Before anything is produced: cargo made today needs somewhere to go,
      // and that answer comes out of the connections the fleet is running now.
      refreshCargoRouting(this);
      produceTownCargo(this);
      // The other half of a town's passenger business (SPEC2 M19): travellers
      // who arrived somewhere going home again. Immediately after the town's
      // own production and at the same daily cadence, because the two are the
      // outbound and the inbound leg of the same trade - and it reads the
      // running mean of the months that ENDED, so the order within the day
      // cannot influence what it emits.
      generateReturnJourneys(this);
      // Collection is daily, production is monthly (section 7.3). A month's
      // output appearing on the platform in one tick would sit there ageing
      // for four weeks; the yard hands it over a day at a time instead.
      collectIndustryOutput(this);
      rollBreakdowns(this);
      expireStaleCargo(this);
      // The goal machine of SPEC2 M17, judged on the day that has just been
      // played: after the cargo routing above, so ConnectStations reads
      // today's connection table rather than yesterday's, and after the
      // deliveries, so a goal about tonnage sees them. Allocation-free
      // (goals/evaluate.ts) and skipped entirely by a world with no goals.
      updateGoals(this);
      // The physical half of section 13.2 (SPEC2 M20, E-10): ONE town a day,
      // round robin, so that 140 towns never search for a plot in the same
      // tick (Fehlerkatalog 32). It runs after the goals - a goal about a
      // town's population reads a figure the MONTHLY hook moved, never a house
      // this pass has just put up - and before the news, so a later bundle's
      // growth milestone is reported on the day it happened.
      growTownFabric(this);
      // Last of the daily pass, so what it reports is the state the day ended
      // in rather than a half-updated one.
      reportNews(this);
    }
    if (this.tick % TICKS_PER_MONTH === 0) {
      for (let index = 0; index < this.companies.length; index++) {
        const company = this.companies[index]!;
        bookMonthlyInterest(company, this.difficulty);
        // Upkeep and energy are costs like any other and inflate with the rest
        // of the economy; the fares they are set against have done so since M2.
        bookMonthlyUpkeep(company, this.costFactor);
        bookDepreciation(this, company);
      }
      // Emissions first: both read the same work accumulators and the energy
      // pass is the one that clears them.
      bookMonthlyEmissions(this);
      // Every company's meter in one pass - reading an accumulator empties it.
      bookMonthlyEnergy(this);
      // Judge the month that has just ended, THEN make the next month's
      // output. The other way round would compare this month's production
      // against last month's collection, and every industry would look badly
      // served for ever. Before growTowns, which owns the convention that the
      // monthly counters are reset by whoever read them.
      reviewIndustries(this);
      produceIndustryCargo(this);
      // Before growTowns, which clears the traffic counters the rating reads.
      reviewCouncils(this);
      growTowns(this);
      // Close the month on every station's cargo-history ring (SPEC2 M14):
      // the day's collections above already landed in the month being closed.
      rollStationHistories(this);
      // And the return-journey mean of SPEC2 M19, on the same boundary and for
      // the same reason: the day's arrivals and offers above landed in the
      // month being closed. D-079's correction lives in the roll.
      rollStationReturns(this);
      // And empty the throughput meter for the month that starts now - the
      // D-091 posture, one instrument further: a meter is cleared by the
      // calendar, and the walk is the list of tiles that carry something,
      // never the map. Nothing in the simulation reads it, so where in the
      // monthly block this sits cannot influence anything (D-186).
      this.throughput.clearMonth(this.map.throughput);
      for (let index = 0; index < this.companies.length; index++) {
        closeMonth(this.companies[index]!);
      }
      reviewContracts(this);
      // Last, so the month it judges is the one that has just been booked.
      for (let index = 0; index < this.companies.length; index++) {
        reviewBankruptcy(this, this.companies[index]!);
      }
    }
    if (this.tick % TICKS_PER_YEAR === 0) {
      // Only the player's result is news. A competitor's books are not
      // something the player is shown, and five year-end lines a year from
      // companies whose finances are private would bury everything else.
      this.news.post({
        tick: this.tick,
        category: NewsCategory.Finance,
        severity:
          this.playerCompany.lastYearProfitCt < 0 ? NewsSeverity.Warning : NewsSeverity.Info,
        messageKey: 'news.yearClosed',
        params: { year: this.date.year - 1, profitCt: this.playerCompany.profitThisYearCt },
        tileIndex: -1,
      });
      if (this.emissions && this.date.year === CO2_LEVY_FROM_YEAR) {
        this.news.post({
          tick: this.tick,
          category: NewsCategory.Finance,
          severity: NewsSeverity.Warning,
          messageKey: 'news.carbonLevy',
          params: { year: CO2_LEVY_FROM_YEAR },
          tileIndex: -1,
        });
      }
      ageVehicles(this);
      for (let index = 0; index < this.companies.length; index++) {
        const company = this.companies[index]!;
        closeFinancialYear(company);
        closeEmissionsYear(company);
        // After ageing, so a vehicle that has just passed its design life is
        // charged the doubled upkeep from the year it becomes obsolete.
        // Renew before the fleet's upkeep is totalled, so a company that just
        // replaced its vehicles is charged for the new ones and not the old.
        this.actingCompanyId = company.id;
        renewFleet(this, company);
        this.actingCompanyId = this.playerCompanyId;
        company.vehicleUpkeepPerYearCt = fleetUpkeepCtPerYear(this, company.id);
      }
      // One new works a year, by preference where nothing is served yet.
      openNewIndustries(this);
    }
  }

  /**
   * Execute every command scheduled for the current tick without advancing
   * time. Called by `step()`, and separately by the scheduler while the game is
   * paused so that renaming the company or taking a loan works in pause - the
   * command is still stamped and logged for the current tick, so a replay
   * produces exactly the same world.
   */
  /**
   * Let the AI competitors of section 15 think.
   *
   * Called from `step`, and given the QUEUE: everything a competitor does it
   * does by enqueueing an ordinary command for the next tick. That is what
   * makes an AI build indistinguishable from a player's - same prices, same
   * refusals, and all of it in the replay log.
   */
  private runAi(queue: CommandQueue): void {
    if (this.ai.length === 0) return;
    updateAi(this, queue);
  }

  drainCommands(queue: CommandQueue, sink: CommandOutcomeSink | null): void {
    let due = queue.shiftDue(this.tick);
    while (due !== null) {
      // The envelope says who is acting, which is what lets an AI company use
      // the very same commands the player does (section 15).
      this.actingCompanyId = due.companyId;
      const outcome = executeCommand(this, due.command);
      this.actingCompanyId = this.playerCompanyId;
      if (sink !== null) sink(due, outcome);
      due = queue.shiftDue(this.tick);
    }
  }

  /**
   * A cost at this year's price level (section 14.2).
   *
   * Every command that charges for something goes through this rather than
   * using the constant directly, so that inflation is on both sides of the
   * books at once.
   */
  costCt(baseCt: number): number {
    return inflatedCostCt(baseCt, this.date.year, this.inflation);
  }

  /** This year's price level for costs, 1 when inflation is off. */
  get costFactor(): number {
    return costFactor(this.date.year, this.inflation);
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
      inflation: this.inflation,
      emissions: this.emissions,
      occupancyPenalty: this.occupancyPenalty,
      signalPenalty: this.signalPenalty,
      roadCongestion: this.roadCongestion,
      weather: this.weather,
      weatherField: this.weatherField.cells,
      mapSize: this.map.size,
      rng: this.rng.getState(),
      companies: this.companies.map((company) => ({ ...company })),
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
        owner: this.map.owner,
        waypoint: this.map.waypoint,
        congestion: this.map.congestion,
      },
      towns: this.towns.map((town) => ({ ...town })),
      industries: this.industries.map((industry) => ({ ...industry })),
      stations: encodeStations(this.stations),
      vehicles: encodeVehicles(this.vehicles),
      lines: encodeLines(this.lines),
      goals: this.goals.toData(),
      cargoLinks: this.cargoLinks.toData(),
      news: this.news.toData(),
      contracts: this.contracts.map((contract) => ({
        ...contract,
        acceptedBy: [...contract.acceptedBy],
        progress: [...contract.progress],
      })),
      nextContractId: this.nextContractId,
      ai: this.ai.map((state) => ({
        ...state,
        reviews: state.reviews.map((review) => ({ ...review })),
        project: state.project === null ? null : { ...state.project },
      })),
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
    map.owner.set(data.map.owner);
    map.waypoint.set(data.map.waypoint);
    map.congestion.set(data.map.congestion);
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
        inflation: data.inflation,
        emissions: data.emissions,
        occupancyPenalty: data.occupancyPenalty,
        signalPenalty: data.signalPenalty,
        roadCongestion: data.roadCongestion,
        weather: data.weather,
        mapSize: data.mapSize,
        companyName: data.companies[0]!.name,
        companyColorIndex: data.companies[0]!.colorIndex,
      },
      { map, towns: data.towns, industries: data.industries, seedUsed: data.seed },
    );

    world.tick = data.tick;
    world.rng.setState(data.rng);
    // The sky the save was written under. Not derived and not re-drawn: a
    // field rebuilt from the rule alone would give a loaded world different
    // weather from the one that was saved, which is law #3 broken in the same
    // silence the congestion layer of D-185 was kept out of.
    world.weatherField.load(data.weatherField);
    world.stations.push(...data.stations.map(buildStation));
    // What a station serves and accepts is derived from the map, so it is
    // worked out again here rather than trusted from the file.
    for (const station of world.stations) assignStationIndustries(world, station);
    world.vehicles = buildVehicleStore(data.vehicles);
    world.lines = buildLineStore(data.lines);
    // Descriptors preallocated at load, verdict and all: what the file says
    // this world asked for and how far the player got (SPEC2 M17).
    world.goals = buildGoalStore(data.goals);
    world.cargoLinks.loadData(data.cargoLinks);
    world.news.loadData(data.news);
    world.contracts = data.contracts.map((contract) => ({
      ...contract,
      acceptedBy: [...contract.acceptedBy],
      progress: [...contract.progress],
    }));
    world.nextContractId = data.nextContractId;
    world.ai = data.ai.map((state) => ({
      ...state,
      reviews: state.reviews.map((review) => ({ ...review })),
      project: state.project === null ? null : { ...state.project },
    }));
    world.cargoLinks.refreshLinks(world);
    rebuildReservations(world);
    // The dirty list of the congestion layer, exactly as derived as the
    // reservation table above: the layer came out of the file, the list of
    // which tiles it touches is worked out again from it.
    world.congestion.rebuild(map.congestion);
    // The constructor built the player from the parameters and the AI roster
    // from the RNG; the file says who they really are.
    world.companies.length = 0;
    for (const saved of data.companies) world.companies.push({ ...saved });
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
  h.u32(world.inflation ? 1 : 0);
  h.u32(world.emissions ? 1 : 0);
  // The two 8.4 route-cost rules of M15. Hashed UNCONDITIONALLY, false
  // included: a rule that only entered the digest when it was on would let
  // two worlds that route differently fingerprint alike, which is the whole
  // failure Z2 exists to prevent. The price is that adding them moved every
  // world hash once - re-recorded under the D-137/D-130 protocols.
  h.u32(world.occupancyPenalty ? 1 : 0);
  h.u32(world.signalPenalty ? 1 : 0);
  // The road traffic rule of the same milestone, hashed on the same terms.
  h.u32(world.roadCongestion ? 1 : 0);
  // The weather rule of M18, hashed unconditionally for exactly the reason
  // above: a world with harsh weather and a world with none must never
  // fingerprint alike. Adding it moved every world hash once, which is the
  // designed-for event with a written protocol (D-137/D-130).
  h.u32(world.weather);
  // And the field itself, in the LIVE digest as well as the full one. Unlike
  // the tile layers and the station rings it is 256 numbers on a daily
  // cadence, which is the same cadence the live digest is taken on - it costs
  // the F3 overlay one day's worth of work to watch the sky it can see change
  // (the goal-block argument of D-193).
  h.intArray(world.weatherField.cells);

  const rng = world.rng.getState();
  h.u32(rng[0]).u32(rng[1]).u32(rng[2]).u32(rng[3]);

  // Every company, not just the player's. A competitor's books are simulation
  // state like any other, and one left out of the digest is one the
  // determinism suite stops watching.
  h.u32(world.companies.length);
  for (let index = 0; index < world.companies.length; index++) {
    const c = world.companies[index]!;
    h.u32(c.id);
    h.u32(c.name.length).str(c.name);
    h.u32(c.colorIndex);
    h.int(c.cashCt);
    h.int(c.loanCt);
    h.int(c.profitThisYearCt);
    h.int(c.lastYearProfitCt);
    h.int(c.fixedAssetsCt);
    h.u32(c.monthsInDebt).u32(c.bankrupt ? 1 : 0);
    h.int(c.vehicleUpkeepPerYearCt).int(c.infrastructureUpkeepPerYearCt);
    h.int(c.revenueThisMonthCt).int(c.expensesThisMonthCt);
    h.int(c.accumulatedDepreciationCt).u32(c.historyCursor);
    h.f64(c.co2ThisYearKg).f64(c.co2LastYearKg);
    // The whole ledger is hashed. It is state the simulation writes every
    // month, and anything left out here silently stops being covered by the
    // determinism suite - which is exactly how a counter drifts for a
    // milestone and nobody notices.
    for (const amount of c.accounts) h.int(amount);
    for (const amount of c.yearAccounts) h.int(amount);
    for (const amount of c.lastYearAccounts) h.int(amount);
    for (const amount of c.monthHistory) h.int(amount);
    h.u32(c.valueHistory.length);
    for (const value of c.valueHistory) h.int(value);
    // Lifetime tonnage per cargo (SPEC2 M17). Saved state, so hashed like
    // every other saved figure (D-134) - and it is what a CargoDeliveredTotal
    // goal reads, so a bent counter is a different medal.
    for (const units of c.cargoDeliveredUnits) h.f64(units);
  }

  h.u32(world.towns.length);
  for (let i = 0; i < world.towns.length; i++) {
    const town = world.towns[i]!;
    // The id is hashed although it should always equal the index: everything
    // on the map refers to a town by id, and a save whose third town calls
    // itself number five must not fingerprint like a healthy one (M10 audit).
    h.u32(town.id);
    h.u32(town.x).u32(town.y).u32(town.sizeClass).int(town.population).u32(town.radius);
    h.f64(town.producedThisMonth).f64(town.transportedThisMonth);
    h.f64(town.goodsDeliveredThisMonth).f64(town.foodDeliveredThisMonth);
    // The month's own road budget (SPEC2 M20): saved history, so hashed like
    // every other saved figure (D-134). Two worlds that differ only in how
    // much street a town has already laid this month will lay it differently
    // next week, and the digest has to be able to tell them apart.
    h.u32(town.roadTilesThisMonth);
    h.u32(town.name.length).str(town.name);
    h.int(town.exclusiveCompanyId).u32(town.exclusiveUntilTick);
    h.u32(town.transportedByCompany.length);
    for (const amount of town.transportedByCompany) h.f64(amount);
    h.u32(town.councilRating.length);
    for (const rating of town.councilRating) h.int(rating);
    h.u32(town.councilGoodwill.length);
    for (const goodwill of town.councilGoodwill) h.f64(goodwill);
    h.u32(town.measureReadyTick.length);
    for (const tick of town.measureReadyTick) h.u32(tick);
  }

  h.u32(world.contracts.length);
  for (let i = 0; i < world.contracts.length; i++) {
    const contract = world.contracts[i]!;
    h.u32(contract.id).u32(contract.cargo).int(contract.townId);
    h.f64(contract.amountUnits).u32(contract.offeredTick).u32(contract.deadlineTick);
    h.int(contract.bonusCt).int(contract.completedBy);
    h.u32(contract.acceptedBy.length);
    for (const companyId of contract.acceptedBy) h.u32(companyId);
    h.u32(contract.progress.length);
    for (const done of contract.progress) h.f64(done);
  }
  h.u32(world.nextContractId);

  // Every competitor's plan is state the simulation writes, so it is hashed
  // like any other. An AI left out of the digest is an AI the determinism
  // suite stops watching, and its builds move the whole world.
  h.u32(world.ai.length);
  for (let i = 0; i < world.ai.length; i++) {
    const state = world.ai[i]!;
    h.u32(state.companyId).u32(state.personality);
    h.u32(state.nextDecisionTick).int(state.lastBuildTick);
    // The lines themselves are world entities and are hashed below with the
    // line store; what an AI keeps is its judgement baseline per line (E-06).
    h.u32(state.reviews.length);
    for (const review of state.reviews) {
      h.u32(review.lineId).u32(review.reviewTick).int(review.earnedAtReviewCt);
    }
    const project = state.project;
    h.u32(project === null ? 0 : 1);
    if (project === null) continue;
    h.u32(project.stage).u32(project.fromX).u32(project.fromY);
    h.u32(project.toX).u32(project.toY).u32(project.depotX).u32(project.depotY);
    h.u32(project.rail ? 1 : 0)
      .u32(project.cargo)
      .u32(project.startedTick);
    h.u32(project.railTrains);
    h.int(project.lineId);
    h.u32(project.specIds.length);
    for (const specId of project.specIds) h.u32(specId);
  }

  // The lines of section 12.2. Only the LIVING lines are fingerprinted, with
  // their ids: a trailing dead slot is behaviourally identical to its absence
  // (the store reuses the lowest dead slot), so hashing it would make a saved
  // and a played world disagree about nothing.
  const lines = world.lines;
  h.u32(lines.livingCount);
  for (let lineId = 0; lineId < lines.count; lineId++) {
    if (lines.alive[lineId] !== 1) continue;
    h.u32(lineId).u32(lines.ownerId[lineId]!).u32(lines.autoRenew[lineId]!);
    // The timetable of 12.3 is line data like the order list: a bent takt is
    // a different departure for every vehicle of the line.
    h.u32(lines.taktTicks[lineId]!).u32(lines.taktOffsetTicks[lineId]!);
    const orders = lines.orders[lineId]!;
    h.u32(orders.length);
    for (const order of orders) {
      h.u32(order.target).int(order.targetId).u32(order.load).u32(order.unload);
      h.int(order.refitTo).u32(order.waitTicks);
      h.int(order.condKind).u32(order.condComparator);
      h.f64(order.condValue).u32(order.condJumpTo);
    }
  }

  // The goals of SPEC2 M17, descriptors AND verdicts. Both halves, because
  // both are what "the medal is reproducible" means: the descriptor decides
  // what is being asked and the verdict is the answer, and a save that lost
  // either would replay into a different scoreboard while fingerprinting like
  // the recorded game. In the LIVE digest as well as the full one - a dozen
  // numbers per goal, moving exactly when the player can see them move.
  const goals = world.goals;
  h.u32(goals.count);
  for (let at = 0; at < goals.count; at++) {
    h.u32(goals.kind[at]!).int(goals.subjectA[at]!).int(goals.subjectB[at]!);
    h.f64(goals.threshold[at]!);
    h.u32(goals.goldTick[at]!).u32(goals.silverTick[at]!).u32(goals.bronzeTick[at]!);
    h.f64(goals.progress[at]!).u32(goals.holdDays[at]!);
    h.u32(goals.status[at]!).u32(goals.medal[at]!).int(goals.completedTick[at]!);
  }

  h.u32(world.industries.length);
  for (let i = 0; i < world.industries.length; i++) {
    const industry = world.industries[i]!;
    // Hashed for the same reason a town's id is: it is what deliveries and the
    // tile layer refer to, and it travels in the save.
    h.u32(industry.id);
    h.u32(industry.type).u32(industry.x).u32(industry.y).u32(industry.landmassId);
    h.f64(industry.inputStock0).f64(industry.inputStock1);
    h.f64(industry.outputStock0).f64(industry.outputStock1);
    h.u32(industry.productionLevel).u32(industry.monthsSinceLevelChange);
    h.f64(industry.producedThisMonth).f64(industry.collectedThisMonth);
    h.f64(industry.serviceAverage).u32(industry.serviceMonths);
    h.u32(industry.monthsWithoutCollection);
    h.u32(industry.open ? 1 : 0).u32(industry.openedTick);
  }

  h.u32(world.stations.length);
  for (let i = 0; i < world.stations.length; i++) {
    const station = world.stations[i]!;
    // The id is what every parcel's origin and destination point at, the owner
    // is whose books a delivery credits, and the name is state the player
    // reads, exactly like the news log. All three travel in the save, so all
    // three are fingerprinted (M10 audit).
    h.u32(station.id).u32(station.ownerId);
    h.u32(station.name.length).str(station.name);
    h.u32(station.x).u32(station.y).u32(station.townId).u32(station.buildingsCovered);
    h.u32(station.servedReliability).f64(station.overflowUnits);
    // The transfer-node mark of 12.3 changes what every takted line calling
    // here does, so it is fingerprinted like the name.
    h.u32(station.transferNode ? 1 : 0);
    h.u32(station.modules.length);
    for (const module of station.modules) {
      h.u32(module.kind).u32(module.tileIndex).u32(module.x).u32(module.y);
    }
    h.u32(station.waiting.length);
    for (const stack of station.waiting) {
      h.u32(stack.cargo).f64(stack.amount).f64(stack.createdTick);
      h.int(stack.originStationId).int(stack.destinationStationId);
      h.f64(stack.paidFromX).f64(stack.paidFromY);
    }
    h.u32(station.visitTicks.length);
    for (const tick of station.visitTicks) h.u32(tick);
    // Runway occupancy is dynamic state like any reservation the save keeps.
    h.u32(station.runwayFreeTick.length);
    for (const tick of station.runwayFreeTick) h.int(tick);
    // The return-journey ledger of SPEC2 M19. In the LIVE digest as well as
    // the full one, unlike the M14 ring beside it: eight numbers rather than
    // seven hundred, and two of them move on every passenger delivery - the
    // same cadence as the waiting stacks the live digest already covers. It
    // steers what a station produces tomorrow, so a bent ledger is a different
    // future and the determinism suite has to be able to see it (Z4, D-134).
    h.u32(station.returnMonths);
    for (let slot = 0; slot < station.returnState.length; slot++) {
      h.f64(station.returnState[slot]!);
    }
  }

  // The log is state the player reads and it is saved, so it is hashed like
  // everything else that is.
  h.u32(world.news.all.length);
  for (const entry of world.news.all) {
    h.u32(entry.tick).u32(entry.category).u32(entry.severity);
    h.u32(entry.messageKey.length).str(entry.messageKey);
    h.int(entry.tileIndex);
    // The parameters are part of the sentence the player reads, and they are
    // saved - so they are hashed. Keys sorted with a total comparator, because
    // object key order is the engine's, not the simulation's.
    const keys = Object.keys(entry.params).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    h.u32(keys.length);
    for (const key of keys) {
      h.u32(key.length).str(key);
      const value = entry.params[key]!;
      if (typeof value === 'number') {
        h.u32(0).f64(value);
      } else {
        h.u32(1).u32(value.length).str(value);
      }
    }
  }

  const links = world.cargoLinks.links;
  h.u32(links.length);
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    h.u32(link.fromStationId).u32(link.toStationId).f64(link.meanTicks);
    h.u32(link.samples.length).u32(link.cursor);
    for (const sample of link.samples) h.f64(sample);
  }

  const vehicles = world.vehicles;
  h.u32(vehicles.count);
  for (let id = 0; id < vehicles.count; id++) {
    h.u32(vehicles.alive[id]!);
    if (vehicles.alive[id] !== 1) continue;
    h.u32(vehicles.specId[id]!).u32(vehicles.state[id]!).u32(vehicles.tileIndex[id]!);
    // Owner, age, refit and home depot travel in the save and steer money,
    // renewal and servicing - so they are fingerprinted like everything else
    // that does (M10 audit).
    h.u32(vehicles.ownerId[id]!).int(vehicles.builtTick[id]!);
    h.int(vehicles.refitCargo[id]!).int(vehicles.homeDepotTile[id]!);
    h.f64(vehicles.progressM[id]!).f64(vehicles.speedMs[id]!);
    h.f64(vehicles.routeRemainingM[id]!);
    h.int(vehicles.reservedFromIndex[id]!).int(vehicles.reservedToIndex[id]!);
    h.int(vehicles.reservedBlockTile[id]!).int(vehicles.waitingSinceTick[id]!);
    h.u32(vehicles.consist[id]!.length);
    for (const unit of vehicles.consist[id]!) h.u32(unit);
    // The route itself, not only its length: the tiles are what the vehicle
    // will drive, they are saved verbatim (see save/entities.ts), and a save
    // whose path was bent must not fingerprint like the one that was written.
    h.u32(vehicles.pathIndex[id]!).u32(vehicles.pathLength[id]!);
    for (let t = 0; t < vehicles.pathLength[id]!; t++) h.u32(vehicles.paths[id]![t]!);
    // The line a vehicle runs decides which order list it reads, so a bent
    // assignment is a different future exactly as a bent order is.
    h.int(vehicles.lineId[id]!);
    // The latched holds of 12.3 are historical inputs to the next departure
    // (Z4); the delay is state the panel shows, saved like the news log.
    h.int(vehicles.taktDueTick[id]!).int(vehicles.connectionDeadlineTick[id]!);
    h.int(vehicles.taktDelayTicks[id]!);
    h.u32(vehicles.orderIndex[id]!).u32(vehicles.reliability[id]!);
    h.u32(vehicles.breakdownTicks[id]!).f64(vehicles.loadTicks[id]!);
    // The M14 pair: the lifetime tally is display state but saved, so it is
    // fingerprinted like every other saved field (D-134); the depot call
    // steers routing, so a bent flag is a different future (Z4).
    h.u32(vehicles.breakdownCount[id]!).u32(vehicles.depotCall[id]!);
    h.f64(vehicles.earnedCt[id]!).f64(vehicles.workJ[id]!);
    h.int(vehicles.lastStationId[id]!).int(vehicles.lastArrivalTick[id]!);
    // The orders drive every decision the vehicle makes; leaving them out of
    // the digest would let a corrupted order list masquerade as the recorded
    // game until the divergence surfaced somewhere downstream. The whole 12.1
    // grammar is fingerprinted - a bent jump target or refit is a different
    // future (D-134's field audit holds every one of these).
    h.u32(vehicles.orders[id]!.length);
    for (const order of vehicles.orders[id]!) {
      h.u32(order.target).int(order.targetId).u32(order.load).u32(order.unload);
      h.int(order.refitTo).u32(order.waitTicks);
      h.int(order.condKind).u32(order.condComparator);
      h.f64(order.condValue).u32(order.condJumpTo);
    }
    for (const stack of vehicles.cargo[id]!) {
      h.u32(stack.cargo).f64(stack.amount).f64(stack.createdTick);
      h.int(stack.originStationId).int(stack.destinationStationId);
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

  // The M14 cargo-history rings are saved state and therefore fingerprinted
  // (D-134) - but like the tile layers below they live in the FULL digest
  // only: ~700 numbers per station that move on a monthly cadence would make
  // the per-day live digest pay for what it can never see change. Every
  // event that moves the accumulators also moves a waiting stack or the
  // overflow figure, both of which the live digest already covers.
  for (const station of world.stations) {
    h.u32(station.historyCursor);
    h.intArray(station.history);
    for (let i = 0; i < station.monthCounters.length; i++) h.f64(station.monthCounters[i]!);
  }

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
  h.intArray(map.owner);
  h.intArray(map.waypoint);
  // The congestion layer of 8.4 is saved state, so it is fingerprinted like
  // every other tile layer - and like them in the FULL digest only: a
  // megabyte that moves on every road vehicle's tile boundary would make the
  // per-day live digest pay for what it exists to avoid (D-178's argument for
  // the station rings, the tile-layer precedent it took it from).
  h.intArray(map.congestion);

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
