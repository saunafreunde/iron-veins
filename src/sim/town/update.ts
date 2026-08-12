import { Cargo } from '../cargo/types';
import {
  MAIL_PER_INHABITANT_PER_MONTH,
  PASSENGERS_PER_INHABITANT_PER_MONTH,
  STATION_CATCHMENT_SCAN_RADIUS,
  TOWN_BUILDING_MATERIAL_RADIUS,
  TOWN_ELECTRONICS_MIN_POPULATION,
  TOWN_GROWTH_BASE_RATE,
  TOWN_GROWTH_BUILDING_WEIGHT,
  TOWN_GROWTH_FOOD_WEIGHT,
  TOWN_GROWTH_GOODS_WEIGHT,
  TOWN_GROWTH_PASSENGER_WEIGHT,
  TOWN_GROWTH_RATING_FLOOR,
  TOWN_GROWTH_RATING_SPAN,
  TOWN_INHABITANTS_PER_BUILDING_MATERIAL,
  TOWN_INHABITANTS_PER_ELECTRONICS,
  TOWN_INHABITANTS_PER_FOOD,
  TOWN_INHABITANTS_PER_GOODS,
  TOWN_MAIL_COMMERCIAL_WEIGHT,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
  TOWN_SHRINK_RATE_PER_MONTH,
  TOWN_SUPPLY_WINDOW_MONTHS,
} from '../constants';
import { assignStationIndustries } from '../industry/catchment';
import { countTownZones } from '../mapgen/towns';
import { reportTownMilestone } from '../news/report';
import { inCatchment, stationRating, type Station } from '../station/types';
import { depositAtStation, depositPassengers } from '../cargo/routing';
import { notePassengerOffer } from '../station/returns';
import { councilRating } from './council';
import { BuildingKind, type Town } from './types';
import type { World } from '../World';

/**
 * The zone census `growTowns` reads its demands against, refilled per town.
 *
 * Four slots, indexed by {@link BuildingKind}, allocated once at module load:
 * a monthly hook may not allocate any more than a tick may (law #7, D-231),
 * and it is scratch rather than state - filled at the top of every town's turn
 * and read only until that turn ends.
 */
const zoneCensus = new Int32Array(4);

/**
 * Town output and growth (sections 13.1 and 13.2).
 *
 * Cargo is only created where it can actually be collected: a town without a
 * station produces nothing. Simulating passengers that no one can ever pick up
 * would cost memory and tell the player nothing.
 */

/**
 * Everything a town puts into a station, ascending - the enumeration
 * `produceTownCargo` below deposits and nothing else.
 *
 * It exists because SPEC2 M19 gave a town a SECOND passenger class, and a
 * class no station accepted would be the dead end of D-118 one production
 * chain further out: produced every game day, never collectable, filling the
 * station to its capacity and taking the classes that ARE served down with
 * it. `tests/unit/deliveries.spec.ts` walks this list against the station's
 * own acceptance table, and `tests/unit/passengerClasses.spec.ts` holds the
 * list itself against what a played town actually deposits.
 */
