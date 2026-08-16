import type { ReactElement } from 'react';
import { t } from '../i18n';
import { DEFAULT_ZOOM_INDEX, ZOOM_LEVELS } from '../render/MapView';
import { useSimStore } from './store';

/**
 * The zoom, as a control a player can see.
 *
 * The map has had five zoom steps since M1 and exactly one way to reach them:
 * the mouse wheel. A wheel is invisible - nothing on screen says the steps
 * exist, nothing says which one is in force, and a trackpad or a touch screen
 * may not produce the event at all. This is that state made visible and
 * reachable, and it writes through `cameraControl` so the slider, the wheel and
 * the keys are three doors to ONE number (the view's `zoomIndex`).
 *
 * **Five steps and not a continuous slider**, which is the one thing here worth
 * arguing about. The zoom is not a scale factor the renderer applies to a
 * finished picture: each step picks an atlas page, decides whether the world is
 * drawn from sprites or from baked chunks, and keys the chunk textures
 * themselves (D-161, D-163). A slider between the steps would ask for artwork
 * that does not exist. So the control is a stepped one, and it prints the
 * percentage each step really is.
 */
export function ZoomControl(): ReactElement {
  useSimStore((s) => s.locale);
  const camera = useSimStore((s) => s.camera);
  const control = useSimStore((s) => s.cameraControl);

  // Where the camera IS comes from the view, never from local state: the wheel
  // and the keys move the same number, and a control holding its own copy
  // would drift away from them the first time either was used.
  const index = camera === null ? DEFAULT_ZOOM_INDEX : zoomStepOf(camera.zoom);
  const percent = Math.round(ZOOM_LEVELS[index]! * 100);
  const label = t('ui.zoom.percent', { percent });

  return (
    <div className="zoomctl" role="group" aria-label={t('ui.zoom.label')}>
      <button
        type="button"
        className="zoomctl__button"
        onClick={() => control?.zoomBy(-1)}
        disabled={control === null || index === 0}
        aria-label={t('ui.zoom.out')}
      >
        −
      </button>
      <input
        type="range"
        className="zoomctl__slider"
        min={0}
        max={ZOOM_LEVELS.length - 1}
        step={1}
        value={index}
        onChange={(event) => control?.setZoomStep(Number(event.target.value))}
        disabled={control === null}
        aria-label={t('ui.zoom.label')}
        aria-valuetext={label}
      />
      <button
        type="button"
        className="zoomctl__button"
        onClick={() => control?.zoomBy(1)}
        disabled={control === null || index === ZOOM_LEVELS.length - 1}
        aria-label={t('ui.zoom.in')}
      >
        +
      </button>
      <span className="zoomctl__value">{label}</span>
    </div>
  );
}

/**
 * Which step a zoom factor is.
 *
 * The nearest one rather than an index lookup: the factor arrives as a float
 * off the camera message, and a step that failed to match would put the slider
 * at zero - i.e. tell the player they are zoomed all the way out while they
 * are not.
 */
export function zoomStepOf(zoom: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    const distance = Math.abs(ZOOM_LEVELS[i]! - zoom);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = i;
  }
  return best;
}
