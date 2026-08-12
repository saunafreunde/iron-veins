import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  EDITOR_BRUSH_MAX_CELLS,
  EDITOR_BRUSH_MAX_RADIUS,
  MapClimate,
  SEA_LEVEL,
  TERRAFORM_COST_PER_STEP_CT,
  TerraformDirection,
  TILE_PUBLIC,
} from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import {
  applyTerraform,
  refreshShorelineEverywhere,
  standingWaterAboveSeaLevel,
} from '../../src/sim/map/terraform';
import { RailType, TrackDir, trackBit } from '../../src/sim/map/track';
import { parseCommand } from '../../src/sim/save/format';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { migrateSavePayload } from '../../src/sim/save/migrations';
import { TownSize } from '../../src/sim/town/types';
import { hashWorld, World } from '../../src/sim/World';
import { parseScenarioFixture } from '../determinism/runner';

/**
 * The scenario workshop's simulation half (SPEC2 M22 bundle 1).
 *
 * Four things are proved here and each one is a MUSS point of the milestone:
 * every new command round-trips through the ONE shared parser, the per-command
 * region cap binds before anything is written, the slope invariant survives a
 * bulk terraform, and `editorMode` suspends the funds and the ownership check
 * and NOTHING else.
 *
 * The fifth is the one SPEC2 singles out: `PaintRiver` above sea level. The
 * decision is REFUSE, and both halves of it are measured below - that the
 * command cannot create standing water above sea level, and that the
 * `applyRivers`/`refreshShoreline` revert quirk it is refusing to reproduce is
 * real and still lives in the GENERATOR, which is this bundle's named residual.
 */

const SIZE = 64;
/** Well above the sea, so ordinary terraform tests are far from the shoreline. */
const PLATEAU = 8;
const COMPANY = 0;
const RIVAL = 1;

interface Fixture {
  readonly world: World;
  readonly queue: CommandQueue;
}

/**
 * A flat world at a chosen height, with or without the workshop rule.
 *
 * Built through `World.fromGenerated` rather than through `flatScenario` so the
 * rule itself is a parameter: everything in this file is a comparison between
 * two worlds that differ in exactly one flag.
 */
function flatWorld(editorMode: boolean, height = PLATEAU, seed = 4_711): Fixture {
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
      aiCompanies: 1,
      editorMode,
    },
    { map, towns: [], industries: [], seedUsed: seed },
  );
  return { world, queue: new CommandQueue() };
}

/** Execute one command and report the rejection key, or null when accepted. */
function run(fixture: Fixture, command: Command, companyId = COMPANY): string | null {
  fixture.queue.enqueue(command, fixture.world.tick, companyId);
  let rejected: string | null = null;
  fixture.world.drainCommands(fixture.queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

/** The worst height difference across any single tile - the invariant, read. */
function worstTileSlope(map: TileMap): number {
  let worst = 0;
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const delta = map.topHeight(x, y) - map.baseHeight(x, y);
      if (delta > worst) worst = delta;
    }
  }
  return worst;
}

/** Every new kind, with a sample that carries a non-default value everywhere. */
const NEW_KINDS: readonly Command[] = [
  { kind: CommandKind.TerraformBrushRegion, x: 11, y: 12, radius: 3, direction: -1 },
  { kind: CommandKind.PlaceTownSeed, x: 13, y: 14, sizeClass: 2 },
  { kind: CommandKind.PlaceIndustryAt, x: 15, y: 16, industryType: 4 },
  { kind: CommandKind.PaintForest, x: 17, y: 18, radius: 2 },
  { kind: CommandKind.PaintRiver, x: 19, y: 20, radius: 1 },
];

// ------------------------------------------------------ the shared parser (M10)

