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
} as const;
export type ModuleKind = (typeof ModuleKind)[keyof typeof ModuleKind];

export const MODULE_KIND_COUNT = 10;

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
   * Bit mask of the cargo types this station takes in, one bit per Cargo.
   *
   * DERIVED from the industries and houses inside the catchment, so it is
   * recomputed when the station changes and again on load, and is neither
   * serialised nor hashed.
   */
  acceptedCargo: number;
  /** Ids of the industries inside the catchment, ascending. Derived likewise. */
  servedIndustries: number[];
}

/** Does the station have at least one module of this kind? */
export function hasModule(station: Station, kind: ModuleKind): boolean {
  for (const module of station.modules) {
    if (module.kind === kind) return true;
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

/** Catchment radius grows with the number of modules (section 10). */
export function stationRadius(station: Station): number {
  const radius =
    STATION_BASE_RADIUS + Math.floor(station.modules.length / STATION_MODULES_PER_RADIUS);
  return radius > STATION_MAX_RADIUS ? STATION_MAX_RADIUS : radius;
}

/** True when a tile lies inside the station's catchment area. */
export function inCatchment(station: Station, x: number, y: number): boolean {
  const radius = stationRadius(station);
  const dx = x - station.x;
  const dy = y - station.y;
  return dx * dx + dy * dy <= radius * radius;
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

  let sumX = 0;
  let sumY = 0;
  let counted = 0;
  for (const module of station.modules) {
    if (isWaterModule(module.kind)) continue;
    sumX += module.x;
    sumY += module.y;
    counted++;
  }
  if (counted === 0) {
    for (const module of station.modules) {
      sumX += module.x;
      sumY += module.y;
    }
    counted = station.modules.length;
  }
  station.x = Math.round(sumX / counted);
  station.y = Math.round(sumY / counted);
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
 * Station rating, 0..100 (section 10.1).
 *
 * The rating is not decoration: it is the share of the cargo produced nearby
 * that actually turns up here. A neglected station therefore gets less cargo,
 * which makes it even less attractive to serve - the death spiral is intended,
 * and the UI has to say so plainly.
 */
export function stationRating(station: Station, nowTick: number): number {
  let rating = STATION_RATING_BASE;

  // Waiting time: full marks while the oldest cargo is fresh.
  const ageDays = oldestAge(station.waiting, nowTick) / TICKS_PER_DAY;
  if (station.waiting.length === 0 || ageDays <= RATING_WAIT_GOOD_DAYS) {
    rating += RATING_WAIT_MAX;
  } else if (ageDays < RATING_WAIT_BAD_DAYS) {
    const span = RATING_WAIT_BAD_DAYS - RATING_WAIT_GOOD_DAYS;
    rating += RATING_WAIT_MAX * (1 - (ageDays - RATING_WAIT_GOOD_DAYS) / span);
  }

  // Frequency: how often a vehicle called recently.
  const visits = station.visitTicks.length;
  const frequency = visits / RATING_FREQUENCY_SATURATION_VISITS;
  rating += RATING_FREQUENCY_MAX * (frequency > 1 ? 1 : frequency);

  // Equipment: every module beyond the first adds a little comfort, and a
  // canopy is worth eight points of it on its own (section 10).
  const modules = (station.modules.length - 1) / 6;
  let equipment = RATING_EQUIPMENT_MAX * (modules > 1 ? 1 : modules < 0 ? 0 : modules);
  if (hasModule(station, ModuleKind.Canopy)) equipment += RATING_CANOPY_BONUS;
  rating += equipment > RATING_EQUIPMENT_MAX ? RATING_EQUIPMENT_MAX : equipment;

  // Reliability of the vehicles that serve it.
  rating += (RATING_RELIABILITY_MAX * station.servedReliability) / RELIABILITY_MAX;

  // Penalty for cargo that was turned away because the station was full.
  const overflow = station.overflowUnits / 500;
  rating -= RATING_OVERFLOW_PENALTY_MAX * (overflow > 1 ? 1 : overflow);

  const clamped = rating < 0 ? 0 : rating > 100 ? 100 : rating;
  return Math.round(clamped);
}
