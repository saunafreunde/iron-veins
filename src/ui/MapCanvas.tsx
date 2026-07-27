import { useEffect, useRef, type ReactElement } from 'react';
import { MapView, type TileInfo } from '../render/MapView';
import { CommandKind } from '../sim/commands/types';
import { TileMap } from '../sim/map/TileMap';
import type { SimClient } from './SimClient';
import { useSimStore, type Tool } from './store';

/**
 * Hosts the PixiJS map view inside the React tree.
 *
 * The view itself is not a React component: it owns a WebGL context and a
 * sprite pool that must survive re-renders. React only mounts it, hands it the
 * shared map buffer and forwards its hover and click events into the store.
 */

/** Which command a tool sends. `none` just selects. */
function commandFor(tool: Tool, tile: TileInfo) {
  switch (tool) {
    case 'raise':
      return { kind: CommandKind.RaiseLand, x: tile.x, y: tile.y } as const;
    case 'lower':
      return { kind: CommandKind.LowerLand, x: tile.x, y: tile.y } as const;
    case 'level':
      return { kind: CommandKind.LevelLand, x: tile.x, y: tile.y } as const;
    case 'none':
      return null;
  }
}

export function MapCanvas({ client }: { readonly client: SimClient }): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);

  const mapBuffer = useSimStore((s) => s.mapBuffer);
  const mapSize = useSimStore((s) => s.mapSize);
  const towns = useSimStore((s) => s.towns);
  const industries = useSimStore((s) => s.industries);
  const mapRevision = useSimStore((s) => s.mapRevision);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const view = new MapView();
    viewRef.current = view;

    view.onHover = (tile) => useSimStore.getState().setHoveredTile(tile);
    view.onSelect = (tile) => {
      const state = useSimStore.getState();
      state.setSelectedTile(tile);
      if (tile === null) return;
      const command = commandFor(state.tool, tile);
      if (command !== null) client.send(command);
    };

    void view.attach(host);

    return () => {
      viewRef.current = null;
      view.dispose();
    };
  }, [client]);

  useEffect(() => {
    if (mapBuffer === null || viewRef.current === null) return;
    viewRef.current.setMap(TileMap.fromBuffer(mapSize, mapBuffer), towns, industries);
  }, [mapBuffer, mapSize, towns, industries]);

  useEffect(() => {
    viewRef.current?.setMapRevision(mapRevision);
  }, [mapRevision]);

  return <div className="mapcanvas" ref={hostRef} />;
}
