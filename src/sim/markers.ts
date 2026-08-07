import type {
  IndustryMarker,
  StationHistoryMarker,
  StationMarker,
  StationWaitingMarker,
  VehicleCargoMarker,
} from '../shared/protocol';
import { tileDistance } from './cargo/payment';
import { CARGO_COUNT } from './cargo/types';
import { STATION_HISTORY_MONTHS, TICKS_PER_DAY } from './constants';
import type { Industry } from './industry/types';
import { historySlot, STATION_HISTORY_FIELD_COUNT, StationHistoryField } from './station/history';
import { ratingTerms, stationRating, type RatingTerms, type Station } from './station/types';
import type { World } from './World';

/**
 * Marker assembly that is pure state-to-protocol mapping, extracted from
 * SimWorker so it can be held by a unit test (M13: the renderer's smoke and
 * glow intensity hang off the marker's `level` field, and the mapping from
 * `productionLevel` to it must not drift in silence -
 * tests/unit/industryMarkers.spec.ts is the round-trip proof). SimWorker
 * remains the only caller; nothing here touches worker globals, the clock
 * or any state - it reads the industry records it is handed and builds the
 * message payload, which is why it may live under src/sim without touching
 * the determinism rules.
 */

/**
 * Live production state of every industry, for the tile panel, the lists,
 * the minimap - and, since M13, the renderer's particle emitters and
 * emissive intensity: `level` is the production level in percent of the
 * base rate while the industry is open, and 0 once it has closed - the
 * "dormant = no smoke" end of the M13 scale.
 */
export function industryMarkers(industries: readonly Industry[]): IndustryMarker[] {
  return industries.map((industry) => ({
    id: industry.id,
    type: industry.type,
    x: industry.x,
    y: industry.y,
    level: industry.open ? industry.productionLevel : 0,
    stock: Math.round(industry.outputStock0 + industry.outputStock1),
    service: Math.round(industry.serviceAverage * 100),
    neglectedMonths: industry.monthsWithoutCollection,
    open: industry.open,
  }));
}

/** The per-cargo waiting table of the M14 x-ray, ascending cargo id. */
function waitingByCargo(station: Station, nowTick: number): StationWaitingMarker[] {
  const rows: StationWaitingMarker[] = [];
  for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
    let units = 0;
    let oldestTick = -1;
    for (const stack of station.waiting) {
      if (stack.cargo !== cargo) continue;
      units += stack.amount;
      if (oldestTick < 0 || stack.createdTick < oldestTick) oldestTick = stack.createdTick;
    }
    if (units <= 0) continue;
    rows.push({
      cargo,
      units: Math.round(units),
      oldestDays: (nowTick - oldestTick) / TICKS_PER_DAY,
    });
  }
  return rows;
}

/**
 * The twelve completed months of the M14 ring, oldest first, one row per
 * cargo that recorded anything - most stations handle two or three of the
 * eighteen, and 15 empty rows of 36 zeros per station per refresh would be
 * marker-channel weight for nothing.
 */
function historyRows(station: Station): StationHistoryMarker[] {
  const rows: StationHistoryMarker[] = [];
  for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
    let any = false;
    for (let field = 0; field < STATION_HISTORY_FIELD_COUNT && !any; field++) {
      for (let monthsAgo = 0; monthsAgo < STATION_HISTORY_MONTHS && !any; monthsAgo++) {
        if (
          station.history[historySlot(station, monthsAgo, cargo, field as StationHistoryField)] !==
          0
        ) {
          any = true;
        }
      }
    }
    if (!any) continue;

    const collected: number[] = [];
    const delivered: number[] = [];
    const expired: number[] = [];
    // Oldest first: monthsAgo counts back from the newest completed month.
    for (let monthsAgo = STATION_HISTORY_MONTHS - 1; monthsAgo >= 0; monthsAgo--) {
      collected.push(
        station.history[historySlot(station, monthsAgo, cargo, StationHistoryField.Collected)]!,
      );
      delivered.push(
        station.history[historySlot(station, monthsAgo, cargo, StationHistoryField.Delivered)]!,
      );
      expired.push(
        station.history[historySlot(station, monthsAgo, cargo, StationHistoryField.Expired)]!,
      );
    }
    rows.push({ cargo, collected, delivered, expired });
  }
  return rows;
}

/**
 * The manifest of one vehicle for the M14 detail view: every parcel aboard,
 * with its destination and its paid-up-to marker turned into the number a
 * player can read - the open distance since the last paid point, measured
 * with the SAME `tileDistance` the payment formula uses (section 7.4), from
 * the tile the vehicle stands on. One row per stack, largest first: stacks
 * are already merged by (cargo, origin, destination, paid-from), so the rows
 * are exactly the simulation's own bookkeeping, never a re-aggregation.
 */
export function vehicleCargoRows(world: World, id: number): VehicleCargoMarker[] {
  const vehicles = world.vehicles;
  const size = world.map.size;
  const tile = vehicles.tileIndex[id]!;
  const x = tile % size;
  const y = (tile / size) | 0;

  const rows = vehicles.cargo[id]!.map((stack) => ({
    cargo: stack.cargo,
    units: Math.round(stack.amount),
    originStationId: stack.originStationId,
    destinationStationId: stack.destinationStationId,
    ageDays: (world.tick - stack.createdTick) / TICKS_PER_DAY,
    openTiles: tileDistance(stack.paidFromX, stack.paidFromY, x, y),
  }));
  // Total order (law #3): units desc, then the routing identity of the stack.
  // Stacks that tie on all of it keep their deterministic insertion order -
  // Array.prototype.sort is stable per spec.
  rows.sort(
    (a, b) =>
      b.units - a.units ||
      a.cargo - b.cargo ||
      a.destinationStationId - b.destinationStationId ||
      a.originStationId - b.originStationId,
  );
  return rows;
}

/**
 * Every station as the panel and the map need it, x-ray included (SPEC2
 * M14): the five 10.1 terms exactly as the simulation's own `ratingTerms`
 * computed them - ONE formula, displayed, never recomputed - plus the
 * per-cargo waiting table and the twelve-month history ring.
 */
export function stationMarkers(world: World): StationMarker[] {
  return world.stations.map((station) => {
    const terms: RatingTerms = { wait: 0, frequency: 0, equipment: 0, reliability: 0, overflow: 0 };
    ratingTerms(station, world.tick, terms);
    return {
      id: station.id,
      name: station.name,
      ownerId: station.ownerId,
      x: station.x,
      y: station.y,
      rating: stationRating(station, world.tick),
      waiting: Math.round(station.waiting.reduce((sum, stack) => sum + stack.amount, 0)),
      transferNode: station.transferNode,
      modules: station.modules.map((module) => ({ kind: module.kind, x: module.x, y: module.y })),
      terms,
      waitingByCargo: waitingByCargo(station, world.tick),
      history: historyRows(station),
    };
  });
}
