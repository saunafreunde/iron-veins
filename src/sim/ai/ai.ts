import { CommandKind } from '../commands/types';
import { CommandQueue } from '../commands/queue';
import {
  AI_BUILD_CAPITAL_FACTOR,
  AI_CANDIDATES_TRIED,
  AI_LIFT_REAL_SHARE,
  AI_CASH_RESERVE_CT,
  AI_DECISION_INTERVAL_TICKS,
  AI_LINE_REVIEW_TICKS,
  AI_MAX_LINES,
  AI_MAX_VEHICLES_PER_LINE,
  AI_PLATFORM_TILES,
  AI_RAIL_MAX_TRAINS,
  AI_REINFORCE_WAITING,
  AI_RETRY_TICKS,
  AI_TICKS_PER_TILE,
  LOAN_STEP_CT,
  RAIL_DEPOT_COST_CT,
  RAIL_PLATFORM_COST_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  STATION_CATCHMENT_SCAN_RADIUS,
  TAKT_MAX_TICKS,
  TAKT_MIN_TICKS,
  TICKS_PER_YEAR,
} from '../constants';
import { loanLimitCt } from '../economy/company';
import { lineVehicles } from '../lines/metrics';
import type { Station } from '../station/types';
import { aggregateConsist } from '../vehicles/consist';
import { OrderLoad, OrderTarget, OrderUnload, VehicleState } from '../vehicles/VehicleStore';
import { VehicleKind } from '../vehicles/spec';
import { vehicleSpec } from '../vehicles/catalog';
import {
  depotTileNear,
  enqueueInfrastructure,
  pickRoadVehicle,
  pickTrain,
  stopTileNear,
} from './build';
import { fleetFor, loadUnitsOf, opportunities, stationMonthlyOutput } from './evaluate';
import { Personality, type AiState } from './types';
import type { World } from '../World';

/**
 * The decision cycle of section 15.
 *
 * Four steps every four hundred ticks, staggered so that no two competitors
 * ever think in the same tick. Everything a competitor does it does by
 * enqueueing the PLAYER'S commands for the next tick, stamped with its own
 * company - which is what makes an AI build indistinguishable from a player's:
 * same route assistant, same prices, same refusals, and all of it in the
 * replay log.
 *
 * A line is built over FOUR cycles rather than one (DECISIONS.md D-108). The
 * AI cannot know what a command will produce - which station id, which
 * vehicle id, which LINE id - while the command is still queued, so each
 * stage observes what the previous one left behind. Since M11 (E-06) the
 * lines themselves are the real Line entities of section 12.2, opened with
 * `CreateLine`, scheduled with `SetLineOrders` and crewed with
 * `AssignVehicleToLine` - the exact commands the player's panel sends. A
 * route the assistant refused, a stop the council blocked or a purchase there
 * was no money for simply ends the project, rather than leaving the AI
 * convinced it owns a railway.
 */

/** Run whichever competitors are due. Called once per tick. */
export function updateAi(world: World, queue: CommandQueue): void {
  for (let index = 0; index < world.ai.length; index++) {
    const state = world.ai[index]!;
    if (world.tick < state.nextDecisionTick) continue;
    state.nextDecisionTick = world.tick + AI_DECISION_INTERVAL_TICKS;

    if (world.companyOf(state.companyId).bankrupt) continue;
    decide(world, queue, state);
  }
}

function decide(world: World, queue: CommandQueue, state: AiState): void {
  if (state.project !== null) {
    advanceProject(world, queue, state);
    return;
  }
  // Look after what is running before building anything new: a company that
  // only ever expands ends up with a network it cannot crew.
  if (optimise(world, queue, state)) return;
  startProject(world, queue, state);
}

// ---------------------------------------------------------------- new lines

/**
 * The takt for a fleet that actually got bought: its own even spacing over
 * the estimated real round, inside the SetLineTakt bounds. By construction
 * `adviseFleet(realRound, taktTicks)` gives the same fleet back - the E-06
 * formula and the takt agree about the line.
 */