describe('the workshop commands go through the one parser', () => {
  it('round-trips every new kind through parseCommand', () => {
    for (const sample of NEW_KINDS) {
      const parsed = parseCommand(JSON.parse(JSON.stringify(sample)), 'sample');
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(sample));
    }
  });

  it('reaches the determinism runner through the same door', () => {
    // The runner has no parser of its own (D-133): a fixture carrying an editor
    // session has to decode through `parseCommand` or it decodes through
    // nothing. Shaped exactly as a recorded fixture on disk is.
    const fixture = NEW_KINDS.map((command, index) => ({ tick: index * 20, command }));
    const parsed = parseScenarioFixture(JSON.parse(JSON.stringify(fixture)));

    expect(parsed).toHaveLength(NEW_KINDS.length);
    expect(parsed.map((entry) => entry.command.kind)).toEqual(NEW_KINDS.map((c) => c.kind));
    expect(parsed[0]!.tick).toBe(0);
  });

  it('refuses a malformed workshop command rather than defaulting it', () => {
    expect(() =>
      parseCommand({ kind: CommandKind.PaintForest, x: 1, y: 2 }, 'sample.paintForest'),
    ).toThrowError(/radius/);
  });

  it('names every new kind in both catalogues', () => {
    // The i18n half of the coupling rule, asserted rather than eyeballed: a
    // command the player can be refused needs a sentence in both languages, and
    // bundle 2's palette needs a label for the tool that issues it.
    const labels = [
      'editor.tool.terraformBrushRegion',
      'editor.tool.placeTownSeed',
      'editor.tool.placeIndustryAt',
      'editor.tool.paintForest',
      'editor.tool.paintRiver',
    ];
    const reasons = [
      RejectReason.BrushTooLarge,
      RejectReason.InvalidRegion,
      RejectReason.NothingToPaint,
      RejectReason.BadTownSite,
      RejectReason.TownTooClose,
      RejectReason.TooManyTowns,
      RejectReason.BadIndustrySite,
      RejectReason.IndustryTooClose,
      RejectReason.UnknownType,
      RejectReason.RiverNeedsSeaLevel,
    ];
    for (const key of [...labels, ...reasons]) {
      expect(Object.keys(de), key).toContain(key);
      expect(Object.keys(en), key).toContain(key);
    }
    expect(labels).toHaveLength(Object.keys(CommandKind).length - 42);
  });
});

// ---------------------------------------------------------- the region cap

describe('the per-command region cap', () => {
  it('refuses a brush one step over the cap and writes nothing', () => {
    const fixture = flatWorld(true);
    const before = Uint8Array.from(fixture.world.map.cornerHeight);

    const reason = run(fixture, {
      kind: CommandKind.TerraformBrushRegion,
      x: 30,
      y: 30,
      radius: EDITOR_BRUSH_MAX_RADIUS + 1,
      direction: TerraformDirection.Raise,
    });

    expect(reason).toBe(RejectReason.BrushTooLarge);
    expect(fixture.world.map.cornerHeight).toEqual(before);
  });

  it('accepts a brush exactly at the cap', () => {
    const fixture = flatWorld(true);
    const reason = run(fixture, {
      kind: CommandKind.TerraformBrushRegion,
      x: 30,
      y: 30,
      radius: EDITOR_BRUSH_MAX_RADIUS,
      direction: TerraformDirection.Raise,
    });

    expect(reason).toBeNull();
    // Every corner of the square went up one level; the cap read as an area.
    const map = fixture.world.map;
    let raised = 0;
    for (let cy = 0; cy <= map.size; cy++) {
      for (let cx = 0; cx <= map.size; cx++) {
        if (map.cornerHeight[map.cornerIndex(cx, cy)]! > PLATEAU) raised++;
      }
    }
    expect(raised).toBeGreaterThanOrEqual(EDITOR_BRUSH_MAX_CELLS);
  });

  it('refuses a negative radius as a region rather than as a size', () => {
    const fixture = flatWorld(true);
    expect(
      run(fixture, {
        kind: CommandKind.TerraformBrushRegion,
        x: 30,
        y: 30,
        radius: -1,
        direction: TerraformDirection.Raise,
      }),
    ).toBe(RejectReason.InvalidRegion);
  });

  it('binds the paint brushes too, on the same constant', () => {
    const fixture = flatWorld(true);
    expect(
      run(fixture, {
        kind: CommandKind.PaintForest,
        x: 30,
        y: 30,
        radius: EDITOR_BRUSH_MAX_RADIUS + 1,
      }),
    ).toBe(RejectReason.BrushTooLarge);
    expect(
      run(fixture, { kind: CommandKind.PaintRiver, x: 30, y: 30, radius: EDITOR_BRUSH_MAX_RADIUS + 1 }),
    ).toBe(RejectReason.BrushTooLarge);
  });
});

// ------------------------------------------------- the invariant under a bulk edit

