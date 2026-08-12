import {
  COUNCIL_DEMOLITION_PENALTY,
  COUNCIL_GREEN_BONUS,
  COUNCIL_GREEN_INTENSITY,
  COUNCIL_EXCLUSIVE_COST_CT_PER_HEAD,
  COUNCIL_EXCLUSIVE_MIN_RATING,
  COUNCIL_EXCLUSIVE_MONTHS,
  COUNCIL_GOODWILL_DECAY_PER_MONTH,
  COUNCIL_NOISE_BARRIER_FACTOR,
  COUNCIL_NOISE_MAX,
  COUNCIL_NOISE_PER_TILE,
  COUNCIL_PROFILE_GREEN_FACTOR,
  COUNCIL_PROFILE_NOISE_FACTOR,
  COUNCIL_RATING_NEUTRAL,
  COUNCIL_REFUSAL_RATING,
  COUNCIL_STATION_TARGET,
  COUNCIL_STATION_WEIGHT,
  COUNCIL_TRANSPORT_WEIGHT,
  TICKS_PER_MONTH,
  TOWN_MEASURE_BARRIER_MONTHS,
  TOWN_MEASURE_ROAD_REACH,
  TOWN_MEASURE_ROAD_TILES,
  TOWN_MEASURE_TREE_TILES,
} from '../constants';
import { RoadBit } from './types';
import { Terrain } from '../map/terrain';
import type { Town } from './types';
import { emissionIntensity } from '../economy/emissions';
import { reportCouncil } from '../news/report';
import type { World } from '../World';

/**
 * The town council of section 13.3.
 *
 * A town rates every company from 0 to 100 on four things: how many stations
 * it has inside the town, how much of the town's traffic it actually carries,
 * how much track it has laid through the streets, and what it has knocked down
 * to get there. Two of those are service and two are nuisance, which is the
 * whole point - a company can be indispensable and still be resented.
 *
 * The rating is RECOMPUTED every month from the map and the traffic, plus a
 * `goodwill` term that carries what the company has DONE: campaigns bought,
 * trees planted, houses demolished. Only the goodwill is remembered, and it
 * decays - a campaign that never wore off would mean buying a town once and
 * owning it for the century, and a grudge that never faded would mean one
 * cleared house costing a company the town for ever.
 */

/**
 * Which kind of council is sitting (SPEC2 M20).
 *
 * A profile does not add a term to the rating; it reweights two that were
 * always there. That is the whole design: an election changes what a town
 * MINDS, not what a company did, so the same network is worth a different
 * rating under a different council and nothing about the company had to move.
 */
export const CouncilProfile = {
  Balanced: 0,
  Green: 1,
  Business: 2,
} as const;
export type CouncilProfile = (typeof CouncilProfile)[keyof typeof CouncilProfile];

export const COUNCIL_PROFILE_COUNT = 3;

/** Translation keys for the profiles, indexed by CouncilProfile. */
export const COUNCIL_PROFILE_KEYS: readonly string[] = [
  'council.profile.balanced',
  'council.profile.green',
  'council.profile.business',
];

/** The measures of section 13.3, in the order their constants are indexed. */
export const TownMeasure = {
  PlantTrees: 0,
  FundRoads: 1,
  AdvertiseSmall: 2,
  AdvertiseMedium: 3,
  AdvertiseLarge: 4,
  /** SPEC2 M20: pay towards the stops this company runs in the town. */
  SponsorStations: 5,
  /** SPEC2 M20: a wall along the line, which halves the noise term. */
  NoiseBarrier: 6,
} as const;
export type TownMeasure = (typeof TownMeasure)[keyof typeof TownMeasure];

export const TOWN_MEASURE_COUNT = 7;

/** Translation keys for the measures, indexed by TownMeasure. */
export const TOWN_MEASURE_KEYS: readonly string[] = [
  'council.measure.trees',
  'council.measure.roads',
  'council.measure.adSmall',
  'council.measure.adMedium',
  'council.measure.adLarge',
  'council.measure.sponsor',
  'council.measure.barrier',
];

/** Is this tile inside the built-up area of a town? Returns the town, or null. */
export function townAt(world: World, tile: number): Town | null {
  const id = world.map.townId[tile]!;
  if (id < 0) return null;
  return world.towns[id] ?? null;
}

/** What the council thinks of one company, 0..100. */
export function councilRating(town: Town, companyId: number): number {
  return town.councilRating[companyId] ?? COUNCIL_RATING_NEUTRAL;
}

/**
 * May this company build here?
 *
 * Two separate refusals, and they read differently on purpose: below the
 * threshold the council will not have you, and while somebody holds exclusive
 * rights it will not have anybody else.
 */
export function councilRefusal(world: World, tile: number): string | null {
  const town = townAt(world, tile);
  if (town === null) return null;
  const companyId = world.company.id;

  if (town.exclusiveCompanyId >= 0 && town.exclusiveCompanyId !== companyId) {
    if (world.tick < town.exclusiveUntilTick) return 'cmd.reject.exclusiveRights';
  }
  if (councilRating(town, companyId) < COUNCIL_REFUSAL_RATING) return 'cmd.reject.councilRefuses';
  return null;
}

