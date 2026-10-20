/**
 * What a press on the map MEANS, decided without a canvas (D-273).
 *
 * `MapView` has never been headless (D-136), and the question this file
 * answers - is this a click, a pan, a pinch, or nothing - is exactly the part
 * that goes wrong on a phone and cannot be felt out by hand on a desktop. So
 * the decision is a state machine over plain pointer records, and the view
 * only translates what it answers into camera moves and callbacks.
 *
 * Three rules, each from a measured failure on a touch screen:
 *
 * - **A finger gets a wider click radius than a mouse.** A fingertip rolls
 *   five to ten pixels during a deliberate tap; at the mouse's four pixels
 *   nearly every tap on a phone became a tiny pan and built nothing.
 * - **Two fingers are a pinch, and a pinch never builds** - not when the
 *   second finger lands, not when one of them is lifted first, not when the
 *   last one comes up. The old handler tracked ONE pointer, so a second finger
 *   overwrote the first one's position (the camera jumped) and a two-finger
 *   tap that did not move was a click that laid whatever tool was armed.
 * - **The spread zooms in the renderer's own steps.** The zoom has five
 *   discrete steps (D-263), so a pinch is translated into steps rather than a
 *   scale: each time the finger distance grows by {@link PINCH_STEP_RATIO}
 *   from where the last step was taken, one step in; shrinking by its inverse,
 *   one step out.
 */

/**
 * How far a MOUSE press may travel and still count as a click. [screen px]
 *
 * The left button does two jobs - drag the map, click to build - and this
 * radius plus the RELEASE tells them apart (D-263). Four pixels rather than
 * one, because a hand that is only pressing still moves the mouse a little.
 */
export const CLICK_SLOP_PX = 4;

/**
 * The same radius for a finger. [screen px]
 *
 * Ten is the common platform figure for a touch slop; measured in the review
 * that found the defect, a tap with seven pixels of finger roll built 0 of 16
 * times at four pixels and 15 of 16 at ten.
 */
export const TOUCH_CLICK_SLOP_PX = 10;

/**
 * How far two fingers must spread (or close) before the zoom takes one step.
 * [ratio of finger distances]
 *
 * The steps are powers of two; 1.4 is close to the square root of two, so a
 * spread to roughly twice the distance zooms twice - which is what the hand
 * expects from a picture that doubles per step.
 */
export const PINCH_STEP_RATIO = 1.4;

/** The part of a pointer event the gesture reads. */
export interface GesturePointer {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** What a press did when it went down. */
export type GestureDown =
  /** Not a button the map answers; leave the event alone. */
  | 'ignore'
  /** A press the map owns from now on - capture the pointer. */
  | 'press';

/** What a movement means. */
export type GestureMove =
  | { readonly kind: 'none' }
  /** A button-less mouse moved: the hover preview follows it. */
  | { readonly kind: 'hover' }
  /** The camera moves by this many screen pixels, against the drag. */
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  /**
   * Two fingers moved: their midpoint pans, and the spread may have crossed a
   * step. `zoomSteps` is -1, 0 or +1, anchored at (`x`, `y`).
   */
  | {
      readonly kind: 'pinch';
      readonly dx: number;
      readonly dy: number;
      readonly zoomSteps: number;
      readonly x: number;
      readonly y: number;
    };

/** What a release means. */
export type GestureUp =
  | { readonly kind: 'none' }
  /** A press that never left its radius: select or build at the release. */
  | { readonly kind: 'click'; readonly touch: boolean };

const NO_MOVE: GestureMove = { kind: 'none' };
const HOVER: GestureMove = { kind: 'hover' };
const NO_UP: GestureUp = { kind: 'none' };

/** Which radius a press of this pointer type gets. */
export function clickSlopFor(pointerType: string): number {
  return pointerType === 'touch' ? TOUCH_CLICK_SLOP_PX : CLICK_SLOP_PX;
}

/**
 * Whether a finger distance crossed a zoom step from `base`: +1 spread far
 * enough to zoom in, -1 closed far enough to zoom out, 0 neither.
 */
export function pinchStep(base: number, distance: number): number {
  if (base <= 0) return 0;
  if (distance > base * PINCH_STEP_RATIO) return 1;
  if (distance < base / PINCH_STEP_RATIO) return -1;
  return 0;
}

/**
 * The pointer state machine of the map.
 *
 * One instance per canvas. Every method takes the event's own record and
 * answers what it means; nothing here touches a camera or a DOM node.
 */
export class PointerGestures {
  /** The button dragging (or about to drag) the map, or -1. */
  private panButton = -1;
  private lastX = 0;
  private lastY = 0;
  private pressX = 0;
  private pressY = 0;
  private slop = CLICK_SLOP_PX;
  /** True once the press left its radius - it is a pan and will not click. */
  private dragged = false;
  private pressTouch = false;

