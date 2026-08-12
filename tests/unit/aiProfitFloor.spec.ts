import { describe, expect, it } from 'vitest';
import {
  AI_MAX_VEHICLES_PER_LINE,
  AI_MIN_PROFIT_MARGIN,
  AI_RAIL_PROJECTED_TRAINS,
  AI_TICKS_PER_TILE,
  Difficulty,
  DIFFICULTY_AI_TRAITS,
  MapClimate,
} from '../../src/sim/constants';
import { clearStopTile, pickRoadVehicle, pickTrain, stopTileNear } from '../../src/sim/ai/build';
import {
  fleetFor,
  loadUnitsOf,
  opportunities,
  projectLine,
  type Opportunity,
} from '../../src/sim/ai/evaluate';
import { Personality } from '../../src/sim/ai/types';
import { radiusForModuleCount } from '../../src/sim/station/types';
import { BuildingKind } from '../../src/sim/town/types';
import { World } from '../../src/sim/World';

/**
 * A competitor may not build a business that cannot pay.
 *
 * `rate` scores revenue per unit of capital - a RANKING with no floor - and
 * `startProject` asked only whether the company could AFFORD the build. So the
 * best of a list of loss-makers was built, and built again: measured over the
 * eight seeds of the acceptance sweep, twelve competitors on four seeds nobody
 * had played owned not one vehicle at year twenty-five, eight of them were
 * wound up, and their combined value was -956,108 EUR. One of them had spent
 * about 460,000 of its 500,000 start capital on twenty-nine stations and 643
 * road tiles.
 *
 * `projectLine` is the absolute test beside the ratio and `AI_MIN_PROFIT_MARGIN`
 * carries the measurement it comes from.
 */

const MAP_SIZE = 256;

function world(seed: number): World {
  return World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
}

/** The fleet the builder would put on this pair, and its projection. */
function project(w: World, opportunity: Opportunity): number {
  const specIds = opportunity.rail
    ? pickTrain(w, opportunity.cargo)
    : [pickRoadVehicle(w, opportunity.cargo)];
  const units = loadUnitsOf(specIds, opportunity.cargo);
  const fleet = fleetFor(
    2 * opportunity.distance * AI_TICKS_PER_TILE,
    units,
    opportunity.monthlyOutput,
    // The shape the FILTER prices, which on rail is the single-track fallback
    // the builder really lays and not the oval it asks for first (D-222).
    opportunity.rail ? AI_RAIL_PROJECTED_TRAINS : AI_MAX_VEHICLES_PER_LINE,
    // The Normal row of DIFFICULTY_AI_TRAITS, which is the identity headroom
    // and the world every seed below is built at (SPEC2 M24).
    DIFFICULTY_AI_TRAITS[Difficulty.Normal]!.fleetHeadroom,
  );
  return projectLine(w, opportunity, specIds, fleet).margin;
}

