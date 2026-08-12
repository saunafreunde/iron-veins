import { depositRoutedAtStation } from '../cargo/routing';
import { PORT_CONTAINER_TEU_PER_MONTH, TOWN_PRODUCTION_SLICES_PER_MONTH } from '../constants';
import { economyContainerFactor } from '../economy/curve';
import { PORT_OVERSEAS_CARGO } from '../industry/catchment';
import type { World } from '../World';
import { isContainerPort, stationRating } from './types';

/**
 * The container revival of SPEC2 M21 (E-09): the dead cargo type of SPEC.md 7.2
 * gets a producer and a consumer, and they are the same thing at two ends of
 * the map.
 *
 * `Cargo.Containers` has existed since M5 with a rate, a tonnage, a decay curve
 * and eight vehicles that carry it - and nothing on the map produced one, so no
 * player has ever seen a box. A harbour container terminal (a `Quay` with a
 * `FreightTerminal` behind it, see `isContainerPort`) is now both ends of an
 * OVERSEAS trade: boxes come off ships from beyond the map at one port and go
 * back out to sea at another, and what the player runs is the land or coastal
 * leg between them.
 *
 * ## The five rules, stated rather than left to be discovered
 *
 * 1. **Creation.** Containers are created ONLY here, only at a container port,
 *    only from `ECONOMY_CONTAINER_BOOM_FROM_YEAR` on, and only in a world whose
 *    `economy` rule is on - `economyContainerFactor` returns 0 for every other
 *    case and this hook returns on its first line. No industry lists them as an
 *    output and no town offers them; `tests/unit/deliveries.spec.ts` holds all
 *    three statements.
 * 2. **Destination.** A container port is the only thing on the map that
 *    ACCEPTS a container (`PORT_OVERSEAS_CARGO`, granted in
 *    `assignStationIndustries`), so the ordinary M5 routing can only ever send
 *    a box to another port. There is no container-specific routing.
 * 3. **Refusal.** A port with no reachable partner produces nothing at all
 *    (`depositRoutedAtStation`). A cargo nobody can accept is D-118's dead end,
 *    and the honest answer for a trade that arrives from outside the world is
 *    that the ship does not call.
 * 4. **Overflow.** The offer goes through the same `placeDeposit` every other
 *    production goes through, so boxes count against `STATION_CARGO_CAPACITY`
 *    with everything else waiting at that station, are refused at the door when
 *    it is full, and that refusal is booked as `overflowUnits` and as the
 *    history ring's `Expired`. Containers get no reserved capacity of their own.
 * 5. **Delivery and conservation (D-065).** A delivered container has gone
 *    overseas: `deliverCargo` records it and returns, so it never reaches an
 *    industry's stock, never a town's demand counter and - the rule D-065 is
 *    actually about - never `station.waiting`. Together with the four above
 *    that makes the accounting closed: everything OFFERED is either accepted
 *    into a port or refused at its door, and everything ACCEPTED is at every
 *    moment either waiting, aboard a vehicle, delivered overseas or expired.
 *    `tests/unit/containerPort.spec.ts` measures exactly that sum.
 */

/**
 * What one port offers in one daily slice. [TEU]
 *
 * Pure, so the balance arithmetic can be checked without a world: the monthly
 * figure, sliced over the month's days for the reason 7.3 slices an industry's
 * collection (a month of boxes landing in one tick would sit at the quay
 * ageing for four weeks), times the station's own rating and times the century.
 *
 * The rating share is the rule CLAUDE.md states for a town and D-063 states for
 * an industry, applied to a harbour: what a port is OFFERED is what it can
 * turn over, and a berth nobody calls at is one the shipping line stops using.
 */
export function portContainerOffer(rating: number, curveFactor: number): number {
  const perSlice = PORT_CONTAINER_TEU_PER_MONTH / TOWN_PRODUCTION_SLICES_PER_MONTH;
  return perSlice * (rating / 100) * curveFactor;
}

/**
 * One game day of overseas box traffic. Returns the units actually taken into
 * ports, which is what the conservation test counts against.
 *
 * Allocation-free in the daily block (law #7): indexed loops, no iterator over
 * the cargo list, and one early return that makes the whole hook free for every
 * world without a century - which is every pinned world in this repository.
 */
export function moveOverseasContainers(world: World): number {
  const factor = economyContainerFactor(world.economyCurve, world.date.year);
  if (factor <= 0) return 0;

  let accepted = 0;
  const stations = world.stations;
  for (let index = 0; index < stations.length; index++) {
    const station = stations[index]!;
    if (!isContainerPort(station.modules)) continue;
    const amount = portContainerOffer(stationRating(station, world.tick), factor);
    if (amount <= 0) continue;
    for (let slot = 0; slot < PORT_OVERSEAS_CARGO.length; slot++) {
      accepted += depositRoutedAtStation(world, station, PORT_OVERSEAS_CARGO[slot]!, amount);
    }
  }
  return accepted;
}
