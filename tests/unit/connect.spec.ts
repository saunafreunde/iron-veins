import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import type { StationMarker } from '../../src/shared/protocol';
import { CommandKind } from '../../src/sim/commands/types';
import { AI_PLATFORM_TILES, RAIL_PLATFORM_COST_CT } from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { planConnection } from '../../src/ui/connect';
import { apply, flatScenario, makeTown, type Scenario } from '../balance/scenario';

/**
 * The station-to-station railway of the connect tool.
 *
 * What has to hold is the promise the panel makes: the route it prices is the
 * route the command will build, the platforms it counts are platforms that can
 * actually be built, and nothing is charged until the player agrees. The first
 * of those is the one that would rot silently - the panel plans with
 * `planTrack` and the command plans again inside the simulation, and if the two
 * are ever called with different arguments the price on screen stops being the
 * price on the bill.
 */

const SIZE = 64;
const ROW = 20;

function scenario(): Scenario {
  const s = flatScenario(SIZE, [makeTown(0, 30, 40, 1_200, 'Gleisheim')], [], 9, 0);
  s.world.playerCompany.cashCt = 500_000_000_00;
  return s;
}

/** A station marker as the interface would have it, from a real station. */
function markerFor(s: Scenario, id: number): StationMarker {
  const station = s.world.stations[id]!;
  return {
    id: station.id,
    name: station.name,
    x: station.x,
    y: station.y,
    rating: 50,
    waiting: 0,
    modules: station.modules.map((module) => ({ kind: module.kind, x: module.x, y: module.y })),
  };
}

/** Two bus stops far apart: stations with no rail platform of their own. */
function twoRoadStations(s: Scenario): [StationMarker, StationMarker] {
  apply(s, { kind: CommandKind.BuildRoad, x1: 6, y1: ROW, x2: 50, y2: ROW });
  apply(s, { kind: CommandKind.BuildRoadStop, x: 6, y: ROW, moduleKind: ModuleKind.BusStop });
  apply(s, { kind: CommandKind.BuildRoadStop, x: 50, y: ROW, moduleKind: ModuleKind.BusStop });
  return [markerFor(s, 0), markerFor(s, 1)];
}

describe('planning a railway between two stations', () => {
  it('plans a route, counts the platforms and prices the lot', () => {
    const s = scenario();
    const [from, to] = twoRoadStations(s);

    const result = planConnection(s.world.map, from, to, s.world.date.year);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.plan;
    expect(plan.tiles.length).toBeGreaterThan(30);
    expect(plan.lengthM).toBeGreaterThan(0);
    // Neither station has a rail platform, so both ends need one.
    expect(plan.platforms.length).toBe(AI_PLATFORM_TILES * 2);
    expect(plan.trackCostCt).toBeGreaterThan(0);
    expect(plan.totalCostCt).toBe(plan.trackCostCt + plan.platformCostCt);
    expect(plan.platformCostCt).toBeGreaterThanOrEqual(
      RAIL_PLATFORM_COST_CT * plan.platforms.length,
    );
  });

  it('keeps the platforms one tile in from each end', () => {
    const s = scenario();
    const [from, to] = twoRoadStations(s);
    const result = planConnection(s.world.map, from, to, s.world.date.year);
    if (!result.ok) throw new Error(result.reasonKey);

    const map = s.world.map;
    const index = (p: { x: number; y: number }): number => map.tileIndex(p.x, p.y);
    const tiles = result.plan.tiles;

    // Never on the very first or very last tile of the route: a platform there
    // leaves a train longer than one tile nowhere to finish arriving, which is
    // the failure balancing scenario 5 spent a game year demonstrating.
    for (const platform of result.plan.platforms) {
      expect(index(platform)).not.toBe(tiles[0]);
      expect(index(platform)).not.toBe(tiles[tiles.length - 1]);
      expect(tiles).toContain(index(platform));
    }
  });

  it('refuses the same station, and says which refusal it is', () => {
    const s = scenario();
    const [from] = twoRoadStations(s);

    const result = planConnection(s.world.map, from, from, s.world.date.year);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonKey).toBe('ui.connect.sameStation');
    expect(result.reasonKey in (de as Record<string, string>)).toBe(true);
  });

  it('builds no platform at an end that already has one', () => {
    const s = scenario();
    // A short line with a real platform at one end, and a bus stop at the other.
    apply(s, {
      kind: CommandKind.BuildTrack,
      x1: 6,
      y1: ROW + 6,
      x2: 20,
      y2: ROW + 6,
      railType: RailType.Plain,
      assistant: false,
      signalSpacing: 0,
    });
    apply(s, {
      kind: CommandKind.BuildRailStop,
      x: 8,
      y: ROW + 6,
      moduleKind: ModuleKind.RailPlatform,
    });
    apply(s, { kind: CommandKind.BuildRoad, x1: 40, y1: ROW + 6, x2: 50, y2: ROW + 6 });
    apply(s, {
      kind: CommandKind.BuildRoadStop,
      x: 50,
      y: ROW + 6,
      moduleKind: ModuleKind.BusStop,
    });

    const railStation = markerFor(s, 0);
    const roadStation = markerFor(s, 1);
    const result = planConnection(s.world.map, railStation, roadStation, s.world.date.year);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only the road end needs platforms.
    expect(result.plan.platforms.length).toBe(AI_PLATFORM_TILES);
  });

  it('prices in this year’s money, not 1950’s', () => {
    const early = scenario();
    const [a, b] = twoRoadStations(early);

    const cheap = planConnection(early.world.map, a, b, 1950);
    const dear = planConnection(early.world.map, a, b, 2000);
    expect(cheap.ok && dear.ok).toBe(true);
    if (!cheap.ok || !dear.ok) return;

    // Inflation is on both sides of the books (D-092), so a preview quoted at
    // 1950 prices in the year 2000 would disagree with the bill.
    expect(dear.plan.totalCostCt).toBeGreaterThan(cheap.plan.totalCostCt);
  });

  it('names every refusal with a key that exists in the catalogue', () => {
    const catalogue = de as Record<string, string>;
    for (const key of [
      'ui.connect.sameStation',
      'ui.connect.noAnchor',
      'ui.connect.tooShort',
      'ui.connect.notAStation',
      'ui.connect.confirm',
      'ui.connect.tooDear',
      'ui.tool.connect',
      'ui.tool.hintConnect',
    ]) {
      expect(key in catalogue, key).toBe(true);
    }
  });
});
