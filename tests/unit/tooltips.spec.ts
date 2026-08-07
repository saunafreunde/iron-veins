import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { placeTooltip, TOOLTIP_MARGIN_PX } from '../../src/ui/tooltipLayout';
import { BUILD_TOOLS, TOOL_REGISTRY } from '../../src/ui/tools';

const CATALOGS: Record<string, Record<string, string>> = { de, en };

/**
 * The M14 tooltip coupling, in the `i18n.spec.ts` style: every tool the
 * registry knows carries an effect-explaining tooltip in BOTH locales. The
 * count is enumerated from the registry - `tools.ts` proves at compile time
 * that the registry covers the whole `Tool` union, so a tool added anywhere
 * lands in this walk without anyone remembering to extend a list by hand.
 */
describe('the tool tooltips', () => {
  it('cover exactly the 22 build tools of the M14 Fertig-wenn', () => {
    // 22 is the milestone's own number: every Tool except the select
    // pseudo-tool. The registry is the enumeration; this pins that nobody
    // quietly reclassified a build tool out of the guarantee.
    expect(BUILD_TOOLS.length).toBe(22);
    expect(BUILD_TOOLS.some((entry) => entry.id === 'none')).toBe(false);
    expect(TOOL_REGISTRY.length).toBe(BUILD_TOOLS.length + 1);

    const ids = new Set(TOOL_REGISTRY.map((entry) => entry.id));
    expect(ids.size).toBe(TOOL_REGISTRY.length);
  });

  it('exist in both locales for every registered tool', () => {
    for (const entry of TOOL_REGISTRY) {
      for (const locale of ['de', 'en']) {
        const text = CATALOGS[locale]![entry.tooltipKey];
        expect(text, `${locale}: ${entry.tooltipKey}`).toBeTypeOf('string');
        expect(text!.length, `${locale}: ${entry.tooltipKey}`).toBeGreaterThan(0);
      }
    }
  });

  it('explain the effect rather than repeating the label', () => {
    for (const entry of TOOL_REGISTRY) {
      for (const locale of ['de', 'en']) {
        const label = CATALOGS[locale]![entry.labelKey]!;
        const tip = CATALOGS[locale]![entry.tooltipKey]!;
        // A tooltip that merely restates the button is the failure the M14
        // order names; a real explanation is necessarily longer than the
        // one- or two-word label it hangs on.
        expect(tip, `${locale}: ${entry.tooltipKey}`).not.toBe(label);
        expect(tip.length, `${locale}: ${entry.tooltipKey}`).toBeGreaterThan(label.length + 20);
      }
    }
  });
});

/**
 * The placement is a pure function of rectangles (the `labels.ts` split),
 * so the headless suite can pin the flip and clamp decisions the component
 * merely applies.
 */
describe('placeTooltip', () => {
  const anchor = { left: 500, top: 400, right: 560, bottom: 430, width: 60 };

  it('centres the bubble above the trigger when there is room', () => {
    const placed = placeTooltip(anchor, 200, 50, 1280, 800);
    expect(placed.below).toBe(false);
    expect(placed.left).toBe(500 + 30 - 100);
    expect(placed.top).toBe(400 - TOOLTIP_MARGIN_PX - 50);
  });

  it('flips below a trigger near the top edge', () => {
    const high = { left: 500, top: 20, right: 560, bottom: 50, width: 60 };
    const placed = placeTooltip(high, 200, 50, 1280, 800);
    expect(placed.below).toBe(true);
    expect(placed.top).toBe(50 + TOOLTIP_MARGIN_PX);
  });

  it('clamps to the right viewport edge without leaving it', () => {
    const right = { left: 1240, top: 400, right: 1270, bottom: 430, width: 30 };
    const placed = placeTooltip(right, 200, 50, 1280, 800);
    expect(placed.left).toBe(1280 - 200 - TOOLTIP_MARGIN_PX);
  });

  it('keeps the left margin when the viewport is narrower than the bubble', () => {
    const placed = placeTooltip(anchor, 900, 50, 640, 800);
    // Left edge wins: the start of the sentence matters more than its end.
    expect(placed.left).toBe(TOOLTIP_MARGIN_PX);
  });

  it('prefers the roomier side when neither fits whole', () => {
    const low = { left: 500, top: 700, right: 560, bottom: 730, width: 60 };
    const placed = placeTooltip(low, 200, 120, 1280, 800);
    // 700 px above versus 70 below: above, clamped at the margin.
    expect(placed.below).toBe(false);
    expect(placed.top).toBe(700 - TOOLTIP_MARGIN_PX - 120);
  });
});
