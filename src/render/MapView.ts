import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { IndustryMarker, StationMarker, TownMarker } from '../shared/protocol';
import {
  SNAPSHOT_RESERVED_STRIDE,
  SNAPSHOT_VEHICLE_STRIDE,
  SnapshotReserved,
  SnapshotVehicle,
} from '../shared/snapshot';
import { MAX_HEIGHT } from '../sim/constants';
import type { TileMap } from '../sim/map/TileMap';
import { Terrain } from '../sim/map/terrain';
import { BlockIndex } from '../sim/signals/blocks';
import {
  DrawLayer,
  drawOrder,
  HEIGHT_PX,
  pickTile,
  TILE_H,
  TILE_W,
  tileToWorld,
  vehicleDrawOrder,
} from './projection';
import { INDUSTRY_SPECS } from '../sim/industry/types';
import { COMPANY_COLORS } from '../shared/palette';

/** The company palette as Pixi tints, parsed once. */
const COMPANY_TINTS: readonly number[] = COMPANY_COLORS.map((hex) =>
  Number.parseInt(hex.slice(1), 16),
);

/** How close a click has to land to count as hitting a vehicle. [world px] */
const VEHICLE_PICK_PX = 14;

/** One vehicle as the audio engine wants it; reused between frames. */
export interface VehicleAudioInput {
  id: number;
  power: number;
  panX: number;
  throttle: number;
  distance: number;
}
import { ATLAS_SCALE, buildTerrainAtlas, type AtlasFrame, type TerrainAtlas } from './TerrainAtlas';

/**
 * The isometric map view.
 *
 * Reads the tile layers straight out of the shared buffer the simulation owns
 * and never writes to them - architecture law #1 in the other direction. It
 * rebuilds its sprites when the camera moved to a different tile range, when
 * the zoom changed, or when the simulation bumped the map revision; not per
 * frame, because nothing about a static map changes between frames.
 */

/** Zoom steps, powers of two so the pixel grid stays clean. */
export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4] as const;
export const DEFAULT_ZOOM_INDEX = 2;

/** Extra tiles drawn beyond the viewport, covering tall ground at the edges. */
const CULL_MARGIN = MAX_HEIGHT + 4;

/**
 * Colours the F3 overlay cycles through for blocks and for the trains holding
 * them. Eight hues far enough apart that two touching blocks are never the same
 * colour by accident, taken from the same colour-blind safe palette the company
 * colours use.
 */
const BLOCK_COLOURS: readonly number[] = [
  0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7, 0x999999,
];

/** Below this zoom the map is drawn as a plain overview: no roads, no houses. */
const DETAIL_ZOOM_MIN = 0.5;

/** ModuleKind values, duplicated as constants to keep render free of sim enums. */
const ROAD_DEPOT_KIND = 2;
const RAIL_PLATFORM_KIND = 3;
const RAIL_DEPOT_KIND = 4;

/** VehicleKind.Train, likewise. */
const TRAIN_KIND = 0;

/** Structure.Bridge. A tunnel is drawn by drawing nothing. */
const BRIDGE_STRUCTURE = 1;

/** Texture cache key per module kind; the index is the ModuleKind value. */
const MODULE_SPRITE_KEYS: readonly string[] = [
  'station',
  'station',
  'depot',
  'platform',
  'railDepot',
];

function moduleFrame(atlas: TerrainAtlas, kind: number): AtlasFrame {
  if (kind === ROAD_DEPOT_KIND) return atlas.depotFrame();
  if (kind === RAIL_PLATFORM_KIND) return atlas.platformFrame();
  if (kind === RAIL_DEPOT_KIND) return atlas.railDepotFrame();
  return atlas.stationFrame();
}

export interface TileInfo {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly terrain: number;
  readonly townId: number;
  readonly industryId: number;
  /** Packed signal byte of the tile (kind + direction), 0 when there is none. */
  readonly signal: number;
}

