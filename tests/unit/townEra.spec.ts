import { describe, expect, it } from 'vitest';
import {
  planSeasonRepaint,
  SEASON_JOB_BUILDINGS,
  seasonKeyOf,
  seasonLookFor,
  SeasonStage,
} from '../../src/render/seasonArt';
import { HEIGHT_PX, TILE_H } from '../../src/render/projection';
import { BAKED_STATIC_MAX_LIFT_PX } from '../../src/render/staticArt';
import { CELL_HEADROOM_STEPS } from '../../src/render/TerrainAtlas';
import { architectureFor, TOWN_ARCHITECTURE } from '../../src/render/townArchitecture';
import {
  ALL_TOWN_ERAS,
  bakedBuildingsAllowedIn,
  eraSpecFor,
  mixHex,
  tallestTownCellLiftPx,
  TOWN_ERA_COUNT,
  TOWN_ERA_SPECS,
  TownEra,
  townCellLiftPx,
  townCellShape,
  townEraFor,
  townErasFitProportionRule,
  townPalette,
} from '../../src/render/townEra';
import {
  EARLIEST_START_YEAR,
  END_YEAR,
  MapClimate,
  START_YEAR,
  START_YEAR_PRESETS,
  TOWN_ERA_START_YEARS,
} from '../../src/sim/constants';

/**
 * The era optics of SPEC2 M23: "Stadtgebaeude-Specs keyed nach Snapshot-Jahr
 * (1950er-Giebel -> 1980er-Platte -> 2020er-Glas) ueber denselben
 * Regenerationspfad wie M18 - ein 1950 gestartetes, 2049 geladenes Save zeigt
 * sofort die 2049-Optik".
 *
 * Three claims, and each of them is asked here rather than looked at:
 *
 *  - the era is a pure function of the published YEAR, so there is no saved
 *    render state to be stale and a save loaded at any tick shows that tick's
 *    century on the first calendar message;
 *  - it travels the M18 regeneration seam (D-202) - the same look, the same
 *    key, the same job list, and NO second path;
 *  - it respects the proportion rule of D-206, which handed this milestone the
 *    era axis by name and warned what belongs on it. No era may reintroduce a
 *    needle tower, and the ceiling is measured against the ONE number the
 *    baker refuses a baked cell over.
 */

const CLIMATES: readonly MapClimate[] = [
  MapClimate.Temperate,
  MapClimate.Arctic,
  MapClimate.Tropical,
  MapClimate.Desert,
];

const KINDS = [0, 1, 2] as const;
const STAGES = [0, 1] as const;

describe('which era a year builds in', () => {
  it('puts each decade SPEC2 names inside its own era', () => {
    // The acceptance sentence's three decades, and nothing else decides the
    // boundaries: the fifties build gables, the eighties slabs, the twenties
    // glass.
    for (const year of [1950, 1951, 1955, 1959]) expect(townEraFor(year)).toBe(TownEra.Gable);
    for (const year of [1980, 1985, 1989]) expect(townEraFor(year)).toBe(TownEra.Slab);
    for (const year of [2020, 2025, 2029]) expect(townEraFor(year)).toBe(TownEra.Glass);
  });

  it('is total in both directions - 1850 builds gables and 2200 still builds glass', () => {
    // A world may start in 1850 since D-245 and may run for ever since E-15,
    // so both ends are real years a player can be standing in.
    expect(townEraFor(EARLIEST_START_YEAR)).toBe(TownEra.Gable);
    expect(townEraFor(EARLIEST_START_YEAR - 100)).toBe(TownEra.Gable);
    expect(townEraFor(2_200)).toBe(TownEra.Glass);
    expect(townEraFor(9_999)).toBe(TownEra.Glass);
    for (const preset of START_YEAR_PRESETS) expect(townEraFor(preset)).toBe(TownEra.Gable);
  });

  it('changes exactly at the boundary years and nowhere else', () => {
    expect(TOWN_ERA_START_YEARS).toHaveLength(TOWN_ERA_COUNT);
    const boundaries: number[] = [];
    for (let year = EARLIEST_START_YEAR; year <= 2_400; year++) {
      if (townEraFor(year) !== townEraFor(year - 1)) boundaries.push(year);
    }
    expect(boundaries).toEqual([...TOWN_ERA_START_YEARS].slice(1));
  });

  it('crosses exactly two eras over the century a 1950 game plays', () => {
    // The player-facing consequence, stated as a number: a normal game starts
    // in the gable era and ends in the glass one, having repainted its town
    // twice in a hundred years. That is what makes three stages the right
    // count - one per third of the span, not one per decade.
    const seen = new Set<number>();
    for (let year = START_YEAR; year <= END_YEAR; year++) seen.add(townEraFor(year));
    expect([...seen].sort((a, b) => a - b)).toEqual([TownEra.Gable, TownEra.Slab, TownEra.Glass]);
  });
});