export const TOWN_OUTPUTS: readonly Cargo[] = [Cargo.Mail, Cargo.CommuterPax, Cargo.BusinessPax];

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
    // The mail weight of SPEC2 M20's zone economy: the same coverage-times-
    // rating share, MULTIPLIED by how commercial the stop's own catchment is.
    // SPEC2 asks that the commercial zone be what produces post, and the
    // device is M19's (D-207): the town's TOTAL is untouched and what changes
    // is which of its stops the post is offered at. Normalising the weights is
    // what makes that exact - where every stop of a town has the same zone mix
    // the factor cancels, which covers a town with one station and every
    // hand-built world of section 19.4 (all residential, share 0).
    let totalMailWeight = 0;
    for (const station of world.stations) {
      if (station.townId !== town.id) continue;
      const weight = station.buildingsCovered * (stationRating(station, world.tick) / 100);
      totalWeight += weight;
      totalMailWeight += weight * (1 + TOWN_MAIL_COMMERCIAL_WEIGHT * station.commercialShare);
    }
    if (totalWeight <= 0) continue;

    const passengers = outputPerSlice(town.population, PASSENGERS_PER_INHABITANT_PER_MONTH);
    const mail = outputPerSlice(town.population, MAIL_PER_INHABITANT_PER_MONTH);

    for (const station of world.stations) {
      if (station.townId !== town.id) continue;
      const weight = station.buildingsCovered * (stationRating(station, world.tick) / 100);
      const share = weight / totalWeight;
      const mailShare =
        totalMailWeight > 0
          ? (weight * (1 + TOWN_MAIL_COMMERCIAL_WEIGHT * station.commercialShare)) / totalMailWeight
          : share;
      // What a town produces is counted whether or not the station could take
      // it: the growth ratio has to divide by the offer, not by the acceptance.
      const offered = passengers * share;
      town.producedThisMonth += offered;
      // The class split of SPEC2 M19: a COMMERCIAL zone offers business
      // travellers, every other zone offers commuters, and the TOTAL is
      // exactly what the town offered before the split. The share is the
      // station's own catchment rather than the town's, which is the whole
      // point of the rule - a stop in the shopping streets sells different
      // tickets from a stop in the suburbs.
      //
      // Commuters are deposited FIRST and business second, out of ONE
      // destination search, so a town with no commercial zone at all - which
      // is what every balancing world of section 19.4 is - costs exactly what
      // the pre-M19 code cost and does exactly what it did (the D-201 device).
      const business = offered * station.commercialShare;
      const commuters = offered - business;
      depositPassengers(world, station, commuters, business);
      // The other half of the SPEC2 M19 return-journey measure: what this town
      // sends out of its own accord, which is what the arrivals are weighed
      // against. A station that already despatches as many travellers as reach
      // it owes nobody a way home - which is what makes every hand-built
      // balancing world of section 19.4 a no-op for that rule.
      notePassengerOffer(station, Cargo.CommuterPax, commuters);
      notePassengerOffer(station, Cargo.BusinessPax, business);
      depositAtStation(world, station, Cargo.Mail, mail * mailShare);
    }
  }
}

/**
 * Book building material that has just been delivered into a merchant's yard.
 *
 * SPEC.md 13.2's `versorgungBau` and, with it, the first thing SPEC.md 7.2's
 * "Baustoffhandel (Senke, treibt Stadtwachstum)" has ever driven: until SPEC2
 * M20 bundle 2 a builders' merchant took cement, consumed it and changed
 * nothing about the town it was built beside.
 *
 * Three decisions, and each of them is a refusal of something easier:
 *
 *  - **it counts what the yard ACCEPTED off the vehicle, not what the yard
 *    later consumes.** The formula says `geliefert.zement+baustoffe`, and a
 *    merchant burns its stock at a flat 200 t a month whatever arrives -
 *    metering the consumption would make a town's building supply a property of
 *    the yard's stock level rather than of the line that serves it. The caller
 *    books `deliverToIndustry`'s return value, so a FULL yard credits nothing:
 *    "accepted" and "delivered to the station" are the same number until the
 *    stock cap bites, and they part company exactly there. That is deliberate -
 *    a lorry tipping cement onto a yard that has nowhere to put it has not
 *    supplied the town with anything;
 *  - **the cargo is whatever the merchant accepts, never a list written here.**
 *    A `BuildersMerchant` takes cement today and this term widens the day its
 *    recipe does, because the caller books what `deliverToIndustry` actually
 *    took (the D-174/D-183 shape: the table IS the enumeration);
 *  - **the nearest centre within `TOWN_BUILDING_MATERIAL_RADIUS` wins, ties on
 *    the lower id.** A yard between two towns supplies one of them, chosen by a
 *    total order over the map and never by the order of the town list (law #3).
 *
 * Allocation-free and off the tick: it is reached only when a vehicle unloads
 * building material at a stop that reaches a merchant.
 */
