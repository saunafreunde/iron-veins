import {
  COUNCIL_DEMOLITION_PENALTY,
  COUNCIL_EXCLUSIVE_COST_CT_PER_HEAD,
  COUNCIL_EXCLUSIVE_MIN_RATING,
  COUNCIL_EXCLUSIVE_MONTHS,
  COUNCIL_GOODWILL_DECAY_PER_MONTH,
  COUNCIL_NOISE_MAX,
  COUNCIL_NOISE_PER_TILE,
  COUNCIL_RATING_NEUTRAL,
  COUNCIL_REFUSAL_RATING,
  COUNCIL_STATION_TARGET,
  COUNCIL_STATION_WEIGHT,
  COUNCIL_TRANSPORT_WEIGHT,
  TICKS_PER_MONTH,
  TOWN_MEASURE_ROAD_REACH,
  TOWN_MEASURE_ROAD_TILES,
  TOWN_MEASURE_TREE_TILES,
} from '../constants';
import { RoadBit } from './types';
import { Terrain } from '../map/terrain';
import type { Town } from './types';
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

/** The measures of section 13.3, in the order their constants are indexed. */
export const TownMeasure = {
  PlantTrees: 0,
  FundRoads: 1,
  AdvertiseSmall: 2,
  AdvertiseMedium: 3,
  AdvertiseLarge: 4,
} as const;
export type TownMeasure = (typeof TownMeasure)[keyof typeof TownMeasure];

export const TOWN_MEASURE_COUNT = 5;

/** Translation keys for the measures, indexed by TownMeasure. */
export const TOWN_MEASURE_KEYS: readonly string[] = [
  'council.measure.trees',
  'council.measure.roads',
  'council.measure.adSmall',
  'council.measure.adMedium',
  'council.measure.adLarge',
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

function ratingFor(world: World, town: Town, companyId: number, goodwill: number): number {
  let stations = 0;
  for (let s = 0; s < world.stations.length; s++) {
    const station = world.stations[s]!;
    if (station.ownerId === companyId && station.townId === town.id) stations++;
  }
  const service = Math.min(1, stations / COUNCIL_STATION_TARGET) * COUNCIL_STATION_WEIGHT;

  const carried = town.transportedByCompany[companyId] ?? 0;
  const share = town.producedThisMonth > 0 ? Math.min(1, carried / town.producedThisMonth) : 0;

  const noise = Math.min(COUNCIL_NOISE_MAX, noiseTiles(world, town, companyId) * COUNCIL_NOISE_PER_TILE);

  const raw =
    COUNCIL_RATING_NEUTRAL + service + share * COUNCIL_TRANSPORT_WEIGHT - noise + goodwill;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Track tiles this company laid inside the town's built-up area. */
function noiseTiles(world: World, town: Town, companyId: number): number {
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
