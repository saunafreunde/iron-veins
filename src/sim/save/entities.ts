import type { CargoStack } from '../cargo/stack';
import { CARGO_COUNT } from '../cargo/types';
import {
  MODULE_KIND_COUNT,
  type ModuleKind,
  type Station,
  type StationModule,
} from '../station/types';
import { hasVehicleSpec, vehicleSpec } from '../vehicles/catalog';
import { powerCode } from '../vehicles/spec';
import { LineStore } from '../lines/LineStore';
import { MAX_CONSIST_UNITS, MAX_LINES, MAX_ORDERS_PER_VEHICLE } from '../constants';
import type { OrderLoad, OrderTarget, OrderUnload } from '../vehicles/VehicleStore';
import { MAX_PATH_TILES, VehicleStore, type Order } from '../vehicles/VehicleStore';
import { SaveFormatError } from './format';

/**
 * Serialisation of the entities that arrived with M2.
 *
 * Vehicles keep their computed route in the save. Recomputing it on load would
 * be cheaper, but a repathed vehicle can pick a different route than the one it
 * was driving, and that would break the save/load leg of the determinism suite -
 * which is exactly the alarm that must never be silenced.
 */

export interface StationSave {
  id: number;
  name: string;
  ownerId: number;
  x: number;
  y: number;
  townId: number;
  buildingsCovered: number;
  servedReliability: number;
  overflowUnits: number;
  modules: StationModule[];
  waiting: CargoStack[];
  visitTicks: number[];
  runwayFreeTick: number[];
  /** Derived on load, written to the file only because the shape is shared. */
  acceptedCargo: number;
  servedIndustries: number[];
}

export interface VehicleSave {
  id: number;
  specId: number;
  ownerId: number;
  state: number;
  tileIndex: number;
  progressM: number;
  speedMs: number;
  routeRemainingM: number;
  /** The run of its route the train holds, as route indices, or -1. */
  reservedFromIndex: number;
  reservedToIndex: number;
  /** Tile inside the block a block signal admitted the train to, or -1. */
  reservedBlockTile: number;
  /** Tick the train last made progress towards a claim, or -1. */
  waitingSinceTick: number;
  /** Station last called at and the tick of that arrival, or -1. */
  lastStationId: number;
  lastArrivalTick: number;
  /** Catalogue ids of a train's units; empty for anything else. */
  consist: number[];
  pathIndex: number;
  path: number[];
  orderIndex: number;
  /** Line the vehicle is assigned to, or -1 (section 12.2). */
  lineId: number;
  builtTick: number;
  reliability: number;
  breakdownTicks: number;
  loadTicks: number;
  refitCargo: number;
  homeDepotTile: number;
  earnedCt: number;
  /** Traction work done since the last energy bill. [J] */
  workJ: number;
  orders: Order[];
  cargo: CargoStack[];
}

// ------------------------------------------------------------------- encode

export function encodeStations(stations: readonly Station[]): StationSave[] {
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    ownerId: station.ownerId,
    x: station.x,
    y: station.y,
    townId: station.townId,
    buildingsCovered: station.buildingsCovered,
    servedReliability: station.servedReliability,
    overflowUnits: station.overflowUnits,
    modules: station.modules.map((module) => ({ ...module })),
    waiting: station.waiting.map((stack) => ({ ...stack })),
    visitTicks: [...station.visitTicks],
    runwayFreeTick: [...station.runwayFreeTick],
    // Recomputed on load; carried here only so the encoded shape matches.
    acceptedCargo: 0,
    servedIndustries: [],
  }));
}

