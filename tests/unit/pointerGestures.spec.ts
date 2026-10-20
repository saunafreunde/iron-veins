import { describe, expect, it } from 'vitest';
import {
  CLICK_SLOP_PX,
  clickSlopFor,
  PINCH_STEP_RATIO,
  pinchStep,
  PointerGestures,
  tapResolves,
  TOUCH_CLICK_SLOP_PX,
  type GesturePointer,
} from '../../src/render/pointerGestures';
import { TOOL_REGISTRY, tapPreviewsFirst } from '../../src/ui/tools';
import type { Tool } from '../../src/ui/store';

/**
 * The map's pointer vocabulary on a touch screen (D-273), in the half that is
 * decided before a canvas exists.
 *
 * `MapView` is not headless (D-136), so what is held here is the state machine
 * it delegates to: when a press is a click, when it is a pan, and that a
 * two-finger gesture never ends in a click. The three numbers the review
 * measured on an emulated phone - a two-finger tap built 16 of 16 times, a
 * rolled finger tap built 0 of 16, a spread never zoomed - are each a case
 * below, so they cannot come back silently. Whether ten pixels FEEL right on a
 * real phone is a human's to confirm.
 */

let nextId = 1;

function finger(x: number, y: number, pointerId = nextId++): GesturePointer {
  return { pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: y };
}

function mouse(x: number, y: number, button = 0): GesturePointer {
  return { pointerId: 1, pointerType: 'mouse', button, clientX: x, clientY: y };
}

function at(pointer: GesturePointer, x: number, y: number): GesturePointer {
  return { ...pointer, clientX: x, clientY: y };
}

describe('the click radius', () => {
  it('is wider for a finger than for a mouse', () => {
    expect(clickSlopFor('mouse')).toBe(CLICK_SLOP_PX);
    expect(clickSlopFor('pen')).toBe(CLICK_SLOP_PX);
    expect(clickSlopFor('touch')).toBe(TOUCH_CLICK_SLOP_PX);
    expect(TOUCH_CLICK_SLOP_PX).toBeGreaterThan(CLICK_SLOP_PX);
  });

  it('keeps a finger tap that rolled seven pixels a click', () => {
    const gestures = new PointerGestures();
    const tap = finger(100, 100);
    expect(gestures.down(tap)).toBe('press');
    expect(gestures.move(at(tap, 107, 103)).kind).toBe('none');
    expect(gestures.up(at(tap, 107, 103))).toEqual({ kind: 'click', touch: true });
  });

  it('turns the same seven pixels into a pan for a mouse - the D-263 radius is unchanged', () => {
    const gestures = new PointerGestures();
    gestures.down(mouse(100, 100));
    expect(gestures.move(mouse(107, 103))).toEqual({ kind: 'pan', dx: 7, dy: 3 });
    expect(gestures.up(mouse(107, 103))).toEqual({ kind: 'none' });
  });

  it('lets a finger that really travelled pan and build nothing', () => {
    const gestures = new PointerGestures();
    const drag = finger(100, 100);
    gestures.down(drag);
    expect(gestures.move(at(drag, 130, 100))).toEqual({ kind: 'pan', dx: 30, dy: 0 });
    expect(gestures.move(at(drag, 140, 90))).toEqual({ kind: 'pan', dx: 10, dy: -10 });
    expect(gestures.up(at(drag, 140, 90))).toEqual({ kind: 'none' });
  });

  it('pans with the right and middle buttons from the first pixel and never clicks', () => {
    for (const button of [1, 2]) {
      const gestures = new PointerGestures();
      gestures.down(mouse(10, 10, button));
      expect(gestures.move(mouse(11, 10, button))).toEqual({ kind: 'pan', dx: 1, dy: 0 });
      expect(gestures.up(mouse(11, 10, button))).toEqual({ kind: 'none' });
    }
  });

  it('ignores a button the map does not answer', () => {
    const gestures = new PointerGestures();
    expect(gestures.down(mouse(0, 0, 3))).toBe('ignore');
  });
});

describe('the hover', () => {
  it('follows a mouse with no button down', () => {
    expect(new PointerGestures().move(mouse(5, 5)).kind).toBe('hover');
  });

  it('is never produced by a finger - a finger only moves while it presses', () => {
    expect(new PointerGestures().move(finger(5, 5)).kind).toBe('none');
  });
});

