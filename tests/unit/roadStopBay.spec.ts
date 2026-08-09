import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import {
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  ROAD_STOP_UPKEEP_CT,
  ROAD_UPKEEP_PER_TILE_CT,
  TILE_PUBLIC,
} from '../../src/sim/constants';
import { Terrain } from '../../src/sim/map/terrain';
import { planRoadStop, roadBuildableAt, RoadStopShape } from '../../src/sim/net/roadBuilder';
import { RoadPathfinder } from '../../src/sim/net/roadPath';
import { ModuleKind } from '../../src/sim/station/types';
import { MAX_PATH_TILES } from '../../src/sim/vehicles/VehicleStore';
import { BuildingKind, RoadBit } from '../../src/sim/town/types';
import { apply, flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * A road stop beside the road (D-210).
 *
 * Until this rule, `buildRoadStop` refused every tile that did not already
 * carry road, so a stop, a lorry bay and a road depot all stood ON the
 * carriageway and their artwork covered it. A stop may now stand beside the
 * road on ground of its own; the build lays one tile of road to reach it and
 * charges for that tile.
 *
 * What the file holds, in the order the milestone asked for it:
 *
 *  - the spur is one connection, on the module tile, at road's own price;
 *  - the choice between several candidate roads is a TOTAL ORDER and does not
 *    depend on the order the roads were laid in;
 *  - a vehicle provably drives into the bay and back out;
 *  - demolishing the road beside a bay leaves a defined, repairable state;
 *  - the preview and the bill are the same number, because they are the same
 *    function.
 */

const SIZE = 64;
const ROW = 20;
/** The 1950 omnibus - the same one every road scenario in the suite buys. */
const BUS = 200;

function bench(aiCompanies = 0): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9, aiCompanies);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

/** How many of the four connection bits a tile carries. */
function degree(bits: number): number {
  let count = 0;
  for (const bit of [RoadBit.West, RoadBit.East, RoadBit.North, RoadBit.South]) {
    if ((bits & bit) !== 0) count++;
  }
  return count;
}

/** A straight road along `ROW`, from x = 5 to x = 15. */
function trunk(scenario: Scenario): void {
  apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW });
}

