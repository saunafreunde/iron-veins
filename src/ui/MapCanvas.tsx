import { useEffect, useRef, type ReactElement } from 'react';
import { MapView, type TileInfo } from '../render/MapView';
import { COMPANY_COLORS } from '../shared/palette';
import { CommandKind, type Command } from '../sim/commands/types';
import { TileMap } from '../sim/map/TileMap';
import { SignalKind } from '../sim/map/signals';
import { RailType, TrackDir } from '../sim/map/track';
import { planTrack } from '../sim/net/trackBuilder';
import { AUTO_SIGNAL_SPACING_TILES, DEADLOCK_WARN_TICKS } from '../sim/constants';
import { ModuleKind } from '../sim/station/types';
import type { SimClient } from './SimClient';
import { useSimStore, type Tool } from './store';

/**
 * Hosts the PixiJS map view inside the React tree.
 *
 * The view itself is not a React component: it owns a WebGL context and a
 * sprite pool that must survive re-renders. React only mounts it, hands it the
 * shared map buffer and forwards its hover and click events into the store.
 */

/**
 * Turn a click into a command.
 *
 * The road tool is the one that needs two clicks - the first sets an anchor,
 * the second builds the run - so it reports back whether it consumed the click
 * or is still waiting for the second one.
 */
/** Which signal the two signal tools place. */
function signalKindFor(tool: Tool): number {
  return tool === 'pathsignal' ? SignalKind.Path : SignalKind.Block;
}

function commandForClick(tool: Tool, tile: TileInfo): Command | null {
  switch (tool) {
    case 'raise':
      return { kind: CommandKind.RaiseLand, x: tile.x, y: tile.y };
    case 'lower':
      return { kind: CommandKind.LowerLand, x: tile.x, y: tile.y };
    case 'level':
      return { kind: CommandKind.LevelLand, x: tile.x, y: tile.y };
    case 'stop':
      return {
        kind: CommandKind.BuildRoadStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.BusStop,
      };
    case 'depot':
      return {
        kind: CommandKind.BuildRoadStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.RoadDepot,
      };
    case 'platform':
      return {
        kind: CommandKind.BuildRailStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.RailPlatform,
      };
    case 'raildepot':
      return {
        kind: CommandKind.BuildRailStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.RailDepot,
      };
    case 'freightterminal':
      return {
        kind: CommandKind.BuildStationModule,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.FreightTerminal,
      };

    case 'canopy':
      return {
        kind: CommandKind.BuildStationModule,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.Canopy,
      };

    case 'coldstore':
      return {
        kind: CommandKind.BuildStationModule,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.ColdStore,
      };

    case 'signal':
      return {
        kind: CommandKind.BuildSignal,
        x: tile.x,
        y: tile.y,
        signalKind: signalKindFor(tool),
        direction: TrackDir.East,
      };
    case 'pathsignal':
      return {
        kind: CommandKind.BuildSignal,
        x: tile.x,
        y: tile.y,
        signalKind: signalKindFor(tool),
        direction: TrackDir.East,
      };
    case 'demolish':
      return { kind: CommandKind.DemolishRoad, x: tile.x, y: tile.y };
    case 'road':
    case 'track':
    case 'none':
      // Two-click tools; the click handler drives them directly.
      return null;
  }
}