export function noteBuildingMaterial(world: World, x: number, y: number, units: number): void {
  if (units <= 0) return;
  const towns = world.towns;
  const limitSq = TOWN_BUILDING_MATERIAL_RADIUS * TOWN_BUILDING_MATERIAL_RADIUS;
  let best = -1;
  let bestDistanceSq = 0;

  for (let i = 0; i < towns.length; i++) {
    const town = towns[i]!;
    const dx = town.x - x;
    const dy = town.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > limitSq) continue;
    if (best >= 0 && distanceSq >= bestDistanceSq) continue;
    best = i;
    bestDistanceSq = distanceSq;
  }
  if (best < 0) return;
  towns[best]!.buildingMaterialThisMonth += units;
}

/**
 * SPEC.md 13.2's `firmenRating`: what the council thinks of whoever serves the
 * town, 0..100.
 *
 * The 13.3 council rating is the only company rating this game has, and it
 * already carries exactly what 13.2 wants the growth to depend on - stations in
 * the town, the share of its traffic actually carried, the noise, the houses
 * knocked down, the goodwill bought. `reviewCouncils` runs immediately before
 * `growTowns` in the monthly block, so the figure read here is this month's.
 *
 * With several companies the town has several opinions, and the one that counts
 * is weighted by what each of them CARRIED: a town served by a well regarded
 * operator and touched once by a resented one does not grow at the average of
 * the two. When nothing at all was carried, the best regarded company with a
 * station in the town speaks for it - a town whose stop is idle this month
 * still has an operator - and a town no company serves has no company rating
 * at all, which is the 0.5 floor of the factor.
 */
export function servingCompanyRating(world: World, town: Town): number {
  let carriedTotal = 0;
  let weighted = 0;
  for (let c = 0; c < town.transportedByCompany.length; c++) {
    const carried = town.transportedByCompany[c] ?? 0;
    if (carried <= 0) continue;
    carriedTotal += carried;
    weighted += carried * councilRating(town, c);
  }
  if (carriedTotal > 0) return weighted / carriedTotal;

  let best = -1;
  for (let s = 0; s < world.stations.length; s++) {
    const station = world.stations[s]!;
    if (station.townId !== town.id) continue;
    const rating = councilRating(town, station.ownerId);
    if (rating > best) best = rating;
  }
  return best < 0 ? 0 : best;
}

/**
 * SPEC.md 13.2's `bedarf.elektronik`, verbatim. [tonnes per month]
 *
 * ```
 * bedarf.elektronik = max(0, (einwohner-3000)) / 2500
 * ```
 *
 * The third of the section's three demand scalings, and the one that was
 * missing: until D-235 the code wanted `einwohner / 1800` with no threshold,
 * a formula that is nowhere in SPEC.md and had no entry saying why not. The
 * threshold is the interesting half - a town under three thousand demands
 * nothing at all, so a village is never marked down for radios it has no shop
 * to sell.
 *
 * Pure and exported for the same reason {@link townGrowthRate} is: the
 * milestone's "Formel-Test gegen Handrechnung" checks a term against the
 * specification's own arithmetic rather than against a played world.
 */
export function electronicsWantedFor(population: number): number {
  const above = population - TOWN_ELECTRONICS_MIN_POPULATION;
  return above <= 0 ? 0 : above / TOWN_INHABITANTS_PER_ELECTRONICS;
}

/**
 * SPEC.md 13.2's growth formula, complete and pure. [share per month]
 *
 * ```
 * wachstumsRate = 0.0015
 *   * (1 + 0.55*versorgungPass + 0.45*versorgungWaren
 *        + 0.45*versorgungFood + 0.35*versorgungBau)
 *   * gelaendeFaktor
 *   * (0.5 + 0.5 * firmenRating/100)
 * ```
 *
 * plus the sentence underneath it: "Ohne jede Versorgung schrumpfen Staedte
 * langsam (-0,03 %/Monat)." **That sentence is a BRANCH and not a term**, and
 * it has to be: every factor in the product above is strictly positive, so the
 * formula evaluated at zero supply grows a town that nobody has ever reached.
 * The two halves of 13.2 are only both true if a town with no supply at all
 * takes the flat rate instead of the product - which is what the first line
 * below does, and it is the whole of the shrinkage.
 *
 * Pure on purpose: it takes six numbers and returns one, so the milestone's own
 * Fertig-wenn ("die 13.2-Formel enthaelt alle SPEC-Terme, Formel-Test gegen
 * Handrechnung") can be answered term by term rather than by playing a world
 * and believing the result.
 */
