import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, RejectReason, type Command } from '../../src/sim/commands/types';
import { patchCommand, UNDOABLE_KINDS, type RecordedPatch } from '../../src/sim/commands/undo';
import {
  Difficulty,
  MapClimate,
  SEA_LEVEL,
  TerraformDirection,
  TICKS_PER_MONTH,
  TILE_PUBLIC,
} from '../../src/sim/constants';
import { RailType } from '../../src/sim/map/track';
import { Terrain } from '../../src/sim/map/terrain';
import { estimateTerraform } from '../../src/sim/map/terraform';
import { roadBuildableAt } from '../../src/sim/net/roadBuilder';
import { planTrack } from '../../src/sim/net/trackBuilder';
import type { TileMap } from '../../src/sim/map/TileMap';
import { hashWorld, World } from '../../src/sim/World';

/**
 * "undone == never-done", as a hash assertion (SPEC2 M25, E-12).
 *
 * This is the milestone's own acceptance clause and it is deliberately not one
 * test: a mechanism that restores a road tile and forgets the ledger row is
 * green on a road test and wrong on the game. So it runs over EVERY undoable
 * kind, including the two cases the clause names by hand - a terraform whose
 * cascade pulled corners the command never named, and an undo that must be
 * REFUSED because the world moved underneath it - and it compares two things
 * rather than one:
 *
 *  - `hashWorld`, which is what the determinism suite, the cross-OS pin and
 *    the replay verifier all mean by "the same world";
 *  - a fingerprint over EVERY typed-array layer of the map (walked off the
 *    object, so a layer added later is covered without anybody remembering),
 *    the two revision counters, the entity counts and the company's cash. That
 *    is what catches the layers `hashWorld` deliberately does not cover -
 *    `oceanMask` and `landmassId` are derived, and an undo that restored the
 *    heights and left the land masses stale would pass a hash test and route
 *    ships into a continent that is not there.
 *
 * Both are taken BEFORE the command and again after the undo, with no tick in
 * between, so "the world where the build never happened" is not a second world
 * that has to be argued to be comparable - it is this one, a moment earlier.
 * The literal Fertig-wenn sentence ("Kommandolog verschieden, Welt-Hash
 * identisch") is the fifty-command test at the bottom, which really does play
 * two worlds.
 */

const SIZE = 128;
const SEED = 20_260_812;

function createWorld(): World {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: SIZE,
    companyName: 'Rueckbau AG',
    companyColorIndex: 1,
  });
  // Recording is opt-in (a quarter century of AI building is a diff nobody
  // will ever undo); an interactive session turns it on in `adoptWorld`.
  world.undo.enabled = true;
  return world;
}

/** Every typed-array layer of the map, in a total order (law #3 for tests too). */
function layersOf(map: TileMap): readonly (readonly [string, ArrayLike<number>])[] {
  const entries: [string, ArrayLike<number>][] = [];
  const source = map as unknown as Record<string, unknown>;
  for (const key of Object.keys(source).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const value = source[key];
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      entries.push([key, value as unknown as ArrayLike<number>]);
    }
  }
  return entries;
}

/** Everything an undoable command could have moved, as one comparable string. */
function fingerprint(world: World): string {
  const parts: string[] = [];
  for (const [name, layer] of layersOf(world.map)) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < layer.length; i++) {
      hash ^= layer[i]! & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (layer[i]! >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
    parts.push(`${name}=${(hash >>> 0).toString(16)}`);
  }
  const company = world.companies[0]!;
  // The two revision counters are deliberately NOT here. They are the
  // renderer's "something moved" flags - never saved, never hashed, monotone -
  // and an undo has to move them FORWARD so the sprites and the block index
  // rebuild. Putting them back would be the one restoration that is wrong; the
  // test below asserts they went up instead.
  parts.push(`towns=${world.towns.length}`);
  parts.push(`stations=${world.stations.length}`);
  parts.push(`cash=${company.cashCt}`);
  parts.push(`assets=${company.fixedAssetsCt}`);
  parts.push(`upkeep=${company.infrastructureUpkeepPerYearCt}`);
  parts.push(`accounts=${company.accounts.join(',')}`);
  parts.push(`hash=${hashWorld(world)}`);
  return parts.join(' ');
}

