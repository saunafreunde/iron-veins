import { VehicleKind } from '../vehicles/spec';

/**
 * Waypoint markers (section 12.1): a tile an order can force a route through.
 *
 * A waypoint is a per-tile MARK, not an entity: orders address it by tile
 * index, exactly as depot orders have always addressed their shed. That keeps
 * the grammar's `{kind:'waypoint', id}` an integer that survives every rebuild,
 * needs no id counter in the save, and lets every guard that already reads the
 * map layers - terraforming, demolition, the build tools - see it the same way
 * they see a signal.
 */
export const WaypointKind = {
  None: 0,
  /** Marker post on a rail tile; targets for trains. */
  Rail: 1,
  /** Buoy on a water tile; targets for ships. */
  Buoy: 2,
  /** Roadside sign on a road tile; targets for road vehicles. */
  Road: 3,
} as const;
export type WaypointKind = (typeof WaypointKind)[keyof typeof WaypointKind];

/** Translation keys per kind, for the tile panel and the order editor. */
export const WAYPOINT_KIND_KEYS: readonly string[] = [
  '',
  'waypoint.rail',
  'waypoint.buoy',
  'waypoint.road',
];

/**
 * May a vehicle of this mode take a waypoint of this kind as an order target?
 *
 * An aircraft flies a straight line over anything, so any marker works as a
 * turning point for it; everything else needs the marker to stand on its own
 * kind of way, or the pathfinder could never reach the tile.
 */
export function waypointServes(kind: number, vehicleKind: number): boolean {
  if (kind === WaypointKind.None) return false;
  if (vehicleKind === VehicleKind.Aircraft) return true;
  if (vehicleKind === VehicleKind.Train) return kind === WaypointKind.Rail;
  if (vehicleKind === VehicleKind.Ship) return kind === WaypointKind.Buoy;
  return kind === WaypointKind.Road;
}