/** Price of twelve months of exclusive rights in this town. [cent] */
export function exclusiveRightsCostCt(world: World, town: Town): number {
  return world.costCt(town.population * COUNCIL_EXCLUSIVE_COST_CT_PER_HEAD);
}

/** Record that a company knocked a building down here. */
export function bookDemolition(world: World, tile: number): void {
  const town = townAt(world, tile);
  if (town === null) return;
  const id = world.company.id;
  town.councilGoodwill[id] = (town.councilGoodwill[id] ?? 0) - COUNCIL_DEMOLITION_PENALTY;
}

/** Add goodwill a measure bought. */
export function addGoodwill(town: Town, companyId: number, points: number): void {
  town.councilGoodwill[companyId] = (town.councilGoodwill[companyId] ?? 0) + points;
}

/** How many stations this company runs inside this town. */
export function stationsInTown(world: World, town: Town, companyId: number): number {
  let stations = 0;
  for (let s = 0; s < world.stations.length; s++) {
    const station = world.stations[s]!;
    if (station.ownerId === companyId && station.townId === town.id) stations++;
  }
  return stations;
}

/** Put a paid-for noise barrier up for the next two years (SPEC2 M20). */
export function raiseNoiseBarrier(world: World, town: Town, companyId: number): void {
  town.noiseBarrierUntilTick[companyId] =
    world.tick + TOWN_MEASURE_BARRIER_MONTHS * TICKS_PER_MONTH;
}

/** Is this company's barrier still standing here? */
export function noiseBarrierStanding(world: World, town: Town, companyId: number): boolean {
  return world.tick < (town.noiseBarrierUntilTick[companyId] ?? 0);
}

/**
 * Plant trees on bare ground inside the town (section 13.3).
 *
 * Scanned in tile order rather than at random: the effect has to be the same
 * for the same world, and a measure whose result depended on the RNG would
 * move every later draw in the game.
 */
export function plantTrees(world: World, town: Town): number {
  const map = world.map;
  let planted = 0;

  for (let dy = -town.radius; dy <= town.radius && planted < TOWN_MEASURE_TREE_TILES; dy++) {
    for (let dx = -town.radius; dx <= town.radius && planted < TOWN_MEASURE_TREE_TILES; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const tile = map.tileIndex(x, y);
      if (map.terrain[tile] !== Terrain.Grass) continue;
      if (map.roadBits[tile] !== 0 || map.trackBits[tile] !== 0) continue;
      if (map.buildingKind[tile] !== 0 || map.industryId[tile] !== -1) continue;

      map.terrain[tile] = Terrain.Forest;
      planted++;
    }
  }
  if (planted > 0) map.revision++;
  return planted;
}

/**
 * Pay for new streets: public road on bare ground next to the town's existing
 * network (section 13.3).
 *
 * The tiles stay PUBLIC. The company paid for them but did not build them -
 * they are the town's streets, and a company that could own a town's roads by
 * funding them could lock every competitor out without going near the council.
 */
export function fundRoads(world: World, town: Town): number {
  const map = world.map;
  const reach = town.radius + TOWN_MEASURE_ROAD_REACH;
  let laid = 0;

  for (let dy = -reach; dy <= reach && laid < TOWN_MEASURE_ROAD_TILES; dy++) {
    for (let dx = -reach; dx <= reach && laid < TOWN_MEASURE_ROAD_TILES; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const tile = map.tileIndex(x, y);
      if (map.roadBits[tile] !== 0 || map.trackBits[tile] !== 0) continue;
      if (map.buildingKind[tile] !== 0 || map.industryId[tile] !== -1) continue;
      if (map.terrain[tile] === Terrain.Water) continue;
      if (map.slopeAt(x, y) !== 0) continue;
      if (!joinsExistingRoad(world, x, y)) continue;

      connectToNeighbours(world, x, y);
      map.terrain[tile] = Terrain.TownGround;
      laid++;
    }
  }
  if (laid > 0) map.revision++;
  return laid;
}

const ROAD_NEIGHBOURS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-1, 0, RoadBit.West, RoadBit.East],
  [1, 0, RoadBit.East, RoadBit.West],
  [0, -1, RoadBit.North, RoadBit.South],
  [0, 1, RoadBit.South, RoadBit.North],
];

function joinsExistingRoad(world: World, x: number, y: number): boolean {
  const map = world.map;
  for (const [dx, dy] of ROAD_NEIGHBOURS) {
    if (!map.contains(x + dx, y + dy)) continue;
    if (map.roadBits[map.tileIndex(x + dx, y + dy)] !== 0) return true;
  }
  return false;
}

function connectToNeighbours(world: World, x: number, y: number): void {
  const map = world.map;
  const tile = map.tileIndex(x, y);

  for (const [dx, dy, here, there] of ROAD_NEIGHBOURS) {
    if (!map.contains(x + dx, y + dy)) continue;
    const neighbour = map.tileIndex(x + dx, y + dy);
    if (map.roadBits[neighbour] === 0) continue;
    map.roadBits[tile] = map.roadBits[tile]! | here;
    map.roadBits[neighbour] = map.roadBits[neighbour]! | there;
  }
}

