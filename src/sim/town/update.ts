import { Cargo } from '../cargo/types';
import {
  MAIL_PER_INHABITANT_PER_MONTH,
  PASSENGERS_PER_INHABITANT_PER_MONTH,
  STATION_CATCHMENT_SCAN_RADIUS,
  TOWN_GROWTH_BASE_RATE,
  TOWN_GROWTH_FOOD_WEIGHT,
  TOWN_GROWTH_GOODS_WEIGHT,
  TOWN_GROWTH_PASSENGER_WEIGHT,
  TOWN_INHABITANTS_PER_FOOD,
  TOWN_INHABITANTS_PER_GOODS,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
} from '../constants';
import { assignStationIndustries } from '../industry/catchment';
import { inCatchment, stationRating, type Station } from '../station/types';
import { depositAtStation } from '../cargo/routing';
import type { World } from '../World';

/**
 * Town output and growth (sections 13.1 and 13.2).
 *
 * Cargo is only created where it can actually be collected: a town without a
 * station produces nothing. Simulating passengers that no one can ever pick up
 * would cost memory and tell the player nothing.
 */

/** Passengers and mail a town produces per production slice. */
function outputPerSlice(population: number, perInhabitantPerMonth: number): number {
  return (population * perInhabitantPerMonth) / TOWN_PRODUCTION_SLICES_PER_MONTH;
}

/**
 * Work out which town a station serves and how much of it it covers.
 * Called when a station is built or extended, not per tick.
 */
export function assignStationCatchment(world: World, station: Station): void {
  const map = world.map;
  const counts = new Map<number, number>();

  const radius = STATION_CATCHMENT_SCAN_RADIUS;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = station.y + dy;
    if (y < 0 || y >= map.size) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = station.x + dx;
      if (x < 0 || x >= map.size) continue;
      if (!inCatchment(station, x, y)) continue;

      const index = map.tileIndex(x, y);
      if (map.buildingKind[index] === 0) continue;
      const townId = map.townId[index]!;
      if (townId < 0) continue;
      counts.set(townId, (counts.get(townId) ?? 0) + 1);
    }
  }

  // Dominant town wins; ties break on the lower id so the choice is stable.
  let bestTown = -1;
  let bestCount = 0;
  for (const [townId, count] of counts) {
    if (count > bestCount || (count === bestCount && townId < bestTown)) {
      bestTown = townId;
      bestCount = count;
    }
  }
  station.townId = bestTown;
  station.buildingsCovered = bestCount;
  // Acceptance depends on buildingsCovered, so it is worked out afterwards.
  assignStationIndustries(world, station);
}

/**
 * Produce one slice of passengers and mail. Called once per game day.
 *
 * The share a station receives is its coverage weighted by its rating, which is
 * how a neglected station ends up with less cargo than a well served one
 * (section 10.1).
 */
export function produceTownCargo(world: World): void {
  for (const town of world.towns) {
    let totalWeight = 0;
    for (const station of world.stations) {
      if (station.townId !== town.id) continue;
      totalWeight += station.buildingsCovered * (stationRating(station, world.tick) / 100);
    }
    if (totalWeight <= 0) continue;

    const passengers = outputPerSlice(town.population, PASSENGERS_PER_INHABITANT_PER_MONTH);
    const mail = outputPerSlice(town.population, MAIL_PER_INHABITANT_PER_MONTH);

    for (const station of world.stations) {
      if (station.townId !== town.id) continue;
      const share =
        (station.buildingsCovered * (stationRating(station, world.tick) / 100)) / totalWeight;
      // What a town produces is counted whether or not the station could take
      // it: the growth ratio has to divide by the offer, not by the acceptance.
      town.producedThisMonth += passengers * share;
      depositAtStation(world, station, Cargo.Passengers, passengers * share);
      depositAtStation(world, station, Cargo.Mail, mail * share);
    }
  }
}

/**
 * Monthly town growth (section 13.2).
 *
 * Only the passenger term carries weight until the goods, food and building
 * material chains arrive in M5 - the other supply ratios are genuinely zero for
 * a company that does not deliver them yet, not placeholders.
 */
export function growTowns(world: World): void {
  for (const town of world.towns) {
    const produced = town.producedThisMonth;
    const transported = town.transportedThisMonth;
    const supplyPassengers = produced > 0 ? Math.min(1, transported / produced) : 0;

    // Demand for the two things a town consumes, from section 13.2.
    const goodsWanted = town.population / TOWN_INHABITANTS_PER_GOODS;
    const foodWanted = town.population / TOWN_INHABITANTS_PER_FOOD;
    const supplyGoods =
      goodsWanted > 0 ? Math.min(1, town.goodsDeliveredThisMonth / goodsWanted) : 0;
    const supplyFood = foodWanted > 0 ? Math.min(1, town.foodDeliveredThisMonth / foodWanted) : 0;

    const terrainFactor = terrainFactorFor(world, town.x, town.y);
    const rate =
      TOWN_GROWTH_BASE_RATE *
      (1 +
        TOWN_GROWTH_PASSENGER_WEIGHT * supplyPassengers +
        TOWN_GROWTH_GOODS_WEIGHT * supplyGoods +
        TOWN_GROWTH_FOOD_WEIGHT * supplyFood) *
      terrainFactor;

    town.population = Math.round(town.population * (1 + rate));
    town.producedThisMonth = 0;
    town.transportedByCompany.length = 0;
    town.transportedThisMonth = 0;
    town.goodsDeliveredThisMonth = 0;
    town.foodDeliveredThisMonth = 0;
  }
}

/** Flat ground grows fastest; mountains barely at all. */
function terrainFactorFor(world: World, x: number, y: number): number {
  const map = world.map;
  let rough = 0;
  let samples = 0;
  for (let dy = -4; dy <= 4; dy += 2) {
    for (let dx = -4; dx <= 4; dx += 2) {
      const tx = x + dx;
      const ty = y + dy;
      if (!map.contains(tx, ty)) continue;
      rough += map.topHeight(tx, ty) - map.baseHeight(tx, ty);
      samples++;
    }
  }
  if (samples === 0) return 1;
  const ratio = rough / samples;
  if (ratio < 0.15) return 1;
  if (ratio < 0.45) return 0.6;
  return 0.3;
}
