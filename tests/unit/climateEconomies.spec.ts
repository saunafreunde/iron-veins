import { describe, expect, it } from 'vitest';
import { SHIPPED_SCENARIOS } from '../../src/scenarios/catalog';
import { Cargo, CARGO_COUNT } from '../../src/sim/cargo/types';
import { MAP_CLIMATE_COUNT, MapClimate, START_YEAR } from '../../src/sim/constants';
import {
  PORT_OVERSEAS_CARGO,
  STATION_ALWAYS_ACCEPTED,
  TOWN_CARGO,
} from '../../src/sim/industry/catchment';
import {
  CLIMATE_INDUSTRY_SETS,
  CLIMATE_SIGNATURE_ARM,
  climateIndustryTypes,
  climateProducesCargo,
  industryAllowedIn,
  INDUSTRY_ARM_FOOD,
  INDUSTRY_ARM_OIL,
  INDUSTRY_ARM_STONE,
  INDUSTRY_ARM_WOOD,
  INDUSTRY_CORE,
} from '../../src/sim/industry/climateSets';
import type { IndustryType } from '../../src/sim/industry/types';
import { INDUSTRY_SPECS, INDUSTRY_TYPE_COUNT, industrySpec } from '../../src/sim/industry/types';
import { CLIMATE_PLACE_NAMES, PlaceNameGenerator } from '../../src/sim/mapgen/names';
import { Rng } from '../../src/sim/rng';
import { TOWN_OUTPUTS } from '../../src/sim/town/update';
import { climateAllowsSpec, specAvailable } from '../../src/sim/vehicles/availability';
import { VEHICLE_SPECS } from '../../src/sim/vehicles/catalog';
import { architectureFor, TOWN_ARCHITECTURE } from '../../src/render/townArchitecture';
import { placeNamesIn } from './briefingPlaceNames';

/**
 * The four climate economies of SPEC2 M23 (D-246), held against the tables
 * themselves rather than against a played world.
 *
 * The milestone's acceptance sentence is "vier Klimata mit disjunkt
 * erkennbaren Industrieketten spielbar", and that is three separate claims:
 * the sets are DIFFERENT, each set is CLOSED in the D-118 sense, and the
 * difference is a whole CHAIN rather than a missing works here and there.
 * Every one of them is asked of `climateSets.ts` below, because a table is
 * where the answer either holds for all four or does not.
 *
 * **What is NOT claimed, said here rather than left to be discovered.** The
 * four SETS are not pairwise disjoint and cannot be: the coal, the iron and
 * the steel that every balancing scenario of section 19.4 is calibrated on
 * are in all four, and a climate without them would be a climate the game has
 * never been balanced for. The temperate set is the whole catalogue, so the
 * other three are SUBSETS of it, not disjoint from it - the reason is in
 * D-246 and it is the reason D-245 closed the era catalogue in 1949
 * (Fehlerkatalog 34). What IS disjoint, exactly and by test, is the four
 * ARMS: they partition the catalogue with the core, and each of them runs in
 * exactly two climates - its own and the temperate one.
 */

const CLIMATES: readonly MapClimate[] = [
  MapClimate.Temperate,
  MapClimate.Arctic,
  MapClimate.Tropical,
  MapClimate.Desert,
];

const NAME_OF: readonly string[] = ['temperate', 'arctic', 'tropical', 'desert'];

/** Everything on a map of this climate that will take a cargo IN. */
function acceptsIn(climate: MapClimate, cargo: number): boolean {
  for (const type of climateIndustryTypes(climate)) {
    if (industrySpec(type).inputs.includes(cargo as Cargo)) return true;
  }
  return (
    TOWN_CARGO.includes(cargo as Cargo) ||
    STATION_ALWAYS_ACCEPTED.includes(cargo as Cargo) ||
    PORT_OVERSEAS_CARGO.includes(cargo as Cargo)
  );
}

