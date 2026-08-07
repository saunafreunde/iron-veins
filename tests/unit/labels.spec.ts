import { describe, expect, it } from 'vitest';
import {
  cullLabels,
  LABEL_FONT_CHARS,
  STATION_LABEL_MIN_ZOOM,
  STATION_LABEL_SIZE_PX,
  TOWN_LABEL_MIN_ZOOM,
  TOWN_LABEL_SIZE_LARGE_PX,
  TOWN_LABEL_SIZE_MID_PX,
  TOWN_LABEL_SIZE_SMALL_PX,
  TOWN_POPULATION_LARGE,
  TOWN_POPULATION_MID,
  townLabelSizePx,
  type LabelRect,
} from '../../src/render/labels';
import { PlaceNameGenerator } from '../../src/sim/mapgen/names';
import { Rng } from '../../src/sim/rng';

/**
 * The pure half of the map text (SPEC2 M12, D-165): the collision culling,
 * the zoom gates, the population sizing and - the E-14 obligation - proof
 * that the startup-rasterised font covers every glyph a map name can
 * contain. The BitmapText sprites in MapView are deliberately not under
 * test, exactly as the sprite pool never was (the D-136 split).
 */

function rect(x: number, y: number, w = 10, h = 5): LabelRect {
  return { x, y, w, h };
}

describe('label collision culling', () => {
  it('keeps everything when nothing overlaps', () => {
    const keep = cullLabels([rect(0, 0), rect(20, 0), rect(0, 10)]);
    expect(keep).toEqual([true, true, true]);
  });

  it('drops the later label of an overlapping pair - order is priority', () => {
    const keep = cullLabels([rect(0, 0), rect(5, 2)]);
    expect(keep).toEqual([true, false]);
  });

  it('checks against KEPT labels only: a dropped label blocks nobody', () => {
    // B overlaps A and is dropped; C overlaps only B, so C survives.
    const a = rect(0, 0);
    const b = rect(8, 0);
    const c = rect(16, 0);
    expect(cullLabels([a, b, c])).toEqual([true, false, true]);
  });

  it('treats touching edges as free - labels drop only when pixels collide', () => {
    const keep = cullLabels([rect(0, 0, 10, 5), rect(10, 0, 10, 5), rect(0, 5, 10, 5)]);
    expect(keep).toEqual([true, true, true]);
  });

  it('never keeps two overlapping labels, over a scattered batch', () => {
    // A deterministic LCG scatter - no Math.random in a test that must not
    // flake. Dense enough that dozens of collisions actually occur.
    const rects: LabelRect[] = [];
    let state = 12_345;
    const next = (): number => {
      state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      rects.push(rect(next() * 300, next() * 120, 12 + next() * 40, 6 + next() * 10));
    }

    const keep = cullLabels(rects);
    expect(keep).toHaveLength(rects.length);

    const overlaps = (a: LabelRect, b: LabelRect): boolean =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    let kept = 0;
    for (let i = 0; i < rects.length; i++) {
      if (!keep[i]!) {
        // Every dropped label lost to a kept one EARLIER in priority order.
        let blocked = false;
        for (let k = 0; k < i; k++) {
          if (keep[k]! && overlaps(rects[i]!, rects[k]!)) blocked = true;
        }
        expect(blocked).toBe(true);
        continue;
      }
      kept++;
      for (let k = 0; k < i; k++) {
        if (keep[k]!) expect(overlaps(rects[i]!, rects[k]!)).toBe(false);
      }
    }
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(rects.length);
  });
});

describe('zoom gates and sizes', () => {
  it('never gates towns, and keeps stations off the chunked zooms', () => {
    // The zoom ladder is 0.25 / 0.5 / 1 / 2 / 4 (MapView.ZOOM_LEVELS,
    // restated here to keep Pixi out of the test). Towns must survive down
    // to the 0.25x overview; station labels must be absent at and below
    // 0.5x, where the modules they caption are baked into chunks.
    expect(TOWN_LABEL_MIN_ZOOM).toBeLessThanOrEqual(0.25);
    expect(STATION_LABEL_MIN_ZOOM).toBeGreaterThan(0.5);
    expect(STATION_LABEL_MIN_ZOOM).toBeLessThanOrEqual(1);
  });

  it('sizes a town by its population, in three monotone steps', () => {
    expect(townLabelSizePx(0)).toBe(TOWN_LABEL_SIZE_SMALL_PX);
    expect(townLabelSizePx(TOWN_POPULATION_MID - 1)).toBe(TOWN_LABEL_SIZE_SMALL_PX);
    expect(townLabelSizePx(TOWN_POPULATION_MID)).toBe(TOWN_LABEL_SIZE_MID_PX);
    expect(townLabelSizePx(TOWN_POPULATION_LARGE - 1)).toBe(TOWN_LABEL_SIZE_MID_PX);
    expect(townLabelSizePx(TOWN_POPULATION_LARGE)).toBe(TOWN_LABEL_SIZE_LARGE_PX);
    expect(TOWN_LABEL_SIZE_SMALL_PX).toBeLessThan(TOWN_LABEL_SIZE_MID_PX);
    expect(TOWN_LABEL_SIZE_MID_PX).toBeLessThan(TOWN_LABEL_SIZE_LARGE_PX);
    // Stations whisper below the smallest town.
    expect(STATION_LABEL_SIZE_PX).toBeLessThanOrEqual(TOWN_LABEL_SIZE_SMALL_PX);
  });
});

describe('glyph coverage (E-14)', () => {
  it('covers every character the name generator can emit', () => {
    // Six thousand names off one seed sweep all ninety-odd syllables with
    // overwhelming margin, deterministically. Station names are a town name
    // plus ` <digit>`, and the generator's own collision path appends the
    // same, so space and digits are asserted explicitly below rather than
    // hoped for here.
    const generator = new PlaceNameGenerator(Rng.fromSeed(424_242));
    const seen = new Set<string>();
    for (let i = 0; i < 6_000; i++) {
      for (const char of generator.next()) seen.add(char);
    }
    for (const char of seen) {
      expect(LABEL_FONT_CHARS.includes(char), `font raster lacks '${char}'`).toBe(true);
    }
    // The sweep must actually have exercised the syllable tables.
    expect(seen.size).toBeGreaterThan(30);
  });

  it('covers digits, space and hyphen - the composed-name characters', () => {
    for (const char of ' -0123456789') {
      expect(LABEL_FONT_CHARS.includes(char), `font raster lacks '${char}'`).toBe(true);
    }
  });

  it('covers the German umlauts and eszett, as E-14 orders', () => {
    for (const char of 'ÄÖÜäöüß') {
      expect(LABEL_FONT_CHARS.includes(char), `font raster lacks '${char}'`).toBe(true);
    }
  });
});
