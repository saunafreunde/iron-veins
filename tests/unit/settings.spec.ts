import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  UI_SCALES,
  VOLUME_CHANNEL_COUNT,
  VOLUME_CHANNEL_KEYS,
} from '../../src/shared/settings';
import de from '../../src/i18n/de.json';
import { KEY_BINDINGS } from '../../src/ui/keymap';
import { HANDBOOK, HANDBOOK_CHAPTER_OF, HANDBOOK_CHAPTERS } from '../../src/ui/handbook';
import { LESSONS } from '../../src/ui/tutorial';
import { MINIMAP_MODE_COUNT, MINIMAP_MODE_KEYS } from '../../src/render/Minimap';

/**
 * The settings file, and the fact that every screen M9 added actually has
 * words in it.
 *
 * The settings half is about a file written by an older build: a preferences
 * file that fails to parse must cost the player their preferences and never
 * their ability to start the game, and that is only true if every field is
 * read defensively.
 *
 * The rest is the cheapest possible guard against the most likely M9 mistake -
 * a menu entry, a lesson step or a handbook page that renders its own
 * translation key because somebody forgot the catalogue.
 */

describe('reading a settings file', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps what it recognises and defaults the rest', () => {
    const settings = normaliseSettings({ uiScalePercent: 150, colorBlind: true });

    expect(settings.uiScalePercent).toBe(150);
    expect(settings.colorBlind).toBe(true);
    expect(settings.locale).toBe(DEFAULT_SETTINGS.locale);
    expect(settings.volumes).toEqual(DEFAULT_SETTINGS.volumes);
  });

  it('refuses a scale that is not one of the four steps', () => {
    expect(normaliseSettings({ uiScalePercent: 137 }).uiScalePercent).toBe(
      DEFAULT_SETTINGS.uiScalePercent,
    );
    for (const scale of UI_SCALES) {
      expect(normaliseSettings({ uiScalePercent: scale }).uiScalePercent).toBe(scale);
    }
  });

  it('clamps the mixer to four channels of a sane range', () => {
    const settings = normaliseSettings({ volumes: [2, -1, 0.5] });

    expect(settings.volumes.length).toBe(VOLUME_CHANNEL_COUNT);
    // Out of range is not clamped into range - it is rejected, because a value
    // of two was never a volume and guessing what it meant is worse.
    expect(settings.volumes[0]).toBe(DEFAULT_SETTINGS.volumes[0]);
    expect(settings.volumes[1]).toBe(DEFAULT_SETTINGS.volumes[1]);
    expect(settings.volumes[2]).toBe(0.5);
    expect(settings.volumes[3]).toBe(DEFAULT_SETTINGS.volumes[3]);
  });

  it('starts the music silent, because the game ships none', () => {
    expect(DEFAULT_SETTINGS.volumes[2]).toBe(0);
    expect(DEFAULT_SETTINGS.volumes[0]).toBeCloseTo(0.6);
  });

  it('round-trips its own output', () => {
    const once = normaliseSettings({ locale: 'en', uiScalePercent: 200, autosave: false });
    expect(normaliseSettings(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('every M9 screen has words', () => {
  const catalogue = de as Record<string, string>;

  it('names every key binding', () => {
    for (const binding of KEY_BINDINGS) {
      expect(binding.descriptionKey in catalogue, binding.descriptionKey).toBe(true);
      expect(binding.display.length).toBeGreaterThan(0);
    }
  });

  it('names every mixer channel and minimap mode', () => {
    expect(VOLUME_CHANNEL_KEYS.length).toBe(VOLUME_CHANNEL_COUNT);
    for (const key of VOLUME_CHANNEL_KEYS) expect(key in catalogue, key).toBe(true);

    expect(MINIMAP_MODE_KEYS.length).toBe(MINIMAP_MODE_COUNT);
    for (const key of MINIMAP_MODE_KEYS) expect(key in catalogue, key).toBe(true);
  });

  it('gives every handbook entry a title, a body and a chapter', () => {
    expect(HANDBOOK_CHAPTER_OF.length).toBe(HANDBOOK.length);

    for (let index = 0; index < HANDBOOK.length; index++) {
      const entry = HANDBOOK[index]!;
      expect(entry.titleKey in catalogue, entry.titleKey).toBe(true);
      expect(entry.bodyKey in catalogue, entry.bodyKey).toBe(true);

      const chapter = HANDBOOK_CHAPTER_OF[index]!;
      expect(chapter).toBeGreaterThanOrEqual(0);
      expect(chapter).toBeLessThan(HANDBOOK_CHAPTERS.length);
    }
    for (const key of HANDBOOK_CHAPTERS) expect(key in catalogue, key).toBe(true);
  });

  it('gives every lesson step a sentence', () => {
    // Section 17.5 asks for five lessons of three to six minutes each; what is
    // checkable is that there are five and that each has enough steps to be one.
    expect(LESSONS.length).toBe(5);

    for (const lesson of LESSONS) {
      expect(lesson.titleKey in catalogue, lesson.titleKey).toBe(true);
      expect(lesson.introKey in catalogue, lesson.introKey).toBe(true);
      expect(lesson.steps.length).toBeGreaterThanOrEqual(4);
      for (const step of lesson.steps) {
        expect(step.textKey in catalogue, step.textKey).toBe(true);
      }
    }
  });

  it('has an id per handbook entry that is used only once', () => {
    const ids = new Set(HANDBOOK.map((entry) => entry.id));
    expect(ids.size).toBe(HANDBOOK.length);
  });
});