/**
 * Recompute every town's opinion of every company. Called from the monthly
 * hook, AFTER the traffic counters have been read and before they are cleared.
 */
export function reviewCouncils(world: World): void {
  for (let t = 0; t < world.towns.length; t++) {
    const town = world.towns[t]!;

    if (town.exclusiveCompanyId >= 0 && world.tick >= town.exclusiveUntilTick) {
      town.exclusiveCompanyId = -1;
      town.exclusiveUntilTick = 0;
    }

    for (let c = 0; c < world.companies.length; c++) {
      const goodwill = (town.councilGoodwill[c] ?? 0) * COUNCIL_GOODWILL_DECAY_PER_MONTH;
      town.councilGoodwill[c] = goodwill;
      town.councilRating[c] = ratingFor(world, town, c, goodwill);
    }
    reportCouncil(world, town);
  }
}

/**
 * What one council thinks of one company, 0..100 (section 13.3).
 *
 * Exported since SPEC2 M20 so the election test can measure the SHIFT rather
 * than a played population: the milestone's Fertig-wenn is "ein Wahlergebnis
 * die Ratsgewichte nachweislich verschiebt", and what shifts is this function's
 * answer for an unchanged company on an unchanged map.
 *
 * The two profile factors multiply the two terms SPEC2 names and nothing else.
 * Both are exactly 1 for a balanced council, which every town is born with and
 * stays for ever in a world with the elections rule off - so the whole
 * mechanism is arithmetically absent from a world that did not ask for it.
 */
export function ratingFor(world: World, town: Town, companyId: number, goodwill: number): number {
  const service =
    Math.min(1, stationsInTown(world, town, companyId) / COUNCIL_STATION_TARGET) *
    COUNCIL_STATION_WEIGHT;

  const carried = town.transportedByCompany[companyId] ?? 0;
  const share = town.producedThisMonth > 0 ? Math.min(1, carried / town.producedThisMonth) : 0;

  // The cap is applied to the WEIGHTED noise, not before it: a green council
  // that doubled a term already held at 25 would double nothing, and the
  // profile has to be able to reach the towns where a company laid most track.
  const barrier = noiseBarrierStanding(world, town, companyId) ? COUNCIL_NOISE_BARRIER_FACTOR : 1;
  const noiseWeight = COUNCIL_PROFILE_NOISE_FACTOR[town.councilProfile] ?? 1;
  const noise = Math.min(
    COUNCIL_NOISE_MAX,
    townTrackTiles(world, town, companyId) * COUNCIL_NOISE_PER_TILE * noiseWeight * barrier,
  );

  // A council rewards a clean fleet, which is the third leg of section 14.3 -
  // the levy is the stick, the grant pays for the change, and this is what a
  // town thinks of a company that made it.
  const intensity = world.emissions ? emissionIntensity(world, companyId) : -1;
  const greenWeight = COUNCIL_PROFILE_GREEN_FACTOR[town.councilProfile] ?? 1;
  const green =
    intensity >= 0 && intensity <= COUNCIL_GREEN_INTENSITY ? COUNCIL_GREEN_BONUS * greenWeight : 0;

  const raw =
    COUNCIL_RATING_NEUTRAL + service + share * COUNCIL_TRANSPORT_WEIGHT - noise + green + goodwill;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Track tiles this company laid inside the town's built-up area.
 *
 * Exported since SPEC2 M20: the noise barrier refuses a company with no track
 * here, and it has to ask the same question the noise term answers - a second
 * definition of "noise this company makes" would let a wall be sold beside a
 * line the rating does not charge for.
 */
export function townTrackTiles(world: World, town: Town, companyId: number): number {
  const map = world.map;
  let tiles = 0;

  for (let dy = -town.radius; dy <= town.radius; dy++) {
    for (let dx = -town.radius; dx <= town.radius; dx++) {
      const x = town.x + dx;
      const y = town.y + dy;
      if (!map.contains(x, y)) continue;
      const tile = map.tileIndex(x, y);
      if (map.trackBits[tile] === 0) continue;
      if (map.owner[tile] !== companyId) continue;
      tiles++;
    }
  }
  return tiles;
}

/** Grant exclusive rights for the next twelve months. */
export function grantExclusiveRights(world: World, town: Town, companyId: number): void {
  town.exclusiveCompanyId = companyId;
  town.exclusiveUntilTick = world.tick + COUNCIL_EXCLUSIVE_MONTHS * TICKS_PER_MONTH;
}

/** True when this company may buy exclusive rights here right now. */
export function mayBuyExclusiveRights(world: World, town: Town, companyId: number): boolean {
  if (town.exclusiveCompanyId >= 0 && world.tick < town.exclusiveUntilTick) return false;
  return councilRating(town, companyId) >= COUNCIL_EXCLUSIVE_MIN_RATING;
}