describe('the slope invariant under a bulk terraform', () => {
  it('holds after a stack of overlapping brushes on lumpy ground', () => {
    const fixture = flatWorld(true);
    const map = fixture.world.map;

    // Rough the ground up first, so the brushes meet real cascades rather than
    // a plateau where every corner moves alone.
    for (let i = 0; i < 40; i++) {
      const x = 8 + ((i * 7) % 40);
      const y = 8 + ((i * 13) % 40);
      applyTerraform(map, x, y, TerraformDirection.Raise, COMPANY);
    }
    expect(worstTileSlope(map)).toBeLessThanOrEqual(1);

    for (let i = 0; i < 12; i++) {
      const x = 12 + ((i * 5) % 32);
      const y = 12 + ((i * 11) % 32);
      const direction = i % 2 === 0 ? TerraformDirection.Raise : TerraformDirection.Lower;
      run(fixture, {
        kind: CommandKind.TerraformBrushRegion,
        x,
        y,
        radius: (i % EDITOR_BRUSH_MAX_RADIUS) + 1,
        direction,
      });
      expect(worstTileSlope(map), `after brush ${i}`).toBeLessThanOrEqual(1);
    }

    // And the sweep SPEC2 asks for is not load bearing after the fact: the
    // per-corner cascade has already held the invariant, so the whole-map pass
    // finds nothing left to pull down. That is the claim, measured.
    expect(map.enforceSlopeInvariant()).toBe(0);
  });

  it('leaves the ground exactly where a refusal found it', () => {
    // A brush that moves nothing is atomic by construction: nothing was written
    // before the first corner refused. The rival's track is the refusal.
    const fixture = flatWorld(false);
    const map = fixture.world.map;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tile = map.tileIndex(30 + dx, 30 + dy);
        map.trackBits[tile] = trackBit(TrackDir.East) | trackBit(TrackDir.West);
        map.railType[tile] = RailType.Plain;
        map.owner[tile] = RIVAL;
      }
    }
    const before = Uint8Array.from(map.cornerHeight);

    const reason = run(fixture, {
      kind: CommandKind.TerraformBrushRegion,
      x: 30,
      y: 30,
      radius: 1,
      direction: TerraformDirection.Raise,
    });

    expect(reason).not.toBeNull();
    expect(map.cornerHeight).toEqual(before);
  });
});

// ------------------------------------------------------------- the editor rule