/** One command through the real queue and the real executor; the refusal or null. */
function run(world: World, queue: CommandQueue, command: Command): string | null {
  queue.enqueue(command, world.tick, 0);
  let rejected: string | null = null;
  world.drainCommands(queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

/** Apply a recorded patch in a direction, through the ordinary queue. */
function applyRecorded(
  world: World,
  queue: CommandQueue,
  patch: RecordedPatch,
  direction: number,
): string | null {
  return run(world, queue, patchCommand(patch, direction));
}

/** The entry the ring would offer Ctrl+Z next, taken off it. */
function popUndo(world: World): RecordedPatch {
  const patch = world.undo.undoStack.pop();
  expect(patch, 'the ring recorded nothing for this command').toBeDefined();
  return patch!;
}

// ------------------------------------------------------------ finding ground
//
// The world is GENERATED rather than hand-built, because a flat plain cannot
// produce the case the clause names: on level ground a terraform moves exactly
// the corner it was given and the cascade never fires. Everything below scans
// the real map for what each command needs, and every scan fails loudly rather
// than skipping - a case that quietly found no site would be a green test that
// asserts nothing.

/** Straight runs of `length` tiles a road may be laid along, on distinct rows. */
function findRoadRuns(map: TileMap, length: number, count: number): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  for (let y = 4; y < map.size - 4 && found.length < count; y += 3) {
    for (let x = 4; x < map.size - 4 - length; x++) {
      let ok = true;
      for (let i = 0; i < length && ok; i++) {
        const index = map.tileIndex(x + i, y);
        ok =
          roadBuildableAt(map, x + i, y) === null &&
          map.roadBits[index] === 0 &&
          map.trackBits[index] === 0 &&
          map.owner[index] === TILE_PUBLIC &&
          map.terrain[index] !== Terrain.TownGround;
      }
      if (ok) {
        found.push({ x, y });
        break;
      }
    }
  }
  return found;
}

/** Straight runs the route assistant lays plain track along, on distinct rows. */
function findTrackRuns(map: TileMap, length: number, count: number): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  for (let y = 4; y < map.size - 4 && found.length < count; y += 3) {
    for (let x = 4; x < map.size - 4 - length; x++) {
      const planned = planTrack(map, x, y, x + length - 1, y, RailType.Plain, false);
      if (!planned.ok) continue;
      let clear = true;
      for (const tile of planned.route.tiles) {
        if (map.owner[tile] !== TILE_PUBLIC || map.trackBits[tile] !== 0) clear = false;
      }
      if (clear && planned.route.structures.every((s) => s === 0)) {
        found.push({ x, y });
        break;
      }
    }
  }
  return found;
}

/**
 * A corner whose raise really does drag its neighbours along.
 *
 * `minCorners` is what makes this the clause's own case rather than a
 * single-corner edit that happens to be called a cascade.
 */
function findCascade(map: TileMap, minCorners: number): { x: number; y: number } | null {
  for (let y = 2; y < map.size - 2; y++) {
    for (let x = 2; x < map.size - 2; x++) {
      const estimate = estimateTerraform(map, x, y, TerraformDirection.Raise, 0);
      if (estimate.ok && estimate.changedCorners >= minCorners) return { x, y };
    }
  }
  return null;
}

/** A corner at the water's edge whose lowering moves the shoreline. */
function findShoreCorner(map: TileMap): { x: number; y: number } | null {
  const stride = map.size + 1;
  for (let y = 2; y < map.size - 2; y++) {
    for (let x = 2; x < map.size - 2; x++) {
      if (map.cornerHeight[y * stride + x] !== SEA_LEVEL + 1) continue;
      let touchesWater = false;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          if (map.terrain[map.tileIndex(x + dx, y + dy)] === Terrain.Water) touchesWater = true;
        }
      }
      if (!touchesWater) continue;
      const estimate = estimateTerraform(map, x, y, TerraformDirection.Lower, 0);
      if (estimate.ok) return { x, y };
    }
  }
  return null;
}

