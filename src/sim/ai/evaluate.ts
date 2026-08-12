import { Cargo, CARGO_COUNT, isPassengerClass } from '../cargo/types';
import { deliveryRevenueCt, timeFactor } from '../cargo/payment';
import { economyOutputFactor, economyRateFactor } from '../economy/curve';
import {
  AI_DRAIN_MARGIN,
  AI_LIFT_REAL_SHARE,
  AI_MAX_DISTANCE,
  AI_MAX_VEHICLES_PER_LINE,
  AI_MAX_VEHICLES_PER_LINE_ERA,
  AI_MIN_ARRIVAL_FACTOR,
  AI_MIN_DISTANCE,
  AI_MIN_PROFIT_MARGIN,
  AI_SERVICE_INTERVAL_MIN_TICKS,
  AI_TAKT_UTILISATION,
  TICKS_PER_MONTH,
  AI_CHAIN_BONUS,
  AI_PRODUCING_SINK_PENALTY,
  AI_LORRY_PRICE_CT,
  AI_PLATFORM_TILES,
  AI_RAIL_PROJECTED_TRACKS,
  AI_RAIL_PROJECTED_TRAINS,
  AI_RIVAL_PENALTY,
  AI_TICKS_PER_TILE,
  AI_TILES_PER_MONTH,
  AI_TOWN_OUTPUT_SHARE,
  AI_TRAIN_PRICE_CT,
  MONTHS_PER_YEAR,
  RAIL_DEPOT_COST_CT,
  RAIL_DEPOT_UPKEEP_CT,
  RAIL_PLATFORM_COST_CT,
  RAIL_PLATFORM_UPKEEP_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_DEPOT_UPKEEP_CT,
  ROAD_STOP_COST_CT,
  ROAD_STOP_UPKEEP_CT,
  ROAD_COST_PER_TILE_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  CARGO_MAX_WAIT_DAYS,
  STATION_CATCHMENT_SCAN_RADIUS,
  START_YEAR,
  MapClimate,
  TICKS_PER_DAY,
} from '../constants';
import { adviseFleet } from '../lines/metrics';
import { pickRoadVehicle, pickTrain } from './build';
import { availableVehicles, capacityFor, VehicleKind, vehicleSpec } from '../vehicles/catalog';
import { industryBaseOutput, industrySpec, type Industry } from '../industry/types';
import type { Town } from '../town/types';
import { RAIL_TYPE_COST_CT, RAIL_TYPE_UPKEEP_CT, RailType } from '../map/track';
import { subsidyRateFor } from '../economy/subsidies';
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
  /**
   * What the WHOLE line is offered in a month, both ends together.
   * [units/month]
   *
   * Deliberately not `monthlyOutput`, which is the LARGER end and is the
   * figure a fleet has to be sized against (the queue that has to be kept
   * drained is one queue). A passenger line loads at both stops and is paid
   * for both, so what it EARNS is the sum - and the profitability floor of
   * `projectLine` is about earnings, not about sizing. For a freight pair
   * there is one source and the two figures are the same number.
   */
  readonly offeredPerMonth: number;
  /**
   * What the state pays for this relation, as a multiple of the tariff (SPEC2
   * M21), or exactly 1 where nothing is on offer.
   *
   * Carried on the opportunity rather than looked up twice, so `rate`'s ranking
   * and `projectLine`'s floor are quoted for the SAME offer. It is asked
   * without claiming - a competitor that merely considered a relation has not
   * won the race for it.
   */
  readonly subsidyFactor: number;
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
  return (
    (industryBaseOutput(
      industry,
      world.tick,
      economyOutputFactor(world.economyCurve, world.date.year),
    ) *
      industry.productionLevel) /
    100
  );
}

