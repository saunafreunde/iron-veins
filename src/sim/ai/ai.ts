import { CommandKind } from '../commands/types';
import type { CommandQueue } from '../commands/queue';
import {
  AI_BUILD_CAPITAL_FACTOR,
  AI_CANDIDATES_TRIED,
  AI_CASH_RESERVE_CT,
  AI_DECISION_INTERVAL_TICKS,
  AI_LINE_REVIEW_TICKS,
  AI_MAX_LINES,
  AI_MAX_VEHICLES_PER_LINE,
  AI_REINFORCE_WAITING,
  AI_RETRY_TICKS,
  AI_VEHICLES_PER_LINE,
  LOAN_STEP_CT,
} from '../constants';
import { loanLimitCt } from '../economy/company';
import type { Station } from '../station/types';
import { OrderLoad, OrderTarget, OrderUnload, VehicleState } from '../vehicles/VehicleStore';
import { vehicleSpec } from '../vehicles/catalog';
import {
  depotTileNear,
  enqueueInfrastructure,
  pickRoadVehicle,
  pickTrain,
  stopTileNear,
} from './build';
import { opportunities } from './evaluate';
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
 * A line is built over three cycles rather than in one (DECISIONS.md D-108).
 * The AI cannot know what a command will produce - which station id, which
 * vehicle id - while the command is still queued, so each stage observes what
 * the previous one left behind. A route the assistant refused, a stop the
 * council blocked or a purchase there was no money for simply ends the
 * project, rather than leaving the AI convinced it owns a railway.
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

function startProject(world: World, queue: CommandQueue, state: AiState): void {
  if (state.lines.length >= AI_MAX_LINES) return;
  if (world.tick - state.lastBuildTick < AI_RETRY_TICKS) return;

  const company = world.companyOf(state.companyId);
  const candidates = opportunities(world, state.personality, state.companyId);
  const tried = Math.min(candidates.length, AI_CANDIDATES_TRIED);

  for (let index = 0; index < tried; index++) {
    const opportunity = candidates[index]!;

    // Section 15: build when capital is at least 1.4 times the estimate. The
    // expansive personality borrows to get there; the conservative one wants a
    // larger reserve and never goes near the credit line.
    const specIds = opportunity.rail
      ? pickTrain(world, opportunity.cargo)
      : [pickRoadVehicle(world, opportunity.cargo)];
    if (specIds.length === 0 || specIds[0]! < 0) continue;

    // The estimate is the WHOLE project: the way, and the vehicles that have to
    // run on it. Costing only the track let a company put six lines down before
    // the first had carried anything.
    let fleetCt = 0;
    for (const specId of specIds) fleetCt += vehicleSpec(specId).priceCt;
    const estimateCt = opportunity.buildCostCt + world.costCt(fleetCt) * AI_VEHICLES_PER_LINE;

    const wanted = estimateCt * capitalFactor(state.personality);
    if (company.cashCt < wanted) {
      if (!borrows(state.personality)) continue;
      if (takeLoan(world, queue, state, wanted - company.cashCt)) state.lastBuildTick = world.tick;
      return;
    }

    const from = stopTileNear(world, opportunity.fromX, opportunity.fromY);
    const to = stopTileNear(world, opportunity.toX, opportunity.toY);
    if (from === null || to === null) continue;
    const depot = depotTileNear(world, from, to);
    if (depot === null) continue;

    enqueueInfrastructure(queue, world, state.companyId, {
      from,
      to,
      depot,
      rail: opportunity.rail,
    });
    state.lastBuildTick = world.tick;
    state.project = {
      stage: 1,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      depotX: depot.x,
      depotY: depot.y,
      rail: opportunity.rail,
      cargo: opportunity.cargo,
      specIds,
      startedTick: world.tick,
      lineIndex: -1,
    };
    return;
  }
}

/** Carry a project on by one stage, reading the world rather than the orders. */
function advanceProject(world: World, queue: CommandQueue, state: AiState): void {
  const project = state.project;
  if (project === null) return;
  const depotTile = world.map.tileIndex(project.depotX, project.depotY);

  // A reinforcement: the line already exists, so all that is left is to find
  // the vehicle in the depot and put it to work on it.
  if (project.lineIndex >= 0) {
    const line = state.lines[project.lineIndex];
    state.project = null;
    if (line === undefined) return;
    const from = stationById(world, line.fromStationId);
    const to = stationById(world, line.toStationId);
    if (from === null || to === null) return;

    const fresh = idleVehiclesAt(world, state.companyId, depotTile);
    if (fresh.length === 0) return;
    crew(world, queue, state, project.cargo, from, to, fresh);
    line.vehicleIds.push(...fresh);
    // A bigger fleet earns more and costs more; judging it against the old
    // baseline would credit the new vehicles with the old ones' work.
    line.reviewTick = world.tick;
    line.earnedAtReviewCt = earnedOn(world, line.vehicleIds);
    return;
  }

  const from = stationAtTile(world, world.map.tileIndex(project.fromX, project.fromY));
  const to = stationAtTile(world, world.map.tileIndex(project.toX, project.toY));
  if (from === null || to === null || from.id === to.id) {
    // The infrastructure did not come out the way it was ordered. Whatever DID
    // get built stays standing and stays paid for - which is exactly what a
    // failed project costs a player.
    state.project = null;
    return;
  }

  if (project.stage === 1) {
    buyVehicles(world, queue, state, project.rail, project.specIds, project.depotX, project.depotY);
    project.stage = 2;
    return;
  }

  const vehicleIds = idleVehiclesAt(world, state.companyId, depotTile);
  state.project = null;
  if (vehicleIds.length === 0) return;

  crew(world, queue, state, project.cargo, from, to, vehicleIds);
  state.lines.push({
    fromStationId: from.id,
    toStationId: to.id,
    depotTile,
    rail: project.rail,
    specIds: [...project.specIds],
    cargo: project.cargo,
    builtTick: world.tick,
    vehicleIds,
    reviewTick: world.tick,
    earnedAtReviewCt: 0,
  });
}

