import { COMPANY_COLORS } from '../shared/palette';
import { SNAPSHOT_FLOW_STRIDE, SnapshotFlow } from '../shared/snapshot';

/**
 * The flow atlas of SPEC2 M14 (D-177): the pure geometry and selection layer
 * under the arrow overlay MapView draws from the FlowMarker block (D-176).
 *
 * Everything here is a pure function over the snapshot's flow-leg block and
 * plain numbers - no Pixi, no DOM - so the arc shapes, the width law, the
 * top-N policy and the colour policy are testable headless and priced in the
 * render perf tripwire without a renderer in the room.
 *
 * The drawing itself is event-driven, never per frame: MapView redraws the
 * overlay only when `flowHash` moved (a trip completed somewhere), the zoom
 * flipped or the station list changed. These functions may therefore allocate
 * small scratch structures; what they must never be is per-frame work.
 */

/**
 * Arrows drawn at most, selected by volume (M14: "Top-N nach Volumen, mit
 * ehrlichem 'x weitere'-Indikator"). The snapshot cap is 4,096 legs - a
 * megagraph that would melt the frame as strokes; 128 arrows keep the redraw
 * bounded whatever the world does, and the indicator states what was cut.
 * [arrows]
 */
export const FLOW_TOP_N = 128;

/**
 * Width of an arrow carrying no measured volume - an estimate leg, or a
 * measured leg whose recorded trips all ran empty. The arrow exists at
 * minimum width (D-176: the block's own honesty rule). [screen px]
 */
export const FLOW_WIDTH_MIN_PX = 1.5;

/**
 * Width ceiling. Past this an arrow stops growing: a four-digit coal flow
 * must stay an arrow, not a ribbon covering the line it describes.
 * [screen px]
 */
export const FLOW_WIDTH_MAX_PX = 10;

/**
 * Width slope: screen pixels per cargo unit in the leg's eight-trip sample
 * window (D-176). Sized so a full bus line (~300 units over eight trips)
 * reads mid-scale and a heavy coal leg saturates: proportionality is the
 * Fertig-wenn promise, the floor and ceiling bound it. [screen px / unit]
 */
export const FLOW_WIDTH_PER_UNIT_PX = 0.01;

/**
 * Bow height of the quadratic arc as a share of the chord length. Flat
 * enough that an arrow still reads as pointing where it goes, bent enough
 * that the paired opposite leg is a visibly separate arc. [ratio]
 */
export const FLOW_BOW_RATIO = 0.18;

/** Bow floor, so the two arcs of a short pair still separate. [world px] */
export const FLOW_BOW_MIN_PX = 10;

/** Bow ceiling, so a cross-map leg does not swing over half a region. [world px] */
export const FLOW_BOW_MAX_PX = 220;

/**
 * Arrowheads exist at this zoom and above. At 0.25x a head would be noise on
 * a three-pixel arc - the same argument that gates station labels (D-165);
 * the arc's width still says how much moves, and the bow's fixed chirality
 * still says which of the pair it is. [zoom factor]
 */
export const FLOW_ARROWHEAD_MIN_ZOOM = 0.5;

/** Arrowhead edge length. [screen px] */
export const FLOW_HEAD_PX = 9;

/** Stroke alpha of a measured leg. [0-1] */
export const FLOW_MEASURED_ALPHA = 0.85;

/**
 * Stroke alpha of an estimate leg - the D-077 straight-line seed nobody has
 * driven yet. Visibly fainter, because the arrow is a promise, not a
 * measurement. [0-1]
 */
export const FLOW_ESTIMATE_ALPHA = 0.45;

/**
 * Colour of a leg with no recorded trip (OwnerId -1): the interface's muted
 * text grey, deliberately outside the company palette so an estimate cannot
 * be misread as anybody's traffic. [RGB]
 */
export const FLOW_ESTIMATE_COLOR = 0x9aa3ae;

/** How many brightness steps the line shading cycles through. [steps] */
export const FLOW_LINE_SHADE_STEPS = 4;

/** White-mix per line shading step - see `flowStrokeColor`. [0-1 per step] */
export const FLOW_LINE_SHADE_STEP = 0.12;

/** The company palette as integer tints, parsed once at module load. */
const COMPANY_TINTS: readonly number[] = COMPANY_COLORS.map((hex) =>
  Number.parseInt(hex.slice(1), 16),
);

/** A quadratic arc's control point. */
export interface FlowArcControl {
  readonly cx: number;
  readonly cy: number;
}