export function townGrowthRate(
  supplyPassengers: number,
  supplyGoods: number,
  supplyFood: number,
  supplyBuilding: number,
  terrainFactor: number,
  companyRating: number,
): number {
  if (supplyPassengers <= 0 && supplyGoods <= 0 && supplyFood <= 0 && supplyBuilding <= 0) {
    return -TOWN_SHRINK_RATE_PER_MONTH;
  }
  return (
    TOWN_GROWTH_BASE_RATE *
    (1 +
      TOWN_GROWTH_PASSENGER_WEIGHT * supplyPassengers +
      TOWN_GROWTH_GOODS_WEIGHT * supplyGoods +
      TOWN_GROWTH_FOOD_WEIGHT * supplyFood +
      TOWN_GROWTH_BUILDING_WEIGHT * supplyBuilding) *
    terrainFactor *
    (TOWN_GROWTH_RATING_FLOOR + (TOWN_GROWTH_RATING_SPAN * companyRating) / 100)
  );
}

/**
 * Roll the twelve-month passenger window and answer `versorgungPass`.
 *
 * The month that has just ended goes INTO the window before the ratio is read,
 * so a town is judged on the year that includes it - the same ordering the
 * industry review of 7.3 uses, and the reason `growTowns` is the last reader of
 * the monthly counters before it clears them.
 *
 * The ratio is of the two MEANS and not the mean of the ratios: a month in
 * which a town produced nothing carries no weight then, where a mean of ratios
 * would count it as a full month of perfect or of hopeless service depending on
 * which convention the empty month took.
 */
function rollPassengerWindow(town: Town): number {
  const months =
    town.supplyMonths < TOWN_SUPPLY_WINDOW_MONTHS
      ? town.supplyMonths + 1
      : TOWN_SUPPLY_WINDOW_MONTHS;
  town.supplyProducedMean += (town.producedThisMonth - town.supplyProducedMean) / months;
  town.supplyTransportedMean += (town.transportedThisMonth - town.supplyTransportedMean) / months;
  town.supplyMonths = months;

  if (town.supplyProducedMean <= 0) return 0;
  const share = town.supplyTransportedMean / town.supplyProducedMean;
  return share > 1 ? 1 : share < 0 ? 0 : share;
}

/**
 * Monthly town growth (section 13.2), complete since SPEC2 M20 bundle 2.
 *
 * All four supply terms exist now: the passenger share over the twelve-month
 * window 13.2 names, the goods and food deliveries of the month that ended, and
 * the building material that reached the town's own merchant. The rate is then
 * scaled by the terrain and by the council's opinion of whoever serves the
 * town, and a town nothing at all reaches shrinks instead of growing.
 *
 * Rounding is what actually moves the population, and it is worth knowing that
 * it has a floor: at -0.03 % a month a town under 1,667 inhabitants rounds back
 * to where it was and does not shrink at all, exactly as a town under 334 does
 * not grow at the base rate. That is the arithmetic of an integer population,
 * not a rule - and it is why a hamlet outlives its bus line.
 */