describe('a road stop built beside the road', () => {
  it('lays exactly one spur, on its own tile, and leaves the carriageway alone', () => {
    const scenario = bench();
    const map = scenario.world.map;
    trunk(scenario);
    const road = map.tileIndex(10, ROW);
    const roadBitsBefore = map.roadBits[road]!;

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });

    const bay = map.tileIndex(10, ROW + 1);
    // ONE connection, pointing north at the road it attached to.
    expect(map.roadBits[bay]).toBe(RoadBit.North);
    expect(degree(map.roadBits[bay]!)).toBe(1);
    // The carriageway gained the matching bit and nothing else.
    expect(map.roadBits[road]).toBe(roadBitsBefore | RoadBit.South);
    // The spur IS road: paved ground, and the tile belongs to the builder.
    expect(map.terrain[bay]).toBe(Terrain.TownGround);
    expect(map.owner[bay]).toBe(scenario.world.playerCompany.id);

    const station = scenario.world.stations[0]!;
    expect(station.modules).toHaveLength(1);
    expect(station.modules[0]!.tileIndex).toBe(bay);
  });

  it('charges the module plus one tile of road, and keeps the upkeep of both', () => {
    const scenario = bench();
    const world = scenario.world;
    trunk(scenario);
    const cashBefore = world.playerCompany.cashCt;
    const upkeepBefore = world.playerCompany.infrastructureUpkeepPerYearCt;
    const assetsBefore = world.playerCompany.fixedAssetsCt;

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });

    const expected = world.costCt(ROAD_STOP_COST_CT + ROAD_COST_PER_TILE_CT);
    expect(cashBefore - world.playerCompany.cashCt).toBe(expected);
    expect(world.playerCompany.infrastructureUpkeepPerYearCt - upkeepBefore).toBe(
      ROAD_STOP_UPKEEP_CT + ROAD_UPKEEP_PER_TILE_CT,
    );
    expect(world.playerCompany.fixedAssetsCt - assetsBefore).toBe(
      ROAD_STOP_COST_CT + ROAD_COST_PER_TILE_CT,
    );
  });

  it('leaves the drive-through stop exactly as it was: no spur, no road charge', () => {
    const scenario = bench();
    const world = scenario.world;
    const map = world.map;
    trunk(scenario);
    const before = map.roadBits.slice();
    const cashBefore = world.playerCompany.cashCt;
    const upkeepBefore = world.playerCompany.infrastructureUpkeepPerYearCt;

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW,
      moduleKind: ModuleKind.BusStop,
    });

    expect(map.roadBits).toEqual(before);
    expect(cashBefore - world.playerCompany.cashCt).toBe(world.costCt(ROAD_STOP_COST_CT));
    expect(world.playerCompany.infrastructureUpkeepPerYearCt - upkeepBefore).toBe(
      ROAD_STOP_UPKEEP_CT,
    );
  });

  it('builds a depot the same way, at the depot price plus the same one tile', () => {
    const scenario = bench();
    const world = scenario.world;
    trunk(scenario);
    const cashBefore = world.playerCompany.cashCt;

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 12,
      y: ROW + 1,
      moduleKind: ModuleKind.RoadDepot,
    });

    expect(cashBefore - world.playerCompany.cashCt).toBe(
      world.costCt(ROAD_DEPOT_COST_CT + ROAD_COST_PER_TILE_CT),
    );
    expect(world.map.roadBits[world.map.tileIndex(12, ROW + 1)]).toBe(RoadBit.North);
  });
});

/**
 * Four roads can touch one tile, and which one the bay attaches to may not
 * depend on the order anything was walked in (architecture law #3). The key is
 * `(-roadDegree, tileIndex)`; both halves are pinned here, and the second is
 * pinned against the BUILD order as well.
 */
describe('which of several roads a bay attaches to', () => {
  /** A through road along `y`, x = 8..12. */
  function rowRoad(scenario: Scenario, y: number): void {
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 8, y1: y, x2: 12, y2: y });
  }
  /** A through road along `x`, y = 8..12. */
  function columnRoad(scenario: Scenario, x: number): void {
    apply(scenario, { kind: CommandKind.BuildRoad, x1: x, y1: 8, x2: x, y2: 12 });
  }

  it('takes the through carriageway over a dead-end stub, even though the stub is nearer the top', () => {
    const scenario = bench();
    const map = scenario.world.map;
    // North of the bay: a stub of two tiles, so (10, 9) has degree 1.
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: 8, x2: 10, y2: 9 });
    // South of the bay: a through road, so (10, 11) has degree 2.
    rowRoad(scenario, 11);
    expect(degree(map.roadBits[map.tileIndex(10, 9)]!)).toBe(1);
    expect(degree(map.roadBits[map.tileIndex(10, 11)]!)).toBe(2);
    // The stub has the LOWER tile index, so index alone would pick it.
    expect(map.tileIndex(10, 9)).toBeLessThan(map.tileIndex(10, 11));

    const plan = planRoadStop(map, 0, 10, 10, ModuleKind.BusStop);
    expect(plan.reasonKey).toBeNull();
    expect(plan.shape).toBe(RoadStopShape.Bay);
    expect(plan.spurTile).toBe(map.tileIndex(10, 11));

    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: 10,
      moduleKind: ModuleKind.BusStop,
    });
    expect(map.roadBits[map.tileIndex(10, 10)]).toBe(RoadBit.South);
  });

  it('breaks a four-way tie on the lower tile index, whatever order the roads were laid in', () => {
    const orders: ReadonlyArray<readonly string[]> = [
      ['row9', 'row11', 'col9', 'col11'],
      ['col11', 'col9', 'row11', 'row9'],
      ['row11', 'col9', 'row9', 'col11'],
    ];
    const chosen: number[] = [];

    for (const order of orders) {
      const scenario = bench();
      const map = scenario.world.map;
      for (const step of order) {
        if (step === 'row9') rowRoad(scenario, 9);
        else if (step === 'row11') rowRoad(scenario, 11);
        else if (step === 'col9') columnRoad(scenario, 9);
        else columnRoad(scenario, 11);
      }
      // All four neighbours of (10, 10) are through road of the same degree,
      // so only the tile index can decide.
      for (const [x, y] of [
        [10, 9],
        [10, 11],
        [9, 10],
        [11, 10],
      ] as const) {
        expect(degree(map.roadBits[map.tileIndex(x, y)]!), `${x},${y}`).toBe(2);
      }
      chosen.push(planRoadStop(map, 0, 10, 10, ModuleKind.BusStop).spurTile);
    }

    // North is the lowest tile index of the four, and all three build orders
    // agree on it.
    const north = bench().world.map.tileIndex(10, 9);
    expect(chosen).toEqual([north, north, north]);
  });
});

