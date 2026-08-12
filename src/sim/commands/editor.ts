import {
  EDITOR_BRUSH_MAX_RADIUS,
  EDITOR_FOREST_COST_PER_TILE_CT,
  EDITOR_INDUSTRY_COST_CT,
  EDITOR_TOWN_SEED_COST_CT,
  TerraformDirection,
  TILE_PUBLIC,
  TOWN_COUNT_MAX,
  TOWN_MIN_DISTANCE,
} from '../constants';
import {
  INDUSTRY_TYPE_COUNT,
  industrySpec,
  newIndustry,
  type IndustryType,
} from '../industry/types';
import { Structure } from '../map/structures';
import { Terrain } from '../map/terrain';
import {
  captureGround,
  digTileToSeaLevel,
  refreshShorelineAt,
  restoreGround,
  terraformBrush,
} from '../map/terraform';
import { industrySiteRefusal, occupy } from '../mapgen/industries';
import { isValidCentre, newTown, settleTown } from '../mapgen/towns';
import { PlaceNameGenerator } from '../mapgen/names';
import { streamSalt } from '../rng';
import { assignStationIndustries } from '../industry/catchment';
import { TownSize } from '../town/types';
import type { World } from '../World';
import { affordable, buildBudgetCt, chargeBuild, ownershipWaived } from './editorRule';
import { ACCEPTED, RejectReason, type CommandOutcome } from './types';

/**
 * The five commands of the scenario workshop (SPEC2 M22).
 *
 * The editor speaks only commands, which is the whole point of the milestone:
 * a map an author built is a command log, and a command log is something the
 * replay verifier of M16 can reproduce bit for bit. So none of these is a
 * "generator call from the interface" - each one is an ordinary entry in the
 * queue with an owner, a price, a refusal vocabulary and a parser case.
 *
 * Two disciplines run through all five:
 *
 *  - **Preview and command are ONE function** (D-119). Every `plan*` below is
 *    the `apply*` beside it with `commit: false`, or literally the same call
 *    with a different flag - never a second implementation that agrees today.
 *  - **Zero draws on `world.rng`** (Z3, Fehlerkatalog 25). Two of the five need
 *    randomness (a town's name and its street spacing), and they take it from a
 *    stream named for the workshop and SALTED WITH THE TILE the command names,
 *    so the same command produces the same town wherever it sits in the log and
 *    no existing seed's breakdown roll moves by one word. The other three draw
 *    nothing at all.
 */

/** The named stream every workshop command that needs a draw takes from (Z3). */
const EDITOR_STREAM_NAME = 'editor';

/** What a workshop command costs and whether it may happen at all. */
export interface EditorPlan {
  /** Concrete refusal, or null when the command would be accepted. */
  readonly reasonKey: string | null;
  /** Inflated price the palette quotes and the bill charges. [cent] */
  readonly costCt: number;
  /** How much ground the command would actually touch, for the preview. */
  readonly affectedCells: number;
}

function refused(reasonKey: string): EditorPlan {
  return { reasonKey, costCt: 0, affectedCells: 0 };
}

/**
 * Is `radius` a region this build may be asked to work on?
 *
 * The per-command cap of SPEC2 M22, applied before a single byte moves, so an
 * oversized brush is a refusal rather than a half-applied edit. It binds on the
 * COMMAND and not on the tool, because a recorded log has to be replayable by a
 * build whose palette offers different brush sizes.
 */
function regionRefusal(radius: number): string | null {
  if (!Number.isInteger(radius) || radius < 0) return RejectReason.InvalidRegion;
  if (radius > EDITOR_BRUSH_MAX_RADIUS) return RejectReason.BrushTooLarge;
  return null;
}

/** The workshop's own stream, salted with the tile the command names (Z3). */
function editorStream(world: World, x: number, y: number): ReturnType<World['streamFor']> {
  return world.streamFor((streamSalt(EDITOR_STREAM_NAME) + y * (world.map.size + 1) + x) | 0);
}

