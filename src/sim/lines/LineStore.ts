import { MAX_LINES } from '../constants';
import { releaseAll } from '../vehicles/reservations';
import { OrderTarget, type Order } from '../vehicles/VehicleStore';
import type { World } from '../World';

/**
 * The Line entity of section 12.2 (SPEC2 M11, E-06): a shared, cyclic order
 * list plus a per-line auto-renewal flag, owned by one company.
 *
 * Struct of arrays like the vehicles (law #7), and deliberately WITHOUT a
 * vehicle list: which vehicles run a line is answered by scanning the fleet
 * for `lineId`, the M6 rule - a cached membership list would need correcting
 * from every sell, renewal and assignment, and any drift would be invisible
 * until a save was reloaded. Per-line statistics are recomputed the same way
 * (`lines/metrics.ts`), never carried as running totals.
 *
 * There is exactly ONE line entity in the game. The AI runs its lines through
 * this store and these commands, exactly as the player does (E-06); the
 * private line list its state used to keep is gone.
 */
export class LineStore {
  readonly capacity: number;
  /** Highest slot ever used; iteration runs to here and skips dead slots. */
  count = 0;

  readonly alive: Uint8Array;
  readonly ownerId: Uint8Array;
  /** 1 when vehicles of this line are renewed automatically (section 11.3). */
  readonly autoRenew: Uint8Array;
  /**
   * Takt of the line's timetable, or 0 when the takt is off (section 12.3).
   * Pure line data, saved and hashed - NOT a world rule: it is set by an
   * ordinary command exactly as the order list is. [ticks]
   */
  readonly taktTicks: Int32Array;
  /** Start offset of the takt grid, 0 <= offset < taktTicks. [ticks] */
  readonly taktOffsetTicks: Int32Array;

  /** The shared order list, read LIVE by every vehicle assigned to the line. */
  readonly orders: Order[][] = [];

  constructor(capacity: number = MAX_LINES) {
    this.capacity = capacity;
    this.alive = new Uint8Array(capacity);
    this.ownerId = new Uint8Array(capacity);
    this.autoRenew = new Uint8Array(capacity);
    this.taktTicks = new Int32Array(capacity);
    this.taktOffsetTicks = new Int32Array(capacity);
  }

  /**
   * Take a slot. Returns -1 when the store is full.
   *
   * The LOWEST dead slot is reused, not a first-freed queue: the choice is
   * then a pure function of the alive bitmap, so a world rebuilt from a save -
   * which stores only the living lines and their ids - allocates exactly the
   * id the unsaved world would have. A FIFO free list would have to be
   * serialised to keep that true.
   */
  create(ownerId: number): number {
    let id = -1;
    for (let slot = 0; slot < this.count; slot++) {
      if (this.alive[slot] !== 1) {
        id = slot;
        break;
      }
    }
    if (id < 0) {
      if (this.count >= this.capacity) return -1;
      id = this.count++;
    }

    this.alive[id] = 1;
    this.ownerId[id] = ownerId;
    this.autoRenew[id] = 0;
    this.taktTicks[id] = 0;
    this.taktOffsetTicks[id] = 0;
    this.orders[id] = [];
    return id;
  }

  destroy(id: number): void {
    if (this.alive[id] !== 1) return;
    this.alive[id] = 0;
    this.autoRenew[id] = 0;
    this.taktTicks[id] = 0;
    this.taktOffsetTicks[id] = 0;
    this.orders[id] = [];
  }

  isAlive(id: number): boolean {
    return id >= 0 && id < this.count && this.alive[id] === 1;
  }

  /** Number of lines that actually exist. */
  get livingCount(): number {
    let total = 0;
    for (let i = 0; i < this.count; i++) total += this.alive[i]!;
    return total;
  }

  /** Living lines a company owns. Allocates - for commands and panels only. */
  ownedBy(companyId: number): number[] {
    const owned: number[] = [];
    for (let id = 0; id < this.count; id++) {
      if (this.alive[id] === 1 && this.ownerId[id] === companyId) owned.push(id);
    }
    return owned;
  }
}

/**
 * The order list a vehicle actually runs: the line's when it is assigned to
 * one, its own private list otherwise.
 *
 * This is THE read path for schedules - every consumer of `vehicles.orders`
 * goes through here, which is what makes a line edit reach every vehicle of
 * the line in the same tick: they all read the same array. Two loads and a
 * compare, no allocation, so it is safe at stops and in the state machine
 * (law #7).
 */
export function scheduleOf(world: World, id: number): Order[] {
  const lineId = world.vehicles.lineId[id]!;
  if (lineId >= 0 && world.lines.alive[lineId] === 1) return world.lines.orders[lineId]!;
  return world.vehicles.orders[id]!;
}

/**
 * The re-anchor rule of SPEC2 M11 Stage B, stated once:
 *
 * When a vehicle's schedule is replaced under it - the line it runs was
 * edited, or it was just assigned to one - its current order becomes the
 * entry of the NEW list whose target lies nearest to where the vehicle
 * stands, straight-line over tile coordinates; ties go to the LOWER order
 * index, so the choice is a total order. A station's position is its centre,
 * a depot's or waypoint's its tile. The old route and any track claim
 * expressed in it are dropped, and the leg in progress is forgotten - the
 * time either side of a schedule change measures nothing (D-077).
 *
 * The vehicle repaths from its `NoRoute`/route-end machinery exactly as an
 * edited private schedule always has; conditions speak when the anchored
 * order is picked up at the next stop event, not here.
 */
export function reAnchorVehicle(world: World, id: number): void {
  const vehicles = world.vehicles;
  const orders = scheduleOf(world, id);

  let anchor = 0;
  if (orders.length > 0) {
    const size = world.map.size;
    const tile = vehicles.tileIndex[id]!;
    const x = tile % size;
    const y = (tile / size) | 0;

    let bestDistance = Infinity;
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index]!;
      const atStation = order.target === OrderTarget.Station;
      const station = atStation ? world.stations[order.targetId] : undefined;
      const targetX = station !== undefined ? station.x : order.targetId % size;
      const targetY = station !== undefined ? station.y : (order.targetId / size) | 0;
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        anchor = index;
      }
    }
  }

  vehicles.orderIndex[id] = anchor;
  releaseAll(world, id);
  vehicles.pathLength[id] = 0;
  // The leg in progress is no longer a leg of anything (D-077).
  vehicles.lastStationId[id] = -1;
  vehicles.lastArrivalTick[id] = -1;
  // Neither is a slot or a connection hold latched for the old schedule: the
  // stop they were latched at is not necessarily a stop of the new list.
  vehicles.taktDueTick[id] = -1;
  vehicles.connectionDeadlineTick[id] = -1;
  vehicles.taktDelayTicks[id] = 0;
}

/**
 * Take a vehicle off its line. It keeps a PRIVATE COPY of the list it was
 * running and its position in it, so nothing about its journey changes - the
 * next edit of the line simply no longer reaches it.
 */
export function releaseVehicle(world: World, id: number): void {
  const vehicles = world.vehicles;
  const lineId = vehicles.lineId[id]!;
  if (lineId < 0) return;
  const orders = world.lines.alive[lineId] === 1 ? world.lines.orders[lineId]! : [];
  vehicles.orders[id] = orders.map((order) => ({ ...order }));
  vehicles.lineId[id] = -1;
  // The takt is the LINE's; a vehicle off the line owes no slot. A wait in
  // progress resolves itself: the slot states re-check the line every tick
  // and run on the moment there is no takt left to wait for.
  vehicles.taktDueTick[id] = -1;
  vehicles.taktDelayTicks[id] = 0;
}
