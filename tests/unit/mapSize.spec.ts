import { describe, expect, it } from 'vitest';
import {
  Difficulty,
  MAP_SIZES,
  MAP_SIZE_MAX,
  MAP_SIZE_MIN,
  MapClimate,
} from '../../src/sim/constants';
import { TileMap } from '../../src/sim/map/TileMap';
import { isLegalMapSize, mapSizeRefusal } from '../../src/sim/map/size';
import { parseWorldState } from '../../src/sim/save/format';
import { Terrain } from '../../src/sim/map/terrain';
import type { NewGameParams } from '../../src/sim/types';
import { World } from '../../src/sim/World';

/**
 * The map-size rule, held at BOTH ends (D-197) and at the door a player
 * actually walks through (D-198).
 *
 * The defect this file closes: `World.create` took whatever size it was handed
 * and `parseWorldState` accepted powers of two between 64 and 2048, so a world
 * of 96 tiles could be created, generated, played - and then never saved,
 * checkpointed, replayed or crash-bundled, because every one of those doors
 * goes through the parser. A world that cannot be written down is not a world.
 *
 * What is tested is the AGREEMENT rather than either half: the same sizes are
 * refused by the constructor and by the parser, and the same sizes are taken by
 * both. A second copy of the rule would pass a test that only asked each end
 * about itself.
 *
 * The second defect, found when this file was read against the real game
 * (D-198): every assertion below went through `World.fromGenerated`, which is
 * handed a map that already exists. `World.create` GENERATES one first, and
 * mapgen fails on its own terms before the size check was ever reached -
 * `World.create({ mapSize: 32 })` answered "No playable map found for seed 7
 * after 20 attempts", a true sentence about the wrong subject. The size is
 * refused before mapgen now, and the refusal is asserted through `create`
 * itself rather than only through the cheap door.
 */

const REFUSED = [0, 1, 32, 63, 96, 100, 255, 1_000, 3_000, 4_096, -256];
const ACCEPTED = [64, 128, 256, 512, 1_024, 2_048];
/** Refused by the rule, but never reaching it at the creation end - see below. */
const FRACTIONAL = 128.5;

function params(): NewGameParams {
  return {
    seed: 7,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: 0,
    companyName: 'Massband',
    companyColorIndex: 1,
  };
}

/** A world around a hand-made map of `size` - the cheap door into the rule. */
function worldOfSize(size: number): World {
  const map = new TileMap(size);
  map.terrain.fill(Terrain.Grass);
  return World.fromGenerated(
    { ...params(), mapSize: size },
    {
      map,
      towns: [],
      industries: [],
      seedUsed: 7,
    },
  );
}

describe('one map-size rule, applied at creation and at parse', () => {
  it('refuses the same sizes at both ends', () => {
    for (const size of REFUSED) {
      expect(isLegalMapSize(size), `${size} legal?`).toBe(false);

      // The creation end. `fromGenerated` and `create` share the one private
      // constructor, which is where the check sits, so proving it here proves
      // it for every door into a World.
      expect(() => worldOfSize(size), `World of ${size}`).toThrow(mapSizeRefusal(size));

      // The parse end, on the same number.
      expect(() => parseWorldState({ mapSize: size }, 'save.state'), `parse ${size}`).toThrow(
        mapSizeRefusal(size),
      );
    }
  });

  it('refuses the same sizes through the door a new game uses', () => {
    // `World.create` is what the new-game screen, the scenario browser and
    // every determinism fixture call, and it does something `fromGenerated`
    // does not: it generates a map first. Each of these has to come back with
    // the size sentence rather than with whatever mapgen gave up on (D-198).
    for (const size of REFUSED) {
      expect(() => World.create({ ...params(), mapSize: size }), `create ${size}`).toThrow(
        mapSizeRefusal(size),
      );
    }
  });

  it('answers the 32-tile map with the size, not with mapgen giving up', () => {
    // The exact call that exposed the hole. Before the check moved ahead of
    // mapgen this threw "No playable map found for seed 7 after 20 attempts":
    // twenty wasted generation attempts and a sentence about playability for a
    // size the format was never going to accept. Both halves are asserted -
    // the sentence that must appear and the one that must not.
    let refusal = '';
    try {
      World.create({ ...params(), mapSize: 32 });
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal).toContain(mapSizeRefusal(32));
    expect(refusal).not.toContain('playable');
  });

  it('refuses a fractional size at every end, in two different sentences', () => {
    // The one asymmetry, stated rather than papered over: a non-integer size
    // never reaches the World constructor by the `fromGenerated` route, because
    // `TileMap` lays typed-array views over one buffer and a fractional tile
    // count misaligns the first Int16 view. The rule says no and so does the
    // layout - they simply say it in different words, and both are refusals.
    // Through `create` the rule speaks first, so there the sentence is the
    // size's own.
    expect(isLegalMapSize(FRACTIONAL)).toBe(false);
    expect(() => worldOfSize(FRACTIONAL)).toThrow();
    expect(() => World.create({ ...params(), mapSize: FRACTIONAL })).toThrow(
      mapSizeRefusal(FRACTIONAL),
    );
    expect(() => parseWorldState({ mapSize: FRACTIONAL }, 'save.state')).toThrow();
  });

  it('takes the same sizes at both ends', () => {
    for (const size of ACCEPTED) {
      expect(isLegalMapSize(size), `${size} legal?`).toBe(true);
      // The parser gets past the size and fails on the next required field,
      // which is the proof that the size itself was accepted.
      let refusal = '';
      try {
        parseWorldState({ mapSize: size }, 'save.state');
      } catch (error) {
        refusal = String(error);
      }
      expect(refusal, `parse ${size}`).not.toContain('mapSize');
    }
    // Only the small ones are actually built: a 2048 world is 4 M tiles and
    // this test is about the rule, not about the allocator.
    for (const size of [64, 128, 256]) {
      expect(worldOfSize(size).map.size).toBe(size);
    }
  });

  it('keeps the selectable sizes inside the rule the format enforces', () => {
    // The new-game screen offers a subset; if the two ever parted, a size the
    // player can choose would be a game that cannot be saved.
    for (const size of MAP_SIZES) expect(isLegalMapSize(size), `menu size ${size}`).toBe(true);
    expect(isLegalMapSize(MAP_SIZE_MIN)).toBe(true);
    expect(isLegalMapSize(MAP_SIZE_MAX)).toBe(true);
    expect(isLegalMapSize(MAP_SIZE_MIN / 2)).toBe(false);
    expect(isLegalMapSize(MAP_SIZE_MAX * 2)).toBe(false);
  });

  it('says the same sentence whichever end refused', () => {
    // A refusal somebody can search for: the message is one function, so the
    // wording cannot drift between the new-game path and the loader.
    expect(mapSizeRefusal(96)).toBe('96 is not a power of two between 64 and 2048');
    let fromCreate = '';
    let fromParse = '';
    try {
      worldOfSize(96);
    } catch (error) {
      fromCreate = String(error);
    }
    try {
      parseWorldState({ mapSize: 96 }, 'save.state');
    } catch (error) {
      fromParse = String(error);
    }
    expect(fromCreate).toContain(mapSizeRefusal(96));
    expect(fromParse).toContain(mapSizeRefusal(96));
  });
});
