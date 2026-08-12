import type { CargoStack } from '../cargo/stack';
import {
  RATING_CANOPY_BONUS,
  RATING_EQUIPMENT_MAX,
  RATING_FREQUENCY_MAX,
  RATING_FREQUENCY_SATURATION_VISITS,
  RATING_FREQUENCY_WINDOW_DAYS,
  RATING_OVERFLOW_PENALTY_MAX,
  RATING_RELIABILITY_MAX,
  RATING_WAIT_BAD_DAYS,
  RATING_WAIT_GOOD_DAYS,
  RATING_WAIT_MAX,
  RELIABILITY_MAX,
  STATION_BASE_RADIUS,
  STATION_JOIN_DISTANCE,
  STATION_MAX_RADIUS,
  STATION_MODULES_PER_RADIUS,
  STATION_RATING_BASE,
  TICKS_PER_DAY,
} from '../constants';
import { oldestAge } from '../cargo/stack';

/**
 * Stations are assembled from modules rather than being a fixed 3x3 stamp
 * (section 10). M2 shipped the road side, M3 adds the rail side; quays and
 * terminals follow with their milestones.
 *
 * The numbers are part of the save format - append, never renumber.
 */
export const ModuleKind = {
  BusStop: 0,
  LorryBay: 1,
  RoadDepot: 2,
  /** One tile of platform, built on top of track. */
  RailPlatform: 3,
  RailDepot: 4,
  /** Crane and ramp: loading is half again as fast (section 10). */
  FreightTerminal: 5,
  /** Canopy and waiting hall: better rating, and cargo keeps longer. */
  Canopy: 6,
  /** Cold store: perishable cargo does not spoil at this station at all. */
  ColdStore: 7,
  /** One berth, built on a water tile that touches the shore (section 10). */
  Quay: 8,
  /** Where ships are built and serviced. */
  ShipDepot: 9,
  /** The three airport sizes of section 10. Aircraft are bought here too. */
  Airstrip: 10,
  Airport: 11,
  InternationalAirport: 12,
} as const;
export type ModuleKind = (typeof ModuleKind)[keyof typeof ModuleKind];

export const MODULE_KIND_COUNT = 13;

/** True for the three airport kinds. */
export function isAirModule(kind: number): boolean {
  return (
    kind === ModuleKind.Airstrip ||
    kind === ModuleKind.Airport ||
    kind === ModuleKind.InternationalAirport
  );
}

/**
 * Size index of an airport, 0 to 2, or -1 for anything else.
 *
 * The three sizes are three module KINDS rather than one kind with a size
 * field, because `StationModule` is {kind, tile, x, y} and nothing else - and
 * giving it per-module data for the sake of one field would change the save
 * shape of every module in the game.
 */
export function airportSize(kind: number): number {
  if (kind === ModuleKind.Airstrip) return 0;
  if (kind === ModuleKind.Airport) return 1;
  if (kind === ModuleKind.InternationalAirport) return 2;
  return -1;
}

/**
 * The biggest airport at this station, or -1 when it has none.
 *
 * Indexed rather than `for...of`, for the reason `hasModule` below is: the
 * runway allocator calls this from inside the tick, and since SPEC2 M19 the
 * daily gravity pass calls it once per destination candidate. The array
 * iterator is an allocation V8 does not always elide (law #7).
 */
export function stationAirportSize(station: Station): number {
  let best = -1;
  const modules = station.modules;
  for (let i = 0; i < modules.length; i++) {
    const size = airportSize(modules[i]!.kind);
    if (size > best) best = size;
  }
  return best;
}

/** True for the module kinds that stand on water. */
export function isWaterModule(kind: number): boolean {
  return kind === ModuleKind.Quay || kind === ModuleKind.ShipDepot;
}

/**
 * Modules that stand beside the line rather than on it.
 *
 * They need no road and no track - a crane, a canopy and a cold store are
 * buildings on the goods yard - so they are placed on clear ground within the
 * join distance of a station that already exists.
 */
