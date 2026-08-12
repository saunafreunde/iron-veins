import { Cargo } from '../../src/sim/cargo/types';
import { CommandKind } from '../../src/sim/commands/types';
import { MapClimate, START_YEAR, WeatherRule } from '../../src/sim/constants';
import { IndustryType, newIndustry } from '../../src/sim/industry/types';
import { RailType } from '../../src/sim/map/track';
import { ModuleKind } from '../../src/sim/station/types';
import { apply, flatScenario, type Scenario } from './scenario';

/**
 * THE reference coal line - balancing scenario 2 of section 19.4, as one
 * object rather than as two copies.
 *
 * "First rail line, coal mine to power plant, 45 tiles, one train of eight
 *  wagons." Scenario 2 (`coalTrain.spec.ts`) measures what it costs to build
 * and asserts the payback band that owns the freight tariffs; SPEC2 M18's
 * winter band (`hardWinter.spec.ts`) measures what a sky costs the same line.
 * Two files that each built their own would be measuring two different
 * railways within a game year of the first edit, and the second file's band
 * would silently stop being about the line the first one pins - the D-187
 * argument ("the number that calibrated and the number that divides must be
 * one number") applied to a fixture instead of to a formula.
 *
 * The only thing a caller may vary is the weather rule and the seed. Every
 * other decision - the geometry, the platform length, the consist, the orders
 * - lives here, because those are what "the reference coal line" MEANS.
 */

export const COAL_LINE_SIZE = 128;
/** The row the line runs along. */
export const COAL_LINE_ROW = 30;
/** Section 19.4's distance, mine platform to plant platform. [tiles] */
export const COAL_LINE_DISTANCE_TILES = 45;
export const COAL_LINE_MINE_X = 20;
export const COAL_LINE_PLANT_X = COAL_LINE_MINE_X + COAL_LINE_DISTANCE_TILES;
/** Both works stand one row off the line: track may not cross an industry. */
export const COAL_LINE_INDUSTRY_ROW = COAL_LINE_ROW + 2;

/** A 1950 steam locomotive and eight open wagons. */
export const COAL_LINE_LOCO = 1000;
export const COAL_LINE_WAGON = 1520;
export const COAL_LINE_WAGON_COUNT = 8;

/**
 * The same railway crewed out of the 1870s catalogue (SPEC2 M23, E-15).
 *
 * An 1878 "Kurier" and eight 1861 high-side wagons - the newest traction and
 * the newest OPEN wagon the pre-1950 table offers in that decade (the 1876
 * entry is a box van and the next tipper is 1894). The GEOMETRY is
 * untouched: same 45 tiles, same platforms, same shed, same two orders, so the
 * 1870s twin measures the era's economy against the 1950 one rather than a
 * second railway (the D-187 argument this file was written for).
 */
export const COAL_LINE_ERA_YEAR = 1878;
export const COAL_LINE_ERA_LOCO = 1104;
export const COAL_LINE_ERA_WAGON = 1607;

/**
 * And the same railway at the very head of the catalogue, 1850.
 *
 * The determinism suite's own arm (SPEC2 M23's "eine 1850 gestartete Partie mit
 * Dampf-Katalog"): the oldest locomotive and the oldest open wagon the game
 * carries. It is deliberately NOT the balance twin - a 32 kN engine hauling
 * six-tonne tubs is a railway to prove the simulation runs, not one to band a
 * tariff on, and the 1870s triple above is where the money is measured.
 */
export const COAL_LINE_1850_YEAR = 1850;
export const COAL_LINE_1850_LOCO = 1100;
export const COAL_LINE_1850_WAGON = 1606;

/**
 * Tiles of platform at each end.
 *
 * A locomotive and eight wagons is 98 m, which is exactly two tiles - so two
 * is what the line needs and a third would be a platform nothing ever stands
 * on.
 */
export const COAL_LINE_PLATFORM_TILES = 2;

/** The seed both scenarios' reference world is built on. */
export const COAL_LINE_SEED = 9;

/**
 * How many game years the line is played for.
 *
 * Scenario 2 needs two years past the top of its payback band to be able to
 * report a miss as a miss rather than as a timeout; the winter band plays the
 * same span so that "the reference coal line" means the same railway over the
 * same life in both files.
 */
export const COAL_LINE_SPAN_YEARS = 9;

