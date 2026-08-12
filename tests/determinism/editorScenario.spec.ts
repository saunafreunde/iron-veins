import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  TerraformDirection,
  EDITOR_BRUSH_MAX_RADIUS,
} from '../../src/sim/constants';
import { IndustryType } from '../../src/sim/industry/types';
import { ModuleKind } from '../../src/sim/station/types';
import { TownSize } from '../../src/sim/town/types';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { encodeScenario } from '../../src/sim/save/scenario';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The acceptance sentence of SPEC2 M22, end to end (D-243):
 *
 *   "Eine im Editor gebaute 512er-Karte wird als Szenario exportiert, neu
 *    geladen und durch Replay des Editor-Befehlslogs bit-identisch
 *    reproduziert."
 *
 * That is one claim with three halves, and each is asserted separately here,
 * because two of them can hold while the third does not:
 *
 *  1. the exported `.ironscenario` READS BACK as the world that was edited -
 *     the container's job (D-194: a scenario is a save with a briefing);
 *  2. replaying the log into a FRESH world of the same seed reproduces that
 *     world bit for bit - the simulation's job, and the whole reason the
 *     workshop speaks commands rather than calling the generator (D-240);
 *  3. the two are the SAME world - which is what makes "share a map" mean
 *     "share a proof" rather than "share a picture".
 *
 * Bit-identity is measured twice and the second measure is the strict one.
 * `hashWorld` is this project's own bit-identity measure (D-137) and it covers
 * hashed world state; the byte comparison of `encodeSave` covers everything a
 * file carries, including the fields the digest deliberately leaves out.
 */

const SEED = 5_150;
const MAP_SIZE = 512;

function createWorkshop(): World {
  return World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Werkstatt 512',
    companyColorIndex: 3,
    editorMode: true,
  });
}

interface Session {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly accepted: Command[];
  readonly kinds: Set<number>;
}

function openSession(world: World): Session {
  return { world, queue: new CommandQueue(), accepted: [], kinds: new Set<number>() };
}

/** Issue a command; keep it when it stuck. Returns whether it was accepted. */
function issue(session: Session, command: Command): boolean {
  session.queue.enqueue(command, session.world.tick);
  let accepted = true;
  session.world.drainCommands(session.queue, (_envelope, outcome) => {
    if (!outcome.ok) accepted = false;
  });
  if (accepted) {
    session.accepted.push(command);
    session.kinds.add(command.kind);
  }
  return accepted;
}

/**
 * An authoring session on a generated 512 map: ground moved, wood planted, a
 * river cut, a town founded, a works sited, and an ordinary bus line laid over
 * the result.
 *
 * The coordinates are PROBED rather than typed. A generated map has a sea in
 * it and the workshop refuses to found a town in it, so a plan of hand-written
 * coordinates would be a list of guesses; asking the game and keeping the
 * answers is what an author does with a mouse, and it is what makes this test
 * a recording of an authoring session rather than a fixture that happens to
 * apply.
 */