function taktFor(roundTicks: number, crew: number): number {
  const realRound = roundTicks / AI_LIFT_REAL_SHARE;
  return Math.min(TAKT_MAX_TICKS, Math.max(TAKT_MIN_TICKS, Math.round(realRound / crew)));
}

/**
 * Does one of this company's stations already reach that tile? DELIBERATELY
 * every station it owns, not only the ones its living lines call at: the
 * stations of a line the review closed keep standing (a player's would too),
 * and a pair between two of those ghosts is a pair this company has ALREADY
 * tried and lost money on. Restricting the scan to living lines was tried
 * and measured on the scenario-5 trace: the review closed a losing line and
 * the very next cycle rebuilt the same pair between the same dead stations -
 * six fresh buses, six more months of losses, for ever, at about 20,000 EUR
 * a cycle. The standing stations are the AI's "do not return" memory, and
 * they cost nothing to keep: no saved list, no expiry clock, no new state
 * (Z4 satisfied by the map itself).
 */
function servedByUs(world: World, companyId: number, x: number, y: number): boolean {
  for (const station of world.stations) {
    if (station.ownerId !== companyId) continue;
    const dx = station.x - x;
    const dy = station.y - y;
    if (dx * dx + dy * dy <= STATION_CATCHMENT_SCAN_RADIUS * STATION_CATCHMENT_SCAN_RADIUS) {
      return true;
    }
  }
  return false;
}