describe('the four climate sets are four economies', () => {
  it('partitions the catalogue into a core and four disjoint arms', () => {
    const arms = [INDUSTRY_ARM_FOOD, INDUSTRY_ARM_OIL, INDUSTRY_ARM_WOOD, INDUSTRY_ARM_STONE];
    const seen = new Set<IndustryType>();

    for (const type of INDUSTRY_CORE) {
      expect(seen.has(type), `core lists ${type} twice`).toBe(false);
      seen.add(type);
    }
    for (const arm of arms) {
      for (const type of arm) {
        // The disjointness claim in its literal form: no industry belongs to
        // two arms, and none belongs to an arm AND to the core.
        expect(seen.has(type), `industry ${type} is in two groups`).toBe(false);
        seen.add(type);
      }
    }
    // Exhaustive: an industry added to the catalogue and to no group would be
    // an industry no climate has, which is worse than one every climate has.
    expect(seen.size).toBe(INDUSTRY_TYPE_COUNT);
    expect(INDUSTRY_SPECS).toHaveLength(INDUSTRY_TYPE_COUNT);
  });

  it('gives every climate the core plus its own signature arm', () => {
    expect(CLIMATE_INDUSTRY_SETS).toHaveLength(MAP_CLIMATE_COUNT);
    expect(CLIMATE_SIGNATURE_ARM).toHaveLength(MAP_CLIMATE_COUNT);

    for (const climate of CLIMATES) {
      const set = new Set(climateIndustryTypes(climate));
      for (const type of INDUSTRY_CORE) {
        expect(set.has(type), `${NAME_OF[climate]} lacks core industry ${type}`).toBe(true);
      }
      for (const type of CLIMATE_SIGNATURE_ARM[climate]!) {
        expect(set.has(type), `${NAME_OF[climate]} lacks its own arm`).toBe(true);
      }
    }

    // The four signature arms are four DIFFERENT arms - the property that
    // makes "each climate is recognised by a chain" mean anything.
    expect(new Set(CLIMATE_SIGNATURE_ARM).size).toBe(MAP_CLIMATE_COUNT);
  });

  it('runs each signature chain in exactly two climates: its own and temperate', () => {
    for (const climate of CLIMATES) {
      for (const type of CLIMATE_SIGNATURE_ARM[climate]!) {
        for (const other of CLIMATES) {
          const expected = other === climate || other === MapClimate.Temperate;
          expect(
            industryAllowedIn(other, type),
            `industry ${type} of ${NAME_OF[climate]} in ${NAME_OF[other]}`,
          ).toBe(expected);
        }
      }
    }
  });

  it('leaves no two climates with the same offer, and none of the three nested', () => {
    for (const a of CLIMATES) {
      for (const b of CLIMATES) {
        if (a === b) continue;
        const setA = new Set(climateIndustryTypes(a));
        const setB = new Set(climateIndustryTypes(b));
        expect(setA.size === setB.size && [...setA].every((t) => setB.has(t))).toBe(false);

        // Between the three SPECIALISED climates the difference runs both
        // ways: each has a chain the other cannot run. Against temperate it
        // runs one way only, which is the nesting D-246 records and the whole
        // of what this milestone did not claim.
        if (a !== MapClimate.Temperate && b !== MapClimate.Temperate) {
          expect(
            [...setA].some((type) => !setB.has(type)),
            `${NAME_OF[a]} has nothing ${NAME_OF[b]} lacks`,
          ).toBe(true);
        }
      }
      expect(
        [...climateIndustryTypes(MapClimate.Temperate)].length,
        'temperate is the whole catalogue',
      ).toBe(INDUSTRY_TYPE_COUNT);
    }
  });

  /**
   * The D-118 walk, once per climate set (SPEC2 M23's own "D-118-Kettenlauf je
   * Klima-Set").
   *
   * The catalogue-wide version in `deliveries.spec.ts` asks the question of
   * the whole table; it cannot see a set that keeps a plastics plant and drops
   * the refinery that supplies it, or a farm whose food works is in another
   * climate. Both halves are asked here: nothing produced without a taker, and
   * nothing consumed without a supplier - the second is the one a per-climate
   * subset can break, and the one the map generator would otherwise have to
   * repair by deleting half of what it placed.
   */
  it('closes every chain in every climate, in both directions', () => {
    for (const climate of CLIMATES) {
      for (const type of climateIndustryTypes(climate)) {
        const spec = industrySpec(type);
        for (const cargo of spec.outputs) {
          expect(
            acceptsIn(climate, cargo),
            `${NAME_OF[climate]}: nobody takes cargo ${cargo} from industry ${type}`,
          ).toBe(true);
        }
        for (const cargo of spec.inputs) {
          expect(
            climateProducesCargo(climate, cargo),
            `${NAME_OF[climate]}: nobody makes cargo ${cargo} for industry ${type}`,
          ).toBe(true);
        }
      }
    }
  });

  it('leaves every climate a chain worth building: a source, a works and a sink', () => {
    for (const climate of CLIMATES) {
      const types = climateIndustryTypes(climate);
      const sources = types.filter((type) => industrySpec(type).inputs.length === 0);
      const works = types.filter(
        (type) => industrySpec(type).inputs.length > 0 && industrySpec(type).outputs.length > 0,
      );
      expect(sources.length, `${NAME_OF[climate]} sources`).toBeGreaterThan(1);
      expect(works.length, `${NAME_OF[climate]} processing works`).toBeGreaterThan(1);
      // Something a town buys: without it the whole map is raw material with
      // nowhere to go, which is D-118's dead end at the scale of a world.
      expect(
        TOWN_CARGO.some((cargo) => climateProducesCargo(climate, cargo)),
        `${NAME_OF[climate]} makes nothing a town buys`,
      ).toBe(true);
    }
  });

  it('counts a cargo as available exactly when something on that map makes one', () => {
    for (const climate of CLIMATES) {
      for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
        const fromIndustry = climateIndustryTypes(climate).some((type) =>
          industrySpec(type).outputs.includes(cargo as Cargo),
        );
        const fromTown = TOWN_OUTPUTS.includes(cargo as Cargo);
        const fromPort = PORT_OVERSEAS_CARGO.includes(cargo as Cargo);
        expect(climateProducesCargo(climate, cargo as Cargo), `${NAME_OF[climate]}/${cargo}`).toBe(
          fromIndustry || fromTown || fromPort,
        );
      }
    }
    // The temperate world makes everything except the id M19 retired.
    for (let cargo = 0; cargo < CARGO_COUNT; cargo++) {
      if (cargo === Cargo.Passengers) continue;
      expect(climateProducesCargo(MapClimate.Temperate, cargo as Cargo), `temperate/${cargo}`).toBe(
        true,
      );
    }
  });
});

