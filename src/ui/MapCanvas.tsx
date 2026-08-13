import { useEffect, useRef, type ReactElement } from 'react';
import {
  MapView,
  type StationAmbienceInput,
  type TileInfo,
  type VehicleAudioInput,
} from '../render/MapView';
import { COMPANY_COLORS } from '../shared/palette';
import { CommandKind, type Command } from '../sim/commands/types';
import { TileMap } from '../sim/map/TileMap';
import { SignalKind, signalKind } from '../sim/map/signals';
import { RailType } from '../sim/map/track';
import { economyCostCt } from '../sim/economy/curve';
import { planRoadStop, RoadStopShape } from '../sim/net/roadBuilder';
import { planTrack } from '../sim/net/trackBuilder';
import { AUTO_SIGNAL_SPACING_TILES, DEADLOCK_WARN_TICKS } from '../sim/constants';
import { catchmentAfterPlacing, joinTargetIdFor, ModuleKind } from '../sim/station/types';
import type { SimClient } from './SimClient';
import { audioEngine } from './audioBridge';
import { planConnection } from './connect';
import { nextSignalStep } from './signalCycle';
import { stationAtTile } from './TilePanel';
import { computeEditorOverlay } from './editor/overlays';
import { commandForEditorTool } from './editor/tools';
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
/** The same, for the station ambience beds of SPEC2 M25. */
const ambienceScratch: StationAmbienceInput[] = [];

/**
 * Which module a station tool places - the SPEC2 M14 catchment preview needs
 * the kind before the click, because a quay is left out of the D-095 centre.
 * Kept in step with `commandForClick` below; tools missing here build no
 * station module and preview no catchment.
 */
