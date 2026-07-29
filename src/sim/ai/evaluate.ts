import { Cargo } from '../cargo/types';
import { deliveryRevenueCt } from '../cargo/payment';
import {
  AI_MAX_DISTANCE,
  AI_MIN_DISTANCE,
  AI_CHAIN_BONUS,
  AI_PRODUCING_SINK_PENALTY,
  AI_RIVAL_PENALTY,
  ROAD_COST_PER_TILE_CT,
  STATION_CATCHMENT_SCAN_RADIUS,
} from '../constants';
import { pickRoadVehicle, pickTrain } from './build';
import { industrySpec, type Industry } from '../industry/types';
import { RAIL_TYPE_COST_CT, RailType } from '../map/track';
import { Personality } from './types';
import type { World } from '../World';

/**
 * Step 1 of the decision cycle of section 15: what is worth building.
 *
 * Every pair of a source and a sink between fifteen and a hundred and twenty
 * tiles apart is scored by what it would earn against what it would cost, and
 * the best one is what the company tries to build. The scoring is the ONLY
 * thing a difficulty level is allowed to change - the prices, the credit limit
 * and the commands are the player's.
 */

export interface Opportunity {
  /** Tile the goods start from and the tile they go to. */
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly cargo: number;
  readonly distance: number;
  /** Rough monthly revenue if the line ran full. [cent] */
  readonly revenueCtPerMonth: number;
  /** Rough cost of laying it, before vehicles. [cent] */
  readonly buildCostCt: number;
  /** Revenue per unit of capital. The number the list is sorted by. */
  readonly score: number;
  /** Whether the personality would lay rail for it. */
  readonly rail: boolean;
}

/** Tile distance the way everything else in this game measures it. */
function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/** Does anybody already have a station within reach of this tile? */
function servedByAnyone(world: World, x: number, y: number): boolean {
  for (const station of world.stations) {
    const dx = station.x - x;
    const dy = station.y - y;
    if (dx * dx + dy * dy <= STATION_CATCHMENT_SCAN_RADIUS * STATION_CATCHMENT_SCAN_RADIUS) {
      return true;
    }
  }
  return false;
}

/** The output an industry makes that somebody else wants. */
function outputOf(industry: Industry): number {
  const outputs = industrySpec(industry.type).outputs;
  return outputs.length > 0 ? outputs[0]! : -1;
}

/**
 * Score every source-and-sink pair this personality would consider, best
 * first.
 *
 * The list is built and sorted rather than scanned for a maximum, because the
 * builder walks down it: the best pair is often unbuildable - a mountain, a
 * competitor's exclusive rights, no route - and the second best is a perfectly
 * good railway.
 */
export function opportunities(
  world: World,
  personality: number,
  companyId: number,
): Opportunity[] {
  const found: Opportunity[] = [];
  const rail = personality === Personality.Rail || personality === Personality.Expansive;

  // The town specialist works passengers between towns; everybody else works
  // industry. Both of them will deliver finished goods into a town, because a
  // town is the one sink in the game that cannot shut down.
  if (personality === Personality.TownNetwork) collectTownPairs(world, found, rail);
  else collectIndustryPairs(world, found, rail, companyId);
  collectTownDeliveries(world, found, rail, companyId);

  // Drop anything nothing on the market can carry. In 1950 there is no
  // refrigerated lorry, so every food line scores beautifully and is
  // unbuildable - and a competitor that keeps picking those builds nothing at
  // all for the first twenty years of the game.
  const carriable = new Map<number, boolean>();
  const buildable = found.filter((opportunity) => {
    const key = opportunity.cargo * 2 + (opportunity.rail ? 1 : 0);
    let allowed = carriable.get(key);
    if (allowed === undefined) {
      allowed = opportunity.rail
        ? pickTrain(world, opportunity.cargo).length > 0
        : pickRoadVehicle(world, opportunity.cargo) >= 0;
      carriable.set(key, allowed);
    }
    return allowed;
  });

  // A total order: score first, then the tiles, so two pairs that score the
  // same are still ranked the same way in every run (law #14).
  buildable.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.fromX !== b.fromX) return a.fromX - b.fromX;
    if (a.fromY !== b.fromY) return a.fromY - b.fromY;
    if (a.toX !== b.toX) return a.toX - b.toX;
    return a.toY - b.toY;
  });
  return buildable;
}

