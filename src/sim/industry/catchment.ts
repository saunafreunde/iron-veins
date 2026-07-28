import { Cargo, CARGO_COUNT } from '../cargo/types';
import { STATION_CATCHMENT_SCAN_RADIUS } from '../constants';
import { inCatchment, type Station } from '../station/types';
import type { World } from '../World';
import { industrySpec, type Industry } from './types';

/**
 * What a station serves and what it will take in (section 10).
 *
 * Both fields are DERIVED from the map and the station's own modules, so they
 * are recomputed when a station changes and again on load, and are neither
 * serialised nor hashed - the treatment `landmassId` already gets.
 */

/**
 * What SHARE of an industry's footprint lies inside a station's catchment, 0..1.
 *
 * A share, not a tile count. The collection gate multiplies this by the station
 * rating and caps the result at one, so a count would saturate the gate the
 * moment a second tile was covered and the rating would stop mattering at all -
 * which is precisely the mechanism the gate exists to provide.
 */
export function coveredShareOf(station: Station, industry: Industry): number {
  const size = industrySpec(industry.type).footprint;
  let covered = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (inCatchment(station, industry.x + dx, industry.y + dy)) covered++;
    }
  }
  return covered / (size * size);
}

/**
 * Cargo every station takes, wherever it stands.
 *
 * People get off where the station is; a mail bag is handed over there. Making
 * these conditional on houses would mean a stop that serves a mine could not
 * also carry its workers, and it would change what M2's bus line is worth -
 * which is calibrated and in band.
 */
const ALWAYS_ACCEPTED: readonly Cargo[] = [Cargo.Passengers, Cargo.Mail];

/** What a town consumes, and therefore only takes where it has houses. */
const TOWN_CARGO: readonly Cargo[] = [Cargo.Goods, Cargo.Food];

/**
 * Work out which industries a station reaches and which cargo it accepts.
 *
 * Acceptance is what stops a lorry dropping goods in open country and being
 * paid in full for them. Passengers, mail, goods and food are accepted wherever
 * the station covers houses; anything else needs an industry that consumes it.
 */
export function assignStationIndustries(world: World, station: Station): void {
  const map = world.map;
  const served: number[] = [];
  const radius = STATION_CATCHMENT_SCAN_RADIUS;

  for (let dy = -radius; dy <= radius; dy++) {
    const y = station.y + dy;
    if (y < 0 || y >= map.size) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = station.x + dx;
      if (x < 0 || x >= map.size) continue;
      if (!inCatchment(station, x, y)) continue;

      const industryId = map.industryId[map.tileIndex(x, y)]!;
      if (industryId < 0) continue;
      if (!served.includes(industryId)) served.push(industryId);
    }
  }
  // Ascending id, so every pass over the list is in a fixed order.
  served.sort((a, b) => a - b);
  station.servedIndustries = served;

  let accepted = 0;
  for (const cargo of ALWAYS_ACCEPTED) accepted |= 1 << cargo;
  for (const id of served) {
    const industry = world.industries[id];
    if (industry === undefined) continue;
    for (const cargo of industrySpec(industry.type).inputs) accepted |= 1 << cargo;
  }
  if (station.buildingsCovered > 0) {
    for (const cargo of TOWN_CARGO) accepted |= 1 << cargo;
  }
  station.acceptedCargo = accepted;
}

/** Does this station take this cargo at all? */
export function stationAccepts(station: Station, cargo: Cargo): boolean {
  if (cargo < 0 || cargo >= CARGO_COUNT) return false;
  return (station.acceptedCargo & (1 << cargo)) !== 0;
}
