import { describe, expect, it } from 'vitest';
import type { StationMarker, VehicleMarker } from '../../src/shared/protocol';
import { Cargo } from '../../src/sim/cargo/types';
import { ModuleKind } from '../../src/sim/station/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { refitTargets, standsInDepot } from '../../src/ui/refit';

/**
 * The refit button's two predictions (D-126). Both mirror the sim's own
 * validator in commands/build.ts: `standsInDepot` mirrors the D-076 rule -
 * a FRESHLY BOUGHT vehicle is Stopped on its depot tile, not InDepot, and
 * must still be refittable, or tutorial lesson 5 cannot be finished - and
 * `refitTargets` uses the very capacity lookup the command validates with.
 */

const MAP_SIZE = 64;

function vehicle(overrides: Partial<VehicleMarker>): VehicleMarker {
  return {
    id: 1,
    specId: 240, // bulk lorry: coal by default, refittable to four more
    kind: 1, // VehicleKind.Road
    state: VehicleState.Stopped,
    cargoUnits: 0,
    capacity: 28,
    earnedCt: 0,
    orderStationIds: [],
    consist: [],
    maxSpeedMs: 15,
    lengthM: 8,
    tileIndex: 10 * MAP_SIZE + 10,
    waitingTicks: 0,
    ...overrides,
  };
}

function depotStation(kind: ModuleKind): StationMarker {
  return {
    id: 0,
    name: 'Depot',
    x: 10,
    y: 10,
    rating: 50,
    waiting: 0,
    modules: [{ kind, x: 10, y: 10 }],
  };
}

describe('standsInDepot, the D-076 mirror', () => {
  it('accepts a freshly bought vehicle: Stopped on the depot tile', () => {
    expect(standsInDepot(vehicle({}), [depotStation(ModuleKind.RoadDepot)], MAP_SIZE)).toBe(true);
  });

  it('accepts a vehicle that drove in: InDepot, wherever it stands', () => {
    expect(standsInDepot(vehicle({ state: VehicleState.InDepot }), [], MAP_SIZE)).toBe(true);
  });

  it('refuses a vehicle stopped in the open country', () => {
    expect(standsInDepot(vehicle({ tileIndex: 5 }), [depotStation(ModuleKind.RoadDepot)], MAP_SIZE)).toBe(
      false,
    );
  });

  it('refuses a driving vehicle even on the depot tile', () => {
    expect(
      standsInDepot(vehicle({ state: VehicleState.Driving }), [depotStation(ModuleKind.RoadDepot)], MAP_SIZE),
    ).toBe(false);
  });

  it("wants the depot of the vehicle's own mode", () => {
    // A lorry on a RAIL depot tile is parked somewhere odd, not in a workshop.
    expect(standsInDepot(vehicle({}), [depotStation(ModuleKind.RailDepot)], MAP_SIZE)).toBe(false);
  });
});

describe('refitTargets, the CannotCarry mirror', () => {
  it('offers exactly what the bulk lorry can be converted to', () => {
    const targets = refitTargets(vehicle({}));
    expect(targets.map((target) => target.cargo)).toEqual([
      Cargo.Coal,
      Cargo.IronOre,
      Cargo.Wood,
      Cargo.Grain,
      Cargo.Gravel,
    ]);
    // A refitted vehicle carries what its original load would have been.
    for (const target of targets) expect(target.capacity).toBe(28);
  });

  it('offers a bus nothing but its passengers', () => {
    const targets = refitTargets(vehicle({ specId: 200 }));
    expect(targets).toEqual([{ cargo: Cargo.Passengers, capacity: 150 }]);
  });

  it('sums a train consist over its wagons', () => {
    // A locomotive (id 1000, carries nothing) and two open wagons (id 1520,
    // 25 t of coal each): the train converts as a whole, so every target
    // carries the sum of both wagons.
    const targets = refitTargets(vehicle({ kind: 0, specId: 1000, consist: [1000, 1520, 1520] }));
    const coal = targets.find((target) => target.cargo === Cargo.Coal);
    expect(coal).toEqual({ cargo: Cargo.Coal, capacity: 50 });
    expect(targets.map((target) => target.cargo)).toContain(Cargo.Grain);
  });
});