export function encodeVehicles(store: VehicleStore): VehicleSave[] {
  const result: VehicleSave[] = [];

  for (let id = 0; id < store.count; id++) {
    if (store.alive[id] !== 1) continue;
    const length = store.pathLength[id]!;
    const path: number[] = [];
    for (let i = 0; i < length; i++) path.push(store.paths[id]![i]!);

    result.push({
      id,
      specId: store.specId[id]!,
      ownerId: store.ownerId[id]!,
      state: store.state[id]!,
      tileIndex: store.tileIndex[id]!,
      progressM: store.progressM[id]!,
      speedMs: store.speedMs[id]!,
      routeRemainingM: store.routeRemainingM[id]!,
      reservedFromIndex: store.reservedFromIndex[id]!,
      reservedToIndex: store.reservedToIndex[id]!,
      reservedBlockTile: store.reservedBlockTile[id]!,
      waitingSinceTick: store.waitingSinceTick[id]!,
      lastStationId: store.lastStationId[id]!,
      lastArrivalTick: store.lastArrivalTick[id]!,
      consist: [...store.consist[id]!],
      pathIndex: store.pathIndex[id]!,
      path,
      orderIndex: store.orderIndex[id]!,
      lineId: store.lineId[id]!,
      builtTick: store.builtTick[id]!,
      reliability: store.reliability[id]!,
      breakdownTicks: store.breakdownTicks[id]!,
      loadTicks: store.loadTicks[id]!,
      refitCargo: store.refitCargo[id]!,
      homeDepotTile: store.homeDepotTile[id]!,
      earnedCt: store.earnedCt[id]!,
      workJ: store.workJ[id]!,
      orders: store.orders[id]!.map((order) => ({ ...order })),
      cargo: store.cargo[id]!.map((stack) => ({ ...stack })),
    });
  }
  return result;
}

// ------------------------------------------------------------------- decode

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveFormatError(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaveFormatError(`${path}: expected a finite number`);
  }
  return value;
}

function int(value: unknown, path: string): number {
  const n = num(value, path);
  if (!Number.isInteger(n)) throw new SaveFormatError(`${path}: expected an integer`);
  return n;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new SaveFormatError(`${path}: expected a string`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new SaveFormatError(`${path}: expected a boolean`);
  return value;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new SaveFormatError(`${path}: expected an array`);
  return value;
}

function decodeStacks(value: unknown, path: string): CargoStack[] {
  return list(value, path).map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    const cargo = int(raw['cargo'], `${path}[${i}].cargo`);
    if (cargo < 0 || cargo >= CARGO_COUNT) {
      throw new SaveFormatError(`${path}[${i}].cargo: ${cargo} is not a known cargo type`);
    }
    return {
      cargo: cargo as CargoStack['cargo'],
      amount: num(raw['amount'], `${path}[${i}].amount`),
      createdTick: num(raw['createdTick'], `${path}[${i}].createdTick`),
      originStationId: int(raw['originStationId'], `${path}[${i}].originStationId`),
      destinationStationId: int(raw['destinationStationId'], `${path}[${i}].destinationStationId`),
      paidFromX: num(raw['paidFromX'], `${path}[${i}].paidFromX`),
      paidFromY: num(raw['paidFromY'], `${path}[${i}].paidFromY`),
    };
  });
}

