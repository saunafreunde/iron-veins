import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM_INDEX, ZOOM_LEVELS } from '../../src/render/MapView';
import {
  KEY_ACTIONS,
  PAN_OF_ACTION,
  panVector,
  resolveBindings,
  type KeyActionId,
} from '../../src/ui/keymap';
import { zoomStepOf } from '../../src/ui/ZoomControl';

/**
 * The camera controls, in the halves that can be decided without a GPU.
 *
 * `MapView` itself has never been headless (D-136), so what is held here is
 * everything the camera decides BEFORE it touches a canvas: which way a set of
 * held keys points, that the four pan keys exist and are bound, and which zoom
 * step a factor off the camera message is. What is left for a human is the
 * feel - whether the speed is right and whether a drag builds when it should
 * not - and that is said rather than dressed up as covered.
 */

describe('the pan keys', () => {
  it('points the camera the way one held key names', () => {
    expect(panVector(['panUp'])).toEqual([0, -1]);
    expect(panVector(['panDown'])).toEqual([0, 1]);
    expect(panVector(['panLeft'])).toEqual([-1, 0]);
    expect(panVector(['panRight'])).toEqual([1, 0]);
  });

  it('stands still when nothing is held', () => {
    expect(panVector([])).toEqual([0, 0]);
  });

  it('stands still when two opposite keys are held', () => {
    expect(panVector(['panLeft', 'panRight'])).toEqual([0, 0]);
    expect(panVector(['panUp', 'panDown'])).toEqual([0, 0]);
  });

  /**
   * The eight-way movement bug: two keys summed and not normalised send the
   * camera diagonally at sqrt(2) times the speed of an edge.
   */
  it('crosses a diagonal at the same speed as an edge', () => {
    const [x, y] = panVector(['panUp', 'panRight']);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
    expect(x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(y).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('ignores an action that is not a pan key', () => {
    expect(panVector(['pause' as KeyActionId, 'panRight'])).toEqual([1, 0]);
  });

  /** Four directions, each a unit vector, no two of them the same. */
  it('is exactly the four directions', () => {
    const entries = Object.entries(PAN_OF_ACTION);
    expect(entries.length).toBe(4);
    const seen = new Set<string>();
    for (const [, direction] of entries) {
      expect(Math.hypot(direction![0], direction![1])).toBe(1);
      seen.add(`${direction![0]},${direction![1]}`);
    }
    expect(seen.size).toBe(4);
  });

  /**
   * The defect this whole bundle exists for: the camera had no key at all.
   * A pan action that resolves to no binding is that state coming back.
   */
  it('every camera action holds a key in the default scheme', () => {
    const resolved = resolveBindings({});
    for (const id of ['panUp', 'panDown', 'panLeft', 'panRight', 'zoomIn', 'zoomOut'] as const) {
      expect(KEY_ACTIONS.some((action) => action.id === id)).toBe(true);
      expect(resolved[id]).toBeDefined();
    }
    expect(resolved['panUp']).toBe('ArrowUp');
    expect(resolved['zoomIn']).toBe('+');
  });
});

describe('the zoom control', () => {
  it('reads back every step the map offers', () => {
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
      expect(zoomStepOf(ZOOM_LEVELS[i]!)).toBe(i);
    }
  });

  /**
   * The factor arrives as a float off the camera message. A lookup by equality
   * that missed would put the slider at zero - i.e. tell the player they are
   * zoomed all the way out while they are looking at a 4x map.
   */
  it('answers with the nearest step for a factor that is not exactly one', () => {
    expect(zoomStepOf(0.9999999)).toBe(2);
    expect(zoomStepOf(3.9)).toBe(ZOOM_LEVELS.length - 1);
    expect(zoomStepOf(0.01)).toBe(0);
    expect(zoomStepOf(99)).toBe(ZOOM_LEVELS.length - 1);
  });

  it('prints the default zoom as a hundred per cent', () => {
    expect(ZOOM_LEVELS[DEFAULT_ZOOM_INDEX]).toBe(1);
  });
});
