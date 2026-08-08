import { describe, expect, it } from 'vitest';
import { addCargo } from '../../src/sim/cargo/stack';
import { Cargo } from '../../src/sim/cargo/types';
import {
  RATING_EQUIPMENT_MAX,
  RATING_FREQUENCY_MAX,
  RATING_OVERFLOW_PENALTY_MAX,
  RATING_RELIABILITY_MAX,
  RATING_WAIT_BAD_DAYS,
  RATING_WAIT_MAX,
  RELIABILITY_MAX,
  STATION_BASE_RADIUS,
  STATION_JOIN_DISTANCE,
  STATION_RATING_BASE,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { stationMarkers } from '../../src/sim/markers';
import { historySlot, StationHistoryField } from '../../src/sim/station/history';
import {
  catchmentAfterPlacing,
  dominantLossTerm,
  joinTargetIdFor,
  ModuleKind,
  RATING_TERM_MAX,
  ratingLossOf,
  ratingTerms,
  RatingTermIndex,
  stationRadius,
  stationRating,
  type RatingTerms,
  type Station,
} from '../../src/sim/station/types';
import { buildTransferNetwork, runTicks } from '../helpers/transferNetwork';

/**
 * The station x-ray of SPEC2 M14: the five 10.1 terms individually
 * quantified with ONE source of truth (`ratingTerms`, which `stationRating`
 * itself sums), the dominant-loss selection the warning sentence names, and
 * the catchment preview built from the same D-095 centre and join rules the
 * build command applies.
 */

function freshTerms(): RatingTerms {
  return { wait: 0, frequency: 0, equipment: 0, reliability: 0, overflow: 0 };
}

/** The sum the rating is defined as - the ONE formula, asserted as such. */
function summed(terms: RatingTerms): number {
  const raw =
    STATION_RATING_BASE +
    terms.wait +
    terms.frequency +
    terms.equipment +
    terms.reliability -
    terms.overflow;
  const clamped = raw < 0 ? 0 : raw > 100 ? 100 : raw;
  return Math.round(clamped);
}

describe('ratingTerms is the rating', () => {
  it('sums to stationRating across real station states', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    runTicks(network, TICKS_PER_MONTH + 50);

    // The played stations, plus deliberately bent extremes on top of them.
    const a = world.stations[network.stations.a]!;
    a.overflowUnits = 10_000; // overflow saturated
    const b = world.stations[network.stations.b]!;
    b.servedReliability = RELIABILITY_MAX; // reliability at full marks
    const c = world.stations[network.stations.c]!;
    c.waiting.length = 0;
    addCargo(c.waiting, {
      cargo: Cargo.CommuterPax,
      amount: 100,
      createdTick: world.tick - (RATING_WAIT_BAD_DAYS + 5) * TICKS_PER_DAY,
      originStationId: c.id,
      destinationStationId: network.stations.b,
      paidFromX: c.x,
      paidFromY: c.y,
    }); // wait term at zero

    for (const station of world.stations) {
      const terms = ratingTerms(station, world.tick, freshTerms());
      expect(terms.wait).toBeGreaterThanOrEqual(0);
      expect(terms.wait).toBeLessThanOrEqual(RATING_WAIT_MAX);
      expect(terms.frequency).toBeGreaterThanOrEqual(0);
      expect(terms.frequency).toBeLessThanOrEqual(RATING_FREQUENCY_MAX);
      expect(terms.equipment).toBeGreaterThanOrEqual(0);
      expect(terms.equipment).toBeLessThanOrEqual(RATING_EQUIPMENT_MAX);
      expect(terms.reliability).toBeGreaterThanOrEqual(0);
      expect(terms.reliability).toBeLessThanOrEqual(RATING_RELIABILITY_MAX);
      expect(terms.overflow).toBeGreaterThanOrEqual(0);
      expect(terms.overflow).toBeLessThanOrEqual(RATING_OVERFLOW_PENALTY_MAX);
      expect(summed(terms)).toBe(stationRating(station, world.tick));
    }
    expect(ratingTerms(a, world.tick, freshTerms()).overflow).toBe(RATING_OVERFLOW_PENALTY_MAX);
    expect(ratingTerms(b, world.tick, freshTerms()).reliability).toBe(RATING_RELIABILITY_MAX);
    expect(ratingTerms(c, world.tick, freshTerms()).wait).toBe(0);
  });
});

