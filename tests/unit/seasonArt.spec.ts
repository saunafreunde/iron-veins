import { describe, expect, it } from 'vitest';
import {
  planSeasonRepaint,
  roofSnowFor,
  SEASON_JOB_BUILDINGS,
  SEASON_REGEN_MIN_FRAMES,
  seasonKeyOf,
  seasonLookFor,
  seasonStageFor,
  type SeasonLook,
  SeasonStage,
  shouldStartRegeneration,
  SNOW_LINE_NONE,
  SNOW_LINE_SEVERITY,
  snowLineFor,
  terrainLook,
  terrainTakesSnow,
} from '../../src/render/seasonArt';
import { TERRAIN_COLORS } from '../../src/shared/palette';
import {
  MapClimate,
  MAX_HEIGHT,
  SEA_LEVEL,
  SEASON_CLIMATE_WINTER,
  SEASON_FRICTION_GAIN,
} from '../../src/sim/constants';
import { Terrain, TERRAIN_COUNT } from '../../src/sim/map/terrain';
import { winterFrictionFactor } from '../../src/sim/weather/seasons';

/**
 * The pure half of the seasonal optics (SPEC2 M18, D-202): the look a month
 * wears, the height-dependent snow line, which cells a change repaints, and
 * the debounce that decides when a regeneration may start.
 *
 * **Which assertions are evidence and which are read-back.** The four colour
 * tables and the twelve-month stage rows were CHOSEN, so "a forest is a
 * different colour in autumn" is a read-back of that choice - worth having
 * because a table that silently stopped being consulted has to turn the build
 * red, worthless as evidence about the colours. What is independent of every
 * one of them:
 *
 *  - the snow line AGREES with `winterFrictionFactor` at every height, month
 *    and climate, walked in full: the line is not a table of its own, it is
 *    the simulation's own winter severity read backwards, and this is the
 *    assertion that says so;
 *  - summer IS the base palette, so the atlas the game builds at startup and
 *    a summer repaint are the same artwork;
 *  - the repaint plan is exactly the set of cells whose look moved - proved by
 *    reconstructing it from `terrainLook` rather than from the table;
 *  - tropical has no season at all, which follows from `SEASON_CLIMATE_WINTER`
 *    being an exact zero there and not from anything in this file.
 */

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CLIMATES = [MapClimate.Temperate, MapClimate.Arctic, MapClimate.Tropical, MapClimate.Desert];

describe("the snow line is the simulation's own winter read backwards", () => {
  it('agrees with winterFrictionFactor at every height, month and climate', () => {
    const threshold = 1 + SNOW_LINE_SEVERITY * SEASON_FRICTION_GAIN;
    for (const climate of CLIMATES) {
      for (const month of MONTHS) {
        const line = snowLineFor(month, climate);
        for (let height = SEA_LEVEL + 1; height <= MAX_HEIGHT; height++) {
          const severe = winterFrictionFactor(month, height, climate) >= threshold;
          expect(severe, `climate ${climate} month ${month} height ${height}`).toBe(height >= line);
        }
      }
    }
  });

  it('never puts snow on the sea or below the shore', () => {
    for (const climate of CLIMATES) {
      for (const month of MONTHS) {
        expect(snowLineFor(month, climate)).toBeGreaterThan(SEA_LEVEL);
      }
    }
  });

  it('is a LINE part way up the mountain in a temperate winter, not a blanket', () => {
    // The acceptance sentence asks for a height-dependent snow line. These are
    // the lines the threshold produces, pinned so that moving the constant or
    // the winter table is a decision rather than an accident: January 10,
    // February and December 13, and no snow at all in the other nine months.
    const temperate = MONTHS.map((month) => snowLineFor(month, MapClimate.Temperate));
    expect(temperate).toEqual([
      10,
      13,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      SNOW_LINE_NONE,
      13,
    ]);
    // Land runs from SEA_LEVEL + 1 to MAX_HEIGHT, so a January line at 10
    // leaves the valleys green and whitens the tops - which is the picture.
    expect(temperate[0]).toBeGreaterThan(SEA_LEVEL + 1);
    expect(temperate[0]).toBeLessThan(MAX_HEIGHT);
  });

  it('reaches the shore in an arctic January and never in a desert', () => {
    expect(snowLineFor(0, MapClimate.Arctic)).toBe(SEA_LEVEL + 1);
    expect(snowLineFor(11, MapClimate.Arctic)).toBeLessThan(MAX_HEIGHT);
    for (const month of MONTHS) {
      expect(snowLineFor(month, MapClimate.Desert)).toBe(SNOW_LINE_NONE);
    }
  });

  it('has no snow in a tropical world - the exact zero of the climate table', () => {
    expect(SEASON_CLIMATE_WINTER[MapClimate.Tropical]).toBe(0);
    for (const month of MONTHS) {
      expect(snowLineFor(month, MapClimate.Tropical)).toBe(SNOW_LINE_NONE);
    }
  });
});

