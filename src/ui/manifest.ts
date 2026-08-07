import type { StationMarker, VehicleCargoMarker } from '../shared/protocol';
import { cargoSpec, type Cargo } from '../sim/cargo/types';

/**
 * The manifest table of the M14 vehicle detail, formatted (SPEC2 M14).
 *
 * The simulation already computed everything numeric (sim/markers.ts
 * `vehicleCargoRows`: units, transit age, the open distance since the
 * paid-up-to point); this module only joins station names and translation
 * keys onto those rows - which is precisely the split that makes the
 * formatting testable without a worker.
 */

export interface ManifestDisplayRow {
  /** i18n key of the cargo name. */
  readonly cargoKey: string;
  readonly units: number;
  /** Destination station name, or null for a routeless parcel (7.4). */
  readonly destinationName: string | null;
  /** Whole game days in transit. */
  readonly ageDays: number;
  /** Whole tiles since the paid-up-to point - what unloading here pays for. */
  readonly openTiles: number;
}

/** Join names onto the marker rows; the sim's ordering is kept as sent. */
export function manifestDisplayRows(
  manifest: readonly VehicleCargoMarker[],
  stations: readonly StationMarker[],
): ManifestDisplayRow[] {
  return manifest.map((row) => ({
    cargoKey: cargoSpec(row.cargo as Cargo).nameKey,
    units: row.units,
    destinationName:
      row.destinationStationId < 0
        ? null
        : (stations.find((station) => station.id === row.destinationStationId)?.name ?? null),
    ageDays: Math.floor(row.ageDays),
    openTiles: Math.round(row.openTiles),
  }));
}
