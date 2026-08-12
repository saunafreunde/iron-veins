import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { EARLIEST_START_YEAR, END_YEAR, MapClimate, START_YEAR } from '../../src/sim/constants';
import { ERA_SPECS } from '../../src/sim/vehicles/eraCatalog';
import { availableVehicles, VEHICLE_SPECS } from '../../src/sim/vehicles/catalog';
import { RailRole, VehicleKind, type VehicleSpec } from '../../src/sim/vehicles/spec';

/**
 * The pre-1950 catalogue of SPEC2 M23 (E-15, D-245).
 *
 * Three questions, and the second one is the reason this file exists at all:
 *
 *  1. is the table what SPEC2 asked for - about sixty entries over rail, road
 *     and water, with at least one new generation per decade per group?
 *  2. is it CLOSED, so that no world starting in 1950 can see any of it? That
 *     is the claim every band in section 19.4 now rests on: an era vehicle
 *     still on sale in 1950 would enter `renewal.ts`'s total order and the
 *     AI's ranking, and would re-band the lot inside the milestone that
 *     introduced the table (Fehlerkatalog 34).
 *  3. is the era gating DATA-driven - i.e. did M23 add a table rather than a
 *     mechanism? The gate is `introYear`/`retireYear` against the world's own
 *     calendar year, and it has been since M3.
 */

const ERA_COUNT = 60;

/** The era block, defined by the ONE predicate the art coupling test also uses. */
function isEra(spec: VehicleSpec): boolean {
  return spec.introYear < START_YEAR;
}

const RAIL_TRACTION = ERA_SPECS.filter((spec) => spec.railRole === RailRole.Traction);
const RAIL_WAGONS = ERA_SPECS.filter((spec) => spec.railRole === RailRole.Wagon);
const ROAD = ERA_SPECS.filter((spec) => spec.kind === VehicleKind.Road);
const WATER = ERA_SPECS.filter((spec) => spec.kind === VehicleKind.Ship);

const GROUPS: readonly { readonly name: string; readonly specs: readonly VehicleSpec[] }[] = [
  { name: 'rail traction', specs: RAIL_TRACTION },
  { name: 'rail wagons', specs: RAIL_WAGONS },
  { name: 'road', specs: ROAD },
  { name: 'water', specs: WATER },
];

