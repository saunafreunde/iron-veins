import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  ALPINE_HEIGHT,
  Difficulty,
  EDITOR_BRUSH_MAX_RADIUS,
  MapClimate,
  SEA_LEVEL,
  SCENARIO_TEXT_MAX_CHARS,
  TerraformDirection,
} from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { classifyBiome } from '../../src/sim/mapgen/climate';
import { computeLandmasses, markOcean } from '../../src/sim/mapgen/hydrology';
import { moistureOfTerrain, tileTemperatureC } from '../../src/sim/mapgen/climateField';
import { encodeScenario } from '../../src/sim/save/scenario';
import { decodeSave } from '../../src/sim/save/serialize';
import { radiusForModuleCount, withinCatchment } from '../../src/sim/station/types';
import { TownSize } from '../../src/sim/town/types';
import { hashWorld, World } from '../../src/sim/World';
import {
  computeEditorOverlay,
  EDITOR_OVERLAYS,
  OVERLAY_ALPHA,
  overlayAlpha,
  overlayColor,
  type OverlayStation,
} from '../../src/ui/editor/overlays';
import {
  metaFromDraft,
  scenarioDraftRefusal,
  scenarioFileName,
  type ScenarioDraft,
} from '../../src/ui/editor/scenarioExport';
import {
  commandForEditorTool,
  EDITOR_BRUSH_RADII,
  EDITOR_BRUSH_TOOLS,
  EDITOR_TOOL_REGISTRY,
  type EditorTool,
} from '../../src/ui/editor/tools';

/**
 * The scenario workshop's interface half (SPEC2 M22, bundle 2).
 *
 * Three claims, and each one is a Fertig-wenn of the bundle:
 *
 *  1. **the palette issues each command.** Every one of bundle 1's five kinds
 *     is produced by a tool of the registry, with the palette's own values in
 *     its fields - and the round trip goes on into the queue, so what the
 *     button builds is what the simulation executes.
 *  2. **the overlays are pure.** Same world in, same field out; nothing
 *     written - not a byte of the map, not a revision counter, not a cache.
 *     And each of the four is held against the simulation function it claims
 *     to be reading, so a picture cannot quietly stop meaning what it says.
 *  3. **an edited world exports and re-imports as a scenario**, through
 *     `encodeScenario`/`decodeSave` - one serializer, one parser, because
 *     scenario compatibility IS save compatibility.
 */

const SIZE = 64;
const CATALOGS: Record<string, Record<string, string>> = { de, en };

interface Fixture {
  readonly world: World;
  readonly queue: CommandQueue;
}

/**
 * A workshop world: flat land at `height`, the editor rule on.
 *
 * Built exactly as `editorCommands.spec.ts` builds one, because the two files
 * have to be talking about the same world - this one drives the palette over
 * it, that one drove the commands directly.
 */
function workshop(height = 8, seed = 4_711): Fixture {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(height);
  map.terrain.fill(height <= SEA_LEVEL ? Terrain.Water : Terrain.Grass);

  const world = World.fromGenerated(
    {
      seed,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: SIZE,
      companyName: 'Werkstatt AG',
      companyColorIndex: 1,
      aiCompanies: 0,
      editorMode: true,
    },
    { map, towns: [], industries: [], seedUsed: seed },
  );
  return { world, queue: new CommandQueue() };
}

