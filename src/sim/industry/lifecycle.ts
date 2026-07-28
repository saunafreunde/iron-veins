import {
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_NEW_PER_YEAR,
  INDUSTRY_OPENING_ATTEMPTS,
  INDUSTRY_WARNING_MONTHS,
} from '../constants';
import { buildWeightTable, drawType, findSpot, occupy, release } from '../mapgen/industries';
import { inCatchment } from '../station/types';
import type { World } from '../World';
import { assignStationIndustries } from './catchment';
import { industrySpec, newIndustry, type Industry } from './types';

/**
 * Industries opening and closing while the game runs (section 7.3).
 *
 * A world whose industry map is fixed at generation is a world that stops
 * having anything to say after the first twenty years. Two rules change that:
 * a works nobody has collected from for two game years closes, and one new one
 * opens every game year, by preference where nothing is served yet.
 *
 * Both are seeded from the gameplay RNG and both go through the very placement
 * rules the map generator uses, so a runtime industry is indistinguishable from
 * a generated one - it stands on ground its type is allowed to stand on, eight
 * tiles clear of its neighbours, and near the town or the forest its recipe
 * needs.
 */

/** The weight table is a pure function of the catalogue; build it once. */
const WEIGHTS = buildWeightTable();

/**
 * Close a works down for good.
 *
 * The slot in `world.industries` stays where it is: ids index that array, the
 * map layer refers to them, and cargo already in flight may still name it. What
 * goes is the footprint - back to open country - and with it every station's
 * claim to serve it, which is why the stations that reached it are recomputed.
 */
export function closeIndustry(world: World, industry: Industry): void {
  if (!industry.open) return;
  industry.open = false;
  industry.inputStock0 = 0;
  industry.inputStock1 = 0;
  industry.outputStock0 = 0;
  industry.outputStock1 = 0;
  release(world.map, industry);

  for (const station of world.stations) {
    if (!station.servedIndustries.includes(industry.id)) continue;
    assignStationIndustries(world, station);
  }
}

/**
 * Warning level for a works nobody collects from: 0, 1 after a year, 2 after
 * twenty months. Read by the UI; the news log of section 15 arrives with M8.
 */
export function closureWarningLevel(industry: Industry): number {
  if (!industry.open) return 0;
  let level = 0;
  for (const months of INDUSTRY_WARNING_MONTHS) {
    if (industry.monthsWithoutCollection >= months) level++;
  }
  return level;
}

/**
 * Open one new industry, once a game year (section 7.3).
 *
 * "By preference in under-served regions" is read as: of the spots the
 * placement rules allow, take one that no station reaches. A new works dropped
 * inside an existing catchment would be free tonnage for a line that is already
 * built; one out in the open is an invitation to build something.
 *
 * A generous number of attempts and then nothing, rather than a fallback that
 * ignores the rules: a mature map genuinely has no room left, and inventing a
 * coal mine on a beach to satisfy a counter is worse than a quiet year.
 */
export function openNewIndustries(world: World): void {
  for (let n = 0; n < INDUSTRY_NEW_PER_YEAR; n++) {
    const type = drawType(world.rng, WEIGHTS);
    const spec = industrySpec(type);

    const spot = findSpot(
      world.map,
      world.rng,
      spec,
      world.towns,
      world.industries,
      INDUSTRY_OPENING_ATTEMPTS,
      -1,
      (x, y) => !isServed(world, x, y, spec.footprint),
    );
    if (spot === null) continue;

    const industry = newIndustry(
      world.industries.length,
      type,
      spot.x,
      spot.y,
      world.map.landmassId[world.map.tileIndex(spot.x, spot.y)]!,
      world.tick,
    );
    world.industries.push(industry);
    occupy(world.map, industry);

    // A station that now reaches it starts serving it this month.
    for (const station of world.stations) {
      if (!inCatchment(station, spot.x, spot.y)) continue;
      assignStationIndustries(world, station);
    }
  }
}

/** Does any station's catchment already reach this footprint? */
function isServed(world: World, x: number, y: number, footprint: number): boolean {
  for (const station of world.stations) {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        if (inCatchment(station, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

/**
 * Months an industry has left before it closes, or -1 when it is being served.
 * The panel shows it; it is the only warning there is until the news log.
 */
export function monthsUntilClosure(industry: Industry): number {
  if (!industry.open || industry.monthsWithoutCollection === 0) return -1;
  return INDUSTRY_CLOSURE_MONTHS - industry.monthsWithoutCollection;
}