function author(session: Session): void {
  const world = session.world;
  const size = world.map.size;

  // 1. Move ground: raise a plateau and dig beside it, on land the map has.
  let brushes = 0;
  for (let y = 32; y < size - 32 && brushes < 6; y += 37) {
    for (let x = 32; x < size - 32 && brushes < 6; x += 41) {
      if (world.map.isSubmerged(x, y)) continue;
      const direction = brushes % 2 === 0 ? TerraformDirection.Raise : TerraformDirection.Lower;
      if (
        issue(session, {
          kind: CommandKind.TerraformBrushRegion,
          x,
          y,
          radius: brushes % EDITOR_BRUSH_MAX_RADIUS,
          direction,
        })
      ) {
        brushes++;
      }
    }
  }
  expect(brushes, 'the workshop moved no ground at all').toBeGreaterThanOrEqual(4);

  // 2. Plant wood.
  let woods = 0;
  for (let y = 48; y < size - 48 && woods < 4; y += 53) {
    for (let x = 48; x < size - 48 && woods < 4; x += 59) {
      if (issue(session, { kind: CommandKind.PaintForest, x, y, radius: 4 })) woods++;
    }
  }
  expect(woods).toBeGreaterThanOrEqual(2);

  // 3. Cut a river. Near the coast, because a region that cannot reach sea
  //    level inside one command's earth budget is refused WHOLE (D-240) - the
  //    stated price of refusing "standing water at height X".
  let rivers = 0;
  for (let y = 16; y < size - 16 && rivers < 2; y += 11) {
    for (let x = 16; x < size - 16 && rivers < 2; x += 13) {
      if (!world.map.isSubmerged(x, y)) continue;
      if (issue(session, { kind: CommandKind.PaintRiver, x: x + 2, y, radius: 2 })) rivers++;
    }
  }
  expect(rivers, 'no watercourse could be cut anywhere on the map').toBeGreaterThanOrEqual(1);

  world.step(session.queue, null);

  // 4. Found towns and site works - the generator's own placement questions,
  //    asked by a command (D-240).
  let towns = 0;
  for (let y = 24; y < size - 24 && towns < 3; y += 29) {
    for (let x = 24; x < size - 24 && towns < 3; x += 31) {
      if (issue(session, { kind: CommandKind.PlaceTownSeed, x, y, sizeClass: TownSize.Town })) {
        towns++;
      }
    }
  }
  expect(towns).toBeGreaterThanOrEqual(1);

  // A works answers four placement questions of the generator's own
  // (`industrySiteRefusal`), and two of them are about what is AROUND the
  // site - so the probe is fine-grained and tries more than one type. That is
  // the point of reusing the generator's questions: a works the workshop sites
  // is a works the generator could have sited (D-240).
  let works = 0;
  const types = [IndustryType.Forestry, IndustryType.CoalMine, IndustryType.Sawmill];
  for (let y = 30; y < size - 30 && works < 3; y += 17) {
    for (let x = 30; x < size - 30 && works < 3; x += 19) {
      const type = types[(x + y) % types.length]!;
      if (issue(session, { kind: CommandKind.PlaceIndustryAt, x, y, industryType: type })) works++;
    }
  }
  expect(works).toBeGreaterThanOrEqual(1);

  world.step(session.queue, null);

  // 5. An ordinary company build on the authored ground, so the log is not
  //    five workshop kinds in a vacuum: what a scenario ships is a world a
  //    game is played on.
  const [a, b] = [world.towns[0]!, world.towns[1] ?? world.towns[0]!];
  if (
    a !== b &&
    issue(session, { kind: CommandKind.BuildRoad, x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  ) {
    issue(session, {
      kind: CommandKind.BuildRoadStop,
      x: a.x,
      y: a.y,
      moduleKind: ModuleKind.BusStop,
    });
    issue(session, {
      kind: CommandKind.BuildRoadStop,
      x: b.x,
      y: b.y,
      moduleKind: ModuleKind.BusStop,
    });
  }
  issue(session, { kind: CommandKind.SetCompanyName, name: 'Werkstatt 512 AG' });

  for (let i = 0; i < 150; i++) world.step(session.queue, null);
}

describe('a 512 map built in the workshop (SPEC2 M22 acceptance)', () => {
  const session = openSession(createWorkshop());
  author(session);
  const built = session.world;
  const originalHash = hashWorld(built);

  it('uses all five workshop command kinds and records every one of them', () => {
    for (const kind of [
      CommandKind.TerraformBrushRegion,
      CommandKind.PaintForest,
      CommandKind.PaintRiver,
      CommandKind.PlaceTownSeed,
      CommandKind.PlaceIndustryAt,
    ]) {
      expect(session.kinds.has(kind), `command kind ${kind} never applied`).toBe(true);
    }
    // The log IS the map - and it is the WHOLE history, refusals included.
    // An author clicking on water is part of what happened, the queue records
    // it like any other entry, and the replay below refuses it again for the
    // same reason. That is a stronger claim than a log of successes: it says
    // the two worlds agree about what was rejected as well as about what was
    // built.
    const logged = session.queue.log.map((envelope) => envelope.command);
    expect(logged.length).toBeGreaterThan(session.accepted.length);
    let cursor = 0;
    for (const command of session.accepted) {
      while (cursor < logged.length && logged[cursor] !== command) cursor++;
      expect(cursor, 'an accepted command is missing from the log').toBeLessThan(logged.length);
      cursor++;
    }
    expect(built.map.size).toBe(MAP_SIZE);
    expect(built.editorMode).toBe(true);
  });

  it('exports as a scenario and reloads as the same world', () => {
    const bytes = encodeScenario(built, session.queue, '0.1.0', {
      title: 'Werkstatt 512',
      author: 'Iron Veins',
      briefing: {
        de: 'Eine im Editor gebaute Karte, exportiert und wieder geladen.',
        en: 'A map built in the editor, exported and loaded again.',
      },
      goals: [],
      lockedRules: [],
      fromTick: built.tick,
      toTick: built.tick,
      referenceFinalHash: '',
    });

    const loaded = decodeSave(bytes);
    expect(loaded.scenario?.title).toBe('Werkstatt 512');
    expect(hashWorld(loaded.world)).toBe(originalHash);
    // The briefing is OUTSIDE the digest (Fehlerkatalog 35, D-194): the whole
    // point of that rule is that it may travel with the world without being
    // part of it.
    expect(loaded.world.map.size).toBe(MAP_SIZE);
    expect(loaded.world.editorMode).toBe(true);
  });

  it('is reproduced bit-identically by replaying the editor command log', () => {
    // A fresh world of the same seed, and NOTHING but the recorded log.
    const replayed = createWorkshop();
    const queue = new CommandQueue();
    for (const envelope of session.queue.log) queue.enqueue(envelope.command, envelope.tick);
    while (replayed.tick < built.tick) replayed.step(queue, null);

    expect(replayed.tick).toBe(built.tick);
    expect(queue.pendingCount).toBe(0);
    expect(hashWorld(replayed)).toBe(originalHash);

    // The strict measure: the whole file, byte for byte. `encodeSave` is a
    // pure function of world, queue and version - no clock, no counter - so a
    // difference here is a difference in the world or in the log.
    expect(encodeSave(replayed, queue, '0.1.0')).toEqual(encodeSave(built, session.queue, '0.1.0'));
  });

  it('reaches the same world through the file and through the log', () => {
    // Half three of the acceptance sentence. The scenario is decoded, the log
    // is replayed, and the two are compared with each other rather than each
    // with the original - a shared bug in the original would pass the two
    // tests above and fail this one.
    const scenarioBytes = encodeScenario(built, session.queue, '0.1.0', {
      title: 'Werkstatt 512',
      author: 'Iron Veins',
      briefing: { de: 'Kurz.', en: 'Short.' },
      goals: [],
      lockedRules: [],
      fromTick: built.tick,
      toTick: built.tick,
      referenceFinalHash: '',
    });
    const fromFile = decodeSave(scenarioBytes).world;

    const replayed = createWorkshop();
    const queue = new CommandQueue();
    for (const envelope of session.queue.log) queue.enqueue(envelope.command, envelope.tick);
    while (replayed.tick < built.tick) replayed.step(queue, null);

    expect(hashWorld(fromFile)).toBe(hashWorld(replayed));
    expect(fromFile.towns.length).toBe(replayed.towns.length);
    expect(fromFile.industries.length).toBe(replayed.industries.length);
  });
});
