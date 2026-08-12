import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  planIndustryAt,
  planPaintForest,
  planPaintRiver,
  planTerraformBrush,
  planTownSeed,
} from '../../src/sim/commands/editor';
import {
  Difficulty,
  EDITOR_BRUSH_MAX_RADIUS,
  MapClimate,
  TerraformDirection,
} from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import type { TileMap } from '../../src/sim/map/TileMap';
import { Terrain } from '../../src/sim/map/terrain';
import { standingWaterAboveSeaLevel } from '../../src/sim/map/terraform';
import { TownSize } from '../../src/sim/town/types';
import { hashWorld, World } from '../../src/sim/World';

/**
 * A refused command leaves the world byte-identical, and a preview leaves it
 * byte-identical too (SPEC2 M22, the correction bundle to D-240/D-241).
 *
 * This is a property over all five workshop kinds rather than a case for the
 * one that was found broken, because the defect that prompted it was not in
 * `PaintRiver`'s dig at all - it was in what the command did AFTER it, and any
 * of the five could have grown the same tail. What was measured on a fresh 256
 * world at seed 777, before the fix:
 *
 *  - `planPaintRiver(94, 10, 1)` alone took `standingWaterAboveSeaLevel` from
 *    198 tiles to 0 and moved `hashWorld`. A preview that writes is worse than
 *    no preview: the player's screen and the world silently disagree.
 *  - three refused brushes (r=4 at 14,123, r=6 at 178,14, r=8 at 94,10, all
 *    answering `riverNeedsSeaLevel`) did the same 198 -> 0.
 *  - an ACCEPTED radius-1 brush at the coast deleted the same 198 tiles plus
 *    the rest of the generator's watercourses.
 *
 * The instrument below is a fingerprint over EVERY layer of the map - found by
 * walking the object rather than by listing them, so a layer added later is
 * covered without anybody remembering to add it - plus the two revision
 * counters, plus `hashWorld`, plus the entity counts and the cash a command
 * could have moved.
 */

const SIZE = 128;
const SEED = 20_260_812;

/** A generated world of this milestone's own size, with or without the rule. */
function generated(editorMode: boolean): World {
  return World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: SIZE,
    companyName: 'Werkstatt AG',
    companyColorIndex: 1,
    editorMode,
  });
}

/** Every typed-array layer the map holds, in a total order (law #3's rule for tests too). */
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

/**
 * Everything a workshop command could possibly have moved, as one string.
 *
 * FNV-1a per layer rather than one digest over all of them, so a failure names
 * the layer that moved instead of only saying that something did.
 */
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
  parts.push(`revision=${world.map.revision}`);
  parts.push(`trackRevision=${world.map.trackRevision}`);
  parts.push(`towns=${world.towns.length}`);
  parts.push(`industries=${world.industries.length}`);
  parts.push(`cash=${world.companies[0]!.cashCt}`);
  parts.push(`hash=${hashWorld(world)}`);
  return parts.join(' ');
}

/** Execute one command through the real queue; the rejection key, or null. */
function run(world: World, queue: CommandQueue, command: Command): string | null {
  queue.enqueue(command, world.tick, 0);
  let rejected: string | null = null;
  world.drainCommands(queue, (_envelope, outcome) => {
    if (!outcome.ok) rejected = outcome.reasonKey;
  });
  return rejected;
}

interface Placed {
  readonly command: Command;
  /** Where the command names, for a failure message the reader can act on. */
  readonly at: string;
}

/**
 * A spread of commands over the whole map, of all five kinds.
 *
 * Deliberately not curated into "these ones are refused": what makes this a
 * property test is that the world itself decides which are, and the assertion
 * holds for every refusal whatever its reason. The spread is checked below for
 * actually producing both answers for each kind - a sweep that only ever got
 * accepted would prove nothing and would pass silently.
 */
function spread(): Placed[] {
  const placed: Placed[] = [];
  const commands: Command[] = [];
  for (let i = 0; i < 24; i++) {
    const x = 4 + ((i * 23) % (SIZE - 8));
    const y = 4 + ((i * 41) % (SIZE - 8));
    // One over the cap every ninth step, so the region refusal - the one every
    // kind shares and the only one a brush on open ground reliably meets under
    // the workshop rule - is in the sweep rather than assumed.
    const radius = i % (EDITOR_BRUSH_MAX_RADIUS + 2);
    commands.push({
      kind: CommandKind.TerraformBrushRegion,
      x,
      y,
      radius,
      direction: i % 2 === 0 ? TerraformDirection.Raise : TerraformDirection.Lower,
    });
    commands.push({
      kind: CommandKind.PlaceTownSeed,
      x,
      y,
      sizeClass: [TownSize.Village, TownSize.Town, TownSize.City][i % 3]!,
    });
    commands.push({
      kind: CommandKind.PlaceIndustryAt,
      x,
      y,
      industryType: [IndustryType.CoalMine, IndustryType.Forestry, IndustryType.Farm][i % 3]!,
    });
    commands.push({ kind: CommandKind.PaintForest, x, y, radius });
    commands.push({ kind: CommandKind.PaintRiver, x, y, radius });
    while (commands.length > 0) placed.push({ command: commands.shift()!, at: `${x},${y}` });
  }
  return placed;
}