export function isSupportModule(kind: number): boolean {
  return (
    kind === ModuleKind.FreightTerminal ||
    kind === ModuleKind.Canopy ||
    kind === ModuleKind.ColdStore
  );
}

/** True for the module kinds a train can use. */
export function isRailModule(kind: number): boolean {
  return kind === ModuleKind.RailPlatform || kind === ModuleKind.RailDepot;
}

/**
 * Is this a HARBOUR CONTAINER TERMINAL - a berth with a crane behind it?
 *
 * THE definition of a container port (SPEC2 M21 bundle 2), read by the
 * acceptance mask in `industry/catchment.ts`, by the daily overseas hook in
 * `station/containers.ts` and by the station panel, so that what the interface
 * calls a container port and what actually handles boxes cannot come apart.
 *
 * It is a PAIR of modules the game already has rather than a fourteenth
 * `ModuleKind`, and that is a decision rather than a shortcut. A crane and ramp
 * standing on the quayside IS the terminal E-09 asks for; a new kind would have
 * cost a save-format number, a build command, a reject reason, an atlas cell and
 * a fourteenth entry in every module table, for a building the player can
 * already put there. What it buys instead is that the trade arrives at the ports
 * players have been building since M7: from 1970 the harbour with a crane on it
 * starts handling boxes.
 *
 * Indexed loops rather than `some`: the daily hook asks this of every station
 * (law #7), and `hasModule` is indexed for the same reason.
 */
export function isContainerPort(modules: readonly ModulePlace[]): boolean {
  let quay = false;
  let crane = false;
  for (let i = 0; i < modules.length; i++) {
    const kind = modules[i]!.kind;
    if (kind === ModuleKind.Quay) quay = true;
    else if (kind === ModuleKind.FreightTerminal) crane = true;
    if (quay && crane) return true;
  }
  return false;
}