function startProject(world: World, queue: CommandQueue, state: AiState): void {
  if (world.lines.ownedBy(state.companyId).length >= AI_MAX_LINES) return;
  if (world.tick - state.lastBuildTick < AI_RETRY_TICKS) return;

  const company = world.companyOf(state.companyId);
  const candidates = opportunities(world, state.personality, state.companyId);
  const tried = Math.min(candidates.length, AI_CANDIDATES_TRIED);

  for (let index = 0; index < tried; index++) {
    const opportunity = candidates[index]!;

    // A pair this company already has stations at BOTH ends of is not a new
    // line: either it is served - reinforcement's job, not a project's - or
    // it was served, failed its review, and the standing stations are the
    // graveyard marker (see servedByUs). Without this the road company
    // measured on the scenario-5 trace opened three lines between the same
    // two stations and starved all of them: the pile is one pile, and every
    // extra schedule on it dilutes revenue per vehicle while tripling the
    // upkeep.
    if (
      servedByUs(world, state.companyId, opportunity.fromX, opportunity.fromY) &&
      servedByUs(world, state.companyId, opportunity.toX, opportunity.toY)
    ) {
      continue;
    }

    // Section 15: build when capital is at least 1.4 times the estimate. The
    // expansive personality borrows to get there; the conservative one wants a
    // larger reserve and never goes near the credit line.
    const specIds = opportunity.rail
      ? pickTrain(world, opportunity.cargo)
      : [pickRoadVehicle(world, opportunity.cargo)];
    if (specIds.length === 0 || specIds[0]! < 0) continue;

    // The fleet the advisor would put on it (E-06), from the same nominal
    // speed the ranking uses; the stage that BUYS re-derives the figure from
    // the stations that then exist and the railway that was actually laid.
    const wanted = fleetFor(
      2 * opportunity.distance * AI_TICKS_PER_TILE,
      loadUnitsOf(specIds, opportunity.cargo),
      opportunity.monthlyOutput,
      opportunity.rail ? AI_RAIL_MAX_TRAINS : AI_MAX_VEHICLES_PER_LINE,
    );

    // WILL IT PAY? - the question this cycle never asked - is settled BEFORE
    // the list gets here: `opportunities` drops every pair whose projected
    // revenue does not clear the whole monthly bill it creates by
    // AI_MIN_PROFIT_MARGIN, quoted for this same vehicle and this same fleet
    // (`projectLine`). Everything from here on is the separate question of
    // whether the company can AFFORD to lay it.

    // The estimate is the WHOLE project: the way, the two stops, the depot and
    // the vehicles that have to run on it.
    //
    // It used to count only the track, and that was not a rounding error - the
    // company spent everything it had on the railway and then could not afford
    // the platform at the far end, so the project was abandoned with the money
    // gone and the track still charging upkeep. Measured on balancing scenario
    // 5: one such attempt in game year two finished the company.
    let fleetCt = 0;
    for (const specId of specIds) fleetCt += vehicleSpec(specId).priceCt;
    const modulesCt = opportunity.rail
      ? RAIL_PLATFORM_COST_CT * AI_PLATFORM_TILES * 2 + RAIL_DEPOT_COST_CT
      : ROAD_STOP_COST_CT * 2 + ROAD_DEPOT_COST_CT;
    const estimateCt =
      opportunity.buildCostCt + world.costCt(modulesCt) + world.costCt(fleetCt) * wanted;

    const from = stopTileNear(world, opportunity.fromX, opportunity.fromY);
    const to = stopTileNear(world, opportunity.toX, opportunity.toY);
    if (from === null || to === null) continue;
    const depot = depotTileNear(world, from, to);
    if (depot === null) continue;

    // Planned into a SCRATCH queue first: the plan is a pure function of the
    // world, so the dry run proves the way exists before any money moves. A
    // loan must never be taken for a line that cannot be laid.
    const plan = { from, to, depot, rail: opportunity.rail };
    if (enqueueInfrastructure(new CommandQueue(), world, state.companyId, plan) === null) {
      continue;
    }

    const requiredCt = estimateCt * capitalFactor(state.personality);
    if (company.cashCt < requiredCt) {
      // Too dear from cash. The borrowing personalities take the loan and
      // build IN THE SAME command batch - the loan is enqueued first, so the
      // money has landed by the time the first build command bills. Borrow
      // now, build next cycle was tried and measured on the scenario-5
      // trace: the repayment rule saw the borrowed cash lying idle at the
      // very next decision and paid the loan straight back - the rail
      // company borrowed and repaid three hundred thousand every six
      // thousand ticks for twenty-five years and never laid a tile.
      if (!borrows(state.personality)) continue;
      // Borrowing is for getting started, or for a company whose nature it
      // is. A business that already runs lines should be paying for the next
      // one out of what the last one earns.
      const bootstrapping = world.lines.ownedBy(state.companyId).length === 0;
      if (!bootstrapping && state.personality !== Personality.Expansive) continue;
      if (!takeLoan(world, queue, state, requiredCt - company.cashCt)) continue;
    }

    const built = enqueueInfrastructure(queue, world, state.companyId, plan);
    if (built === null) continue;
    state.lastBuildTick = world.tick;
    state.project = {
      stage: 1,
      fromX: built.from.x,
      fromY: built.from.y,
      toX: built.to.x,
      toY: built.to.y,
      depotX: built.shed.x,
      depotY: built.shed.y,
      rail: opportunity.rail,
      cargo: opportunity.cargo,
      specIds,
      startedTick: world.tick,
      railTrains: built.railTrains,
      lineId: -1,
    };
    return;
  }

  // Nothing on the list could be built. The scan itself is the expensive
  // half of a decision - sixty candidates, each dry-planned with the real
  // route search - so a company with nothing to build waits the same retry
  // interval a failed project does before scanning again. Without this the
  // whole scan ran every four hundred ticks for twenty-five game years, and
  // the acceptance run's wall time tripled.
  state.lastBuildTick = world.tick;
}