function buyVehicles(
  world: World,
  queue: CommandQueue,
  state: AiState,
  rail: boolean,
  specIds: readonly number[],
  x: number,
  y: number,
): void {
  const tick = world.tick + 1;

  for (let index = 0; index < AI_VEHICLES_PER_LINE; index++) {
    queue.enqueue(
      rail
        ? { kind: CommandKind.BuyTrain, x, y, specIds: [...specIds] }
        : { kind: CommandKind.BuyRoadVehicle, x, y, specId: specIds[0]! },
      tick,
      state.companyId,
    );
  }
}

/** Refit, order and start whatever came out of the depot. */
function crew(
  world: World,
  queue: CommandQueue,
  state: AiState,
  cargo: number,
  from: Station,
  to: Station,
  vehicleIds: readonly number[],
): void {
  const tick = world.tick + 1;

  for (const vehicleId of vehicleIds) {
    if (world.vehicles.refitCargo[vehicleId] !== cargo) {
      queue.enqueue(
        { kind: CommandKind.RefitVehicle, vehicleId, cargo },
        tick,
        state.companyId,
      );
    }
    queue.enqueue(
      {
        kind: CommandKind.SetVehicleOrders,
        vehicleId,
        orders: [
          {
            target: OrderTarget.Station,
            targetId: from.id,
            load: OrderLoad.Full,
            unload: OrderUnload.None,
          },
          {
            target: OrderTarget.Station,
            targetId: to.id,
            load: OrderLoad.None,
            unload: OrderUnload.All,
          },
        ],
      },
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
  for (const line of state.lines) {
    line.vehicleIds = line.vehicleIds.filter((id) => world.vehicles.isAlive(id));
  }
  state.lines = state.lines.filter((line) => line.vehicleIds.length > 0);

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

  for (let index = 0; index < state.lines.length; index++) {
    const line = state.lines[index]!;
    if (line.vehicleIds.length >= AI_MAX_VEHICLES_PER_LINE) continue;

    const from = stationById(world, line.fromStationId);
    if (from === null) continue;
    let waiting = 0;
    for (const stack of from.waiting) waiting += stack.amount;
    if (waiting < AI_REINFORCE_WAITING) continue;

    let priceCt = 0;
    for (const specId of line.specIds) priceCt += vehicleSpec(specId).priceCt;
    if (company.cashCt < world.costCt(priceCt) * capitalFactor(state.personality)) continue;

    const x = line.depotTile % world.map.size;
    const y = (line.depotTile / world.map.size) | 0;
    queue.enqueue(
      line.rail
        ? { kind: CommandKind.BuyTrain, x, y, specIds: [...line.specIds] }
        : { kind: CommandKind.BuyRoadVehicle, x, y, specId: line.specIds[0]! },
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
      rail: line.rail,
      cargo: line.cargo,
      specIds: line.specIds,
      startedTick: world.tick,
      lineIndex: index,
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
 * first twenty-five year run did to all three competitors.
 */
function closeDeadLine(world: World, queue: CommandQueue, state: AiState): boolean {
  for (let index = 0; index < state.lines.length; index++) {
    const line = state.lines[index]!;
    if (world.tick - line.reviewTick < AI_LINE_REVIEW_TICKS) continue;

    const earned = earnedOn(world, line.vehicleIds);
    const gained = earned - line.earnedAtReviewCt;

    let upkeepCt = 0;
    for (const specId of line.specIds) upkeepCt += vehicleSpec(specId).upkeepCtPerYear;
    upkeepCt *= line.vehicleIds.length;

    if (gained >= world.costCt(upkeepCt)) {
      line.reviewTick = world.tick;
      line.earnedAtReviewCt = earned;
      continue;
    }

    for (const vehicleId of line.vehicleIds) {
      queue.enqueue({ kind: CommandKind.SellVehicle, vehicleId }, world.tick + 1, state.companyId);
    }
    state.lines.splice(index, 1);
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
 * Only the expansive personality, which is the one section 15 describes as
 * risky. Letting everybody borrow was tried and measured: all three
 * competitors of the twenty-five year game ran their credit to the limit
 * inside a decade and were wound up by the interest, because a company that
 * borrows to build and never repays is a company on a clock.
 */
function borrows(personality: number): boolean {
  return personality === Personality.Expansive;
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

function stationById(world: World, id: number): Station | null {
  for (const station of world.stations) {
    if (station.id === id) return station;
  }
  return null;
}

function stationAtTile(world: World, tile: number): Station | null {
  for (const station of world.stations) {
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
    if (vehicles.orders[id]!.length > 0) continue;
    found.push(id);
  }
  return found;
}