describe('the stage a month wears', () => {
  it('gives a temperate year all four looks and each of them a run of months', () => {
    const stages = MONTHS.map((month) => seasonStageFor(month, MapClimate.Temperate));
    expect(new Set(stages).size).toBe(4);
    expect(stages[0]).toBe(SeasonStage.Winter);
    expect(stages[6]).toBe(SeasonStage.Summer);
    expect(stages[9]).toBe(SeasonStage.Autumn);
    expect(stages[3]).toBe(SeasonStage.Spring);
  });

  it('gives an arctic year a longer winter than a temperate one', () => {
    const winters = (climate: MapClimate): number =>
      MONTHS.filter((month) => seasonStageFor(month, climate) === SeasonStage.Winter).length;
    expect(winters(MapClimate.Arctic)).toBeGreaterThan(winters(MapClimate.Temperate));
  });

  it('gives tropical and desert exactly one look all year', () => {
    for (const climate of [MapClimate.Tropical, MapClimate.Desert]) {
      for (const month of MONTHS) {
        expect(seasonStageFor(month, climate)).toBe(SeasonStage.Summer);
      }
    }
  });

  it('answers for a climate it has never seen rather than throwing', () => {
    // Defensive, and cheap: a fourth climate arriving in M23 must not blank
    // the map while somebody adds a row.
    expect(seasonStageFor(0, 99 as MapClimate)).toBe(seasonStageFor(0, MapClimate.Temperate));
  });
});

describe('the look of one terrain', () => {
  it('answers with the base palette in summer, so the built atlas IS summer', () => {
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      expect(terrainLook(terrain, SeasonStage.Summer).colour).toBe(TERRAIN_COLORS[terrain]);
    }
    expect(roofSnowFor(SeasonStage.Summer)).toBe(0);
  });

  it('turns the forest in autumn and pales the grass in winter', () => {
    // A read-back of the chosen tables (see the file header), here so that a
    // table that stopped being consulted turns the build red.
    const summerForest = terrainLook(Terrain.Forest, SeasonStage.Summer).colour;
    expect(terrainLook(Terrain.Forest, SeasonStage.Autumn).colour).not.toBe(summerForest);
    expect(terrainLook(Terrain.Forest, SeasonStage.Winter).colour).not.toBe(summerForest);
    expect(terrainLook(Terrain.Grass, SeasonStage.Winter).colour).not.toBe(
      terrainLook(Terrain.Grass, SeasonStage.Summer).colour,
    );
  });

  it('leaves rock, sand, snow, shore and pavement alone in every stage', () => {
    for (const terrain of [
      Terrain.Rock,
      Terrain.Desert,
      Terrain.Snow,
      Terrain.Coast,
      Terrain.TownGround,
      Terrain.Water,
    ]) {
      for (let stage = 0; stage < 4; stage++) {
        expect(terrainLook(terrain, stage as SeasonStage).colour).toBe(TERRAIN_COLORS[terrain]);
      }
    }
  });

  it('grains every seasonal colour darker than the colour itself', () => {
    for (let stage = 0; stage < 4; stage++) {
      for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
        const look = terrainLook(terrain, stage as SeasonStage);
        expect(look.speckle).not.toBe(look.colour);
      }
    }
  });
});

