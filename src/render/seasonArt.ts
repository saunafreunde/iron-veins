import { TERRAIN_COLORS } from '../shared/palette';
import { MAX_HEIGHT, SEA_LEVEL, SEASON_FRICTION_GAIN, type MapClimate } from '../sim/constants';
import { Terrain, TERRAIN_COUNT } from '../sim/map/terrain';
import { winterFrictionFactor } from '../sim/weather/seasons';
import { shade } from './shapes';

/**
 * The pure half of the seasonal optics (SPEC2 M18: "Saison-Optik: Atlas-Seiten
 * regenerieren asynchron bei Monatswechsel, hoehenabhaengige Schneegrenze,
 * Herbstwaelder") - the emissive.ts / water.ts / particles.ts split applied
 * once more: what a month looks like, which cells that moves, and when a
 * regeneration may start. No Pixi, no canvas, no map object, so every decision
 * below is headless-tested while the canvas work stays in TerrainAtlas and the
 * scheduling in MapView.
 *
 * **Z1, and it is the whole reason this file can exist.** The season is a pure
 * function of (month, height, climate) with no randomness and no state - E-01
 * says so and `sim/weather/seasons.ts` is written to be readable from here
 * without asking the simulation anything. So the optics take the calendar out
 * of the published snapshot (the Month field) and the climate out of the world
 * announcement, and derive everything else. Nothing here reads a clock, draws
 * from an RNG or touches a `World` (Fehlerkatalog 39).
 *
 * **The snow line is the simulation's own winter read backwards** - the D-172
 * device, one milestone on. `snowLineFor` does not carry a table of its own: it
 * asks `winterFrictionFactor`, the very function the longitudinal solver
 * multiplies into its rolling resistance, at which height its severity reaches
 * the snow threshold. Snow therefore lies exactly where the ground the player
 * drives on has become hard, on every climate and in every month, and a change
 * to the winter tables moves both halves at once because there is only one
 * table.
 */

/**
 * The four looks a month can wear. Deliberately four rather than twelve: the
 * artwork is repainted on a change, and twelve stages would repaint every
 * month for differences nobody could name.
 */
export const SeasonStage = {
  Summer: 0,
  Autumn: 1,
  Winter: 2,
  Spring: 3,
} as const;
export type SeasonStage = (typeof SeasonStage)[keyof typeof SeasonStage];

export const SEASON_STAGE_COUNT = 4;

const SU = SeasonStage.Summer;
const AU = SeasonStage.Autumn;
const WI = SeasonStage.Winter;
const SP = SeasonStage.Spring;

/**
 * Which look each month wears, indexed by [MapClimate][month], 0 = January.
 *
 * Temperate is the plain calendar. Arctic spends seven months in winter and
 * has one month of each shoulder season, which is what an arctic year is.
 * **Tropical and desert have exactly one look all year**, and that is not
 * laziness: `SEASON_CLIMATE_WINTER` makes tropical an exact zero, D-201 states
 * that a tropical world has no season at all rather than a small one, and a
 * desert has neither deciduous forest to turn nor snow to lie - so an optics
 * that changed there would be showing a season the simulation does not charge
 * for. A world in either climate never regenerates its atlas.
 */
const STAGE_BY_CLIMATE: readonly (readonly SeasonStage[])[] = [
  [WI, WI, SP, SP, SP, SU, SU, SU, AU, AU, AU, WI], // Temperate
  [WI, WI, WI, WI, SP, SP, SU, SU, AU, AU, WI, WI], // Arctic
  [SU, SU, SU, SU, SU, SU, SU, SU, SU, SU, SU, SU], // Tropical
  [SU, SU, SU, SU, SU, SU, SU, SU, SU, SU, SU, SU], // Desert
];

/** Which look this month wears in this climate. */
export function seasonStageFor(month: number, climate: MapClimate): SeasonStage {
  const row = STAGE_BY_CLIMATE[climate] ?? STAGE_BY_CLIMATE[0]!;
  return row[month] ?? SU;
}

/**
 * Height level at or above which the land wears snow, when nothing does.
 *
 * One past the highest level a map can hold, so `height >= snowLine` is false
 * for every tile that exists and the caller needs no second case.
 */
export const SNOW_LINE_NONE = MAX_HEIGHT + 1;

/**
 * How much of full winter severity the ground must carry before it is drawn
 * as snow. [share of the severity `winterFrictionFactor` clamps at 1]
 *
 * The one number this file adds to the game, and it is a threshold on the
 * simulation's own quantity rather than a table of its own. Chosen so that a
 * temperate January puts the line part way up the mountains instead of
 * blanketing the shore - the acceptance sentence asks for a HEIGHT-DEPENDENT
 * line, and a line at sea level is not one. What it produces is walked in full
 * by `seasonArt.spec.ts` (which pins every climate and month) rather than
 * quoted here.
 */
export const SNOW_LINE_SEVERITY = 0.85;