describe('reaching a bay', () => {
  it('lets a bus drive in, stop and drive out again', () => {
    const scenario = bench();
    const world = scenario.world;
    const map = world.map;
    trunk(scenario);

    // A bay at each end of the trunk, and a depot on the road between them.
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 5,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 15,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW,
      moduleKind: ModuleKind.RoadDepot,
    });

    const bayA = map.tileIndex(5, ROW + 1);
    const bayB = map.tileIndex(15, ROW + 1);
    const stopA = world.stations[0]!;
    const stopB = world.stations[1]!;
    expect(stopA.modules[0]!.tileIndex).toBe(bayA);
    expect(stopB.modules[0]!.tileIndex).toBe(bayB);

    apply(scenario, { kind: CommandKind.BuyRoadVehicle, x: 10, y: ROW, specId: BUS });
    const vehicleId = world.vehicles.count - 1;
    apply(scenario, {
      kind: CommandKind.SetVehicleOrders,
      vehicleId,
      orders: [
        { target: 0, targetId: stopA.id, load: 1, unload: 0 },
        { target: 0, targetId: stopB.id, load: 1, unload: 0 },
      ],
    });
    apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId, running: true });

    const seen = new Set<number>();
    for (let tick = 0; tick < 12_000; tick++) {
      world.step(scenario.queue, null);
      seen.add(world.vehicles.tileIndex[vehicleId]!);
    }

    // It stood in BOTH bays, which no vehicle could do without the spur.
    expect(seen.has(bayA)).toBe(true);
    expect(seen.has(bayB)).toBe(true);
    // And the stations logged the calls, which is what a visit is.
    expect(stopA.visitTicks.length).toBeGreaterThan(0);
    expect(stopB.visitTicks.length).toBeGreaterThan(0);
  });

  it('never routes a vehicle THROUGH a bay, because a bay is a dead end', () => {
    const scenario = bench();
    const map = scenario.world.map;
    trunk(scenario);
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });

    const finder = new RoadPathfinder(map.size * map.size);
    const out = new Int32Array(MAX_PATH_TILES);
    const length = finder.find(map, map.tileIndex(5, ROW), map.tileIndex(15, ROW), false, out);

    expect(length).toBeGreaterThan(0);
    const bay = map.tileIndex(10, ROW + 1);
    expect(out.subarray(0, length)).not.toContain(bay);

    // As a target, though, the very same search reaches it.
    expect(finder.find(map, map.tileIndex(5, ROW), bay, false, out)).toBeGreaterThan(0);
  });
});