describe('the gable era is the identity, exactly as the temperate climate is', () => {
  it('draws the pre-M23 town in every number', () => {
    // The six cells as `drawTownBuilding` had them written out before the era
    // table existed. If any of these move, every measured piece of optics in
    // this project - D-206's lift table, D-205's chunk headroom, the emissive
    // twins - is measuring a different town, and it says so here.
    const gable = (kind: number, stage: number) => townCellShape(kind, stage, TownEra.Gable);
    expect(gable(0, 0)).toEqual({
      u: 0.5,
      v: 0.5 * 0.78,
      wall: 9,
      roof: 6,
      windowRows: 1,
      windowColumns: 2,
    });
    expect(gable(0, 1).wall).toBe(16);
    expect(gable(0, 1).roof).toBe(7);
    expect(gable(1, 0)).toEqual({
      u: 0.54,
      v: 0.54 * 0.86,
      wall: 15,
      roof: 3,
      windowRows: 3,
      windowColumns: 3,
    });
    expect(gable(1, 1).wall).toBe(27);
    expect(gable(2, 0).wall).toBe(8);
    expect(gable(2, 1).wall).toBe(12);
    expect(gable(2, 1).roof).toBe(3);
  });

  it('leaves every climate colour untouched, so D-246 still holds under it', () => {
    for (const climate of CLIMATES) {
      const build = architectureFor(climate);
      expect(townPalette(0, climate, TownEra.Gable, '#5d7f92')).toEqual({
        wall: build.houseWall,
        roof: build.houseRoof,
        glazing: '#5d7f92',
      });
      expect(townPalette(1, climate, TownEra.Gable, '#3f6f88').wall).toBe(build.blockWall);
      expect(townPalette(2, climate, TownEra.Gable, '#82aebf').wall).toBe(build.shedWall);
    }
    const spec = eraSpecFor(TownEra.Gable);
    expect(spec.wallHeight).toBe(1);
    expect(spec.roofPitch).toBe(1);
    expect(spec.wallMix).toBe(0);
    expect(spec.glassMix).toBe(0);
    expect(spec.windowRows).toBe(0);
    expect(spec.windowColumns).toBe(0);
  });

  it('keeps the climate pitch inside the shape, so a gable is still climate-built', () => {
    // The one place the two tables multiply. The arctic roof is the steepest
    // and the desert one the shallowest (D-246), and that has to survive the
    // era flattening it, or M23's fourth face would be gone by 1975.
    const arctic = townCellShape(0, 1, TownEra.Gable, MapClimate.Arctic).roof;
    const desert = townCellShape(0, 1, TownEra.Gable, MapClimate.Desert).roof;
    expect(arctic).toBeGreaterThan(desert);
    for (const era of ALL_TOWN_ERAS) {
      const a = townCellShape(0, 1, era, MapClimate.Arctic).roof;
      const d = townCellShape(0, 1, era, MapClimate.Desert).roof;
      if (eraSpecFor(era).roofPitch > 0) expect(a, `era ${era}`).toBeGreaterThan(d);
    }
  });
});