// ------------------------------------------------------------------ the cases

interface UndoCase {
  readonly name: string;
  readonly kind: number;
  /** Run before the measurement; whatever it does is part of "never-done". */
  readonly setup?: readonly Command[];
  readonly command: Command;
  /** Extra claim about the recorded patch, checked before it is applied. */
  readonly check?: (patch: RecordedPatch, world: World) => void;
}

function buildCases(world: World): UndoCase[] {
  const map = world.map;
  // Every case gets its OWN ground. They run in order against one world and a
  // case's SETUP stays behind (only the measured command is taken back), so
  // two cases sharing a row would have the second one refused as `nothingToDo`
  // - green-looking geometry that tests nothing.
  const roads = findRoadRuns(map, 6, 4);
  const tracks = findTrackRuns(map, 6, 4);
  const cascade = findCascade(map, 3);
  const shore = findShoreCorner(map);
  expect(roads.length, 'four clear road runs on this map').toBe(4);
  expect(tracks.length, 'four clear track runs on this map').toBe(4);
  expect(cascade, 'no terraform cascade on this map').not.toBeNull();
  expect(shore, 'no shoreline corner on this map').not.toBeNull();

  const c = cascade!;
  const s = shore!;
  const roadAt = (index: number): Command => ({
    kind: CommandKind.BuildRoad,
    x1: roads[index]!.x,
    y1: roads[index]!.y,
    x2: roads[index]!.x + 5,
    y2: roads[index]!.y,
  });
  const trackAt = (index: number): Command => ({
    kind: CommandKind.BuildTrack,
    x1: tracks[index]!.x,
    y1: tracks[index]!.y,
    x2: tracks[index]!.x + 5,
    y2: tracks[index]!.y,
    railType: RailType.Plain,
    assistant: false,
    signalSpacing: 0,
  });
  const signalAt = (index: number): Command => ({
    kind: CommandKind.BuildSignal,
    x: tracks[index]!.x + 2,
    y: tracks[index]!.y,
    signalKind: 1,
    direction: 2,
  });

  return [
    {
      name: 'RaiseLand with a cascade that pulled corners it never named',
      kind: CommandKind.RaiseLand,
      command: { kind: CommandKind.RaiseLand, x: c.x, y: c.y },
      check: (patch) => {
        const corners = patch.layers.filter((layer) => layer === 0).length;
        expect(corners, 'the cascade moved only the named corner').toBeGreaterThan(1);
      },
    },
    {
      name: 'LowerLand at the water line, where the shoreline itself moves',
      kind: CommandKind.LowerLand,
      command: { kind: CommandKind.LowerLand, x: s.x, y: s.y },
      check: (patch) => {
        expect(patch.shoreline, 'lowering the shore did not flag the derived layers').toBe(true);
      },
    },
    {
      name: 'LevelLand, which is many single lowerings in one command',
      kind: CommandKind.LevelLand,
      command: { kind: CommandKind.LevelLand, x: c.x + 1, y: c.y + 1 },
    },
    {
      name: 'TerraformBrushRegion, the largest edit one command can make',
      kind: CommandKind.TerraformBrushRegion,
      command: {
        kind: CommandKind.TerraformBrushRegion,
        x: c.x,
        y: c.y,
        radius: 2,
        direction: TerraformDirection.Raise,
      },
    },
    {
      name: 'BuildRoad, which claims tiles and repaints terrain',
      kind: CommandKind.BuildRoad,
      command: roadAt(0),
    },
    {
      name: 'DemolishRoad, which unclaims a tile and refunds half',
      kind: CommandKind.DemolishRoad,
      setup: [roadAt(1)],
      command: { kind: CommandKind.DemolishRoad, x: roads[1]!.x + 2, y: roads[1]!.y },
    },
    {
      name: 'BuildTrack, six tiles of plain line',
      kind: CommandKind.BuildTrack,
      command: trackAt(0),
    },
    {
      name: 'DemolishTrack, which clears the neighbours it was joined to',
      kind: CommandKind.DemolishTrack,
      setup: [trackAt(1)],
      command: { kind: CommandKind.DemolishTrack, x: tracks[1]!.x + 3, y: tracks[1]!.y },
    },
    {
      name: 'BuildSignal on plain line',
      kind: CommandKind.BuildSignal,
      setup: [trackAt(2)],
      command: signalAt(2),
    },
    {
      name: 'DemolishSignal, which refunds and drops the upkeep',
      kind: CommandKind.DemolishSignal,
      setup: [trackAt(3), signalAt(3)],
      command: { kind: CommandKind.DemolishSignal, x: tracks[3]!.x + 2, y: tracks[3]!.y },
    },
    {
      name: 'BuildWaypoint on a road tile',
      kind: CommandKind.BuildWaypoint,
      setup: [roadAt(2)],
      command: { kind: CommandKind.BuildWaypoint, x: roads[2]!.x + 4, y: roads[2]!.y },
    },
    {
      name: 'DemolishWaypoint',
      kind: CommandKind.DemolishWaypoint,
      setup: [
        roadAt(3),
        { kind: CommandKind.BuildWaypoint, x: roads[3]!.x + 4, y: roads[3]!.y },
      ],
      command: { kind: CommandKind.DemolishWaypoint, x: roads[3]!.x + 4, y: roads[3]!.y },
    },
  ];
}

