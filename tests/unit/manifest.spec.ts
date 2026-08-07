import { describe, expect, it } from 'vitest';
import type { StationMarker, VehicleCargoMarker } from '../../src/shared/protocol';
import { Cargo } from '../../src/sim/cargo/types';
import { manifestDisplayRows } from '../../src/ui/manifest';

/**
 * The manifest formatting of the M14 vehicle detail (SPEC2 M14). The
 * simulation computed every number (sim/markers.ts vehicleCargoRows); this
 * pins the join the panel performs on top - names, keys, rounding - and the
 * honesty rules: a routeless parcel says so, a vanished destination is not
 * invented.
 */

function station(id: number, name: string): StationMarker {
  return {
    id,
    name,
    ownerId: 0,
    x: 0,
    y: 0,
    rating: 50,
    waiting: 0,
    transferNode: false,
    modules: [],
    terms: { wait: 0, frequency: 0, equipment: 0, reliability: 0, overflow: 0 },
    waitingByCargo: [],
    history: [],
  };
}

function row(overrides: Partial<VehicleCargoMarker>): VehicleCargoMarker {
  return {
    cargo: Cargo.Coal,
    units: 90,
    originStationId: 0,
    destinationStationId: 1,
    ageDays: 3.7,
    openTiles: 21.4,
    ...overrides,
  };
}

describe('manifestDisplayRows', () => {
  const stations = [station(0, 'Kohlgrube'), station(1, 'Stahlwerk')];

  it('joins the destination name and the cargo translation key', () => {
    const rows = manifestDisplayRows([row({})], stations);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cargoKey).toBe('cargo.coal');
    expect(rows[0]!.destinationName).toBe('Stahlwerk');
  });

  it('rounds the transit age DOWN to whole days and the distance to whole tiles', () => {
    const rows = manifestDisplayRows([row({ ageDays: 3.7, openTiles: 21.4 })], stations);
    // 3.7 days in transit means the fourth day is not complete.
    expect(rows[0]!.ageDays).toBe(3);
    expect(rows[0]!.openTiles).toBe(21);
  });

  it('marks a routeless parcel with a null destination (section 7.4)', () => {
    const rows = manifestDisplayRows([row({ destinationStationId: -1 })], stations);
    expect(rows[0]!.destinationName).toBeNull();
  });

  it('does not invent a name for a destination that vanished', () => {
    const rows = manifestDisplayRows([row({ destinationStationId: 99 })], stations);
    expect(rows[0]!.destinationName).toBeNull();
  });

  it('keeps the order the simulation sent - largest first is decided sim-side', () => {
    const rows = manifestDisplayRows(
      [row({ units: 5, cargo: Cargo.Mail }), row({ units: 90 })],
      stations,
    );
    expect(rows.map((r) => r.units)).toEqual([5, 90]);
  });

  it('formats an empty manifest as an empty table', () => {
    expect(manifestDisplayRows([], stations)).toEqual([]);
  });
});
