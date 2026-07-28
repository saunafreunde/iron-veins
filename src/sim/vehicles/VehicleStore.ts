import type { CargoStack } from '../cargo/stack';
import type { Cargo } from '../cargo/types';
import { BRAKE_ROAD, LATERAL_ACCEL_ROAD, MAX_VEHICLES } from '../constants';
import { capacityFor, vehicleSpec } from './catalog';
import { powerCode } from './spec';
import {
  aggregateConsist,
  brakeForCargo,
  consistCapacityFor,
  consistHasCooling,
  lateralForCargo,
  payloadMassKg,
} from './consist';

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
  /** Held at a signal: the section ahead belongs to another train. */
  WaitingForPath: 8,
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
  'veh.state.waitingForPath',
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
  /** A value of VehicleKind, cached so the tick loop needs no catalogue lookup. */
  readonly kind: Uint8Array;

  /** Tile the vehicle currently occupies. */
  readonly tileIndex: Int32Array;
  /** Metres travelled from that tile towards the next one on the route. */
  readonly progressM: Float32Array;
  readonly speedMs: Float32Array;

  readonly pathLength: Int32Array;
  readonly pathIndex: Int32Array;
  /**
   * Metres from the START of the current tile to the end of the route.
   *
   * The distance actually left to drive is this minus `progressM`. Deliberately
   * not a second odometer counting down beside `progressM`: two accumulators
   * fed the same numbers drift apart in the last decimal, and the one place
   * that matters is the boundary of the final tile. A vehicle whose countdown
   * hit zero a hair before its progress crossed the last tile edge would brake
   * for a route end it had not reached, and stand there for ever.
   *
   * Updated only when a tile is completed, by the very step length the tile
   * advance uses, so the two can never disagree.
   */
  readonly routeRemainingM: Float32Array;

  /**
   * The run of its own route a train currently holds, as route indices, or -1.
   *
   * Indices rather than tiles, and a range rather than a list, because that is
   * all a contiguous claim needs - and because it makes the reservation table
   * itself derived state that never has to be saved (DECISIONS.md D-057).
   */
  readonly reservedFromIndex: Int32Array;
  readonly reservedToIndex: Int32Array;
  /**
   * A tile inside the block a block signal let this train into, or -1.
   *
   * A TILE and not a block id: the block numbering is derived and a rebuild
   * renumbers it, whereas a tile index survives every rebuild untouched
   * (DECISIONS.md D-054).
   */
  readonly reservedBlockTile: Int32Array;
  /**
   * Tick at which this train last made progress towards a claim. Feeds the
   * deadlock warning of section 9.3.
   */
  readonly waitingSinceTick: Int32Array;

  /**
   * The station this vehicle last called at, and when it got there, or -1.
   *
   * Together they measure one leg of a line: arrival to arrival, which is what
   * cargo standing on the platform actually waits through - the loading at this
   * end included. That measurement is the only thing that keeps the connection
   * table of section 7.4 honest about a line that is slower than it looks.
   *
   * Cleared whenever the orders change or the vehicle is stopped: the time
   * between two arrivals either side of that is not a measurement of anything.
   */
  readonly lastStationId: Int32Array;
  readonly lastArrivalTick: Int32Array;

  // --- aggregate of the whole vehicle, recomputed when it or its load changes.
  // For a road vehicle these are simply its own figures; for a train they are
  // the sums of section 11.2. Caching them keeps the solver free of catalogue
  // lookups and of any knowledge that a train has parts at all.

  /** Mass including the load it is carrying. [kg] */
  readonly massKg: Float32Array;
  readonly tractiveN: Float32Array;
  readonly powerW: Float32Array;
  readonly maxSpeedMs: Float32Array;
  readonly lengthM: Float32Array;
  /** Braking deceleration of this vehicle with this load. [m/s^2] */
  readonly brakeMs2: Float32Array;
  /** Lateral acceleration its load tolerates in a curve. [m/s^2] */
  readonly lateralAccel: Float32Array;
  /** How many units of its refit cargo it can hold. */
  readonly capacityUnits: Float32Array;
  /** 1 when every unit carrying the refit cargo is refrigerated. */
  readonly hasCooling: Uint8Array;
  /** 1 when it can only run under catenary. */
  readonly needsCatenary: Uint8Array;

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
  /**
   * Traction work done since the last time the energy bill was drawn. [J]
   *
   * Float64 and not Float32, and reset every month. One tick can be 840 kJ and
   * a game year is 72_000 ticks, so a Float32 - 24 bits of mantissa - would
   * stop accumulating meaningfully inside the first game MONTH and the bill
   * would silently stop growing (DECISIONS.md D-091).
   */
  readonly workJ: Float64Array;
  /** A value of PowerCode, cached so the tick loop needs no lookup. */
  readonly powerCode: Uint8Array;

  readonly orders: Order[][] = [];
  readonly cargo: CargoStack[][] = [];
  readonly paths: Int32Array[] = [];
  /**
   * Spec ids of the units a train is made of, locomotive first. Empty for
   * anything that is not a train.
   */
  readonly consist: number[][] = [];

  private readonly freeSlots: number[] = [];

  constructor(capacity: number = MAX_VEHICLES) {
    this.capacity = capacity;
    this.alive = new Uint8Array(capacity);
    this.specId = new Int32Array(capacity);
    this.ownerId = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.tileIndex = new Int32Array(capacity);
    this.progressM = new Float32Array(capacity);
    this.speedMs = new Float32Array(capacity);
    this.pathLength = new Int32Array(capacity);
    this.pathIndex = new Int32Array(capacity);
    this.routeRemainingM = new Float32Array(capacity);
    this.reservedFromIndex = new Int32Array(capacity).fill(-1);
    this.reservedToIndex = new Int32Array(capacity).fill(-1);
    this.reservedBlockTile = new Int32Array(capacity).fill(-1);
    this.waitingSinceTick = new Int32Array(capacity).fill(-1);
    this.lastStationId = new Int32Array(capacity).fill(-1);
    this.lastArrivalTick = new Int32Array(capacity).fill(-1);
    this.massKg = new Float32Array(capacity);
    this.tractiveN = new Float32Array(capacity);
    this.powerW = new Float32Array(capacity);
    this.maxSpeedMs = new Float32Array(capacity);
    this.lengthM = new Float32Array(capacity);
    this.brakeMs2 = new Float32Array(capacity);
    this.lateralAccel = new Float32Array(capacity);
    this.capacityUnits = new Float32Array(capacity);
    this.hasCooling = new Uint8Array(capacity);
    this.needsCatenary = new Uint8Array(capacity);
    this.orderIndex = new Uint8Array(capacity);
    this.builtTick = new Int32Array(capacity);
    this.reliability = new Uint16Array(capacity);
    this.breakdownTicks = new Int32Array(capacity);
    this.loadTicks = new Float32Array(capacity);
    this.refitCargo = new Uint8Array(capacity);
    this.homeDepotTile = new Int32Array(capacity);
    this.earnedCt = new Float64Array(capacity);
    this.workJ = new Float64Array(capacity);
    this.powerCode = new Uint8Array(capacity);
  }

  /**
   * Recompute the cached aggregate of one vehicle.
   *
   * Called when the vehicle is created, when its consist or refit changes, and
   * whenever cargo is loaded or unloaded - a full coal train weighs three times
   * what the empty one does, and the solver has to see that.
   */
  refreshAggregate(id: number): void {
    const refit = this.refitCargo[id]! as Cargo;
    const units = this.consist[id];

    if (units !== undefined && units.length > 0) {
      const aggregate = aggregateConsist(units);
      this.massKg[id] = aggregate.massKg + payloadMassKg(this.cargo[id] ?? []);
      this.tractiveN[id] = aggregate.tractiveN;
      this.powerW[id] = aggregate.powerW;
      this.maxSpeedMs[id] = aggregate.maxSpeedMs;
      this.lengthM[id] = aggregate.lengthM;
      this.brakeMs2[id] = brakeForCargo(refit);
      this.lateralAccel[id] = lateralForCargo(refit);
      this.capacityUnits[id] = consistCapacityFor(units, refit);
      this.hasCooling[id] = consistHasCooling(units, refit) ? 1 : 0;
      this.needsCatenary[id] = aggregate.needsCatenary ? 1 : 0;
      return;
    }

    // Road vehicle masses in the catalogue are laden figures, so no payload is
    // added here - see DECISIONS.md D-045.
    const spec = vehicleSpec(this.specId[id]!);
    this.massKg[id] = spec.massKg;
    this.tractiveN[id] = spec.tractiveN;
    this.powerW[id] = spec.powerW;
    this.maxSpeedMs[id] = spec.maxSpeedMs;
    this.lengthM[id] = spec.lengthM;
    this.brakeMs2[id] = BRAKE_ROAD;
    this.lateralAccel[id] = LATERAL_ACCEL_ROAD;
    this.capacityUnits[id] = capacityFor(spec, refit);
    this.hasCooling[id] = spec.hasCooling ? 1 : 0;
    this.needsCatenary[id] = spec.needsCatenary ? 1 : 0;
  }

  /**
   * Take a slot. Returns -1 when the store is full.
   *
   * `consist` is the list of units a train is made of; `specId` is then the
   * leading one, which is what the fleet list and the save name it by.
   */
  create(
    specId: number,
    ownerId: number,
    tileIndex: number,
    tick: number,
    cargo: Cargo,
    consist?: readonly number[],
  ): number {
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
    this.kind[id] = vehicleSpec(specId).kind;
    this.tileIndex[id] = tileIndex;
    this.progressM[id] = 0;
    this.speedMs[id] = 0;
    this.pathLength[id] = 0;
    this.pathIndex[id] = 0;
    this.routeRemainingM[id] = 0;
    this.reservedFromIndex[id] = -1;
    this.reservedToIndex[id] = -1;
    this.reservedBlockTile[id] = -1;
    this.waitingSinceTick[id] = -1;
    this.lastStationId[id] = -1;
    this.lastArrivalTick[id] = -1;
    this.orderIndex[id] = 0;
    this.builtTick[id] = tick;
    // A train is only as reliable as its worst unit, which is what
    // aggregateConsist already works out. Leaving this unset made every vehicle
    // in the game start at reliability ZERO - a one in four chance of breaking
    // down every single game day (DECISIONS.md D-089).
    this.reliability[id] =
      consist !== undefined && consist.length > 0
        ? aggregateConsist(consist).reliability0
        : vehicleSpec(specId).reliability0;
    this.breakdownTicks[id] = 0;
    this.loadTicks[id] = 0;
    this.refitCargo[id] = cargo;
    this.homeDepotTile[id] = tileIndex;
    this.earnedCt[id] = 0;
    this.workJ[id] = 0;
    // A train burns whatever its LEADING unit burns: the locomotive is what
    // does the work, and a diesel with electric coaches is still a diesel.
    this.powerCode[id] = powerCode(vehicleSpec(specId).power);

    this.orders[id] = [];
    this.cargo[id] = [];
    this.consist[id] = consist === undefined ? [] : [...consist];
    this.paths[id] = new Int32Array(MAX_PATH_TILES);
    this.refreshAggregate(id);
    return id;
  }

  destroy(id: number): void {
    if (this.alive[id] !== 1) return;
    this.alive[id] = 0;
    this.reservedFromIndex[id] = -1;
    this.reservedToIndex[id] = -1;
    this.reservedBlockTile[id] = -1;
    this.waitingSinceTick[id] = -1;
    this.lastStationId[id] = -1;
    this.lastArrivalTick[id] = -1;
    this.orders[id] = [];
    this.cargo[id] = [];
    this.consist[id] = [];
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