// ------------------------------------------------------- TerraformBrushRegion

/**
 * What a bulk terraform would cost and whether it would move anything.
 *
 * `terraformBrush(..., commit: false)` runs the WHOLE operation and puts every
 * byte back, so this is not an estimate of the command - it IS the command,
 * asked without keeping the answer (D-119 taken literally).
 */
export function planTerraformBrush(
  world: World,
  x: number,
  y: number,
  radius: number,
  direction: number,
): EditorPlan {
  const region = regionRefusal(radius);
  if (region !== null) return refused(region);
  if (direction !== TerraformDirection.Raise && direction !== TerraformDirection.Lower) {
    return refused(RejectReason.InvalidRegion);
  }

  const result = terraformBrush(
    world.map,
    x,
    y,
    radius,
    direction,
    world.company.id,
    buildBudgetCt(world),
    false,
  );
  if (!result.ok) return refused(result.reasonKey ?? RejectReason.NothingToDo);
  return {
    reasonKey: null,
    costCt: world.costCt(result.costCt),
    affectedCells: result.changedCorners,
  };
}

export function terraformBrushRegion(
  world: World,
  x: number,
  y: number,
  radius: number,
  direction: number,
): CommandOutcome {
  const plan = planTerraformBrush(world, x, y, radius, direction);
  if (plan.reasonKey !== null) return { ok: false, reasonKey: plan.reasonKey };
  if (!affordable(world, plan.costCt)) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  const result = terraformBrush(
    world.map,
    x,
    y,
    radius,
    direction as TerraformDirection,
    world.company.id,
    buildBudgetCt(world),
    true,
  );
  if (!result.ok) return { ok: false, reasonKey: result.reasonKey ?? RejectReason.NothingToDo };
  chargeBuild(world, world.costCt(result.costCt));
  return ACCEPTED;
}

// --------------------------------------------------------------- PlaceTownSeed

/** May the acting issuer write on this tile at all? */
function tileWritable(world: World, index: number): boolean {
  if (ownershipWaived(world)) return true;
  const owner = world.map.owner[index]!;
  return owner === TILE_PUBLIC || owner === world.company.id;
}

/**
 * Would a town stand here?
 *
 * The generator's own two questions and no third: `isValidCentre` (flat, dry,
 * off the border) and the Poisson spacing of `TOWN_MIN_DISTANCE`. A town the
 * workshop places is therefore a town the generator could have placed, which is
 * what keeps every rule downstream - the council, the growth of 13.2, the
 * catchment - measuring what it has always measured.
 */
export function planTownSeed(world: World, x: number, y: number, sizeClass: number): EditorPlan {
  if (!world.map.contains(x, y)) return refused(RejectReason.OutsideMap);
  if (sizeClass !== TownSize.City && sizeClass !== TownSize.Town && sizeClass !== TownSize.Village) {
    return refused(RejectReason.UnknownType);
  }
  if (world.towns.length >= TOWN_COUNT_MAX) return refused(RejectReason.TooManyTowns);
  if (!tileWritable(world, world.map.tileIndex(x, y))) return refused(RejectReason.NotYours);
  if (!isValidCentre(world.map, x, y)) return refused(RejectReason.BadTownSite);

  const limitSq = TOWN_MIN_DISTANCE * TOWN_MIN_DISTANCE;
  for (const town of world.towns) {
    const dx = town.x - x;
    const dy = town.y - y;
    if (dx * dx + dy * dy < limitSq) return refused(RejectReason.TownTooClose);
  }
  return {
    reasonKey: null,
    costCt: world.costCt(EDITOR_TOWN_SEED_COST_CT),
    affectedCells: 1,
  };
}

