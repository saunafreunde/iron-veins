import type { CargoStack } from '../cargo/stack';
import type { Cargo } from '../cargo/types';
import { MAX_VEHICLES } from '../constants';

/**
 * Vehicles as a struct of arrays (architecture law #7 and section 5.3).
 *
 * Per-vehicle variable length data - orders, loaded cargo, the current route -
 * cannot live in a typed array and is kept in parallel reference arrays. That
 * is a few thousand slots, not the million objects the rule is about, and none
 * of it is touched in the hot loop unless the vehicle is actually loading or
 * repathing.
 */

export const VehicleState = {
  /** Parked, not running its orders. */
  Stopped: 0,
  Driving: 1,
  Braking: 2,
  /** Standing at a station exchanging cargo. */
  Loading: 3,
  /** Standing at a station under a "wait for full load" order. */
  WaitingForCargo: 4,
  BrokenDown: 5,
  InDepot: 6,
  /** No route to the next order target. */
  NoRoute: 7,
} as const;
export type VehicleState = (typeof VehicleState)[keyof typeof VehicleState];

/** Translation keys for the state, for the vehicle panel and the log. */
export const VEHICLE_STATE_KEYS: readonly string[] = [
  'veh.state.stopped',
  'veh.state.driving',
  'veh.state.braking',
  'veh.state.loading',
  'veh.state.waiting',
  'veh.state.brokenDown',
  'veh.state.inDepot',
  'veh.state.noRoute',
];

export const OrderLoad = {
  /** Wait until the vehicle is full. */
  Full: 0,
  /** Take whatever is there and leave. */
  Partial: 1,
  /** Do not load at all. */
  None: 2,
} as const;
export type OrderLoad = (typeof OrderLoad)[keyof typeof OrderLoad];

export const OrderUnload = {
  All: 0,
  None: 1,
} as const;
export type OrderUnload = (typeof OrderUnload)[keyof typeof OrderUnload];

export const OrderTarget = {
  Station: 0,
  Depot: 1,
} as const;
export type OrderTarget = (typeof OrderTarget)[keyof typeof OrderTarget];

export interface Order {
  readonly target: OrderTarget;
  /** Station id, or the tile index of a depot. */
  readonly targetId: number;
  readonly load: OrderLoad;
  readonly unload: OrderUnload;
}

/** Longest route a road vehicle may hold. */
export const MAX_PATH_TILES = 2_048;

export class VehicleStore {
  readonly capacity: number;
  /** Highest slot ever used; iteration runs to here and skips dead slots. */
  count = 0;

  readonly alive: Uint8Array;
  readonly specId: Int32Array;
  readonly ownerId: Uint8Array;
  readonly state: Uint8Array;

  /** Tile the vehicle currently occupies. */
  readonly tileIndex: Int32Array;
  /** Metres travelled from that tile towards the next one on the route. */
  readonly progressM: Float32Array;
  readonly speedMs: Float32Array;

  readonly pathLength: Int32Array;
  readonly pathIndex: Int32Array;

  readonly orderIndex: Uint8Array;
  readonly builtTick: Int32Array;
  readonly reliability: Uint16Array;
  readonly breakdownTicks: Int32Array;
  /** Remaining ticks of the current loading stop. */
  readonly loadTicks: Float32Array;
  /** Cargo the vehicle is configured to carry. */
  readonly refitCargo: Uint8Array;
  /** Tile of the depot the vehicle was bought at, for servicing. */
  readonly homeDepotTile: Int32Array;
  /** Revenue earned since the vehicle was bought. [cent] */
  readonly earnedCt: Float64Array;

  readonly orders: Order[][] = [];
  readonly cargo: CargoStack[][] = [];
  readonly paths: Int32Array[] = [];

  private readonly freeSlots: number[] = [];

  constructor(capacity: number = MAX_VEHICLES) {
    this.capacity = capacity;
    this.alive = new Uint8Array(capacity);
    this.specId = new Int32Array(capacity);
    this.ownerId = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.tileIndex = new Int32Array(capacity);
    this.progressM = new Float32Array(capacity);
    this.speedMs = new Float32Array(capacity);
    this.pathLength = new Int32Array(capacity);
    this.pathIndex = new Int32Array(capacity);
    this.orderIndex = new Uint8Array(capacity);
    this.builtTick = new Int32Array(capacity);
    this.reliability = new Uint16Array(capacity);
    this.breakdownTicks = new Int32Array(capacity);
    this.loadTicks = new Float32Array(capacity);
    this.refitCargo = new Uint8Array(capacity);
    this.homeDepotTile = new Int32Array(capacity);
    this.earnedCt = new Float64Array(capacity);
  }

  /** Take a slot. Returns -1 when the store is full. */
  create(specId: number, ownerId: number, tileIndex: number, tick: number, cargo: Cargo): number {
    // Reusing a freed slot keeps ids dense; the free list is drained in
    // insertion order so the choice is deterministic.
    const id = this.freeSlots.length > 0 ? this.freeSlots.shift()! : this.count++;
    if (id >= this.capacity) {
      this.count = this.capacity;
      return -1;
    }

    this.alive[id] = 1;
    this.specId[id] = specId;
    this.ownerId[id] = ownerId;
    this.state[id] = VehicleState.Stopped;
    this.tileIndex[id] = tileIndex;
    this.progressM[id] = 0;
    this.speedMs[id] = 0;
    this.pathLength[id] = 0;
    this.pathIndex[id] = 0;
    this.orderIndex[id] = 0;
    this.builtTick[id] = tick;
    this.breakdownTicks[id] = 0;
    this.loadTicks[id] = 0;
    this.refitCargo[id] = cargo;
    this.homeDepotTile[id] = tileIndex;
    this.earnedCt[id] = 0;

    this.orders[id] = [];
    this.cargo[id] = [];
    this.paths[id] = new Int32Array(MAX_PATH_TILES);
    return id;
  }

  destroy(id: number): void {
    if (this.alive[id] !== 1) return;
    this.alive[id] = 0;
    this.orders[id] = [];
    this.cargo[id] = [];
    this.freeSlots.push(id);
  }

  isAlive(id: number): boolean {
    return this.alive[id] === 1;
  }

  /** Number of vehicles that actually exist. */
  get livingCount(): number {
    let total = 0;
    for (let i = 0; i < this.count; i++) total += this.alive[i]!;
    return total;
  }
}