export function decodeStations(value: unknown, path: string): Station[] {
  return list(value, path).map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    const modules = list(raw['modules'], `${path}[${i}].modules`).map((moduleValue, m) => {
      const moduleRaw = record(moduleValue, `${path}[${i}].modules[${m}]`);
      const kind = int(moduleRaw['kind'], `${path}[${i}].modules[${m}].kind`);
      if (kind < 0 || kind >= MODULE_KIND_COUNT) {
        throw new SaveFormatError(`${path}[${i}].modules[${m}].kind: unknown module ${kind}`);
      }
      return {
        kind: kind as ModuleKind,
        tileIndex: int(moduleRaw['tileIndex'], `${path}[${i}].modules[${m}].tileIndex`),
        x: int(moduleRaw['x'], `${path}[${i}].modules[${m}].x`),
        y: int(moduleRaw['y'], `${path}[${i}].modules[${m}].y`),
      };
    });

    return {
      id: int(raw['id'], `${path}[${i}].id`),
      name: text(raw['name'], `${path}[${i}].name`),
      ownerId: int(raw['ownerId'], `${path}[${i}].ownerId`),
      x: int(raw['x'], `${path}[${i}].x`),
      y: int(raw['y'], `${path}[${i}].y`),
      townId: int(raw['townId'], `${path}[${i}].townId`),
      buildingsCovered: int(raw['buildingsCovered'], `${path}[${i}].buildingsCovered`),
      servedReliability: int(raw['servedReliability'], `${path}[${i}].servedReliability`),
      overflowUnits: num(raw['overflowUnits'], `${path}[${i}].overflowUnits`),
      modules,
      // Derived from the map on load, exactly as the land masses are.
      acceptedCargo: 0,
      servedIndustries: [],
      runwayFreeTick: list(raw['runwayFreeTick'], `${path}[${i}].runwayFreeTick`).map((tick, t) =>
        int(tick, `${path}[${i}].runwayFreeTick[${t}]`),
      ),
      waiting: decodeStacks(raw['waiting'], `${path}[${i}].waiting`),
      visitTicks: list(raw['visitTicks'], `${path}[${i}].visitTicks`).map((tick, t) =>
        int(tick, `${path}[${i}].visitTicks[${t}]`),
      ),
    };
  });
}

/** Validate the vehicle section of a save. */
export function decodeVehicles(value: unknown, path: string): VehicleSave[] {
  return list(value, path).map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    const specId = int(raw['specId'], `${path}[${i}].specId`);
    if (!hasVehicleSpec(specId)) {
      throw new SaveFormatError(`${path}[${i}].specId: ${specId} is not a known vehicle`);
    }

    const pathTiles = list(raw['path'], `${path}[${i}].path`);
    if (pathTiles.length > MAX_PATH_TILES) {
      throw new SaveFormatError(`${path}[${i}].path: ${pathTiles.length} tiles is too long`);
    }

    const consistRaw = list(raw['consist'], `${path}[${i}].consist`);
    if (consistRaw.length > MAX_CONSIST_UNITS) {
      throw new SaveFormatError(`${path}[${i}].consist: ${consistRaw.length} units is too many`);
    }
    const consist = consistRaw.map((unit, u) => {
      const unitId = int(unit, `${path}[${i}].consist[${u}]`);
      if (!hasVehicleSpec(unitId)) {
        throw new SaveFormatError(`${path}[${i}].consist[${u}]: ${unitId} is not a known vehicle`);
      }
      return unitId;
    });

    return {
      id: int(raw['id'], `${path}[${i}].id`),
      specId,
      ownerId: int(raw['ownerId'], `${path}[${i}].ownerId`),
      state: int(raw['state'], `${path}[${i}].state`),
      tileIndex: int(raw['tileIndex'], `${path}[${i}].tileIndex`),
      progressM: num(raw['progressM'], `${path}[${i}].progressM`),
      speedMs: num(raw['speedMs'], `${path}[${i}].speedMs`),
      routeRemainingM: num(raw['routeRemainingM'], `${path}[${i}].routeRemainingM`),
      reservedFromIndex: int(raw['reservedFromIndex'], `${path}[${i}].reservedFromIndex`),
      reservedToIndex: int(raw['reservedToIndex'], `${path}[${i}].reservedToIndex`),
      reservedBlockTile: int(raw['reservedBlockTile'], `${path}[${i}].reservedBlockTile`),
      waitingSinceTick: int(raw['waitingSinceTick'], `${path}[${i}].waitingSinceTick`),
      lastStationId: int(raw['lastStationId'], `${path}[${i}].lastStationId`),
      lastArrivalTick: int(raw['lastArrivalTick'], `${path}[${i}].lastArrivalTick`),
      consist,
      pathIndex: int(raw['pathIndex'], `${path}[${i}].pathIndex`),
      path: pathTiles.map((tile, t) => int(tile, `${path}[${i}].path[${t}]`)),
      orderIndex: int(raw['orderIndex'], `${path}[${i}].orderIndex`),
      lineId: int(raw['lineId'], `${path}[${i}].lineId`),
      builtTick: int(raw['builtTick'], `${path}[${i}].builtTick`),
      reliability: int(raw['reliability'], `${path}[${i}].reliability`),
      breakdownTicks: int(raw['breakdownTicks'], `${path}[${i}].breakdownTicks`),
      loadTicks: num(raw['loadTicks'], `${path}[${i}].loadTicks`),
      refitCargo: int(raw['refitCargo'], `${path}[${i}].refitCargo`),
      homeDepotTile: int(raw['homeDepotTile'], `${path}[${i}].homeDepotTile`),
      earnedCt: num(raw['earnedCt'], `${path}[${i}].earnedCt`),
      workJ: num(raw['workJ'], `${path}[${i}].workJ`),
      orders: list(raw['orders'], `${path}[${i}].orders`).map((orderValue, o) => {
        const where = `${path}[${i}].orders[${o}]`;
        const order = record(orderValue, where);
        // The full 12.1 grammar. Every field is required: the v24 migration
        // gives old orders their defaults, so a current save missing one is
        // damaged, not merely old.
        return {
          target: int(order['target'], `${where}.target`) as OrderTarget,
          targetId: int(order['targetId'], `${where}.targetId`),
          load: int(order['load'], `${where}.load`) as OrderLoad,
          unload: int(order['unload'], `${where}.unload`) as OrderUnload,
          refitTo: int(order['refitTo'], `${where}.refitTo`),
          waitTicks: int(order['waitTicks'], `${where}.waitTicks`),
          condKind: int(order['condKind'], `${where}.condKind`),
          condComparator: int(order['condComparator'], `${where}.condComparator`),
          condValue: num(order['condValue'], `${where}.condValue`),
          condJumpTo: int(order['condJumpTo'], `${where}.condJumpTo`),
        };
      }),
      cargo: decodeStacks(raw['cargo'], `${path}[${i}].cargo`),
    };
  });
}