/** Carry a project on by one stage, reading the world rather than the orders. */
function advanceProject(world: World, queue: CommandQueue, state: AiState): void {
  const project = state.project;
  if (project === null) return;
  const depotTile = world.map.tileIndex(project.depotX, project.depotY);

  // A reinforcement: the line already exists, so all that is left is to find
  // the vehicle in the depot and put it to work on it.
  if (project.lineId >= 0) {
    state.project = null;
    if (!world.lines.isAlive(project.lineId)) return;

    const fresh = idleVehiclesAt(world, state.companyId, depotTile);
    if (fresh.length === 0) return;
    crewOntoLine(world, queue, state, project.lineId, project.cargo, fresh);
    // A bigger fleet earns more and costs more; judging it against the old
    // baseline would credit the new vehicles with the old ones' work.
    const review = state.reviews.find((entry) => entry.lineId === project.lineId);
    if (review !== undefined) {
      review.reviewTick = world.tick;
      review.earnedAtReviewCt = earnedOn(world, lineVehicles(world, project.lineId));
    }
    return;
  }

  const fromTile = world.map.tileIndex(project.fromX, project.fromY);
  const toTile = world.map.tileIndex(project.toX, project.toY);
  const from = ownStationAtTile(world, fromTile, state.companyId);
  const to = ownStationAtTile(world, toTile, state.companyId);
  if (from === null || to === null || from.id === to.id) {
    // The infrastructure did not come out the way it was ordered - the stop was
    // refused, or what stands on the tile is somebody else's (D-223). Whatever
    // DID get built stays standing and stays paid for, which is exactly what a
    // failed project costs a player.
    state.project = null;
    return;
  }

  if (project.stage === 1) {
    // The advisor's figure, re-derived from what actually got built (D-108:
    // observe, never trust the plan): the round over the stations' real
    // distance, the interval from what THEIR catchment offers per month, the
    // cap from the railway that was really laid (an oval carries
    // AI_RAIL_MAX_TRAINS, the single-track fallback exactly one).
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
    // The larger end: a symmetric line loads at both stops, and the bigger
    // catchment is what the fleet has to keep drained.
    const output = Math.max(
      stationMonthlyOutput(world, from, project.cargo),
      stationMonthlyOutput(world, to, project.cargo),
    );
    const wanted = fleetFor(
      2 * distance * AI_TICKS_PER_TILE,
      loadUnitsOf(project.specIds, project.cargo),
      output,
      project.rail ? project.railTrains : AI_MAX_VEHICLES_PER_LINE,
    );
    buyVehicles(
      world,
      queue,
      state,
      project.rail,
      project.specIds,
      project.depotX,
      project.depotY,
      wanted,
    );
    project.stage = 2;
    return;
  }

  if (project.stage === 2) {
    // The vehicles are either in the shed or were never built; only then is a
    // line worth opening. The id it gets cannot be known while the command is
    // queued, so the next cycle OBSERVES it (D-108) - a competitor's line is
    // opened by the very command the player's panel sends (E-06).
    if (idleVehiclesAt(world, state.companyId, depotTile).length === 0) {
      state.project = null;
      return;
    }
    queue.enqueue({ kind: CommandKind.CreateLine }, world.tick + 1, state.companyId);
    project.stage = 3;
    return;
  }

  // Stage 3: find the line the previous cycle opened - the one empty line
  // this company owns - give it the schedule, and crew it.
  const vehicleIds = idleVehiclesAt(world, state.companyId, depotTile);
  state.project = null;
  const lineId = emptyLineOf(world, state.companyId);
  if (lineId < 0) return;
  if (vehicleIds.length === 0) {
    // The vehicles vanished between the cycles - the empty line would be a
    // schedule nobody can ever run, so it is closed like any dead one.
    queue.enqueue({ kind: CommandKind.DeleteLine, lineId }, world.tick + 1, state.companyId);
    return;
  }

  const tick = world.tick + 1;
  queue.enqueue(
    {
      kind: CommandKind.SetLineOrders,
      lineId,
      orders: [
        {
          // The DELIVERY end is deliberately the FIRST station order: the
          // line runs a takt (below), the takt point is the first station
          // order (D-149), and takt slack spent at the source end rides
          // aboard as cargo age - the D-151 playbook "Startbahnhof = leerer
          // Endbahnhof", applied by the AI to its own line. The list is a
          // cycle, so the route is the same either way round.
          //
          // BOTH stops load AND unload - the schedule balancing scenario 1
          // runs. A passenger line produces at both ends, and a line that
          // loads only at one left the other town's pile to rot at the
          // written-off floor (measured on the scenario-5 trace: the return
          // stops of six bus lines sat at 100-290 waiting for ever). For
          // freight the D-078 loading rule makes the symmetric schedule
          // exactly the one-way one: nothing boards that is not carried
          // closer, so the return leg simply runs empty.
          target: OrderTarget.Station,
          targetId: to.id,
          load: OrderLoad.Partial,
          unload: OrderUnload.All,
        },
        {
          // PARTIAL, not full.
          //
          // A new station is rated around thirty, and the collection gate of
          // section 7.3 caps what an industry hands over by that rating - so
          // a train waiting for a full load at a station nobody has visited
          // yet waits for a load that cannot arrive. It stood there for six
          // months, earned nothing, and the line was closed as unprofitable
          // (measured on balancing scenario 5).
          //
          // Leaving with whatever is there is worth less per trip and far
          // more per year: the visits raise the rating, the rating raises
          // the gate, and the gate is what decides how much there is to
          // carry at all.
          target: OrderTarget.Station,
          targetId: from.id,
          load: OrderLoad.Partial,
          unload: OrderUnload.All,
        },
      ],
    },
    tick,
    state.companyId,
  );
  // A takt ONLY for a railway with more than one train (E-06/D-149): the
  // crew spaced evenly over the round - never the demand interval (see
  // fleetFor). The two-train oval is the shape the takt fixture proved, and
  // there the grid is what keeps the second train half a cycle behind the
  // first. ROAD lines run free, measured twice on the scenario-5 trace:
  // with a takt, every bus line showed one to four of its vehicles in
  // WaitingForSlot at any moment - a quarter and more of the fleet's time
  // spent standing at the anchor while the piles aged toward the decay
  // floor - and earned five to ten percent of what balancing scenario 1's
  // own UNTAKTED two-bus line earns per vehicle on the same shape. The road
  // de-buncher is the D-074 stop queue itself; the takt's slot-idle costs
  // more than the bunching it removes at every fleet size the cap allows.
  if (project.rail && vehicleIds.length >= 2) {
    const spanX = to.x - from.x;
    const spanY = to.y - from.y;
    const takt = taktFor(
      2 * Math.round(Math.sqrt(spanX * spanX + spanY * spanY)) * AI_TICKS_PER_TILE,
      vehicleIds.length,
    );
    queue.enqueue(
      { kind: CommandKind.SetLineTakt, lineId, taktTicks: takt, offsetTicks: 0 },
      tick,
      state.companyId,
    );
  }
  // Per-line auto-renewal, on from the first day (section 11.3, D-146): an AI
  // fleet that ages into doubled upkeep for ever was exactly the audit
  // finding stage C2 closes - nobody at an AI company ever pressed the
  // renewal switch the player has.
  queue.enqueue({ kind: CommandKind.SetAutoRenew, lineId, enabled: true }, tick, state.companyId);
  crewOntoLine(world, queue, state, lineId, project.cargo, vehicleIds);
  state.reviews.push({ lineId, reviewTick: world.tick, earnedAtReviewCt: 0 });
}