export function placeTownSeed(
  world: World,
  x: number,
  y: number,
  sizeClass: number,
): CommandOutcome {
  const plan = planTownSeed(world, x, y, sizeClass);
  if (plan.reasonKey !== null) return { ok: false, reasonKey: plan.reasonKey };
  if (!affordable(world, plan.costCt)) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  // The name and the street spacing are the only randomness in the workshop,
  // and it comes from the named stream salted with this tile - so the town is a
  // function of the COMMAND and of nothing that happened before it (Z3).
  const stream = editorStream(world, x, y);
  const town = newTown(
    world.towns.length,
    new PlaceNameGenerator(stream).next(),
    x,
    y,
    sizeClass as TownSize,
  );
  world.towns.push(town);
  settleTown(world.map, town, stream);
  world.map.noteChange();
  chargeBuild(world, plan.costCt);
  return ACCEPTED;
}

// ------------------------------------------------------------ PlaceIndustryAt

/** The refusal keys the generator's four placement questions turn into. */
const INDUSTRY_SITE_KEYS: Readonly<Record<string, string>> = {
  ground: RejectReason.BadIndustrySite,
  nearTerrain: RejectReason.BadIndustrySite,
  nearTown: RejectReason.BadIndustrySite,
  tooClose: RejectReason.IndustryTooClose,
};

export function planIndustryAt(
  world: World,
  x: number,
  y: number,
  industryType: number,
): EditorPlan {
  if (!Number.isInteger(industryType) || industryType < 0 || industryType >= INDUSTRY_TYPE_COUNT) {
    return refused(RejectReason.UnknownType);
  }
  if (!world.map.contains(x, y)) return refused(RejectReason.OutsideMap);

  const spec = industrySpec(industryType as IndustryType);
  for (let dy = 0; dy < spec.footprint; dy++) {
    for (let dx = 0; dx < spec.footprint; dx++) {
      if (!world.map.contains(x + dx, y + dy)) return refused(RejectReason.OutsideMap);
      if (!tileWritable(world, world.map.tileIndex(x + dx, y + dy))) {
        return refused(RejectReason.NotYours);
      }
    }
  }

  const site = industrySiteRefusal(world.map, spec, world.towns, world.industries, x, y);
  if (site !== null) return refused(INDUSTRY_SITE_KEYS[site]!);
  return {
    reasonKey: null,
    costCt: world.costCt(EDITOR_INDUSTRY_COST_CT),
    affectedCells: spec.footprint * spec.footprint,
  };
}

export function placeIndustryAt(
  world: World,
  x: number,
  y: number,
  industryType: number,
): CommandOutcome {
  const plan = planIndustryAt(world, x, y, industryType);
  if (plan.reasonKey !== null) return { ok: false, reasonKey: plan.reasonKey };
  if (!affordable(world, plan.costCt)) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  const industry = newIndustry(
    world.industries.length,
    industryType as IndustryType,
    x,
    y,
    world.map.landmassId[world.map.tileIndex(x, y)]!,
    world.tick,
  );
  world.industries.push(industry);
  occupy(world.map, industry);
  world.map.noteChange();
  // A station whose catchment already reaches it starts serving it, exactly as
  // the yearly opening of 7.3 does (`industry/lifecycle.ts`).
  for (const station of world.stations) assignStationIndustries(world, station);
  chargeBuild(world, plan.costCt);
  return ACCEPTED;
}

// ---------------------------------------------------------------- PaintForest

/**
 * Ground a wood may grow on.
 *
 * Grass, field and marsh - the three open, dry, unpaved terrains. Rock, snow,
 * sand and coast are refused because a forest there would be a terrain the
 * generator never makes, and town ground because paving is what a town did to
 * it. Water is refused by the same rule that refuses everything else on water.
 */
const FOREST_GROUND: readonly number[] = [Terrain.Grass, Terrain.Field, Terrain.Marsh];

/** True when this tile is bare enough to plant on. */
function plantable(world: World, x: number, y: number): boolean {
  const map = world.map;
  const index = map.tileIndex(x, y);
  if (!FOREST_GROUND.includes(map.terrain[index]!)) return false;
  if (map.roadBits[index] !== 0 || map.trackBits[index] !== 0) return false;
  if (map.structure[index] !== Structure.None) return false;
  if (map.buildingKind[index] !== 0 || map.industryId[index] !== -1) return false;
  if (map.waypoint[index] !== 0) return false;
  return tileWritable(world, index);
}