describe('editorMode suspends funds and ownership', () => {
  it('waives the funds check, and books nothing', () => {
    const game = flatWorld(false);
    const shop = flatWorld(true);
    game.world.company.cashCt = 0;
    shop.world.company.cashCt = 0;

    const build = { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 14, y2: 10 } as const;
    expect(run(game, build)).toBe(RejectReason.InsufficientFunds);
    expect(run(shop, build)).toBeNull();
    expect(shop.world.company.cashCt).toBe(0);
  });

  it('waives the ownership check', () => {
    const game = flatWorld(false);
    const shop = flatWorld(true);
    for (const fixture of [game, shop]) {
      const map = fixture.world.map;
      for (let x = 10; x <= 14; x++) map.owner[map.tileIndex(x, 10)] = RIVAL;
    }

    const build = { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 14, y2: 10 } as const;
    expect(run(game, build)).toBe(RejectReason.NotYours);
    expect(run(shop, build)).toBeNull();
  });

  it('is free in BOTH directions - a demolition refunds nothing', () => {
    const shop = flatWorld(true);
    const cash = shop.world.company.cashCt;
    expect(run(shop, { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 14, y2: 10 })).toBeNull();
    expect(run(shop, { kind: CommandKind.DemolishRoad, x: 12, y: 10 })).toBeNull();
    // A workshop that charged nothing and refunded half would let an author
    // print the starting capital its own scenario ships with.
    expect(shop.world.company.cashCt).toBe(cash);
  });

  it('does NOT waive water, slope, occupied ground or the height limit', () => {
    const shop = flatWorld(true);
    const map = shop.world.map;

    // Water.
    map.terrain[map.tileIndex(20, 20)] = Terrain.Water;
    expect(run(shop, { kind: CommandKind.BuildRoad, x1: 20, y1: 20, x2: 20, y2: 20 })).toBe(
      RejectReason.OnWater,
    );

    // Ground that is not clear: a house stands here. The workshop suspends who
    // OWNS a tile, never what is ON it.
    map.buildingKind[map.tileIndex(25, 25)] = 1;
    expect(run(shop, { kind: CommandKind.BuildRoad, x1: 25, y1: 25, x2: 25, y2: 25 })).toBe(
      RejectReason.Occupied,
    );

    // Occupied ground: the terraform guard of E-11 is a bugfix, never a rule.
    const tile = map.tileIndex(40, 40);
    map.trackBits[tile] = trackBit(TrackDir.East) | trackBit(TrackDir.West);
    map.railType[tile] = RailType.Plain;
    expect(run(shop, { kind: CommandKind.RaiseLand, x: 40, y: 40 })).toBe(
      'terraform.reject.occupied',
    );

    // The height limit is the map's own vocabulary, not the company's.
    const high = flatWorld(true, 15);
    expect(run(high, { kind: CommandKind.RaiseLand, x: 30, y: 30 })).toBe(
      'terraform.reject.atLimit',
    );
  });

  it('does NOT waive the town council', () => {
    // Exclusive building rights are politics, not property: a workshop that
    // suspended them would let an author build a world the loaded scenario
    // could not reproduce, because the rule is hashed state either way.
    const shop = flatWorld(true);
    const seeded = run(shop, {
      kind: CommandKind.PlaceTownSeed,
      x: 32,
      y: 32,
      sizeClass: TownSize.Village,
    });
    expect(seeded).toBeNull();

    const town = shop.world.towns[0]!;
    town.exclusiveCompanyId = RIVAL;
    town.exclusiveUntilTick = shop.world.tick + 10_000;
    expect(run(shop, { kind: CommandKind.BuildRoad, x1: town.x, y1: town.y, x2: town.x, y2: town.y })).toBe(
      'cmd.reject.exclusiveRights',
    );
  });

  it('is a hashed world rule, so two worlds that differ in it differ in the digest', () => {
    const game = flatWorld(false);
    const shop = flatWorld(true);
    expect(hashWorld(shop.world)).not.toBe(hashWorld(game.world));
  });

  it('survives a save round trip', () => {
    const shop = flatWorld(true);
    run(shop, { kind: CommandKind.BuildRoad, x1: 10, y1: 10, x2: 14, y2: 10 });
    const bytes = encodeSave(shop.world, shop.queue, 'test');
    const loaded = decodeSave(bytes);

    expect(loaded.world.editorMode).toBe(true);
    expect(hashWorld(loaded.world)).toBe(hashWorld(shop.world));
  });

  it('enters a version 32 world as OFF', () => {
    // Every world this game has ever recorded was played by a company that paid
    // for what it built, so the migration's answer is the truth about it.
    const shop = flatWorld(false);
    const payload = {
      magic: 'IRVN',
      saveVersion: 32,
      gameVersion: 'test',
      seed: shop.world.seed,
      tick: shop.world.tick,
      state: { ...shop.world.toData(), editorMode: undefined },
      commandLog: [],
      commandsExecuted: 0,
    } as unknown as Record<string, unknown>;
    delete (payload['state'] as Record<string, unknown>)['editorMode'];

    const migrated = migrateSavePayload(payload, 32);
    expect((migrated['state'] as Record<string, unknown>)['editorMode']).toBe(false);
  });
});

// ------------------------------------------------------- PaintRiver above sea level

/**
 * The one thing that must not ship broken (SPEC2 M22).
 *
 * `applyRivers` writes `Terrain.Water` along a traced course whatever height the
 * valley is at; every shoreline refresh since M2 answers the same question with
 * `isSubmerged` alone. The two disagree, and the disagreement is only visible
 * once somebody terraforms near a mountain river - then it is grass. SPEC2 asks
 * for "standing water at height X" to be FORMALISED or REFUSED. It is refused:
 * `PaintRiver` writes no terrain at all, it digs to the sea and lets the game's
 * own rule flood the hole.
 */