function buyVehicles(
  world: World,
  queue: CommandQueue,
  state: AiState,
  rail: boolean,
  specIds: readonly number[],
  x: number,
  y: number,
  count: number,
): void {
  const tick = world.tick + 1;

  for (let index = 0; index < count; index++) {
    queue.enqueue(
      rail
        ? { kind: CommandKind.BuyTrain, x, y, specIds: [...specIds] }
        : { kind: CommandKind.BuyRoadVehicle, x, y, specId: specIds[0]! },
      tick,
      state.companyId,
    );
  }
}

/** Refit what came out of the depot, put it on the line, and start it. */
function crewOntoLine(
  world: World,
  queue: CommandQueue,
  state: AiState,
  lineId: number,
  cargo: number,
  vehicleIds: readonly number[],
): void {
  const tick = world.tick + 1;

  for (const vehicleId of vehicleIds) {
    if (world.vehicles.refitCargo[vehicleId] !== cargo) {
      queue.enqueue({ kind: CommandKind.RefitVehicle, vehicleId, cargo }, tick, state.companyId);
    }
    queue.enqueue(
      { kind: CommandKind.AssignVehicleToLine, vehicleId, lineId },
      tick,
      state.companyId,
    );
    queue.enqueue(
      { kind: CommandKind.SetVehicleRunning, vehicleId, running: true },
      tick,
      state.companyId,
    );
  }
}

