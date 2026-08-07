import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { t } from '../i18n';
import {
  MINIMAP_MODE_COUNT,
  MINIMAP_MODE_KEYS,
  MinimapMode,
  minimapViewQuad,
  paintMinimap,
  type MinimapMarkers,
} from '../render/Minimap';
import { TileMap } from '../sim/map/TileMap';
import { useSimStore } from './store';

/**
 * The minimap panel of section 17.1, bottom right.
 *
 * Repainted only when the ground changes - the map revision is exactly that
 * signal, and it is why the renderer has carried one since M1. A minimap
 * repainted per frame would cost more than the map itself.
 */

/** Largest edge the panel draws at. A 2048 map is scaled down to fit. */
const PANEL_PX = 220;

export function Minimap(): ReactElement | null {
  useSimStore((s) => s.locale);
  const mapBuffer = useSimStore((s) => s.mapBuffer);
  const mapSize = useSimStore((s) => s.mapSize);
  const revision = useSimStore((s) => s.mapRevision);
  const colorBlind = useSimStore((s) => s.settings.colorBlind);
  const stations = useSimStore((s) => s.stations);
  const industries = useSimStore((s) => s.industries);
  const centre = useSimStore((s) => s.centreOnTile);
  const camera = useSimStore((s) => s.camera);
  // In the store rather than local state, so the N key of section 17.2 and
  // the buttons here drive one and the same value.
  const mode = useSimStore((s) => s.minimapMode);
  const setMode = useSimStore((s) => s.setMinimapMode);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef<Uint8ClampedArray<ArrayBuffer> | null>(null);

  // Rebuilt only when the lists move: the paint callback depends on it, and a
  // fresh object every render would repaint the whole map every render.
  const markers: MinimapMarkers = useMemo(
    () => ({
      stationTiles: stations.map((station) => station.y * mapSize + station.x),
      stationWaiting: stations.map((station) => station.waiting),
      industryTiles: industries.map((industry) => industry.y * mapSize + industry.x),
      industryLevels: industries.map((industry) => industry.level),
    }),
    [stations, industries, mapSize],
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || mapBuffer === null || mapSize === 0) return;

    const map = TileMap.fromBuffer(mapSize, mapBuffer);
    const needed = mapSize * mapSize * 4;
    if (pixelsRef.current === null || pixelsRef.current.length !== needed) {
      // Backed by a plain ArrayBuffer on purpose: ImageData refuses a view on
      // a SharedArrayBuffer, and a fresh Uint8ClampedArray(n) is the only way
      // to be sure which kind TypeScript thinks it has.
      pixelsRef.current = new Uint8ClampedArray(new ArrayBuffer(needed));
    }
    paintMinimap(map, mode, pixelsRef.current, { colorBlind, markers });

    canvas.width = mapSize;
    canvas.height = mapSize;
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.putImageData(new ImageData(pixelsRef.current, mapSize, mapSize), 0, 0);
  }, [mapBuffer, mapSize, mode, colorBlind, revision, markers]);

  useEffect(() => {
    paint();
  }, [paint]);

  /**
   * The viewport outline (SPEC2 M12), on its OWN canvas above the bitmap.
   *
   * The camera moves every pan frame; the megapixel below it does not. Two
   * stacked canvases mean the outline redraws alone - and they are also
   * what keeps D-112 honest: `paintMinimap` never hears of the camera, so
   * the save thumbnail is a picture of the world, not of the interface.
   */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay === null || mapSize === 0) return;
    if (overlay.width !== mapSize) {
      overlay.width = mapSize;
      overlay.height = mapSize;
    }
    const context = overlay.getContext('2d');
    if (context === null) return;
    context.clearRect(0, 0, mapSize, mapSize);
    if (camera === null) return;

    const quad = minimapViewQuad(camera);
    context.beginPath();
    for (let i = 0; i < quad.length; i++) {
      const corner = quad[i]!;
      if (i === 0) context.moveTo(corner.x, corner.y);
      else context.lineTo(corner.x, corner.y);
    }
    context.closePath();
    // Stroke widths are in TILE pixels; the canvas is displayed at up to
    // PANEL_PX, so scale them so the outline is ~2 css px with a dark halo
    // on every map size.
    const scale = Math.max(1, mapSize / PANEL_PX);
    context.strokeStyle = 'rgba(10, 14, 18, 0.9)';
    context.lineWidth = 3 * scale;
    context.stroke();
    context.strokeStyle = 'rgba(240, 244, 248, 0.95)';
    context.lineWidth = 1.5 * scale;
    context.stroke();
  }, [camera, mapSize]);

  if (mapBuffer === null || mapSize === 0) return null;

  const jumpTo = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Clamped, not ignored: a drag that leaves the panel pins the camera to
    // the map edge instead of freezing mid-gesture.
    const x = Math.min(
      mapSize - 1,
      Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * mapSize)),
    );
    const y = Math.min(
      mapSize - 1,
      Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * mapSize)),
    );
    centre(x, y);
  };

  // Drag-to-pan (SPEC2 M12): the pointer capture makes the drag one
  // gesture - press jumps, moving drags the camera, release lets go, and
  // leaving the panel mid-drag changes nothing.
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    jumpTo(event);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    jumpTo(event);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className="panel minimap">
      <div className="button-row">
        {Array.from({ length: MINIMAP_MODE_COUNT }, (_unused, index) => (
          <button
            key={index}
            type="button"
            className={index === mode ? 'button button--active' : 'button'}
            onClick={() => setMode(index as MinimapMode)}
          >
            {t(MINIMAP_MODE_KEYS[index] ?? '')}
          </button>
        ))}
      </div>
      <div className="minimap__frame" style={{ maxWidth: PANEL_PX, maxHeight: PANEL_PX }}>
        <canvas ref={canvasRef} className="minimap__canvas" aria-hidden="true" />
        <canvas
          ref={overlayRef}
          className="minimap__viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={t('ui.minimap.title')}
        />
      </div>
    </section>
  );
}

/**
 * A small picture of the world, as a data URL, for the save screen.
 *
 * The same painter as the panel, at a size a save file can carry: a 1024 map
 * as a full-size PNG would be most of a megabyte inside every save, and the
 * load screen shows it two centimetres wide.
 */
export function captureThumbnail(width = 160): string {
  const state = useSimStore.getState();
  if (state.mapBuffer === null || state.mapSize === 0) return '';

  const map = TileMap.fromBuffer(state.mapSize, state.mapBuffer);
  const pixels = new Uint8ClampedArray(state.mapSize * state.mapSize * 4);
  paintMinimap(map, MinimapMode.Terrain, pixels, { colorBlind: state.settings.colorBlind });

  const full = document.createElement('canvas');
  full.width = state.mapSize;
  full.height = state.mapSize;
  const context = full.getContext('2d');
  if (context === null) return '';
  context.putImageData(new ImageData(pixels, state.mapSize, state.mapSize), 0, 0);

  const small = document.createElement('canvas');
  small.width = width;
  small.height = width;
  const target = small.getContext('2d');
  if (target === null) return '';
  target.drawImage(full, 0, 0, width, width);
  return small.toDataURL('image/png');
}