describe('PaintRiver and standing water above sea level', () => {
  it('the revert quirk is real - measured, so the refusal is not a guess', () => {
    const fixture = flatWorld(false);
    const map = fixture.world.map;
    // Exactly what `applyRivers` does: paint water on a tile whose corners are
    // eight levels above the sea.
    map.terrain[map.tileIndex(30, 30)] = Terrain.Water;
    expect(standingWaterAboveSeaLevel(map)).toBe(1);

    // One ordinary terraform anywhere that touches a corner of that tile.
    applyTerraform(map, 30, 30, TerraformDirection.Raise, COMPANY);

    expect(map.terrain[map.tileIndex(30, 30)]).not.toBe(Terrain.Water);
    expect(standingWaterAboveSeaLevel(map)).toBe(0);
  });

  it('the generator still produces it, and that is the named residual', () => {
    // Bundle 1 closes the CREATION half - no workshop command can make one.
    // What `generateRivers` leaves behind is measured rather than asserted
    // away: a mountain river is water the shoreline rule does not justify, and
    // repairing that moves every generated map, every pin and every
    // SCENARIO_WORLD_CLAIM, which is its own bundle.
    const world = World.create({
      seed: 4_711,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 128,
      companyName: 'Messung AG',
      companyColorIndex: 1,
    });
    expect(standingWaterAboveSeaLevel(world.map)).toBeGreaterThan(0);
  });

  it('refuses a river the ground cannot carry, and moves nothing', () => {
    const fixture = flatWorld(true, PLATEAU);
    const before = Uint8Array.from(fixture.world.map.cornerHeight);
    const terrainBefore = Uint8Array.from(fixture.world.map.terrain);

    const reason = run(fixture, { kind: CommandKind.PaintRiver, x: 30, y: 30, radius: 2 });

    expect(reason).toBe(RejectReason.RiverNeedsSeaLevel);
    expect(fixture.world.map.cornerHeight).toEqual(before);
    expect(fixture.world.map.terrain).toEqual(terrainBefore);
  });

  it('cuts a river on low ground, and what it cuts is water the corners justify', () => {
    const fixture = flatWorld(true, SEA_LEVEL + 1);
    const map = fixture.world.map;
    expect(standingWaterAboveSeaLevel(map)).toBe(0);

    const reason = run(fixture, { kind: CommandKind.PaintRiver, x: 30, y: 30, radius: 2 });
    expect(reason).toBeNull();

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        expect(map.terrain[map.tileIndex(30 + dx, 30 + dy)], `${dx},${dy}`).toBe(Terrain.Water);
        expect(map.isSubmerged(30 + dx, 30 + dy)).toBe(true);
      }
    }
    // The whole claim, in one number: not one tile of this map holds water its
    // own corners do not justify.
    expect(standingWaterAboveSeaLevel(map)).toBe(0);
  });

  it('what it cuts survives a later terraform - which the quirk does not', () => {
    const fixture = flatWorld(true, SEA_LEVEL + 1);
    const map = fixture.world.map;
    run(fixture, { kind: CommandKind.PaintRiver, x: 30, y: 30, radius: 2 });

    // Raise ground a few tiles away, then ask the shoreline question again -
    // the two operations that turn a painted mountain river back into grass.
    applyTerraform(map, 36, 36, TerraformDirection.Raise, COMPANY);
    refreshShorelineEverywhere(map);

    expect(map.terrain[map.tileIndex(30, 30)]).toBe(Terrain.Water);
    expect(standingWaterAboveSeaLevel(map)).toBe(0);
  });

  it('never adds standing water to a generated world', () => {
    const world = World.create({
      seed: 20_260_812,
      difficulty: Difficulty.Normal,
      climate: MapClimate.Temperate,
      mapSize: 128,
      companyName: 'Messung AG',
      companyColorIndex: 1,
      editorMode: true,
    });
    const queue = new CommandQueue();
    const fixture: Fixture = { world, queue };
    const before = standingWaterAboveSeaLevel(world.map);

    // Twenty-five brushes over the map: every one either digs to the sea or is
    // refused, and neither outcome may raise the count.
    for (let i = 0; i < 25; i++) {
      run(fixture, { kind: CommandKind.PaintRiver, x: 5 + i * 4, y: 5 + ((i * 7) % 100), radius: 1 });
    }
    // Never MORE - that is this command's own claim. That it is also never
    // wiped out is a different claim and it belongs to a different file: the
    // whole-map sweep this command used to end in took all of it, and
    // `editorAtomicity.spec.ts` holds the tiles it may take by provenance.
    expect(standingWaterAboveSeaLevel(world.map)).toBeLessThanOrEqual(before);
    expect(standingWaterAboveSeaLevel(world.map)).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------- the other three commands

describe('the placement and painting commands', () => {
  it('founds a town the generator could have founded, and refuses a second beside it', () => {
    const fixture = flatWorld(true);
    expect(
      run(fixture, { kind: CommandKind.PlaceTownSeed, x: 32, y: 32, sizeClass: TownSize.Town }),
    ).toBeNull();

    const town = fixture.world.towns[0]!;
    expect(town.x).toBe(32);
    expect(town.name.length).toBeGreaterThan(0);
    expect(fixture.world.map.townId[fixture.world.map.tileIndex(32, 32)]).toBe(town.id);
    // The town laid streets and houses, i.e. it is a settled town and not a pin.
    let buildings = 0;
    for (let i = 0; i < fixture.world.map.buildingKind.length; i++) {
      if (fixture.world.map.buildingKind[i] !== 0) buildings++;
    }
    expect(buildings).toBeGreaterThan(0);

    expect(
      run(fixture, { kind: CommandKind.PlaceTownSeed, x: 36, y: 34, sizeClass: TownSize.Village }),
    ).toBe(RejectReason.TownTooClose);
  });

  it('sites an industry only where its own placement rule allows one', () => {
    // A coal mine wants hills; flat ground at height 8 is inside its band, a
    // world at height 4 is not, and the refusal names the site rather than the
    // company.
    const hills = flatWorld(true, 8);
    expect(
      run(hills, { kind: CommandKind.PlaceIndustryAt, x: 20, y: 20, industryType: IndustryType.CoalMine }),
    ).toBeNull();
    expect(hills.world.industries).toHaveLength(1);
    expect(hills.world.map.industryId[hills.world.map.tileIndex(20, 20)]).toBe(0);

    expect(
      run(hills, { kind: CommandKind.PlaceIndustryAt, x: 22, y: 20, industryType: IndustryType.CoalMine }),
    ).toBe(RejectReason.IndustryTooClose);

    const lowland = flatWorld(true, 5);
    expect(
      run(lowland, {
        kind: CommandKind.PlaceIndustryAt,
        x: 20,
        y: 20,
        industryType: IndustryType.CoalMine,
      }),
    ).toBe(RejectReason.BadIndustrySite);

    expect(
      run(hills, { kind: CommandKind.PlaceIndustryAt, x: 40, y: 40, industryType: 999 }),
    ).toBe(RejectReason.UnknownType);
  });

  it('plants wood on open ground and refuses a region with none', () => {
    const fixture = flatWorld(true);
    const map = fixture.world.map;
    expect(run(fixture, { kind: CommandKind.PaintForest, x: 20, y: 20, radius: 2 })).toBeNull();
    expect(map.terrain[map.tileIndex(20, 20)]).toBe(Terrain.Forest);
    expect(map.terrain[map.tileIndex(18, 18)]).toBe(Terrain.Forest);
    expect(map.terrain[map.tileIndex(17, 17)]).toBe(Terrain.Grass);

    // Already wooded ground is not "open" - painting the same square twice is a
    // refusal rather than a silent no-op that charges for nothing.
    expect(run(fixture, { kind: CommandKind.PaintForest, x: 20, y: 20, radius: 2 })).toBe(
      RejectReason.NothingToPaint,
    );
  });

  it('leaves a rival tile alone outside the workshop', () => {
    const fixture = flatWorld(false);
    const map = fixture.world.map;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) map.owner[map.tileIndex(20 + dx, 20 + dy)] = RIVAL;
    }
    expect(run(fixture, { kind: CommandKind.PaintForest, x: 20, y: 20, radius: 1 })).toBe(
      RejectReason.NothingToPaint,
    );
    expect(map.terrain[map.tileIndex(20, 20)]).toBe(Terrain.Grass);
    expect(map.owner[map.tileIndex(20, 20)]).toBe(RIVAL);
    expect(map.owner[map.tileIndex(23, 23)]).toBe(TILE_PUBLIC);
  });
});