describe('when the road beside a bay is demolished', () => {
  function bayBench(): Scenario {
    const scenario = bench();
    trunk(scenario);
    apply(scenario, {
      kind: CommandKind.BuildRoadStop,
      x: 10,
      y: ROW + 1,
      moduleKind: ModuleKind.BusStop,
    });
    return scenario;
  }

  it('leaves the station standing and the bay unreachable - never half a station', () => {
    const scenario = bayBench();
    const map = scenario.world.map;
    const bay = map.tileIndex(10, ROW + 1);

    apply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW });

    // The spur's counterpart went with the road, so the bay has no connection.
    expect(map.roadBits[bay]).toBe(0);
    // The station is untouched - there is no command in the game that removes
    // a module, and a demolition beside it must not invent one.
    expect(scenario.world.stations).toHaveLength(1);
    expect(scenario.world.stations[0]!.modules[0]!.tileIndex).toBe(bay);
    expect(map.owner[bay]).toBe(scenario.world.playerCompany.id);

    const finder = new RoadPathfinder(map.size * map.size);
    const out = new Int32Array(MAX_PATH_TILES);
    expect(finder.find(map, map.tileIndex(5, ROW), bay, false, out)).toBe(0);
  });

  it('refuses to let the bay tile itself be demolished while the module stands', () => {
    const scenario = bayBench();
    expect(tryApply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW + 1 })).toBe(
      RejectReason.Occupied,
    );
  });

  it('is repaired by the ordinary road tool, at road’s own price', () => {
    const scenario = bayBench();
    const world = scenario.world;
    const map = world.map;
    const bay = map.tileIndex(10, ROW + 1);
    apply(scenario, { kind: CommandKind.DemolishRoad, x: 10, y: ROW });
    expect(map.roadBits[bay]).toBe(0);

    const cashBefore = world.playerCompany.cashCt;
    // ONE drag, from the surviving street back to the orphaned bay. Two of its
    // three tiles are bare - the pulled-up trunk tile and the bay, whose spur
    // went with it - so the ordinary road command counts two new tiles, charges
    // for two, and the bay is a connected road tile again with no special case
    // anywhere: a bay is repaired by the tool that lays road, because a spur IS
    // road.
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 9, y1: ROW, x2: 10, y2: ROW + 1 });

    expect(cashBefore - world.playerCompany.cashCt).toBe(world.costCt(2 * ROAD_COST_PER_TILE_CT));
    const finder = new RoadPathfinder(map.size * map.size);
    const out = new Int32Array(MAX_PATH_TILES);
    expect(finder.find(map, map.tileIndex(5, ROW), bay, false, out)).toBeGreaterThan(0);
  });
});

describe('what a bay refuses, by name', () => {
  it('names the missing road when there is none beside the tile at all', () => {
    const scenario = bench();
    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: 40,
        y: 40,
        moduleKind: ModuleKind.BusStop,
      }),
    ).toBe(RejectReason.NeedsRoad);
  });

  it('names the road rather than the tile when the only road beside it is a rival’s', () => {
    const scenario = bench(1);
    const map = scenario.world.map;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW }, 1);
    expect(map.owner[map.tileIndex(10, ROW)]).toBe(1);

    expect(
      tryApply(
        scenario,
        { kind: CommandKind.BuildRoadStop, x: 10, y: ROW + 1, moduleKind: ModuleKind.BusStop },
        0,
      ),
    ).toBe(RejectReason.RoadNotYours);

    // The owner of the road may of course build against it.
    expect(
      tryApply(
        scenario,
        { kind: CommandKind.BuildRoadStop, x: 10, y: ROW + 1, moduleKind: ModuleKind.BusStop },
        1,
      ),
    ).toBeNull();
  });

  it('names the water and the occupied ground, through the road command’s own test', () => {
    const scenario = bench();
    const map = scenario.world.map;
    trunk(scenario);

    map.terrain[map.tileIndex(10, ROW + 1)] = Terrain.Water;
    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: 10,
        y: ROW + 1,
        moduleKind: ModuleKind.BusStop,
      }),
    ).toBe(RejectReason.OnWater);

    map.buildingKind[map.tileIndex(11, ROW + 1)] = BuildingKind.Residential;
    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: 11,
        y: ROW + 1,
        moduleKind: ModuleKind.BusStop,
      }),
    ).toBe(RejectReason.Occupied);

    // And the preview refuses exactly the same two, from the same function.
    expect(roadBuildableAt(map, 10, ROW + 1)).toBe(RejectReason.OnWater);
    expect(roadBuildableAt(map, 11, ROW + 1)).toBe(RejectReason.Occupied);
  });

  it('leaves a public town street buildable against - a street is nobody’s', () => {
    const scenario = bench();
    const map = scenario.world.map;
    trunk(scenario);
    // Hand the trunk back to the public, the way a town's own street is.
    map.owner[map.tileIndex(10, ROW)] = TILE_PUBLIC;

    expect(
      tryApply(scenario, {
        kind: CommandKind.BuildRoadStop,
        x: 10,
        y: ROW + 1,
        moduleKind: ModuleKind.BusStop,
      }),
    ).toBeNull();
  });
});