/** Execute one command; the rejection key, or null when it was accepted. */
function run(fixture: Fixture, command: Command): string | null {
  fixture.queue.enqueue(command, fixture.world.tick, 0);
  let rejected: string | null = null;
  fixture.world.drainCommands(fixture.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

/** The palette's own state, as the panel would hold it. */
const PALETTE = { radius: 2, townSize: TownSize.Village, industryType: IndustryType.Farm };

// ------------------------------------------------- (1) the palette issues them

describe('the workshop palette issues every workshop command', () => {
  it('covers the five kinds of SPEC2 M22 and no others', () => {
    const issued = new Set<number>();
    for (const entry of EDITOR_BRUSH_TOOLS) {
      const command = commandForEditorTool(entry.id, 5, 6, PALETTE);
      expect(command, entry.id).not.toBeNull();
      issued.add(command!.kind);
    }
    expect([...issued].sort((a, b) => a - b)).toEqual(
      [
        CommandKind.TerraformBrushRegion,
        CommandKind.PlaceTownSeed,
        CommandKind.PlaceIndustryAt,
        CommandKind.PaintForest,
        CommandKind.PaintRiver,
      ].sort((a, b) => a - b),
    );
  });

  it('puts the palette values into the command, unclamped', () => {
    expect(commandForEditorTool('raiseRegion', 3, 4, PALETTE)).toEqual({
      kind: CommandKind.TerraformBrushRegion,
      x: 3,
      y: 4,
      radius: 2,
      direction: TerraformDirection.Raise,
    });
    expect(commandForEditorTool('lowerRegion', 3, 4, PALETTE)).toEqual({
      kind: CommandKind.TerraformBrushRegion,
      x: 3,
      y: 4,
      radius: 2,
      direction: TerraformDirection.Lower,
    });
    expect(commandForEditorTool('townSeed', 7, 8, PALETTE)).toEqual({
      kind: CommandKind.PlaceTownSeed,
      x: 7,
      y: 8,
      sizeClass: TownSize.Village,
    });
    expect(commandForEditorTool('industry', 9, 10, PALETTE)).toEqual({
      kind: CommandKind.PlaceIndustryAt,
      x: 9,
      y: 10,
      industryType: IndustryType.Farm,
    });
    expect(commandForEditorTool('forest', 11, 12, PALETTE)).toEqual({
      kind: CommandKind.PaintForest,
      x: 11,
      y: 12,
      radius: 2,
    });
    expect(commandForEditorTool('river', 13, 14, PALETTE)).toEqual({
      kind: CommandKind.PaintRiver,
      x: 13,
      y: 14,
      radius: 2,
    });

    // NOT clamped: an oversized brush has to reach the command and be refused
    // there, because the cap binds on the command and not on the tool (D-240).
    const huge = commandForEditorTool('forest', 1, 2, {
      ...PALETTE,
      radius: EDITOR_BRUSH_MAX_RADIUS + 1,
    });
    expect(huge).toEqual({
      kind: CommandKind.PaintForest,
      x: 1,
      y: 2,
      radius: EDITOR_BRUSH_MAX_RADIUS + 1,
    });
  });

  it('builds nothing for the select pseudo-tool', () => {
    expect(commandForEditorTool('none', 1, 2, PALETTE)).toBeNull();
  });

  it('drives the real queue: every tool is accepted by the simulation', () => {
    // The palette's commands are ordinary queue entries and this is the proof
    // that they are: the same envelope path, the same executor, the same
    // outcome vocabulary. Each tool gets ground it can actually work on.
    const sites: Readonly<Record<Exclude<EditorTool, 'none'>, { x: number; y: number }>> = {
      raiseRegion: { x: 10, y: 10 },
      lowerRegion: { x: 20, y: 20 },
      townSeed: { x: 32, y: 32 },
      industry: { x: 44, y: 12 },
      forest: { x: 50, y: 50 },
      river: { x: 8, y: 40 },
    };
    for (const entry of EDITOR_BRUSH_TOOLS) {
      // A fresh world per tool: the tools are being tested, not their order.
      // The river needs low ground it can reach the sea from.
      const fixture = workshop(entry.id === 'river' ? SEA_LEVEL + 1 : 8);
      const site = sites[entry.id as Exclude<EditorTool, 'none'>];
      const command = commandForEditorTool(entry.id, site.x, site.y, {
        radius: 1,
        townSize: TownSize.Village,
        industryType: IndustryType.Farm,
      })!;
      expect(run(fixture, command), entry.id).toBeNull();
    }
  });

  it('offers only brush sizes the command cap admits', () => {
    expect(EDITOR_BRUSH_RADII[0]).toBe(0);
    expect(EDITOR_BRUSH_RADII.at(-1)).toBe(EDITOR_BRUSH_MAX_RADIUS);
    for (const radius of EDITOR_BRUSH_RADII) {
      expect(Number.isInteger(radius)).toBe(true);
      expect(radius).toBeGreaterThanOrEqual(0);
      expect(radius).toBeLessThanOrEqual(EDITOR_BRUSH_MAX_RADIUS);
    }
    // A ladder, not a list: every step doubles, so the row stays short
    // whatever the cap becomes.
    expect(EDITOR_BRUSH_RADII).toEqual([0, 1, 2, 4, 8]);
  });

  it('carries a label and an effect-explaining tooltip in both languages', () => {
    for (const entry of EDITOR_TOOL_REGISTRY) {
      for (const locale of ['de', 'en']) {
        const label = CATALOGS[locale]![entry.labelKey];
        const tip = CATALOGS[locale]![entry.tooltipKey];
        expect(label, `${locale}: ${entry.labelKey}`).toBeTypeOf('string');
        expect(tip, `${locale}: ${entry.tooltipKey}`).toBeTypeOf('string');
        // The M14 rule, applied to the workshop's own palette: a tooltip that
        // restates the button teaches nothing.
        expect(tip, `${locale}: ${entry.tooltipKey}`).not.toBe(label);
        expect(tip!.length, `${locale}: ${entry.tooltipKey}`).toBeGreaterThan(label!.length + 20);
      }
    }
  });

  it('names every screen of the workshop in both catalogues', () => {
    const keys = [
      'ui.editor.title',
      'ui.editor.brush',
      'ui.editor.brushHint',
      'ui.editor.townSize',
      'ui.editor.townSize.city',
      'ui.editor.townSize.town',
      'ui.editor.townSize.village',
      'ui.editor.industryType',
      'ui.editor.riverHint',
      'ui.editor.overlays',
      'ui.editor.overlay.off',
      'ui.editor.landmassHint',
      'ui.editor.moistureHint',
      'ui.editor.export',
      'ui.editor.exportTitle',
      'ui.editor.exportAuthor',
      'ui.editor.exportBriefingDe',
      'ui.editor.exportBriefingEn',
      'ui.editor.exportButton',
      'ui.editor.export.needTitle',
      'ui.editor.export.needAuthor',
      'ui.editor.export.needBriefing',
      'ui.editor.export.tooLong',
      'ui.editor.export.failed',
      'ui.newGame.editorMode',
      'ui.newGame.editorModeHint',
      ...EDITOR_OVERLAYS.map((kind) => `ui.editor.overlay.${kind}`),
    ];
    for (const key of keys) {
      for (const locale of ['de', 'en']) {
        expect(CATALOGS[locale]![key], `${locale}: ${key}`).toBeTypeOf('string');
      }
    }
  });
});

// ------------------------------------------------------- (2) the overlays are pure

/** A world with something to look at: hills, a wood, a lake and two stations. */
function overlayWorld(): { map: TileMap; stations: readonly OverlayStation[] } {
  const map = new TileMap(SIZE);
  map.cornerHeight.fill(SEA_LEVEL + 1);
  map.terrain.fill(Terrain.Grass);

  // A ridge, so the temperature overlay has a lapse rate to show.
  for (let y = 10; y < 20; y++) {
    for (let x = 10; x < 20; x++) {
      map.cornerHeight[y * (SIZE + 1) + x] = ALPINE_HEIGHT;
    }
  }
  // A wood, a marsh and a desert patch, so the moisture bands differ.
  for (let x = 30; x < 40; x++) {
    map.terrain[25 * SIZE + x] = Terrain.Forest;
    map.terrain[26 * SIZE + x] = Terrain.Marsh;
    map.terrain[27 * SIZE + x] = Terrain.Desert;
    map.terrain[28 * SIZE + x] = Terrain.Field;
  }
  // Two land masses divided by a channel, cut the way the game defines water:
  // corners at or below the sea, terrain to match. Both halves matter - the
  // landmass labelling reads the TERRAIN, and the height is what makes the
  // channel water by the game's own rule (D-097).
  for (let y = 0; y <= SIZE; y++) {
    for (let x = 48; x <= 50; x++) map.cornerHeight[y * (SIZE + 1) + x] = SEA_LEVEL - 1;
  }
  for (let y = 0; y < SIZE; y++) {
    map.terrain[y * SIZE + 48] = Terrain.Water;
    map.terrain[y * SIZE + 49] = Terrain.Water;
  }
  // The derived layers the simulation maintains, computed the way the
  // simulation computes them - the landmass overlay READS this, it does not
  // re-label it.
  markOcean(map);
  computeLandmasses(map);

  return {
    map,
    stations: [
      { x: 20, y: 40, moduleCount: 1 },
      { x: 24, y: 40, moduleCount: 4 },
    ],
  };
}

/** A byte-for-byte fingerprint of everything an overlay could damage. */
function mapFingerprint(map: TileMap): string {
  return [
    map.revision,
    map.trackRevision,
    map.cornerHeight.join(','),
    map.terrain.join(','),
    map.landmassId.join(','),
    map.oceanMask.join(','),
  ].join('|');
}

describe('the workshop overlays are pure recomputes', () => {
  it('gives the same field for the same world, twice', () => {
    const { map, stations } = overlayWorld();
    for (const kind of EDITOR_OVERLAYS) {
      const first = computeEditorOverlay(kind, map, MapClimate.Temperate, stations);
      const second = computeEditorOverlay(kind, map, MapClimate.Temperate, stations);
      expect([...second], kind).toEqual([...first]);
    }
  });

  it('writes nothing - not a byte of the map, not a revision', () => {
    const { map, stations } = overlayWorld();
    const before = mapFingerprint(map);
    for (const kind of EDITOR_OVERLAYS) {
      computeEditorOverlay(kind, map, MapClimate.Temperate, stations);
    }
    expect(mapFingerprint(map)).toBe(before);
  });

  it('reuses a buffer without leaking the previous overlay through it', () => {
    // Reuse is the caller's optimisation and must not be observable: a stale
    // cell from another overlay would be a picture of two worlds at once.
    const { map, stations } = overlayWorld();
    const shared = new Int32Array(SIZE * SIZE);
    computeEditorOverlay('catchment', map, MapClimate.Temperate, stations, shared);
    const reused = computeEditorOverlay('landmass', map, MapClimate.Temperate, stations, shared);
    const fresh = computeEditorOverlay('landmass', map, MapClimate.Temperate, stations);
    expect(reused).toBe(shared);
    expect([...reused]).toEqual([...fresh]);
  });

  it('follows the world when the world moves', () => {
    // The other half of purity: a pure function of a CHANGED world gives a
    // changed answer. An overlay that cached would pass the two tests above
    // and fail this one.
    const { map, stations } = overlayWorld();
    const before = computeEditorOverlay('moisture', map, MapClimate.Temperate, stations);
    const target = 33 * SIZE + 33;
    expect(map.terrain[target]).toBe(Terrain.Grass);
    map.terrain[target] = Terrain.Forest;
    const after = computeEditorOverlay('moisture', map, MapClimate.Temperate, stations);
    expect(after[target]).not.toBe(before[target]);
  });

  it('paints temperature with the generator own expression, water excepted', () => {
    const { map, stations } = overlayWorld();
    const field = computeEditorOverlay('temperature', map, MapClimate.Arctic, stations);

    // Every painted cell carries the overlay's one opacity.
    expect(overlayAlpha(field[5 * SIZE + 5]!)).toBeCloseTo(OVERLAY_ALPHA, 2);
    // The ridge is colder than the plain, by exactly the lapse rate.
    const plain = tileTemperatureC(5, SIZE, MapClimate.Arctic, map.baseHeight(5, 5));
    const summit = tileTemperatureC(15, SIZE, MapClimate.Arctic, map.baseHeight(15, 15));
    expect(summit).toBeLessThan(plain);
    expect(field[15 * SIZE + 15]).not.toBe(field[5 * SIZE + 5]);
    // Water carries no reading at all - and it is water by both of the
    // definitions the game has, so this proves the skip and not a fixture.
    expect(map.isWater(48, 30)).toBe(true);
    expect(map.isSubmerged(48, 30)).toBe(true);
    expect(field[30 * SIZE + 48]).toBe(0);
  });

  it('paints moisture bands the generator would classify back', () => {
    // The coupling that keeps the picture honest: the value the overlay reads
    // out of a terrain, fed through the generator's own table, is that terrain
    // again. A threshold that moved in `constants.ts` fails here.
    const mild = 10;
    for (const terrain of [Terrain.Marsh, Terrain.Forest, Terrain.Grass, Terrain.Field]) {
      const moisture = moistureOfTerrain(terrain);
      expect(moisture, String(terrain)).toBeGreaterThan(0);
      expect(classifyBiome(SEA_LEVEL + 2, mild, moisture, 0), String(terrain)).toBe(terrain);
    }
    // The desert band needs the heat that defines it, which is the point of
    // the band being a moisture reading and not a biome.
    expect(classifyBiome(SEA_LEVEL + 2, 30, moistureOfTerrain(Terrain.Desert), 0)).toBe(
      Terrain.Desert,
    );
    // Snow, rock, water and town ground have no moisture reading.
    for (const terrain of [Terrain.Snow, Terrain.Rock, Terrain.Water, Terrain.TownGround]) {
      expect(moistureOfTerrain(terrain), String(terrain)).toBe(-1);
    }

    const { map, stations } = overlayWorld();
    const field = computeEditorOverlay('moisture', map, MapClimate.Temperate, stations);
    expect(field[25 * SIZE + 35]).not.toBe(field[26 * SIZE + 35]);
    expect(field[30 * SIZE + 48]).toBe(0);
  });

  it('paints one colour per land mass, water clear', () => {
    const { map, stations } = overlayWorld();
    const field = computeEditorOverlay('landmass', map, MapClimate.Temperate, stations);

    const west = map.landmassId[30 * SIZE + 10]!;
    const east = map.landmassId[30 * SIZE + 60]!;
    expect(west).toBeGreaterThanOrEqual(0);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(west).not.toBe(east);
    expect(field[30 * SIZE + 10]).not.toBe(field[30 * SIZE + 60]);
    // Same mass, same colour, wherever on it.
    expect(field[30 * SIZE + 10]).toBe(field[40 * SIZE + 12]);
    // Water is not a land mass.
    expect(field[30 * SIZE + 48]).toBe(0);
  });

  it('paints exactly the catchment the simulation would serve', () => {
    const { map, stations } = overlayWorld();
    const field = computeEditorOverlay('catchment', map, MapClimate.Temperate, stations);

    let painted = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const covering = stations.filter((station) =>
          withinCatchment(station.x, station.y, radiusForModuleCount(station.moduleCount), x, y),
        ).length;
        const cell = field[y * SIZE + x]!;
        expect(cell !== 0, `${x},${y}`).toBe(covering > 0);
        if (covering > 0) painted++;
      }
    }
    expect(painted).toBeGreaterThan(0);

    // One station is green, an overlap is amber - the thing an author is
    // looking at this overlay to find. The two tiles are named by the radii
    // rather than by eye: the stations sit at x = 20 (radius 4) and x = 24
    // (radius 5) on the same row, so x = 17 lies in the first alone and
    // x = 22 lies in both.
    expect(radiusForModuleCount(1)).toBe(4);
    expect(radiusForModuleCount(4)).toBe(5);
    const single = field[40 * SIZE + 17]!;
    const overlap = field[40 * SIZE + 22]!;
    expect(single).not.toBe(0);
    expect(overlap).not.toBe(0);
    expect(overlayColor(single)).not.toBe(overlayColor(overlap));
  });
});