describe('the dominant loss term', () => {
  const full: RatingTerms = {
    wait: RATING_WAIT_MAX,
    frequency: RATING_FREQUENCY_MAX,
    equipment: RATING_EQUIPMENT_MAX,
    reliability: RATING_RELIABILITY_MAX,
    overflow: 0,
  };

  it('names the biggest leak', () => {
    expect(dominantLossTerm({ ...full, frequency: 5 })).toBe(RatingTermIndex.Frequency);
    expect(dominantLossTerm({ ...full, wait: 0 })).toBe(RatingTermIndex.Wait);
    expect(dominantLossTerm({ ...full, overflow: 12 })).toBe(RatingTermIndex.Overflow);
    expect(dominantLossTerm({ ...full, reliability: 0, equipment: 3 })).toBe(
      RatingTermIndex.Equipment,
    );
  });

  it('breaks ties towards the lower index, so the sentence cannot flicker', () => {
    // Wait loses 10 and frequency loses 10: wait (index 0) wins.
    const tied: RatingTerms = {
      ...full,
      wait: RATING_WAIT_MAX - 10,
      frequency: RATING_FREQUENCY_MAX - 10,
    };
    expect(dominantLossTerm(tied)).toBe(RatingTermIndex.Wait);
    // A station at full marks everywhere still answers deterministically.
    expect(dominantLossTerm(full)).toBe(RatingTermIndex.Wait);
    expect(ratingLossOf(full, dominantLossTerm(full))).toBe(0);
  });

  it('covers all five 10.1 terms and their maxima', () => {
    expect(RATING_TERM_MAX).toEqual([
      RATING_WAIT_MAX,
      RATING_FREQUENCY_MAX,
      RATING_EQUIPMENT_MAX,
      RATING_RELIABILITY_MAX,
      RATING_OVERFLOW_PENALTY_MAX,
    ]);
  });
});

describe('the catchment preview', () => {
  it('previews a new station at the module itself with the base radius', () => {
    expect(catchmentAfterPlacing([], ModuleKind.BusStop, 5, 7)).toEqual({
      x: 5,
      y: 7,
      radius: STATION_BASE_RADIUS,
    });
  });

  it('recomputes the joined centre and grows the radius with the modules', () => {
    const existing = [
      { kind: ModuleKind.BusStop, x: 10, y: 10 },
      { kind: ModuleKind.BusStop, x: 11, y: 10 },
    ];
    // Three modules: centre rounds to the middle, radius steps up by one.
    expect(catchmentAfterPlacing(existing, ModuleKind.BusStop, 12, 10)).toEqual({
      x: 11,
      y: 10,
      radius: STATION_BASE_RADIUS + 1,
    });
  });

  it('leaves a quay out of the centre but not out of the module count (D-095)', () => {
    const existing = [{ kind: ModuleKind.BusStop, x: 10, y: 10 }];
    const preview = catchmentAfterPlacing(existing, ModuleKind.Quay, 14, 10);
    // The berth reaches into the water; the centre stays on the shore.
    expect(preview.x).toBe(10);
    expect(preview.y).toBe(10);
    expect(preview.radius).toBe(STATION_BASE_RADIUS);

    // A port of nothing but water modules falls back to the modules it has.
    expect(catchmentAfterPlacing([], ModuleKind.Quay, 14, 10)).toEqual({
      x: 14,
      y: 10,
      radius: STATION_BASE_RADIUS,
    });
  });

  it('answers the join question exactly as the build command does', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    const station = world.stations[network.stations.a]!;

    // One tile beside station A's stop: the preview names A...
    expect(joinTargetIdFor(world.stations, 0, station.x + 1, station.y)).toBe(station.id);
    // ...past the join distance it names a new station...
    expect(
      joinTargetIdFor(world.stations, 0, station.x + STATION_JOIN_DISTANCE + 2, station.y + 20),
    ).toBe(-1);
    // ...and another company's modules never join the player's station.
    expect(joinTargetIdFor(world.stations, 1, station.x + 1, station.y)).toBe(-1);

    // The live radius rule and the preview's are the same function chain.
    expect(
      catchmentAfterPlacing(station.modules, ModuleKind.BusStop, station.x + 1, station.y).radius,
    ).toBe(stationRadius({ modules: [...station.modules, station.modules[0]!] } as Station));
  });
});

describe('the station marker carries the x-ray', () => {
  it('ships terms, per-cargo waiting and the history ring as the sim knows them', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    runTicks(network, TICKS_PER_MONTH + 50);

    const markers = stationMarkers(world);
    expect(markers.length).toBe(world.stations.length);

    for (const marker of markers) {
      const station = world.stations[marker.id]!;
      // The terms on the wire are the sim's own, and they sum to the rating.
      const expected = ratingTerms(station, world.tick, freshTerms());
      expect(marker.terms).toEqual(expected);
      expect(summed(marker.terms)).toBe(marker.rating);

      // The waiting table adds up to the aggregate the list still shows.
      let tableUnits = 0;
      for (const row of marker.waitingByCargo) tableUnits += row.units;
      expect(Math.abs(tableUnits - marker.waiting)).toBeLessThanOrEqual(
        marker.waitingByCargo.length,
      );

      // Every history row mirrors the ring, oldest first.
      for (const row of marker.history) {
        for (let month = 0; month < row.collected.length; month++) {
          const monthsAgo = row.collected.length - 1 - month;
          expect(row.collected[month]).toBe(
            station.history[
              historySlot(station, monthsAgo, row.cargo, StationHistoryField.Collected)
            ],
          );
          expect(row.expired[month]).toBe(
            station.history[
              historySlot(station, monthsAgo, row.cargo, StationHistoryField.Expired)
            ],
          );
        }
      }
    }

    // The network moved passengers, so station A has a passenger row - and
    // rows exist ONLY for cargos with recorded history.
    const a = markers[network.stations.a]!;
    expect(a.history.some((row) => row.cargo === Cargo.CommuterPax)).toBe(true);
    expect(a.history.some((row) => row.cargo === Cargo.Coal)).toBe(false);
  });
});