  /** Fingers on the glass by pointer id, in landing order. */
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private pinching = false;
  /** Finger distance at the last zoom step taken during this pinch. */
  private pinchBase = 0;
  private midX = 0;
  private midY = 0;
  /** Finger distance of the current measurement. */
  private spread = 0;

  /** True while two or more fingers are down (or a pinch is winding down). */
  get isPinching(): boolean {
    return this.pinching;
  }

  down(event: GesturePointer): GestureDown {
    if (event.pointerType === 'touch') {
      this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.fingers.size >= 2) {
        // The second finger turns whatever the first one started into a
        // pinch, and the press that began as a possible tap is void.
        this.pinching = true;
        this.panButton = -1;
        this.measure();
        this.pinchBase = this.spread;
        return 'press';
      }
    }
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return 'ignore';
    this.panButton = event.button;
    this.pressTouch = event.pointerType === 'touch';
    this.slop = clickSlopFor(event.pointerType);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.pressX = event.clientX;
    this.pressY = event.clientY;
    // A middle or right press is a pan from its first pixel; a left press
    // only once it has travelled, because until then it may still build.
    this.dragged = event.button !== 0;
    return 'press';
  }

  move(event: GesturePointer): GestureMove {
    if (event.pointerType === 'touch' && this.fingers.has(event.pointerId)) {
      this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pinching) {
        // One finger left of a pinch steers nothing until it is lifted:
        // it would otherwise turn into a pan that started mid-gesture.
        if (this.fingers.size < 2) return NO_MOVE;
        const beforeX = this.midX;
        const beforeY = this.midY;
        this.measure();
        const zoomSteps = pinchStep(this.pinchBase, this.spread);
        if (zoomSteps !== 0) this.pinchBase = this.spread;
        return {
          kind: 'pinch',
          dx: this.midX - beforeX,
          dy: this.midY - beforeY,
          zoomSteps,
          x: this.midX,
          y: this.midY,
        };
      }
    }
    if (this.panButton >= 0) {
      if (!this.dragged) {
        const far =
          Math.abs(event.clientX - this.pressX) > this.slop ||
          Math.abs(event.clientY - this.pressY) > this.slop;
        if (!far) return NO_MOVE;
        this.dragged = true;
      }
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      return { kind: 'pan', dx, dy };
    }
    // A finger only ever moves while it presses, so a hover is a mouse's
    // (or a pen's) - a touch move with no press of ours is nothing.
    return event.pointerType === 'touch' ? NO_MOVE : HOVER;
  }

  up(event: GesturePointer): GestureUp {
    this.fingers.delete(event.pointerId);
    if (this.pinching) {
      // A pinch never builds - not with its last finger either.
      if (this.fingers.size === 0) this.pinching = false;
      this.panButton = -1;
      return NO_UP;
    }
    const button = this.panButton;
    this.panButton = -1;
    // The build happens on the release and only when the press stayed put
    // (D-263): firing on the press would build at the start of every drag.
    if (button !== 0 || this.dragged) return NO_UP;
    return { kind: 'click', touch: this.pressTouch };
  }

  /** A press the browser took away (it left the window, a system gesture). */
  cancel(event: GesturePointer): void {
    this.fingers.delete(event.pointerId);
    if (this.fingers.size === 0) this.pinching = false;
    this.panButton = -1;
  }

  /** Midpoint and distance of the first two fingers, into the fields. */
  private measure(): void {
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let n = 0;
    for (const point of this.fingers.values()) {
      if (n === 0) {
        ax = point.x;
        ay = point.y;
      } else if (n === 1) {
        bx = point.x;
        by = point.y;
      }
      n++;
    }
    this.spread = Math.hypot(bx - ax, by - ay);
    this.midX = (ax + bx) / 2;
    this.midY = (ay + by) / 2;
  }
}

/** A tile, as the tap decision compares it. */
export interface TapTile {
  readonly x: number;
  readonly y: number;
}

/**
 * What a finger's tap does: show the preview, or act (D-273).
 *
 * A finger has no hover, and the build preview - price, catchment, the route
 * of a track - has only ever been drawn on a hover. So on a touch screen the
 * FIRST tap on a tile is the hover and the SECOND tap on the same tile is the
 * click; a tap on another tile moves the preview there. `previewFirst` is the
 * interface's answer to "would a click here spend anything": a tap that only
 * inspects, selects or sets an anchor acts at once, because there is nothing
 * to confirm. A tap off the map (null) acts - it can only clear a selection.
 */
export function tapResolves(
  pending: TapTile | null,
  tile: TapTile | null,
  previewFirst: boolean,
): 'preview' | 'act' {
  if (tile === null || !previewFirst) return 'act';
  if (pending !== null && pending.x === tile.x && pending.y === tile.y) return 'act';
  return 'preview';
}