// ------------------------------------------------------------- looking after

/**
 * Steps 3 and 4 of the cycle: forget what has died, and reinforce what cannot
 * lift what is waiting for it.
 *
 * Section 15 is explicit that a company being outrun does NOT cut its prices -
 * the tariff is global - it runs more often. A pile of cargo the line cannot
 * shift is that signal, and another vehicle is that answer.
 *
 * Returns true when it did something, so a cycle spent on the existing network
 * is a cycle not spent reaching for the next line.
 */
function optimise(world: World, queue: CommandQueue, state: AiState): boolean {
  if (closeDeadLine(world, queue, state)) return true;

  const company = world.companyOf(state.companyId);

  // Pay the debt down before spending on anything else. Interest is the one
  // cost that grows while the company is not looking, and the expansive
  // personality is the only one that ever takes any on.
  if (company.loanCt > 0 && company.cashCt > company.loanCt + AI_CASH_RESERVE_CT) {
    queue.enqueue(
      { kind: CommandKind.RepayLoan, amountCt: company.loanCt },
      world.tick + 1,
      state.companyId,
    );
    return true;
  }

  for (const review of state.reviews) {
    const lineId = review.lineId;
    if (!world.lines.isAlive(lineId)) continue;
    const crewIds = lineVehicles(world, lineId);
    if (crewIds.length === 0) continue;
    // A RAILWAY is never reinforced: its fleet was sized once, at build time,
    // to the shape that was laid. Whether the line is the two-train oval or
    // the single-track fallback cannot be recomputed from the map here, and
    // a second train pushed onto single track meets the first nose to nose
    // and deadlocks (D-059) - so the cap that is provably safe for every
    // railway this AI builds is the built fleet itself.
    if (world.vehicles.kind[crewIds[0]!] === VehicleKind.Train) continue;
    if (crewIds.length >= AI_MAX_VEHICLES_PER_LINE) continue;

    const loadingStop = loadingStationOf(world, lineId);
    if (loadingStop === null) continue;
    let waiting = 0;
    for (const stack of loadingStop.waiting) waiting += stack.amount;
    if (waiting < AI_REINFORCE_WAITING) continue;

    // The line's composition, read back off the fleet that runs it (the M6
    // rule): the reinforcement buys what the line already uses.
    const lead = crewIds[0]!;
    const consist = world.vehicles.consist[lead]!;
    const rail = false;
    const specIds = consist.length > 0 ? [...consist] : [world.vehicles.specId[lead]!];
    let priceCt = 0;
    for (const specId of specIds) priceCt += vehicleSpec(specId).priceCt;
    if (company.cashCt < world.costCt(priceCt) * capitalFactor(state.personality)) continue;

    const depotTile = world.vehicles.homeDepotTile[lead]!;
    const x = depotTile % world.map.size;
    const y = (depotTile / world.map.size) | 0;
    queue.enqueue(
      rail
        ? { kind: CommandKind.BuyTrain, x, y, specIds }
        : { kind: CommandKind.BuyRoadVehicle, x, y, specId: specIds[0]! },
      world.tick + 1,
      state.companyId,
    );
    state.project = {
      stage: 2,
      fromX: x,
      fromY: y,
      toX: x,
      toY: y,
      depotX: x,
      depotY: y,
      rail,
      cargo: world.vehicles.refitCargo[lead]!,
      specIds,
      startedTick: world.tick,
      railTrains: 1,
      lineId,
    };
    return true;
  }
  return false;
}