export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly tiles = new Container();
  private readonly overlay = new Graphics();
  private readonly pool: Sprite[] = [];

  private atlas: TerrainAtlas | null = null;
  /** Ground line inside an atlas cell, in world pixels. */
  private atlasAnchorPx = HEIGHT_PX;
  private atlasTexture: Texture | null = null;
  private readonly frameCache = new Map<string, Texture>();

  private map: TileMap | null = null;
  private towns: readonly TownMarker[] = [];
  private industries: readonly IndustryMarker[] = [];

  private zoomIndex = DEFAULT_ZOOM_INDEX;
  private centreX = 0;
  private centreY = 0;

  private builtRevision = -1;
  private builtBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private builtZoom = -1;

  private hovered: { x: number; y: number } | null = null;
  private selected: { x: number; y: number } | null = null;

  /** F3: the block and reservation overlay of section 9.3. */
  private blockOverlay = false;
  private reservedSource: (() => { data: Int32Array; count: number }) | null = null;
  private readonly blocks = new BlockIndex(0);
  private deadlockTiles: readonly number[] = [];
  /** Frame counter, so the deadlock marker blinks without a wall clock. */
  private blink = 0;

  /** True once the WebGL context exists; false again after dispose. */
  private live = false;
  /** Set by dispose, so an attach that is still in flight cleans up after itself. */
  private discarded = false;

  /** Called whenever the tile under the cursor changes. */
  onHover: ((info: TileInfo | null) => void) | null = null;
  /** Called on a left click on the map. */
  onSelect: ((info: TileInfo | null) => void) | null = null;
  /**
   * A vehicle was clicked, or the click missed every vehicle (null).
   *
   * Separate from `onSelect` so the caller can decide what a click on a lorry
   * means while a build tool is armed - which is a question about the
   * interface, not about the renderer.
   */
  onSelectVehicle: ((vehicleId: number | null) => void) | null = null;

  private stations: readonly StationMarker[] = [];
  /** Company colour, applied to stations and vehicles as a tint. */
  private companyTint = 0xf08020;
  /** Where the renderer fetches the per-tick vehicle block from. */
  private vehicleSource: (() => { data: Int32Array; count: number }) | null = null;
  private previewRoute: readonly number[] | null = null;
  private readonly vehicleSprites: Sprite[] = [];
  /**
   * Which vehicle each sprite is drawing, this frame.
   *
   * Parallel to `vehicleSprites` and rebuilt every frame, because the snapshot
   * block is COMPACTED - a row's position says nothing about which vehicle it
   * is, and a sprite is reused for whatever lands in its slot. This array is
   * what turns a click on a lorry into a vehicle id (owed since M2).
   */
  private readonly vehicleIds: number[] = [];
  /** Screen positions of the drawn vehicles, for the hit test and for audio. */
  private readonly vehicleScreen: { x: number; y: number }[] = [];
  private drawnVehicles = 0;
  private selectedVehicleId: number | null = null;

  /**
   * Create the WebGL context and start rendering.
   *
   * `init` is asynchronous, and a component can be unmounted while it is still
   * running - React's StrictMode does exactly that on every mount. Destroying an
   * Application that has not finished initialising throws, so disposal that
   * arrives early is recorded and carried out here instead.
   */
  async attach(container: HTMLElement): Promise<void> {
    await this.app.init({
      background: 0x11161c,
      antialias: false,
      resizeTo: container,
      preference: 'webgl',
    });

    if (this.discarded) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.live = true;
    container.appendChild(this.app.canvas);

    this.atlas = buildTerrainAtlas();
    // The atlas is drawn at ATLAS_SCALE; its anchor is in atlas pixels and
    // every sprite is scaled down by the same factor.
    this.atlasAnchorPx = this.atlas.anchorY / ATLAS_SCALE;
    this.atlasTexture = Texture.from(this.atlas.canvas);
    this.atlasTexture.source.scaleMode = 'nearest';

    // One sorted container for tiles AND vehicles: correct occlusion needs the
    // vehicle sprites interleaved into the tile sequence by their drawOrder
    // key (section 16.1) - a vehicle layer on top can never put a train
    // behind a hill. Pixi only re-sorts when a zIndex actually changed.
    this.tiles.sortableChildren = true;
    this.world.addChild(this.tiles);
    this.world.addChild(this.overlay);
    this.app.stage.addChild(this.world);

    this.installInput(this.app.canvas);
    this.app.ticker.add(this.update);
  }

  /** Hand over the map the simulation generated. */
  setMap(map: TileMap, towns: readonly TownMarker[], industries: readonly IndustryMarker[]): void {
    this.map = map;
    this.towns = towns;
    this.industries = industries;
    this.builtRevision = -1;

    const start = towns[0];
    if (start !== undefined) this.centreOnTile(start.x, start.y);
    else this.centreOnTile(map.size >> 1, map.size >> 1);
  }

  /** Tell the view that the simulation changed the ground. */
  setMapRevision(revision: number): void {
    if (this.map !== null) this.map.revision = revision;
  }

  /** Station list, refreshed whenever one is built or extended. */
  setStations(stations: readonly StationMarker[]): void {
    this.stations = stations;
    this.builtRevision = -1; // stations are drawn with the tiles
  }

  setCompanyColor(hex: number): void {
    this.companyTint = hex;
    this.builtRevision = -1;
  }

  /**
   * Where to read the per-tick vehicle block. Pulled every frame rather than
   * pushed, because the renderer runs at 60 Hz and the simulation at 20.
   */
  setVehicleSource(source: () => { data: Int32Array; count: number }): void {
    this.vehicleSource = source;
  }

  /** Where the F3 overlay reads the claimed track from. */
  setReservedSource(source: () => { data: Int32Array; count: number }): void {
    this.reservedSource = source;
  }

  /** Turn the block overlay on or off (F3). */
  setBlockOverlay(on: boolean): void {
    this.blockOverlay = on;
  }

  /** Tiles of trains that have been stuck long enough to count (section 9.3). */
  setDeadlockTiles(tiles: readonly number[]): void {
    this.deadlockTiles = tiles;
  }

  get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex]!;
  }

  centreOnTile(tileX: number, tileY: number): void {
    const map = this.map;
    const height = map === null ? 0 : map.baseHeight(tileX, tileY);
    const world = tileToWorld(tileX, tileY, height);
    this.centreX = world.x;
    this.centreY = world.y;
  }

  dispose(): void {
    this.discarded = true;
    if (!this.live) return; // attach is still running and will clean up
    this.live = false;
    this.app.ticker.remove(this.update);
    this.app.destroy(true, { children: true });
    this.frameCache.clear();
  }

  // ------------------------------------------------------------------ input

  private installInput(canvas: HTMLCanvasElement): void {
    let panning = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 2 || event.button === 1) {
        panning = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      } else if (event.button === 0) {
        // Vehicles first. They are drawn on top of the ground, so a click that
        // lands on one has to mean the vehicle - anything else and a lorry
        // becomes a hole the player builds through.
        const vehicleId = this.vehicleAtClient(event);
        if (vehicleId !== null) {
          this.selectedVehicleId = vehicleId;
          this.onSelectVehicle?.(vehicleId);
          return;
        }
        this.onSelectVehicle?.(null);
        this.selected = this.tileAtClient(event);
        this.onSelect?.(this.infoAt(this.selected));
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (panning) {
        // No smoothing: inertia makes precise construction unpleasant.
        this.centreX -= (event.clientX - lastX) / this.zoom;
        this.centreY -= (event.clientY - lastY) / this.zoom;
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      const tile = this.tileAtClient(event);
      if (tile?.x !== this.hovered?.x || tile?.y !== this.hovered?.y) {
        this.hovered = tile;
        this.onHover?.(this.infoAt(tile));
      }
    });

    canvas.addEventListener('pointerup', (event) => {
      panning = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const next = this.zoomIndex + (event.deltaY < 0 ? 1 : -1);
        this.setZoomIndex(next, event);
      },
      { passive: false },
    );
  }

  /** Zoom towards the cursor, so the tile under it stays put. */
  private setZoomIndex(next: number, event: PointerEvent | WheelEvent): void {
    const clamped = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, next));
    if (clamped === this.zoomIndex) return;

    const before = this.clientToWorld(event);
    this.zoomIndex = clamped;
    const after = this.clientToWorld(event);
    this.centreX += before.x - after.x;
    this.centreY += before.y - after.y;
  }

  private clientToWorld(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    return {
      x: (screenX - this.app.screen.width / 2) / this.zoom + this.centreX,
      y: (screenY - this.app.screen.height / 2) / this.zoom + this.centreY,
    };
  }

  private tileAtClient(event: PointerEvent | WheelEvent): { x: number; y: number } | null {
    if (this.map === null) return null;
    const world = this.clientToWorld(event);
    return pickTile(this.map, world.x, world.y);
  }

  private infoAt(tile: { x: number; y: number } | null): TileInfo | null {
    const map = this.map;
    if (map === null || tile === null) return null;
    const index = map.tileIndex(tile.x, tile.y);
    return {
      x: tile.x,
      y: tile.y,
      height: map.baseHeight(tile.x, tile.y),
      terrain: map.terrain[index]!,
      townId: map.townId[index]!,
      industryId: map.industryId[index]!,
      signal: map.signal[index]!,
    };
  }

  // --------------------------------------------------------------- drawing

  private readonly update = (): void => {
    const map = this.map;
    if (map === null) return;

    this.clampCentre(map.size);
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - this.centreX * this.zoom,
      this.app.screen.height / 2 - this.centreY * this.zoom,
    );

    const bounds = this.visibleTileBounds(map.size);
    const changed =
      map.revision !== this.builtRevision ||
      this.zoom !== this.builtZoom ||
      bounds.minX !== this.builtBounds.minX ||
      bounds.minY !== this.builtBounds.minY ||
      bounds.maxX !== this.builtBounds.maxX ||
      bounds.maxY !== this.builtBounds.maxY;

    if (changed) {
      this.rebuild(map, bounds);
      this.builtRevision = map.revision;
      this.builtZoom = this.zoom;
      this.builtBounds = bounds;
    }
    this.drawVehicles(map);
    this.drawOverlay(map);
  };

  private clampCentre(size: number): void {
    const halfSpan = size * (TILE_W / 2);
    if (this.centreX < -halfSpan) this.centreX = -halfSpan;
    if (this.centreX > halfSpan) this.centreX = halfSpan;
    if (this.centreY < -HEIGHT_PX * MAX_HEIGHT) this.centreY = -HEIGHT_PX * MAX_HEIGHT;
    if (this.centreY > size * TILE_H) this.centreY = size * TILE_H;
  }

  private visibleTileBounds(size: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const halfW = this.app.screen.width / 2 / this.zoom;
    const halfH = this.app.screen.height / 2 / this.zoom;
    const left = this.centreX - halfW;
    const right = this.centreX + halfW;
    const top = this.centreY - halfH;
    const bottom = this.centreY + halfH;

    // Corners of the viewport, back-projected at height 0.
    const sums = [(2 * top) / TILE_H, (2 * bottom) / TILE_H];
    const differences = [(2 * left) / TILE_W, (2 * right) / TILE_W];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const sum of sums) {
      for (const difference of differences) {
        const tx = (sum + difference) / 2;
        const ty = (sum - difference) / 2;
        minX = Math.min(minX, tx);
        maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty);
        maxY = Math.max(maxY, ty);
      }
    }

    return {
      minX: Math.max(0, Math.floor(minX) - CULL_MARGIN),
      minY: Math.max(0, Math.floor(minY) - CULL_MARGIN),
      maxX: Math.min(size - 1, Math.ceil(maxX) + CULL_MARGIN),
      maxY: Math.min(size - 1, Math.ceil(maxY) + CULL_MARGIN),
    };
  }

  private frameTexture(key: string, frame: AtlasFrame): Texture {
    const cached = this.frameCache.get(key);
    if (cached !== undefined) return cached;

    const texture = new Texture({
      source: this.atlasTexture!.source,
      frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    });
    this.frameCache.set(key, texture);
    return texture;
  }

  private take(index: number): Sprite {
    let sprite = this.pool[index];
    if (sprite === undefined) {
      sprite = new Sprite();
      sprite.scale.set(1 / ATLAS_SCALE);
      this.pool.push(sprite);
      this.tiles.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }

  private place(
    sprite: Sprite,
    texture: Texture,
    worldX: number,
    worldY: number,
    zIndex: number,
  ): void {
    sprite.texture = texture;
    sprite.tint = 0xffffff;
    // The drawOrder key of section 16.1. Insertion already runs along the
    // diagonals, but only the key orders heights within a diagonal and sorts
    // the vehicles in - and Pixi's zIndex setter is change-detected, so a
    // rebuild that keeps a sprite's key costs no sort.
    sprite.zIndex = zIndex;
    // Where the ground sits inside the cell is the ATLAS's business, and it
    // says so through `anchorY`. Assuming one height step here was an unwritten
    // agreement between two files, and it broke the moment the atlas grew
    // headroom for a chimney.
    sprite.position.set(worldX - TILE_W / 2, worldY - this.atlasAnchorPx);
  }

  private rebuild(
    map: TileMap,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): void {
    const atlas = this.atlas!;
    const detailed = this.zoom >= DETAIL_ZOOM_MIN;
    let used = 0;

    // Painter's order for an isometric grid runs along the diagonals: every
    // tile with a smaller (x + y) is further away and has to go down first.
    for (let sum = bounds.minX + bounds.minY; sum <= bounds.maxX + bounds.maxY; sum++) {
      const xStart = Math.max(bounds.minX, sum - bounds.maxY);
      const xEnd = Math.min(bounds.maxX, sum - bounds.minY);

      for (let x = xStart; x <= xEnd; x++) {
        const y = sum - x;
        const index = map.tileIndex(x, y);
        const height = map.baseHeight(x, y);
        const world = tileToWorld(x, y, height);

        const terrain = map.terrain[index]!;
        const slope = map.slopeAt(x, y);
        this.place(
          this.take(used++),
          this.frameTexture(`t${terrain}:${slope}`, atlas.terrainFrame(terrain, slope)),
          world.x,
          world.y,
          drawOrder(x, y, height, DrawLayer.Ground),
        );

        // A bridge deck is drawn at ITS height, not the ground's - that is the
        // whole point of it. A tunnel bore is drawn not at all: the hill above
        // it has already been drawn, and the track is inside the hill.
        const structure = map.structure[index]!;
        if (structure !== 0) {
          if (detailed && structure === BRIDGE_STRUCTURE) {
            const deckHeight = map.structureHeight[index]!;
            const deck = tileToWorld(x, y, deckHeight);
            this.place(
              this.take(used++),
              this.frameTexture('bridge', atlas.bridgeFrame()),
              deck.x,
              deck.y,
              // The deck is the ground of its own level, and its track sits on
              // it - both keyed at the DECK height, so a train on the bridge
              // (railHeight) draws above them and the valley below stays under.
              drawOrder(x, y, deckHeight, DrawLayer.Ground),
            );
            const bits = map.trackBits[index]!;
            for (let direction = 0; direction < 8; direction++) {
              if ((bits & (1 << direction)) === 0) continue;
              this.place(
                this.take(used++),
                this.frameTexture(`k${direction}`, atlas.trackFrame(direction)),
                deck.x,
                deck.y,
                drawOrder(x, y, deckHeight, DrawLayer.Track),
              );
            }
          }
          continue;
        }

        if (!detailed || terrain === Terrain.Water) continue;

        const roadBits = map.roadBits[index]!;
        if (roadBits !== 0) {
          this.place(
            this.take(used++),
            this.frameTexture(`r${roadBits}`, atlas.roadFrame(roadBits)),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Road),
          );
        }

        // Track is composited from one half segment per connected direction.
        const trackBits = map.trackBits[index]!;
        if (trackBits !== 0) {
          for (let direction = 0; direction < 8; direction++) {
            if ((trackBits & (1 << direction)) === 0) continue;
            this.place(
              this.take(used++),
              this.frameTexture(`k${direction}`, atlas.trackFrame(direction)),
              world.x,
              world.y,
              drawOrder(x, y, height, DrawLayer.Track),
            );
          }
        }

        if (map.signal[index] !== 0) {
          this.place(
            this.take(used++),
            this.frameTexture('signal', atlas.signalFrame()),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Signal),
          );
        }

        const buildingKind = map.buildingKind[index]!;
        if (buildingKind !== 0) {
          const level = map.buildingLevel[index]!;
          this.place(
            this.take(used++),
            this.frameTexture(
              `b${buildingKind}:${level}`,
              atlas.buildingFrame(buildingKind, level),
            ),
            world.x,
            world.y,
            drawOrder(x, y, height, DrawLayer.Building),
          );
        }
      }
    }

    // Industry blocks sit on their origin tile. Their key is the FRONT corner
    // of the footprint, so the artwork is never cut by its own footprint's
    // ground - while a hill one diagonal nearer still covers it correctly.
    if (detailed) {
      for (const industry of this.industries) {
        if (
          industry.x < bounds.minX ||
          industry.x > bounds.maxX ||
          industry.y < bounds.minY ||
          industry.y > bounds.maxY
        ) {
          continue;
        }
        const world = tileToWorld(industry.x, industry.y, map.baseHeight(industry.x, industry.y));
        const sprite = this.take(used++);
        const footprint = INDUSTRY_SPECS[industry.type]?.footprint ?? 1;
        // No tint. The industry is drawn in its own colours now - a tint
        // multiplies, and it flattened a coal heap and a chimney to the same
        // shade of whatever the tint was.
        this.place(
          sprite,
          this.frameTexture(`i${industry.type}`, atlas.industryFrame(industry.type)),
          world.x,
          world.y,
          drawOrder(
            industry.x + footprint - 1,
            industry.y + footprint - 1,
            map.baseHeight(industry.x, industry.y),
            DrawLayer.Building,
          ),
        );
      }
    }

    // Station modules, keyed on their own tile at the station layer: above the
    // track a platform covers, below a vehicle standing on it.
    for (const station of this.stations) {
      for (const module of station.modules) {
        if (
          module.x < bounds.minX ||
          module.x > bounds.maxX ||
          module.y < bounds.minY ||
          module.y > bounds.maxY
        ) {
          continue;
        }
        const world = tileToWorld(module.x, module.y, map.baseHeight(module.x, module.y));
        const sprite = this.take(used++);
        const key = MODULE_SPRITE_KEYS[module.kind] ?? 'station';
        this.place(
          sprite,
          this.frameTexture(key, moduleFrame(atlas, module.kind)),
          world.x,
          world.y,
          drawOrder(module.x, module.y, map.baseHeight(module.x, module.y), DrawLayer.Station),
        );
        sprite.tint = this.companyTint;
      }
    }

    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  /**
   * Vehicles are redrawn every frame, not with the tiles: they move between
   * simulation ticks and the renderer interpolates along the tile they are
   * crossing, which is what keeps them smooth at 60 Hz over a 20 Hz sim.
   */
  private drawVehicles(map: TileMap): void {
    const source = this.vehicleSource;
    const atlas = this.atlas;
    if (source === null || atlas === null) return;

    const { data, count } = source();
    const size = map.size;
    this.drawnVehicles = 0;

    for (let i = 0; i < count; i++) {
      const base = i * SNAPSHOT_VEHICLE_STRIDE;
      const tile = data[base + SnapshotVehicle.Tile]!;
      const next = data[base + SnapshotVehicle.NextTile]!;
      const progress = data[base + SnapshotVehicle.ProgressMilli]! / 1000;
      const kind = data[base + SnapshotVehicle.Kind]!;
      const vehicleId = data[base + SnapshotVehicle.VehicleId]!;
      const owner = data[base + SnapshotVehicle.Owner]!;

      const fromX = tile % size;
      const fromY = (tile / size) | 0;
      const toX = next % size;
      const toY = (next / size) | 0;
      if (!map.contains(fromX, fromY) || !map.contains(toX, toY)) continue;

      // railHeight, so a train on a bridge rides the deck instead of the river.
      const fromHeight = map.railHeight(fromX, fromY);
      const toHeight = map.railHeight(toX, toY);
      const from = tileToWorld(fromX, fromY, fromHeight);
      const to = tileToWorld(toX, toY, toHeight);

      let sprite = this.vehicleSprites[i];
      if (sprite === undefined) {
        sprite = new Sprite(this.frameTexture('vehicle', atlas.vehicleFrame()));
        sprite.scale.set(1 / ATLAS_SCALE);
        this.vehicleSprites.push(sprite);
        // Into the SAME sorted container as the tiles: the drawOrder key is
        // what lets a hill in front of a train draw over it (section 16.1).
        this.tiles.addChild(sprite);
      }

      // A sprite is reused for whatever vehicle lands in its slot, so the
      // texture is set every frame rather than once at creation.
      sprite.texture =
        kind === TRAIN_KIND
          ? this.frameTexture('train', atlas.trainFrame())
          : this.frameTexture('vehicle', atlas.vehicleFrame());
      sprite.visible = true;
      // Every company's own colour, so a competitor's train is recognisable as
      // one at a glance rather than only in a list.
      sprite.tint = owner === 0 ? this.companyTint : (COMPANY_TINTS[owner] ?? this.companyTint);

      sprite.zIndex = vehicleDrawOrder(fromX, fromY, fromHeight, toX, toY, toHeight, progress);

      const worldX = from.x + (to.x - from.x) * progress;
      const worldY = from.y + (to.y - from.y) * progress;
      sprite.position.set(worldX - TILE_W / 2, worldY - HEIGHT_PX);

      this.vehicleIds[this.drawnVehicles] = vehicleId;
      const screen = this.vehicleScreen[this.drawnVehicles] ?? { x: 0, y: 0 };
      screen.x = worldX;
      screen.y = worldY;
      this.vehicleScreen[this.drawnVehicles] = screen;
      this.drawnVehicles++;
    }

    for (let i = count; i < this.vehicleSprites.length; i++) {
      this.vehicleSprites[i]!.visible = false;
    }
  }

  /**
   * The vehicle under the pointer, or null.
   *
   * Nearest within a small radius rather than an exact sprite test: a lorry is
   * about ten pixels across at full zoom and two at the far end, and a click
   * that has to land inside two pixels is a click nobody lands.
   */
  private vehicleAtClient(event: PointerEvent): number | null {
    const world = this.world.toLocal({ x: event.offsetX, y: event.offsetY });
    const reach = VEHICLE_PICK_PX / this.zoom;

    let best: number | null = null;
    let bestDistance = reach * reach;
    for (let i = 0; i < this.drawnVehicles; i++) {
      const screen = this.vehicleScreen[i]!;
      const dx = screen.x - world.x;
      const dy = screen.y - world.y;
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) continue;
      bestDistance = distance;
      best = this.vehicleIds[i] ?? null;
    }
    return best;
  }

  /**
   * What the audio engine needs: the nearest vehicles to the middle of the
   * screen, with how fast each is going and where it sits left to right.
   *
   * Read out of the same arrays the sprites were placed from, so a sound is
   * exactly where its vehicle is. Speed comes from how far the vehicle moved
   * between two frames, which is the only speed the renderer knows and is
   * enough to tell an idling engine from a working one.
   */
  vehicleAudioInputs(out: VehicleAudioInput[]): number {
    const source = this.vehicleSource;
    // `attach` is asynchronous and the caller polls on a timer, so the first
    // few calls can arrive before Pixi has a screen to measure - and before
    // any vehicle has been drawn there is nothing to say anyway.
    if (source === null || this.map === null || this.drawnVehicles === 0) return 0;
    const screenSize = this.app.screen;
    if (screenSize === undefined) return 0;
    const { data } = source();

    const halfWidth = screenSize.width / 2;
    const halfHeight = screenSize.height / 2;
    let written = 0;

    for (let i = 0; i < this.drawnVehicles; i++) {
      const screen = this.vehicleScreen[i]!;
      const dx = (screen.x - this.centreX) * this.zoom;
      const dy = (screen.y - this.centreY) * this.zoom;

      const base = i * SNAPSHOT_VEHICLE_STRIDE;
      const state = data[base + SnapshotVehicle.State]!;
      const progress = data[base + SnapshotVehicle.ProgressMilli]!;
      const moving = data[base + SnapshotVehicle.Tile] !== data[base + SnapshotVehicle.NextTile];

      const entry = out[written] ?? {
        id: 0,
        power: 0,
        panX: 0,
        throttle: 0,
        distance: 0,
      };
      entry.id = this.vehicleIds[i] ?? 0;
      entry.power = this.powerOf(data[base + SnapshotVehicle.Kind]!);
      entry.panX = Math.max(-1, Math.min(1, dx / Math.max(1, halfWidth)));
      entry.throttle = moving ? 0.35 + (progress % 1000) / 4000 : 0;
      entry.distance = Math.min(
        1,
        Math.sqrt(dx * dx + dy * dy) / Math.max(1, Math.hypot(halfWidth, halfHeight)),
      );
      out[written] = entry;
      written++;
      if (state < 0) break;
    }
    return written;
  }

  /**
   * What a vehicle burns, guessed from what it is.
   *
   * The snapshot carries the kind, not the power source: a locomotive's fuel
   * is a catalogue fact that never changes, and sending it every tick to save
   * one lookup would be the wrong trade. Trains are the only thing in the game
   * that can be electric, so this is the whole of the guess.
   */
  private powerOf(kind: number): number {
    return kind === TRAIN_KIND ? 0 : 1;
  }

  /** Mark a vehicle as selected, or clear it. Driven by the store. */
  setSelectedVehicle(vehicleId: number | null): void {
    this.selectedVehicleId = vehicleId;
  }

  /** Route the build preview is currently showing, drawn on the overlay. */
  setPreviewRoute(tiles: readonly number[] | null): void {
    this.previewRoute = tiles;
  }

  /** Cursor highlight, selection marker, build preview and the F3 overlay. */
  private drawOverlay(map: TileMap): void {
    this.overlay.clear();
    this.blink++;
    if (this.blockOverlay) this.drawBlocks(map);

    // A ring round the selected vehicle. It follows the sprite rather than a
    // tile, because a vehicle is between two tiles most of the time and a
    // marker that snapped to one would sit behind what it is marking.
    if (this.selectedVehicleId !== null) {
      for (let i = 0; i < this.drawnVehicles; i++) {
        if (this.vehicleIds[i] !== this.selectedVehicleId) continue;
        const screen = this.vehicleScreen[i]!;
        this.overlay.circle(screen.x, screen.y - HEIGHT_PX / 2, 10 / this.zoom + 4);
        this.overlay.stroke({ width: 2 / this.zoom, color: 0xe6e9ee, alpha: 0.95 });
        break;
      }
    }

    const preview = this.previewRoute;
    if (preview !== null && preview.length > 1) {
      const size = map.size;
      for (let i = 0; i < preview.length; i++) {
        const tile = preview[i]!;
        const x = tile % size;
        const y = (tile / size) | 0;
        const centre = tileToWorld(x, y, map.baseHeight(x, y));
        if (i === 0) this.overlay.moveTo(centre.x, centre.y + TILE_H / 2);
        else this.overlay.lineTo(centre.x, centre.y + TILE_H / 2);
      }
      this.overlay.stroke({ width: 4 / this.zoom, color: 0x4caf7d, alpha: 0.9 });
    }
    for (const [tile, colour, alpha] of [
      [this.hovered, 0xf08020, 0.85],
      [this.selected, 0xe6e9ee, 1],
    ] as const) {
      if (tile === null) continue;
      const height = map.baseHeight(tile.x, tile.y);
      const centre = tileToWorld(tile.x, tile.y, height);
      this.overlay
        .moveTo(centre.x, centre.y)
        .lineTo(centre.x + TILE_W / 2, centre.y + TILE_H / 2)
        .lineTo(centre.x, centre.y + TILE_H)
        .lineTo(centre.x - TILE_W / 2, centre.y + TILE_H / 2)
        .lineTo(centre.x, centre.y)
        .stroke({ width: 2 / this.zoom, color: colour, alpha });
    }
  }

  /**
   * The block overlay of section 9.3, which ships in the release build because
   * it is the only way anybody learns what a signal actually does.
   *
   * Three things, drawn only for the tiles on screen: which block a piece of
   * track belongs to, whether a train holds it, and - blinking yellow - any
   * train that has been standing at a red long enough to count as stuck.
   *
   * The block index is rebuilt on the main thread from the shared map buffer.
   * It is derived state, so this is the same computation the simulation does
   * and not a second copy of the truth.
   */
  private drawBlocks(map: TileMap): void {
    this.blocks.refresh(map);
    const bounds = this.visibleTileBounds(map.size);
    const width = 1.5 / this.zoom;

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue;
        const tile = y * map.size + x;
        if (map.trackBits[tile] === 0) continue;

        const block = this.blocks.blockAt(tile);
        if (block < 0) continue;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.stroke({
          width,
          color: BLOCK_COLOURS[block % BLOCK_COLOURS.length]!,
          alpha: 0.5,
        });
      }
    }

    // Claimed track on top, in the holder's own colour and filled, so a claim
    // reads as "occupied" rather than as another block boundary.
    const reserved = this.reservedSource?.() ?? null;
    if (reserved !== null) {
      for (let i = 0; i < reserved.count; i++) {
        const base = i * SNAPSHOT_RESERVED_STRIDE;
        const tile = reserved.data[base + SnapshotReserved.Tile]!;
        const x = tile % map.size;
        const y = (tile / map.size) | 0;
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;

        const owner = reserved.data[base + SnapshotReserved.VehicleId]!;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.fill({ color: BLOCK_COLOURS[owner % BLOCK_COLOURS.length]!, alpha: 0.35 });
      }
    }

    // And the deadlock markers, blinking so they cannot be missed. No auto-fix:
    // a deadlock is a player mistake and has to stay visible (section 9.3).
    if ((this.blink >> 4) % 2 === 0) {
      for (const tile of this.deadlockTiles) {
        const x = tile % map.size;
        const y = (tile / map.size) | 0;
        const centre = tileToWorld(x, y, map.railHeight(x, y));
        this.diamond(centre.x, centre.y);
        this.overlay.stroke({ width: 4 / this.zoom, color: 0xffd24a, alpha: 1 });
      }
    }
  }

  /** Trace the diamond of one tile onto the overlay. */
  private diamond(x: number, y: number): void {
    this.overlay
      .moveTo(x, y)
      .lineTo(x + TILE_W / 2, y + TILE_H / 2)
      .lineTo(x, y + TILE_H)
      .lineTo(x - TILE_W / 2, y + TILE_H / 2)
      .lineTo(x, y);
  }

  /** Town labels for the minimap and the town list. */
  get townMarkers(): readonly TownMarker[] {
    return this.towns;
  }
}
