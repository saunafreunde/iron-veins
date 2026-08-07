import { RailType, TRACK_DX, TRACK_DY, trackDegree } from '../sim/map/track';

/**
 * Catenary placement policy (SPEC2 M13: "Fahrleitungsmasten auf
 * elektrifizierter Strecke"). Which tiles carry a mast and where beside the
 * track it stands is decided here as a function of plain numbers - the
 * lampOffsetForRoadTile pattern (emissive.ts) - so the policy is a table of
 * cases under test while the sprite work stays in MapView. The mast and
 * wire ARTWORK are atlas cells (TerrainAtlas.ts, drawn with the new
 * shapes.ts mast primitive); rail type has been folded into the chunk
 * checksums since D-161 for exactly this art, so an electrification flips
 * the baked chunks without any new invalidation path.
 */

/**
 * The one rail type that carries wire. Restated as a named constant rather
 * than scattered comparisons, so the render side has a single sentence
 * saying what "electrified" means - the sim's own catenary gate
 * (railPath.ts) compares against the same enum member.
 */
export const CATENARY_RAIL_TYPE: number = RailType.Electrified;

/**
 * Tile-space offset of a mast from the tile centre, perpendicular to the
 * track; far enough that the pole stands on the ballast shoulder the track
 * cell draws, not between the rails. [tiles]
 */
export const MAST_VERGE_OFFSET = 0.34;

/**
 * Where the catenary mast of an electrified track tile stands, as a
 * tile-space (u, v) offset from the tile centre - or null when this tile
 * carries none. The caller gates on the rail type and yields the tile to a
 * signal or waypoint post (two poles on one tile read as clutter); this
 * function decides the rest from the coordinates and the track bits alone.
 *
 * Three rules, each with its reason:
 *
 * - **Every second tile.** No single parity alternates along all eight
 *   track directions (the diagonal steps defeat any linear form), so the
 *   alternating axis follows the run: tiles whose first track direction
 *   moves in x alternate on x, pure north-south runs on y. Along any
 *   straight line every second tile carries a mast - a wire over pole
 *   after pole, not a fence.
 * - **Plain line only** (one or two connections, the D-055 measure): a
 *   portal in a junction throat would stand over the crossing tracks.
 * - **The pole stands on the viewer's side** of the track: the
 *   perpendicular is flipped so its screen depth (u + v) is never
 *   negative, which keeps a mast drawn above a passing train honest - the
 *   pole IS between the camera and the train.
 */
export function catenaryMastOffset(
  trackBits: number,
  x: number,
  y: number,
): readonly [number, number] | null {
  if (trackBits === 0) return null;
  const degree = trackDegree(trackBits);
  if (degree > 2) return null;

  // The first connected direction names the run.
  let direction = 0;
  while ((trackBits & (1 << direction)) === 0) direction++;
  const dx = TRACK_DX[direction]!;
  const dy = TRACK_DY[direction]!;

  // The axis that moves along this run is the one that can alternate.
  const alternating = dx !== 0 ? x : y;
  if ((alternating & 1) !== 0) return null;

  // Perpendicular in tile space, unit length, flipped onto the viewer side.
  const length = Math.sqrt(dx * dx + dy * dy);
  let u = -dy / length;
  let v = dx / length;
  if (u + v < 0) {
    u = -u;
    v = -v;
  }
  return [u * MAST_VERGE_OFFSET, v * MAST_VERGE_OFFSET];
}
