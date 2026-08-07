import { RoadBit } from '../sim/town/types';
import { VEHICLE_FACING_DELTAS } from './vehicleArt';

/**
 * The pure half of the M13 emissive layer (SPEC.md 16.3 in full, SPEC2 M13):
 * which town road tiles carry a street lamp and where the lamp stands, which
 * way a headlight cone points, and the shared colour and alpha constants the
 * bake, the procedural atlas and the live compositing all read. Everything
 * here is a function of plain numbers - no Pixi, no canvas, no map object -
 * the water.ts/chunks.ts pattern, so the placement POLICY is headless-tested
 * while the texture work stays in MapView.
 *
 * The emissive RAMP itself lives in dayNight.ts (`emissiveIntensity`),
 * because it is derived from the D-127 tint curve and belongs next to it -
 * one source of truth for how dark the world is and how brightly it answers.
 */

/**
 * The lit-window colour: the warm interior light every emissive window and
 * lamp glows in at night. One constant for the procedural cells, the lamp
 * glow and the headlight cones; tools/bake-lib.ts restates it for the baked
 * emissive pass (Node cannot resolve src imports at bake time) and
 * tests/unit/assetsBake.spec.ts asserts the two equal - the D-160 coupling
 * device. [CSS hex; render-side judgment, M13]
 */
export const EMISSIVE_WINDOW_HEX = '#ffd98c';

/**
 * Additive alpha of the emissive layer at full night (emissiveIntensity 1).
 * Below 1 deliberately: the glow sprites sit INSIDE the day/night-tinted
 * world container, and full-strength addition over the night tint would
 * clip warm pixels to white and eat the window shapes. [0-1]
 */
export const EMISSIVE_MAX_ALPHA = 0.85;

/**
 * Level-driven emissive intensity of an industry's window twin (SPEC2 M13:
 * a dormant and a booming industry must tell apart in a still image -
 * "level-getriebener Rauch + Emissive-Intensitaet"). The factor multiplies
 * the glow sprite's ramped alpha: a CLOSED industry (marker level 0) is
 * dark - nobody works there and honest windows say so - while an open one
 * brightens with its production level, from a dimmed base glow at the
 * sim's INDUSTRY_LEVEL_START (100) to the full ramp at INDUSTRY_LEVEL_MAX
 * (200). Clamped at 1 so the alpha budget of EMISSIVE_MAX_ALPHA holds.
 */

/** Glow factor floor for an open industry at the lowest level. [0-1] */
const INDUSTRY_GLOW_MIN = 0.55;

/** Marker level at which the glow reaches full strength. [level %] */
const INDUSTRY_GLOW_FULL_LEVEL = 200;

/** Alpha multiplier for an industry window twin, from the marker level. */
export function industryGlowFactor(level: number): number {
  if (level <= 0) return 0;
  const factor = INDUSTRY_GLOW_MIN + (1 - INDUSTRY_GLOW_MIN) * (level / INDUSTRY_GLOW_FULL_LEVEL);
  return factor >= 1 ? 1 : factor;
}

/**
 * Street lamp glow: which road tiles of a town carry one, and where on the
 * tile it stands. The caller gates on `townId >= 0` - country roads are
 * unlit, which is what makes a town readable as a town at night - and this
 * function decides the rest from the tile coordinates and the road bits
 * alone, so the policy is a table of cases under test.
 *
 * The spacing rule is the (x + y) parity: along any straight street - x
 * varying, y varying, or both together - the parity alternates, so every
 * SECOND tile carries a lamp and a lit avenue is a chain of pools rather
 * than a wall of light.
 */

/** Tile-space offset of a lamp from the tile centre, perpendicular to the
 * carriageway; 0.28 puts it on the verge the road cell draws. [tiles] */
export const LAMP_VERGE_OFFSET = 0.28;

/**
 * Where the street lamp of a town road tile stands, as a tile-space (u, v)
 * offset from the tile centre - or null when this tile carries none (no
 * road, or the parity says the neighbour has it). A straight road gets its
 * lamp on the verge beside the carriageway; a junction (three or more arms)
 * gets it at the centre island, which is where the road cell's surface
 * patch is.
 */
export function lampOffsetForRoadTile(
  x: number,
  y: number,
  roadBits: number,
): readonly [number, number] | null {
  if (roadBits === 0) return null;
  if (((x + y) & 1) !== 0) return null;

  let arms = 0;
  for (let bit = 0; bit < 4; bit++) {
    if ((roadBits & (1 << bit)) !== 0) arms++;
  }
  const eastWest = (roadBits & (RoadBit.East | RoadBit.West)) !== 0;
  const northSouth = (roadBits & (RoadBit.North | RoadBit.South)) !== 0;
  if (arms >= 3 || (eastWest && northSouth)) return [0, 0];
  // A straight (or ending) east-west road: lamp on the northern verge; a
  // north-south road: on the western verge. Which side is arbitrary but
  // FIXED, so a street is lit down one side like a real one.
  if (eastWest) return [0, -LAMP_VERGE_OFFSET];
  return [-LAMP_VERGE_OFFSET, 0];
}

/**
 * Vehicle headlights (SPEC2 M13: "Fahrzeug-Scheinwerfer"): a small pre-baked
 * glow cone per facing, drawn additively at the vehicle's interpolated
 * position. The GEOMETRY is decided here so it can be tested; MapView only
 * rasterises the polygon into its eight little textures at attach.
 */

/** Ground length of the headlight cone. [tiles] */
export const HEADLIGHT_LENGTH_TILES = 0.85;

/** Half-angle of the cone around the travel direction. [radians] */
export const HEADLIGHT_SPREAD_RAD = 0.42;

/**
 * VehicleState values under which the headlights are ON: Driving (1) and
 * Braking (2) - a vehicle underway lights its road; one that stands
 * (Stopped, Loading, waiting states), is broken down or is parked in a
 * depot does not. Values duplicated as a bit mask to keep render free of
 * sim enums (the MapView pattern); tests/unit/emissive.spec.ts pins them
 * against VehicleState.
 */
export const HEADLIGHT_STATE_MASK = (1 << 1) | (1 << 2);

/** Whether a snapshot vehicle state drives with lights on. */
export function headlightsOn(state: number): boolean {
  return ((HEADLIGHT_STATE_MASK >> state) & 1) === 1;
}

/**
 * The three corners of one facing's headlight cone in TILE space, relative
 * to the vehicle's ground anchor: [originU, originV, leftU, leftV, rightU,
 * rightV]. The cone opens from the origin around the facing's travel
 * direction; the caller projects the corners with the 16.1 projection, so
 * a cone pointing "up the screen" forshortens exactly like the ground it
 * lights.
 */
export function headlightGroundPoints(facing: number): readonly number[] {
  const delta = VEHICLE_FACING_DELTAS[facing & 7]!;
  const length = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
  const du = delta[0] / length;
  const dv = delta[1] / length;
  const spread = Math.tan(HEADLIGHT_SPREAD_RAD) * HEADLIGHT_LENGTH_TILES;
  // Perpendicular in tile space: (-dv, du).
  const tipU = du * HEADLIGHT_LENGTH_TILES;
  const tipV = dv * HEADLIGHT_LENGTH_TILES;
  return [0, 0, tipU - dv * spread, tipV + du * spread, tipU + dv * spread, tipV - du * spread];
}
