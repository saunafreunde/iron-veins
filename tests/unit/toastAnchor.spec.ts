import { describe, expect, it } from 'vitest';
import { toastAnchorFor } from '../../src/ui/toastAnchor';

/**
 * Where a rejection message lands (M26).
 *
 * The interesting cases are all at the edges of the window, which is exactly
 * where nobody clicks while testing by hand - so they are asserted here rather
 * than discovered by a player who built at the top of the map.
 */

const W = 1920;
const H = 1080;

/** The shipped root font size (styles.css `:root`), i.e. a UI scale of 100 %. */
const ROOT_PX = 14;

describe('the rejection anchor', () => {
  it('sits just above the click in the middle of the map', () => {
    const anchor = toastAnchorFor(900, 600, W, H, ROOT_PX);
    expect(anchor.left).toBe(900);
    expect(anchor.top).toBeLessThan(600);
    expect(anchor.below).toBe(false);
  });

  it('never hangs off the left or the right edge', () => {
    expect(toastAnchorFor(0, 600, W, H, ROOT_PX).left).toBeGreaterThan(0);
    expect(toastAnchorFor(W, 600, W, H, ROOT_PX).left).toBeLessThan(W);
    // Symmetric: the same distance from either edge gives the same inset.
    const left = toastAnchorFor(0, 600, W, H, ROOT_PX).left;
    const right = toastAnchorFor(W, 600, W, H, ROOT_PX).left;
    expect(left).toBeCloseTo(W - right, 6);
  });

  /** The case that matters: the status bar owns the top of the window. */
  it('flips below the click when there is no room above', () => {
    const anchor = toastAnchorFor(900, 10, W, H, ROOT_PX);
    expect(anchor.below).toBe(true);
    expect(anchor.top).toBeGreaterThan(10);
  });

  it('stays inside the window at the bottom edge', () => {
    const anchor = toastAnchorFor(900, H, W, H, ROOT_PX);
    expect(anchor.top).toBeLessThanOrEqual(H);
    expect(anchor.below).toBe(false);
  });

  /**
   * A window narrower than the message itself has no position that satisfies
   * both clamps; the centre is the honest answer rather than a negative left.
   */
  it('centres in a window narrower than the message', () => {
    const anchor = toastAnchorFor(10, 300, 200, 400, ROOT_PX);
    expect(anchor.left).toBe(100);
  });

  /**
   * The accessibility scale of 17.4 moves the root font size, and the message
   * is measured in rem. A clamp in fixed pixels is right at 100 % and lets the
   * message hang off the edge at 200 % - which is the scale a player who needs
   * it is using.
   */
  it('clamps wider when the interface is scaled up', () => {
    const normal = toastAnchorFor(0, 600, W, H, ROOT_PX).left;
    const doubled = toastAnchorFor(0, 600, W, H, ROOT_PX * 2).left;
    expect(doubled).toBeGreaterThan(normal);
    expect(doubled).toBeCloseTo(normal * 2, 6);
  });

  it('answers a finite position for every corner', () => {
    for (const [x, y] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ]) {
      const anchor = toastAnchorFor(x!, y!, W, H, ROOT_PX);
      expect(Number.isFinite(anchor.left)).toBe(true);
      expect(Number.isFinite(anchor.top)).toBe(true);
      expect(anchor.top).toBeGreaterThanOrEqual(0);
    }
  });
});