/**
 * The lowest height level that wears snow this month, or {@link SNOW_LINE_NONE}.
 *
 * `winterFrictionFactor` rises monotonically with height (its severity is the
 * monthly table times the climate times a height gain, clamped), so the first
 * level that reaches the threshold IS the line and the walk can stop there.
 * Water and the shore never qualify: the walk starts one level above
 * `SEA_LEVEL`, which is where land begins.
 */
export function snowLineFor(month: number, climate: MapClimate): number {
  const threshold = 1 + SNOW_LINE_SEVERITY * SEASON_FRICTION_GAIN;
  for (let height = SEA_LEVEL + 1; height <= MAX_HEIGHT; height++) {
    if (winterFrictionFactor(month, height, climate) >= threshold) return height;
  }
  return SNOW_LINE_NONE;
}

/** Everything the renderer needs to know about one month's look. */
export interface SeasonLook {
  readonly stage: SeasonStage;
  /** Lowest height wearing snow; {@link SNOW_LINE_NONE} when none does. */
  readonly snowLine: number;
}

export function seasonLookFor(month: number, climate: MapClimate): SeasonLook {
  return { stage: seasonStageFor(month, climate), snowLine: snowLineFor(month, climate) };
}

/**
 * A number that identifies one look, so a month change that does not move the
 * artwork costs nothing at all.
 *
 * This is what makes the regeneration cheap in the cases that matter: a
 * tropical world holds one key for a century, and a temperate one changes key
 * four or five times a game year rather than twelve. The month is deliberately
 * NOT part of it - two months that look the same are the same key.
 */
export function seasonKeyOf(look: SeasonLook): number {
  return look.stage * (MAX_HEIGHT + 2) + look.snowLine;
}

/**
 * Terrain that is drawn as snow above the snow line.
 *
 * Everything the land is made of except water (which freezes in no model this
 * game has) and snow itself (which is already snow). The substitution reuses
 * the existing `Terrain.Snow` cell, so a height-dependent snow line costs
 * exactly zero atlas cells - the M18 ledger row books none (SPEC2 6.2).
 */
export function terrainTakesSnow(terrain: number): boolean {
  return terrain !== Terrain.Water && terrain !== Terrain.Snow;
}

/**
 * Speckle colour as a share of the terrain colour it grains. [factor]
 *
 * Read off the two hand-picked base tables rather than invented: grass is
 * #6f9b58 against a speckle of #628c4e, whose three channel ratios are 0.883,
 * 0.903 and 0.886. One number reproduces that relationship for every seasonal
 * colour, so a repainted cell grains exactly like the artwork it replaces.
 */
const SEASON_SPECKLE_SHADE = 0.89;

/**
 * Surface grain per terrain, indexed by {@link Terrain} - the summer table,
 * and the base every seasonal look is measured against.
 *
 * It lives here rather than in TerrainAtlas because the season owns what a
 * terrain looks like now: one file answers "what colour is grass in November",
 * and the atlas only draws the answer.
 */
const TERRAIN_SPECKLE: readonly string[] = [
  '#3f7896',
  '#bda874',
  '#628c4e',
  '#a08c46',
  '#365d32',
  '#7b766a',
  '#d7dde1',
  '#c7ad79',
  '#4e5d40',
  // Town ground: the base tone at the same 0.916 the pale entry it replaces
  // carried (D-217). Nothing consumes it today - made ground draws the
  // Paving grain, whose ink is the FACE colour times a value - but a stale
  // pale grey here would be the next hand's trap.
  '#7e6d56',
];

/** An entry that leaves the base palette alone. */
const KEEP = '';

/**
 * What each stage does to a terrain's colour, indexed by [stage][terrain].
 * An empty entry keeps the base palette, and summer keeps all of them - so a
 * summer atlas is the artwork the game has always started with.
 *
 * Only four terrains move, and they are the four that have a season in them:
 * grass dries and then pales, a field is sown, harvested and left as stubble,
 * a forest turns and then stands dark, and a marsh follows the grass. Rock,
 * desert, snow, coast and town ground are the same rock, sand, snow, beach and
 * pavement in every month - repainting them would spend the regeneration
 * budget on cells nobody could tell apart, which is precisely what the plan
 * below exists to avoid.
 */
const SEASON_TERRAIN_COLOUR: readonly (readonly string[])[] = [
  // Summer - the base palette of section 16.3, unchanged.
  [KEEP, KEEP, KEEP, KEEP, KEEP, KEEP, KEEP, KEEP, KEEP, KEEP],
  // Autumn - the Herbstwald of SPEC2 M18, and the fields behind it.
  [KEEP, KEEP, '#93a052', '#bfa96b', '#8a5a2a', KEEP, KEEP, KEEP, '#6b6a42', KEEP],
  // Winter - what is left when the colour has gone out of the ground.
  [KEEP, KEEP, '#9aa89a', '#a9a795', '#31513a', KEEP, KEEP, KEEP, '#6a7268', KEEP],
  // Spring - young growth, a shade brighter than high summer.
  [KEEP, KEEP, '#74a955', '#8fa155', '#4a7d3e', KEEP, KEEP, KEEP, '#5f7449', KEEP],
];