describe('two fingers', () => {
  it('never click - the 16 of 16 defect', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(200, 100);
    gestures.down(a);
    gestures.down(b);
    expect(gestures.isPinching).toBe(true);
    // Lifted without moving: under the old handler this was a click.
    expect(gestures.up(b)).toEqual({ kind: 'none' });
    expect(gestures.up(a)).toEqual({ kind: 'none' });
    expect(gestures.isPinching).toBe(false);
  });

  it('do not click when the first finger is lifted first either', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(200, 100);
    gestures.down(a);
    gestures.down(b);
    expect(gestures.up(a)).toEqual({ kind: 'none' });
    // The finger left behind steers nothing until it comes up.
    expect(gestures.move(at(b, 260, 100)).kind).toBe('none');
    expect(gestures.up(at(b, 260, 100))).toEqual({ kind: 'none' });
  });

  it('pan by their midpoint', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(200, 100);
    gestures.down(a);
    gestures.down(b);
    const move = gestures.move(at(a, 120, 110));
    expect(move).toEqual({ kind: 'pinch', dx: 10, dy: 5, zoomSteps: 0, x: 160, y: 105 });
  });

  it('zoom in one step per spread of the step ratio, anchored at the midpoint', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(200, 100);
    gestures.down(a);
    gestures.down(b);
    // 100 px apart -> 150 px: past 1.4, one step in.
    const first = gestures.move(at(b, 250, 100));
    expect(first.kind).toBe('pinch');
    if (first.kind !== 'pinch') return;
    expect(first.zoomSteps).toBe(1);
    expect(first.x).toBe(175);
    // The base moved with the step: 150 -> 200 is only 1.33, no second step.
    const second = gestures.move(at(b, 300, 100));
    expect(second.kind === 'pinch' && second.zoomSteps).toBe(0);
    // 150 -> 220 is 1.47: the second step.
    const third = gestures.move(at(b, 320, 100));
    expect(third.kind === 'pinch' && third.zoomSteps).toBe(1);
  });

  it('zoom out when they close', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(300, 100);
    gestures.down(a);
    gestures.down(b);
    const move = gestures.move(at(b, 230, 100));
    expect(move.kind === 'pinch' && move.zoomSteps).toBe(-1);
  });

  it('void a finger press that was already under way', () => {
    // First finger down, a little roll, then the second finger: the tap the
    // first finger started must not survive as a click.
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    gestures.down(a);
    gestures.move(at(a, 102, 100));
    gestures.down(finger(200, 100));
    expect(gestures.up(at(a, 102, 100))).toEqual({ kind: 'none' });
  });

  it('are cleared by a cancel, so the next tap is a tap again', () => {
    const gestures = new PointerGestures();
    const a = finger(100, 100);
    const b = finger(200, 100);
    gestures.down(a);
    gestures.down(b);
    gestures.cancel(a);
    gestures.cancel(b);
    expect(gestures.isPinching).toBe(false);
    const tap = finger(50, 50);
    gestures.down(tap);
    expect(gestures.up(tap)).toEqual({ kind: 'click', touch: true });
  });
});

describe('the pinch step', () => {
  it('needs the full ratio either way and nothing in between', () => {
    expect(pinchStep(100, 100 * PINCH_STEP_RATIO + 0.01)).toBe(1);
    expect(pinchStep(100, 100 * PINCH_STEP_RATIO)).toBe(0);
    expect(pinchStep(100, 100 / PINCH_STEP_RATIO - 0.01)).toBe(-1);
    expect(pinchStep(100, 100)).toBe(0);
  });

  it('takes no step from two fingers on the same pixel', () => {
    expect(pinchStep(0, 50)).toBe(0);
  });
});

describe("a finger's tap: preview first, act second (D-273)", () => {
  it('previews on the first tap and acts on the second tap on the same tile', () => {
    expect(tapResolves(null, { x: 3, y: 4 }, true)).toBe('preview');
    expect(tapResolves({ x: 3, y: 4 }, { x: 3, y: 4 }, true)).toBe('act');
  });

  it('moves the preview when the second tap lands elsewhere', () => {
    expect(tapResolves({ x: 3, y: 4 }, { x: 4, y: 4 }, true)).toBe('preview');
  });

  it('acts at once where a click spends nothing, and off the map', () => {
    expect(tapResolves(null, { x: 3, y: 4 }, false)).toBe('act');
    expect(tapResolves({ x: 1, y: 1 }, null, true)).toBe('act');
  });
});

describe('which tools preview first', () => {
  const base = { roadAnchor: null, editorMode: false, editorTool: 'none' };

  it('asks for a second tap for every tool that builds, demolishes or reshapes', () => {
    const free: readonly Tool[] = ['none', 'connect', 'road', 'track'];
    for (const entry of TOOL_REGISTRY) {
      if (free.includes(entry.id)) continue;
      expect(tapPreviewsFirst({ ...base, tool: entry.id }), entry.id).toBe(true);
    }
  });

  it('acts at once for inspecting and for the two station taps of Connect', () => {
    expect(tapPreviewsFirst({ ...base, tool: 'none' })).toBe(false);
    expect(tapPreviewsFirst({ ...base, tool: 'connect' })).toBe(false);
  });

  it('sets the first end of a road or track at once, and previews the far end', () => {
    for (const tool of ['road', 'track'] as const) {
      expect(tapPreviewsFirst({ ...base, tool })).toBe(false);
      expect(tapPreviewsFirst({ ...base, tool, roadAnchor: { x: 1, y: 2 } })).toBe(true);
    }
  });

  it('previews every armed workshop tool, which reshapes the world', () => {
    expect(tapPreviewsFirst({ ...base, tool: 'none', editorMode: true, editorTool: 'forest' })).toBe(
      true,
    );
  });
});
