import { describe, expect, it } from 'vitest';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { SAVE_VERSION } from '../../src/sim/save/version';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { ModuleKind } from '../../src/sim/station/types';
import { hashWorld } from '../../src/sim/World';
import { flatScenario, type Scenario } from '../balance/scenario';
import { RoadBit } from '../../src/sim/town/types';

/**
 * The D-210 command shape as a determinism fixture.
 *
 * A bay is a road stop on a tile that carried no road, plus one spur of road
 * bits laid by the build. Two properties have to hold and neither is provable
 * by the unit spec:
 *
 *  - the same script played twice reaches the same world digest, so the choice
 *    of neighbouring road is a total order in fact and not only in intent
 *    (architecture law #3);
 *  - a bay survives a save, a load and a continue with no bump anywhere. The
 *    bay carries no field of its own - its whole persistent footprint is one
 *    bit in the road layer, which the save format has carried since M1 - so
 *    this is the test that would go red if the design had needed a
 *    `SAVE_VERSION` it did not take.
 *
 * The world is hand-built rather than generated for the reason every balancing
 * scenario is: a generated map cannot be asked for "a bare tile with four
 * roads around it".
 */

const SIZE = 64;
const ROW = 20;
const BUS = 200;
const GAME_VERSION = 'determinism-test';
const RUN_TICKS = 6_000;

/**
 * A line whose two stops stand BESIDE the road and whose depot stands on it,
 * so one script exercises both shapes of the command.
 *
 * The crossroads at (10, 10) is there to make the neighbour choice a real
 * decision: four roads of the same degree touch that tile, and only the total
 * order can pick one.
 */
const SCRIPT: readonly Command[] = [
  { kind: CommandKind.BuildRoad, x1: 5, y1: ROW, x2: 15, y2: ROW },
  { kind: CommandKind.BuildRoad, x1: 8, y1: 9, x2: 12, y2: 9 },
  { kind: CommandKind.BuildRoad, x1: 8, y1: 11, x2: 12, y2: 11 },
  { kind: CommandKind.BuildRoad, x1: 9, y1: 8, x2: 9, y2: 12 },
  { kind: CommandKind.BuildRoad, x1: 11, y1: 8, x2: 11, y2: 12 },
  { kind: CommandKind.BuildRoad, x1: 11, y1: 12, x2: 11, y2: ROW },
  // The crossroads bay: four candidates, one answer.
  { kind: CommandKind.BuildRoadStop, x: 10, y: 10, moduleKind: ModuleKind.BusStop },
  // A bay off the trunk, and a drive-through depot on it.
  { kind: CommandKind.BuildRoadStop, x: 5, y: ROW + 1, moduleKind: ModuleKind.BusStop },
  { kind: CommandKind.BuildRoadStop, x: 8, y: ROW, moduleKind: ModuleKind.RoadDepot },
  { kind: CommandKind.BuyRoadVehicle, x: 8, y: ROW, specId: BUS },
  {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      { target: 0, targetId: 0, load: 1, unload: 0 },
      { target: 0, targetId: 1, load: 1, unload: 0 },
    ],
  },
  { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true },
];

function build(): Scenario {
  const scenario = flatScenario(SIZE, [], [], 9);
  for (const company of scenario.world.companies) company.cashCt = 50_000_000_00;
  for (const command of SCRIPT) {
    scenario.queue.enqueue(command, scenario.world.tick);
    let rejected: string | null = null;
    scenario.world.drainCommands(scenario.queue, (_envelope, outcome) => {
      if (!outcome.ok) rejected = outcome.reasonKey;
    });
    if (rejected !== null) {
      throw new Error(`fixture command ${command.kind} was rejected: ${String(rejected)}`);
    }
  }
  return scenario;
}

function advance(scenario: Scenario, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) scenario.world.step(scenario.queue, null);
}

describe('determinism - a road stop beside the road', () => {
  it('builds the line the fixture was written for', () => {
    const scenario = build();
    const map = scenario.world.map;

    // Three modules on two stations plus a depot - the join rule of section 10
    // decides how they group, and the fixture only cares that all three exist.
    expect(scenario.world.stations.length).toBeGreaterThanOrEqual(2);
    expect(scenario.world.vehicles.alive[0]).toBe(1);

    // The crossroads bay took the NORTH road: the four candidates all carry
    // two connections, so the lower tile index decides (D-210).
    expect(map.roadBits[map.tileIndex(10, 10)]).toBe(RoadBit.North);
    // The trunk bay took the only road beside it.
    expect(map.roadBits[map.tileIndex(5, ROW + 1)]).toBe(RoadBit.North);
  });

  it('reaches the same world digest twice', () => {
    const first = build();
    advance(first, RUN_TICKS);
    const second = build();
    advance(second, RUN_TICKS);

    expect(second.world.tick).toBe(first.world.tick);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
  });

  it('survives a save, a load and a continue - with no version bump to carry it', () => {
    const reference = build();
    advance(reference, RUN_TICKS);
    const referenceHash = hashWorld(reference.world);

    const live = build();
    advance(live, RUN_TICKS / 2);
    const bytes = encodeSave(live.world, live.queue, GAME_VERSION);
    const loaded = decodeSave(bytes);

    // The bay carries no field of its own, so the container version is the one
    // the build already shipped: this fixture would be the first thing to go
    // red if a bay ever needed state beyond the road layer.
    expect(loaded.saveVersion).toBe(SAVE_VERSION);
    expect(hashWorld(loaded.world)).toBe(hashWorld(live.world));

    const continued: Scenario = { world: loaded.world, queue: loaded.queue };
    advance(continued, RUN_TICKS / 2);
    expect(hashWorld(continued.world)).toBe(referenceHash);

    // And the spur came back off the disk as a spur.
    const map = continued.world.map;
    expect(map.roadBits[map.tileIndex(10, 10)]).toBe(RoadBit.North);
    expect(map.roadBits[map.tileIndex(5, ROW + 1)]).toBe(RoadBit.North);
  });
});