export interface StationModule {
  readonly kind: ModuleKind;
  /** Tile the module occupies. */
  readonly tileIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface Station {
  readonly id: number;
  name: string;
  readonly ownerId: number;
  modules: StationModule[];
  /** Centre of gravity of the modules, used for catchment and distance. */
  x: number;
  y: number;
  /** Cargo waiting to be picked up. */
  waiting: CargoStack[];
  /** Ticks of the last vehicle visits, newest last, trimmed to the window. */
  visitTicks: number[];
  /** Mean reliability of the vehicles that served it, 0..10000. */
  servedReliability: number;
  /** Units lost to overflow recently; feeds the rating penalty. */
  overflowUnits: number;
  /** Town the station belongs to, -1 when it stands in open country. */
  townId: number;
  /** Building tiles of that town inside the catchment; the production share. */
  buildingsCovered: number;
  /**
   * Share of the town buildings inside the catchment that are COMMERCIALLY
   * zoned, 0..1 - the class split of SPEC2 M19 (section 13.1's zones put to
   * economic use for the first time).
   *
   * DERIVED from the map in `assignStationIndustries`, exactly like
   * `acceptedCargo` beside it: it is a pure function of the building layer and
   * the catchment, both of which the save carries, so recomputing it on load
   * cannot go stale and costs nothing the station was not already scanning.
   * It is deliberately NOT `commercialCovered / buildingsCovered`: that
   * counter is saved and can predate a demolition, and a share above one would
   * hand a town negative commuters.
   */
  commercialShare: number;
  /**
   * Marked as an "Umsteigeknoten" of section 12.3: departures of takted lines
   * hold here, up to the hard cap, for a connecting vehicle of the same
   * group. Per STATION - the section marks stations, not line stops - and
   * saved + hashed like the name: it changes what every takted line calling
   * here does.
   */
  transferNode: boolean;

  /**
   * Bit mask of the cargo types this station takes in, one bit per Cargo.
   *
   * DERIVED from the industries and houses inside the catchment, so it is
   * recomputed when the station changes and again on load, and is neither
   * serialised nor hashed.
   */
  acceptedCargo: number;
  /** Ids of the industries inside the catchment, ascending. Derived likewise. */
  servedIndustries: number[];

  /**
   * Tick each runway is free again, one entry per runway (section 8.4).
   *
   * Empty for a station with no airport. An aircraft that finds every runway
   * busy holds; the length of this array is what a bigger airport buys, and it
   * is why an international airport is worth its price.
   */
  runwayFreeTick: number[];

  /**
   * The twelve-month cargo-history ring of SPEC2 M14 (v25 save state).
   *
   * STATION_HISTORY_MONTHS completed months, each holding CARGO_COUNT x
   * STATION_HISTORY_FIELD_COUNT Int32 counters - see station/history.ts for
   * the layout and the write path. Preallocated at creation (law #7), saved
   * and covered by the FULL world digest.
   */
  history: Int32Array;
  /** Ring slot the NEXT completed month will be written to, 0..11. */
  historyCursor: number;
  /**
   * The month in progress, accumulated per cargo and counter as events happen
   * (Float64 because cargo amounts are fractional shares) and rounded into the
   * ring by the monthly hook. Same save/hash treatment as the ring - a load
   * mid-month must not silently drop half a month of history.
   */
  monthCounters: Float64Array;

  /**
   * The return-journey ledger of SPEC2 M19 (v30 save state, station/returns.ts).
   *
   * RETURN_FIELD_COUNT figures per passenger class: the running mean of the
   * monthly arrival imbalance, the month in progress, and the two lifetime
   * counters whose difference is the conservation budget. Preallocated at
   * creation (law #7), saved and hashed - it is a historical input to a
   * simulation decision, so it is save state and not derived (Z4).
   */
  returnState: Float64Array;
  /** Completed months the running mean has seen, capped at RETURN_MEAN_MONTHS. */
  returnMonths: number;
}

/**
 * The station whose module already stands on that tile, or null - THE ONE
 * definition of "this tile is taken", in the same place and for the same
 * reason as `joinTargetIdFor` below.
 *
 * Every module-building command answers `cmd.reject.occupied` from it, and so
 * does the AI's RAIL planner before it lays an alignment whose first tile
 * becomes an engine shed (`ai/build.ts`): a planner and the command it plans
 * for must not disagree about what is buildable (D-219), and this was the
 * question that had drifted (D-230). The AI's ROAD stop scan deliberately
 * still does not ask - see `clearStopTile` for the measurement that says why.
 */
export function stationOnTile(stations: readonly Station[], tile: number): Station | null {
  for (const station of stations) {
    for (const module of station.modules) {
      if (module.tileIndex === tile) return station;
    }
  }
  return null;
}

/** Does the station have at least one module of this kind? */
export function hasModule(station: Station, kind: ModuleKind): boolean {
  // Indexed rather than `for...of`: this sits under `ratingTerms`, which the
  // collection gate, town production and the M17 goal hook all call from
  // inside the tick, and the array iterator is an allocation V8 does not
  // always elide - measured at ~9 bytes a call, which is the whole of what
  // `stationRating` was allocating (law #7, SPEC2 M17).
  const modules = station.modules;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i]!.kind === kind) return true;
  }
  return false;
}

/**
 * Longest unbroken run of platform tiles the station has, in tiles.
 *
 * A platform is 1xN and it is N that decides how much of a train can be worked
 * at once (section 10). The run has to be unbroken: two single platforms at
 * opposite ends of a station are two short platforms, not one long one.
 */
export function platformLength(station: Station): number {
  let best = 0;
  for (const module of station.modules) {
    if (module.kind !== ModuleKind.RailPlatform) continue;
    for (const axis of PLATFORM_AXES) {
      let run = 1;
      // Only count forwards, so the run starting at the far end is the one
      // measured and every run is measured exactly once per axis.
      let x = module.x + axis[0]!;
      let y = module.y + axis[1]!;
      while (hasPlatformAt(station, x, y)) {
        run++;
        x += axis[0]!;
        y += axis[1]!;
      }
      if (run > best) best = run;
    }
  }
  return best;
}