describe('what a season change repaints', () => {
  const out: number[] = [];

  /**
   * One look at a named stage, in one climate.
   *
   * `planSeasonRepaint` compares LOOKS since SPEC2 M23, because the town cells
   * are repainted both by a roof taking snow and by the climate's own
   * architecture (D-246). Every assertion below holds the climate fixed, which
   * is the season question asked exactly as it was before that bundle; the
   * climate half has its own test at the end of this block.
   */
  const at = (stage: SeasonStage, climate: MapClimate = MapClimate.Temperate): SeasonLook => ({
    stage,
    snowLine: SNOW_LINE_NONE,
    climate,
  });

  it('lists exactly the terrains whose look moved, and no others', () => {
    for (let from = 0; from < 4; from++) {
      for (let to = 0; to < 4; to++) {
        const count = planSeasonRepaint(at(from as SeasonStage), at(to as SeasonStage), out);
        const listed = new Set(out.slice(0, count));
        for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
          const moved =
            terrainLook(terrain, from as SeasonStage).colour !==
              terrainLook(terrain, to as SeasonStage).colour ||
            terrainLook(terrain, from as SeasonStage).speckle !==
              terrainLook(terrain, to as SeasonStage).speckle;
          expect(listed.has(terrain), `${from}->${to} terrain ${terrain}`).toBe(moved);
        }
      }
    }
  });

  it('is empty for a change that moves nothing', () => {
    expect(planSeasonRepaint(at(SeasonStage.Summer), at(SeasonStage.Summer), out)).toBe(0);
  });

  it('takes the town cells in exactly the changes that snow or clear a roof', () => {
    for (let from = 0; from < 4; from++) {
      for (let to = 0; to < 4; to++) {
        const count = planSeasonRepaint(at(from as SeasonStage), at(to as SeasonStage), out);
        const takesBuildings = out.slice(0, count).includes(SEASON_JOB_BUILDINGS);
        expect(takesBuildings, `${from}->${to}`).toBe(
          roofSnowFor(from as SeasonStage) !== roofSnowFor(to as SeasonStage),
        );
      }
    }
    expect(roofSnowFor(SeasonStage.Winter)).toBeGreaterThan(0);
  });

  it('takes the town cells when the CLIMATE changes and the season does not', () => {
    // The world constant arrives once, after the pages are built in the
    // temperate default, and it has to reach the six town cells (D-246). No
    // terrain row moves with it: the biomes are the simulation's and the
    // season's, never the architecture's.
    const count = planSeasonRepaint(
      at(SeasonStage.Summer, MapClimate.Temperate),
      at(SeasonStage.Summer, MapClimate.Desert),
      out,
    );
    expect(out.slice(0, count)).toEqual([SEASON_JOB_BUILDINGS]);

    // And a climate whose architecture is the same row repaints nothing -
    // the comparison is on the LOOK the cells are drawn in, not on the id.
    expect(
      planSeasonRepaint(
        at(SeasonStage.Summer, MapClimate.Temperate),
        at(SeasonStage.Summer, MapClimate.Temperate),
        out,
      ),
    ).toBe(0);
  });

  it('repaints a minority of the ten terrain rows, which is why it fits', () => {
    // Four rows of ten, plus the town cells twice a year: this is the
    // arithmetic behind the 30 ms budget of SPEC2 6.2, stated where it can go
    // red rather than in a comment.
    const count = planSeasonRepaint(at(SeasonStage.Summer), at(SeasonStage.Autumn), out);
    expect(count).toBeLessThan(TERRAIN_COUNT / 2);
    expect(count).toBeGreaterThan(0);
  });
});

describe('the snow substitution', () => {
  it('covers every land terrain and never water or snow itself', () => {
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      const expected = terrain !== Terrain.Water && terrain !== Terrain.Snow;
      expect(terrainTakesSnow(terrain), `terrain ${terrain}`).toBe(expected);
    }
  });
});

describe('the season key and the debounce (SPEC2 6.2)', () => {
  it('gives two months that look the same one key, and different looks different keys', () => {
    const januaryTemperate = seasonLookFor(0, MapClimate.Temperate);
    const decemberTemperate = seasonLookFor(11, MapClimate.Temperate);
    const julyTemperate = seasonLookFor(6, MapClimate.Temperate);
    // January and December are both winter but at different lines - the key
    // has to tell them apart, because the SNOW LINE is part of the look.
    expect(seasonKeyOf(januaryTemperate)).not.toBe(seasonKeyOf(decemberTemperate));
    expect(seasonKeyOf(julyTemperate)).not.toBe(seasonKeyOf(januaryTemperate));
    // A tropical year is one key from January to December: no regeneration
    // ever runs there.
    const tropical = MONTHS.map((month) => seasonKeyOf(seasonLookFor(month, MapClimate.Tropical)));
    expect(new Set(tropical).size).toBe(1);
  });

  it('holds a temperate year to a handful of regenerations, not twelve', () => {
    const keys = MONTHS.map((month) => seasonKeyOf(seasonLookFor(month, MapClimate.Temperate)));
    let changes = 0;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== keys[(i + 11) % 12]) changes++;
    }
    expect(changes).toBeGreaterThan(0);
    expect(changes).toBeLessThan(MONTHS.length);
  });

  it('never starts when the pending look is the applied one', () => {
    expect(shouldStartRegeneration(7, 7, 10_000)).toBe(false);
  });

  it('waits out the window and then starts', () => {
    expect(shouldStartRegeneration(8, 7, SEASON_REGEN_MIN_FRAMES - 1)).toBe(false);
    expect(shouldStartRegeneration(8, 7, SEASON_REGEN_MIN_FRAMES)).toBe(true);
  });

  it('is a second of frames, which is what SPEC2 6.2 asks for', () => {
    expect(SEASON_REGEN_MIN_FRAMES).toBe(60);
  });
});