/**
 * D-119's rule, second application: the preview and the bill are the same
 * number because they are the same function. The panel calls `planRoadStop`
 * on the shared map; `buildRoadStop` calls it on the world's map. Nothing here
 * re-derives a price.
 */
describe('the preview is the bill', () => {
  it('quotes, for every shape, exactly the cash the company then loses', () => {
    const cases: ReadonlyArray<readonly [number, number, ModuleKind]> = [
      [7, ROW, ModuleKind.BusStop],
      [9, ROW + 1, ModuleKind.BusStop],
      [12, ROW - 1, ModuleKind.RoadDepot],
      [14, ROW, ModuleKind.RoadDepot],
    ];

    for (const [x, y, kind] of cases) {
      const scenario = bench();
      const world = scenario.world;
      trunk(scenario);

      const plan = planRoadStop(world.map, world.playerCompany.id, x, y, kind);
      expect(plan.reasonKey, `${x},${y}`).toBeNull();
      const quoted = world.costCt(plan.costCt);

      const before = world.playerCompany.cashCt;
      apply(scenario, { kind: CommandKind.BuildRoadStop, x, y, moduleKind: kind });
      expect(before - world.playerCompany.cashCt, `${x},${y}`).toBe(quoted);
      expect(plan.roadTiles, `${x},${y}`).toBe(plan.shape === RoadStopShape.Bay ? 1 : 0);
    }
  });

  it('refuses in the preview wherever the command refuses, with the same key', () => {
    const scenario = bench();
    const world = scenario.world;
    trunk(scenario);
    world.map.terrain[world.map.tileIndex(8, ROW + 1)] = Terrain.Water;

    for (const [x, y] of [
      [40, 40],
      [8, ROW + 1],
      [-1, 0],
    ] as const) {
      const plan = planRoadStop(world.map, 0, x, y, ModuleKind.BusStop);
      expect(plan.reasonKey, `${x},${y}`).not.toBeNull();
      expect(
        tryApply(scenario, {
          kind: CommandKind.BuildRoadStop,
          x,
          y,
          moduleKind: ModuleKind.BusStop,
        }),
        `${x},${y}`,
      ).toBe(plan.reasonKey);
    }
  });
});

/**
 * The audit that stops the hole this bundle opened from ever being reopened:
 * `RoadNotYours` is a refusal the player reads, and a refusal with no German
 * sentence is a screen showing `cmd.reject.foo`. Nothing in the suite walked
 * `RejectReason` against the catalogues before.
 */
describe('every rejection the simulation can produce', () => {
  const catalogues: Record<string, Record<string, string>> = { de, en };

  it('has a sentence in both languages', () => {
    const keys = Object.values(RejectReason);
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      for (const locale of ['de', 'en']) {
        const text = catalogues[locale]![key];
        expect(text, `${locale}: ${key}`).toBeTypeOf('string');
        expect(text!.length, `${locale}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});