/**
 * Judge each line on what it earned SINCE the last look, and shut the ones that
 * did not cover their own vehicles.
 *
 * A line dies quietly: its source closes, or its lorries sit waiting for a full
 * load that will never arrive. Nothing else in the simulation notices, and the
 * company pays their upkeep until it is wound up - which is precisely what the
 * first twenty-five year run did to all three competitors. A line that is shut
 * is DELETED through the ordinary command, exactly as a player would close it.
 */
function closeDeadLine(world: World, queue: CommandQueue, state: AiState): boolean {
  for (let index = 0; index < state.reviews.length; index++) {
    const review = state.reviews[index]!;
    const lineId = review.lineId;

    // The line is gone - deleted by a winding-up, or never truly opened.
    if (!world.lines.isAlive(lineId)) {
      state.reviews.splice(index, 1);
      return true;
    }
    const crewIds = lineVehicles(world, lineId);
    // Every vehicle died or was sold: the line is a schedule nobody runs.
    if (crewIds.length === 0) {
      queue.enqueue({ kind: CommandKind.DeleteLine, lineId }, world.tick + 1, state.companyId);
      state.reviews.splice(index, 1);
      return true;
    }

    if (world.tick - review.reviewTick < AI_LINE_REVIEW_TICKS) continue;

    const earned = earnedOn(world, crewIds);
    const gained = earned - review.earnedAtReviewCt;

    // A NEGATIVE gain is not a loss - earnings only accumulate - it means
    // the fleet TURNED OVER under the baseline: auto-renewal replaced the
    // vehicles and their lifetime meters restarted at zero. Judging that
    // against the old fleet's total closed the best line of the measured
    // twenty-five-year run one month after its renewal - six fresh lorries,
    // a drained pile, a station rated 86, sold off as "unprofitable". The
    // baseline is re-anchored on the new fleet and the verdict waits one
    // review period, exactly as it does for a newly opened line.
    if (gained < 0) {
      review.reviewTick = world.tick;
      review.earnedAtReviewCt = earned;
      continue;
    }

    // Upkeep is quoted per YEAR and the window is half of one. Comparing the
    // two directly asks a line to earn a year's costs in six months, which a
    // perfectly good railway does not - and this closed the first line of
    // every competitor before it had been running a season (measured against
    // balancing scenario 5).
    let upkeepCtPerYear = 0;
    for (const id of crewIds) {
      const units = world.vehicles.consist[id]!;
      upkeepCtPerYear +=
        units.length > 0
          ? aggregateConsist(units).upkeepCtPerYear
          : vehicleSpec(world.vehicles.specId[id]!).upkeepCtPerYear;
    }
    const owed = world.costCt(upkeepCtPerYear) * (AI_LINE_REVIEW_TICKS / TICKS_PER_YEAR);

    if (gained >= owed) {
      review.reviewTick = world.tick;
      review.earnedAtReviewCt = earned;
      continue;
    }

    for (const vehicleId of crewIds) {
      queue.enqueue({ kind: CommandKind.SellVehicle, vehicleId }, world.tick + 1, state.companyId);
    }
    queue.enqueue({ kind: CommandKind.DeleteLine, lineId }, world.tick + 1, state.companyId);
    state.reviews.splice(index, 1);
    return true;
  }
  return false;
}

/** What a line's vehicles have earned in their lifetimes, together. */
function earnedOn(world: World, vehicleIds: readonly number[]): number {
  let total = 0;
  for (const id of vehicleIds) {
    if (world.vehicles.isAlive(id)) total += world.vehicles.earnedCt[id]!;
  }
  return total;
}

// ------------------------------------------------------------------ helpers

function capitalFactor(personality: number): number {
  if (personality === Personality.Conservative) return AI_BUILD_CAPITAL_FACTOR * 1.5;
  if (personality === Personality.Expansive) return AI_BUILD_CAPITAL_FACTOR * 0.85;
  return AI_BUILD_CAPITAL_FACTOR;
}