const MODULE_TOOL_KINDS: Partial<Record<Tool, ModuleKind>> = {
  stop: ModuleKind.BusStop,
  depot: ModuleKind.RoadDepot,
  platform: ModuleKind.RailPlatform,
  raildepot: ModuleKind.RailDepot,
  airstrip: ModuleKind.Airstrip,
  airport: ModuleKind.Airport,
  intlairport: ModuleKind.InternationalAirport,
  quay: ModuleKind.Quay,
  shipdepot: ModuleKind.ShipDepot,
  freightterminal: ModuleKind.FreightTerminal,
  canopy: ModuleKind.Canopy,
  coldstore: ModuleKind.ColdStore,
};

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

    case 'waypoint':
      // The sim decides what the marker becomes - a post on rail, a buoy on
      // water, a sign on a road - from what the tile carries (section 12.1).
      return { kind: CommandKind.BuildWaypoint, x: tile.x, y: tile.y };

    case 'demolish':
    case 'road':
    case 'track':
    case 'connect':
    case 'signal':
    case 'pathsignal':
    case 'none':
      // Two-click tools, the signal cycle and the demolish routing; the click
      // handler drives them, because they need to read the map.
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
  const showFlow = useSimStore((s) => s.showFlow);
  const showHeat = useSimStore((s) => s.showHeat);
  const fleet = useSimStore((s) => s.fleet);
  const mapSize = useSimStore((s) => s.mapSize);
  const towns = useSimStore((s) => s.towns);
  const industries = useSimStore((s) => s.industries);
  const mapRevision = useSimStore((s) => s.mapRevision);
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const followVehicleId = useSimStore((s) => s.followVehicleId);
  const stations = useSimStore((s) => s.stations);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const tool = useSimStore((s) => s.tool);
  const trackPreview = useSimStore((s) => s.trackPreview);
  const connectPlan = useSimStore((s) => s.connectPlan);
  const roadStopPreview = useSimStore((s) => s.roadStopPreview);
  const dayNight = useSimStore((s) => s.settings.dayNight);
  const colorBlind = useSimStore((s) => s.settings.colorBlind);
  const reducedMotion = useSimStore((s) => s.settings.reducedMotion);
  const editorOverlay = useSimStore((s) => s.editorOverlay);
  const month = useSimStore((s) => s.month);
  const year = useSimStore((s) => s.year);
  const climate = useSimStore((s) => s.climate);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const view = new MapView();
    viewRef.current = view;

    view.onHover = (tile) => {
      const state = useSimStore.getState();
      state.setHoveredTile(tile);

      // The M14 catchment preview: while a station-module tool hovers, show
      // the circle the station WOULD serve - centre and radius from the same
      // D-095 rules the build applies (station/types.ts), fed with the same
      // join answer, so the preview and the outcome cannot disagree.
      const moduleKind = MODULE_TOOL_KINDS[state.tool];
      if (moduleKind !== undefined && tile !== null) {
        const joinId = joinTargetIdFor(state.stations, 0, tile.x, tile.y);
        const joined =
          joinId < 0 ? undefined : state.stations.find((station) => station.id === joinId);
        view.setCatchmentPreview(
          catchmentAfterPlacing(joined?.modules ?? [], moduleKind, tile.x, tile.y),
        );
      } else {
        view.setCatchmentPreview(null);
      }

      // Live build preview: planned on the main thread with the same planner
      // the command uses, so the numbers shown and the numbers charged are the
      // same by construction.
      const map = mapRef.current;

      /*
       * The D-210 road-stop preview: WHAT will be built and WHAT it will cost,
       * before the click. `planRoadStop` is the function `buildRoadStop`
       * itself runs, on the same shared map, so the driveway drawn here is the
       * driveway that gets laid and the figure shown is the figure charged
       * (D-119). Company 0 is the player, as everywhere else on this thread.
       */
      if ((state.tool === 'stop' || state.tool === 'depot') && tile !== null && map !== null) {
        const kind = state.tool === 'stop' ? ModuleKind.BusStop : ModuleKind.RoadDepot;
        const plan = planRoadStop(map, 0, tile.x, tile.y, kind);
        const bay = plan.shape === RoadStopShape.Bay;
        state.setRoadStopPreview({
          costCt:
            plan.reasonKey === null
              ? economyCostCt(plan.costCt, state.year, true, state.economyCurve)
              : 0,
          bay,
          reasonKey: plan.reasonKey,
        });
        // Two tiles: the module and the road it will attach to. The overlay
        // draws the same green line the track preview uses, so the player sees
        // which side the throat comes out of.
        view.setPreviewRoute(bay ? [map.tileIndex(tile.x, tile.y), plan.spurTile] : null);
      } else if (state.roadStopPreview !== null) {
        state.setRoadStopPreview(null);
      }

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
        // ... and with the century of SPEC2 M21 in it, through the very
        // function `World.costCt` charges through.
        costCt: economyCostCt(planned.route.costCt, state.year, true, state.economyCurve),
        reasonKey: null,
      });
      view.setPreviewRoute(planned.route.tiles);
    };
    view.onSelect = (tile) => {
      const state = useSimStore.getState();
      state.setSelectedTile(tile);
      if (tile === null) return;

      /*
       * The scenario workshop (SPEC2 M22). Checked FIRST and answered whole:
       * while a workshop tool is armed the map belongs to the palette, and a
       * click that fell through to the build tools would lay a road across the
       * ridge the author is shaping. `commandForEditorTool` is the ONE place
       * any of the five workshop kinds is built.
       */
      if (state.editorMode && state.editorTool !== 'none') {
        const command = commandForEditorTool(state.editorTool, tile.x, tile.y, {
          radius: state.editorRadius,
          townSize: state.editorTownSize,
          industryType: state.editorIndustryType,
        });
        if (command !== null) client.send(command);
        return;
      }

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
        const result = planConnection(
          currentMap,
          from,
          station,
          state.year,
          state.assistant,
          state.economyCurve,
        );
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
      /*
       * Demolish: what the click removes is what stands on the tile. Track,
       * signals and town buildings have commands of their own - the tool used
       * to send DemolishRoad no matter what, which left DemolishTrack and
       * DemolishBuilding unreachable from the interface. The coupling test in
       * tests/unit/commandCoupling.spec.ts is what noticed, and what keeps it
       * from happening to the next command kind.
       */
      if (state.tool === 'demolish') {
        const map = mapRef.current;
        if (map === null || !map.contains(tile.x, tile.y)) return;
        const index = map.tileIndex(tile.x, tile.y);
        if (map.waypoint[index]! !== 0) {
          client.send({ kind: CommandKind.DemolishWaypoint, x: tile.x, y: tile.y });
        } else if (signalKind(map.signal[index]!) !== SignalKind.None) {
          client.send({ kind: CommandKind.DemolishSignal, x: tile.x, y: tile.y });
        } else if (map.trackBits[index]! !== 0) {
          client.send({ kind: CommandKind.DemolishTrack, x: tile.x, y: tile.y });
        } else if (map.buildingKind[index]! !== 0) {
          client.send({ kind: CommandKind.DemolishBuilding, x: tile.x, y: tile.y });
        } else {
          client.send({ kind: CommandKind.DemolishRoad, x: tile.x, y: tile.y });
        }
        return;
      }

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
    // The follow camera hands the wheel back on a manual pan or a list jump
    // (SPEC2 M14) - the view clears itself and tells the store, so the
    // detail panel's button state stays honest.
    view.onFollowEnd = () => {
      useSimStore.getState().setFollowVehicle(null);
    };

    // A list row jumps to what it names (section 17.1).
    useSimStore.getState().setCentreOnTile((x, y) => view.centreOnTile(x, y));
    // The minimap's viewport outline follows the camera (SPEC2 M12). The
    // view publishes only when the camera actually moved, so an idle game
    // writes nothing into the store.
    view.onCamera = (camera) => useSimStore.getState().setCamera(camera);
    // Tagged with generation, tick and rate: the renderer's E-05 interpolator
    // copies the block when the generation moves and lerps between the copies.
    view.setVehicleSource(() => client.readVehicleFrame());
    view.setReservedSource(() => client.readReserved());
    // The M14 flow atlas reads the published FlowMarker block (D-176); its
    // drawn/omitted counts feed the honest "x weitere" indicator. The same
    // reader is registered in the store for the minimap's Fluss mode - the
    // painter there stays pure, the panel gathers (D-112).
    view.setFlowSource(() => client.readFlow());
    view.onFlowStats = (drawn, omitted) => useSimStore.getState().setFlowStats(drawn, omitted);
    useSimStore.getState().setFlowSource(() => client.readFlow());
    // The day/night curve reads the published tick, never the wall clock.
    view.setTickSource(() => client.readTick());
    // The M18 weather field: rain and snow are a pure function of the 256
    // published cells plus the render frame counter (E-01, Fehlerkatalog 39).
    view.setWeatherSource(() => client.readWeather());
    view.setDayNight(useSimStore.getState().settings.dayNight);
    view.setColorBlind(useSimStore.getState().settings.colorBlind);
    view.setReducedMotion(useSimStore.getState().settings.reducedMotion);
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
      // The world's mood BEFORE the beds, or the first refresh after a load
      // would play yesterday's hour: both are pure functions of published
      // fields (D-202's climate, D-172's day curve), so this is Z1's pixel
      // side throughout and the simulation is never asked.
      engine.setWorldMood(view.audioClimate(), view.audioDayPhase());
      const written = view.vehicleAudioInputs(audioScratch);
      engine.setVehicles(audioScratch.slice(0, written));
      const stations = view.stationAmbienceInputs(ambienceScratch);
      engine.setStations(ambienceScratch.slice(0, stations));
      engine.updateMusic();
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
    if (trackPreview === null && connectPlan === null && roadStopPreview === null) {
      viewRef.current?.setPreviewRoute(null);
    }
    // The catchment circle likewise: switching away from a module tool must
    // not leave the last hover's circle standing (next hover would never
    // clear it if the pointer has left the map).
    if (MODULE_TOOL_KINDS[tool] === undefined) {
      viewRef.current?.setCatchmentPreview(null);
    }
  }, [tool, trackPreview, connectPlan, roadStopPreview]);

  useEffect(() => {
    viewRef.current?.setSelectedVehicle(selectedVehicleId);
  }, [selectedVehicleId]);

  useEffect(() => {
    viewRef.current?.setFollowVehicle(followVehicleId);
  }, [followVehicleId]);

  useEffect(() => {
    // A followed vehicle that left the world (sold, renewed, wound up) stops
    // steering the camera; the fleet cadence is when the interface learns.
    if (followVehicleId === null) return;
    if (!fleet.some((vehicle) => vehicle.id === followVehicleId)) {
      useSimStore.getState().setFollowVehicle(null);
    }
  }, [fleet, followVehicleId]);

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
    viewRef.current?.setFlowOverlay(showFlow);
  }, [showFlow]);

  useEffect(() => {
    viewRef.current?.setHeatOverlay(showHeat);
  }, [showHeat]);

  useEffect(() => {
    viewRef.current?.setDayNight(dayNight);
  }, [dayNight]);

  // The two accessibility settings of SPEC2 M25, each on its own effect for
  // the reason the day/night one is: a volume slider must not repaint the map.
  useEffect(() => {
    viewRef.current?.setColorBlind(colorBlind);
  }, [colorBlind]);

  useEffect(() => {
    viewRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    /*
     * The workshop's debug overlays (SPEC2 M22), recomputed - never stored.
     *
     * The dependency list IS the statement that the field is a pure function
     * of the world: which overlay, the map (through its revision), the climate
     * and the stations. Nothing here is remembered between runs, no buffer is
     * reused across a change of overlay, and the view is handed a fresh array
     * so its identity check is exact.
     */
    const view = viewRef.current;
    const map = mapRef.current;
    if (view === null) return;
    if (editorOverlay === null || map === null) {
      view.setEditorOverlay(null);
      return;
    }
    view.setEditorOverlay(
      computeEditorOverlay(
        editorOverlay,
        map,
        climate,
        stations.map((station) => ({
          x: station.x,
          y: station.y,
          moduleCount: station.modules.length,
        })),
      ),
    );
  }, [editorOverlay, mapRevision, mapBuffer, climate, stations]);

  useEffect(() => {
    // The seasonal optics of SPEC2 M18: the published month crossed with the
    // world's climate, pushed once a game month rather than read per frame.
    // What the view does with it - repaint the atlas, move the snow line - is
    // debounced and asynchronous (D-202).
    // The YEAR joins them in SPEC2 M23: it chooses the town-building era, and
    // it comes out of the same published calendar - so a save started in 1950
    // and loaded at a 2049 tick shows 2049 architecture on the first message,
    // with no saved render state anywhere in the path.
    viewRef.current?.setSeason(month, climate, year);
  }, [month, year, climate]);

  useEffect(() => {
    // The deadlock markers of section 9.3. The clock lives per vehicle in the
    // simulation; nothing else surfaces it until the news log of M8.
    //
    // Since SPEC2 M15 the marker set is the train AND the tile refusing it:
    // in a deadlock ring every participant blinks together with the piece of
    // track it is waiting for, which is what turns "these trains are stuck"
    // into a picture of the ring the news message names (D-186).
    const stuck: number[] = [];
    for (const vehicle of fleet) {
      if (vehicle.waitingTicks < DEADLOCK_WARN_TICKS) continue;
      stuck.push(vehicle.tileIndex);
      if (vehicle.blockedTile >= 0) stuck.push(vehicle.blockedTile);
    }
    viewRef.current?.setDeadlockTiles(stuck);
    // The renderer reads two facts per vehicle from these markers: its
    // catalogue entry, which picks the baked sprite, and - for a train -
    // its full composition, which the consist rendering places wagon by
    // wagon (SPEC2 M13, E-05's marker channel - never the 20 Hz stride).
    viewRef.current?.setFleet(fleet);
  }, [fleet]);

  return <div className="mapcanvas" ref={hostRef} />;
}