describe('the AI will not build a line that cannot pay', () => {
  it('offers no candidate whose projection misses the floor, on any swept seed', () => {
    for (const seed of [4711, 4713, 4712, 4714, 2718, 31415, 60613, 12345]) {
      const w = world(seed);
      for (const personality of [
        Personality.Rail,
        Personality.Road,
        Personality.Expansive,
        Personality.Conservative,
        Personality.TownNetwork,
      ]) {
        for (const opportunity of opportunities(w, personality, 1)) {
          expect(
            project(w, opportunity),
            `seed ${seed} personality ${personality}: a candidate under the floor`,
          ).toBeGreaterThanOrEqual(AI_MIN_PROFIT_MARGIN);
        }
      }
    }
  });

  it('charges the stops, the shed and the way, not only the vehicles', () => {
    const w = world(4712);
    const bus = pickRoadVehicle(w, 18);
    const pair: Opportunity = {
      fromX: 10,
      fromY: 10,
      toX: 40,
      toY: 10,
      cargo: 18,
      distance: 30,
      revenueCtPerMonth: 0,
      buildCostCt: 0,
      score: 0,
      rail: false,
      monthlyOutput: 72,
      offeredPerMonth: 144,
      // No century in these fixtures, so no board and no offer (SPEC2 M21).
      subsidyFactor: 1,
      scoreFlags: 0,
    };
    const one = projectLine(w, pair, [bus], 1);
    const two = projectLine(w, pair, [bus], 2);

    // A second bus adds its own upkeep, and the difference is EXACTLY one
    // vehicle - the stops, the shed and the road are already in both figures.
    // A projection that charged only the fleet would double from one to two.
    expect(two.upkeepCtPerMonth).toBeGreaterThan(one.upkeepCtPerMonth);
    expect(two.upkeepCtPerMonth).toBeLessThan(2 * one.upkeepCtPerMonth);

    // And the fixed half is NOT folded into what the builder finances (D-121):
    // `buildCostCt` is the way and nothing else, and this projection never
    // touches it.
    expect(pair.buildCostCt).toBe(0);
  });

  it('reads a town pair of population 400 as the loss it is', () => {
    const w = world(4712);
    const small = w.towns.filter((town) => town.population <= 500);
    expect(small.length).toBeGreaterThan(20);

    const bus = pickRoadVehicle(w, 18);
    // The nearest pair of small towns the AI would ever consider: the shortest
    // legal haul is the most favourable one a bus line can be given.
    const a = small[0]!;
    let b = a;
    let distance = Number.POSITIVE_INFINITY;
    for (const town of small) {
      const d = Math.round(Math.sqrt((town.x - a.x) ** 2 + (town.y - a.y) ** 2));
      if (d >= 15 && d < distance) {
        distance = d;
        b = town;
      }
    }
    expect(Number.isFinite(distance)).toBe(true);
    const pair: Opportunity = {
      fromX: a.x,
      fromY: a.y,
      toX: b.x,
      toY: b.y,
      cargo: 18,
      distance,
      revenueCtPerMonth: 0,
      buildCostCt: 0,
      score: 0,
      rail: false,
      monthlyOutput: a.population * 0.18,
      offeredPerMonth: (a.population + b.population) * 0.18,
      // No century in these fixtures, so no board and no offer (SPEC2 M21).
      subsidyFactor: 1,
      scoreFlags: 0,
    };
    const margin = projectLine(w, pair, [bus], 2).margin;
    console.log(
      `two towns of ${a.population} and ${b.population} at ${distance} tiles: projected margin ${margin.toFixed(3)}`,
    );
    expect(margin).toBeLessThan(AI_MIN_PROFIT_MARGIN);
  });
});

describe('where the AI plants a stop is not what makes a small town poor', () => {
  /**
   * The other half of the diagnosis, MEASURED and refuted rather than fixed.
   *
   * "The stop covers four buildings" is true and is not a placement defect:
   * four is the whole town. This pins the two numbers so the day is not spent
   * again - see the note over `stopTileNear`.
   */
  it('gives a town of 400 four buildings, and the planted stop reaches them', () => {
    const radius = radiusForModuleCount(2);
    for (const seed of [4711, 4713, 4712, 4714, 2718, 31415, 60613, 12345]) {
      const w = world(seed);
      const stock = new Map<number, number>();
      for (let tile = 0; tile < w.map.tileCount; tile++) {
        if (w.map.buildingKind[tile] === BuildingKind.None) continue;
        const townId = w.map.townId[tile]!;
        if (townId >= 0) stock.set(townId, (stock.get(townId) ?? 0) + 1);
      }

      let towns = 0;
      let planted = 0;
      let best = 0;
      for (const town of w.towns) {
        if (town.population > 500) continue;
        towns++;
        // Every small town on every swept seed has exactly four buildings.
        expect(stock.get(town.id), `seed ${seed} town ${town.id}`).toBe(4);

        const stop = stopTileNear(w, town.x, town.y);
        planted += stop === null ? 0 : covered(w, town.id, stop.x, stop.y, radius);
        let bestHere = 0;
        for (let dy = -10; dy <= 10; dy++) {
          for (let dx = -10; dx <= 10; dx++) {
            if (!clearStopTile(w, town.x + dx, town.y + dy)) continue;
            const c = covered(w, town.id, town.x + dx, town.y + dy, radius);
            if (c > bestHere) bestHere = c;
          }
        }
        best += bestHere;
      }

      console.log(
        `seed ${seed}: ${towns} towns of population <= 500, 4 buildings each; ` +
          `stopTileNear covers ${(planted / towns).toFixed(2)}, the best legal placement ` +
          `${(best / towns).toFixed(2)}`,
      );
      // Measured 3.79-4.00 against a best of 3.79-4.00: the whole head-room a
      // cleverer scan could win on a small town is a tenth of a building.
      expect(planted / towns).toBeGreaterThan(3.5);
      expect((best - planted) / towns).toBeLessThan(0.2);
    }
  });
});

function covered(w: World, townId: number, x: number, y: number, radius: number): number {
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= w.map.size || py >= w.map.size) continue;
      const tile = w.map.tileIndex(px, py);
      if (w.map.buildingKind[tile] === BuildingKind.None) continue;
      if (w.map.townId[tile] !== townId) continue;
      count++;
    }
  }
  return count;
}