/**
 * Passengers a town offers in a month.
 *
 * Deliberately generous: a town is the one source in the game that cannot shut
 * down, and what actually limits a passenger line is the station rating rather
 * than the town.
 *
 * It CAN run dry slowly, and that sentence used to say it could not: since
 * SPEC2 M20 bundle 2 a town nobody serves loses 0.03 % of its people a month
 * (SPEC.md 13.2), so the figure this reads falls while the candidate sits
 * unbuilt. That is a real economic signal and not a defect - a business that
 * has been worth building for twenty years and never was is worth less by then
 * - and it is measured: on seed 4711 the town-pair business stops clearing
 * `AI_MIN_PROFIT_MARGIN`, and the line the AI used to build there was losing
 * its owner 157,262 EUR (the trace is in `tests/balance/aiGame.spec.ts`).
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
 *
 * **A mode preference is not a vow of poverty** (D-222). The two rail
 * personalities used to see their pairs priced as railways and as nothing
 * else, and on a generated map that is regularly an empty list: the AI's
 * railway is two platforms, a shed and a double way (D-153's one-way oval),
 * and past roughly eighty tiles that bill beats what two trains can lift.
 * Measured at game start over the eight sweep seeds, with the distance window
 * already opened to the economic horizon: the same industry pairs pay by road
 * on **14** counts and by rail on **6**, and on 4711, 4712, 4714 and 12345 the
 * rail list is empty while a road line on the identical pair projects
 * 1.83-2.56 against the 1.25 floor. So a personality whose PREFERRED mode
 * offers nothing that pays looks at the same pairs on the other one, and only
 * then. It is safe in a way it was not before D-221: what comes back is
 * filtered by the profitability floor like everything else, so the fallback
 * can only offer lines that pay - the experiment that widened the offer while
 * the offer still lost money was measured at -3,123,753 EUR.
 *
 * It runs one way only, and that is measured too: **no** town pair on any of
 * the eight seeds pays as a railway (0 of 780 per seed, best margin 0.07), and
 * the industry pairs that pay by rail are a subset of those that pay by road,
 * so a road personality falling back to rail would find nothing. An
 * unconditional both-modes list would also make the five personalities one
 * personality, which is what they exist not to be.
 */
export function opportunities(world: World, personality: number, companyId: number): Opportunity[] {
  const prefersRail = personality === Personality.Rail || personality === Personality.Expansive;
  const preferred = collectFor(world, personality, companyId, prefersRail);
  if (preferred.length > 0 || !prefersRail) return preferred;
  return collectFor(world, personality, companyId, false);
}