// ------------------------------------------------------------------- lines

/**
 * One line of section 12.2 as the save carries it: the LIVING lines with
 * their ids and shared order lists. Dead slots are not written - the store's
 * lowest-dead-slot allocation makes the alive bitmap alone reproduce every
 * future id choice, so holes need no representation (see LineStore.create).
 */
export interface LineSave {
  id: number;
  ownerId: number;
  /** Per-line auto-renewal (section 11.3). */
  autoRenew: boolean;
  orders: Order[];
}

export function encodeLines(store: LineStore): LineSave[] {
  const result: LineSave[] = [];
  for (let id = 0; id < store.count; id++) {
    if (store.alive[id] !== 1) continue;
    result.push({
      id,
      ownerId: store.ownerId[id]!,
      autoRenew: store.autoRenew[id] === 1,
      orders: store.orders[id]!.map((order) => ({ ...order })),
    });
  }
  return result;
}

/** Validate the line section of a save. */
export function decodeLines(value: unknown, path: string): LineSave[] {
  return list(value, path).map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    const id = int(raw['id'], `${path}[${i}].id`);
    if (id < 0 || id >= MAX_LINES) {
      throw new SaveFormatError(`${path}[${i}].id: ${id} is outside the line store`);
    }
    const ordersRaw = list(raw['orders'], `${path}[${i}].orders`);
    if (ordersRaw.length > MAX_ORDERS_PER_VEHICLE) {
      throw new SaveFormatError(`${path}[${i}].orders: ${ordersRaw.length} orders is too many`);
    }
    return {
      id,
      ownerId: int(raw['ownerId'], `${path}[${i}].ownerId`),
      autoRenew: bool(raw['autoRenew'], `${path}[${i}].autoRenew`),
      orders: ordersRaw.map((orderValue, o) => {
        const where = `${path}[${i}].orders[${o}]`;
        const order = record(orderValue, where);
        return {
          target: int(order['target'], `${where}.target`) as OrderTarget,
          targetId: int(order['targetId'], `${where}.targetId`),
          load: int(order['load'], `${where}.load`) as OrderLoad,
          unload: int(order['unload'], `${where}.unload`) as OrderUnload,
          refitTo: int(order['refitTo'], `${where}.refitTo`),
          waitTicks: int(order['waitTicks'], `${where}.waitTicks`),
          condKind: int(order['condKind'], `${where}.condKind`),
          condComparator: int(order['condComparator'], `${where}.condComparator`),
          condValue: num(order['condValue'], `${where}.condValue`),
          condJumpTo: int(order['condJumpTo'], `${where}.condJumpTo`),
        };
      }),
    };
  });
}