describe('undone == never-done, for every undoable kind', () => {
  const world = createWorld();
  const queue = new CommandQueue();
  const cases = buildCases(world);

  it('covers every kind the ring records, and nothing else', () => {
    // The case list and `UNDOABLE_KINDS` are held against each other in both
    // directions: a kind that becomes undoable without a case here would ship
    // its own inverse untested, and a case for a kind the ring does not record
    // would assert nothing at all.
    const covered = [...new Set(cases.map((entry) => entry.kind))].sort((a, b) => a - b);
    expect(covered).toEqual([...UNDOABLE_KINDS].sort((a, b) => a - b));
  });

  for (const entry of cases) {
    it(entry.name, () => {
      for (const command of entry.setup ?? []) {
        expect(run(world, queue, command), `setup for ${entry.name}`).toBeNull();
        world.undo.undoStack.pop();
      }

      const neverDoneHash = hashWorld(world);
      const neverDoneFingerprint = fingerprint(world);

      expect(run(world, queue, entry.command), entry.name).toBeNull();
      const done = hashWorld(world);
      // Non-vacuity: an undo that restores nothing is trivially exact.
      expect(done, 'the command changed nothing at all').not.toBe(neverDoneHash);

      const patch = popUndo(world);
      entry.check?.(patch, world);
      const revisionBefore = world.map.revision;
      expect(applyRecorded(world, queue, patch, -1), 'the undo was refused').toBeNull();

      expect(hashWorld(world)).toBe(neverDoneHash);
      expect(fingerprint(world)).toBe(neverDoneFingerprint);
      // The one thing an undo must NOT put back: the renderer's own counters.
      // The sprites, the chunk textures and the block index all key on them.
      expect(world.map.revision).toBeGreaterThan(revisionBefore);

      // And the redo puts exactly the same world back - the same payload read
      // the other way round, which is what makes redo a second reading rather
      // than a second recording.
      expect(applyRecorded(world, queue, patch, 1), 'the redo was refused').toBeNull();
      expect(hashWorld(world)).toBe(done);
      expect(applyRecorded(world, queue, patch, -1), 'the second undo was refused').toBeNull();
      expect(hashWorld(world)).toBe(neverDoneHash);
    });
  }
});