describe('a refused workshop command leaves the world byte-identical', () => {
  for (const editorMode of [true, false]) {
    it(`holds for every refusal of all five kinds (editorMode: ${editorMode})`, () => {
      const world = generated(editorMode);
      const queue = new CommandQueue();
      const refusedBy = new Map<number, number>();
      const acceptedBy = new Map<number, number>();

      for (const { command, at } of spread()) {
        const before = fingerprint(world);
        const reason = run(world, queue, command);
        const tally = reason === null ? acceptedBy : refusedBy;
        tally.set(command.kind, (tally.get(command.kind) ?? 0) + 1);

        if (reason === null) {
          // An accepted command HAS to move the world, or the fingerprint is
          // not measuring anything and the refusals prove nothing either.
          expect(fingerprint(world), `${command.kind} accepted at ${at}`).not.toBe(before);
          continue;
        }
        expect(fingerprint(world), `${command.kind} refused with ${reason} at ${at}`).toBe(before);
      }

      // The sweep is only evidence if it actually met both answers.
      for (const kind of [
        CommandKind.TerraformBrushRegion,
        CommandKind.PlaceTownSeed,
        CommandKind.PlaceIndustryAt,
        CommandKind.PaintForest,
        CommandKind.PaintRiver,
      ]) {
        expect(refusedBy.get(kind) ?? 0, `refusals of kind ${kind}`).toBeGreaterThan(0);
      }
      expect([...acceptedBy.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });
  }
});

describe('a workshop preview writes nothing at all', () => {
  it('holds for all five plan functions, accepted and refused alike', () => {
    const world = generated(true);
    const before = fingerprint(world);

    // The coordinates matter here in a way they do not above: a plan that is
    // ACCEPTED is the interesting one, because that is the path that ran the
    // whole operation against the real map and had to put it back.
    let accepted = 0;
    for (let i = 0; i < 24; i++) {
      const x = 4 + ((i * 23) % (SIZE - 8));
      const y = 4 + ((i * 41) % (SIZE - 8));
      const radius = i % (EDITOR_BRUSH_MAX_RADIUS + 1);
      const plans = [
        planTerraformBrush(world, x, y, radius, TerraformDirection.Lower),
        planTownSeed(world, x, y, TownSize.Town),
        planIndustryAt(world, x, y, IndustryType.CoalMine),
        planPaintForest(world, x, y, radius),
        planPaintRiver(world, x, y, radius),
      ];
      for (const plan of plans) if (plan.reasonKey === null) accepted++;
      expect(fingerprint(world), `after the plans at ${x},${y}`).toBe(before);
    }
    expect(accepted, 'plans that would have been accepted').toBeGreaterThan(0);
  });
});

describe('an accepted PaintRiver relabels only ground it moved', () => {
  it('never turns a watercourse the generator drew into land it did not dig', () => {
    const world = generated(true);
    const queue = new CommandQueue();
    const map = world.map;

    // D-240's named residual: what `applyRivers` paints above sea level. It is
    // the GENERATOR's quirk, repairing it is its own bundle, and the ordinary
    // revert - a mountain river becomes grass when somebody terraforms BESIDE
    // it - is documented behaviour that predates this milestone. What is NOT
    // sanctioned is a brush at the coast deleting a river fifty tiles away,
    // which is what the whole-map sweep did to all 198 of them on a 256 world.
    const residual = standingWaterAboveSeaLevel(map);
    expect(residual, 'the generator leaves standing water above sea level').toBeGreaterThan(0);

    const heightsBefore = Uint8Array.from(map.cornerHeight);
    const standingBefore: number[] = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const index = map.tileIndex(x, y);
        if (map.terrain[index] === Terrain.Water && !map.isSubmerged(x, y)) standingBefore.push(index);
      }
    }
    let water = 0;
    for (let i = 0; i < SIZE * SIZE; i++) if (map.terrain[i] === Terrain.Water) water++;

    let accepted = 0;
    for (let i = 0; i < 25; i++) {
      const x = 5 + i * 4;
      const y = 5 + ((i * 7) % 100);
      if (run(world, queue, { kind: CommandKind.PaintRiver, x, y, radius: 1 }) === null) accepted++;
    }
    expect(accepted, 'accepted river brushes').toBeGreaterThan(0);

    // The claim, stated exactly: a tile that stopped being standing water is a
    // tile whose OWN GROUND this command moved. Not "few of them" and not "no
    // more than before" - every single one, by provenance.
    const stride = SIZE + 1;
    let lost = 0;
    for (const index of standingBefore) {
      const x = index % SIZE;
      const y = (index / SIZE) | 0;
      if (map.terrain[index] === Terrain.Water) continue;
      lost++;
      const corners = [
        y * stride + x,
        y * stride + x + 1,
        (y + 1) * stride + x,
        (y + 1) * stride + x + 1,
      ];
      const moved = corners.some(
        (corner) => map.cornerHeight[corner] !== heightsBefore[corner],
      );
      expect(moved, `standing water at ${x},${y} lost without its ground being dug`).toBe(true);
    }
    // And the scale is the other half of the finding: the whole-map sweep took
    // every one of them, the scoped refresh takes only the handful the brushes
    // physically reached.
    expect(lost, 'standing-water tiles the brushes dug through').toBeLessThan(residual / 2);
    expect(standingWaterAboveSeaLevel(map)).toBeGreaterThan(0);

    let waterAfter = 0;
    for (let i = 0; i < SIZE * SIZE; i++) if (map.terrain[i] === Terrain.Water) waterAfter++;
    expect(waterAfter).toBeGreaterThan(water);
  });
});
