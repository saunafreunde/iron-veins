/**
 * Where a rejection message goes (M26).
 *
 * The answer to a click belongs where the click was. It used to appear at the
 * bottom centre of the window whatever had been clicked, so a road refused in
 * the top-left corner answered half a screen away - and all eighty-four
 * reasons arrived at the same address, which is what made them read as one
 * undifferentiated "no".
 *
 * Pure, so the awkward half - what happens at the edges of the window - is a
 * test rather than something somebody has to reproduce by clicking into a
 * corner.
 */

/**
 * Half the width a message is assumed to need, in ROOT EM. [rem]
 *
 * `.toast` is capped at 22rem, so half of it is 11 - and rem rather than px
 * because the accessibility scale of 17.4 moves the root font size. A fixed
 * pixel clamp is right at 100 % and lets the message hang off the edge at
 * 200 %, which is the scale a player who needs it is using.
 */
const HALF_WIDTH_REM = 11;

/** How far above the click the message sits, clear of the cursor. [rem] */
const LIFT_REM = 1.3;

/** Space kept from the top edge, so the status bar never covers it. [rem] */
const TOP_MARGIN_REM = 4;

export interface ToastAnchor {
  readonly left: number;
  readonly top: number;
  /** True when the message had to go BELOW the click to stay on screen. */
  readonly below: boolean;
}

/**
 * The anchor for a message about a click at (x, y).
 *
 * Two clamps and one flip. The horizontal clamp keeps a message that is
 * centred on the click from hanging off either side; the flip puts it below
 * the click when there is no room above, which is the case that matters
 * because the map's top edge is where the status bar sits. A viewport smaller
 * than the message itself is clamped to the centre rather than left to produce
 * a negative position.
 */
export function toastAnchorFor(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  rootFontPx: number,
): ToastAnchor {
  const halfWidth = HALF_WIDTH_REM * rootFontPx;
  const lift = LIFT_REM * rootFontPx;
  const topMargin = TOP_MARGIN_REM * rootFontPx;

  const min = halfWidth;
  const max = viewportWidth - halfWidth;
  const left = max < min ? viewportWidth / 2 : Math.min(max, Math.max(min, x));

  /*
   * The message grows UPWARDS from its anchor (`translate(-50%, -100%)`), so
   * the room that has to be checked above the click is a message's HEIGHT and
   * not the lift alone - two lines of German at 200 % is a tall label, and a
   * flip that only cleared the cursor would push its first line off the top of
   * the window and under the status bar.
   */
  const above = y - lift;
  const below = above - topMargin < 0;
  const top = below ? Math.min(viewportHeight - lift, y + lift * 2) : Math.max(lift, above);

  return { left, top, below };
}
