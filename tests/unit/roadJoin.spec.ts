import { describe, expect, it } from 'vitest';
import { planRoadRuns } from '../../src/sim/ai/build';
import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import { ROAD_UPKEEP_PER_TILE_CT } from '../../src/sim/constants';
import { RoadPathfinder } from '../../src/sim/net/roadPath';
import { MAX_PATH_TILES } from '../../src/sim/vehicles/VehicleStore';
import { RoadBit } from '../../src/sim/town/types';
import { apply, flatScenario, tryApply, type Scenario } from '../balance/scenario';

/**
 * A road run that lays no new tile still writes the joins it names.
 *
 * `buildRoad` counted TILES and refused a run of nothing but existing road
 * before it reached its own connect loop. Two roads that meet without being
 * joined are two roads - `roadBits[tile] !== 0` says "has road", a vehicle asks
 * "is joined by bits" - so the drag that names the junction was refused as
 * NothingToDo and the junction was never written. It is a player's defect
 * (drag from your road onto the town's street and nothing happens) and it was
 * the AI's whole road network: its own preceding BuildRoad made its own next
 * BuildRoad a no-op, and that no-op was the junction.
 */

const SIZE = 64;
const ROW = 20;

function bench(aiCompanies = 0): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9, aiCompanies);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  return scenario;
}

/** Two stretches of road that touch at (10,ROW)-(11,ROW) and are not joined. */
function twoRoads(aiCompanies = 0): Scenario {
  const scenario = bench(aiCompanies);
  apply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 10, y2: ROW });
  apply(scenario, { kind: CommandKind.BuildRoad, x1: 11, y1: ROW, x2: 16, y2: ROW });
  return scenario;
}

function drivable(scenario: Scenario, from: number, to: number): boolean {
  const map = scenario.world.map;
  const finder = new RoadPathfinder(map.size * map.size);
  const out = new Int32Array(MAX_PATH_TILES);
  return finder.find(map, from, to, false, out) > 0;
}

describe('a road run with no new tile', () => {
  it('reproduces the gap: two touching roads are not one road', () => {
    const scenario = twoRoads();
    const map = scenario.world.map;
    const left = map.tileIndex(10, ROW);
    const right = map.tileIndex(11, ROW);

    expect(map.roadBits[left]! & RoadBit.East).toBe(0);
    expect(map.roadBits[right]! & RoadBit.West).toBe(0);
    expect(drivable(scenario, map.tileIndex(5, ROW), map.tileIndex(16, ROW))).toBe(false);
  });

  it('joins them, and charges for the tiles it laid - which is none', () => {
    const scenario = twoRoads();
    const world = scenario.world;
    const map = world.map;
    const cashBefore = world.playerCompany.cashCt;
    const upkeepBefore = world.playerCompany.infrastructureUpkeepPerYearCt;

    apply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: ROW, x2: 11, y2: ROW });

    expect(map.roadBits[map.tileIndex(10, ROW)]! & RoadBit.East).toBe(RoadBit.East);
    expect(map.roadBits[map.tileIndex(11, ROW)]! & RoadBit.West).toBe(RoadBit.West);
    expect(drivable(scenario, map.tileIndex(5, ROW), map.tileIndex(16, ROW))).toBe(true);
    // A join has never been priced: a run that also lays tiles writes its joins
    // free, and this one is that run with the tiles taken away.
    expect(world.playerCompany.cashCt).toBe(cashBefore);
    expect(world.playerCompany.infrastructureUpkeepPerYearCt).toBe(upkeepBefore);
    expect(ROAD_UPKEEP_PER_TILE_CT).toBeGreaterThan(0);
  });

  it('still refuses a drag over road that is already one road', () => {
    const scenario = twoRoads();
    expect(
      tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 9, y2: ROW }),
    ).toBe(RejectReason.NothingToDo);
    // And a single tile that already carries road is still nothing to do.
    expect(
      tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 7, y1: ROW, x2: 7, y2: ROW }),
    ).toBe(RejectReason.NothingToDo);
  });

  it('asks the ground and the owner first, as it always did', () => {
    const scenario = twoRoads(1);
    // Foreign road: company 1 may not write a bit onto company 0's tiles.
    expect(
      tryApply(scenario, { kind: CommandKind.BuildRoad, x1: 10, y1: ROW, x2: 11, y2: ROW }, 1),
    ).toBe(RejectReason.NotYours);
  });
});

describe('the AI corridor that measured the defect', () => {
  /**
   * Seed 4712, company 1, verbatim: `BuildRoad 24,99->24,76 => ok`, then
   * `BuildRoad 24,76->25,76 => REJECT nothingToDo`, then a stop at (25,76).
   * The corridor came down BESIDE the town street and turned onto it, so the
   * turn was a single hop between two tiles that both already carried road -
   * the AI's own new road meeting the town's old one. The stop's road island
   * was five tiles and all six buses of the line lived in NoRoute.
   */
  function corridor(): Scenario {
    const scenario = bench();
    // The town's street, one row, starting one column EAST of the corridor.
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 25, y1: ROW, x2: 40, y2: ROW });
    // The AI's trunk, down the column beside it.
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 24, y1: ROW + 12, x2: 24, y2: ROW });
    return scenario;
  }

  it('joins the corridor to the street, and the stop stops being an island', () => {
    const scenario = corridor();
    const map = scenario.world.map;
    const stop = map.tileIndex(25, ROW);
    const far = map.tileIndex(24, ROW + 12);

    expect(drivable(scenario, stop, far)).toBe(false);
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 24, y1: ROW, x2: 25, y2: ROW });
    expect(drivable(scenario, stop, far)).toBe(true);
    expect(drivable(scenario, map.tileIndex(40, ROW), far)).toBe(true);
  });

  it('is what the planner asks for: its runs, applied, are one road', () => {
    const scenario = bench();
    const world = scenario.world;
    const map = world.map;
    apply(scenario, { kind: CommandKind.BuildRoad, x1: 25, y1: ROW, x2: 40, y2: ROW });

    const from = { x: 24, y: ROW + 12 };
    const to = { x: 25, y: ROW };
    const runs = planRoadRuns(world, world.playerCompany.id, from, to);
    expect(runs).not.toBeNull();
    for (const run of runs!) {
      // Enqueued exactly as `enqueueInfrastructure` does - including runs that
      // lie entirely on road that is already there.
      tryApply(scenario, {
        kind: CommandKind.BuildRoad,
        x1: run.x1,
        y1: run.y1,
        x2: run.x2,
        y2: run.y2,
      });
    }
    expect(drivable(scenario, map.tileIndex(from.x, from.y), map.tileIndex(40, ROW))).toBe(true);
  });
});