// ------------------------------------------- (3) an edited world is a scenario

describe('an edited world exports and re-imports as a scenario', () => {
  const DRAFT: ScenarioDraft = {
    title: 'Werkstatt-Insel',
    author: 'Christoph',
    briefingDe: 'Eine im Editor gebaute Insel.',
    briefingEn: 'An island built in the editor.',
  };

  it('refuses a draft the container would refuse', () => {
    expect(scenarioDraftRefusal(DRAFT)).toBeNull();
    expect(scenarioDraftRefusal({ ...DRAFT, title: '  ' })).toBe('ui.editor.export.needTitle');
    expect(scenarioDraftRefusal({ ...DRAFT, author: '' })).toBe('ui.editor.export.needAuthor');
    expect(scenarioDraftRefusal({ ...DRAFT, briefingEn: '' })).toBe(
      'ui.editor.export.needBriefing',
    );
    expect(
      scenarioDraftRefusal({ ...DRAFT, briefingDe: 'x'.repeat(SCENARIO_TEXT_MAX_CHARS + 1) }),
    ).toBe('ui.editor.export.tooLong');
  });

  it('names the file after the title, whatever the title contains', () => {
    expect(scenarioFileName('Werkstatt-Insel')).toBe('werkstatt-insel.ironscenario');
    expect(scenarioFileName('  Zwei  Woerter!  ')).toBe('zwei-woerter.ironscenario');
    expect(scenarioFileName('///')).toBe('scenario.ironscenario');
  });

  it('writes what the palette built and reads it back as the same world', () => {
    const fixture = workshop(SEA_LEVEL + 2);

    // A session of the palette: a hill, a wood, a river cut, a town, a works.
    const session: readonly [EditorTool, number, number][] = [
      ['raiseRegion', 20, 20],
      ['forest', 30, 30],
      ['river', 8, 8],
      ['townSeed', 40, 40],
    ];
    for (const [tool, x, y] of session) {
      const command = commandForEditorTool(tool, x, y, {
        radius: 1,
        townSize: TownSize.Village,
        industryType: IndustryType.Farm,
      })!;
      expect(run(fixture, command), tool).toBeNull();
    }
    expect(fixture.world.towns).toHaveLength(1);

    const meta = metaFromDraft(DRAFT, fixture.world.tick);
    const bytes = encodeScenario(fixture.world, fixture.queue, '0.0.0-test', meta);

    // Read back through `decodeSave` and NOT through a scenario reader: there
    // is no second parser, which is the whole of SPEC2's sentence for M22.
    const loaded = decodeSave(bytes);

    expect(hashWorld(loaded.world)).toBe(hashWorld(fixture.world));
    expect(loaded.world.towns).toHaveLength(1);
    expect(loaded.world.towns[0]!.name).toBe(fixture.world.towns[0]!.name);
    expect(loaded.world.editorMode).toBe(true);

    // The briefing came back whole, in both languages, and the goal list is
    // empty because the world sets none - the one coupling the parser checks.
    expect(loaded.scenario).not.toBeNull();
    expect(loaded.scenario!.title).toBe('Werkstatt-Insel');
    expect(loaded.scenario!.author).toBe('Christoph');
    expect(loaded.scenario!.briefing.de).toBe('Eine im Editor gebaute Insel.');
    expect(loaded.scenario!.briefing.en).toBe('An island built in the editor.');
    expect(loaded.scenario!.goals).toEqual([]);
    expect(loaded.scenario!.lockedRules).toEqual([]);

    // The command log travelled with it: a map an author built IS a command
    // log, and this is the file that carries the evidence.
    expect(loaded.queue.log.length).toBe(session.length);
    expect(loaded.queue.log.map((entry) => entry.command.kind)).toEqual([
      CommandKind.TerraformBrushRegion,
      CommandKind.PaintForest,
      CommandKind.PaintRiver,
      CommandKind.PlaceTownSeed,
    ]);
  });
});