/** The four directions a 1xN platform can run in. */
const PLATFORM_AXES: readonly (readonly number[])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function hasPlatformAt(station: Station, x: number, y: number): boolean {
  for (const module of station.modules) {
    if (module.kind === ModuleKind.RailPlatform && module.x === x && module.y === y) return true;
  }
  return false;
}

/** Catchment radius for a station of `count` modules (section 10). */
export function radiusForModuleCount(count: number): number {
  const radius = STATION_BASE_RADIUS + Math.floor(count / STATION_MODULES_PER_RADIUS);
  return radius > STATION_MAX_RADIUS ? STATION_MAX_RADIUS : radius;
}

/** Catchment radius grows with the number of modules (section 10). */
export function stationRadius(station: Station): number {
  return radiusForModuleCount(station.modules.length);
}

/**
 * True when `(x, y)` lies inside a catchment of `radius` around `(cx, cy)`.
 *
 * The ONE circle test of section 10, so nothing outside this file may write
 * the comparison down a second time - the workshop's catchment overlay (SPEC2
 * M22) draws exactly the tiles this returns true for, and a preview that drew
 * a slightly different disc would be teaching an author a station the
 * simulation does not have.
 */
export function withinCatchment(
  cx: number,
  cy: number,
  radius: number,
  x: number,
  y: number,
): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** True when a tile lies inside the station's catchment area. */
export function inCatchment(station: Station, x: number, y: number): boolean {
  return withinCatchment(station.x, station.y, stationRadius(station), x, y);
}

/**
 * Recompute the centre after modules were added or removed.
 *
 * Modules that stand on water are left OUT of the average. The centre is what
 * the catchment is measured from, and a quay reaching out to deep water would
 * otherwise drag a port's catchment off the shore and out to sea - a harbour
 * built beside a coal mine could lose the mine by having its berth built one
 * tile too far out (DECISIONS.md D-095). A port that is nothing BUT water
 * modules falls back to averaging them, because something has to be the centre.
 */
export function recomputeCentre(station: Station): void {
  if (station.modules.length === 0) return;
  const centre = centreOfModules(station.modules);
  station.x = centre.x;
  station.y = centre.y;
}

/** The minimum a module contributes to the centre and join rules. */
export interface ModulePlace {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

/**
 * THE centre rule of D-095, as a pure function over module places.
 *
 * `recomputeCentre` applies it to the live station, and the catchment
 * preview of SPEC2 M14 applies it to a module that does not exist yet - one
 * rule, so the circle drawn before the click is the circle the build
 * produces.
 */
export function centreOfModules(modules: readonly ModulePlace[]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let counted = 0;
  for (const module of modules) {
    if (isWaterModule(module.kind)) continue;
    sumX += module.x;
    sumY += module.y;
    counted++;
  }
  if (counted === 0) {
    for (const module of modules) {
      sumX += module.x;
      sumY += module.y;
    }
    counted = modules.length;
  }
  return { x: Math.round(sumX / counted), y: Math.round(sumY / counted) };
}

/** The minimum a station contributes to the join rule. */
export interface JoinCandidate {
  readonly id: number;
  readonly ownerId: number;
  readonly modules: readonly ModulePlace[];
}

/**
 * Which of `ownerId`'s stations a module built at (x, y) would join, or -1
 * for a new station - THE join rule of section 10, shared between the build
 * command (commands/build.ts) and the M14 catchment preview so the two can
 * never disagree about where a module will land.
 *
 * Nearest module within STATION_JOIN_DISTANCE wins; a distance tie goes to
 * the lower station id, so the answer cannot depend on iteration order.
 */
export function joinTargetIdFor(
  stations: readonly JoinCandidate[],
  ownerId: number,
  x: number,
  y: number,
): number {
  let bestId = -1;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    if (station.ownerId !== ownerId) continue;
    for (const module of station.modules) {
      const dx = module.x - x;
      const dy = module.y - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > STATION_JOIN_DISTANCE * STATION_JOIN_DISTANCE) continue;
      if (
        distanceSq < bestDistanceSq ||
        (distanceSq === bestDistanceSq && bestId >= 0 && station.id < bestId)
      ) {
        bestDistanceSq = distanceSq;
        bestId = station.id;
      }
    }
  }
  return bestId;
}

