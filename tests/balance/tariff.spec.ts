import { describe, expect, it } from 'vitest';
import { cargoSpec } from '../../src/sim/cargo/types';
import { TICKS_PER_YEAR, TICK_HZ, TILE_SIZE_M } from '../../src/sim/constants';
import {
  capacityFor,
  defaultCargo,
  RailRole,
  VEHICLE_SPECS,
  VehicleKind,
  type VehicleSpec,
} from '../../src/sim/vehicles/catalog';

/**
 * What a vehicle can earn in a year, in closed form.
 *
 * The payment formula is `amount x rate x distance/100 tiles`, and distance per
 * year is `speed x seconds per year / metres per tile`. The distance cancels:
 * a vehicle's ceiling revenue does NOT depend on how long its line is, only on
 * what it carries and how fast it goes. That is the whole reason this can be a
 * unit test instead of a simulation.
 *
 *   ct/year = capacity x baseRate x speed[m/s] x (TICKS_PER_YEAR / TICK_HZ)
 *             / TILE_SIZE_M / 100
 *
 * The figure is a CEILING: it assumes no loading time, a full load every trip
 * and a full load in both directions. Real lines reach a fraction of it. What
 * makes it worth pinning is that a vehicle whose ceiling is below its upkeep
 * cannot be run at a profit on any line of any length, and nothing else in the
 * suite would ever notice.
 */

/** Seconds of real time in one game year, divided by the payment's 100 tiles. */
const REVENUE_FACTOR = TICKS_PER_YEAR / TICK_HZ / TILE_SIZE_M / 100;

function ceilingRevenueCtPerYear(spec: VehicleSpec): number {
  const cargo = defaultCargo(spec);
  const capacity = capacityFor(spec, cargo);
  if (capacity <= 0) return 0;
  return capacity * cargoSpec(cargo).baseRateCt * spec.maxSpeedMs * REVENUE_FACTOR;
}

describe('the revenue ceiling of every vehicle', () => {
  it('prints the table and keeps every carrying vehicle above its upkeep', () => {
    const rows: string[] = [];
    const failures: string[] = [];

    for (const spec of VEHICLE_SPECS) {
      // Locomotives and wagons only earn as part of a train, so they are judged
      // as the composition they belong to rather than on their own.
      if (spec.railRole === RailRole.Traction && capacityFor(spec, defaultCargo(spec)) === 0) {
        continue;
      }
      const revenue = ceilingRevenueCtPerYear(spec);
      if (revenue <= 0) continue;

      // A wagon has no upkeep worth speaking of on its own; it is charged as
      // part of a train, so it is compared against its own share.
      const ratio = revenue / spec.upkeepCtPerYear;
      rows.push(
        `${spec.nameKey.padEnd(24)} ceiling ${Math.round(revenue / 100)
          .toString()
          .padStart(9)} EUR/yr  upkeep ${Math.round(spec.upkeepCtPerYear / 100)
          .toString()
          .padStart(7)} EUR/yr  ratio ${ratio.toFixed(2)}`,
      );
      const floor = spec.kind === VehicleKind.Road ? MIN_ROAD_RATIO : MIN_CEILING_RATIO;
      if (ratio < floor) failures.push(`${spec.nameKey}: ${ratio.toFixed(2)}`);
    }

    console.log(['revenue ceiling against upkeep', ...rows].join('\n'));
    expect(failures, 'vehicles that cannot pay their own upkeep at any line length').toEqual([]);
  });

  it('leaves road freight worth less per euro of upkeep than rail freight', () => {
    // This is the shape the design wants: a lorry can be run at a profit on a
    // short, well served haul, and a train is where bulk freight actually pays.
    //
    // It is a COMPARISON and no longer a band. The absolute level of the
    // freight tariffs belongs to balancing scenario 2, which section 19.4 names
    // as the authority over exactly those numbers; an invented band here would
    // fight it, and did (DECISIONS.md D-087).
    const lorry = VEHICLE_SPECS.find((s) => s.nameKey === 'veh.lorry_bulk1')!;
    const wagon = VEHICLE_SPECS.find((s) => s.nameKey === 'veh.wagon_open1')!;

    const lorryRatio = ceilingRevenueCtPerYear(lorry) / lorry.upkeepCtPerYear;
    const wagonRatio = ceilingRevenueCtPerYear(wagon) / wagon.upkeepCtPerYear;

    expect(lorryRatio).toBeGreaterThan(MIN_ROAD_RATIO);
    expect(lorryRatio).toBeLessThan(wagonRatio);
  });

  it('makes a plausible freight train pay for itself', () => {
    // One big steam engine and twenty open wagons - the shape of a coal train.
    const loco = VEHICLE_SPECS.find((s) => s.nameKey === 'veh.loco_steam5')!;
    const wagon = VEHICLE_SPECS.find((s) => s.nameKey === 'veh.wagon_open1')!;
    const wagons = 20;

    const speed = Math.min(loco.maxSpeedMs, wagon.maxSpeedMs);
    const cargo = defaultCargo(wagon);
    const capacity = wagons * capacityFor(wagon, cargo);
    const revenue = capacity * cargoSpec(cargo).baseRateCt * speed * REVENUE_FACTOR;
    const upkeep = loco.upkeepCtPerYear + wagons * wagon.upkeepCtPerYear;

    console.log(
      `coal train: ceiling ${Math.round(revenue / 100)} EUR/yr against ` +
        `${Math.round(upkeep / 100)} EUR/yr of upkeep, ratio ${(revenue / upkeep).toFixed(2)}`,
    );
    expect(revenue / upkeep).toBeGreaterThan(MIN_CEILING_RATIO);
  });
});

/**
 * How far above its upkeep a vehicle's ceiling has to sit.
 *
 * The ceiling assumes no loading time and a full load in both directions, and a
 * real line reaches perhaps a third of it. Four is the smallest multiple at
 * which a well run line is clearly profitable and a badly run one is clearly
 * not - which is the shape the game wants.
 */
const MIN_CEILING_RATIO = 4;

/**
 * The same floor for road freight, which is deliberately the harder trade.
 *
 * A lorry is a feeder: short hauls, small loads, and a margin that a badly run
 * line loses. Rail is where tonnage pays. Setting road freight to the same
 * multiple as rail would make the whole rail half of the game optional.
 */
const MIN_ROAD_RATIO = 1.4;