export function planPaintForest(world: World, x: number, y: number, radius: number): EditorPlan {
  const region = regionRefusal(radius);
  if (region !== null) return refused(region);
  if (!world.map.contains(x, y)) return refused(RejectReason.OutsideMap);

  let cells = 0;
  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if (!world.map.contains(tx, ty)) continue;
      if (plantable(world, tx, ty)) cells++;
    }
  }
  if (cells === 0) return refused(RejectReason.NothingToPaint);
  return {
    reasonKey: null,
    costCt: world.costCt(EDITOR_FOREST_COST_PER_TILE_CT * cells),
    affectedCells: cells,
  };
}

export function paintForest(world: World, x: number, y: number, radius: number): CommandOutcome {
  const plan = planPaintForest(world, x, y, radius);
  if (plan.reasonKey !== null) return { ok: false, reasonKey: plan.reasonKey };
  if (!affordable(world, plan.costCt)) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if (!world.map.contains(tx, ty)) continue;
      if (!plantable(world, tx, ty)) continue;
      world.map.terrain[world.map.tileIndex(tx, ty)] = Terrain.Forest;
    }
  }
  world.map.noteChange();
  chargeBuild(world, plan.costCt);
  return ACCEPTED;
}

// ----------------------------------------------------------------- PaintRiver

/**
 * Cut a watercourse - by taking ground away, never by painting water.
 *
 * **The decision SPEC2 M22 asks for, and it is REFUSE.** "Standing water at
 * height X" cannot be formalised without a second water surface, and D-097
 * already recorded that this game has exactly one: a tile is water when even
 * its highest corner is at or below `SEA_LEVEL`, which is the rule `mapgen`'s
 * `floodSeaLevel` writes and the rule every shoreline refresh since M2 reads
 * back. `applyRivers` is the one place that ever disagreed - it paints water
 * along a traced course whatever height the valley is at - and the consequence
 * is the revert quirk this command may not reproduce: a mountain river is water
 * until somebody terraforms near it, and then it is grass.
 *
 * So `PaintRiver` writes NO terrain. It digs each named tile until the sea is
 * there by the game's own rule and lets the ordinary shoreline refresh flood
 * it. What comes out is water no later edit can revert, because the corners
 * under it say so.
 *
 * The price of that decision is stated rather than hidden: a region whose
 * ground cannot reach sea level inside one command's earth budget is refused
 * WHOLE, with `riverNeedsSeaLevel`. The workshop cuts rivers near the coast and
 * through low ground; an author who wants a valley river digs the valley first.
 */
export function planPaintRiver(world: World, x: number, y: number, radius: number): EditorPlan {
  return runPaintRiver(world, x, y, radius, false);
}

/**
 * The command AND its preview, in one function with a commit flag - the shape
 * `terraformBrush` has and the shape `planPaintRiver` only claimed to have.
 *
 * Three things follow from the flag being the only difference, and all three
 * were defects an independent verifier measured before the flag existed:
 *
 *  - **a preview writes nothing.** The dig runs against the real map because a
 *    cascade's price cannot be predicted tile by tile without running it; what
 *    makes that legitimate is {@link restoreGround} putting every byte back,
 *    heights, terrain, both revision counters and the two derived layers. The
 *    old preview restored the heights and then rebuilt the terrain FROM them
 *    with a whole-map sweep, which deleted every river the generator had drawn
 *    above sea level - 198 tiles on a 256 map, from a radius-1 brush.
 *  - **a refusal writes nothing either**, and for free: a refused run takes the
 *    same restore path as a preview, so the atomicity the command architecture
 *    rests on is a property of the control flow rather than of a promise. That
 *    matters most on the path where the region is dug HALFWAY and then meets a
 *    tile that cannot reach the sea - the very refusal this command exists to
 *    give (`riverNeedsSeaLevel`).
 *  - **an accepted dig relabels only what it dug.** `applyTerraform` has
 *    already asked the shoreline question of every corner it moved; the sweep
 *    here is the belt-and-braces pass over the region the author named, bounded
 *    by the brush and therefore incapable of reaching a river on the far side
 *    of the map.
 */
