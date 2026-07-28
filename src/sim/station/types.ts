import type { CargoStack } from '../cargo/stack';
import {
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
} as const;
export type ModuleKind = (typeof ModuleKind)[keyof typeof ModuleKind];

export const MODULE_KIND_COUNT = 5;

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

/** Recompute the centre after modules were added or removed. */
export function recomputeCentre(station: Station): void {
  if (station.modules.length === 0) return;
  let sumX = 0;
  let sumY = 0;
  for (const module of station.modules) {
    sumX += module.x;
    sumY += module.y;
  }
  station.x = Math.round(sumX / station.modules.length);
  station.y = Math.round(sumY / station.modules.length);
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

  // Equipment: every module beyond the first adds a little comfort.
  const equipment = (station.modules.length - 1) / 6;
  rating += RATING_EQUIPMENT_MAX * (equipment > 1 ? 1 : equipment < 0 ? 0 : equipment);

  // Reliability of the vehicles that serve it.
  rating += (RATING_RELIABILITY_MAX * station.servedReliability) / RELIABILITY_MAX;

  // Penalty for cargo that was turned away because the station was full.
  const overflow = station.overflowUnits / 500;
  rating -= RATING_OVERFLOW_PENALTY_MAX * (overflow > 1 ? 1 : overflow);

  const clamped = rating < 0 ? 0 : rating > 100 ? 100 : rating;
  return Math.round(clamped);
}
