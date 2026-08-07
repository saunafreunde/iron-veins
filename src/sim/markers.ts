import type { IndustryMarker } from '../shared/protocol';
import type { Industry } from './industry/types';

/**
 * Marker assembly that is pure state-to-protocol mapping, extracted from
 * SimWorker so it can be held by a unit test (M13: the renderer's smoke and
 * glow intensity hang off the marker's `level` field, and the mapping from
 * `productionLevel` to it must not drift in silence -
 * tests/unit/industryMarkers.spec.ts is the round-trip proof). SimWorker
 * remains the only caller; nothing here touches worker globals, the clock
 * or any state - it reads the industry records it is handed and builds the
 * message payload, which is why it may live under src/sim without touching
 * the determinism rules.
 */

/**
 * Live production state of every industry, for the tile panel, the lists,
 * the minimap - and, since M13, the renderer's particle emitters and
 * emissive intensity: `level` is the production level in percent of the
 * base rate while the industry is open, and 0 once it has closed - the
 * "dormant = no smoke" end of the M13 scale.
 */
export function industryMarkers(industries: readonly Industry[]): IndustryMarker[] {
  return industries.map((industry) => ({
    id: industry.id,
    type: industry.type,
    x: industry.x,
    y: industry.y,
    level: industry.open ? industry.productionLevel : 0,
    stock: Math.round(industry.outputStock0 + industry.outputStock1),
    service: Math.round(industry.serviceAverage * 100),
    neglectedMonths: industry.monthsWithoutCollection,
    open: industry.open,
  }));
}
