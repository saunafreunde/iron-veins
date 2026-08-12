import { Cargo, CARGO_COUNT, PORT_OVERSEAS_CARGO } from '../cargo/types';
import { STATION_CATCHMENT_SCAN_RADIUS } from '../constants';
import type { TileMap } from '../map/TileMap';
import { inCatchment, isContainerPort, type Station } from '../station/types';
import { BuildingKind } from '../town/types';
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
 *
 * Both passenger classes of SPEC2 M19 are here and the retired `Passengers` id
 * is not: a class that no station took would be a dead end the moment a town
 * produced it (D-118), and the retired id is produced by nothing at all.
 */
export const STATION_ALWAYS_ACCEPTED: readonly Cargo[] = [
  Cargo.CommuterPax,
  Cargo.BusinessPax,
  Cargo.Mail,
];

/**
 * What a town consumes, and therefore only takes where it has houses.
 *
 * Electronics belongs here for a reason that is not decoration: the
 * electronics works is the only industry in the chain table whose output
 * nothing accepted. A cargo that can be produced and never delivered is a dead
 * end in the economy - the line carrying it is never paid and the works that
 * makes it closes after twenty-four months, whatever the player does. Found by
 * `tests/unit/deliveries.spec.ts`, which walks the whole table.
 *
 * It is credited to the town's GOODS demand rather than to a third counter of
 * its own: a town wants manufactured articles, and whether they arrive as
 * furniture or as radios is not a distinction the growth formula of section
 * 13.2 makes.
 */
export const TOWN_CARGO: readonly Cargo[] = [Cargo.Goods, Cargo.Food, Cargo.Electronics];

/**
 * What crosses a harbour container terminal's quay wall in BOTH directions -
 * the overseas meta-cargo of SPEC2 M21 (E-09).
 *
 * The third acceptance list, beside the two above, and the only one that is
 * also a PRODUCTION list: `station/containers.ts` offers exactly this and
 * `assignStationIndustries` accepts exactly this, so a container port is by
 * construction the acceptor of what a container port makes. That is the D-118
 * dead end closed at the definition rather than at the test - a cargo whose
 * producer and consumer are two copies of one list cannot drift apart, and
 * `tests/unit/deliveries.spec.ts` walks it in both directions to say so.
 *
 * Acceptance is deliberately NOT gated on the year the trade opens. The mask is
 * derived and recomputed only when a station changes or a save is loaded, so a
 * calendar term in it would be stale for as long as nobody touched the port -
 * the same trap `commercialShare` documents one function down. A port that
 * takes boxes in 1951 costs nothing, because in 1951 nothing makes one.
 */
export { PORT_OVERSEAS_CARGO } from '../cargo/types';

/**
 * True for the meta-cargo that lives only between quay walls.
 *
 * It is what `deliverCargo` asks before it looks for an industry or a town: a
 * delivered container has gone overseas and leaves the game there (D-065's rule
 * carried to a cargo that has neither a stock nor a demand behind it).
 */
export function isOverseasCargo(cargo: number): boolean {
  for (let i = 0; i < PORT_OVERSEAS_CARGO.length; i++) {
    if (PORT_OVERSEAS_CARGO[i] === cargo) return true;
  }
  return false;
}

/**
 * Recompute the zone mix of SPEC2 M19 from the map.
 *
 * `commercialShare` is DERIVED - the decoder overwrites whatever a save says
 * and `World.fromData` recomputes it for every station on load - so anything
 * that moves a `buildingKind` mid-game has to refresh it, or the same world
 * splits its passengers differently after a load than before the save. That is
 * law #3 broken in silence, and it was already true before SPEC2 M20: nothing
 * refreshed the share after `DemolishBuilding`, which is the one command that
 * has been able to unzone a covered tile since M8 (fixed with this bundle).
 *
 * Its own function rather than a line inside the scan below because the growth
 * calls it once a game day and must not allocate (law #7): the industry scan
 * builds a list, this one counts two integers. The price is a second pass over
 * the catchment when a station is BUILT, which is not a hot path.
 */
export function refreshCommercialShare(map: TileMap, station: Station): void {
  let zoned = 0;
  let commercial = 0;
  if (station.townId >= 0) {
    const radius = STATION_CATCHMENT_SCAN_RADIUS;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = station.y + dy;
      if (y < 0 || y >= map.size) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = station.x + dx;
        if (x < 0 || x >= map.size) continue;
        if (!inCatchment(station, x, y)) continue;

        const index = map.tileIndex(x, y);
        // Only the station's OWN town counts, exactly as
        // `assignStationCatchment` counts `buildingsCovered`.
        if (map.townId[index] !== station.townId) continue;
        const kind = map.buildingKind[index]!;
        if (kind === BuildingKind.None) continue;
        zoned++;
        if (kind === BuildingKind.Commercial) commercial++;
      }
    }
  }
  station.commercialShare = zoned > 0 ? commercial / zoned : 0;
}

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

  refreshCommercialShare(map, station);

  for (let dy = -radius; dy <= radius; dy++) {
    const y = station.y + dy;
    if (y < 0 || y >= map.size) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = station.x + dx;
      if (x < 0 || x >= map.size) continue;
      if (!inCatchment(station, x, y)) continue;

      const index = map.tileIndex(x, y);
      const industryId = map.industryId[index]!;
      if (industryId < 0) continue;
      if (!served.includes(industryId)) served.push(industryId);
    }
  }
  // Ascending id, so every pass over the list is in a fixed order.
  served.sort((a, b) => a - b);
  station.servedIndustries = served;

  let accepted = 0;
  for (const cargo of STATION_ALWAYS_ACCEPTED) accepted |= 1 << cargo;
  for (const id of served) {
    const industry = world.industries[id];
    if (industry === undefined) continue;
    for (const cargo of industrySpec(industry.type).inputs) accepted |= 1 << cargo;
  }
  if (station.buildingsCovered > 0) {
    for (const cargo of TOWN_CARGO) accepted |= 1 << cargo;
  }
  // A berth with a crane behind it is a container terminal, and it takes back
  // exactly what it hands out (SPEC2 M21 bundle 2).
  if (isContainerPort(station.modules)) {
    for (const cargo of PORT_OVERSEAS_CARGO) accepted |= 1 << cargo;
  }
  station.acceptedCargo = accepted;
}

/** Does this station take this cargo at all? */
export function stationAccepts(station: Station, cargo: Cargo): boolean {
  if (cargo < 0 || cargo >= CARGO_COUNT) return false;
  return (station.acceptedCargo & (1 << cargo)) !== 0;
}