export function growTowns(world: World): void {
  for (const town of world.towns) {
    const supplyPassengers = rollPassengerWindow(town);

    // The zone economy of SPEC2 M20: which of the town's demands exist at all
    // is a property of what its buildings are zoned as. Counted from the map
    // rather than carried, for `countTownBuildings`' reason one field along -
    // a saved zone census would have to be kept in step with the growth, the
    // shrinkage, the demolition command and every future rule that clears a
    // tile, and a census that drifts silently is what the M14 x-ray was
    // written about.
    countTownZones(world.map, town, town.radius, zoneCensus);
    const zoned =
      zoneCensus[BuildingKind.Residential]! +
      zoneCensus[BuildingKind.Commercial]! +
      zoneCensus[BuildingKind.Industrial]!;
    // A town with no buildings at all reads as fully residential, which is
    // what it was before the zones meant anything: every hand-built world of
    // section 19.4 is all-residential too, so both take exactly the pre-M20
    // arithmetic (the D-201 device).
    const residentialShare = zoned > 0 ? zoneCensus[BuildingKind.Residential]! / zoned : 1;
    const commercialShare = zoned > 0 ? zoneCensus[BuildingKind.Commercial]! / zoned : 0;

    // Demand for the things a town consumes, from section 13.2 and, per zone,
    // from SPEC2 M20: goods are wanted wherever there are people (both zones
    // buy manufactured articles), food only by the houses, and electronics
    // only by the shops. Electronics stays in the GOODS basket on the delivery
    // side - 13.2 has four supply terms and not five, and a town has counted
    // radios as goods since M5 - so what the commercial zone adds is the other
    // half of that basket: a town with shops wants them.
    //
    // All three scalings are 13.2's own since D-235, the electronics one
    // included: `max(0, (einwohner-3000)) / 2500`, which until then was a plain
    // `einwohner / 1800` that appeared nowhere in the specification. The ONE
    // thing here that 13.2 does not say is the commercial SHARE in front of it,
    // and that is SPEC2 M20's zone rule rather than an invention - the entry
    // says so instead of the code implying the specification asked for it.
    const goodsWanted =
      town.population / TOWN_INHABITANTS_PER_GOODS +
      commercialShare * electronicsWantedFor(town.population);
    const foodWanted = (town.population * residentialShare) / TOWN_INHABITANTS_PER_FOOD;
    const buildingWanted = town.population / TOWN_INHABITANTS_PER_BUILDING_MATERIAL;
    const goodsDelivered = town.goodsDeliveredThisMonth + town.electronicsDeliveredThisMonth;
    const supplyGoods = goodsWanted > 0 ? Math.min(1, goodsDelivered / goodsWanted) : 0;
    const supplyFood = foodWanted > 0 ? Math.min(1, town.foodDeliveredThisMonth / foodWanted) : 0;
    const supplyBuilding =
      buildingWanted > 0 ? Math.min(1, town.buildingMaterialThisMonth / buildingWanted) : 0;

    const rate = townGrowthRate(
      supplyPassengers,
      supplyGoods,
      supplyFood,
      supplyBuilding,
      terrainFactorFor(world, town.x, town.y),
      servingCompanyRating(world, town),
    );

    const before = town.population;
    town.population = Math.round(town.population * (1 + rate));
    // The growth milestones of SPEC2 M20, edge-triggered where both figures
    // are in hand - the only place they are - so a town that has been over a
    // threshold for thirty years is one entry rather than three hundred and
    // sixty (`postOnce` is the guard behind that, not the one in front).
    reportTownMilestone(world, town, before);
    town.producedThisMonth = 0;
    town.transportedByCompany.length = 0;
    town.transportedThisMonth = 0;
    town.goodsDeliveredThisMonth = 0;
    town.foodDeliveredThisMonth = 0;
    town.electronicsDeliveredThisMonth = 0;
    town.buildingMaterialThisMonth = 0;
    // The month's street budget of SPEC.md 13.2, cleared with the rest on the
    // convention this function owns: whoever reads a monthly figure resets it.
    // The physical growth itself runs DAILY (`town/growth.ts`, E-10's round
    // robin), which is exactly why the cap needs a counter rather than a flag.
    town.roadTilesThisMonth = 0;
  }
}

/**
 * SPEC.md 13.2's `gelaendeFaktor`: flat ground grows fastest, mountains barely
 * at all - 1.0, 0.6, 0.3.
 *
 * Exported since SPEC2 M20 bundle 2 so the formula test can compose the whole
 * of 13.2 out of its own parts rather than reading one number off a played
 * world and calling it evidence.
 */
export function terrainFactorFor(world: World, x: number, y: number): number {
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