function collectFor(
  world: World,
  personality: number,
  companyId: number,
  rail: boolean,
): Opportunity[] {
  const found: Opportunity[] = [];

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
  if (personality === Personality.TownNetwork) collectTownPairs(world, found, rail, companyId);
  else collectIndustryPairs(world, found, rail, companyId);
  if (personality === Personality.Road) collectTownPairs(world, found, rail, companyId);
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
  //
  // And drop any pair that CANNOT PAY, which is the floor this list never had
  // (AI_MIN_PROFIT_MARGIN carries the measurement it comes from). `score` is a
  // ratio with no bottom, so before this the best of a list of loss-makers
  // ranked exactly as a good line would, and `startProject` - which asks only
  // whether the company can AFFORD a build - built it. The test sits HERE
  // rather than only in the builder because the builder walks a fixed number
  // of candidates: measured on scenario 5, a floor applied in `startProject`
  // alone left the refused town pairs sitting at the top of the ranking for
  // ever and the road company did not reach its coal pair until game year
  // nine (1,156,463 -> 1,022,084 EUR). Dropped from the LIST, the pairs that
  // pay rise into the candidates the builder actually tries.
  //
  // It is the real vehicle and the real fleet that are quoted, never the
  // ranking's nominal figures: D-219a measured a floor built out of `rate`'s
  // own 20-unit lorry load and it stopped the AI building anything at all.
  const carriable = new Map<number, number[]>();
  const buildable = found.filter((opportunity) => {
    const key = opportunity.cargo * 2 + (opportunity.rail ? 1 : 0);
    let specIds = carriable.get(key);
    if (specIds === undefined) {
      specIds = opportunity.rail
        ? pickTrain(world, opportunity.cargo)
        : [pickRoadVehicle(world, opportunity.cargo)];
      if (specIds.length > 0 && specIds[0]! < 0) specIds = [];
      carriable.set(key, specIds);
    }
    const liftUnits = loadUnitsOf(specIds, opportunity.cargo);
    if (liftUnits <= 0) return false;
    const roundsPerMonth = AI_TILES_PER_MONTH / (2 * opportunity.distance);
    // The largest fleet the line will REALLY get, which on rail is
    // AI_RAIL_PROJECTED_TRAINS and not AI_RAIL_MAX_TRAINS: the second train
    // exists only on the one-way oval, and the oval does not fit on generated
    // terrain (measured, ten railways of ten - the constant carries the
    // count). Both the drain gate and the profitability floor below are quoted
    // for it, because they are two halves of one question about one line.
    const cap = opportunity.rail
      ? AI_RAIL_PROJECTED_TRAINS
      : roadFleetCap(opportunity.cargo, specIds);
    const maxLift = cap * liftUnits * roundsPerMonth * AI_LIFT_REAL_SHARE;
    // The fleet must OUT-lift a decaying source, not merely match it: a pile
    // it can never eat pins at a month of age and pays the floor for ever
    // (AI_DRAIN_MARGIN records the measured case).
    if (opportunity.monthlyOutput * AI_DRAIN_MARGIN > maxLift) {
      const staleDays =
        CARGO_MAX_WAIT_DAYS +
        (opportunity.distance * AI_TICKS_PER_TILE) / TICKS_PER_DAY / AI_LIFT_REAL_SHARE;
      if (timeFactor(opportunity.cargo as Cargo, staleDays) < AI_MIN_ARRIVAL_FACTOR) return false;
    }

    const fleet = fleetFor(
      2 * opportunity.distance * AI_TICKS_PER_TILE,
      liftUnits,
      opportunity.monthlyOutput,
      cap,
    );
    return projectLine(world, opportunity, specIds, fleet).margin >= AI_MIN_PROFIT_MARGIN;
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
          { chain: weSupply(world, source, companyId), companyId },
        ),
      );
    }
  }
}

function collectTownPairs(
  world: World,
  into: Opportunity[],
  rail: boolean,
  companyId: number,
): void {
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
          // A bus line loads at BOTH stops and is paid for both, so what it
          // earns is the sum of the two towns; what its fleet has to keep
          // drained is the larger one alone. Two different questions, two
          // different figures - see `Opportunity.offeredPerMonth`.
          { offeredPerMonth: townOutput(from) + townOutput(to), companyId },
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
          { chain: weSupply(world, source, companyId), companyId },
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
  flags: {
    readonly chain?: boolean;
    readonly offeredPerMonth?: number;
    readonly companyId?: number;
  } = {},
): Opportunity {
  // Looked up ONCE and carried on the opportunity, so the ranking estimate and
  // the profitability floor below cannot see two different offers for the same
  // relation - the D-219 lesson about a filter and the builder it filters for.
  // `claim` is false: looking at a subsidy may never win it.
  const subsidyFactor = subsidyRateFor(
    world,
    flags.companyId ?? -1,
    fromX,
    fromY,
    toX,
    toY,
    cargo,
    false,
  );
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
    epochYears: world.epochYears,
    // The century (SPEC2 M21): a competitor that ranked a coal line in 2035
    // by 1950's coal price would build the one line the world has stopped
    // paying for. Exactly 1 in a world without the rule.
    //
    // And the subsidy board beside it, at the same seam and asking WITHOUT
    // claiming: a relation the state is paying double for has to rank as what
    // it would really earn, or the one lever that can move a competitor which
    // refuses unprofitable work (D-221, D-229) would be invisible to it.
    rateFactor: economyRateFactor(world.economyCurve, cargo, world.date.year) * subsidyFactor,
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
  if (flags.chain === true) score *= AI_CHAIN_BONUS;

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
    offeredPerMonth: flags.offeredPerMonth ?? monthlyOutput,
    subsidyFactor,
  };
}

/** Units a train and a lorry are assumed to shift per trip, for the estimate. */
const AI_RAIL_LOAD_UNITS = 120;
const AI_ROAD_LOAD_UNITS = 20;