/**
 * Who will use the credit line.
 *
 * Everybody except the conservative personality, which section 15 defines as
 * the low-debt one. This was tried once WITHOUT the repayment rule below and
 * measured: all three competitors ran their credit to the limit inside a
 * decade and the interest finished them. Borrowing is only safe next to
 * repaying, and now that both exist a company can get its first line running
 * in its first year instead of saving up for four.
 */
function borrows(personality: number): boolean {
  return personality !== Personality.Conservative;
}

/** Ask for a loan, on exactly the credit line a player would have. */
function takeLoan(world: World, queue: CommandQueue, state: AiState, wantedCt: number): boolean {
  const company = world.companyOf(state.companyId);
  const room = loanLimitCt(company) - company.loanCt;
  if (room < LOAN_STEP_CT) return false;

  const amountCt = Math.min(room, Math.ceil(wantedCt / LOAN_STEP_CT) * LOAN_STEP_CT);
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt }, world.tick + 1, state.companyId);
  return true;
}

/**
 * The one line of this company that has no schedule yet - the line a
 * CreateLine of the previous cycle opened. Lowest id, so the answer is a
 * total order even if a winding-up left another empty line behind.
 */
function emptyLineOf(world: World, companyId: number): number {
  for (let lineId = 0; lineId < world.lines.count; lineId++) {
    if (world.lines.alive[lineId] !== 1) continue;
    if (world.lines.ownerId[lineId] !== companyId) continue;
    if (world.lines.orders[lineId]!.length === 0) return lineId;
  }
  return -1;
}

/**
 * The station where a line's cargo piles up: its first LOADING stop. Not the
 * first station order - since the takt went in, that is deliberately the
 * delivery terminus (D-151), where nothing ever waits.
 */
function loadingStationOf(world: World, lineId: number): Station | null {
  let fallback: Station | null = null;
  for (const order of world.lines.orders[lineId]!) {
    if (order.target !== OrderTarget.Station) continue;
    const station = world.stations[order.targetId];
    if (station === undefined) continue;
    if (order.load !== OrderLoad.None) return station;
    if (fallback === null) fallback = station;
  }
  return fallback;
}

/**
 * **This company's** station on that tile, or null - and the ownership half is
 * the whole point (D-223).
 *
 * A project reads its stops back off the map rather than trusting the commands
 * it sent (D-108), and this is the read-back. Without the owner test it
 * answered with whatever station stood on the tile, including a RIVAL'S: the
 * stop the AI planned there was refused `Occupied` (there is already a station
 * on the tile), the refusal was declared and tolerated, and the very next cycle
 * found the rival's stop, took it for its own, bought six buses and gave them a
 * schedule calling at a station on a tile the company may not build on - so the
 * road to it was refused `NotYours` too and every bus of the line was refused
 * `SetVehicleRunning|noRouteToStop`, standing in its shed for the rest of the
 * game. Traced on seed 60613 at D-220's commit: company 3's shed at 196,103,
 * eighty-one tiles of its own road reaching its own far stop, and its NEAR stop
 * the rival's bay at 196,104 - one tile away, and not joined to anything of
 * this company's.
 *
 * It is the D-219 shape one file along: an ownership question the command layer
 * asks and the AI's own side of it did not.
 */
function ownStationAtTile(world: World, tile: number, companyId: number): Station | null {
  for (const station of world.stations) {
    if (station.ownerId !== companyId) continue;
    for (const module of station.modules) {
      if (module.tileIndex === tile) return station;
    }
  }
  return null;
}

/** This company's vehicles standing at that depot with nothing to do. */
function idleVehiclesAt(world: World, companyId: number, depotTile: number): number[] {
  const vehicles = world.vehicles;
  const found: number[] = [];

  for (let id = 0; id < vehicles.count; id++) {
    if (vehicles.alive[id] !== 1 || vehicles.ownerId[id] !== companyId) continue;
    if (vehicles.homeDepotTile[id] !== depotTile) continue;
    if (vehicles.state[id] !== VehicleState.Stopped) continue;
    if (vehicles.lineId[id]! >= 0) continue;
    if (vehicles.orders[id]!.length > 0) continue;
    found.push(id);
  }
  return found;
}