describe('the three eras are three different towns', () => {
  it('reports the silhouette table it measured', () => {
    const rows: string[] = [];
    for (const era of ALL_TOWN_ERAS) {
      const lifts = KINDS.flatMap((kind) =>
        STAGES.map((stage) => townCellLiftPx(kind, stage, era, MapClimate.Temperate)),
      );
      rows.push(
        `era ${era}: lifts ${lifts.map((lift) => (lift / TILE_H).toFixed(2)).join(' / ')} ` +
          `tile heights, tallest ${(tallestTownCellLiftPx([era]) / TILE_H).toFixed(2)} ` +
          `of ${BAKED_STATIC_MAX_LIFT_PX / TILE_H}`,
      );
    }
    console.log(`town eras (SPEC2 M23):\n  ${rows.join('\n  ')}`);
    expect(rows).toHaveLength(TOWN_ERA_COUNT);
  });

  it('gives no two eras the same wall, roof pitch or window grid', () => {
    expect(TOWN_ERA_SPECS).toHaveLength(TOWN_ERA_COUNT);
    for (let a = 0; a < TOWN_ERA_COUNT; a++) {
      for (let b = a + 1; b < TOWN_ERA_COUNT; b++) {
        const first = TOWN_ERA_SPECS[a]!;
        const second = TOWN_ERA_SPECS[b]!;
        expect(first.wallHeight, `${a} vs ${b} wall`).not.toBe(second.wallHeight);
        expect(first.roofPitch, `${a} vs ${b} pitch`).not.toBe(second.roofPitch);
        expect(first.windowColumns, `${a} vs ${b} windows`).not.toBe(second.windowColumns);
      }
    }
  });

  it('flattens the roof and glazes the facade as the century runs', () => {
    // The direction SPEC2 names: gable, then slab, then glass. Each step has
    // to be monotone or the three stages would not read as a sequence.
    for (let era = 1; era < TOWN_ERA_COUNT; era++) {
      const previous = TOWN_ERA_SPECS[era - 1]!;
      const current = TOWN_ERA_SPECS[era]!;
      expect(current.roofPitch).toBeLessThan(previous.roofPitch);
      expect(current.glassMix).toBeGreaterThan(previous.glassMix);
      expect(current.windowRows).toBeGreaterThan(previous.windowRows);
      expect(current.wallHeight).toBeGreaterThan(previous.wallHeight);
      // And the town grows a little taller each time, which is the one axis
      // the rule below has to keep an eye on.
      expect(tallestTownCellLiftPx([era as TownEra])).toBeGreaterThan(
        tallestTownCellLiftPx([(era - 1) as TownEra]),
      );
    }
  });

  it('leaves the four climates apart in EVERY era', () => {
    // The era mixes towards its material, it does not replace it (D-246 would
    // otherwise be deleted from two thirds of the century). Every pair of
    // climates has to stay distinguishable under every era.
    for (const era of ALL_TOWN_ERAS) {
      const walls = CLIMATES.map((climate) => townPalette(0, climate, era, '#5d7f92').wall);
      expect(new Set(walls).size, `era ${era}`).toBe(TOWN_ARCHITECTURE.length);
    }
  });

  it('mixes colours the way the season mixes snow, and never past the ends', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('rgb(255,255,255)');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
  });
});

describe('the proportion rule of D-206, on the axis D-206 handed to M23', () => {
  it('holds every era, every zone, every stage and every climate under the reserve', () => {
    for (const era of ALL_TOWN_ERAS) {
      for (const climate of CLIMATES) {
        for (const kind of KINDS) {
          for (const stage of STAGES) {
            const lift = townCellLiftPx(kind, stage, era, climate);
            expect(lift, `era ${era} climate ${climate} kind ${kind} stage ${stage}`).toBeLessThan(
              BAKED_STATIC_MAX_LIFT_PX,
            );
          }
        }
      }
    }
    expect(townErasFitProportionRule()).toBe(true);
  });

  it('measures against the ONE number the baker enforces, on the same datum', () => {
    // D-206's whole authority is that the ceiling is a number the game
    // already had - what a procedural cell physically reserves above its own
    // tile diamond. `tools/bake-lib.ts` refuses to BAKE a cell over it and
    // `assetsBake.spec.ts` proves that refusal on synthetic geometry; the era
    // table cannot be refused by a baker because it bakes nothing, so it is
    // held to the same number here.
    expect(BAKED_STATIC_MAX_LIFT_PX).toBe(CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2);
    expect(BAKED_STATIC_MAX_LIFT_PX / TILE_H).toBe(2);
  });

  it('leaves a needle tower impossible rather than merely absent', () => {
    // The 1999 skyscraper D-206 removed lifted 4.30 tile heights. The tallest
    // thing ANY era can put on a tile is bounded by the table, so the way
    // back to a needle is a factor in `TOWN_ERA_SPECS`, and a factor that
    // reached for one would fail the assertion above. Stated as a band rather
    // than as a digit: an era may grow the town by a quarter, not by four.
    const gable = tallestTownCellLiftPx([TownEra.Gable]);
    const tallest = tallestTownCellLiftPx();
    expect(tallest / gable).toBeLessThan(1.35);
    expect(tallest / TILE_H).toBeLessThan(1.5);
  });
});