/**
 * Can this works actually be a SOURCE right now?
 *
 * A primary industry makes its output out of the ground and always can. A
 * factory makes nothing at all until something is delivered to it, and stays
 * at nothing for ever if nobody does - so a line built to collect from one is
 * a line that runs empty until it is closed as unprofitable.
 *
 * That is not a hypothetical. Measured on balancing scenario 5, the first
 * company built a railway from a furniture works nobody supplied to the town
 * next door, ran a locomotive up and down it for six months carrying nothing,
 * and never recovered.
 *
 * The exception is a works WE supply, which is the second leg of a chain and
 * the most valuable thing there is to build.
 */
function canSupply(world: World, works: Industry, companyId: number): boolean {
  if (industrySpec(works.type).inputs.length === 0) return true;
  if (works.outputStock0 > 0 || works.producedThisMonth > 0) return true;
  return weSupply(world, works, companyId);
}

function collectIndustryPairs(
  world: World,
  into: Opportunity[],
  rail: boolean,
  companyId: number,
): void {
  for (const source of world.industries) {
    if (!source.open) continue;
    if (!canSupply(world, source, companyId)) continue;
    const cargo = outputOf(source);
    if (cargo < 0) continue;

    for (const sink of world.industries) {
      if (sink.id === source.id || !sink.open) continue;
      if (!industrySpec(sink.type).inputs.includes(cargo as Cargo)) continue;
      if (sink.landmassId !== source.landmassId) continue;

      const distance = tileDistance(source.x, source.y, sink.x, sink.y);
      if (distance < AI_MIN_DISTANCE || distance > AI_MAX_DISTANCE) continue;
      const terminal = industrySpec(sink.type).outputs.length === 0;
      // A works that produces something shuts down in twenty-four months if
      // nobody collects it, and takes the line feeding it with it. So a pair
      // ending at one is only offered when the NEXT leg is there to be built -
      // otherwise the competitor is choosing a line that is going to die.
      if (!terminal && !onwardLegExists(world, sink)) continue;
      into.push(
        rate(world, source.x, source.y, sink.x, sink.y, cargo, distance, rail, terminal, {
          chain: weSupply(world, source, companyId),
        }),
      );
    }
  }
}

function collectTownPairs(world: World, into: Opportunity[], rail: boolean): void {
  for (let a = 0; a < world.towns.length; a++) {
    for (let b = a + 1; b < world.towns.length; b++) {
      const from = world.towns[a]!;
      const to = world.towns[b]!;
      const distance = tileDistance(from.x, from.y, to.x, to.y);
      if (distance < AI_MIN_DISTANCE || distance > AI_MAX_DISTANCE) continue;
      into.push(rate(world, from.x, from.y, to.x, to.y, Cargo.Passengers, distance, rail, true));
    }
  }
}

/**
 * Could the chain be carried on past this works?
 *
 * Somewhere open, on the same land, inside the range a competitor builds over,
 * that accepts what this works makes. A town counts: it takes finished goods
 * and it never closes.
 */
function onwardLegExists(world: World, works: Industry): boolean {
  const cargo = outputOf(works);
  if (cargo < 0) return false;
  if (cargo === Cargo.Goods || cargo === Cargo.Food) return world.towns.length > 0;

  for (const next of world.industries) {
    if (next.id === works.id || !next.open) continue;
    if (next.landmassId !== works.landmassId) continue;
    if (!industrySpec(next.type).inputs.includes(cargo as Cargo)) continue;
    const distance = tileDistance(works.x, works.y, next.x, next.y);
    if (distance >= AI_MIN_DISTANCE && distance <= AI_MAX_DISTANCE) return true;
  }
  return false;
}

