import { describe, expect, it } from 'vitest';
import type { NewsMarker } from '../../src/shared/protocol';
import {
  DEFAULT_NOTIFICATIONS,
  NOTIFICATION_CATEGORY_COUNT,
  NOTIFICATION_MODE_COUNT,
  NOTIFICATION_MODE_KEYS,
  NotificationMode,
  normaliseSettings,
} from '../../src/shared/settings';
import { NEWS_CATEGORY_COUNT, NewsSeverity } from '../../src/sim/news/log';
import { newNewsEntries, routeNotification } from '../../src/ui/notifications';

/**
 * The M14 notification routing (SPEC2 M14): the decision table per
 * category-setting and severity, and the delta detection that keeps a loaded
 * save's backlog out of the toast stack. Pure presentation (D-110) - which
 * is exactly why the whole of the logic fits in two testable functions.
 */

function entry(overrides: Partial<NewsMarker>): NewsMarker {
  return {
    tick: 1000,
    year: 1950,
    month: 0,
    day: 5,
    category: 0,
    severity: NewsSeverity.Info,
    messageKey: 'news.finance.yearResult',
    params: {},
    tileIndex: -1,
    ...overrides,
  };
}

describe('routeNotification, the decision table', () => {
  it.each([
    [NotificationMode.Off, NewsSeverity.Info, false, false, false],
    [NotificationMode.Off, NewsSeverity.Warning, false, false, false],
    [NotificationMode.Off, NewsSeverity.Alarm, false, false, false],
    [NotificationMode.Ticker, NewsSeverity.Info, true, false, false],
    [NotificationMode.Ticker, NewsSeverity.Warning, true, false, false],
    [NotificationMode.Ticker, NewsSeverity.Alarm, true, false, false],
    [NotificationMode.Toast, NewsSeverity.Info, false, true, false],
    [NotificationMode.Toast, NewsSeverity.Warning, false, true, false],
    [NotificationMode.Toast, NewsSeverity.Alarm, false, true, false],
    // Pause is "do not let me miss this": a card always, the hard stop only
    // above Info - a completed contract must not freeze the game.
    [NotificationMode.Pause, NewsSeverity.Info, false, true, false],
    [NotificationMode.Pause, NewsSeverity.Warning, false, true, true],
    [NotificationMode.Pause, NewsSeverity.Alarm, false, true, true],
  ])(
    'mode %i, severity %i -> ticker %s toast %s pause %s',
    (mode, severity, ticker, toast, pause) => {
      expect(routeNotification(mode, severity)).toEqual({ ticker, toast, pause });
    },
  );

  it('treats an unknown mode as Off - a corrupted setting must not toast', () => {
    expect(routeNotification(99, NewsSeverity.Alarm)).toEqual({
      ticker: false,
      toast: false,
      pause: false,
    });
  });
});

describe('newNewsEntries, the delta detection', () => {
  const a = entry({ tick: 100, messageKey: 'news.a' });
  const b = entry({ tick: 200, messageKey: 'news.b' });
  const c = entry({ tick: 300, messageKey: 'news.c' });
  const d = entry({ tick: 400, messageKey: 'news.d' });

  it('yields exactly the appended tail', () => {
    expect(newNewsEntries([a, b], [a, b, c, d])).toEqual([c, d]);
  });

  it('yields nothing when the log did not grow', () => {
    expect(newNewsEntries([a, b, c], [a, b, c])).toEqual([]);
  });

  it('swallows the first sync of a world - a backlog is not an event', () => {
    expect(newNewsEntries([], [a, b, c])).toEqual([]);
  });

  it('survives the ring dropping old entries off the front', () => {
    // The log is bounded: [a,b,c] became [b,c,d] - only d is new.
    expect(newNewsEntries([a, b, c], [b, c, d])).toEqual([d]);
  });

  it('falls back to tick comparison when the previous newest fell off entirely', () => {
    // A burst larger than the whole ring: everything strictly newer counts.
    expect(newNewsEntries([a], [b, c, d])).toEqual([b, c, d]);
  });

  it('matches the newest entry by identity, not by position', () => {
    // postOnce allows the same key at different tiles; the tile is part of
    // the identity, so a same-key entry elsewhere is correctly new.
    const stuck1 = entry({ tick: 500, messageKey: 'news.stuck', tileIndex: 7 });
    const stuck2 = entry({ tick: 500, messageKey: 'news.stuck', tileIndex: 9 });
    expect(newNewsEntries([stuck1], [stuck1, stuck2])).toEqual([stuck2]);
  });
});

describe('the notification settings', () => {
  it('cover exactly the news categories', () => {
    // shared/settings.ts may not import the sim, so the count is repeated
    // there; this is the coupling assertion that keeps the copy honest.
    expect(NOTIFICATION_CATEGORY_COUNT).toBe(NEWS_CATEGORY_COUNT);
    expect(DEFAULT_NOTIFICATIONS).toHaveLength(NEWS_CATEGORY_COUNT);
    expect(NOTIFICATION_MODE_KEYS).toHaveLength(NOTIFICATION_MODE_COUNT);
  });

  it('normalises a pre-M14 settings file to the defaults', () => {
    const settings = normaliseSettings({ locale: 'en' });
    expect(settings.notifications).toEqual(DEFAULT_NOTIFICATIONS);
  });

  it('keeps chosen modes and defaults the rest', () => {
    const settings = normaliseSettings({ notifications: [3, 0] });
    expect(settings.notifications[0]).toBe(3);
    expect(settings.notifications[1]).toBe(0);
    expect(settings.notifications[2]).toBe(DEFAULT_NOTIFICATIONS[2]);
  });

  it('replaces an out-of-range mode with its default', () => {
    const settings = normaliseSettings({ notifications: [99, -1, 1.5] });
    expect(settings.notifications[0]).toBe(DEFAULT_NOTIFICATIONS[0]);
    expect(settings.notifications[1]).toBe(DEFAULT_NOTIFICATIONS[1]);
    expect(settings.notifications[2]).toBe(DEFAULT_NOTIFICATIONS[2]);
  });

  it('never defaults any category to Pause - stopping the world is opt-in', () => {
    for (const mode of DEFAULT_NOTIFICATIONS) {
      expect(mode).not.toBe(NotificationMode.Pause);
    }
  });
});
