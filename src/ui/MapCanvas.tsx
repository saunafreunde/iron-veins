import { useEffect, useRef, type ReactElement } from 'react';
import { MapView, type TileInfo, type VehicleAudioInput } from '../render/MapView';
import { COMPANY_COLORS } from '../shared/palette';
import { CommandKind, type Command } from '../sim/commands/types';
import { TileMap } from '../sim/map/TileMap';
import { SignalKind, signalKind } from '../sim/map/signals';
import { RailType } from '../sim/map/track';
import { inflatedCostCt } from '../sim/cargo/payment';
import { planTrack } from '../sim/net/trackBuilder';
import { AUTO_SIGNAL_SPACING_TILES, DEADLOCK_WARN_TICKS } from '../sim/constants';
import { ModuleKind } from '../sim/station/types';
import type { SimClient } from './SimClient';
import { audioEngine } from './audioBridge';
import { planConnection } from './connect';
import { nextSignalStep } from './signalCycle';
import { stationAtTile } from './TilePanel';
import { useSimStore, type Tool } from './store';

/**
 * How often the audio engine is told where things are. [ms]
 *
 * Not per frame: twelve voices retuned sixty times a second is work whose
 * result nobody can hear, and the engine needs to know roughly where a lorry
 * is, not where it is to the pixel.
 */
const AUDIO_REFRESH_MS = 120;

/** Reused between refreshes so a running game allocates nothing for sound. */
const audioScratch: VehicleAudioInput[] = [];

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
    case 'airstrip':
      return {
        kind: CommandKind.BuildAirport,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.Airstrip,
      };

    case 'airport':
      return {
        kind: CommandKind.BuildAirport,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.Airport,
      };

    case 'intlairport':
      return {
        kind: CommandKind.BuildAirport,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.InternationalAirport,
      };

    case 'quay':
      return {
        kind: CommandKind.BuildWaterStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.Quay,
      };

    case 'shipdepot':
      return {
        kind: CommandKind.BuildWaterStop,
        x: tile.x,
        y: tile.y,
        moduleKind: ModuleKind.ShipDepot,
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

    case 'demolish':
      return { kind: CommandKind.DemolishRoad, x: tile.x, y: tile.y };
    case 'road':
    case 'track':
    case 'connect':
    case 'signal':
    case 'pathsignal':
    case 'none':
      // Two-click tools and the signal cycle; the click handler drives them.
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
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const stations = useSimStore((s) => s.stations);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const tool = useSimStore((s) => s.tool);
  const trackPreview = useSimStore((s) => s.trackPreview);
  const connectPlan = useSimStore((s) => s.connectPlan);

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

      const planned = planTrack(
        map,
        anchor.x,
        anchor.y,
        tile.x,
        tile.y,
        RailType.Plain,
        state.assistant,
      );
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
        // What will actually be CHARGED, not what the table says: costs
        // inflate with the century (section 14.2), and a preview that showed
        // the raw constant would disagree with the bill - the exact frustration
        // section 17.3 exists to prevent.
        costCt: inflatedCostCt(planned.route.costCt, state.year, true),
        reasonKey: null,
      });
      view.setPreviewRoute(planned.route.tiles);
    };
    view.onSelect = (tile) => {
      const state = useSimStore.getState();
      state.setSelectedTile(tile);
      if (tile === null) return;

      /*
       * Connect: two clicks on two STATIONS, then a priced confirmation.
       *
       * This is the only build in the game that does not charge on the second
       * click. A line between two stations can cost more than a company has,
       * and the answer to "what will this cost me" has to arrive before the
       * money leaves - which is what the panel is for.
       */
      if (state.tool === 'connect') {
        const station = stationAtTile(state.stations, tile.x, tile.y);
        if (station === undefined) {
          state.setConnectPlan(null, 'ui.connect.notAStation');
          return;
        }
        if (state.connectAnchor === null) {
          state.setConnectAnchor(station.id);
          return;
        }
        const from = state.stations.find((entry) => entry.id === state.connectAnchor);
        const currentMap = mapRef.current;
        if (from === undefined || currentMap === null) {
          state.clearConnect();
          return;
        }
        const result = planConnection(currentMap, from, station, state.year, state.assistant);
        if (result.ok) {
          state.setConnectPlan(result.plan, null);
          view.setPreviewRoute(result.plan.tiles);
        } else {
          state.setConnectPlan(null, result.reasonKey);
          view.setPreviewRoute(null);
        }
        return;
      }

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
          assistant: state.assistant,
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

      /*
       * Signals: the first click places the two-way kind, and every further
       * click on the same tile cycles it - one-way per track direction, then
       * back to two-way. The simulation has no modify-signal command, so a
       * cycle step is a demolish and a rebuild, sent as a pair (D-126).
       */
      if (state.tool === 'signal' || state.tool === 'pathsignal') {
        const map = mapRef.current;
        if (map === null || !map.contains(tile.x, tile.y)) return;
        const index = map.tileIndex(tile.x, tile.y);
        const packed = map.signal[index]!;
        const step = nextSignalStep(packed, map.trackBits[index]!, state.tool);
        if (signalKind(packed) !== SignalKind.None) {
          client.send({ kind: CommandKind.DemolishSignal, x: tile.x, y: tile.y });
        }
        client.send({
          kind: CommandKind.BuildSignal,
          x: tile.x,
          y: tile.y,
          signalKind: step.kind,
          direction: step.direction,
        });
        return;
      }

      const command = commandForClick(state.tool, tile);
      if (command !== null) client.send(command);
    };

    // Clicking a vehicle selects it (owed since M2). The renderer decides
    // whether a click hit one; what that MEANS is decided here.
    view.onSelectVehicle = (vehicleId) => {
      useSimStore.getState().setSelectedVehicle(vehicleId);
    };

    // A list row jumps to what it names (section 17.1).
    useSimStore.getState().setCentreOnTile((x, y) => view.centreOnTile(x, y));
    view.setVehicleSource(() => client.readVehicles());
    view.setReservedSource(() => client.readReserved());
    void view.attach(host);

    /**
     * Feed the audio engine, once every few frames.
     *
     * Not every frame: twelve voices retuned sixty times a second is work
     * nobody can hear the result of, and the engine only needs to know where
     * things are, not where they are to the pixel.
     */
    const audioTimer = window.setInterval(() => {
      const engine = audioEngine();
      if (engine === null) return;
      const written = view.vehicleAudioInputs(audioScratch);
      engine.setVehicles(audioScratch.slice(0, written));
    }, AUDIO_REFRESH_MS);

    return () => {
      window.clearInterval(audioTimer);
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
    // Esc, the cancel button and every tool change disarm through the store;
    // the preview line lives in the view and has to follow, or a cancelled
    // plan keeps its green route on the map for ever.
    if (trackPreview === null && connectPlan === null) {
      viewRef.current?.setPreviewRoute(null);
    }
  }, [tool, trackPreview, connectPlan]);

  useEffect(() => {
    viewRef.current?.setSelectedVehicle(selectedVehicleId);
  }, [selectedVehicleId]);

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