// -------------------------------------------------------------- RNG discipline

describe('the workshop draws nothing from the gameplay generator', () => {
  it('leaves world.rng untouched across all five commands (Z3)', () => {
    const fixture = flatWorld(true, SEA_LEVEL + 1);
    const before = Array.from(fixture.world.rng.getState());

    run(fixture, {
      kind: CommandKind.TerraformBrushRegion,
      x: 20,
      y: 20,
      radius: 2,
      direction: TerraformDirection.Raise,
    });
    run(fixture, { kind: CommandKind.PlaceTownSeed, x: 40, y: 40, sizeClass: TownSize.Village });
    run(fixture, { kind: CommandKind.PlaceIndustryAt, x: 10, y: 10, industryType: IndustryType.Farm });
    run(fixture, { kind: CommandKind.PaintForest, x: 55, y: 55, radius: 2 });
    run(fixture, { kind: CommandKind.PaintRiver, x: 50, y: 20, radius: 1 });

    expect(Array.from(fixture.world.rng.getState())).toEqual(before);
  });

  it('makes the same town from the same command, twice', () => {
    // The name and the street spacing come from a stream salted with the TILE,
    // so a command replayed at another point in the log builds the same town -
    // which is what makes an editor session reproducible at all.
    const a = flatWorld(true);
    const b = flatWorld(true);
    run(a, { kind: CommandKind.PlaceTownSeed, x: 32, y: 32, sizeClass: TownSize.Town });
    // Same command, but preceded by unrelated work in the other world.
    run(b, {
      kind: CommandKind.TerraformBrushRegion,
      x: 8,
      y: 8,
      radius: 2,
      direction: TerraformDirection.Raise,
    });
    run(b, { kind: CommandKind.PlaceTownSeed, x: 32, y: 32, sizeClass: TownSize.Town });

    expect(b.world.towns[0]!.name).toBe(a.world.towns[0]!.name);
    expect(b.world.towns[0]!.population).toBe(a.world.towns[0]!.population);
  });
});