/** Units one vehicle of this composition lifts of the cargo. */
export function loadUnitsOf(specIds: readonly number[], cargo: number): number {
  let units = 0;
  for (const specId of specIds) units += capacityFor(vehicleSpec(specId), cargo as Cargo);
  return units;
}

/**
 * The lift the 1950 catalogue's own road vehicle gives for a cargo, by cargo.
 *
 * Built on first use from the catalogue with `pickRoadVehicle`'s own rule -
 * the biggest capacity on the market that carries the load - asked in
 * START_YEAR. Derived rather than written down, so a catalogue edit moves it
 * on the same commit; built once, because it is a pure function of a `const`
 * table.
 */
let referenceLift: Int32Array | null = null;

function referenceLiftOf(cargo: number): number {
  if (referenceLift === null) {
    const table = new Int32Array(CARGO_COUNT);
    for (const spec of availableVehicles(VehicleKind.Road, START_YEAR, MapClimate.Temperate)) {
      for (let one = 0; one < CARGO_COUNT; one++) {
        const capacity = capacityFor(spec, one as Cargo);
        if (capacity > table[one]!) table[one] = capacity;
      }
    }
    referenceLift = table;
  }
  return referenceLift[cargo] ?? 0;
}

/**
 * Most road vehicles this competitor will put on ONE line - the cap read as a
 * LIFT rather than as a count (D-250).
 *
 * {@link AI_MAX_VEHICLES_PER_LINE} is six, and six is what every AI band in
 * the project was measured with. It is a lift only while the vehicle is the
 * one it was measured on: six 1950 omnibuses are 900 seats a round, six 1850
 * omnibuses are 270, and the drain gate and the profitability floor are both
 * quoted against that number. Measured on seed 987,654 at 1850 - the identical
 * world, the identical towns, the identical pairs - every large town pair
 * failed the drain gate and every pair that survived it projected at most
 * 0.834 against the 1.25 floor, so THREE competitors issued zero commands in
 * six game years.
 *
 * So an ERA vehicle - one the pre-1950 catalogue holds, `introYear <
 * START_YEAR`, the same named rule D-245 gates that catalogue with - gets as
 * many vehicles as give the lift six of the 1950 vehicle for the same cargo
 * would, up to {@link AI_MAX_VEHICLES_PER_LINE_ERA}.
 *
 * **A 1950 world is untouched by construction, not by measurement**: the era
 * catalogue closes in 1949, so no spec available from START_YEAR on can enter
 * the branch below, and the function returns the bare constant for every year
 * the game has ever been balanced in. `tests/unit/aiEraFleet.spec.ts` asserts
 * that over every cargo and every year from 1950 to 2050.
 *
 * Rail is deliberately NOT scaled. {@link AI_RAIL_MAX_TRAINS} is a SIGNALLING
 * limit - two trains are what the one-way oval was proved deadlock-free with
 * (D-153) - and a third steam engine on that ring buys waiting, not lift.
 */
export function roadFleetCap(cargo: number, specIds: readonly number[]): number {
  let era = false;
  for (let i = 0; i < specIds.length; i++) {
    if (vehicleSpec(specIds[i]!).introYear < START_YEAR) era = true;
  }
  if (!era) return AI_MAX_VEHICLES_PER_LINE;

  const lift = loadUnitsOf(specIds, cargo);
  const reference = referenceLiftOf(cargo);
  if (lift <= 0 || reference <= lift) return AI_MAX_VEHICLES_PER_LINE;

  const scaled = Math.round((AI_MAX_VEHICLES_PER_LINE * reference) / lift);
  if (scaled > AI_MAX_VEHICLES_PER_LINE_ERA) return AI_MAX_VEHICLES_PER_LINE_ERA;
  return scaled < AI_MAX_VEHICLES_PER_LINE ? AI_MAX_VEHICLES_PER_LINE : scaled;
}

