import type { Cargo } from '../cargo/types';
import { CommandKind, type Command } from '../commands/types';
import type { CommandQueue } from '../commands/queue';
import { AI_RAIL_WAGONS, AI_SIGNAL_SPACING, SEA_LEVEL } from '../constants';
import { RailType } from '../map/track';
import { Terrain } from '../map/terrain';
import { ModuleKind } from '../station/types';
import {
  availableRailVehicles,
  availableVehicles,
  capacityFor,
  RailRole,
  VehicleKind,
} from '../vehicles/catalog';
import type { World } from '../World';

/**
 * Turning a chosen opportunity into commands (step 2 of section 15).
 *
 * Everything an AI builds goes through the ordinary command queue, stamped with
 * its own company id and scheduled for the NEXT tick - the current one is
 * already draining. That is what makes the AI's building indistinguishable from
 * the player's: the same route assistant, the same prices, the same refusals,
 * and the whole of it in the replay log.
 */

/** A tile a stop can stand on: bare, flat, dry, and nobody else's. */
export function clearStopTile(world: World, x: number, y: number): boolean {
  const map = world.map;
  if (!map.contains(x, y)) return false;
  const tile = map.tileIndex(x, y);
  if (map.terrain[tile] === Terrain.Water) return false;
  if (map.baseHeight(x, y) <= SEA_LEVEL) return false;
  if (map.buildingKind[tile] !== 0 || map.industryId[tile] !== -1) return false;
  if (map.trackBits[tile] !== 0) return false;
  return map.slopeAt(x, y) === 0;
}

/**
 * A tile beside a source or a sink to put the stop on.
 *
 * Scanned outward in a fixed order rather than searched for the best one: the
 * catchment is a radius, so any tile that touches the works will do, and a
 * deterministic scan is one fewer thing that can differ between two runs of the
 * same seed.
 */
export function stopTileNear(world: World, x: number, y: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (clearStopTile(world, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

/** A tile next to the stop for the depot, on the side away from the far end. */
export function depotTileNear(
  world: World,
  stop: { x: number; y: number },
  awayFrom: { x: number; y: number },
): { x: number; y: number } | null {
  const stepX = Math.sign(stop.x - awayFrom.x);
  const stepY = Math.sign(stop.y - awayFrom.y);

  const candidates = [
    { x: stop.x + stepX, y: stop.y + stepY },
    { x: stop.x + stepX, y: stop.y },
    { x: stop.x, y: stop.y + stepY },
    { x: stop.x - stepY, y: stop.y + stepX },
    { x: stop.x + stepY, y: stop.y - stepX },
  ];
  for (const candidate of candidates) {
    if (candidate.x === stop.x && candidate.y === stop.y) continue;
    if (clearStopTile(world, candidate.x, candidate.y)) return candidate;
  }
  return null;
}

/**
 * The vehicle an AI would buy for this cargo.
 *
 * Biggest capacity that is on the market and can carry the load, which is the
 * choice a player makes nine times in ten. Ties break on the lower id so the
 * pick is stable.
 */
export function pickRoadVehicle(world: World, cargo: number): number {
  let best = -1;
  let bestCapacity = 0;

  for (const spec of availableVehicles(VehicleKind.Road, world.date.year)) {
    const capacity = capacityFor(spec, cargo as Cargo);
    if (capacity <= 0) continue;
    if (capacity > bestCapacity || (capacity === bestCapacity && spec.id < best)) {
      best = spec.id;
      bestCapacity = capacity;
    }
  }
  return best;
}

/** A locomotive and a rake of wagons for this cargo, or an empty list. */
export function pickTrain(world: World, cargo: number): number[] {
  const year = world.date.year;

  let locomotive = -1;
  let bestPower = 0;
  for (const spec of availableRailVehicles(RailRole.Traction, year)) {
    // Never electric: the AI lays plain track, and a wire-only locomotive on it
    // is a vehicle that will not move.
    if (spec.power === 'electric') continue;
    if (spec.powerW > bestPower || (spec.powerW === bestPower && spec.id < locomotive)) {
      locomotive = spec.id;
      bestPower = spec.powerW;
    }
  }
  if (locomotive < 0) return [];

  let wagon = -1;
  let bestCapacity = 0;
  for (const spec of availableRailVehicles(RailRole.Wagon, year)) {
    const capacity = capacityFor(spec, cargo as Cargo);
    if (capacity <= 0) continue;
    if (capacity > bestCapacity || (capacity === bestCapacity && spec.id < wagon)) {
      wagon = spec.id;
      bestCapacity = capacity;
    }
  }
  if (wagon < 0) return [];

  const consist = [locomotive];
  for (let i = 0; i < AI_RAIL_WAGONS; i++) consist.push(wagon);
  return consist;
}

/**
 * The infrastructure half of a line: the way between the two ends, a stop at
 * each end, and a depot beside one of them.
 *
 * Enqueued in one go and then FORGOTTEN. The next decision cycle looks at what
 * actually exists rather than at what was ordered, so a route the assistant
 * refused or a stop the council blocked ends the project instead of leaving the
 * AI convinced it owns a railway it never built.
 */
export function enqueueInfrastructure(
  queue: CommandQueue,
  world: World,
  companyId: number,
  plan: {
    readonly from: { x: number; y: number };
    readonly to: { x: number; y: number };
    readonly depot: { x: number; y: number };
    readonly rail: boolean;
  },
): void {
  const tick = world.tick + 1;
  const push = (command: Command): void => {
    queue.enqueue(command, tick, companyId);
  };

  if (plan.rail) {
    push({
      kind: CommandKind.BuildTrack,
      x1: plan.from.x,
      y1: plan.from.y,
      x2: plan.to.x,
      y2: plan.to.y,
      railType: RailType.Plain,
      assistant: true,
      signalSpacing: AI_SIGNAL_SPACING,
    });
    // The depot hangs off the end of the line on a spur of its own, so a train
    // sitting in it is not standing on the running line.
    push({
      kind: CommandKind.BuildTrack,
      x1: plan.from.x,
      y1: plan.from.y,
      x2: plan.depot.x,
      y2: plan.depot.y,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    push({
      kind: CommandKind.BuildRailStop,
      x: plan.from.x,
      y: plan.from.y,
      moduleKind: ModuleKind.RailPlatform,
    });
    push({
      kind: CommandKind.BuildRailStop,
      x: plan.to.x,
      y: plan.to.y,
      moduleKind: ModuleKind.RailPlatform,
    });
    push({
      kind: CommandKind.BuildRailStop,
      x: plan.depot.x,
      y: plan.depot.y,
      moduleKind: ModuleKind.RailDepot,
    });
    return;
  }

  push({
    kind: CommandKind.BuildRoad,
    x1: plan.from.x,
    y1: plan.from.y,
    x2: plan.to.x,
    y2: plan.to.y,
  });
  push({
    kind: CommandKind.BuildRoad,
    x1: plan.from.x,
    y1: plan.from.y,
    x2: plan.depot.x,
    y2: plan.depot.y,
  });
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.from.x,
    y: plan.from.y,
    moduleKind: ModuleKind.LorryBay,
  });
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.to.x,
    y: plan.to.y,
    moduleKind: ModuleKind.LorryBay,
  });
  push({
    kind: CommandKind.BuildRoadStop,
    x: plan.depot.x,
    y: plan.depot.y,
    moduleKind: ModuleKind.RoadDepot,
  });
}