describe('an undo the world has moved underneath is refused whole', () => {
  it('refuses a stale patch and writes not one byte', () => {
    const world = createWorld();
    const queue = new CommandQueue();
    const r = findRoadRuns(world.map, 6, 1)[0]!;

    expect(
      run(world, queue, { kind: CommandKind.BuildRoad, x1: r.x, y1: r.y, x2: r.x + 5, y2: r.y }),
    ).toBeNull();
    const road = popUndo(world);

    // The case the guard exists for, and the reason the patch carries the
    // CONTEXT of the tiles it names rather than only the cells it moved: the
    // waypoint changes no cell of the road patch at all. Without the guard the
    // undo would happily pull the road out from under the marker and leave a
    // roadside sign standing in a field - a state no command of this game can
    // produce.
    expect(
      run(world, queue, { kind: CommandKind.BuildWaypoint, x: r.x + 3, y: r.y }),
      'the waypoint was refused, so the case never arose',
    ).toBeNull();
    world.undo.undoStack.pop();

    const before = fingerprint(world);
    expect(applyRecorded(world, queue, road, -1)).toBe(RejectReason.PatchStale);
    expect(fingerprint(world), 'a refused undo wrote something').toBe(before);

    // And it is not a permanent refusal dressed up as one: take the waypoint
    // away again and the very same patch applies.
    expect(
      run(world, queue, { kind: CommandKind.DemolishWaypoint, x: r.x + 3, y: r.y }),
    ).toBeNull();
    world.undo.undoStack.pop();
    expect(applyRecorded(world, queue, road, -1)).toBeNull();
  });

  it('refuses to put money back into a month that has closed', () => {
    const world = createWorld();
    const queue = new CommandQueue();
    const r = findRoadRuns(world.map, 6, 1)[0]!;
    expect(
      run(world, queue, { kind: CommandKind.BuildRoad, x1: r.x, y1: r.y, x2: r.x + 5, y2: r.y }),
    ).toBeNull();
    const patch = popUndo(world);

    while (world.tick < TICKS_PER_MONTH + 1) world.step(queue, null);

    const before = fingerprint(world);
    expect(applyRecorded(world, queue, patch, -1)).toBe(RejectReason.PatchMonthClosed);
    expect(fingerprint(world), 'a refused undo wrote something').toBe(before);
  });
});

describe('fifty builds and a full undo reach the world that never built', () => {
  /**
   * SPEC2 M25's Fertig-wenn, taken literally: two worlds, one of which
   * executed a hundred commands and the other none, ending on the same
   * `hashWorld`. The commands all run inside the first game day, so no daily
   * or monthly hook falls between the two arms and the comparison is about the
   * builds alone.
   */
  function road(map: TileMap, index: number): Command | null {
    const y = 6 + index * 2;
    if (y >= map.size - 6) return null;
    for (let x = 4; x < map.size - 12; x++) {
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        const tile = map.tileIndex(x + i, y);
        ok =
          roadBuildableAt(map, x + i, y) === null &&
          map.roadBits[tile] === 0 &&
          map.trackBits[tile] === 0 &&
          map.owner[tile] === TILE_PUBLIC;
      }
      if (ok) return { kind: CommandKind.BuildRoad, x1: x, y1: y, x2: x + 3, y2: y };
    }
    return null;
  }

  it('ends on the identical world hash with a different command log', () => {
    const built = createWorld();
    const untouched = createWorld();
    const builtQueue = new CommandQueue();
    const untouchedQueue = new CommandQueue();

    let laid = 0;
    for (let index = 0; laid < 50 && index < 60; index++) {
      const command = road(built.map, index);
      if (command === null) continue;
      if (run(built, builtQueue, command) === null) laid++;
    }
    expect(laid, 'fifty roads could not be laid on this map').toBe(50);

    while (built.undo.undoStack.length > 0) {
      const patch = popUndo(built);
      expect(applyRecorded(built, builtQueue, patch, -1)).toBeNull();
    }

    // Both worlds now run the same number of ticks, so every calendar hook
    // fires in both. The logs differ by a hundred commands; the worlds do not.
    while (built.tick < 150) built.step(builtQueue, null);
    while (untouched.tick < 150) untouched.step(untouchedQueue, null);

    expect(builtQueue.log.length).toBe(100);
    expect(untouchedQueue.log.length).toBe(0);
    expect(hashWorld(built)).toBe(hashWorld(untouched));
    expect(fingerprint(built)).toBe(fingerprint(untouched));
  });
});