/** The two base corners of an arrowhead whose tip is the arc's endpoint. */
export interface FlowHead {
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

/** What `selectTopFlows` decided: rows written to `out`, rows honestly cut. */
export interface FlowSelection {
  readonly drawn: number;
  readonly omitted: number;
}

/**
 * Pick the rows the atlas draws: the `topN` legs with the highest recorded
 * volume, written into `out` as row indices, highest first.
 *
 * The order is total (volume descending, then row index ascending), so two
 * frames over the same block select the same set in the same sequence - ties
 * cannot flicker between arrows. `omitted` is the honest remainder for the
 * "x weitere" indicator: legs that exist and are not drawn.
 *
 * Implemented as a bounded insertion selection rather than a full sort: one
 * pass over the rows, a kept list of at most `topN`, and an O(1) skip for
 * every row at or under the kept minimum. At the 4,096-leg megagraph this is
 * several times cheaper than sorting all rows and allocates nothing - the
 * redraw this feeds can fire on every publish edge of a busy world.
 */
export function selectTopFlows(
  data: Int32Array,
  count: number,
  topN: number,
  out: Int32Array,
): FlowSelection {
  const rows = Math.min(count, Math.floor(data.length / SNAPSHOT_FLOW_STRIDE));
  const cap = Math.min(topN, out.length);
  if (cap === 0) return { drawn: 0, omitted: rows };

  let kept = 0;
  // Volume of the kept minimum (out[kept - 1]) once the list is full.
  let minVolume = -1;

  for (let row = 0; row < rows; row++) {
    const volume = data[row * SNAPSHOT_FLOW_STRIDE + SnapshotFlow.VolumeUnits]!;
    // Rows scan ascending, so on a TIE with the kept minimum the kept row
    // has the lower index and wins by the total order - skip is exact.
    if (kept === cap && volume <= minVolume) continue;

    // Binary search for the insertion point in the descending kept list;
    // `>=` places a tying row AFTER its equals - index ascending among ties.
    let lo = 0;
    let hi = kept;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (data[out[mid]! * SNAPSHOT_FLOW_STRIDE + SnapshotFlow.VolumeUnits]! >= volume) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Shift the tail down one slot (dropping the evicted minimum when full).
    const last = kept < cap ? kept : cap - 1;
    for (let i = last; i > lo; i--) out[i] = out[i - 1]!;
    out[lo] = row;
    if (kept < cap) kept++;
    if (kept === cap) {
      minVolume = data[out[cap - 1]! * SNAPSHOT_FLOW_STRIDE + SnapshotFlow.VolumeUnits]!;
    }
  }

  return { drawn: kept, omitted: rows - kept };
}

/**
 * Arrow width for a leg's recorded volume: proportional between a floor and
 * a ceiling (the Fertig-wenn sentence names the proportionality; the bounds
 * keep an empty leg visible and a heavy one an arrow rather than a ribbon).
 */
export function flowArrowWidth(volumeUnits: number): number {
  const width = FLOW_WIDTH_MIN_PX + Math.max(0, volumeUnits) * FLOW_WIDTH_PER_UNIT_PX;
  return Math.min(FLOW_WIDTH_MAX_PX, width);
}

/**
 * Control point of the quadratic arc from (x1,y1) to (x2,y2): the chord's
 * midpoint pushed out perpendicular to the direction of travel.
 *
 * The perpendicular is always the same rotation of the travel direction
 * (+90 degrees), which is the whole trick of the deterministic bow: the
 * reverse leg's travel direction is the negation, so its perpendicular is
 * the opposite side - A->B and B->A bow apart BY CONSTRUCTION, with no pair
 * bookkeeping and no tie to break. The bow grows with the chord and is
 * clamped so short pairs still separate and long ones do not swing wild.
 */
export function flowArcControl(x1: number, y1: number, x2: number, y2: number): FlowArcControl {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  if (length === 0) return { cx: midX, cy: midY };

  const bow = Math.min(FLOW_BOW_MAX_PX, Math.max(FLOW_BOW_MIN_PX, length * FLOW_BOW_RATIO));
  // Rotate the unit travel direction by +90 degrees: (dx, dy) -> (-dy, dx).
  return { cx: midX - (dy / length) * bow, cy: midY + (dx / length) * bow };
}

/**
 * The arrowhead at the arc's destination: an isosceles triangle whose tip is
 * the endpoint, laid against the arc's arrival direction (endpoint minus
 * control point - the true tangent of a quadratic at its end).
 */
export function flowHead(cx: number, cy: number, x2: number, y2: number, sizePx: number): FlowHead {
  const dx = x2 - cx;
  const dy = y2 - cy;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) {
    return { leftX: x2, leftY: y2, rightX: x2, rightY: y2 };
  }
  const ux = dx / length;
  const uy = dy / length;
  const baseX = x2 - ux * sizePx;
  const baseY = y2 - uy * sizePx;
  const half = sizePx / 2;
  return {
    leftX: baseX - uy * half,
    leftY: baseY + ux * half,
    rightX: baseX + uy * half,
    rightY: baseY - ux * half,
  };
}

/**
 * Stroke colour of a leg: the owning company's palette colour, shaded by the
 * serving line.
 *
 * Owner and line are the newest recorded trip's (D-176). A leg nobody drove
 * is the muted estimate grey. The line shading mixes the company colour
 * towards white in `FLOW_LINE_SHADE_STEPS` deterministic steps of the line
 * id, so two lines of one company over the same junction stay tellable apart
 * while the company hue - the Okabe-Ito palette, deficiency-safe as a set -
 * stays the dominant read. Line id 0 (and free-order traffic) is the pure
 * company colour.
 */
export function flowStrokeColor(ownerId: number, lineId: number): number {
  if (ownerId < 0) return FLOW_ESTIMATE_COLOR;
  const base = COMPANY_TINTS[ownerId % COMPANY_TINTS.length]!;
  if (lineId < 0) return base;
  return lightenColor(base, (lineId % FLOW_LINE_SHADE_STEPS) * FLOW_LINE_SHADE_STEP);
}

/** Mix an RGB colour towards white by `amount` (0 = unchanged, 1 = white). */
function lightenColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/**
 * FNV-1a 32 over the used rows of the flow block plus the count itself.
 *
 * This is the redraw trigger: the hash is taken once per publish edge (20 Hz
 * at most, ~count*8 integer folds) and the overlay is rebuilt only when it
 * moved - a trip completed, a leg appeared, a leg died. The D-161 pattern one
 * size down: a checksum decides staleness, never a frame counter.
 */
export function flowHash(data: Int32Array, count: number): number {
  let hash = 0x811c9dc5;
  hash ^= count;
  hash = Math.imul(hash, 0x01000193);
  const end = count * SNAPSHOT_FLOW_STRIDE;
  for (let i = 0; i < end; i++) {
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