function runPaintRiver(
  world: World,
  x: number,
  y: number,
  radius: number,
  commit: boolean,
): EditorPlan {
  const region = regionRefusal(radius);
  if (region !== null) return refused(region);
  if (!world.map.contains(x, y)) return refused(RejectReason.OutsideMap);

  const map = world.map;
  const snapshot = captureGround(map);
  const dug = digRegion(world, x, y, radius);
  const accepted = dug.reasonKey === null && dug.cells > 0;

  if (!commit || !accepted) {
    restoreGround(map, snapshot, dug.changedShoreline);
    if (dug.reasonKey !== null) return refused(dug.reasonKey);
    if (dug.cells === 0) return refused(RejectReason.NothingToPaint);
    return { reasonKey: null, costCt: world.costCt(dug.costCt), affectedCells: dug.cells };
  }

  refreshShorelineAt(map, regionCorners(map, x, y, radius));
  map.noteChange();
  return { reasonKey: null, costCt: world.costCt(dug.costCt), affectedCells: dug.cells };
}

/**
 * Every corner of every tile of the brush region, clamped to the map.
 *
 * The bound on the accepted command's shoreline sweep: a radius-8 brush names
 * 17x17 tiles and therefore at most 18x18 corners, whatever the map size.
 */
function regionCorners(
  map: { size: number },
  x: number,
  y: number,
  radius: number,
): readonly number[] {
  const stride = map.size + 1;
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(map.size, x + radius + 1);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(map.size, y + radius + 1);
  const corners: number[] = [];
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) corners.push(cy * stride + cx);
  }
  return corners;
}

/**
 * Dig every tile of the region down to the sea, or name the first tile that
 * cannot get there.
 *
 * Whole or nothing at the REGION level: a half-dug riverbed is a ditch that
 * holds no water and that the author would have to find and undo by hand.
 */
function digRegion(
  world: World,
  x: number,
  y: number,
  radius: number,
): { reasonKey: string | null; costCt: number; cells: number; changedShoreline: boolean } {
  const map = world.map;
  let costCt = 0;
  let cells = 0;
  let changedShoreline = false;

  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if (!map.contains(tx, ty)) continue;
      if (!tileWritable(world, map.tileIndex(tx, ty))) {
        return { reasonKey: RejectReason.NotYours, costCt, cells, changedShoreline };
      }
      if (map.isSubmerged(tx, ty)) continue;

      const result = digTileToSeaLevel(map, tx, ty, buildBudgetCt(world) - costCt, world.company.id);
      changedShoreline = changedShoreline || result.changedShoreline;
      costCt += result.costCt;
      if (!result.ok) {
        return {
          reasonKey: RejectReason.RiverNeedsSeaLevel,
          costCt,
          cells,
          changedShoreline,
        };
      }
      cells++;
    }
  }
  return { reasonKey: null, costCt, cells, changedShoreline };
}

export function paintRiver(world: World, x: number, y: number, radius: number): CommandOutcome {
  // The price is asked first because affordability is asked first everywhere,
  // and asking it is a preview - it moves nothing (`commit: false`).
  const plan = planPaintRiver(world, x, y, radius);
  if (plan.reasonKey !== null) return { ok: false, reasonKey: plan.reasonKey };
  if (!affordable(world, plan.costCt)) {
    return { ok: false, reasonKey: RejectReason.InsufficientFunds };
  }

  const done = runPaintRiver(world, x, y, radius, true);
  if (done.reasonKey !== null) return { ok: false, reasonKey: done.reasonKey };
  chargeBuild(world, done.costCt);
  return ACCEPTED;
}
