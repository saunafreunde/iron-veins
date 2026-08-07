import { describe, expect, it } from 'vitest';
import { industryMarkers } from '../../src/sim/markers';
import { newIndustry, IndustryType } from '../../src/sim/industry/types';
import { INDUSTRY_LEVEL_MAX, INDUSTRY_LEVEL_START } from '../../src/sim/constants';
import { smokePeriodForLevel } from '../../src/render/particles';
import { industryGlowFactor } from '../../src/render/emissive';

/**
 * The level field's round trip over the marker channel (SPEC2 M13). The
 * M13 plan booked "+IndustryMarker.level" as the milestone's one
 * snapshot-layout bump - and the honest finding is that the field has
 * travelled the marker channel since M5 (the industry clock). This test
 * holds the mapping that makes the smoke and the glow truthful: an OPEN
 * industry's marker carries its production level, a CLOSED one carries 0,
 * and the render-side policies read exactly that number.
 */

describe('the industry marker level round trip', () => {
  it('carries the production level of an open industry verbatim', () => {
    const industry = newIndustry(3, IndustryType.SteelMill, 10, 12, 0);
    industry.productionLevel = INDUSTRY_LEVEL_MAX;
    industry.outputStock0 = 41.4;
    industry.serviceAverage = 0.775;
    industry.monthsWithoutCollection = 2;

    const marker = industryMarkers([industry])[0]!;
    expect(marker.id).toBe(3);
    expect(marker.type).toBe(IndustryType.SteelMill);
    expect(marker.x).toBe(10);
    expect(marker.y).toBe(12);
    expect(marker.level).toBe(INDUSTRY_LEVEL_MAX);
    expect(marker.stock).toBe(41);
    expect(marker.service).toBe(78);
    expect(marker.neglectedMonths).toBe(2);
    expect(marker.open).toBe(true);
  });

  it('zeroes the level of a closed industry, whatever the record still holds', () => {
    const industry = newIndustry(4, IndustryType.CoalMine, 5, 6, 0);
    industry.productionLevel = INDUSTRY_LEVEL_START;
    industry.open = false;

    const marker = industryMarkers([industry])[0]!;
    expect(marker.level).toBe(0);
    expect(marker.open).toBe(false);
  });

  it('feeds the render policies end to end: closed is dark and smokeless, booming is neither', () => {
    const booming = newIndustry(1, IndustryType.PowerPlant, 0, 0, 0);
    booming.productionLevel = INDUSTRY_LEVEL_MAX;
    const closed = newIndustry(2, IndustryType.PowerPlant, 4, 0, 0);
    closed.open = false;

    const markers = industryMarkers([booming, closed]);
    expect(smokePeriodForLevel(markers[0]!.level)).toBeGreaterThan(0);
    expect(industryGlowFactor(markers[0]!.level)).toBeGreaterThan(0);
    expect(smokePeriodForLevel(markers[1]!.level)).toBe(0);
    expect(industryGlowFactor(markers[1]!.level)).toBe(0);
  });
});