/**
 * Mine, power plant, a line between them and one train working it.
 *
 * `weather` is the SPEC2 M18 world rule and defaults to OFF, which is what
 * scenario 2 and every other band of section 19.4 were measured under and must
 * go on being measured under (Fehlerkatalog 34).
 */
export function buildCoalLine(
  weather: WeatherRule = WeatherRule.Off,
  seed: number = COAL_LINE_SEED,
  /**
   * The world's start year (SPEC2 E-15) and the consist that year can crew.
   *
   * Defaulted to 1950 and the 1950 consist, which is what scenario 2 and the
   * winter band were measured under and go on being measured under
   * (Fehlerkatalog 34). The 1870s twin passes the era triple and changes
   * nothing else - that is the whole point of it living here.
   */
  startYear: number = START_YEAR,
  loco: number = COAL_LINE_LOCO,
  wagon: number = COAL_LINE_WAGON,
  /**
   * The world's climate (SPEC2 M23, D-246), for the per-climate matrix.
   * Temperate by default: the temperate set is the whole catalogue, so
   * scenario 2's band and the winter band go on being measured on the world
   * they were calibrated on (Fehlerkatalog 34).
   */
  climate: MapClimate = MapClimate.Temperate,
): Scenario {
  const scenario = flatScenario(
    COAL_LINE_SIZE,
    [],
    [
      newIndustry(0, IndustryType.CoalMine, COAL_LINE_MINE_X, COAL_LINE_INDUSTRY_ROW, 0),
      newIndustry(1, IndustryType.PowerPlant, COAL_LINE_PLANT_X, COAL_LINE_INDUSTRY_ROW, 0),
    ],
    seed,
    0,
    true,
    weather,
    false,
    false,
    startYear,
    climate,
  );

  // The line, a platform at each end and a shed just past the mine.
  apply(scenario, {
    kind: CommandKind.BuildTrack,
    x1: COAL_LINE_MINE_X - 4,
    y1: COAL_LINE_ROW,
    x2: COAL_LINE_PLANT_X + COAL_LINE_PLATFORM_TILES + 1,
    y2: COAL_LINE_ROW,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  // Platforms long enough to hold the whole train. A train hanging off the end
  // works only the share that fits, minus forty percent (section 10), and that
  // alone took this line's throughput down to a third.
  for (let i = 0; i < COAL_LINE_PLATFORM_TILES; i++) {
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: COAL_LINE_MINE_X + i,
      y: COAL_LINE_ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
    apply(scenario, {
      kind: CommandKind.BuildRailStop,
      x: COAL_LINE_PLANT_X + i,
      y: COAL_LINE_ROW,
      moduleKind: ModuleKind.RailPlatform,
    });
  }
  apply(scenario, {
    kind: CommandKind.BuildRailStop,
    x: COAL_LINE_MINE_X - 4,
    y: COAL_LINE_ROW,
    moduleKind: ModuleKind.RailDepot,
  });

  const world = scenario.world;
  const mineStop = world.stations.find((station) =>
    station.modules.some(
      (module) => module.tileIndex === world.map.tileIndex(COAL_LINE_MINE_X, COAL_LINE_ROW),
    ),
  )!;
  const plantStop = world.stations.find((station) =>
    station.modules.some(
      (module) => module.tileIndex === world.map.tileIndex(COAL_LINE_PLANT_X, COAL_LINE_ROW),
    ),
  )!;

  const consist = [loco];
  for (let i = 0; i < COAL_LINE_WAGON_COUNT; i++) consist.push(wagon);
  apply(scenario, {
    kind: CommandKind.BuyTrain,
    x: COAL_LINE_MINE_X - 4,
    y: COAL_LINE_ROW,
    specIds: consist,
  });
  apply(scenario, { kind: CommandKind.RefitVehicle, vehicleId: 0, cargo: Cargo.Coal });
  apply(scenario, {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 0,
    orders: [
      // Take what is there rather than waiting for a full load. Waiting looks
      // like the thrifty choice and is the opposite: coal ages on the platform
      // while the train stands next to it, the station is visited less often,
      // its rating falls, and the gate of section 10.1 then lets less coal out
      // of the mine in the first place.
      { target: 0, targetId: mineStop.id, load: 1, unload: 0 },
      { target: 0, targetId: plantStop.id, load: 2, unload: 0 },
    ],
  });
  apply(scenario, { kind: CommandKind.SetVehicleRunning, vehicleId: 0, running: true });
  return scenario;
}