/** The two colours one terrain cell is drawn from. */
export interface TerrainLook {
  readonly colour: string;
  readonly speckle: string;
}

/**
 * How a terrain is drawn in a stage. Summer answers with the two base tables
 * literally, so the atlas built at startup and a summer repaint are the same
 * artwork.
 */
export function terrainLook(terrain: number, stage: SeasonStage): TerrainLook {
  const seasonal = SEASON_TERRAIN_COLOUR[stage]?.[terrain] ?? KEEP;
  if (seasonal === KEEP) {
    return { colour: TERRAIN_COLORS[terrain]!, speckle: TERRAIN_SPECKLE[terrain]! };
  }
  return { colour: seasonal, speckle: shade(seasonal, SEASON_SPECKLE_SHADE) };
}

/**
 * How much snow lies on a town roof in this stage. [0 = bare, 1 = white over]
 *
 * The one thing the season does to a BUILDING, and it is what gives the
 * "emissive in the same pass" clause of SPEC2 6.2 something to be about: the
 * six town cells are repainted, so their six window-only twins are repainted
 * from the same specs in the same pass (D-172's construction, not a promise
 * that they still line up).
 */
export function roofSnowFor(stage: SeasonStage): number {
  return stage === SeasonStage.Winter ? SEASON_ROOF_SNOW : 0;
}

/** How far a winter roof is mixed towards snow. [0-1; render judgment, M18] */
const SEASON_ROOF_SNOW = 0.62;

/** The near-white a snowed-over roof is mixed towards. [CSS hex] */
const ROOF_SNOW_COLOUR = '#eef3f6';

/**
 * Mix a colour towards the snow white by `t`. Returns the `rgb()` form
 * `shade` produces, so both are equally acceptable as a fill style.
 */
export function snowedRoof(hex: string, t: number): string {
  if (t <= 0) return hex;
  const from = Number.parseInt(hex.slice(1), 16);
  const to = Number.parseInt(ROOF_SNOW_COLOUR.slice(1), 16);
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t);
  };
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}

/**
 * The job list of one regeneration: which terrain rows the change actually
 * moves, plus the building cells when the roofs change. A job is a terrain
 * index, or {@link SEASON_JOB_BUILDINGS}.
 *
 * This is the whole reason a regeneration fits in its budget. A stage change
 * moves four terrains out of ten and, twice a year, the six town cells; a
 * repaint that walked every row would spend two and a half times as long for
 * pixels that come out identical.
 *
 * The stage a freshly built page holds is {@link SeasonStage.Summer}, because
 * `terrainLook(terrain, Summer)` IS the base palette and a summer roof carries
 * no snow - so a page that has never been repainted needs no special case
 * here, only the honest starting stage.
 *
 * Written into `out` and counted, rather than allocated - it runs on a month
 * boundary, but the same discipline everywhere is cheaper than a rule about
 * where it applies.
 */
export const SEASON_JOB_BUILDINGS = -1;

export function planSeasonRepaint(from: SeasonStage, to: SeasonStage, out: number[]): number {
  let count = 0;
  for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
    const current = terrainLook(terrain, from);
    const target = terrainLook(terrain, to);
    if (current.colour === target.colour && current.speckle === target.speckle) continue;
    out[count++] = terrain;
  }
  if (roofSnowFor(from) !== roofSnowFor(to)) out[count++] = SEASON_JOB_BUILDINGS;
  return count;
}

/**
 * Render frames a regeneration must be apart from the last one. [frames]
 *
 * SPEC2 6.2 asks for "debounced auf max. 1 Rebuild/Realsekunde bei 20x", and
 * sixty frames is that second on the 60 Hz display section 21 budgets for.
 *
 * What it actually protects is worth stating, because ordinary play does not
 * need it: at 20x a game month is fifteen real seconds, so the month boundary
 * alone can never ask for two regenerations in one second. A replay scrubbed
 * across years, a save loaded onto a running game and a new game started from
 * the menu all can, and each of those arrives as a month jump with no notice.
 */
export const SEASON_REGEN_MIN_FRAMES = 60;

/**
 * May a regeneration start this frame? Pure, so the policy is a test rather
 * than a comment.
 *
 * A pending look that equals what is already applied is never work. Everything
 * else waits for the debounce window - and the LATEST pending look wins when
 * it opens, because the atlas has one state and repainting through the
 * intermediate months of a scrub would draw artwork nobody asked to see.
 */
export function shouldStartRegeneration(
  pendingKey: number,
  appliedKey: number,
  framesSinceLast: number,
  minFrames = SEASON_REGEN_MIN_FRAMES,
): boolean {
  if (pendingKey === appliedKey) return false;
  return framesSinceLast >= minFrames;
}