/** What the M14 catchment preview draws: a circle in tile space. */
export interface CatchmentPreview {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Centre and radius the station WOULD have after placing one more module -
 * the live preview of SPEC2 M14, built from the same D-095 centre rule and
 * the same radius rule the simulation applies after the build. `existing` is
 * the joined station's modules, or empty for a brand-new station.
 */
export function catchmentAfterPlacing(
  existing: readonly ModulePlace[],
  kind: number,
  x: number,
  y: number,
): CatchmentPreview {
  const modules = [...existing, { kind, x, y }];
  const centre = centreOfModules(modules);
  return { x: centre.x, y: centre.y, radius: radiusForModuleCount(modules.length) };
}

/** Drop visits that fell out of the frequency window. */
export function trimVisits(station: Station, nowTick: number): void {
  const cutoff = nowTick - RATING_FREQUENCY_WINDOW_DAYS * TICKS_PER_DAY;
  let keepFrom = 0;
  while (keepFrom < station.visitTicks.length && station.visitTicks[keepFrom]! < cutoff) {
    keepFrom++;
  }
  if (keepFrom > 0) station.visitTicks.splice(0, keepFrom);
}

/**
 * The five 10.1 terms, individually quantified (SPEC2 M14).
 *
 * `overflow` is the malus and is SUBTRACTED; the four others add onto the
 * base. The rating is round(clamp(base + wait + frequency + equipment +
 * reliability - overflow)) and nothing else - `stationRating` below is
 * built ON these terms, so the x-ray panel and the rating can never quote
 * two different formulas.
 */
export interface RatingTerms {
  /** 0..RATING_WAIT_MAX, full while the oldest cargo is fresh. */
  wait: number;
  /** 0..RATING_FREQUENCY_MAX, from vehicle visits in the window. */
  frequency: number;
  /** 0..RATING_EQUIPMENT_MAX, from the modules. */
  equipment: number;
  /** 0..RATING_RELIABILITY_MAX, mean reliability of the serving vehicles. */
  reliability: number;
  /** 0..RATING_OVERFLOW_PENALTY_MAX, the malus for cargo lost to overflow. */
  overflow: number;
}

/**
 * Compute the five terms into `out` (no allocation - the collection gate and
 * the town production call the rating from daily hooks inside the tick).
 */
export function ratingTerms(station: Station, nowTick: number, out: RatingTerms): RatingTerms {
  // Waiting time: full marks while the oldest cargo is fresh.
  const ageDays = oldestAge(station.waiting, nowTick) / TICKS_PER_DAY;
  if (station.waiting.length === 0 || ageDays <= RATING_WAIT_GOOD_DAYS) {
    out.wait = RATING_WAIT_MAX;
  } else if (ageDays < RATING_WAIT_BAD_DAYS) {
    const span = RATING_WAIT_BAD_DAYS - RATING_WAIT_GOOD_DAYS;
    out.wait = RATING_WAIT_MAX * (1 - (ageDays - RATING_WAIT_GOOD_DAYS) / span);
  } else {
    out.wait = 0;
  }

  // Frequency: how often a vehicle called recently.
  const frequency = station.visitTicks.length / RATING_FREQUENCY_SATURATION_VISITS;
  out.frequency = RATING_FREQUENCY_MAX * (frequency > 1 ? 1 : frequency);

  // Equipment: every module beyond the first adds a little comfort, and a
  // canopy is worth eight points of it on its own (section 10).
  const modules = (station.modules.length - 1) / 6;
  let equipment = RATING_EQUIPMENT_MAX * (modules > 1 ? 1 : modules < 0 ? 0 : modules);
  if (hasModule(station, ModuleKind.Canopy)) equipment += RATING_CANOPY_BONUS;
  out.equipment = equipment > RATING_EQUIPMENT_MAX ? RATING_EQUIPMENT_MAX : equipment;

  // Reliability of the vehicles that serve it.
  out.reliability = (RATING_RELIABILITY_MAX * station.servedReliability) / RELIABILITY_MAX;

  // Penalty for cargo that was turned away because the station was full.
  const overflow = station.overflowUnits / 500;
  out.overflow = RATING_OVERFLOW_PENALTY_MAX * (overflow > 1 ? 1 : overflow);

  return out;
}

/** Reused by stationRating so the daily hooks allocate nothing. */
const termsScratch: RatingTerms = {
  wait: 0,
  frequency: 0,
  equipment: 0,
  reliability: 0,
  overflow: 0,
};

/** The five term names, in the fixed order the loss comparison runs in. */
export const RatingTermIndex = {
  Wait: 0,
  Frequency: 1,
  Equipment: 2,
  Reliability: 3,
  Overflow: 4,
} as const;
export type RatingTermIndex = (typeof RatingTermIndex)[keyof typeof RatingTermIndex];

/** How many points each term can lose at most, by RatingTermIndex. */
export const RATING_TERM_MAX: readonly number[] = [
  RATING_WAIT_MAX,
  RATING_FREQUENCY_MAX,
  RATING_EQUIPMENT_MAX,
  RATING_RELIABILITY_MAX,
  RATING_OVERFLOW_PENALTY_MAX,
];

/** Points the term at `index` is currently losing against its maximum. */
export function ratingLossOf(terms: RatingTerms, index: RatingTermIndex): number {
  switch (index) {
    case RatingTermIndex.Wait:
      return RATING_WAIT_MAX - terms.wait;
    case RatingTermIndex.Frequency:
      return RATING_FREQUENCY_MAX - terms.frequency;
    case RatingTermIndex.Equipment:
      return RATING_EQUIPMENT_MAX - terms.equipment;
    case RatingTermIndex.Reliability:
      return RATING_RELIABILITY_MAX - terms.reliability;
    case RatingTermIndex.Overflow:
      return terms.overflow;
  }
}

/**
 * The DOMINANT loss term - the one the x-ray's "Rating sinkt, weil ..."
 * sentence names (SPEC2 M14). Ties go to the lower index, i.e. the order of
 * RatingTermIndex, so the sentence cannot flicker between two equal causes.
 */
export function dominantLossTerm(terms: RatingTerms): RatingTermIndex {
  let best: RatingTermIndex = RatingTermIndex.Wait;
  let bestLoss = ratingLossOf(terms, best);
  for (let index = 1; index < RATING_TERM_MAX.length; index++) {
    const loss = ratingLossOf(terms, index as RatingTermIndex);
    if (loss > bestLoss) {
      best = index as RatingTermIndex;
      bestLoss = loss;
    }
  }
  return best;
}

/**
 * Station rating, 0..100 (section 10.1).
 *
 * The rating is not decoration: it is the share of the cargo produced nearby
 * that actually turns up here. A neglected station therefore gets less cargo,
 * which makes it even less attractive to serve - the death spiral is intended,
 * and the UI has to say so plainly. Since M14 it is the SUM of the five
 * ratingTerms above - one source of truth for the x-ray and the gate alike.
 */
export function stationRating(station: Station, nowTick: number): number {
  const terms = ratingTerms(station, nowTick, termsScratch);
  const rating =
    STATION_RATING_BASE +
    terms.wait +
    terms.frequency +
    terms.equipment +
    terms.reliability -
    terms.overflow;
  const clamped = rating < 0 ? 0 : rating > 100 ? 100 : rating;
  return Math.round(clamped);
}
