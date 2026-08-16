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

/** Half the width a message is assumed to need, for clamping. [screen px] */
const HALF_WIDTH_PX = 150;

/** How far above the click the message sits, clear of the cursor. [screen px] */
const LIFT_PX = 18;

/** Space kept from the top edge, so the status bar never covers it. [screen px] */
const TOP_MARGIN_PX = 56;

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
): ToastAnchor {
  const min = HALF_WIDTH_PX;
  const max = viewportWidth - HALF_WIDTH_PX;
  const left = max < min ? viewportWidth / 2 : Math.min(max, Math.max(min, x));

  const above = y - LIFT_PX;
  const below = above < TOP_MARGIN_PX;
  const top = below
    ? Math.min(viewportHeight - LIFT_PX, y + LIFT_PX * 2)
    : Math.min(viewportHeight - LIFT_PX, above);

  return { left, top, below };
}