export function MapCanvas({ client }: { readonly client: SimClient }): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  /** Read-only view on the shared map, used for the build preview. */
  const mapRef = useRef<TileMap | null>(null);

  const mapBuffer = useSimStore((s) => s.mapBuffer);
  const showDebug = useSimStore((s) => s.showDebug);
  const fleet = useSimStore((s) => s.fleet);
  const mapSize = useSimStore((s) => s.mapSize);
  const towns = useSimStore((s) => s.towns);
  const industries = useSimStore((s) => s.industries);
  const mapRevision = useSimStore((s) => s.mapRevision);
  const stations = useSimStore((s) => s.stations);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const view = new MapView();
    viewRef.current = view;

    view.onHover = (tile) => {
      const state = useSimStore.getState();
      state.setHoveredTile(tile);

      // Live build preview: planned on the main thread with the same planner
      // the command uses, so the numbers shown and the numbers charged are the
      // same by construction.
      const map = mapRef.current;
      const anchor = state.roadAnchor;
      if (state.tool !== 'track' || tile === null || anchor === null || map === null) {
        if (state.trackPreview !== null) {
          state.setTrackPreview(null);
          view.setPreviewRoute(null);
        }
        return;
      }

      const planned = planTrack(map, anchor.x, anchor.y, tile.x, tile.y, RailType.Plain, true);
      if (!planned.ok) {
        state.setTrackPreview({
          tiles: [],
          lengthM: 0,
          minRadiusM: 0,
          maxGradePermille: 0,
          maxSpeedMs: 0,
          costCt: 0,
          reasonKey: planned.reasonKey,
        });
        view.setPreviewRoute(null);
        return;
      }

      state.setTrackPreview({
        tiles: planned.route.tiles,
        lengthM: planned.route.geometry.lengthM,
        minRadiusM: planned.route.geometry.minRadiusM,
        maxGradePermille: planned.route.geometry.maxGradePermille,
        maxSpeedMs: planned.route.geometry.maxSpeedMs,
        costCt: planned.route.costCt,
        reasonKey: null,
      });
      view.setPreviewRoute(planned.route.tiles);
    };
    view.onSelect = (tile) => {
      const state = useSimStore.getState();
      state.setSelectedTile(tile);
      if (tile === null) return;

      if (state.tool === 'track') {
        const anchor = state.roadAnchor;
        if (anchor === null) {
          state.setRoadAnchor({ x: tile.x, y: tile.y });
          return;
        }
        client.send({
          kind: CommandKind.BuildTrack,
          x1: anchor.x,
          y1: anchor.y,
          x2: tile.x,
          y2: tile.y,
          railType: RailType.Plain,
          assistant: true,
          signalSpacing: state.autoSignal ? AUTO_SIGNAL_SPACING_TILES : 0,
        });
        state.setRoadAnchor(null);
        view.setPreviewRoute(null);
        return;
      }

      if (state.tool === 'road') {
        // Two clicks: anchor, then the far end of the run.
        const anchor = state.roadAnchor;
        if (anchor === null) {
          state.setRoadAnchor({ x: tile.x, y: tile.y });
          return;
        }
        client.send({
          kind: CommandKind.BuildRoad,
          x1: anchor.x,
          y1: anchor.y,
          x2: tile.x,
          y2: tile.y,
        });
        state.setRoadAnchor(null);
        return;
      }

      const command = commandForClick(state.tool, tile);
      if (command !== null) client.send(command);
    };

    view.setVehicleSource(() => client.readVehicles());
    view.setReservedSource(() => client.readReserved());
    void view.attach(host);

    return () => {
      viewRef.current = null;
      view.dispose();
    };
  }, [client]);

  useEffect(() => {
    if (mapBuffer === null || viewRef.current === null) return;
    const map = TileMap.fromBuffer(mapSize, mapBuffer);
    mapRef.current = map;
    viewRef.current.setMap(map, towns, industries);
  }, [mapBuffer, mapSize, towns, industries]);

  useEffect(() => {
    viewRef.current?.setMapRevision(mapRevision);
  }, [mapRevision]);

  useEffect(() => {
    viewRef.current?.setStations(stations);
  }, [stations]);

  useEffect(() => {
    const hex = COMPANY_COLORS[companyColorIndex] ?? '#f08020';
    viewRef.current?.setCompanyColor(Number.parseInt(hex.slice(1), 16));
  }, [companyColorIndex]);

  useEffect(() => {
    viewRef.current?.setBlockOverlay(showDebug);
  }, [showDebug]);

  useEffect(() => {
    // The deadlock markers of section 9.3. The clock lives per vehicle in the
    // simulation; nothing else surfaces it until the news log of M8.
    const stuck = fleet
      .filter((vehicle) => vehicle.waitingTicks >= DEADLOCK_WARN_TICKS)
      .map((vehicle) => vehicle.tileIndex);
    viewRef.current?.setDeadlockTiles(stuck);
  }, [fleet]);

  return <div className="mapcanvas" ref={hostRef} />;
}