/**
 * How many vehicles a line needs, and the takt it will run: THE fleet advisor
 * of section 12.3 - `adviseFleet` in lines/metrics.ts, literally the same
 * function the line panel shows the player (E-06; this is what replaced the
 * old `AI_VEHICLES_PER_LINE = 1`).
 *
 * Two advisor calls, one question each. The FLEET is sized against the
 * interval the traffic demands - how often a departure planned
 * AI_TAKT_UTILISATION full must leave to lift what the source makes in a
 * month, floored at one a day - and the TAKT is then the fleet's own natural
 * spacing, round / fleet, NOT that demand interval. The first version fed the
 * demand interval straight into SetLineTakt, and the trace showed why that
 * strangles a line: a small pair's interval was thirty days, so a fleet whose
 * natural cadence was a departure every eighteen days was THROTTLED to one a
 * month, the pile never drained below a month of age, and oldest-first served
 * every passenger at the 10 % floor - 255 EUR in five months, closed by its
 * own review. The takt exists here to de-bunch the fleet (bought in one tick,
 * it runs as a convoy - measured: six lorries delivered as one), never to
 * slow it down.
 *
 * The advisor divides the REAL round, and the caller only knows the nominal
 * one - about half of what the vehicles then drive (AI_LIFT_REAL_SHARE, the
 * measured ratio). Sizing on the nominal figure fields half the fleet the
 * traffic needs, and the queue the sizing was meant to drain never drains.
 *
 * It lives here rather than beside its two callers because the profitability
 * floor below has to be quoted for the fleet the line will REALLY get, and a
 * second copy of this arithmetic is how a filter and the builder it filters
 * for drift apart (the D-219 lesson, one file along).
 */
export function fleetFor(
  roundTicks: number,
  loadUnits: number,
  monthlyOutput: number,
  cap: number,
): number {
  const realRound = roundTicks / AI_LIFT_REAL_SHARE;
  const interval = Math.max(
    AI_SERVICE_INTERVAL_MIN_TICKS,
    (loadUnits * AI_TAKT_UTILISATION * TICKS_PER_MONTH) / (monthlyOutput > 1 ? monthlyOutput : 1),
  );
  const demanded = adviseFleet(realRound, interval);
  const wanted = demanded === null ? 1 : demanded.vehiclesNeeded;
  return wanted < 1 ? 1 : wanted > cap ? cap : wanted;
}

/** What a line would earn and what it would cost to keep, per month. [cent] */
export interface LineProjection {
  readonly revenueCtPerMonth: number;
  /** Vehicle upkeep AND the stops, the shed and the way it adds. [cent/month] */
  readonly upkeepCtPerMonth: number;
  /** revenue / upkeep. Below 1 the line loses money by construction. */
  readonly margin: number;
}

/**
 * Will this line PAY? - the absolute test beside `rate`'s ratio.
 *
 * `rate` scores `revenue / capital`, which is a RANKING: it orders candidates
 * and has no floor, so the best of a bad list still looks like the best thing
 * on the map. `startProject` then asked only whether the company could AFFORD
 * the build. Nothing anywhere asked whether the line would cover its own
 * costs, and the trace says what that produced: one competitor spent about
 * 460,000 of its 500,000 start capital in twenty-four months on twenty-nine
 * stations, 643 road tiles and fifty-eight buses grossing under 800 EUR a
 * month against roughly 76 EUR a month of upkeep PER BUS.
 *
 * Three things make this different from the ranking estimate, and D-219a
 * measured why each is needed - a floor built out of `rate`'s own figures was
 * tried there and stopped the AI building anything at all (+3.1 M, ten of
 * twelve companies with no station), because `rate` quotes a NOMINAL 20-unit
 * lorry load where the 1950 bus lifts 150:
 *
 *  1. **The real vehicle and the real fleet.** `specIds` is what the builder
 *     will actually buy and `fleet` is what the 12.3 advisor sized, so the
 *     capacity term is the one the line will really have - and on rail that
 *     means AI_RAIL_PROJECTED_TRAINS over AI_RAIL_PROJECTED_TRACKS, the
 *     single-track fallback the builder really lays, not the oval it asks for
 *     first (D-222; it used to quote two trains over a double way, and the
 *     line that was priced was never the line that got built).
 *  2. **The real round.** Rounds a month are quoted at AI_LIFT_REAL_SHARE of
 *     the nominal speed - the measured ratio - on both the capacity and the
 *     decay side.
 *  3. **The decay is charged.** D-122's verdict that decay must stay out of
 *     the RANKING stands and is untouched; it was about ordering candidates,
 *     and depressing every score equally cannot change an order. A floor is
 *     exactly the place the honest arrival value belongs.
 *
 * The cost side is the whole of what the line adds to the monthly bill: the
 * fleet's upkeep, the two stops, the shed, and the way. It is deliberately
 * NOT folded into `Opportunity.buildCostCt` - that field is the WAY and
 * nothing else, because the builder adds the stops, the shed and the vehicles
 * to it when it asks whether the company can afford the project, and a figure
 * that already contained them would be counted twice (D-121, measured: it put
 * every rail line permanently out of reach).
 *
 * The way's upkeep is quoted over the straight-line distance. The road really
 * laid is at least that long and usually longer, but the part of it that runs
 * over a town's own public street is free - the two errors point in opposite
 * directions and the straight line is between them.
 */
