import { Cargo, isPassengerClass } from '../cargo/types';
import { deliveryRevenueCt, timeFactor } from '../cargo/payment';
import {
  AI_DRAIN_MARGIN,
  AI_LIFT_REAL_SHARE,
  AI_MAX_DISTANCE,
  AI_MAX_VEHICLES_PER_LINE,
  AI_MIN_ARRIVAL_FACTOR,
  AI_MIN_DISTANCE,
  AI_CHAIN_BONUS,
  AI_PRODUCING_SINK_PENALTY,
  AI_LORRY_PRICE_CT,
  AI_PLATFORM_TILES,
  AI_RAIL_MAX_TRAINS,
  AI_RIVAL_PENALTY,
  AI_TICKS_PER_TILE,
  AI_TILES_PER_MONTH,
  AI_TOWN_OUTPUT_SHARE,
  AI_TRAIN_PRICE_CT,
  RAIL_DEPOT_COST_CT,
  RAIL_PLATFORM_COST_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  ROAD_COST_PER_TILE_CT,
  CARGO_MAX_WAIT_DAYS,
  STATION_CATCHMENT_SCAN_RADIUS,
  TICKS_PER_DAY,
} from '../constants';
import { pickRoadVehicle, pickTrain } from './build';
import { capacityFor, vehicleSpec } from '../vehicles/catalog';
import { industryBaseOutput, industrySpec, type Industry } from '../industry/types';
import type { Town } from '../town/types';
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
  /**
   * What the source makes in a month, at today's level. [units/month]
   * The fleet advisor divides the round time by the interval at which a full
   * vehicle must leave to lift exactly this (stage C2, E-06).
   */
  readonly monthlyOutput: number;
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

/**
 * What this works makes in a month at its current level.
 *
 * The cap on what any line out of it can carry, however many vehicles are put
 * on it - and the number the estimate was missing.
 */
function expectedOutput(world: World, industry: Industry): number {
  return (industryBaseOutput(industry, world.tick) * industry.productionLevel) / 100;
}

/**
 * Passengers a town offers in a month.
 *
 * Deliberately generous: a town is the one source in the game that cannot shut
 * down or run dry, and what actually limits a passenger line is the station
 * rating rather than the town.
 */
function townOutput(town: Town): number {
  return town.population * AI_TOWN_OUTPUT_SHARE;
}

/** The output an industry makes that somebody else wants. */
function outputOf(industry: Industry): number {
  const outputs = industrySpec(industry.type).outputs;
  return outputs.length > 0 ? outputs[0]! : -1;
}

/**
 * Does most of a FRESH load's value survive the drive?
 *
 * A feasibility gate over one-way transit time at the nominal speed, NOT a
 * pricing term - D-122 tried pricing the decay into the revenue quote and
 * reverted it, and that verdict stands (see the `ticksInTransit: 0` note in
 * `rate`). What the gate removes is the pair no ranking should ever see:
 * measured on the scenario-5 trace, the top road candidate was a 123-tile
 * grain haul whose 44-day drive left 0.46 of the value before the station
 * queue had aged the load at all, and every vehicle put on it earned the
 * 10 % floor. Coal at the same distance keeps 0.94 and passes.
 */
function arrivesAlive(cargo: number, distance: number): boolean {
  const oneWayDays = (distance * AI_TICKS_PER_TILE) / TICKS_PER_DAY;
  return timeFactor(cargo as Cargo, oneWayDays) >= AI_MIN_ARRIVAL_FACTOR;
}

/**
 * What the catchment of a station offers per month of the given cargo - the
 * recompute-from-store twin of the figures the collectors below feed `rate`,
 * for the stages of a project that run AFTER the stations exist (D-108: each
 * stage observes the world, it never trusts the plan).
 */