describe('the era travels the M18 regeneration seam and no second path', () => {
  it('is a pure function of the published year, with nothing stored anywhere', () => {
    // The acceptance sentence: "ein 1950 gestartetes, 2049 geladenes Save
    // zeigt SOFORT die 2049-Optik (Regeneration aus Snapshot, kein
    // gespeicherter Render-Zustand)". A world's start year is nowhere in this
    // call - only the year the snapshot announces - so a save loaded at a
    // 2049 tick can only produce the 2049 look.
    const loadedIn2049 = seasonLookFor(6, MapClimate.Temperate, 2_049);
    expect(loadedIn2049.era).toBe(TownEra.Glass);
    expect(seasonLookFor(6, MapClimate.Temperate, 1_950).era).toBe(TownEra.Gable);
    // Same arguments, same answer, whatever has happened in between.
    expect(seasonLookFor(6, MapClimate.Temperate, 2_049)).toEqual(loadedIn2049);
  });

  it('puts two eras of the same month and climate in two different keys', () => {
    const gable = seasonLookFor(6, MapClimate.Temperate, 1_950);
    const slab = seasonLookFor(6, MapClimate.Temperate, 1_980);
    const glass = seasonLookFor(6, MapClimate.Temperate, 2_020);
    const keys = new Set([seasonKeyOf(gable), seasonKeyOf(slab), seasonKeyOf(glass)]);
    expect(keys.size).toBe(3);
    // And a year that changes nothing changes no key, which is what stops a
    // world repainting its atlas every January for a century.
    expect(seasonKeyOf(seasonLookFor(6, MapClimate.Temperate, 1_951))).toBe(seasonKeyOf(gable));
  });

  it('repaints the six town cells and NOT one terrain row when the era turns', () => {
    const out: number[] = [];
    const count = planSeasonRepaint(
      seasonLookFor(6, MapClimate.Temperate, 1_974),
      seasonLookFor(6, MapClimate.Temperate, 1_975),
      out,
    );
    expect(out.slice(0, count)).toEqual([SEASON_JOB_BUILDINGS]);
    // A month inside one era plans nothing at all.
    expect(
      planSeasonRepaint(
        seasonLookFor(6, MapClimate.Temperate, 1_975),
        seasonLookFor(6, MapClimate.Temperate, 1_976),
        out,
      ),
    ).toBe(0);
  });

  it('plans ONE building job when the era and the season move together', () => {
    // A world crossing an era boundary in November also crosses into winter,
    // and the six cells are repainted once for both - the season job list is
    // a set of jobs, not a list of reasons.
    const out: number[] = [];
    const count = planSeasonRepaint(
      seasonLookFor(6, MapClimate.Temperate, 1_974),
      seasonLookFor(0, MapClimate.Temperate, 1_975),
      out,
    );
    const jobs = out.slice(0, count);
    expect(jobs.filter((job) => job === SEASON_JOB_BUILDINGS)).toHaveLength(1);
    expect(jobs.length).toBeGreaterThan(1);
    expect(seasonLookFor(0, MapClimate.Temperate, 1_975).stage).toBe(SeasonStage.Winter);
  });
});

describe('what the bake may draw in which era', () => {
  it('lets the Kenney city kits draw the century they were modelled for, and no other', () => {
    expect(bakedBuildingsAllowedIn(TownEra.Gable)).toBe(true);
    expect(bakedBuildingsAllowedIn(TownEra.Slab)).toBe(false);
    expect(bakedBuildingsAllowedIn(TownEra.Glass)).toBe(false);
  });

  it('is the era the bake was measured in, so D-206`s stage ladder still applies', () => {
    // The refusal is only honest while the era the bake keeps is the era its
    // lift table was measured against (`staticArt.spec.ts` holds the baked
    // cells against the gable bound). A future bundle that bakes
    // `building:<zone>:<stage>:<era>` moves BOTH, and this is where it has to
    // come and say so.
    const allowed = ALL_TOWN_ERAS.filter(bakedBuildingsAllowedIn);
    expect(allowed).toEqual([TownEra.Gable]);
  });
});
