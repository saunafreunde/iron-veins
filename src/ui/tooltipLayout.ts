/**
 * Placement logic of the tooltip module (SPEC2 M14), kept pure so the
 * headless suite can pin it - the component in `Tooltip.tsx` only measures
 * rectangles and hands them here. The same split `labels.ts` and `chart.ts`
 * use: geometry decisions in a function of plain numbers, DOM in the caller.
 */

/** ms of hover before a tooltip shows. Keyboard focus shows immediately -
 * a keyboard user asked for the element on purpose, a mouse merely passed
 * over it. 450 ms is the common desktop convention (Windows default ~500). */
export const TOOLTIP_DELAY_MS = 450;

/** px gap between the trigger and the bubble, and the minimum distance the
 * bubble keeps from every viewport edge. */
export const TOOLTIP_MARGIN_PX = 8;

/** The rectangle facts the placement needs - a `DOMRect` satisfies it. */
export interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
}

export interface TooltipPlacement {
  readonly left: number;
  readonly top: number;
  /** True when the bubble sits under the trigger instead of over it. */
  readonly below: boolean;
}

/**
 * Place a bubble of `bubbleW` x `bubbleH` px against `anchor` inside a
 * `viewportW` x `viewportH` viewport.
 *
 * Preferred position is centred ABOVE the trigger (the pointer sits on the
 * trigger, so below is where the cursor covers the text). When the space
 * above is short the bubble flips below; when both sides are short it takes
 * the side with more room and clamps. Horizontally it is clamped to the
 * viewport with the margin, left edge winning on a viewport narrower than
 * the bubble - the text start matters more than the text end.
 */
export function placeTooltip(
  anchor: AnchorRect,
  bubbleW: number,
  bubbleH: number,
  viewportW: number,
  viewportH: number,
  margin: number = TOOLTIP_MARGIN_PX,
): TooltipPlacement {
  const centred = anchor.left + anchor.width / 2 - bubbleW / 2;
  const maxLeft = viewportW - bubbleW - margin;
  const left = Math.max(margin, Math.min(centred, maxLeft));

  const above = anchor.top - margin - bubbleH;
  const belowTop = anchor.bottom + margin;
  const fitsAbove = above >= margin;
  const fitsBelow = belowTop + bubbleH <= viewportH - margin;

  if (fitsAbove || (!fitsBelow && anchor.top > viewportH - anchor.bottom)) {
    return { left, top: Math.max(margin, above), below: false };
  }
  return { left, top: belowTop, below: true };
}
