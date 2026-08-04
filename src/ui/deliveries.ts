import type { IndustryMarker, StationMarker, TownMarker } from '../shared/protocol';
import type { Cargo } from '../sim/cargo/types';
import { TOWN_CARGO } from '../sim/industry/catchment';
import { INDUSTRY_SPECS } from '../sim/industry/types';

/**
 * Where the output of one works can actually go.
 *
 * This is the question a player asks the moment they click a coal mine, and
 * until now the interface answered none of it: the panel showed a production
 * level and a service figure and left "so what do I do with the coal" entirely
 * to the handbook.
 *
 * It is computed here on the main thread and NOT in the simulation. Everything
 * needed is already known - `INDUSTRY_SPECS` is a pure table the interface may
 * import, the industry list carries a type per entry, and the town list
 * carries a position - so asking the worker would be a message round trip for
 * an answer the interface can work out itself.
 */

/**
 * Cargo a town takes delivery of, read from the simulation rather than copied.
 *
 * A second list here would be a second list to forget: the moment the two
 * disagree, the panel sends a player to a town that will not take the load.
 */
const TOWN_ACCEPTS = TOWN_CARGO;

export interface DeliveryTarget {
  /** 'industry' or 'town'; they are reached and shown differently. */
  readonly kind: 'industry' | 'town';
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Straight-line distance in tiles, rounded. */
  readonly distanceTiles: number;
  /** True when a station of ours already stands within reach of it. */
  readonly served: boolean;
}

export interface CargoRoute {
  readonly cargo: Cargo;
  readonly targets: readonly DeliveryTarget[];
}

/** How near a station has to be to count as already serving a place. [tiles] */
const SERVED_RADIUS = 6;

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

function isServed(x: number, y: number, stations: readonly StationMarker[]): boolean {
  for (const station of stations) {
    for (const module of station.modules) {
      if (Math.abs(module.x - x) <= SERVED_RADIUS && Math.abs(module.y - y) <= SERVED_RADIUS) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Every place that takes what this industry makes, nearest first.
 *
 * Closed works are left out. They still sit in the list with `open: false`, and
 * pointing a player at a dead factory is worse than saying nothing.
 */
export function deliveryRoutes(
  source: IndustryMarker,
  industries: readonly IndustryMarker[],
  towns: readonly TownMarker[],
  stations: readonly StationMarker[],
  limit = 4,
): readonly CargoRoute[] {
  const spec = INDUSTRY_SPECS[source.type];
  if (spec === undefined) return [];

  const routes: CargoRoute[] = [];

  for (const cargo of spec.outputs) {
    const targets: DeliveryTarget[] = [];

    for (const other of industries) {
      if (other.id === source.id || !other.open) continue;
      const otherSpec = INDUSTRY_SPECS[other.type];
      if (otherSpec === undefined || !otherSpec.inputs.includes(cargo)) continue;
      targets.push({
        kind: 'industry',
        name: otherSpec.nameKey,
        x: other.x,
        y: other.y,
        distanceTiles: distance(source.x, source.y, other.x, other.y),
        served: isServed(other.x, other.y, stations),
      });
    }

    if (TOWN_ACCEPTS.includes(cargo)) {
      for (const town of towns) {
        targets.push({
          kind: 'town',
          name: town.name,
          x: town.x,
          y: town.y,
          distanceTiles: distance(source.x, source.y, town.x, town.y),
          served: isServed(town.x, town.y, stations),
        });
      }
    }

    // Nearest first, then by name, so the same world always lists the same way.
    targets.sort((a, b) => {
      if (a.distanceTiles !== b.distanceTiles) return a.distanceTiles - b.distanceTiles;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    routes.push({ cargo, targets: targets.slice(0, limit) });
  }

  return routes;
}

/**
 * What this works needs delivered TO it, and where that could come from.
 *
 * The other half of the same question, and the one that decides whether a
 * factory is worth building a line to at all: a furniture works with no
 * sawmill within reach produces nothing however well it is served.
 */
export function supplyRoutes(
  sink: IndustryMarker,
  industries: readonly IndustryMarker[],
  stations: readonly StationMarker[],
  limit = 4,
): readonly CargoRoute[] {
  const spec = INDUSTRY_SPECS[sink.type];
  if (spec === undefined) return [];

  const routes: CargoRoute[] = [];

  for (const cargo of spec.inputs) {
    const targets: DeliveryTarget[] = [];

    for (const other of industries) {
      if (other.id === sink.id || !other.open) continue;
      const otherSpec = INDUSTRY_SPECS[other.type];
      if (otherSpec === undefined || !otherSpec.outputs.includes(cargo)) continue;
      targets.push({
        kind: 'industry',
        name: otherSpec.nameKey,
        x: other.x,
        y: other.y,
        distanceTiles: distance(sink.x, sink.y, other.x, other.y),
        served: isServed(other.x, other.y, stations),
      });
    }

    targets.sort((a, b) => {
      if (a.distanceTiles !== b.distanceTiles) return a.distanceTiles - b.distanceTiles;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    routes.push({ cargo, targets: targets.slice(0, limit) });
  }

  return routes;
}
