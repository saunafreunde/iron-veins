import { describe, expect, it } from 'vitest';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { hashWorld } from '../../src/sim/World';
import {
  ALL_RUNNING_TICK,
  complexNetwork,
  DEPOTS,
  SIZE,
  TRAINS,
} from '../helpers/regressionNetwork';

/**
 * The regression network of section 19.5.
 *
 * Twenty trains, five thousand ticks, zero collisions and zero deadlocks. This
 * is the acceptance criterion for M4 and the only test in the suite that puts
 * the signalling under real load.
 *
 * The fixture itself lives in `tests/helpers/regressionNetwork.ts` since
 * SPEC2 M15, where the deadlock-cycle detector uses the same healthy railway
 * as its no-false-positives case; every decision that shaped it (D-072,
 * D-074, D-082) is written down there.
 */

describe('the regression network', () => {
  it('runs twenty trains for five thousand ticks without a collision or a deadlock', () => {
    const bench = complexNetwork();
    const world = bench.world;
    const vehicles = world.vehicles;

    expect(vehicles.livingCount).toBe(TRAINS);
    // The index is built lazily on first use, so ask for it before counting.
    world.blocks.refresh(world.map);
    expect(world.blocks.blockCount).toBeGreaterThan(10);

    let longestWait = 0;
    let worstStall = 0;
    const lastMoveTick = new Int32Array(TRAINS);
    const lastTile = new Int32Array(TRAINS).fill(-1);

    for (let tick = 0; tick < ALL_RUNNING_TICK + 5_000; tick++) {
      world.step(bench.queue, null);

      for (let id = 0; id < TRAINS; id++) {
        const running =
          vehicles.state[id] === VehicleState.Driving ||
          vehicles.state[id] === VehicleState.Braking ||
          vehicles.state[id] === VehicleState.WaitingForPath;
        if (vehicles.tileIndex[id] !== lastTile[id] || !running) {
          lastTile[id] = vehicles.tileIndex[id]!;
          lastMoveTick[id] = world.tick;
        } else if (world.tick - lastMoveTick[id]! > worstStall) {
          worstStall = world.tick - lastMoveTick[id]!;
        }
        // Every tile a train holds is held by it alone. This is the collision
        // check: two trains inside one claim is exactly what cannot happen.
        const to = vehicles.reservedToIndex[id]!;
        if (to >= 0) {
          const path = vehicles.paths[id]!;
          for (let k = vehicles.reservedFromIndex[id]!; k <= to; k++) {
            expect(world.reservations.ownerOf(path[k]!)).toBe(id);
          }
        }
        // Nothing may sit at a signal long enough to count as stuck - measured
        // only once every train is out of the depot.
        const since = vehicles.waitingSinceTick[id]!;
        if (since >= 0 && world.tick > ALL_RUNNING_TICK) {
          const waited = world.tick - since;
          if (waited > longestWait) longestWait = waited;
        }
      }
    }

    const perTrain: string[] = [];
    for (let id = 0; id < TRAINS; id++) {
      const since = vehicles.waitingSinceTick[id]!;
      perTrain.push(
        `${id}:${vehicles.state[id]}@${vehicles.tileIndex[id]! % SIZE},` +
          `${(vehicles.tileIndex[id]! / SIZE) | 0}` +
          (since >= 0 ? ` wait ${world.tick - since}` : ''),
      );
    }
    // The deadlock half of section 19.5, stated as something that can be
    // measured: no train is ever permanently stuck. The worst continuous
    // standstill of a train that is trying to move is 3_300 ticks, and it
    // resolves - it is a queue on a single-track ring carrying twenty trains,
    // which is congestion and not a deadlock (DECISIONS.md D-084).
    expect(worstStall).toBeLessThan(4_000);
    expect(longestWait).toBeLessThan(4_000);

    // And they are all still working, not parked in "no route".
    let running = 0;
    for (let id = 0; id < TRAINS; id++) {
      expect(vehicles.state[id]).not.toBe(VehicleState.NoRoute);
      if (vehicles.state[id] !== VehicleState.Stopped) running++;
    }
    expect(running).toBe(TRAINS);

    // The ring really is being worked: most of the fleet is out on it. A full
    // lap of this ring is about six thousand ticks, so arrivals are not what
    // this length of run measures - movement is.
    let away = 0;
    for (let id = 0; id < TRAINS; id++) {
      const inShed = DEPOTS.some(([x, y]) => vehicles.tileIndex[id] === world.map.tileIndex(x, y));
      if (!inShed) away++;
    }
    // Every one of them left its shed. That was not true of the first version
    // of this fixture, where the back of a twenty deep queue never got out.
    expect(away).toBe(TRAINS);
  });

  it('produces the same world three times over', () => {
    const digests: string[][] = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const bench = complexNetwork();
      const marks: string[] = [];
      for (let tick = 0; tick < 2_000; tick++) {
        bench.world.step(bench.queue, null);
        if (tick % 500 === 0) marks.push(hashWorld(bench.world));
      }
      digests.push(marks);
    }
    expect(digests[1]).toEqual(digests[0]);
    expect(digests[2]).toEqual(digests[0]);
  });
});