describe('the vehicle mask shares the era gate', () => {
  it('refuses nothing at all in a temperate world', () => {
    // The identity claim, and the reason no band, no pin and no temperate
    // scenario moved with this bundle.
    for (const spec of VEHICLE_SPECS) {
      expect(climateAllowsSpec(spec, MapClimate.Temperate), spec.nameKey).toBe(true);
      expect(specAvailable(spec, START_YEAR, MapClimate.Temperate)).toBe(
        START_YEAR >= spec.introYear && START_YEAR <= spec.retireYear,
      );
    }
  });

  it('is the era window AND the climate, in one function', () => {
    for (const spec of VEHICLE_SPECS) {
      for (const climate of CLIMATES) {
        for (const year of [1850, 1900, START_YEAR, 2000, 2050]) {
          const era = year >= spec.introYear && year <= spec.retireYear;
          expect(specAvailable(spec, year, climate), `${spec.nameKey}/${year}`).toBe(
            era && climateAllowsSpec(spec, climate),
          );
        }
      }
    }
  });

  it('keeps traction, a passenger vehicle and a mail vehicle in every climate', () => {
    for (const climate of CLIMATES) {
      const offered = VEHICLE_SPECS.filter((spec) => specAvailable(spec, START_YEAR, climate));
      expect(offered.length, `${NAME_OF[climate]} offers nothing`).toBeGreaterThan(0);
      expect(
        offered.some((spec) => Object.keys(spec.capacity).length === 0),
        `${NAME_OF[climate]} has no traction`,
      ).toBe(true);
      for (const cargo of TOWN_OUTPUTS) {
        expect(
          offered.some(
            (spec) =>
              Object.keys(spec.capacity).includes(String(cargo)) ||
              spec.refittable.includes(cargo as Cargo),
          ),
          `${NAME_OF[climate]} cannot carry cargo ${cargo}`,
        ).toBe(true);
      }
    }
  });

  it('takes the vehicles a climate would have nothing to load into, and says which', () => {
    // Every specialised climate refuses something, and everything it refuses
    // it refuses for the one stated reason: not a cargo it carries or could be
    // refitted to is made on that map.
    for (const climate of CLIMATES) {
      const refused = VEHICLE_SPECS.filter((spec) => !climateAllowsSpec(spec, climate));
      if (climate === MapClimate.Temperate) {
        expect(refused).toHaveLength(0);
        continue;
      }
      expect(refused.length, `${NAME_OF[climate]} refuses nothing`).toBeGreaterThan(0);
      for (const spec of refused) {
        for (const key of Object.keys(spec.capacity)) {
          expect(climateProducesCargo(climate, Number(key) as Cargo), spec.nameKey).toBe(false);
        }
        for (const cargo of spec.refittable) {
          expect(climateProducesCargo(climate, cargo), spec.nameKey).toBe(false);
        }
      }
    }
  });
});