export function stationMonthlyOutput(
  world: World,
  station: { readonly townId: number; readonly servedIndustries: readonly number[] },
  cargo: number,
): number {
  // A passenger vehicle carries BOTH classes (D-207), so the offer of either
  // one is the town's whole passenger output - which is what it was before
  // SPEC2 M19 split the fares.
  if (isPassengerClass(cargo)) {
    const town = world.towns[station.townId];
    return town === undefined ? 0 : townOutput(town);
  }
  let output = 0;
  for (const industryId of station.servedIndustries) {
    const industry = world.industries.find((entry) => entry.id === industryId);
    if (industry === undefined || !industry.open) continue;
    if (outputOf(industry) !== cargo) continue;
    output += expectedOutput(world, industry);
  }
  return output;
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

  // The town specialist works passengers between towns exclusively; the road
  // personality works BOTH - section 15 step 1 says "alle Paare (Quelle,
  // Senke)", and a town is a source. Measured on the scenario-5 trace (512
  // map, seed 4711): industry pairs alone left the road company exactly ONE
  // candidate on the whole map - the 1950 lorry catalogue carries only bulk,
  // and the filter cascade ate everything else - so its first failed line was
  // also its last. Forty towns were sitting there the entire time, and
  // "Lorries and buses, short hauls" is the personality's own definition.
  // Rail and the two temperaments keep their industry focus: that is what
  // keeps the five distinguishable.
  if (personality === Personality.TownNetwork) collectTownPairs(world, found, rail);
  else collectIndustryPairs(world, found, rail, companyId);
  if (personality === Personality.Road) collectTownPairs(world, found, rail);
  collectTownDeliveries(world, found, rail, companyId);

  // Drop anything nothing on the market can carry. In 1950 there is no
  // refrigerated lorry, so every food line scores beautifully and is
  // unbuildable - and a competitor that keeps picking those builds nothing at
  // all for the first twenty years of the game.
  //
  // And drop any pair whose queue would ROT. A source that outproduces the
  // largest allowed fleet does not merely cap the revenue - loading takes the
  // oldest cargo first (the M5 rule), so a pile the vehicles can never drain
  // pins at the write-off horizon and every unit actually carried is a month
  // stale. Whether that matters is the CARGO's affair: measured on the
  // scenario-5 trace, six buses running FULL both ways between two large
  // towns earned a fifth of scenario 1's rate - passengers a month old pay
  // the floor - while balancing scenario 2's own coal line runs under-lifted
  // for ever and is IN BAND, because coal a month old pays face value. So an
  // oversupplied pair is rejected only when a load as old as the pinned queue
  // plus the drive would arrive below the same survival threshold the fresh
  // gate uses. The lift figure is the REAL capacity of the vehicle the
  // builder will pick, not the estimate's nominal load (20 units where the
  // 1950 bus lifts 150), corrected by the real-round factor - and ONLY that
  // one. The first version also multiplied in AI_TAKT_UTILISATION, and the
  // double discount priced the largest fleet at a QUARTER of its physical
  // lift: every large-town pair on the map failed the gate, and the road
  // company was left with the two smallest pairs of forty towns. Utilisation
  // is a SIZING headroom (how big a fleet to buy), never a bound on what a
  // full fleet can physically drain.
  const carriable = new Map<number, number>();
  const buildable = found.filter((opportunity) => {
    const key = opportunity.cargo * 2 + (opportunity.rail ? 1 : 0);
    let liftUnits = carriable.get(key);
    if (liftUnits === undefined) {
      if (opportunity.rail) {
        liftUnits = 0;
        for (const specId of pickTrain(world, opportunity.cargo)) {
          liftUnits += capacityFor(vehicleSpec(specId), opportunity.cargo as Cargo);
        }
      } else {
        const specId = pickRoadVehicle(world, opportunity.cargo);
        liftUnits = specId >= 0 ? capacityFor(vehicleSpec(specId), opportunity.cargo as Cargo) : 0;
      }
      carriable.set(key, liftUnits);
    }
    if (liftUnits <= 0) return false;
    const roundsPerMonth = AI_TILES_PER_MONTH / (2 * opportunity.distance);
    const cap = opportunity.rail ? AI_RAIL_MAX_TRAINS : AI_MAX_VEHICLES_PER_LINE;
    const maxLift = cap * liftUnits * roundsPerMonth * AI_LIFT_REAL_SHARE;
    // The fleet must OUT-lift a decaying source, not merely match it: a pile
    // it can never eat pins at a month of age and pays the floor for ever
    // (AI_DRAIN_MARGIN records the measured case).
    if (opportunity.monthlyOutput * AI_DRAIN_MARGIN <= maxLift) return true;
    const staleDays =
      CARGO_MAX_WAIT_DAYS +
      (opportunity.distance * AI_TICKS_PER_TILE) / TICKS_PER_DAY / AI_LIFT_REAL_SHARE;
    return timeFactor(opportunity.cargo as Cargo, staleDays) >= AI_MIN_ARRIVAL_FACTOR;
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
      if (!arrivesAlive(cargo, distance)) continue;
      const terminal = industrySpec(sink.type).outputs.length === 0;
      // A works that produces something shuts down in twenty-four months if
      // nobody collects it, and takes the line feeding it with it. So a pair
      // ending at one is only offered when the NEXT leg is there to be built -
      // otherwise the competitor is choosing a line that is going to die.
      if (!terminal && !onwardLegExists(world, sink)) continue;
      into.push(
        rate(
          world,
          source.x,
          source.y,
          sink.x,
          sink.y,
          cargo,
          distance,
          rail,
          terminal,
          expectedOutput(world, source),
          { chain: weSupply(world, source, companyId) },
        ),
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
      if (!arrivesAlive(Cargo.CommuterPax, distance)) continue;
      // A town's passengers are its own production, and it never runs dry.
      // The output is the LARGER end: a passenger line loads at both stops,
      // so the bigger town is what the fleet has to lift - gating on the
      // smaller one let a village pair the AI's buses with a city whose
      // queue they could never drain, and the city's stale pile set the
      // whole line's revenue (measured on the scenario-5 trace).
      into.push(
        rate(
          world,
          from.x,
          from.y,
          to.x,
          to.y,
          Cargo.CommuterPax,
          distance,
          rail,
          true,
          Math.max(townOutput(from), townOutput(to)),
        ),
      );
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
      if (!arrivesAlive(cargo, distance)) continue;
      into.push(
        rate(
          world,
          source.x,
          source.y,
          town.x,
          town.y,
          cargo,
          distance,
          rail,
          true,
          expectedOutput(world, source),
          { chain: weSupply(world, source, companyId) },
        ),
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
  monthlyOutput: number,
  flags: { readonly chain: boolean } = { chain: false },
): Opportunity {
  const load = rail ? AI_RAIL_LOAD_UNITS : AI_ROAD_LOAD_UNITS;
  /*
   * Round trips a month, and this is where a competitor's judgement lives.
   *
   * FRACTIONAL, deliberately. It used to be floored at one, which said that a
   * line of any length manages at least a trip a month - so an eighty tile
   * line and a twenty tile line were credited with the same cadence and the
   * long one won on revenue per trip every time. Measured: one train on an
   * eighty-two tile line made two deliveries in six months and the line was
   * closed as unprofitable, having been chosen for exactly that reason.
   *
   * With the floor gone, throughput falls as 1/distance while the revenue of a
   * single trip grows only sub-linearly with it - which is the real economics
   * of the thing, and it makes a competitor build lines its one train can
   * actually work.
   */
  const tripsPerMonth = AI_TILES_PER_MONTH / (distance * 2);

  /*
   * What the line would actually MOVE in a month, which is the smaller of two
   * things: what the vehicles can lift, and what the source makes.
   *
   * Leaving the second one out is what made a short line look like free money.
   * The estimate assumed every trip left full, so a line that turns round three
   * times a month was credited with three full trains - from a mine that makes
   * one train's worth. With the cap, a line long enough to be throughput-bound
   * and one short enough to be production-bound are both valued honestly, and
   * the best line is the one in between.
   */
  const carriedPerMonth = Math.min(load * tripsPerMonth, monthlyOutput);
  const revenueCtPerMonth = deliveryRevenueCt({
    cargo: cargo as Cargo,
    amount: carriedPerMonth,
    distanceTiles: distance,
    /*
     * Fresh, and this is a deliberate optimism rather than an oversight.
     *
     * Charging the estimate for the decay a long haul really suffers was tried
     * and MEASURED: every line then rated so poorly that the road company built
     * nothing for twenty-five years and finished on 422 000 instead of 973 000.
     * The estimate is a RANKING, and the decay term does not change the order
     * of two candidates nearly as much as it depresses all of them below the
     * threshold at which anything gets built at all.
     */
    ticksInTransit: 0,
    hasCooling: false,
    year: world.date.year,
  });

  /*
   * The whole bill, not just the rails.
   *
   * Track cost is the only part that scales with distance; the stops, the shed
   * and the vehicles are the same money whether the line is fifteen tiles or
   * sixty. Counting only the track made a short line look nearly free and sent
   * a competitor to build the shortest thing on the map - measured, and it cost
   * the road company two thirds of its twenty-five year value.
   */
  // TWICE the rail per-tile cost: the AI lays a one-way oval since stage C2 -
  // an outbound and a return track - so the way genuinely costs double.
  const perTile = rail ? RAIL_TYPE_COST_CT[RailType.Plain]! * 2 : ROAD_COST_PER_TILE_CT;
  const buildCostCt = world.costCt(distance * perTile);

  /*
   * What the line costs ALTOGETHER, for the score only.
   *
   * Deliberately not folded into `buildCostCt`, which is the WAY and nothing
   * else: the builder adds the stops, the shed and the vehicles to it when it
   * asks whether the company can afford the project, and a figure that already
   * contained them would be counted twice - measured, and it put every rail
   * line permanently out of reach.
   *
   * The score needs the full figure all the same. Track is the only part that
   * scales with distance; everything else is the same money on a fifteen tile
   * line as on a sixty tile one, and scoring against the rails alone made the
   * shortest line on the map look like the best one.
   */
  const fixedCt = rail
    ? RAIL_PLATFORM_COST_CT * AI_PLATFORM_TILES * 2 + RAIL_DEPOT_COST_CT + AI_TRAIN_PRICE_CT
    : ROAD_STOP_COST_CT * 2 + ROAD_DEPOT_COST_CT + AI_LORRY_PRICE_CT;
  const wholeCostCt = buildCostCt + world.costCt(fixedCt);

  // A pair somebody already serves is worth less, not nothing: section 15 asks
  // for existing service to be taken into account, and a competitor's stop at
  // one end of a good chain does not make the chain bad.
  let score = revenueCtPerMonth / Math.max(1, wholeCostCt);
  if (servedByAnyone(world, fromX, fromY)) score *= AI_RIVAL_PENALTY;
  if (servedByAnyone(world, toX, toY)) score *= AI_RIVAL_PENALTY;
  if (!terminalSink) score *= AI_PRODUCING_SINK_PENALTY;
  // The onward leg of a chain we already feed is the most valuable thing there
  // is to build, and the easiest thing to overlook: without it the works we
  // supply shuts down and takes our own line with it.
  if (flags.chain) score *= AI_CHAIN_BONUS;

  return {
    fromX,
    fromY,
    toX,
    toY,
    cargo,
    distance,
    revenueCtPerMonth,
    buildCostCt,
    score,
    rail,
    monthlyOutput,
  };
}

/** Units a train and a lorry are assumed to shift per trip, for the estimate. */
const AI_RAIL_LOAD_UNITS = 120;
const AI_ROAD_LOAD_UNITS = 20;