/** Rebuild a live line store from validated save data. */
export function buildLineStore(saves: readonly LineSave[]): LineStore {
  const store = new LineStore();
  for (const save of saves) {
    const id = save.id;
    store.alive[id] = 1;
    if (id >= store.count) store.count = id + 1;
    store.ownerId[id] = save.ownerId;
    store.autoRenew[id] = save.autoRenew ? 1 : 0;
    store.orders[id] = save.orders.map((order) => ({ ...order }));
  }
  return store;
}

/** Rebuild a live vehicle store from validated save data. */
export function buildVehicleStore(saves: readonly VehicleSave[]): VehicleStore {
  const store = new VehicleStore();

  for (const save of saves) {
    const id = save.id;
    if (id < 0 || id >= store.capacity) {
      throw new SaveFormatError(`save.state.vehicles: id ${id} is outside the vehicle store`);
    }

    store.alive[id] = 1;
    if (id >= store.count) store.count = id + 1;

    store.specId[id] = save.specId;
    store.ownerId[id] = save.ownerId;
    store.state[id] = save.state;
    store.kind[id] = vehicleSpec(save.specId).kind;
    store.tileIndex[id] = save.tileIndex;
    store.progressM[id] = save.progressM;
    store.speedMs[id] = save.speedMs;
    store.routeRemainingM[id] = save.routeRemainingM;
    store.reservedFromIndex[id] = save.reservedFromIndex;
    store.reservedToIndex[id] = save.reservedToIndex;
    store.reservedBlockTile[id] = save.reservedBlockTile;
    store.waitingSinceTick[id] = save.waitingSinceTick;
    store.lastStationId[id] = save.lastStationId;
    store.lastArrivalTick[id] = save.lastArrivalTick;
    store.consist[id] = [...save.consist];
    store.pathIndex[id] = save.pathIndex;
    store.pathLength[id] = save.path.length;
    store.orderIndex[id] = save.orderIndex;
    store.lineId[id] = save.lineId;
    store.builtTick[id] = save.builtTick;
    store.reliability[id] = save.reliability;
    store.breakdownTicks[id] = save.breakdownTicks;
    store.loadTicks[id] = save.loadTicks;
    store.refitCargo[id] = save.refitCargo;
    store.homeDepotTile[id] = save.homeDepotTile;
    store.earnedCt[id] = save.earnedCt;
    store.workJ[id] = save.workJ;
    store.powerCode[id] = powerCode(vehicleSpec(save.specId).power);

    store.paths[id] = new Int32Array(MAX_PATH_TILES);
    for (let t = 0; t < save.path.length; t++) store.paths[id]![t] = save.path[t]!;

    store.orders[id] = save.orders.map((order) => ({ ...order }));
    store.cargo[id] = save.cargo.map((stack) => ({ ...stack }));
    // The cached aggregate is derived, never stored: keeping it out of the save
    // means it cannot go stale against a rebalanced catalogue.
    store.refreshAggregate(id);
  }
  return store;
}