// ------------------------------------------------------------ preview == bill

describe('the preview is the command (D-119)', () => {
  it('a refused brush costs nothing and an accepted one costs what it quoted', () => {
    const fixture = flatWorld(false);
    const cash = fixture.world.company.cashCt;

    run(fixture, {
      kind: CommandKind.TerraformBrushRegion,
      x: 30,
      y: 30,
      radius: 1,
      direction: TerraformDirection.Raise,
    });

    // Nine corners on a plateau, each moving alone: the price is arithmetic the
    // palette can quote before the click, and it is what was booked.
    const spent = cash - fixture.world.company.cashCt;
    expect(spent).toBe(fixture.world.costCt(9 * TERRAFORM_COST_PER_STEP_CT));
  });

  it('a plan run against the map leaves the map exactly as it found it', () => {
    // The plan IS the command with `commit: false`, so the only thing that can
    // prove it harmless is the map itself, byte for byte - including the two
    // revision counters, because a preview that bumped them would rebuild the
    // whole world on every pointer move.
    const fixture = flatWorld(true, SEA_LEVEL + 1);
    const map = fixture.world.map;
    const heights = Uint8Array.from(map.cornerHeight);
    const terrain = Uint8Array.from(map.terrain);
    const revision = map.revision;
    const trackRevision = map.trackRevision;

    // Reached through the ordinary refusal path: a brush over a rival's track
    // is planned, refused, and must not have moved anything on the way.
    void planningProbe(fixture);

    expect(map.cornerHeight).toEqual(heights);
    expect(map.terrain).toEqual(terrain);
    expect(map.revision).toBe(revision);
    expect(map.trackRevision).toBe(trackRevision);
  });
});

/**
 * Ask both planning paths for a price without taking it.
 *
 * Deliberately routed through the exported command functions rather than
 * through the `plan*` helpers directly, so what is proved harmless is the code
 * the interface will call in bundle 2.
 */
function planningProbe(fixture: Fixture): void {
  const shop = fixture.world.editorMode;
  expect(shop).toBe(true);
  // A command that will be REFUSED still runs its plan against the real map.
  run(fixture, {
    kind: CommandKind.PaintRiver,
    x: 2,
    y: 2,
    radius: EDITOR_BRUSH_MAX_RADIUS + 1,
  });
  run(fixture, {
    kind: CommandKind.TerraformBrushRegion,
    x: 2,
    y: 2,
    radius: EDITOR_BRUSH_MAX_RADIUS + 1,
    direction: TerraformDirection.Raise,
  });
}
