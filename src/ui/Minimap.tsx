import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import {
  MINIMAP_MODE_COUNT,
  MINIMAP_MODE_KEYS,
  MinimapMode,
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
  const [mode, setMode] = useState<MinimapMode>(MinimapMode.Terrain);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  if (mapBuffer === null || mapSize === 0) return null;

  const jump = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * mapSize);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * mapSize);
    if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return;
    centre(x, y);
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
      <canvas
        ref={canvasRef}
        className="minimap__canvas"
        style={{ maxWidth: PANEL_PX, maxHeight: PANEL_PX }}
        onClick={jump}
        aria-label={t('ui.minimap.title')}
      />
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