export function projectLine(
  world: World,
  opportunity: Opportunity,
  specIds: readonly number[],
  fleet: number,
): LineProjection {
  let liftUnits = 0;
  let upkeepCtPerYear = 0;
  for (const specId of specIds) {
    const spec = vehicleSpec(specId);
    liftUnits += capacityFor(spec, opportunity.cargo as Cargo);
    upkeepCtPerYear += spec.upkeepCtPerYear;
  }

  const roundsPerMonth = (AI_TILES_PER_MONTH * AI_LIFT_REAL_SHARE) / (2 * opportunity.distance);
  const lift = fleet * liftUnits * roundsPerMonth;
  const carried = lift < opportunity.offeredPerMonth ? lift : opportunity.offeredPerMonth;
  const oneWayTicks = (opportunity.distance * AI_TICKS_PER_TILE) / AI_LIFT_REAL_SHARE;
  const revenueCtPerMonth = deliveryRevenueCt({
    cargo: opportunity.cargo as Cargo,
    amount: carried,
    distanceTiles: opportunity.distance,
    ticksInTransit: oneWayTicks,
    hasCooling: false,
    epochYears: world.epochYears,
    // The century, at the second of this file's two payment estimates - and
    // the subsidy the ranking already looked up, read off the opportunity
    // rather than asked again.
    rateFactor:
      economyRateFactor(world.economyCurve, opportunity.cargo, world.date.year) *
      opportunity.subsidyFactor,
  });

  const modulesCt = opportunity.rail
    ? RAIL_PLATFORM_UPKEEP_CT * AI_PLATFORM_TILES * 2 + RAIL_DEPOT_UPKEEP_CT
    : ROAD_STOP_UPKEEP_CT * 2 + ROAD_DEPOT_UPKEEP_CT;
  // `rate` charges TWICE the per-tile figure for rail because D-153's one-way
  // oval is an outbound and a return track. The PROJECTION charges
  // AI_RAIL_PROJECTED_TRACKS, because the oval is what the builder would like
  // to lay and the single track is what it lays: measured over eight seeds and
  // twenty-five years each, every railway the AI built was the fallback
  // (D-222). Where the oval does fit, the line beats its own projection, which
  // is the safe direction for a floor to be wrong in.
  const wayCt = opportunity.rail
    ? RAIL_TYPE_UPKEEP_CT[RailType.Plain]! * opportunity.distance * AI_RAIL_PROJECTED_TRACKS
    : ROAD_UPKEEP_PER_TILE_CT * opportunity.distance;
  const upkeepCtPerYear2 = upkeepCtPerYear * fleet + modulesCt + wayCt;
  const upkeepCtPerMonth = world.costCt(upkeepCtPerYear2 / MONTHS_PER_YEAR);

  return {
    revenueCtPerMonth,
    upkeepCtPerMonth,
    margin: upkeepCtPerMonth > 0 ? revenueCtPerMonth / upkeepCtPerMonth : 0,
  };
}