/**
 * Finished goods into a town (section 7.2).
 *
 * A town never closes, never runs out of demand and never has to be collected
 * from, which makes it the only sink a competitor can build to without also
 * having to build whatever comes after it.
 */
function collectTownDeliveries(
  world: World,
  into: Opportunity[],
  rail: boolean,
  companyId: number,
): void {
  for (const source of world.industries) {
    if (!source.open) continue;
    const cargo = outputOf(source);
    if (cargo !== Cargo.Goods && cargo !== Cargo.Food) continue;
    // Finished goods come out of a factory, and a factory nobody supplies
    // makes none of them.
    if (!canSupply(world, source, companyId)) continue;

    for (const town of world.towns) {
      const distance = tileDistance(source.x, source.y, town.x, town.y);
      if (distance < AI_MIN_DISTANCE || distance > AI_MAX_DISTANCE) continue;
      into.push(
        rate(world, source.x, source.y, town.x, town.y, cargo, distance, rail, true, {
          chain: weSupply(world, source, companyId),
        }),
      );
    }
  }
}

/** Do we already deliver INTO this works? Then its output is our next leg. */
function weSupply(world: World, industry: Industry, companyId: number): boolean {
  for (const station of world.stations) {
    if (station.ownerId !== companyId) continue;
    if (station.servedIndustries.includes(industry.id)) return true;
  }
  return false;
}

/**
 * What a pair is worth.
 *
 * The revenue figure is deliberately crude - one full load a day at the tariff
 * for the distance. It does not have to be right; it has to RANK correctly, and
 * a company that picks the second best line still builds a sensible railway.
 */
function rate(
  world: World,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  cargo: number,
  distance: number,
  rail: boolean,
  terminalSink: boolean,
  flags: { readonly chain: boolean } = { chain: false },
): Opportunity {
  const load = rail ? AI_RAIL_LOAD_UNITS : AI_ROAD_LOAD_UNITS;
  const perTrip = deliveryRevenueCt({
    cargo: cargo as Cargo,
    amount: load,
    distanceTiles: distance,
    ticksInTransit: 0,
    hasCooling: false,
    year: world.date.year,
  });
  // Trips a month, from a round trip at roughly fifty km/h - one tile is fifty
  // metres, a day is two hundred ticks, and the rest is arithmetic.
  const tripsPerMonth = Math.max(1, Math.round(AI_TILES_PER_MONTH / (distance * 2)));
  const revenueCtPerMonth = perTrip * tripsPerMonth;

  const perTile = rail ? RAIL_TYPE_COST_CT[RailType.Plain]! : ROAD_COST_PER_TILE_CT;
  const buildCostCt = world.costCt(distance * perTile);

  // A pair somebody already serves is worth less, not nothing: section 15 asks
  // for existing service to be taken into account, and a competitor's stop at
  // one end of a good chain does not make the chain bad.
  let score = revenueCtPerMonth / Math.max(1, buildCostCt);
  if (servedByAnyone(world, fromX, fromY)) score *= AI_RIVAL_PENALTY;
  if (servedByAnyone(world, toX, toY)) score *= AI_RIVAL_PENALTY;
  if (!terminalSink) score *= AI_PRODUCING_SINK_PENALTY;
  // The onward leg of a chain we already feed is the most valuable thing there
  // is to build, and the easiest thing to overlook: without it the works we
  // supply shuts down and takes our own line with it.
  if (flags.chain) score *= AI_CHAIN_BONUS;

  return { fromX, fromY, toX, toY, cargo, distance, revenueCtPerMonth, buildCostCt, score, rail };
}

/** Units a train and a lorry are assumed to shift per trip, for the estimate. */
const AI_RAIL_LOAD_UNITS = 120;
const AI_ROAD_LOAD_UNITS = 20;

/** Tiles a vehicle covers in a game month at a typical line speed. */
const AI_TILES_PER_MONTH = 1_200;
