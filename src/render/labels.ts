/**
 * Map text: the pure half of the town and station labels (SPEC2 M12).
 *
 * Everything here is a plain function or a constant, deliberately free of
 * Pixi: the collision culling, the zoom gates and the glyph inventory are
 * exactly the parts that can go quietly wrong, so they live where a headless
 * test can hold them (the D-136 pattern). `MapView` owns the BitmapText
 * sprites and feeds this module measured rectangles.
 *
 * The font itself is rasterised AT STARTUP from system fonts (E-14): no font
 * binary may enter the repository, and the glob test of D-160 guards that.
 * What the raster must cover is decided here, once, as a constant a test can
 * sweep the name generator against.
 */

/**
 * The system stack the label font is rasterised from. Ordinary UI faces on
 * every platform the game ships to (Windows, macOS, Linux, and the browser
 * channel of E-13); the generic `sans-serif` at the end means the raster can
 * never fail outright - some face always resolves (E-14: the game always
 * starts).
 */
export const LABEL_FONT_FAMILY =
  "'Segoe UI', 'Noto Sans', 'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";

/**
 * Every character the startup raster covers.
 *
 * The map's own names are ASCII by construction (`PlaceNameGenerator`
 * composes from umlaut-free syllables, and a collision appends ` 2`), and
 * `tests/unit/labels.spec.ts` sweeps the generator to prove the raster can
 * never meet a glyph it lacks. The German umlauts and eszett are covered
 * anyway: E-14 orders de/en coverage explicitly, and a future name source
 * (scenario files, M22) must not be able to break map text by containing a
 * perfectly ordinary German letter.
 */
export const LABEL_FONT_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789' + ' -.,()/&ÄÖÜäöüß';

/**
 * Size the font atlas is rasterised at. The largest size any label is drawn
 * at, so every label is a downscale of a crisp raster and none is a blurry
 * upscale. [px]
 */
export const LABEL_FONT_BASE_PX = 18;

/**
 * Zoom gates. Towns are wayfinding and stay readable at every zoom - the
 * 0.25x overview is exactly the view made for reading a map, and the
 * collision culling thins the crowd there. Station labels appear only at the
 * detail zooms where the station modules themselves are drawn as sprites; at
 * 0.5x and below a station is a dot under a network line and its name would
 * caption something invisible.
 */
export const TOWN_LABEL_MIN_ZOOM = 0.25;
export const STATION_LABEL_MIN_ZOOM = 1;

/**
 * Town label sizes by population, so the map reads like a map: a city
 * announces itself, a village whispers. Thresholds bracket the populations a
 * generated 1950 map actually has (a few hundred to a few thousand), so all
 * three sizes appear on a fresh world. [inhabitants -> px]
 */
export const TOWN_LABEL_SIZE_SMALL_PX = 11;
export const TOWN_LABEL_SIZE_MID_PX = 14;
export const TOWN_LABEL_SIZE_LARGE_PX = 18;
export const TOWN_POPULATION_MID = 1_000;
export const TOWN_POPULATION_LARGE = 3_000;

/** Station labels are one size: the name is the information, not the rank. [px] */
export const STATION_LABEL_SIZE_PX = 10;

/** Label tints over the near-black outline the raster carries. */
export const TOWN_LABEL_TINT = 0xf2ead8;
export const STATION_LABEL_TINT = 0xc9d4de;

/** Screen pixels a label floats above its anchor tile's ground point. [px] */
export const LABEL_LIFT_PX = 10;

export function townLabelSizePx(population: number): number {
  if (population >= TOWN_POPULATION_LARGE) return TOWN_LABEL_SIZE_LARGE_PX;
  if (population >= TOWN_POPULATION_MID) return TOWN_LABEL_SIZE_MID_PX;
  return TOWN_LABEL_SIZE_SMALL_PX;
}

/** An axis-aligned label rectangle in screen space, top-left anchored. */
export interface LabelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function overlaps(a: LabelRect, b: LabelRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Greedy collision culling: labels DROP, they never overlap (SPEC2 M12).
 *
 * The caller passes rectangles in priority order - towns before stations,
 * larger towns before smaller - and a label is kept exactly when it overlaps
 * no label already kept. First come, first kept: the ordering IS the policy,
 * stated once at the call site instead of split between a comparator here
 * and a sort there. Returns one keep flag per input rectangle, in input
 * order.
 *
 * Quadratic in the kept count, which is fine for what it is: a few hundred
 * labels, re-laid-out only when the zoom, the marker lists or the map
 * revision move - never per frame.
 */
export function cullLabels(rects: readonly LabelRect[]): boolean[] {
  const keep: boolean[] = new Array<boolean>(rects.length);
  const kept: LabelRect[] = [];

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    let collides = false;
    for (let k = 0; k < kept.length; k++) {
      if (overlaps(rect, kept[k]!)) {
        collides = true;
        break;
      }
    }
    keep[i] = !collides;
    if (!collides) kept.push(rect);
  }
  return keep;
}