describe('the place names of the four worlds', () => {
  it('names the temperate world in German and every other world in English', () => {
    expect(CLIMATE_PLACE_NAMES).toHaveLength(MAP_CLIMATE_COUNT);
    expect(CLIMATE_PLACE_NAMES[MapClimate.Temperate]!.language).toBe('de');
    for (const climate of [MapClimate.Arctic, MapClimate.Tropical, MapClimate.Desert]) {
      expect(CLIMATE_PLACE_NAMES[climate]!.language).toBe('en');
    }
  });

  it('leaves the German generator drawing exactly what it drew before', () => {
    // The one property that keeps five shipped scenarios, the canonical hash
    // and every 19.4 band where they were: a temperate world's names are the
    // pre-M23 names, from the pre-M23 draws.
    const a = new PlaceNameGenerator(Rng.fromSeed(4711), MapClimate.Temperate);
    const b = new PlaceNameGenerator(Rng.fromSeed(4711));
    for (let i = 0; i < 64; i++) expect(a.next()).toBe(b.next());
  });

  it('hands out unique English names, and the D-199 audit reads every one', () => {
    for (const climate of [MapClimate.Arctic, MapClimate.Tropical, MapClimate.Desert]) {
      const names = new PlaceNameGenerator(Rng.fromSeed(2026 + climate), climate);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const name = names.next();
        expect(seen.has(name), `duplicate ${name}`).toBe(false);
        seen.add(name);

        // The guard has to read the generated name as ONE place and nothing
        // else - the property the briefing audit rests on, asked of the
        // generator's own output rather than of a hand-typed example.
        const read = placeNamesIn(`Von ${name} nach Nirgendwo.`);
        expect(
          read.map((one) => one.text),
          name,
        ).toEqual([name]);
      }
    }
  });

  it('reads no place name out of a briefing that names none', () => {
    // The cost of the widened grammar, measured instead of assumed: the
    // English syllables must not turn ordinary prose into towns. Four of the
    // eight shipped scenarios name no place in their briefing at all, in
    // either language, and they still name none - the other four are held to
    // their exact sequence by `shippedScenarios.spec.ts`, which is where a
    // false positive in a naming briefing would land.
    const silent = ['speedrun', 'frachtrausch', 'ratsdiplomatie', 'ueberleben'];
    for (const scenario of SHIPPED_SCENARIOS) {
      if (!silent.includes(scenario.id)) continue;
      for (const locale of ['de', 'en'] as const) {
        expect(
          placeNamesIn(scenario.briefing[locale]).map((one) => one.text),
          `${scenario.id}/${locale}`,
        ).toEqual([]);
      }
    }
  });
});

describe('the town architecture of the four worlds', () => {
  it('has one look per climate and no two the same', () => {
    expect(TOWN_ARCHITECTURE).toHaveLength(MAP_CLIMATE_COUNT);
    const seen = new Set<string>();
    for (const climate of CLIMATES) {
      const look = architectureFor(climate);
      const key = JSON.stringify(look);
      expect(seen.has(key), `${NAME_OF[climate]} repeats another climate`).toBe(false);
      seen.add(key);
      expect(look.roofPitch).toBeGreaterThan(0);
      for (const colour of [
        look.houseWall,
        look.houseRoof,
        look.blockWall,
        look.blockRoof,
        look.shedWall,
        look.shedRoof,
      ]) {
        expect(colour, `${NAME_OF[climate]} colour`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('draws the temperate town in exactly the colours the atlas always used', () => {
    // The pre-M23 literals, kept here rather than in the drawing code: a table
    // that changed the temperate row would change the artwork of every world
    // this game has ever shipped, and nothing else in the repository would
    // notice.
    expect(architectureFor(MapClimate.Temperate)).toEqual({
      houseWall: '#c9b79c',
      houseRoof: '#8d4b3c',
      roofPitch: 1,
      blockWall: '#cfd4d8',
      blockRoof: '#9aa1a8',
      shedWall: '#9b968c',
      shedRoof: '#5c6068',
    });
  });

  it('pitches an arctic roof steeper than a desert one', () => {
    expect(architectureFor(MapClimate.Arctic).roofPitch).toBeGreaterThan(
      architectureFor(MapClimate.Temperate).roofPitch,
    );
    expect(architectureFor(MapClimate.Desert).roofPitch).toBeLessThan(
      architectureFor(MapClimate.Tropical).roofPitch,
    );
  });
});