describe('the pre-1950 catalogue is what SPEC2 M23 asked for', () => {
  it('carries about sixty entries over rail, road and water, and no aircraft', () => {
    expect(ERA_SPECS.length).toBe(ERA_COUNT);
    expect(RAIL_TRACTION.length + RAIL_WAGONS.length + ROAD.length + WATER.length).toBe(ERA_COUNT);
    // E-14 keeps aircraft procedural and SPEC2 M23 names rail, road and water
    // only - a 1900 airliner would also be a claim about history nobody made.
    for (const spec of ERA_SPECS) {
      expect(spec.kind, spec.nameKey).not.toBe(VehicleKind.Aircraft);
    }
  });

  it('introduces at least one generation per decade per group (SPEC.md 11.5)', () => {
    for (const group of GROUPS) {
      for (let decade = EARLIEST_START_YEAR; decade < START_YEAR; decade += 10) {
        const inDecade = group.specs.filter(
          (spec) => spec.introYear >= decade && spec.introYear < decade + 10,
        );
        expect(
          inDecade.length,
          `${group.name} has no new generation in the ${decade}s`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is a ladder inside each technology: later costs more and pulls harder', () => {
    // Compared within a FAMILY - same role, same power source, same principal
    // cargo - and nowhere wider. A 1908 electric locomotive costs more than the
    // 1915 steam one it does not replace, and a coach costs more than a coal
    // wagon of the same decade; a single ordering over a mixed list would only
    // be a sentence about the sort order, which is the trap D-234 calls reading
    // one layer too many.
    const families = new Map<string, VehicleSpec[]>();
    for (const spec of ERA_SPECS) {
      const key = `${spec.kind}:${spec.railRole}:${spec.power}:${Object.keys(spec.capacity)[0] ?? '-'}`;
      const list = families.get(key);
      if (list === undefined) families.set(key, [spec]);
      else list.push(spec);
    }
    let compared = 0;
    for (const [key, list] of families) {
      list.sort((a, b) => a.introYear - b.introYear || a.id - b.id);
      for (let at = 1; at < list.length; at++) {
        const previous = list[at - 1]!;
        const current = list[at]!;
        compared++;
        expect(current.priceCt, `${key} ${current.nameKey} price`).toBeGreaterThan(
          previous.priceCt,
        );
        expect(current.maxSpeedMs, `${key} ${current.nameKey} speed`).toBeGreaterThan(
          previous.maxSpeedMs,
        );
        expect(current.reliability0, `${key} ${current.nameKey} reliability`).toBeGreaterThan(
          previous.reliability0,
        );
      }
    }
    // A family split so fine that every entry is alone would make the loop
    // above vacuous, which is the failure this assertion exists to catch.
    expect(compared, 'the ladder compared nothing').toBeGreaterThan(ERA_COUNT / 2);
  });

  it('is a ladder across technologies too, on the one axis they share', () => {
    // The claim the split above must not lose: a 1946 locomotive pulls harder
    // than an 1850 one whatever it burns. Endpoints only, because that is the
    // whole of what "a century of progress" means here.
    for (const group of GROUPS) {
      const ordered = [...group.specs].sort((a, b) => a.introYear - b.introYear || a.id - b.id);
      const first = ordered[0]!;
      const last = ordered[ordered.length - 1]!;
      expect(last.maxSpeedMs / first.maxSpeedMs, `${group.name} speed span`).toBeGreaterThan(1.5);
      expect(last.reliability0, `${group.name} reliability span`).toBeGreaterThan(
        first.reliability0,
      );
    }
  });

  it('names every entry in both languages', () => {
    const german = de as Record<string, string>;
    const english = en as Record<string, string>;
    for (const spec of ERA_SPECS) {
      expect(german[spec.nameKey], `de ${spec.nameKey}`).toBeTruthy();
      expect(english[spec.nameKey], `en ${spec.nameKey}`).toBeTruthy();
    }
  });

  it('claims no id another catalogue already uses', () => {
    const seen = new Set<number>();
    for (const spec of VEHICLE_SPECS) {
      expect(seen.has(spec.id), `duplicate vehicle id ${spec.id} (${spec.nameKey})`).toBe(false);
      seen.add(spec.id);
    }
  });
});

/**
 * The closure claim, and it is asserted from both sides so that neither a
 * shrunken era block nor a leaked entry can pass.
 */
describe('the era block is closed at 1949', () => {
  it('retires every entry before START_YEAR', () => {
    for (const spec of ERA_SPECS) {
      expect(spec.introYear, spec.nameKey).toBeLessThan(START_YEAR);
      expect(spec.introYear, spec.nameKey).toBeGreaterThanOrEqual(EARLIEST_START_YEAR);
      expect(spec.retireYear, spec.nameKey).toBeLessThan(START_YEAR);
      expect(spec.retireYear, spec.nameKey).toBeGreaterThanOrEqual(spec.introYear);
    }
  });

  it('leaves the buy list of every year from 1950 on exactly as it was', () => {
    // The strongest form of "no band moved": for every playable year of a 1950
    // world and every mode, the ids on offer are the ids the pre-M23 catalogue
    // offered - which is the same set as "everything that is not era".
    const kinds = [VehicleKind.Train, VehicleKind.Road, VehicleKind.Ship, VehicleKind.Aircraft];
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (const kind of kinds) {
        const offered = availableVehicles(kind, year, MapClimate.Temperate).map((spec) => spec.id);
        const expected = VEHICLE_SPECS.filter(
          (spec) =>
            spec.kind === kind && !isEra(spec) && year >= spec.introYear && year <= spec.retireYear,
        ).map((spec) => spec.id);
        expect(offered, `${kind} in ${year}`).toEqual(expected);
      }
    }
  });

  it('offers traction, wagons, a road vehicle and a ship in every era year', () => {
    // The other half of the same claim: a start year with nothing to buy is a
    // world that cannot be played, which is why the presets are presets.
    for (let year = EARLIEST_START_YEAR; year < START_YEAR; year++) {
      const trains = availableVehicles(VehicleKind.Train, year, MapClimate.Temperate);
      expect(
        trains.some((spec) => spec.railRole === RailRole.Traction),
        `no traction in ${year}`,
      ).toBe(true);
      expect(
        trains.some((spec) => spec.railRole === RailRole.Wagon),
        `no wagon in ${year}`,
      ).toBe(true);
      expect(
        availableVehicles(VehicleKind.Road, year, MapClimate.Temperate).length,
        `no road vehicle in ${year}`,
      ).toBeGreaterThan(0);
      expect(
        availableVehicles(VehicleKind.Ship, year, MapClimate.Temperate).length,
        `no ship in ${year}`,
      ).toBeGreaterThan(0);
    }
  });

  it('has an era catalogue in every start-year preset, and a passenger one', () => {
    // What "a 1850 game with the steam catalogue" needs to be a game: something
    // that pulls, something that carries people, and something that carries
    // coal. Asserted at the four preset years rather than everywhere, because
    // this is the claim about the SCREEN's offer.
    for (const year of [1850, 1880, 1920]) {
      const trains = availableVehicles(VehicleKind.Train, year, MapClimate.Temperate);
      expect(
        trains.some((spec) => spec.railRole === RailRole.Traction && spec.power === 'steam'),
        `no steam traction in ${year}`,
      ).toBe(true);
      const wagons = trains.filter((spec) => spec.railRole === RailRole.Wagon);
      expect(
        wagons.some((spec) => (spec.capacity[18] ?? 0) > 0),
        `no coach in ${year}`,
      ).toBe(true);
      expect(
        wagons.some((spec) => (spec.capacity[2] ?? 0) > 0),
        `no coal wagon in ${year}`,
      ).toBe(true);
    }
  });
});
